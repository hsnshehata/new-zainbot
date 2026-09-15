// /server/routes/notifications.js
const express = require('express');
const authenticate = require('../middleware/authenticate');
const notificationsController = require('../controllers/notificationsController');
const { requireDirectActorRole } = require('../middleware/authorize');

const router = express.Router();

router.use(authenticate);

// إرسال إشعار للجميع (للـ superadmin فقط)
router.post(
  '/global',
  requireDirectActorRole('superadmin'),
  notificationsController.sendGlobalNotification
);

// إرسال إشعار لمستخدم واحد
router.post(
  '/single',
  requireDirectActorRole('superadmin'),
  notificationsController.sendNotification
);

// قنوات ومستلمي الإشعارات المتعددة (WhatsApp & Telegram Recipients)
router.get('/recipients', notificationsController.listRecipients);
router.post('/recipients', notificationsController.createRecipient);
router.put('/recipients/:id', notificationsController.updateRecipient);
router.delete('/recipients/:id', notificationsController.deleteRecipient);
router.post('/recipients/:id/test', notificationsController.testRecipient);

// جلب الإشعارات الداخلية للمنصة
router.get('/', notificationsController.getNotifications);

// تعليم الإشعار كمقروء
router.put('/:id/read', notificationsController.markAsRead);

module.exports = router;
