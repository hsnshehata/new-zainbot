'use strict';

// server/services/assistantActionAuditService.js
// Sanitizes before/after state snapshots (reusing AuditEvent.redactAuditText)
// and appends immutable AssistantActionAudit records safely.

const AssistantActionAudit = require('../models/AssistantActionAudit');
const { sanitizeAuditSnapshot } = require('../models/AssistantActionAudit');
const { redactAuditText } = require('../models/AuditEvent');
const logger = require('../logger');

function sanitizeAuditPayload(entry = {}) {
  const merchantUserId = entry.merchantUserId;
  const actorUserId = entry.actorUserId || merchantUserId;

  return {
    eventType: entry.eventType,
    merchantUserId,
    actorUserId,
    botId: entry.botId || null,
    storeId: entry.storeId || null,
    channel: entry.channel,
    toolName: entry.toolName || '',
    pendingActionId: entry.pendingActionId || null,
    copilotDraftId: entry.copilotDraftId || null,
    targetModel: entry.targetModel || '',
    targetId: entry.targetId ? String(entry.targetId) : '',
    outcome: entry.outcome,
    beforeState: entry.beforeState === undefined ? null : sanitizeAuditSnapshot(entry.beforeState),
    afterState: entry.afterState === undefined ? null : sanitizeAuditSnapshot(entry.afterState),
    summary: redactAuditText(entry.summary || '').slice(0, 600),
    errorCode: String(entry.errorCode || '').replace(/[^A-Z0-9_.-]/gi, '').slice(0, 80),
    triggerMessageId: redactAuditText(entry.triggerMessageId || '').slice(0, 160),
    decisionMessageId: redactAuditText(entry.decisionMessageId || '').slice(0, 160),
    createdAt: entry.createdAt instanceof Date ? entry.createdAt : new Date(),
  };
}

function createAssistantActionAuditService(deps = {}) {
  const AuditModel = deps.AssistantActionAudit || AssistantActionAudit;
  const log = deps.logger || logger;

  async function recordAudit(entry, options = {}) {
    const payload = sanitizeAuditPayload(entry);
    try {
      return await AuditModel.create(payload);
    } catch (err) {
      log.error('assistant_action_audit_write_failed', {
        eventType: payload.eventType,
        outcome: payload.outcome,
        error: err?.message || String(err),
      });
      if (options.throwOnError) {
        throw err;
      }
      return null;
    }
  }

  async function listMerchantAudits({
    merchantUserId,
    page = 1,
    limit = 25,
    eventType = '',
    toolName = '',
    outcome = '',
  }) {
    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
    const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
    const filter = { merchantUserId };
    if (eventType) filter.eventType = eventType;
    if (toolName) filter.toolName = toolName;
    if (outcome) filter.outcome = outcome;

    const [items, total] = await Promise.all([
      AuditModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
      AuditModel.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }

  return {
    recordAudit,
    listMerchantAudits,
    sanitizeAuditPayload,
    sanitizeAuditSnapshot,
    redactAuditText,
  };
}

const defaultService = createAssistantActionAuditService();

module.exports = {
  createAssistantActionAuditService,
  recordAudit: defaultService.recordAudit,
  listMerchantAudits: defaultService.listMerchantAudits,
  sanitizeAuditPayload,
  sanitizeAuditSnapshot,
  redactAuditText,
};
