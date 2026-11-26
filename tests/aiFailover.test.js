'use strict';

// tests/aiFailover.test.js
// getAiCompletion global-key failover contract with fully synthetic fixtures:
// a failing key is marked failed and skipped, the next candidate answers, and
// when every candidate fails the operator-facing error is thrown. No network,
// no real keys: the OpenAI client factory and key resolver are stubbed.

const test = require('node:test');
const assert = require('node:assert/strict');

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

const state = {
  keys: [],
  createImpl: async () => ({ choices: [{ message: { content: 'ok' } }] }),
  clientConfigs: [],
};

class FakeOpenAI {
  constructor(config) {
    state.clientConfigs.push(config);
    this.chat = {
      completions: {
        create: (payload) => state.createImpl(config, payload),
      },
    };
  }
}

stubModule('openai', FakeOpenAI);
stubModule('../server/logger', { info() {}, warn() {}, error() {} });
stubModule('../server/services/aiKeyResolver', {
  createAiKeyResolver: () => ({
    listGlobalAiKeys: async () => state.keys,
  }),
});

const { getAiCompletion } = require('../server/services/aiFailover');

function fakeKey(name, overrides = {}) {
  return {
    source: 'provider_key',
    refId: name,
    name,
    provider: 'openai',
    baseUrl: '',
    defaultModel: '',
    apiKey: `key-${name}`,
    markSuccess: async () => {
      state.keys.find((k) => k.name === name).successMarked = true;
    },
    markFailure: async (code) => {
      state.keys.find((k) => k.name === name).failureMarkedWith = String(code);
    },
    ...overrides,
  };
}

function reset() {
  state.keys = [];
  state.clientConfigs = [];
  state.createImpl = async () => ({ choices: [{ message: { content: 'ok' } }] });
}

const OPTIONS = { messages: [{ role: 'user', content: 'ping' }] };

test('a failing key is marked failed and the next candidate answers', async () => {
  reset();
  state.keys = [fakeKey('bad'), fakeKey('good')];
  state.createImpl = async (config) => {
    if (config.apiKey === 'key-bad') {
      const err = new Error('invalid api key');
      err.code = 'invalid_api_key';
      throw err;
    }
    return { choices: [{ message: { content: 'pong' } }] };
  };

  const res = await getAiCompletion(OPTIONS, null);
  assert.equal(res.choices[0].message.content, 'pong');
  assert.equal(state.keys[0].failureMarkedWith, 'invalid_api_key');
  assert.equal(state.keys[0].successMarked, undefined);
  assert.equal(state.keys[1].successMarked, true);
});

test('when every key fails, each is marked failed and the operator error is thrown', async () => {
  reset();
  state.keys = [fakeKey('k1'), fakeKey('k2')];
  state.createImpl = async () => {
    throw new Error('upstream down');
  };

  await assert.rejects(getAiCompletion(OPTIONS, null), /جميع مفاتيح التشغيل معطلة/);
  assert.equal(state.keys[0].failureMarkedWith, 'upstream down');
  assert.equal(state.keys[1].failureMarkedWith, 'upstream down');
});

test('with no configured keys it fails fast before any provider call', async () => {
  reset();
  let called = false;
  state.createImpl = async () => {
    called = true;
    return {};
  };
  await assert.rejects(getAiCompletion(OPTIONS, null), /لا توجد مفاتيح تشغيل نشطة/);
  assert.equal(called, false);
});

test('adaptChatParamsForModel translates max_tokens only for families that require it', () => {
  const { adaptChatParamsForModel } = require('../server/services/aiFailover');
  const base = { model: 'x', messages: [], max_tokens: 100, response_format: null };
  for (const id of ['gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-astra', 'gpt-5.6-luna', 'o3', 'o4-mini', 'chat-latest', 'gpt-10-future']) {
    const adapted = adaptChatParamsForModel(id, { ...base, model: id });
    assert.equal(adapted.max_completion_tokens, 100, `expected translation for ${id}`);
    assert.equal('max_tokens' in adapted, false, `max_tokens must be dropped for ${id}`);
  }
  for (const id of ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano-2025-04-14', 'chatgpt-4o-latest']) {
    const adapted = adaptChatParamsForModel(id, { ...base, model: id });
    assert.equal(adapted.max_tokens, 100, `legacy param must stay for ${id}`);
    assert.equal('max_completion_tokens' in adapted, false, `no new param for ${id}`);
  }
});
