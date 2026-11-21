'use strict';

// server/services/channelTokenCrypto.js
// Encryption at rest for per-merchant Meta channel tokens
// (Bot.facebookApiKey / Bot.instagramApiKey), previously stored as
// plaintext. Reuses the CREDENTIAL_ENCRYPTION_KEY AES-256-GCM key through
// AiCredentialCrypto's loader and serializes as one prefixed string.
//
// Compatibility strategy (lazy migration, no bulk job, nothing silently
// disabled): legacy plaintext values are READ as-is; a token becomes
// encrypted the next time its owner saves it through any write path. New
// writes are always encrypted. Decryption failures on prefixed values throw
// (wrong key / tampering) instead of silently returning garbage, and
// encryption without the key throws too: fail-closed in both directions.

const crypto = require('crypto');
const { loadCredentialEncryptionKey } = require('./AiCredentialCrypto');

const PREFIX = 'chv1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const AAD_SCOPE = 'channel-token';

function isEncryptedChannelToken(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptChannelToken(value) {
  if (value === undefined || value === null) return value;
  const plain = String(value).trim();
  if (!plain) return '';
  if (isEncryptedChannelToken(plain)) return plain; // idempotent re-assignment
  const { key, keyId } = loadCredentialEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`${AAD_SCOPE}:${keyId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

function decryptChannelToken(stored) {
  if (stored === undefined || stored === null || stored === '') return '';
  const value = String(stored);
  if (!isEncryptedChannelToken(value)) return value; // legacy plaintext, read-only
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const { key, keyId } = loadCredentialEncryptionKey();
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(`${AAD_SCOPE}:${keyId}`, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = {
  PREFIX,
  isEncryptedChannelToken,
  encryptChannelToken,
  decryptChannelToken,
};
