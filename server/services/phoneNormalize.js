'use strict';

// server/services/phoneNormalize.js
// Canonical Egyptian / E.164 phone normalization and WhatsApp JID helpers
// shared across merchant verification, create_order, and message_customer.

const EASTERN_ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

const JID_DOMAIN_PATTERN = /^([^@]+)@([a-z0-9._-]+)$/i;
const WHATSAPP_PREFIX_PATTERN = /^whatsapp_/i;

function normalizeArabicDigits(raw) {
  return String(raw ?? '')
    .replace(/[٠-٩]/g, (ch) => String(EASTERN_ARABIC_DIGITS.indexOf(ch)))
    .replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)));
}

function isLidJid(raw) {
  return typeof raw === 'string' && raw.trim().toLowerCase().endsWith('@lid');
}

function isGroupJid(raw) {
  return typeof raw === 'string' && (
    raw.trim().toLowerCase().endsWith('@g.us')
    || raw.trim().toLowerCase().endsWith('@broadcast')
  );
}

/**
 * Strips known WhatsApp JID domains (@c.us, @s.whatsapp.net, @lid, @g.us, @broadcast)
 * and optional multi-device suffixes (:12) from an identifier string.
 */
function stripWhatsappJid(raw) {
  if (raw === null || raw === undefined) return '';
  const trimmed = normalizeArabicDigits(String(raw)).trim();
  if (!trimmed) return '';

  const match = trimmed.match(JID_DOMAIN_PATTERN);
  const localPart = match ? match[1] : trimmed;
  // Remove optional WhatsApp multi-device suffix (e.g. "201012345678:12")
  const withoutDevice = localPart.includes(':') ? localPart.split(':')[0] : localPart;
  return withoutDevice.replace(WHATSAPP_PREFIX_PATTERN, '').trim();
}

/**
 * Normalizes an Egyptian or international phone number to canonical digits-only E.164
 * (e.g. "01012345678" -> "201012345678", "+20 10-1234-5678" -> "201012345678",
 * "201012345678@c.us" -> "201012345678").
 *
 * Returns '' for invalid inputs, group JIDs, or @lid JIDs (unless allowLid=true,
 * since WhatsApp LIDs are NOT phone numbers and must fail closed).
 */
function normalizePhoneToE164Digits(raw, options = {}) {
  const { defaultCountry = 'EG', allowLid = false } = options;
  if (raw === null || raw === undefined) return '';
  if (typeof raw !== 'string' && typeof raw !== 'number') return '';

  const trimmed = normalizeArabicDigits(String(raw)).trim();
  if (!trimmed) return '';

  if (trimmed.includes('@')) {
    const lower = trimmed.toLowerCase();
    if (lower.endsWith('@lid') && !allowLid) {
      return '';
    }
    if (lower.endsWith('@g.us') || lower.endsWith('@broadcast')) {
      return '';
    }
  }

  let candidate = stripWhatsappJid(trimmed);
  if (!candidate) return '';

  // Remove common phone formatting characters; reject if letters or unexpected symbols remain.
  candidate = candidate.replace(/[\s().-]+/g, '');
  if (candidate.startsWith('+')) {
    candidate = candidate.slice(1);
  }
  if (!/^\d+$/.test(candidate)) {
    return '';
  }

  // International dialing prefix "00..." -> strip leading "00"
  if (candidate.startsWith('00') && candidate.length >= 10) {
    candidate = candidate.slice(2);
  }

  // Egyptian mobile normalization:
  //   01xxxxxxxxx   (11 digits) -> 201xxxxxxxxx
  //   2001xxxxxxxxx (13 digits, common +20 01x typo) -> 201xxxxxxxxx
  if (defaultCountry === 'EG') {
    if (/^01\d{9}$/.test(candidate)) {
      candidate = `20${candidate.slice(1)}`;
    } else if (/^2001\d{9}$/.test(candidate)) {
      candidate = `20${candidate.slice(3)}`;
    }
  }

  // E.164 bounds: 8..15 digits, cannot start with 0.
  if (candidate.length < 8 || candidate.length > 15 || candidate.startsWith('0')) {
    return '';
  }

  return candidate;
}

/**
 * Parses a WhatsApp JID or phone string into structured parts.
 * For @lid / @g.us / @broadcast, `phone` is '' (fail closed).
 */
function parseWhatsappJid(raw, options = {}) {
  const value = String(raw ?? '').trim();
  const match = value.match(JID_DOMAIN_PATTERN);
  const domain = match ? match[2].toLowerCase() : '';
  const id = stripWhatsappJid(value);
  const isLid = domain === 'lid';
  const isGroup = domain === 'g.us' || domain === 'broadcast';
  const isUserJid = domain === 'c.us' || domain === 's.whatsapp.net';
  const phone = isLid || isGroup ? '' : normalizePhoneToE164Digits(value, options);

  return {
    raw: value,
    id,
    domain,
    isLid,
    isGroup,
    isUserJid,
    phone,
  };
}

/**
 * Formats a phone number or JID into a WhatsApp chatId (`<digits>@c.us`),
 * preserving an explicit `@lid` JID when passed.
 */
function toWhatsappChatId(raw, options = {}) {
  if (isLidJid(raw)) {
    return String(raw).trim();
  }
  const digits = normalizePhoneToE164Digits(raw, options);
  return digits ? `${digits}@c.us` : '';
}

/**
 * Masks all but the last 4 digits for safe UI display and audit logs.
 */
function maskPhone(raw) {
  const digits = normalizePhoneToE164Digits(raw) || stripWhatsappJid(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

/**
 * Resolves a real E.164 phone number from an inbound whatsapp-web.js message.
 * When `message.from` ends with `@lid`, calls `message.getContact()` to read
 * `contact.number`; fails closed ('') if unresolvable.
 */
async function resolveSenderPhoneFromMessage(message, options = {}) {
  const from = String(message?.from || '').trim();
  if (!from) return '';
  if (isGroupJid(from)) return '';

  if (isLidJid(from)) {
    if (typeof message?.getContact !== 'function') {
      return '';
    }
    try {
      const contact = await message.getContact();
      const contactNumber = contact?.number || contact?.id?.user || '';
      if (!contactNumber || String(contact?.id?.server || '').toLowerCase() === 'lid') {
        return '';
      }
      return normalizePhoneToE164Digits(contactNumber, options);
    } catch {
      return '';
    }
  }

  return normalizePhoneToE164Digits(from, options);
}

module.exports = {
  normalizeArabicDigits,
  isLidJid,
  isGroupJid,
  stripWhatsappJid,
  normalizePhoneToE164Digits,
  parseWhatsappJid,
  toWhatsappChatId,
  maskPhone,
  resolveSenderPhoneFromMessage,
};
