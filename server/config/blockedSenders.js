'use strict';

// Platform-wide sender blocklist.
//
// Senders on this list are never replied to and never processed, on any
// channel. Purpose: known automated assistant numbers (e.g. Instinct
// assistant lines) that merchants may contact from a number also linked to
// ZainBot. Without this, an auto-reply from us can trigger an automated
// reply from them, and the two systems loop forever.
//
// Add numbers via env BLOCKED_SENDER_NUMBERS (comma-separated, any format;
// digits are compared) or extend DEFAULT_BLOCKED_SENDERS below. Per the
// merchant's instruction, only numbers he explicitly names go in the list.

const DEFAULT_BLOCKED_SENDERS = [
  '16506588328', // Instinct assistant (seen in merchant screenshot)
];

const hitCounters = new Map(); // digits -> count

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function getBlockedSenders(env = process.env) {
  const fromEnv = String(env.BLOCKED_SENDER_NUMBERS || '')
    .split(',')
    .map(digitsOnly)
    .filter(Boolean);
  return new Set([...DEFAULT_BLOCKED_SENDERS, ...fromEnv]);
}

// Returns the cumulative hit count for this sender when blocked, else 0.
function recordBlockedSenderHit(from, blockedSet = getBlockedSenders()) {
  const digits = digitsOnly(from);
  if (!digits || !blockedSet.has(digits)) return 0;
  const next = (hitCounters.get(digits) || 0) + 1;
  hitCounters.set(digits, next);
  return next;
}

function isBlockedSender(from, blockedSet = getBlockedSenders()) {
  const digits = digitsOnly(from);
  return Boolean(digits && blockedSet.has(digits));
}

function getBlockedSenderCounters() {
  return Object.fromEntries(hitCounters);
}

module.exports = {
  DEFAULT_BLOCKED_SENDERS: [...DEFAULT_BLOCKED_SENDERS],
  getBlockedSenders,
  isBlockedSender,
  recordBlockedSenderHit,
  getBlockedSenderCounters,
};
