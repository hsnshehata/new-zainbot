const express = require('express');
const defaultAuthenticate = require('../middleware/authenticate');
const defaultLogger = require('../logger');
const AdminImpersonationSession = require('../models/AdminImpersonationSession');
const {
  ImpersonationError,
  createImpersonationService,
} = require('../services/impersonationService');

function directSuperadminOnly(req, res, next) {
  const auth = req.auth || {};
  const isDirectSuperadmin = (
    auth.actorRole === 'superadmin'
    && auth.isImpersonating !== true
    && String(auth.actorUserId || '') === String(auth.subjectUserId || '')
  );

  if (!isDirectSuperadmin) {
    return res.status(403).json({
      success: false,
      error: 'DIRECT_SUPERADMIN_REQUIRED',
      message: 'A direct superadmin session is required',
    });
  }

  return next();
}

function safeSession(session) {
  return {
    id: String(session._id),
    actorUserId: String(session.actorUserId),
    subjectUserId: String(session.subjectUserId),
    reason: session.reason,
    scopes: [...(session.scopes || [])],
    status: session.status,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    endedAt: session.endedAt || null,
    revokedAt: session.revokedAt || null,
  };
}

function safeSubject(subject) {
  return {
    id: String(subject._id || subject.userId),
    username: subject.username,
    role: subject.role,
    status: subject.status || 'active',
  };
}

function sendError(res, error, logger, requestId) {
  if (error instanceof ImpersonationError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.code,
      message: error.message,
    });
  }

  logger.error('admin_impersonation_request_failed', {
    requestId,
    error: error?.name || 'Error',
  });
  return res.status(500).json({
    success: false,
    error: 'IMPERSONATION_REQUEST_FAILED',
    message: 'The impersonation request could not be completed',
  });
}

function createAdminImpersonationRouter(options = {}) {
  const authenticate = options.authenticate || defaultAuthenticate;
  const service = options.service || createImpersonationService();
  const issueToken = options.issueToken;
  const logger = options.logger || defaultLogger;

  if (typeof issueToken !== 'function') {
    throw new TypeError('createAdminImpersonationRouter requires an issueToken callback');
  }

  const router = express.Router();
  router.use(authenticate, directSuperadminOnly);

  router.post('/sessions', async (req, res) => {
    const actorUserId = req.auth.actorUserId;
    let created;

    try {
      created = await service.createSession({
        actorUserId,
        subjectUserId: req.body?.subjectUserId,
        reason: req.body?.reason,
        scopes: req.body?.scopes,
        requestId: req.requestId,
      });

      let token;
      try {
        token = await issueToken({
          tokenType: 'impersonation',
          actor: created.actor,
          subject: created.subject,
          session: created.session,
          expiresAt: created.session.expiresAt,
        });
      } catch (_error) {
        await service.endSession({
          sessionId: created.session._id,
          actorUserId,
          requestId: req.requestId,
          forceRevoke: true,
          errorCode: 'TOKEN_ISSUANCE_FAILED',
        });
        throw new ImpersonationError(
          'IMPERSONATION_TOKEN_FAILED',
          'The impersonation token could not be issued',
          503
        );
      }

      if (typeof token !== 'string' || !token.trim()) {
        await service.endSession({
          sessionId: created.session._id,
          actorUserId,
          requestId: req.requestId,
          forceRevoke: true,
          errorCode: 'TOKEN_ISSUANCE_FAILED',
        });
        throw new ImpersonationError(
          'IMPERSONATION_TOKEN_FAILED',
          'The impersonation token could not be issued',
          503
        );
      }

      logger.info('admin_impersonation_started', {
        requestId: req.requestId,
        actorUserId,
        subjectUserId: String(created.subject._id || created.subject.userId),
        sessionId: String(created.session._id),
      });

      return res.status(201).json({
        success: true,
        data: {
          token,
          session: safeSession(created.session),
          subject: safeSubject(created.subject),
        },
      });
    } catch (error) {
      return sendError(res, error, logger, req.requestId);
    }
  });

  // List impersonation sessions (most recent first) with pagination and an
  // optional status filter. Read-only, direct superadmin only.
  router.get('/sessions', async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
      const status = String(req.query.status || '').trim();

      const query = {};
      if (['active', 'ended', 'revoked', 'expired'].includes(status)) {
        query.status = status;
      }

      const [total, sessions] = await Promise.all([
        AdminImpersonationSession.countDocuments(query),
        AdminImpersonationSession.find(query)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate('actorUserId', 'username role status')
          .populate('subjectUserId', 'username role status')
          .lean(),
      ]);

      return res.status(200).json({
        success: true,
        data: sessions.map((session) => ({
          ...safeSession(session),
          actor: session.actorUserId
            ? safeSubject(session.actorUserId)
            : null,
          subject: session.subjectUserId
            ? safeSubject(session.subjectUserId)
            : null,
        })),
        total,
        page,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      });
    } catch (error) {
      logger.error('admin_impersonation_list_failed', {
        requestId: req.requestId,
        error: error?.name || 'Error',
      });
      return res.status(500).json({
        success: false,
        error: 'IMPERSONATION_LIST_FAILED',
        message: 'The impersonation session list could not be loaded',
      });
    }
  });

  router.post('/sessions/:sessionId/end', async (req, res) => {
    try {
      const result = await service.endSession({
        sessionId: req.params.sessionId,
        actorUserId: req.auth.actorUserId,
        requestId: req.requestId,
      });

      logger.info('admin_impersonation_ended', {
        requestId: req.requestId,
        actorUserId: req.auth.actorUserId,
        sessionId: String(result.session._id),
        changed: result.changed,
      });

      return res.status(200).json({
        success: true,
        data: {
          session: safeSession(result.session),
          changed: result.changed,
        },
      });
    } catch (error) {
      return sendError(res, error, logger, req.requestId);
    }
  });

  return router;
}

module.exports = {
  directSuperadminOnly,
  createAdminImpersonationRouter,
};
