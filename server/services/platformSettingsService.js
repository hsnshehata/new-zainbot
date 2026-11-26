const logger = require('../logger');
const PlatformSetting = require('../models/PlatformSetting');

const PLATFORM_SETTINGS_CACHE_TTL_MS = 60 * 1000;
const INVALID_WHATSAPP_MESSAGE_AR = 'رقم واتساب غير صحيح. أدخل رقماً مصرياً بصيغة 01xxxxxxxxx أو 201xxxxxxxxx أو +201xxxxxxxxx، أو اترك الحقل فارغاً لاستخدام الإعداد الافتراضي.';

// Small in-memory cache (60s TTL) so public /api/config reads do not hit
// MongoDB on every landing page load. Refreshes naturally by TTL and is
// invalidated immediately when an admin saves new settings.
let settingsCache = null;
let settingsCacheAt = 0;

function normalizeEgyptianWhatsappNumber(raw) {
  if (raw === null || raw === undefined) {
    return { valid: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return {
      valid: false,
      error: 'INVALID_WHATSAPP_NUMBER',
      message: INVALID_WHATSAPP_MESSAGE_AR,
    };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: true, value: '' };
  }

  const compact = trimmed.replace(/[\s-]+/g, '');
  if (/^01\d{9}$/.test(compact)) {
    return { valid: true, value: compact };
  }
  const intlMatch = compact.match(/^\+?20(1\d{9})$/);
  if (intlMatch) {
    return { valid: true, value: `0${intlMatch[1]}` };
  }

  return {
    valid: false,
    error: 'INVALID_WHATSAPP_NUMBER',
    message: INVALID_WHATSAPP_MESSAGE_AR,
  };
}

function resolveSubscriptionWhatsapp(dbValue) {
  const fromDb = String(dbValue || '').trim();
  if (fromDb) {
    return { value: fromDb, source: 'database' };
  }
  const fromEnv = String(process.env.SUBSCRIPTION_WHATSAPP_NUMBER || '').trim();
  if (fromEnv) {
    return { value: fromEnv, source: 'env' };
  }
  return { value: '', source: 'empty' };
}

async function getCachedPlatformSettings() {
  const now = Date.now();
  if (settingsCache && now - settingsCacheAt < PLATFORM_SETTINGS_CACHE_TTL_MS) {
    return settingsCache;
  }
  const doc = await PlatformSetting.getConfig();
  settingsCache = {
    subscriptionWhatsappNumber: String(doc?.subscriptionWhatsappNumber || '').trim(),
  };
  settingsCacheAt = now;
  return settingsCache;
}

async function getEffectiveSubscriptionWhatsapp() {
  try {
    const cached = await getCachedPlatformSettings();
    return resolveSubscriptionWhatsapp(cached.subscriptionWhatsappNumber);
  } catch (err) {
    logger.warn('platform_settings_read_failed', { err: err.message });
    return resolveSubscriptionWhatsapp('');
  }
}

function invalidatePlatformSettingsCache() {
  settingsCache = null;
  settingsCacheAt = 0;
}

module.exports = {
  PLATFORM_SETTINGS_CACHE_TTL_MS,
  normalizeEgyptianWhatsappNumber,
  resolveSubscriptionWhatsapp,
  getCachedPlatformSettings,
  getEffectiveSubscriptionWhatsapp,
  invalidatePlatformSettingsCache,
};
