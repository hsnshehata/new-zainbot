const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { detectMessageLang } = require('../server/routes/landingDemo');

test('reply language follows the typed text, then UI language', () => {
  assert.strictEqual(detectMessageLang('فين طلبي؟', 'en'), 'ar');
  assert.strictEqual(detectMessageLang('Where is my order?', 'ar'), 'en');
  assert.strictEqual(detectMessageLang('123', 'ar'), 'ar');
});

test('demo chips carry Arabic prompts and script uses them in Arabic UI', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  assert.strictEqual((html.match(/data-prompt-ar="/g) || []).length, 3);
  const js = fs.readFileSync(path.join(__dirname, '../public/js/script.js'), 'utf8');
  assert.match(js, /currentLang === 'ar' && chip\.dataset\.promptAr/);
});
