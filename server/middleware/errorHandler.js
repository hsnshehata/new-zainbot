const logger = require('../logger');
const path = require('path');

const GENERIC_MESSAGE = 'حدث خطأ غير متوقع';

module.exports = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const traceId = (req && req.requestId) || `${Date.now()}`;

  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || GENERIC_MESSAGE;

  // Operational client errors keep stable, mappable codes.
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
  }
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'BAD_ID_FORMAT';
  }

  // Unexpected failures (no explicit status) never leak exception strings
  // or driver internals to the client; details stay in server logs only.
  const unexpected = statusCode >= 500 && !(err.statusCode || err.status);
  if (unexpected) {
    message = GENERIC_MESSAGE;
    code = 'INTERNAL_ERROR';
  }

  // Additive `success` flag: existing { message, code, traceId } readers
  // are unaffected.
  const responsePayload = {
    success: false,
    message,
    code,
    traceId,
  };

  logger.error('unhandled_error', {
    traceId,
    code,
    statusCode,
    err: err.message,
    stack: err.stack,
    path: req && req.originalUrl,
    method: req && req.method,
  });

  // Non-API 404 keeps serving the HTML page — untouched by this contract.
  if (statusCode === 404 && req && req.originalUrl && !req.originalUrl.startsWith('/api/')) {
    return res.status(404).sendFile(path.join(__dirname, '..', '..', 'public', '404.html'));
  }

  res.status(statusCode).json(responsePayload);
};
