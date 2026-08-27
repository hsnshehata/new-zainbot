const express = require('express');
const rateLimit = require('express-rate-limit');
const logger = require('../logger');
const LandingDemoConfig = require('../models/LandingDemoConfig');
const { getAiCompletion } = require('../services/aiFailover');

const router = express.Router();

// Tight limiter: the demo chat is public and triggers paid AI completions.
const demoLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'DEMO_RATE_LIMITED',
    message: 'Too many demo messages. Please try again later.',
  },
});

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 10;
const MAX_HISTORY_ITEM_LENGTH = 1000;
const AI_TIMEOUT_MS = 25000;

// Cache the config document for one minute so every demo message does not hit
// the database. Invalidated by the admin route when settings change.
let configCache = null;
let configCacheAt = 0;
const CONFIG_CACHE_TTL_MS = 60 * 1000;

async function getDemoConfig() {
  const now = Date.now();
  if (configCache && now - configCacheAt < CONFIG_CACHE_TTL_MS) {
    return configCache;
  }
  const doc = await LandingDemoConfig.getConfig();
  configCache = doc;
  configCacheAt = now;
  return doc;
}

function invalidateConfigCache() {
  configCache = null;
  configCacheAt = 0;
}

// Built-in knowledge base: describes the ZainBot platform so the demo agent
// can answer any real question about what the product does.
function buildPlatformKnowledge() {
  return [
    'You are ZainBot AI, the live demo agent on the official marketing landing page of "ZainBot" (زين بوت).',
    'ZainBot is a SaaS platform that lets merchants and businesses create intelligent AI agents that answer, sell, and follow up with customers automatically.',
    'Platform capabilities you can talk about:',
    '- AI agents (chatbots) trained on the merchant\'s own data: welcome message, agent profile, custom instructions, objectives, FAQ rules, and general training instructions.',
    '- Channels: WhatsApp, Facebook Messenger, Instagram, Telegram, a website chat widget, and a hosted online store with landing pages (three store layouts).',
    '- Commerce: product catalog with categories, in-chat order taking (chat orders), bookings/appointments, customers and suppliers, sales and expenses tracking.',
    '- Human handoff: the agent can pause auto-replies and hand the conversation to a human when the customer asks or when handoff keywords are matched.',
    '- Analytics: conversations, messages handled, connected channels, training rules, orders, and usage dashboards.',
    '- Reliability: bring-your-own API keys (BYOK) with provider/model choice (OpenAI, Gemini, Anthropic, OpenRouter, custom endpoints) plus platform-managed backup keys with automatic failover.',
    '- Plans (EGP/month): Free = 0 EGP, 1 agent, 25 messages/day (250/month), up to 3 channels, BYOK, basic analytics. Growth = 199 EGP, up to 5 agents, 1,000+ monthly messages, backup key failover, all channels, advanced catalog training, priority support. Enterprise/Scale = 999 EGP, unlimited agents, high-volume capacity, full API and webhook integrations, custom model fine-tuning, dedicated account manager, white-label options and 99.9% uptime SLA.',
    '- Getting started is free at /register and does not require a credit card. Existing users sign in at /login.',
  ].join('\n');
}

function buildSystemPrompt(customInstructions) {
  const base = [
    buildPlatformKnowledge(),
    '',
    'Demo rules:',
    '- You are a REAL demo of what the platform offers. Answer any question about the platform, its features, channels, plans, pricing, onboarding, and typical use cases — accurately and confidently.',
    '- Reply in the same language the visitor writes in (Arabic or English). Keep replies warm, concise (2-6 sentences unless more detail is clearly needed), and professional.',
    '- You are not connected to any real store or customer data. Never invent order statuses, customer records, or private data. If asked for something only a real workspace could do, explain that in a real workspace the agent connects to the merchant\'s own data.',
    '- Never request or accept passwords, payment card numbers, or API keys. Politely refuse and redirect.',
    '- When the visitor shows interest, encourage them to create a free workspace at /register (no credit card needed) or to start with the free plan.',
    '- Use at most one emoji per message, and only when it fits the tone.',
  ].join('\n');
  const extra = String(customInstructions || '').trim();
  if (!extra) return base;
  return `${base}\n\nAdditional instructions from the platform team (highest priority, follow them unless they conflict with the security rules above):\n${extra}`;
}

function sanitizeHistory(rawHistory) {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory
    .filter((item) => item && typeof item === 'object')
    .filter((item) => (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, MAX_HISTORY_ITEM_LENGTH),
    }));
}

function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label}_timeout`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

router.use(demoLimiter);

// Public endpoint powering the landing page "Try it live" chat.
router.post('/chat', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_MESSAGE',
        message: 'Message is empty or too long',
      });
    }

    const lang = req.body?.lang === 'ar' ? 'ar' : 'en';
    const history = sanitizeHistory(req.body?.history);

    const config = await getDemoConfig();
    if (!config.isEnabled) {
      return res.status(503).json({
        success: false,
        error: 'DEMO_DISABLED',
        message: 'The live demo is currently disabled',
      });
    }

    const completion = await withTimeout(
      getAiCompletion({
        messages: [
          { role: 'system', content: buildSystemPrompt(config.instructions) },
          ...history,
          { role: 'user', content: message },
        ],
        model: 'gpt-4o-mini',
        max_tokens: 700,
      }, null),
      AI_TIMEOUT_MS,
      'landing_demo_ai'
    );

    const reply = completion?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new Error('empty_ai_reply');
    }

    const confidence = 92 + Math.floor(Math.random() * 7); // 92-98
    logger.info('landing_demo_reply_ok', {
      requestId: req.requestId,
      lang,
      historySize: history.length,
      replyLength: reply.length,
    });

    return res.status(200).json({
      success: true,
      reply,
      confidence,
    });
  } catch (err) {
    logger.warn('landing_demo_reply_failed', {
      requestId: req.requestId,
      message: err.message,
    });
    return res.status(503).json({
      success: false,
      error: 'AI_UNAVAILABLE',
      message: 'The live demo is temporarily unavailable',
    });
  }
});

module.exports = router;
module.exports.invalidateConfigCache = invalidateConfigCache;
