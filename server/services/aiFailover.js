// server/services/aiFailover.js
const OpenAI = require('openai');
const axios = require('axios');
const ProviderKey = require('../models/ProviderKey');
const logger = require('../logger');

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

  // Scenario 2: Using Global Admin Keys with Priority & Failover
  let activeKeys = await ProviderKey.find({ isActive: true, status: 'working' })
    .select('+apiKey')
    .sort({ priority: 1 });

  if (activeKeys.length === 0) {
    logger.warn('⚠️ No active working keys found. Attempting to reset failed keys back to working.');
    await ProviderKey.updateMany({ isActive: true }, { status: 'working' });
    activeKeys = await ProviderKey.find({ isActive: true })
      .select('+apiKey')
      .sort({ priority: 1 });
  }

  if (activeKeys.length === 0) {
    // If still no keys, fall back to environment key
    logger.error('❌ No keys found in ProviderKey database. Falling back to process.env.OPENAI_API_KEY');
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('لا توجد مفاتيح تشغيل نشطة في النظام');
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return await client.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages: options.messages,
      max_tokens: options.max_tokens,
      response_format: options.response_format
    });
  }

  // Iterate over global admin keys and failover if they encounter errors
  for (const keyDoc of activeKeys) {
    try {
      logger.info(`🤖 Attempting completion using global key: ${keyDoc.name} (${keyDoc.provider})`);
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

      // If successful, ensure status is marked working if it was failed before
      if (keyDoc.status !== 'working') {
        keyDoc.status = 'working';
        keyDoc.errorMessage = '';
        keyDoc.lastTested = new Date();
        await keyDoc.save();
      }

      return response;
    } catch (err) {
      logger.error(`❌ Failed key: ${keyDoc.name}. Error: ${err.message}`);
      
      // Update key status to failed in database
      keyDoc.status = 'failed';
      keyDoc.errorMessage = err.message;
      keyDoc.lastTested = new Date();
      await keyDoc.save();

      // Proceed to the next key in the loop
    }
  }

  // If all keys fail
  logger.error('❌ All active global provider keys have failed.');
  throw new Error('جميع مفاتيح التشغيل معطلة حالياً، يرجى المحاولة لاحقاً');
}

module.exports = {
  getAiCompletion
};
