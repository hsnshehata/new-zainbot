// /server/routes/notifications.js
const express = require('express');
const authenticate = require('../middleware/authenticate');
const notificationsController = require('../controllers/notificationsController');
const { requireDirectActorRole } = require('../middleware/authorize');

const router = express.Router();

// إرسال إشعار للجميع (للـ superadmin فقط)
router.post(
  '/global',
  authenticate,
  requireDirectActorRole('superadmin'),
  notificationsController.sendGlobalNotification
);

// إرسال إشعار لمستخدم واحد
router.post(
  '/single',
  authenticate,
  requireDirectActorRole('superadmin'),
  notificationsController.sendNotification
);

// جلب الإشعارات
router.get('/', authenticate, notificationsController.getNotifications);

// تعليم الإشعار كمقروء
router.put('/:id/read', authenticate, notificationsController.markAsRead);

module.exports = router;
