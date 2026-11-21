'use strict';

// tests/channelTokenCrypto.test.js
// Encryption-at-rest contract for per-merchant Meta channel tokens.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.NODE_ENV = 'test';
process.env.CREDENTIAL_ENCRYPTION_KEY = 'hex:' + 'b'.repeat(64);

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const {
  PREFIX,
  isEncryptedChannelToken,
  encryptChannelToken,
  decryptChannelToken,
} = require('../server/services/channelTokenCrypto');
const Bot = require('../server/models/Bot');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-token-qa'));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('round trip: encrypt -> prefixed ciphertext -> decrypt to original', () => {
  const token = 'EAAG_example_page_token_1234567890';
  const encrypted = encryptChannelToken(token);
  assert.ok(isEncryptedChannelToken(encrypted));
  assert.ok(!encrypted.includes(token));
  assert.equal(decryptChannelToken(encrypted), token);
});

test('legacy plaintext reads back as-is (lazy migration, nothing breaks)', () => {
  const legacy = 'EAAG_legacy_plaintext_token';
  assert.equal(decryptChannelToken(legacy), legacy);
  assert.equal(isEncryptedChannelToken(legacy), false);
});

test('encryption is idempotent: assigning an encrypted value does not re-wrap', () => {
  const encrypted = encryptChannelToken('EAAG_token_abcdefgh');
  assert.equal(encryptChannelToken(encrypted), encrypted);
});

test('empty and blank values stay empty without needing the key', () => {
  assert.equal(encryptChannelToken(''), '');
  assert.equal(encryptChannelToken('   '), '');
  assert.equal(decryptChannelToken(''), '');
});

test('tampered ciphertext throws (fail-closed, never returns garbage)', () => {
  const encrypted = encryptChannelToken('EAAG_token_abcdefgh');
  const raw = Buffer.from(encrypted.slice(PREFIX.length), 'base64');
  raw[raw.length - 1] ^= 0xff;
  const tampered = PREFIX + raw.toString('base64');
  assert.throws(() => decryptChannelToken(tampered));
});

test('Bot model: setter encrypts at rest, raw document holds ciphertext only', async () => {
  const bot = await Bot.create({
    name: 'بوت التشفير',
    userId: new mongoose.Types.ObjectId(),
    facebookApiKey: 'EAAG_fb_secret_token_xyz',
    instagramApiKey: 'IG_secret_token_xyz',
    whatsappApiKey: 'WA_secret_token_xyz',
  });
  // In-memory property is the ciphertext (setter-only design)...
  assert.ok(isEncryptedChannelToken(bot.facebookApiKey));
  // ...and the raw stored document contains no plaintext anywhere.
  const raw = await mongoose.connection.db.collection('bots').findOne({ _id: bot._id });
  assert.ok(isEncryptedChannelToken(raw.facebookApiKey));
  assert.ok(isEncryptedChannelToken(raw.instagramApiKey));
  assert.ok(isEncryptedChannelToken(raw.whatsappApiKey));
  assert.ok(!raw.facebookApiKey.includes('EAAG_fb_secret_token_xyz'));
  // The use-site helper recovers the original tokens.
  assert.equal(decryptChannelToken(raw.facebookApiKey), 'EAAG_fb_secret_token_xyz');
  assert.equal(decryptChannelToken(raw.instagramApiKey), 'IG_secret_token_xyz');
  assert.equal(decryptChannelToken(raw.whatsappApiKey), 'WA_secret_token_xyz');
});

test('legacy plaintext row: untouched by unrelated saves, encrypted on explicit token write', async () => {
  const botId = new mongoose.Types.ObjectId();
  await mongoose.connection.db.collection('bots').insertOne({
    _id: botId,
    name: 'بوت قديم',
    userId: new mongoose.Types.ObjectId(),
    facebookApiKey: 'EAAG_legacy_row_token',
  });
  const bot = await Bot.findById(botId);
  assert.equal(bot.facebookApiKey, 'EAAG_legacy_row_token'); // untouched read
  assert.equal(decryptChannelToken(bot.facebookApiKey), 'EAAG_legacy_row_token');
  // Unrelated save must NOT migrate the existing secret (owner-held authority).
  bot.name = 'بوت قديم محدث';
  await bot.save();
  let raw = await mongoose.connection.db.collection('bots').findOne({ _id: botId });
  assert.equal(raw.facebookApiKey, 'EAAG_legacy_row_token');
  // Explicitly writing the token field encrypts at rest.
  bot.facebookApiKey = 'EAAG_legacy_row_token';
  await bot.save();
  raw = await mongoose.connection.db.collection('bots').findOne({ _id: botId });
  assert.ok(isEncryptedChannelToken(raw.facebookApiKey));
  assert.equal(decryptChannelToken(raw.facebookApiKey), 'EAAG_legacy_row_token');
});
