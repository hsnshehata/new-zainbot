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
  decryptCredentialSecret,
  parseCredentialEncryptionKey,
} = require('../server/services/AiCredentialCrypto');
const { buildCredentialLabels } = require('../server/services/aiCredentialLabels');

// Nil ObjectId marks system-created rows when no admin actor is supplied.
const SYSTEM_ACTOR_ID = new mongoose.Types.ObjectId('000000000000000000000000');

// Preflight: prove the configured CREDENTIAL_ENCRYPTION_KEY can actually
// round-trip a secret before any database read/write happens. Catches a
// malformed or wrong key before a half-applied migration.
function preflightCryptoProbe(environment) {
  const probe = 'migration-preflight-probe';
  const context = buildCredentialContext(SYSTEM_ACTOR_ID, 'preflight');
  const encrypted = encryptCredentialSecret(probe, { context, environment });
  const decrypted = decryptCredentialSecret(encrypted, { context, environment });
  if (decrypted !== probe) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY failed the encrypt/decrypt preflight probe');
  }
}

async function migrateProviderKeys({
  ProviderKey,
  AiCredential,
  environment = process.env,
  dryRun = true,
  log = console,
  actorId = SYSTEM_ACTOR_ID,
}) {
  // Throws early when the encryption key is missing or malformed; nothing is
  // read or written in that case. The probe additionally proves the key can
  // round-trip a secret before the database is touched.
  parseCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY);
  preflightCryptoProbe(environment);

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
      // Carry the display/failover metadata so migrated credentials look and
      // sort the same as keys created through the admin API.
      labels: buildCredentialLabels({
        defaultModel: key.defaultModel,
        priority: key.priority,
        last4: String(key.apiKey).slice(-4),
      }),
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

  const dbName = (uri.split('/').pop() || '').split('?')[0] || '<db>';

  if (!dryRun) {
    // Apply is destructive in one direction: the plaintext apiKey field is
    // removed from each migrated ProviderKey document. Rollback requires a
    // pre-migration database dump, so make taking one an explicit printed
    // prerequisite before any write happens.
    console.log('PREREQUISITE - take a backup BEFORE this command writes anything:');
    console.log(`  mongodump --uri="<your mongodb uri>" --db=${dbName} --out=./backup-pre-key-migration-$(date +%Y%m%d-%H%M%S)`);
    console.log('Rollback after --apply = mongorestore that dump, then delete the AiCredential');
    console.log('documents this run created (they are the only ones created by it).');
    console.log('');
  }

  await mongoose.connect(uri);
  try {
    const ProviderKey = require('../server/models/ProviderKey');
    const AiCredential = require('../server/models/AiCredential');
    const report = await migrateProviderKeys({ ProviderKey, AiCredential, dryRun });
    if (dryRun) {
      console.log('Dry run only. To apply, run exactly:');
      console.log('  CONFIRM_MIGRATION=MIGRATE_PROVIDER_KEYS node scripts/migrateProviderKeysToCredentials.js --apply');
      console.log('Take the mongodump backup printed by the apply run BEFORE confirming any production write.');
    } else {
      console.log(`Applied. Migrated ${report.migrated} key(s). Verify the admin keys list now shows them as Encrypted,`);
      console.log('then confirm AI completions still work before considering the legacy fallback retired.');
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
