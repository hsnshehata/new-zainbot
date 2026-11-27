'use strict';

// server/services/copilotService.js
// Core service for Human-in-the-Loop Copilot mode:
// - Generates AI draft replies via aiFailover (tagged feature: 'copilot')
// - Creates CopilotDraft records (strictly 1 pending draft per conversation;
//   newer inbound messages supersede older pending drafts)
// - Lists pending drafts strictly scoped to merchantUserId
// - Approves & sends (1-tap or edited) via channelDeliveryService with atomic
//   CAS (pending -> sending -> sent | edited_and_sent), preserving
//   conversation.isHumanHandling and respecting channelGuard (CHANNELS_MODE)
// - Discards drafts without ever delivering
// - Regenerates pending drafts
// - Expires stale pending drafts with immutable AssistantActionAudit records

const crypto = require('crypto');
const mongoose = require('mongoose');

const Bot = require('../models/Bot');
const Rule = require('../models/Rule');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');
const CopilotDraft = require('../models/CopilotDraft');
const { COPILOT_DRAFT_CHANNELS } = CopilotDraft;
const logger = require('../logger');
const { getAiCompletion } = require('./aiFailover');
const platformSettingsService = require('./platformSettingsService');
const assistantActionAuditService = require('./assistantActionAuditService');
const { buildProductContext, buildStorefrontUrl } = require('./productContext');

const DEFAULT_DRAFT_TTL_MINUTES = 60;
const MIN_DRAFT_TTL_MINUTES = 5;
const MAX_DRAFT_TTL_MINUTES = 1440;
const MAX_DRAFT_REPLY_LENGTH = 4000;
const MAX_SNIPPET_LENGTH = 500;

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function generateDraftCode() {
  return String(crypto.randomInt(1000, 10000));
}

function normalizeChannel(raw) {
  const value = String(raw || 'web').trim().toLowerCase();
  return COPILOT_DRAFT_CHANNELS.includes(value) ? value : 'web';
}

function resolveDraftTtlMinutes(bot) {
  const raw = Number(bot?.copilotSettings?.draftTtlMinutes);
  if (!Number.isFinite(raw)) return DEFAULT_DRAFT_TTL_MINUTES;
  return Math.min(MAX_DRAFT_TTL_MINUTES, Math.max(MIN_DRAFT_TTL_MINUTES, Math.round(raw)));
}

function isDataUrl(value) {
  return typeof value === 'string' && /^data:[a-z0-9/+.-]+;base64,/i.test(value.trim());
}

async function runQuery(queryLike) {
  if (queryLike && typeof queryLike.lean === 'function') {
    return queryLike.lean();
  }
  return queryLike;
}

function createCopilotService(deps = {}) {
  const CopilotDraftModel = deps.CopilotDraft || CopilotDraft;
  const ConversationModel = deps.Conversation || Conversation;
  const BotModel = deps.Bot || Bot;
  const RuleModel = deps.Rule || Rule;
  const StoreModel = deps.Store || Store;
  const ProductModel = deps.Product || Product;
  const NotificationModel = deps.Notification || Notification;
  const aiComplete = deps.getAiCompletion || getAiCompletion;
  const getDeliveryService = () => (
    // Lazy require avoids a botEngine -> copilotService -> channelDeliveryService
    // -> whatsappSessionManager -> botEngine circular dependency at load time.
    // eslint-disable-next-line global-require
    deps.channelDeliveryService || require('./channelDeliveryService')
  );
  const auditService = deps.assistantActionAuditService || assistantActionAuditService;
  const log = deps.logger || logger;
  const codeGenerator = deps.generateDraftCode || generateDraftCode;

  const isPlatformCopilotEnabled = deps.isCopilotEnabled
    || (() => platformSettingsService.isCopilotEnabled());
  const getDefaultModel = deps.getPlatformDefaultOpenAiModel
    || (() => platformSettingsService.getPlatformDefaultOpenAiModel());
  const enforceTruthful = deps.enforceTruthfulOrderReply || ((reply) => {
    try {
      // Lazy require to avoid circular dependency with botEngine.js
      // eslint-disable-next-line global-require
      const botEngine = require('../botEngine');
      if (typeof botEngine.enforceTruthfulOrderReply === 'function') {
        return botEngine.enforceTruthfulOrderReply(reply, null, null, {});
      }
    } catch {
      // Fall back to original reply if botEngine is unavailable in isolated tests
    }
    return reply;
  });

  async function generateDraftReply({
    bot,
    conversation,
    messages,
    model = null,
    useBackup = false,
    operationId = null,
    stage = 'draft_generate',
    maxTokens = 2000,
  }) {
    const resolvedModel = model || (await getDefaultModel());
    const response = await aiComplete(
      {
        model: resolvedModel,
        messages,
        max_tokens: maxTokens,
        feature: 'copilot',
        stage,
        operationId: operationId || String(conversation?._id || ''),
      },
      bot,
      useBackup
    );

    const content = String(response?.choices?.[0]?.message?.content || '').trim();
    if (!content) {
      const err = new Error('Empty AI copilot draft response');
      err.code = 'EMPTY_COPILOT_DRAFT';
      throw err;
    }
    return content;
  }

  async function buildRegenerateMessages({ bot, conversation }) {
    const rules = (await runQuery(RuleModel.find({ $or: [{ botId: bot._id }, { type: 'global' }] }))) || [];
    let systemPrompt = 'أنت مساعد ذكي تصيغ مسودة رد مهذبة ودقيقة ليراجعها صاحب المتجر قبل إرسالها للعميل.\n';
    if (rules.length === 0) {
      systemPrompt += 'لا توجد قواعد محددة، صغ ردًا واضحًا ومفيدًا.\n';
    } else {
      for (const rule of rules) {
        if (rule.type === 'global' || rule.type === 'general') {
          systemPrompt += `${rule.content}\n`;
        } else if (rule.type === 'products' && rule.content) {
          systemPrompt += `المنتج: ${rule.content.product}، السعر: ${rule.content.price} ${rule.content.currency}\n`;
        } else if (rule.type === 'qa' && rule.content) {
          systemPrompt += `السؤال: ${rule.content.question}، الإجابة: ${rule.content.answer}\n`;
        } else if (rule.type === 'channels' && rule.content) {
          systemPrompt += `قناة التواصل: ${rule.content.platform}، الوصف: ${rule.content.description}، الرابط/الرقم: ${rule.content.value}\n`;
        }
      }
    }
    systemPrompt += 'تعليمات أمان: التزم تمامًا بالقواعد والأسعار الواردة هنا وفي بيانات المتجر/المنتجات.\n';
    if (bot.description) systemPrompt += `وصف الوكيل: ${bot.description}\n`;
    if (Array.isArray(bot.objectives) && bot.objectives.length) {
      systemPrompt += `أهداف الوكيل:\n${bot.objectives.map((o) => `- ${o}`).join('\n')}\n`;
    }
    if (bot.customInstructions) {
      systemPrompt += `تعليمات المالك:\n${bot.customInstructions}\n`;
    }

    const rawMsgs = Array.isArray(conversation.messages) ? conversation.messages : [];
    const safeMsgs = rawMsgs
      .filter((m) => m && typeof m.content === 'string' && !isDataUrl(m.content))
      .slice(-20)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content.length > 2000 ? `${m.content.slice(0, 2000)}...` : m.content,
      }));

    const lastUserMsg = [...safeMsgs].reverse().find((m) => m.role === 'user');
    if (bot.storeId) {
      try {
        const store = await runQuery(StoreModel.findById(bot.storeId));
        if (store) {
          const products = (await runQuery(ProductModel.find({ storeId: bot.storeId }))) || [];
          systemPrompt += `\nبيانات المتجر: الاسم: ${store.storeName}، الرابط: ${buildStorefrontUrl(store.storeLink) || 'غير متوفر'}.\n`;
          if (products.length > 0) {
            systemPrompt += buildProductContext(products, lastUserMsg?.content || '', store.storeLink);
          }
        }
      } catch (storeErr) {
        log.warn('copilot_regenerate_store_context_failed', {
          botId: String(bot._id),
          err: storeErr?.message || String(storeErr),
        });
      }
    }

    const messages = [{ role: 'system', content: systemPrompt }, ...safeMsgs];
    if (safeMsgs.length === 0) {
      messages.push({ role: 'user', content: 'أهلاً' });
    }
    return { messages, lastUserContent: lastUserMsg?.content || '' };
  }

  async function createDraftForMessage({
    bot,
    conversation,
    suggestedReply,
    triggerMessageId = '',
    customerMessageSnippet = '',
    customerName = '',
    now = new Date(),
  }) {
    if (!bot?._id || !bot?.userId || !conversation?._id) {
      throw new Error('bot and conversation are required to create a CopilotDraft');
    }
    const trimmedReply = String(suggestedReply || '').trim().slice(0, MAX_DRAFT_REPLY_LENGTH);
    if (!trimmedReply) {
      throw new Error('suggestedReply must be a non-empty string');
    }

    // One pending draft per conversation: newer inbound message supersedes older pending drafts
    await CopilotDraftModel.updateMany(
      {
        conversationId: conversation._id,
        status: 'pending',
      },
      {
        $set: {
          status: 'superseded',
          decidedAt: now,
        },
      }
    );

    const ttlMinutes = resolveDraftTtlMinutes(bot);
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
    const snippet = String(customerMessageSnippet || '').trim().slice(0, MAX_SNIPPET_LENGTH);
    const resolvedCustomerName = String(customerName || conversation.username || '').trim().slice(0, 120);
    const channel = normalizeChannel(conversation.channel);

    const draft = await CopilotDraftModel.create({
      draftCode: String(codeGenerator()),
      botId: bot._id,
      merchantUserId: bot.userId,
      conversationId: conversation._id,
      channel,
      customerUserId: String(conversation.userId || ''),
      customerName: resolvedCustomerName,
      triggerMessageId: String(triggerMessageId || ''),
      customerMessageSnippet: snippet,
      suggestedReply: trimmedReply,
      editedReply: null,
      status: 'pending',
      expiresAt,
      delivered: false,
    });

    await auditService.recordAudit({
      eventType: 'copilot.draft.created',
      merchantUserId: bot.userId,
      actorUserId: bot.userId,
      botId: bot._id,
      storeId: bot.storeId || null,
      channel: 'system',
      toolName: 'copilot_draft',
      copilotDraftId: draft._id,
      targetModel: 'CopilotDraft',
      targetId: String(draft._id),
      outcome: 'proposed',
      beforeState: null,
      afterState: {
        draftId: String(draft._id),
        conversationId: String(conversation._id),
        channel,
        suggestedReplyLength: trimmedReply.length,
        expiresAt: expiresAt.toISOString(),
      },
      summary: 'تم إنشاء مسودة رد في وضع المساعدة (Copilot) بانتظار موافقة التاجر.',
      triggerMessageId: String(triggerMessageId || ''),
    });

    // In-app notification only (Slice 5 owns mobile WhatsApp/Telegram alerts)
    if (bot.copilotSettings?.notifyChannels?.inApp !== false && typeof NotificationModel?.create === 'function') {
      try {
        const displayName = resolvedCustomerName || 'عميل';
        await NotificationModel.create({
          user: bot.userId,
          title: `مسودة رد جاهزة للمراجعة (${displayName})`,
          message: snippet
            ? `رسالة العميل: "${snippet.slice(0, 120)}" — افتح صندوق الرسائل للموافقة أو التعديل.`
            : 'توجد مسودة رد جديدة بانتظار موافقتك في صندوق الرسائل.',
          isRead: false,
        });
      } catch (notifErr) {
        log.warn('copilot_inapp_notification_failed', {
          draftId: String(draft._id),
          err: notifErr?.message || String(notifErr),
        });
      }
    }

    return draft;
  }

  async function expireSingleDraft({ draftId, merchantUserId, now = new Date(), channel = 'system' }) {
    const filter = {
      _id: draftId,
      status: 'pending',
      expiresAt: { $lte: now },
    };
    if (merchantUserId) {
      filter.merchantUserId = merchantUserId;
    }

    const expiredDoc = await CopilotDraftModel.findOneAndUpdate(
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
        eventType: 'copilot.draft.expired',
        merchantUserId: expiredDoc.merchantUserId,
        actorUserId: expiredDoc.merchantUserId,
        botId: expiredDoc.botId,
        channel,
        toolName: 'copilot_draft',
        copilotDraftId: expiredDoc._id,
        targetModel: 'CopilotDraft',
        targetId: String(expiredDoc._id),
        outcome: 'expired',
        beforeState: {
          draftStatus: 'pending',
          suggestedReplyLength: String(expiredDoc.suggestedReply || '').length,
        },
        afterState: {
          draftStatus: 'expired',
          delivered: false,
        },
        summary: 'انتهت صلاحية مسودة الرد ولم تُرسل للعميل.',
        errorCode: 'EXPIRED',
        triggerMessageId: expiredDoc.triggerMessageId,
      });
    }

    return expiredDoc;
  }

  async function listPendingDrafts({
    merchantUserId,
    botId = null,
    conversationId = null,
    limit = 50,
    now = new Date(),
  }) {
    if (!isValidObjectId(merchantUserId)) return [];

    const filter = {
      merchantUserId,
      status: 'pending',
      expiresAt: { $gt: now },
    };

    if (botId) {
      if (!isValidObjectId(botId)) return [];
      filter.botId = botId;
    }

    if (conversationId) {
      if (!isValidObjectId(conversationId)) return [];
      filter.conversationId = conversationId;
    }

    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
    return CopilotDraftModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
  }

  async function approveAndSendDraft({
    draftId,
    merchantUserId,
    actorUserId,
    editedReply = null,
    approvedVia = 'dashboard_inbox',
    now = new Date(),
  }) {
    const actor = actorUserId || merchantUserId;

    if (!isValidObjectId(draftId) || !isValidObjectId(merchantUserId)) {
      return {
        ok: false,
        httpStatus: 404,
        errorCode: 'DRAFT_NOT_FOUND',
        message: 'المسودة غير موجودة.',
      };
    }

    const isEdited = editedReply !== null && editedReply !== undefined;
    let normalizedEditedReply = null;
    if (isEdited) {
      if (typeof editedReply !== 'string') {
        return {
          ok: false,
          httpStatus: 400,
          errorCode: 'INVALID_EDITED_REPLY',
          message: 'نص الرد المعدّل غير صالح.',
        };
      }
      normalizedEditedReply = editedReply.trim();
      if (!normalizedEditedReply || normalizedEditedReply.length > MAX_DRAFT_REPLY_LENGTH) {
        return {
          ok: false,
          httpStatus: 400,
          errorCode: 'INVALID_EDITED_REPLY',
          message: 'نص الرد المعدّل مطلوب ولا يتجاوز 4000 حرف.',
        };
      }
    }

    // Atomic CAS: pending -> sending (strictly owned by merchantUserId & unexpired)
    const claimed = await CopilotDraftModel.findOneAndUpdate(
      {
        _id: draftId,
        merchantUserId,
        status: 'pending',
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'sending',
          decidedAt: now,
          decidedBy: actor,
          approvedVia,
        },
      },
      { new: true }
    );

    if (!claimed) {
      const existing = await runQuery(
        CopilotDraftModel.findOne({ _id: draftId, merchantUserId })
      );
      if (!existing) {
        return {
          ok: false,
          httpStatus: 404,
          errorCode: 'DRAFT_NOT_FOUND',
          message: 'المسودة غير موجودة.',
        };
      }
      if (existing.status === 'pending' && new Date(existing.expiresAt) <= now) {
        await expireSingleDraft({
          draftId: existing._id,
          merchantUserId,
          now,
          channel: approvedVia || 'system',
        });
        return {
          ok: false,
          httpStatus: 410,
          errorCode: 'DRAFT_EXPIRED',
          message: 'انتهت صلاحية المسودة ولم تُرسل.',
        };
      }
      if (existing.status === 'sending') {
        return {
          ok: false,
          httpStatus: 409,
          errorCode: 'DRAFT_ALREADY_SENDING',
          message: 'جاري إرسال المسودة بالفعل.',
        };
      }
      if (existing.status === 'sent' || existing.status === 'edited_and_sent') {
        return {
          ok: false,
          httpStatus: 409,
          errorCode: 'DRAFT_ALREADY_SENT',
          message: 'تم إرسال هذه المسودة بالفعل.',
        };
      }
      return {
        ok: false,
        httpStatus: 409,
        errorCode: `DRAFT_${String(existing.status || 'conflict').toUpperCase()}`,
        message: 'هذه المسودة لم تعد معلّقة.',
      };
    }

    const conversation = await runQuery(ConversationModel.findById(claimed.conversationId));
    if (!conversation) {
      await CopilotDraftModel.updateOne(
        { _id: claimed._id, status: 'sending' },
        { $set: { status: 'failed', errorCode: 'CONVERSATION_NOT_FOUND', delivered: false } }
      );
      await auditService.recordAudit({
        eventType: 'copilot.draft.send_failed',
        merchantUserId,
        actorUserId: actor,
        botId: claimed.botId,
        channel: approvedVia,
        toolName: 'copilot_draft',
        copilotDraftId: claimed._id,
        targetModel: 'Conversation',
        targetId: String(claimed.conversationId),
        outcome: 'error',
        beforeState: { draftStatus: 'pending' },
        afterState: { draftStatus: 'failed', delivered: false },
        summary: 'تعذّر العثور على المحادثة المرتبطة بالمسودة.',
        errorCode: 'CONVERSATION_NOT_FOUND',
        triggerMessageId: claimed.triggerMessageId,
      });
      return {
        ok: false,
        httpStatus: 404,
        errorCode: 'CONVERSATION_NOT_FOUND',
        message: 'المحادثة غير موجودة.',
      };
    }

    const textToSend = isEdited ? normalizedEditedReply : claimed.suggestedReply;
    let delivered = false;
    try {
      delivered = await getDeliveryService().deliverReply(conversation, textToSend);
    } catch (err) {
      const isChannelsDisabled = err?.code === 'CHANNELS_DISABLED' || err?.status === 409;
      if (isChannelsDisabled) {
        // Revert to pending so CHANNELS_MODE=off NEVER marks the draft sent or loses it
        await CopilotDraftModel.updateOne(
          { _id: claimed._id, status: 'sending' },
          {
            $set: {
              status: 'pending',
              decidedAt: null,
              decidedBy: null,
              approvedVia: '',
              errorCode: 'CHANNELS_DISABLED',
            },
          }
        );
        await auditService.recordAudit({
          eventType: 'copilot.draft.send_failed',
          merchantUserId,
          actorUserId: actor,
          botId: claimed.botId,
          channel: approvedVia,
          toolName: 'copilot_draft',
          copilotDraftId: claimed._id,
          targetModel: 'Conversation',
          targetId: String(claimed.conversationId),
          outcome: 'denied',
          beforeState: {
            draftStatus: 'pending',
            isHumanHandling: Boolean(conversation.isHumanHandling),
          },
          afterState: {
            draftStatus: 'pending',
            delivered: false,
            isHumanHandling: Boolean(conversation.isHumanHandling),
          },
          summary: 'القنوات الخارجية معطّلة على هذا الخادم؛ لم يتم إرسال المسودة.',
          errorCode: 'CHANNELS_DISABLED',
          triggerMessageId: claimed.triggerMessageId,
        });
        return {
          ok: false,
          httpStatus: 409,
          errorCode: 'CHANNELS_DISABLED',
          message: 'القنوات الخارجية معطّلة حاليًا على هذا الخادم (CHANNELS_DISABLED).',
        };
      }

      const errorCode = String(err?.code || 'DELIVERY_FAILED').slice(0, 80);
      await CopilotDraftModel.updateOne(
        { _id: claimed._id, status: 'sending' },
        {
          $set: {
            status: 'failed',
            delivered: false,
            errorCode,
          },
        }
      );
      await auditService.recordAudit({
        eventType: 'copilot.draft.send_failed',
        merchantUserId,
        actorUserId: actor,
        botId: claimed.botId,
        channel: approvedVia,
        toolName: 'copilot_draft',
        copilotDraftId: claimed._id,
        targetModel: 'Conversation',
        targetId: String(claimed.conversationId),
        outcome: 'error',
        beforeState: { draftStatus: 'pending' },
        afterState: { draftStatus: 'failed', delivered: false },
        summary: 'فشل إرسال رد Copilot عبر القناة.',
        errorCode,
        triggerMessageId: claimed.triggerMessageId,
      });
      return {
        ok: false,
        httpStatus: 502,
        errorCode,
        message: 'تعذّر إرسال الرد عبر القناة. يرجى المحاولة لاحقًا.',
      };
    }

    const sentAt = new Date();
    const deliveredMessageId = `copilot_${claimed._id}`;

    // Append sent reply to Conversation.messages WITHOUT modifying isHumanHandling
    await ConversationModel.updateOne(
      { _id: conversation._id },
      {
        $push: {
          messages: {
            role: 'assistant',
            content: textToSend,
            messageId: deliveredMessageId,
            timestamp: sentAt,
          },
        },
      }
    );

    const finalStatus = isEdited ? 'edited_and_sent' : 'sent';
    const finalized = await CopilotDraftModel.findOneAndUpdate(
      { _id: claimed._id, status: 'sending' },
      {
        $set: {
          status: finalStatus,
          editedReply: isEdited ? textToSend : null,
          delivered: Boolean(delivered),
          deliveredMessageId,
          errorCode: '',
        },
      },
      { new: true }
    );

    await auditService.recordAudit({
      eventType: isEdited ? 'copilot.draft.edited_and_sent' : 'copilot.draft.sent',
      merchantUserId,
      actorUserId: actor,
      botId: claimed.botId,
      channel: approvedVia,
      toolName: 'copilot_draft',
      copilotDraftId: claimed._id,
      targetModel: 'Conversation',
      targetId: String(claimed.conversationId),
      outcome: 'success',
      beforeState: {
        draftStatus: 'pending',
        suggestedReply: claimed.suggestedReply,
        isHumanHandling: Boolean(conversation.isHumanHandling),
      },
      afterState: {
        draftStatus: finalStatus,
        suggestedReply: claimed.suggestedReply,
        editedReply: isEdited ? textToSend : null,
        delivered: Boolean(delivered),
        deliveredMessageId,
        isHumanHandling: Boolean(conversation.isHumanHandling),
      },
      summary: isEdited
        ? 'تم تعديل مسودة Copilot وإرسالها للعميل.'
        : 'تم اعتماد مسودة Copilot وإرسالها للعميل.',
      triggerMessageId: claimed.triggerMessageId,
      decisionMessageId: deliveredMessageId,
    });

    return {
      ok: true,
      httpStatus: 200,
      draft: finalized || claimed,
      delivered: Boolean(delivered),
      deliveredMessageId,
    };
  }

  async function discardDraft({
    draftId,
    merchantUserId,
    actorUserId,
    approvedVia = 'dashboard_inbox',
    now = new Date(),
  }) {
    const actor = actorUserId || merchantUserId;

    if (!isValidObjectId(draftId) || !isValidObjectId(merchantUserId)) {
      return {
        ok: false,
        httpStatus: 404,
        errorCode: 'DRAFT_NOT_FOUND',
        message: 'المسودة غير موجودة.',
      };
    }

    const discarded = await CopilotDraftModel.findOneAndUpdate(
      {
        _id: draftId,
        merchantUserId,
        status: 'pending',
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: 'discarded',
          decidedAt: now,
          decidedBy: actor,
          approvedVia,
        },
      },
      { new: true }
    );

    if (!discarded) {
      const existing = await runQuery(
        CopilotDraftModel.findOne({ _id: draftId, merchantUserId })
      );
      if (!existing) {
        return {
          ok: false,
          httpStatus: 404,
          errorCode: 'DRAFT_NOT_FOUND',
          message: 'المسودة غير موجودة.',
        };
      }
      if (existing.status === 'pending' && new Date(existing.expiresAt) <= now) {
        await expireSingleDraft({
          draftId: existing._id,
          merchantUserId,
          now,
          channel: approvedVia || 'system',
        });
        return {
          ok: false,
          httpStatus: 410,
          errorCode: 'DRAFT_EXPIRED',
          message: 'انتهت صلاحية المسودة بالفعل.',
        };
      }
      return {
        ok: false,
        httpStatus: 409,
        errorCode: `DRAFT_${String(existing.status || 'conflict').toUpperCase()}`,
        message: 'هذه المسودة لم تعد معلّقة.',
      };
    }

    await auditService.recordAudit({
      eventType: 'copilot.draft.discarded',
      merchantUserId,
      actorUserId: actor,
      botId: discarded.botId,
      channel: approvedVia,
      toolName: 'copilot_draft',
      copilotDraftId: discarded._id,
      targetModel: 'CopilotDraft',
      targetId: String(discarded._id),
      outcome: 'rejected',
      beforeState: {
        draftStatus: 'pending',
        suggestedReply: discarded.suggestedReply,
      },
      afterState: {
        draftStatus: 'discarded',
        delivered: false,
      },
      summary: 'تم تجاهل مسودة Copilot ولم يتم إرسال أي رد.',
      triggerMessageId: discarded.triggerMessageId,
    });

    return {
      ok: true,
      httpStatus: 200,
      draft: discarded,
    };
  }

  async function regenerateDraft({
    draftId,
    merchantUserId,
    now = new Date(),
  }) {
    if (!isValidObjectId(draftId) || !isValidObjectId(merchantUserId)) {
      return {
        ok: false,
        httpStatus: 404,
        errorCode: 'DRAFT_NOT_FOUND',
        message: 'المسودة غير موجودة.',
      };
    }

    const enabled = await isPlatformCopilotEnabled();
    if (!enabled) {
      return {
        ok: false,
        httpStatus: 403,
        errorCode: 'COPILOT_DISABLED',
        message: 'وضع المساعدة (Copilot) غير مفعّل حاليًا على مستوى المنصة.',
      };
    }

    const existing = await runQuery(
      CopilotDraftModel.findOne({ _id: draftId, merchantUserId })
    );
    if (!existing) {
      return {
        ok: false,
        httpStatus: 404,
        errorCode: 'DRAFT_NOT_FOUND',
        message: 'المسودة غير موجودة.',
      };
    }
    if (existing.status !== 'pending') {
      return {
        ok: false,
        httpStatus: 409,
        errorCode: `DRAFT_${String(existing.status || 'conflict').toUpperCase()}`,
        message: 'يمكن إعادة توليد المسودات المعلّقة فقط.',
      };
    }

    const [bot, conversation] = await Promise.all([
      runQuery(BotModel.findById(existing.botId)),
      runQuery(ConversationModel.findById(existing.conversationId)),
    ]);
    if (!bot || !conversation) {
      return {
        ok: false,
        httpStatus: 404,
        errorCode: 'CONVERSATION_NOT_FOUND',
        message: 'تعذّر العثور على البوت أو المحادثة.',
      };
    }

    const { messages } = await buildRegenerateMessages({ bot, conversation });
    let reply;
    try {
      reply = await generateDraftReply({
        bot,
        conversation,
        messages,
        operationId: String(existing._id),
        stage: 'draft_regenerate',
      });
    } catch (err) {
      log.error('copilot_draft_regenerate_failed', {
        draftId: String(existing._id),
        err: err?.message || String(err),
      });
      return {
        ok: false,
        httpStatus: 502,
        errorCode: 'COPILOT_AI_ERROR',
        message: 'تعذّر إعادة توليد المسودة حاليًا. حاول مرة أخرى.',
      };
    }

    const safeReply = enforceTruthful(reply);
    const newDraft = await createDraftForMessage({
      bot,
      conversation,
      suggestedReply: safeReply,
      triggerMessageId: existing.triggerMessageId,
      customerMessageSnippet: existing.customerMessageSnippet,
      customerName: existing.customerName || conversation.username || '',
      now,
    });

    return {
      ok: true,
      httpStatus: 200,
      draft: newDraft,
      supersededDraftId: existing._id,
    };
  }

  async function expireStaleDrafts({ now = new Date(), limit = 100 } = {}) {
    let expired = 0;
    while (expired < limit) {
      const doc = await CopilotDraftModel.findOneAndUpdate(
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
        eventType: 'copilot.draft.expired',
        merchantUserId: doc.merchantUserId,
        actorUserId: doc.merchantUserId,
        botId: doc.botId,
        channel: 'system',
        toolName: 'copilot_draft',
        copilotDraftId: doc._id,
        targetModel: 'CopilotDraft',
        targetId: String(doc._id),
        outcome: 'expired',
        beforeState: {
          draftStatus: 'pending',
          suggestedReplyLength: String(doc.suggestedReply || '').length,
        },
        afterState: {
          draftStatus: 'expired',
          delivered: false,
        },
        summary: 'انتهت صلاحية مسودة Copilot تلقائيًا دون إرسال.',
        errorCode: 'EXPIRED',
        triggerMessageId: doc.triggerMessageId,
      });
    }

    return { expired };
  }

  return {
    generateDraftReply,
    createDraftForMessage,
    listPendingDrafts,
    approveAndSendDraft,
    discardDraft,
    regenerateDraft,
    expireSingleDraft,
    expireStaleDrafts,
  };
}

const defaultCopilotService = createCopilotService();

module.exports = {
  createCopilotService,
  generateDraftReply: defaultCopilotService.generateDraftReply,
  createDraftForMessage: defaultCopilotService.createDraftForMessage,
  listPendingDrafts: defaultCopilotService.listPendingDrafts,
  approveAndSendDraft: defaultCopilotService.approveAndSendDraft,
  discardDraft: defaultCopilotService.discardDraft,
  regenerateDraft: defaultCopilotService.regenerateDraft,
  expireSingleDraft: defaultCopilotService.expireSingleDraft,
  expireStaleDrafts: defaultCopilotService.expireStaleDrafts,
  DEFAULT_DRAFT_TTL_MINUTES,
  MIN_DRAFT_TTL_MINUTES,
  MAX_DRAFT_TTL_MINUTES,
};
