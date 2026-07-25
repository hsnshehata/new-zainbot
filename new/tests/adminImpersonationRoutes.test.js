const test = require('node:test');
const assert = require('node:assert/strict');

const {
  directSuperadminOnly,
  createAdminImpersonationRouter,
} = require('../server/routes/adminImpersonation');

const ADMIN_ID = '507f191e810c19729de86001';
const USER_ID = '507f191e810c19729de86003';
const SESSION_ID = '507f191e810c19729de87001';
const silentLogger = { info() {}, error() {} };
const passAuthentication = (_req, _res, next) => next();

function buildRouter({ service, issueToken }) {
  return createAdminImpersonationRouter({
    authenticate: passAuthentication,
    service,
    issueToken,
    logger: silentLogger,
  });
}

function findRouteHandler(router, path) {
  const layer = router.stack.find((candidate) => candidate.route?.path === path);
  assert.ok(layer, `Expected route ${path}`);
  return layer.route.stack[0].handle;
}

async function invokeHandler(handler, req) {
  const result = {
    statusCode: 200,
    body: undefined,
  };
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

test('route rejects a regular user and an already impersonating admin', async () => {
  for (const auth of [
    {
      actorUserId: USER_ID,
      subjectUserId: USER_ID,
      actorRole: 'user',
      subjectRole: 'user',
      isImpersonating: false,
    },
    {
      actorUserId: ADMIN_ID,
      subjectUserId: USER_ID,
      actorRole: 'superadmin',
      subjectRole: 'user',
      isImpersonating: true,
    },
  ]) {
    const req = { auth };
    let nextCalled = false;
    const response = await invokeHandler(
      (request, res) => directSuperadminOnly(request, res, () => {
        nextCalled = true;
      }),
      req
    );

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.error, 'DIRECT_SUPERADMIN_REQUIRED');
    assert.equal(nextCalled, false);
  }
});

test('direct superadmin guard passes only matching actor and subject', async () => {
  let nextCalled = false;
  const response = await invokeHandler(
    (req, res) => directSuperadminOnly(req, res, () => {
      nextCalled = true;
    }),
    {
      auth: {
        actorUserId: ADMIN_ID,
        subjectUserId: ADMIN_ID,
        actorRole: 'superadmin',
        subjectRole: 'superadmin',
        isImpersonating: false,
      },
    }
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, undefined);
  assert.equal(nextCalled, true);
});

test('route returns the injected token without exposing account secrets', async () => {
  let issuedFor;
  const service = {
    createSession: async (input) => ({
      actor: {
        _id: ADMIN_ID,
        username: 'admin',
        role: 'superadmin',
        sessionVersion: 7,
      },
      subject: {
        _id: USER_ID,
        username: 'customer',
        role: 'user',
        status: 'active',
        password: 'must-not-leak',
      },
      session: {
        _id: SESSION_ID,
        actorUserId: ADMIN_ID,
        subjectUserId: USER_ID,
        reason: input.reason,
        scopes: ['product:read'],
        status: 'active',
        createdAt: new Date('2026-07-25T04:00:00.000Z'),
        expiresAt: new Date('2026-07-25T04:15:00.000Z'),
      },
    }),
    endSession: async () => {
      throw new Error('must not be reached');
    },
  };
  const router = buildRouter({
    service,
    issueToken: async (input) => {
      issuedFor = input;
      return 'injected.test.token';
    },
  });
  const handler = findRouteHandler(router, '/sessions');
  const response = await invokeHandler(handler, {
    requestId: 'route-test',
    auth: {
      actorUserId: ADMIN_ID,
      subjectUserId: ADMIN_ID,
      actorRole: 'superadmin',
      subjectRole: 'superadmin',
      isImpersonating: false,
    },
    body: {
      subjectUserId: USER_ID,
      reason: 'Customer support case',
      scopes: ['product:read'],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.token, 'injected.test.token');
  assert.equal(response.body.data.subject.id, USER_ID);
  assert.equal(response.body.data.subject.password, undefined);
  assert.equal(issuedFor.tokenType, 'impersonation');
  assert.equal(String(issuedFor.session._id), SESSION_ID);
});

test('route revokes a created session when token issuance fails', async () => {
  const revocations = [];
  const service = {
    createSession: async () => ({
      actor: { _id: ADMIN_ID, role: 'superadmin' },
      subject: { _id: USER_ID, username: 'customer', role: 'user', status: 'active' },
      session: {
        _id: SESSION_ID,
        actorUserId: ADMIN_ID,
        subjectUserId: USER_ID,
        reason: 'Customer support case',
        scopes: ['product:read'],
        status: 'active',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      },
    }),
    endSession: async (input) => {
      revocations.push(input);
      return { changed: true };
    },
  };
  const router = buildRouter({
    service,
    issueToken: async () => '',
  });
  const handler = findRouteHandler(router, '/sessions');
  const response = await invokeHandler(handler, {
    requestId: 'route-test',
    auth: {
      actorUserId: ADMIN_ID,
      subjectUserId: ADMIN_ID,
      actorRole: 'superadmin',
      subjectRole: 'superadmin',
      isImpersonating: false,
    },
    body: {
      subjectUserId: USER_ID,
      reason: 'Customer support case',
    },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.error, 'IMPERSONATION_TOKEN_FAILED');
  assert.equal(revocations.length, 1);
  assert.equal(revocations[0].forceRevoke, true);
  assert.equal(revocations[0].errorCode, 'TOKEN_ISSUANCE_FAILED');
});

test('route ends a session through the service', async () => {
  const service = {
    createSession: async () => {
      throw new Error('must not be reached');
    },
    endSession: async () => ({
      changed: true,
      session: {
        _id: SESSION_ID,
        actorUserId: ADMIN_ID,
        subjectUserId: USER_ID,
        reason: 'Customer support case',
        scopes: ['product:read'],
        status: 'ended',
        createdAt: new Date('2026-07-25T04:00:00.000Z'),
        expiresAt: new Date('2026-07-25T04:15:00.000Z'),
        endedAt: new Date('2026-07-25T04:02:00.000Z'),
      },
    }),
  };
  const router = buildRouter({
    service,
    issueToken: async () => 'unused',
  });
  const handler = findRouteHandler(router, '/sessions/:sessionId/end');
  const response = await invokeHandler(handler, {
    requestId: 'route-test',
    auth: {
      actorUserId: ADMIN_ID,
      subjectUserId: ADMIN_ID,
      actorRole: 'superadmin',
      subjectRole: 'superadmin',
      isImpersonating: false,
    },
    params: { sessionId: SESSION_ID },
    body: {},
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.changed, true);
  assert.equal(response.body.data.session.status, 'ended');
});
