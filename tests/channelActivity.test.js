'use strict';

// tests/channelActivity.test.js
// GET /api/bots/:id/channel-activity: a channel counts as verified only when
// a real conversation with messages exists for it, and lastAt is the newest
// message timestamp. This is what lets the dashboard show "connected" based
// on real state instead of "saved, unconfirmed" forever.

const test = require('node:test');
const assert = require('node:assert/strict');

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

const state = {
  byChannel: {},
  queries: [],
};

function makeQuery(result) {
  return {
    lean: async () => result,
  };
}

stubModule('../server/logger', { info() {}, warn() {}, error() {} });
stubModule('../server/models/Conversation', {
  findOne: (filter, projection) => {
    state.queries.push({ filter, projection });
    const candidate = state.byChannel[filter.channel] || null;
    // honor the 'messages.0' existence condition the real query applies
    const matches = candidate && Array.isArray(candidate.messages) && candidate.messages.length > 0;
    return makeQuery(matches ? candidate : null);
  },
});

const botsController = require('../server/controllers/botsController');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

test('channel activity verifies channels with real messages only', async () => {
  state.byChannel = {
    whatsapp: {
      messages: [
        { timestamp: new Date('2026-11-26T20:00:00Z') },
        { timestamp: new Date('2026-11-27T02:41:00Z') },
      ],
    },
    facebook: { messages: [] }, // exists but no messages -> not verified
  };
  state.queries.length = 0;

  const req = { bot: { _id: 'bot-1' } };
  const res = createResponse();
  await botsController.getChannelActivity(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  const data = res.body.data;

  assert.equal(data.whatsapp.verified, true);
  assert.equal(data.whatsapp.lastAt.toISOString(), '2026-11-27T02:41:00.000Z');

  assert.equal(data.facebook.verified, false);
  assert.equal(data.facebook.lastAt, null);

  assert.equal(data.instagram.verified, false);
  assert.equal(data.telegram.verified, false);

  const channels = state.queries.map((q) => q.filter.channel).sort();
  assert.deepEqual(channels, ['facebook', 'instagram', 'telegram', 'whatsapp']);
  for (const q of state.queries) {
    assert.equal(String(q.filter.botId), 'bot-1');
    assert.deepEqual(q.filter['messages.0'], { $exists: true });
  }
});

test('channel activity reports 500 on database failure', async () => {
  const resolved = require.resolve('../server/models/Conversation');
  require.cache[resolved].exports = {
    findOne: () => ({ lean: async () => { throw new Error('db down'); } }),
  };
  delete require.cache[require.resolve('../server/controllers/botsController')];
  const fresh = require('../server/controllers/botsController');

  const res = createResponse();
  await fresh.getChannelActivity({ bot: { _id: 'bot-1' } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});
