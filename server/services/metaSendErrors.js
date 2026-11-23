'use strict';

// Log-safe description of a Meta (Graph) send-path failure.
// Provider bodies and axios errors can echo access tokens or customer text under any
// key or inside free text, so nothing from them is copied except: an integer HTTP
// status, an integer Graph code/subcode, and an allow-listed transport code.
const SAFE_TRANSPORT_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ERR_NETWORK', 'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE']);

const int = (v) => (Number.isInteger(v) ? v : undefined);

function describeGraphFailure(source) {
  const err = source && typeof source === 'object' ? source : {};
  const body = (err.response && err.response.data) || err.data || null;
  const graph = body && typeof body === 'object' && body.error && typeof body.error === 'object' ? body.error : {};
  const out = {};
  const status = int(err.response && err.response.status !== undefined ? err.response.status : err.status);
  if (status !== undefined) out.status = status;
  const code = int(graph.code);
  if (code !== undefined) out.graphCode = code;
  const subcode = int(graph.error_subcode);
  if (subcode !== undefined) out.graphSubcode = subcode;
  if (typeof err.code === 'string' && SAFE_TRANSPORT_CODES.has(err.code)) out.code = err.code;
  return out;
}

// For catch blocks that sit on a provider-reachable path (the error may be a rethrown HTTP-client
// error, an adapter error or anything else raised while a Graph response was being handled).
// Message and stack are never logged: axios and adapter messages can embed a URL or provider text,
// and no error type is proven free of token or customer text. Only fixed metadata is kept:
// a built-in error class name from an allow-list, an allow-listed transport code, and the
// integer HTTP status and Graph code/subcode when the error carries an HTTP response.
const SAFE_ERROR_NAMES = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'EvalError', 'URIError', 'AxiosError']);
function describeCaughtError(err) {
  const name = err && typeof err === 'object' && SAFE_ERROR_NAMES.has(err.name) ? err.name : 'Error';
  return { name, ...describeGraphFailure(err) };
}

module.exports = { describeGraphFailure, describeCaughtError };
