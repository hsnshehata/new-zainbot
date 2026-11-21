'use strict';

// server/services/orderStatusService.js
// THE single owner of order status transitions. Every mutation path -
// the dashboard API (orderController.updateOrder) and the Telegram owner
// flow (telegramController) - goes through changeOrderStatus so the stock
// protocol cannot be bypassed by any writer.
//
// Documented transition semantics (conservative test-site policy):
//  - confirm of an order whose reservation already completed is an
//    idempotent replay: 200, no second decrement, ever.
//  - confirm from stockStatus 'none'/'failed' runs the full reservation
//    protocol (durable intent + epoch-fenced CAS) when the order owes
//    stock: whatsapp_confirmation orders (never reserved before) and any
//    order whose stock was previously restored (stockReleased). Legacy
//    cash_on_delivery orders without protocol state keep the historical
//    plain transition - their stock was handled outside the protocol and
//    must not be silently re-decremented.
//  - cancel or regress (to pending) a stock-completed order RESTORES stock
//    through the crash-safe ledger (claim 'restoring' -> idempotent
//    per-line restore -> finish 'none', with the sweep resuming any
//    interrupted restore).
//  - shipped/delivered orders are fulfilment-terminal for stock: they
//    cannot be cancelled or regressed here (409), because automatic
//    restock after fulfilment would be an assumption, not a policy.
//  - a concurrent in-flight stock operation ('pending'/'restoring')
//    rejects the mutation with 409 instead of racing it.

const mongoose = require('mongoose');
const Order = require('../models/Order');
const stockService = require('./stockService');
const logger = require('../logger');

const VALID_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const FULFILLED = ['shipped', 'delivered'];

function fail(httpStatus, message, extra = {}) {
  return { ok: false, httpStatus, message, ...extra };
}

async function plainTransition(order, targetStatus, historyEntry) {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status, stockStatus: order.stockStatus },
    { $set: { status: targetStatus, updatedAt: new Date() }, $push: { history: historyEntry } },
    { new: true }
  );
  if (!updated) {
    return fail(409, 'تعذر تحديث الطلب: عملية أخرى جارية. حدّث الصفحة وحاول مرة أخرى.');
  }
  return { ok: true, order: updated };
}

async function changeOrderStatus({ order, targetStatus, changedBy = null, note = '' }) {
  if (!VALID_STATUSES.includes(targetStatus)) {
    return fail(400, 'حالة غير مدعومة');
  }
  const prevStatus = order.status;
  if (prevStatus === targetStatus) {
    return { ok: true, unchanged: true, order };
  }
  const historyEntry = {
    status: targetStatus,
    changedBy: changedBy || null,
    changedAt: new Date(),
    note: note || `تغيير الحالة من ${prevStatus} إلى ${targetStatus}`,
  };

  // No automatic restock or regression after fulfilment.
  if (FULFILLED.includes(prevStatus) && ['pending', 'confirmed', 'cancelled'].includes(targetStatus)) {
    return fail(409, 'لا يمكن تغيير حالة طلب تم شحنه أو تسليمه إلى حالة سابقة أو إلغاؤه من هنا؛ المخزون لا يُستعاد تلقائيًا بعد التنفيذ.');
  }

  // Never race an in-flight stock operation; the sweep owns stale ones.
  // A CONFIRM is exempt here: its claim below fails against the in-flight
  // generation and the bounded wait there replays the sibling's result.
  if (targetStatus !== 'confirmed' && (order.stockStatus === 'pending' || order.stockStatus === 'restoring')) {
    return fail(409, 'عملية مخزون جارية على هذا الطلب. حدّث الصفحة وحاول بعد قليل.');
  }

  if (targetStatus === 'confirmed') {
    // Idempotent replay: the reservation for this order already completed.
    if (order.stockStatus === 'completed') {
      return { ok: true, alreadyCompleted: true, order };
    }
    // Modern protocol state always owes stock on (re-)confirm: a 'failed'
    // reservation was released, never decremented - that is not a legacy
    // order. Legacy means: COD + no protocol state ever ('none', never
    // released) - its stock was handled outside the protocol.
    const owesStock = order.paymentMethod === 'whatsapp_confirmation'
      || order.stockReleased === true
      || order.stockStatus === 'failed';
    if (!owesStock) {
      return plainTransition(order, targetStatus, historyEntry);
    }

    // Full protocol: atomic claim into a new pending generation, then
    // per-line idempotent reservation, then the epoch-fenced completion CAS.
    const epoch = new mongoose.Types.ObjectId().toString();
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, status: prevStatus, stockStatus: { $in: ['none', 'failed'] } },
      { $set: { stockStatus: 'pending', stockEpoch: epoch, updatedAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      // A sibling confirm beat us to the claim. Give it a bounded moment to
      // finish, then replay its completed result instead of erroring the
      // owner for a duplicate click.
      for (let poll = 0; poll < 5; poll += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
        // eslint-disable-next-line no-await-in-loop
        const current = await Order.findById(order._id).select('status stockStatus history');
        if (!current) return fail(404, 'الطلب غير موجود');
        if (current.stockStatus === 'completed' && current.status === 'confirmed') {
          return { ok: true, alreadyCompleted: true, order: current };
        }
        if (current.stockStatus !== 'pending' && current.stockStatus !== 'restoring') break;
      }
      return fail(409, 'عملية مخزون جارية على هذا الطلب. حدّث الصفحة وحاول بعد قليل.');
    }
    for (const item of claimed.products || []) {
      const reservation = await stockService.reserveLine(item.productId, claimed.storeId, claimed._id, item.quantity);
      if (!reservation.ok) {
        await stockService.releaseOrderReservations(claimed);
        await Order.updateOne(
          { _id: claimed._id, stockStatus: 'pending', stockEpoch: epoch },
          { $set: { stockStatus: 'none', 'opsFlags.stockError': 'confirm failed: insufficient stock' } }
        );
        const name = reservation.product?.productName || item.name || String(item.productId);
        logger.warn('order_confirm_insufficient_stock', { orderId: claimed._id, productId: item.productId });
        return fail(409, `لا يمكن تأكيد الطلب: المخزون غير كافٍ للمنتج ${name}`);
      }
    }
    const completion = await stockService.completeOrderReservation(
      claimed._id,
      { status: 'confirmed' },
      historyEntry,
      epoch
    );
    if (!completion.ok) {
      // The sweep claimed this generation while we were stalled.
      await stockService.releaseOrderReservations(claimed);
      logger.warn('order_confirm_completion_lost_fence', { orderId: claimed._id, state: completion.state });
      return fail(409, 'تعذر إتمام التأكيد. حدّث الصفحة وحاول مرة أخرى.');
    }
    if (completion.alreadyCompleted) {
      // A sibling confirm won; its reservation owns the tokens.
      return { ok: true, alreadyCompleted: true, order: completion.order };
    }
    logger.info('order_confirm_stock_reserved', { orderId: claimed._id });
    return { ok: true, order: completion.order };
  }

  if ((targetStatus === 'cancelled' || targetStatus === 'pending') && order.stockStatus === 'completed') {
    // Restock: claim -> restore (idempotent) -> pull tokens -> finish.
    // An interrupted restore is resumed by reconcileInterruptedRestores.
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, status: prevStatus, stockStatus: 'completed' },
      { $set: { stockStatus: 'restoring', status: targetStatus, updatedAt: new Date() }, $push: { history: historyEntry } },
      { new: true }
    );
    if (!claimed) {
      return fail(409, 'تعذر تحديث الطلب: عملية أخرى جارية. حدّث الصفحة وحاول مرة أخرى.');
    }
    try {
      await stockService.restoreOrderStock(claimed);
    } catch (restoreErr) {
      // Stay in 'restoring': reconcileInterruptedRestores retries. Never
      // report success for a half-restored order.
      logger.error('order_restock_failed', { orderId: claimed._id, err: restoreErr.message });
      return fail(500, 'تعذر استعادة المخزون الآن. سيُعاد تلقائيًا؛ حدّث الصفحة بعد قليل.');
    }
    await stockService.pullOrderTokens(claimed._id);
    const done = await Order.findOneAndUpdate(
      { _id: claimed._id, stockStatus: 'restoring' },
      { $set: { stockStatus: 'none', stockReleased: true, updatedAt: new Date() } },
      { new: true }
    );
    logger.info('order_stock_restored', { orderId: claimed._id, targetStatus });
    return { ok: true, order: done || (await Order.findById(claimed._id)) };
  }

  // Everything else (e.g. confirmed -> shipped/delivered, pending ->
  // cancelled before any reservation) changes no stock.
  return plainTransition(order, targetStatus, historyEntry);
}

module.exports = { changeOrderStatus, VALID_STATUSES };
