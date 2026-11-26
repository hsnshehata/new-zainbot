'use strict';

// Regression tests for:
// 1. aiFailover.js & assistantController.js wiring real AiCredential & ProviderKey models into createAiKeyResolver.
// 2. 'google' provider normalizing to 'gemini' (Google Gemini OpenAI-compat endpoint, NOT OpenAI default).

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

function stubModule(relativePath, exportsObject) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
  return resolved;
}

function clearModule(relativePath) {
  const resolved = require.resolve(relativePath);
  delete require.cache[resolved];
}

test('aiFailover and assistantController wire real AiCredential and ProviderKey models into createAiKeyResolver', async () => {
  const resolverCalls = [];
  const AiCredential = require('../server/models/AiCredential');
  const ProviderKey = require('../server/models/ProviderKey');

  const realResolverPath = require.resolve('../server/services/aiKeyResolver');
  const originalResolver = require.cache[realResolverPath];
  const realAiFailoverPath = require.resolve('../server/services/aiFailover');
  const originalAiFailover = require.cache[realAiFailoverPath];
  const realAssistantPath = require.resolve('../server/controllers/assistantController');
  const originalAssistant = require.cache[realAssistantPath];

  try {
    stubModule('../server/services/aiKeyResolver', {
      createAiKeyResolver: (deps) => {
        resolverCalls.push(deps);
        return { listGlobalAiKeys: async () => [] };
      },
      normalizeProvider: (p) => {
        const v = String(p || '').toLowerCase();
        return v === 'google' ? 'gemini' : v;
      },
    });

    clearModule('../server/services/aiFailover');
    clearModule('../server/controllers/assistantController');

    require('../server/services/aiFailover');
    require('../server/controllers/assistantController');

    assert.equal(resolverCalls.length, 2, 'both aiFailover and assistantController construct a key resolver');
    for (const deps of resolverCalls) {
      assert.equal(deps.AiCredential, AiCredential, 'real AiCredential model must be passed');
      assert.equal(deps.ProviderKey, ProviderKey, 'real ProviderKey model must be passed');
    }
  } finally {
    if (originalResolver) require.cache[realResolverPath] = originalResolver;
    else delete require.cache[realResolverPath];
    if (originalAiFailover) require.cache[realAiFailoverPath] = originalAiFailover;
    else delete require.cache[realAiFailoverPath];
    if (originalAssistant) require.cache[realAssistantPath] = originalAssistant;
    else delete require.cache[realAssistantPath];
  }
});

test('aiFailover reads DB-stored ProviderKey when OPENAI_API_KEY env is unset', async () => {
  const savedEnvKey = process.env.OPENAI_API_KEY;
  const savedEncKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.CREDENTIAL_ENCRYPTION_KEY;

  const clientConfigs = [];
  class FakeOpenAI {
    constructor(config) {
      clientConfigs.push(config);
      this.chat = {
        completions: {
          create: async () => ({ choices: [{ message: { content: 'from-provider-key' } }] }),
        },
      };
    }
  }

  const savedCache = {};
  const modulesToRestore = [
    'openai',
    '../server/logger',
    '../server/models/ProviderKey',
    '../server/models/AiCredential',
    '../server/services/aiKeyResolver',
    '../server/services/aiFailover',
  ];
  for (const mod of modulesToRestore) {
    const id = require.resolve(mod);
    savedCache[id] = require.cache[id];
  }

  try {
    stubModule('openai', FakeOpenAI);
    stubModule('../server/logger', { info() {}, warn() {}, error() {} });
    stubModule('../server/models/AiCredential', {
      find: () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) }),
      findByIdAndUpdate: async () => {},
    });
    stubModule('../server/models/ProviderKey', {
      find: () => ({
        select: () => ({
          sort: () => ({
            lean: async () => [{
              _id: 'pk-1',
              name: 'db-legacy-key',
              provider: 'openai',
              apiKey: 'sk-from-mongodb-provider-key',
              baseUrl: '',
              defaultModel: 'gpt-4o-mini',
              isActive: true,
              status: 'working',
              priority: 1,
            }],
          }),
        }),
      }),
      updateMany: async () => {},
    });

    clearModule('../server/services/aiKeyResolver');
    clearModule('../server/services/aiFailover');

    const { getAiCompletion } = require('../server/services/aiFailover');
    const res = await getAiCompletion({ messages: [{ role: 'user', content: 'hi' }] }, null);

    assert.equal(res.choices[0].message.content, 'from-provider-key');
    assert.equal(clientConfigs.length, 1);
    assert.equal(clientConfigs[0].apiKey, 'sk-from-mongodb-provider-key');
  } finally {
    if (savedEnvKey !== undefined) process.env.OPENAI_API_KEY = savedEnvKey;
    else delete process.env.OPENAI_API_KEY;
    if (savedEncKey !== undefined) process.env.CREDENTIAL_ENCRYPTION_KEY = savedEncKey;
    else delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    for (const [id, entry] of Object.entries(savedCache)) {
      if (entry) require.cache[id] = entry;
      else delete require.cache[id];
    }
  }
});

test('google provider on Auto control plane and user/global keys routes to Gemini endpoint, not OpenAI', async () => {
  const clientConfigs = [];
  const createPayloads = [];
  let capturedSendCompletion = null;

  class FakeOpenAI {
    constructor(config) {
      clientConfigs.push(config);
      this.chat = {
        completions: {
          create: async (payload) => {
            createPayloads.push({ config, payload });
            return { choices: [{ message: { content: 'gemini-ok' } }] };
          },
        },
      };
    }
  }

  const savedCache = {};
  const modulesToRestore = [
    'openai',
    '../server/logger',
    '../server/services/aiCompletionOrchestrator',
    '../server/services/aiKeyResolver',
    '../server/services/aiFailover',
  ];
  for (const mod of modulesToRestore) {
    const id = require.resolve(mod);
    savedCache[id] = require.cache[id];
  }

  try {
    stubModule('openai', FakeOpenAI);
    stubModule('../server/logger', { info() {}, warn() {}, error() {} });
    stubModule('../server/services/aiCompletionOrchestrator', {
      createAiCompletionOrchestrator: (deps) => {
        capturedSendCompletion = deps.sendCompletion;
        return {
          runAutoCompletion: async ({ options }) => {
            const response = await deps.sendCompletion({
              provider: 'google',
              apiKey: 'AIza-synthetic-google-key',
              baseUrl: '',
              modelId: 'gemini-2.0-flash',
              options,
            });
            return { response };
          },
        };
      },
    });
    stubModule('../server/services/aiKeyResolver', {
      createAiKeyResolver: () => ({
        listGlobalAiKeys: async () => [{
          source: 'ai_credential',
          refId: 'g-1',
          name: 'google-cred',
          provider: 'google',
          baseUrl: '',
          defaultModel: 'gemini-2.0-flash',
          apiKey: 'AIza-global-google-key',
          markSuccess: async () => {},
          markFailure: async () => {},
        }],
      }),
      normalizeProvider: (p) => {
        const v = String(p || '').toLowerCase();
        return v === 'google' ? 'gemini' : v;
      },
    });

    clearModule('../server/services/aiFailover');
    const { getAiCompletion } = require('../server/services/aiFailover');

    // 1. Auto control plane path with provider: 'google'
    const autoBot = { _id: '507f191e810c19729de86021', userId: '507f191e810c19729de86001' };
    const autoRes = await getAiCompletion({ messages: [{ role: 'user', content: 'hello' }] }, autoBot);
    assert.equal(autoRes.choices[0].message.content, 'gemini-ok');
    assert.equal(typeof capturedSendCompletion, 'function');
    assert.equal(
      clientConfigs[0].baseURL,
      'https://generativelanguage.googleapis.com/v1beta/openai/',
      'google provider on Auto path must use Gemini endpoint, not OpenAI default'
    );
    assert.equal(clientConfigs[0].apiKey, 'AIza-synthetic-google-key');

    // 2. Global failover path with provider: 'google'
    const globalRes = await getAiCompletion({ messages: [{ role: 'user', content: 'hello' }] }, null);
    assert.equal(globalRes.choices[0].message.content, 'gemini-ok');
    assert.equal(
      clientConfigs[1].baseURL,
      'https://generativelanguage.googleapis.com/v1beta/openai/',
      'google provider on global failover path must use Gemini endpoint'
    );

    // 3. User BYOK key with provider: 'google'
    const byokBot = {
      _id: '507f191e810c19729de86022',
      userId: '507f191e810c19729de86002',
      userApiKey: `AIza-${crypto.randomBytes(6).toString('hex')}`,
      userProvider: 'google',
      userModel: 'gemini-2.0-flash',
    };
    const byokRes = await getAiCompletion({ messages: [{ role: 'user', content: 'hello' }] }, byokBot);
    assert.equal(byokRes.choices[0].message.content, 'gemini-ok');
    assert.equal(
      clientConfigs[2].baseURL,
      'https://generativelanguage.googleapis.com/v1beta/openai/',
      'google provider on user key path must use Gemini endpoint'
    );
  } finally {
    for (const [id, entry] of Object.entries(savedCache)) {
      if (entry) require.cache[id] = entry;
      else delete require.cache[id];
    }
  }
});
