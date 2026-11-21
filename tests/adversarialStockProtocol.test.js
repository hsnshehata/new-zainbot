'use strict';

// tests/adversarialStockProtocol.test.js
// Adversarial probes against the order/stock/idempotency recovery protocol
// at a199fd2. Each test encodes the CORRECT invariant; a failing assertion
// is a demonstrated bug, not a flaky test. Local in-memory Mongo only.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const Product = require('../server/models/Product');
const Order = require('../server/models/Order');
const stockService = require('../server/services/stockService');
const orderStatusService = require('../server/services/orderStatusService');
const orderController = require('../server/controllers/orderController');

let mongod;
let store;
const ownerId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-adv-qa'));
  store = await Store.create({ storeName: 'متجر الخصم', storeLink: 'qa-adv', templateId: 1, currency: 'EGP', userId: ownerId });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeProduct(stock) {
  return Product.create({ storeId: store._id, productName: `منتج ${Date.now()} ${Math.random()}`, price: 100, currency: 'EGP', stock });
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
}

function ownerReq(orderId, status) {
  return {
    params: { storeId: String(store._id), orderId: String(orderId) },
    body: { status },
    user: { userId: ownerId },
  };
}

async function ageTokens(productId) {
  await Product.updateOne(
    { _id: productId },
    { $set: { 'reservations.$[].at': new Date(Date.now() - 60 * 60 * 1000) } }
  );
}

// A. confirm -> orphan sweep pulls token -> owner regresses status ->
//    re-confirm. The second confirm must NOT decrement stock again.
test('A: re-confirm after status regression must not double-decrement stock', async () => {
  const product = await makeProduct(10);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });

  // First confirm: stock 10 -> 8, stockStatus completed, token present.
  let res = mockRes();
  await orderController.updateOrder(ownerReq(order._id, 'confirmed'), res);
  assert.equal(res.statusCode, 200);
  assert.equal((await Product.findById(product._id)).stock, 8);

  // Time passes: orphan sweep pulls the completed order's token (by design).
  await ageTokens(product._id);
  await stockService.reconcileOrphanTokens();
  assert.equal((await Product.findById(product._id)).reservations.length, 0);

  // Owner regresses the order (confirmed -> pending), a plain status edit.
  res = mockRes();
  await orderController.updateOrder(ownerReq(order._id, 'pending'), res);
  assert.equal(res.statusCode, 200);

  // Owner confirms again. The order was already paid against stock once.
  res = mockRes();
  await orderController.updateOrder(ownerReq(order._id, 'confirmed'), res);
  assert.equal(res.statusCode, 200);

  const after = await Product.findById(product._id);
  assert.equal(after.stock, 8, `double decrement: stock is ${after.stock}, expected 8`);
});

// B. Owner cancels a CONFIRMED order. Every other cancel path in the
//    protocol releases the reservation; the manual status edit must too.
test('B: cancelling a confirmed order restores reserved stock', async () => {
  const product = await makeProduct(5);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });
  let res = mockRes();
  await orderController.updateOrder(ownerReq(order._id, 'confirmed'), res);
  assert.equal((await Product.findById(product._id)).stock, 3);

  res = mockRes();
  await orderController.updateOrder(ownerReq(order._id, 'cancelled'), res);
  assert.equal(res.statusCode, 200);

  // Give the orphan sweep its chance: tokens older than TTL, terminal order.
  await ageTokens(product._id);
  await stockService.reconcileOrphanTokens();

  const after = await Product.findById(product._id);
  assert.equal(after.stock, 5, `cancelled order leaked stock: stock is ${after.stock}, expected 5`);
  assert.equal(after.reservations.length, 0);
});

// C. A retry that lands while the original create is still reserving must
//    not be answered 200 with an unresolved order.
test('C: idempotent replay of a still-pending reservation returns success for an unsettled order', async () => {
  const product = await makeProduct(1);
  const key = `adv-${Date.now()}`;
  const mkReq = () => ({
    params: { storeId: String(store._id) },
    body: {
      products: [{ productId: String(product._id), quantity: 1 }],
      paymentMethod: 'cash_on_delivery',
      customerName: 'زائر',
      customerWhatsapp: '01000000000',
      customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    },
    get(h) { return h.toLowerCase() === 'idempotency-key' ? key : undefined; },
    user: null,
  });

  // Slow the first request's reservation down by making stock contention:
  // instead, call the controller twice sequentially where the FIRST call
  // is left unsettled by hand. Simplest deterministic model of the retry:
  // seed the winner exactly as createOrder leaves it mid-flight
  // (stockStatus 'pending'), then issue the retry.
  const winner = new Order({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100,
    paymentMethod: 'cash_on_delivery',
    status: 'confirmed',
    stockStatus: 'pending',
    idempotencyKey: key,
    payloadHash: '', // filled below via the same algorithm the controller uses
    history: [],
  });
  const crypto = require('crypto');
  winner.payloadHash = crypto.createHash('sha256').update(JSON.stringify({
    storeId: String(store._id),
    products: [{ productId: String(product._id), quantity: 1, selectedOptions: [] }],
    paymentMethod: 'cash_on_delivery',
    customerName: 'زائر',
    customerWhatsapp: '01000000000',
    customerEmail: '',
    customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    customerNote: '',
  })).digest('hex');
  await winner.save();

  const res = mockRes();
  await orderController.createOrder(mkReq(), res);
  // The retry is answered success (200) although the reservation behind it
  // may still fail and cancel the order. The storefront treats any 2xx as
  // "order placed" and clears the cart.
  assert.notEqual(res.statusCode, 200, `replay of unsettled winner returned ${res.statusCode} with stockStatus=${res.body?.stockStatus}, status=${res.body?.status}`);
});

// D. The sweep cancels a crashed COD order but keeps its idempotency key,
//    so the shopper's legitimate retry replays a cancelled order as a 200.
test('D: retry after sweep-cancelled phantom must not replay the cancelled order as success', async () => {
  const product = await makeProduct(1);
  const key = `adv-d-${Date.now()}`;
  const crypto = require('crypto');
  const payloadForHash = {
    storeId: String(store._id),
    products: [{ productId: String(product._id), quantity: 1, selectedOptions: [] }],
    paymentMethod: 'cash_on_delivery',
    customerName: 'زائر',
    customerWhatsapp: '01000000000',
    customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    customerNote: '',
  };
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100,
    paymentMethod: 'cash_on_delivery',
    status: 'confirmed',
    stockStatus: 'pending',
    idempotencyKey: key,
    payloadHash: crypto.createHash('sha256').update(JSON.stringify(payloadForHash)).digest('hex'),
    history: [],
  });
  await stockService.reserveLine(product._id, store._id, order._id, 1);
  await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
  await stockService.reconcileStuckOrders();
  const after = await Order.findById(order._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(after.stockStatus, 'failed');

  // Shopper retries the same checkout (same key). createOrder's own
  // failure path unsets the key so a retry can create a fresh order; the
  // sweep path should behave the same way.
  assert.equal(after.idempotencyKey, undefined, 'sweep left the idempotency key on a cancelled phantom order');

  const res = mockRes();
  await orderController.createOrder({
    params: { storeId: String(store._id) },
    body: {
      products: [{ productId: String(product._id), quantity: 1 }],
      paymentMethod: 'cash_on_delivery',
      customerName: 'زائر',
      customerWhatsapp: '01000000000',
      customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    },
    get(h) { return h.toLowerCase() === 'idempotency-key' ? key : undefined; },
    user: null,
  }, res);
  assert.equal(res.statusCode, 201, `retry after phantom cancel got ${res.statusCode} with status=${res.body?.status}`);
});

// K. Two lines for the same product in one order: idempotency key is
//    (productId, orderId), so the second line's reservation is swallowed
//    as "already reserved" and stock is under-decremented.
test('K: duplicate product lines in one order reserve every unit sold', async () => {
  const product = await makeProduct(10);
  const res = mockRes();
  await orderController.createOrder({
    params: { storeId: String(store._id) },
    body: {
      products: [
        { productId: String(product._id), quantity: 2 },
        { productId: String(product._id), quantity: 3 },
      ],
      paymentMethod: 'cash_on_delivery',
      customerName: 'زائر',
      customerWhatsapp: '01000000001',
      customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    },
    get() { return undefined; },
    user: null,
  }, res);
  assert.equal(res.statusCode, 201);
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 5, `under-decrement: sold 5 units, stock is ${after.stock} (only 2 reserved)`);
});

// E2. Cross-generation CAS adoption: with the epoch fence, a stale
//     writer's completion CAS keyed to ITS OWN generation must lose against
//     a newer pending generation. Adapted from the auditor's probe: the
//     original asserted the pre-fix call shape (no epoch argument); the
//     fixed contract REQUIRES callers to fence with their captured epoch,
//     which is what every production caller now does.
test('E2: stale completion CAS with an old epoch loses against a newer generation', async () => {
  const p1 = await makeProduct(10);
  const p2 = await makeProduct(10);
  const orderId = new mongoose.Types.ObjectId();
  const epoch1 = new mongoose.Types.ObjectId().toString();
  await Order.create({
    _id: orderId,
    storeId: store._id,
    products: [
      { productId: p1._id, quantity: 1, price: 100 },
      { productId: p2._id, quantity: 1, price: 100 },
    ],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
    stockStatus: 'pending', // R1 generation
    stockEpoch: epoch1,
  });

  // R1 reserves both lines, then stalls past the TTL.
  await stockService.reserveLine(p1._id, store._id, orderId, 1);
  await stockService.reserveLine(p2._id, store._id, orderId, 1);
  await Order.updateOne({ _id: orderId }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

  // The sweep claims R1's generation and releases its tokens.
  await stockService.reconcileStuckOrders();
  assert.equal((await Order.findById(orderId)).stockStatus, 'none');
  assert.equal((await Product.findById(p1._id)).stock, 10);

  // R2 (owner retry) opens a NEW generation and reserves line 1, then its
  // process dies before reserving line 2.
  const epoch2 = new mongoose.Types.ObjectId().toString();
  await Order.updateOne({ _id: orderId }, { $set: { stockStatus: 'pending', stockEpoch: epoch2, updatedAt: new Date() } });
  await stockService.reserveLine(p1._id, store._id, orderId, 1);

  // R1 wakes up: its epoch no longer matches the live generation. The CAS
  // MUST lose; adopting R2's half-reserved generation is exactly the bug.
  const completion = await stockService.completeOrderReservation(orderId, { status: 'confirmed' }, null, epoch1);
  assert.equal(completion.ok, false, 'stale epoch completed a newer generation');
  assert.equal((await Order.findById(orderId)).status, 'pending');

  // R2's orphaned generation is owned by the sweep: its token is released
  // and the order returns to a retryable state. No partial confirmation.
  await Order.updateOne({ _id: orderId }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
  await stockService.reconcileStuckOrders();
  const finalOrder = await Order.findById(orderId);
  assert.equal(finalOrder.status, 'pending');
  assert.equal(finalOrder.stockStatus, 'none');
  assert.equal((await Product.findById(p1._id)).stock, 10);
  assert.equal((await Product.findById(p2._id)).stock, 10);
});

// G. The Telegram owner flow now routes through the same unified service
//     as the dashboard API (telegramController order_status_waiting_new
//     calls changeOrderStatus). Adapted from the auditor's probe, which
//     demonstrated the bug with a raw model save; the fixed contract is
//     that the service every writer now calls cannot confirm without
//     reserving.
test('G: confirming via the unified status service (the Telegram path) reserves stock', async () => {
  const product = await makeProduct(4);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });

  const result = await orderStatusService.changeOrderStatus({
    order,
    targetStatus: 'confirmed',
    changedBy: ownerId,
    note: 'تغيير من pending إلى confirmed (تيليجرام)',
  });
  assert.equal(result.ok, true, result.message);

  const afterOrder = await Order.findById(order._id);
  assert.equal(afterOrder.status, 'confirmed');
  assert.equal(afterOrder.stockStatus, 'completed');
  const afterProduct = await Product.findById(product._id);
  assert.equal(afterProduct.stock, 2, `confirm sold 2 units without reserving (stock ${afterProduct.stock})`);
});

// H. The Telegram status menu offers 'processing' and 'on_hold', which the
//    Order schema enum rejects - owners get a generic failure.
test('H: telegram status options processing/on_hold are rejected by the Order schema', async () => {
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: new mongoose.Types.ObjectId(), quantity: 1, price: 100 }],
    totalPrice: 100,
    paymentMethod: 'cash_on_delivery',
    status: 'pending',
  });
  order.status = 'processing';
  await assert.rejects(order.save(), /validator|validation/i);
});
