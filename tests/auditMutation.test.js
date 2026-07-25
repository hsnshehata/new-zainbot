const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAuditEvent,
} = require('../server/middleware/auditMutation');

const ADMIN_ID = '507f191e810c19729de86001';
const USER_ID = '507f191e810c19729de86003';
const SESSION_ID = '507f191e810c19729de87001';

test('builds an actor/subject audit record for impersonated writes', () => {
  const event = buildAuditEvent({
    method: 'PATCH',
    path: '/api/bots/507f191e810c19729de87009?token=must-not-appear',
    params: { id: '507f191e810c19729de87009' },
    requestId: 'request-1',
    auth: {
      actorUserId: ADMIN_ID,
      subjectUserId: USER_ID,
      actorRole: 'superadmin',
      isImpersonating: true,
      impersonationSessionId: SESSION_ID,
      scopes: ['product:write'],
    },
  }, 200);

  assert.equal(event.eventType, 'impersonated.write');
  assert.equal(event.actorUserId, ADMIN_ID);
  assert.equal(event.subjectUserId, USER_ID);
  assert.equal(event.impersonationSessionId, SESSION_ID);
  assert.equal(event.resourceId, '507f191e810c19729de87009');
  assert.doesNotMatch(event.path, /token|must-not-appear/);
  assert.equal(event.outcome, 'success');
});

test('audits direct admin mutations and ignores regular user writes', () => {
  const direct = buildAuditEvent({
    method: 'DELETE',
    path: '/api/users/507f191e810c19729de86003',
    params: { id: USER_ID },
    auth: {
      actorUserId: ADMIN_ID,
      subjectUserId: ADMIN_ID,
      actorRole: 'superadmin',
      isImpersonating: false,
    },
  }, 409);
  assert.equal(direct.eventType, 'admin.write');
  assert.equal(direct.impersonationSessionId, undefined);
  assert.equal(direct.outcome, 'denied');

  const regular = buildAuditEvent({
    method: 'PATCH',
    path: '/api/users/me',
    auth: {
      actorUserId: USER_ID,
      subjectUserId: USER_ID,
      actorRole: 'user',
      isImpersonating: false,
    },
  }, 200);
  assert.equal(regular, null);
});
