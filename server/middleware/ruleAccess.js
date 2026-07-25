const mongoose = require('mongoose');
const Rule = require('../models/Rule');
const Bot = require('../models/Bot');
const { getBotAccessFilter, loadAccessibleBot } = require('./botAccess');

function isDirectSuperadmin(req) {
  return (req.auth?.actorRole || req.user?.role) === 'superadmin'
    && !req.auth?.isImpersonating;
}

function requireBotOrGlobalAccess(req, res, next) {
  const botId = req.params.botId || req.query.botId || req.body?.botId;
  if (botId) {
    return loadAccessibleBot(req, res, next);
  }
  if (isDirectSuperadmin(req)) {
    return next();
  }
  return res.status(400).json({
    success: false,
    error: 'BOT_ID_REQUIRED',
    message: 'A bot id is required',
  });
}

async function loadAccessibleRule(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: 'Rule not found' });
  }

  try {
    const rule = await Rule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ message: 'Rule not found' });
    }

    if (rule.type === 'global') {
      if (!isDirectSuperadmin(req)) {
        return res.status(404).json({ message: 'Rule not found' });
      }
    } else {
      const accessibleBot = await Bot.exists(getBotAccessFilter(req, rule.botId));
      if (!accessibleBot) {
        return res.status(404).json({ message: 'Rule not found' });
      }
    }

    req.rule = rule;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireGlobalRuleAdmin(req, res, next) {
  const includesGlobalRule = req.body?.type === 'global'
    || req.body?.rules?.some((rule) => rule?.type === 'global');
  if (includesGlobalRule && !isDirectSuperadmin(req)) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Only a superadmin can manage global rules',
    });
  }
  return next();
}

module.exports = {
  isDirectSuperadmin,
  requireBotOrGlobalAccess,
  loadAccessibleRule,
  requireGlobalRuleAdmin,
};
