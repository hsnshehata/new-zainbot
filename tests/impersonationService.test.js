const test = require('node:test');
const assert = require('node:assert/strict');

const AdminImpersonationSession = require('../server/models/AdminImpersonationSession');
const AuditEvent = require('../server/models/AuditEvent');
const {
  IMPERSONATION_TTL_MS,
  SESSION_RETENTION_MS,
  ImpersonationError,
  createImpersonationService,
} = require('../server/services/impersonationService');

const ADMIN_ID = '507f191e810c19729de86001';
const OTHER_ADMIN_ID = '507f191e810c19729de86002';
const USER_ID = '507f191e810c19729de86003';
const DELETED_USER_ID = '507f191e810c19729de86004';

function buildHarness(overrides = {}) {
  const fixedNow = overrides.fixedNow || new Date('2026-07-25T04:00:00.000Z');
  const users = new Map([
    [ADMIN_ID, {
      _id: ADMIN_ID,
      username: 'admin',
      role: 'superadmin',
      status: 'active',
      sessionVersion: 4,
    }],
    [OTHER_ADMIN_ID, {
      _id: OTHER_ADMIN_ID,
      username: 'other_admin',
      role: 'superadmin',
      status: 'active',
      sessionVersion: 1,
    }],
    [USER_ID, {
      _id: USER_ID,
      username: 'customer',
      role: 'user',
      status: 'active',
      sessionVersion: 2,
    }],
    [DELETED_USER_ID, {
      _id: DELETED_USER_ID,
      username: 'deleted',
      role: 'user',
      status: 'deleted',
      sessionVersion: 8,
    }],
  ]);
  const sessions = new Map();
  const audits = [];
  let sequence = 1;

  const UserModel = {
    findById: async (id) => users.get(String(id)) || null,
  };

  const SessionModel = {
    create: async (document) => {
      const stored = {
        _id: `507f191e810c19729de87${String(sequence).padStart(3, '0')}`,
        ...document,
      };
      sequence += 1;
      sessions.set(String(stored._id), stored);
      return stored;
    },
    findById: async (id) => sessions.get(String(id)) || null,
    updateOne: async (filter, update) => {
      const stored = sessions.get(String(filter._id));
      if (!stored || (filter.status && stored.status !== filter.status)) {
        return { modifiedCount: 0 };
      }
      Object.assign(stored, update.$set || {});
      return { modifiedCount: 1 };
    },
    findOneAndUpdate: async (filter, update) => {
      const stored = sessions.get(String(filter._id));
      if (!stored || (filter.status && stored.status !== filter.status)) {
        return null;
      }
      Object.assign(stored, update.$set || {});
      return stored;
    },
  };

  const AuditEventModel = {
    create: async (event) => {
      if (overrides.failAudit) {
        throw new Error('audit unavailable');
      }
      audits.push({ ...event });
      return event;
    },
  };

  const service = createImpersonationService({
    UserModel,
    SessionModel,
    AuditEventModel,
    now: overrides.now || (() => new Date(fixedNow)),
  });

  return {
    service,
    users,
    sessions,
    audits,
    fixedNow,
  };
}

test('impersonation schemas retain audit evidence and hide session versions', () => {
  const sessionIndexes = AdminImpersonationSession.schema.indexes();
  const retentionIndex = sessionIndexes.find(([keys]) => keys.purgeAt === 1);

  assert.ok(retentionIndex);
  assert.equal(retentionIndex[1].expireAfterSeconds, 0);
  assert.equal(
    AuditEvent.schema.indexes().some(([_keys, options]) => (
      options.expireAfterSeconds !== undefined
    )),
    false
  );

  const session = new AdminImpersonationSession({
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    reason: 'Investigate customer issue',
    scopes: ['product:read'],
    actorSessionVersion: 4,
    subjectSessionVersion: 2,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + IMPERSONATION_TTL_MS),
    purgeAt: new Date(Date.now() + SESSION_RETENTION_MS),
  }).toJSON();

  assert.equal(session.actorSessionVersion, undefined);
  assert.equal(session.subjectSessionVersion, undefined);
  assert.equal(session.purgeAt, undefined);
});

test('AuditEvent model redacts credential-like text without a database write', async () => {
  const event = new AuditEvent({
    eventType: 'impersonation.started',
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    impersonationSessionId: '507f191e810c19729de87001',
    outcome: 'success',
    reason: 'Support case Authorization: Bearer secret-value token=another-secret',
    requestId: 'request-123',
    createdAt: new Date(),
  });

  await event.validate();

  assert.doesNotMatch(event.reason, /secret-value|another-secret/);
  assert.match(event.reason, /\[REDACTED\]/);
});

test('creates a 15-minute session and writes only redacted audit context', async () => {
  const harness = buildHarness();
  const result = await harness.service.createSession({
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    reason: 'Check token=top-secret customer channel failure',
    scopes: ['channels:read', 'channels:write', 'channels:read'],
    requestId: 'request-123',
  });

  assert.equal(
    new Date(result.session.expiresAt).getTime() - harness.fixedNow.getTime(),
    IMPERSONATION_TTL_MS
  );
  assert.equal(
    new Date(result.session.purgeAt).getTime() - new Date(result.session.expiresAt).getTime(),
    SESSION_RETENTION_MS
  );
  assert.deepEqual(result.session.scopes, ['channels:read', 'channels:write']);
  assert.match(result.session.reason, /token=\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(harness.audits), /top-secret/);
  assert.equal(harness.audits[0].eventType, 'impersonation.started');
  assert.equal(harness.audits[0].requestId, 'request-123');
});

test('rejects self impersonation and deleted subjects', async () => {
  const harness = buildHarness();

  await assert.rejects(
    harness.service.createSession({
      actorUserId: ADMIN_ID,
      subjectUserId: ADMIN_ID,
      reason: 'Test own account',
    }),
    (error) => (
      error instanceof ImpersonationError
      && error.code === 'IMPERSONATION_SELF_FORBIDDEN'
    )
  );

  await assert.rejects(
    harness.service.createSession({
      actorUserId: ADMIN_ID,
      subjectUserId: DELETED_USER_ID,
      reason: 'Inspect deleted account',
    }),
    (error) => (
      error instanceof ImpersonationError
      && error.code === 'IMPERSONATION_SUBJECT_NOT_FOUND'
    )
  );
});

test('fails closed and revokes a session when audit creation fails', async () => {
  const harness = buildHarness({ failAudit: true });

  await assert.rejects(
    harness.service.createSession({
      actorUserId: ADMIN_ID,
      subjectUserId: USER_ID,
      reason: 'Customer support case',
    }),
    (error) => error.code === 'IMPERSONATION_AUDIT_FAILED'
  );

  const [storedSession] = harness.sessions.values();
  assert.equal(storedSession.status, 'revoked');
  assert.ok(storedSession.revokedAt instanceof Date);
});

test('validates actor, subject, expiry, and both session versions', async () => {
  const harness = buildHarness();
  const created = await harness.service.createSession({
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    reason: 'Customer support case',
  });

  const valid = await harness.service.validateSession({
    sessionId: created.session._id,
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
  });
  assert.equal(String(valid.subject._id), USER_ID);

  harness.users.get(USER_ID).sessionVersion += 1;
  await assert.rejects(
    harness.service.validateSession({
      sessionId: created.session._id,
      actorUserId: ADMIN_ID,
      subjectUserId: USER_ID,
    }),
    (error) => error.code === 'IMPERSONATION_SESSION_REVOKED'
  );

  await assert.rejects(
    harness.service.validateSession({
      sessionId: created.session._id,
      actorUserId: OTHER_ADMIN_ID,
      subjectUserId: USER_ID,
    }),
    (error) => error.code === 'IMPERSONATION_SESSION_MISMATCH'
  );
});

test('expires sessions and ends or revokes them idempotently', async () => {
  let current = new Date('2026-07-25T04:00:00.000Z');
  const harness = buildHarness({ now: () => new Date(current) });
  const first = await harness.service.createSession({
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    reason: 'Customer support case',
  });

  const ended = await harness.service.endSession({
    sessionId: first.session._id,
    actorUserId: ADMIN_ID,
  });
  assert.equal(ended.changed, true);
  assert.equal(ended.session.status, 'ended');

  const endedAgain = await harness.service.endSession({
    sessionId: first.session._id,
    actorUserId: ADMIN_ID,
  });
  assert.equal(endedAgain.changed, false);

  const second = await harness.service.createSession({
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    reason: 'Second customer support case',
  });
  const revoked = await harness.service.endSession({
    sessionId: second.session._id,
    actorUserId: OTHER_ADMIN_ID,
  });
  assert.equal(revoked.session.status, 'revoked');

  const third = await harness.service.createSession({
    actorUserId: ADMIN_ID,
    subjectUserId: USER_ID,
    reason: 'Expiring customer support case',
  });
  current = new Date(current.getTime() + IMPERSONATION_TTL_MS + 1);

  await assert.rejects(
    harness.service.validateSession({
      sessionId: third.session._id,
      actorUserId: ADMIN_ID,
      subjectUserId: USER_ID,
    }),
    (error) => error.code === 'IMPERSONATION_SESSION_EXPIRED'
  );
  assert.equal(harness.sessions.get(String(third.session._id)).status, 'expired');
});
