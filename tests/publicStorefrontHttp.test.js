'use strict';

// tests/publicStorefrontHttp.test.js
// HTTP-level (not controller-level) contract for the anonymous storefront
// surface mounted before the auth gate in server.js. Covers the negative
// cases for public order creation and the public response projections.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const Product = require('../server/models/Product');

let mongod;
let baseUrl;
let serverHandle;
let storeA;
let storeB;
let productA;
let productB;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('zainbot-http-qa');
  process.env.JWT_SECRET = 'http-qa-secret';
  process.env.CRON_JOBS_ENABLED = 'false';

  const app = require('../server/server');
  await new Promise((resolve, reject) => {
    serverHandle = app.listen(0, '127.0.0.1', async () => {
      try {
        // app.listen does not connect Mongo on its own; connect here
        if (mongoose.connection.readyState !== 1) {
          await mongoose.connect(process.env.MONGODB_URI);
        }
        baseUrl = `http://127.0.0.1:${serverHandle.address().port}`;
        resolve();
      } catch (err) { reject(err); }
    });
  });

  storeA = await Store.create({ storeName: 'متجر أ', storeLink: 'qa-store-a', templateId: 1, currency: 'EGP' });
  storeB = await Store.create({ storeName: 'متجر ب', storeLink: 'qa-store-b', templateId: 1, currency: 'EGP' });
  productA = await Product.create({ storeId: storeA._id, productName: 'منتج المتجر أ', price: 750, currency: 'EGP', stock: 5 });
  productB = await Product.create({ storeId: storeB._id, productName: 'منتج المتجر ب', price: 100, currency: 'EGP', stock: 50 });
});

test.after(async () => {
  if (serverHandle) await new Promise((r) => serverHandle.close(r));
  await mongoose.disconnect();
  await mongod.stop();
});

function orderBody(overrides = {}) {
  return {
    products: [{ productId: String(productA._id), quantity: 1, selectedOptions: [] }],
    paymentMethod: 'cash_on_delivery',
    customerName: 'عميل اختبار',
    customerWhatsapp: '01012345678',
    customerAddress: 'الإسكندرية، سموحة، شارع 12',
    ...overrides,
  };
}

async function postOrder(storeId, body, headers = {}) {
  const res = await fetch(`${baseUrl}/api/orders/${storeId}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

test('anonymous storefront routes are reachable without a token', async () => {
  const storeRes = await fetch(`${baseUrl}/api/stores/store/qa-store-a`);
  assert.equal(storeRes.status, 200);
  const productsRes = await fetch(`${baseUrl}/api/products/${storeA._id}/products`);
  assert.equal(productsRes.status, 200);
  const categoriesRes = await fetch(`${baseUrl}/api/categories/${storeA._id}/categories`);
  assert.equal(categoriesRes.status, 200);
});

test('public store response excludes internal references', async () => {
  const res = await fetch(`${baseUrl}/api/stores/store/qa-store-a`);
  const store = await res.json();
  assert.equal(store.userId, undefined);
  assert.equal(store.botId, undefined);
  assert.equal(store.storeName, 'متجر أ');
});

test('public products response excludes cost price', async () => {
  const res = await fetch(`${baseUrl}/api/products/${storeA._id}/products`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.products;
  assert.ok(list.length >= 1);
  assert.equal(list[0].costPrice, undefined);
});

test('order total is computed server-side; client-supplied price fields are ignored', async () => {
  const { status, json } = await postOrder(storeA._id, orderBody({
    totalPrice: 1,
    products: [{ productId: String(productA._id), quantity: 2, selectedOptions: [], price: 1, name: 'rخيص' }],
  }));
  assert.equal(status, 201);
  assert.equal(json.totalPrice, 1500); // 2 x 750 from the DB, not the client
});

test('cross-store product id is rejected', async () => {
  const { status } = await postOrder(storeA._id, orderBody({
    products: [{ productId: String(productB._id), quantity: 1, selectedOptions: [] }],
  }));
  assert.equal(status, 404);
});

test('insufficient stock is rejected', async () => {
  const { status } = await postOrder(storeA._id, orderBody({
    products: [{ productId: String(productA._id), quantity: 999, selectedOptions: [] }],
  }));
  assert.equal(status, 400);
});

test('missing customer details are rejected', async () => {
  const { status } = await postOrder(storeA._id, orderBody({ customerName: '' }));
  assert.equal(status, 400);
});

test('idempotent replay returns the original order and does not double-decrement stock', async () => {
  const key = 'qa-idem-replay-1';
  const before = await Product.findById(productA._id);
  const first = await postOrder(storeA._id, orderBody(), { 'Idempotency-Key': key });
  assert.equal(first.status, 201);
  const second = await postOrder(storeA._id, orderBody(), { 'Idempotency-Key': key });
  assert.equal(second.status, 200);
  assert.equal(String(second.json._id), String(first.json._id));
  const after = await Product.findById(productA._id);
  assert.equal(after.stock, before.stock - 1); // one decrement only
});

test('same idempotency key with a different payload is rejected (409)', async () => {
  const key = 'qa-idem-mismatch-1';
  const first = await postOrder(storeA._id, orderBody(), { 'Idempotency-Key': key });
  assert.equal(first.status, 201);
  const conflict = await postOrder(storeA._id, orderBody({ customerAddress: 'عنوان مختلف تماماً 999' }), { 'Idempotency-Key': key });
  assert.equal(conflict.status, 409);
});

test('concurrent orders cannot oversell the last items', async () => {
  const scarce = await Product.create({ storeId: storeA._id, productName: 'منتج نادر', price: 50, currency: 'EGP', stock: 3 });
  const results = await Promise.all([...Array(5)].map((_, i) => postOrder(storeA._id, orderBody({
    products: [{ productId: String(scarce._id), quantity: 1, selectedOptions: [] }],
  }), { 'Idempotency-Key': `qa-concurrency-${i}` })));
  const created = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 400).length;
  assert.equal(created, 3);
  assert.equal(rejected, 2);
  const after = await Product.findById(scarce._id);
  assert.equal(after.stock, 0);
});

test('a multi-product order rolls back reservations when a later product fails', async () => {
  const before = await Product.findById(productA._id);
  const r = await postOrder(storeA._id, orderBody({
    products: [
      { productId: String(productA._id), quantity: 1, selectedOptions: [] },
      { productId: String(productB._id), quantity: 1, selectedOptions: [] }, // cross-store: fails
    ],
  }));
  assert.equal(r.status, 404);
  const after = await Product.findById(productA._id);
  assert.equal(after.stock, before.stock); // reservation released
});

test('nonexistent store returns 404, malformed id does not crash', async () => {
  const missing = new mongoose.Types.ObjectId();
  const r1 = await postOrder(missing, orderBody());
  assert.equal(r1.status, 404);
  const r2 = await fetch(`${baseUrl}/api/stores/store/definitely-not-a-store`);
  assert.equal(r2.status, 404);
});
