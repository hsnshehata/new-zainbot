// server/controllers/adminKeysController.js
const ProviderKey = require('../models/ProviderKey');
const logger = require('../logger');

// Check if user is superadmin
const checkSuperadmin = (req) => {
  return req.auth?.actorRole === 'superadmin' && !req.auth?.isImpersonating;
};

function serializeProviderKey(key) {
  const rawKey = key.apiKey || '';
  const value = typeof key.toObject === 'function' ? key.toObject() : { ...key };
  value.configured = Boolean(rawKey);
  value.last4 = rawKey ? rawKey.slice(-4) : '';
  delete value.apiKey;
  return value;
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

    const keys = await ProviderKey.find({})
      .select('+apiKey')
      .sort({ priority: 1 });
    res.status(200).json({
      success: true,
      data: keys.map(serializeProviderKey),
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

    const key = await ProviderKey.findById(id).select('+apiKey');
    if (!key) {
      return res.status(404).json({ success: false, message: 'المفتاح المطلوب غير موجود.' });
    }

    if (name !== undefined) key.name = name;
    if (provider !== undefined) key.provider = provider;
    if (apiKey !== undefined && apiKey !== '') key.apiKey = apiKey;
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
