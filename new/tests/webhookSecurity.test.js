const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  timingSafeStringEqual,
  verifyMetaSignature,
  verifyTelegramWebhookSecret,
} = require('../server/middleware/verifyWebhookSignature');

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

test('timing-safe comparison handles equal and unequal values', () => {
  assert.equal(timingSafeStringEqual('same', 'same'), true);
  assert.equal(timingSafeStringEqual('same', 'different'), false);
  assert.equal(timingSafeStringEqual('', ''), true);
});

test('Meta signature middleware accepts only the matching raw body signature', () => {
  process.env.TEST_META_SECRET = 'test-meta-secret';
  const rawBody = Buffer.from('{"event":"message"}');
  const signature = `sha256=${crypto
    .createHmac('sha256', process.env.TEST_META_SECRET)
    .update(rawBody)
    .digest('hex')}`;
  let nextCalls = 0;
  const req = {
    rawBody,
    path: '/facebook',
    requestId: 'request-1',
    get(name) {
      return name.toLowerCase() === 'x-hub-signature-256' ? signature : undefined;
    },
  };
  const res = createResponse();

  verifyMetaSignature('TEST_META_SECRET')(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
});

test('Meta signature middleware rejects an invalid signature', () => {
  process.env.TEST_META_SECRET = 'test-meta-secret';
  const req = {
    rawBody: Buffer.from('{"event":"message"}'),
    path: '/facebook',
    requestId: 'request-2',
    get() {
      return 'sha256=invalid';
    },
  };
  const res = createResponse();

  verifyMetaSignature('TEST_META_SECRET')(req, res, () => {
    throw new Error('next must not be called');
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'INVALID_WEBHOOK_SIGNATURE');
});

test('Telegram webhook middleware requires the configured secret header', () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = 'telegram-test-secret';
  const req = {
    requestId: 'request-3',
    get(name) {
      return name.toLowerCase() === 'x-telegram-bot-api-secret-token'
        ? 'telegram-test-secret'
        : undefined;
    },
  };
  const res = createResponse();
  let nextCalls = 0;

  verifyTelegramWebhookSecret(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 200);
});
