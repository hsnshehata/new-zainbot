const User = require('../models/User');
const AdminImpersonationSession = require('../models/AdminImpersonationSession');
const AuditEvent = require('../models/AuditEvent');

const IMPERSONATION_TTL_MS = 15 * 60 * 1000;
const SESSION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

const SAFE_IMPERSONATION_SCOPES = Object.freeze([
  'product:read',
  'product:write',
  'channels:read',
  'channels:write',
  'conversations:read',
  'conversations:write',
  'analytics:read',
  'settings:read',
  'settings:write',
]);

const SAFE_SCOPE_SET = new Set(SAFE_IMPERSONATION_SCOPES);

class ImpersonationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'ImpersonationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeId(value) {
  const id = value?._id || value?.userId || value;
  return id === undefined || id === null ? '' : String(id);
}

function sanitizeReason(value) {
  if (typeof value !== 'string') {
    throw new ImpersonationError(
      'IMPERSONATION_REASON_REQUIRED',
      'A reason is required to start impersonation'
    );
  }

  const sanitized = value
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(authorization|api[_ -]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_JWT]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  if (sanitized.length < 3) {
    throw new ImpersonationError(
      'IMPERSONATION_REASON_REQUIRED',
      'A meaningful reason is required to start impersonation'
    );
  }

  return sanitized;
}

function normalizeScopes(scopes) {
  if (scopes === undefined || scopes === null) {
    return [...SAFE_IMPERSONATION_SCOPES];
  }

  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.length > SAFE_SCOPE_SET.size) {
    throw new ImpersonationError(
      'INVALID_IMPERSONATION_SCOPES',
      'At least one valid impersonation scope is required'
    );
  }

  const normalized = [...new Set(scopes.map((scope) => (
    typeof scope === 'string' ? scope.trim() : ''
  )))];

  if (
    normalized.some((scope) => !SAFE_SCOPE_SET.has(scope))
    || normalized.length === 0
  ) {
    throw new ImpersonationError(
      'INVALID_IMPERSONATION_SCOPES',
      'One or more impersonation scopes are not allowed'
    );
  }

  return normalized;
}

function toPlain(value, options = {}) {
  if (!value) {
    return value;
  }
  if (typeof value.toObject === 'function') {
    return value.toObject({ transform: false, ...options });
  }
  return { ...value };
}

function isAccountActive(user) {
  return Boolean(user) && (!user.status || user.status === 'active');
}

function createImpersonationService(options = {}) {
  const UserModel = options.UserModel || User;
  const SessionModel = options.SessionModel || AdminImpersonationSession;
  const AuditEventModel = options.AuditEventModel || AuditEvent;
  const now = options.now || (() => new Date());

  async function findUser(userId) {
    let query = UserModel.findById(userId);
    if (query && typeof query.select === 'function') {
      query = query.select('_id username role status +sessionVersion');
    }
    if (query && typeof query.lean === 'function') {
      query = query.lean();
    }
    return query;
  }

  async function findSession(sessionId) {
    let query = SessionModel.findById(sessionId);
    if (query && typeof query.select === 'function') {
      query = query.select('+actorSessionVersion +subjectSessionVersion');
    }
    if (query && typeof query.lean === 'function') {
      query = query.lean();
    }
    return query;
  }

  async function recordAudit({
    eventType,
    actorUserId,
    subjectUserId,
    sessionId,
    outcome,
    reason = '',
    scopes,
    errorCode = '',
    requestId = '',
    createdAt,
  }) {
    return AuditEventModel.create({
      eventType,
      actorUserId,
      subjectUserId,
      impersonationSessionId: sessionId,
      outcome,
      reason: reason ? sanitizeReason(reason) : '',
      scopes,
      errorCode: String(errorCode || '').slice(0, 80),
      requestId: String(requestId || '').slice(0, 128),
      createdAt: createdAt || now(),
    });
  }

  async function requireActiveSuperadmin(actorUserId) {
    const actor = await findUser(actorUserId);
    if (!actor || actor.status === 'deleted') {
      throw new ImpersonationError(
        'IMPERSONATION_ACTOR_NOT_FOUND',
        'The administrator account is unavailable',
        401
      );
    }
    if (!isAccountActive(actor)) {
      throw new ImpersonationError(
        'IMPERSONATION_ACTOR_NOT_ACTIVE',
        'The administrator account is not active',
        403
      );
    }
    if (actor.role !== 'superadmin') {
      throw new ImpersonationError(
        'IMPERSONATION_FORBIDDEN',
        'Only a superadmin can impersonate another user',
        403
      );
    }
    return actor;
  }

  async function createSession({
    actorUserId,
    subjectUserId,
    reason,
    scopes,
    requestId,
  }) {
    const normalizedActorId = normalizeId(actorUserId);
    const normalizedSubjectId = normalizeId(subjectUserId);

    if (!normalizedActorId) {
      throw new ImpersonationError(
        'IMPERSONATION_ACTOR_REQUIRED',
        'An administrator identity is required',
        401
      );
    }
    if (!normalizedSubjectId) {
      throw new ImpersonationError(
        'IMPERSONATION_SUBJECT_REQUIRED',
        'A target user is required'
      );
    }
    if (normalizedActorId === normalizedSubjectId) {
      throw new ImpersonationError(
        'IMPERSONATION_SELF_FORBIDDEN',
        'An administrator cannot impersonate their own account',
        409
      );
    }

    const cleanReason = sanitizeReason(reason);
    const cleanScopes = normalizeScopes(scopes);
    const actor = await requireActiveSuperadmin(normalizedActorId);
    const subject = await findUser(normalizedSubjectId);

    if (!subject || subject.status === 'deleted') {
      throw new ImpersonationError(
        'IMPERSONATION_SUBJECT_NOT_FOUND',
        'The target user is unavailable',
        404
      );
    }
    if (!isAccountActive(subject)) {
      throw new ImpersonationError(
        'IMPERSONATION_SUBJECT_NOT_ACTIVE',
        'The target user is not active',
        409
      );
    }

    const createdAt = now();
    const expiresAt = new Date(createdAt.getTime() + IMPERSONATION_TTL_MS);
    const purgeAt = new Date(expiresAt.getTime() + SESSION_RETENTION_MS);
    const session = await SessionModel.create({
      actorUserId: actor._id || normalizedActorId,
      subjectUserId: subject._id || normalizedSubjectId,
      reason: cleanReason,
      scopes: cleanScopes,
      status: 'active',
      actorSessionVersion: Number(actor.sessionVersion || 0),
      subjectSessionVersion: Number(subject.sessionVersion || 0),
      createdAt,
      expiresAt,
      endedAt: null,
      revokedAt: null,
      purgeAt,
    });
    const plainSession = toPlain(session);

    try {
      await recordAudit({
        eventType: 'impersonation.started',
        actorUserId: plainSession.actorUserId,
        subjectUserId: plainSession.subjectUserId,
        sessionId: plainSession._id,
        outcome: 'success',
        reason: cleanReason,
        scopes: cleanScopes,
        requestId,
        createdAt,
      });
    } catch (error) {
      await SessionModel.updateOne(
        { _id: plainSession._id, status: 'active' },
        { $set: { status: 'revoked', revokedAt: now() } }
      );
      throw new ImpersonationError(
        'IMPERSONATION_AUDIT_FAILED',
        'The impersonation session could not be audited',
        503
      );
    }

    return {
      actor: toPlain(actor),
      subject: toPlain(subject),
      session: plainSession,
    };
  }

  async function markExpired(session, eventTime, requestId = '') {
    await SessionModel.updateOne(
      { _id: session._id, status: 'active' },
      { $set: { status: 'expired' } }
    );
    try {
      await recordAudit({
        eventType: 'impersonation.expired',
        actorUserId: session.actorUserId,
        subjectUserId: session.subjectUserId,
        sessionId: session._id,
        outcome: 'success',
        reason: session.reason,
        scopes: session.scopes,
        requestId,
        createdAt: eventTime,
      });
    } catch (_error) {
      // Expiration must fail closed even when audit storage is unavailable.
    }
  }

  async function validateSession({
    sessionId,
    actorUserId,
    subjectUserId,
    requestId,
  }) {
    const session = await findSession(sessionId);
    if (!session) {
      throw new ImpersonationError(
        'IMPERSONATION_SESSION_NOT_FOUND',
        'The impersonation session is unavailable',
        401
      );
    }

    if (session.status !== 'active') {
      throw new ImpersonationError(
        'IMPERSONATION_SESSION_INACTIVE',
        'The impersonation session is no longer active',
        401
      );
    }

    const checkedAt = now();
    if (new Date(session.expiresAt).getTime() <= checkedAt.getTime()) {
      await markExpired(session, checkedAt, requestId);
      throw new ImpersonationError(
        'IMPERSONATION_SESSION_EXPIRED',
        'The impersonation session has expired',
        401
      );
    }

    if (
      normalizeId(session.actorUserId) !== normalizeId(actorUserId)
      || normalizeId(session.subjectUserId) !== normalizeId(subjectUserId)
    ) {
      throw new ImpersonationError(
        'IMPERSONATION_SESSION_MISMATCH',
        'The impersonation session does not match this identity',
        401
      );
    }

    const actor = await requireActiveSuperadmin(session.actorUserId);
    const subject = await findUser(session.subjectUserId);
    if (!subject || !isAccountActive(subject)) {
      throw new ImpersonationError(
        'IMPERSONATION_SUBJECT_NOT_ACTIVE',
        'The target user is no longer active',
        401
      );
    }

    if (
      Number(actor.sessionVersion || 0) !== Number(session.actorSessionVersion || 0)
      || Number(subject.sessionVersion || 0) !== Number(session.subjectSessionVersion || 0)
    ) {
      throw new ImpersonationError(
        'IMPERSONATION_SESSION_REVOKED',
        'An account session change revoked this impersonation session',
        401
      );
    }

    return {
      actor: toPlain(actor),
      subject: toPlain(subject),
      session: toPlain(session),
    };
  }

  async function endSession({
    sessionId,
    actorUserId,
    requestId,
    forceRevoke = false,
    errorCode = '',
  }) {
    const endingActor = await requireActiveSuperadmin(actorUserId);
    const session = await findSession(sessionId);

    if (!session) {
      throw new ImpersonationError(
        'IMPERSONATION_SESSION_NOT_FOUND',
        'The impersonation session is unavailable',
        404
      );
    }

    if (session.status !== 'active') {
      return { session: toPlain(session), changed: false };
    }

    const endedAt = now();
    if (new Date(session.expiresAt).getTime() <= endedAt.getTime()) {
      await markExpired(session, endedAt, requestId);
      return {
        session: { ...toPlain(session), status: 'expired' },
        changed: true,
      };
    }

    const isOwner = normalizeId(session.actorUserId) === normalizeId(endingActor);
    const status = forceRevoke || !isOwner ? 'revoked' : 'ended';
    const timestampField = status === 'revoked' ? 'revokedAt' : 'endedAt';
    const updatedSession = await SessionModel.findOneAndUpdate(
      { _id: session._id, status: 'active' },
      { $set: { status, [timestampField]: endedAt } },
      { new: true }
    );

    if (!updatedSession) {
      const latest = await findSession(session._id);
      return { session: toPlain(latest || session), changed: false };
    }

    await recordAudit({
      eventType: errorCode
        ? 'impersonation.token_issue_failed'
        : `impersonation.${status}`,
      actorUserId: endingActor._id || actorUserId,
      subjectUserId: session.subjectUserId,
      sessionId: session._id,
      outcome: errorCode ? 'error' : 'success',
      reason: session.reason,
      scopes: session.scopes,
      errorCode,
      requestId,
      createdAt: endedAt,
    });

    return { session: toPlain(updatedSession), changed: true };
  }

  return {
    createSession,
    validateSession,
    endSession,
  };
}

module.exports = {
  IMPERSONATION_TTL_MS,
  SESSION_RETENTION_MS,
  SAFE_IMPERSONATION_SCOPES,
  ImpersonationError,
  sanitizeReason,
  normalizeScopes,
  createImpersonationService,
};
