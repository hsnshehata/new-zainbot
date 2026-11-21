// server/controllers/adminKeysController.js
const mongoose = require('mongoose');
const ProviderKey = require('../models/ProviderKey');
const AiCredential = require('../models/AiCredential');
const logger = require('../logger');
const {
  buildCredentialContext,
  encryptCredentialSecret,
  parseCredentialEncryptionKey,
} = require('../services/AiCredentialCrypto');
const {
  MODEL_LABEL,
  PRIORITY_LABEL,
  LAST4_LABEL,
  readLabel,
  buildCredentialLabels,
} = require('../services/aiCredentialLabels');

// Check if user is superadmin
const checkSuperadmin = (req) => {
  return req.auth?.actorRole === 'superadmin' && !req.auth?.isImpersonating;
};

// Encrypted-on-write: when CREDENTIAL_ENCRYPTION_KEY is configured, new keys
// are stored as encrypted AiCredential documents (AES-256-GCM control plane)
// instead of legacy plaintext ProviderKey documents. The admin UI contract is
// preserved: responses carry the same fields (with storage: 'encrypted'), and
// update/delete route by the 'cred_' id prefix. Legacy plaintext documents
// keep working through aiKeyResolver until migrated with
// scripts/migrateProviderKeysToCredentials.js (dry-run default).
function encryptionConfigured(environment = process.env) {
  try {
    parseCredentialEncryptionKey(environment.CREDENTIAL_ENCRYPTION_KEY);
    return true;
  } catch (_error) {
    return false;
  }
}

const CRED_ID_PREFIX = 'cred_';

function serializeProviderKey(key) {
  const rawKey = key.apiKey || '';
  const value = typeof key.toObject === 'function' ? key.toObject() : { ...key };
  value.configured = Boolean(rawKey);
  value.last4 = rawKey ? rawKey.slice(-4) : '';
  value.storage = 'legacy_plaintext';
  delete value.apiKey;
  return value;
}

function serializeCredential(credential) {
  return {
    _id: CRED_ID_PREFIX + String(credential._id),
    name: credential.name,
    provider: credential.provider,
    baseUrl: credential.baseUrl || '',
    defaultModel: readLabel(credential.labels, MODEL_LABEL),
    priority: Number(readLabel(credential.labels, PRIORITY_LABEL)) || 1,
    isActive: credential.status === 'active',
    status: credential.status === 'error' ? 'failed' : 'working',
    errorMessage: credential.lastErrorCode || '',
    configured: true,
    last4: readLabel(credential.labels, LAST4_LABEL),
    storage: 'encrypted',
    createdAt: credential.createdAt,
  };
}

function actorObjectId(req) {
  try {
    return new mongoose.Types.ObjectId(req.auth?.actorUserId);
  } catch (_error) {
    return new mongoose.Types.ObjectId('000000000000000000000000');
  }
}

// Add Provider Key
exports.addKey = async (req, res) => {
  try {
    if (!checkSuperadmin(req)) {
      return res.status(403).json({ success: false, message: 'غير مصرح للوصول إلى هذه البيانات.' });
    }

    const { name, provider, apiKey, baseUrl, defaultModel, priority } = req.body;
    if (!name || !provider || !apiKey || !defaultModel) {
      return res.status(400).json({ success: false, message: 'الحقول المطلوبة مفقودة.' });
    }

    if (encryptionConfigured()) {
      const normalizedProvider = String(provider).trim().toLowerCase();
      const actorId = actorObjectId(req);
      const id = new mongoose.Types.ObjectId();
      let encrypted;
      try {
        encrypted = encryptCredentialSecret(apiKey, {
          context: buildCredentialContext(id, normalizedProvider),
        });
      } catch (err) {
        logger.error('admin_key_encrypt_failed', { error: err.message });
        return res.status(500).json({ success: false, message: 'فشل في تشفير المفتاح الجديد.' });
      }

      try {
        const credential = await AiCredential.create({
          _id: id,
          name: String(name).trim(),
          provider: normalizedProvider,
          baseUrl: baseUrl && String(baseUrl).startsWith('https://') ? String(baseUrl).trim() : '',
          ...encrypted,
          status: 'active',
          labels: buildCredentialLabels({
            defaultModel,
            priority: priority !== undefined ? Number(priority) : 1,
            last4: String(apiKey).slice(-4),
          }),
          createdBy: actorId,
          updatedBy: actorId,
        });
        return res.status(201).json({ success: true, data: serializeCredential(credential) });
      } catch (err) {
        if (err && err.code === 11000) {
          return res.status(409).json({ success: false, message: 'يوجد مفتاح بنفس الاسم ونفس المزود بالفعل.' });
        }
        throw err;
      }
    }

    // Encryption not configured: legacy plaintext path (warning logged; the
    // encrypted control plane stays the documented target).
    logger.warn('provider_key_plaintext_created', {
      name,
      provider,
      guidance: 'prefer_encrypted_ai_credential',
    });
    const newKey = await ProviderKey.create({
      name,
      provider,
      apiKey,
      baseUrl,
      defaultModel,
      priority: priority !== undefined ? Number(priority) : 1
    });

    res.status(201).json({ success: true, data: serializeProviderKey(newKey) });
  } catch (err) {
    logger.error('provider_key_add_failed', { error: err.message });
    res.status(500).json({ success: false, message: 'فشل في إضافة المفتاح الجديد.' });
  }
};

// List Provider Keys
exports.listKeys = async (req, res) => {
  try {
    if (!checkSuperadmin(req)) {
      return res.status(403).json({ success: false, message: 'غير مصرح للوصول إلى هذه البيانات.' });
    }

    // Tombstones (legacy docs deactivated by migration/rotation upgrade) are
    // superseded by their encrypted credential and are hidden from the list
    // so they do not keep tripping the legacy-plaintext banner.
    const keys = await ProviderKey.find({ errorMessage: { $ne: 'migrated_to_encrypted_ai_credential' } })
      .select('+apiKey')
      .sort({ priority: 1 });
    const credentials = await AiCredential.find({}).sort({ createdAt: 1 }).lean();
    res.status(200).json({
      success: true,
      data: [
        ...keys.map(serializeProviderKey),
        ...credentials.map(serializeCredential),
      ],
    });
  } catch (err) {
    logger.error('provider_key_list_failed', { error: err.message });
    res.status(500).json({ success: false, message: 'فشل في تحميل مفاتيح السيرفر.' });
  }
};

// Update Provider Key
exports.updateKey = async (req, res) => {
  try {
    if (!checkSuperadmin(req)) {
      return res.status(403).json({ success: false, message: 'غير مصرح للوصول إلى هذه البيانات.' });
    }

    const { id } = req.params;
    const { name, provider, apiKey, baseUrl, defaultModel, priority, isActive, status } = req.body;

    if (String(id).startsWith(CRED_ID_PREFIX)) {
      const credentialId = String(id).slice(CRED_ID_PREFIX.length);
      const credential = await AiCredential.findById(credentialId);
      if (!credential) {
        return res.status(404).json({ success: false, message: 'المفتاح المطلوب غير موجود.' });
      }

      const actorId = actorObjectId(req);
      const update = { updatedBy: actorId };
      const labels = [...(credential.labels || [])];
      const setLabel = (prefix, value) => {
        const index = labels.findIndex((label) => label.startsWith(prefix));
        if (index >= 0) labels.splice(index, 1);
        if (value !== undefined && value !== '') labels.push((prefix + String(value)).slice(0, 50));
      };

      if (name !== undefined) update.name = String(name).trim();
      if (baseUrl !== undefined) {
        update.baseUrl = baseUrl && String(baseUrl).startsWith('https://') ? String(baseUrl).trim() : '';
      }
      if (defaultModel !== undefined) setLabel(MODEL_LABEL, defaultModel);
      if (priority !== undefined) setLabel(PRIORITY_LABEL, Number(priority));
      if (isActive !== undefined) update.status = isActive ? 'active' : 'disabled';
      if (status !== undefined) {
        update.status = status === 'working' ? 'active' : 'error';
        if (status === 'working') {
          update.lastErrorCode = '';
          update.failureCount = 0;
        }
      }
      if (apiKey !== undefined && apiKey !== '') {
        const encrypted = encryptCredentialSecret(apiKey, {
          context: buildCredentialContext(credential._id, credential.provider),
        });
        Object.assign(update, encrypted);
        update.lastErrorCode = '';
        setLabel(LAST4_LABEL, String(apiKey).slice(-4));
      }
      if (labels.length) update.labels = labels;

      const saved = await AiCredential.findByIdAndUpdate(credential._id, { $set: update }, { new: true });
      return res.status(200).json({ success: true, data: serializeCredential(saved) });
    }

    const key = await ProviderKey.findById(id).select('+apiKey');
    if (!key) {
      return res.status(404).json({ success: false, message: 'المفتاح المطلوب غير موجود.' });
    }

    // Rotating the secret of a legacy plaintext key while encryption is
    // configured upgrades that key into the encrypted control plane instead
    // of writing new plaintext: create the AiCredential, then unset and
    // deactivate the legacy document (same semantics as the migration
    // script, per key, from the admin UI).
    if (apiKey !== undefined && apiKey !== '' && encryptionConfigured()) {
      const targetName = name !== undefined ? String(name).trim() : key.name;
      const normalizedProvider = String(key.provider || '').trim().toLowerCase();
      const conflict = await AiCredential.findOne({ name: targetName, provider: normalizedProvider }).lean();
      if (conflict) {
        return res.status(409).json({ success: false, message: 'يوجد مفتاح مشفر بنفس الاسم ونفس المزود بالفعل.' });
      }

      const actorId = actorObjectId(req);
      const credentialId = new mongoose.Types.ObjectId();
      const encrypted = encryptCredentialSecret(apiKey, {
        context: buildCredentialContext(credentialId, normalizedProvider),
      });
      const nextBaseUrl = baseUrl !== undefined ? baseUrl : key.baseUrl;
      const credential = await AiCredential.create({
        _id: credentialId,
        name: targetName,
        provider: normalizedProvider,
        baseUrl: nextBaseUrl && String(nextBaseUrl).startsWith('https://') ? String(nextBaseUrl).trim() : '',
        ...encrypted,
        status: 'active',
        labels: buildCredentialLabels({
          defaultModel: defaultModel !== undefined ? defaultModel : key.defaultModel,
          priority: priority !== undefined ? Number(priority) : key.priority,
          last4: String(apiKey).slice(-4),
        }),
        createdBy: actorId,
        updatedBy: actorId,
      });

      await ProviderKey.updateOne(
        { _id: key._id },
        {
          $unset: { apiKey: 1 },
          $set: {
            isActive: false,
            errorMessage: 'migrated_to_encrypted_ai_credential',
            lastTested: new Date(),
          },
        }
      );

      return res.status(200).json({ success: true, data: serializeCredential(credential) });
    }

    if (name !== undefined) key.name = name;
    if (provider !== undefined) key.provider = provider;
    if (apiKey !== undefined && apiKey !== '') {
      logger.warn('provider_key_plaintext_updated', {
        id: String(key._id),
        guidance: 'prefer_encrypted_ai_credential',
      });
      key.apiKey = apiKey;
    }
    if (baseUrl !== undefined) key.baseUrl = baseUrl;
    if (defaultModel !== undefined) key.defaultModel = defaultModel;
    if (priority !== undefined) key.priority = Number(priority);
    if (isActive !== undefined) key.isActive = isActive;
    if (status !== undefined) {
      key.status = status;
      if (status === 'working') {
        key.errorMessage = '';
      }
    }

    await key.save();
    res.status(200).json({ success: true, data: serializeProviderKey(key) });
  } catch (err) {
    logger.error('provider_key_update_failed', { error: err.message });
    res.status(500).json({ success: false, message: 'فشل في تحديث إعدادات المفتاح.' });
  }
};

// Reset/Re-enable all failed keys
exports.resetAllFailedKeys = async (req, res) => {
  try {
    if (!checkSuperadmin(req)) {
      return res.status(403).json({ success: false, message: 'غير مصرح للوصول إلى هذه البيانات.' });
    }

    await ProviderKey.updateMany({ isActive: true }, { status: 'working', errorMessage: '' });
    await AiCredential.updateMany(
      { status: 'error' },
      { status: 'active', failureCount: 0, lastErrorCode: '' }
    );
    res.status(200).json({ success: true, message: 'تم إعادة تفعيل وفحص كافة مفاتيح السيرفر بنجاح.' });
  } catch (err) {
    logger.error('provider_key_reset_failed', { error: err.message });
    res.status(500).json({ success: false, message: 'فشل في إعادة تفعيل المفاتيح.' });
  }
};

// Delete Provider Key
exports.deleteKey = async (req, res) => {
  try {
    if (!checkSuperadmin(req)) {
      return res.status(403).json({ success: false, message: 'غير مصرح للوصول إلى هذه البيانات.' });
    }

    const { id } = req.params;
    if (String(id).startsWith(CRED_ID_PREFIX)) {
      const credential = await AiCredential.findByIdAndDelete(String(id).slice(CRED_ID_PREFIX.length));
      if (!credential) {
        return res.status(404).json({ success: false, message: 'المفتاح غير موجود.' });
      }
      return res.status(200).json({ success: true, message: 'تم حذف المفتاح بنجاح.' });
    }

    const key = await ProviderKey.findByIdAndDelete(id);
    if (!key) {
      return res.status(404).json({ success: false, message: 'المفتاح غير موجود.' });
    }

    res.status(200).json({ success: true, message: 'تم حذف المفتاح بنجاح.' });
  } catch (err) {
    logger.error('provider_key_delete_failed', { error: err.message });
    res.status(500).json({ success: false, message: 'فشل في حذف مفتاح السيرفر.' });
  }
};
