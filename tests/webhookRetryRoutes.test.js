'use strict';

// D06 — retryWebhook contract: HTTP200 + success:false carries a stable code,
// no raw provider leakage in the retry response. Stubs/mocks only: no
// endpoint calls, no DB.

const test = require('node:test');
const assert = require('node:assert/strict');

const axiosCalls = [];
let axiosBehavior = { mode: 'ok', status: 200, data: { success: true } };

function stubModule(resolvedPath, exportsObject) {
  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports: exportsObject,
  };
}

// Stub axios + logger BEFORE the controller loads.
stubModule(require.resolve('axios'), {
  post: async (...args) => {
    axiosCalls.push(args);
    if (axiosBehavior.mode === 'ok') {
      return { status: axiosBehavior.status, data: axiosBehavior.data };
    }
    throw axiosBehavior.error;
  },
});
const loggerPath = require.resolve('../server/logger');
stubModule(loggerPath, { error() {}, warn() {}, info() {} });

const controller = require('../server/controllers/integrationsController');
const WebhookLog = require('../server/models/WebhookLog');
const WebhookConfig = require('../server/models/WebhookConfig');

const LOG_ID = '507f191e810c19729de86011';
const USER_ID = '507f191e810c19729de86001';

let logDoc = null;
let configDoc = null;
const savedStates = [];

function reset({ log = true, config = true } = {}) {
  axiosCalls.length = 0;
  savedStates.length = 0;
  axiosBehavior = { mode: 'ok', status: 200, data: { success: true } };
  logDoc = log
    ? {
      _id: LOG_ID,
      webhookId: 'wh-1',
      url: 'https://owner.example/hook',
      event: 'order.created',
      payload: { orderId: 'o-1' },
      responseStatus: 500,
      responseBody: 'old',
      success: false,
      attempts: 2,
      timestamp: new Date('2026-01-01T00:00:00Z'),
      save: async function save() {
        savedStates.push({ ...this });
      },
    }
    : null;
  configDoc = config ? { _id: 'wh-1', secret: 's3cr3t' } : null;
}

const realLogFindOne = WebhookLog.findOne;
const realConfigFindById = WebhookConfig.findById;
WebhookLog.findOne = async (query) => {
  assert.deepEqual(query, { _id: LOG_ID, userId: USER_ID });
  return logDoc;
};
WebhookConfig.findById = async (id) => {
  assert.equal(id, 'wh-1');
  return configDoc;
};
test.after(() => {
  WebhookLog.findOne = realLogFindOne;
  WebhookConfig.findById = realConfigFindById;
});

async function invoke() {
  const result = { statusCode: 200, body: undefined };
  const req = { params: { id: LOG_ID }, user: { userId: USER_ID } };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await controller.retryWebhook(req, res);
  return result;
}

test('successful redelivery returns success with a sanitized projection', async () => {
  reset();
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, true);
  assert.equal(result.body.data.success, true);
  assert.equal(result.body.data.responseStatus, 200);
  assert.equal(result.body.data.attempts, 3);
  assert.ok(!('responseBody' in result.body.data), 'raw endpoint body must not ship in the retry response');
  assert.equal(axiosCalls.length, 1);
  assert.equal(axiosCalls[0][0], 'https://owner.example/hook');
  assert.equal(typeof axiosCalls[0][1], 'string');
  assert.equal(axiosCalls[0][2].headers['X-ZainBot-Event'], 'order.created');
  assert.ok(axiosCalls[0][2].headers['X-ZainBot-Signature']);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].success, true);
});

test('HTTP200 with success:false is a coded failure, no provider leak', async () => {
  reset();
  axiosBehavior = {
    mode: 'ok',
    status: 200,
    data: { success: false, error: 'SENTINEL_ENDPOINT_REJECT_xyz' },
  };
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'WEBHOOK_DELIVERY_FAILED');
  assert.equal(result.body.data.success, false);
  assert.doesNotMatch(JSON.stringify(result.body), /SENTINEL_ENDPOINT_REJECT_xyz/);
  assert.equal(axiosCalls.length, 1);
  assert.equal(savedStates.length, 1);
  assert.equal(savedStates[0].success, false);
});

test('endpoint 500 failure is a single coded attempt without raw leakage', async () => {
  reset();
  const providerError = new Error('Request failed with status code 500');
  providerError.response = { status: 500, data: { error: 'SENTINEL_PROVIDER_CRASH_abc' } };
  axiosBehavior = { mode: 'throw', error: providerError };
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'WEBHOOK_DELIVERY_FAILED');
  assert.doesNotMatch(JSON.stringify(result.body), /SENTINEL_PROVIDER_CRASH_abc/);
  assert.equal(axiosCalls.length, 1);
  assert.equal(savedStates[0].responseStatus, 500);
  assert.equal(savedStates[0].attempts, 3);
});

test('transport failure stores a generic marker, never the raw error', async () => {
  reset();
  axiosBehavior = { mode: 'throw', error: new Error('connect SENTINEL_NET 10.9.9.9:443') };
  const result = await invoke();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.success, false);
  assert.equal(result.body.code, 'WEBHOOK_DELIVERY_FAILED');
  assert.doesNotMatch(JSON.stringify(result.body), /SENTINEL_NET/);
  assert.equal(savedStates[0].responseBody, 'NO_RESPONSE_FROM_ENDPOINT');
  assert.equal(axiosCalls.length, 1);
});

test('missing log or config short-circuits with stable codes and no dispatch', async () => {
  reset({ log: false });
  const missingLog = await invoke();
  assert.equal(missingLog.statusCode, 404);
  assert.equal(missingLog.body.code, 'WEBHOOK_LOG_NOT_FOUND');
  assert.equal(axiosCalls.length, 0);

  reset({ log: true, config: false });
  const missingConfig = await invoke();
  assert.equal(missingConfig.statusCode, 404);
  assert.equal(missingConfig.body.code, 'WEBHOOK_CONFIG_NOT_FOUND');
  assert.equal(axiosCalls.length, 0);
});
