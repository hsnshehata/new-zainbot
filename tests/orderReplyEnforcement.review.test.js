'use strict';

// tests/orderReplyEnforcement.review.test.js
// Independent reviewer adversarial contracts for enforceTruthfulOrderReply,
// written against dbdab78. [DESIRED] tests document false-confirmation
// phrasings that currently SURVIVE the denylist (they fail until enforcement
// is paraphrase-robust); [GUARD] tests pin behavior that must keep working.

const test = require('node:test');
const assert = require('node:assert/strict');

const { enforceTruthfulOrderReply } = require('../server/botEngine');

const SAVE_FAILED = { outcome: 'save_failed', saved: false };
const PENDING = { outcome: 'saved', saved: true, chatOrder: { _id: 'abc123', status: 'received' } };
const MISSING = { outcome: 'missing_data', saved: false, missingFields: ['الاسم'] };

function deniesFalseClaim(t, reply, ctx, claimPattern) {
  const out = enforceTruthfulOrderReply(reply, ctx);
  assert.doesNotMatch(out, claimPattern, `false order-state claim survived enforcement: ${reply}`);
  return out;
}

// --- [DESIRED] paraphrase classes that bypass the current denylist on dbdab78 ---

test('[DESIRED] Egyptian first-person claim (سجلت طلبك) cannot survive a failed save', (t) => {
  deniesFalseClaim(t, 'سجلت طلبك يا فندم وهيوصلك خلال يومين.', SAVE_FAILED, /سجلت طلبك/);
});

test('[DESIRED] Egyptian passive colloquial (طلبك اتعمل) cannot survive a failed save', (t) => {
  deniesFalseClaim(t, 'تمام، طلبك اتعمل.', SAVE_FAILED, /اتعمل/);
});

test('[DESIRED] uncovered state verbs (تنفيذ/استقبال) cannot survive a failed save', (t) => {
  deniesFalseClaim(t, 'تم تنفيذ طلبك بنجاح.', SAVE_FAILED, /تنفيذ/);
  deniesFalseClaim(t, 'تم استقبال طلبك وهنتواصل معاك.', SAVE_FAILED, /استقبال/);
});

test('[DESIRED] future-tense delivery assurance cannot survive a failed save', (t) => {
  deniesFalseClaim(t, 'Your order will be shipped tomorrow.', SAVE_FAILED, /will be shipped/i);
  deniesFalseClaim(t, 'طلبك هيوصلك بكرة إن شاء الله.', SAVE_FAILED, /هيوصلك/);
});

test('[DESIRED] rhetorical-question form of a confirmation cannot survive', (t) => {
  deniesFalseClaim(t, 'تم تأكيد طلبك؟ تمام كده.', SAVE_FAILED, /تم تأكيد طلبك/);
});

test('[DESIRED] pending save: colloquial overclaim is replaced by durable received-status', (t) => {
  const out = deniesFalseClaim(t, 'سجلت طلبك واتأكد.', PENDING, /سجلت طلبك/);
  assert.match(out, /استلام ومراجعة/);
});

// --- [GUARD] behavior that must keep working ---

test('[GUARD] covered confirmation claims are stripped and truth appended', () => {
  const out = enforceTruthfulOrderReply('تم تأكيد طلبك بنجاح.', SAVE_FAILED);
  assert.doesNotMatch(out, /تم تأكيد طلبك/);
  assert.match(out, /لم يُسجل|خطأ تقني/);
  const outEn = enforceTruthfulOrderReply('Your order has been confirmed.', SAVE_FAILED);
  assert.doesNotMatch(outEn, /confirmed/i);
});

test('[GUARD] fabricated order id is removed when nothing is saved', () => {
  const out = enforceTruthfulOrderReply('تمام! رقم الطلب: 999.', MISSING);
  assert.doesNotMatch(out, /999/);
  assert.match(out, /الاسم/);
});

test('[GUARD] non-confirmed outcomes render a fully deterministic durable-state body (structural gate, supersedes prose preservation)', () => {
  // Structural contract: on order-outcome turns the customer-facing body is
  // deterministic text rendered from durable state; model prose — even
  // harmless detail-asking — is not part of the customer-facing reply.
  const out = enforceTruthfulOrderReply('محتاج اسمك ورقم تليفونك عشان أسجل الطلب. ما هو اسمك؟', SAVE_FAILED);
  assert.match(out, /خطأ تقني/);
  assert.doesNotMatch(out, /محتاج اسمك ورقم تليفونك/, 'model prose is replaced, not detector-passed');
  const outMissing = enforceTruthfulOrderReply('أي نص مولد', MISSING);
  assert.match(outMissing, /الاسم/, 'missing required fields come from durable state');
  assert.doesNotMatch(outMissing, /أي نص مولد/);
});

test('[GUARD] non-order chat with no outcome passes through unchanged', () => {
  const reply = 'الجو حار النهاردة، عامل إيه؟';
  assert.equal(enforceTruthfulOrderReply(reply, null), reply);
});

test('[GUARD] durably confirmed order reply is a deterministic durable-facts body (contract change 2026-11-22, supersedes freeform)', () => {
  // Confirmed saves no longer pass model prose: live freeform confirmations
  // carried unsupported shipping promises, so the body is rendered from the
  // stored order only.
  const reply = 'تم تأكيد طلبك بنجاح! 🎉 وهنشحنه بكرة إن شاء الله';
  const ctx = {
    outcome: 'saved',
    saved: true,
    chatOrder: { _id: 'x', status: 'confirmed', customerName: '', items: [], totalAmount: 150 },
  };
  const out = enforceTruthfulOrderReply(reply, ctx);
  assert.match(out, /رقم الطلب: x/);
  assert.match(out, /الإجمالي: 150 جنيه/);
  assert.doesNotMatch(out, /وهنشحنه/, 'unsupported shipping promise must not reach the customer');
  assert.doesNotMatch(out, /🎉/, 'model prose is replaced, not preserved');
});
