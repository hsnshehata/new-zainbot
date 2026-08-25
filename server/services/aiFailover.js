// server/services/aiFailover.js
const OpenAI = require('openai');
const axios = require('axios');
const logger = require('../logger');
const User = require('../models/User');
const AiRoutingPolicy = require('../models/AiRoutingPolicy');
const AiTierEntitlement = require('../models/AiTierEntitlement');
const AiUserOverride = require('../models/AiUserOverride');
const AiModelCatalog = require('../models/AiModelCatalog');
const AiCredential = require('../models/AiCredential');
const AiUsageEvent = require('../models/AiUsageEvent');
const { createAiKeyResolver } = require('./aiKeyResolver');
const {
  createAiCompletionOrchestrator,
} = require('./aiCompletionOrchestrator');

const keyResolver = createAiKeyResolver({});

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
    if (provider === 'anthropic') {
      return callAnthropicDirect(
        apiKey,
        modelId,
        options.messages,
        options.max_tokens,
        options.response_format
      );
    }
    const client = getClient(provider, apiKey, baseUrl);
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
  const cacheKey = `${provider}_${apiKey}_${baseUrl || ''}`;
  if (clientCache[cacheKey]) {
    return clientCache[cacheKey];
  }

  let client;
  if (provider === 'openai') {
    client = new OpenAI({ apiKey });
  } else if (provider === 'gemini') {
    // Gemini supports OpenAI compatibility endpoint
    client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/'
    });
  } else if (provider === 'openrouter') {
    client = new OpenAI({
      apiKey,
      baseURL: baseUrl || 'https://openrouter.ai/api/v1'
    });
  } else if (provider === 'custom') {
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
    ]
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
      try {
        if (providerToUse === 'anthropic') {
          return await callAnthropicDirect(keyToUse, modelToUse, options.messages, options.max_tokens, options.response_format);
        } else {
          const client = getClient(providerToUse, keyToUse, baseUrlToUse);
          return await client.chat.completions.create({
            model: modelToUse || options.model || 'gpt-4o-mini',
            messages: options.messages,
            max_tokens: options.max_tokens,
            response_format: options.response_format
          });
        }
      } catch (err) {
        logger.error(`❌ User private key failed: ${err.message}`);
        throw new Error(`تعذر استخدام مفتاحك الخاص: ${err.message}`);
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
  for (const keyDoc of globalKeys) {
    try {
      logger.info(`🤖 Attempting completion using ${keyDoc.source} key: ${keyDoc.name} (${keyDoc.provider})`);
      let response;

      if (keyDoc.provider === 'anthropic') {
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

      return response;
    } catch (err) {
      logger.error(`❌ Failed ${keyDoc.source} key: ${keyDoc.name}. Error: ${err.message}`);

      // Record the failure and proceed to the next key in the loop
      await keyDoc.markFailure(err.code || err.message);
    }
  }

  // If all keys fail
  logger.error('❌ All active global provider keys have failed.');
  throw new Error('جميع مفاتيح التشغيل معطلة حالياً، يرجى المحاولة لاحقاً');
}

module.exports = {
  getAiCompletion
};
