const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
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
