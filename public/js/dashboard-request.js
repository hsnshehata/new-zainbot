'use strict';

/**
 * ZainBot dashboard request core — contract FRONTEND_EXECUTION_PLAN §7.1.
 *
 * Opt-in helper. It NEVER replaces `apiFetch` globally; dashboard consumers
 * migrate to it one workflow at a time in later D-track tasks.
 *
 *   requestJson(url, options?, policy?) -> Promise<any|null>
 *   policy: { operation: 'read'|'mutation', timeoutMs?: number,
 *             onUnauthorized?: () => void }
 *
 *   fetchBlob(url, options?, policy?) -> Promise<{ blob, filename }>
 *   policy: same shape as requestJson. Blob-download twin for endpoints
 *   that answer with a file (e.g. council `exportIdeaReport`): same
 *   Authorization injection, same 401-only `onUnauthorized` callback, same
 *   single-attempt rule, `filename` parsed from `Content-Disposition`
 *   with a safe fallback. Unlike requestJson it does NOT default
 *   `Accept: application/json` (a blob is markdown/html/octet-stream).
 *
 * Rules:
 * - Read timeout defaults to 15000ms. Mutations have NO timeout unless the
 *   caller passes an explicit `timeoutMs` (an absent/silent mutation must
 *   never be mistaken for a failed one at the transport layer).
 * - 204 or an empty body resolves to `null`.
 * - Failures throw `RequestError` with:
 *     { kind: 'http'|'network'|'timeout'|'parse', status, code, traceId,
 *       retryAfterSeconds, outcomeUnknown }
 * - `runExclusive(key, operation)` returns the SAME promise to every caller
 *   sharing a key while it is in flight (operation runs once) and releases
 *   the lock when the operation settles, including on rejection.
 * - Only HTTP 401 invokes `policy.onUnauthorized`. 403 is NOT a logout.
 * - NO automatic retries — exactly one `fetch` per call. A 200 response
 *   with `success:false` is returned as-is; the caller interprets it per
 *   endpoint contract.
 * - Network/timeout failure of a MUTATION sets `outcomeUnknown: true`
 *   (a timeout is never proof the mutation did not run, and the caller
 *   must reconcile with GET instead of replaying). Reads report
 *   `outcomeUnknown: false`.
 */

const DEFAULT_READ_TIMEOUT_MS = 15000;

/** Fallback filename when Content-Disposition is missing or unparseable. */
const DEFAULT_BLOB_FILENAME = 'download';

class RequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RequestError';
    this.kind = details.kind || 'network';
    this.status = details.status == null ? null : details.status;
    this.code = details.code == null ? null : details.code;
    this.traceId = details.traceId == null ? null : details.traceId;
    this.retryAfterSeconds =
      details.retryAfterSeconds == null ? null : details.retryAfterSeconds;
    this.outcomeUnknown = Boolean(details.outcomeUnknown);
  }
}

/** In-flight exclusive operations, keyed by caller-supplied lock key. */
const pendingOperations = new Map();

/**
 * Run `operation` exclusively per `key`. Concurrent callers sharing the key
 * receive the identical promise; `operation` itself runs exactly once.
 * The lock is released when the operation settles (success or failure).
 */
function runExclusive(key, operation) {
  if (pendingOperations.has(key)) return pendingOperations.get(key);
  let result;
  try {
    result = operation();
  } catch (err) {
    return Promise.reject(err);
  }
  const tracked = Promise.resolve(result);
  pendingOperations.set(key, tracked);
  const release = () => {
    if (pendingOperations.get(key) === tracked) pendingOperations.delete(key);
  };
  tracked.then(release, release);
  return tracked;
}

function getStoredToken() {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('token');
  } catch (_ignored) {
    return null;
  }
}

function isFormDataBody(body) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function isPlainJsonBody(body) {
  if (body === null || typeof body !== 'object' || isFormDataBody(body)) {
    return false;
  }
  if (Array.isArray(body)) return true;
  const proto = Object.getPrototypeOf(body);
  return proto === Object.prototype || proto === null;
}

function headerNamePresent(headers, name) {
  const wanted = String(name).toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
}

function parseRetryAfterSeconds(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === '') return null;
  if (/^\d+$/.test(text)) return parseInt(text, 10);
  const when = Date.parse(text);
  if (!Number.isNaN(when)) {
    return Math.max(0, Math.round((when - Date.now()) / 1000));
  }
  return null;
}

function readResponseHeader(response, name) {
  try {
    if (response && response.headers && typeof response.headers.get === 'function') {
      return response.headers.get(name);
    }
  } catch (_ignored) {
    /* Missing/odd Headers impl — treat as absent. */
  }
  return null;
}

/**
 * Pull stable error fields off a decoded JSON body, with header fallbacks.
 * Never echoes raw provider/HTML bodies — only structured fields.
 */
function extractErrorFields(data, response) {
  let code = null;
  let traceId = null;
  let retryAfterSeconds = null;
  if (data !== null && typeof data === 'object') {
    if (typeof data.code === 'string' && data.code !== '') {
      code = data.code;
    } else if (typeof data.error === 'string' && data.error !== '') {
      code = data.error;
    } else if (data.error !== null && typeof data.error === 'object'
      && typeof data.error.code === 'string') {
      code = data.error.code;
    }
    if (typeof data.traceId === 'string' && data.traceId !== '') {
      traceId = data.traceId;
    } else if (typeof data.traceID === 'string' && data.traceID !== '') {
      traceId = data.traceID;
    }
    if (data.retryAfterSeconds !== undefined && data.retryAfterSeconds !== null) {
      retryAfterSeconds = parseRetryAfterSeconds(data.retryAfterSeconds);
    } else if (data.retryAfter !== undefined && data.retryAfter !== null) {
      retryAfterSeconds = parseRetryAfterSeconds(data.retryAfter);
    }
  }
  if (!traceId) {
    traceId = readResponseHeader(response, 'x-trace-id')
      || readResponseHeader(response, 'x-request-id');
  }
  if (retryAfterSeconds === null) {
    retryAfterSeconds = parseRetryAfterSeconds(
      readResponseHeader(response, 'retry-after'));
  }
  return { code, traceId, retryAfterSeconds };
}

function callSafely(callback) {
  try {
    callback();
  } catch (_ignored) {
    /* Session callbacks must never mask the underlying RequestError. */
  }
}

/**
 * Single-attempt JSON request. See module header for the full contract.
 */
async function requestJson(url, options = {}, policy = {}) {
  const operation = policy.operation === 'mutation' ? 'mutation' : 'read';
  const timeoutMs = policy.timeoutMs !== undefined && policy.timeoutMs !== null
    ? policy.timeoutMs
    : (operation === 'read' ? DEFAULT_READ_TIMEOUT_MS : null);
  const onUnauthorized = typeof policy.onUnauthorized === 'function'
    ? policy.onUnauthorized
    : null;

  const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
  if (!fetchFn) {
    throw new RequestError('Fetch API is not available', {
      kind: 'network',
      status: null,
      code: null,
      traceId: null,
      retryAfterSeconds: null,
      outcomeUnknown: operation === 'mutation',
    });
  }

  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (isPlainJsonBody(body)) body = JSON.stringify(body);
  // Never force Content-Type on FormData: the browser must set the multipart
  // boundary itself.
  if (body !== undefined && body !== null && !isFormDataBody(body)
    && typeof body === 'string' && !headerNamePresent(headers, 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  if (!headerNamePresent(headers, 'accept')) {
    headers.Accept = 'application/json';
  }
  if (!headerNamePresent(headers, 'authorization')) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const callerSignal = options.signal || null;
  let controller = null;
  let timer = null;
  let timedOut = false;
  let signal = callerSignal || undefined;
  if (timeoutMs !== null && timeoutMs !== undefined) {
    controller = new AbortController();
    signal = controller.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch (_ignored) {
        /* Abort must not throw past the timeout path. */
      }
    }, timeoutMs);
  }

  let response;
  try {
    // Exactly one attempt — no automatic retries, ever.
    response = await fetchFn(url, { ...options, headers, body, signal });
  } catch (err) {
    if (err && err.name === 'AbortError' && timedOut) {
      throw new RequestError(`Request timed out after ${timeoutMs}ms`, {
        kind: 'timeout',
        status: null,
        code: 'TIMEOUT',
        traceId: null,
        retryAfterSeconds: null,
        outcomeUnknown: operation === 'mutation',
      });
    }
    throw new RequestError(
      (err && err.message) ? err.message : 'Network request failed', {
        kind: 'network',
        status: null,
        code: null,
        traceId: null,
        retryAfterSeconds: null,
        outcomeUnknown: operation === 'mutation',
      });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  // 401 ONLY drives the session callback; 403 and friends never log out.
  // Hoisted before body parsing so empty/non-JSON 401s (e.g. an HTML login
  // page) also fire it exactly once.
  if (response.status === 401 && onUnauthorized) callSafely(onUnauthorized);

  if (response.status === 204) return null;

  let text = '';
  try {
    text = await response.text();
  } catch (err) {
    throw new RequestError('Unable to read response body', {
      kind: 'parse',
      status: response.status,
      code: null,
      traceId: readResponseHeader(response, 'x-trace-id')
        || readResponseHeader(response, 'x-request-id'),
      retryAfterSeconds: parseRetryAfterSeconds(
        readResponseHeader(response, 'retry-after')),
      outcomeUnknown: false,
    });
  }
  if (!text || text.trim() === '') {
    if (!response.ok) {
      const fields = extractErrorFields(null, response);
      throw new RequestError(`Request failed with status ${response.status}`, {
        kind: 'http',
        status: response.status,
        code: fields.code,
        traceId: fields.traceId,
        retryAfterSeconds: fields.retryAfterSeconds,
        outcomeUnknown: false,
      });
    }
    return null;
  }

  let data = null;
  let parseFailed = false;
  try {
    data = JSON.parse(text);
  } catch (_ignored) {
    parseFailed = true;
  }
  if (parseFailed) {
    if (!response.ok) {
      // Error page (e.g. HTML 500): an HTTP failure, not a parse contract.
      const fields = extractErrorFields(null, response);
      throw new RequestError(`Request failed with status ${response.status}`, {
        kind: 'http',
        status: response.status,
        code: fields.code,
        traceId: fields.traceId,
        retryAfterSeconds: fields.retryAfterSeconds,
        outcomeUnknown: false,
      });
    }
    throw new RequestError('Invalid JSON response', {
      kind: 'parse',
      status: response.status,
      code: null,
      traceId: readResponseHeader(response, 'x-trace-id')
        || readResponseHeader(response, 'x-request-id'),
      retryAfterSeconds: parseRetryAfterSeconds(
        readResponseHeader(response, 'retry-after')),
      outcomeUnknown: false,
    });
  }

  if (!response.ok) {
    const fields = extractErrorFields(data, response);
    throw new RequestError(
      fields.code
        ? `Request failed (${fields.code})`
        : `Request failed with status ${response.status}`, {
        kind: 'http',
        status: response.status,
        code: fields.code,
        traceId: fields.traceId,
        retryAfterSeconds: fields.retryAfterSeconds,
        outcomeUnknown: false,
      });
  }

  // HTTP 200 with `success:false` is returned as-is: each caller interprets
  // it per its endpoint contract. No generic success rewriting here.
  return data === undefined ? null : data;
}

/**
 * Strip path components, quotes and control characters off a candidate
 * filename. Returns '' when nothing safe remains (caller applies fallback).
 */
function sanitizeBlobFilename(name) {
  if (name === null || name === undefined) return '';
  let text = String(name).trim();
  if (text === '') return '';
  if ((text.startsWith('"') && text.endsWith('"') && text.length >= 2)
    || (text.startsWith("'") && text.endsWith("'") && text.length >= 2)) {
    text = text.slice(1, -1).trim();
  }
  // Drop any directory components (forward/back slashes) — basename only.
  const segments = text.split(/[\\/]/);
  text = segments[segments.length - 1].trim();
  // Control chars and DEL never belong in a download filename.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\x00-\x1F\x7F]/g, '').trim();
  if (text === '' || text === '.' || text === '..') return '';
  return text;
}

/**
 * Parse a filename out of a Content-Disposition header value.
 * Prefers RFC 5987 `filename*` (percent-encoded), then plain `filename`.
 * Returns `fallback` when the header is missing or yields nothing safe.
 */
function parseBlobFilename(headerValue, fallback = DEFAULT_BLOB_FILENAME) {
  const safeFallback = sanitizeBlobFilename(fallback) || DEFAULT_BLOB_FILENAME;
  if (typeof headerValue !== 'string' || headerValue.trim() === '') {
    return safeFallback;
  }
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;\s]+)/.exec(headerValue);
  if (extended && extended[1]) {
    try {
      const decoded = decodeURIComponent(extended[1].trim());
      const safe = sanitizeBlobFilename(decoded);
      if (safe) return safe;
    } catch (_ignored) {
      /* Malformed percent-encoding — fall through to plain filename. */
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*'([^']*)'|filename\s*=\s*([^;\s]+)/.exec(headerValue);
  if (plain) {
    const candidate = plain[1] !== undefined ? plain[1]
      : plain[2] !== undefined ? plain[2] : plain[3];
    const safe = sanitizeBlobFilename(candidate);
    if (safe) return safe;
  }
  return safeFallback;
}

/**
 * Single-attempt blob download. See module header for the contract:
 * same auth injection and 401-only callback as requestJson, no retries,
 * `{ blob, filename }` on success, `RequestError` on any failure.
 */
async function fetchBlob(url, options = {}, policy = {}) {
  const operation = policy.operation === 'mutation' ? 'mutation' : 'read';
  const timeoutMs = policy.timeoutMs !== undefined && policy.timeoutMs !== null
    ? policy.timeoutMs
    : (operation === 'read' ? DEFAULT_READ_TIMEOUT_MS : null);
  const onUnauthorized = typeof policy.onUnauthorized === 'function'
    ? policy.onUnauthorized
    : null;

  const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : null;
  if (!fetchFn) {
    throw new RequestError('Fetch API is not available', {
      kind: 'network',
      status: null,
      code: null,
      traceId: null,
      retryAfterSeconds: null,
      outcomeUnknown: operation === 'mutation',
    });
  }

  const headers = { ...(options.headers || {}) };
  let body = options.body;
  if (isPlainJsonBody(body)) body = JSON.stringify(body);
  // Same body rules as requestJson, but deliberately NO default
  // `Accept: application/json` — a blob endpoint answers with a file.
  if (body !== undefined && body !== null && !isFormDataBody(body)
    && typeof body === 'string' && !headerNamePresent(headers, 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  if (!headerNamePresent(headers, 'authorization')) {
    const token = getStoredToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const callerSignal = options.signal || null;
  let controller = null;
  let timer = null;
  let timedOut = false;
  let signal = callerSignal || undefined;
  if (timeoutMs !== null && timeoutMs !== undefined) {
    controller = new AbortController();
    signal = controller.signal;
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort();
      } else {
        callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }
    timer = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch (_ignored) {
        /* Abort must not throw past the timeout path. */
      }
    }, timeoutMs);
  }

  let response;
  try {
    // Exactly one attempt — no automatic retries, ever.
    response = await fetchFn(url, { ...options, headers, body, signal });
  } catch (err) {
    if (err && err.name === 'AbortError' && timedOut) {
      throw new RequestError(`Request timed out after ${timeoutMs}ms`, {
        kind: 'timeout',
        status: null,
        code: 'TIMEOUT',
        traceId: null,
        retryAfterSeconds: null,
        outcomeUnknown: operation === 'mutation',
      });
    }
    throw new RequestError(
      (err && err.message) ? err.message : 'Network request failed', {
        kind: 'network',
        status: null,
        code: null,
        traceId: null,
        retryAfterSeconds: null,
        outcomeUnknown: operation === 'mutation',
      });
  } finally {
    if (timer !== null) clearTimeout(timer);
  }

  // 401 ONLY drives the session callback; 403 and friends never log out.
  if (response.status === 401 && onUnauthorized) callSafely(onUnauthorized);

  if (!response.ok) {
    // Error bodies stay JSON-shaped (e.g. REPORT_NOT_FOUND): decode them
    // best-effort for code/traceId, never echo raw provider/HTML bodies.
    let data = null;
    try {
      const text = await response.text();
      if (text && text.trim() !== '') {
        try {
          data = JSON.parse(text);
        } catch (_ignored) {
          data = null;
        }
      }
    } catch (_ignored) {
      data = null;
    }
    const fields = extractErrorFields(data, response);
    throw new RequestError(
      fields.code
        ? `Request failed (${fields.code})`
        : `Request failed with status ${response.status}`, {
        kind: 'http',
        status: response.status,
        code: fields.code,
        traceId: fields.traceId,
        retryAfterSeconds: fields.retryAfterSeconds,
        outcomeUnknown: false,
      });
  }

  const filename = parseBlobFilename(
    readResponseHeader(response, 'content-disposition'));

  let blob;
  try {
    blob = await response.blob();
  } catch (err) {
    throw new RequestError('Unable to read response body', {
      kind: 'parse',
      status: response.status,
      code: null,
      traceId: readResponseHeader(response, 'x-trace-id')
        || readResponseHeader(response, 'x-request-id'),
      retryAfterSeconds: parseRetryAfterSeconds(
        readResponseHeader(response, 'retry-after')),
      outcomeUnknown: false,
    });
  }
  return { blob, filename };
}

const ZainBotRequest = {
  requestJson,
  fetchBlob,
  runExclusive,
  RequestError,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_BLOB_FILENAME,
};

if (typeof window !== 'undefined') {
  window.ZainBotRequest = ZainBotRequest;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZainBotRequest;
}
