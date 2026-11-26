'use strict';

// Regression tests for:
// 1. WhatsApp notifications using real waManager.sendMessage (not non-existent sendDirectText)
//    across notificationDispatcher, notificationsController, and cronJobs.runBotSalesRecovery.
// 2. Abandoned-cart recovery NOT marking conversations recovered when WhatsApp delivery fails.
// 3. subscriptionTier (replacing non-existent planTier) in notificationsController and notificationDispatcher.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createWhatsAppSessionManager } = require('../server/services/whatsappSessionManager');

function stubModule(relativePath, exportsObject) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
  return resolved;
}

test('real whatsappSessionManager exposes sendMessage (not sendDirectText) and rejects when inactive', async () => {
  const manager = createWhatsAppSessionManager({
    ConnectionModel: {},
    ConversationModel: {},
    mongooseInstance: {},
    leaseService: { async acquire() {}, async renew() {}, async release() {} },
    logger: { info() {}, warn() {}, error() {} },
  });

  assert.equal(typeof manager.sendMessage, 'function');
  assert.equal(manager.sendDirectText, undefined);

  await assert.rejects(
    () => manager.sendMessage('507f191e810c19729de87009', '201001234567@c.us', 'hello'),
    (err) => err && err.code === 'WHATSAPP_SESSION_NOT_RUNNING'
  );
});

test('notificationDispatcher calls waManager.sendMessage and respects subscriptionTier (not planTier)', async () => {
  const waCalls = [];
  const savedCache = {};
  const mods = [
    '../server/services/whatsappSessionManager',
    '../server/services/telegramService',
    '../server/services/notificationDispatcher',
  ];
  for (const m of mods) {
    const id = require.resolve(m);
    savedCache[id] = require.cache[id];
  }

  const Bot = require('../server/models/Bot');
  const User = require('../server/models/User');
  const NotificationRecipient = require('../server/models/NotificationRecipient');
  const Notification = require('../server/models/Notification');
  const orig = {
    botFind: Bot.findById,
    userFind: User.findById,
    recFind: NotificationRecipient.find,
    notifCreate: Notification.create,
  };

  let userSelectField = '';
  let mockUser = null;

  try {
    stubModule('../server/services/whatsappSessionManager', {
      getWhatsAppSessionManager: () => ({
        sendMessage: async (botId, chatId, text) => {
          waCalls.push({ botId, chatId, text });
          return { id: 'wa-msg-1' };
        },
      }),
    });
    stubModule('../server/services/telegramService', {
      sendTelegramMessage: async () => ({ ok: true }),
    });
    delete require.cache[require.resolve('../server/services/notificationDispatcher')];

    Bot.findById = () => ({ select: async () => ({ _id: 'bot-1', userId: 'u-1', name: 'TestBot' }) });
    User.findById = () => ({
      select: async (fields) => {
        userSelectField = fields;
        return mockUser;
      },
    });
    NotificationRecipient.find = async () => [
      { channel: 'whatsapp', target: '201001111111@c.us' },
      { channel: 'whatsapp', target: '201002222222@c.us' },
    ];
    Notification.create = async (doc) => doc;

    const { dispatchMultiChannelNotification } = require('../server/services/notificationDispatcher');

    // Paid subscriber (subscriptionTier: 'growth_1k', subscriptionType: 'free') must get ALL recipients
    mockUser = { subscriptionTier: 'growth_1k', subscriptionType: 'free' };
    const paidRes = await dispatchMultiChannelNotification({
      userId: 'u-1',
      botId: 'bot-1',
      event: 'order_created',
      data: { customerName: 'Ali', total: 100 },
    });

    assert.ok(userSelectField.includes('subscriptionTier'), 'must select subscriptionTier');
    assert.ok(!userSelectField.includes('planTier'), 'must not select non-existent planTier');
    assert.deepEqual(paidRes, { delivered: 2, failed: 0 });
    assert.equal(waCalls.length, 2);

    // Free subscriber (subscriptionTier: 'free', subscriptionType: 'free') must be capped at 1 recipient
    waCalls.length = 0;
    mockUser = { subscriptionTier: 'free', subscriptionType: 'free' };
    const freeRes = await dispatchMultiChannelNotification({
      userId: 'u-1',
      botId: 'bot-1',
      event: 'order_created',
      data: { customerName: 'Ali', total: 100 },
    });
    assert.deepEqual(freeRes, { delivered: 1, failed: 0 });
    assert.equal(waCalls.length, 1);
  } finally {
    Bot.findById = orig.botFind;
    User.findById = orig.userFind;
    NotificationRecipient.find = orig.recFind;
    Notification.create = orig.notifCreate;
    for (const [id, entry] of Object.entries(savedCache)) {
      if (entry) require.cache[id] = entry;
      else delete require.cache[id];
    }
  }
});

test('notificationsController uses subscriptionTier for recipient limits and sendMessage for WhatsApp tests', async () => {
  const waCalls = [];
  const savedCache = {};
  const mods = [
    '../server/services/whatsappSessionManager',
    '../server/services/telegramService',
    '../server/controllers/notificationsController',
  ];
  for (const m of mods) {
    const id = require.resolve(m);
    savedCache[id] = require.cache[id];
  }

  const User = require('../server/models/User');
  const NotificationRecipient = require('../server/models/NotificationRecipient');
  const orig = {
    userFind: User.findById,
    recFind: NotificationRecipient.find,
    recCount: NotificationRecipient.countDocuments,
    recCreate: NotificationRecipient.create,
    recFindOne: NotificationRecipient.findOne,
  };

  let selectQuery = '';
  let mockUser = { subscriptionTier: 'growth_1k', subscriptionType: 'free' };

  try {
    stubModule('../server/services/whatsappSessionManager', {
      getWhatsAppSessionManager: () => ({
        sendMessage: async (...args) => {
          waCalls.push(args);
          return { ok: true };
        },
      }),
    });
    stubModule('../server/services/telegramService', {
      sendTelegramMessage: async () => ({ ok: true }),
    });
    delete require.cache[require.resolve('../server/controllers/notificationsController')];

    User.findById = () => ({
      select: async (fields) => {
        selectQuery = fields;
        return mockUser;
      },
    });
    NotificationRecipient.find = () => ({ sort: async () => [{ _id: 'r1' }] });
    NotificationRecipient.countDocuments = async () => 1;
    NotificationRecipient.create = async (doc) => ({ _id: 'r2', ...doc });
    NotificationRecipient.findOne = async () => ({
      _id: 'r1',
      userId: 'u-1',
      channel: 'whatsapp',
      botId: 'bot-1',
      target: '201001234567@c.us',
    });

    const controller = require('../server/controllers/notificationsController');

    const makeRes = () => {
      const res = { statusCode: 200, body: null };
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (body) => { res.body = body; return res; };
      return res;
    };

    // Paid tier user with subscriptionType 'free' is NOT treated as free plan
    const listRes = makeRes();
    await controller.listRecipients({ user: { userId: 'u-1' }, query: {} }, listRes);
    assert.ok(selectQuery.includes('subscriptionTier'));
    assert.ok(!selectQuery.includes('planTier'));
    assert.equal(listRes.body.isFreePlan, false);
    assert.equal(listRes.body.limit, null);

    // Can create a second recipient on paid subscriptionTier
    const createRes = makeRes();
    await controller.createRecipient({
      user: { userId: 'u-1', role: 'user' },
      body: { channel: 'whatsapp', target: '201009999999@c.us' },
    }, createRes);
    assert.equal(createRes.statusCode, 201);

    // Free user IS blocked from creating a second recipient
    mockUser = { subscriptionTier: 'free', subscriptionType: 'free' };
    const blockedRes = makeRes();
    await controller.createRecipient({
      user: { userId: 'u-1', role: 'user' },
      body: { channel: 'whatsapp', target: '201009999999@c.us' },
    }, blockedRes);
    assert.equal(blockedRes.statusCode, 403);
    assert.equal(blockedRes.body.code, 'FREE_PLAN_NOTIFICATION_LIMIT');

    // testRecipient invokes real sendMessage export
    const testRes = makeRes();
    await controller.testRecipient({ user: { userId: 'u-1' }, params: { id: 'r1' } }, testRes);
    assert.equal(testRes.statusCode, 200);
    assert.equal(testRes.body.outcome, 'delivered');
    assert.equal(waCalls.length, 1);
    assert.equal(waCalls[0][0], 'bot-1');
    assert.equal(waCalls[0][1], '201001234567@c.us');
  } finally {
    User.findById = orig.userFind;
    NotificationRecipient.find = orig.recFind;
    NotificationRecipient.countDocuments = orig.recCount;
    NotificationRecipient.create = orig.recCreate;
    NotificationRecipient.findOne = orig.recFindOne;
    for (const [id, entry] of Object.entries(savedCache)) {
      if (entry) require.cache[id] = entry;
      else delete require.cache[id];
    }
  }
});

test('cronJobs.runBotSalesRecovery uses sendMessage and does NOT mark recovered when WhatsApp delivery fails', async () => {
  const waCalls = [];
  let shouldFail = true;

  const savedCache = {};
  const mods = [
    '../server/services/whatsappSessionManager',
    '../server/cronJobs',
  ];
  for (const m of mods) {
    const id = require.resolve(m);
    savedCache[id] = require.cache[id];
  }

  const Bot = require('../server/models/Bot');
  const Conversation = require('../server/models/Conversation');
  const orig = { botFind: Bot.findById, convFind: Conversation.find };

  let saveCount = 0;
  let mockConv;

  try {
    stubModule('../server/services/whatsappSessionManager', {
      getWhatsAppSessionManager: () => ({
        sendMessage: async (botId, chatId, text) => {
          waCalls.push({ botId, chatId, text });
          if (shouldFail) throw new Error('WHATSAPP_SESSION_NOT_CONNECTED');
          return { id: 'ok' };
        },
      }),
    });
    delete require.cache[require.resolve('../server/cronJobs')];

    Bot.findById = () => ({
      select: async () => ({
        _id: '507f191e810c19729de87009',
        userId: '507f191e810c19729de86001',
        name: 'ShopBot',
        isActive: true,
        agentTools: { salesRecoveryTool: { enabled: true, delayHours: 2 } },
      }),
    });

    const resetConv = () => {
      saveCount = 0;
      mockConv = {
        _id: 'conv-1',
        channel: 'whatsapp',
        userId: '201001234567@c.us',
        messages: [{ role: 'user', content: 'بكام المنتج؟', timestamp: new Date(Date.now() - 3 * 3600 * 1000) }],
        followUpSentAt: undefined,
        async save() {
          saveCount += 1;
          return this;
        },
      };
    };

    Conversation.find = () => ({ limit: async () => [mockConv] });

    const { runBotSalesRecovery } = require('../server/cronJobs');

    // Case 1: sendMessage rejects -> must NOT save, must NOT set followUpSentAt, recovered must be 0
    resetConv();
    shouldFail = true;
    const failedResult = await runBotSalesRecovery('507f191e810c19729de87009');
    assert.equal(waCalls.length, 1);
    assert.equal(waCalls[0].chatId, '201001234567@c.us');
    assert.equal(failedResult.recovered, 0, 'failed delivery must not increment recovered');
    assert.equal(saveCount, 0, 'failed delivery must not save conversation');
    assert.equal(mockConv.followUpSentAt, undefined, 'failed delivery must not set followUpSentAt');
    assert.equal(mockConv.messages.length, 1, 'failed delivery must not append assistant message');

    // Case 2: sendMessage succeeds -> marks recovered, saves follow-up message and followUpSentAt
    waCalls.length = 0;
    resetConv();
    shouldFail = false;
    const okResult = await runBotSalesRecovery('507f191e810c19729de87009');
    assert.equal(waCalls.length, 1);
    assert.equal(okResult.recovered, 1);
    assert.equal(saveCount, 1);
    assert.ok(mockConv.followUpSentAt instanceof Date);
    assert.equal(mockConv.messages.length, 2);
  } finally {
    Bot.findById = orig.botFind;
    Conversation.find = orig.convFind;
    for (const [id, entry] of Object.entries(savedCache)) {
      if (entry) require.cache[id] = entry;
      else delete require.cache[id];
    }
  }
});
