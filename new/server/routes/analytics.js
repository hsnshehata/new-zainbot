const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// Get analytics for a specific bot
router.get('/', analyticsController.getAnalytics);
router.get('/summary', analyticsController.getAnalytics);

module.exports = router;
