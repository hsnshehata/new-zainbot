'use strict';

// F02 — HTTP cache policy contracts for web assets.
// Uses the exported Express app only (never startServer()). No database,
// no network, no providers, no proxy/Coolify changes.

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');

const app = require('../server/server');
const { classifyWebAssetCache } = require('../server/middleware/webAssetCache');

test.beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
  process.env.NODE_ENV = 'test';
});

// --- Unit: the legacy catch-all over-matched, the classifier does not ---

test('legacy startsWith("/") matched every path; the classifier is explicit', () => {
  const legacyCatchAll = (pathname) => ['/', '/dashboard', '/dashboard_new', '/login', '/register', '/set-whatsapp', '/chat/', '/store/']
    .some((prefix) => pathname.startsWith(prefix));
  assert.equal(legacyCatchAll('/js/dashboard_new.js'), true, 'old predicate swallowed static JS via "/"');
  assert.equal(legacyCatchAll('/api/users/profile'), true, 'old predicate swallowed API via "/"');

  assert.equal(classifyWebAssetCache('/js/dashboard_new.js').category, 'static-revalidate');
  assert.equal(classifyWebAssetCache('/api/users/profile').category, 'api-no-store');
  assert.equal(classifyWebAssetCache('/').category, 'html-no-store', "'/' matches itself only, nothing else");
});

test('HTML pages and sensitive surfaces are no-store', () => {
  for (const pathname of ['/', '/dashboard', '/dashboard_new', '/login', '/register', '/set-whatsapp', '/chat', '/chat.html', '/chat/abc123', '/store/x/landing', '/page.html']) {
    const decision = classifyWebAssetCache(pathname);
    assert.match(decision.cacheControl, /no-store/, `${pathname} must be no-store`);
    assert.doesNotMatch(decision.cacheControl, /immutable/, `${pathname} must never be immutable`);
  }
});

test('API and ops endpoints are no-store', () => {
  for (const pathname of ['/api', '/api/users/profile', '/api/bots', '/health', '/health/readiness']) {
    const decision = classifyWebAssetCache(pathname);
    assert.match(decision.cacheControl, /no-store/, `${pathname} must be no-store`);
  }
});

test('service-worker.js is no-cache revalidate (never no-store, never immutable)', () => {
  const decision = classifyWebAssetCache('/service-worker.js');
  assert.equal(decision.category, 'service-worker');
  assert.equal(decision.cacheControl, 'no-cache');
  assert.doesNotMatch(decision.cacheControl, /no-store/);
  assert.doesNotMatch(decision.cacheControl, /immutable/);
});

test('unversioned JS/CSS/fonts revalidate and never go immutable', () => {
  for (const pathname of ['/js/dashboard_new.js', '/js/utils.js', '/style.css']) {
    const decision = classifyWebAssetCache(pathname);
    assert.equal(decision.category, 'static-revalidate', pathname);
    assert.equal(decision.cacheControl, 'no-cache', pathname);
    assert.doesNotMatch(decision.cacheControl, /immutable/, pathname);
  }
});

test('chat-embedded static keeps no-store (embedding context preserved)', () => {
  for (const pathname of ['/css/chat.css', '/js/chat.js']) {
    const decision = classifyWebAssetCache(pathname);
    assert.equal(decision.category, 'chat-static', pathname);
    assert.match(decision.cacheControl, /no-store/, pathname);
  }
});

test('images and data files keep the short public policy', () => {
  for (const pathname of ['/icon-192.png', '/favicon.ico', '/manifest.json']) {
    const decision = classifyWebAssetCache(pathname);
    assert.equal(decision.cacheControl, 'public, max-age=300', pathname);
  }
});

test('unknown paths pass through with no cache header from this middleware', () => {
  assert.equal(classifyWebAssetCache('/unknown-xyz').category, 'pass-through');
  assert.equal(classifyWebAssetCache('/unknown-xyz').cacheControl, null);
});

// --- HTTP: headers + MIME in the test environment ---

test('GET /dashboard is no-store HTML with the HTML MIME type', async () => {
  const res = await supertest(app).get('/dashboard').set('Accept', 'text/html');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/);
  assert.match(res.headers['cache-control'] || '', /no-store/);
  assert.doesNotMatch(res.headers['cache-control'] || '', /immutable/);
});

test('GET / is no-store HTML', async () => {
  const res = await supertest(app).get('/').set('Accept', 'text/html');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/);
  assert.match(res.headers['cache-control'] || '', /no-store/);
});

test('GET versioned dashboard JS revalidates: query version is not a fingerprint', async () => {
  const res = await supertest(app).get('/js/dashboard_new.js?v=20260928-journey2');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /javascript/);
  assert.equal(res.headers['cache-control'], 'no-cache');
});

test('GET /service-worker.js revalidates with a JS MIME type', async () => {
  const res = await supertest(app).get('/service-worker.js');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /javascript/);
  assert.equal(res.headers['cache-control'], 'no-cache');
});

test('GET /style.css revalidates with the CSS MIME type', async () => {
  const res = await supertest(app).get('/style.css');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/css/);
  assert.equal(res.headers['cache-control'], 'no-cache');
});

test('sensitive API without a token is no-store JSON', async () => {
  const res = await supertest(app).get('/api/users/profile');
  assert.equal(res.status, 401);
  assert.match(res.headers['content-type'] || '', /application\/json/);
  assert.match(res.headers['cache-control'] || '', /no-store/);
});

test('chat page keeps its embedding exceptions and is no-store HTML', async () => {
  const res = await supertest(app).get('/chat/nonexistent-link-xyz').set('Accept', 'text/html');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/);
  assert.match(res.headers['cache-control'] || '', /no-store/);
  assert.ok(!res.headers['x-frame-options'], 'chat must stay embeddable: no X-Frame-Options');
  assert.match(res.headers['content-security-policy'] || '', /frame-ancestors \*/);
});

// --- HTTP: production environment (immutable must be gone everywhere) ---

test('production: unversioned JS never goes immutable, SW still revalidates', async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const js = await supertest(app).get('/js/dashboard_new.js?v=9');
    assert.equal(js.status, 200);
    assert.doesNotMatch(js.headers['cache-control'] || '', /immutable/);
    assert.equal(js.headers['cache-control'], 'no-cache');

    const sw = await supertest(app).get('/service-worker.js');
    assert.equal(sw.status, 200);
    assert.equal(sw.headers['cache-control'], 'no-cache');
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});
