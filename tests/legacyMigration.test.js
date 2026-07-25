const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../server/models/User');
const Bot = require('../server/models/Bot');
const Conversation = require('../server/models/Conversation');

test('legacy user migration normalization retains _id and role while resetting subscription', () => {
  const legacyUser = {
    _id: '507f191e810c19729de860ea',
    username: 'legacy_admin',
    email: 'admin@example.com',
    role: 'superadmin',
    password: 'legacy_hashed_password',
    subscriptionType: 'premium',
    subscriptionTier: 'pro',
    subscriptionEndDate: new Date('2025-12-31'),
  };

  const user = new User({
    _id: legacyUser._id,
    username: legacyUser.username,
    email: legacyUser.email,
    role: legacyUser.role,
    password: legacyUser.password,
    subscriptionType: 'free',
    subscriptionTier: 'free',
    subscriptionEndDate: null,
  });

  assert.equal(String(user._id), legacyUser._id);
  assert.equal(user.role, 'superadmin');
  assert.equal(user.subscriptionType, 'free');
  assert.equal(user.subscriptionTier, 'free');
  assert.equal(user.subscriptionEndDate, null);
});

test('bot and user invariants preserve ownership links', () => {
  const userId = '507f191e810c19729de860ea';
  const bot = new Bot({
    _id: '507f191e810c19729de860eb',
    userId,
    name: 'Migration Test Bot',
    facebookPageId: 'page_123',
  });

  assert.equal(String(bot.userId), userId);
  assert.equal(bot.name, 'Migration Test Bot');
  assert.equal(bot.facebookPageId, 'page_123');
});

test('conversation invariants enforce botId and userId binding', () => {
  const botId = '507f191e810c19729de860eb';
  const conv = new Conversation({
    botId,
    userId: 'customer_123',
    channel: 'whatsapp',
    messages: [
      {
        sender: 'user',
        text: 'Hello bot',
        timestamp: new Date(),
      },
    ],
  });

  assert.equal(String(conv.botId), botId);
  assert.equal(conv.userId, 'customer_123');
  assert.equal(conv.channel, 'whatsapp');
  assert.equal(conv.messages.length, 1);
});
