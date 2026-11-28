'use strict';

// Speech-to-text for WhatsApp / web voice notes.
// Primary provider: OpenAI transcription via OPENAI_API_KEY.
// Fallback: LemonFox (when LEMONFOX_API_KEY is set), used when OpenAI is not
// configured or fails. Logs which provider answered and the HTTP status of
// failures (never the transcript text).

const axios = require('axios');
const FormData = require('form-data');
const OpenAI = require('openai');
const logger = require('../logger');
const { describeCaughtError } = require('./metaSendErrors');

const REQUEST_TIMEOUT_MS = 60000;
const OPENAI_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';

function extensionFor(contentType = '') {
  const sub = String(contentType).split(';')[0].split('/')[1] || 'ogg';
  return sub.replace(/[^a-z0-9]/gi, '') || 'ogg';
}

async function transcribeWithLemonFox({ buffer, filename, contentType }, deps = {}) {
  const http = deps.axios || axios;
  const body = new FormData();
  body.append('file', buffer, { filename, contentType });
  body.append('language', 'arabic');
  body.append('response_format', 'json');
  const response = await http.post('https://api.lemonfox.ai/v1/audio/transcriptions', body, {
    headers: {
      Authorization: `Bearer ${process.env.LEMONFOX_API_KEY}`,
      ...body.getHeaders(),
    },
    timeout: REQUEST_TIMEOUT_MS,
  });
  return response && response.data ? response.data.text : '';
}

async function transcribeWithOpenAI({ buffer, filename, contentType }, deps = {}) {
  const client = deps.openaiClient || new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS });
  const file = await OpenAI.toFile(buffer, filename, { type: contentType });
  const result = await client.audio.transcriptions.create({
    file,
    model: OPENAI_MODEL,
    language: 'ar',
    response_format: 'json',
  });
  return result && result.text ? result.text : '';
}

/**
 * @param {{buffer: Buffer, contentType?: string, filename?: string}} audio
 * @param {object} [deps] test seams: { lemonfox, openai, log, axios, openaiClient }
 * @returns {Promise<{text: string, provider: string}>} throws when every provider fails
 */
async function transcribeAudioBuffer(audio = {}, deps = {}) {
  const log = deps.log || logger;
  const buffer = audio.buffer;
  if (!buffer || !buffer.length) throw new Error('empty_audio');
  const contentType = String(audio.contentType || 'audio/ogg').split(';')[0] || 'audio/ogg';
  const input = {
    buffer,
    contentType,
    filename: audio.filename || `audio.${extensionFor(contentType)}`,
  };

  const lemonfox = deps.lemonfox || ((a) => transcribeWithLemonFox(a, deps));
  const openai = deps.openai || ((a) => transcribeWithOpenAI(a, deps));
  const hasLemonFox = deps.lemonfox ? true : Boolean(process.env.LEMONFOX_API_KEY);
  const hasOpenAI = deps.openai ? true : Boolean(process.env.OPENAI_API_KEY);

  const attempts = [];
  if (hasOpenAI) attempts.push(['openai', openai]);
  else log.warn('voice_transcription_provider_skipped', { provider: 'openai', reason: 'key_absent' });
  if (hasLemonFox) attempts.push(['lemonfox', lemonfox]);
  else log.warn('voice_transcription_provider_skipped', { provider: 'lemonfox', reason: 'key_absent' });

  let lastErr = null;
  for (const [provider, run] of attempts) {
    try {
      const text = String((await run(input)) || '').trim();
      if (!text) throw new Error('empty_transcript');
      log.info('voice_transcription_ok', { provider, transcriptLength: text.length });
      return { text, provider };
    } catch (err) {
      lastErr = err;
      const status = (err && (err.status || (err.response && err.response.status))) || undefined;
      log.error('voice_transcription_provider_error', { provider, status, err: describeCaughtError(err) });
    }
  }
  const failure = new Error(attempts.length ? 'voice_transcription_failed' : 'voice_transcription_not_configured');
  failure.cause = lastErr;
  throw failure;
}

module.exports = { transcribeAudioBuffer, transcribeWithLemonFox, transcribeWithOpenAI };
