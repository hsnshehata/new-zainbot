'use strict';

// Regression test for Instagram DM and comment webhook Conversation.labels schema crash.
// Uses a real Mongoose Conversation model backed by mongodb-memory-server so Mongoose
// schema casting/validation runs identically to production.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.CREDENTIAL_ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || `hex:${'a'.repeat(64)}`;

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

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

const axiosPosts = [];
const processedCalls = [];

stubModule('axios', {
  get: async (url) => {
    if (url.includes('/me?fields=id')) return { data: { id: 'ig-page-1' } };
    return { data: { name: 'IG Customer' } };
  },
  post: async (url, payload) => {
    axiosPosts.push({ url, payload });
    return { status: 200, data: { message_id: 'mid-1' } };
  },
});
stubModule('../server/logger', { info() {}, warn() {}, error() {} });
stubModule('../server/botEngine', {
  processMessage: async (...args) => {
    processedCalls.push(args);
    return 'أهلاً بك من إنستجرام!';
  },
});

const Bot = require('../server/models/Bot');
const Conversation = require('../server/models/Conversation');
const { handleMessage } = require('../server/controllers/instagramController');

let mongod;
let activeBot;
let pausedBot;

function mkRes() {
  return {
    statusCode: null,
    sendStatus(code) {
      this.statusCode = code;
      return this;
    },
  };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  activeBot = await Bot.create({
    userId: new mongoose.Types.ObjectId(),
    name: 'IG Active Bot',
    isActive: true,
    instagramPageId: 'ig-page-active',
    instagramApiKey: 'test-ig-token',
    instagramCommentsRepliesEnabled: true,
  });

  pausedBot = await Bot.create({
    userId: new mongoose.Types.ObjectId(),
    name: 'IG Paused Bot',
    isActive: false,
    instagramPageId: 'ig-page-paused',
    instagramApiKey: 'test-ig-token',
    instagramCommentsRepliesEnabled: true,
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  axiosPosts.length = 0;
  processedCalls.length = 0;
  await Conversation.deleteMany({});
});

test('Instagram DM webhook persists label object { name: "new_message" } without Mongoose CastError', async () => {
  const res = mkRes();
  await handleMessage({
    body: {
      object: 'instagram',
      entry: [{
        id: 'ig-page-active',
        messaging: [{
          sender: { id: 'ig-user-1' },
          recipient: { id: 'ig-page-active' },
          timestamp: Date.now(),
          message: { mid: 'ig-mid-1', text: 'السلام عليكم' },
        }],
      }],
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(processedCalls.length, 1);
  assert.equal(axiosPosts.length, 1);

  const conv = await Conversation.findOne({ botId: activeBot._id, userId: 'instagram_ig-user-1' }).lean();
  assert.ok(conv, 'conversation must be persisted');
  assert.equal(conv.labels.length, 1);
  assert.equal(conv.labels[0].name, 'new_message');

  // Sending a second DM must not duplicate the 'new_message' label
  const res2 = mkRes();
  await handleMessage({
    body: {
      object: 'instagram',
      entry: [{
        id: 'ig-page-active',
        messaging: [{
          sender: { id: 'ig-user-1' },
          recipient: { id: 'ig-page-active' },
          timestamp: Date.now(),
          message: { mid: 'ig-mid-2', text: 'كم السعر؟' },
        }],
      }],
    },
  }, res2);
  assert.equal(res2.statusCode, 200);
  const convAfter = await Conversation.findOne({ botId: activeBot._id, userId: 'instagram_ig-user-1' }).lean();
  assert.equal(convAfter.labels.length, 1);
});

test('Instagram comment webhook persists label object { name: "new_comment" } without Mongoose CastError', async () => {
  const res = mkRes();
  await handleMessage({
    body: {
      object: 'instagram',
      entry: [{
        id: 'ig-page-active',
        changes: [{
          field: 'comments',
          value: {
            id: 'ig-comment-1',
            text: 'التفاصيل من فضلك',
            from: { id: 'ig-commenter-9' },
          },
        }],
      }],
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(processedCalls.length, 1);
  assert.equal(axiosPosts.length, 1);

  const conv = await Conversation.findOne({ botId: activeBot._id, userId: 'instagram_comment_ig-commenter-9' }).lean();
  assert.ok(conv, 'comment conversation must be persisted');
  assert.equal(conv.labels.length, 1);
  assert.equal(conv.labels[0].name, 'new_comment');
});

test('Instagram webhook skips paused bot without calling processMessage or sending replies', async () => {
  const res = mkRes();
  await handleMessage({
    body: {
      object: 'instagram',
      entry: [{
        id: 'ig-page-paused',
        messaging: [{
          sender: { id: 'ig-user-2' },
          recipient: { id: 'ig-page-paused' },
          timestamp: Date.now(),
          message: { mid: 'ig-mid-paused', text: 'مرحبا' },
        }],
      }],
    },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(processedCalls.length, 0);
  assert.equal(axiosPosts.length, 0);
});
