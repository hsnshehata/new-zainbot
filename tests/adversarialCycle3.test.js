'use strict';

// tests/adversarialCycle3.test.js
// Third-round probes for 9e047a1: generation-scoped restorations across
// repeated cycles, fail-closed transient restore errors with sweep retry,
// failed-COD confirm running the protocol, crash between restore and
// finish, and ledger cleanup on completing generations.
// In-memory Mongo only; no external sends.

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
  await mongoose.connect(mongod.getUri('zainbot-cycle3-qa'));
  store = await Store.create({ storeName: 'متجر الدورات', storeLink: 'qa-cycle3', templateId: 1, currency: 'EGP', userId: ownerId });
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

async function transition(orderId, targetStatus) {
  const order = await Order.findById(orderId);
  return changeOrderStatus({ order, targetStatus, changedBy: ownerId });
}

// R1. Three full confirm/cancel cycles: every cancel restores its own
//     generation; completing a generation cleans the ledger and resets
//     stockReleased.
test('R1: three confirm/cancel cycles restore every generation, ledger retained per generation', async () => {
  const product = await makeProduct(10);
  const order = await makePendingWhatsappOrder(product, 2);

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const confirm = await transition(order._id, 'confirmed');
    assert.equal(confirm.ok, true, `cycle ${cycle} confirm: ${confirm.message}`);
    assert.equal((await Product.findById(product._id)).stock, 8, `cycle ${cycle} confirm stock`);

    const afterConfirm = await Order.findById(order._id);
    assert.equal(afterConfirm.stockReleased, false, `cycle ${cycle}: stockReleased must reset when the new reservation completes`);
    // ADAPTED (retention-is-the-fence): completing a generation must NOT
    // pull older restoration entries - they are the only fence against a
    // stale restock writer resuming after a newer completion (probe R8).
    // Epochs are unique per generation, so retention never blocks a future
    // cycle. Retention is indefinite (no hard writer-lifetime bound, so
    // no age-based prune; growth risk tracked in stockService.js).
    assert.equal(
      (await Product.findById(product._id)).restorations.length,
      cycle - 1,
      `cycle ${cycle}: each completed cycle retains exactly its older generation ledgers`
    );

    const cancel = await transition(order._id, 'cancelled');
    assert.equal(cancel.ok, true, `cycle ${cycle} cancel: ${cancel.message}`);
    assert.equal((await Product.findById(product._id)).stock, 10, `cycle ${cycle} cancel stock`);
  }
});

// R2. A transient per-line DB error during restock: the caller gets a
//     failure, the order stays 'restoring', and the sweep completes the
//     restore exactly once.
test('R2: transient restore error is fail-closed and the sweep finishes the job once', async () => {
  const product = await makeProduct(6);
  const order = await makePendingWhatsappOrder(product, 2);
  assert.equal((await transition(order._id, 'confirmed')).ok, true);
  assert.equal((await Product.findById(product._id)).stock, 4);

  // Inject a one-shot failure into the restore write path only.
  const originalUpdateOne = Product.updateOne;
  let injected = false;
  Product.updateOne = function patched(filter, ...args) {
    if (!injected && filter && filter.restorations) {
      injected = true;
      throw new Error('injected transient db error');
    }
    return originalUpdateOne.apply(this, [filter, ...args]);
  };
  let cancel;
  try {
    cancel = await transition(order._id, 'cancelled');
  } finally {
    Product.updateOne = originalUpdateOne;
  }
  assert.equal(injected, true, 'injection never fired');
  assert.equal(cancel.ok, false, 'half-restored cancel must not report success');
  assert.equal(cancel.httpStatus, 500);
  let current = await Order.findById(order._id);
  assert.equal(current.stockStatus, 'restoring', 'order must stay restoring for the sweep');
  assert.equal((await Product.findById(product._id)).stock, 4, 'no line should have restored yet');

  // The sweep (even immediately, via aged claim) completes it exactly once.
  await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
  await stockService.reconcileInterruptedRestores();
  assert.equal((await Product.findById(product._id)).stock, 6);
  current = await Order.findById(order._id);
  assert.equal(current.stockStatus, 'none');
  assert.equal(current.stockReleased, true);
  assert.equal(current.status, 'cancelled');

  // A second sweep pass changes nothing.
  await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
  await stockService.reconcileInterruptedRestores();
  assert.equal((await Product.findById(product._id)).stock, 6);
});

// R3. A modern COD order whose reservation FAILED (stockStatus 'failed')
//     is not legacy: confirming it must run the reservation protocol.
test('R3: confirm of a failed-reservation COD order reserves through the protocol', async () => {
  const product = await makeProduct(5);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'cash_on_delivery',
    status: 'cancelled',
    stockStatus: 'failed',
    history: [],
  });

  const result = await transition(order._id, 'confirmed');
  assert.equal(result.ok, true, `confirm failed: ${result.message}`);
  const after = await Order.findById(order._id);
  assert.equal(after.status, 'confirmed');
  assert.equal(after.stockStatus, 'completed', 'failed-COD confirm must run the reservation protocol');
  assert.equal((await Product.findById(product._id)).stock, 3, 'stock must be reserved exactly once');
});

// R4. Legacy COD order (no protocol state, never released) keeps the
//     plain transition: no silent re-decrement of historical stock.
test('R4: legacy COD confirm stays a plain transition (no reservation)', async () => {
  const product = await makeProduct(5);
  const order = await Order.create({
    storeId: store._id,
    products: [{ productId: product._id, quantity: 2, price: 100 }],
    totalPrice: 200,
    paymentMethod: 'cash_on_delivery',
    status: 'pending',
    stockStatus: 'none',
    history: [],
  });
  const result = await transition(order._id, 'confirmed');
  assert.equal(result.ok, true);
  assert.equal((await Order.findById(order._id)).stockStatus, 'none');
  assert.equal((await Product.findById(product._id)).stock, 5);
});

// R5. Crash AFTER all restore lines applied but BEFORE the finish write:
//     the sweep resume must not double-restore.
test('R5: crash between restore and finish resumes without double-restore', async () => {
  const product = await makeProduct(6);
  const order = await makePendingWhatsappOrder(product, 3);
  assert.equal((await transition(order._id, 'confirmed')).ok, true);
  assert.equal((await Product.findById(product._id)).stock, 3);

  // Simulate: claim happened, restore lines all applied, process died
  // before pullOrderTokens/finish. Restorations entry exists, stock done.
  const withEpoch = await Order.findById(order._id);
  await stockService.restoreOrderStock(withEpoch); // the lines the crashed request completed
  assert.equal((await Product.findById(product._id)).stock, 6);
  await Order.updateOne(
    { _id: order._id },
    { $set: { stockStatus: 'restoring', status: 'cancelled', updatedAt: new Date(Date.now() - 60 * 60 * 1000) } }
  );

  await stockService.reconcileInterruptedRestores();
  assert.equal((await Product.findById(product._id)).stock, 6, 'sweep resume double-restored');
  const after = await Order.findById(order._id);
  assert.equal(after.stockStatus, 'none');
  assert.equal((await Product.findById(product._id)).reservations.filter((r) => String(r.orderId) === String(order._id)).length, 0);
});

// R6. A stale restore generation cannot outrun a completed new one:
//     after cycle 2 completes, re-running the cycle-1 restore is a no-op.
test('R6: restore for a superseded generation is a no-op after ledger cleanup', async () => {
  const product = await makeProduct(9);
  const order = await makePendingWhatsappOrder(product, 1);
  assert.equal((await transition(order._id, 'confirmed')).ok, true); // gen E1
  const e1 = (await Order.findById(order._id)).stockEpoch;
  assert.equal((await transition(order._id, 'cancelled')).ok, true); // restores E1
  assert.equal((await Product.findById(product._id)).stock, 9);
  assert.equal((await transition(order._id, 'confirmed')).ok, true); // gen E2, cleans ledger
  assert.equal((await Product.findById(product._id)).stock, 8);

  // A late retry of the E1 restore (e.g. duplicated sweep work) must not
  // inflate stock.
  await stockService.restoreLineForOrder(product._id, order._id, 1, e1);
  assert.equal((await Product.findById(product._id)).stock, 8, 'stale-generation restore inflated stock');
});

// R7. The fencing TTL is defeated for the new claim-based transitions:
//     changeOrderStatus claims generations with findOneAndUpdate, which
//     does not run the pre-save updatedAt bump, and no claim sets it.
//     For any order older than STALE_RESERVATION_MS, the sweep treats an
//     ACTIVE confirm generation as stale the moment it starts.
test('R7: sweep claims an ACTIVE confirm generation of an older order (TTL fence defeated)', async () => {
  const product = await makeProduct(5);
  const order = await makePendingWhatsappOrder(product, 1);
  // Any order older than the TTL: its updatedAt moves only on save(),
  // and the claim into 'pending' is findOneAndUpdate (no bump).
  await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });

  // Interpose the sweep INSIDE the active confirm, at the first reserve.
  const originalReserve = stockService.reserveLine;
  let sweepRan = false;
  stockService.reserveLine = async function (...args) {
    if (!sweepRan) {
      sweepRan = true;
      await stockService.reconcileStuckOrders();
    }
    return originalReserve.apply(this, args);
  };
  let result;
  try {
    result = await transition(order._id, 'confirmed');
  } finally {
    stockService.reserveLine = originalReserve;
  }

  const after = await Order.findById(order._id);
  // The CAS fence still prevents corruption, but the active request loses
  // its own generation to the sweep and the owner gets a spurious 409 on
  // a confirm that should have succeeded.
  assert.notEqual(result.ok, false, 'expected the confirm to succeed; the sweep claimed its live generation');
  assert.equal(after.stockStatus, 'completed');
  assert.equal((await Product.findById(product._id)).stock, 4);
});

// R8. Stale restore writer after generation cleanup: a restock request
//     stalled mid-loop loses its generation to the sweep; the owner
//     re-confirms (new reservation, cleanup pulls the old ledger entries);
//     the stalled writer resumes and re-restores a line, inflating stock
//     under a valid reservation.
test('R8: stalled restock writer resuming after a new generation inflates stock', async () => {
  const p1 = await makeProduct(5);
  const p2 = await makeProduct(7);
  const order = await Order.create({
    storeId: store._id,
    products: [
      { productId: p1._id, quantity: 1, price: 100 },
      { productId: p2._id, quantity: 2, price: 100 },
    ],
    totalPrice: 300,
    paymentMethod: 'whatsapp_confirmation',
    status: 'pending',
  });
  assert.equal((await transition(order._id, 'confirmed')).ok, true); // gen E1: 5->4, 7->5
  const e1 = (await Order.findById(order._id)).stockEpoch;

  // Intercept the cancel's restore: line 1 restores, then the request
  // stalls; the sweep resumes and finishes; the owner re-confirms (E2,
  // cleanup pulls E1 ledger entries); the stalled writer resumes line 2.
  const originalRestore = stockService.restoreOrderStock;
  stockService.restoreOrderStock = async function (claimedOrder) {
    // line 1 of the stalled request completes:
    await stockService.restoreLineForOrder(p1._id, claimedOrder._id, 1, e1);
    // stall: the sweep takes over (order aged past TTL)
    await Order.updateOne({ _id: order._id }, { $set: { updatedAt: new Date(Date.now() - 60 * 60 * 1000) } });
    await stockService.reconcileInterruptedRestores(); // restores line 2, finishes to 'none'
    // owner re-confirms: new generation reserves both lines again
    const reconfirm = await transition(order._id, 'confirmed');
    assert.equal(reconfirm.ok, true, `re-confirm failed: ${reconfirm.message}`);
    // the stalled request wakes and finishes its loop with the stale epoch:
    await stockService.restoreLineForOrder(p2._id, claimedOrder._id, 2, e1);
  };
  try {
    await transition(order._id, 'cancelled');
  } finally {
    stockService.restoreOrderStock = originalRestore;
  }

  const finalP2 = await Product.findById(p2._id);
  // Order is confirmed (E2) holding a reservation of 2 on p2 (stock 7 ->
  // 5). The stale writer's late restore pushed it back to 7: phantom stock
  // under a valid reservation.
  assert.equal(finalP2.stock, 5, `stale restore inflated stock: p2=${finalP2.stock}, expected 5`);
});
