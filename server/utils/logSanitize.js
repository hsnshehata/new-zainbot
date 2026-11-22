'use strict';

// server/utils/logSanitize.js
// Central redaction for values written to logs. Customer message text and
// provider token material are PII/secrets: logs must carry shape (lengths,
// ids, types), never content. Use redactSensitive() on any third-party
// response or error payload before logging it.

const SENSITIVE_KEY = /token|secret|password|authorization|api[-_]?key|access[-_]?code|session/i;
const MAX_STRING = 200;
const MAX_DEPTH = 4;

function redactSensitive(value, depth) {
  const level = depth || 0;
  if (value === null || value === undefined) return value;
  if (level > MAX_DEPTH) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + '...[TRUNCATED]' : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, level + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSensitive(val, level + 1);
    }
    return out;
  }
  return value;
}

module.exports = { redactSensitive };
