const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');
const {
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
} = require('../utils/authTokens');

function normalizeId(value) {
  const id = value?._id || value?.userId || value;
  if (id === undefined || id === null || String(id).trim() === '') {
    throw new TypeError('A token identity is required');
  }
  return String(id);
}

function createImpersonationTokenCodec(options = {}) {
  const jwtLibrary = options.jwtLibrary || jwt;
  const getSecret = options.getSecret || getJwtSecret;
  const now = options.now || (() => new Date());

  function signImpersonationToken({ actor, subject, session, expiresAt }) {
    const actorUserId = normalizeId(actor);
    const subjectUserId = normalizeId(subject);
    const sessionId = normalizeId(session);

    if (actorUserId === subjectUserId) {
      throw new TypeError('An impersonation token requires different actor and subject identities');
    }
    if (actor.role !== 'superadmin') {
      throw new TypeError('An impersonation token requires a superadmin actor');
    }

    const absoluteExpiry = new Date(expiresAt || session.expiresAt);
    const expiresInSeconds = Math.floor(
      (absoluteExpiry.getTime() - now().getTime()) / 1000
    );
    if (!Number.isFinite(expiresInSeconds) || expiresInSeconds < 1) {
      throw new TypeError('The impersonation session expiry must be in the future');
    }

    return jwtLibrary.sign(
      {
        tokenType: 'impersonation',
        actorUserId,
        subjectUserId,
        actorRole: actor.role,
        subjectRole: subject.role,
        actorSessionVersion: Number(
          session.actorSessionVersion ?? actor.sessionVersion ?? 0
        ),
        subjectSessionVersion: Number(
          session.subjectSessionVersion ?? subject.sessionVersion ?? 0
        ),
        impersonationSessionId: sessionId,
        scopes: [...(session.scopes || [])],
      },
      getSecret(),
      {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: subjectUserId,
        jwtid: sessionId,
        expiresIn: expiresInSeconds,
      }
    );
  }

  function verifyImpersonationToken(token) {
    const payload = jwtLibrary.verify(token, getSecret(), {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (payload.tokenType !== 'impersonation') {
      throw new jwtLibrary.JsonWebTokenError('Unexpected token type');
    }
    if (
      !payload.actorUserId
      || !payload.subjectUserId
      || !payload.impersonationSessionId
      || payload.actorRole !== 'superadmin'
      || String(payload.actorUserId) === String(payload.subjectUserId)
      || String(payload.sub) !== String(payload.subjectUserId)
      || String(payload.jti) !== String(payload.impersonationSessionId)
      || !Array.isArray(payload.scopes)
    ) {
      throw new jwtLibrary.JsonWebTokenError('Invalid impersonation token claims');
    }

    return payload;
  }

  return {
    signImpersonationToken,
    verifyImpersonationToken,
  };
}

const defaultCodec = createImpersonationTokenCodec();

module.exports = {
  createImpersonationTokenCodec,
  signImpersonationToken: defaultCodec.signImpersonationToken,
  verifyImpersonationToken: defaultCodec.verifyImpersonationToken,
};
