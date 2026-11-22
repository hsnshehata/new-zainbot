'use strict';

// server/services/stockService.js
// Crash-safe stock reservation protocol built on single-document atomic
// updates (the deployment topology is checked at boot and logged as
// mongodb_topology; this protocol intentionally does not require
// multi-document transactions, which standalone MongoDB cannot run).
//
// Invariants:
//  - Reserving is idempotent per (product, order): the reservation token on
//    the product is the dedup key. A retried reserve never double-decrements.
//  - Releasing is idempotent per (product, order): the release is a single
//    atomic pipeline update guarded by the token's presence, so a double
//    release cannot re-inflate stock.
//  - The order records durable intent (stockStatus) BEFORE any stock write,
//    so a crash anywhere after that leaves a discoverable, reconcilable
//    state: the sweep finds orders stuck in 'pending' and releases their
//    tokens exactly once.
//  - The sweep only ever touches new-protocol orders (stockStatus set) and
//    products carrying reservation tokens. Legacy data has neither and is
//    never altered.

const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const logger = require('../logger');
const { inventoryAfterAllocation, stockAfterAllocation, inventoryUnavailable } = require('./catalogInventory');

// An order whose stockStatus has been 'pending' longer than this is owned
// by the sweep. Active HTTP requests complete in seconds, so 5 minutes of
// no order write is a safe fencing lease against a live request.
const STALE_RESERVATION_MS = 5 * 60 * 1000;
// Per-run bounds keep the sweep cheap and predictable.
const SWEEP_ORDER_LIMIT = 25;
const SWEEP_PRODUCT_LIMIT = 25;

/**
 * Atomically reserve qty units of a product for an order. Idempotent: a
 * second call with the same orderId returns ok without a second decrement.
 */
async function reserveLine(productId, storeId, orderId, qty) {
  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      storeId,
      stock: { $gte: qty },
      isActive: { $ne: false },
      'reservations.orderId': { $ne: orderId },
      $or: [{ importSource: { $exists: false } }, { 'catalogInventory.sourceKey': { $exists: true }, 'catalogInventory.syncGeneration': { $gt: 0 }, stockTracked: true }],
    },
    [{ $set: {
      stock: { $subtract: ['$stock', qty] },
      catalogInventory: inventoryAfterAllocation(qty),
      reservations: { $concatArrays: [{ $ifNull: ['$reservations', []] }, { $literal: [{ orderId: new mongoose.Types.ObjectId(String(orderId)), qty, at: new Date() }] }] },
    } }],
    { new: true }
  );
  if (updated) return { ok: true, product: updated };

  // Distinguish "we already reserved this line" (idempotent retry) from
  // genuine insufficient stock or a wrong store/product binding.
  const existing = await Product.findOne({ _id: productId, storeId }).select('productName stock stockTracked importSource catalogInventory reservations');
  if (existing && (existing.reservations || []).some((r) => String(r.orderId) === String(orderId))) {
    return { ok: true, already: true, product: existing };
  }
  return { ok: false, reason: inventoryUnavailable(existing), product: existing };
}

/**
 * Idempotently release any reservation token an order holds on a product,
 * adding the token's qty back to stock. Single atomic pipeline update
 * guarded by the token's presence: running it twice changes nothing.
 */
async function releaseLineForOrder(productId, orderId) {
  const oid = new mongoose.Types.ObjectId(String(orderId));
  const result = await Product.updateOne(
    { _id: productId, 'reservations.orderId': oid },
    [
      {
        $set: {
          stock: stockAfterAllocation({ $multiply: [-1, { $ifNull: [{ $first: { $map: {
            input: { $filter: { input: { $ifNull: ['$reservations', []] }, as: 'r', cond: { $eq: ['$$r.orderId', oid] } } },
            in: '$$this.qty',
          } } }, 0] }] }, { $add: ['$stock', { $ifNull: [{ $first: { $map: {
            input: { $filter: { input: { $ifNull: ['$reservations', []] }, as: 'r', cond: { $eq: ['$$r.orderId', oid] } } },
            in: '$$this.qty',
          } } }, 0] }] }),
          catalogInventory: inventoryAfterAllocation({ $multiply: [-1, { $ifNull: [{ $first: { $map: {
            input: { $filter: { input: { $ifNull: ['$reservations', []] }, as: 'r', cond: { $eq: ['$$r.orderId', oid] } } },
            in: '$$this.qty',
          } } }, 0] }] }),
          reservations: { $filter: { input: { $ifNull: ['$reservations', []] }, as: 'r', cond: { $ne: ['$$r.orderId', oid] } } },
        },
      },
    ]
  );
  return result.modifiedCount;
}

/** Release every reservation token an order holds, line by line. */
async function releaseOrderReservations(order) {
  let released = 0;
  for (const item of order.products || []) {
    if (!item.productId) continue;
    try {
      released += await releaseLineForOrder(item.productId, order._id);
    } catch (err) {
      logger.error('stock_release_line_failed', {
        orderId: order._id,
        productId: item.productId,
        err: err.message,
      });
    }
  }
  return released;
}

/** Pull an order's tokens WITHOUT changing stock (order is terminal). */
async function pullOrderTokens(orderId) {
  const oid = new mongoose.Types.ObjectId(String(orderId));
  const result = await Product.updateMany(
    { 'reservations.orderId': oid },
    { $pull: { reservations: { orderId: oid } } }
  );
  return result.modifiedCount;
}

/**
 * Reconcile orders stuck in stockStatus 'pending' beyond the fencing TTL.
 * Recovery depends on where the order was in its lifecycle, and is never a
 * silent guess:
 *  - status 'confirmed' (crash during COD create before the 201): the
 *    shopper never saw a confirmation, so the order is a phantom -> release
 *    stock and cancel it, with a history note.
 *  - status 'pending' (crash during owner confirmation): release stock and
 *    return the order to the pre-confirmation state (stockStatus 'none') so
 *    the owner can retry; the order itself is NOT cancelled.
 * Claim fencing: the state transition happens in the same atomic update
 * that claims the order, so a concurrent request or sweep cannot race us.
 * Releases underneath are idempotent regardless.
 */
async function reconcileStuckOrders({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - STALE_RESERVATION_MS);
  const stuck = await Order.find({ stockStatus: 'pending', updatedAt: { $lt: cutoff } })
    .sort({ updatedAt: 1 })
    .limit(SWEEP_ORDER_LIMIT);
  let reconciled = 0;
  for (const order of stuck) {
    const nextStockStatus = order.status === 'confirmed' ? 'failed' : 'none';
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, stockStatus: 'pending', updatedAt: { $lt: cutoff } },
      {
        $set: {
          stockStatus: nextStockStatus,
          updatedAt: new Date(),
          ...(order.status === 'confirmed' ? { status: 'cancelled' } : {}),
          'opsFlags.stockError': 'reconciled: released reservations after interrupted processing',
        },
        // A cancelled phantom must free its idempotency key exactly like
        // the controller's own failure path, or the shopper's legitimate
        // retry replays a cancelled order as a success and can never
        // re-order with that key.
        ...(order.status === 'confirmed' ? { $unset: { idempotencyKey: '', payloadHash: '' } } : {}),
        $push: {
          history: {
            status: order.status === 'confirmed' ? 'cancelled' : order.status,
            changedBy: null,
            changedAt: new Date(),
            note: 'مصالحة تلقائية: تحرير حجز مخزون بعد انقطاع المعالجة',
          },
        },
      },
      { new: true }
    );
    if (!claimed) continue; // an active request resolved it meanwhile
    const released = await releaseOrderReservations(claimed);
    logger.warn('stock_stuck_order_reconciled', {
      orderId: claimed._id,
      storeId: claimed.storeId,
      outcome: order.status === 'confirmed' ? 'cancelled_phantom' : 'returned_to_pending',
      releasedLines: released,
    });
    reconciled += 1;
  }
  return reconciled;
}

/**
 * Reconcile stale reservation tokens on products (bounded). Only tokens
 * older than the TTL are touched, and only when the owning order's recorded
 * state makes the outcome unambiguous:
 *  - order missing or stockStatus 'failed'  -> release (restore stock)
 *  - stockStatus 'completed'                -> pull token only (stock kept)
 *  - still 'pending' / anything else        -> skip; the order sweep owns it
 */
async function reconcileOrphanTokens({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - STALE_RESERVATION_MS);
  const products = await Product.find({ 'reservations.at': { $lt: cutoff } })
    .select('_id reservations')
    .limit(SWEEP_PRODUCT_LIMIT);
  let touched = 0;
  for (const product of products) {
    for (const token of product.reservations || []) {
      if (!(token.at instanceof Date) || token.at >= cutoff) continue;
      const order = await Order.findById(token.orderId).select('status stockStatus');
      if (!order || order.stockStatus === 'failed') {
        await releaseLineForOrder(product._id, token.orderId);
        logger.warn('stock_orphan_token_released', { productId: product._id, orderId: token.orderId, reason: order ? 'order_failed' : 'order_missing' });
        touched += 1;
      } else if (order.stockStatus === 'completed') {
        await pullOrderTokens(token.orderId);
        touched += 1;
      }
    }
  }
  // NO automatic pruning of Product.restorations here. The ledger is the
  // fence against stale restock writers; no hard writer-lifetime guarantee
  // exists (a suspended process or long-lived container can outlive any
  // horizon), and deleting an entry is deleting correctness evidence -
  // a resuming writer would re-restore stock. Entries are retained
  // indefinitely until a bounded compaction scheme is designed with a
  // proven invariant (e.g. one compacted marker per order that still
  // blocks replay of its historical epochs).
  // GROWTH RISK (tracked, accepted for now): one small subdocument
  // (~64 bytes) per completed cancel/regression line per product, and
  // this is UNBOUNDED for a long-lived product - cumulative
  // cancellations grow forever, and a MongoDB document caps at 16MB
  // (~250k entries). Current volumes are far below that, but the
  // eventual document-size limit is a real readiness finding, not a
  // non-issue. Compact only with a proven invariant, never by age.
  return touched;
}

/**
 * Complete an order's reservation: the conditional CAS that is the REAL
 * fence of the protocol. The TTL only tells the sweep when it MAY claim a
 * stuck order; ownership is settled here, atomically: only the writer that
 * moves stockStatus 'pending' -> 'completed' owns the outcome.
 *
 * Outcomes:
 *  - { ok: true }                    -> we completed; tokens now belong to a
 *                                       terminal order and are swept later.
 *  - { ok: true, alreadyCompleted }  -> a sibling request for the SAME
 *                                       order (e.g. a duplicate confirm)
 *                                       already completed it. The caller
 *                                       MUST NOT release: the tokens belong
 *                                       to the sibling's valid reservation.
 *  - { ok: false }                   -> the reconciliation sweep claimed the
 *                                       order while we were stalled (TTL is
 *                                       not a fence; a paused request can
 *                                       resume after the claim). The caller
 *                                       MUST release its reservations
 *                                       (idempotent) and fail the request.
 */
async function completeOrderReservation(orderId, extraSet = {}, historyEntry = null, stockEpoch = '') {
  const update = { $set: { stockStatus: 'completed', updatedAt: new Date(), ...extraSet } };
  if (historyEntry) update.$push = { history: historyEntry };
  // The epoch is the generation fence: a stalled writer from an older
  // pending generation must never complete a newer one (cross-generation
  // adoption would confirm a partially reserved order).
  const filter = { _id: orderId, stockStatus: 'pending' };
  if (stockEpoch) filter.stockEpoch = stockEpoch;
  const done = await Order.findOneAndUpdate(filter, update, { new: true });
  if (done) {
    // Retention is the fence: prior-generation restoration entries MUST
    // stay. A restock writer stalled before the sweep resumed its order
    // still carries this generation's epoch; its late line restores are
    // no-ops only while the matching ledger entries exist. Entries are
    // unique per generation (fresh ObjectId epoch), so retention never
    // re-blocks a legitimate future cycle. Retention is indefinite: no
    // hard writer-lifetime bound exists, so entries are never pruned by
    // age (see the note in reconcileOrphanTokens).
    if (done.stockReleased) {
      try {
        await Order.updateOne({ _id: done._id }, { $set: { stockReleased: false } });
        done.stockReleased = false;
      } catch (cleanupErr) {
        logger.warn('stock_completion_released_reset_failed', { orderId: done._id, err: cleanupErr.message });
      }
    }
    return { ok: true, order: done };
  }
  const current = await Order.findById(orderId).select('status stockStatus');
  if (current && current.stockStatus === 'completed') {
    return { ok: true, alreadyCompleted: true, order: current };
  }
  return { ok: false, state: current ? current.stockStatus : 'missing' };
}

/**
 * Idempotently restore qty units for an order on ONE product. The
 * restoration ledger entry is written in the same atomic update as the
 * stock increment, guarded by its absence: any retry (after a crash, or a
 * sweep re-run) is a no-op. This is what makes restock crash-safe.
 */
async function restoreLineForOrder(productId, orderId, qty, epoch = '') {
  const oid = new mongoose.Types.ObjectId(String(orderId));
  const gen = String(epoch || '');
  const result = await Product.updateOne(
    { _id: productId, restorations: { $not: { $elemMatch: { orderId: oid, epoch: gen } } } },
    [{ $set: {
      stock: stockAfterAllocation(-qty, { $add: ['$stock', qty] }),
      catalogInventory: inventoryAfterAllocation(-qty),
      restorations: { $concatArrays: [{ $ifNull: ['$restorations', []] }, { $literal: [{ orderId: oid, epoch: gen, qty, at: new Date() }] }] },
    } }]
  );
  return result.modifiedCount;
}

/**
 * Restore every line of an order, line by line; each line is idempotent
 * within the order's current reservation generation (stockEpoch). A line
 * that errors is NOT swallowed: the caller must leave the order in
 * 'restoring' so the sweep retries, instead of marking a half-restored
 * order as done.
 */
async function restoreOrderStock(order) {
  const epoch = order.stockEpoch || '';
  let restored = 0;
  const failures = [];
  for (const item of order.products || []) {
    if (!item.productId || !item.quantity) continue;
    try {
      restored += await restoreLineForOrder(item.productId, order._id, item.quantity, epoch);
    } catch (err) {
      logger.error('stock_restore_line_failed', {
        orderId: order._id,
        productId: item.productId,
        err: err.message,
      });
      failures.push({ productId: item.productId, err: err.message });
    }
  }
  if (failures.length) {
    throw new Error(`stock restore failed for ${failures.length} line(s) of order ${order._id}`);
  }
  return restored;
}

/**
 * Recover orders whose restock was interrupted between the atomic claim
 * (stockStatus 'completed' -> 'restoring') and the finish. Every step is
 * idempotent, so re-running restore + token pull + finish is exact.
 */
async function reconcileInterruptedRestores({ now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - STALE_RESERVATION_MS);
  const stuck = await Order.find({ stockStatus: 'restoring', updatedAt: { $lt: cutoff } })
    .sort({ updatedAt: 1 })
    .limit(SWEEP_ORDER_LIMIT);
  let reconciled = 0;
  for (const order of stuck) {
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, stockStatus: 'restoring', updatedAt: { $lt: cutoff } },
      { $set: { 'opsFlags.stockError': 'reconciled: resumed interrupted stock restoration', updatedAt: new Date() } },
      { new: true }
    );
    if (!claimed) continue;
    try {
      await restoreOrderStock(claimed);
    } catch (restoreErr) {
      // Leave the order in 'restoring': the next sweep retries. Marking it
      // done here would durably lose the unrestored lines.
      await Order.updateOne(
        { _id: claimed._id },
        { $set: { 'opsFlags.stockError': `restore retry pending: ${String(restoreErr.message).slice(0, 200)}` } }
      );
      logger.error('stock_interrupted_restore_retry_pending', { orderId: claimed._id, err: restoreErr.message });
      continue;
    }
    await pullOrderTokens(claimed._id);
    await Order.updateOne(
      { _id: claimed._id, stockStatus: 'restoring' },
      { $set: { stockStatus: 'none', stockReleased: true, updatedAt: new Date() } }
    );
    logger.warn('stock_interrupted_restore_reconciled', { orderId: claimed._id, storeId: claimed.storeId });
    reconciled += 1;
  }
  return reconciled;
}

module.exports = {
  STALE_RESERVATION_MS,
  completeOrderReservation,
  reserveLine,
  releaseLineForOrder,
  releaseOrderReservations,
  pullOrderTokens,
  reconcileStuckOrders,
  reconcileOrphanTokens,
  reconcileInterruptedRestores,
  restoreLineForOrder,
  restoreOrderStock,
};
