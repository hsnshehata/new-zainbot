'use strict';

// server/controllers/copilotController.js
// Authenticated HTTP handlers for Human-in-the-Loop Copilot drafts.
// Every query and mutation is strictly scoped to merchantUserId
// (req.auth?.subjectUserId || req.user.userId). Another merchant's draft
// always returns 404.

const copilotService = require('../services/copilotService');
const logger = require('../logger');

function resolveActorIds(req) {
  const merchantUserId = req.auth?.subjectUserId || req.user?.userId;
  const actorUserId = req.auth?.actorUserId || merchantUserId;
  return { merchantUserId, actorUserId };
}

function createCopilotController(deps = {}) {
  const service = deps.copilotService || copilotService;
  const log = deps.logger || logger;

  async function listDrafts(req, res) {
    try {
      const { merchantUserId } = resolveActorIds(req);
      const { botId, conversationId, limit } = req.query || {};
      const drafts = await service.listPendingDrafts({
        merchantUserId,
        botId: botId || null,
        conversationId: conversationId || null,
        limit,
      });
      return res.status(200).json({
        success: true,
        drafts,
        count: drafts.length,
      });
    } catch (err) {
      log.error('copilot_list_drafts_error', { err: err?.message || String(err) });
      return res.status(500).json({ success: false, message: 'تعذّر تحميل المسودات المعلّقة.' });
    }
  }

  async function sendDraft(req, res) {
    try {
      const { merchantUserId, actorUserId } = resolveActorIds(req);
      const { mode, content, editedReply } = req.body || {};

      // Support 1-tap send by default, and also accept mode:'edit' / editedReply
      let editText = null;
      if (mode === 'edit' || editedReply !== undefined) {
        editText = editedReply !== undefined ? editedReply : content;
      }

      const result = await service.approveAndSendDraft({
        draftId: req.params.id,
        merchantUserId,
        actorUserId,
        editedReply: editText,
        approvedVia: 'dashboard_inbox',
      });

      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          success: false,
          error: result.errorCode,
          code: result.errorCode,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        draft: result.draft,
        delivered: result.delivered,
        deliveredMessageId: result.deliveredMessageId,
      });
    } catch (err) {
      log.error('copilot_send_draft_error', { draftId: req.params.id, err: err?.message || String(err) });
      return res.status(500).json({ success: false, message: 'تعذّر إرسال المسودة.' });
    }
  }

  async function editAndSendDraft(req, res) {
    try {
      const { merchantUserId, actorUserId } = resolveActorIds(req);
      const body = req.body || {};
      const rawEdited = body.editedReply !== undefined ? body.editedReply : body.content;

      if (typeof rawEdited !== 'string' || !rawEdited.trim()) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EDITED_REPLY',
          code: 'INVALID_EDITED_REPLY',
          message: 'نص الرد المعدّل مطلوب.',
        });
      }

      const result = await service.approveAndSendDraft({
        draftId: req.params.id,
        merchantUserId,
        actorUserId,
        editedReply: rawEdited,
        approvedVia: 'dashboard_inbox',
      });

      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          success: false,
          error: result.errorCode,
          code: result.errorCode,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        draft: result.draft,
        delivered: result.delivered,
        deliveredMessageId: result.deliveredMessageId,
      });
    } catch (err) {
      log.error('copilot_edit_and_send_error', { draftId: req.params.id, err: err?.message || String(err) });
      return res.status(500).json({ success: false, message: 'تعذّر إرسال الرد المعدّل.' });
    }
  }

  async function discardDraft(req, res) {
    try {
      const { merchantUserId, actorUserId } = resolveActorIds(req);
      const result = await service.discardDraft({
        draftId: req.params.id,
        merchantUserId,
        actorUserId,
        approvedVia: 'dashboard_inbox',
      });

      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          success: false,
          error: result.errorCode,
          code: result.errorCode,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        draft: result.draft,
      });
    } catch (err) {
      log.error('copilot_discard_draft_error', { draftId: req.params.id, err: err?.message || String(err) });
      return res.status(500).json({ success: false, message: 'تعذّر تجاهل المسودة.' });
    }
  }

  async function regenerateDraft(req, res) {
    try {
      const { merchantUserId } = resolveActorIds(req);
      const result = await service.regenerateDraft({
        draftId: req.params.id,
        merchantUserId,
      });

      if (!result.ok) {
        return res.status(result.httpStatus || 400).json({
          success: false,
          error: result.errorCode,
          code: result.errorCode,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        draft: result.draft,
        supersededDraftId: result.supersededDraftId,
      });
    } catch (err) {
      log.error('copilot_regenerate_draft_error', { draftId: req.params.id, err: err?.message || String(err) });
      return res.status(500).json({ success: false, message: 'تعذّر إعادة توليد المسودة.' });
    }
  }

  return {
    listDrafts,
    sendDraft,
    editAndSendDraft,
    discardDraft,
    regenerateDraft,
  };
}

const defaultController = createCopilotController();

module.exports = defaultController;
module.exports.createCopilotController = createCopilotController;
