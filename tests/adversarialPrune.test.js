'use strict';

// tests/adversarialPrune.test.js
// Fourth-round probes: the restoration-ledger prune. Retention is the
// fence against stale restock writers; any age-based prune removes that
// fence without a hard writer-lifetime guarantee behind it. The automatic
// prune was REMOVED (review cycle 4); these probes now pin retention
// semantics. In-memory Mongo only.

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
const { changeOrderStatus } = require('../server/services/orderStatusService');

let mongod;
let store;
const ownerId = new mongoose.Types.ObjectId();

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-prune-qa'));
  store = await Store.create({ storeName: 'متجر التقليم', storeLink: 'qa-prune', templateId: 1, currency: 'EGP', userId: ownerId });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function makeProduct(stock) {
  return Product.create({ storeId: store._id, productName: `منتج ${Date.now()} ${Math.random()}`, price: 100, currency: 'EGP', stock });
}

const DAY = 24 * 60 * 60 * 1000;

// P1. ADAPTED (retention, review cycle 4): with no age-based prune, the
//     sweep retains BOTH ancient and young entries - age alone never
//     deletes correctness evidence.
test('P1: sweep retains restoration entries regardless of age (no prune)', async () => {
  const product = await makeProduct(10);
  const oid = new mongoose.Types.ObjectId();
  await Product.updateOne(
    { _id: product._id },
    { $push: { restorations: {
      orderId: oid, epoch: 'e-old', qty: 1, at: new Date(Date.now() - 8 * DAY),
    } } }
  );
  await Product.updateOne(
    { _id: product._id },
    { $push: { restorations: {
      orderId: oid, epoch: 'e-young', qty: 1, at: new Date(Date.now() - 1 * DAY),
    } } }
  );
  await stockService.reconcileOrphanTokens();
  const after = await Product.findById(product._id);
  assert.equal(after.restorations.length, 2, 'no entry is pruned by age');
});

// P2. An order STILL in 'restoring' whose sweep retries keep timing out:
//     the prune deletes the very entries the retry relies on for
//     idempotency, and the next sweep pass re-restores those lines.
test('P2: prune must not delete ledger entries of an order still restoring', async () => {
  const product = await makeProduct(10);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'cancelled',
    stockStatus: 'restoring',
    stockEpoch: 'e1',
  });
  // The line was already restored once (stock reflects it: the 2 units
  // are part of the 10), and its ledger entry is 8 days old - e.g. an
  // order stuck in 'restoring' for over a week on a persistent per-line
  // failure of a different line, with the sweep retrying every 10 min.
  await Product.updateOne(
    { _id: product._id },
    { $push: { restorations: { orderId: order._id, epoch: 'e1', qty: 2, at: new Date(Date.now() - 8 * DAY) } } }
  );
  await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

  await stockService.reconcileOrphanTokens(); // must NOT prune (no age-based prune)
  await stockService.reconcileInterruptedRestores(); // sweep retry

  const after = await Product.findById(product._id);
  assert.equal(
    after.stock,
    10,
    `prune deleted the in-flight generation's fence; sweep retry re-restored: stock=${after.stock}, expected 10`
  );
});

// P3. The fence must survive arbitrary writer pauses: a restock writer
//     that resumes after a long suspension (beyond any former horizon)
//     no-ops against its retained entry instead of re-restoring.
test('P3: writer resuming after a long pause no-ops against its retained entry', async () => {
  const product = await makeProduct(8);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'whatsapp_confirmation',
    status: 'cancelled',
    stockStatus: 'restoring',
    stockEpoch: 'e1',
  });
  // Line restored 8 days ago; entry MUST be retained (no age prune).
  await Product.updateOne(
    { _id: product._id },
    { $push: { restorations: { orderId: order._id, epoch: 'e1', qty: 2, at: new Date(Date.now() - 8 * DAY) } } }
  );
  await stockService.reconcileOrphanTokens();
  assert.equal((await Product.findById(product._id)).restorations.length, 1, 'entry retained past any horizon');

  // The suspended writer resumes and retries its line.
  await stockService.restoreLineForOrder(product._id, order._id, 2, 'e1');
  const after = await Product.findById(product._id);
  assert.equal(after.stock, 8, `replay after long pause inflated stock: ${after.stock}, expected 8`);
});
