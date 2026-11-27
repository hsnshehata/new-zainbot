'use strict';

// server/services/platformMerchantAssistantRouter.js
// Verified-merchant router for ZainBot Main (Platform WhatsApp).
//
// Hooked inside platformWhatsappSession.js handleIncomingMessage BEFORE
// botEngine.processMessage so that:
//   1. Non-merchant visitors & unverified phones pass through untouched
//      ({ handled: false }) with ZERO behavior change.
//   2. One-time dashboard-issued LINK-XXXXXX codes bind the sender's verified
//      phone (including @lid resolution via message.getContact().number, fail
//      closed when unresolvable) to User.assistantSettings.verifiedWhatsappPhone,
//      enforcing the unique partial index and expiry.
//   3. Verified active merchants get the Merchant Assistant brain:
//      - Active pending action interception using strict Arabic/English
//        confirm/reject regexes (Slice 2 assistantPendingActionService).
//      - Write-intent detection & proposal (reusing Slice 2 detectWriteToolIntent
//        and assistantPendingActionService.proposeAction; all guardrails stay
//        authoritative in Slice 2).
//      - Read-only fallback to assistantService.answer.
//   4. messageId deduplication (in-memory TTL + persistent pending/audit check)
//      guarantees replayed WhatsApp messages never re-execute or re-propose.
//   5. All link/bind/reject/confirm/execute events are audited via
//      assistantActionAuditService.

const crypto = require('crypto');
const mongoose = require('mongoose');

const User = require('../models/User');
const Bot = require('../models/Bot');
const Store = require('../models/Store');
const Sale = require('../models/Sale');
const Expense = require('../models/Expense');
const Order = require('../models/Order');
const ChatOrder = require('../models/ChatOrder');
const Booking = require('../models/Booking');
const Product = require('../models/Product');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const AiCredential = require('../models/AiCredential');
const ProviderKey = require('../models/ProviderKey');
const AssistantPendingAction = require('../models/AssistantPendingAction');
const AssistantActionAudit = require('../models/AssistantActionAudit');
const logger = require('../logger');

const { createAssistantService } = require('./assistantService');
const { createAssistantDataTools } = require('./assistantDataTools');
const { getAiCompletion } = require('./aiFailover');
const { createAiKeyResolver } = require('./aiKeyResolver');
const assistantWriteTools = require('./assistantWriteTools');
const assistantPendingActionService = require('./assistantPendingActionService');
const assistantActionAuditService = require('./assistantActionAuditService');
const {
  normalizeArabicDigits,
  maskPhone,
  resolveSenderPhoneFromMessage,
} = require('./phoneNormalize');

const LINK_CODE_REGEX = /^LINK-([A-Z0-9]{6})$/i;
const COPILOT_SEND_REGEX = /^(?:إرسال|ارسال|send)\s+#?(\d{4,8})$/i;
const COPILOT_DISCARD_REGEX = /^(?:تجاهل|discard|ignore)\s+#?(\d{4,8})$/i;
const COPILOT_EDIT_HEAD_REGEX = /^(?:تعديل|edit)\s+#?(\d{4,8})\s*[:：]/i;
const DEDUP_TTL_MS = 10 * 60 * 1000;
const DEDUP_MAX_ENTRIES = 5000;

function parseLinkCodeMessage(text) {
  const normalized = normalizeArabicDigits(String(text || '')).trim();
  const match = normalized.match(LINK_CODE_REGEX);
  if (!match) return null;
  return `LINK-${match[1].toUpperCase()}`;
}

/**
 * Parses code-scoped Copilot mobile approval commands over ZainBot Main WhatsApp:
 *   - `إرسال <code>` (or `ارسال <code>` / `send <code>`)
 *   - `تعديل <code>: <new text>` (or `edit <code>: <new text>`)
 *   - `تجاهل <code>` (or `discard <code>` / `ignore <code>`)
 *
 * Requires an explicit numeric draft code so it NEVER collides with
 * pending write-action confirm/reject regexes (`تأكيد` / `نعم` / `لا` / `إلغاء`)
 * or natural write-tool instructions (`عدّل مخزون ...`).
 */
function parseCopilotDraftCommand(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  const normalizedAll = normalizeArabicDigits(trimmed);

  const sendMatch = normalizedAll.match(COPILOT_SEND_REGEX);
  if (sendMatch) {
    return { action: 'send', draftCode: sendMatch[1] };
  }

  const discardMatch = normalizedAll.match(COPILOT_DISCARD_REGEX);
  if (discardMatch) {
    return { action: 'discard', draftCode: discardMatch[1] };
  }

  const firstNewline = trimmed.indexOf('\n');
  const head = firstNewline === -1 ? trimmed : trimmed.slice(0, firstNewline);
  const editMatch = normalizeArabicDigits(head).match(COPILOT_EDIT_HEAD_REGEX);
  if (editMatch) {
    const colonIdx = trimmed.search(/[:：]/);
    const editedReply = colonIdx >= 0 ? trimmed.slice(colonIdx + 1).trim() : '';
    return {
      action: 'edit',
      draftCode: editMatch[1],
      editedReply,
    };
  }

  return null;
}

function hashWhatsappLinkCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

function buildWriteArgExtractionPrompt(toolName) {
  if (toolName === 'create_order') {
    return 'Extract a JSON object with keys: customerName (string), customerPhone (string), customerAddress (string), items (array of { title, quantity, price? }), deliveryFee (number, default 0), customerNote (string), botName (optional string). Return ONLY valid JSON. Omit unknown fields.';
  }
  if (toolName === 'update_inventory') {
    return 'Extract a JSON object with keys: productName (string), operation ("set" | "increment" | "decrement"), value (integer >= 0). Return ONLY valid JSON. Omit unknown fields.';
  }
  if (toolName === 'message_customer') {
    return 'Extract a JSON object with keys: customerName (optional string), customerPhone (optional string), text (exact message string to send to the customer). Return ONLY valid JSON. Omit unknown fields.';
  }
  return 'Return ONLY a valid JSON object.';
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

function createDefaultAssistantRuntime() {
  const keyResolver = createAiKeyResolver({ AiCredential, ProviderKey });
  const dataTools = createAssistantDataTools({
    models: { Sale, Expense, Order, ChatOrder, Booking, Product, Customer, Conversation, Bot, Store },
  });

  async function findKeyBot(userId) {
    return Bot.findOne({ userId, isActive: true })
      .select('userId userApiKey userProvider userModel userBaseUrl backupApiKey backupProvider backupModel backupBaseUrl')
      .lean();
  }

  async function ownerHasAiKey({ userId }) {
    const bot = await findKeyBot(userId);
    if (bot?.userApiKey || bot?.backupApiKey) return true;
    const globalKeys = await keyResolver.listGlobalAiKeys();
    return globalKeys.length > 0;
  }

  const assistantService = createAssistantService({
    models: { Store, Bot, Sale, Expense, Order, ChatOrder, Booking, Product, Customer, Conversation },
    dataTools,
    hasAiKey: ownerHasAiKey,
    complete: async ({ messages, userId }) => {
      const bot = await findKeyBot(userId);
      return getAiCompletion({ messages, max_tokens: 900 }, bot);
    },
  });

  async function extractWriteArgs({ userId, toolName, message }) {
    let keyAvailable = false;
    try {
      keyAvailable = await ownerHasAiKey({ userId });
    } catch {
      keyAvailable = false;
    }
    if (!keyAvailable) return {};

    try {
      const bot = await findKeyBot(userId);
      const response = await getAiCompletion(
        {
          messages: [
            { role: 'system', content: buildWriteArgExtractionPrompt(toolName) },
            { role: 'user', content: message },
          ],
          max_tokens: 400,
          response_format: { type: 'json_object' },
        },
        bot,
        {
          userId,
          feature: 'assistant_write_tools',
          stage: 'intent_extract',
          useCase: 'assistant_write_tools',
        }
      );
      const raw = response?.choices?.[0]?.message?.content?.trim() || '';
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return {};
      const parsed = JSON.parse(jsonMatch[0]);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      return parsed;
    } catch (err) {
      logger.warn('platform_merchant_write_args_extract_failed', {
        toolName,
        error: err?.message || String(err),
      });
      return {};
    }
  }

  return { assistantService, extractWriteArgs };
}

function createPlatformMerchantAssistantRouter(deps = {}) {
  const usesDefaultUserModel = !deps.User;
  const UserModel = deps.User || User;
  const PendingActionModel = deps.AssistantPendingAction || AssistantPendingAction;
  const AuditModel = deps.AssistantActionAudit || AssistantActionAudit;
  const pendingService = deps.pendingActionService || assistantPendingActionService;
  const writeTools = deps.writeTools || assistantWriteTools;
  const auditService = deps.auditService || assistantActionAuditService;
  const getCopilotService = () => (
    // Lazy require avoids circular load-time dependencies and allows DI in tests
    // eslint-disable-next-line global-require
    deps.copilotService || require('./copilotService')
  );
  const resolveSenderPhone = deps.resolveSenderPhone || resolveSenderPhoneFromMessage;
  const log = deps.logger || logger;
  const nowFn = deps.now || (() => new Date());
  const dedupTtlMs = Number.isFinite(deps.dedupTtlMs) && deps.dedupTtlMs > 0
    ? deps.dedupTtlMs
    : DEDUP_TTL_MS;

  let lazyRuntime = null;
  function getAssistantService() {
    if (deps.assistantService) return deps.assistantService;
    if (!lazyRuntime) lazyRuntime = createDefaultAssistantRuntime();
    return lazyRuntime.assistantService;
  }

  function getWriteArgsExtractor() {
    if (deps.extractWriteArgs !== undefined) return deps.extractWriteArgs;
    if (!lazyRuntime) lazyRuntime = createDefaultAssistantRuntime();
    return lazyRuntime.extractWriteArgs;
  }

  // In-memory TTL dedup map (capped) + in-flight set + persistent DB check for restarts.
  const seenMessageIds = new Map();
  const inFlightMessageIds = new Set();

  function pruneSeenMessages(currentNow) {
    const cutoff = currentNow.getTime() - dedupTtlMs;
    for (const [id, seenAt] of seenMessageIds) {
      if (seenAt < cutoff) seenMessageIds.delete(id);
    }
  }

  function markMessageSeen(messageId, currentNow) {
    if (!messageId) return;
    if (seenMessageIds.size >= DEDUP_MAX_ENTRIES) {
      const oldest = seenMessageIds.keys().next();
      if (!oldest.done) seenMessageIds.delete(oldest.value);
    }
    seenMessageIds.set(messageId, currentNow.getTime());
  }

  async function claimMessageId(messageId, currentNow) {
    if (!messageId) return true;
    pruneSeenMessages(currentNow);
    if (seenMessageIds.has(messageId) || inFlightMessageIds.has(messageId)) {
      return false;
    }

    inFlightMessageIds.add(messageId);
    try {
      if (PendingActionModel && typeof PendingActionModel.exists === 'function') {
        const seenInPending = await PendingActionModel.exists({
          $or: [
            { proposalMessageId: messageId },
            { decisionMessageId: messageId },
          ],
        });
        if (seenInPending) {
          markMessageSeen(messageId, currentNow);
          return false;
        }
      }

      if (AuditModel && typeof AuditModel.exists === 'function') {
        const seenInAudit = await AuditModel.exists({
          $or: [
            { triggerMessageId: messageId },
            { decisionMessageId: messageId },
          ],
        });
        if (seenInAudit) {
          markMessageSeen(messageId, currentNow);
          return false;
        }
      }

      markMessageSeen(messageId, currentNow);
      return true;
    } finally {
      inFlightMessageIds.delete(messageId);
    }
  }

  async function handleLinkCodeBinding({ linkCode, senderPhone, messageId, now }) {
    const codeHash = hashWhatsappLinkCode(linkCode);

    const candidateUser = await runQuery(
      UserModel.findOne({ 'assistantSettings.whatsappLinkCodeHash': codeHash }),
      '_id status username assistantSettings.verifiedWhatsappPhone assistantSettings.whatsappVerifiedAt assistantSettings.writeToolsEnabled assistantSettings.allowedWriteTools +assistantSettings.whatsappLinkCodeHash +assistantSettings.whatsappLinkExpiresAt'
    );

    if (!candidateUser) {
      return {
        handled: true,
        reason: 'link_code_invalid',
        reply: 'رمز الربط غير صالح أو تم استخدامه بالفعل. أنشئ رمزًا جديدًا من لوحة التحكم ثم أرسله هنا.',
      };
    }

    if (candidateUser.status !== 'active') {
      await auditService.recordAudit({
        eventType: 'whatsapp_link.rejected',
        merchantUserId: candidateUser._id,
        actorUserId: candidateUser._id,
        channel: 'whatsapp_platform',
        targetModel: 'User',
        targetId: String(candidateUser._id),
        outcome: 'denied',
        beforeState: null,
        afterState: null,
        summary: 'تم رفض ربط واتساب لأن حساب التاجر غير نشط.',
        errorCode: 'USER_INACTIVE',
        triggerMessageId: messageId,
      });
      return {
        handled: true,
        reason: 'link_user_inactive',
        reply: 'حسابك غير نشط حاليًا، لا يمكن إتمام ربط واتساب.',
      };
    }

    const expiresAt = candidateUser.assistantSettings?.whatsappLinkExpiresAt;
    if (!expiresAt || new Date(expiresAt) <= now) {
      if (typeof UserModel.updateOne === 'function') {
        await UserModel.updateOne(
          { _id: candidateUser._id, 'assistantSettings.whatsappLinkCodeHash': codeHash },
          {
            $set: {
              'assistantSettings.whatsappLinkCodeHash': '',
              'assistantSettings.whatsappLinkExpiresAt': null,
            },
          }
        );
      }
      await auditService.recordAudit({
        eventType: 'whatsapp_link.rejected',
        merchantUserId: candidateUser._id,
        actorUserId: candidateUser._id,
        channel: 'whatsapp_platform',
        targetModel: 'User',
        targetId: String(candidateUser._id),
        outcome: 'expired',
        beforeState: null,
        afterState: null,
        summary: 'انتهت صلاحية رمز ربط واتساب قبل استخدامه.',
        errorCode: 'LINK_CODE_EXPIRED',
        triggerMessageId: messageId,
      });
      return {
        handled: true,
        reason: 'link_code_expired',
        reply: 'انتهت صلاحية رمز الربط (10 دقائق). يرجى إنشاء رمز جديد من لوحة التحكم وإرساله مرة أخرى.',
      };
    }

    const existingOwner = await runQuery(
      UserModel.findOne({
        'assistantSettings.verifiedWhatsappPhone': senderPhone,
        _id: { $ne: candidateUser._id },
      }),
      '_id'
    );
    if (existingOwner) {
      await auditService.recordAudit({
        eventType: 'whatsapp_link.rejected',
        merchantUserId: candidateUser._id,
        actorUserId: candidateUser._id,
        channel: 'whatsapp_platform',
        targetModel: 'User',
        targetId: String(candidateUser._id),
        outcome: 'denied',
        beforeState: { verifiedWhatsappPhoneMasked: maskPhone(candidateUser.assistantSettings?.verifiedWhatsappPhone || '') },
        afterState: null,
        summary: 'تم رفض ربط رقم واتساب لأنه مربوط بالفعل بحساب تاجر آخر.',
        errorCode: 'PHONE_ALREADY_LINKED',
        triggerMessageId: messageId,
      });
      return {
        handled: true,
        reason: 'link_phone_conflict',
        reply: 'هذا الرقم مربوط بالفعل بحساب تاجر آخر على زين بوت. افصل الربط من الحساب الآخر أولًا أو استخدم رقمًا مختلفًا.',
      };
    }

    const previousPhone = candidateUser.assistantSettings?.verifiedWhatsappPhone || '';
    let boundUser = null;
    try {
      boundUser = await runQuery(
        UserModel.findOneAndUpdate(
          {
            _id: candidateUser._id,
            status: 'active',
            'assistantSettings.whatsappLinkCodeHash': codeHash,
            'assistantSettings.whatsappLinkExpiresAt': { $gt: now },
          },
          {
            $set: {
              'assistantSettings.verifiedWhatsappPhone': senderPhone,
              'assistantSettings.whatsappVerifiedAt': now,
              'assistantSettings.whatsappLinkCodeHash': '',
              'assistantSettings.whatsappLinkExpiresAt': null,
              'assistantSettings.updatedAt': now,
            },
          },
          { new: true }
        ),
        '_id username assistantSettings'
      );
    } catch (err) {
      if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
        await auditService.recordAudit({
          eventType: 'whatsapp_link.rejected',
          merchantUserId: candidateUser._id,
          actorUserId: candidateUser._id,
          channel: 'whatsapp_platform',
          targetModel: 'User',
          targetId: String(candidateUser._id),
          outcome: 'denied',
          beforeState: { verifiedWhatsappPhoneMasked: maskPhone(previousPhone) },
          afterState: null,
          summary: 'تعارض فهرس فريد: رقم واتساب مربوط بالفعل بحساب آخر.',
          errorCode: 'PHONE_ALREADY_LINKED',
          triggerMessageId: messageId,
        });
        return {
          handled: true,
          reason: 'link_phone_conflict',
          reply: 'هذا الرقم مربوط بالفعل بحساب تاجر آخر على زين بوت. افصل الربط من الحساب الآخر أولًا أو استخدم رقمًا مختلفًا.',
        };
      }
      throw err;
    }

    if (!boundUser) {
      return {
        handled: true,
        reason: 'link_code_invalid',
        reply: 'رمز الربط غير صالح أو تم استخدامه بالفعل. أنشئ رمزًا جديدًا من لوحة التحكم ثم أرسله هنا.',
      };
    }

    const masked = maskPhone(senderPhone);
    await auditService.recordAudit({
      eventType: 'whatsapp_link.bound',
      merchantUserId: boundUser._id,
      actorUserId: boundUser._id,
      channel: 'whatsapp_platform',
      targetModel: 'User',
      targetId: String(boundUser._id),
      outcome: 'success',
      beforeState: { verifiedWhatsappPhoneMasked: maskPhone(previousPhone) },
      afterState: { verifiedWhatsappPhoneMasked: masked },
      summary: `تم ربط رقم واتساب (${masked}) بمساعد زين بنجاح.`,
      triggerMessageId: messageId,
    });

    log.info('platform_merchant_whatsapp_bound', {
      merchantUserId: String(boundUser._id),
    });

    const reply = [
      `✅ تم ربط رقمك (${masked}) بمساعد زين بنجاح!`,
      'يمكنك الآن سؤالي عن مبيعاتك وطلباتك ومخزونك مباشرة من هنا.',
      'ملاحظة: أدوات التعديل (إنشاء طلب، تعديل المخزون، مراسلة عميل) تبقى مغلقة افتراضيًا حتى تفعّلها من لوحة التحكم.',
    ].join('\n');

    return {
      handled: true,
      reason: 'link_bound',
      merchantUserId: String(boundUser._id),
      reply,
    };
  }

  async function handleIncomingPlatformMessage({
    message,
    messageText,
    messageId = '',
    isImage = false,
    isVoice = false,
    now: nowOverride,
  } = {}) {
    if (!message) {
      return { handled: false, reason: 'no_message' };
    }

    // In unit tests without MongoDB connected and without injected User model,
    // fail closed cleanly to the existing visitor flow rather than buffering.
    if (usesDefaultUserModel && (!mongoose.connection || mongoose.connection.readyState !== 1)) {
      return { handled: false, reason: 'db_unavailable' };
    }

    const currentNow = nowOverride instanceof Date ? nowOverride : nowFn();
    const rawText = typeof messageText === 'string' ? messageText : String(message.body || '');
    const trimmedText = rawText.trim();
    const msgId = String(messageId || message.id?._serialized || message.id?.$1 || '').trim();

    // 1. One-time LINK-XXXXXX verification flow (works before the phone is bound)
    const linkCode = !isImage && !isVoice ? parseLinkCodeMessage(trimmedText) : null;
    if (linkCode) {
      if (!(await claimMessageId(msgId, currentNow))) {
        return { handled: true, duplicate: true, reason: 'duplicate_message', reply: null };
      }

      const senderPhone = await resolveSenderPhone(message);
      if (!senderPhone) {
        return {
          handled: true,
          reason: 'link_phone_unresolvable',
          reply: 'تعذّر التحقق من رقم هاتفك الحالي. يرجى إرسال رمز الربط من رقم واتساب قياسي والمحاولة مرة أخرى.',
        };
      }

      return handleLinkCodeBinding({
        linkCode,
        senderPhone,
        messageId: msgId,
        now: currentNow,
      });
    }

    // 2. Resolve sender phone (including @lid via message.getContact().number).
    //    Fail closed to normal visitor flow when unresolvable.
    const senderPhone = await resolveSenderPhone(message);
    if (!senderPhone) {
      return { handled: false, reason: 'sender_unresolvable' };
    }

    // 3. Match strictly against verifiedWhatsappPhone (NEVER User.whatsapp).
    const merchant = await runQuery(
      UserModel.findOne({
        'assistantSettings.verifiedWhatsappPhone': senderPhone,
        status: 'active',
      }),
      '_id username status assistantSettings'
    );
    if (!merchant) {
      return { handled: false, reason: 'not_verified_merchant' };
    }

    // 4. Router-level messageId deduplication (guards against replay/reconnect
    //    even after process restarts or concurrent invocations).
    if (!(await claimMessageId(msgId, currentNow))) {
      return {
        handled: true,
        duplicate: true,
        reason: 'duplicate_message',
        merchantUserId: String(merchant._id),
        reply: null,
      };
    }

    // 4.5. Code-scoped Copilot mobile approval commands:
    //      `إرسال <code>` / `تعديل <code>: <new text>` / `تجاهل <code>`
    //      Distinct verbs + explicit numeric draftCode never collide with
    //      pending write-action confirm/reject messages, and leave any active
    //      pending write action completely untouched.
    const copilotCmd = (!isImage && !isVoice && trimmedText)
      ? parseCopilotDraftCommand(trimmedText)
      : null;
    if (copilotCmd) {
      if (copilotCmd.action === 'edit' && !copilotCmd.editedReply) {
        return {
          handled: true,
          reason: 'copilot_edit_empty',
          merchantUserId: String(merchant._id),
          reply: `يرجى كتابة نص الرد الجديد بعد النقطتين، مثال:\nتعديل ${copilotCmd.draftCode}: أهلاً بك!`,
        };
      }

      const cpService = getCopilotService();

      if (copilotCmd.action === 'send' || copilotCmd.action === 'edit') {
        const isEdit = copilotCmd.action === 'edit';
        const result = await cpService.approveAndSendDraftByCode({
          merchantUserId: merchant._id,
          actorUserId: merchant._id,
          draftCode: copilotCmd.draftCode,
          editedReply: isEdit ? copilotCmd.editedReply : null,
          approvedVia: 'whatsapp_platform',
          decisionMessageId: msgId,
          now: currentNow,
        });
        const reply = result.ok
          ? (isEdit
            ? `✅ تم تعديل المسودة (${copilotCmd.draftCode}) وإرسال الرد للعميل بنجاح.`
            : `✅ تم إرسال المسودة (${copilotCmd.draftCode}) للعميل بنجاح.`)
          : result.message;
        return {
          handled: true,
          reason: result.ok
            ? (isEdit ? 'copilot_draft_edited_and_sent' : 'copilot_draft_sent')
            : 'copilot_draft_send_failed',
          merchantUserId: String(merchant._id),
          copilotResult: result,
          errorCode: result.ok ? undefined : result.errorCode,
          reply,
        };
      }

      if (copilotCmd.action === 'discard') {
        const result = await cpService.discardDraftByCode({
          merchantUserId: merchant._id,
          actorUserId: merchant._id,
          draftCode: copilotCmd.draftCode,
          approvedVia: 'whatsapp_platform',
          decisionMessageId: msgId,
          now: currentNow,
        });
        const reply = result.ok
          ? `❌ تم تجاهل المسودة (${copilotCmd.draftCode}) ولم يُرسل أي رد للعميل.`
          : result.message;
        return {
          handled: true,
          reason: result.ok ? 'copilot_draft_discarded' : 'copilot_draft_discard_failed',
          merchantUserId: String(merchant._id),
          copilotResult: result,
          errorCode: result.ok ? undefined : result.errorCode,
          reply,
        };
      }
    }

    // 5. Intercept active pending write action for this merchant on whatsapp_platform
    const { pendingAction, expiredAction } = await pendingService.findActivePendingAction({
      merchantUserId: merchant._id,
      channel: 'whatsapp_platform',
      now: currentNow,
    });

    if (expiredAction && !pendingAction) {
      const parsedExpired = (!isImage && !isVoice && trimmedText)
        ? pendingService.parseDecisionMessage(trimmedText)
        : { decision: 'ambiguous' };
      if (
        parsedExpired.decision === 'confirm'
        || parsedExpired.decision === 'reject'
        || parsedExpired.decision === 'code_mismatch'
      ) {
        return {
          handled: true,
          reason: 'pending_expired',
          merchantUserId: String(merchant._id),
          reply: 'انتهت صلاحية الإجراء المقترح (5 دقائق) ولم يُنفّذ شيء. أرسل طلبك من جديد إذا أردت إعادة المحاولة.',
        };
      }
    }

    if (pendingAction) {
      const parsed = (!isImage && !isVoice && trimmedText)
        ? pendingService.parseDecisionMessage(trimmedText, pendingAction.actionCode)
        : { decision: 'ambiguous', actionCode: null };

      if (parsed.decision === 'confirm') {
        const confirmed = await pendingService.confirmAction({
          pendingActionId: pendingAction._id,
          merchantUserId: merchant._id,
          actorUserId: merchant._id,
          channel: 'whatsapp_platform',
          decisionMessageId: msgId,
          actionCode: parsed.actionCode,
          now: currentNow,
        });
        return {
          handled: true,
          reason: confirmed.ok ? 'action_executed' : 'action_confirm_failed',
          merchantUserId: String(merchant._id),
          actionResult: confirmed,
          reply: confirmed.message,
        };
      }

      if (parsed.decision === 'reject') {
        const rejected = await pendingService.rejectAction({
          pendingActionId: pendingAction._id,
          merchantUserId: merchant._id,
          actorUserId: merchant._id,
          channel: 'whatsapp_platform',
          decisionMessageId: msgId,
          now: currentNow,
        });
        return {
          handled: true,
          reason: 'action_rejected',
          merchantUserId: String(merchant._id),
          actionResult: rejected,
          reply: rejected.message,
        };
      }

      // Ambiguous message or wrong action code: NEVER execute, NEVER cancel; re-prompt.
      const remainingMinutes = Math.max(
        1,
        Math.ceil((new Date(pendingAction.expiresAt).getTime() - currentNow.getTime()) / 60000)
      );
      const prefix = parsed.decision === 'code_mismatch'
        ? '⚠️ رمز التأكيد غير مطابق للإجراء المعلّق. لم يتم تنفيذ أو إلغاء أي شيء.\n\n'
        : `⏳ يوجد إجراء معلّق بانتظار قرارك (المتبقي ~${remainingMinutes} دقيقة). لم يتم تنفيذه أو إلغاؤه.\nرد بـ «تأكيد» للتنفيذ أو «إلغاء» للتراجع:\n\n`;

      return {
        handled: true,
        reason: parsed.decision === 'code_mismatch' ? 'action_code_mismatch' : 'action_ambiguous',
        merchantUserId: String(merchant._id),
        pendingAction,
        reply: `${prefix}${pendingAction.summaryText}`,
      };
    }

    // 6. Non-text or empty message with no pending action
    if (isImage || isVoice || !trimmedText) {
      return {
        handled: true,
        reason: 'non_text_merchant_message',
        merchantUserId: String(merchant._id),
        reply: 'أرسل سؤالك أو طلبك كنص وسأساعدك فورًا في متابعة نشاطك على زين بوت.',
      };
    }

    // 7. Detect write-tool intent and delegate to authoritative Slice 2 proposeAction
    const detectedTool = writeTools.detectWriteToolIntent(trimmedText);
    if (detectedTool) {
      let candidateArgs = writeTools.parseStructuredArgsDeterministically(detectedTool, trimmedText);
      const deterministicValid = writeTools.validateArgs(detectedTool, candidateArgs).valid;

      if (!deterministicValid) {
        const permCheck = await pendingService.checkWriteToolPermission({
          merchantUserId: merchant._id,
          toolName: detectedTool,
          fresh: false,
        });
        const extractor = getWriteArgsExtractor();
        if (permCheck.allowed && typeof extractor === 'function') {
          const aiArgs = await extractor({
            userId: merchant._id,
            toolName: detectedTool,
            message: trimmedText,
          });
          if (aiArgs && typeof aiArgs === 'object' && !Array.isArray(aiArgs)) {
            candidateArgs = { ...candidateArgs, ...aiArgs };
          }
        }
      }

      try {
        const proposed = await pendingService.proposeAction({
          merchantUserId: merchant._id,
          actorUserId: merchant._id,
          channel: 'whatsapp_platform',
          toolName: detectedTool,
          args: candidateArgs,
          senderJid: String(message.from || ''),
          proposalMessageId: msgId,
          idempotencyKey: msgId ? `wa_platform_${msgId}` : undefined,
          now: currentNow,
        });

        return {
          handled: true,
          reason: proposed.ok
            ? 'action_proposed'
            : (proposed.denied ? 'action_denied' : 'action_clarify'),
          merchantUserId: String(merchant._id),
          pendingAction: proposed.ok ? proposed.pendingAction : null,
          errorCode: proposed.ok ? undefined : proposed.errorCode,
          reply: proposed.ok ? proposed.summaryText : proposed.message,
        };
      } catch (err) {
        if (err && (err.code === 11000 || String(err.message || '').includes('E11000'))) {
          return {
            handled: true,
            duplicate: true,
            reason: 'duplicate_message',
            merchantUserId: String(merchant._id),
            reply: null,
          };
        }
        throw err;
      }
    }

    // 8. Read-only fallback to assistantService.answer
    const assistant = getAssistantService();
    const result = await assistant.answer({
      userId: merchant._id,
      question: trimmedText,
      history: [],
    });

    return {
      handled: true,
      reason: 'assistant_readonly',
      merchantUserId: String(merchant._id),
      usedTools: result.usedTools || [],
      fallback: Boolean(result.fallback),
      reply: result.answer,
    };
  }

  return {
    handleIncomingPlatformMessage,
    parseLinkCodeMessage,
    parseCopilotDraftCommand,
    hashWhatsappLinkCode,
  };
}

const defaultRouter = createPlatformMerchantAssistantRouter();

module.exports = {
  createPlatformMerchantAssistantRouter,
  handleIncomingPlatformMessage: defaultRouter.handleIncomingPlatformMessage,
  parseLinkCodeMessage,
  parseCopilotDraftCommand,
  hashWhatsappLinkCode,
  LINK_CODE_REGEX,
};
