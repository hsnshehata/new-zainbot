// server/services/aiFailover.js
const OpenAI = require('openai');
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../logger');
const { describeCaughtError } = require('./metaSendErrors');
const User = require('../models/User');
const AiRoutingPolicy = require('../models/AiRoutingPolicy');
const AiTierEntitlement = require('../models/AiTierEntitlement');
const AiUserOverride = require('../models/AiUserOverride');
const AiModelCatalog = require('../models/AiModelCatalog');
const AiCredential = require('../models/AiCredential');
const ProviderKey = require('../models/ProviderKey');
const AiUsageEvent = require('../models/AiUsageEvent');
const aiKeyResolverModule = require('./aiKeyResolver');
const { createAiKeyResolver } = aiKeyResolverModule;
const normalizeProvider = aiKeyResolverModule.normalizeProvider || ((provider) => {
  const value = String(provider || '').toLowerCase();
  return value === 'google' ? 'gemini' : value;
});
const {
  createAiCompletionOrchestrator,
} = require('./aiCompletionOrchestrator');

const keyResolver = createAiKeyResolver({ AiCredential, ProviderKey });

const autoOrchestrator = createAiCompletionOrchestrator({
  models: {
    AiRoutingPolicy,
    AiTierEntitlement,
    AiUserOverride,
    AiModelCatalog,
    AiCredential,
    AiUsageEvent,
  },
  userLoader: (userId) => User.findById(userId).select('subscriptionTier').lean(),
  sendCompletion: async ({ provider, apiKey, baseUrl, modelId, options }) => {
    const normalizedProvider = normalizeProvider(provider);
    if (normalizedProvider === 'anthropic') {
      return callAnthropicDirect(
        apiKey,
        modelId,
        options.messages,
        options.max_tokens,
        options.response_format
      );
    }
    const client = getClient(normalizedProvider, apiKey, baseUrl);
    return client.chat.completions.create({
      model: modelId,
      messages: options.messages,
      max_tokens: options.max_tokens,
      response_format: options.response_format
    });
  },
});

// Cache helper to store clients and save overhead
const clientCache = {};

function getClient(provider, apiKey, baseUrl) {
  const normalizedProvider = normalizeProvider(provider);
  const cacheKey = `${normalizedProvider}_${apiKey}_${baseUrl || ''}`;
  if (clientCache[cacheKey]) {
    return clientCache[cacheKey];
  }

  let client;
  if (normalizedProvider === 'openai') {
    client = new OpenAI({ apiKey });
  } else if (normalizedProvider === 'gemini') {
    // Gemini supports OpenAI compatibility endpoint
    client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  } else if (normalizedProvider === 'openrouter') {
    client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://openrouter.ai/api/v1'
    });
  } else if (normalizedProvider === 'custom') {
    client = new OpenAI({
      apiKey,
      baseURL: baseUrl
    });
  } else {
    // Fallback standard OpenAI
    client = new OpenAI({ apiKey });
  }

  clientCache[cacheKey] = client;
  return client;
}

// Anthropic direct API fetch helper since it is not OpenAI-compatible by default
async function callAnthropicDirect(apiKey, model, messages, maxTokens, responseFormat) {
  // Convert messages to Anthropic format (system prompt is separate)
  const systemMessage = messages.find(m => m.role === 'system');
  const userAssistantMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));

  const payload = {
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: maxTokens || 1000,
    messages: userAssistantMessages
  };

  if (systemMessage) {
    payload.system = systemMessage.content;
  }

  const response = await axios.post('https://api.anthropic.com/v1/messages', payload, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    }
  });

  const text = response.data.content?.[0]?.text || '';
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: text
        }
      }
    ],
    // Real token usage for the metrics ledger (input_tokens/output_tokens).
    usage: response.data?.usage,
  };
}

/**
 * Core AI Completion dispatcher with failover
 * @param {Object} options - API options (messages, model, max_tokens, response_format)
 * @param {Object} bot - The current Bot document (for user-specific keys)
 * @param {Boolean} useBackup - Whether to force usage of user backup key
 */
async function getAiCompletion(options, bot = null, useBackup = false) {
  // Scenario 1: Using User's own Backup/Private Key (e.g. Growth quota reached or Free custom key)
  if (bot && (useBackup || (bot.userApiKey && !useBackup))) {
    const keyToUse = useBackup ? bot.backupApiKey : bot.userApiKey;
    const providerToUse = useBackup ? bot.backupProvider : bot.userProvider;
    const modelToUse = useBackup ? bot.backupModel : bot.userModel;
    const baseUrlToUse = useBackup ? bot.backupBaseUrl : bot.userBaseUrl;

    if (keyToUse) {
      logger.info(`🔑 Using user key for completion (useBackup: ${useBackup}, provider: ${providerToUse})`);
      const requestId = crypto.randomUUID();
      const startedAt = Date.now();
      const usageKeyDoc = { provider: providerToUse, defaultModel: modelToUse };
      try {
        let response;
        if (normalizeProvider(providerToUse) === 'anthropic') {
          response = await callAnthropicDirect(keyToUse, modelToUse, options.messages, options.max_tokens, options.response_format);
        } else {
          const client = getClient(providerToUse, keyToUse, baseUrlToUse);
          response = await client.chat.completions.create({
            model: modelToUse || options.model || 'gpt-4o-mini',
            messages: options.messages,
            max_tokens: options.max_tokens,
            response_format: options.response_format
          });
        }
        recordLegacyUsage({
          requestId,
          bot,
          keyDoc: usageKeyDoc,
          options,
          response,
          attempt: 1,
          success: true,
          latencyMs: Date.now() - startedAt,
          errorClass: 'none',
          fallbackUsed: false,
          source: 'user-key',
        });
        return response;
      } catch (err) {
        recordLegacyUsage({
          requestId,
          bot,
          keyDoc: usageKeyDoc,
          options,
          response: null,
          attempt: 1,
          success: false,
          latencyMs: Date.now() - startedAt,
          errorClass: classifyLegacyError(err),
          fallbackUsed: false,
          source: 'user-key',
        });
        // Provider error text can echo the submitted key (OpenAI 401s embed a
        // truncated copy): fixed metadata in logs, fixed text to the caller.
        logger.error('ai_user_key_failed', { err: describeCaughtError(err) });
        throw new Error('تعذر استخدام مفتاحك الخاص. تحقق من المفتاح وحاول مرة أخرى.');
      }
    }
  }

  // Scenario 1b: Policy-driven Auto routing through the encrypted control
  // plane. Engages only for pure-Auto bots (no user key, no manual model).
  // Any failure here degrades to the legacy paths below.
  const wantsUserKey = Boolean(bot && (useBackup ? bot.backupApiKey : bot.userApiKey));
  if (!wantsUserKey && !String(bot?.userModel || '').trim() && bot?.userId) {
    try {
      const auto = await autoOrchestrator.runAutoCompletion({ bot, options });
      return auto.response;
    } catch (err) {
      if (err?.code !== 'AI_AUTO_NOT_CONFIGURED') {
        logger.warn('ai_auto_path_failed_falling_back', {
          code: err?.code,
          message: err?.message,
        });
      }
    }
  }

  // Scenario 2: Global keys with priority & failover.
  // Source order (see aiKeyResolver): encrypted AiCredential control plane
  // first, then legacy plaintext ProviderKey documents, then the env key.
  const globalKeys = await keyResolver.listGlobalAiKeys();

  if (globalKeys.length === 0) {
    logger.error('❌ No AI keys available from any source (control plane, legacy provider keys, or env).');
    throw new Error('لا توجد مفاتيح تشغيل نشطة في النظام');
  }

  // Iterate over global admin keys and failover if they encounter errors
  const requestId = crypto.randomUUID();
  let runningAttempt = 0;
  for (let keyIndex = 0; keyIndex < globalKeys.length; keyIndex += 1) {
    const keyDoc = globalKeys[keyIndex];
    runningAttempt += 1;
    const startedAt = Date.now();
    try {
      logger.info(`🤖 Attempting completion using ${keyDoc.source} key: ${keyDoc.name} (${keyDoc.provider})`);
      let response;

      if (normalizeProvider(keyDoc.provider) === 'anthropic') {
        response = await callAnthropicDirect(
          keyDoc.apiKey,
          keyDoc.defaultModel || options.model,
          options.messages,
          options.max_tokens,
          options.response_format
        );
      } else {
        const client = getClient(keyDoc.provider, keyDoc.apiKey, keyDoc.baseUrl);
        response = await client.chat.completions.create({
          model: keyDoc.defaultModel || options.model || 'gpt-4o-mini',
          messages: options.messages,
          max_tokens: options.max_tokens,
          response_format: options.response_format
        });
      }

      await keyDoc.markSuccess();
      recordLegacyUsage({
        requestId,
        bot,
        keyDoc,
        options,
        response,
        attempt: runningAttempt,
        success: true,
        latencyMs: Date.now() - startedAt,
        errorClass: 'none',
        fallbackUsed: keyIndex > 0,
      });

      return response;
    } catch (err) {
      logger.error('ai_provider_key_failed', { source: keyDoc.source, keyName: keyDoc.name, err: describeCaughtError(err) });

      // Record the failure and proceed to the next key in the loop
      await keyDoc.markFailure(err.code || err.message);
      recordLegacyUsage({
        requestId,
        bot,
        keyDoc,
        options,
        response: null,
        attempt: runningAttempt,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorClass: classifyLegacyError(err),
        fallbackUsed: keyIndex > 0,
      });
    }
  }

  // If all keys fail
  logger.error('❌ All active global provider keys have failed.');
  throw new Error('جميع مفاتيح التشغيل معطلة حالياً، يرجى المحاولة لاحقاً');
}

// Real-usage ledger for the legacy global-key path (metrics only; never
// blocks or alters the completion). Skips silently when no owning tenant is
// known or the write itself fails.
function legacyTokenUsage(response) {
  const usage = response?.usage || {};
  const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens) || 0;
  const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || (inputTokens + outputTokens);
  return { inputTokens, outputTokens, totalTokens };
}

function classifyLegacyError(err) {
  const status = Number(err?.status || err?.statusCode || err?.response?.status) || 0;
  const code = String(err?.code || '');
  if (status === 429 || code === 'rate_limit_exceeded') return 'rate_limit';
  if (status === 401 || status === 403) return 'authentication';
  if (status === 402 || code === 'insufficient_quota') return 'quota_exhausted';
  if (status >= 500) return 'provider_unavailable';
  if (code === 'ETIMEDOUT' || code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''))) return 'timeout';
  if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'ECONNRESET') return 'network';
  return 'unknown';
}

async function recordLegacyUsage({ requestId, bot, keyDoc, options, response, attempt, success, latencyMs, errorClass, fallbackUsed, source = 'legacy-global-key' }) {
  try {
    const userId = bot?.userId;
    if (!userId) return;
    const { inputTokens, outputTokens, totalTokens } = legacyTokenUsage(response);
    await AiUsageEvent.create({
      requestId,
      userId,
      botId: bot?._id || null,
      credentialId: null,
      modelCatalogId: null,
      provider: ['openai', 'google', 'gemini', 'anthropic', 'openrouter', 'custom'].includes(keyDoc.provider)
        ? keyDoc.provider
        : 'custom',
      modelId: String(keyDoc.defaultModel || options.model || 'unknown'),
      tier: 'legacy',
      useCase: 'general',
      attempt,
      success,
      inputTokens,
      outputTokens,
      totalTokens,
      latencyMs,
      errorClass,
      retryable: !success,
      fallbackUsed,
      source,
    });
  } catch (err) {
    logger.warn('ai_legacy_usage_record_failed', { err: err.message });
  }
}

module.exports = {
  getAiCompletion
};
