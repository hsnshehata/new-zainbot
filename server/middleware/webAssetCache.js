'use strict';

/**
 * F02 — explicit web-asset cache classification.
 *
 * Replaces the old catch-all predicate in server/server.js:
 *
 *   ['/', '/dashboard', ...].some((prefix) => req.path.startsWith(prefix))
 *
 * The `'/'` entry over-matched: EVERY request path starts with `'/'`, so the
 * first branch (no-store) swallowed all traffic and the css/js `immutable`
 * branch below it was dead code in practice. Query versions (`?v=...`) were
 * additionally treated as cache-busters while the server kept serving the
 * same bytes — a query version is NOT a content fingerprint.
 *
 * Explicit classes (matched in this order, first match wins):
 *
 *  - service-worker : exact `/service-worker.js` → `no-cache` (revalidate;
 *                     never no-store, never immutable).
 *  - html-no-store  : `.html` files + exact/boundary page prefixes
 *                     (`/`, `/dashboard`, `/login`, `/register`,
 *                     `/dashboard_new`, `/set-whatsapp`, `/chat`, `/chat/`,
 *                     `/store`, `/store/`) → no-store trio.
 *  - api-no-store   : `/api` + `/api/*` (sensitive by default) → no-store trio.
 *  - ops-no-store   : `/health` + `/health/*` (liveness/readiness must never
 *                     be heuristically cached) → no-store trio.
 *  - chat-static    : css/js/font URL whose path contains `/chat`
 *                     (embedded widget context) → no-store trio.
 *                     MIME is left to express.static/send (correct per
 *                     extension); the old manual Content-Type override
 *                     (which labelled every font `font/woff2`) is dropped.
 *  - static-revalidate : all other css/js/woff/woff2/ttf → `no-cache`
 *                     (revalidate; NEVER immutable, in ANY environment, with
 *                     or without a `?v=` query — Express strips the query into
 *                     req.query, so classification is inherently query-blind).
 *  - image-short    : png/jpg/jpeg/gif/ico/json → `public, max-age=300`
 *                     (unchanged from previous behavior).
 *  - pass-through   : everything else gets NO cache header here. Static
 *                     files still receive send's safe default
 *                     (`public, max-age=0`); route handlers (sitemap/robots
 *                     24h, auth `no-store`, error payloads) keep setting
 *                     their own headers downstream, which overwrite these.
 *
 * Chat CSP/embedding exceptions (frame-ancestors *, X-Frame-Options skip)
 * live in SEPARATE middleware in server.js and are untouched by this file.
 * No proxy/Coolify behavior is changed here.
 */

const SERVICE_WORKER_PATH = '/service-worker.js';

const NO_STORE = 'no-cache, no-store, must-revalidate';
const REVALIDATE = 'no-cache';
const IMAGE_SHORT = 'public, max-age=300';

const HTML_PAGE_PREFIXES = [
  '/',
  '/dashboard',
  '/dashboard_new',
  '/login',
  '/register',
  '/set-whatsapp',
  '/chat',
  '/chat/',
  '/store',
  '/store/',
];

const STATIC_REVALIDATE_PATTERN = /\.(css|js|woff|woff2|ttf)$/i;
const IMAGE_SHORT_PATTERN = /\.(png|jpg|jpeg|gif|ico|json)$/i;
const HTML_FILE_PATTERN = /\.html$/i;

function hasBoundaryPrefix(pathname, prefix) {
  // The root prefix matches itself ONLY: every absolute path starts with
  // '/', so a naive startsWith('/') would recreate the catch-all this file
  // exists to remove. All other prefixes match exactly or on a '/' boundary.
  if (prefix === '/') return pathname === '/';
  if (pathname === prefix) return true;
  const base = prefix.replace(/\/+$/, '');
  return pathname.startsWith(`${base}/`);
}

function isApiPath(pathname) {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isOpsPath(pathname) {
  return pathname === '/health' || pathname.startsWith('/health/');
}

/**
 * Pure classifier: pathname (req.path, query already stripped by Express)
 * → { category, cacheControl, pragma, expires }.
 * `headers` is the exact map the middleware applies (null values skipped).
 */
function classifyWebAssetCache(pathname) {
  const path = String(pathname || '');

  if (path === SERVICE_WORKER_PATH) {
    return {
      category: 'service-worker',
      cacheControl: REVALIDATE,
      pragma: 'no-cache',
      expires: null,
    };
  }

  if (
    HTML_FILE_PATTERN.test(path) ||
    HTML_PAGE_PREFIXES.some((prefix) => hasBoundaryPrefix(path, prefix))
  ) {
    return { category: 'html-no-store', cacheControl: NO_STORE, pragma: 'no-cache', expires: '0' };
  }

  if (isApiPath(path)) {
    return { category: 'api-no-store', cacheControl: NO_STORE, pragma: 'no-cache', expires: '0' };
  }

  if (isOpsPath(path)) {
    return { category: 'ops-no-store', cacheControl: NO_STORE, pragma: 'no-cache', expires: '0' };
  }

  if (STATIC_REVALIDATE_PATTERN.test(path)) {
    if (path.includes('/chat')) {
      return { category: 'chat-static', cacheControl: NO_STORE, pragma: 'no-cache', expires: '0' };
    }
    return {
      category: 'static-revalidate',
      cacheControl: REVALIDATE,
      pragma: 'no-cache',
      expires: null,
    };
  }

  if (IMAGE_SHORT_PATTERN.test(path)) {
    return { category: 'image-short', cacheControl: IMAGE_SHORT, pragma: null, expires: null };
  }

  return { category: 'pass-through', cacheControl: null, pragma: null, expires: null };
}

function webAssetCache(req, res, next) {
  const decision = classifyWebAssetCache(req.path);
  if (decision.cacheControl) res.setHeader('Cache-Control', decision.cacheControl);
  if (decision.pragma) res.setHeader('Pragma', decision.pragma);
  if (decision.expires) res.setHeader('Expires', decision.expires);
  next();
}

module.exports = {
  classifyWebAssetCache,
  webAssetCache,
  SERVICE_WORKER_PATH,
  NO_STORE,
  REVALIDATE,
};
