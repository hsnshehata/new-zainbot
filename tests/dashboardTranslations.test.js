const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
// F04-ready: every key-extraction/parity scan below iterates SCAN_PATHS, so a
// moved chunk (dashboard-idea-council.js) stays verified instead of silently
// dropping coverage. F04d appended the chunk path to this list (F04b carried
// F-owned parity instead; now the council t() calls live only in the chunk).
// Dictionaries stay in the dashboard IIFE, so section scans resolve to its
// blocks first.
const SCAN_PATHS = ['public/js/dashboard_new.js', 'public/js/dashboard-idea-council.js'];
const dashboardScript = SCAN_PATHS
  .map((rel) => fs.readFileSync(path.join(workspace, rel), 'utf8').replace(/\r\n/g, '\n'))
  .join('\n');
const councilChunk = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard-idea-council.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function keysInTranslationSection(language) {
  const start = dashboardScript.indexOf(`    ${language}: {`);
  const nextLanguage = language === 'en' ? '    ar: {' : '\n  };\n\n  // Helper: Get JWT token from storage';
  const end = dashboardScript.indexOf(nextLanguage, start + 1);
  assert.notEqual(start, -1, `Missing ${language} translation section`);
  assert.notEqual(end, -1, `Could not delimit ${language} translation section`);
  return new Set([...dashboardScript.slice(start, end).matchAll(/^\s{6}([a-z][a-z0-9_]*):/gm)].map((match) => match[1]));
}

function markupTranslationKeys(attribute) {
  const matcher = new RegExp(`${attribute}="([a-z][a-z0-9_]*)"`, 'g');
  return new Set([...dashboardHtml.matchAll(matcher)].map((match) => match[1]));
}

// ---------- C01 hardening: pure, fixture-testable contract helpers ----------

function extractTranslationSection(source, language) {
  const start = source.indexOf(`    ${language}: {`);
  const nextLanguage = language === 'en' ? '    ar: {' : '\n  };\n\n  // Helper: Get JWT token from storage';
  const end = source.indexOf(nextLanguage, start + 1);
  assert.notEqual(start, -1, `Missing ${language} translation section`);
  assert.notEqual(end, -1, `Could not delimit ${language} translation section`);
  return source.slice(start, end);
}

function parseSectionEntries(sectionText) {
  const entries = [];
  for (const match of sectionText.matchAll(/^\s{6}([a-z][a-z0-9_]*):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/gm)) {
    entries.push({ key: match[1], value: match[2] !== undefined ? match[2] : match[3] });
  }
  return entries;
}

function findDuplicateKeys(entries) {
  const seen = new Set();
  const duplicates = [];
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      if (!duplicates.includes(entry.key)) duplicates.push(entry.key);
    } else {
      seen.add(entry.key);
    }
  }
  return duplicates;
}

function findEmptyValuedKeys(entries) {
  return entries.filter((entry) => entry.value.trim() === '').map((entry) => entry.key);
}

function findMissingKeys(required, available) {
  const availableSet = available instanceof Set ? available : new Set(available);
  return [...required].filter((key) => !availableSet.has(key));
}

function assertNoMissing(missing, language) {
  assert.deepEqual(missing, [], `Missing ${language} translations: ${missing.join(', ')}`);
}

function collectCodeKeyReferences(source, helperName) {
  const scrubbed = source.replace(/https?:\/\/[^\s'"]+/g, '');
  if (helperName === 'ideaT') {
    return new Set([...scrubbed.matchAll(/ideaT\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((match) => match[1]));
  }
  return new Set(
    [...scrubbed.matchAll(/[^A-Za-z0-9_$]t\.([a-z][a-z0-9_]*)/g)].map((match) => match[1]),
  );
}

// ---------- C01 fixture gates: small inputs that fail loudly ----------

test('parity helper flags keys missing from one language with their names', () => {
  const missing = findMissingKeys(['alpha_key', 'beta_key', 'gamma_key'], new Set(['alpha_key']));
  assert.deepEqual(missing, ['beta_key', 'gamma_key']);
  assert.throws(() => assertNoMissing(missing, 'Arabic'), /Missing Arabic translations: beta_key, gamma_key/);
});

test('duplicate helper flags a repeated key even when values match', () => {
  const sectionText = [
    '    en: {',
    "      orders_bookings_title: 'Orders & Appointments Center',",
    "      th_status: 'Status',",
    "      orders_bookings_title: 'Orders & Appointments Center',",
    '    ar: {',
  ].join('\n');
  assert.deepEqual(findDuplicateKeys(parseSectionEntries(sectionText)), ['orders_bookings_title']);
});

test('duplicate helper flags a repeated key with conflicting values', () => {
  const sectionText = [
    '    en: {',
    "      bookings_empty: 'No appointments booked yet.',",
    "      bookings_empty: 'No appointments scheduled yet.',",
    '    ar: {',
  ].join('\n');
  const entries = parseSectionEntries(sectionText);
  assert.deepEqual(findDuplicateKeys(entries), ['bookings_empty']);
  const values = entries.filter((entry) => entry.key === 'bookings_empty').map((entry) => entry.value);
  assert.notEqual(values[0], values[1], 'fixture must carry two distinct values to prove conflict detection');
});

test('empty-value helper flags empty and whitespace-only values', () => {
  const sectionText = [
    '    en: {',
    "      healthy_key: 'Something visible',",
    "      blank_key: '',",
    "      spaces_key: '   ',",
    '      double_blank_key: "",',
    '      double_healthy_key: "Planned double-quoted copy",',
    '    ar: {',
  ].join('\n');
  assert.deepEqual(findEmptyValuedKeys(parseSectionEntries(sectionText)), ['blank_key', 'spaces_key', 'double_blank_key']);
});

test('section extractor fails loudly when a language block is absent', () => {
  assert.throws(() => extractTranslationSection('const x = {};', 'en'), /Missing en translation section/);
});

test('code-reference collector skips t.me URLs but keeps real t.* keys', () => {
  const snippet = 'const u = `https://t.me/${name}`; btn.title = t.action_confirm; x = t.action_delete || y;';
  assert.deepEqual([...collectCodeKeyReferences(snippet, 't')].sort(), ['action_confirm', 'action_delete']);
  assert.deepEqual(
    [...collectCodeKeyReferences("if (!confirm(ideaT('idea_msg_confirm_delete'))) return;", 'ideaT')],
    ['idea_msg_confirm_delete'],
  );
});

// ---------- live dictionary gates (green; duplicates stay in findings) ----------

test('dashboard English and Arabic dictionaries have full parity', () => {
  const english = keysInTranslationSection('en');
  const arabic = keysInTranslationSection('ar');
  assertNoMissing(findMissingKeys(english, arabic), 'Arabic');
  assertNoMissing(findMissingKeys(arabic, english), 'English');
});

test('dashboard dictionaries carry no empty values', () => {
  for (const language of ['en', 'ar']) {
    const empty = findEmptyValuedKeys(parseSectionEntries(extractTranslationSection(dashboardScript, language)));
    assert.deepEqual(empty, [], `Empty ${language} translations: ${empty.join(', ')}`);
  }
});

test('dashboard t.* code references resolve in both dictionaries', () => {
  const english = keysInTranslationSection('en');
  const arabic = keysInTranslationSection('ar');
  const referenced = collectCodeKeyReferences(dashboardScript, 't');
  assert.ok(referenced.size > 0, 'expected at least one t.* reference in dashboard script');
  assertNoMissing(findMissingKeys(referenced, english), 'English (t.* references)');
  assertNoMissing(findMissingKeys(referenced, arabic), 'Arabic (t.* references)');
});

test('dashboard ideaT/t() code references resolve in both dictionaries', () => {
  // F04d: council ideaT('k') calls moved to the chunk as t('k'); both forms
  // resolve against the dashboard dictionaries (unchanged home).
  const english = keysInTranslationSection('en');
  const arabic = keysInTranslationSection('ar');
  const referenced = new Set([
    ...collectCodeKeyReferences(dashboardScript, 'ideaT'),
    ...[...councilChunk.matchAll(/(?<![A-Za-z0-9_$])t\(\s*['"]([A-Za-z0-9_]+)['"]/g)].map((m) => m[1]),
  ]);
  assert.ok(referenced.size > 0, 'expected at least one ideaT/t() reference in scanned scripts');
  assertNoMissing(findMissingKeys(referenced, english), 'English (ideaT/t() references)');
  assertNoMissing(findMissingKeys(referenced, arabic), 'Arabic (ideaT/t() references)');
});

test('dashboard markup translation keys exist in Arabic and English', () => {
  const english = keysInTranslationSection('en');
  const arabic = keysInTranslationSection('ar');
  const keys = new Set([
    ...markupTranslationKeys('data-i18n'),
    ...markupTranslationKeys('data-i18n-placeholder'),
    ...markupTranslationKeys('data-i18n-aria'),
  ]);

  const missingEnglish = [...keys].filter((key) => !english.has(key));
  const missingArabic = [...keys].filter((key) => !arabic.has(key));
  assert.deepEqual(missingEnglish, [], `Missing English translations: ${missingEnglish.join(', ')}`);
  assert.deepEqual(missingArabic, [], `Missing Arabic translations: ${missingArabic.join(', ')}`);
});

test('dashboard training copy is routed through translation keys', () => {
  assert.match(dashboardHtml, /id="botWelcomeMessage"[^>]*data-i18n-placeholder="training_welcome_placeholder"/);
  assert.match(dashboardHtml, /id="botCustomPrompt"[^>]*data-i18n-placeholder="training_persona_placeholder"/);
  assert.doesNotMatch(dashboardScript, /No QA rules trained\. Click Add FAQ\./);
});
