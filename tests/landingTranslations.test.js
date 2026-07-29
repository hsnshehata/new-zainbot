const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const landingHtml = fs.readFileSync(path.join(workspace, 'public', 'index.html'), 'utf8');
const landingScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'script.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function keysInTranslationSection(language) {
  const start = landingScript.indexOf(`    ${language}: {`);
  const nextLanguage = language === 'en' ? '    ar: {' : '\n  };\n\n  const langToggleBtn';
  const end = landingScript.indexOf(nextLanguage, start + 1);
  assert.notEqual(start, -1, `Missing ${language} translation section`);
  assert.notEqual(end, -1, `Could not delimit ${language} translation section`);
  return new Set([...landingScript.slice(start, end).matchAll(/^\s{6}([a-z][a-z0-9_]*):/gm)].map((match) => match[1]));
}

function markupTranslationKeys(attribute) {
  const matcher = new RegExp(`${attribute}="([a-z][a-z0-9_]*)"`, 'g');
  return new Set([...landingHtml.matchAll(matcher)].map((match) => match[1]));
}

test('landing markup translation keys exist in Arabic and English', () => {
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

test('landing uses the bilingual script that owns its translation map', () => {
  assert.match(landingHtml, /<script src="js\/script\.js\?v=20260729-i18n"><\/script>/);
});

test('landing does not publish unverified commercial plans or sample social proof', () => {
  assert.doesNotMatch(landingHtml, /growthPlanSelector|5000|150 EGP|Lumio|Brewlab|VERDE/);
  assert.doesNotMatch(landingHtml, /2,400|1,240|816|412/);
});
