const logger = require('../logger');

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';
const MODELS_CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15000;

// Substrings that mark a model as not usable for ordinary chat completions,
// even when it shows up in the account's /v1/models list.
const NON_CHAT_MARKERS = [
  'realtime',
  'audio',
  'tts',
  'whisper',
  'transcribe',
  'embedding',
  'dall-e',
  'image',
  'moderation',
  'babbage',
  'davinci',
  'sora',
  'codex',
];

// Cache keyed per process; the list changes rarely and the admin dashboard is
// the only consumer. On fetch failure we keep serving the last good list.
let modelsCache = null;
let modelsCacheAt = 0;

function isChatCapableModelId(id) {
  if (typeof id !== 'string' || !id) return false;
  const lower = id.toLowerCase();
  // 'chat-latest' is the API alias for the current ChatGPT model; it does not
  // match the gpt-/chatgpt-/oN prefixes but is a valid chat model.
  if (lower === 'chat-latest') return true;
  // Reasoning 'pro' variants (o3-pro, o3-pro-2025-..., ...) are not served on
  // /v1/chat/completions; the API answers 404 'not a chat model'.
  if (/^o\d+-pro/.test(lower)) return false;
  if (!/^(gpt-|chatgpt-|o\d)/.test(lower)) return false;
  return !NON_CHAT_MARKERS.some((marker) => lower.includes(marker));
}

// Newest first, so the admin sees current models at the top of the dropdown.
function sortModelIds(models) {
  return [...models].sort((a, b) => {
    const createdDiff = (b.created || 0) - (a.created || 0);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Fetches the chat-capable OpenAI models visible to the platform API key.
 * The key never leaves the server and is never returned to clients.
 *
 * @param {{ apiKey?: string, fetchImpl?: Function, now?: Function }} deps
 * @returns {Promise<{ models: Array<{ id: string, created: number|null }>, stale: boolean }>}
 */
async function listOpenAiChatModels(deps = {}) {
  const apiKey = deps.apiKey !== undefined ? deps.apiKey : process.env.OPENAI_API_KEY;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  const now = deps.now || Date.now;

  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.code = 'OPENAI_KEY_MISSING';
    throw err;
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available in this runtime');
  }

  const nowMs = now();
  if (modelsCache && nowMs - modelsCacheAt < MODELS_CACHE_TTL_MS) {
    return { models: modelsCache, stale: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = new Error(`OpenAI models list failed with status ${response.status}`);
      err.code = 'OPENAI_MODELS_HTTP_ERROR';
      err.status = response.status;
      throw err;
    }
    const payload = await response.json();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const models = sortModelIds(
      rows
        .filter((row) => isChatCapableModelId(row?.id))
        .map((row) => ({
          id: row.id,
          created: typeof row.created === 'number' ? row.created : null,
        }))
    );
    modelsCache = models;
    modelsCacheAt = nowMs;
    return { models, stale: false };
  } catch (err) {
    if (modelsCache) {
      logger.warn('openai_models_fetch_failed_serving_stale', { err: err.message });
      return { models: modelsCache, stale: true };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function invalidateOpenAiModelsCache() {
  modelsCache = null;
  modelsCacheAt = 0;
}

module.exports = {
  MODELS_CACHE_TTL_MS,
  isChatCapableModelId,
  listOpenAiChatModels,
  invalidateOpenAiModelsCache,
};
