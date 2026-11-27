'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const p = require('../server/services/conversationPolicy');

test('stop requests: short stop-only messages are detected (Arabic and English)', () => {
  for (const m of ['اسكت', 'كفاية', 'كفاية كده', 'بطل رد', 'وقف', 'متردش', 'ما تردش علي', 'مش عايز رد', 'لو سمحت اسكت', 'stop', 'Stop it!', 'enough', 'خلاص كفاية']) {
    assert.equal(p.detectStopRequest(m), true, m);
  }
});

test('stop requests: normal sentences that merely contain the words are not stops', () => {
  for (const m of ['عاوز اشتراك شهر', 'وقف الاشتراك بتاعي ازاي؟', 'كفاية الباقة المجانية؟', 'هل ممكن اوقف الحساب وارجع تاني', '1', 'stop the subscription renewal please and send invoice', '']) {
    assert.equal(p.detectStopRequest(m), false, m);
  }
});

test('resume requests are short explicit messages only', () => {
  for (const m of ['كمل', 'ابدأ', 'رجع', 'start', 'Resume']) assert.equal(p.detectResumeRequest(m), true, m);
  for (const m of ['عاوز اعرف الاسعار', 'ok', 'شكرا']) assert.equal(p.detectResumeRequest(m), false, m);
});

test('stop ack follows the customer language', () => {
  assert.match(p.stopAckReply('اسكت'), /كمل/);
  assert.match(p.stopAckReply('stop'), /start/);
});

test('repeated help offer is stripped only after a previous assistant reply', () => {
  const r = 'الباقة بـ 199 ج/شهر. كيف يمكنني مساعدتك اليوم؟';
  assert.equal(p.stripRepeatedHelpOffer(r, true), 'الباقة بـ 199 ج/شهر.');
  assert.equal(p.stripRepeatedHelpOffer(r, false), r);
  assert.equal(p.stripRepeatedHelpOffer('Plan is 199 EGP. How can I help you today?', true), 'Plan is 199 EGP.');
  const onlyOffer = 'كيف يمكنني مساعدتك اليوم؟';
  assert.equal(p.stripRepeatedHelpOffer(onlyOffer, true), onlyOffer);
  assert.equal(p.stripRepeatedHelpOffer('أهلا! تحب تعرف عن الباقات؟', true), 'أهلا! تحب تعرف عن الباقات؟');
});

test('platform subscription note never calls a plan an unpriced product', () => {
  assert.match(p.PLATFORM_SUBSCRIPTION_NOTE, /طلب اشتراك/);
  assert.match(p.PLATFORM_SUBSCRIPTION_NOTE, /غير متوفرة بسعر رسمي/);
  assert.doesNotMatch(p.PLATFORM_SUBSCRIPTION_NOTE, /whatsapp\.com|http/);
});
