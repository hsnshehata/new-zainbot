const logger = require('../logger');
const PlatformSetting = require('../models/PlatformSetting');

const PLATFORM_SETTINGS_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const INVALID_WHATSAPP_MESSAGE_AR = 'رقم واتساب غير صحيح. أدخل رقماً مصرياً بصيغة 01xxxxxxxxx أو 201xxxxxxxxx أو +201xxxxxxxxx، أو اترك الحقل فارغاً لاستخدام الإعداد الافتراضي.';
const INVALID_MODEL_MESSAGE_AR = 'اسم الموديل غير صحيح. اختر موديلاً من القائمة أو اترك الحقل فارغاً لاستخدام الافتراضي.';
const INVALID_BOOLEAN_MESSAGE_AR = 'قيمة الإعداد غير صحيحة. يجب أن تكون true أو false.';
const OPENAI_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;

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
    defaultOpenAiModel: String(doc?.defaultOpenAiModel || '').trim(),
    assistantWriteToolsEnabled: Boolean(doc?.assistantWriteToolsEnabled),
    copilotEnabled: Boolean(doc?.copilotEnabled),
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

function normalizeOpenAiModelId(raw) {
  if (raw === null || raw === undefined) {
    return { valid: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return { valid: false, error: 'INVALID_OPENAI_MODEL', message: INVALID_MODEL_MESSAGE_AR };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: true, value: '' };
  }
  if (!OPENAI_MODEL_ID_PATTERN.test(trimmed)) {
    return { valid: false, error: 'INVALID_OPENAI_MODEL', message: INVALID_MODEL_MESSAGE_AR };
  }
  return { valid: true, value: trimmed };
}

function resolveDefaultOpenAiModel(dbValue) {
  const fromDb = String(dbValue || '').trim();
  if (fromDb) {
    return { value: fromDb, source: 'database' };
  }
  return { value: DEFAULT_OPENAI_MODEL, source: 'default' };
}

// Platform default chat model for bots with no model of their own. Read on
// every AI reply through the 60s cache; falls back to the built-in default
// when unset or when the settings read fails (never blocks a reply).
async function getPlatformDefaultOpenAiModel() {
  try {
    const cached = await getCachedPlatformSettings();
    return resolveDefaultOpenAiModel(cached.defaultOpenAiModel).value;
  } catch (err) {
    logger.warn('platform_settings_model_read_failed', { err: err.message });
    return DEFAULT_OPENAI_MODEL;
  }
}

function normalizeBooleanSetting(raw) {
  if (typeof raw !== 'boolean') {
    return {
      valid: false,
      error: 'INVALID_BOOLEAN_SETTING',
      message: INVALID_BOOLEAN_MESSAGE_AR,
    };
  }
  return { valid: true, value: raw };
}

// Phase 3 global kill switches: fail closed (false) on unset or read failure.
async function isAssistantWriteToolsEnabled() {
  try {
    const cached = await getCachedPlatformSettings();
    return Boolean(cached.assistantWriteToolsEnabled);
  } catch (err) {
    logger.warn('platform_settings_write_tools_read_failed', { err: err.message });
    return false;
  }
}

async function isCopilotEnabled() {
  try {
    const cached = await getCachedPlatformSettings();
    return Boolean(cached.copilotEnabled);
  } catch (err) {
    logger.warn('platform_settings_copilot_read_failed', { err: err.message });
    return false;
  }
}

module.exports = {
  PLATFORM_SETTINGS_CACHE_TTL_MS,
  DEFAULT_OPENAI_MODEL,
  normalizeEgyptianWhatsappNumber,
  normalizeOpenAiModelId,
  normalizeBooleanSetting,
  resolveSubscriptionWhatsapp,
  resolveDefaultOpenAiModel,
  getCachedPlatformSettings,
  getEffectiveSubscriptionWhatsapp,
  getPlatformDefaultOpenAiModel,
  isAssistantWriteToolsEnabled,
  isCopilotEnabled,
  invalidatePlatformSettingsCache,
};
