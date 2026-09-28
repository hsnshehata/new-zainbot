const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const script = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

const BANNER_KEYS = [
  'wa_relink_banner_title',
  'wa_relink_banner_desc',
  'wa_relink_banner_action',
  'wa_relink_banner_action_aria',
];

function keysInTranslationSection(language) {
  const start = script.indexOf(`    ${language}: {`);
  const nextLanguage = language === 'en' ? '    ar: {' : '\n  };\n\n  // Helper: Get JWT token from storage';
  const end = script.indexOf(nextLanguage, start + 1);
  assert.notEqual(start, -1, `Missing ${language} translation section`);
  assert.notEqual(end, -1, `Could not delimit ${language} translation section`);
  return new Set([...script.slice(start, end).matchAll(/^\s{6}([a-z][a-z0-9_]*):/gm)].map((match) => match[1]));
}

function valueOfKey(language, key) {
  const start = script.indexOf(`    ${language}: {`);
  const nextLanguage = language === 'en' ? '    ar: {' : '\n  };\n\n  // Helper: Get JWT token from storage';
  const section = script.slice(start, script.indexOf(nextLanguage, start + 1));
  const match = section.match(new RegExp(`^\\s{6}${key}: '(.*)',?$`, 'm'));
  assert.ok(match, `Missing ${language}.${key}`);
  return match[1];
}

test('relink banner sits at the top of page-channels and is hidden by default', () => {
  const pageIndex = html.indexOf('id="page-channels"');
  const bannerIndex = html.indexOf('id="waRelinkBanner"');
  const gridIndex = html.indexOf('class="channels-grid"');
  assert.notEqual(pageIndex, -1, 'Missing #page-channels');
  assert.notEqual(bannerIndex, -1, 'Missing #waRelinkBanner');
  assert.ok(bannerIndex > pageIndex, 'Banner must live inside #page-channels');
  assert.ok(bannerIndex < gridIndex, 'Banner must sit above the channels grid');

  const bannerTag = html.slice(bannerIndex, html.indexOf('>', bannerIndex));
  assert.match(bannerTag, /\bhidden\b/, 'Banner must be hidden until wa_attention');
  assert.match(bannerTag, /role="alert"/, 'Banner must announce via role="alert"');

  assert.match(html, /id="waRelinkBtn"[^>]*data-i18n-aria="wa_relink_banner_action_aria"/);
  assert.match(html, /<span data-i18n="wa_relink_banner_action">/);
  assert.match(html, /data-i18n="wa_relink_banner_title"/);
  assert.match(html, /data-i18n="wa_relink_banner_desc"/);
});

test('banner copy exists in English and Arabic with no hardcoded accessible label', () => {
  const english = keysInTranslationSection('en');
  const arabic = keysInTranslationSection('ar');
  for (const key of BANNER_KEYS) {
    assert.ok(english.has(key), `Missing English key: ${key}`);
    assert.ok(arabic.has(key), `Missing Arabic key: ${key}`);
    assert.notEqual(valueOfKey('en', key).trim(), '', `Empty English copy: ${key}`);
    assert.notEqual(valueOfKey('ar', key).trim(), '', `Empty Arabic copy: ${key}`);
  }
  assert.notEqual(valueOfKey('en', 'wa_relink_banner_title'), valueOfKey('ar', 'wa_relink_banner_title'));

  const bannerBlock = html.slice(html.indexOf('id="waRelinkBanner"'), html.indexOf('class="channels-grid"'));
  assert.doesNotMatch(bannerBlock, /aria-label="/, 'Accessible label must use data-i18n-aria, not a hardcoded aria-label');
  assert.doesNotMatch(bannerBlock, /placeholder="/, 'Banner must not carry hardcoded placeholders');
});

test('banner shows only for wa_attention; checking/connected need nothing', () => {
  assert.match(script, /waRelinkBanner\)[\s\S]{0,120}hidden = states\.whatsapp !== 'wa_attention'/);
  assert.match(script, /whatsapp\.status === 'connected' \? 'wa_connected'/);
  assert.match(
    script,
    /whatsapp\.status === 'disconnected' && !connections\.whatsapp \? 'not_setup' : 'wa_attention'/
  );
  // Channel-status + catalog + onboarding renderers are preserved.
  assert.match(script, /copy\[`chan_status_\$\{state\}`\]/);
  assert.match(script, /statConnectedChannels/);
  assert.match(script, /renderCatalogStatus\(\)/);
  assert.match(script, /renderOnboarding\(\)/);

  const source = script.slice(
    script.indexOf('  function deriveChannelStates('),
    script.indexOf('  function renderChannelStatuses(')
  );
  const derive = vm.runInNewContext(`${source}\nderiveChannelStates`);
  const withConfig = { connections: { whatsapp: true } };
  assert.equal(derive(withConfig, { status: 'relink_required' }, null).whatsapp, 'wa_attention');
  assert.equal(derive(withConfig, { status: 'degraded' }, null).whatsapp, 'wa_attention');
  assert.equal(derive(withConfig, { status: 'disconnected' }, null).whatsapp, 'wa_attention');
  assert.equal(derive({ connections: {} }, { status: 'disconnected' }, null).whatsapp, 'not_setup');
  assert.equal(derive(withConfig, { status: 'connected' }, null).whatsapp, 'wa_connected');
  assert.equal(derive(withConfig, null, null).whatsapp, 'unavailable');
});

test('relink reuses the existing QR modal flow and adds no backend endpoints or loops', () => {
  const wiringIndex = script.indexOf("getElementById('waRelinkBtn')");
  assert.notEqual(wiringIndex, -1, 'Missing #waRelinkBtn wiring');
  assert.ok(
    script.slice(wiringIndex, wiringIndex + 300).includes("configureChannel('whatsapp')"),
    'Relink must delegate to the existing configureChannel whatsapp flow'
  );
  assert.match(script, /window\.configureChannel = async function\(type\)/);
  assert.match(script, /apiFetch\('\/api\/whatsapp\/connect-qr'/);

  const wiringBlock = script.slice(wiringIndex, wiringIndex + 300);
  assert.doesNotMatch(wiringBlock, /fetch\(/, 'Banner wiring must not fetch directly');
  assert.doesNotMatch(wiringBlock, /setInterval|setTimeout/, 'Banner must not add an auto-reconnect loop');

  const whatsappEndpoints = new Set(
    [...script.matchAll(/\/api\/whatsapp\/[a-z-]+/g)].map((match) => match[0])
  );
  assert.deepEqual(
    [...whatsappEndpoints].sort(),
    ['/api/whatsapp/connect-qr', '/api/whatsapp/disconnect', '/api/whatsapp/session'].sort(),
    `Unexpected WhatsApp endpoints: ${[...whatsappEndpoints].join(', ')}`
  );
});

test('banner layout is mobile and RTL safe', () => {
  const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.match(style, /\.wa-relink-banner\s*\{[^}]*display:\s*flex/);
  assert.match(style, /\.wa-relink-banner\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(style, /\.wa-relink-banner\[hidden\]\s*\{[^}]*display:\s*none/);
  assert.match(style, /@media \(max-width: 600px\)[\s\S]{0,400}\.wa-relink-banner/);
  const bannerCss = [...style.matchAll(/\.wa-relink-banner[^{]*\{([^}]*)\}/g)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(bannerCss, /(^|[;\s])((margin|padding|text-align)-(left|right)|float)\s*:/);
});
