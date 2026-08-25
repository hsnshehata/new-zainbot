// server/services/aiCredentialHealthService.js
// Performs a cheap live probe against an encrypted AI credential's provider so
// superadmins can verify a stored credential actually works. The secret is
// decrypted in memory only, is never logged or returned, and this module never
// persists anything - the caller owns recording the outcome.
const axios = require('axios');
const logger = require('../logger');

const {
  AiCredentialCryptoError,
  buildCredentialContext,
  decryptCredentialSecret,
} = require('./AiCredentialCrypto');

// OpenAI-compatible providers are probed via GET {baseURL}/models.
const PROVIDER_DEFAULT_BASE_URLS = Object.freeze({
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openrouter: 'https://openrouter.ai/api/v1',
});
const ANTHROPIC_MODELS_URL = 'https://api.anthropic.com/v1/models';
const ANTHROPIC_VERSION = '2023-06-01';
const HTTP_TIMEOUT_MS = 10000;

// The control plane stores 'google'; probes speak OpenAI-compatible 'gemini'.
function normalizeProvider(provider) {
  const value = String(provider || '').toLowerCase();
  return value === 'google' ? 'gemini' : value;
}

function joinModelsUrl(baseUrl) {
  return `${String(baseUrl).replace(/\/+$/u, '')}/models`;
}

function defaultHttpGet(url, headers) {
  return axios.get(url, { headers, timeout: HTTP_TIMEOUT_MS });
}

function extractModelsCount(data) {
  if (Array.isArray(data?.data)) {
    return data.data.length;
  }
  if (Array.isArray(data?.models)) {
    return data.models.length;
  }
  if (Array.isArray(data)) {
    return data.length;
  }
  return undefined;
}

function createAiCredentialHealthService(deps = {}) {
  const environment = deps.environment || process.env;
  const httpGet = deps.httpGet || defaultHttpGet;
  const log = deps.logger || logger;
  const now = deps.now || (() => new Date());

  async function testCredential(credentialDoc) {
    const startedAtMs = Number(now());
    const elapsedMs = () => Math.max(0, Number(now()) - startedAtMs);
    const unhealthy = (errorCode) => ({
      healthy: false,
      errorCode,
      latencyMs: elapsedMs(),
    });
    const credentialId = String(credentialDoc?._id || '');
    const provider = normalizeProvider(credentialDoc?.provider);

    let apiKey;
    try {
      apiKey = decryptCredentialSecret(
        {
          secretCiphertext: credentialDoc.secretCiphertext,
          secretIv: credentialDoc.secretIv,
          secretAuthTag: credentialDoc.secretAuthTag,
          encryptionKeyId: credentialDoc.encryptionKeyId,
          encryptionVersion: credentialDoc.encryptionVersion,
        },
        {
          context: buildCredentialContext(
            credentialDoc._id,
            credentialDoc.provider
          ),
          environment,
        }
      );
    } catch (error) {
      const code = error instanceof AiCredentialCryptoError
        ? error.code
        : 'AI_CREDENTIAL_DECRYPT_FAILED';
      log.warn('ai_credential_health_decrypt_failed', {
        credentialId,
        errorCode: code,
      });
      return unhealthy(code);
    }

    let url;
    let headers;
    if (provider === 'anthropic') {
      url = ANTHROPIC_MODELS_URL;
      headers = {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      };
    } else {
      const baseUrl = String(credentialDoc.baseUrl || '').trim();
      if (!baseUrl && provider === 'custom') {
        return unhealthy('AI_CREDENTIAL_BASE_URL_REQUIRED');
      }
      url = joinModelsUrl(
        baseUrl
          || PROVIDER_DEFAULT_BASE_URLS[provider]
          || PROVIDER_DEFAULT_BASE_URLS.openai
      );
      headers = { Authorization: `Bearer ${apiKey}` };
    }

    try {
      const response = await httpGet(url, headers);
      const status = Number(response?.status ?? response?.statusCode);
      if (!(status >= 200 && status < 300)) {
        const code = status
          ? `PROVIDER_HTTP_${status}`
          : 'AI_CREDENTIAL_PROBE_FAILED';
        log.warn('ai_credential_health_probe_failed', {
          credentialId,
          provider,
          errorCode: code,
        });
        return unhealthy(code);
      }
      return {
        healthy: true,
        latencyMs: elapsedMs(),
        modelsCount: extractModelsCount(response?.data),
      };
    } catch (error) {
      const status = Number(error?.response?.status);
      const code = status
        ? `PROVIDER_HTTP_${status}`
        : (error?.code || 'AI_CREDENTIAL_PROBE_FAILED');
      log.warn('ai_credential_health_probe_failed', {
        credentialId,
        provider,
        errorCode: code,
      });
      return unhealthy(code);
    }
  }

  return { testCredential };
}

module.exports = {
  createAiCredentialHealthService,
};
