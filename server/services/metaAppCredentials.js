// server/services/metaAppCredentials.js
// Single place that reads the Meta (Facebook) app id/secret and performs the
// long-lived token exchange. The app id used to be hardcoded in two files, which
// silently ties every token refresh to one legacy Meta app. The id now comes only
// from FACEBOOK_APP_ID, and a missing id or secret fails closed before any call.

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_GRAPH_VERSION = 'v22.0';

class MetaAppNotConfiguredError extends Error {
  constructor(missing) {
    super(`Meta app is not configured: missing ${missing}`);
    this.name = 'MetaAppNotConfiguredError';
    this.code = 'META_APP_NOT_CONFIGURED';
    this.missing = missing;
  }
}

function resolveGraphVersion(configured) {
  return /^v\d+\.\d+$/.test(configured || '') ? configured : DEFAULT_GRAPH_VERSION;
}

// Axios errors carry config (params with the app secret and token, headers) and
// the request object, and Meta's response body can echo input values under any key
// or message text. So an HTTP failure is rethrown as a fresh Error with fixed text,
// a stable code and the numeric HTTP status only. No body, cause, config or request.
const SAFE_AXIOS_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ERR_NETWORK', 'ERR_BAD_REQUEST', 'ERR_BAD_RESPONSE']);
// Classifies a failed Graph/Instagram HTTP call from facts only: an integer HTTP status and
// the integer Graph error code/subcode and boolean is_transient (read for classification,
// never logged as text). Per Meta's error-handling guide
// (developers.facebook.com/docs/graph-api/guides/error-handling) the PRIMARY code decides:
//   190 and 102 mean the access token expired, was revoked or is invalid;
//   1, 2, 4, 17, 341, 368 are temporary or throttling; 3, 10 and 200-299 are permission or capability.
// Precedence (first match wins): no response / 5xx / 408 / 429; is_transient=true; a temporary or
// throttling code; code 190 or 102; anything else. A subcode never overrides the primary code and
// is not used on its own. A bare HTTP 401 with no Graph evidence is not classified as a token fault.
// kind: 'invalid'   the token is rejected under a primary token code (relink is the merchant's fix)
//       'transient' temporary: callers retry on the next run and send no notice
//       'unrecognized' any other 4xx: the cause is not established as the merchant's credential
const INVALID_TOKEN_CODES = new Set([190, 102]);
const TRANSIENT_GRAPH_CODES = new Set([1, 2, 4, 17, 341, 368]);
function classifyGraphFailure(err) {
  const response = err && typeof err === 'object' ? err.response : undefined;
  const status = Number.isInteger(response && response.status) ? response.status : undefined;
  const graph = response && response.data && typeof response.data === 'object' && response.data.error && typeof response.data.error === 'object' ? response.data.error : {};
  const graphCode = Number.isInteger(graph.code) ? graph.code : undefined;
  const graphSubcode = Number.isInteger(graph.error_subcode) ? graph.error_subcode : undefined;
  let kind;
  if (status === undefined || status >= 500 || status === 408 || status === 429) kind = 'transient';
  else if (graph.is_transient === true) kind = 'transient';
  else if (graphCode !== undefined && TRANSIENT_GRAPH_CODES.has(graphCode)) kind = 'transient';
  else if (graphCode !== undefined && INVALID_TOKEN_CODES.has(graphCode)) kind = 'invalid';
  else if (status >= 400 && status < 500) kind = 'unrecognized';
  else kind = 'transient';
  const out = { kind };
  if (status !== undefined) out.status = status;
  if (graphCode !== undefined) out.graphCode = graphCode;
  if (graphSubcode !== undefined) out.graphSubcode = graphSubcode;
  return out;
}

function sanitizeHttpError(err) {
  const status = err && err.response && Number.isInteger(err.response.status) ? err.response.status : undefined;
  const clean = new Error(status ? `Meta token exchange failed with HTTP ${status}` : 'Meta token exchange failed');
  clean.name = 'MetaTokenExchangeError';
  clean.code = err && SAFE_AXIOS_CODES.has(err.code) ? err.code : 'META_TOKEN_EXCHANGE_FAILED';
  if (status) clean.status = status;
  const c = classifyGraphFailure(err);
  clean.kind = c.kind;
  if (c.graphCode !== undefined) clean.graphCode = c.graphCode;
  if (c.graphSubcode !== undefined) clean.graphSubcode = c.graphSubcode;
  return clean;
}

function getFacebookAppCredentials(env = process.env) {
  const appId = (env.FACEBOOK_APP_ID || '').trim();
  const appSecret = (env.FACEBOOK_APP_SECRET || '').trim();
  if (!appId) throw new MetaAppNotConfiguredError('FACEBOOK_APP_ID');
  if (!appSecret) throw new MetaAppNotConfiguredError('FACEBOOK_APP_SECRET');
  return { appId, appSecret };
}

// Exchanges a Facebook token for a long-lived one. Credentials go in the query
// params object (not interpolated into a string) so they are encoded and never
// appear in a URL we build or log. Returns the new token string.
async function exchangeLongLivedToken(token, deps = {}) {
  const env = deps.env || process.env;
  const { appId, appSecret } = getFacebookAppCredentials(env);
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Cannot exchange an empty Facebook token');
  }
  const httpGet = deps.httpGet || ((url, config) => require('axios').get(url, config));
  // Callers pin the version they used before this extraction: graphVersion
  // 'v20.0' keeps the cron on v20, '' keeps the legacy unversioned endpoint.
  // Only a caller that passes nothing falls back to env, then the default.
  const version = deps.graphVersion === undefined
    ? resolveGraphVersion(env.META_GRAPH_API_VERSION)
    : deps.graphVersion;
  if (version !== '' && !/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Graph API version');
  const base = version === '' ? 'https://graph.facebook.com' : `https://graph.facebook.com/${version}`;
  let response;
  try {
    response = await httpGet(`${base}/oauth/access_token`, {
      timeout: REQUEST_TIMEOUT_MS,
      params: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: token,
      },
    });
  } catch (err) {
    throw sanitizeHttpError(err);
  }
  const next = response && response.data && response.data.access_token;
  if (typeof next !== 'string' || !next.trim() || next !== next.trim()) {
    throw new Error('Failed to convert/renew token: No access_token in response');
  }
  return next;
}

module.exports = {
  MetaAppNotConfiguredError,
  getFacebookAppCredentials,
  sanitizeHttpError,
  classifyGraphFailure,
  exchangeLongLivedToken,
  resolveGraphVersion,
  DEFAULT_GRAPH_VERSION,
};
