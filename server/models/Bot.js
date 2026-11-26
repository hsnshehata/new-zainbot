// server/models/Bot.js
const mongoose = require('mongoose');
const { encryptChannelToken } = require('../services/channelTokenCrypto');

const botSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Channel tokens are encrypted at rest by the setter (CREDENTIAL_ENCRYPTION_KEY).
  // Reads stay ciphertext: every use site must call decryptChannelToken().
  // Legacy plaintext rows keep working until the owner's next save.
  facebookApiKey: { type: String, trim: true, set: encryptChannelToken },
  facebookPageId: { type: String, trim: true },
  instagramApiKey: { type: String, trim: true, set: encryptChannelToken },
  instagramPageId: { type: String, trim: true },
  // إضافة حقول واتساب
  whatsappBusinessAccountId: { type: String, trim: true },
  whatsappApiKey: { type: String, trim: true, set: encryptChannelToken },
  lastWhatsappTokenRefresh: { type: Date },
  isActive: { type: Boolean, default: true },
  autoStopDate: { type: Date },
  subscriptionType: { type: String, enum: ['free', 'monthly', 'yearly'], default: 'free' },
  welcomeMessage: { type: String, trim: true },
  agentType: {
    type: String,
    enum: ['customer_support', 'sales', 'lead_qualification', 'custom'],
    default: 'customer_support',
  },
  description: { type: String, trim: true, maxlength: 500, default: '' },
  customInstructions: { type: String, trim: true, maxlength: 12_000, default: '' },
  objectives: [{ type: String, trim: true, maxlength: 300 }],
  handoffKeywords: [{ type: String, trim: true, maxlength: 100 }],
  autoReplyEnabled: { type: Boolean, default: true },

  // أدوات ومهارات الوكيل الذكي
  agentTools: {
    bookingTool: {
      enabled: { type: Boolean, default: true },
      autoConfirm: { type: Boolean, default: false },
      slotDuration: { type: Number, default: 30 },
      workingHours: { type: String, trim: true, default: '09:00 - 22:00' },
      defaultService: { type: String, trim: true, default: 'استشارة / موعد' }
    },
    orderTrackingTool: {
      enabled: { type: Boolean, default: true },
      requirePhone: { type: Boolean, default: true }
    },
    whatsappNotificationTool: {
      enabled: { type: Boolean, default: true },
      notifyOnOrder: { type: Boolean, default: true },
      notifyOnBooking: { type: Boolean, default: true }
    },
    telegramNotificationTool: {
      enabled: { type: Boolean, default: true },
      notifyOnOrder: { type: Boolean, default: true },
      notifyOnBooking: { type: Boolean, default: true }
    },
    messageClassificationTool: {
      enabled: { type: Boolean, default: true },
      autoTag: { type: Boolean, default: true }
    },
    salesRecoveryTool: {
      enabled: { type: Boolean, default: true },
      delayHours: { type: Number, default: 2 },
      customMessage: { type: String, trim: true, default: '' }
    },
    dailyDigestTool: {
      enabled: { type: Boolean, default: true },
      preferredChannel: { type: String, enum: ['all', 'telegram', 'whatsapp', 'in_app'], default: 'all' },
      digestTime: { type: String, trim: true, default: '21:00' }
    },
    salesUpsellTool: {
      enabled: { type: Boolean, default: true },
      salesTone: { type: String, enum: ['consultative', 'enthusiastic', 'formal'], default: 'consultative' },
      maxDiscountPercent: { type: Number, default: 0 }
    }
  },
  agentSkills: [{
    type: String,
    trim: true,
  }],
  // إعدادات Webhook لفيسبوك
  messagingOptinsEnabled: { type: Boolean, default: true },
  messageReactionsEnabled: { type: Boolean, default: true },
  messagingReferralsEnabled: { type: Boolean, default: true },
  messageEditsEnabled: { type: Boolean, default: true },
  inboxLabelsEnabled: { type: Boolean, default: true },
  commentsRepliesEnabled: { type: Boolean, default: true },

  // إعدادات الرد على التعليقات (جديد)
  commentReplyMode: {
    type: String,
    enum: ['ai', 'keyword', 'private'],
    default: 'ai'
  },
  commentKeywords: [{
    keywords: [String], // مصفوفة كلمات مفتاحية
    reply: String,      // الرد المرتبط بها
    matchType: { type: String, enum: ['exact', 'partial'], default: 'partial' }
  }],
  commentDefaultReply: { type: String, trim: true }, // الرد الافتراضي في وضع الكلمات المفتاحية
  privateReplyMessage: { type: String, trim: true, default: 'تم إرسال التفاصيل على الخاص' }, // الرد العام في وضع الرد الخاص

  // إعدادات إيقاف الردود بكلمة مفتاحية من المالك
  ownerPauseKeyword: { type: String, trim: true },
  ownerPauseDurationMinutes: { type: Number, default: 30 },
  workingHours: {
    type: new mongoose.Schema({
      start: { type: String, trim: true },
      end: { type: String, trim: true },
    }, { _id: false }),
    default: undefined,
  },
  // إعدادات Webhook لإنستجرام
  instagramMessagingOptinsEnabled: { type: Boolean, default: true },
  instagramMessageReactionsEnabled: { type: Boolean, default: true },
  instagramMessagingReferralsEnabled: { type: Boolean, default: true },
  instagramMessageEditsEnabled: { type: Boolean, default: true },
  instagramInboxLabelsEnabled: { type: Boolean, default: true },
  instagramCommentsRepliesEnabled: { type: Boolean, default: true },
  // إعدادات Webhook لواتساب
  whatsappMessagingOptinsEnabled: { type: Boolean, default: true },
  whatsappMessageReactionsEnabled: { type: Boolean, default: true },
  whatsappMessagingReferralsEnabled: { type: Boolean, default: true },
  whatsappMessageEditsEnabled: { type: Boolean, default: true },
  // تواريخ الربط
  lastFacebookTokenRefresh: { type: Date }, // أضفنا الحقل هنا
  lastInstagramTokenRefresh: { type: Date },
  // إضافة حقل لربط المتجر (جديد)
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
  // تكامل تيليجرام لكل بوت على حدة
  telegramUserId: { type: String, default: '', index: true },
  telegramUsername: { type: String, default: '' },
  telegramLinkCode: { type: String, default: '' },
  telegramLinkExpiresAt: { type: Date, default: null },
  telegramNotifications: {
    newOrder: { type: Boolean, default: true },
    orderStatus: { type: Boolean, default: true },
    chatOrder: { type: Boolean, default: true },
    dailySummary: { type: Boolean, default: false },
  },
  telegramLanguage: { type: String, enum: ['ar', 'en'], default: 'ar' },
  // مفاتيح مخصصة للمستخدم
  userApiKey: { type: String, trim: true },
  userProvider: { type: String, enum: ['openai', 'gemini', 'anthropic', 'openrouter', 'custom'], default: 'openai' },
  userModel: { type: String, trim: true },
  userBaseUrl: { type: String, trim: true },
  // مفتاح احتياطي لمنع الانقطاع
  backupApiKey: { type: String, trim: true },
  backupProvider: { type: String, enum: ['openai', 'gemini', 'anthropic', 'openrouter', 'custom'], default: 'openai' },
  backupModel: { type: String, trim: true },
  backupBaseUrl: { type: String, trim: true },
  archivedAt: { type: Date, default: null, index: true },
  createdAt: { type: Date, default: Date.now },
});

// NOTE: legacy plaintext rows are NOT auto-migrated on unrelated saves.
// The setter encrypts only when the owner explicitly writes a token field;
// reads of legacy rows pass through decryptChannelToken unchanged. Migrating
// existing rows needs the owner's explicit approval and a bounded plan.

module.exports = mongoose.model('Bot', botSchema);
