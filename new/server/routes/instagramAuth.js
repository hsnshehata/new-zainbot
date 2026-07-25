const express = require('express');
const logger = require('../logger');

const router = express.Router();

/*
 * The legacy callback embedded an ordinary access token inside an unsigned
 * base64 `state` query parameter. That leaks credentials through URLs and does
 * not provide CSRF protection. Keep the public callback path stable, but fail
 * closed until the approval-backed Instagram Login flow is implemented with a
 * server-side, single-use OAuth state record.
 *
 * V2 currently exposes the guided manual long-lived-token connection flow.
 */
router.get('/callback', (req, res) => {
  logger.warn('legacy_instagram_oauth_callback_rejected', {
    requestId: req.requestId,
    providerError: Boolean(req.query.error),
  });
  return res.redirect(
    '/dashboard#channels?error=instagram_oauth_unavailable&setup=manual'
  );
});

module.exports = router;
