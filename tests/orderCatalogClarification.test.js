'use strict';

// tests/orderCatalogClarification.test.js
// Normalized catalog matching with deterministic clarification (2026-11-22).
// Live finding: extractor-shortened product titles ("منتج تجريبي أ" →
// "تجريبي أ") failed the matcher because single-character tokens were
// dropped, collapsing "أ"/"ب" variants into ambiguity. The matcher must
// distinguish those variants, surface candidate names on ambiguity and
// suggestions on no-match, and never invent a price.

const test = require('node:test');
const assert = require('node:assert/strict');

const { tokens } = require('../server/services/productContext');
const {
  findCatalogProductMatch,
  enforceTruthfulOrderReply,
  customerTruthSentence,
} = require('../server/botEngine');

const mkProduct = (name, price = 100) => ({
  _id: `id_${name}`,
  productName: name,
  price,
  currency: 'EGP',
  isActive: true,
});

const CATALOG = [
  mkProduct('منتج تجريبي أ', 100),
  mkProduct('منتج تجريبي ب', 250),
  mkProduct('قميص قطن أبيض', 300),
];

test('tokens: single-character token kept when the name has several words, dropped when alone', () => {
  // normalize() folds أإآ to bare alef, so the kept letter is 'ا'.
  assert.deepEqual(tokens('منتج تجريبي أ').sort(), ['ا', 'تجريبي'].sort());
  assert.deepEqual(tokens('ب'), [], 'a lone one-character word carries no signal');
});

test('matcher: shortened title keeps its distinguishing letter and prices the right variant', () => {
  const a = findCatalogProductMatch(CATALOG, 'تجريبي أ');
  assert.equal(a.status, 'priced');
  assert.equal(a.product.price, 100);
  const b = findCatalogProductMatch(CATALOG, 'تجريبي ب');
  assert.equal(b.status, 'priced');
  assert.equal(b.product.price, 250);
});

test('matcher: title without the distinguishing letter is ambiguous and names both candidates', () => {
  const m = findCatalogProductMatch(CATALOG, 'تجريبي');
  assert.equal(m.status, 'ambiguous');
  assert.deepEqual(m.candidates.sort(), ['منتج تجريبي أ', 'منتج تجريبي ب'].sort());
  assert.equal(m.product, undefined, 'ambiguous match must never carry a product/price');
});

test('matcher: no confident match returns token-overlap suggestions, never a price', () => {
  const m = findCatalogProductMatch(CATALOG, 'قميص');
  // "قميص" is a subset of "قميص قطن أبيض" tokens, so this is a confident
  // subset match; use a partially overlapping non-subset title instead.
  assert.equal(m.status, 'priced');
  const partial = findCatalogProductMatch(CATALOG, 'قطن شتوي');
  assert.equal(partial.status, 'unknown');
  assert.deepEqual(partial.candidates, ['قميص قطن أبيض']);
  assert.equal(partial.product, undefined, 'unknown match must never carry a product/price');
  const none = findCatalogProductMatch(CATALOG, 'ثلاجة');
  assert.equal(none.status, 'unknown');
  assert.deepEqual(none.candidates, []);
});

test('matcher: normalized exact match tolerates alef/hamza and teh-marbuta variants', () => {
  const catalog = [mkProduct('إضاءة ليد', 120)];
  const m = findCatalogProductMatch(catalog, 'اضاءه ليد');
  assert.equal(m.status, 'priced');
  assert.equal(m.product.price, 120);
});

test('clarification: ambiguous outcome renders deterministic candidate names, zero model prose', () => {
  const ctx = {
    outcome: 'ambiguous_items',
    saved: false,
    ambiguousItems: [{ title: 'تجريبي', candidates: ['منتج تجريبي أ', 'منتج تجريبي ب'] }],
  };
  const out = enforceTruthfulOrderReply('أكيد سجلت طلبك! MARKER_Z', ctx);
  assert.match(out, /منتج تجريبي أ/);
  assert.match(out, /منتج تجريبي ب/);
  assert.match(out, /لم يُسجل طلبك/);
  assert.ok(!out.includes('MARKER_Z'), 'model prose leaked into clarification body');
  assert.doesNotMatch(out, /سجلت/, 'model claim must not survive');
});

test('clarification: mixed ambiguous + unknown items names both kinds in one deterministic body', () => {
  const ctx = {
    outcome: 'ambiguous_items',
    saved: false,
    ambiguousItems: [{ title: 'تجريبي', candidates: ['منتج تجريبي أ', 'منتج تجريبي ب'] }],
    unknownItems: [{ title: 'ثلاجة', suggestions: [] }],
  };
  const out = customerTruthSentence(ctx);
  assert.match(out, /منتج تجريبي أ/);
  assert.match(out, /ثلاجة/, 'unknown titles must not be omitted from a mixed reply');
  assert.match(out, /غير موجودة في المتجر/);
});

test('clarification: unpriced outcome with suggestions asks هل تقصد without inventing a price', () => {
  const ctx = {
    outcome: 'unpriced_items',
    saved: false,
    unpricedTitles: ['قطن شتوي'],
    unknownItems: [{ title: 'قطن شتوي', suggestions: ['قميص قطن أبيض'] }],
  };
  const out = customerTruthSentence(ctx);
  assert.match(out, /قطن شتوي/);
  assert.match(out, /هل تقصد: قميص قطن أبيض؟/);
  assert.doesNotMatch(out, /300/, 'no catalog price leaks into an unpriced clarification');
});

test('confirmed body shows the stored delivery fee, and only when actually stored', () => {
  const withFee = customerTruthSentence({
    outcome: 'saved',
    saved: true,
    chatOrder: {
      _id: 'ordF',
      status: 'confirmed',
      items: [{ title: 'كتاب', quantity: 1, price: 100, currency: 'EGP' }],
      deliveryFee: 30,
      totalAmount: 130,
    },
  });
  assert.match(withFee, /رسوم التوصيل: 30 جنيه/);
  assert.match(withFee, /الإجمالي: 130 جنيه/);

  const noFee = customerTruthSentence({
    outcome: 'saved',
    saved: true,
    chatOrder: {
      _id: 'ordN',
      status: 'confirmed',
      items: [{ title: 'كتاب', quantity: 1, price: 100, currency: 'EGP' }],
      totalAmount: 100,
    },
  });
  assert.doesNotMatch(noFee, /رسوم التوصيل/, 'no fee line without a stored fee');
});

test('confirmed body is built from durable order fields only and sanitizes embedded markup', () => {
  const ctx = {
    outcome: 'saved',
    saved: true,
    chatOrder: {
      _id: 'ord9',
      status: 'confirmed',
      customerName: 'حسن <b>باشا</b>',
      items: [
        { title: 'قميص <script>alert(1)</script>', quantity: 2, price: 100, currency: 'EGP' },
        { title: 'بنطلون', quantity: 1, price: 50, currency: 'EGP' },
      ],
      totalAmount: 250,
    },
  };
  const out = enforceTruthfulOrderReply('تمام كده! MARKER_Q', ctx);
  assert.match(out, /رقم الطلب: ord9/);
  assert.match(out, /قميص ×2/);
  assert.match(out, /بنطلون ×1/);
  assert.match(out, /الإجمالي: 250 جنيه/);
  assert.match(out, /حسن باشا/);
  assert.ok(!out.includes('<script>'), 'markup must be stripped from customer-facing deterministic text');
  assert.ok(!out.includes('alert(1)'), 'script content must be dropped, not just its tags');
  assert.ok(!out.includes('<b>'));
  assert.ok(!out.includes('MARKER_Q'));
});
