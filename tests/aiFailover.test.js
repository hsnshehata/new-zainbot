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
