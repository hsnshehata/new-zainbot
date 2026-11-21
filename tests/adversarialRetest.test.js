'use strict';

// tests/adversarialRetest.test.js
// Second-round adversarial probes for e07ba98: the restoration ledger
// across repeated confirm/cancel cycles, crash recovery of interrupted
// restores, epoch fencing, the replay contract, concurrent owner actions,
// and the REAL Telegram webhook call path (sendTelegramMessage stubbed
// before the controller module loads - no network).
// In-memory Mongo only; no external sends.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Stub the Telegram sender BEFORE telegramController destructures it.
const telegramService = require('../server/services/telegramService');
const sentMessages = [];
telegramService.sendTelegramMessage = async (chatId, text) => {
  sentMessages.push({ chatId, text });
  return { ok: true, stub: true };
};

const Store = require('../server/models/Store');
const Product = require('../server/models/Product');
const Order = require('../server/models/Order');
const Bot = require('../server/models/Bot');
const stockService = require('../server/services/stockService');
const { changeOrderStatus } = require('../server/services/orderStatusService');
const telegramController = require('../server/controllers/telegramController');

let mongod;
let store;
const ownerId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-retest-qa'));
  store = await Store.create({ storeName: 'متجر إعادة الاختبار', storeLink: 'qa-retest', templateId: 1, currency: 'EGP', userId: ownerId });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeProduct(stock) {
  return Product.create({ storeId: store._id, productName: `منتج ${Date.now()} ${Math.random()}`, price: 100, currency: 'EGP', stock });
}

async function makePendingWhatsappOrder(product, qty) {
  return Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: qty, price: 100 }],
    totalPrice: 100 * qty,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });
}

// N1. Repeated confirm/cancel cycles: every cancel must restore the stock
//     its own confirm decremented, not just the first one.
test('N1: every cancel in a confirm/cancel cycle restores stock, not only the first', async () => {
  const product = await makeProduct(10);
  const order = await makePendingWhatsappOrder(product, 2);

  for (let cycle = 1; cycle <= 2; cycle += 1) {
    const fresh = await Order.findById(order._id);
    const confirm = await changeOrderStatus({ order: fresh, targetStatus: 'confirmed', changedBy: ownerId });
    assert.equal(confirm.ok, true, `cycle ${cycle} confirm failed: ${confirm.message}`);
    assert.equal((await Product.findById(product._id)).stock, 8, `cycle ${cycle} after confirm`);

    const fresh2 = await Order.findById(order._id);
    const cancel = await changeOrderStatus({ order: fresh2, targetStatus: 'cancelled', changedBy: ownerId });
    assert.equal(cancel.ok, true, `cycle ${cycle} cancel failed: ${cancel.message}`);
    assert.equal(
      (await Product.findById(product._id)).stock,
      10,
      `cycle ${cycle} cancel leaked stock: second cancel's restore was swallowed by the stale restorations ledger entry`
    );
  }
});

// N2. Crash mid-restock: the sweep resumes and restores exactly once.
test('N2: interrupted restore is resumed by the sweep exactly once', async () => {
  const product = await makeProduct(6);
  const order = await makePendingWhatsappOrder(product, 2);
  let fresh = await Order.findById(order._id);
  await changeOrderStatus({ order: fresh, targetStatus: 'confirmed', changedBy: ownerId });
  assert.equal((await Product.findById(product._id)).stock, 4);

  // Simulate the crash: claim into 'restoring' happened, process died
  // before any restore line ran.
  await Order.updateOne(
    { _id: order._id },
    { $set: { stockStatus: 'restoring', status: 'cancelled', updatedAt: new Date(Date.now() - 60 * 60 * 1000) } }
  );
  const resumed = await stockService.reconcileInterruptedRestores();
  assert.equal(resumed >= 1, true);
  assert.equal((await Product.findById(product._id)).stock, 6);
  const after = await Order.findById(order._id);
  assert.equal(after.stockStatus, 'none');
  assert.equal(after.stockReleased, true);

  // Re-running is a no-op.
  await stockService.reconcileInterruptedRestores();
  assert.equal((await Product.findById(product._id)).stock, 6);
});

// N3. Epoch fencing at the service level: an old-generation writer cannot
//     complete a newer generation.
test('N3: completion CAS with a stale epoch cannot complete a newer generation', async () => {
  const product = await makeProduct(5);
  const order = await makePendingWhatsappOrder(product, 1);

  // Generation E1: claim, reserve, stall.
  const e1 = new mongoose.Types.ObjectId().toString();
  await Order.updateOne({ _id: order._id }, { $set: { stockStatus: 'pending', stockEpoch: e1 } });
  await stockService.reserveLine(product._id, store._id, order._id, 1);

  // The sweep claims the stale generation; a retry opens E2 and reserves.
  await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
  await stockService.reconcileStuckOrders();
  assert.equal((await Order.findById(order._id)).stockStatus, 'none');
  assert.equal((await Product.findById(product._id)).stock, 5);

  const e2 = new mongoose.Types.ObjectId().toString();
  await Order.updateOne({ _id: order._id }, { $set: { stockStatus: 'pending', stockEpoch: e2 } });
  await stockService.reserveLine(product._id, store._id, order._id, 1);

  // The stale E1 writer wakes: its CAS must lose even though stockStatus
  // is 'pending' again.
  const stale = await stockService.completeOrderReservation(order._id, { status: 'confirmed' }, null, e1);
  assert.equal(stale.ok, false, 'stale-epoch writer completed a newer generation');
  const fresh = await stockService.completeOrderReservation(order._id, { status: 'confirmed' }, null, e2);
  assert.equal(fresh.ok, true);
  assert.equal((await Product.findById(product._id)).stock, 4);
});

// N4. Replay contract: 503 while the winner is unsettled, 409 when the
//     keyed order is cancelled, 200 only when settled.
test('N4: replay answers 503 for unsettled and 409 for cancelled keyed orders', async () => {
  const orderController = require('../server/controllers/orderController');
  const crypto = require('crypto');
  const product = await makeProduct(5);
  const mkHash = (key) => crypto.createHash('sha256').update(JSON.stringify({
    storeId: String(store._id),
    products: [{ productId: String(product._id), quantity: 1, selectedOptions: [] }],
    paymentMethod: 'cash_on_delivery',
    customerName: 'زائر',
    customerWhatsapp: '01000000000',
    customerEmail: '',
    customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    customerNote: '',
  })).digest('hex');
  const mkReq = (key) => ({
    params: { storeId: String(store._id) },
    body: {
      products: [{ productId: String(product._id), quantity: 1 }],
      paymentMethod: 'cash_on_delivery',
      customerName: 'زائر',
      customerWhatsapp: '01000000000',
      customerAddress: 'عنوان تفصيلي طويل بما يكفي',
    },
    get(h) { return h.toLowerCase() === 'idempotency-key' ? key : undefined; },
    set() { return this; },
    user: null,
  });
  const mockRes = () => {
    const res = {
      statusCode: 200, body: null, headers: {},
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; return this; },
      set(k, v) { this.headers[k] = v; return this; },
    };
    return res;
  };

  // Unsettled winner -> 503 + Retry-After.
  const key1 = `n4-pending-${Date.now()}`;
  await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100, paymentMethod: 'cash_on_delivery', status: 'confirmed',
    stockStatus: 'pending', idempotencyKey: key1, payloadHash: mkHash(key1), history: [],
  });
  let res = mockRes();
  await orderController.createOrder(mkReq(key1), res);
  assert.equal(res.statusCode, 503, `unsettled replay returned ${res.statusCode}`);
  assert.equal(res.headers['Retry-After'], '3');

  // Cancelled keyed order (owner-cancelled COD order keeps its key) -> 409.
  const key2 = `n4-cancelled-${Date.now()}`;
  await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100, paymentMethod: 'cash_on_delivery', status: 'cancelled',
    stockStatus: 'none', stockReleased: true, idempotencyKey: key2, payloadHash: mkHash(key2), history: [],
  });
  res = mockRes();
  await orderController.createOrder(mkReq(key2), res);
  assert.equal(res.statusCode, 409, `cancelled replay returned ${res.statusCode}`);

  // Settled winner -> 200 replay.
  const key3 = `n4-settled-${Date.now()}`;
  await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 1, price: 100 }],
    totalPrice: 100, paymentMethod: 'cash_on_delivery', status: 'confirmed',
    stockStatus: 'completed', idempotencyKey: key3, payloadHash: mkHash(key3), history: [],
  });
  res = mockRes();
  await orderController.createOrder(mkReq(key3), res);
  assert.equal(res.statusCode, 200, `settled replay returned ${res.statusCode}`);
});

// N5. The REAL Telegram webhook path: owner confirms and then cancels a
//     pending whatsapp_confirmation order through handleWebhook; stock must
//     decrement once on confirm and restore once on cancel.
test('N5: telegram webhook confirm/cancel drives the stock protocol end to end', async () => {
  const product = await makeProduct(7);
  const order = await makePendingWhatsappOrder(product, 2);
  const chatId = 555000111;
  await Bot.create({
    name: 'بوت المتجر',
    userId: ownerId,
    storeId: store._id,
    telegramUserId: String(chatId),
  });

  const mockRes = () => {
    const res = {
      statusCode: 200, body: null,
      status(c) { this.statusCode = c; return this; },
      json(p) { this.body = p; return this; },
    };
    return res;
  };
  const send = async (text) => {
    const res = mockRes();
    await telegramController.handleWebhook({ body: { message: { chat: { id: chatId }, from: { id: chatId }, text } } }, res);
    assert.equal(res.statusCode, 200);
  };

  sentMessages.length = 0;
  await send('✏️ تعديل حالة طلب'); // lists orders, enters selection state
  await send('1'); // pick the only order
  await send('مؤكد'); // confirm

  let after = await Order.findById(order._id);
  assert.equal(after.status, 'confirmed');
  assert.equal(after.stockStatus, 'completed', 'telegram confirm did not engage the reservation protocol');
  assert.equal((await Product.findById(product._id)).stock, 5, 'telegram confirm must reserve exactly once');

  await send('✏️ تعديل حالة طلب');
  await send('1');
  await send('ملغي'); // cancel

  after = await Order.findById(order._id);
  assert.equal(after.status, 'cancelled');
  assert.equal(
    (await Product.findById(product._id)).stock,
    7,
    'telegram cancel must restore stock through the ledger'
  );
});

// N6. Concurrent duplicate confirms through the service: one decrement.
test('N6: two concurrent confirms decrement once and both succeed', async () => {
  const product = await makeProduct(3);
  const order = await makePendingWhatsappOrder(product, 1);
  const [r1, r2] = await Promise.all([
    Order.findById(order._id).then((o) => changeOrderStatus({ order: o, targetStatus: 'confirmed', changedBy: ownerId })),
    Order.findById(order._id).then((o) => changeOrderStatus({ order: o, targetStatus: 'confirmed', changedBy: ownerId })),
  ]);
  assert.equal(r1.ok && r2.ok, true, `r1=${r1.message || 'ok'} r2=${r2.message || 'ok'}`);
  assert.equal((await Product.findById(product._id)).stock, 2);
  const tokens = (await Product.findById(product._id)).reservations.filter((x) => String(x.orderId) === String(order._id));
  assert.equal(tokens.length, 1);
});

// N7. Concurrent cancels of a completed order: exactly one restore.
test('N7: two concurrent cancels restore stock exactly once', async () => {
  const product = await makeProduct(4);
  const order = await makePendingWhatsappOrder(product, 2);
  const fresh = await Order.findById(order._id);
  await changeOrderStatus({ order: fresh, targetStatus: 'confirmed', changedBy: ownerId });
  assert.equal((await Product.findById(product._id)).stock, 2);

  const [r1, r2] = await Promise.all([
    Order.findById(order._id).then((o) => changeOrderStatus({ order: o, targetStatus: 'cancelled', changedBy: ownerId })),
    Order.findById(order._id).then((o) => changeOrderStatus({ order: o, targetStatus: 'cancelled', changedBy: ownerId })),
  ]);
  const oks = [r1.ok, r2.ok].filter(Boolean).length;
  assert.equal(oks >= 1, true);
  assert.equal(
    (await Product.findById(product._id)).stock,
    4,
    'concurrent cancels double-restored or lost the restore'
  );
});
