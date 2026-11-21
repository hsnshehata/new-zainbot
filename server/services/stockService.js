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
      'reservations.orderId': { $ne: orderId },
    },
    { $inc: { stock: -qty }, $push: { reservations: { orderId, qty, at: new Date() } } },
    { new: true }
  );
  if (updated) return { ok: true, product: updated };

  // Distinguish "we already reserved this line" (idempotent retry) from
  // genuine insufficient stock or a wrong store/product binding.
  const existing = await Product.findOne({ _id: productId, storeId }).select('productName stock reservations');
  if (existing && (existing.reservations || []).some((r) => String(r.orderId) === String(orderId))) {
    return { ok: true, already: true, product: existing };
  }
  return { ok: false, product: existing };
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
          stock: {
            $add: [
              '$stock',
              {
                $ifNull: [
                  {
                    $first: {
                      $map: {
                        input: { $filter: { input: { $ifNull: ['$reservations', []] }, as: 'r', cond: { $eq: ['$$r.orderId', oid] } } },
                        in: '$$this.qty',
                      },
                    },
                  },
                  0,
                ],
              },
            ],
          },
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
      { _id: order._id, stockStatus: 'pending' },
      {
        $set: {
          stockStatus: nextStockStatus,
          ...(order.status === 'confirmed' ? { status: 'cancelled' } : {}),
          'opsFlags.stockError': 'reconciled: released reservations after interrupted processing',
        },
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
  return touched;
}

module.exports = {
  STALE_RESERVATION_MS,
  reserveLine,
  releaseLineForOrder,
  releaseOrderReservations,
  pullOrderTokens,
  reconcileStuckOrders,
  reconcileOrphanTokens,
};
