// server/services/aiCircuitBreaker.js
// In-memory circuit breaker that benches an AI credential while it is
// cooling down after repeated availability failures (rate limits, timeouts,
// network errors, provider outages, exhausted quota). Cooldown duration grows
// exponentially with consecutive failures and is capped so a flapping key is
// retried eventually.
// Persistence note: state lives in a per-process Map, so a server restart
// clears every cooldown. This is acceptable for v1; durable state can be
// layered onto AiCredential.lastFailureAt later. The implementation stays
// dependency-free and synchronous so it is trivially unit testable.
const logger = require('../logger');

// Failure categories that describe provider availability problems. Anything
// else (authentication, model_unavailable, invalid_request, content_policy,
// unknown) is a configuration problem: cooling the key down would not help,
// so those categories never open the breaker.
const AI_CIRCUIT_BREAKER_CATEGORIES = Object.freeze(new Set([
  'rate_limit',
  'timeout',
  'network',
  'provider_unavailable',
  'quota_exhausted',
]));

const DEFAULT_BASE_COOLDOWN_MS = 30000;
const DEFAULT_MAX_COOLDOWN_MS = 15 * 60 * 1000;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createAiCircuitBreaker(deps = {}) {
  const environment = deps.environment || process.env;
  const log = deps.logger || logger;
  const now = deps.now || (() => Date.now());

  const baseCooldownMs = positiveInt(
    environment.AI_CIRCUIT_BASE_COOLDOWN_MS,
    DEFAULT_BASE_COOLDOWN_MS
  );
  const maxCooldownMs = positiveInt(
    environment.AI_CIRCUIT_MAX_COOLDOWN_MS,
    DEFAULT_MAX_COOLDOWN_MS
  );

  // credentialId -> { consecutiveFailures, openUntil }
  const states = new Map();

  function cooldownFor(failures) {
    const exponent = Math.max(0, failures - 1);
    return Math.min(baseCooldownMs * 2 ** exponent, maxCooldownMs);
  }

  function isOpen({ credentialId }) {
    return cooldownRemainingMs({ credentialId }) > 0;
  }

  function recordFailure({ credentialId, category }) {
    if (!AI_CIRCUIT_BREAKER_CATEGORIES.has(category)) return;
    const key = String(credentialId);
    const state = states.get(key) || { consecutiveFailures: 0, openUntil: 0 };
    state.consecutiveFailures += 1;
    state.openUntil = now() + cooldownFor(state.consecutiveFailures);
    states.set(key, state);
    log.warn('ai_circuit_breaker_opened', {
      credentialId: key,
      category,
      consecutiveFailures: state.consecutiveFailures,
      cooldownMs: cooldownFor(state.consecutiveFailures),
    });
  }

  function recordSuccess({ credentialId }) {
    if (!states.delete(String(credentialId))) return;
    log.info('ai_circuit_breaker_closed', { credentialId: String(credentialId) });
  }

  function cooldownRemainingMs({ credentialId }) {
    const state = states.get(String(credentialId));
    if (!state) return 0;
    return Math.max(0, state.openUntil - now());
  }

  return {
    isOpen,
    recordFailure,
    recordSuccess,
    cooldownRemainingMs,
  };
}

module.exports = {
  AI_CIRCUIT_BREAKER_CATEGORIES,
  createAiCircuitBreaker,
};
