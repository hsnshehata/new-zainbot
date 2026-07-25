// server/services/webhookDispatcher.js
const crypto = require('crypto');
const axios = require('axios');
const WebhookConfig = require('../models/WebhookConfig');
const WebhookLog = require('../models/WebhookLog');
const logger = require('../logger');

/**
 * Dispatches an event payload to registered customer webhook URLs.
 * @param {String} userId - User owner ID
 * @param {String} botId - Bot ID
 * @param {String} event - Event name (e.g. 'message.received', 'message.sent', 'order.created', 'customer.created')
 * @param {Object} payload - Payload object
 */
async function dispatchWebhook(userId, botId, event, payload) {
  try {
    // Find active webhooks for this user/bot subscribed to this event
    const webhooks = await WebhookConfig.find({
      userId,
      botId,
      events: event,
      isActive: true
    });

    if (webhooks.length === 0) {
      return;
    }

    const payloadString = JSON.stringify(payload);

    for (const webhook of webhooks) {
      // Calculate signature: HMAC-SHA256 of the payload using webhook secret
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(payloadString)
        .digest('hex');

      logger.info(`📤 Dispatching webhook event '${event}' to ${webhook.url}`);

      // Perform POST call
      let responseStatus = 0;
      let responseBody = '';
      let success = false;

      try {
        const response = await axios.post(webhook.url, payloadString, {
          headers: {
            'Content-Type': 'application/json',
            'X-ZainBot-Signature': signature,
            'X-ZainBot-Event': event,
            'User-Agent': 'ZainBot-Webhook-Dispatcher/2.0'
          },
          timeout: 8000 // 8 seconds timeout
        });

        responseStatus = response.status;
        responseBody = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
        success = responseStatus >= 200 && responseStatus < 300;
      } catch (err) {
        success = false;
        responseStatus = err.response ? err.response.status : 500;
        responseBody = err.response 
          ? (typeof err.response.data === 'object' ? JSON.stringify(err.response.data) : String(err.response.data)) 
          : err.message;
      }

      // Log attempts in database
      await WebhookLog.create({
        userId,
        botId,
        webhookId: webhook._id,
        event,
        url: webhook.url,
        payload,
        responseStatus,
        responseBody: responseBody.slice(0, 1500), // Limit storage size
        success,
        attempts: 1
      });

      logger.info(`📬 Webhook delivery result: ${success ? 'SUCCESS' : 'FAILED'} (Status: ${responseStatus})`);
    }
  } catch (err) {
    logger.error('❌ Error dispatching webhook:', { err });
  }
}

module.exports = {
  dispatchWebhook
};
