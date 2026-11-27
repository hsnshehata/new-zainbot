'use strict';

// tests/copilot/copilotMobileApproval.test.js
// Slice 5 tests: Mobile Copilot Approval (Optional Opt-In: Telegram 1-Tap & ZainBot Main WhatsApp)
// - `copilot_draft` notification event in notificationDispatcher.js (opt-in only, HTML escaping,
//   inline keyboard `[✅ إرسال] [❌ تجاهل]`, ZainBot Main WhatsApp via platformWhatsappSession
//   strictly for verifiedWhatsappPhone, CHANNELS_MODE enforcement)
// - Notification failure NEVER breaks CopilotDraft creation in copilotService.createDraftForMessage
// - Telegram inline callbacks (`cp_send:<draftId>` / `cp_drop:<draftId>`) in telegramController.js:
//   strict merchant ownership verification, atomic CAS double-tap single-send, CHANNELS_MODE
//   enforcement (off / allowlist / on), audit logging (sent vs discarded)
// - ZainBot Main WhatsApp replies (`إرسال <code>` / `تعديل <code>: <new text>` / `تجاهل <code>`)
//   in platformMerchantAssistantRouter.js: zero collision with active pending write actions,
//   ownership via verifiedWhatsappPhone, atomic CAS single-send, CHANNELS_MODE enforcement, audit.

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || `hex:${'a'.repeat(64)}`;
process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.CHANNELS_MODE = 'on';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const axios = require('axios');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../../server/models/User');
const Bot = require('../../server/models/Bot');
const Store = require('../../server/models/Store');
const Product = require('../../server/models/Product');
const Conversation = require('../../server/models/Conversation');
const CopilotDraft = require('../../server/models/CopilotDraft');
const Notification = require('../../server/models/Notification');
const PlatformSetting = require('../../server/models/PlatformSetting');
const AssistantPendingAction = require('../../server/models/AssistantPendingAction');
const AssistantActionAudit = require('../../server/models/AssistantActionAudit');
const { invalidatePlatformSettingsCache } = require('../../server/services/platformSettingsService');

// Capture outbound HTTP calls (Facebook customer delivery & Telegram Bot API)
const customerDeliveries = [];
const telegramApiCalls = [];
let customerDeliveryDelayMs = 0;
let telegramApiShouldThrow = false;

const originalAxiosPost = axios.post;
axios.post = async (url, body, config) => {
  const urlStr = String(url || '');
  if (urlStr.includes('api.telegram.org')) {
    if (telegramApiShouldThrow) {
      throw new Error('Simulated Telegram API outage');
    }
    telegramApiCalls.push({ url: urlStr, body, config });
    return { data: { ok: true, result: { message_id: telegramApiCalls.length } } };
  }
  if (customerDeliveryDelayMs > 0) {
    await new Promise((r) => setTimeout(r, customerDeliveryDelayMs));
  }
  customerDeliveries.push({ url: urlStr, body, config });
  return {
    data: {
      recipient_id: body?.recipient?.id || 'rcpt',
      message_id: `mid.${customerDeliveries.length}`,
    },
  };
};

// Stub platformWhatsappSession.sendMessage cleanly so tests verify ZainBot Main sends without Puppeteer
const platformWhatsappSession = require('../../server/services/platformWhatsappSession');
const platformWaSends = [];
let platformWaShouldThrow = false;
const originalPlatformWaSend = platformWhatsappSession.sendMessage;
platformWhatsappSession.sendMessage = async (to, text) => {
  if (platformWaShouldThrow) {
    throw new Error('Simulated Platform WhatsApp outage');
  }
  platformWaSends.push({ to, text });
  return { ok: true, chatId: `${to}@c.us` };
};

const {
  dispatchMultiChannelNotification,
  formatCopilotDraftNotificationMessage,
} = require('../../server/services/notificationDispatcher');
const { createCopilotService } = require('../../server/services/copilotService');
const telegramController = require('../../server/controllers/telegramController');
const { createAssistantWriteTools } = require('../../server/services/assistantWriteTools');
const { createAssistantPendingActionService } = require('../../server/services/assistantPendingActionService');
const {
  createPlatformMerchantAssistantRouter,
  parseCopilotDraftCommand,
} = require('../../server/services/platformMerchantAssistantRouter');

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-slice5-mobile-approval-test'));
  await User.syncIndexes();
  await AssistantPendingAction.syncIndexes();
});

test.after(async () => {
  axios.post = originalAxiosPost;
  platformWhatsappSession.sendMessage = originalPlatformWaSend;
  process.env.CHANNELS_MODE = 'on';
  delete process.env.CHANNELS_ALLOWLIST_BOT_IDS;
  await mongoose.disconnect();
  await mongod.stop();
});

async function resetDb() {
  customerDeliveries.length = 0;
  telegramApiCalls.length = 0;
  platformWaSends.length = 0;
  customerDeliveryDelayMs = 0;
  telegramApiShouldThrow = false;
  platformWaShouldThrow = false;
  process.env.CHANNELS_MODE = 'on';
  delete process.env.CHANNELS_ALLOWLIST_BOT_IDS;
  invalidatePlatformSettingsCache();

  await Promise.all([
    User.deleteMany({}),
    Bot.deleteMany({}),
    Store.deleteMany({}),
    Product.deleteMany({}),
    Conversation.deleteMany({}),
    CopilotDraft.deleteMany({}),
    Notification.deleteMany({}),
    PlatformSetting.deleteMany({}),
    AssistantPendingAction.deleteMany({}),
    AssistantActionAudit.deleteMany({}),
  ]);
}

async function setPlatformFlags({ writeTools = true, copilot = true } = {}) {
  await PlatformSetting.findOneAndUpdate(
    { key: 'platform_settings' },
    {
      $set: {
        assistantWriteToolsEnabled: writeTools,
        copilotEnabled: copilot,
      },
    },
    { upsert: true, new: true }
  );
  invalidatePlatformSettingsCache();
}

async function seedMerchant({
  username,
  email,
  telegramUserId = '',
  botTelegramUserId = '',
  whatsapp = '',
  verifiedWhatsappPhone = '',
  whatsappToMerchant = false,
  telegramToMerchant = false,
  inApp = true,
  writeToolsEnabled = false,
  allowedWriteTools = { createOrder: false, updateInventory: false, messageCustomer: false },
  stock = 20,
}) {
  const userPayload = {
    username,
    email,
    role: 'user',
    status: 'active',
    whatsapp,
    assistantSettings: {
      writeToolsEnabled,
      allowedWriteTools,
      verifiedWhatsappPhone,
      whatsappVerifiedAt: verifiedWhatsappPhone ? new Date() : null,
    },
  };
  if (telegramUserId) {
    userPayload.telegramUserId = telegramUserId;
  }
  const user = await User.create(userPayload);

  const bot = await Bot.create({
    name: `بوت ${username}`,
    userId: user._id,
    isActive: true,
    replyMode: 'copilot',
    telegramUserId: botTelegramUserId,
    facebookPageId: `page_${username}`,
    facebookApiKey: `fb-token-${username}`,
    copilotSettings: {
      notifyChannels: {
        inApp,
        whatsappToMerchant,
        telegramToMerchant,
      },
      draftTtlMinutes: 60,
    },
  });

  const store = await Store.create({
    userId: user._id,
    botId: bot._id,
    storeName: `متجر ${username}`,
    storeLink: `store-${username}-${Date.now()}`,
    catalogInventoryMode: 'local',
    isActive: true,
  });
  bot.storeId = store._id;
  await bot.save();

  const product = await Product.create({
    storeId: store._id,
    productName: 'تيشيرت أسود',
    price: 250,
    currency: 'EGP',
    stock,
    stockTracked: true,
    isActive: true,
  });

  const conversation = await Conversation.create({
    botId: bot._id,
    userId: `facebook_cust_${username}`,
    channel: 'facebook',
    username: 'أحمد عميل',
    isHumanHandling: false,
    messages: [
      {
        role: 'user',
        content: 'بكام التيشيرت الأسود؟',
        messageId: `in_${username}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date(),
      },
    ],
  });

  return { user, bot, store, product, conversation };
}

function makeMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

test('copilot_draft notification is strictly opt-in, sends Telegram inline buttons + ZainBot Main WA for verified phones, and respects CHANNELS_MODE', async () => {
  await resetDb();

  // 1. Default-off merchant: no Telegram or WhatsApp notification even if linked
  const defaultOff = await seedMerchant({
    username: 'optout_m',
    email: 'optout@test.local',
    botTelegramUserId: '111000111',
    verifiedWhatsappPhone: '201011112222',
    telegramToMerchant: false,
    whatsappToMerchant: false,
  });

  const cpService = createCopilotService({
    generateDraftCode: () => '4821',
    logger: silentLogger,
  });

  const d1 = await cpService.createDraftForMessage({
    bot: defaultOff.bot,
    conversation: defaultOff.conversation,
    suggestedReply: 'أهلاً بك! السعر 250 جنيه.',
    triggerMessageId: 'trig_1',
    customerMessageSnippet: 'بكام التيشيرت؟',
    customerName: 'أحمد عميل',
  });
  assert.ok(d1._id);
  assert.equal(telegramApiCalls.length, 0, 'default-off must NOT send Telegram alert');
  assert.equal(platformWaSends.length, 0, 'default-off must NOT send WhatsApp alert');
  assert.equal(await Notification.countDocuments({ user: defaultOff.user._id }), 1, 'in-app notification still created');

  // 2. Opt-in merchant WITH Telegram + verified WhatsApp phone
  const optIn = await seedMerchant({
    username: 'optin_m',
    email: 'optin@test.local',
    botTelegramUserId: '222000222',
    verifiedWhatsappPhone: '201022223333',
    telegramToMerchant: true,
    whatsappToMerchant: true,
  });

  const d2 = await cpService.createDraftForMessage({
    bot: optIn.bot,
    conversation: optIn.conversation,
    suggestedReply: 'السعر 250 جنيه والتوصيل خلال يومين <خصم خاص>!',
    triggerMessageId: 'trig_2',
    customerMessageSnippet: 'بكام التيشيرت & هل متاح؟',
    customerName: 'كريم <VIP>',
  });
  assert.equal(d2.draftCode, '4821');

  // Telegram received escaped HTML + [✅ إرسال] [❌ تجاهل] inline keyboard
  assert.equal(telegramApiCalls.length, 1);
  const tgPayload = telegramApiCalls[0].body;
  assert.equal(tgPayload.chat_id, '222000222');
  assert.equal(tgPayload.parse_mode, 'HTML');
  assert.ok(tgPayload.text.includes('&lt;VIP&gt;'), 'Telegram HTML must escape customer text');
  assert.ok(tgPayload.text.includes('&lt;خصم خاص&gt;'), 'Telegram HTML must escape draft reply');
  assert.ok(!tgPayload.text.includes('<VIP>'));
  assert.deepEqual(tgPayload.reply_markup, {
    inline_keyboard: [
      [
        { text: '✅ إرسال', callback_data: `cp_send:${d2._id}` },
        { text: '❌ تجاهل', callback_data: `cp_drop:${d2._id}` },
      ],
    ],
  });

  // ZainBot Main WhatsApp received plain text with short code commands to verifiedWhatsappPhone
  assert.equal(platformWaSends.length, 1);
  assert.equal(platformWaSends[0].to, '201022223333');
  assert.match(platformWaSends[0].text, /إرسال 4821/);
  assert.match(platformWaSends[0].text, /تعديل 4821:/);
  assert.match(platformWaSends[0].text, /تجاهل 4821/);
  assert.ok(platformWaSends[0].text.includes('<VIP>'), 'WhatsApp plain text preserves literal customer text');

  // In-app notification was created strictly ONCE (no duplicate from dispatcher)
  assert.equal(await Notification.countDocuments({ user: optIn.user._id }), 1);

  // 3. Opt-in merchant WITHOUT verifiedWhatsappPhone (only legacy unverified user.whatsapp) -> NO WhatsApp sent
  const unverifiedWa = await seedMerchant({
    username: 'unver_wa_m',
    email: 'unver@test.local',
    whatsapp: '01099998888',
    verifiedWhatsappPhone: '',
    whatsappToMerchant: true,
    telegramToMerchant: false,
  });
  platformWaSends.length = 0;
  await cpService.createDraftForMessage({
    bot: unverifiedWa.bot,
    conversation: unverifiedWa.conversation,
    suggestedReply: 'أهلاً بحضرتك!',
    triggerMessageId: 'trig_3',
    customerMessageSnippet: 'السلام عليكم',
  });
  assert.equal(platformWaSends.length, 0, 'unverified User.whatsapp must NEVER receive draft alerts');

  // 4. CHANNELS_MODE=off suppresses external Telegram & WhatsApp notifications
  telegramApiCalls.length = 0;
  platformWaSends.length = 0;
  process.env.CHANNELS_MODE = 'off';
  const dOff = await cpService.createDraftForMessage({
    bot: optIn.bot,
    conversation: optIn.conversation,
    suggestedReply: 'مسودة أثناء إغلاق القنوات',
    triggerMessageId: 'trig_4',
    customerMessageSnippet: 'سؤال',
  });
  assert.ok(dOff._id, 'draft still created under CHANNELS_MODE=off');
  assert.equal(telegramApiCalls.length, 0, 'CHANNELS_MODE=off blocks Telegram copilot notification');
  assert.equal(platformWaSends.length, 0, 'CHANNELS_MODE=off blocks WhatsApp copilot notification');

  // Also test formatter output directly
  const formatted = formatCopilotDraftNotificationMessage(
    {
      customerName: 'أحمد',
      channel: 'whatsapp',
      customerMessageSnippet: 'بكام؟',
      suggestedReply: '250 جنيه',
      draftCode: '9123',
    },
    'متجر زين'
  );
  assert.match(formatted, /مسودة رد جديدة/);
  assert.match(formatted, /واتساب/);
  assert.match(formatted, /إرسال 9123/);
});

test('notification failure NEVER breaks CopilotDraft creation (fail-silent on dispatcher & channel errors)', async () => {
  await resetDb();
  const { bot, conversation } = await seedMerchant({
    username: 'failsilent_m',
    email: 'failsilent@test.local',
    botTelegramUserId: '333000333',
    verifiedWhatsappPhone: '201033334444',
    telegramToMerchant: true,
    whatsappToMerchant: true,
  });

  // Case A: Both Telegram API & Platform WhatsApp throw errors inside real dispatcher
  telegramApiShouldThrow = true;
  platformWaShouldThrow = true;

  const serviceRealDispatcher = createCopilotService({
    generateDraftCode: () => '5511',
    logger: silentLogger,
  });

  const draftA = await serviceRealDispatcher.createDraftForMessage({
    bot,
    conversation,
    suggestedReply: 'رد مقترح رغم تعطل الإشعارات',
    triggerMessageId: 'fail_trig_a',
    customerMessageSnippet: 'مرحبا',
  });
  assert.ok(draftA._id);
  assert.equal(draftA.status, 'pending');
  assert.equal((await CopilotDraft.findById(draftA._id).lean()).suggestedReply, 'رد مقترح رغم تعطل الإشعارات');

  // Case B: Injected notificationDispatcher itself rejects synchronously/asynchronously
  const serviceThrowingDispatcher = createCopilotService({
    generateDraftCode: () => '5522',
    notificationDispatcher: {
      async dispatchMultiChannelNotification() {
        throw new Error('Catastrophic dispatcher crash');
      },
    },
    logger: silentLogger,
  });

  const draftB = await serviceThrowingDispatcher.createDraftForMessage({
    bot,
    conversation,
    suggestedReply: 'رد مقترح آخر رغم انهيار الموزع',
    triggerMessageId: 'fail_trig_b',
    customerMessageSnippet: 'تفاصيل؟',
  });
  assert.ok(draftB._id);
  assert.equal(draftB.status, 'pending');
  assert.equal((await CopilotDraft.findById(draftB._id).lean()).status, 'pending');
  assert.equal((await CopilotDraft.findById(draftA._id).lean()).status, 'superseded');
});

test('Telegram inline callbacks: ownership verification, 1-tap send, discard, CAS double-tap single-send, CHANNELS_MODE, and audit', async () => {
  await resetDb();

  const merchantA = await seedMerchant({
    username: 'tg_merchant_a',
    email: 'tga@test.local',
    botTelegramUserId: '700001',
    telegramToMerchant: true,
  });
  const merchantB = await seedMerchant({
    username: 'tg_merchant_b',
    email: 'tgb@test.local',
    botTelegramUserId: '700002',
    telegramToMerchant: true,
  });

  const cpService = createCopilotService({
    generateDraftCode: () => '6101',
    logger: silentLogger,
  });

  const draftA1 = await cpService.createDraftForMessage({
    bot: merchantA.bot,
    conversation: merchantA.conversation,
    suggestedReply: 'السعر 250 جنيه والتوصيل مجاني!',
    triggerMessageId: 'tg_in_1',
    customerMessageSnippet: 'بكام؟',
  });
  telegramApiCalls.length = 0;

  // 1. Unauthorized merchant B attempts to approve Merchant A's draft -> REJECTED, ZERO delivery
  const unauthRes = makeMockRes();
  await telegramController.handleWebhook(
    {
      body: {
        callback_query: {
          id: 'cb_unauth_1',
          from: { id: 700002, username: 'merchant_b' },
          message: { chat: { id: 700002 } },
          data: `cp_send:${draftA1._id}`,
        },
      },
    },
    unauthRes
  );
  assert.equal(unauthRes.statusCode, 200);
  assert.equal(customerDeliveries.length, 0, 'unauthorized Telegram chat MUST NEVER deliver');
  assert.equal((await CopilotDraft.findById(draftA1._id).lean()).status, 'pending');
  const unauthMsg = telegramApiCalls.find((c) => c.url.includes('sendMessage'));
  assert.match(unauthMsg.body.text, /غير مصرح/);

  // 2. Unknown/unlinked Telegram chat attempts cp_drop -> REJECTED, draft stays pending
  telegramApiCalls.length = 0;
  await telegramController.handleWebhook(
    {
      body: {
        callback_query: {
          id: 'cb_unauth_2',
          from: { id: 999999 },
          message: { chat: { id: 999999 } },
          data: `cp_drop:${draftA1._id}`,
        },
      },
    },
    makeMockRes()
  );
  assert.equal((await CopilotDraft.findById(draftA1._id).lean()).status, 'pending');

  // 3. CHANNELS_MODE=off -> callback completely ignored, draft remains pending, zero sends
  telegramApiCalls.length = 0;
  process.env.CHANNELS_MODE = 'off';
  await telegramController.handleWebhook(
    {
      body: {
        callback_query: {
          id: 'cb_off_1',
          from: { id: 700001 },
          message: { chat: { id: 700001 } },
          data: `cp_send:${draftA1._id}`,
        },
      },
    },
    makeMockRes()
  );
  assert.equal(customerDeliveries.length, 0);
  assert.equal(telegramApiCalls.length, 0);
  assert.equal((await CopilotDraft.findById(draftA1._id).lean()).status, 'pending');

  // 4. CHANNELS_MODE=allowlist (only merchantB's bot allowed) -> merchantA's draft blocked
  process.env.CHANNELS_MODE = 'allowlist';
  process.env.CHANNELS_ALLOWLIST_BOT_IDS = String(merchantB.bot._id);
  await telegramController.handleWebhook(
    {
      body: {
        callback_query: {
          id: 'cb_allowlist_blocked',
          from: { id: 700001 },
          message: { chat: { id: 700001 } },
          data: `cp_send:${draftA1._id}`,
        },
      },
    },
    makeMockRes()
  );
  assert.equal(customerDeliveries.length, 0);
  assert.equal((await CopilotDraft.findById(draftA1._id).lean()).status, 'pending');

  // 5. CHANNELS_MODE=allowlist (merchantA's bot allowlisted) + concurrent double-tap -> CAS sends strictly ONCE!
  process.env.CHANNELS_ALLOWLIST_BOT_IDS = String(merchantA.bot._id);
  customerDeliveryDelayMs = 40;
  telegramApiCalls.length = 0;

  await Promise.all([
    telegramController.handleWebhook(
      {
        body: {
          callback_query: {
            id: 'cb_tap_1',
            from: { id: 700001 },
            message: { chat: { id: 700001 } },
            data: `cp_send:${draftA1._id}`,
          },
        },
      },
      makeMockRes()
    ),
    telegramController.handleWebhook(
      {
        body: {
          callback_query: {
            id: 'cb_tap_2',
            from: { id: 700001 },
            message: { chat: { id: 700001 } },
            data: `cp_send:${draftA1._id}`,
          },
        },
      },
      makeMockRes()
    ),
  ]);
  customerDeliveryDelayMs = 0;

  assert.equal(customerDeliveries.length, 1, 'Telegram double-tap CAS MUST send strictly ONCE');
  assert.equal(customerDeliveries[0].body.message.text, 'السعر 250 جنيه والتوصيل مجاني!');

  const sentDraft = await CopilotDraft.findById(draftA1._id).lean();
  assert.equal(sentDraft.status, 'sent');
  assert.equal(sentDraft.approvedVia, 'telegram');
  assert.equal(sentDraft.delivered, true);

  const convAfterSend = await Conversation.findById(merchantA.conversation._id).lean();
  assert.equal(convAfterSend.isHumanHandling, false, 'Telegram copilot send must NOT flip isHumanHandling');
  assert.equal(convAfterSend.messages.length, 2);

  const sentAudits = await AssistantActionAudit.find({
    copilotDraftId: draftA1._id,
    eventType: 'copilot.draft.sent',
  }).lean();
  assert.equal(sentAudits.length, 1);
  assert.equal(sentAudits[0].channel, 'telegram');
  assert.equal(sentAudits[0].outcome, 'success');

  // Both taps should have received answerCallbackQuery + sendMessage (one success, one already-sending/sent)
  const tgSendMsgs = telegramApiCalls.filter((c) => c.url.includes('sendMessage')).map((c) => c.body.text);
  assert.equal(tgSendMsgs.length, 2);
  assert.ok(tgSendMsgs.some((t) => /تم إرسال الرد/.test(t)));
  assert.ok(tgSendMsgs.some((t) => /جاري إرسال|تم إرسال هذه المسودة بالفعل/.test(t)));

  // 6. Owner 1-tap discard (`cp_drop:<draftId>`) never delivers and audits discarded
  process.env.CHANNELS_MODE = 'on';
  customerDeliveries.length = 0;
  telegramApiCalls.length = 0;
  const draftA2 = await cpService.createDraftForMessage({
    bot: merchantA.bot,
    conversation: merchantA.conversation,
    suggestedReply: 'مسودة سيتم تجاهلها',
    triggerMessageId: 'tg_in_2',
    customerMessageSnippet: 'استفسار ثاني',
  });
  telegramApiCalls.length = 0;

  await telegramController.handleWebhook(
    {
      body: {
        callback_query: {
          id: 'cb_drop_1',
          from: { id: 700001 },
          message: { chat: { id: 700001 } },
          data: `cp_drop:${draftA2._id}`,
        },
      },
    },
    makeMockRes()
  );

  assert.equal(customerDeliveries.length, 0, 'cp_drop MUST NEVER deliver to customer');
  const dropped = await CopilotDraft.findById(draftA2._id).lean();
  assert.equal(dropped.status, 'discarded');
  assert.equal(dropped.approvedVia, 'telegram');

  const dropAudits = await AssistantActionAudit.find({
    copilotDraftId: draftA2._id,
    eventType: 'copilot.draft.discarded',
  }).lean();
  assert.equal(dropAudits.length, 1);
  assert.equal(dropAudits[0].channel, 'telegram');
  assert.equal(dropAudits[0].outcome, 'rejected');
});

test('ZainBot Main WhatsApp: إرسال <code>, تعديل <code>:, تجاهل <code> without colliding with pending write actions, plus ownership, CAS, and CHANNELS_MODE', async () => {
  await resetDb();
  await setPlatformFlags({ writeTools: true, copilot: true });

  const merchantA = await seedMerchant({
    username: 'wa_cp_a',
    email: 'wacpa@test.local',
    verifiedWhatsappPhone: '201055556666',
    whatsappToMerchant: true,
    writeToolsEnabled: true,
    allowedWriteTools: { createOrder: false, updateInventory: true, messageCustomer: false },
    stock: 20,
  });

  const merchantB = await seedMerchant({
    username: 'wa_cp_b',
    email: 'wacpb@test.local',
    verifiedWhatsappPhone: '201077778888',
    whatsapp: '01099990000',
    whatsappToMerchant: true,
  });

  // Unverified phone matching legacy User.whatsapp (NOT verifiedWhatsappPhone)
  await seedMerchant({
    username: 'wa_unver',
    email: 'waunver@test.local',
    whatsapp: '01012340000',
    verifiedWhatsappPhone: '',
  });

  let nextDraftCode = '4821';
  const cpService = createCopilotService({
    generateDraftCode: () => nextDraftCode,
    logger: silentLogger,
  });
  const writeTools = createAssistantWriteTools({
    invalidateStoreCache: () => {},
  });
  const pendingActionService = createAssistantPendingActionService({
    writeTools,
    generateActionCode: () => '7777',
  });
  const router = createPlatformMerchantAssistantRouter({
    pendingActionService,
    writeTools,
    copilotService: cpService,
    assistantService: {
      async answer() {
        return { answer: 'رد قراءة فقط', usedTools: [], fallback: false };
      },
    },
    extractWriteArgs: null,
    logger: silentLogger,
  });

  // Verify parser handles Arabic/Eastern digits/multiline edits and rejects bare commands
  assert.deepEqual(parseCopilotDraftCommand('إرسال 4821'), { action: 'send', draftCode: '4821' });
  assert.deepEqual(parseCopilotDraftCommand('ارسال ٤٨٢١'), { action: 'send', draftCode: '4821' });
  assert.deepEqual(parseCopilotDraftCommand('تجاهل #4821'), { action: 'discard', draftCode: '4821' });
  assert.deepEqual(parseCopilotDraftCommand('تعديل ٤٨٢١: السعر ٢٢٠ جنيه\nوشحن مجاني'), {
    action: 'edit',
    draftCode: '4821',
    editedReply: 'السعر ٢٢٠ جنيه\nوشحن مجاني',
  });
  assert.equal(parseCopilotDraftCommand('تأكيد'), null);
  assert.equal(parseCopilotDraftCommand('نعم 4821'), null);
  assert.equal(parseCopilotDraftCommand('لا'), null);
  assert.equal(parseCopilotDraftCommand('إرسال'), null);
  assert.equal(parseCopilotDraftCommand('عدّل مخزون تيشيرت أسود ل 35'), null);

  // 1. Propose a pending write action (update_inventory -> actionCode 7777) for Merchant A
  const propRes = await router.handleIncomingPlatformMessage({
    message: { from: '201055556666@c.us', body: 'عدّل مخزون تيشيرت أسود ل 35', id: { _serialized: 'wa-prop-1' } },
    messageText: 'عدّل مخزون تيشيرت أسود ل 35',
    messageId: 'wa-prop-1',
  });
  assert.equal(propRes.reason, 'action_proposed');
  const activePending = await AssistantPendingAction.findOne({ merchantUserId: merchantA.user._id, status: 'pending' }).lean();
  assert.ok(activePending);
  assert.equal(activePending.actionCode, '7777');
  assert.equal((await Product.findById(merchantA.product._id).lean()).stock, 20);

  // 2. Create pending CopilotDraft #4821 for Merchant A while write action #7777 is STILL pending
  nextDraftCode = '4821';
  const draft1 = await cpService.createDraftForMessage({
    bot: merchantA.bot,
    conversation: merchantA.conversation,
    suggestedReply: 'أهلاً بك! سعر التيشيرت الأسود 250 جنيه.',
    triggerMessageId: 'wa_cp_trig_1',
    customerMessageSnippet: 'بكام التيشيرت؟',
  });

  // 3. Ownership check: unverified phone & Merchant B CANNOT send Merchant A's draft #4821
  const unverifiedRes = await router.handleIncomingPlatformMessage({
    message: { from: '201012340000@c.us', body: 'إرسال 4821', id: { _serialized: 'unver-send-1' } },
    messageText: 'إرسال 4821',
    messageId: 'unver-send-1',
  });
  assert.equal(unverifiedRes.handled, false, 'unverified phone must NOT be able to approve drafts');

  const otherMerchantRes = await router.handleIncomingPlatformMessage({
    message: { from: '201077778888@c.us', body: 'إرسال 4821', id: { _serialized: 'other-send-1' } },
    messageText: 'إرسال 4821',
    messageId: 'other-send-1',
  });
  assert.equal(otherMerchantRes.handled, true);
  assert.equal(otherMerchantRes.errorCode, 'DRAFT_NOT_FOUND');
  assert.equal(customerDeliveries.length, 0);
  assert.equal((await CopilotDraft.findById(draft1._id).lean()).status, 'pending');

  // 4. CHANNELS_MODE=off blocks `إرسال 4821` without marking draft sent (and keeps pending write action untouched)
  process.env.CHANNELS_MODE = 'off';
  const offRes = await router.handleIncomingPlatformMessage({
    message: { from: '201055556666@c.us', body: 'إرسال 4821', id: { _serialized: 'wa-send-off-1' } },
    messageText: 'إرسال 4821',
    messageId: 'wa-send-off-1',
  });
  assert.equal(offRes.handled, true);
  assert.equal(offRes.errorCode, 'CHANNELS_DISABLED');
  assert.equal(customerDeliveries.length, 0);
  assert.equal((await CopilotDraft.findById(draft1._id).lean()).status, 'pending', 'CHANNELS_MODE=off must keep draft pending');
  assert.equal((await AssistantPendingAction.findById(activePending._id).lean()).status, 'pending');
  assert.equal((await Product.findById(merchantA.product._id).lean()).stock, 20);
  process.env.CHANNELS_MODE = 'on';

  // 5. Concurrent double-send `إرسال 4821` (with Eastern Arabic digits too!) -> CAS sends strictly ONCE,
  //    AND leaves pending write action #7777 completely untouched!
  customerDeliveryDelayMs = 40;
  const [sendR1, sendR2] = await Promise.all([
    router.handleIncomingPlatformMessage({
      message: { from: '201055556666@c.us', body: 'إرسال ٤٨٢١', id: { _serialized: 'wa-send-cas-1' } },
      messageText: 'إرسال ٤٨٢١',
      messageId: 'wa-send-cas-1',
    }),
    router.handleIncomingPlatformMessage({
      message: { from: '201055556666@c.us', body: 'إرسال 4821', id: { _serialized: 'wa-send-cas-2' } },
      messageText: 'إرسال 4821',
      messageId: 'wa-send-cas-2',
    }),
  ]);
  customerDeliveryDelayMs = 0;

  const sendReasons = [sendR1.reason, sendR2.reason].sort();
  assert.deepEqual(sendReasons, ['copilot_draft_send_failed', 'copilot_draft_sent']);
  assert.equal(customerDeliveries.length, 1, 'WhatsApp double-send CAS MUST send strictly ONCE');
  assert.equal(customerDeliveries[0].body.message.text, 'أهلاً بك! سعر التيشيرت الأسود 250 جنيه.');

  const d1Reloaded = await CopilotDraft.findById(draft1._id).lean();
  assert.equal(d1Reloaded.status, 'sent');
  assert.equal(d1Reloaded.approvedVia, 'whatsapp_platform');

  // Pending write action #7777 was NOT touched at all!
  assert.equal((await AssistantPendingAction.findById(activePending._id).lean()).status, 'pending');
  assert.equal((await Product.findById(merchantA.product._id).lean()).stock, 20);

  // 6. Create draft #4822 while write action #7777 is STILL pending -> `تعديل 4822: <new text>`
  customerDeliveries.length = 0;
  nextDraftCode = '4822';
  const draft2 = await cpService.createDraftForMessage({
    bot: merchantA.bot,
    conversation: merchantA.conversation,
    suggestedReply: 'السعر الأصلي 250 جنيه.',
    triggerMessageId: 'wa_cp_trig_2',
    customerMessageSnippet: 'فيه خصم؟',
  });

  const editRes = await router.handleIncomingPlatformMessage({
    message: { from: '201055556666@c.us', body: 'تعديل 4822: السعر 220 جنيه مخصوص لحضرتك!', id: { _serialized: 'wa-edit-1' } },
    messageText: 'تعديل 4822: السعر 220 جنيه مخصوص لحضرتك!',
    messageId: 'wa-edit-1',
  });
  assert.equal(editRes.reason, 'copilot_draft_edited_and_sent');
  assert.match(editRes.reply, /تم تعديل المسودة/);
  assert.equal(customerDeliveries.length, 1);
  assert.equal(customerDeliveries[0].body.message.text, 'السعر 220 جنيه مخصوص لحضرتك!');

  const d2Reloaded = await CopilotDraft.findById(draft2._id).lean();
  assert.equal(d2Reloaded.status, 'edited_and_sent');
  assert.equal(d2Reloaded.suggestedReply, 'السعر الأصلي 250 جنيه.');
  assert.equal(d2Reloaded.editedReply, 'السعر 220 جنيه مخصوص لحضرتك!');
  assert.equal(d2Reloaded.approvedVia, 'whatsapp_platform');

  // Pending write action #7777 STILL untouched!
  assert.equal((await AssistantPendingAction.findById(activePending._id).lean()).status, 'pending');
  assert.equal((await Product.findById(merchantA.product._id).lean()).stock, 20);

  // 7. Create draft #4823 -> `تجاهل 4823` discards without sending & leaves pending write action untouched
  customerDeliveries.length = 0;
  nextDraftCode = '4823';
  const draft3 = await cpService.createDraftForMessage({
    bot: merchantA.bot,
    conversation: merchantA.conversation,
    suggestedReply: 'مسودة للتجاهل',
    triggerMessageId: 'wa_cp_trig_3',
    customerMessageSnippet: 'ألو',
  });

  const discardRes = await router.handleIncomingPlatformMessage({
    message: { from: '201055556666@c.us', body: 'تجاهل 4823', id: { _serialized: 'wa-discard-1' } },
    messageText: 'تجاهل 4823',
    messageId: 'wa-discard-1',
  });
  assert.equal(discardRes.reason, 'copilot_draft_discarded');
  assert.match(discardRes.reply, /تم تجاهل المسودة/);
  assert.equal(customerDeliveries.length, 0, 'تجاهل MUST NEVER deliver');
  assert.equal((await CopilotDraft.findById(draft3._id).lean()).status, 'discarded');

  // 8. Create draft #4824, then merchant sends `تأكيد` -> executes pending write action #7777
  //    WITHOUT sending draft #4824!
  nextDraftCode = '4824';
  const draft4 = await cpService.createDraftForMessage({
    bot: merchantA.bot,
    conversation: merchantA.conversation,
    suggestedReply: 'مسودة يجب ألا تُرسل عند تأكيد إجراء المخزون',
    triggerMessageId: 'wa_cp_trig_4',
    customerMessageSnippet: 'موجود؟',
  });

  const confirmWriteRes = await router.handleIncomingPlatformMessage({
    message: { from: '201055556666@c.us', body: 'تأكيد', id: { _serialized: 'wa-confirm-write-1' } },
    messageText: 'تأكيد',
    messageId: 'wa-confirm-write-1',
  });
  assert.equal(confirmWriteRes.reason, 'action_executed');
  assert.equal((await Product.findById(merchantA.product._id).lean()).stock, 35, 'write action executed');
  assert.equal((await CopilotDraft.findById(draft4._id).lean()).status, 'pending', 'تأكيد must NOT send copilot draft');
  assert.equal(customerDeliveries.length, 0);

  // Verify audit trail for WhatsApp mobile approvals
  const waAudits = await AssistantActionAudit.find({
    merchantUserId: merchantA.user._id,
    channel: 'whatsapp_platform',
    toolName: 'copilot_draft',
  }).lean();
  const waAuditTypes = waAudits.map((a) => a.eventType);
  assert.ok(waAuditTypes.includes('copilot.draft.send_failed'), 'CHANNELS_MODE=off audited');
  assert.ok(waAuditTypes.includes('copilot.draft.sent'), 'sent audited');
  assert.ok(waAuditTypes.includes('copilot.draft.edited_and_sent'), 'edited_and_sent audited');
  assert.ok(waAuditTypes.includes('copilot.draft.discarded'), 'discarded audited');

  // Verify conversation isHumanHandling stayed false throughout all mobile approvals
  const convFinal = await Conversation.findById(merchantA.conversation._id).lean();
  assert.equal(convFinal.isHumanHandling, false);
});
