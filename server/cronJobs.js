const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const Bot = require('./models/Bot');
const Notification = require('./models/Notification');
const Product = require('./models/Product');
const Store = require('./models/Store');
const Conversation = require('./models/Conversation');
const ChatOrder = require('./models/ChatOrder');
const Booking = require('./models/Booking');
const axios = require('axios');
const logger = require('./logger');
const { redactSensitive } = require('./utils/logSanitize');
const { dispatchMultiChannelNotification } = require('./services/notificationDispatcher');
const { exchangeLongLivedToken, getFacebookAppCredentials, classifyGraphFailure } = require('./services/metaAppCredentials');
const { decryptChannelToken } = require('./services/channelTokenCrypto');

// دالة للتحقق من صلاحية التوكين
// Returns 'valid', 'invalid' (the provider rejected the TOKEN under primary Graph code 190/102 with no transient/throttle evidence;
// see classifyGraphFailure) or 'unknown' (transient, or any other 4xx such as 400 code 100 or a permission code). Only 'invalid'
// may lead to a relink notice. The token goes in params, never in a URL string, and only
// the HTTP status and a fixed error code are logged (never the message, body or config).
const SAFE_VALIDATION_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_NETWORK']);
const isTokenValid = async (accessToken, pageId) => {
  try {
    await axios.get(`https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}`, {
      params: { fields: 'id', access_token: accessToken },
      timeout: 10000,
    });
    logger.info('✅ Token is valid', { pageId });
    return 'valid';
  } catch (err) {
    const c = classifyGraphFailure(err);
    const code = err && SAFE_VALIDATION_CODES.has(err.code) ? err.code : undefined;
    logger.error('❌ Token validation failed', { pageId, code, ...c });
    return c.kind === 'invalid' ? 'invalid' : 'unknown';
  }
};

// Bot.facebookApiKey / instagramApiKey are encrypted at rest by the schema setter and the
// getter returns the stored ciphertext ('chv1:...'), so every Graph call must use the
// decrypted value. A decrypt failure is a server-side key/config fault, never the
// merchant's: return null (caller skips, logs a fixed code, sends no relink notice).
const readChannelToken = (bot, field, logEvent) => {
  try {
    const token = decryptChannelToken(bot[field]);
    return token && token.trim() ? token : null;
  } catch (err) {
    logger.error(logEvent, { botId: bot._id, code: err && err.code ? String(err.code) : 'DECRYPT_FAILED' });
    return null;
  }
};

// دالة لتحويل توكن قصير أو تجديد توكن طويل لفيسبوك
const convertToLongLivedToken = async (shortLivedToken) => {
  try {
    const newToken = await exchangeLongLivedToken(shortLivedToken, { graphVersion: 'v20.0' }); // pinned to the pre-extraction version
    // Never log token material, not even a prefix.
    logger.info('✅ Successfully converted/renewed Facebook token');
    return newToken;
  } catch (err) {
    logger.error('❌ Error converting/renewing Facebook token', { error: err.response?.data ? redactSensitive(err.response.data) : err.message, code: err.code });
    throw err;
  }
};

// وظيفة دورية للتحقق من تاريخ الإيقاف التلقائي
const checkAutoStopBots = () => {
  return cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('⏰ Starting auto-stop bot check...');
      const currentDate = new Date();

      const expiredBots = await Bot.find({
        isActive: true,
        autoStopDate: { $ne: null, $lte: currentDate }
      });

      if (expiredBots.length === 0) {
        logger.info('✅ No bots found with expired subscriptions.');
        return;
      }

      const updateResult = await Bot.updateMany(
        {
          _id: { $in: expiredBots.map(bot => bot._id) },
          isActive: true
        },
        { $set: { isActive: false } }
      );

      logger.info('✅ Updated bots to inactive due to expired subscriptions.', { modifiedCount: updateResult.modifiedCount });

      for (const bot of expiredBots) {
        const notification = new Notification({
          user: bot.userId,
          title: `توقف البوت ${bot.name}`,
          message: `البوت ${bot.name} توقف تلقائيًا بسبب انتهاء الاشتراك بتاريخ ${new Date(bot.autoStopDate).toLocaleDateString('ar-EG')}. يمكنك تجديد الاشتراك من لوحة التحكم.`,
          isRead: false
        });
        await notification.save();
        logger.info('✅ Notification sent for expired bot', { userId: bot.userId, botName: bot.name });
      }

      logger.info('⏰ Auto-stop bot check completed successfully.');
    } catch (err) {
      logger.error('❌ Error in auto-stop bot check', { err });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// وظيفة دورية لتجديد توكنات إنستجرام
const refreshInstagramTokens = () => {
  return cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('⏰ Starting Instagram token refresh check...');

      const botsWithInstagram = await Bot.find({
        instagramApiKey: { $ne: null },
        instagramPageId: { $ne: null }
      });

      if (botsWithInstagram.length === 0) {
        logger.info('✅ No bots found with Instagram tokens to refresh.');
        return;
      }

      logger.info('🔄 Bots with Instagram tokens to refresh', { count: botsWithInstagram.length });

      const fiftyDaysInMs = 50 * 24 * 60 * 60 * 1000;
      const currentDate = new Date();

      for (const bot of botsWithInstagram) {
        try {
          const lastRefresh = bot.lastInstagramTokenRefresh ? new Date(bot.lastInstagramTokenRefresh) : null;
          const shouldRefresh = !lastRefresh || (currentDate - lastRefresh) >= fiftyDaysInMs;

          if (!shouldRefresh) {
            logger.info('⏳ Skipping Instagram token refresh', { botId: bot._id, lastRefreshed: lastRefresh?.toISOString() });
            continue;
          }

          const currentToken = readChannelToken(bot, 'instagramApiKey', 'instagram_token_decrypt_failed_skipped');
          if (!currentToken) continue;
          logger.info('🔄 Attempting to refresh Instagram token', { botId: bot._id });

          let refreshResponse;
          try {
            refreshResponse = await axios.get('https://graph.instagram.com/refresh_access_token', {
              params: { grant_type: 'ig_refresh_token', access_token: currentToken },
              timeout: 10000,
            });
          } catch (httpErr) {
            // Log only the HTTP status and a fixed code. Transient failures (no response, timeout,
            // 5xx, 408, 429) are retried by the next daily run without notifying the merchant.
            const c = classifyGraphFailure(httpErr);
            logger.error('instagram_token_refresh_http_failed', { botId: bot._id, ...c });
            if (c.kind !== 'invalid') continue;
            throw new Error('Instagram token refresh rejected by provider');
          }

          if (typeof refreshResponse.data?.access_token !== 'string' || !refreshResponse.data.access_token.trim() || refreshResponse.data.access_token !== refreshResponse.data.access_token.trim()) {
            logger.error('❌ Failed to refresh Instagram token', { botId: bot._id, hasBody: Boolean(refreshResponse.data) });
            const notification = new Notification({
              user: bot.userId,
              title: `فشل تجديد توكن إنستجرام للبوت ${bot.name}`,
              message: `فشل في تجديد توكن إنستجرام للبوت ${bot.name}. يرجى إعادة ربط الحساب من لوحة التحكم.`,
              isRead: false
            });
            await notification.save();
            logger.info('✅ Notification sent for failed Instagram token refresh', { userId: bot.userId, botId: bot._id });
            continue;
          }

          const newToken = refreshResponse.data.access_token;
          // Provider-controlled and unvalidated: log it only as a bounded non-negative integer.
          const rawExpires = refreshResponse.data.expires_in;
          const expiresIn = Number.isInteger(rawExpires) && rawExpires >= 0 && rawExpires <= 31536000 * 2 ? rawExpires : undefined;

          bot.instagramApiKey = newToken;
          bot.lastInstagramTokenRefresh = new Date();
          await bot.save();

          logger.info('✅ Successfully refreshed Instagram token', { botId: bot._id, expiresIn });
        } catch (err) {
          logger.error('❌ Error refreshing Instagram token', { botId: bot._id, code: err && err.code ? String(err.code) : undefined });
          const notification = new Notification({
            user: bot.userId,
            title: `فشل تجديد توكن إنستجرام للبوت ${bot.name}`,
            message: `فشل في تجديد توكن إنستجرام للبوت ${bot.name}. يرجى إعادة ربط الحساب من لوحة التحكم.`,
            isRead: false
          });
          await notification.save();
          logger.info('✅ Notification sent for failed Instagram token refresh', { userId: bot.userId, botId: bot._id });
        }
      }

      logger.info('⏰ Instagram token refresh check completed successfully.');
    } catch (err) {
      logger.error('❌ Error in Instagram token refresh check', { err });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// وظيفة دورية لتجديد توكنات فيسبوك
const refreshFacebookTokens = () => {
  return cron.schedule('0 0 * * 0', async () => {
    try {
      logger.info('⏰ Starting Facebook token refresh check...');

      const botsWithFacebook = await Bot.find({
        facebookApiKey: { $ne: null },
        facebookPageId: { $ne: null }
      });

      if (botsWithFacebook.length === 0) {
        logger.info('✅ No bots found with Facebook tokens to refresh.');
        return;
      }

      logger.info('🔄 Bots with Facebook tokens to refresh', { count: botsWithFacebook.length });

      // A server-side setup fault (Meta app not configured) is not a merchant fault:
      // check before any Graph request and never tell merchants to relink for it.
      try {
        getFacebookAppCredentials();
      } catch (configErr) {
        if (configErr.code === 'META_APP_NOT_CONFIGURED') {
          logger.error('facebook_token_refresh_skipped_app_not_configured', { missing: configErr.missing, botCount: botsWithFacebook.length });
          return;
        }
        throw configErr;
      }

      const fiftyDaysInMs = 50 * 24 * 60 * 60 * 1000;
      const currentDate = new Date();

      for (const bot of botsWithFacebook) {
        try {
          const lastRefresh = bot.lastFacebookTokenRefresh ? new Date(bot.lastFacebookTokenRefresh) : null;
          const shouldRefresh = !lastRefresh || (currentDate - lastRefresh) >= fiftyDaysInMs;

          if (!shouldRefresh) {
            logger.info('⏳ Skipping Facebook token refresh', { botId: bot._id, lastRefreshed: lastRefresh?.toISOString() });
            continue;
          }

          const currentToken = readChannelToken(bot, 'facebookApiKey', 'facebook_token_decrypt_failed_skipped');
          if (!currentToken) continue;
          logger.info('🔄 Attempting to validate Facebook token', { botId: bot._id });

          // التحقق من صلاحية التوكين
          const validity = await isTokenValid(currentToken, bot.facebookPageId);
          if (validity === 'valid') {
            logger.info('✅ Facebook token still valid', { botId: bot._id });
            continue;
          }
          if (validity === 'unknown') {
            // Transient or unclassifiable failure: do not exchange, do not tell the merchant to relink.
            logger.warn('facebook_token_validation_inconclusive_skipped', { botId: bot._id });
            continue;
          }

          logger.warn('⚠️ Facebook token invalid, attempting to refresh', { botId: bot._id });
          const newToken = await convertToLongLivedToken(currentToken);

          bot.facebookApiKey = newToken;
          bot.lastFacebookTokenRefresh = new Date();
          await bot.save();

          logger.info('✅ Successfully refreshed Facebook token', { botId: bot._id });
        } catch (err) {
          if (err.code === 'META_APP_NOT_CONFIGURED') {
            logger.error('facebook_token_refresh_skipped_app_not_configured', { botId: bot._id, missing: err.missing });
            continue;
          }
          if (err && err.name === 'MetaTokenExchangeError' && err.kind === 'transient') {
            // The token was definitively rejected by validation, but the exchange failed for a
            // temporary reason: retry on the next run, do not send a relink notice yet.
            logger.warn('facebook_token_exchange_transient_skipped', { botId: bot._id, status: err.status, graphCode: err.graphCode });
            continue;
          }
          logger.error('❌ Error refreshing Facebook token', { botId: bot._id, errorName: err && err.name, code: err && err.code ? String(err.code) : undefined, status: Number.isInteger(err && err.status) ? err.status : undefined, graphCode: Number.isInteger(err && err.graphCode) ? err.graphCode : undefined });
          const notification = new Notification({
            user: bot.userId,
            title: `فشل تجديد توكن فيسبوك للبوت ${bot.name}`,
            message: `فشل في تجديد توكن فيسبوك للبوت ${bot.name}. يرجى إعادة ربط الحساب من لوحة التحكم.`,
            isRead: false
          });
          await notification.save();
          logger.info('✅ Notification sent for failed Facebook token refresh', { userId: bot.userId, botId: bot._id });
        }
      }

      logger.info('⏰ Facebook token refresh check completed successfully.');
    } catch (err) {
      logger.error('❌ Error in Facebook token refresh check', { err });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// وظيفة دورية للتحقق من المخزون المنخفض
const checkLowStock = () => {
  return cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('⏰ Starting low stock check...');

      const lowStockProducts = await Product.find({
        stock: { $lte: 10 },
        isActive: true
      });

      if (lowStockProducts.length === 0) {
        logger.info('✅ No products found with low stock.');
        return;
      }

      logger.info('🔄 Found products with low stock', { count: lowStockProducts.length });

      for (const product of lowStockProducts) {
        const store = await Store.findById(product.storeId);
        if (!store?.userId) {
          logger.warn('⚠️ Store not found for product', { storeId: product.storeId, productId: product._id });
          continue;
        }

        const notification = new Notification({
          user: store.userId,
          title: `انخفاض مخزون ${product.productName}`,
          message: `المنتج ${product.productName} في متجر ${store.storeName} وصل إلى المخزون المنخفض (${product.stock} وحدة). يرجى إعادة تعبئة المخزون.`,
          isRead: false
        });
        await notification.save();

        dispatchMultiChannelNotification({
          userId: store.userId,
          event: 'low_stock',
          data: {
            message: `المنتج ${product.productName} في متجر ${store.storeName} قارب على النفاد (المتبقي: ${product.stock} فقط). يرجى تزويد المخزون.`
          }
        }).catch((e) => logger.warn('low_stock_dispatch_failed', { err: e.message }));

        logger.info('✅ Notification sent for low stock', { userId: store.userId, productId: product._id });
      }

      logger.info('⏰ Low stock check completed successfully.');
    } catch (err) {
      logger.error('❌ Error in low stock check', { err: err.message });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// تشغيل استعادة المبيعات لبوت معين
async function runBotSalesRecovery(botId) {
  const bot = await Bot.findById(botId).select('_id userId name agentTools isActive');
  if (!bot || !bot.isActive) return { recovered: 0 };
  if (bot.agentTools?.salesRecoveryTool?.enabled === false) return { recovered: 0, disabled: true };

  const delayHours = Number(bot.agentTools?.salesRecoveryTool?.delayHours) || 2;
  const now = Date.now();
  const thresholdAgo = new Date(now - delayHours * 60 * 60 * 1000);
  const maxAgo = new Date(now - 48 * 60 * 60 * 1000);

  const candidateConversations = await Conversation.find({
    botId: bot._id,
    isHumanHandling: false,
    followUpSentAt: { $exists: false },
    $or: [
      { category: { $in: ['مهتم بشدة 🔥', 'طلب أسعار 💰', 'طلب حجز 📅'] } },
      { 'labels.name': { $in: ['مهتم بشدة 🔥', 'طلب أسعار 💰'] } }
    ],
    'messages.timestamp': { $gte: maxAgo, $lte: thresholdAgo }
  }).limit(20);

  let recovered = 0;
  const customMsg = bot.agentTools?.salesRecoveryTool?.customMessage?.trim();
  const followUpText = customMsg || `أهلاً بحضرتك 👋 نتمنى تكون بخير! لاحظنا اهتمامك معنا بالمنتجات، هل تحب نساعدك في إتمام طلبك أو عندك أي استفسار إضافي؟ يسعدنا خدمتك دائماً!`;

  for (const conv of candidateConversations) {
    if (conv.mutedUntil && new Date(conv.mutedUntil) > new Date()) continue;
    if (!conv.messages || conv.messages.length === 0) continue;

    const lastMessage = conv.messages[conv.messages.length - 1];
    if (lastMessage.role === 'assistant' && lastMessage.content.includes('أهلاً بحضرتك')) continue;

    if (conv.channel === 'whatsapp') {
      const cleanPhone = String(conv.userId || '').replace(/[^0-9]/g, '');
      if (!cleanPhone) {
        logger.warn('abandoned_recovery_missing_phone', { convId: conv._id });
        continue;
      }
      try {
        const { getWhatsAppSessionManager } = require('./services/whatsappSessionManager');
        const waManager = getWhatsAppSessionManager();
        await waManager.sendMessage(String(bot._id), `${cleanPhone}@c.us`, followUpText);
      } catch (sendErr) {
        logger.warn('abandoned_recovery_send_failed', { convId: conv._id, err: sendErr.message });
        continue;
      }
    }

    conv.messages.push({
      role: 'assistant',
      content: followUpText,
      messageId: `followup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date()
    });
    conv.followUpSentAt = new Date();
    await conv.save();
    recovered++;
  }

  return { recovered };
}

// تشغيل ملخص المبيعات اليومي لبوت معين
async function runBotDailySummary(botId) {
  const bot = await Bot.findById(botId).select('_id userId name agentTools');
  if (!bot) return null;
  if (bot.agentTools?.dailyDigestTool?.enabled === false) return null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [orders, bookings, convsCount, hotLeadsCount] = await Promise.all([
    ChatOrder.find({ botId: bot._id, createdAt: { $gte: startOfDay } }).select('totalAmount'),
    Booking.find({ botId: bot._id, createdAt: { $gte: startOfDay } }).countDocuments(),
    Conversation.countDocuments({ botId: bot._id, 'messages.timestamp': { $gte: startOfDay } }),
    Conversation.countDocuments({ botId: bot._id, category: 'مهتم بشدة 🔥', 'messages.timestamp': { $gte: startOfDay } })
  ]);

  const ordersCount = orders.length;
  const totalRevenue = orders.reduce((sum, ord) => sum + (Number(ord.totalAmount) || 0), 0);

  const summaryData = {
    conversationsCount: convsCount,
    ordersCount,
    revenue: totalRevenue,
    currency: 'EGP',
    bookingsCount: bookings,
    hotLeadsCount
  };

  if (ordersCount > 0 || bookings > 0 || convsCount > 0) {
    await dispatchMultiChannelNotification({
      userId: bot.userId,
      botId: bot._id,
      event: 'daily_digest',
      data: summaryData
    });
    logger.info('✅ Daily summary dispatched', { botId: bot._id, ordersCount, convsCount, totalRevenue });
  }

  return summaryData;
}

// وظيفة استعادة المحادثات والطلبات المتروكة (Abandoned Sales Recovery)
const recoverAbandonedSalesConversations = () => {
  return cron.schedule('0 * * * *', async () => {
    try {
      logger.info('⏰ Starting abandoned sales recovery check...');
      const activeBots = await Bot.find({ isActive: true }).select('_id userId name');
      if (!activeBots.length) return;

      let totalRecovered = 0;
      for (const bot of activeBots) {
        const res = await runBotSalesRecovery(bot._id);
        totalRecovered += (res?.recovered || 0);
      }

      logger.info('⏰ Abandoned sales recovery check completed.', { totalRecovered });
    } catch (err) {
      logger.error('❌ Error in abandoned sales recovery check', { err: err.message });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// وظيفة ملخص المبيعات والأداء اليومي (Daily Sales & Performance Digest)
const sendDailyPerformanceSummary = () => {
  return cron.schedule('0 21 * * *', async () => {
    try {
      logger.info('⏰ Starting daily performance summary calculation...');
      const activeBots = await Bot.find({ isActive: true }).select('_id userId name');
      if (!activeBots.length) return;

      for (const bot of activeBots) {
        await runBotDailySummary(bot._id);
      }
      logger.info('⏰ Daily performance summary completed.');
    } catch (err) {
      logger.error('❌ Error in daily performance summary', { err: err.message });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// وظيفة تنبيه اقتراب انتهاء الاشتراك قبل 3 أيام
const checkSubscriptionExpiringSoon = () => {
  return cron.schedule('0 10 * * *', async () => {
    try {
      logger.info('⏰ Checking subscriptions expiring soon...');
      const now = new Date();
      const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

      const expiringBots = await Bot.find({
        isActive: true,
        autoStopDate: { $gt: now, $lte: inThreeDays }
      });

      for (const bot of expiringBots) {
        const formattedDate = new Date(bot.autoStopDate).toLocaleDateString('ar-EG');
        const notif = new Notification({
          user: bot.userId,
          title: `تنبيه: اقتراب انتهاء اشتراك ${bot.name}`,
          message: `اشتراك البوت ${bot.name} ينتهي بتاريخ ${formattedDate}. يرجى تجديد الاشتراك لتفادي توقف الوكيل الذكي تلقائياً.`,
          isRead: false
        });
        await notif.save();
      }
      logger.info('⏰ Subscription expiry check completed.', { count: expiringBots.length });
    } catch (err) {
      logger.error('❌ Error in subscription expiry check', { err: err.message });
    }
  }, {
    timezone: 'Africa/Cairo'
  });
};

// تنظيف اللوجز الأقدم من 30 يومًا
const cleanupOldLogs = () => {
  return cron.schedule('0 2 * * *', async () => {
    try {
      const logsDir = path.join(__dirname, 'logs');
      const files = await fs.readdir(logsDir).catch(() => null);
      if (!files || files.length === 0) return;

      const now = Date.now();
      const maxAgeMs = 30 * 24 * 60 * 60 * 1000;

      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.stat(filePath).catch(() => null);
        if (!stats) continue;
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.unlink(filePath).catch(() => null);
          logger.info('old_log_deleted', { file });
        }
      }
    } catch (err) {
      logger.error('log_cleanup_error', { err: err.message });
    }
  }, { timezone: 'Africa/Cairo' });
};

// إرسال التذكيرات المستحقة (مساعد زين):
// - استيلاء ذرّي (findOneAndUpdate على status=pending) حتى لا تلتقط نسختان
//   متزامنتان نفس التذكير فيتكرر الإرسال.
// - النجاح ينقل إلى sent، والفشل يعيد الجدولة بمحاولات محدودة (attempts) حتى
//   maxAttempts ثم failed مع lastError — لا يُفقد تذكير ولا يتكرر بلا حد.
// - التذكيرات العالقة في claimed (انهيار بعد الاستيلاء) تُسترد بعد
//   STALE_CLAIM_MS وتُعامل كمحاولة جديدة.
const Reminder = require('./models/Reminder');
const os = require('os');

const REMINDER_INSTANCE_ID = `${os.hostname()}:${process.pid}`;
const REMINDER_STALE_CLAIM_MS = 10 * 60 * 1000;
const REMINDER_RETRY_BACKOFF_MS = 5 * 60 * 1000;

async function claimNextDueReminder({ now }) {
  const staleBefore = new Date(now.getTime() - REMINDER_STALE_CLAIM_MS);
  return Reminder.findOneAndUpdate(
    {
      $or: [
        {
          status: 'pending',
          dueAt: { $lte: now },
          $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
        },
        { status: 'claimed', claimedAt: { $lte: staleBefore } },
      ],
    },
    {
      $set: { status: 'claimed', claimedAt: now, claimedBy: REMINDER_INSTANCE_ID },
      $inc: { attempts: 1 },
    },
    { sort: { dueAt: 1 }, new: true }
  );
}

async function sendDueReminders({ now = new Date(), limit = 50 } = {}) {
  let sent = 0;
  let failed = 0;
  let claimedCount = 0;

  while (claimedCount < limit) {
    const reminder = await claimNextDueReminder({ now });
    if (!reminder) break;
    claimedCount += 1;

    try {
      await dispatchMultiChannelNotification({
        userId: reminder.user,
        event: 'assistant_reminder',
        data: {
          message: `⏰ تذكير: ${reminder.text}`,
          dueAt: reminder.dueAt,
        },
      });
      reminder.status = 'sent';
      reminder.sentAt = now;
      reminder.lastError = null;
      reminder.nextAttemptAt = null;
      await reminder.save();
      sent += 1;
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      reminder.lastError = message.slice(0, 1000);
      if (reminder.attempts >= reminder.maxAttempts) {
        reminder.status = 'failed';
        reminder.nextAttemptAt = null;
        failed += 1;
        logger.error('❌ Reminder failed permanently', { reminderId: String(reminder._id), attempts: reminder.attempts, err: message });
      } else {
        reminder.status = 'pending';
        reminder.nextAttemptAt = new Date(now.getTime() + REMINDER_RETRY_BACKOFF_MS * reminder.attempts);
        logger.warn('⚠️ Reminder dispatch failed, scheduled retry', { reminderId: String(reminder._id), attempts: reminder.attempts, err: message });
      }
      await reminder.save().catch((saveErr) => {
        logger.error('❌ Error persisting reminder failure state', { reminderId: String(reminder._id), err: saveErr.message });
      });
    }
  }

  return { claimed: claimedCount, sent, failed };
}

const checkDueReminders = () => {
  return cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await sendDueReminders();
      if (result.sent > 0) {
        logger.info('⏰ Due reminders sent.', result);
      }
    } catch (err) {
      logger.error('❌ Error in due reminders check', { err: err.message });
    }
  }, { timezone: 'Africa/Cairo' });
};

// انتهاء صلاحية إجراءات مساعد زين المعلّقة (كل 5 دقائق) وتسجيلها في سجل التدقيق.
async function expireStaleAssistantActions({ now = new Date(), limit = 100 } = {}) {
  const { expireStaleActions } = require('./services/assistantPendingActionService');
  return expireStaleActions({ now, limit });
}

const checkExpiredAssistantActions = () => {
  return cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await expireStaleAssistantActions();
      if (result.expired > 0) {
        logger.info('⏰ Expired stale assistant pending actions.', result);
      }
    } catch (err) {
      logger.error('❌ Error expiring stale assistant pending actions', { err: err.message });
    }
  }, { timezone: 'Africa/Cairo' });
};

// انتهاء صلاحية مسودات وضع المساعدة (Copilot) المعلّقة كل 5 دقائق.
async function expireStaleCopilotDrafts({ now = new Date(), limit = 100 } = {}) {
  const { expireStaleDrafts } = require('./services/copilotService');
  return expireStaleDrafts({ now, limit });
}

const checkExpiredCopilotDrafts = () => {
  return cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await expireStaleCopilotDrafts();
      if (result.expired > 0) {
        logger.info('⏰ Expired stale copilot drafts.', result);
      }
    } catch (err) {
      logger.error('❌ Error expiring stale copilot drafts', { err: err.message });
    }
  }, { timezone: 'Africa/Cairo' });
};

module.exports = {
  checkAutoStopBots,
  refreshInstagramTokens,
  refreshFacebookTokens,
  checkLowStock,
  recoverAbandonedSalesConversations,
  sendDailyPerformanceSummary,
  checkSubscriptionExpiringSoon,
  cleanupOldLogs,
  runBotSalesRecovery,
  runBotDailySummary,
  checkDueReminders,
  sendDueReminders,
  expireStaleAssistantActions,
  checkExpiredAssistantActions,
  expireStaleCopilotDrafts,
  checkExpiredCopilotDrafts,
};
