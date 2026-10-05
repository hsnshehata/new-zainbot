const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Rule = require('../models/Rule');
const ChatOrder = require('../models/ChatOrder');
const logger = require('../logger');

function messageKeyExpr() {
  const str = (path) => ({ $convert: { input: path, to: 'string', onError: '', onNull: '' } });
  return {
    $ifNull: [
      '$messages.messageId',
      {
        $concat: [
          str('$messages.content'), '|',
          str('$messages.timestamp'), '|',
          str('$messages.role')
        ]
      }
    ]
  };
}

// Get analytics for a specific bot
exports.getAnalytics = async (req, res) => {
  try {
    const botId = req.query.botId;
    if (!botId) {
      return res.status(400).json({ message: 'Bot ID is required' });
    }
    if (!mongoose.Types.ObjectId.isValid(botId)) {
      return res.status(400).json({ message: 'Invalid bot ID', code: 'BAD_ID_FORMAT' });
    }
    const botObjectId = new mongoose.Types.ObjectId(botId);

    // All six reads are independent — run them in parallel. The message
    // count is computed inside MongoDB (unwind + group + count) instead of
    // loading every conversation into Node memory.
    const [
      conversationsCount,
      messageAgg,
      chatOrdersCount,
      activeRules,
      confirmedOrders,
      qualifiedCount
    ] = await Promise.all([
      Conversation.countDocuments({ botId: botObjectId }),
      Conversation.aggregate([
        { $match: { botId: botObjectId } },
        { $unwind: '$messages' },
        { $group: { _id: messageKeyExpr() } },
        { $count: 'n' }
      ]),
      ChatOrder.countDocuments({ botId }),
      Rule.countDocuments({ botId }),
      ChatOrder.countDocuments({ botId, status: { $in: ['confirmed', 'delivered', 'shipped'] } }),
      ChatOrder.countDocuments({ botId, status: { $ne: 'cancelled' } })
    ]);

    const messagesCount = (messageAgg && messageAgg[0] && messageAgg[0].n) || 0;

    res.status(200).json({
      success: true,
      data: {
        messagesCount,
        conversationsCount,
        chatOrdersCount,
        activeRules,
        funnel: {
          leads: conversationsCount,
          qualified: qualifiedCount,
          closed: confirmedOrders
        }
      }
    });
  } catch (err) {
    logger.error('Error fetching analytics', { err });
    res.status(500).json({ message: 'Server error while fetching analytics' });
  }
};
