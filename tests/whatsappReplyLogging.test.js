'use strict';

// tests/whatsappReplyLogging.test.js
// Regression: whatsappController.processWebhook logged
// 'whatsapp_reply_sent' with a bare `botId` variable that does not exist in
// scope. The ReferenceError fired AFTER the reply was already sent to the
// customer, the outer catch returned 500 to Meta, and Meta's webhook
// retries then produced duplicate customer replies. The fix logs bot._id.
// This test drives a full inbound text webhook and asserts the handler
// acknowledges 200 (not 500) and sends exactly one reply.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Stub the bot engine BEFORE the controller destructures processMessage.
const botEngine = require('../server/botEngine');
let processMessageCalls = 0;
botEngine.processMessage = async () => {
  processMessageCalls += 1;
  return 'رد تجريبي';
};

// Stub the Graph API so no real network call happens and we can count sends.
let graphSends = 0;
const realFetch = global.fetch;
global.fetch = async () => {
  graphSends += 1;
  return { ok: true, status: 200, json: async () => ({}) };
};

const { processWebhook } = require('../server/controllers/whatsappController');
const Bot = require('../server/models/Bot');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-wareply-test'));
  await Bot.create({
    name: 'WhatsApp Bot',
    userId: new mongoose.Types.ObjectId(),
    whatsappBusinessAccountId: 'PHONE_NUMBER_ID_1',
  });
});

test.after(async () => {
  global.fetch = realFetch;
  await mongoose.disconnect();
  await mongod.stop();
});

test('inbound whatsapp text webhook acks 200 after sending exactly one reply', async () => {
  const req = {
    body: {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'PHONE_NUMBER_ID_1' },
                messages: [
                  { from: '201000000001', id: 'wamid.test', type: 'text', text: { body: 'مرحبا' } },
                ],
              },
            },
          ],
        },
      ],
    },
  };
  let status = null;
  const res = {
    sendStatus(code) {
      status = code;
      return this;
    },
  };

  await processWebhook(req, res);

  assert.equal(status, 200, 'handler must acknowledge 200, not 500 after the reply');
  assert.equal(processMessageCalls, 1);
  assert.equal(graphSends, 1, 'exactly one reply must be sent to the customer');
});
