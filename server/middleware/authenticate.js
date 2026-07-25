const User = require('../models/User');
const logger = require('../logger');
const { verifyAccessToken } = require('../utils/authTokens');
const {
  verifyImpersonationToken,
} = require('../services/impersonationTokenService');
const {
  createImpersonationService,
} = require('../services/impersonationService');

const impersonationService = createImpersonationService();

function readBearerToken(req) {
  const authorization = req.get('authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

module.exports = async function authenticate(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'AUTH_REQUIRED',
      message: 'Authentication required',
    });
  }

  try {
    let decoded;
    let tokenType;
    try {
      decoded = verifyAccessToken(token);
      tokenType = 'access';
    } catch (_accessError) {
      decoded = verifyImpersonationToken(token);
      tokenType = 'impersonation';
    }

    if (tokenType === 'impersonation') {
      const validated = await impersonationService.validateSession({
        sessionId: decoded.impersonationSessionId,
        actorUserId: decoded.actorUserId,
        subjectUserId: decoded.subjectUserId,
        requestId: req.requestId,
      });
      const actorUserId = String(validated.actor._id);
      const subjectUserId = String(validated.subject._id);
      req.user = {
        userId: subjectUserId,
        role: validated.subject.role,
        username: validated.subject.username,
        sessionVersion: Number(validated.subject.sessionVersion || 0),
      };
      req.auth = {
        actorUserId,
        subjectUserId,
        actorRole: validated.actor.role,
        subjectRole: validated.subject.role,
        isImpersonating: true,
        impersonationSessionId: String(validated.session._id),
        scopes: [...(validated.session.scopes || [])],
        tokenType,
      };
      return next();
    }

    const userId = decoded.sub || decoded.userId;
    const user = await User.findById(userId)
      .select('_id username role status isVerified +sessionVersion')
      .lean();

    if (!user || user.status === 'deleted') {
      return res.status(401).json({
        success: false,
        error: 'SESSION_USER_NOT_FOUND',
        message: 'This session is no longer valid',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_SUSPENDED',
        message: 'This account is suspended',
      });
    }

    if (Number(decoded.sessionVersion || 0) !== Number(user.sessionVersion || 0)) {
      return res.status(401).json({
        success: false,
        error: 'SESSION_REVOKED',
        message: 'This session has been revoked',
      });
    }

    const normalizedUser = {
      userId: String(user._id),
      role: user.role,
      username: user.username,
      sessionVersion: Number(user.sessionVersion || 0),
    };

    req.user = normalizedUser;
    req.auth = {
      actorUserId: normalizedUser.userId,
      subjectUserId: normalizedUser.userId,
      actorRole: normalizedUser.role,
      subjectRole: normalizedUser.role,
      isImpersonating: false,
      impersonationSessionId: null,
      scopes: [],
      tokenType,
    };
    return next();
  } catch (error) {
    logger.warn('auth_rejected', {
      requestId: req.requestId,
      error: error.code || error.name,
    });

    return res.status(401).json({
      success: false,
      error: 'INVALID_SESSION',
      message: 'This session is invalid or expired',
    });
  }
};

module.exports.readBearerToken = readBearerToken;
