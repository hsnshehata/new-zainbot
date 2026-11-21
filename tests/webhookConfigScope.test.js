'use strict';

// tests/webhookConfigScope.test.js
// Regression: integrationsController.setWebhookConfig accepted any botId in
// the request body without verifying the caller owns that bot. The config
// row itself was scoped to the caller's userId, but a dangling config
// pointing at someone else's botId must not be creatable. The fix gates on
// bot ownership (direct superadmin keeps full access), mirroring the
// established actorRole/isImpersonating pattern.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Bot = require('../server/models/Bot');
const controller = require('../server/controllers/integrationsController');

const OWNER_ID = new mongoose.Types.ObjectId();
const OTHER_ID = new mongoose.Types.ObjectId();

let mongod;
let bot;

function reqRes({ userId, role, auth } = {}) {
  const req = {
    user: { userId: String(userId), role: role || 'user' },
    // Public IP literal: the SSRF guard checks literals without DNS, so the
    // test does not depend on sandbox name resolution.
    body: { botId: String(bot._id), url: 'https://93.184.216.34/hook' },
  };
  if (auth) req.auth = auth;
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
  return { req, res };
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-whconfig-test'));
  bot = await Bot.create({ name: 'Hook Bot', userId: OWNER_ID });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('bot owner can set a webhook config for their bot', async () => {
  const { req, res } = reqRes({ userId: OWNER_ID });
  await controller.setWebhookConfig(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
});

test('non-owner cannot attach a webhook config to someone else\'s bot', async () => {
  const { req, res } = reqRes({ userId: OTHER_ID });
  await controller.setWebhookConfig(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.success, false);
});

test('direct superadmin can set a webhook config for any bot', async () => {
  const { req, res } = reqRes({
    userId: OTHER_ID,
    role: 'superadmin',
    auth: { actorRole: 'superadmin', isImpersonating: false },
  });
  await controller.setWebhookConfig(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
});
