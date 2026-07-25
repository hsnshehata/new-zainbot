const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');

const JWT_ISSUER = 'zainbot';
const JWT_AUDIENCE = 'zainbot-web';
const JWT_ALGORITHM = 'HS256';

function normalizeUserId(userOrId) {
  const value = userOrId?._id || userOrId?.userId || userOrId;
  if (!value) {
    throw new Error('A user id is required to issue a token');
  }
  return String(value);
}

function signAccessToken(user, options = {}) {
  const userId = normalizeUserId(user);
  const sessionVersion = Number(user.sessionVersion || 0);

  return jwt.sign(
    {
      userId,
      role: user.role,
      username: user.username,
      sessionVersion,
      tokenType: 'access',
    },
    getJwtSecret(),
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: userId,
      expiresIn: options.expiresIn || process.env.JWT_ACCESS_TTL || '12h',
    }
  );
}

function verifyAccessToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (payload.tokenType !== 'access') {
    throw new jwt.JsonWebTokenError('Unexpected token type');
  }

  return payload;
}

function signEmailVerificationToken(userId, botName) {
  const subject = normalizeUserId(userId);
  return jwt.sign(
    {
      userId: subject,
      botName,
      tokenType: 'email_verification',
    },
    getJwtSecret(),
    {
      algorithm: JWT_ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject,
      expiresIn: '1h',
    }
  );
}

function verifyEmailVerificationToken(token) {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: [JWT_ALGORITHM],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });

  if (payload.tokenType !== 'email_verification') {
    throw new jwt.JsonWebTokenError('Unexpected token type');
  }

  return payload;
}

module.exports = {
  JWT_ISSUER,
  JWT_AUDIENCE,
  JWT_ALGORITHM,
  signAccessToken,
  verifyAccessToken,
  signEmailVerificationToken,
  verifyEmailVerificationToken,
};
