const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authenticate = require('../middleware/authenticate');
const { loadAccessibleBot } = require('../middleware/botAccess');

// Get analytics for a specific bot
router.get('/', authenticate, loadAccessibleBot, analyticsController.getAnalytics);
router.get('/summary', authenticate, loadAccessibleBot, analyticsController.getAnalytics);

module.exports = router;
