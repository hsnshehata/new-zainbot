const express = require('express');
const authenticate = require('../middleware/authenticate');
const auditMutation = require('../middleware/auditMutation');
const logger = require('../logger');
const { directSuperadminOnly } = require('./adminImpersonation');
const defaultPlatformWhatsappSession = require('../services/platformWhatsappSession');

const CONNECT_QR_WAIT_MS = 5_000;

function createAdminPlatformWhatsappRouter(options = {}) {
  const sessionService = options.sessionService || defaultPlatformWhatsappSession;
  const connectWaitMs = options.connectWaitMs ?? CONNECT_QR_WAIT_MS;
  const router = express.Router();

  router.use(authenticate, directSuperadminOnly);

  // Current platform WhatsApp session status and QR availability.
  router.get('/status', async (req, res) => {
    try {
      const status = await sessionService.getStatus();
      return res.status(200).json({
        success: true,
        data: {
          ...status,
          hasQr: Boolean(status?.hasQr || status?.qrCodeData),
        },
      });
    } catch (err) {
      logger.error('admin_platform_whatsapp_status_failed', {
        requestId: req.requestId,
        err: err.message,
      });
      return res.status(500).json({
        success: false,
        error: 'ADMIN_PLATFORM_WHATSAPP_STATUS_FAILED',
        message: 'تعذر تحميل حالة واتساب المنصة.',
      });
    }
  });

  // Start / initialize the platform WhatsApp session and return current QR data URL when available.
  router.post('/connect-qr', auditMutation, async (req, res) => {
    try {
      const existing = await sessionService.getStatus();
      if (!existing.connected && !existing.hasQr) {
        // Kick off init without blocking the HTTP request for up to 180s.
        Promise.resolve()
          .then(() => sessionService.init())
          .catch((initErr) => {
            logger.error('admin_platform_whatsapp_init_background_failed', {
              requestId: req.requestId,
              err: initErr?.message || String(initErr),
            });
          });
      }

      const status = typeof sessionService.waitForQrOrReady === 'function'
        ? await sessionService.waitForQrOrReady(connectWaitMs)
        : await sessionService.getStatus();

      logger.info('admin_platform_whatsapp_connect_qr_requested', {
        requestId: req.requestId,
        actorUserId: req.auth?.actorUserId,
        status: status?.status,
        hasQr: Boolean(status?.hasQr || status?.qrCodeData),
      });

      return res.status(200).json({
        success: true,
        data: {
          ...status,
          hasQr: Boolean(status?.hasQr || status?.qrCodeData),
        },
      });
    } catch (err) {
      logger.error('admin_platform_whatsapp_connect_qr_failed', {
        requestId: req.requestId,
        err: err.message,
      });
      return res.status(500).json({
        success: false,
        error: 'ADMIN_PLATFORM_WHATSAPP_CONNECT_FAILED',
        message: 'تعذر بدء جلسة واتساب المنصة.',
      });
    }
  });

  // Disconnect platform WhatsApp session (destroy without logout; preserves persistent profile).
  router.post('/disconnect', auditMutation, async (req, res) => {
    try {
      const status = await sessionService.disconnect();

      logger.info('admin_platform_whatsapp_disconnected', {
        requestId: req.requestId,
        actorUserId: req.auth?.actorUserId,
      });

      return res.status(200).json({
        success: true,
        data: {
          ...status,
          hasQr: Boolean(status?.hasQr || status?.qrCodeData),
        },
      });
    } catch (err) {
      logger.error('admin_platform_whatsapp_disconnect_failed', {
        requestId: req.requestId,
        err: err.message,
      });
      return res.status(500).json({
        success: false,
        error: 'ADMIN_PLATFORM_WHATSAPP_DISCONNECT_FAILED',
        message: 'تعذر فصل جلسة واتساب المنصة.',
      });
    }
  });

  return router;
}

const defaultRouter = createAdminPlatformWhatsappRouter();
defaultRouter.createAdminPlatformWhatsappRouter = createAdminPlatformWhatsappRouter;

module.exports = defaultRouter;
