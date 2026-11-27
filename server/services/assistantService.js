'use strict';

// server/services/assistantService.js
// The owner assistant ("مساعد زين"): answers the account owner's questions
// from their own live business data.
//
// Flow: keyword-select read-only data tools -> run them inside the owner's
// tenant scope -> one completion call with the data embedded. When no AI
// key is configured for the owner or globally, a deterministic bilingual
// template answer is rendered from the same data instead, so the assistant
// stays useful with zero AI configuration.
//
// All dependencies are injectable for unit tests (no DB, no network).

const logger = require('../logger');
const { createAssistantDataTools } = require('./assistantDataTools');

const ARABIC_RE = /[؀-ۿ]/;

function detectLanguage(text) {
  return ARABIC_RE.test(String(text || '')) ? 'ar' : 'en';
}

function buildSystemPrompt(lang) {
  if (lang === 'ar') {
    return [
      'أنت "مساعد زين"، مساعد صاحب النشاط التجاري داخل منصة ZainBot AI.',
      'أجب بالعربية (يفضل بالعامية المصرية البسيطة) وباختصار.',
      'اعتمد فقط على بيانات JSON المرفقة تحت عنوان "بيانات النشاط". لا تخترع أرقامًا أو أسماء.',
      'إذا لم تكن البيانات كافية للإجابة، قل ذلك بوضوح واقترح ما يمكن إضافته.',
      'لا تذكر أرقام هواتف أو بيانات شخصية إلا إذا سأل المستخدم عنها صراحة.',
      'الأسعار والمبالغ تُعرض كما سُجلت في النظام.',
      'تعرف أيضًا مميزات المنصة وتشرحها للتاجر عند السؤال: أوامر تنفيذية بتأكيد (تسجيل طلب، تعديل مخزون، مراسلة عميل) تُعرض كبطاقة تأكيد وتُنفَّذ فقط بعد موافقة التاجر خلال 5 دقائق وتُفعَّل من الإعدادات؛ ربط واتساب التاجر بكود LINK لمراسلتك وتأكيد العمليات من واتساب؛ وضع المساعدة (Copilot) لكل بوت (تلقائي/مساعدة/يدوي) حيث تُجهَّز الردود كبطاقات في الإنبوكس ليرسلها التاجر بنفسه؛ وموافقات الموبايل عبر تليجرام أو واتساب.',
    ].join('\n');
  }
  return [
    'You are "Zain Assistant", the business owner\'s assistant inside the ZainBot AI platform.',
    'Reply in English, briefly and plainly.',
    'Rely only on the attached JSON under "Business data". Never invent numbers or names.',
    'If the data is not enough to answer, say so clearly and suggest what to add.',
    'Do not surface phone numbers or personal data unless the user explicitly asks.',
    'Amounts are shown exactly as recorded in the system.',
    'You also know the platform features and can explain them when asked: confirmed write actions (create order, update stock, message customer) shown as a confirmation card and executed only after the owner confirms within 5 minutes, enabled in settings; WhatsApp linking with a LINK code to chat and confirm from WhatsApp; per-bot Copilot reply mode (auto/copilot/manual) where replies are drafted as inbox cards for the owner to send; and mobile approvals via Telegram or WhatsApp.',
  ].join('\n');
}

const CAPABILITIES_HINT = {
  ar: 'أقدر أجاوبك عن: المبيعات، المصروفات، الطلبات، المنتجات والمخزون، العملاء، الحجوزات، الرسائل، وحالة الوكلاء. ولو فعّلت الأوامر التنفيذية من الإعدادات أقدر أسجل طلبات وأعدّل مخزون وأراسل عميل بعد تأكيدك. اسألني مثلًا: «كام مبيعات النهارده؟»',
  en: 'I can answer about: sales, expenses, orders, products and stock, customers, bookings, inbox, and agent status. If you enable write actions in settings I can also register orders, update stock, and message a customer after your confirmation. For example: "How much did we sell today?"',
};

function createAssistantService(deps = {}) {
  const models = deps.models || {};
  const log = deps.logger || logger;
  const dataTools = deps.dataTools || createAssistantDataTools({ models });
  // Injected for tests; production wiring passes a function that delegates
  // to getAiCompletion with the owner's first active bot as key context.
  const complete = deps.complete;
  const hasAiKey = deps.hasAiKey || (async () => Boolean(complete));

  async function loadTenantScope(userId) {
    const [stores, bots] = await Promise.all([
      models.Store.find({ userId }).select('_id').lean(),
      models.Bot.find({ userId }).select('_id').lean(),
    ]);
    return {
      storeIds: stores.map((store) => store._id),
      botIds: bots.map((bot) => bot._id),
    };
  }

  /**
   * @param {object} input
   * @param {string} input.userId - authenticated owner's id (never from body)
   * @param {string} input.question
   * @param {Array}  [input.history] - prior [{role, content}] turns, trimmed
   * @returns {Promise<{answer: string, usedTools: string[], fallback: boolean, language: string}>}
   */
  async function answer({ userId, question, history = [] }) {
    const language = detectLanguage(question);
    const scope = await loadTenantScope(userId);
    const ctx = { now: new Date(), ...scope };
    const selected = dataTools.selectTools(question);
    const results = await dataTools.runTools(selected, ctx);
    const usedTools = selected.map((tool) => tool.id);

    const keyAvailable = await hasAiKey({ userId });
    if (!keyAvailable || typeof complete !== 'function') {
      const body = dataTools.renderFallback(selected, results, language);
      return {
        answer: body || CAPABILITIES_HINT[language],
        usedTools,
        fallback: true,
        language,
      };
    }

    const dataPayload = {};
    for (const [id, value] of Object.entries(results)) {
      if (value && !value.error) dataPayload[id] = value;
    }

    const trimmedHistory = (history || [])
      .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
      .slice(-10)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 2000) }));

    const messages = [
      { role: 'system', content: buildSystemPrompt(language) },
      ...trimmedHistory,
      {
        role: 'user',
        content:
          `بيانات النشاط / Business data (JSON):\n${JSON.stringify(dataPayload)}\n\n` +
          `السؤال / Question: ${question}`,
      },
    ];

    try {
      const response = await complete({ messages, userId });
      const text = response?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('empty_completion');
      }
      return { answer: text, usedTools, fallback: false, language };
    } catch (error) {
      log.warn('assistant_completion_failed_falling_back', {
        error: error.message,
        usedTools,
      });
      const body = dataTools.renderFallback(selected, results, language);
      return {
        answer: body || CAPABILITIES_HINT[language],
        usedTools,
        fallback: true,
        language,
      };
    }
  }

  return {
    answer,
    detectLanguage,
    CAPABILITIES_HINT,
  };
}

module.exports = {
  createAssistantService,
  detectLanguage,
  buildSystemPrompt,
};
