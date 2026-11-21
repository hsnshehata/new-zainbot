'use strict';

// scripts/migrateProviderKeysToCredentials.js
// Migrates legacy plaintext ProviderKey API keys into encrypted AiCredential
// documents (AES-256-GCM control plane), then deactivates the plaintext copy.
//
// Safety contract:
// - DRY RUN by default: reads and reports counts only, writes nothing.
// - Writes happen only with --apply AND CONFIRM_MIGRATION=MIGRATE_PROVIDER_KEYS.
// - The plaintext apiKey never leaves the process: it is read with an explicit
//   +apiKey select, encrypted in memory, stored as an AiCredential, then unset
//   from the ProviderKey document. Only counts and non-secret ids are logged.
// - Existing AiCredential with the same name+provider is left untouched and the
//   legacy key is reported as skipped (reruns are idempotent).

const mongoose = require('mongoose');
const {
  buildCredentialContext,
  encryptCredentialSecret,
  parseCredentialEncryptionKey,
} = require('../server/services/AiCredentialCrypto');

// Nil ObjectId marks system-created rows when no admin actor is supplied.
const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000000');

async function migrateProviderKeys({
  ProviderKey,
  AiCredential,
  environment = process.env,
  dryRun = true,
  log = console,
  actorId = SYSTEM_ACTOR_ID,
}) {
  // Throws early when the encryption key is missing or malformed; nothing is
  // read or written in that case.
  parseCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY);

  const legacyKeys = await ProviderKey.find({ isActive: true }).select('+apiKey');
  const report = {
    dryRun,
    scanned: legacyKeys.length,
    eligible: 0,
    skippedExisting: 0,
    baseUrlDropped: 0,
    migrated: 0,
  };

  for (const key of legacyKeys) {
    if (!key.apiKey) continue;
    const provider = String(key.provider || '').trim().toLowerCase();

    const existing = await AiCredential.findOne({ name: key.name, provider }).lean();
    if (existing) {
      report.skippedExisting += 1;
      continue;
    }

    report.eligible += 1;
    if (dryRun) continue;

    // AiCredential only accepts HTTPS base URLs; a legacy non-HTTPS value is
    // dropped rather than blocking the migration of the secret itself.
    let baseUrl = key.baseUrl || '';
    if (baseUrl && !baseUrl.startsWith('https://')) {
      baseUrl = '';
      report.baseUrlDropped += 1;
    }

    const id = new mongoose.Types.ObjectId();
    const encrypted = encryptCredentialSecret(key.apiKey, {
      context: buildCredentialContext(id, provider),
      environment,
    });

    await AiCredential.create({
      _id: id,
      name: key.name,
      provider,
      baseUrl,
      ...encrypted,
      status: 'active',
      createdBy: actorId,
      updatedBy: actorId,
    });

    // $unset bypasses the required validator and removes the plaintext field
    // from the stored document entirely.
    await ProviderKey.updateOne(
      { _id: key._id },
      {
        $unset: { apiKey: 1 },
        $set: {
          isActive: false,
          errorMessage: 'migrated_to_encrypted_ai_credential',
          lastTested: new Date(),
        },
      }
    );
    report.migrated += 1;
  }

  if (typeof log.info === 'function') {
    log.info('provider_key_migration_report', report);
  } else {
    console.log('provider_key_migration_report', report);
  }
  return report;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const confirmed = process.env.CONFIRM_MIGRATION === 'MIGRATE_PROVIDER_KEYS';
  const dryRun = !(apply && confirmed);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  try {
    const ProviderKey = require('../server/models/ProviderKey');
    const AiCredential = require('../server/models/AiCredential');
    const report = await migrateProviderKeys({ ProviderKey, AiCredential, dryRun });
    if (dryRun) {
      console.log('Dry run only. Re-run with --apply and CONFIRM_MIGRATION=MIGRATE_PROVIDER_KEYS to write.');
    }
    return report;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('provider_key_migration_failed', { error: error.message });
    process.exit(1);
  });
}

module.exports = { migrateProviderKeys };
