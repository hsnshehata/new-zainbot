// server/routes/adminKeys.js
const express = require('express');
const router = express.Router();
const adminKeysController = require('../controllers/adminKeysController');
const authenticate = require('../middleware/authenticate');

// All keys endpoints are restricted to superadmins inside the controller
router.post('/', authenticate, adminKeysController.addKey);
router.get('/', authenticate, adminKeysController.listKeys);
router.put('/:id', authenticate, adminKeysController.updateKey);
router.delete('/:id', authenticate, adminKeysController.deleteKey);
router.post('/reset', authenticate, adminKeysController.resetAllFailedKeys);

module.exports = router;
