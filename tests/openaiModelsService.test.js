'use strict';

// tests/openaiModelsService.test.js
// Covers the live OpenAI model list service: chat-capability filtering,
// newest-first ordering, caching, stale-on-failure fallback, and missing-key
// handling. All fetches are injected; no network and no real API key.

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isChatCapableModelId,
  listOpenAiChatModels,
  invalidateOpenAiModelsCache,
} = require('../server/services/openaiModelsService');

test.beforeEach(() => {
  invalidateOpenAiModelsCache();
  delete process.env.OPENAI_API_KEY;
});

test.afterEach(() => {
  invalidateOpenAiModelsCache();
});

test('isChatCapableModelId keeps chat/reasoning families and drops non-chat models', () => {
  const keep = ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1-2025-04-14', 'chatgpt-4o-latest', 'o3', 'o4-mini', 'gpt-5.1', 'chat-latest', 'gpt-6.2-sol', 'gpt-6.1-terra', 'gpt-6-luna', 'gpt-6-astra'];
  for (const id of keep) {
    assert.equal(isChatCapableModelId(id), true, `expected keep: ${id}`);
  }
  const drop = [
    'gpt-4o-realtime-preview',
    'gpt-4o-mini-audio-preview',
    'gpt-4o-mini-tts',
    'whisper-1',
    'gpt-4o-transcribe',
    'text-embedding-3-large',
    'dall-e-3',
    'gpt-image-1',
    'omni-moderation-latest',
    'babbage-002',
    'o3-pro',
    'o3-pro-2025-06-10',
    'ft:gpt-4o-mini:org:custom:123',
    '',
    null,
  ];
  for (const id of drop) {
    assert.equal(isChatCapableModelId(id), false, `expected drop: ${id}`);
  }
});

test('listOpenAiChatModels filters, sorts newest-first, caches, and never returns the key', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-fake';
  let fetchCount = 0;
  const fetchImpl = async (url, opts) => {
    fetchCount += 1;
    assert.equal(url, 'https://api.openai.com/v1/models');
    assert.equal(opts.headers.Authorization, 'Bearer sk-test-fake');
    return {
      ok: true,
      json: async () => ({
        data: [
          { id: 'gpt-4o-mini', created: 1000 },
          { id: 'gpt-4o-realtime-preview', created: 5000 },
          { id: 'whisper-1', created: 4000 },
          { id: 'gpt-4.1', created: 3000 },
          { id: 'o4-mini', created: 2000 },
        ],
      }),
    };
  };

  const first = await listOpenAiChatModels({ fetchImpl });
  assert.equal(first.stale, false);
  assert.deepEqual(first.models.map((m) => m.id), ['gpt-4.1', 'o4-mini', 'gpt-4o-mini']);
  assert.ok(!JSON.stringify(first).includes('sk-test-fake'), 'result must not contain the API key');

  // Second call within the TTL must not refetch
  const second = await listOpenAiChatModels({ fetchImpl });
  assert.deepEqual(second.models.map((m) => m.id), ['gpt-4.1', 'o4-mini', 'gpt-4o-mini']);
  assert.equal(fetchCount, 1, 'cache must prevent a second fetch');
});

test('listOpenAiChatModels serves stale cache on fetch failure and throws without cache', async () => {
  process.env.OPENAI_API_KEY = 'sk-test-fake';
  const goodFetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ id: 'gpt-4o-mini', created: 1000 }] }),
  });
  await listOpenAiChatModels({ fetchImpl: goodFetch });

  // Force the cache to expire, then fail the refresh: stale list is served
  const { MODELS_CACHE_TTL_MS } = require('../server/services/openaiModelsService');
  const futureNow = () => Date.now() + MODELS_CACHE_TTL_MS + 1000;
  const badFetch = async () => ({ ok: false, status: 500 });
  const stale = await listOpenAiChatModels({ fetchImpl: badFetch, now: futureNow });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.models.map((m) => m.id), ['gpt-4o-mini']);

  // With no cache at all, a failure propagates
  invalidateOpenAiModelsCache();
  await assert.rejects(
    listOpenAiChatModels({ fetchImpl: badFetch }),
    /status 500/
  );
});

test('listOpenAiChatModels rejects cleanly when the platform key is missing', async () => {
  await assert.rejects(
    listOpenAiChatModels({ fetchImpl: async () => ({ ok: true, json: async () => ({ data: [] }) }) }),
    (err) => err.code === 'OPENAI_KEY_MISSING'
  );
});
