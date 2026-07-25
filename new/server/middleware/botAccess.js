const mongoose = require('mongoose');
const Bot = require('../models/Bot');
const logger = require('../logger');

function getBotAccessFilter(req, botId) {
  const subjectUserId = req.auth?.subjectUserId || req.user?.userId;
  const actorRole = req.auth?.actorRole || req.user?.role;
  const isImpersonating = Boolean(req.auth?.isImpersonating);

  if (actorRole === 'superadmin' && !isImpersonating) {
    return { _id: botId };
  }

  return { _id: botId, userId: subjectUserId };
}

async function loadAccessibleBot(req, res, next) {
  const botId = req.params.id
    || req.params.botId
    || req.query.botId
    || req.body?.botId;
  if (!botId) {
    return res.status(400).json({
      success: false,
      error: 'BOT_ID_REQUIRED',
      message: 'A bot id is required',
    });
  }
  if (!mongoose.isValidObjectId(botId)) {
    return res.status(404).json({
      success: false,
      error: 'BOT_NOT_FOUND',
      message: 'Bot not found',
    });
  }

  try {
    const bot = await Bot.findOne(getBotAccessFilter(req, botId));
    if (!bot) {
      return res.status(404).json({
        success: false,
        error: 'BOT_NOT_FOUND',
        message: 'Bot not found',
      });
    }

    req.bot = bot;
    return next();
  } catch (error) {
    logger.error('bot_access_check_failed', {
      requestId: req.requestId,
      botId,
      error: error.message,
    });
    return next(error);
  }
}

module.exports = {
  getBotAccessFilter,
  loadAccessibleBot,
};
