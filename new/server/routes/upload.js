const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadToImgbb } = require('../controllers/uploadController');
const logger = require('../logger');
const authenticate = require('../middleware/authenticate');

// إعداد Multer لاستقبال الصور في الذاكرة (مش هنخزّنها محليًا)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('يُسمح برفع الصور فقط (PNG، JPEG، GIF)'), false);
    }
    cb(null, true);
  },
});

// Endpoint لرفع الصورة
router.post('/', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'لم يتم رفع أي صورة' });
    }
    const uploadResult = await uploadToImgbb(req.file, { expiration: 259200000000 }); // 30 يوم
    // نستخدم الرابط المباشر (الأصلي) لتجنب أي ضغط أو تقليل جودة
    res.json({
      imageUrl: uploadResult.url || uploadResult.displayUrl,
      thumbUrl: uploadResult.thumbUrl,
    });
  } catch (err) {
    logger.error('image_upload_failed', { requestId: req.requestId, error: err.message });
    res.status(500).json({ message: 'فشل في رفع الصورة' });
  }
});

module.exports = router;
