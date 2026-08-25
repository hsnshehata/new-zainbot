// server/services/aiKeyResolver.js
// Builds the ordered global AI key candidate list used by the completion
// dispatcher:
//   1. Encrypted AiCredential documents (AES-256-GCM control plane)
//   2. Legacy plaintext ProviderKey documents (migration compatibility)
//   3. process.env.OPENAI_API_KEY as the final safety net
// Dependencies are injectable so the resolution rules can be unit tested
// without a database connection.
const logger = require('../logger');

const {
  AiCredentialCryptoError,
  buildCredentialContext,
  decryptCredentialSecret,
} = require('./AiCredentialCrypto');

const SECRET_SELECT = '+secretCiphertext +secretIv +secretAuthTag +encryptionKeyId';

// The control plane accepts 'google'; the dispatcher speaks 'gemini'.
function normalizeProvider(provider) {
  const value = String(provider || '').toLowerCase();
  return value === 'google' ? 'gemini' : value;
}

function createAiKeyResolver(deps = {}) {
  const AiCredentialModel = deps.AiCredential;
  const ProviderKeyModel = deps.ProviderKey;
  const environment = deps.environment || process.env;
  const decryptSecret = deps.decryptCredentialSecret || decryptCredentialSecret;
  const log = deps.logger || logger;

  function encryptionConfigured() {
    try {
      // Cheap validation so a missing/misconfigured key degrades gracefully
      // instead of throwing deep inside request handling.
      const { parseCredentialEncryptionKey } = require('./AiCredentialCrypto');
      parseCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY);
      return true;
    } catch (_error) {
      return false;
    }
  }

  async function credentialFromDoc(doc) {
    const context = buildCredentialContext(doc._id, doc.provider);
    let apiKey;
    try {
      apiKey = decryptSecret(
        {
          secretCiphertext: doc.secretCiphertext,
          secretIv: doc.secretIv,
          secretAuthTag: doc.secretAuthTag,
          encryptionKeyId: doc.encryptionKeyId,
          encryptionVersion: doc.encryptionVersion,
        },
        { context, environment }
      );
    } catch (error) {
      const code = error instanceof AiCredentialCryptoError
        ? error.code
        : 'AI_CREDENTIAL_DECRYPT_FAILED';
      await markCredentialFailure(doc._id, code);
      log.warn('ai_credential_decrypt_failed', {
        credentialId: String(doc._id),
        errorCode: code,
      });
      return null;
    }

    return {
      source: 'ai_credential',
      refId: String(doc._id),
      name: doc.name,
      provider: normalizeProvider(doc.provider),
      baseUrl: doc.baseUrl || '',
      defaultModel: '',
      apiKey,
      markSuccess: () => markCredentialSuccess(doc._id),
      markFailure: (errorCode) => markCredentialFailure(doc._id, errorCode),
    };
  }

  async function markCredentialFailure(credentialId, errorCode) {
    try {
      await AiCredentialModel.findByIdAndUpdate(credentialId, {
        $set: {
          status: 'error',
          lastFailureAt: new Date(),
          lastErrorCode: String(errorCode || 'UNKNOWN').slice(0, 100),
        },
        $inc: { failureCount: 1 },
      });
    } catch (error) {
      log.warn('ai_credential_mark_failure_failed', { error: error.message });
    }
  }

  async function markCredentialSuccess(credentialId) {
    try {
      await AiCredentialModel.findByIdAndUpdate(credentialId, {
        $set: {
          status: 'active',
          failureCount: 0,
          lastUsedAt: new Date(),
          lastValidatedAt: new Date(),
          lastErrorCode: '',
        },
      });
    } catch (error) {
      log.warn('ai_credential_mark_success_failed', { error: error.message });
    }
  }

  async function listEncryptedCandidates() {
    if (!AiCredentialModel || !encryptionConfigured()) {
      return [];
    }
    const docs = await AiCredentialModel
      .find({ status: 'active' })
      .select(SECRET_SELECT)
      .sort({ createdAt: 1 })
      .lean();

    const candidates = [];
    for (const doc of docs) {
      const candidate = await credentialFromDoc(doc);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  async function listLegacyCandidates() {
    if (!ProviderKeyModel) return [];

    let docs = await ProviderKeyModel
      .find({ isActive: true, status: 'working' })
      .select('+apiKey')
      .sort({ priority: 1 })
      .lean();

    if (docs.length === 0) {
      // Mirror the legacy self-healing behaviour: revive failed keys once so
      // transient outages do not permanently bench a key.
      log.warn('ai_keys_no_active_legacy_found_resetting_failed_keys');
      await ProviderKeyModel.updateMany({ isActive: true }, { status: 'working' });
      docs = await ProviderKeyModel
        .find({ isActive: true })
        .select('+apiKey')
        .sort({ priority: 1 })
        .lean();
    }

    return docs.map((doc) => ({
      source: 'provider_key',
      refId: String(doc._id),
      name: doc.name,
      provider: normalizeProvider(doc.provider),
      baseUrl: doc.baseUrl || '',
      defaultModel: doc.defaultModel || '',
      apiKey: doc.apiKey,
      markSuccess: async () => {
        await ProviderKeyModel.updateMany(
          { _id: doc._id, status: { $ne: 'working' } },
          { status: 'working', errorMessage: '', lastTested: new Date() }
        );
      },
      markFailure: async (errorMessage) => {
        await ProviderKeyModel.updateMany(
          { _id: doc._id },
          { status: 'failed', errorMessage: String(errorMessage || '').slice(0, 500), lastTested: new Date() }
        );
      },
    }));
  }

  function envCandidate() {
    if (!environment.OPENAI_API_KEY) return null;
    return {
      source: 'env',
      refId: null,
      name: 'OPENAI_API_KEY',
      provider: 'openai',
      baseUrl: '',
      defaultModel: '',
      apiKey: environment.OPENAI_API_KEY,
      markSuccess: async () => {},
      markFailure: async () => {},
    };
  }

  async function listGlobalAiKeys() {
    const encrypted = await listEncryptedCandidates();
    if (encrypted.length > 0) {
      return encrypted;
    }
    const legacy = await listLegacyCandidates();
    if (legacy.length > 0) {
      return legacy;
    }
    const fallback = envCandidate();
    return fallback ? [fallback] : [];
  }

  return {
    listGlobalAiKeys,
    // Exposed for tests
    _internals: {
      credentialFromDoc,
      normalizeProvider,
    },
  };
}

module.exports = {
  createAiKeyResolver,
  normalizeProvider,
};
