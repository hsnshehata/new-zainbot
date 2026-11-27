'use strict';

// Single source of truth for the platform's own (ZainBot Main) bot id.
const DEFAULT_PLATFORM_BOT_ID = '6a5fe76cb80db97e78937854';

function getPlatformBotId() {
  return (process.env.PLATFORM_WHATSAPP_BOT_ID || '').trim() || DEFAULT_PLATFORM_BOT_ID;
}

module.exports = { DEFAULT_PLATFORM_BOT_ID, getPlatformBotId };
