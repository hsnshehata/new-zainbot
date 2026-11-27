'use strict';

// server/routes/copilot.js
// Authenticated REST endpoints for Human-in-the-Loop Copilot drafts.

const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const copilotController = require('../controllers/copilotController');

const regenerateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: 'COPILOT_REGENERATE_RATE_LIMIT',
    message: 'تم تجاوز عدد محاولات إعادة التوليد مؤقتًا، حاول بعد دقيقة.',
  },
});

function createCopilotRouter(deps = {}) {
  const router = express.Router();
  const controller = deps.controller || copilotController;
  const authMiddleware = deps.authenticate || authenticate;

  router.use(authMiddleware);

  router.get('/drafts', controller.listDrafts);
  router.post('/drafts/:id/send', controller.sendDraft);
  router.post('/drafts/:id/edit-and-send', controller.editAndSendDraft);
  router.post('/drafts/:id/discard', controller.discardDraft);
  router.post('/drafts/:id/regenerate', regenerateLimiter, controller.regenerateDraft);

  return router;
}

const defaultRouter = createCopilotRouter();

module.exports = defaultRouter;
module.exports.createCopilotRouter = createCopilotRouter;
