// server/services/billingLimits.js
const User = require('../models/User');
const logger = require('../logger');

/**
 * Atomic monthly/daily message quota accounting on User documents.
 *
 * AiUsageEvent rows (written by aiCompletionOrchestrator) are the analytical
 * ledger of AI consumption; `monthlyMessagesUsed` on the User document remains
 * the enforcement counter this service mutates atomically via guarded
 * findOneAndUpdate/updateOne operations (never doc.save()).
 *
 * Tier caps are identical to the legacy read-modify-write implementation.
 */
const MESSAGE_LIMITS_BY_TIER = Object.freeze({
  free: Object.freeze({ daily: 25, monthly: 250 }),
  growth_1k: Object.freeze({ monthly: 1000 }),
  growth_10k: Object.freeze({ monthly: 10000 }),
  growth_50k: Object.freeze({ monthly: 50000 }),
});

// Same fallback the legacy code used for unknown growth_* tiers.
const DEFAULT_GROWTH_MONTHLY_CAP = 1000;

const FREE_DAILY_MESSAGE = 'عذراً، لقد استهلكت الحد الأقصى اليومي المسموح به للباقة المجانية (25 رسالة/يوم). يرجى إضافة مفتاح API خاص بك في الإعدادات أو الترقية لباقة Growth.';
const FREE_MONTHLY_MESSAGE = 'عذراً، لقد استهلكت الحد الأقصى الشهري المسموح به للباقة المجانية (250 رسالة/شهر). يرجى إضافة مفتاح API خاص بك في الإعدادات أو الترقية لباقة Growth.';
const growthMonthlyMessage = (monthlyLimit) => `عذراً، لقد استهلكت كامل رصيد باقة Growth الخاص بك لهذا الشهر (${monthlyLimit} محادثة). يرجى إدخال مفتاح API احتياطي في إعدادات البوت لتجنب انقطاع الخدمة، أو الترقية.`;

function capsForTier(tier) {
  if (MESSAGE_LIMITS_BY_TIER[tier]) return MESSAGE_LIMITS_BY_TIER[tier];
  if (typeof tier === 'string' && tier.startsWith('growth')) return { monthly: DEFAULT_GROWTH_MONTHLY_CAP };
  return null; // unlimited / unlisted tiers were never metered
}

// Local-time windows mirror the legacy calendar-field (day/month/year) comparison.
function computeWindows(nowDate) {
  const year = nowDate.getFullYear();
  const month = nowDate.getMonth();
  const date = nowDate.getDate();
  return {
    dayStart: new Date(year, month, date),
    nextDayStart: new Date(year, month, date + 1),
    monthStart: new Date(year, month, 1),
    nextMonthStart: new Date(year, month + 1, 1),
  };
}

function isOutsideWindow(resetAt, start, end) {
  return !resetAt || resetAt < start || resetAt >= end;
}

function createBillingLimitsService({ userModel = User, loggerInstance = logger, now = () => new Date() } = {}) {
  const ALLOWED = { allowed: true, useBackup: false };

  /**
   * Rolls expired usage windows forward in ONE guarded update.
   * The filter matches only while lastUsageReset sits outside the current day
   * window (any new month is also a new day, so this guard covers both), so a
   * concurrent rollover that already advanced the timestamp makes later calls
   * no-ops instead of double-resetting counters.
   */
  async function rollUsageWindowsForward(userId, snapshot) {
    const windows = computeWindows(now());
    const lastReset = snapshot.lastUsageReset ? new Date(snapshot.lastUsageReset) : null;
    const dayExpired = isOutsideWindow(lastReset, windows.dayStart, windows.nextDayStart);
    const monthExpired = isOutsideWindow(lastReset, windows.monthStart, windows.nextMonthStart);
    if (!dayExpired && !monthExpired) return windows;

    const $set = { lastUsageReset: now() };
    if (dayExpired) $set.dailyMessagesUsed = 0;
    if (monthExpired) $set.monthlyMessagesUsed = 0;

    await userModel.updateOne(
      {
        _id: userId,
        $or: [
          { lastUsageReset: { $lt: windows.dayStart } },
          { lastUsageReset: { $gte: windows.nextDayStart } },
          { lastUsageReset: null },
        ],
      },
      { $set }
    );
    return windows;
  }

  /**
   * Atomically reserves one billable message against the user's tier caps.
   * Returns { allowed, remaining, resetAt } (plus tier/reason when denied).
   */
  async function reserveMessageQuota({ userId, botId } = {}) {
    if (!userId) return { allowed: true, remaining: null, resetAt: null };

    const user = await userModel.findById(userId, 'subscriptionTier dailyMessagesUsed monthlyMessagesUsed lastUsageReset').lean();
    if (!user) {
      // Fail open for unknown users, like the legacy implementation did.
      return { allowed: true, remaining: null, resetAt: null };
    }

    const tier = user.subscriptionTier || 'free';
    const caps = capsForTier(tier);
    const windows = await rollUsageWindowsForward(userId, user);

    // Unlimited / unlisted tiers are never metered (legacy behaviour).
    if (!caps) {
      return { allowed: true, remaining: Number.POSITIVE_INFINITY, resetAt: windows.nextMonthStart };
    }

    // Conditional $inc: matches only while every enforced cap has headroom,
    // so concurrent requests cannot exceed the limit (no matched doc => deny).
    const filter = { _id: userId, monthlyMessagesUsed: { $lt: caps.monthly } };
    const inc = { monthlyMessagesUsed: 1 };
    if (caps.daily != null) {
      filter.dailyMessagesUsed = { $lt: caps.daily };
      inc.dailyMessagesUsed = 1;
    }

    const reserved = await userModel.findOneAndUpdate(filter, { $inc: inc }, { new: true, projection: 'dailyMessagesUsed monthlyMessagesUsed' });
    if (!reserved) {
      const fresh = await userModel.findById(userId, 'dailyMessagesUsed').lean();
      const dailyExhausted = caps.daily != null && (!fresh || (fresh.dailyMessagesUsed ?? 0) >= caps.daily);
      loggerInstance.warn('billing_quota_denied', { userId: String(userId), botId: botId == null ? null : String(botId), tier, reason: dailyExhausted ? 'daily_limit' : 'monthly_limit' });
      return { allowed: false, remaining: 0, resetAt: windows.nextMonthStart, tier, reason: dailyExhausted ? 'daily_limit' : 'monthly_limit' };
    }

    let remaining = caps.monthly - (reserved.monthlyMessagesUsed ?? 0);
    if (caps.daily != null) remaining = Math.min(remaining, caps.daily - (reserved.dailyMessagesUsed ?? 0));
    return { allowed: true, remaining, resetAt: windows.nextMonthStart, tier };
  }

  /**
   * Compensating decrement for failed billable work. Two filtered updates keep
   * the counter clamped at >= 0 without ever writing a negative value.
   */
  async function settleMessageQuota({ userId, delta = 1 } = {}) {
    const amount = Math.floor(Number(delta));
    if (!userId || !Number.isFinite(amount) || amount <= 0) return { settled: false };

    const decremented = await userModel.updateOne(
      { _id: userId, monthlyMessagesUsed: { $gte: amount } },
      { $inc: { monthlyMessagesUsed: -amount } }
    );
    if ((decremented?.matchedCount ?? 0) > 0) return { settled: true };

    // Counter was below the requested delta: pin it to zero instead.
    const clamped = await userModel.updateOne(
      { _id: userId, monthlyMessagesUsed: { $gt: 0 } },
      { $set: { monthlyMessagesUsed: 0 } }
    );
    return { settled: (clamped?.matchedCount ?? 0) > 0 };
  }

  /**
   * Legacy entry point preserved for existing callers. Delegates to the atomic
   * reservation above and keeps the historical return shape
   * ({ allowed, useBackup } or { allowed: false, message }) plus the exact
   * legacy Arabic messages and backup-key fallback behaviour.
   */
  async function checkPlanLimitsAndIncrement(bot) {
    if (!bot) return ALLOWED;
    try {
      const user = await userModel.findById(bot.userId, 'subscriptionTier').lean();
      if (!user) return ALLOWED;

      const tier = user.subscriptionTier || 'free';
      if (tier === 'free') {
        // A user-provided API key bypasses platform quotas entirely (legacy).
        if (bot.userApiKey) return ALLOWED;
      } else if (tier !== 'unlimited' && !String(tier).startsWith('growth')) {
        return ALLOWED; // unlisted tiers were never metered (legacy fallthrough)
      }

      const outcome = await reserveMessageQuota({ userId: bot.userId, botId: bot._id });
      if (outcome.allowed) return ALLOWED;

      if (String(tier).startsWith('growth') && bot.backupApiKey) {
        loggerInstance.info(`🔄 Growth limit reached (${capsForTier(tier).monthly}/${capsForTier(tier).monthly}). Switching to backup key.`);
        return { allowed: true, useBackup: true };
      }

      let message;
      if (outcome.reason === 'daily_limit') message = FREE_DAILY_MESSAGE;
      else if (tier === 'free') message = FREE_MONTHLY_MESSAGE;
      else message = growthMonthlyMessage(capsForTier(tier).monthly);
      return { allowed: false, message };
    } catch (err) {
      loggerInstance.error('❌ Error checking billing limits:', { err });
      return ALLOWED; // fallback allow on error
    }
  }

  return { reserveMessageQuota, settleMessageQuota, checkPlanLimitsAndIncrement };
}

const defaultService = createBillingLimitsService();

module.exports = {
  MESSAGE_LIMITS_BY_TIER,
  createBillingLimitsService,
  reserveMessageQuota: defaultService.reserveMessageQuota,
  settleMessageQuota: defaultService.settleMessageQuota,
  checkPlanLimitsAndIncrement: defaultService.checkPlanLimitsAndIncrement,
};
