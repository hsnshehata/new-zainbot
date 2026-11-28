'use strict';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Store = require('../server/models/Store');
const Bot = require('../server/models/Bot');
const controller = require('../server/controllers/storeController');

const OWNER = new mongoose.Types.ObjectId();
const OTHER = new mongoose.Types.ObjectId();
let mongod; let bot; let bareBot; let store;

function call(userId, botId, role = 'user') {
  const req = { user: { userId: String(userId), role }, query: { botId: botId && String(botId) } };
  const res = { statusCode: 200, payload: null, status(c) { this.statusCode = c; return this; }, json(p) { this.payload = p; return this; } };
  return controller.getMyStore(req, res).then(() => res);
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-storemine-test'));
  bot = await Bot.create({ userId: OWNER, name: 'Bot A', botName: 'Bot A', username: 'bota' + Date.now() });
  bareBot = await Bot.create({ userId: OWNER, name: 'Bot B', botName: 'Bot B', username: 'botb' + Date.now() });
  store = await Store.create({ userId: OWNER, botId: bot._id, storeName: 'Mine Store', storeLink: 'mine-store', templateId: 1 });
  await Bot.updateOne({ _id: bot._id }, { $set: { storeId: store._id } });
});
test.after(async () => { await mongoose.disconnect(); await mongod.stop(); });

test('owner gets the store linked to the bot', async () => {
  const res = await call(OWNER, bot._id);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.store.storeLink, 'mine-store');
  assert.equal(res.payload.storeCount, 1);
});
test('bot without a store returns store null and creates nothing', async () => {
  const res = await call(OWNER, bareBot._id);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.store, null);
  assert.equal(await Store.countDocuments({}), 1);
});
test('another user cannot read it; bad id is rejected', async () => {
  assert.equal((await call(OTHER, bot._id)).statusCode, 404);
  assert.equal((await call(OWNER, 'nope')).statusCode, 400);
  assert.equal((await call(OWNER, undefined)).statusCode, 400);
});
