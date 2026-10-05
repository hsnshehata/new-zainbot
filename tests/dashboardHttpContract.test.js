'use strict';

// A05 — HTTP boundary contracts for the dashboard surface.
// Read-only boundary assertions: no server behavior is changed by this file.
// Uses the exported Express app only (never startServer(), which has
// WhatsApp/job side effects). No database, no network, no providers.

const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const mongoose = require('mongoose');

const app = require('../server/server');

test.beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
  process.env.NODE_ENV = 'test';
});

test('GET /dashboard serves the dashboard HTML identity with the HTML MIME type', async () => {
  const res = await supertest(app)
    .get('/dashboard')
    .set('Accept', 'text/html');

  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'] || '', /text\/html/);
  assert.ok(
    res.text.includes('<!DOCTYPE html>') || res.text.includes('<html'),
    'dashboard must serve the HTML document, not a bare 200'
  );
  assert.ok(res.headers['x-request-id'], 'responses must carry X-Request-Id');
  assert.match(
    res.headers['cache-control'] || '',
    /no-cache/,
    'HTML pages must not be served as cacheable'
  );
});

test('legacy dashboard aliases redirect permanently to /dashboard', async () => {
  for (const alias of ['/dashboard_new', '/set-whatsapp']) {
    const res = await supertest(app).get(alias);
    assert.equal(res.status, 301, `legacy alias ${alias} must redirect`);
    assert.equal(res.headers.location, '/dashboard');
  }
});

test('unknown non-API path with Accept text/html serves the 404 HTML page', async () => {
  const res = await supertest(app)
    .get('/no-such-dashboard-page-xyz')
    .set('Accept', 'text/html');

  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'] || '', /text\/html/);
  assert.ok(
    res.text.includes('<html'),
    'non-API 404 must serve the 404 HTML page, not JSON or an empty body'
  );
});

test('unknown API path returns a JSON 404 with code and traceId', async () => {
  const res = await supertest(app).get('/api/no-such-endpoint-xyz');

  assert.equal(res.status, 404);
  assert.match(res.headers['content-type'] || '', /application\/json/);
  assert.equal(res.body.code, 'NotFound');
  assert.ok(res.body.traceId, 'API errors must carry a traceId');
  assert.ok(typeof res.body.message === 'string' && res.body.message.length > 0);
});

test('GET /health returns the liveness contract', async () => {
  const res = await supertest(app).get('/health');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'zainbot');
});

test('GET /health/readiness reports not_ready/down when the database is disconnected', async () => {
  // Deterministic by construction: the test process never connects mongoose,
  // so readyState is 0 (disconnected) unless a test stubs it.
  assert.notEqual(
    mongoose.connection.readyState,
    1,
    'precondition: no live database connection in the contract test process'
  );

  const res = await supertest(app).get('/health/readiness');

  assert.equal(res.status, 503);
  assert.equal(res.body.status, 'not_ready');
  assert.equal(res.body.checks && res.body.checks.database, 'down');
});

test('GET /health/readiness reports ready/up when the database is connected (stubbed, restored)', async () => {
  const originalReadyState = mongoose.connection.readyState;
  mongoose.connection.readyState = 1;
  try {
    const res = await supertest(app).get('/health/readiness');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.equal(res.body.checks && res.body.checks.database, 'up');
  } finally {
    mongoose.connection.readyState = originalReadyState;
  }
});

test('protected dashboard API without a token is 401 JSON, never HTML or a redirect', async () => {
  const res = await supertest(app).get('/api/users/profile');

  assert.equal(res.status, 401);
  assert.match(res.headers['content-type'] || '', /application\/json/);
  assert.equal(res.body.success, false);
  assert.ok(res.body.error, 'auth rejection must carry a stable error code');
});
