'use strict';

// tests/orderReplyStructural.review.test.js
// Independent reviewer STRUCTURAL property tests for the deterministic
// order reply (acceptance gate). Property: for ANY order outcome — now
// including durably confirmed saves (contract change directed 2026-11-22:
// confirmed replies are constrained to durable facts after unsupported
// shipping promises were observed in live freeform confirmations) — the
// customer-facing body is a pure function of durable state, identical for
// every possible model text, containing zero model prose in any language.

const test = require('node:test');
const assert = require('node:assert/strict');

const { enforceTruthfulOrderReply } = require('../server/botEngine');

// Adversarial model texts: claims, questions, colloquial, multilingual,
// fabricated ids, benign chit-chat, and a unique marker per text.
const FUZZ = [
  'تم تأكيد طلبك بنجاح! MARKER_A',
  'سجلت طلبك يا فندم وهيوصلك بكرة. MARKER_B',
  'طلبك اتعمل. MARKER_C',
  'Your order has been confirmed. MARKER_D',
  'Your order will be shipped tomorrow. MARKER_E',
  'Votre commande est confirmée. MARKER_F',
  'Ihre Bestellung wurde bestätigt. MARKER_G',
  'تم تأكيد طلبك؟ تمام كده. MARKER_H',
  'تمام! رقم الطلب: 777. MARKER_I',
  'محتاج اسمك ورقم تليفونك. ما هو اسمك؟ MARKER_J',
  'تم تنفيذ طلبك بنجاح وهنتواصل معاك. MARKER_K',
  'أكيد! خد راحتك. MARKER_L',
  'شكرًا لثقتك 🎉 MARKER_M',
];

const NONCONFIRMED_CONTEXTS = {
  save_failed: { outcome: 'save_failed', saved: false },
  pending_received: { outcome: 'saved', saved: true, chatOrder: { _id: 'ord1', status: 'received' } },
  missing_data: { outcome: 'missing_data', saved: false, missingFields: ['الاسم', 'التليفون'] },
  unpriced_items: { outcome: 'unpriced_items', saved: false, unpricedTitles: ['قميص'] },
  need_fresh_data: { outcome: 'need_fresh_data', saved: false },
  cancelled: { outcome: 'cancelled', saved: false, chatOrder: { _id: 'ord9', status: 'cancelled' } },
  cancel_blocked: { outcome: 'cancel_blocked', saved: false, chatOrder: { _id: 'ord8', status: 'shipped' } },
  unknown_future_outcome: { outcome: 'some_future_outcome', saved: false },
};

test('STRUCTURAL: every non-confirmed outcome yields one deterministic body for all model texts', () => {
  for (const [name, ctx] of Object.entries(NONCONFIRMED_CONTEXTS)) {
    const outputs = FUZZ.map((reply) => enforceTruthfulOrderReply(reply, ctx));
    const unique = new Set(outputs);
    assert.equal(unique.size, 1, `outcome ${name}: body must be identical for every model text, got ${unique.size} variants`);
    const body = outputs[0];
    for (let i = 0; i < FUZZ.length; i++) {
      assert.ok(!body.includes(`MARKER_${String.fromCharCode(65 + i)}`), `outcome ${name}: model prose leaked into deterministic body`);
    }
    assert.ok(body.trim().length > 0, `outcome ${name}: empty deterministic body`);
  }
});

test('STRUCTURAL: deterministic body carries the durable fields, not model claims', () => {
  const pending = enforceTruthfulOrderReply(FUZZ[0], NONCONFIRMED_CONTEXTS.pending_received);
  assert.match(pending, /ord1/);
  assert.match(pending, /استلام ومراجعة/);
  const missing = enforceTruthfulOrderReply(FUZZ[0], NONCONFIRMED_CONTEXTS.missing_data);
  assert.match(missing, /الاسم/);
  assert.match(missing, /التليفون/);
  const unpriced = enforceTruthfulOrderReply(FUZZ[0], NONCONFIRMED_CONTEXTS.unpriced_items);
  assert.match(unpriced, /قميص/);
});

test('STRUCTURAL: durably confirmed outcome also yields one deterministic body from durable facts', () => {
  const confirmed = {
    outcome: 'saved',
    saved: true,
    chatOrder: {
      _id: 'x',
      status: 'confirmed',
      customerName: 'حسن',
      items: [{ title: 'قميص', quantity: 2, price: 100, currency: 'EGP' }],
      totalAmount: 200,
    },
  };
  const outputs = FUZZ.map((reply) => enforceTruthfulOrderReply(reply, confirmed));
  assert.equal(new Set(outputs).size, 1, 'confirmed body must be identical for every model text');
  const body = outputs[0];
  for (let i = 0; i < FUZZ.length; i++) {
    assert.ok(!body.includes(`MARKER_${String.fromCharCode(65 + i)}`), 'model prose leaked into confirmed body');
  }
  assert.match(body, /رقم الطلب: x/);
  assert.match(body, /قميص ×2/);
  assert.match(body, /الإجمالي: 200 جنيه/);
  assert.match(body, /حسن/);
  const benign = ['أهلا بيك! MARKER_Z', 'الجو حار النهاردة. MARKER_Y'];
  for (const reply of benign) {
    assert.equal(enforceTruthfulOrderReply(reply, null), reply, 'benign no-outcome chat must pass verbatim');
  }
});

test('BACKSTOP: no-outcome spontaneous order claim cannot reach the customer (AR/EN)', () => {
  // Each entry: [claim text, fragment proving the claim survived].
  const CLAIMS = [
    ['تم تأكيد طلبك بنجاح!', /تم تأكيد/],
    ['سجلت طلبك يا فندم وهيوصلك بكرة.', /سجلت طلبك/],
    ['طلبك اتعمل.', /اتعمل/],
    ['Your order has been confirmed.', /has been confirmed/i],
    ['تم تأكيد طلبك؟ تمام كده.', /تم تأكيد طلبك/],
    ['تمام! رقم الطلب: 777.', /777/],
    ['تم تنفيذ طلبك بنجاح وهنتواصل معاك.', /تنفيذ/],
  ];
  for (const [reply, fragment] of CLAIMS) {
    const out = enforceTruthfulOrderReply(reply, null);
    assert.doesNotMatch(out, fragment, `claim-bearing model text leaked on no-outcome path: ${reply}`);
    assert.match(out, /لم يُسجل أي طلب من هذه المحادثة/, 'deterministic default truth must replace the stripped claim');
  }
});

test('[KNOWN-GAP] no-outcome backstop is a denylist: non-AR/EN and future-tense claims currently leak', () => {
  // Documents the accepted residual of the detector backstop on no-outcome
  // turns (order turns are closed structurally). If the backstop is later
  // hardened these assertions flip to doesNotMatch.
  // Verified on bae2437: EN future tense and Egyptian future forms ARE
  // covered; the observable residual is non-AR/EN language claims only.
  const GAPS = [
    ['Votre commande est confirmée.', /confirmée/i],
    ['Ihre Bestellung wurde bestätigt.', /bestätigt/i],
  ];
  for (const [reply, fragment] of GAPS) {
    const out = enforceTruthfulOrderReply(reply, null);
    assert.match(out, fragment, `expected currently-uncovered backstop gap to be observable: ${reply}`);
  }
});
