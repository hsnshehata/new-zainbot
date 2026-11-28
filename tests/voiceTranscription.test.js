'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const { transcribeAudioBuffer } = require('../server/services/voiceTranscription');
const { createPlatformMerchantAssistantRouter } = require('../server/services/platformMerchantAssistantRouter');

function makeLog() {
  const entries = [];
  const push = (level) => (event, meta) => entries.push({ level, event, meta });
  return { entries, info: push('info'), warn: push('warn'), error: push('error') };
}

const audio = { buffer: Buffer.from('fake-audio'), contentType: 'audio/ogg; codecs=opus' };

test('OpenAI answers first and is logged as the provider', async () => {
  const log = makeLog();
  let lemonCalls = 0;
  const out = await transcribeAudioBuffer(audio, {
    log,
    openai: async () => 'مرحبا',
    lemonfox: async () => { lemonCalls += 1; return 'x'; },
  });
  assert.deepEqual(out, { text: 'مرحبا', provider: 'openai' });
  assert.equal(lemonCalls, 0);
  const ok = log.entries.find((e) => e.event === 'voice_transcription_ok');
  assert.equal(ok.meta.provider, 'openai');
  assert.equal(JSON.stringify(log.entries).includes('مرحبا'), false, 'transcript text is never logged');
});

test('falls back to LemonFox when OpenAI fails, logging the HTTP status', async () => {
  const log = makeLog();
  const out = await transcribeAudioBuffer(audio, {
    log,
    openai: async () => { const e = new Error('rate limited'); e.status = 429; throw e; },
    lemonfox: async () => 'كام رصيد المبيعات',
  });
  assert.equal(out.provider, 'lemonfox');
  assert.equal(out.text, 'كام رصيد المبيعات');
  const failed = log.entries.find((e) => e.event === 'voice_transcription_provider_error');
  assert.equal(failed.meta.provider, 'openai');
  assert.equal(failed.meta.status, 429);
  assert.ok(log.entries.some((e) => e.event === 'voice_transcription_ok' && e.meta.provider === 'lemonfox'));
});

test('empty OpenAI transcript also falls back', async () => {
  const out = await transcribeAudioBuffer(audio, {
    log: makeLog(),
    openai: async () => '   ',
    lemonfox: async () => 'نص',
  });
  assert.equal(out.provider, 'lemonfox');
});

test('uses OpenAI with the real client wiring when only OPENAI_API_KEY is set', async () => {
  const prevL = process.env.LEMONFOX_API_KEY;
  const prevO = process.env.OPENAI_API_KEY;
  delete process.env.LEMONFOX_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai-key';
  try {
    const log = makeLog();
    const calls = [];
    const out = await transcribeAudioBuffer(audio, {
      log,
      openaiClient: { audio: { transcriptions: { create: async (args) => { calls.push(args); return { text: 'من OpenAI' }; } } } },
    });
    assert.equal(out.provider, 'openai');
    assert.equal(out.text, 'من OpenAI');
    assert.equal(calls[0].language, 'ar');
    assert.equal(calls[0].model, 'whisper-1');
    assert.ok(log.entries.some((e) => e.event === 'voice_transcription_provider_skipped' && e.meta.provider === 'lemonfox'));
  } finally {
    if (prevL !== undefined) process.env.LEMONFOX_API_KEY = prevL;
    if (prevO !== undefined) process.env.OPENAI_API_KEY = prevO; else delete process.env.OPENAI_API_KEY;
  }
});

test('throws when both providers fail', async () => {
  await assert.rejects(
    transcribeAudioBuffer(audio, {
      log: makeLog(),
      lemonfox: async () => { throw new Error('a'); },
      openai: async () => { throw new Error('b'); },
    }),
    /voice_transcription_failed/
  );
});

function makeRouter(overrides = {}) {
  const merchant = { _id: 'm1', username: 'shop', status: 'active', assistantSettings: {} };
  const answered = [];
  const router = createPlatformMerchantAssistantRouter({
    User: { findOne: () => ({ select: () => ({ lean: async () => merchant }), lean: async () => merchant, then: (r) => r(merchant) }) },
    AssistantPendingAction: {},
    AssistantActionAudit: { findOne: async () => null, exists: async () => null },
    pendingActionService: { findActivePendingAction: async () => ({ pendingAction: null, expiredAction: null }) },
    writeTools: { detectWriteToolIntent: () => null },
    assistantService: { answer: async ({ question }) => { answered.push(question); return { answer: `رد: ${question}`, usedTools: [] }; } },
    copilotService: {},
    resolveSenderPhone: async () => '201000000000',
    logger: makeLog(),
    ...overrides,
  });
  return { router, answered };
}

test('merchant voice note is transcribed and answered as text', async () => {
  let transcribed = 0;
  const { router, answered } = makeRouter({
    transcribeVoice: async () => { transcribed += 1; return { text: 'مبيعات النهاردة كام', provider: 'openai' }; },
  });
  const res = await router.handleIncomingPlatformMessage({
    message: { id: { _serialized: 'v1' }, type: 'ptt', body: '', from: '201000000000@c.us' },
    messageText: '[رسالة صوتية]',
    messageId: 'v1',
    isVoice: true,
  });
  assert.equal(transcribed, 1);
  assert.equal(res.handled, true);
  assert.equal(res.reason, 'assistant_readonly');
  assert.deepEqual(answered, ['مبيعات النهاردة كام']);
});

test('merchant voice note that cannot be transcribed gets a polite retry message', async () => {
  const { router, answered } = makeRouter({
    transcribeVoice: async () => { throw new Error('boom'); },
  });
  const res = await router.handleIncomingPlatformMessage({
    message: { id: { _serialized: 'v2' }, type: 'ptt', body: '', from: '201000000000@c.us' },
    messageText: '[رسالة صوتية]',
    messageId: 'v2',
    isVoice: true,
  });
  assert.equal(res.handled, true);
  assert.equal(res.reason, 'voice_transcription_failed');
  assert.match(res.reply, /تبعتها تاني/);
  assert.equal(answered.length, 0);
});
