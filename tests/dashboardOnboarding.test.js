const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { progress } = require('../public/js/dashboard-onboarding');

const faq = { type: 'qa', isActive: true, content: { question: 'Shipping?', answer: 'Three days.' } };
const repliedWebChat = { channel: 'web', messages: [
  { role: 'user', content: 'Shipping?' }, { role: 'assistant', content: 'Three days.' }
] };

test('a newly provisioned bot, empty FAQ and merely opened link do not complete steps', () => {
  assert.deepEqual(progress({ name: 'Default agent' }, [], []), {
    personalized: false, trained: false, tested: false
  });
  assert.deepEqual(progress({ customInstructions: '  Help our customers  ' }, [faq], []), {
    personalized: true, trained: true, tested: false
  });
});

test('only a saved, active question and answer and a real two-sided web conversation count', () => {
  const bot = { welcomeMessage: 'Hello!' };
  assert.equal(progress(bot, [{ ...faq, content: { question: '   ', answer: 'A' } }], []).trained, false);
  assert.equal(progress(bot, [{ ...faq, isActive: false }], []).trained, false);
  assert.equal(progress(bot, [faq], [{ ...repliedWebChat, channel: 'telegram' }]).tested, false);
  assert.equal(progress(bot, [faq], [{ channel: 'web', messages: [{ role: 'user', content: 'Hi' }] }]).tested, false);
  assert.deepEqual(progress(bot, [faq], [repliedWebChat]), {
    personalized: true, trained: true, tested: true
  });
});

test('overview guide is wired to real routes and translated in both languages', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/dashboard.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../public/js/dashboard_new.js'), 'utf8');
  assert.ok(html.indexOf('id="onboardingGuide"') < html.indexOf('class="stats-grid"'));
  assert.match(js, /api\/rules\?botId=\$\{encodeURIComponent\(botId\)\}&type=qa&limit=100&page=\$\{page\}/);
  assert.match(js, /api\/messages\/conversations\?botId=\$\{encodeURIComponent\(botId\)\}/);
  assert.match(js, /switchTab\('page-agents'(, \{ focusHeading: true \})?\)/);
  assert.match(js, /switchTab\('page-training'(, \{ focusHeading: true \})?\)/);
  assert.match(js, /chatPageLink\(currentBot\._id\)/);
});
