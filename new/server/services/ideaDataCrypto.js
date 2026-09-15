'use strict';

const crypto = require('crypto');

const KEY_ENV_NAME = 'IDEA_DATA_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const CURRENT_VERSION = 1;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const AAD_PREFIX = 'zainbot-idea-council:v1';

class IdeaCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'IdeaCryptoError';
    this.code = code;
  }
}

function parseEncryptionKey(rawValue, environment = process.env) {
  let value = rawValue;
  if (!value || typeof value !== 'string' || value.trim() === '') {
    // In test or development, allow fallback key so tests and local dev work smoothly
    if (environment.NODE_ENV !== 'production') {
      return crypto.createHash('sha256').update('zainbot-idea-council-default-dev-secret-key-32b').digest();
    }
    throw new IdeaCryptoError(
      'IDEA_KEY_MISSING',
      `${KEY_ENV_NAME} is required in production`
    );
  }

  value = value.trim();
  if (value.startsWith('base64:')) {
    const b64 = value.slice('base64:'.length);
    const buf = Buffer.from(b64, 'base64');
    if (buf.length !== 32) {
      throw new IdeaCryptoError('IDEA_KEY_FORMAT', `${KEY_ENV_NAME} base64 must decode to 32 bytes`);
    }
    return buf;
  }

  if (value.startsWith('hex:')) {
    const hex = value.slice('hex:'.length);
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
      throw new IdeaCryptoError('IDEA_KEY_FORMAT', `${KEY_ENV_NAME} hex must be 64 hex characters`);
    }
    return Buffer.from(hex, 'hex');
  }

  if (value.length === 32) {
    return Buffer.from(value, 'utf8');
  }

  // Otherwise hash it to 32 bytes
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function loadKey(environment = process.env) {
  return parseEncryptionKey(environment[KEY_ENV_NAME], environment);
}

function encryptIdeaField(plainText, options = {}) {
  if (plainText === null || plainText === undefined) {
    return null;
  }
  const textStr = typeof plainText === 'string' ? plainText : String(plainText);
  if (textStr.length === 0) {
    return '';
  }

  const key = loadKey(options.environment);
  const iv = crypto.randomBytes(IV_BYTES);
  const aad = Buffer.from(`${AAD_PREFIX}:${options.context || 'field'}`, 'utf8');

  try {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(textStr, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: v1:iv:authTag:ciphertext
    return `v${CURRENT_VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
  } finally {
    key.fill(0);
  }
}

function decryptIdeaField(encryptedPayload, options = {}) {
  if (encryptedPayload === null || encryptedPayload === undefined) {
    return null;
  }
  if (encryptedPayload === '') {
    return '';
  }

  if (typeof encryptedPayload !== 'string') {
    throw new IdeaCryptoError('IDEA_PAYLOAD_INVALID', 'Encrypted payload must be a string');
  }

  const parts = encryptedPayload.split(':');
  if (parts.length !== 4) {
    throw new IdeaCryptoError('IDEA_PAYLOAD_INVALID', 'Encrypted payload must have 4 segments (version:iv:authTag:ciphertext)');
  }

  const [version, ivB64, authTagB64, ciphertextB64] = parts;
  if (version !== `v${CURRENT_VERSION}`) {
    throw new IdeaCryptoError('IDEA_VERSION_UNSUPPORTED', `Unsupported encryption version: ${version}`);
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new IdeaCryptoError('IDEA_PAYLOAD_INVALID', 'Invalid IV or AuthTag length');
  }

  const key = loadKey(options.environment);
  const aad = Buffer.from(`${AAD_PREFIX}:${options.context || 'field'}`, 'utf8');

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new IdeaCryptoError('IDEA_DECRYPT_FAILED', `Decryption failed: ${error.message}`);
  } finally {
    key.fill(0);
  }
}

function encryptIdeaJson(obj, options = {}) {
  if (obj === null || obj === undefined) return null;
  const jsonString = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return encryptIdeaField(jsonString, options);
}

function decryptIdeaJson(encryptedPayload, options = {}) {
  const plainText = decryptIdeaField(encryptedPayload, options);
  if (plainText === null || plainText === undefined || plainText === '') {
    return null;
  }
  try {
    return JSON.parse(plainText);
  } catch (error) {
    throw new IdeaCryptoError('IDEA_JSON_PARSE_ERROR', `Failed to parse decrypted JSON: ${error.message}`);
  }
}

module.exports = {
  IdeaCryptoError,
  KEY_ENV_NAME,
  encryptIdeaField,
  decryptIdeaField,
  encryptIdeaJson,
  decryptIdeaJson,
};
