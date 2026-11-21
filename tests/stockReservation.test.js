'use strict';

// tests/stockReservation.test.js
// Failure/retry evidence for the stock reservation protocol and the
// notification retry sweep: idempotent reserve/release, crash
// reconciliation of stuck orders and orphan tokens, concurrent confirms,
// and claim-fenced notification retries. Service/controller level with an
// in-memory Mongo; HTTP contract stays in publicStorefrontHttp.test.js.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const Product = require('../server/models/Product');
const Order = require('../server/models/Order');
const Notification = require('../server/models/Notification');
const stockService = require('../server/services/stockService');
const orderOps = require('../server/services/orderOps');
const orderController = require('../server/controllers/orderController');

let mongod;
let store;
const ownerId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-stock-qa'));
  store = await Store.create({ storeName: 'متجر الحجز', storeLink: 'qa-reserve', templateId: 1, currency: 'EGP', userId: ownerId });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeProduct(stock) {
  return Product.create({ storeId: store._id, productName: `منتج ${Date.now()} ${Math.random()}`, price: 100, currency: 'EGP', stock });
}

test('reserveLine is idempotent per order: two calls, one decrement, one token', async () => {
  const product = await makeProduct(10);
  const orderId = new mongoose.Types.ObjectId();
  const first = await stockService.reserveLine(product._id, store._id, orderId, 3);
  const second = await stockService.reserveLine(product._id, store._id, orderId, 3);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.already, true);
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 7);
  assert.equal(after.reservations.filter((r) => String(r.orderId) === String(orderId)).length, 1);
});

test('releaseLineForOrder is idempotent: stock restored exactly once', async () => {
  const product = await makeProduct(10);
  const orderId = new mongoose.Types.ObjectId();
  await stockService.reserveLine(product._id, store._id, orderId, 4);
  await stockService.releaseLineForOrder(product._id, orderId);
  await stockService.releaseLineForOrder(product._id, orderId);
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 10);
  assert.equal(after.reservations.length, 0);
});

test('crash during COD create: stuck confirmed order is cancelled and stock restored exactly once', async () => {
  const product = await makeProduct(5);
  const orderId = new mongoose.Types.ObjectId();
  await stockService.reserveLine(product._id, store._id, orderId, 2);
  // Simulate the crash: order persisted with durable intent, then the
  // process died before completing. Backdate updatedAt past the TTL.
  await Order.create({
    _id: orderId,
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'cash_on_delivery',
    status: 'confirmed',
    stockStatus: 'pending',
  });
  await Order.updateOne({ _id: orderId }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

  const reconciled = await stockService.reconcileStuckOrders();
  assert.equal(reconciled >= 1, true);
  const order = await Order.findById(orderId);
  assert.equal(order.status, 'cancelled');
  assert.equal(order.stockStatus, 'failed');
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 5);
  assert.equal(after.reservations.length, 0);

  // Second sweep changes nothing (idempotent recovery).
  await stockService.reconcileStuckOrders();
  const again = await Product.findById(product._id);
  assert.equal(again.stock, 5);
});

test('crash during owner confirm: order returns to pre-confirm state, not cancelled', async () => {
  const product = await makeProduct(5);
  const orderId = new mongoose.Types.ObjectId();
  await stockService.reserveLine(product._id, store._id, orderId, 2);
  await Order.create({
    _id: orderId,
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
    stockStatus: 'pending',
  });
  await Order.updateOne({ _id: orderId }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

  await stockService.reconcileStuckOrders();
  const order = await Order.findById(orderId);
  assert.equal(order.status, 'pending'); // never silently cancelled
  assert.equal(order.stockStatus, 'none');
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 5);
});

test('orphan tokens: completed order pulls token (stock kept), missing order releases (stock restored)', async () => {
  const product = await makeProduct(10);
  const completedOrderId = new mongoose.Types.ObjectId();
  const ghostOrderId = new mongoose.Types.ObjectId();
  await stockService.reserveLine(product._id, store._id, completedOrderId, 2);
  await stockService.reserveLine(product._id, store._id, ghostOrderId, 3);
  await Order.create({
    _id: completedOrderId,
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'cash_on_delivery',
    status: 'confirmed',
    stockStatus: 'completed',
  });
  // Age the tokens past the TTL so the sweep considers them stale.
  await Product.updateOne(
    { _id: product._id },
    { $set: { 'reservations.$[].at': new Date(Date.now() - 60 * 60 * 1000) } }
  );

  await stockService.reconcileOrphanTokens();
  const after = await Product.findById(product._id);
  assert.equal(after.reservations.length, 0);
  assert.equal(after.stock, 8); // 10 - 2 (completed, kept) - 0 (ghost released: 3 restored)

  // Legacy safety: a product with no tokens and an order without
  // stockStatus are never touched by either sweep.
  const legacy = await makeProduct(4);
  await stockService.reconcileStuckOrders();
  await stockService.reconcileOrphanTokens();
  assert.equal((await Product.findById(legacy._id)).stock, 4);
});

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

test('concurrent confirms of the same pending order decrement stock once', async () => {
  const product = await makeProduct(1);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });
  const mkReq = () => ({
    params: { storeId: String(store._id), orderId: String(order._id) },
    body: { status: 'confirmed' },
    user: { userId: ownerId },
  });
  const resA = mockRes();
  const resB = mockRes();
  await Promise.all([
    orderController.updateOrder(mkReq(), resA),
    orderController.updateOrder(mkReq(), resB),
  ]);
  const codes = [resA.statusCode, resB.statusCode].sort();
  assert.deepEqual(codes, [200, 200]); // same-order reservation is idempotent; both see success
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 0); // single decrement
  assert.equal(after.reservations.length, 1); // token retained for the idempotency window
  const updated = await Order.findById(order._id);
  assert.equal(updated.status, 'confirmed');
  assert.equal(updated.stockStatus, 'completed');

  // Bounded cleanup: once stale, the orphan sweep pulls the completed
  // order's token without touching stock.
  await Product.updateOne({ _id: product._id }, { $set: { 'reservations.$[].at': new Date(Date.now() - 60 * 60 * 1000) } });
  await stockService.reconcileOrphanTokens();
  const cleaned = await Product.findById(product._id);
  assert.equal(cleaned.reservations.length, 0);
  assert.equal(cleaned.stock, 0);
});

test('confirm with insufficient stock: 409, order stays pending, no decrement', async () => {
  const product = await makeProduct(0);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });
  const res = mockRes();
  await orderController.updateOrder(
    { params: { storeId: String(store._id), orderId: String(order._id) }, body: { status: 'confirmed' }, user: { userId: ownerId } },
    res
  );
  assert.equal(res.statusCode, 409);
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 0);
  assert.equal(after.reservations.length, 0);
  const updated = await Order.findById(order._id);
  assert.equal(updated.status, 'pending');
  assert.equal(updated.stockStatus, 'none');
});

test('notification retry: claim fencing, dedup of in-app doc, recovery clears flags', async () => {
  const product = await makeProduct(1);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100,
    paymentMethod: 'cash_on_delivery',
    status: 'confirmed',
    stockStatus: 'completed',
    opsFlags: { notificationPending: true, notificationError: 'simulated send failure' },
  });

  // First attempt: external sender still failing -> claimed, attempts=1,
  // still pending, and the claim blocks an immediate second attempt.
  const failing = { notifyNewOrder: async () => { throw new Error('provider down'); } };
  const first = await orderOps.retryPendingNotifications({ deps: failing });
  assert.equal(first.failed >= 1, true);
  let current = await Order.findById(order._id);
  assert.equal(current.opsFlags.notificationPending, true);
  assert.equal(current.opsFlags.notificationAttempts, 1);
  const second = await orderOps.retryPendingNotifications({ deps: failing });
  assert.equal(second.failed, 0); // active claim fences the second sweep
  current = await Order.findById(order._id);
  assert.equal(current.opsFlags.notificationAttempts, 1);

  // Provider recovers: stale claim is re-claimable, send succeeds once,
  // in-app notification created exactly once, flags cleared.
  let externalCalls = 0;
  const recovering = { notifyNewOrder: async () => { externalCalls += 1; } };
  const recovered = await orderOps.retryPendingNotifications({
    now: new Date(Date.now() + orderOps.CLAIM_STALE_MS + 1000),
    deps: recovering,
  });
  assert.equal(recovered.recovered >= 1, true);
  assert.equal(externalCalls, 1);
  current = await Order.findById(order._id);
  assert.ok(!current.opsFlags.notificationPending); // cleared (mongoose hydrates the default)
  assert.equal(current.opsFlags.notificationCreated, true);
  assert.ok(current.opsFlags.notificationRecoveredAt);
  const inAppCount = await Notification.countDocuments({ user: ownerId, message: new RegExp(String(order._id)) });
  assert.equal(inAppCount, 1);

  // And a later sweep is a no-op for this order.
  const again = await orderOps.retryPendingNotifications({ deps: recovering });
  assert.equal(again.recovered, 0);
  assert.equal(externalCalls, 1);
});
