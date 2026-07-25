const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const {
  createImpersonationTokenCodec,
} = require('../server/services/impersonationTokenService');

const TEST_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
const ADMIN_ID = '507f191e810c19729de86001';
const USER_ID = '507f191e810c19729de86003';
const SESSION_ID = '507f191e810c19729de87001';
const FIXED_NOW = new Date('2026-07-25T04:00:00.000Z');

function buildCodec() {
  return createImpersonationTokenCodec({
    getSecret: () => TEST_SECRET,
    now: () => new Date(FIXED_NOW),
  });
}

function buildTokenInput() {
  return {
    actor: {
      _id: ADMIN_ID,
      role: 'superadmin',
      sessionVersion: 4,
    },
    subject: {
      _id: USER_ID,
      role: 'user',
      sessionVersion: 2,
    },
    session: {
      _id: SESSION_ID,
      actorSessionVersion: 4,
      subjectSessionVersion: 2,
      scopes: ['product:read', 'channels:write'],
      expiresAt: new Date(FIXED_NOW.getTime() + (15 * 60 * 1000)),
    },
  };
}

test('impersonation token binds actor, subject, session, versions, scopes, and expiry', () => {
  const codec = buildCodec();
  const token = codec.signImpersonationToken(buildTokenInput());
  const payload = codec.verifyImpersonationToken(token);

  assert.equal(payload.tokenType, 'impersonation');
  assert.equal(payload.actorUserId, ADMIN_ID);
  assert.equal(payload.subjectUserId, USER_ID);
  assert.equal(payload.sub, USER_ID);
  assert.equal(payload.impersonationSessionId, SESSION_ID);
  assert.equal(payload.jti, SESSION_ID);
  assert.equal(payload.actorSessionVersion, 4);
  assert.equal(payload.subjectSessionVersion, 2);
  assert.deepEqual(payload.scopes, ['product:read', 'channels:write']);
  assert.equal(payload.exp - payload.iat, 15 * 60);
});

test('codec rejects the wrong token type and malformed identity claims', () => {
  const codec = buildCodec();
  const accessToken = jwt.sign(
    {
      tokenType: 'access',
      actorUserId: ADMIN_ID,
      subjectUserId: USER_ID,
      impersonationSessionId: SESSION_ID,
      actorRole: 'superadmin',
      scopes: [],
    },
    TEST_SECRET,
    {
      issuer: 'zainbot',
      audience: 'zainbot-web',
      subject: USER_ID,
      jwtid: SESSION_ID,
      expiresIn: '5m',
    }
  );

  assert.throws(
    () => codec.verifyImpersonationToken(accessToken),
    /Unexpected token type/
  );

  assert.throws(
    () => codec.signImpersonationToken({
      ...buildTokenInput(),
      subject: { _id: ADMIN_ID, role: 'superadmin' },
    }),
    /different actor and subject/
  );
});

test('codec refuses to issue an already expired impersonation token', () => {
  const codec = buildCodec();
  const input = buildTokenInput();
  input.expiresAt = new Date(FIXED_NOW.getTime() - 1);

  assert.throws(
    () => codec.signImpersonationToken(input),
    /expiry must be in the future/
  );
});
