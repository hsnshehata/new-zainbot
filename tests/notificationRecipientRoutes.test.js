'use strict';

// D06 — testRecipient outcome contract: explicit `delivered`|`configured`,
// WhatsApp-without-bot is NOT delivered, no provider/raw leakage.
// Stubs/mocks only: no Telegram/WhatsApp sends, no DB.

const test = require('node:test');
const assert = require('node:assert/strict');

const telegramCalls = [];
const waCalls = [];

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

// Stub services BEFORE the controller loads (it destructures them at require).
let telegramResult = { ok: true };
let waBehavior = { throw: null };
stubModule('../server/services/telegramService', {
  sendTelegramMessage: async (...args) => {
    telegramCalls.push(args);
    return telegramResult;
  },
});
stubModule('../server/services/whatsappSessionManager', {
  getWhatsAppSessionManager: () => ({
    sendDirectText: async (...args) => {
      waCalls.push(args);
      if (waBehavior.throw) throw waBehavior.throw;
      return { ok: true };
    },
  }),
});
stubModule('../server/logger', { error() {}, warn() {}, info() {} });

const controller = require('../server/controllers/notificationsController');
const NotificationRecipient = require('../server/models/NotificationRecipient');

const OWNER_ID = '507f191e810c19729de86001';
const OTHER_ID = '507f191e810c19729de86002';
const RECIPIENT_ID = '507f191e810c19729de86010';

let recipientDoc = null;
let findOneArgs = null;
const realFindOne = NotificationRecipient.findOne;
NotificationRecipient.findOne = async (query) => {
  findOneArgs = query;
  if (recipientDoc && String(query.userId) === String(recipientDoc.userId)) {
    return recipientDoc;
  }
  return null;
};
test.after(() => {
  NotificationRecipient.findOne = realFindOne;
});

function reset(overrides = {}) {
  telegramCalls.length = 0;
  waCalls.length = 0;
  findOneArgs = null;
  telegramResult = { ok: true };
  waBehavior = { throw: null };
  recipientDoc = {
    _id: RECIPIENT_ID,
    userId: OWNER_ID,
    channel: 'telegram',
    target: '123456',
    botId: null,
    ...overrides,
  };
}

async function invoke(userId) {
  const result = { statusCode: 200, body: undefined };
  const req = { params: { id: RECIPIENT_ID }, user: { userId }, body: {} };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await controller.testRecipient(req, res);
  return result;
}

test('telegram success reports delivered with a single attempt', async () => {
  reset({ channel: 'telegram', target: 'tg-1' });
  const result = await invoke(OWNER_ID);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.outcome, 'delivered');
  assert.equal(telegramCalls.length, 1);
  assert.deepEqual(findOneArgs, { _id: RECIPIENT_ID, userId: OWNER_ID });
});

test('telegram failure reports configured with a stable code, no reason leak', async () => {
  reset({ channel: 'telegram', target: 'tg-2' });
  telegramResult = { ok: false, reason: 'SENTINEL_PROVIDER_FORBIDDEN_xyz' };
  const result = await invoke(OWNER_ID);
  assert.equal(result.statusCode, 400);
  assert.equal(result.body.success, false);
  assert.equal(result.body.outcome, 'configured');
  assert.equal(result.body.code, 'TELEGRAM_TEST_FAILED');
  assert.doesNotMatch(JSON.stringify(result.body), /SENTINEL_PROVIDER_FORBIDDEN_xyz/);
  assert.equal(telegramCalls.length, 1);
});

test('whatsapp without a bot is configured, never delivered, no send attempted', async () => {
  reset({ channel: 'whatsapp', target: '01001234567', botId: null });
  const result = await invoke(OWNER_ID);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.outcome, 'configured');
  assert.notEqual(result.body.outcome, 'delivered');
  assert.equal(waCalls.length, 0);
});

test('whatsapp with a bot delivers once as plain text', async () => {
  reset({ channel: 'whatsapp', target: '01001234567', botId: 'bot-9' });
  const result = await invoke(OWNER_ID);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.outcome, 'delivered');
  assert.equal(waCalls.length, 1);
  assert.equal(waCalls[0][0], 'bot-9');
  assert.equal(waCalls[0][1], '01001234567');
  assert.doesNotMatch(String(waCalls[0][2]), /[<>]/);
});

test('whatsapp send exception hides internals behind a stable code', async () => {
  reset({ channel: 'whatsapp', target: '01001234567', botId: 'bot-9' });
  waBehavior = { throw: new Error('SENTINEL_WA_SOCKET_BOOM trace') };
  const result = await invoke(OWNER_ID);
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'RECIPIENT_TEST_FAILED');
  assert.doesNotMatch(JSON.stringify(result.body), /SENTINEL_WA_SOCKET_BOOM/);
  assert.equal(waCalls.length, 1);
});

test('cross-user recipient resolves to 404 (ownership scoped)', async () => {
  reset({ channel: 'telegram', target: 'tg-3' });
  const result = await invoke(OTHER_ID);
  assert.equal(result.statusCode, 404);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'RECIPIENT_NOT_FOUND');
  assert.equal(telegramCalls.length, 0);
  assert.equal(waCalls.length, 0);
});
