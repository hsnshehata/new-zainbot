'use strict';

// server/services/channelDeliveryService.js
// Shared outbound customer message delivery extracted from server/routes/messages.js
// (`deliverManualReply`). Enforces channelGuard.assertBotAllowed(botId) before any
// external send and supports WhatsApp QR, WhatsApp Cloud API, Facebook, and Instagram.

const axios = require('axios');
const Bot = require('../models/Bot');
const channelGuard = require('./channelGuard');
const { decryptChannelToken } = require('./channelTokenCrypto');
const { getWhatsAppSessionManager } = require('./whatsappSessionManager');

function stripChannelPrefixes(rawUserId) {
  return String(rawUserId || '')
    .replace(/^(facebook_|facebook_comment_|instagram_|instagram_comment_|whatsapp_)/, '')
    .replace(/^comment_/, '');
}

async function loadBotCredentials(BotModel, botId) {
  const query = BotModel.findById(botId);
  if (query && typeof query.select === 'function') {
    return query.select('facebookApiKey instagramApiKey whatsappApiKey whatsappBusinessAccountId');
  }
  return query;
}

function createChannelDeliveryService(deps = {}) {
  const BotModel = deps.Bot || Bot;
  const httpClient = deps.axios || axios;
  const guard = deps.channelGuard || channelGuard;
  const decrypt = deps.decryptChannelToken || decryptChannelToken;
  const getWaManager = deps.getWhatsAppSessionManager || getWhatsAppSessionManager;
  const env = deps.env || process.env;

  async function deliverReply(conversation, text) {
    if (!conversation || !conversation.botId) return false;

    guard.assertBotAllowed(conversation.botId);

    const bot = await loadBotCredentials(BotModel, conversation.botId);
    if (!bot) return false;

    const rawUserId = String(conversation.userId || '');
    const cleanUserId = stripChannelPrefixes(rawUserId);

    if (conversation.channel === 'whatsapp') {
      const digits = cleanUserId.replace(/\D/g, '');
      const chatId = rawUserId.includes('@')
        ? rawUserId
        : `${digits}@c.us`;
      if (!chatId.replace(/\D/g, '')) return false;

      const sessionManager = getWaManager();
      const cloudPhoneNumberId = String(bot.whatsappBusinessAccountId || '').trim();
      const cloudToken = decrypt(bot.whatsappApiKey) || String(env.WHATSAPP_ACCESS_TOKEN || '').trim();
      const isLid = rawUserId.trim().toLowerCase().endsWith('@lid');

      try {
        await sessionManager.sendMessage(String(conversation.botId), chatId, text);
        return true;
      } catch (err) {
        const canFallbackToCloud = Boolean(cloudPhoneNumberId && cloudToken && digits && !isLid)
          && ['WHATSAPP_SESSION_NOT_RUNNING', 'WHATSAPP_SESSION_NOT_READY'].includes(err?.code);
        if (!canFallbackToCloud) {
          throw err;
        }
        const response = await httpClient.post(
          `https://graph.facebook.com/v20.0/${cloudPhoneNumberId}/messages`,
          {
            messaging_product: 'whatsapp',
            to: digits,
            type: 'text',
            text: { body: text },
          },
          {
            headers: {
              Authorization: `Bearer ${cloudToken}`,
              'Content-Type': 'application/json',
            },
            timeout: 15_000,
          }
        );
        return Boolean(response?.data?.messages?.[0]?.id);
      }
    }

    if (!cleanUserId) return false;

    if (conversation.channel === 'facebook') {
      const fbToken = decrypt(bot.facebookApiKey);
      if (!fbToken) return false;
      const response = await httpClient.post(
        'https://graph.facebook.com/v22.0/me/messages',
        { recipient: { id: cleanUserId }, message: { text } },
        { params: { access_token: fbToken }, timeout: 15_000 }
      );
      return Boolean(response.data?.recipient_id || response.data?.message_id);
    }

    if (conversation.channel === 'instagram') {
      const igToken = decrypt(bot.instagramApiKey);
      if (!igToken) return false;
      const response = await httpClient.post(
        'https://graph.instagram.com/v22.0/me/messages',
        { recipient: { id: cleanUserId }, message: { text } },
        { params: { access_token: igToken }, timeout: 15_000 }
      );
      return Boolean(response.data?.recipient_id || response.data?.message_id);
    }

    return false;
  }

  return {
    deliverReply,
    deliverManualReply: deliverReply,
  };
}

const defaultDeliveryService = createChannelDeliveryService();

module.exports = {
  createChannelDeliveryService,
  deliverReply: defaultDeliveryService.deliverReply,
  deliverManualReply: defaultDeliveryService.deliverReply,
  stripChannelPrefixes,
};
