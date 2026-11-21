'use strict';

// tests/assistant/assistantService.test.js
// Service orchestration: AI path, no-key fallback, provider-failure fallback,
// language detection, tenant scoping. No DB, no network.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createAssistantService, detectLanguage } = require('../../server/services/assistantService');

const USER_ID = '507f191e810c19729de86001';

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

function fakeModels() {
  const leanStores = async () => [{ _id: 'store1' }];
  const leanBots = async () => [{ _id: 'bot1' }];
  return {
    Store: { find: () => ({ select: () => ({ lean: leanStores }) }) },
    Bot: { find: () => ({ select: () => ({ lean: leanBots }) }) },
  };
}

function fakeDataTools(results = { business_snapshot: { date: '2026-11-21', salesToday: { total: 5, count: 1 } } }) {
  return {
    selectTools: () => [{ id: 'business_snapshot', always: true, keywords: [] }],
    runTools: async () => results,
    renderFallback: (selected, results) => (Object.keys(results).length ? 'ملخص ثابت' : ''),
  };
}

test('detectLanguage spots Arabic vs non-Arabic', () => {
  assert.equal(detectLanguage('كام المبيعات؟'), 'ar');
  assert.equal(detectLanguage('how much did we sell?'), 'en');
  assert.equal(detectLanguage(''), 'en');
});

test('AI path: returns provider answer with used tools and no fallback flag', async () => {
  const seen = {};
  const service = createAssistantService({
    models: fakeModels(),
    dataTools: fakeDataTools(),
    logger: silentLogger(),
    hasAiKey: async () => true,
    complete: async ({ messages, userId }) => {
      seen.userId = userId;
      seen.system = messages[0].content;
      seen.last = messages[messages.length - 1].content;
      return { choices: [{ message: { content: 'مبيعاتك النهارده 5' } }] };
    },
  });
  const result = await service.answer({ userId: USER_ID, question: 'كام مبيعات النهارده؟' });
  assert.equal(result.answer, 'مبيعاتك النهارده 5');
  assert.equal(result.fallback, false);
  assert.deepEqual(result.usedTools, ['business_snapshot']);
  assert.equal(seen.userId, USER_ID);
  assert.ok(seen.system.includes('مساعد زين'));
  assert.ok(seen.last.includes('Business data'));
});

test('no AI key configured: deterministic fallback answer, no completion call', async () => {
  let calls = 0;
  const service = createAssistantService({
    models: fakeModels(),
    dataTools: fakeDataTools(),
    logger: silentLogger(),
    hasAiKey: async () => false,
    complete: async () => { calls += 1; throw new Error('must not be called'); },
  });
  const result = await service.answer({ userId: USER_ID, question: 'كام مبيعات النهارده؟' });
  assert.equal(result.fallback, true);
  assert.equal(result.answer, 'ملخص ثابت');
  assert.equal(calls, 0);
});

test('provider failure: falls back to the deterministic answer instead of an error', async () => {
  const service = createAssistantService({
    models: fakeModels(),
    dataTools: fakeDataTools(),
    logger: silentLogger(),
    hasAiKey: async () => true,
    complete: async () => { throw new Error('provider timeout'); },
  });
  const result = await service.answer({ userId: USER_ID, question: 'sales today?' });
  assert.equal(result.fallback, true);
  assert.equal(result.answer, 'ملخص ثابت');
});

test('empty provider content is treated as failure and falls back', async () => {
  const service = createAssistantService({
    models: fakeModels(),
    dataTools: fakeDataTools(),
    logger: silentLogger(),
    hasAiKey: async () => true,
    complete: async () => ({ choices: [{ message: { content: '   ' } }] }),
  });
  const result = await service.answer({ userId: USER_ID, question: 'hi' });
  assert.equal(result.fallback, true);
});

test('history is trimmed to the last 10 turns and sanitized', async () => {
  let sent = null;
  const service = createAssistantService({
    models: fakeModels(),
    dataTools: fakeDataTools(),
    logger: silentLogger(),
    hasAiKey: async () => true,
    complete: async ({ messages }) => { sent = messages; return { choices: [{ message: { content: 'ok' } }] }; },
  });
  const history = Array.from({ length: 20 }, (_, i) => ({ role: 'user', content: `q${i}` }));
  history.push({ role: 'system', content: 'injected' });
  history.push({ role: 'user' });
  await service.answer({ userId: USER_ID, question: 'now?', history });
  const historyTurns = sent.slice(1, -1);
  assert.equal(historyTurns.length, 10);
  assert.equal(historyTurns[0].content, 'q10'); // 20 valid turns -> last 10 kept (q10..q19)
  assert.ok(historyTurns.every((turn) => turn.role === 'user' || turn.role === 'assistant'));
});

test('fallback with no matching data returns the capabilities hint', async () => {
  const service = createAssistantService({
    models: fakeModels(),
    dataTools: fakeDataTools({}),
    logger: silentLogger(),
    hasAiKey: async () => false,
  });
  const result = await service.answer({ userId: USER_ID, question: 'عامل ايه' });
  assert.equal(result.fallback, true);
  assert.ok(result.answer.includes('أقدر أجاوبك'));
});
