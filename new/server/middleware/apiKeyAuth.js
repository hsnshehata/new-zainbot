// server/middleware/apiKeyAuth.js
const ApiKey = require('../models/ApiKey');
const User = require('../models/User');
const logger = require('../logger');

module.exports = async (req, res, next) => {
  try {
    let keyStr = req.headers['x-zainbot-api-key'] || req.headers['x-api-key'];

    if (!keyStr) {
      const authHeader = req.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        keyStr = authHeader.substring(7);
      }
    }

    if (!keyStr) {
      return res.status(401).json({ success: false, message: 'مفتاح الوصول (API Key) مفقود في الطلب.' });
    }

    // Verify key in database
    const keyDoc = await ApiKey.findOne({ key: keyStr, isActive: true });
    if (!keyDoc) {
      return res.status(401).json({ success: false, message: 'مفتاح الوصول غير صالح أو تم إيقافه.' });
    }

    const user = await User.findById(keyDoc.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'المستخدم صاحب المفتاح غير موجود.' });
    }

    // Set request user details
    req.user = {
      userId: user._id,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      fromApiKey: true,
      apiKeyName: keyDoc.name
    };

    next();
  } catch (err) {
    logger.error('❌ Error in API key authentication:', { err });
    res.status(500).json({ success: false, message: 'حدث خطأ في المصادقة الخارجية.' });
  }
};
