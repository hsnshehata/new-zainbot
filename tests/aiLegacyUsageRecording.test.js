'use strict';

// tests/aiLegacyUsageRecording.test.js
// The legacy global-key completion path (Scenario 2 in aiFailover) must
// record real usage events: provider/model, tokens from the provider
// response, latency, error class, attempt and fallback markers — while never
// altering or blocking the completion itself, and skipping silently when no
// owning tenant is known. Fully synthetic; no network, no database.

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
  events: [],
  createShouldThrow: false,
};

class FakeOpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: (payload) => state.createImpl(payload),
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
stubModule('../server/services/aiCompletionOrchestrator', {
  createAiCompletionOrchestrator: () => ({
    runAutoCompletion: async () => {
      const err = new Error('auto not configured in tests');
      err.code = 'AI_AUTO_NOT_CONFIGURED';
      throw err;
    },
  }),
});
stubModule('../server/models/AiUsageEvent', {
  create: async (doc) => {
    if (state.createShouldThrow) {
      throw new Error('simulated ledger write failure');
    }
    state.events.push(doc);
    return doc;
  },
});

const { getAiCompletion } = require('../server/services/aiFailover');

function fakeKey(name, overrides = {}) {
  return {
    source: 'provider_key',
    refId: name,
    name,
    provider: 'openai',
    baseUrl: '',
    defaultModel: 'gpt-4o-mini',
    apiKey: `key-${name}`,
    markSuccess: async () => {},
    markFailure: async () => {},
    ...overrides,
  };
}

const BOT = { _id: '507f191e810c19729de86021', userId: '507f191e810c19729de86001' };
const OPTIONS = { messages: [{ role: 'user', content: 'ping' }] };

function reset() {
  state.keys = [];
  state.events = [];
  state.createShouldThrow = false;
  state.createImpl = async () => ({ choices: [{ message: { content: 'ok' } }] });
}

test('a successful legacy completion records one usage event with real tokens', async () => {
  reset();
  state.keys = [fakeKey('main')];
  state.createImpl = async () => ({
    choices: [{ message: { content: 'ok' } }],
    usage: { prompt_tokens: 12, completion_tokens: 7, total_tokens: 19 },
  });

  const response = await getAiCompletion(OPTIONS, BOT);

  assert.equal(response.choices[0].message.content, 'ok');
  assert.equal(state.events.length, 1);
  const event = state.events[0];
  assert.equal(String(event.userId), String(BOT.userId));
  assert.equal(String(event.botId), String(BOT._id));
  assert.equal(event.provider, 'openai');
  assert.equal(event.modelId, 'gpt-4o-mini');
  assert.equal(event.success, true);
  assert.equal(event.inputTokens, 12);
  assert.equal(event.outputTokens, 7);
  assert.equal(event.totalTokens, 19);
  assert.equal(event.errorClass, 'none');
  assert.equal(event.fallbackUsed, false);
  assert.equal(event.source, 'legacy-global-key');
  assert.ok(event.requestId, 'requestId must be set');
  assert.equal(typeof event.latencyMs, 'number');
});

test('failover records the failure and the fallback success under one requestId', async () => {
  reset();
  state.keys = [fakeKey('bad'), fakeKey('good')];
  state.createImpl = async (payload) => ({ choices: [{ message: { content: `ok-${payload.model}` } }] });
  // First key raises a 429-shaped error.
  const realCreate = state.createImpl;
  let call = 0;
  state.createImpl = async (payload) => {
    call += 1;
    if (call === 1) {
      const err = new Error('rate limited');
      err.status = 429;
      throw err;
    }
    return realCreate(payload);
  };

  const response = await getAiCompletion(OPTIONS, BOT);

  assert.ok(response.choices[0].message.content.startsWith('ok-'));
  assert.equal(state.events.length, 2);
  const [failure, success] = state.events;
  assert.equal(failure.success, false);
  assert.equal(failure.errorClass, 'rate_limit');
  assert.equal(failure.fallbackUsed, false);
  assert.equal(success.success, true);
  assert.equal(success.fallbackUsed, true);
  assert.equal(success.attempt, 2);
  assert.equal(failure.requestId, success.requestId, 'one request, one requestId');
});

test('usage recording is skipped when no owning tenant is known', async () => {
  reset();
  state.keys = [fakeKey('main')];

  await getAiCompletion(OPTIONS, null);

  assert.equal(state.events.length, 0);
});

test('a ledger write failure never breaks the completion', async () => {
  reset();
  state.keys = [fakeKey('main')];
  state.createShouldThrow = true;
  state.createImpl = async () => ({
    choices: [{ message: { content: 'still-ok' } }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  });

  const response = await getAiCompletion(OPTIONS, BOT);

  assert.equal(response.choices[0].message.content, 'still-ok');
});
