'use strict';

// tests/adminKeysEncryption.test.js
// Encrypted-on-write contract of the admin keys controller, against real
// MongoDB (mongodb-memory-server) with a synthetic key:
// - with CREDENTIAL_ENCRYPTION_KEY configured, addKey stores an encrypted
//   AiCredential and never writes plaintext anywhere;
// - the admin UI response shape is preserved (storage: 'encrypted', last4,
//   defaultModel/priority round-trip);
// - list merges legacy + encrypted; update/delete route by the 'cred_' prefix;
// - rotating the secret re-encrypts; legacy plaintext path still works when
//   encryption is not configured.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ProviderKey = require('../server/models/ProviderKey');
const AiCredential = require('../server/models/AiCredential');
const {
  buildCredentialContext,
  decryptCredentialSecret,
} = require('../server/services/AiCredentialCrypto');
const controller = require('../server/controllers/adminKeysController');

const TEST_KEY_ENV = 'hex:' + 'b'.repeat(64);
const SYNTHETIC_KEY = 'sk-synthetic-admin-key-not-real';
const ACTOR_ID = new mongoose.Types.ObjectId();

let mongod;

function setEncryption(on) {
  if (on) process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY_ENV;
  else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
}

function reqRes(body = {}, params = {}) {
  const req = {
    auth: { actorRole: 'superadmin', isImpersonating: false, actorUserId: String(ACTOR_ID) },
    body,
    params,
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
  await mongoose.connect(mongod.getUri('zainbot-adminkeys-test'));
  await AiCredential.ensureIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await ProviderKey.deleteMany({});
  await AiCredential.deleteMany({});
});

test('addKey with encryption configured stores an encrypted credential, never plaintext', { timeout: 60000 }, async () => {
  setEncryption(true);
  const { req, res } = reqRes({
    name: 'Primary OpenAI',
    provider: 'openai',
    apiKey: SYNTHETIC_KEY,
    defaultModel: 'gpt-4o',
    priority: 2,
  });
  await controller.addKey(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.storage, 'encrypted');
  assert.ok(String(res.payload.data._id).startsWith('cred_'));
  assert.equal(res.payload.data.last4, SYNTHETIC_KEY.slice(-4));
  assert.equal(res.payload.data.defaultModel, 'gpt-4o');
  assert.equal(res.payload.data.priority, 2);
  assert.equal(res.payload.data.status, 'working');

  // No plaintext anywhere: providerkeys empty, credential decrypts round-trip.
  assert.equal(await ProviderKey.countDocuments(), 0);
  const stored = await AiCredential.findOne({ name: 'Primary OpenAI' })
    .select('+secretCiphertext +secretIv +secretAuthTag +encryptionKeyId')
    .lean();
  assert.ok(stored);
  assert.ok(!JSON.stringify(stored).includes(SYNTHETIC_KEY), 'no plaintext secret in stored document');
  const roundTrip = decryptCredentialSecret(stored, {
    context: buildCredentialContext(stored._id, stored.provider),
  });
  assert.equal(roundTrip, SYNTHETIC_KEY);
});

test('addKey with a duplicate name+provider returns 409', { timeout: 60000 }, async () => {
  setEncryption(true);
  const body = { name: 'Dup', provider: 'openai', apiKey: SYNTHETIC_KEY, defaultModel: 'gpt-4o' };
  const first = reqRes(body);
  await controller.addKey(first.req, first.res);
  const second = reqRes(body);
  await controller.addKey(second.req, second.res);
  assert.equal(second.res.statusCode, 409);
});

test('listKeys merges legacy plaintext and encrypted entries with UI fields', { timeout: 60000 }, async () => {
  setEncryption(true);
  await ProviderKey.create({
    name: 'Legacy',
    provider: 'gemini',
    apiKey: 'legacy-synthetic-key',
    defaultModel: 'gemini-pro',
  });
  const add = reqRes({ name: 'Encrypted', provider: 'openai', apiKey: SYNTHETIC_KEY, defaultModel: 'gpt-4o' });
  await controller.addKey(add.req, add.res);

  const { req, res } = reqRes();
  await controller.listKeys(req, res);
  assert.equal(res.statusCode, 200);
  const legacy = res.payload.data.find((k) => k.name === 'Legacy');
  const encrypted = res.payload.data.find((k) => k.name === 'Encrypted');
  assert.equal(legacy.storage, 'legacy_plaintext');
  assert.equal(encrypted.storage, 'encrypted');
  assert.equal(encrypted.status, 'working');
  assert.equal(encrypted.isActive, true);
});

test('updateKey on a cred_ id toggles status and rotates the secret', { timeout: 60000 }, async () => {
  setEncryption(true);
  const add = reqRes({ name: 'Rotatable', provider: 'openai', apiKey: SYNTHETIC_KEY, defaultModel: 'gpt-4o' });
  await controller.addKey(add.req, add.res);
  const credId = add.res.payload.data._id;

  // Deactivate.
  const off = reqRes({ isActive: false }, { id: credId });
  await controller.updateKey(off.req, off.res);
  assert.equal(off.res.payload.data.isActive, false);
  assert.equal(off.res.payload.data.status, 'working', 'disabled is not failed');

  // Rotate the secret.
  const NEW_KEY = 'sk-synthetic-rotated-key-not-real';
  const rotate = reqRes({ apiKey: NEW_KEY }, { id: credId });
  await controller.updateKey(rotate.req, rotate.res);
  assert.equal(rotate.res.payload.data.last4, NEW_KEY.slice(-4));

  const stored = await AiCredential.findOne({ name: 'Rotatable' })
    .select('+secretCiphertext +secretIv +secretAuthTag +encryptionKeyId')
    .lean();
  const roundTrip = decryptCredentialSecret(stored, {
    context: buildCredentialContext(stored._id, stored.provider),
  });
  assert.equal(roundTrip, NEW_KEY, 'rotated secret re-encrypted');
});

test('deleteKey on a cred_ id removes the credential', { timeout: 60000 }, async () => {
  setEncryption(true);
  const add = reqRes({ name: 'ToDelete', provider: 'openai', apiKey: SYNTHETIC_KEY, defaultModel: 'gpt-4o' });
  await controller.addKey(add.req, add.res);
  const del = reqRes({}, { id: add.res.payload.data._id });
  await controller.deleteKey(del.req, del.res);
  assert.equal(del.res.statusCode, 200);
  assert.equal(await AiCredential.countDocuments(), 0);
});

test('legacy plaintext path still works when encryption is not configured', { timeout: 60000 }, async () => {
  setEncryption(false);
  const { req, res } = reqRes({
    name: 'LegacyPlain',
    provider: 'openai',
    apiKey: SYNTHETIC_KEY,
    defaultModel: 'gpt-4o',
  });
  await controller.addKey(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.data.storage, 'legacy_plaintext');
  assert.equal(await ProviderKey.countDocuments(), 1);
  assert.equal(await AiCredential.countDocuments(), 0);
});
