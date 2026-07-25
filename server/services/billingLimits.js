// server/services/billingLimits.js
const User = require('../models/User');
const logger = require('../logger');

/**
 * Checks subscription limits and updates usage counters.
 * Returns { allowed: true, useBackup: false } or { allowed: false, message: '...' } or { allowed: true, useBackup: true }
 * @param {Object} bot - The current bot document
 */
async function checkPlanLimitsAndIncrement(bot) {
  if (!bot) return { allowed: true, useBackup: false };

  try {
    const user = await User.findById(bot.userId);
    if (!user) return { allowed: true, useBackup: false };

    const tier = user.subscriptionTier || 'free';

    // Current time
    const now = new Date();
    const lastReset = user.lastUsageReset ? new Date(user.lastUsageReset) : new Date(0);

    // Reset daily usage if a new day has started (Cairo timezone comparison is best, but day date change works)
    const isNewDay = now.getDate() !== lastReset.getDate() || 
                      now.getMonth() !== lastReset.getMonth() || 
                      now.getFullYear() !== lastReset.getFullYear();

    // Reset monthly usage if a new month has started
    const isNewMonth = now.getMonth() !== lastReset.getMonth() || 
                        now.getFullYear() !== lastReset.getFullYear();

    let needsSave = false;

    if (isNewDay) {
      user.dailyMessagesUsed = 0;
      needsSave = true;
    }
    if (isNewMonth) {
      user.monthlyMessagesUsed = 0;
      needsSave = true;
    }
    if (isNewDay || isNewMonth) {
      user.lastUsageReset = now;
      needsSave = true;
    }
    if (needsSave) {
      await user.save();
    }

    // 1. FREE Tier Limits
    if (tier === 'free') {
      // If user provided their own key, they are allowed (no message limit checked on our platform keys)
      if (bot.userApiKey) {
        return { allowed: true, useBackup: false };
      }
      
      // Platform key checks: 25/day, 250/month
      if (user.dailyMessagesUsed >= 25) {
        return { 
          allowed: false, 
          message: 'عذراً، لقد استهلكت الحد الأقصى اليومي المسموح به للباقة المجانية (25 رسالة/يوم). يرجى إضافة مفتاح API خاص بك في الإعدادات أو الترقية لباقة Growth.' 
        };
      }
      if (user.monthlyMessagesUsed >= 250) {
        return { 
          allowed: false, 
          message: 'عذراً، لقد استهلكت الحد الأقصى الشهري المسموح به للباقة المجانية (250 رسالة/شهر). يرجى إضافة مفتاح API خاص بك في الإعدادات أو الترقية لباقة Growth.' 
        };
      }
      
      // Increment platform key usage
      user.dailyMessagesUsed += 1;
      user.monthlyMessagesUsed += 1;
      await user.save();
      return { allowed: true, useBackup: false };
    }

    // 2. GROWTH Tier Limits
    if (tier.startsWith('growth')) {
      let monthlyLimit = 1000;
      if (tier === 'growth_10k') monthlyLimit = 10000;
      if (tier === 'growth_50k') monthlyLimit = 50000;

      if (user.monthlyMessagesUsed >= monthlyLimit) {
        // If limit is reached, check if backup key is configured
        if (bot.backupApiKey) {
          logger.info(`🔄 Growth limit reached (${user.monthlyMessagesUsed}/${monthlyLimit}). Switching to backup key.`);
          return { allowed: true, useBackup: true };
        } else {
          return {
            allowed: false,
            message: `عذراً، لقد استهلكت كامل رصيد باقة Growth الخاص بك لهذا الشهر (${monthlyLimit} محادثة). يرجى إدخال مفتاح API احتياطي في إعدادات البوت لتجنب انقطاع الخدمة، أو الترقية.`
          };
        }
      }

      // Increment quota usage
      user.monthlyMessagesUsed += 1;
      await user.save();
      return { allowed: true, useBackup: false };
    }

    // 3. UNLIMITED Tier
    if (tier === 'unlimited') {
      return { allowed: true, useBackup: false };
    }

    return { allowed: true, useBackup: false };
  } catch (err) {
    logger.error('❌ Error checking billing limits:', { err });
    return { allowed: true, useBackup: false }; // fallback allow on error
  }
}

module.exports = {
  checkPlanLimitsAndIncrement
};
