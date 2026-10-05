'use strict';

// D06 — errorHandler contract: { success, message, code, traceId } kept,
// success:false added additively, unexpected exception strings hidden,
// non-API 404 HTML untouched. No app/DB; the middleware is invoked directly.

const test = require('node:test');
const assert = require('node:assert/strict');

// Silence the winston/file logger before the middleware loads it.
const loggerPath = require.resolve('../server/logger');
require.cache[loggerPath] = {
  id: loggerPath,
  filename: loggerPath,
  loaded: true,
  exports: { error() {}, warn() {}, info() {} },
};

const errorHandler = require('../server/middleware/errorHandler');

function invoke(err, url = '/api/things', requestId = 'trace-test-1') {
  const result = { statusCode: 200, body: undefined, file: undefined };
  const req = { requestId, originalUrl: url, method: 'GET' };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
    sendFile(file) {
      result.file = file;
      return this;
    },
  };
  errorHandler(err, req, res, () => {});
  return result;
}

test('operational errors keep message/code/traceId and gain success:false', () => {
  const err = new Error('نام المدينة مطلوب');
  err.statusCode = 400;
  err.code = 'CITY_REQUIRED';
  const result = invoke(err);
  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, {
    success: false,
    message: 'نام المدينة مطلوب',
    code: 'CITY_REQUIRED',
    traceId: 'trace-test-1',
  });
});

test('ValidationError and CastError map to stable codes', () => {
  const validation = new Error('name is required');
  validation.name = 'ValidationError';
  const vRes = invoke(validation);
  assert.equal(vRes.statusCode, 400);
  assert.equal(vRes.body.code, 'VALIDATION_ERROR');
  assert.equal(vRes.body.success, false);

  const cast = new Error('Cast to ObjectId failed');
  cast.name = 'CastError';
  const cRes = invoke(cast);
  assert.equal(cRes.statusCode, 400);
  assert.equal(cRes.body.code, 'BAD_ID_FORMAT');
  assert.equal(cRes.body.success, false);
});

test('unexpected exceptions hide their message (sentinel never leaks)', () => {
  const err = new TypeError('SENTINEL_DB_CONN_CRASH cannot read property of undefined');
  const result = invoke(err);
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'INTERNAL_ERROR');
  assert.equal(result.body.message, 'حدث خطأ غير متوقع');
  assert.ok(typeof result.body.traceId === 'string' && result.body.traceId.length > 0);
  assert.doesNotMatch(JSON.stringify(result.body), /SENTINEL_DB_CONN_CRASH/);
});

test('explicit 500s stay operational (message and code preserved)', () => {
  const err = new Error('المخزون غير كافٍ');
  err.statusCode = 500;
  err.code = 'STOCK_SHORTAGE';
  const result = invoke(err);
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.message, 'المخزون غير كافٍ');
  assert.equal(result.body.code, 'STOCK_SHORTAGE');
});

test('non-API 404 still serves the HTML page', () => {
  const err = new Error('not here');
  err.statusCode = 404;
  const result = invoke(err, '/some-page');
  assert.equal(result.statusCode, 404);
  assert.ok(result.file && result.file.endsWith('404.html'));
  assert.equal(result.body, undefined);
});

test('API 404 returns JSON, never the HTML page', () => {
  const err = new Error('missing');
  err.statusCode = 404;
  err.code = 'NOT_FOUND';
  const result = invoke(err, '/api/no-such-endpoint-xyz');
  assert.equal(result.statusCode, 404);
  assert.equal(result.file, undefined);
  assert.deepEqual(result.body, {
    success: false,
    message: 'missing',
    code: 'NOT_FOUND',
    traceId: 'trace-test-1',
  });
});
