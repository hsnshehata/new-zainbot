'use strict';

// Regression test for cross-channel impersonation via POST /api/bot and phone-only
// cross-session order/customer/booking tampering on the anonymous web channel.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const aiFailover = require('../server/services/aiFailover');
let aiJsonReply = { intent: false };
aiFailover.getAiCompletion = async () => ({
  choices: [{ message: { content: JSON.stringify(aiJsonReply) } }],
});

const botEngine = require('../server/botEngine');
const botRoutes = require('../server/routes/bot');
const Bot = require('../server/models/Bot');
const Store = require('../server/models/Store');
const Product = require('../server/models/Product');
const Conversation = require('../server/models/Conversation');
const ChatOrder = require('../server/models/ChatOrder');
const ChatCustomer = require('../server/models/ChatCustomer');
const Booking = require('../server/models/Booking');
const { createOrUpdateFromExtraction: createOrUpdateBooking } = require('../server/controllers/bookingsController');

const OWNER_ID = new mongoose.Types.ObjectId();

let mongod;
let app;
let bot;
let store;
const processMessageCalls = [];
const realProcessMessage = botEngine.processMessage;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  store = await Store.create({
    userId: OWNER_ID,
    storeName: 'متجر الأمان',
    storeLink: 'secstore1',
    templateId: 1,
  });
  await Product.create({
    storeId: store._id,
    productName: 'ساعة ذكية',
    price: 500,
    currency: 'EGP',
    stock: 20,
    isActive: true,
  });
  bot = await Bot.create({
    userId: OWNER_ID,
    storeId: store._id,
    name: 'بوت اختبار الأمان',
    isActive: true,
  });

  app = express();
  app.use(express.json());
  app.use('/api/bot', botRoutes);
});

test.after(async () => {
  botEngine.processMessage = realProcessMessage;
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  processMessageCalls.length = 0;
  await Promise.all([
    Conversation.deleteMany({}),
    ChatOrder.deleteMany({}),
    ChatCustomer.deleteMany({}),
    Booking.deleteMany({}),
  ]);
});

test('POST /api/bot rejects WhatsApp JIDs, channel-prefixed IDs, and phone-like userIds', async () => {
  botEngine.processMessage = async (...args) => {
    processMessageCalls.push(args);
    return 'ok';
  };

  const forbiddenIds = [
    '201012345678@c.us',
    'facebook_987654321',
    'instagram_123456789',
    'whatsapp_201012345678',
    '01012345678',
    '201012345678',
    'web_01012345678',
    'web_201012345678',
    'web_123',
    'anonymous',
  ];

  for (const userId of forbiddenIds) {
    const res = await supertest(app)
      .post('/api/bot')
      .send({
        botId: String(bot._id),
        userId,
        channel: 'whatsapp',
        message: 'فين طلبي؟',
      });
    assert.equal(res.status, 400, `expected 400 for forbidden userId "${userId}"`);
  }
  assert.equal(processMessageCalls.length, 0, 'rejected ids must never reach processMessage');
});

test('POST /api/bot forces channel="web" even when caller passes channel="whatsapp" with a valid web visitor id', async () => {
  botEngine.processMessage = async (...args) => {
    processMessageCalls.push(args);
    return 'أهلاً بزائر الويب';
  };

  const visitorId = 'web_f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const res = await supertest(app)
    .post('/api/bot')
    .send({
      botId: String(bot._id),
      userId: visitorId,
      channel: 'whatsapp',
      message: 'مرحبا',
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.reply, 'أهلاً بزائر الويب');
  assert.equal(processMessageCalls.length, 1);
  assert.equal(processMessageCalls[0][1], visitorId);
  assert.equal(processMessageCalls[0][6], 'web', 'public route must force channel to web');

  const conv = await Conversation.findOne({ botId: bot._id, userId: visitorId }).lean();
  assert.ok(conv);
  assert.equal(conv.channel, 'web');
});

test('anonymous web visitor cannot read or cancel a stranger WhatsApp order or booking by phone, but CAN manage their own web order', async () => {
  botEngine.processMessage = realProcessMessage;

  const victimPhone = '01012345678';
  const victimConvId = new mongoose.Types.ObjectId();
  const victimOrder = await ChatOrder.create({
    botId: bot._id,
    conversationId: victimConvId,
    channel: 'whatsapp',
    sourceUserId: '201012345678@c.us',
    customerName: 'ضحية سرية',
    customerPhone: victimPhone,
    customerAddress: 'عنوان سري خاص',
    items: [{ title: 'ساعة ذكية', quantity: 1, price: 500 }],
    totalAmount: 500,
    status: 'confirmed',
  });
  await ChatCustomer.create({
    botId: bot._id,
    conversationId: victimConvId,
    channel: 'whatsapp',
    sourceUserId: '201012345678@c.us',
    name: 'ضحية سرية',
    phone: victimPhone,
    address: 'عنوان سري خاص',
  });
  const victimBooking = await Booking.create({
    botId: bot._id,
    conversationId: victimConvId,
    channel: 'whatsapp',
    sourceUserId: '201012345678@c.us',
    customerName: 'ضحية سرية',
    customerPhone: victimPhone,
    serviceType: 'استشارة',
    bookingDate: new Date(Date.now() + 24 * 3600 * 1000),
    status: 'confirmed',
  });

  // Attacker on anonymous web channel types victim's phone number to query status or cancel
  const attackerConvId = new mongoose.Types.ObjectId();
  const attackerUserId = 'web_attacker-9999-4372-a567-0e02b2c3d479';

  aiJsonReply = { intent: false, customerPhone: victimPhone };
  const statusAttempt = await botEngine.extractChatOrderIntent({
    bot,
    channel: 'web',
    userMessageContent: `فين طلبي ${victimPhone}`,
    conversationId: attackerConvId,
    sourceUserId: attackerUserId,
    sourceUsername: 'زائر',
    messageId: 'atk-1',
    transcript: [],
  });
  assert.equal(statusAttempt.outcome, 'status_inquiry');
  assert.equal(statusAttempt.chatOrder, null, 'web visitor must NOT read another customer order by phone');

  const cancelAttempt = await botEngine.extractChatOrderIntent({
    bot,
    channel: 'web',
    userMessageContent: `الغي طلبي ${victimPhone}`,
    conversationId: attackerConvId,
    sourceUserId: attackerUserId,
    sourceUsername: 'زائر',
    messageId: 'atk-2',
    transcript: [],
  });
  assert.equal(cancelAttempt.outcome, 'cancel_no_order');
  const victimOrderAfter = await ChatOrder.findById(victimOrder._id).lean();
  assert.equal(victimOrderAfter.status, 'confirmed', 'victim order must remain untouched');

  // Attacker tries to cancel victim's booking by phone on web channel
  const bookingCancelAttempt = await createOrUpdateBooking({
    botId: bot._id,
    channel: 'web',
    conversationId: attackerConvId,
    sourceUserId: attackerUserId,
    customerName: 'مهاجم',
    customerPhone: victimPhone,
    isCancel: true,
  });
  assert.equal(bookingCancelAttempt, null);
  const victimBookingAfter = await Booking.findById(victimBooking._id).lean();
  assert.equal(victimBookingAfter.status, 'confirmed', 'victim booking must remain untouched');

  // Legitimate anonymous web visitor places and checks THEIR OWN order in the same web session
  const legVisitorId = 'web_legit-1111-4372-a567-0e02b2c3d479';
  const legConvId = new mongoose.Types.ObjectId();
  aiJsonReply = {
    intent: true,
    customerName: 'زائر حقيقي',
    customerPhone: '01199887766',
    customerAddress: 'القاهرة المعادي',
    items: [{ title: 'ساعة ذكية', quantity: 1 }],
    status: 'confirmed',
  };
  const ownOrder = await botEngine.extractChatOrderIntent({
    bot,
    channel: 'web',
    userMessageContent: 'تمام أكد الطلب',
    conversationId: legConvId,
    sourceUserId: legVisitorId,
    sourceUsername: 'زائر حقيقي',
    messageId: 'leg-1',
    transcript: [],
  });
  assert.equal(ownOrder.outcome, 'saved');

  aiJsonReply = { intent: false };
  const ownStatus = await botEngine.extractChatOrderIntent({
    bot,
    channel: 'web',
    userMessageContent: 'فين طلبي؟',
    conversationId: legConvId,
    sourceUserId: legVisitorId,
    sourceUsername: 'زائر حقيقي',
    messageId: 'leg-2',
    transcript: [],
  });
  assert.equal(ownStatus.outcome, 'status_inquiry');
  assert.equal(String(ownStatus.chatOrder?._id), String(ownOrder.chatOrder._id));

  // Authenticated WhatsApp channel still finds its order by phone when conversationId differs
  aiJsonReply = { intent: false, customerPhone: victimPhone };
  const waStatus = await botEngine.extractChatOrderIntent({
    bot,
    channel: 'whatsapp',
    userMessageContent: `فين طلبي ${victimPhone}`,
    conversationId: new mongoose.Types.ObjectId(),
    sourceUserId: '201099999999@c.us',
    sourceUsername: 'واتساب',
    messageId: 'wa-1',
    transcript: [],
  });
  assert.equal(String(waStatus.chatOrder?._id), String(victimOrder._id));
});
