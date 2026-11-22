const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProductContext, buildStorefrontUrl } = require('../server/services/productContext');

const product = (id, productName, description = '', extra = {}) => ({
  _id: String(id).padStart(24, '0'), productName, description,
  price: 45, currency: 'EGP', stock: 3, isActive: true, ...extra
});

test('matches Arabic and English names and descriptions using latest message tokens', () => {
  const catalog = [
    product(1, 'حقيبة جلد', 'لون بني'),
    product(2, 'Blue running shoes', 'comfortable for jogging'),
    product(3, 'Red shirt', 'قطن ناعم'),
  ];
  const arabic = buildProductContext(catalog, 'بكام الحقيبة الجلد؟', 'shop', 'https://zainbot.com');
  assert.match(arabic, /حقيبة جلد، السعر: 45 EGP/);
  assert.match(arabic, /https:\/\/zainbot.com\/store\/shop\/landing\?product=000000000000000000000001/);
  assert.doesNotMatch(arabic, /Blue running shoes|Red shirt/);
  const english = buildProductContext(catalog, 'Do you have jogging shoes?', 'shop');
  assert.match(english, /Blue running shoes/);
  assert.doesNotMatch(english, /حقيبة جلد|Red shirt/);
  assert.match(buildProductContext(catalog, 'قطن', 'shop'), /Red shirt/);
});

test('inactive products are never shown or counted, including when they alone match', () => {
  const catalog = [product(1, 'Hidden umbrella', 'secret', { isActive: false }), product(2, 'Visible coat')];
  const context = buildProductContext(catalog, 'umbrella', 'shop');
  assert.match(context, /1 منتج متاح/);
  assert.doesNotMatch(context, /Hidden umbrella|secret|Visible coat/);
  assert.match(buildProductContext([catalog[0]], 'umbrella', 'shop'), /لا توجد منتجات متاحة/);
});

test('unmatched or generic requests describe availability without inventing matches', () => {
  const catalog = [product(1, 'Blue coat'), product(2, 'Green scarf')];
  for (const message of ['microwave', 'Show me products', 'عندكم منتجات؟']) {
    const context = buildProductContext(catalog, message, 'shop');
    assert.match(context, /2 منتج متاح/);
    assert.doesNotMatch(context, /Blue coat|Green scarf|المنتج:/);
  }
});

test('caps matched listings and trims descriptions without changing price, stock or product link', () => {
  const catalog = Array.from({ length: 500 }, (_, index) =>
    product(index + 1, `Camera ${index + 1}`, `<b>${'longword '.repeat(500)}</b>`, { price: 19.5, stock: 0 }));
  const context = buildProductContext(catalog, 'camera', 'shop', 'https://new.zainbot.com');
  assert.equal((context.match(/المنتج:/g) || []).length, 10);
  assert.match(context, /500 منتج متاح/);
  assert.match(context, /Camera 1، السعر: 19.5 EGP/);
  assert.match(context, /المخزون: 0/);
  assert.match(context, /product=000000000000000000000001/);
  assert.doesNotMatch(context, /Camera 11|<b>|longword (?:longword ){30}/);
  assert.ok(context.length < 4000);
});

test('uses the actual discounted selling price for offers', () => {
  const context = buildProductContext([
    product(1, 'Summer sandals', '', { price: 100, hasOffer: true, discountedPrice: 70 })
  ], 'sandals', 'shop');
  assert.match(context, /Summer sandals، السعر: 70 EGP/);
  assert.doesNotMatch(context, /السعر: 100/);
});

test('product links use configured test-site origin, never a primary-domain fallback', () => {
  const oldApp = process.env.APP_URL;
  const oldBase = process.env.BASE_URL;
  try {
    process.env.APP_URL = 'https://new.zainbot.com/';
    delete process.env.BASE_URL;
    const context = buildProductContext([product(1, 'Test camera')], 'camera', 'shop');
    assert.match(context, /https:\/\/new\.zainbot\.com\/store\/shop\/landing\?product=000000000000000000000001/);
    assert.doesNotMatch(context, /https:\/\/zainbot\.com/);
    for (const origin of ['', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/path?key=x']) {
      process.env.APP_URL = origin;
      const missing = buildProductContext([product(1, 'Test camera')], 'camera', 'shop');
      assert.match(missing, /الرابط: غير متوفر/);
      assert.doesNotMatch(missing, /https:\/\/zainbot\.com|secret|javascript:/);
    }
  } finally {
    if (oldApp === undefined) delete process.env.APP_URL; else process.env.APP_URL = oldApp;
    if (oldBase === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = oldBase;
  }
});

test('storefront link builder uses supported landing route and rejects unsafe IDs/origins', () => {
  assert.equal(buildStorefrontUrl('shop', undefined, 'https://new.zainbot.com/'), 'https://new.zainbot.com/store/shop/landing');
  assert.equal(buildStorefrontUrl('../other', undefined, 'https://new.zainbot.com'), null);
  assert.equal(buildStorefrontUrl('shop', 'invalid', 'https://new.zainbot.com'), null);
  assert.equal(buildStorefrontUrl('shop', undefined, 'https://user:secret@example.com'), null);
});
