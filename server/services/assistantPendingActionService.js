'use strict';

// server/services/assistantPendingActionService.js
// Confirmation state machine for Merchant Assistant write tools:
//   propose -> atomic CAS confirm (pending -> executing -> executed|failed)
//   reject  -> atomic CAS (pending -> rejected)
//   expire  -> atomic CAS (pending -> expired)
//
// Hard guardrails:
// - PlatformSetting.assistantWriteToolsEnabled === true
// - User.status === 'active' AND User.assistantSettings.writeToolsEnabled === true
// - User.assistantSettings.allowedWriteTools[toolKey] === true
// Re-checked freshly from DB at execution time (TOCTOU guard).
// Every proposed/executed/rejected/expired/failed/denied_disabled transition
// is recorded in immutable AssistantActionAudit via assistantActionAuditService.

const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const PlatformSetting = require('../models/PlatformSetting');
const AssistantPendingAction = require('../models/AssistantPendingAction');
const platformSettingsService = require('./platformSettingsService');
const assistantActionAuditService = require('./assistantActionAuditService');
const assistantWriteTools = require('./assistantWriteTools');
const { normalizeArabicDigits } = require('./phoneNormalize');

const PENDING_ACTION_TTL_MS = 5 * 60 * 1000;

// Exact plan confirmation / rejection regexes (strict full-string anchored — NEVER substring)
const CONFIRM_REGEX = /^(نعم|ايوه|أيوه|ايوا|أيوة|اه|أه|موافق|تاكيد|تأكيد|اكد|أكد|نفذ|نفّذ|تمام\s*نفذ|yes|confirm|approve)(\s+#?[a-z0-9]{4})?$/i;
const REJECT_REGEX = /^(لا|لأ|الغاء|إلغاء|الغي|ألغي|كنسل|تراجع|مش\s*عايز|ارفض|no|cancel|reject|stop)(\s+#?[a-z0-9]{4})?$/i;

function normalizeForDecision(raw) {
  const digits = normalizeArabicDigits(String(raw ?? '')).trim();
  const arabicNormalized = digits
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه');
  return { rawDigits: digits, arabicNormalized };
}

function extractActionCode(codeGroup) {
  if (!codeGroup) return null;
  const cleaned = String(codeGroup).trim().replace(/^#/, '');
  return cleaned ? cleaned.toLowerCase() : null;
}

/**
 * Strict full-string Arabic/English confirm/reject parser.
 * Never matches substrings or prose containing extra words.
 * If `expectedActionCode` is provided and the message includes a 4-char code
 * that does NOT match, returns `{ decision: 'code_mismatch', ... }`.
 */
function parseDecisionMessage(text, expectedActionCode = null) {
  const { rawDigits, arabicNormalized } = normalizeForDecision(text);
  if (!rawDigits) {
    return { decision: 'ambiguous', actionCode: null };
  }

  let matchedDecision = null;
  let code = null;

  const confirmMatch = rawDigits.match(CONFIRM_REGEX) || arabicNormalized.match(CONFIRM_REGEX);
  if (confirmMatch) {
    matchedDecision = 'confirm';
    code = extractActionCode(confirmMatch[2]);
  } else {
    const rejectMatch = rawDigits.match(REJECT_REGEX) || arabicNormalized.match(REJECT_REGEX);
    if (rejectMatch) {
      matchedDecision = 'reject';
      code = extractActionCode(rejectMatch[2]);
    }
  }

  if (!matchedDecision) {
    return { decision: 'ambiguous', actionCode: null };
  }

  if (code && expectedActionCode && code !== String(expectedActionCode).trim().toLowerCase()) {
    return {
      decision: 'code_mismatch',
      attemptedDecision: matchedDecision,
      actionCode: code,
    };
  }

  return {
    decision: matchedDecision,
    actionCode: code,
  };
}

function generateActionCode() {
  return String(crypto.randomInt(1000, 10000));
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

async function runQuery(queryLike, selectFields) {
  let cursor = queryLike;
  if (cursor && typeof cursor.select === 'function' && selectFields) {
    cursor = cursor.select(selectFields);
  }
  if (cursor && typeof cursor.lean === 'function') {
    cursor = cursor.lean();
  }
  return cursor;
}

function createAssistantPendingActionService(deps = {}) {
  const PendingActionModel = deps.AssistantPendingAction || AssistantPendingAction;
  const UserModel = deps.User || User;
  const PlatformSettingModel = deps.PlatformSetting || PlatformSetting;
  const writeTools = deps.writeTools || assistantWriteTools;
  const auditService = deps.auditService || assistantActionAuditService;
  const ttlMs = Number.isFinite(deps.ttlMs) && deps.ttlMs > 0 ? deps.ttlMs : PENDING_ACTION_TTL_MS;
  const codeGenerator = deps.generateActionCode || generateActionCode;

  const readPlatformWriteToolsEnabled = deps.isPlatformWriteToolsEnabled || (async ({ fresh = false } = {}) => {
    try {
      if (fresh) {
        const doc = await PlatformSettingModel.getConfig();
        return Boolean(doc?.assistantWriteToolsEnabled);
      }
      return Boolean(await platformSettingsService.isAssistantWriteToolsEnabled());
    } catch {
      return false;
    }
  });

  async function checkWriteToolPermission({ merchantUserId, toolName, fresh = false }) {
    const settingKey = assistantWriteTools.TOOL_TO_SETTING_KEY[toolName];
    if (!settingKey) {
      return {
        allowed: false,
        reasonCode: 'UNKNOWN_TOOL',
        message: 'الأداة المطلوبة غير معروفة.',
      };
    }

    const platformEnabled = await readPlatformWriteToolsEnabled({ fresh });
    if (!platformEnabled) {
      return {
        allowed: false,
        reasonCode: 'PLATFORM_WRITE_TOOLS_DISABLED',
        message: 'أدوات التعديل عبر المساعد غير مفعّلة حاليًا على مستوى المنصة.',
      };
    }

    const user = await runQuery(
      UserModel.findById(merchantUserId),
      '_id status assistantSettings'
    );
    if (!user || user.status !== 'active') {
      return {
        allowed: false,
        reasonCode: 'USER_INACTIVE',
        message: 'حساب التاجر غير نشط — لا يمكن تنفيذ أدوات التعديل.',
      };
    }

    const settings = user.assistantSettings || {};
    if (settings.writeToolsEnabled !== true) {
      return {
        allowed: false,
        reasonCode: 'MERCHANT_WRITE_TOOLS_DISABLED',
        message: 'أدوات التعديل مغلقة افتراضيًا لحماية حسابك. فعّلها أولًا من إعدادات مساعد زين في لوحة التحكم.',
      };
    }

    const allowedTools = settings.allowedWriteTools || {};
    if (allowedTools[settingKey] !== true) {
      return {
        allowed: false,
        reasonCode: 'TOOL_DISABLED',
        message: 'هذه الأداة غير مفعّلة في إعدادات مساعد زين. فعّلها أولًا من لوحة التحكم.',
      };
    }

    return { allowed: true, user };
  }

  async function proposeAction({
    merchantUserId,
    actorUserId,
    channel,
    toolName,
    args,
    conversationId = null,
    senderJid = '',
    proposalMessageId = '',
    idempotencyKey = '',
    now = new Date(),
  }) {
    const actor = actorUserId || merchantUserId;

    const permission = await checkWriteToolPermission({
      merchantUserId,
      toolName,
      fresh: false,
    });
    if (!permission.allowed) {
      await auditService.recordAudit({
        eventType: 'write_tool.denied_disabled',
        merchantUserId,
        actorUserId: actor,
        channel,
        toolName,
        targetModel: assistantWriteTools.TOOL_TARGET_MODELS[toolName] || '',
        outcome: 'denied',
        beforeState: null,
        afterState: null,
        summary: permission.message,
        errorCode: permission.reasonCode,
        triggerMessageId: proposalMessageId,
      });
      return {
        ok: false,
        denied: true,
        errorCode: permission.reasonCode,
        message: permission.message,
      };
    }

    const prepared = await writeTools.prepareAction({
      merchantUserId,
      toolName,
      args,
      user: permission.user,
    });

    if (!prepared.ok) {
      return {
        ok: false,
        needsClarification: Boolean(prepared.needsClarification),
        errorCode: prepared.errorCode || 'PREPARE_FAILED',
        candidates: prepared.candidates || [],
        message: prepared.message,
      };
    }

    const actionCode = String(codeGenerator());
    const expiresAt = new Date(now.getTime() + ttlMs);
    const summaryText = assistantWriteTools.buildConfirmationCard({
      toolName,
      actionCode,
      verifiedSummary: prepared.verifiedSummary,
      ttlMinutes: Math.max(1, Math.round(ttlMs / 60000)),
    });

    const pendingDoc = await PendingActionModel.create({
      actionCode,
      merchantUserId,
      botId: prepared.botId || null,
      storeId: prepared.storeId || null,
      channel,
      senderJid: String(senderJid || ''),
      conversationId: conversationId || null,
      toolName,
      status: 'pending',
      proposedPayload: prepared.normalizedPayload,
      beforeSnapshot: prepared.beforeSnapshot,
      summaryText,
      idempotencyKey: idempotencyKey || crypto.randomUUID(),
      proposalMessageId: String(proposalMessageId || ''),
      expiresAt,
    });

    await auditService.recordAudit({
      eventType: 'write_tool.proposed',
      merchantUserId,
      actorUserId: actor,
      botId: pendingDoc.botId,
      storeId: pendingDoc.storeId,
      channel,
      toolName,
      pendingActionId: pendingDoc._id,
      targetModel: prepared.targetModel || assistantWriteTools.TOOL_TARGET_MODELS[toolName] || '',
      targetId: prepared.targetId || '',
      outcome: 'proposed',
      beforeState: prepared.beforeSnapshot,
      afterState: null,
      summary: summaryText,
      triggerMessageId: proposalMessageId,
    });

    return {
      ok: true,
      pendingAction: pendingDoc,
      summaryText,
    };
  }

  async function expireSinglePendingAction({ pendingActionId, merchantUserId, now, channel = 'system' }) {
    const filter = {
      _id: pendingActionId,
      status: 'pending',
      expiresAt: { $lte: now },
    };
    if (merchantUserId) {
      filter.merchantUserId = merchantUserId;
    }

    const expiredDoc = await PendingActionModel.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'expired',
          decidedAt: now,
          errorCode: 'EXPIRED',
        },
      },
      { new: true }
    );

    if (expiredDoc) {
      await auditService.recordAudit({
        eventType: 'write_tool.expired',
        merchantUserId: expiredDoc.merchantUserId,
        actorUserId: expiredDoc.merchantUserId,
        botId: expiredDoc.botId,
        storeId: expiredDoc.storeId,
        channel,
        toolName: expiredDoc.toolName,
        pendingActionId: expiredDoc._id,
        targetModel: assistantWriteTools.TOOL_TARGET_MODELS[expiredDoc.toolName] || '',
        outcome: 'expired',
        beforeState: expiredDoc.beforeSnapshot,
        afterState: null,
        summary: 'انتهت مهلة تأكيد الإجراء المقترح ولم يُنفّذ شيء.',
        errorCode: 'EXPIRED',
        triggerMessageId: expiredDoc.proposalMessageId,
      });
    }

    return expiredDoc;
  }

  async function confirmAction({
    pendingActionId,
    merchantUserId,
    actorUserId,
    channel,
    decisionMessageId = '',
    actionCode = null,
    now = new Date(),
  }) {
    const actor = actorUserId || merchantUserId;

    if (!isValidObjectId(pendingActionId) || !isValidObjectId(merchantUserId)) {
      return {
        ok: false,
        status: 'not_found',
        errorCode: 'PENDING_ACTION_NOT_FOUND',
        message: 'الإجراء المطلوب غير موجود.',
      };
    }

    // If caller explicitly supplied an actionCode, verify before CAS so a wrong
    // code never mutates pending state.
    if (actionCode) {
      const existingCheck = await runQuery(
        PendingActionModel.findOne({ _id: pendingActionId, merchantUserId }),
        '_id actionCode status'
      );
      if (!existingCheck) {
        return {
          ok: false,
          status: 'not_found',
          errorCode: 'PENDING_ACTION_NOT_FOUND',
          message: 'الإجراء المطلوب غير موجود.',
        };
      }
      if (String(existingCheck.actionCode || '').toLowerCase() !== String(actionCode).trim().toLowerCase()) {
        return {
          ok: false,
          status: 'code_mismatch',
          errorCode: 'ACTION_CODE_MISMATCH',
          message: 'رمز التأكيد غير مطابق للإجراء المعلّق. لم يتم تنفيذ أي شيء.',
        };
      }
    }

    // Atomic CAS: pending -> executing (only if unexpired & owned by merchantUserId)
    const claimed = await PendingActionModel.findOneAndUpdate(
      {
        _id: pendingActionId,
        merchantUserId,
        status: 'pending',
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'executing',
          decidedAt: now,
          decisionMessageId: String(decisionMessageId || ''),
        },
      },
      { new: true }
    );

    if (!claimed) {
      const existing = await runQuery(
        PendingActionModel.findOne({ _id: pendingActionId, merchantUserId })
      );
      if (!existing) {
        return {
          ok: false,
          status: 'not_found',
          errorCode: 'PENDING_ACTION_NOT_FOUND',
          message: 'الإجراء المطلوب غير موجود.',
        };
      }

      if (existing.status === 'pending' && new Date(existing.expiresAt) <= now) {
        await expireSinglePendingAction({
          pendingActionId: existing._id,
          merchantUserId,
          now,
          channel: channel || existing.channel || 'system',
        });
        return {
          ok: false,
          status: 'expired',
          errorCode: 'PENDING_ACTION_EXPIRED',
          message: 'انتهت صلاحية الإجراء المقترح ولم يُنفّذ شيء.',
        };
      }

      if (existing.status === 'executed') {
        return {
          ok: true,
          alreadyExecuted: true,
          status: 'executed',
          pendingAction: existing,
          executionResult: existing.executionResult,
          message: existing.executionResult?.receiptText || 'تم تنفيذ هذا الإجراء بالفعل.',
        };
      }

      if (existing.status === 'executing') {
        return {
          ok: false,
          alreadyExecuting: true,
          status: 'executing',
          errorCode: 'ACTION_ALREADY_EXECUTING',
          message: 'الإجراء قيد التنفيذ حاليًا، يرجى الانتظار لحظة.',
        };
      }

      if (existing.status === 'expired') {
        return {
          ok: false,
          status: 'expired',
          errorCode: 'PENDING_ACTION_EXPIRED',
          message: 'انتهت صلاحية الإجراء المقترح ولم يُنفّذ شيء.',
        };
      }

      if (existing.status === 'rejected') {
        return {
          ok: false,
          status: 'rejected',
          errorCode: 'ACTION_REJECTED',
          message: 'تم إلغاء هذا الإجراء مسبقًا.',
        };
      }

      return {
        ok: false,
        status: existing.status,
        errorCode: existing.errorCode || 'ACTION_FAILED',
        message: 'لا يمكن تأكيد هذا الإجراء في حالته الحالية.',
      };
    }

    const effectiveChannel = channel || claimed.channel;

    // TOCTOU Guard: freshly re-read PlatformSetting + User opt-in + specific tool toggle
    const permission = await checkWriteToolPermission({
      merchantUserId,
      toolName: claimed.toolName,
      fresh: true,
    });
    if (!permission.allowed) {
      await PendingActionModel.updateOne(
        { _id: claimed._id, status: 'executing' },
        {
          $set: {
            status: 'failed',
            errorCode: permission.reasonCode,
            executionResult: { abortedReason: permission.reasonCode },
          },
        }
      );

      await auditService.recordAudit({
        eventType: 'write_tool.denied_disabled',
        merchantUserId,
        actorUserId: actor,
        botId: claimed.botId,
        storeId: claimed.storeId,
        channel: effectiveChannel,
        toolName: claimed.toolName,
        pendingActionId: claimed._id,
        targetModel: assistantWriteTools.TOOL_TARGET_MODELS[claimed.toolName] || '',
        outcome: 'denied',
        beforeState: claimed.beforeSnapshot,
        afterState: null,
        summary: permission.message,
        errorCode: permission.reasonCode,
        triggerMessageId: claimed.proposalMessageId,
        decisionMessageId,
      });

      return {
        ok: false,
        denied: true,
        status: 'failed',
        errorCode: permission.reasonCode,
        message: permission.message,
      };
    }

    try {
      const execResult = await writeTools.executeAction({
        merchantUserId,
        actorUserId: actor,
        pendingAction: claimed,
      });

      const executedAt = new Date();
      const storedResult = {
        targetModel: execResult.targetModel,
        targetId: execResult.targetId,
        beforeState: execResult.beforeState,
        afterState: execResult.afterState,
        receiptText: execResult.receiptText,
      };

      const finalized = await PendingActionModel.findOneAndUpdate(
        { _id: claimed._id, status: 'executing' },
        {
          $set: {
            status: 'executed',
            executedAt,
            executionResult: storedResult,
            errorCode: '',
          },
        },
        { new: true }
      );

      await auditService.recordAudit({
        eventType: 'write_tool.executed',
        merchantUserId,
        actorUserId: actor,
        botId: execResult.botId || claimed.botId,
        storeId: execResult.storeId || claimed.storeId,
        channel: effectiveChannel,
        toolName: claimed.toolName,
        pendingActionId: claimed._id,
        targetModel: execResult.targetModel || assistantWriteTools.TOOL_TARGET_MODELS[claimed.toolName] || '',
        targetId: execResult.targetId || '',
        outcome: 'success',
        beforeState: execResult.beforeState,
        afterState: execResult.afterState,
        summary: execResult.receiptText,
        triggerMessageId: claimed.proposalMessageId,
        decisionMessageId,
      });

      return {
        ok: true,
        alreadyExecuted: false,
        status: 'executed',
        pendingAction: finalized || claimed,
        executionResult: storedResult,
        message: execResult.receiptText,
      };
    } catch (err) {
      const errorCode = String(err?.code || 'EXECUTION_FAILED').slice(0, 80);
      const userMessage = err?.userMessage || 'تعذّر تنفيذ الإجراء. لم يتم إكمال التعديل.';

      await PendingActionModel.updateOne(
        { _id: claimed._id, status: 'executing' },
        {
          $set: {
            status: 'failed',
            errorCode,
            executionResult: { errorCode },
          },
        }
      );

      await auditService.recordAudit({
        eventType: 'write_tool.failed',
        merchantUserId,
        actorUserId: actor,
        botId: claimed.botId,
        storeId: claimed.storeId,
        channel: effectiveChannel,
        toolName: claimed.toolName,
        pendingActionId: claimed._id,
        targetModel: assistantWriteTools.TOOL_TARGET_MODELS[claimed.toolName] || '',
        outcome: 'error',
        beforeState: err?.beforeState || claimed.beforeSnapshot,
        afterState: null,
        summary: userMessage,
        errorCode,
        triggerMessageId: claimed.proposalMessageId,
        decisionMessageId,
      });

      return {
        ok: false,
        status: 'failed',
        errorCode,
        message: userMessage,
      };
    }
  }

  async function rejectAction({
    pendingActionId,
    merchantUserId,
    actorUserId,
    channel,
    decisionMessageId = '',
    now = new Date(),
  }) {
    const actor = actorUserId || merchantUserId;

    if (!isValidObjectId(pendingActionId) || !isValidObjectId(merchantUserId)) {
      return {
        ok: false,
        status: 'not_found',
        errorCode: 'PENDING_ACTION_NOT_FOUND',
        message: 'الإجراء المطلوب غير موجود.',
      };
    }

    const rejected = await PendingActionModel.findOneAndUpdate(
      {
        _id: pendingActionId,
        merchantUserId,
        status: 'pending',
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'rejected',
          decidedAt: now,
          decisionMessageId: String(decisionMessageId || ''),
        },
      },
      { new: true }
    );

    if (rejected) {
      await auditService.recordAudit({
        eventType: 'write_tool.rejected',
        merchantUserId,
        actorUserId: actor,
        botId: rejected.botId,
        storeId: rejected.storeId,
        channel: channel || rejected.channel,
        toolName: rejected.toolName,
        pendingActionId: rejected._id,
        targetModel: assistantWriteTools.TOOL_TARGET_MODELS[rejected.toolName] || '',
        outcome: 'rejected',
        beforeState: rejected.beforeSnapshot,
        afterState: null,
        summary: 'تم إلغاء الإجراء بناءً على طلب التاجر.',
        triggerMessageId: rejected.proposalMessageId,
        decisionMessageId,
      });

      return {
        ok: true,
        alreadyRejected: false,
        status: 'rejected',
        pendingAction: rejected,
        message: 'تم إلغاء الإجراء ولم يتم إجراء أي تعديل.',
      };
    }

    const existing = await runQuery(
      PendingActionModel.findOne({ _id: pendingActionId, merchantUserId })
    );
    if (!existing) {
      return {
        ok: false,
        status: 'not_found',
        errorCode: 'PENDING_ACTION_NOT_FOUND',
        message: 'الإجراء المطلوب غير موجود.',
      };
    }

    if (existing.status === 'pending' && new Date(existing.expiresAt) <= now) {
      await expireSinglePendingAction({
        pendingActionId: existing._id,
        merchantUserId,
        now,
        channel: channel || existing.channel || 'system',
      });
      return {
        ok: false,
        status: 'expired',
        errorCode: 'PENDING_ACTION_EXPIRED',
        message: 'انتهت صلاحية الإجراء المقترح بالفعل ولم يُنفّذ شيء.',
      };
    }

    if (existing.status === 'rejected') {
      return {
        ok: true,
        alreadyRejected: true,
        status: 'rejected',
        pendingAction: existing,
        message: 'تم إلغاء هذا الإجراء بالفعل.',
      };
    }

    return {
      ok: false,
      status: existing.status,
      errorCode: `ACTION_${String(existing.status || 'conflict').toUpperCase()}`,
      message: 'لا يمكن إلغاء هذا الإجراء في حالته الحالية.',
    };
  }

  async function expireStaleActions({ now = new Date(), limit = 100 } = {}) {
    let expired = 0;
    while (expired < limit) {
      const doc = await PendingActionModel.findOneAndUpdate(
        {
          status: 'pending',
          expiresAt: { $lte: now },
        },
        {
          $set: {
            status: 'expired',
            decidedAt: now,
            errorCode: 'EXPIRED',
          },
        },
        {
          sort: { expiresAt: 1 },
          new: true,
        }
      );

      if (!doc) break;
      expired += 1;

      await auditService.recordAudit({
        eventType: 'write_tool.expired',
        merchantUserId: doc.merchantUserId,
        actorUserId: doc.merchantUserId,
        botId: doc.botId,
        storeId: doc.storeId,
        channel: 'system',
        toolName: doc.toolName,
        pendingActionId: doc._id,
        targetModel: assistantWriteTools.TOOL_TARGET_MODELS[doc.toolName] || '',
        outcome: 'expired',
        beforeState: doc.beforeSnapshot,
        afterState: null,
        summary: 'انتهت مهلة تأكيد الإجراء تلقائيًا دون تنفيذ.',
        errorCode: 'EXPIRED',
        triggerMessageId: doc.proposalMessageId,
      });
    }

    return { expired };
  }

  async function findActivePendingAction({
    merchantUserId,
    channel,
    conversationId = null,
    now = new Date(),
  }) {
    const filter = {
      merchantUserId,
      channel,
      status: 'pending',
    };
    if (conversationId) {
      filter.conversationId = conversationId;
    }

    let query = PendingActionModel.findOne(filter);
    if (query && typeof query.sort === 'function') {
      query = query.sort({ createdAt: -1 });
    }
    const pending = await runQuery(query);
    if (!pending) {
      return { pendingAction: null, expiredAction: null };
    }

    if (new Date(pending.expiresAt) <= now) {
      const expiredDoc = await expireSinglePendingAction({
        pendingActionId: pending._id,
        merchantUserId,
        now,
        channel,
      });
      return { pendingAction: null, expiredAction: expiredDoc || pending };
    }

    return { pendingAction: pending, expiredAction: null };
  }

  return {
    checkWriteToolPermission,
    proposeAction,
    confirmAction,
    rejectAction,
    expireStaleActions,
    findActivePendingAction,
    parseDecisionMessage,
    PENDING_ACTION_TTL_MS,
  };
}

const defaultService = createAssistantPendingActionService();

module.exports = {
  createAssistantPendingActionService,
  checkWriteToolPermission: defaultService.checkWriteToolPermission,
  proposeAction: defaultService.proposeAction,
  confirmAction: defaultService.confirmAction,
  rejectAction: defaultService.rejectAction,
  expireStaleActions: defaultService.expireStaleActions,
  findActivePendingAction: defaultService.findActivePendingAction,
  parseDecisionMessage,
  CONFIRM_REGEX,
  REJECT_REGEX,
  PENDING_ACTION_TTL_MS,
};
