'use strict';

// tests/providerKeyMigration.test.js
// Real-Mongo test for the plaintext ProviderKey -> encrypted AiCredential
// migration: dry run writes nothing, apply encrypts + unsets the plaintext,
// reruns are idempotent, and the migrated credential decrypts back to the
// original key. Uses a synthetic key and mongodb-memory-server only.

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
const { migrateProviderKeys } = require('../scripts/migrateProviderKeysToCredentials');

const TEST_ENV = {
  CREDENTIAL_ENCRYPTION_KEY: 'hex:' + 'a'.repeat(64),
};
const SYNTHETIC_KEY = 'sk-synthetic-test-key-not-real';

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-migration-test'));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('migration: dry run is read-only, apply encrypts and clears plaintext, rerun is idempotent', { timeout: 60000 }, async () => {
  await ProviderKey.create({
    name: 'Primary OpenAI',
    provider: 'openai',
    apiKey: SYNTHETIC_KEY,
    defaultModel: 'gpt-4o',
    priority: 1,
  });
  await ProviderKey.create({
    name: 'Legacy http base',
    provider: 'gemini',
    apiKey: 'another-synthetic-key',
    baseUrl: 'http://insecure.internal:8080',
    defaultModel: 'gemini-pro',
  });

  const silentLog = { info() {} };

  // 1) Dry run: counts only, nothing written.
  const dry = await migrateProviderKeys({
    ProviderKey,
    AiCredential,
    environment: TEST_ENV,
    dryRun: true,
    log: silentLog,
  });
  assert.equal(dry.eligible, 2);
  assert.equal(dry.migrated, 0);
  assert.equal(await AiCredential.countDocuments(), 0, 'dry run created nothing');
  let raw = await mongoose.connection.collection('providerkeys').findOne({ name: 'Primary OpenAI' });
  assert.equal(raw.apiKey, SYNTHETIC_KEY, 'dry run left plaintext untouched');

  // 2) Apply: credentials created, plaintext removed.
  const applied = await migrateProviderKeys({
    ProviderKey,
    AiCredential,
    environment: TEST_ENV,
    dryRun: false,
    log: silentLog,
  });
  assert.equal(applied.migrated, 2);
  assert.equal(applied.baseUrlDropped, 1, 'non-https baseUrl dropped');

  raw = await mongoose.connection.collection('providerkeys').findOne({ name: 'Primary OpenAI' });
  assert.ok(!('apiKey' in raw), 'plaintext field removed from stored document');
  assert.equal(raw.isActive, false);
  assert.equal(raw.errorMessage, 'migrated_to_encrypted_ai_credential');

  // 3) The migrated credential decrypts back to the original key.
  const credential = await AiCredential.findOne({ name: 'Primary OpenAI', provider: 'openai' })
    .select('+secretCiphertext +secretIv +secretAuthTag +encryptionKeyId')
    .lean();
  assert.ok(credential, 'encrypted credential stored');
  const roundTrip = decryptCredentialSecret(credential, {
    context: buildCredentialContext(credential._id, credential.provider),
    environment: TEST_ENV,
  });
  assert.equal(roundTrip, SYNTHETIC_KEY);

  // The migrated credential carries the display/failover metadata labels the
  // admin UI reads (model, priority, last4).
  assert.ok(credential.labels.includes('model:gpt-4o'), 'model label carried');
  assert.ok(credential.labels.includes('priority:1'), 'priority label carried');
  assert.ok(
    credential.labels.some((l) => l === 'last4:' + SYNTHETIC_KEY.slice(-4)),
    'last4 label carried'
  );

  // 4) Rerun: nothing re-migrated, existing credentials untouched.
  const second = await migrateProviderKeys({
    ProviderKey,
    AiCredential,
    environment: TEST_ENV,
    dryRun: false,
    log: silentLog,
  });
  assert.equal(second.migrated, 0);
  assert.equal(second.scanned, 0, 'deactivated legacy keys are out of scope');
  assert.equal(await AiCredential.countDocuments(), 2);
});

test('migration refuses to run without a valid encryption key', { timeout: 60000 }, async () => {
  await assert.rejects(
    migrateProviderKeys({
      ProviderKey,
      AiCredential,
      environment: { CREDENTIAL_ENCRYPTION_KEY: 'not-a-key' },
      dryRun: true,
      log: { info() {} },
    }),
    /CREDENTIAL_ENCRYPTION_KEY/
  );
});
