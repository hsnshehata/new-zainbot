'use strict';

// Circuit breaker for automated outbound replies on chat sessions.
//
// Why: dedupe-by-message-id cannot stop a bot-to-bot loop, because every
// looped message carries a fresh id. If the number linked to the platform
// (or any merchant number) ever talks to another automated system - or a
// bug makes us answer our own side effects - replies would bounce forever.
// This guard caps automated replies per sender and per bot inside a sliding
// window and opens a cooldown circuit when the cap is exceeded. Repeat
// trips double the sender cooldown up to a ceiling.
//
// In-memory by design: the guard protects a single running session process.
// It deliberately sits at the SEND point (just before message.reply), so
// inbound messages are still stored/processed and only the auto-reply is
// suppressed while the circuit is open.

const DEFAULTS = {
  // 8 auto-replies to one sender inside 30s means a machine on the other
  // end: a human cannot read, type and send that fast. Normal customers,
  // even rapid shoppers, stay far below this.
  windowMs: 30_000,
  maxPerSenderPerWindow: 8,
  senderCooldownMs: 5 * 60_000,
  maxSenderCooldownMs: 60 * 60_000,
  maxPerBotPerWindow: 120,
  botCooldownMs: 2 * 60_000,
};

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

// True when an inbound message sender is the session's own number.
// fromMe normally catches own messages, but some events/libraries deliver
// them with fromMe unset; comparing digit forms covers @c.us and plain ids.
function isOwnNumberMessage(from, ownWid) {
  const fromDigits = digitsOnly(from);
  const ownDigits = digitsOnly(ownWid);
  return Boolean(fromDigits && ownDigits && fromDigits === ownDigits);
}

function createAutoReplyGuard(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const now = options.now || (() => Date.now());

  // senderKey -> { times: number[], cooldownUntil: number, nextCooldownMs: number, trips: number }
  const senderState = new Map();
  // botId -> { times: number[], cooldownUntil: number }
  const botState = new Map();

  function prune(times, cutoff) {
    let idx = 0;
    while (idx < times.length && times[idx] < cutoff) idx += 1;
    if (idx > 0) times.splice(0, idx);
    return times;
  }

  function getSenderState(key) {
    let state = senderState.get(key);
    if (!state) {
      state = {
        times: [],
        cooldownUntil: 0,
        nextCooldownMs: config.senderCooldownMs,
        trips: 0,
      };
      senderState.set(key, state);
    }
    return state;
  }

  function getBotState(botId) {
    let state = botState.get(botId);
    if (!state) {
      state = { times: [], cooldownUntil: 0 };
      botState.set(botId, state);
    }
    return state;
  }

  // Returns { allowed: true } and records the reply, or
  // { allowed: false, reason, cooldownUntil } when the circuit is open.
  // Call exactly once per automated reply, right before sending it.
  function allowAndRecord(botId, sender) {
    const at = now();
    const cutoff = at - config.windowMs;
    const botKey = String(botId || 'unknown');
    const senderKey = `${botKey}:${String(sender || 'unknown')}`;

    const bot = getBotState(botKey);
    if (bot.cooldownUntil && at < bot.cooldownUntil) {
      return { allowed: false, reason: 'bot_circuit_open', cooldownUntil: bot.cooldownUntil };
    }
    prune(bot.times, cutoff);
    if (bot.times.length >= config.maxPerBotPerWindow) {
      bot.cooldownUntil = at + config.botCooldownMs;
      bot.times = [];
      return { allowed: false, reason: 'bot_circuit_tripped', cooldownUntil: bot.cooldownUntil };
    }

    const senderStateEntry = getSenderState(senderKey);
    if (senderStateEntry.cooldownUntil && at < senderStateEntry.cooldownUntil) {
      return {
        allowed: false,
        reason: 'sender_circuit_open',
        cooldownUntil: senderStateEntry.cooldownUntil,
      };
    }
    prune(senderStateEntry.times, cutoff);
    if (senderStateEntry.times.length >= config.maxPerSenderPerWindow) {
      senderStateEntry.trips += 1;
      senderStateEntry.cooldownUntil = at + senderStateEntry.nextCooldownMs;
      senderStateEntry.nextCooldownMs = Math.min(
        senderStateEntry.nextCooldownMs * 2,
        config.maxSenderCooldownMs
      );
      senderStateEntry.times = [];
      return {
        allowed: false,
        reason: 'sender_circuit_tripped',
        cooldownUntil: senderStateEntry.cooldownUntil,
        trips: senderStateEntry.trips,
      };
    }

    bot.times.push(at);
    senderStateEntry.times.push(at);
    return { allowed: true };
  }

  function reset() {
    senderState.clear();
    botState.clear();
  }

  return { allowAndRecord, reset, config };
}

module.exports = {
  DEFAULTS: { ...DEFAULTS },
  createAutoReplyGuard,
  isOwnNumberMessage,
};
