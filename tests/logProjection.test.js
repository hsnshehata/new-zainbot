'use strict';
// Real-function tests for the L1-L5 log projection patch:
// errorHandler (L4) and customersController (L5) with stubbed logger/models.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const root = path.join(__dirname, '..', 'server');

const loadWith = (file, stubs) => {
  const logs = [];
  const logger = new Proxy({}, { get: () => (...a) => { logs.push(a); } });
  const realLoad = Module._load;
  Module._load = function (request, parent) {
    const rel = parent && parent.filename && request.startsWith('.') ? path.resolve(path.dirname(parent.filename), request) : request;
    if (/[\\/]logger$/.test(rel)) return logger;
    for (const [re, val] of stubs) if (re.test(rel)) return val;
    return realLoad.apply(this, arguments);
  };
  const m = new Module(file, null); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(fs.readFileSync(file, 'utf8'), file);
  Module._load = realLoad;
  return { exports: m.exports, logs };
};

(async () => {
  // L4: errorHandler redacts and truncates logged error text; client still gets the generic message
  {
    const file = path.join(root, 'middleware', 'errorHandler.js');
    const { exports: handler, logs } = loadWith(file, []);
    const secret = 'sk-LIVEKEY-abcdef1234567890';
    const err = new Error(`provider said: ${secret} ` + 'x'.repeat(500));
    const req = { requestId: 't1', originalUrl: '/x', method: 'GET' };
    let payload = null;
    const res = { statusCode: 0, headers: {}, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(p) { payload = p; return this; }, getHeader() { return 'application/json'; } };
    handler(err, req, res, () => {});
    assert.strictEqual(payload.message, 'حدث خطأ غير متوقع', 'unexpected 500 never leaks to the client');
    const log = logs.find((l) => l[0] === 'unhandled_error');
    assert.ok(log, 'error logged');
    assert.ok(String(log[1].err).endsWith('...[TRUNCATED]'), 'logged error text truncated by redactSensitive');
    // NOTE: redactSensitive truncates and redacts by key name; provider-text
    // containment comes from the provider-side catches (L1/L2/L3), not here.
  }

  // L5: customersController never logs the customer phone
  {
    const file = path.join(root, 'controllers', 'customersController.js');
    const PHONE = '01055512345';
    const stubs = [
      [/[\\/]models[\\/]Store$/, { findById: async () => ({ userId: 'u1' }) }],
      [/[\\/]models[\\/]Customer$/, {
        findOne: async () => { throw new Error('db exploded'); },
        updateOne: async () => { throw new Error('db exploded'); },
      }],
      [/[\\/]models[\\/]/, {}],
    ];
    const { exports: ctrl, logs } = loadWith(file, stubs);
    const mkRes = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
    await ctrl.lookupByPhone({ params: { storeId: 's1' }, query: { phone: PHONE }, user: { userId: 'u1', role: 'user' } }, mkRes());
    await ctrl.upsertFromOrder({ storeId: 's1', name: 'أحمد', phone: PHONE, orderTotal: 10 });
    const dump = JSON.stringify(logs);
    assert.ok(logs.some((l) => l[0] === 'customer_lookup_phone_error'), 'lookup failure still logged');
    assert.ok(logs.some((l) => l[0] === 'customer_upsert_from_order_error'), 'upsert failure still logged');
    assert.ok(!dump.includes(PHONE), 'customer phone must not reach logs');
  }

  console.log('log projection tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
