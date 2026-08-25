// tests/aiCredentialHealth.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCredentialContext,
  encryptCredentialSecret,
} = require('../server/services/AiCredentialCrypto');
const {
  createAiCredentialHealthService,
} = require('../server/services/aiCredentialHealthService');
const {
  createAiControlPlaneRouter,
} = require('../server/routes/AiControlPlane');

const KEY = `base64:${Buffer.alloc(32, 7).toString('base64')}`;
const ENVIRONMENT = { CREDENTIAL_ENCRYPTION_KEY: KEY };
const SECRET = 'sk-live-secret-value';
const CREDENTIAL_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f191e810c19729de86001';
const silentLogger = { info() {}, warn() {}, error() {} };
const passAuthentication = (_req, _res, next) => next();

function credentialDoc(overrides = {}) {
  const provider = overrides.provider || 'openai';
  const encrypted = encryptCredentialSecret(SECRET, {
    context: buildCredentialContext(CREDENTIAL_ID, provider),
    environment: ENVIRONMENT,
  });
  return {
    _id: CREDENTIAL_ID,
    name: 'primary',
    provider,
    baseUrl: '',
    status: 'active',
    failureCount: 0,
    ...encrypted,
    ...overrides,
  };
}

function findRouteHandler(router, path) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path
  );
  assert.ok(layer, `Expected route ${path}`);
  return layer.route.stack[0].handle;
}

async function invokeHandler(handler, req) {
  const result = { statusCode: 200, body: undefined };
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
  await handler(req, res);
  return result;
}

function fakeCredentialModel(doc) {
  const model = {
    documents: doc ? [doc] : [],
    updates: [],
    findById(id) {
      const found = model.documents.find(
        (candidate) => String(candidate._id) === String(id)
      ) || null;
      const chain = {
        select() {
          return chain;
        },
        then(onFulfilled, onRejected) {
          return Promise.resolve(found).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
    async findByIdAndUpdate(id, update) {
      model.updates.push({ id: String(id), update });
      return null;
    },
  };
  return model;
}

function routeRequest() {
  return {
    params: { id: CREDENTIAL_ID },
    auth: {
      actorUserId: ADMIN_ID,
      subjectUserId: ADMIN_ID,
      actorRole: 'superadmin',
    },
    requestId: 'health-test-route',
  };
}

function buildRouter({ model, healthService, audits }) {
  return createAiControlPlaneRouter({
    authenticate: passAuthentication,
    models: { AiCredential: model },
    healthService,
    audit: async (event) => {
      audits.push(event);
    },
  });
}

test('an openai credential passes a healthy bearer-token probe', async () => {
  const calls = [];
  const service = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    httpGet: async (url, headers) => {
      calls.push({ url, headers });
      return {
        status: 200,
        data: { data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }] },
      };
    },
  });

  const result = await service.testCredential(credentialDoc());

  assert.equal(result.healthy, true);
  assert.equal(result.errorCode, undefined);
  assert.equal(result.modelsCount, 2);
  assert.equal(typeof result.latencyMs, 'number');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/models');
  assert.equal(calls[0].headers.Authorization, `Bearer ${SECRET}`);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
});

test('gemini and openrouter fall back to their documented default base URLs', async () => {
  const urls = [];
  const service = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    httpGet: async (url) => {
      urls.push(url);
      return { status: 200, data: [] };
    },
  });

  await service.testCredential(credentialDoc({ provider: 'gemini' }));
  await service.testCredential(credentialDoc({ provider: 'google' }));
  await service.testCredential(credentialDoc({ provider: 'openrouter' }));

  assert.deepEqual(urls, [
    'https://generativelanguage.googleapis.com/v1beta/openai/models',
    'https://generativelanguage.googleapis.com/v1beta/openai/models',
    'https://openrouter.ai/api/v1/models',
  ]);
});

test('a custom credential without a baseUrl fails fast without network access', async () => {
  let called = false;
  const service = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    httpGet: async () => {
      called = true;
      return { status: 200, data: {} };
    },
  });

  const result = await service.testCredential(
    credentialDoc({ provider: 'custom', baseUrl: '' })
  );

  assert.equal(called, false);
  assert.equal(result.healthy, false);
  assert.equal(result.errorCode, 'AI_CREDENTIAL_BASE_URL_REQUIRED');
  assert.equal(typeof result.latencyMs, 'number');
});

test('the anthropic probe authenticates with x-api-key headers', async () => {
  const calls = [];
  const service = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    httpGet: async (url, headers) => {
      calls.push({ url, headers });
      return { status: 200, data: { data: [{ id: 'claude' }] } };
    },
  });

  const result = await service.testCredential(
    credentialDoc({ provider: 'anthropic' })
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/models');
  assert.equal(calls[0].headers['x-api-key'], SECRET);
  assert.equal(calls[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(result.healthy, true);
  assert.equal(result.modelsCount, 1);
});

test('rejected and non-2xx probes report unhealthy with measured latency', async () => {
  const rejecting = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    now: () => new Date(60_000),
    httpGet: async () => {
      const error = new Error('connect timeout');
      error.code = 'ECONNABORTED';
      throw error;
    },
  });
  const refused = await rejecting.testCredential(credentialDoc());
  assert.equal(refused.healthy, false);
  assert.equal(refused.errorCode, 'ECONNABORTED');
  assert.equal(refused.latencyMs, 0);

  const notAuthorized = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    httpGet: async () => ({ status: 401, data: {} }),
  });
  const unauthorized = await notAuthorized.testCredential(credentialDoc());
  assert.equal(unauthorized.healthy, false);
  assert.equal(unauthorized.errorCode, 'PROVIDER_HTTP_401');
  assert.equal(typeof unauthorized.latencyMs, 'number');
});

test('an undecryptable secret short-circuits before any network call', async () => {
  let called = false;
  const service = createAiCredentialHealthService({
    environment: ENVIRONMENT,
    logger: silentLogger,
    httpGet: async () => {
      called = true;
      return { status: 200, data: {} };
    },
  });
  const tampered = credentialDoc();
  tampered.secretCiphertext = Buffer.from('tampered-payload').toString('base64');

  const result = await service.testCredential(tampered);

  assert.equal(called, false);
  assert.equal(result.healthy, false);
  assert.equal(result.errorCode, 'AI_CREDENTIAL_DECRYPT_FAILED');
  assert.equal(typeof result.latencyMs, 'number');
});

test('a successful health test flips validation fields and emits an audited event', async () => {
  const doc = credentialDoc({ status: 'error', failureCount: 2 });
  const model = fakeCredentialModel(doc);
  const audits = [];
  const probed = [];
  const router = buildRouter({
    model,
    audits,
    healthService: {
      testCredential: async (credential) => {
        probed.push(credential);
        return { healthy: true, latencyMs: 87, modelsCount: 14 };
      },
    },
  });
  const handler = findRouteHandler(router, '/credentials/:id/test');

  const response = await invokeHandler(handler, routeRequest());

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    data: {
      healthy: true,
      errorCode: '',
      latencyMs: 87,
      modelsCount: 14,
    },
  });
  assert.equal(probed.length, 1);
  assert.ok(probed[0].secretCiphertext, 'credential loaded with secret selects');
  assert.equal(model.updates.length, 1);
  assert.equal(model.updates[0].id, CREDENTIAL_ID);
  const update = model.updates[0].update;
  assert.equal(update.$set.status, 'active');
  assert.equal(update.$set.lastValidatedAt instanceof Date, true);
  assert.equal(update.$set.lastErrorCode, '');
  assert.equal(update.$inc, undefined);

  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'ai.credential.tested');
  assert.equal(audits[0].resourceType, 'AiCredential');
  assert.equal(audits[0].resourceId, CREDENTIAL_ID);
  assert.equal(audits[0].actorUserId, ADMIN_ID);
  assert.deepEqual(audits[0].changedFields, ['status', 'lastValidatedAt']);
});

test('a failed health test records the error outcome and increments the counter', async () => {
  const model = fakeCredentialModel(credentialDoc());
  const audits = [];
  const router = buildRouter({
    model,
    audits,
    healthService: {
      testCredential: async () => ({
        healthy: false,
        errorCode: `X${'Y'.repeat(130)}`,
        latencyMs: 21,
      }),
    },
  });
  const handler = findRouteHandler(router, '/credentials/:id/test');

  const response = await invokeHandler(handler, routeRequest());

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.healthy, false);
  assert.equal(typeof response.body.data.latencyMs, 'number');
  assert.equal(response.body.data.modelsCount, undefined);

  assert.equal(model.updates.length, 1);
  const update = model.updates[0].update;
  assert.equal(update.$set.status, 'error');
  assert.equal(update.$set.lastFailureAt instanceof Date, true);
  assert.equal(update.$set.lastErrorCode.length, 100);
  assert.equal(update.$inc.failureCount, 1);

  assert.equal(audits.length, 1);
  assert.deepEqual(audits[0].changedFields, ['status', 'lastFailureAt']);
});

test('testing an unknown credential answers 404 without probing', async () => {
  const model = fakeCredentialModel(null);
  let probed = 0;
  const audits = [];
  const router = buildRouter({
    model,
    audits,
    healthService: {
      testCredential: async () => {
        probed += 1;
        return { healthy: true, latencyMs: 1 };
      },
    },
  });
  const handler = findRouteHandler(router, '/credentials/:id/test');

  const response = await invokeHandler(handler, routeRequest());

  assert.equal(response.statusCode, 404);
  assert.equal(response.body.error, 'AI_CREDENTIAL_NOT_FOUND');
  assert.equal(probed, 0);
  assert.equal(model.updates.length, 0);
  assert.equal(audits.length, 0);
});
