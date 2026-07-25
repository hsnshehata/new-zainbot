const AuditEvent = require('../models/AuditEvent');
const logger = require('../logger');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const RESOURCE_ID_PARAMS = [
  'id',
  'botId',
  'userId',
  'storeId',
  'orderId',
  'productId',
  'conversationId',
  'sessionId',
];

function cleanPath(value) {
  return String(value || '')
    .replace(/[?#].*$/, '')
    .replace(/[\r\n\t]/g, '')
    .slice(0, 300);
}

function inferResourceType(pathValue) {
  const segments = cleanPath(pathValue)
    .split('/')
    .filter(Boolean);
  const apiIndex = segments.indexOf('api');
  return (segments[apiIndex + 1] || segments[0] || 'unknown').slice(0, 80);
}

function inferResourceId(req) {
  for (const key of RESOURCE_ID_PARAMS) {
    const value = req.params?.[key];
    if (value) return String(value).slice(0, 128);
  }
  return '';
}

function buildAuditEvent(req, statusCode) {
  const auth = req.auth;
  if (!auth || !MUTATING_METHODS.has(req.method)) {
    return null;
  }

  const isImpersonating = Boolean(auth.isImpersonating);
  const isDirectAdmin = auth.actorRole === 'superadmin'
    && auth.actorUserId === auth.subjectUserId;
  if (!isImpersonating && !isDirectAdmin) {
    return null;
  }

  const pathValue = cleanPath(
    req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.path
  );
  const numericStatus = Number(statusCode) || 500;
  const outcome = numericStatus < 400
    ? 'success'
    : numericStatus < 500
      ? 'denied'
      : 'error';

  return {
    eventType: isImpersonating ? 'impersonated.write' : 'admin.write',
    actorUserId: auth.actorUserId,
    subjectUserId: auth.subjectUserId,
    impersonationSessionId: isImpersonating
      ? auth.impersonationSessionId
      : undefined,
    outcome,
    action: `${req.method.toLowerCase()}:${inferResourceType(pathValue)}`,
    resourceType: inferResourceType(pathValue),
    resourceId: inferResourceId(req),
    method: req.method,
    path: pathValue,
    statusCode: numericStatus,
    scopes: isImpersonating ? [...(auth.scopes || [])] : undefined,
    requestId: req.requestId || '',
    createdAt: new Date(),
  };
}

function auditMutation(req, res, next) {
  res.once('finish', () => {
    const event = buildAuditEvent(req, res.statusCode);
    if (!event) return;

    AuditEvent.create(event).catch((error) => {
      logger.error('audit_mutation_write_failed', {
        requestId: req.requestId,
        eventType: event.eventType,
        error: error.name,
      });
    });
  });
  next();
}

module.exports = auditMutation;
module.exports.buildAuditEvent = buildAuditEvent;
