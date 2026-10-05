const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '..');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function extractMarkedBlock(source, name) {
  const startMarker = `/* <${name}> */`;
  const endMarker = `/* </${name}> */`;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);
  assert.notEqual(start, -1, `missing block ${name}`);
  assert.notEqual(end, -1, `missing block ${name} end`);
  return source.slice(start, end + endMarker.length);
}

// Bodies of IIFE-level (2-space indent) function declarations. For duplicated
// names, `last: true` selects the hoisting winner (the live definition).
function functionBody(name, { last = false } = {}) {
  const lines = dashboardScript.split('\n');
  const defs = [];
  lines.forEach((line, i) => {
    if (new RegExp(`^ {2}(async )?function ${name}\\(`).test(line)) defs.push(i);
  });
  assert.ok(defs.length > 0, `no definition found for ${name}`);
  const from = last ? defs[defs.length - 1] : defs[0];
  // IIFE-level bodies close with a 2-space `}`; nested blocks close deeper.
  let end = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (/^ {2}\}/.test(lines[i])) { end = i + 1; break; }
  }
  return { body: lines.slice(from, end).join('\n'), definitions: defs.length };
}

function loadAdapter({ translations, language, strict = false, persistence = null } = {}) {
  const block = extractMarkedBlock(dashboardScript, 'zainbot-dashboard-i18n');
  const sandbox = {
    window: { ZainbotI18nStrict: strict, ZainbotLangPersistence: persistence },
    translations,
  };
  if (language !== undefined) sandbox.currentLanguage = language;
  vm.createContext(sandbox);
  vm.runInContext(block, sandbox, { filename: 'dashboard-i18n.js' });
  return { api: sandbox.window.ZainBotDashboardI18n, sandbox };
}

const fixtureTranslations = {
  en: { hello_key: 'Hello', count_key: 'You have {count} items', en_only_key: 'English only', blank_key: '' },
  ar: { hello_key: 'مرحبا', count_key: 'لديك {count} عناصر', blank_key: '' },
};

test('adapter exposes the §7.4 contract and keeps dictionaries in the IIFE', () => {
  const { api } = loadAdapter({ translations: fixtureTranslations, language: 'ar' });
  for (const key of ['t', 'getLanguage', 'registerLanguageRenderer', 'refreshLanguageRenderers']) {
    assert.equal(typeof api[key], 'function', `adapter missing ${key}`);
  }
  assert.match(dashboardScript, /const translations = \{/, 'dictionaries stay in the dashboard IIFE');
  assert.doesNotMatch(dashboardScript, /fetch\(['"`][^'"`]*lang[^'"`]*['"`]/i, 'no remote dictionary loading');
});

test('t returns the active language and interpolates params', () => {
  const ar = loadAdapter({ translations: fixtureTranslations, language: 'ar' }).api;
  assert.equal(ar.getLanguage(), 'ar');
  assert.equal(ar.t('hello_key'), 'مرحبا');
  assert.equal(ar.t('count_key', { count: 3 }), 'لديك 3 عناصر');
  assert.equal(ar.t('count_key'), 'لديك {count} عناصر', 'missing params leave placeholders intact');
  const en = loadAdapter({ translations: fixtureTranslations, language: 'en' }).api;
  assert.equal(en.t('hello_key'), 'Hello');
  assert.equal(en.t('count_key', { count: 0 }), 'You have 0 items');
});

test('unknown keys are test-visible in strict mode, graceful in production', () => {
  const strict = loadAdapter({ translations: fixtureTranslations, language: 'ar', strict: true }).api;
  assert.match(strict.t('nope_missing_key'), /\[i18n-missing:nope_missing_key\]/, 'strict flags unknown keys');
  assert.match(strict.t('en_only_key'), /\[i18n-missing:en_only_key\]/, 'strict flags keys absent in the active language');
  assert.match(strict.t('blank_key'), /\[i18n-missing:blank_key\]/, 'strict flags empty values');
  const prod = loadAdapter({ translations: fixtureTranslations, language: 'ar', strict: false }).api;
  assert.equal(prod.t('en_only_key'), 'English only', 'production falls back to English when defined');
  assert.equal(prod.t('nope_missing_key'), 'nope_missing_key', 'production returns the key itself, never invented copy');
  assert.equal(prod.t('blank_key'), 'blank_key', 'empty values are missing, not rendered blank');
});

test('getLanguage normalizes to ar/en only', () => {
  assert.equal(loadAdapter({ translations: fixtureTranslations, language: 'en' }).api.getLanguage(), 'en');
  assert.equal(loadAdapter({ translations: fixtureTranslations }).api.getLanguage(), 'ar', 'absent language defaults to ar');
  assert.equal(loadAdapter({ translations: fixtureTranslations, language: 'fr' }).api.getLanguage(), 'ar', 'invalid language normalizes');
});

test('registry replaces on re-register, unregisters cleanly, isolates failures', () => {
  const { api } = loadAdapter({ translations: fixtureTranslations, language: 'ar' });
  const calls = [];
  api.registerLanguageRenderer('dup', () => calls.push('first'));
  const unregisterSecond = api.registerLanguageRenderer('dup', () => calls.push('second'));
  api.registerLanguageRenderer('boom', () => { throw new Error('renderer bug'); });
  api.registerLanguageRenderer('ok', () => calls.push('ok'));
  api.refreshLanguageRenderers();
  assert.deepEqual(calls, ['second', 'ok'], 're-register replaces; one failure stops nothing');
  unregisterSecond();
  calls.length = 0;
  api.refreshLanguageRenderers();
  assert.deepEqual(calls, ['ok'], 'unregister removes only its own registration');
  assert.throws(() => api.registerLanguageRenderer('', () => {}), /requires/, 'empty id rejected');
  assert.throws(() => api.registerLanguageRenderer('x', 'nope'), /requires/, 'non-function rejected');
});

test('applyLanguage switches through the registry without refetch or state loss', () => {
  const { body } = functionBody('applyLanguage');
  assert.match(body, /refreshLanguageRenderers\(\)/, 'registry runs on every switch');
  assert.doesNotMatch(body, /selectChat\s*\(/, 'never reloads chat history on switch');
  assert.doesNotMatch(body, /load[A-Z]\w*Data\s*\(/, 'never refetches resource data on switch');
  assert.doesNotMatch(body, /apiFetch\s*\(/, 'no requests from the switch path itself');
  assert.doesNotMatch(body, /fetch\s*\(/, 'no raw fetch from the switch path itself');
  assert.doesNotMatch(body, /addEventListener/, 'no listener growth per switch');
  for (const cleared of ['selectedConversationId =', 'conversations =', 'adminUsersList =', 'workspaceBots =', '.value =']) {
    assert.doesNotMatch(body, new RegExp(cleared.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `switch clears no state (${cleared.trim()})`);
  }
});

test('applyLanguage renders the normalized value, never the raw param (C02 Low-1)', () => {
  const { body } = functionBody('applyLanguage');
  assert.match(body, /writeStoredLanguage\(lang/, 'param passes through the normalizer');
  assert.doesNotMatch(body, /translations\[lang\]/, 'no raw-param dictionary lookup');
  assert.doesNotMatch(body, /setAttribute\(['"]lang['"], lang\)/, 'no raw-param lang attribute');
  assert.match(body, /currentLanguage === 'ar' \? 'rtl' : 'ltr'/, 'direction follows the normalized value');
});

test('forgotten renderers are wired and refetch-free', () => {
  // C03 owns the first four; D03's plan-mandated 'feedback' renderer (§7.4 path)
  // is a legitimate fifth — assert the widened closed set, not just a subset.
  const expectedIds = ['agents', 'notification-recipients', 'admin-users', 'chat-list', 'feedback'];
  for (const id of expectedIds) {
    assert.match(dashboardScript, new RegExp(`registerLanguageRenderer\\('${id}'`), `${id} renderer registered`);
  }
  // Exact-case receiver: the adapter is window.ZainBotDashboardI18n (uppercase B).
  // A partial-name regex would also match the lowercase typo that once threw at
  // load and killed all bindings after it, so assert the full receiver name.
  const wiringLines = dashboardScript.split('\n').filter((line) => line.includes('.registerLanguageRenderer('));
  assert.ok(wiringLines.length >= expectedIds.length, 'wiring lines present');
  for (const line of wiringLines) {
    assert.match(line, /window\.ZainBotDashboardI18n\.registerLanguageRenderer\(/, `exact receiver in: ${line.trim()}`);
  }
  assert.doesNotMatch(dashboardScript, /ZainbotDashboardI18n/, 'no lowercase-b receiver anywhere');
  // Execute the wiring block with stub renderers: a wrong receiver name throws
  // TypeError here instead of at page load.
  const registered = {};
  const wiringSandbox = {
    window: {
      ZainBotDashboardI18n: {
        registerLanguageRenderer: (id, render) => {
          assert.equal(typeof render, 'function', `renderer ${id} is a function`);
          registered[id] = render;
          return () => { delete registered[id]; };
        },
      },
    },
    renderAgents: function renderAgents() {},
    renderNotificationRecipients: function renderNotificationRecipients() {},
    renderAdminUsers: function renderAdminUsers() {},
    renderChatList: function renderChatList() {},
  };
  vm.createContext(wiringSandbox);
  const wiringCode = wiringLines.join('\n');
  assert.doesNotThrow(
    () => vm.runInContext(wiringCode, wiringSandbox, { filename: 'renderer-wiring.js' }),
    'wiring executes against the real adapter name',
  );
  assert.deepEqual(Object.keys(registered).sort(), [...expectedIds].sort(), 'all five renderers registered');
  for (const name of ['renderChatList', 'renderAgents', 'renderNotificationRecipients']) {
    const { body } = functionBody(name);
    assert.doesNotMatch(body, /apiFetch\s*\(/, `${name}: no requests on re-render`);
    assert.doesNotMatch(body, /fetch\s*\(/, `${name}: no raw fetch on re-render`);
  }
  const live = functionBody('renderAdminUsers', { last: true });
  assert.equal(live.definitions, 2, 'duplicate renderAdminUsers pair still present (no broad cleanup)');
  assert.doesNotMatch(live.body, /apiFetch\s*\(/, 'live renderAdminUsers: no requests on re-render');
  assert.match(live.body, /replaceChildren|createElement/, 'live renderAdminUsers is the DOM-based definition');
  assert.match(dashboardScript, /SUPERSEDED legacy pair/, 'legacy pair marked superseded, not silently duplicated');
  const chat = functionBody('renderChatList').body;
  assert.match(chat, /selectedConversationId/, 'inbox re-render preserves the selected chat');
});

test('subscription config is memoized so switches add zero requests after boot', () => {
  assert.match(dashboardScript, /let subscriptionConfigSnapshot = null/, 'config cache exists');
  const { body } = functionBody('refreshSubscriptionMeta');
  assert.match(body, /if \(!subscriptionConfigSnapshot\)/, 'fetch guarded by the cache');
  assert.match(dashboardScript, /refreshSubscriptionMeta\(\);\s*\n\s*loadMySubscriptionRequests/, 'boot warms the cache');
});
