const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '..');
const sources = {
  dashboard: fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8'),
  landing: fs.readFileSync(path.join(workspace, 'public', 'js', 'script.js'), 'utf8'),
  login: fs.readFileSync(path.join(workspace, 'public', 'login.html'), 'utf8'),
  register: fs.readFileSync(path.join(workspace, 'public', 'register.html'), 'utf8'),
  auth: fs.readFileSync(path.join(workspace, 'public', 'js', 'auth.js'), 'utf8'),
};

function extractBlock(source, name) {
  const startMarker = '/* <zainbot-lang-persistence> */';
  const endMarker = '/* </zainbot-lang-persistence> */';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + 1);
  assert.notEqual(start, -1, `${name}: missing persistence block start marker`);
  assert.notEqual(end, -1, `${name}: missing persistence block end marker`);
  return source.slice(start, end + endMarker.length);
}

const blocks = {
  dashboard: extractBlock(sources.dashboard, 'dashboard_new.js'),
  landing: extractBlock(sources.landing, 'script.js'),
  login: extractBlock(sources.login, 'login.html'),
  register: extractBlock(sources.register, 'register.html'),
};

function loadPersistence(fakeWindow) {
  const sandbox = { window: fakeWindow };
  vm.createContext(sandbox);
  vm.runInContext(blocks.dashboard, sandbox, { filename: 'persistence-block.js' });
  return sandbox.window.ZainbotLangPersistence;
}

function backingStore(initial) {
  const data = { ...(initial || {}) };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

function canonicalize(block) {
  return block.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join('\n');
}

test('all entry points share one identical persistence contract', () => {
  const canonical = canonicalize(blocks.dashboard);
  for (const [name, block] of Object.entries(blocks)) {
    assert.equal(canonicalize(block), canonical, `${name}: persistence block drifted from canonical contract`);
  }
});

test('no entry point touches language storage outside the guarded contract', () => {
  for (const [name, source] of Object.entries(sources)) {
    if (name === 'auth') continue;
    const outside = source.split('/* <zainbot-lang-persistence> */')[0]
      + source.split('/* </zainbot-lang-persistence> */').slice(1).join('');
    assert.doesNotMatch(outside, /localStorage\.(getItem|setItem)\(\s*['"]zainbot_lang['"]/, `${name}: raw language storage access outside contract`);
  }
  assert.doesNotMatch(sources.auth, /localStorage\.getItem\(\s*['"]zainbot_lang['"]/, 'auth.js: raw language storage read');
});

test('per-page defaults are preserved (no unification)', () => {
  assert.match(sources.dashboard, /readStoredLanguage\('ar'\)/, 'dashboard default stays ar');
  assert.match(sources.landing, /readStoredLanguage\('en'\)/, 'landing default stays en');
  assert.match(sources.login, /readStoredLanguage\('ar'\)/, 'login default stays ar');
  assert.match(sources.register, /readStoredLanguage\('ar'\)/, 'register default stays ar');
  assert.match(sources.auth, /return 'ar';/, 'auth default stays ar');
});

test('every entry point syncs cross-tab changes without writing in the handler', () => {
  for (const [name, key] of [['dashboard', 'dashboard_new.js'], ['landing', 'script.js'], ['login', 'login.html'], ['register', 'register.html']]) {
    const source = sources[name];
    assert.match(source, /addEventListener\('storage'/, `${key}: storage listener present`);
    assert.match(source, /resolveExternalLanguage\(event,/, `${key}: handler routes through resolver`);
  }
});

test('normalize allows only ar/en and falls back to the page default', () => {
  const api = loadPersistence({});
  assert.equal(api.normalizeLanguage('ar', 'ar'), 'ar');
  assert.equal(api.normalizeLanguage('en', 'ar'), 'en');
  for (const bad of ['fr', '', null, undefined, 0, 'AR', ' EN ']) {
    assert.equal(api.normalizeLanguage(bad, 'ar'), 'ar', `dashboard rejects ${String(bad)}`);
    assert.equal(api.normalizeLanguage(bad, 'en'), 'en', `landing rejects ${String(bad)}`);
  }
});

test('absent storage yields the default without throwing', () => {
  const api = loadPersistence({});
  assert.equal(api.readStoredLanguage('ar'), 'ar');
  assert.equal(api.readStoredLanguage('en'), 'en');
  assert.equal(api.writeStoredLanguage('en', 'ar'), 'en');
});

test('invalid stored values normalize to the default', () => {
  const api = loadPersistence({ localStorage: backingStore({ zainbot_lang: 'fr' }) });
  assert.equal(api.readStoredLanguage('ar'), 'ar');
  const apiEn = loadPersistence({ localStorage: backingStore({ zainbot_lang: '' }) });
  assert.equal(apiEn.readStoredLanguage('en'), 'en');
});

test('throwing storage never crashes read or write', () => {
  const broken = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  const api = loadPersistence({ localStorage: broken });
  assert.equal(api.readStoredLanguage('ar'), 'ar');
  assert.equal(api.writeStoredLanguage('en', 'ar'), 'en');
  assert.equal(api.readStoredLanguage('ar'), 'en', 'in-memory fallback survives blocked writes');
});

test('write persists across reload and navigation via shared storage', () => {
  const shared = backingStore({});
  const first = loadPersistence({ localStorage: shared });
  assert.equal(first.writeStoredLanguage('en', 'ar'), 'en');
  assert.equal(shared.data.zainbot_lang, 'en');
  const afterReload = loadPersistence({ localStorage: shared });
  assert.equal(afterReload.readStoredLanguage('ar'), 'en', 'reload restores stored choice');
  const otherPage = loadPersistence({ localStorage: shared });
  assert.equal(otherPage.readStoredLanguage('en'), 'en', 'navigation sees stored choice');
});

test('cross-tab resolver adopts real changes and ignores noise', () => {
  const calls = [];
  const counting = backingStore({ zainbot_lang: 'ar' });
  const rawSet = counting.setItem;
  counting.setItem = (k, v) => { calls.push([k, v]); rawSet(k, v); };
  const api = loadPersistence({ localStorage: counting });
  assert.equal(api.resolveExternalLanguage({ key: 'zainbot_lang', newValue: 'en' }, 'ar', 'ar'), 'en');
  assert.equal(api.resolveExternalLanguage({ key: 'zainbot_lang', newValue: 'ar' }, 'ar', 'ar'), null);
  assert.equal(api.resolveExternalLanguage({ key: 'other_key', newValue: 'en' }, 'ar', 'ar'), null);
  assert.equal(api.resolveExternalLanguage(null, 'ar', 'ar'), null);
  assert.equal(api.resolveExternalLanguage({ key: 'zainbot_lang', newValue: 'fr' }, 'ar', 'ar'), null, 'invalid change resolves to current default');
  assert.deepEqual(calls, [], 'resolver performs zero storage writes');
});

test('cross-tab echo converges without a write-loop', () => {
  const shared = backingStore({ zainbot_lang: 'ar' });
  const tabA = loadPersistence({ localStorage: shared });
  const tabB = loadPersistence({ localStorage: shared });
  let currentB = 'ar';
  const eventForB = { key: 'zainbot_lang', newValue: 'en' };
  const nextB = tabB.resolveExternalLanguage(eventForB, currentB, 'ar');
  assert.equal(nextB, 'en');
  currentB = tabB.writeStoredLanguage(nextB, 'ar');
  const echoForA = { key: 'zainbot_lang', newValue: shared.data.zainbot_lang };
  assert.equal(tabA.resolveExternalLanguage(echoForA, 'en', 'ar'), null, 'origin tab ignores converging echo');
});

function loadLoginText(fakeWindow) {
  const startMarker = '// <zainbot-login-language>';
  const endMarker = '// </zainbot-login-language>';
  const start = sources.auth.indexOf(startMarker);
  const end = sources.auth.indexOf(endMarker, start + 1);
  assert.notEqual(start, -1, 'auth.js: missing login-language block');
  assert.notEqual(end, -1, 'auth.js: missing login-language end');
  const block = sources.auth.slice(start, end + endMarker.length);
  const sandbox = {
    window: fakeWindow,
    loginCopy: { ar: { probe_key: 'AR-TEXT' }, en: { probe_key: 'EN-TEXT' } },
  };
  vm.createContext(sandbox);
  vm.runInContext(`${block}\n;this.__loginText = loginText;`, sandbox, { filename: 'login-language.js' });
  return sandbox.__loginText;
}

test('auth loginText never crashes on language storage', () => {
  assert.equal(loadLoginText({ localStorage: backingStore({ zainbot_lang: 'en' }) })('probe_key'), 'EN-TEXT');
  assert.equal(loadLoginText({ localStorage: backingStore({ zainbot_lang: 'fr' }) })('probe_key'), 'AR-TEXT');
  assert.equal(loadLoginText({ localStorage: backingStore({}) })('probe_key'), 'AR-TEXT');
  assert.equal(loadLoginText({})('probe_key'), 'AR-TEXT', 'absent storage falls back to ar');
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
  assert.equal(loadLoginText({ localStorage: throwing })('probe_key'), 'AR-TEXT', 'blocked storage never throws');
});
