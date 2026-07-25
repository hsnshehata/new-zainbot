// server/routes/adminKeys.js
const express = require('express');
const router = express.Router();
const adminKeysController = require('../controllers/adminKeysController');
const authenticate = require('../middleware/authenticate');
const { requireDirectActorRole } = require('../middleware/authorize');

router.use(authenticate, requireDirectActorRole('superadmin'));
router.post('/', adminKeysController.addKey);
router.get('/', adminKeysController.listKeys);
router.put('/:id', adminKeysController.updateKey);
router.delete('/:id', adminKeysController.deleteKey);
router.post('/reset', adminKeysController.resetAllFailedKeys);

module.exports = router;
