'use strict';

// server/services/orderOps.js
// Durable owner-notification delivery for orders, with a claim-fenced retry
// sweep. Semantics:
//  - In-app Notification document: created at most once per order, deduped
//    by opsFlags.notificationCreated (a crash between the document save and
//    the flag write can still produce one duplicate - at-least-once).
//  - External channel delivery (Telegram/WhatsApp via notifyNewOrder):
//    providers expose no idempotency keys, so delivery is at-least-once.
//    We never claim exactly-once.
//  - Retry sweep claims an order atomically (notificationPending + stale/no
//    claim + attempt budget) before sending, so two workers cannot send in
//    parallel, and gives up after MAX_ATTEMPTS with notificationFailed set.

const Order = require('../models/Order');
const Store = require('../models/Store');
const Bot = require('../models/Bot');
const Notification = require('../models/Notification');
const logger = require('../logger');

const CLAIM_STALE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 20;
const SWEEP_LIMIT = 25;

function formatTotal(totalPrice, currency) {
  try {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency }).format(totalPrice);
  } catch {
    return `${Number(totalPrice || 0).toFixed(2)} ${currency}`;
  }
}

async function resolveBotIdForStore(store) {
  if (store.botId) return store.botId;
  const bot = await Bot.findOne({ storeId: store._id }).select('_id');
  return bot ? bot._id : null;
}

/**
 * Deliver the "new order" notifications for an order. Throws on failure so
 * callers can flag notificationPending; never throws for the in-app dedup
 * flag write itself.
 */
async function notifyOwnerOfNewOrder(store, order, deps = {}) {
  const notifyNewOrder = deps.notifyNewOrder || require('./telegramService').notifyNewOrder;
  const formattedTotal = formatTotal(order.totalPrice, order.currency);

  // In-app notification, at most once.
  if (!order.opsFlags?.notificationCreated) {
    const notification = new Notification({
      user: store.userId,
      title: `طلب جديد في ${store.storeName}`,
      message: `تم إنشاء طلب جديد (${order._id}) بإجمالي ${formattedTotal}.`,
      isRead: false,
    });
    await notification.save();
    await Order.updateOne(
      { _id: order._id },
      { $set: { 'opsFlags.notificationCreated': true } }
    ).catch((e) => logger.error('order_notification_flag_write_failed', { orderId: order._id, err: e.message }));
    logger.info('order_notification_created', { storeId: store._id, orderId: order._id, userId: store.userId });
  }

  // External channel, at-least-once.
  const botId = await resolveBotIdForStore(store);
  await notifyNewOrder(store.userId, {
    storeName: store.storeName,
    orderId: order._id,
    status: order.status,
    total: order.totalPrice,
    currency: order.currency,
    customerName: order.customerName,
    customerAddress: order.customerAddress,
    customerWhatsapp: order.customerWhatsapp,
    items: order.products,
  }, botId);
}

/**
 * Flag an order for the notification retry sweep. Used by controllers when
 * the inline send fails after the order is already persisted.
 */
async function flagNotificationPending(orderId, err) {
  await Order.updateOne(
    { _id: orderId },
    {
      $set: {
        'opsFlags.notificationPending': true,
        'opsFlags.notificationError': String(err?.message || 'notification failed').slice(0, 300),
        'opsFlags.notificationClaimedAt': null,
      },
    }
  ).catch((flagErr) => logger.error('order_opsflag_write_failed', { orderId, err: flagErr.message }));
}

/**
 * Retry pending order notifications with claim fencing and an attempt
 * budget. Each candidate is claimed atomically; a claim older than
 * CLAIM_STALE_MS is treated as an abandoned worker and may be re-claimed.
 */
async function retryPendingNotifications({ now = new Date(), deps = {} } = {}) {
  const staleClaim = new Date(now.getTime() - CLAIM_STALE_MS);
  const candidates = await Order.find({
    'opsFlags.notificationPending': true,
    'opsFlags.notificationFailed': { $ne: true },
    'opsFlags.notificationAttempts': { $lt: MAX_ATTEMPTS },
    $or: [
      { 'opsFlags.notificationClaimedAt': null },
      { 'opsFlags.notificationClaimedAt': { $exists: false } },
      { 'opsFlags.notificationClaimedAt': { $lt: staleClaim } },
    ],
  }).sort({ updatedAt: 1 }).limit(SWEEP_LIMIT);

  let recovered = 0;
  let failed = 0;
  for (const candidate of candidates) {
    // Atomic claim: only one worker proceeds.
    const claimed = await Order.findOneAndUpdate(
      {
        _id: candidate._id,
        'opsFlags.notificationPending': true,
        'opsFlags.notificationAttempts': { $lt: MAX_ATTEMPTS },
        $or: [
          { 'opsFlags.notificationClaimedAt': null },
          { 'opsFlags.notificationClaimedAt': { $exists: false } },
          { 'opsFlags.notificationClaimedAt': { $lt: staleClaim } },
        ],
      },
      { $set: { 'opsFlags.notificationClaimedAt': now }, $inc: { 'opsFlags.notificationAttempts': 1 } },
      { new: true }
    );
    if (!claimed) continue;

    try {
      const store = await Store.findById(claimed.storeId);
      if (!store) throw new Error('store not found for order notification retry');
      await notifyOwnerOfNewOrder(store, claimed, deps);
      await Order.updateOne(
        { _id: claimed._id },
        {
          $set: { 'opsFlags.notificationRecoveredAt': new Date() },
          $unset: {
            'opsFlags.notificationPending': '',
            'opsFlags.notificationClaimedAt': '',
            'opsFlags.notificationError': '',
          },
        }
      );
      logger.info('order_notification_recovered', { orderId: claimed._id, attempts: claimed.opsFlags?.notificationAttempts });
      recovered += 1;
    } catch (err) {
      // claimed is the post-$inc document: its notificationAttempts IS the
      // current attempt count. Adding 1 here double-counted and silently
      // burned one retry from the budget.
      const attempts = claimed.opsFlags?.notificationAttempts || 0;
      await Order.updateOne(
        { _id: claimed._id },
        {
          $set: {
            'opsFlags.notificationError': String(err.message || 'retry failed').slice(0, 300),
            ...(attempts >= MAX_ATTEMPTS ? { 'opsFlags.notificationFailed': true, 'opsFlags.notificationPending': false } : {}),
          },
        }
      );
      logger.warn('order_notification_retry_failed', { orderId: claimed._id, attempts, err: err.message });
      failed += 1;
    }
  }
  return { recovered, failed };
}

module.exports = {
  MAX_ATTEMPTS,
  CLAIM_STALE_MS,
  notifyOwnerOfNewOrder,
  flagNotificationPending,
  retryPendingNotifications,
};
