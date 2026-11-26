'use strict';

// Regression tests for:
// 1. Paused (isActive: false) and archived (archivedAt set) bots short-circuiting in botEngine.processMessage
//    (and botsController.deleteBot invalidating botDataCache).
// 2. botController.updateSettings persisting workingHours-only updates to MongoDB.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const aiFailover = require('../server/services/aiFailover');
let aiCalls = 0;
aiFailover.getAiCompletion = async () => {
  aiCalls += 1;
  return { choices: [{ message: { content: 'AI reply' } }] };
};

const Bot = require('../server/models/Bot');
const User = require('../server/models/User');
const Conversation = require('../server/models/Conversation');
const botEngine = require('../server/botEngine');
const botController = require('../server/controllers/botController');
const botsController = require('../server/controllers/botsController');

let mongod;
let owner;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  owner = await User.create({
    username: 'pause_owner',
    email: 'pause_owner@example.com',
    role: 'user',
    status: 'active',
    subscriptionTier: 'growth_1k',
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  aiCalls = 0;
  await Promise.all([Bot.deleteMany({}), Conversation.deleteMany({})]);
});

test('botEngine.processMessage short-circuits paused and archived bots without calling AI', async () => {
  const pausedBot = await Bot.create({
    userId: owner._id,
    name: 'Paused Bot',
    isActive: false,
  });

  const archivedBot = await Bot.create({
    userId: owner._id,
    name: 'Archived Bot',
    isActive: true,
    archivedAt: new Date(),
  });

  const pausedReply = await botEngine.processMessage(
    String(pausedBot._id),
    '201001234567@c.us',
    'السلام عليكم',
    false,
    false,
    'msg-paused-1',
    'whatsapp'
  );
  assert.equal(pausedReply, null, 'paused bot must return null');

  const archivedReply = await botEngine.processMessage(
    String(archivedBot._id),
    'instagram_12345',
    'مرحبا',
    false,
    false,
    'msg-archived-1',
    'instagram'
  );
  assert.equal(archivedReply, null, 'archived bot must return null');
  assert.equal(aiCalls, 0, 'paused/archived bots must never invoke AI');
});

test('botsController.deleteBot invalidates botEngine cache so archived bot immediately stops replying', async () => {
  const liveBot = await Bot.create({
    userId: owner._id,
    name: 'Live Then Archived Bot',
    isActive: true,
  });

  // Prime botDataCache by processing one live message
  const firstReply = await botEngine.processMessage(
    String(liveBot._id),
    '201009998877@c.us',
    'أهلاً',
    false,
    false,
    'msg-live-1',
    'whatsapp'
  );
  assert.ok(typeof firstReply === 'string' && firstReply.length > 0);
  const callsAfterLive = aiCalls;
  assert.ok(callsAfterLive > 0);

  // Archive the bot via botsController.deleteBot
  const res = {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await botsController.deleteBot(
    {
      params: { id: String(liveBot._id) },
      bot: liveBot,
      auth: { actorUserId: String(owner._id) },
    },
    res
  );
  assert.equal(res.statusCode, 200);

  // Immediately after deleteBot, processMessage must short-circuit (cache was invalidated)
  const afterArchiveReply = await botEngine.processMessage(
    String(liveBot._id),
    '201009998877@c.us',
    'هل أنت موجود؟',
    false,
    false,
    'msg-after-archive-1',
    'whatsapp'
  );
  assert.equal(afterArchiveReply, null);
  assert.equal(aiCalls, callsAfterLive, 'no AI calls after bot is archived');
});

test('botController.updateSettings saves workingHours-only updates to MongoDB', async () => {
  const bot = await Bot.create({
    userId: owner._id,
    name: 'Working Hours Bot',
    workingHours: { start: '09:00', end: '17:00' },
  });

  const req = {
    user: { userId: String(owner._id), role: 'user' },
    params: { id: String(bot._id) },
    body: { workingHours: { start: '10:30', end: '22:15' } },
  };
  const res = {
    statusCode: 200,
    payload: null,
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };

  await botController.updateSettings(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.equal(res.payload.data.workingHours.start, '10:30');
  assert.equal(res.payload.data.workingHours.end, '22:15');

  // Re-read fresh from MongoDB to prove it actually persisted
  const persisted = await Bot.findById(bot._id).lean();
  assert.deepEqual(persisted.workingHours, { start: '10:30', end: '22:15' });
});
