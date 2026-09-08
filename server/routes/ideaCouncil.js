'use strict';

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const rateLimit = require('express-rate-limit');
const ideaCouncilController = require('../controllers/ideaCouncilController');

// Dedicated rate limiter for idea council endpoints (max 100 requests per 15 min per user)
const ideaCouncilLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests to Idea Council, please try again later',
  },
});

// All routes are protected by authenticate and rate limiter
router.use(authenticate);
router.use(ideaCouncilLimiter);

// 1. Quota & Usage
router.get('/usage', ideaCouncilController.getUsage);

// 2. Draft aliases
router.post('/draft', ideaCouncilController.createIdea);
router.post('/drafts', ideaCouncilController.createIdea);
router.get('/draft/:ideaId', ideaCouncilController.getIdeaById);
router.put('/draft/:ideaId', ideaCouncilController.updateIdea);
router.patch('/draft/:ideaId', ideaCouncilController.updateIdea);

// 3. Ideas CRUD & Lifecycle
router.get('/ideas', ideaCouncilController.getIdeas);
router.post('/ideas', ideaCouncilController.createIdea);
router.get('/ideas/:ideaId', ideaCouncilController.getIdeaById);
router.patch('/ideas/:ideaId', ideaCouncilController.updateIdea);
router.put('/ideas/:ideaId', ideaCouncilController.updateIdea);
router.put('/ideas/:ideaId/card', ideaCouncilController.updateIdea);
router.patch('/ideas/:ideaId/card', ideaCouncilController.updateIdea);
router.delete('/ideas/:ideaId', ideaCouncilController.deleteIdea);

// 4. Structuring & Evaluation Run (both evaluations and convene)
router.post('/ideas/:ideaId/structure', ideaCouncilController.structureIdea);
router.post('/ideas/:ideaId/evaluations', ideaCouncilController.startEvaluation);
router.post('/ideas/:ideaId/convene', ideaCouncilController.startEvaluation);

// 5. Run Progress & Interactivity
router.get('/runs/:runId', ideaCouncilController.getRunStatus);
router.post('/ideas/:ideaId/follow-ups', ideaCouncilController.startFollowup);
router.post('/ideas/:ideaId/follow-up', ideaCouncilController.startFollowup);
router.post('/runs/:runId/retry', ideaCouncilController.retryRun);
router.post('/runs/:runId/cancel', ideaCouncilController.cancelRun);

// 6. Truth Board, Feedback & Export
router.patch('/ideas/:ideaId/truth-items/:itemId', ideaCouncilController.updateTruthItem);
router.patch('/truth-items/:itemId', ideaCouncilController.updateTruthItem);
router.post('/ideas/:ideaId/feedback', ideaCouncilController.submitFeedback);
router.get('/ideas/:ideaId/export', ideaCouncilController.exportIdeaReport);

module.exports = router;
