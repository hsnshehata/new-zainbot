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

test('botEngine reply text, raw userId and provider error objects stay out of logs (B3)', () => {
  const src = read('server/botEngine.js');
  assert.ok(!src.includes("logger.info('💬 Assistant reply', { reply })"), 'full assistant reply log returned');
  assert.ok(!src.includes('📢 Raw userId received'), 'raw sender-id debug log returned');
  assert.ok(!src.includes('return err.message;'), 'provider error text must not be returned to the customer');
  assert.ok(!src.includes("logger.error('❌ Error calling OpenAI:', { err })"), 'raw OpenAI error object log returned');
  assert.ok(!src.includes('{ err: e }'), 'raw caught-error object log returned');
  assert.ok(!src.includes("{ mediaUrl }"), 'raw media URL log returned');
});

test('telegram send errors log fixed metadata only', () => {
  const tg = read('server/services/telegramService.js');
  assert.ok(!tg.includes('err.response?.data?.description || err.message'), 'telegram provider text log returned');
});

test('booking extraction: no silent dispatch catches, no customer name in logs', () => {
  const bk = read('server/controllers/bookingsController.js');
  assert.ok(!bk.includes('.catch(() => {})'), 'silent notification catch returned');
  assert.ok(!bk.includes('customerName, bookingDate'), 'customer name in creation log returned');
});

test('AI provider key failures log fixed metadata only (L1/L2)', () => {
  const src = read('server/services/aiFailover.js');
  assert.ok(!src.includes('User private key failed: ${err.message}'), 'raw provider error in user-key log returned');
  assert.ok(!src.includes('تعذر استخدام مفتاحك الخاص: ${err.message}'), 'provider error text rethrown to caller returned');
  assert.ok(!src.includes('Error: ${err.message}'), 'raw provider error in platform-key log returned');
});

test('landing demo failure logs fixed metadata only (L3)', () => {
  const src = read('server/routes/landingDemo.js');
  assert.ok(!src.includes('message: err.message'), 'raw provider error in demo log returned');
});
