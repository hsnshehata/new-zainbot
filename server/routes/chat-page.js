const express = require('express');
const router = express.Router();
const multer = require('multer');
const { createChatPage, updateChatPage, getChatPageByLinkId, getChatPageByBotId, getPublicLinkIdByBot } = require('../controllers/chatPageController');
const authenticate = require('../middleware/authenticate');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 32 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('يُسمح برفع الصور بصيغة PNG فقط'), false);
    }
    cb(null, true);
  },
});

// Routes
router.post('/', authenticate, createChatPage);
router.put('/:id', authenticate, upload.single('logo'), updateChatPage);
router.get('/public/bot/:botId', getPublicLinkIdByBot);
router.get('/bot/:botId', authenticate, getChatPageByBotId);
// NOTE: no POST /feedback route here. The chat widget posts feedback to the
// global /api/feedback endpoint (server.js); the old per-router endpoint was
// dead code that could never pass the Feedback schema validation.
router.get('/:linkId', getChatPageByLinkId);

module.exports = router;
