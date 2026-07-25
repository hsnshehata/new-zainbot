// /server/routes/rules.js

const express = require('express');
const router = express.Router();
const Rule = require('../models/Rule');
const authenticate = require('../middleware/authenticate');
const rulesController = require('../controllers/rulesController');
const logger = require('../logger');
const {
  requireBotOrGlobalAccess,
  loadAccessibleRule,
  requireGlobalRuleAdmin,
} = require('../middleware/ruleAccess');

// تصدير القواعد
router.get('/export', authenticate, requireBotOrGlobalAccess, rulesController.exportRules);

// استيراد القواعد
router.post('/import', authenticate, requireGlobalRuleAdmin, requireBotOrGlobalAccess, rulesController.importRules);

// جلب كل القواعد مع دعم الفلترة والبحث والـ pagination
router.get('/', authenticate, requireBotOrGlobalAccess, rulesController.getRules);

// جلب قاعدة محددة
router.get('/:id', authenticate, loadAccessibleRule, async (req, res) => {
  try {
    res.status(200).json(req.rule);
  } catch (err) {
    logger.error('❌ خطأ في جلب القاعدة', { userId: req.user?.userId || 'N/A', ruleId: req.params.id, err });
    res.status(500).json({ message: 'خطأ في السيرفر أثناء جلب القاعدة', error: err.message });
  }
});

// إنشاء قاعدة جديدة
router.post('/', authenticate, requireGlobalRuleAdmin, requireBotOrGlobalAccess, rulesController.createRule);

// تعديل قاعدة
router.put('/:id', authenticate, requireGlobalRuleAdmin, loadAccessibleRule, rulesController.updateRule);

// حذف قاعدة
router.delete('/:id', authenticate, loadAccessibleRule, rulesController.deleteRule);

module.exports = router;
