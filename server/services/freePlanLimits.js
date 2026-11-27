'use strict';

// Free plan abuse limits. These only gate NEW creations: data a merchant
// already has is never deleted or blocked from being read/edited, so
// existing free merchants over a limit are grandfathered, not broken.
const { PLANS } = require('../config/plans');

const FREE_LIMITS = Object.freeze({
  stores: PLANS.free.stores,
  productsPerStore: PLANS.free.productsPerStore,
  employeesPerStore: PLANS.free.employeesPerStore,
  apiKeys: PLANS.free.apiKeys,
  assistantMessagesPerDay: PLANS.free.assistantMessagesPerDay,
  whatsappChannels: PLANS.free.whatsappChannels,
  maxUploadMB: PLANS.free.maxUploadMB,
});

function isFreeTier(user) {
  if (!user) return false;
  if (user.role === 'superadmin') return false;
  return (user.subscriptionTier || 'free') === 'free';
}

const MESSAGES = Object.freeze({
  stores: `الباقة المجانية تسمح بمتجر واحد فقط. رقّي باقتك لإضافة متاجر أكثر.`,
  productsPerStore: `الباقة المجانية تسمح بحد أقصى ${PLANS.free.productsPerStore} منتج في المتجر. رقّي باقتك لإضافة منتجات أكثر.`,
  employeesPerStore: `الباقة المجانية تسمح بحد أقصى ${PLANS.free.employeesPerStore} موظفين في المتجر. رقّي باقتك لإضافة المزيد.`,
  apiKeys: `الباقة المجانية تسمح بمفتاح API واحد فقط. رقّي باقتك لإنشاء مفاتيح أكثر.`,
  whatsappChannels: 'الباقة المجانية تسمح بربط رقم واتساب واحد فقط. رقّي باقتك لربط أرقام أكثر.',
  catalogConnectors: 'ربط متاجر Shopify و WooCommerce متاح في الباقات المدفوعة فقط.',
  uploadSize: `حجم الملف أكبر من المسموح في الباقة المجانية (${PLANS.free.maxUploadMB} ميجا). صغّر الملف أو رقّي باقتك.`,
  assistantMessagesPerDay: `وصلت للحد اليومي لمساعد زين في الباقة المجانية (${PLANS.free.assistantMessagesPerDay} رسالة/يوم). جرّب غدًا أو رقّي باقتك.`,
});

// Returns { allowed: true } or { allowed: false, error, message, limit }.
function checkCountLimit(user, kind, currentCount) {
  if (!isFreeTier(user)) return { allowed: true };
  const limit = FREE_LIMITS[kind];
  if (limit == null || !Number.isFinite(limit)) return { allowed: true };
  if ((Number(currentCount) || 0) < limit) return { allowed: true, limit };
  return { allowed: false, error: 'FREE_PLAN_LIMIT', kind, limit, message: MESSAGES[kind] };
}

function denyResponse(res, verdict) {
  return res.status(403).json({ success: false, error: verdict.error, kind: verdict.kind, limit: verdict.limit, message: verdict.message });
}

// Atomic per-day counter on the User document for the dashboard assistant.
async function reserveAssistantMessage(userModel, user, now = new Date()) {
  if (!isFreeTier(user)) return { allowed: true };
  const limit = FREE_LIMITS.assistantMessagesPerDay;
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  await userModel.updateOne(
    { _id: user._id || user.userId, $or: [{ assistantUsageDay: null }, { assistantUsageDay: { $lt: dayStart } }] },
    { $set: { assistantUsageDay: dayStart, assistantMessagesToday: 0 } }
  );
  const reserved = await userModel.findOneAndUpdate(
    { _id: user._id || user.userId, assistantMessagesToday: { $lt: limit } },
    { $inc: { assistantMessagesToday: 1 } },
    { new: true, projection: 'assistantMessagesToday' }
  );
  if (reserved) return { allowed: true, limit };
  return { allowed: false, error: 'FREE_PLAN_LIMIT', kind: 'assistantMessagesPerDay', limit, message: MESSAGES.assistantMessagesPerDay };
}

// Express middleware: rejects oversized uploaded files for free users.
// Place AFTER multer so req.file / req.files exist.
function freeUploadSizeGuard(req, res, next) {
  if (!isFreeTier(req.user)) return next();
  const maxBytes = FREE_LIMITS.maxUploadMB * 1024 * 1024;
  const files = [].concat(req.file || [], Array.isArray(req.files) ? req.files : []);
  if (files.some((f) => Number(f.size) > maxBytes)) {
    return res.status(413).json({ success: false, error: 'FREE_PLAN_LIMIT', kind: 'uploadSize', limit: FREE_LIMITS.maxUploadMB, message: MESSAGES.uploadSize, msg: MESSAGES.uploadSize });
  }
  return next();
}

module.exports = { freeUploadSizeGuard, FREE_LIMITS, isFreeTier, checkCountLimit, denyResponse, reserveAssistantMessage, MESSAGES };
