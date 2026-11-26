'use strict';

// Owner rule: the public landing demo agent never answers programming/code or
// off-topic technical requests; it redirects politely before any paid call.

const test = require('node:test');
const assert = require('node:assert/strict');

const { isOffTopicTechRequest, offTopicRedirectMessage } = require('../server/routes/landingDemo');

test('code and programming requests are detected (Arabic and English)', () => {
  const flagged = [
    'اكتبلي كود بايثون بيعمل بوت',
    'عاوز اكواد لعمل موقع',
    'ممكن تساعدني في البرمجة',
    'اكتب سكريبت يعمل حساب تلقائي',
    'write me a python script that scrapes prices',
    'how do I center a div with css',
    'fix this javascript function() bug',
    'what is the best sql join for this',
  ];
  for (const msg of flagged) {
    assert.equal(isOffTopicTechRequest(msg), true, `expected flagged: ${msg}`);
  }
});

test('platform questions are never flagged', () => {
  const clean = [
    'ما هي أسعار المنصة؟',
    'فيه كود خصم على الباقات؟',
    'برومو كود متاح؟',
    'هل البوت بيرد على واتساب؟',
    'how much is the Pro plan?',
    'can the agent take orders on whatsapp',
    'إزاي أعمل حساب مجاني',
  ];
  for (const msg of clean) {
    assert.equal(isOffTopicTechRequest(msg), false, `expected clean: ${msg}`);
  }
});

test('redirect message is polite, bilingual, and points to /register', () => {
  assert.match(offTopicRedirectMessage('ar'), /زين بوت/);
  assert.match(offTopicRedirectMessage('ar'), /\/register/);
  assert.match(offTopicRedirectMessage('en'), /ZainBot/);
  assert.match(offTopicRedirectMessage('en'), /\/register/);
});
