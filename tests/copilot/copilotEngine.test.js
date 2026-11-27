'use strict';

// tests/copilot/copilotEngine.test.js
// Tests for botEngine.processMessage in Copilot mode vs Auto vs Manual:
// - Copilot ALWAYS returns null across ALL channels (WhatsApp QR, WhatsApp Cloud,
//   Facebook, Instagram, Web) — NEVER auto-sends
// - Persists inbound customer message, never pushes assistant reply or fires message.sent
// - Skips mutating extractors (extractChatOrderIntent / extractBookingIntent)
// - Supersedes older pending draft when a newer inbound customer message arrives
// - Fails closed (returns null, persists inbound msg, skips AI & draft) when
//   PlatformSetting.copilotEnabled === false
// - Fails closed (returns null, refunds quota) when AI completion errors
// - Records AiUsageEvent with feature: 'copilot'
// - Auto & Manual replyMode behavior unchanged

process.env.NODE_ENV = 'test';
process.env.CHANNELS_MODE = 'on';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const Conversation = require('../../server/models/Conversation');
const ChatOrder = require('../../server/models/ChatOrder');
const Booking = require('../../server/models/Booking');
const CopilotDraft = require('../../server/models/CopilotDraft');
const PlatformSetting = require('../../server/models/PlatformSetting');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const AiUsageEvent = require('../../server/models/AiUsageEvent');
const Notification = require('../../server/models/Notification');

const aiFailover = require('../../server/services/aiFailover');
const billingLimits = require('../../server/services/billingLimits');
const webhookDispatcher = require('../../server/services/webhookDispatcher');
const { invalidatePlatformSettingsCache } = require('../../server/services/platformSettingsService');

// Stub external AI & billing/webhook side-effects cleanly BEFORE requiring botEngine
const aiCalls = [];
const webhookEvents = [];
let quotaRefunds = 0;
let aiBehavior = async (options, bot) => {
  aiCalls.push({ options, botId: String(bot?._id || '') });
  // Persist real AiUsageEvent mirroring aiFailover.recordLegacyUsage so
  // feature:'copilot' tagging is verified end-to-end in MongoDB.
  if (bot?.userId) {
    await AiUsageEvent.create({
      requestId: `req-${Date.now()}-${aiCalls.length}`,
      userId: bot.userId,
      botId: bot._id,
      provider: 'openai',
      modelId: String(options?.model || 'gpt-4o-mini'),
      tier: 'legacy',
      useCase: options?.useCase || 'general',
      attempt: 1,
      success: true,
      inputTokens: 40,
      outputTokens: 25,
      totalTokens: 65,
      latencyMs: 50,
      errorClass: 'none',
      retryable: false,
      fallbackUsed: false,
      source: 'legacy-global-key',
      feature: options?.feature || null,
      operationId: options?.operationId || null,
      stage: options?.stage || null,
      agentRole: options?.agentRole || null,
    });
  }
  const sys = String(options?.messages?.[0]?.content || '');
  if (sys.includes('استخلاص طلبات العملاء')) {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            isOrder: true,
            customerName: 'أحمد علي',
            customerPhone: '01012345678',
            customerAddress: 'المعادي القاهرة شارع 9',
            items: [{ title: 'تيشيرت أسود', quantity: 1, price: 250 }],
          }),
        },
      }],
    };
  }
  if (sys.includes('استخلاص بيانات حجز المواعيد')) {
    return {
      choices: [{
        message: {
          content: JSON.stringify({
            isBooking: true,
            customerName: 'أحمد علي',
            customerPhone: '01012345678',
            serviceType: 'استشارة',
            bookingDate: '2026-12-01T15:00:00Z',
          }),
        },
      }],
    };
  }
  return {
    choices: [{ message: { content: 'أهلاً بك! سعر التيشيرت الأسود 250 جنيه ومتاح حالياً.' } }],
  };
};

const originalGetAiCompletion = aiFailover.getAiCompletion;
const originalCheckPlanLimits = billingLimits.checkPlanLimitsAndIncrement;
const originalSettleQuota = billingLimits.settleMessageQuota;
const originalDispatchWebhook = webhookDispatcher.dispatchWebhook;

aiFailover.getAiCompletion = (options, bot, useBackup) => aiBehavior(options, bot, useBackup);
billingLimits.checkPlanLimitsAndIncrement = async () => ({ allowed: true, useBackup: false });
billingLimits.settleMessageQuota = async () => { quotaRefunds += 1; };
webhookDispatcher.dispatchWebhook = (userId, botId, event, payload) => {
  webhookEvents.push({ userId: String(userId), botId: String(botId), event, payload });
};

// Clear cached botEngine so it binds to the stubbed service exports above
delete require.cache[require.resolve('../../server/botEngine')];
const botEngine = require('../../server/botEngine');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-slice4-engine-test'));
});

test.after(async () => {
  aiFailover.getAiCompletion = originalGetAiCompletion;
  billingLimits.checkPlanLimitsAndIncrement = originalCheckPlanLimits;
  billingLimits.settleMessageQuota = originalSettleQuota;
  webhookDispatcher.dispatchWebhook = originalDispatchWebhook;
  await mongoose.disconnect();
  await mongod.stop();
});

async function resetDb() {
  aiCalls.length = 0;
  webhookEvents.length = 0;
  quotaRefunds = 0;
  invalidatePlatformSettingsCache();
  await Promise.all([
    User.deleteMany({}),
    Bot.deleteMany({}),
    Conversation.deleteMany({}),
    ChatOrder.deleteMany({}),
    Booking.deleteMany({}),
    CopilotDraft.deleteMany({}),
    PlatformSetting.deleteMany({}),
    AssistantActionAudit.deleteMany({}),
    AiUsageEvent.deleteMany({}),
    Notification.deleteMany({}),
  ]);
}

async function setPlatformCopilot(enabled) {
  await PlatformSetting.findOneAndUpdate(
    { key: 'platform_settings' },
    { $set: { copilotEnabled: enabled } },
    { upsert: true, new: true }
  );
  invalidatePlatformSettingsCache();
}

async function seedBot(replyMode = 'copilot') {
  const user = await User.create({
    username: `merchant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    email: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@test.local`,
    role: 'user',
    status: 'active',
  });
  const bot = await Bot.create({
    name: `Bot_${replyMode}`,
    userId: user._id,
    isActive: true,
    autoReplyEnabled: replyMode !== 'manual',
    replyMode,
    copilotSettings: {
      notifyChannels: { inApp: true, whatsappToMerchant: false, telegramToMerchant: false },
      draftTtlMinutes: 60,
    },
  });
  botEngine.invalidateBotCache(bot._id);
  return { user, bot };
}

test('copilot mode returns null across ALL channels (WhatsApp QR, WhatsApp Cloud, Facebook, Instagram, Web), persists inbound, skips mutating extractors, and logs AiUsageEvent feature=copilot', async () => {
  await resetDb();
  await setPlatformCopilot(true);
  const { user, bot } = await seedBot('copilot');

  const channels = [
    { channel: 'whatsapp', userId: '201012345678@c.us', label: 'WhatsApp QR' },
    { channel: 'whatsapp', userId: '201098765432', label: 'WhatsApp Cloud' },
    { channel: 'facebook', userId: 'facebook_psid_12345', label: 'Facebook' },
    { channel: 'instagram', userId: 'instagram_ig_67890', label: 'Instagram' },
    { channel: 'web', userId: 'web_visitor_1', label: 'Web' },
  ];

  // Include both order details AND booking keywords to verify mutating extractors are skipped
  const customerMsg = 'عايز اطلب تيشيرت أسود وعايز أحجز موعد يوم 1 ديسمبر الساعة 5 اسمي أحمد رقمي 01012345678 العنوان المعادي';

  for (let i = 0; i < channels.length; i += 1) {
    const c = channels[i];
    const reply = await botEngine.processMessage(
      String(bot._id),
      c.userId,
      customerMsg,
      false,
      false,
      `in_msg_${i}`,
      c.channel
    );

    assert.equal(reply, null, `${c.label} MUST return null in copilot mode (never auto-send)`);

    const convo = await Conversation.findOne({ botId: bot._id, userId: c.userId }).lean();
    assert.ok(convo, `${c.label} conversation should be persisted`);
    assert.equal(convo.messages.length, 1, `${c.label} should persist inbound user message ONLY (no assistant auto-reply pushed)`);
    assert.equal(convo.messages[0].role, 'user');
    assert.equal(convo.messages[0].content, customerMsg);
    assert.equal(convo.isHumanHandling, false);

    const draft = await CopilotDraft.findOne({ conversationId: convo._id, status: 'pending' }).lean();
    assert.ok(draft, `${c.label} should create a pending CopilotDraft`);
    assert.equal(String(draft.merchantUserId), String(user._id));
    assert.equal(draft.triggerMessageId, `in_msg_${i}`);
    assert.ok(draft.suggestedReply.includes('250'));
    assert.equal(draft.delivered, false);
  }

  // Zero mutating extractors executed (no ChatOrder, no Booking, no extractor prompts called)
  assert.equal(await ChatOrder.countDocuments({}), 0, 'copilot must NOT create ChatOrder while drafting');
  assert.equal(await Booking.countDocuments({}), 0, 'copilot must NOT create Booking while drafting');
  const extractorCalls = aiCalls.filter((c) => {
    const sys = String(c.options?.messages?.[0]?.content || '');
    return sys.includes('استخلاص طلبات العملاء') || sys.includes('استخلاص بيانات حجز المواعيد');
  });
  assert.equal(extractorCalls.length, 0, 'mutating extractors must not even be invoked in copilot mode');

  // No message.sent webhook fired while drafting
  const sentHooks = webhookEvents.filter((w) => w.event === 'message.sent');
  assert.equal(sentHooks.length, 0, 'message.sent webhook must not fire for unsent drafts');

  // AiUsageEvent records tagged with feature: 'copilot'
  const usageRows = await AiUsageEvent.find({ botId: bot._id, feature: 'copilot' }).lean();
  assert.equal(usageRows.length, channels.length);
  for (const row of usageRows) {
    assert.equal(row.feature, 'copilot');
    assert.equal(row.stage, 'draft_generate');
  }

  // Audit entries recorded for draft creation
  const createdAudits = await AssistantActionAudit.find({
    merchantUserId: user._id,
    eventType: 'copilot.draft.created',
  }).lean();
  assert.equal(createdAudits.length, channels.length);
});

test('copilot mode supersedes older pending draft when a newer inbound customer message arrives', async () => {
  await resetDb();
  await setPlatformCopilot(true);
  const { bot } = await seedBot('copilot');

  const r1 = await botEngine.processMessage(
    String(bot._id),
    '201055551111@c.us',
    'بكام التيشيرت؟',
    false,
    false,
    'msg_first',
    'whatsapp'
  );
  assert.equal(r1, null);

  const convo = await Conversation.findOne({ botId: bot._id, userId: '201055551111@c.us' }).lean();
  const firstDraft = await CopilotDraft.findOne({ conversationId: convo._id }).lean();
  assert.equal(firstDraft.status, 'pending');

  const r2 = await botEngine.processMessage(
    String(bot._id),
    '201055551111@c.us',
    'وهل فيه مقاس لارج؟',
    false,
    false,
    'msg_second',
    'whatsapp'
  );
  assert.equal(r2, null);

  const allDrafts = await CopilotDraft.find({ conversationId: convo._id }).sort({ createdAt: 1 }).lean();
  assert.equal(allDrafts.length, 2);
  assert.equal(allDrafts[0].status, 'superseded', 'older pending draft must be marked superseded');
  assert.equal(allDrafts[1].status, 'pending', 'newest draft must be the single pending draft');
  assert.equal(allDrafts[1].triggerMessageId, 'msg_second');

  const pendingCount = await CopilotDraft.countDocuments({ conversationId: convo._id, status: 'pending' });
  assert.equal(pendingCount, 1, 'strictly one pending draft per conversation');
});

test('copilot mode fails closed when PlatformSetting.copilotEnabled=false (returns null, persists inbound, zero AI call, zero draft, no auto-reply fallback)', async () => {
  await resetDb();
  await setPlatformCopilot(false);
  const { bot } = await seedBot('copilot');

  const reply = await botEngine.processMessage(
    String(bot._id),
    '201077771111@c.us',
    'السلام عليكم عايز أطلب',
    false,
    false,
    'msg_killswitch',
    'whatsapp'
  );

  assert.equal(reply, null, 'must fail closed with null when copilotEnabled is false');
  assert.equal(aiCalls.length, 0, 'must not call AI when copilotEnabled is false');
  assert.equal(await CopilotDraft.countDocuments({}), 0, 'must not create CopilotDraft when copilotEnabled is false');
  assert.equal(await ChatOrder.countDocuments({}), 0, 'must not mutate orders when copilotEnabled is false');

  const convo = await Conversation.findOne({ botId: bot._id, userId: '201077771111@c.us' }).lean();
  assert.ok(convo, 'inbound conversation must still be persisted');
  assert.equal(convo.messages.length, 1);
  assert.equal(convo.messages[0].role, 'user');
  assert.equal(convo.messages[0].content, 'السلام عليكم عايز أطلب');
});

test('copilot mode fails closed when AI throws an error (returns null, never auto-sends error string, refunds quota)', async () => {
  await resetDb();
  await setPlatformCopilot(true);
  const { bot } = await seedBot('copilot');

  const prevBehavior = aiBehavior;
  aiBehavior = async () => {
    throw new Error('Upstream provider outage');
  };

  try {
    const reply = await botEngine.processMessage(
      String(bot._id),
      '201088881111@c.us',
      'لو سمحت السعر كام؟',
      false,
      false,
      'msg_ai_fail',
      'whatsapp'
    );

    assert.equal(reply, null, 'copilot MUST return null on AI failure — never an error string');
    assert.equal(quotaRefunds, 1, 'reserved quota must be refunded on AI error');
    assert.equal(await CopilotDraft.countDocuments({}), 0);

    const convo = await Conversation.findOne({ botId: bot._id, userId: '201088881111@c.us' }).lean();
    assert.equal(convo.messages.length, 1, 'inbound message persisted, no assistant error message pushed');
    assert.equal(convo.messages[0].role, 'user');
  } finally {
    aiBehavior = prevBehavior;
  }
});

test('replyMode auto and manual behaviors remain unchanged', async () => {
  await resetDb();
  await setPlatformCopilot(true);

  // Auto mode: auto-replies as usual, pushes assistant message, creates no CopilotDraft
  const { bot: autoBot } = await seedBot('auto');
  const autoReply = await botEngine.processMessage(
    String(autoBot._id),
    '201099991111@c.us',
    'بكام الشحن؟',
    false,
    false,
    'msg_auto',
    'whatsapp'
  );
  assert.equal(typeof autoReply, 'string');
  assert.ok(autoReply.length > 0);
  assert.equal(await CopilotDraft.countDocuments({ botId: autoBot._id }), 0);
  const autoConvo = await Conversation.findOne({ botId: autoBot._id, userId: '201099991111@c.us' }).lean();
  assert.equal(autoConvo.messages.length, 2);
  assert.equal(autoConvo.messages[1].role, 'assistant');

  // Manual mode: returns null, zero AI calls, zero CopilotDraft
  aiCalls.length = 0;
  const { bot: manualBot } = await seedBot('manual');
  const manualReply = await botEngine.processMessage(
    String(manualBot._id),
    '201099992222@c.us',
    'مرحبا',
    false,
    false,
    'msg_manual',
    'whatsapp'
  );
  assert.equal(manualReply, null);
  assert.equal(aiCalls.length, 0);
  assert.equal(await CopilotDraft.countDocuments({ botId: manualBot._id }), 0);
});
