const USER_PRIVATE_FIELDS = new Set([
  'password',
  'sessionVersion',
  'googleId',
  'telegramLinkCode',
  'telegramLinkExpiresAt',
]);

const BOT_SECRET_FIELDS = new Set([
  'facebookApiKey',
  'instagramApiKey',
  'whatsappApiKey',
  'userApiKey',
  'backupApiKey',
  'telegramLinkCode',
  'telegramLinkExpiresAt',
]);

function toPlain(value) {
  if (!value) {
    return value;
  }
  if (typeof value.toObject === 'function') {
    return value.toObject({ getters: false, virtuals: false, transform: false });
  }
  return { ...value };
}

function serializeUser(user, options = {}) {
  const value = toPlain(user);
  if (!value) {
    return value;
  }

  for (const field of USER_PRIVATE_FIELDS) {
    delete value[field];
  }

  if (Array.isArray(value.bots)) {
    value.bots = options.includeBots
      ? value.bots.map((bot) => serializeBot(bot))
      : value.bots.map((bot) => String(bot?._id || bot));
  }

  value.channelConnections = {
    telegram: Boolean(value.telegramUserId),
  };
  delete value.telegramUserId;

  return value;
}

function serializeBot(bot) {
  const value = toPlain(bot);
  if (!value) {
    return value;
  }

  const credentialStatus = {
    user: Boolean(value.userApiKey),
    backup: Boolean(value.backupApiKey),
  };

  for (const field of BOT_SECRET_FIELDS) {
    delete value[field];
  }

  if (value.userId && typeof value.userId === 'object') {
    value.userId = {
      _id: value.userId._id,
      username: value.userId.username,
      email: value.userId.email,
      role: value.userId.role,
      status: value.userId.status,
      subscriptionTier: value.userId.subscriptionTier,
    };
  }

  value.connections = {
    facebook: Boolean(value.facebookPageId),
    instagram: Boolean(value.instagramPageId),
    whatsapp: Boolean(value.whatsappBusinessAccountId),
    telegram: Boolean(value.telegramUserId),
  };
  value.credentialStatus = credentialStatus;

  return value;
}

function serializeChannelConnection(connection) {
  const value = toPlain(connection);
  if (!value) {
    return value;
  }

  const externalAccountId = String(value.externalAccountId || '');
  value.externalAccount = externalAccountId
    ? `${'*'.repeat(Math.min(8, Math.max(0, externalAccountId.length - 4)))}${externalAccountId.slice(-4)}`
    : '';
  delete value.externalAccountId;
  delete value.credentialId;

  if (value.userId) value.userId = String(value.userId?._id || value.userId);
  if (value.botId) value.botId = String(value.botId?._id || value.botId);
  return value;
}

module.exports = {
  serializeUser,
  serializeBot,
  serializeChannelConnection,
  USER_PRIVATE_FIELDS,
  BOT_SECRET_FIELDS,
};
