'use strict';

// server/routes/assistant.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const assistantController = require('../controllers/assistantController');

const router = express.Router();

router.use(authenticate);

// The chat endpoint fans out to AI providers; keep it tighter than the
// default account limiter so a runaway client cannot burn provider quota.
const assistantChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'تم تجاوز عدد الرسائل المسموح به مؤقتًا، حاول لاحقًا',
    error: 'AssistantRateLimit',
    retryAfter: 15 * 60,
  },
});

router.post('/chat', assistantChatLimiter, assistantController.chat);

router.get('/conversations', assistantController.listConversations);
router.get('/conversations/:id', assistantController.getConversation);
router.delete('/conversations/:id', assistantController.deleteConversation);

router.get('/reminders', assistantController.listReminders);
router.post('/reminders', assistantController.createReminder);
router.patch('/reminders/:id/complete', assistantController.completeReminder);
router.delete('/reminders/:id', assistantController.deleteReminder);

// Phase 3 merchant assistant settings, verified WhatsApp link-code issuance, and audit log
router.get('/settings', assistantController.getSettings);
router.patch('/settings', assistantController.updateSettings);
router.post('/whatsapp/link-code', assistantController.createWhatsappLinkCode);
router.delete('/whatsapp/link', assistantController.unlinkWhatsapp);
router.get('/audit', assistantController.listAudit);

// Phase 3 Slice 2: Explicit confirmation / rejection endpoints for pending write actions
router.post('/actions/:id/confirm', assistantController.confirmAction);
router.post('/actions/:id/reject', assistantController.rejectAction);

module.exports = router;
