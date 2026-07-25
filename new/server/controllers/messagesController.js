const Conversation = require("../models/Conversation");
const logger = require('../logger');

// Get daily messages for a bot
exports.getDailyMessages = async (req, res) => {
  try {
    const { botId } = req.params;
    const { startDate, endDate } = req.query;

    let query = { botId };
    if (startDate || endDate) {
      query["messages.timestamp"] = {};
      if (startDate) query["messages.timestamp"].$gte = new Date(startDate);
      if (endDate) query["messages.timestamp"].$lte = new Date(endDate);
    }

    const conversations = await Conversation.find(query).lean();

    // تجميع الرسائل حسب اليوم
    const dailyMessages = {};
    conversations.forEach(conv => {
      conv.messages.forEach(msg => {
        const date = new Date(msg.timestamp).toISOString().split("T")[0]; // الحصول على التاريخ بصيغة YYYY-MM-DD
        if (!dailyMessages[date]) {
          dailyMessages[date] = 0;
        }
        dailyMessages[date]++;
      });
    });

    // تحويل البيانات لمصفوفة مرتبة
    const result = Object.keys(dailyMessages)
      .sort() // ترتيب التواريخ
      .map(date => ({
        date: date,
        count: dailyMessages[date],
      }));

    res.status(200).json(result);
  } catch (err) {
    logger.error('daily_messages_fetch_error', { botId: req.params.botId, err: err.message, stack: err.stack });
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};

function parsePositiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

function parseOptionalDate(value, fieldName) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`${fieldName} is invalid`);
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

async function fetchMessages({
  botId,
  channelType,
  startDate,
  endDate,
  page,
  limit,
}) {
  if (!botId || !channelType) {
    const error = new Error('معرف البوت أو القناة غير محدد.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedPage = parsePositiveInteger(page, 1, 1_000_000);
  const normalizedLimit = parsePositiveInteger(limit, 20, 100);
  const parsedStartDate = parseOptionalDate(startDate, 'startDate');
  const parsedEndDate = parseOptionalDate(endDate, 'endDate');
  const query = { botId, channel: channelType };

  if (parsedStartDate || parsedEndDate) {
    query['messages.timestamp'] = {};
    if (parsedStartDate) query['messages.timestamp'].$gte = parsedStartDate;
    if (parsedEndDate) query['messages.timestamp'].$lte = parsedEndDate;
  }

  const skip = (normalizedPage - 1) * normalizedLimit;
  const [conversations, totalConversations] = await Promise.all([
    Conversation.find(query)
      .select('userId username messages')
      .sort({ 'messages.timestamp': -1 })
      .skip(skip)
      .limit(normalizedLimit)
      .lean(),
    Conversation.countDocuments(query),
  ]);

  return {
    conversations,
    totalConversations,
    currentPage: normalizedPage,
    totalPages: Math.ceil(totalConversations / normalizedLimit),
  };
}

// Get conversations for a bot
exports.getMessages = async (req, res) => {
  try {
    const result = await fetchMessages({
      botId: req.params.botId,
      channelType: req.query.type,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      page: req.query.page,
      limit: req.query.limit,
    });
    return res.status(200).json(result);
  } catch (err) {
    logger.error('messages_fetch_error', {
      botId: req.params.botId,
      channelType: req.query.type,
      err: err.message,
    });
    return res
      .status(err.statusCode || 500)
      .json({ message: err.statusCode === 400 ? err.message : 'خطأ في جلب المحادثات.' });
  }
};

exports.fetchMessages = fetchMessages;

// Delete a user's conversations
exports.deleteUserMessages = async (req, res) => {
  try {
    const botId = req.params.botId;
    const userId = req.params.userId;
    const channelType = req.query.type;

    if (!botId || !userId || !channelType) {
      return res.status(400).json({ message: "معرف البوت أو المستخدم أو القناة غير محدد." });
    }

    await Conversation.deleteMany({ botId, userId, channel: channelType });
    res.status(200).json({ message: "تم حذف محادثات المستخدم بنجاح." });
  } catch (error) {
    logger.error('messages_delete_user_error', {
      botId: req.params.botId,
      channelType: req.query.type,
      err: error.message,
    });
    res.status(500).json({ message: "خطأ في حذف المحادثات." });
  }
};

// Delete all conversations for a bot
exports.deleteAllMessages = async (req, res) => {
  try {
    const botId = req.params.botId;
    const channelType = req.query.type;

    if (!botId || !channelType) {
      return res.status(400).json({ message: "معرف البوت أو القناة غير محدد." });
    }

    await Conversation.deleteMany({ botId, channel: channelType });
    res.status(200).json({ message: "تم حذف جميع المحادثات بنجاح." });
  } catch (error) {
    logger.error('messages_delete_all_error', {
      botId: req.params.botId,
      channelType: req.query.type,
      err: error.message,
    });
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
};
