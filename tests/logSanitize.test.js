'use strict';

// tests/logSanitize.test.js
// Privacy regression: customer message text, sender numbers and provider
// token material must never reach logs. Two layers:
// 1. Unit tests for redactSensitive (key-based redaction + truncation).
// 2. Source guards pinning the known raw-content log sites that existed
//    before the fix, so they cannot silently come back.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { redactSensitive } = require('../server/utils/logSanitize');

test('redactSensitive redacts token/secret/password keys at any depth', () => {
  const input = {
    access_token: 'EAA-secret',
    error: { message: 'bad', fb_exchange_token: 'inner-secret' },
    list: [{ client_secret: 's3' }, 'plain'],
    normalField: 'visible',
    count: 3,
  };
  const out = redactSensitive(input);
  assert.equal(out.access_token, '[REDACTED]');
  assert.equal(out.error.fb_exchange_token, '[REDACTED]');
  assert.equal(out.error.message, 'bad');
  assert.equal(out.list[0].client_secret, '[REDACTED]');
  assert.equal(out.list[1], 'plain');
  assert.equal(out.normalField, 'visible');
  assert.equal(out.count, 3);
  // original untouched
  assert.equal(input.access_token, 'EAA-secret');
});

test('redactSensitive truncates long strings and handles edge values', () => {
  assert.equal(redactSensitive('x'.repeat(500)).length, 200 + '...[TRUNCATED]'.length);
  assert.equal(redactSensitive(null), null);
  assert.equal(redactSensitive(undefined), undefined);
  assert.equal(redactSensitive('short'), 'short');
  assert.equal(redactSensitive(42), 42);
});

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('botEngine no longer logs message bodies or raw media URLs', () => {
  const src = read('server/botEngine.js');
  assert.ok(!src.includes("{ content: userMessageContent }"), 'raw content log returned');
  assert.ok(!src.includes("logger.info('💬 User message added to conversation', { userMessageContent })"));
  assert.ok(!src.includes("logger.info('📤 Sending to OpenAI for processing', { userMessageContent })"));
  assert.ok(!src.includes('messageContent, userMessage'), 'feedback log must drop message text');
  assert.ok(!src.includes('source: voiceSource.slice'), 'raw media URL log returned');
});

test('whatsapp webhook no longer logs the full inbound payload', () => {
  const src = read('server/controllers/whatsappController.js');
  assert.ok(!src.includes("logger.info('whatsapp_message_data', { data: messageData })"));
});

test('provider token-exchange paths log only redacted payloads', () => {
  const bots = read('server/controllers/botsController.js');
  assert.ok(!bots.includes('response: response.data'), 'raw fb exchange response log returned');
  assert.ok(!bots.includes('response: tokenResponse.data'), 'raw ig exchange response log returned');
  assert.ok(!bots.includes('response: longLivedTokenResponse.data'), 'raw ig long exchange response log returned');
  assert.ok(!bots.includes('response: err.response?.data'), 'raw exchange error payload log returned');
  const ig = read('server/controllers/instagramController.js');
  assert.ok(!ig.includes('err: err.response?.data ||'), 'raw ig validation error payload log returned');
  const cron = read('server/cronJobs.js');
  assert.ok(!cron.includes('error: err.response?.data ||'), 'raw cron token error payload log returned');
});
