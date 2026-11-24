'use strict';

// Channel safety guard. Decides whether this app instance may run customer
// channels (WhatsApp sessions, Meta/Telegram webhooks, scheduled sends).
//
//   CHANNELS_MODE=off        (default) nothing external runs.
//   CHANNELS_MODE=allowlist  only bots listed in CHANNELS_ALLOWLIST_BOT_IDS run.
//   CHANNELS_MODE=on         every bot runs (production).
//
// This keeps a second copy of the app (staging, or a freshly cut over app)
// from answering real customers or taking over a WhatsApp session that
// another instance owns.

function mode() {
  const raw = String(process.env.CHANNELS_MODE || 'off').trim().toLowerCase();
  return ['on', 'allowlist'].includes(raw) ? raw : 'off';
}

function allowlist() {
  return new Set(
    String(process.env.CHANNELS_ALLOWLIST_BOT_IDS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

function isBotAllowed(botId) {
  const m = mode();
  if (m === 'on') return true;
  if (m === 'off') return false;
  return botId != null && allowlist().has(String(botId));
}

function anyChannelsEnabled() {
  return mode() !== 'off';
}

function backgroundJobsAllowed() {
  return mode() === 'on';
}

class ChannelsDisabledError extends Error {
  constructor(botId) {
    super('Channels are disabled for this bot on this server');
    this.code = 'CHANNELS_DISABLED';
    this.status = 409;
    this.botId = botId;
  }
}

function assertBotAllowed(botId) {
  if (!isBotAllowed(botId)) throw new ChannelsDisabledError(botId);
}

module.exports = {
  mode,
  isBotAllowed,
  anyChannelsEnabled,
  backgroundJobsAllowed,
  assertBotAllowed,
  ChannelsDisabledError,
};
