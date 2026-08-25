const express = require('express');
const mongoose = require('mongoose');
const authenticate = require('../middleware/authenticate');
const logger = require('../logger');
const AuditEvent = require('../models/AuditEvent');
const User = require('../models/User');
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const ChatOrder = require('../models/ChatOrder');
const AdminImpersonationSession = require('../models/AdminImpersonationSession');
const { directSuperadminOnly } = require('./adminImpersonation');

const router = express.Router();

router.use(authenticate, directSuperadminOnly);

// System-wide KPI counts for the super-admin overview.
router.get('/overview', async (req, res) => {
  try {
    const [usersTotal, usersActive, botsTotal, botsActive, conversations, messagesAgg, chatOrders, activeImpersonations, auditEvents] =
      await Promise.all([
        User.countDocuments({ status: { $ne: 'deleted' } }),
        User.countDocuments({ status: 'active' }),
        Bot.countDocuments({ archivedAt: null }),
        Bot.countDocuments({ archivedAt: null, isActive: true }),
        Conversation.countDocuments({}),
        Conversation.aggregate([
          { $project: { size: { $size: { $ifNull: ['$messages', []] } } } },
          { $group: { _id: null, total: { $sum: '$size' } } },
        ]),
        ChatOrder.countDocuments({}),
        AdminImpersonationSession.countDocuments({ status: 'active' }),
        AuditEvent.countDocuments({}),
      ]);

    return res.status(200).json({
      success: true,
      data: {
        usersTotal,
        usersActive,
        botsTotal,
        botsActive,
        conversations,
        messages: messagesAgg[0]?.total || 0,
        chatOrders,
        activeImpersonations,
        auditEvents,
      },
    });
  } catch (err) {
    logger.error('admin_system_overview_failed', { requestId: req.requestId, err: err.message });
    return res.status(500).json({
      success: false,
      error: 'ADMIN_OVERVIEW_FAILED',
      message: 'System overview could not be loaded',
    });
  }
});

// Queryable audit log with pagination. All fields stored in AuditEvent are
// already redacted at write time.
router.get('/audit', async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 100);
    const eventType = String(req.query.eventType || '').trim();
    const outcome = String(req.query.outcome || '').trim();

    const query = {};
    const validEventTypes = [
      'impersonation.started',
      'impersonation.ended',
      'impersonation.revoked',
      'impersonation.expired',
      'impersonation.token_issue_failed',
      'impersonated.write',
      'admin.write',
    ];
    if (validEventTypes.includes(eventType)) query.eventType = eventType;
    if (['success', 'denied', 'error'].includes(outcome)) query.outcome = outcome;

    const [total, events] = await Promise.all([
      AuditEvent.countDocuments(query),
      AuditEvent.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actorUserId', 'username')
        .populate('subjectUserId', 'username')
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: events.map((event) => ({
        id: String(event._id),
        eventType: event.eventType,
        outcome: event.outcome,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        method: event.method,
        path: event.path,
        statusCode: event.statusCode ?? null,
        reason: event.reason,
        requestId: event.requestId,
        actorUsername: event.actorUserId?.username || String(event.actorUserId?._id || ''),
        subjectUsername: event.subjectUserId?.username || String(event.subjectUserId?._id || ''),
        impersonationSessionId: event.impersonationSessionId
          ? String(event.impersonationSessionId)
          : null,
        createdAt: event.createdAt,
      })),
      total,
      page,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    logger.error('admin_system_audit_failed', { requestId: req.requestId, err: err.message });
    return res.status(500).json({
      success: false,
      error: 'ADMIN_AUDIT_FAILED',
      message: 'The audit log could not be loaded',
    });
  }
});

module.exports = router;
