const test = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const app = require('../server/server');

test.beforeEach(() => {
  process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
  process.env.NODE_ENV = 'test';
});

test('health endpoint returns 200 ok status', async () => {
  const res = await supertest(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.service, 'zainbot');
});

test('readiness endpoint returns database check structure', async () => {
  const res = await supertest(app).get('/health/readiness');
  assert.ok(res.status === 200 || res.status === 503);
  assert.ok(res.body.checks && typeof res.body.checks.database === 'string');
});

test('page routes serve expected HTML files', async () => {
  const pages = ['/login', '/register', '/dashboard', '/dashboard_new', '/set-whatsapp'];
  for (const page of pages) {
    const res = await supertest(app).get(page);
    assert.equal(res.status, 200, `Page ${page} should respond with 200`);
    assert.ok(res.text.includes('<!DOCTYPE html>') || res.text.includes('<html'), `Page ${page} should serve HTML content`);
  }
});
