const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const workspace = path.resolve(__dirname, '..');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function extractLocaleBlock() {
  const startMarker = '/* <zainbot-dashboard-locale> */';
  const endMarker = '/* </zainbot-dashboard-locale> */';
  const start = dashboardScript.indexOf(startMarker);
  const end = dashboardScript.indexOf(endMarker, start + 1);
  assert.notEqual(start, -1, 'missing locale block');
  assert.notEqual(end, -1, 'missing locale block end');
  return dashboardScript.slice(start, end + endMarker.length);
}

const localeBlock = extractLocaleBlock();

function loadLocale({ language, translations, navigatorLanguage } = {}) {
  const sandbox = { window: {} };
  if (language !== undefined) sandbox.currentLanguage = language;
  if (translations !== undefined) sandbox.translations = translations;
  if (navigatorLanguage !== undefined) {
    sandbox.navigator = { language: navigatorLanguage };
  }
  vm.createContext(sandbox);
  vm.runInContext(localeBlock, sandbox, { filename: 'dashboard-locale.js' });
  return {
    formatDate: sandbox.formatDate,
    formatNumber: sandbox.formatNumber,
    dashboardLanguage: sandbox.dashboardLanguage,
  };
}

const AR_TRANSLATIONS = { ar: { format_date_unavailable: 'غير متاح' }, en: { format_date_unavailable: 'Unavailable' } };
const AR_DIGITS = /[\u0660-\u0669]/;

test('formatDate localizes by current language with explicit locales', () => {
  const stamp = '2026-03-15T10:30:00.000Z';
  const en = loadLocale({ language: 'en' }).formatDate(stamp, { year: 'numeric', month: 'short', day: 'numeric' });
  assert.match(en, /2026/, 'en shows ASCII year');
  assert.doesNotMatch(en, AR_DIGITS, 'en never emits Arabic-Indic digits');
  const ar = loadLocale({ language: 'ar' }).formatDate(stamp, { year: 'numeric', month: 'short', day: 'numeric' });
  assert.match(ar, AR_DIGITS, 'ar emits Arabic-Indic digits (ar-EG)');
});

test('formatDate never throws and returns translated unavailable for invalid input', () => {
  for (const bad of ['not-a-date', '', null, undefined, Number.NaN, {}, '2026-13-99']) {
    assert.equal(loadLocale({ language: 'ar', translations: AR_TRANSLATIONS }).formatDate(bad), 'غير متاح', `ar unavailable for ${String(bad)}`);
    assert.equal(loadLocale({ language: 'en', translations: AR_TRANSLATIONS }).formatDate(bad), 'Unavailable', `en unavailable for ${String(bad)}`);
  }
  assert.equal(loadLocale({ language: 'ar' }).formatDate('garbage'), 'Unavailable', 'falls back to English text without dictionaries');
});

test('formatNumber groups by locale and passes non-numerics through untouched', () => {
  assert.equal(loadLocale({ language: 'en' }).formatNumber(1234567.89), '1,234,567.89');
  assert.equal(loadLocale({ language: 'en' }).formatNumber('2500'), '2,500', 'numeric strings localize');
  const ar = loadLocale({ language: 'ar' }).formatNumber(1234567);
  assert.match(ar, AR_DIGITS, 'ar emits Arabic-Indic digits');
  assert.equal(loadLocale({ language: 'en' }).formatNumber('N/A'), 'N/A', 'non-numeric strings pass through');
  assert.equal(loadLocale({ language: 'en' }).formatNumber(null), '', 'null never throws');
  assert.equal(loadLocale({ language: 'en' }).formatNumber(undefined), '', 'undefined never throws');
});

test('helpers ignore browser locale — output follows the chosen language only', () => {
  const stamp = '2026-03-15T10:30:00.000Z';
  const withoutNavigator = loadLocale({ language: 'ar' }).formatDate(stamp);
  const withFrenchBrowser = loadLocale({ language: 'ar', navigatorLanguage: 'fr-FR' }).formatDate(stamp);
  assert.equal(withFrenchBrowser, withoutNavigator, 'ar output identical under a foreign browser locale');
  const enPlain = loadLocale({ language: 'en' }).formatNumber(1234567.89);
  const enForeign = loadLocale({ language: 'en', navigatorLanguage: 'ar-EG' }).formatNumber(1234567.89);
  assert.equal(enForeign, enPlain, 'en output identical under a foreign browser locale');
  assert.match(loadLocale({}).formatDate(stamp), /2026/, 'absent language defaults without throwing');
});

test('IDs, phones and emails render as raw strings — no locale reformatting', () => {
  const idSites = [
    /#\$\{order\._id\.slice\(-6\)\.toUpperCase\(\)\}/,
    /escapeHtml\(order\.customerPhone \|\| 'N\/A'\)/,
    /escapeHtml\(rec\.target\)/,
    /adminCell\(row, user\.email/,
  ];
  for (const site of idSites) {
    assert.match(dashboardScript, site, `ID/phone/email site present: ${site}`);
  }
  const lines = dashboardScript.split('\n');
  const sensitive = [];
  lines.forEach((line, i) => {
    if (/customerPhone|user\.email|rec\.target|order\._id\.slice|botUsername/.test(line)
      && /formatDate\(|formatNumber\(/.test(line)) {
      sensitive.push(`${i + 1}: ${line.trim().slice(0, 100)}`);
    }
  });
  assert.deepEqual(sensitive, [], `no locale helper touches IDs/phones/emails: ${sensitive.join(' | ')}`);
});

test('scope renderers use explicit-locale helpers, never bare browser-locale calls', () => {
  assert.match(dashboardScript, /\$\{order\.totalAmount \? formatNumber\(order\.totalAmount\)/, 'order total uses formatNumber');
  assert.match(dashboardScript, /booking\.bookingDate \? formatDate\(booking\.bookingDate,/, 'booking date uses formatDate');
  assert.match(dashboardScript, /formatDate\(key\.createdAt, \{ year:/, 'API-key created uses formatDate');
  assert.match(dashboardScript, /<td>\$\{formatDate\(log\.timestamp\)\}<\/td>/, 'webhook timestamp uses formatDate');
  assert.doesNotMatch(dashboardScript, /Number\(order\.totalAmount\)\.toLocaleString\(\)/, 'no bare browser-locale total remains');
});
