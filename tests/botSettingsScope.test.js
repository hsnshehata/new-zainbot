'use strict';

// tests/botSettingsScope.test.js
// IDOR regression: botController.getSettings returned any bot's settings
// to any authenticated caller on mounts that lack loadAccessibleBot
// (routes/bots.js, routes/facebook.js, routes/instagram.js). It must
// apply the same ownership gate updateSettings already had.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Bot = require('../server/models/Bot');
const controller = require('../server/controllers/botController');

const OWNER_ID = new mongoose.Types.ObjectId();
const OTHER_ID = new mongoose.Types.ObjectId();

let mongod;
let bot;

function reqRes({ userId, role } = {}) {
  const req = {
    user: { userId: String(userId), role: role || 'user' },
    params: { id: String(bot._id) },
    body: {},
  };
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
  await mongoose.connect(mongod.getUri());
  bot = await Bot.create({
    userId: OWNER_ID,
    name: 'بوت اختبار',
    workingHours: { start: '09:00', end: '21:00' },
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('owner reads bot settings', async () => {
  const { req, res } = reqRes({ userId: OWNER_ID });
  await controller.getSettings(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
  assert.ok(res.payload.data);
});

test('another tenant cannot read bot settings (403)', async () => {
  const { req, res } = reqRes({ userId: OTHER_ID });
  await controller.getSettings(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload && res.payload.data, undefined);
});

test('superadmin retains settings read access', async () => {
  const { req, res } = reqRes({ userId: OTHER_ID, role: 'superadmin' });
  await controller.getSettings(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.success, true);
});
