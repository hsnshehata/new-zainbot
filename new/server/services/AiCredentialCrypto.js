const crypto = require('crypto');

const KEY_ENV_NAME = 'CREDENTIAL_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_VERSION = 1;
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const AAD_PREFIX = 'zainbot-ai-credential:v1:';

class AiCredentialCryptoError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiCredentialCryptoError';
    this.code = code;
  }
}

function parseBase64Key(encoded) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_KEY_FORMAT',
      `${KEY_ENV_NAME} contains invalid base64`
    );
  }

  const key = Buffer.from(encoded, 'base64');
  const canonicalInput = encoded.replace(/=+$/u, '');
  const canonicalDecoded = key.toString('base64').replace(/=+$/u, '');
  if (canonicalInput !== canonicalDecoded) {
    key.fill(0);
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_KEY_FORMAT',
      `${KEY_ENV_NAME} contains non-canonical base64`
    );
  }
  return key;
}

function parseCredentialEncryptionKey(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_KEY_MISSING',
      `${KEY_ENV_NAME} is required`
    );
  }

  const value = rawValue.trim();
  let key;
  if (value.startsWith('base64:')) {
    key = parseBase64Key(value.slice('base64:'.length));
  } else if (value.startsWith('hex:')) {
    const encoded = value.slice('hex:'.length);
    if (!/^[a-fA-F0-9]{64}$/.test(encoded)) {
      throw new AiCredentialCryptoError(
        'AI_CREDENTIAL_KEY_FORMAT',
        `${KEY_ENV_NAME} must contain exactly 64 hexadecimal characters`
      );
    }
    key = Buffer.from(encoded, 'hex');
  } else {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_KEY_FORMAT',
      `${KEY_ENV_NAME} must use the base64: or hex: prefix`
    );
  }

  if (key.length !== KEY_BYTES) {
    key.fill(0);
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_KEY_LENGTH',
      `${KEY_ENV_NAME} must decode to exactly ${KEY_BYTES} bytes`
    );
  }
  return key;
}

function loadCredentialEncryptionKey(environment = process.env) {
  const key = parseCredentialEncryptionKey(environment[KEY_ENV_NAME]);
  const keyId = crypto
    .createHash('sha256')
    .update(key)
    .digest('hex')
    .slice(0, 16);
  return { key, keyId };
}

function normalizeContext(context) {
  if (typeof context !== 'string' || context.trim().length < 3) {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_CONTEXT_REQUIRED',
      'A stable credential encryption context is required'
    );
  }
  return Buffer.from(`${AAD_PREFIX}${context.trim()}`, 'utf8');
}

function encryptCredentialSecret(secret, options = {}) {
  if (typeof secret !== 'string' || secret.trim().length < 8) {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_SECRET_INVALID',
      'Credential secrets must contain at least 8 non-whitespace characters'
    );
  }

  const aad = normalizeContext(options.context);
  const secretBuffer = Buffer.from(secret.trim(), 'utf8');
  const { key, keyId } = loadCredentialEncryptionKey(options.environment);
  const iv = crypto.randomBytes(IV_BYTES);

  try {
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([
      cipher.update(secretBuffer),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      secretCiphertext: ciphertext.toString('base64'),
      secretIv: iv.toString('base64'),
      secretAuthTag: authTag.toString('base64'),
      encryptionKeyId: keyId,
      encryptionVersion: ENCRYPTION_VERSION,
      hasSecret: true,
    };
  } finally {
    secretBuffer.fill(0);
    key.fill(0);
  }
}

function decodeEncryptedPart(value, fieldName, expectedBytes) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_PAYLOAD_INVALID',
      `${fieldName} is missing`
    );
  }
  const decoded = Buffer.from(value, 'base64');
  if (expectedBytes && decoded.length !== expectedBytes) {
    decoded.fill(0);
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_PAYLOAD_INVALID',
      `${fieldName} has an invalid length`
    );
  }
  return decoded;
}

function decryptCredentialSecret(encrypted, options = {}) {
  if (!encrypted || Number(encrypted.encryptionVersion) !== ENCRYPTION_VERSION) {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_VERSION_UNSUPPORTED',
      'The credential encryption version is unsupported'
    );
  }

  const aad = normalizeContext(options.context);
  const { key, keyId } = loadCredentialEncryptionKey(options.environment);
  let iv;
  let authTag;
  let ciphertext;
  try {
    if (encrypted.encryptionKeyId && encrypted.encryptionKeyId !== keyId) {
      throw new AiCredentialCryptoError(
        'AI_CREDENTIAL_KEY_MISMATCH',
        'The active encryption key cannot decrypt this credential'
      );
    }

    iv = decodeEncryptedPart(encrypted.secretIv, 'secretIv', IV_BYTES);
    authTag = decodeEncryptedPart(
      encrypted.secretAuthTag,
      'secretAuthTag',
      AUTH_TAG_BYTES
    );
    ciphertext = decodeEncryptedPart(
      encrypted.secretCiphertext,
      'secretCiphertext'
    );

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(aad);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    const value = plaintext.toString('utf8');
    plaintext.fill(0);
    return value;
  } catch (error) {
    if (error instanceof AiCredentialCryptoError) {
      throw error;
    }
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_DECRYPT_FAILED',
      'Credential decryption failed'
    );
  } finally {
    key.fill(0);
    iv?.fill(0);
    authTag?.fill(0);
    ciphertext?.fill(0);
  }
}

function buildCredentialContext(credentialId, provider) {
  if (!credentialId || !provider) {
    throw new AiCredentialCryptoError(
      'AI_CREDENTIAL_CONTEXT_REQUIRED',
      'credentialId and provider are required for the encryption context'
    );
  }
  return `${String(credentialId)}:${String(provider).toLowerCase()}`;
}

module.exports = {
  KEY_ENV_NAME,
  ALGORITHM,
  ENCRYPTION_VERSION,
  AiCredentialCryptoError,
  parseCredentialEncryptionKey,
  loadCredentialEncryptionKey,
  buildCredentialContext,
  encryptCredentialSecret,
  decryptCredentialSecret,
};
