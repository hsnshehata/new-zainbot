// server/controllers/whatsappController.js
const { processMessage } = require("../botEngine");
const WhatsAppSession = require("../models/WhatsAppSession");
const mongoose = require("mongoose");

// Webhook verification: the old verifyWebhook handler was removed. It was
// never mounted (the real GET verification lives in routes/webhook.js via
// verifySubscription with an env token and timing-safe comparison), and a
// second, unused verifier with plain string equality only invites
// accidental mounting later.

// Process incoming WhatsApp messages
const processWebhook = async (req, res) => {
  try {
    const body = req.body;

    if (body.object) {
      if (
        body.entry &&
        body.entry[0] &&
        body.entry[0].changes &&
        body.entry[0].changes[0] &&
        body.entry[0].changes[0].value &&
        body.entry[0].changes[0].value.messages &&
        body.entry[0].changes[0].value.messages[0]
      ) {
        const messageData = body.entry[0].changes[0].value.messages[0];
        const logger = require('../logger');
        logger.info('whatsapp_message_data', { data: messageData });

        const userId = messageData.from; // WhatsApp user ID
        const messageId = messageData.id; // Unique message ID
        let message = "";
        let isImage = false;
        let isVoice = false;
        let mediaUrl = null;

        // Check message type and extract content
        logger.info('whatsapp_message_type', { type: messageData.type });
        if (messageData.type === "text") {
          message = messageData.text.body;
          // Metadata-only: message text is customer PII, log shape not content
          logger.info('whatsapp_text_message', { messageLength: (message || '').length });
        } else if (messageData.type === "image") {
          isImage = true;
          mediaUrl = messageData.image.id; // Get the media ID
          logger.info('whatsapp_image_message', { mediaUrl });
        } else if (messageData.type === "audio") {
          isVoice = true;
          mediaUrl = messageData.audio.id; // Get the media ID
          logger.info('whatsapp_audio_message', { mediaUrl });
        } else {
          logger.warn('whatsapp_message_unsupported', { type: messageData.type });
          return res.sendStatus(200); // Acknowledge but don't process
        }

        // If it's a media message, fetch the media URL
        if (isImage || isVoice) {
          try {
            logger.info('whatsapp_fetch_media_url', { mediaUrl });
            const response = await fetch(
              `https://graph.facebook.com/v20.0/${mediaUrl}`,
              {
                headers: {
                  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                },
              }
            );
            const mediaData = await response.json();
            // Metadata-only: mediaData carries a signed media URL, log shape not content
            logger.info('whatsapp_media_fetch_response', { hasUrl: !!(mediaData && mediaData.url), mimeType: mediaData && mediaData.mime_type });
            if (mediaData.url) {
              mediaUrl = mediaData.url; // Update mediaUrl with the actual URL
              logger.info('whatsapp_media_url_fetched', { mediaId: mediaUrl });
            } else {
              logger.warn('whatsapp_media_url_fetch_failed', { mediaUrl });
              return res.sendStatus(200);
            }
          } catch (err) {
            logger.error('whatsapp_media_url_error', { err: err.message, stack: err.stack });
            return res.sendStatus(200);
          }
        }

        // Find the bot associated with this WhatsApp number
        const bot = await mongoose.model("Bot").findOne({
          whatsappBusinessAccountId: body.entry[0].changes[0].value.metadata.phone_number_id,
        });

        if (!bot) {
          logger.warn('whatsapp_bot_not_found', { phoneNumberId: body.entry[0].changes[0].value.metadata.phone_number_id });
          return res.sendStatus(200);
        }

        // Align with facebookController: an inactive bot must not process
        // messages. Still ack 200 so Meta does not retry-deliver.
        if (!bot.isActive) {
          logger.warn('whatsapp_bot_inactive', { botId: bot._id, name: bot.name });
          return res.sendStatus(200);
        }

        logger.info('whatsapp_processing', { userId, botId: bot._id, messageId, isImage, isVoice });

        // Process the message using botEngine
        const reply = await processMessage(
          bot._id,
          userId,
          message || mediaUrl, // Use mediaUrl if message is empty
          isImage,
          isVoice,
          messageId,
          "whatsapp",
          mediaUrl
        );

        if (reply === null) {
          logger.info('whatsapp_muted', { userId });
          return res.sendStatus(200);
        }

        // Send reply back to WhatsApp
        await fetch(
          `https://graph.facebook.com/v20.0/${body.entry[0].changes[0].value.metadata.phone_number_id}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: userId,
              type: "text",
              text: { body: reply },
            }),
          }
        );

        // botId must come from the loaded bot document: a bare `botId`
        // variable does not exist in this scope, and the ReferenceError
        // after the reply is sent makes Meta retry the webhook and
        // deliver duplicate replies to the customer.
        logger.info('whatsapp_reply_sent', { userId, botId: bot._id, reply });
      }
      res.sendStatus(200);
    } else {
      logger.warn('whatsapp_invalid_payload');
      res.sendStatus(404);
    }
  } catch (err) {
    logger.error('whatsapp_webhook_error', { err: err.message, stack: err.stack });
    res.sendStatus(500);
  }
};

// توليد وجلب كيو ار كود لواتساب
const activeWaSessions = new Map(); // botId -> { connected, qrCode, updatedAt }

const getSession = async (req, res) => {
  try {
    const { botId } = req.query;
    const session = activeWaSessions.get(botId) || { connected: false, qrCode: null };
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب جلسة الواتساب' });
  }
};

const connectWithQR = async (req, res) => {
  try {
    const { botId } = req.body;
    const QRCode = require('qrcode');
    const qrText = `https://wa.me/settings/qr?pair=ZB-${botId.slice(-6)}-${Date.now().toString(36)}`;
    const qrDataUrl = await QRCode.toDataURL(qrText, { margin: 2, color: { dark: '#00F0FF', light: '#0A0C1B' } });
    
    const sessionData = {
      connected: false,
      qrCode: qrDataUrl,
      updatedAt: new Date()
    };
    activeWaSessions.set(botId, sessionData);

    res.json({ success: true, data: sessionData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في توليد رمز الكيو ار كود' });
  }
};

const disconnect = async (req, res) => {
  try {
    const { botId } = req.body;
    activeWaSessions.delete(botId);
    res.json({ success: true, message: 'تم قطع الاتصال بالواتساب' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في قطع الاتصال' });
  }
};

module.exports = { processWebhook, getSession, connectWithQR, disconnect };
