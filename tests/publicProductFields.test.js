'use strict';

// tests/publicProductFields.test.js
// Public-storefront data minimization: the anonymous product-list endpoints
// (GET /api/products/:storeId/products and /products/bestsellers) must not
// expose merchant-internal fields. Before the fix, both returned full
// Product documents, leaking costPrice (merchant purchase cost),
// lowStockThreshold, barcode and generatedCodes to any anonymous caller.
// Storefront JS only needs the public field set (name/price/offer/images/
// stock/salesCount/category/options).

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const Product = require('../server/models/Product');
const controller = require('../server/controllers/productController');

const OWNER_ID = new mongoose.Types.ObjectId();
const INTERNAL_FIELDS = ['costPrice', 'lowStockThreshold', 'barcode', 'generatedCodes'];

let mongod;
let store;
let product;

function reqRes({ params, query } = {}) {
  const req = {
    params: params || {},
    query: query || {},
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  return { req, res };
}

function assertPublicShape(doc, label) {
  for (const field of INTERNAL_FIELDS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(doc, field),
      false,
      `${label}: public response must not include ${field}`
    );
  }
  // storefront-critical fields stay present
  for (const field of ['productName', 'price', 'stock', 'salesCount', 'imageUrl']) {
    assert.ok(field in doc, `${label}: storefront field ${field} must stay available`);
  }
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-publicproducts-test'));
  store = await Store.create({
    userId: OWNER_ID,
    storeName: 'Public Fields Store',
    storeLink: 'public-fields-store',
    templateId: 1,
  });
  product = await Product.create({
    storeId: store._id,
    productName: 'حذاء رياضي',
    description: 'وصف عام',
    detailedDescription: 'وصف تفصيلي',
    price: 500,
    costPrice: 320,
    stock: 7,
    lowStockThreshold: 2,
    barcode: 'BAR-123',
    generatedCodes: ['123456789012', 'P-ABCDEF-XX', 'SHORTCODE1'],
    salesCount: 3,
    isActive: true,
    imageUrl: 'https://example.com/shoe.png',
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('getProducts (default path) hides merchant-internal fields', async () => {
  const { req, res } = reqRes({
    params: { storeId: String(store._id) },
    query: {},
  });
  await controller.getProducts(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.products.length, 1);
  assertPublicShape(res.payload.products[0], 'getProducts');
});

test('getProducts (random=true aggregation) hides merchant-internal fields', async () => {
  const { req, res } = reqRes({
    params: { storeId: String(store._id) },
    query: { random: 'true', limit: '5' },
  });
  await controller.getProducts(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.products.length, 1);
  assertPublicShape(res.payload.products[0], 'getProducts?random=true');
});

test('getBestsellers (no-orders fallback) hides merchant-internal fields', async () => {
  // No orders exist for this store, so the controller takes the
  // "latest products" fallback branch.
  const { req, res } = reqRes({
    params: { storeId: String(store._id) },
    query: { limit: '4' },
  });
  await controller.getBestsellers(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.length, 1);
  assertPublicShape(res.payload[0], 'getBestsellers fallback');
});
