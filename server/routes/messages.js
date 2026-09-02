const express = require("express");
const router = express.Router();
const Conversation = require("../models/Conversation");
const Bot = require("../models/Bot");
const authenticate = require("../middleware/authenticate");
const axios = require("axios");
const messagesController = require("../controllers/messagesController");
const logger = require("../logger");
const { getBotAccessFilter, loadAccessibleBot } = require("../middleware/botAccess");
const {
  getWhatsAppSessionManager,
} = require("../services/whatsappSessionManager");

// إرسال رد يدوي من موحد الرسائل عبر قناة المحادثة (أفضل جهد ممكن)
async function deliverManualReply(conversation, text) {
  const bot = await Bot.findById(conversation.botId).select(
    "facebookApiKey instagramApiKey"
  );
  if (!bot) return false;

  const cleanUserId = String(conversation.userId || "")
    .replace(/^(facebook_|facebook_comment_|instagram_|instagram_comment_|whatsapp_)/, "")
    .replace(/^comment_/, "");

  if (conversation.channel === "whatsapp") {
    const sessionManager = getWhatsAppSessionManager();
    const chatId = String(conversation.userId || "").includes("@")
      ? String(conversation.userId)
      : `${cleanUserId.replace(/\D/g, "")}@c.us`;
    if (!chatId.replace(/\D/g, "")) return false;
    await sessionManager.sendMessage(String(conversation.botId), chatId, text);
    return true;
  }

  if (!cleanUserId) return false;

  if (conversation.channel === "facebook" && bot.facebookApiKey) {
    const response = await axios.post(
      "https://graph.facebook.com/v22.0/me/messages",
      { recipient: { id: cleanUserId }, message: { text } },
      { params: { access_token: bot.facebookApiKey }, timeout: 15_000 }
    );
    return Boolean(response.data?.recipient_id || response.data?.message_id);
  }

  if (conversation.channel === "instagram" && bot.instagramApiKey) {
    const response = await axios.post(
      "https://graph.instagram.com/v22.0/me/messages",
      { recipient: { id: cleanUserId }, message: { text } },
      { params: { access_token: bot.instagramApiKey }, timeout: 15_000 }
    );
    return Boolean(response.data?.recipient_id || response.data?.message_id);
  }

  return false;
}

// دالة لجلب اسم المستخدم من فيسبوك، إنستجرام، أو واتساب
async function getSocialUsername(userId, bot, platform) {
  try {
    let accessToken =
      platform === "facebook"
        ? bot.facebookApiKey
        : platform === "instagram"
        ? bot.instagramApiKey
        : bot.whatsappApiKey;
    let apiUrl =
      platform === "facebook"
        ? "https://graph.facebook.com/v22.0"
        : platform === "instagram"
        ? "https://graph.instagram.com/v22.0"
        : "https://graph.whatsapp.com/v22.0";
    let attempt =
      platform === "facebook"
        ? "فيسبوك (المحاولة الأولى)"
        : platform === "instagram"
        ? "إنستجرام"
        : "واتساب";

    logger.info("social_username_lookup_started", {
      attempt,
      botId: bot._id,
      credentialAvailable: Boolean(accessToken),
    });

    if (!accessToken) {
      logger.error("❌ لم يتم العثور على access token", { attempt, botId: bot._id });
      if (platform === "facebook") {
        // جرب إنستجرام كمحاولة ثانية
        logger.info("📋 محاولة جلب الاسم باستخدام توكن إنستجرام كبديل...");
        accessToken = bot.instagramApiKey;
        apiUrl = "https://graph.instagram.com/v22.0";
        attempt = "إنستجرام (المحاولة الثانية)";
        if (!accessToken) {
          logger.error("❌ لم يتم العثور على توكن إنستجرام أيضاً لهذا البوت", { botId: bot._id });
          return platform === "whatsapp"
            ? userId.replace("whatsapp_", "")
            : "مستخدم فيسبوك";
        }
      } else {
        return platform === "whatsapp"
          ? userId.replace("whatsapp_", "")
          : "مستخدم فيسبوك";
      }
    }

    // تنظيف المعرف
    let cleanUserId = userId.replace(
      /^(facebook_|facebook_comment_|instagram_|instagram_comment_|whatsapp_)/,
      ""
    );
    cleanUserId = cleanUserId.replace(/^comment_/, "");
    logger.info("📋 جلب اسم المستخدم", { userId, cleanUserId, attempt });

    // طلب جلب الاسم
    const requestUrl =
      platform === "whatsapp"
        ? `${apiUrl}/${bot.whatsappBusinessAccountId}/contacts`
        : `${apiUrl}/${cleanUserId}`;

    const requestParams =
      platform === "whatsapp"
        ? { phone_numbers: cleanUserId, access_token: accessToken }
        : { access_token: accessToken, fields: platform === "whatsapp" ? "phone_number" : "name" };

    let response;
    try {
      const res = await axios.get(requestUrl, { params: requestParams });
      response = res.data;
    } catch (err) {
      logger.error("❌ خطأ في طلب API لجلب الاسم", { cleanUserId, attempt, err: err.message });
      throw err;
    }

    if (response.error) {
      logger.error("❌ خطأ في استجابة API لجلب الاسم", {
        cleanUserId,
        attempt,
        error: response.error?.message,
        raw: response.error,
      });
      if (platform === "facebook" && attempt === "فيسبوك (المحاولة الأولى)") {
        // جرب إنستجرام كمحاولة ثانية
        logger.info("📋 محاولة جلب الاسم باستخدام توكن إنستجرام كبديل...");
        accessToken = bot.instagramApiKey;
        apiUrl = "https://graph.instagram.com/v22.0";
        attempt = "إنستجرام (المحاولة الثانية)";
        if (!accessToken) {
          logger.error("❌ لم يتم العثور على توكن إنستجرام لهذا البوت", { botId: bot._id });
          return "مستخدم فيسبوك";
        }

        let retryResponse;
        try {
          const res = await axios.get(`${apiUrl}/${cleanUserId}`, { params: { access_token: accessToken, fields: 'name' } });
          retryResponse = res.data;
        } catch (err) {
          logger.error("❌ خطأ في طلب API لجلب الاسم (محاولة ثانية)", { cleanUserId, attempt, err: err.message });
          return "مستخدم فيسبوك";
        }

        if (retryResponse.error) {
          logger.error("❌ خطأ في استجابة API لجلب الاسم (محاولة ثانية)", {
            cleanUserId,
            attempt,
            error: retryResponse.error?.message,
            raw: retryResponse.error,
          });
          return "مستخدم فيسبوك";
        }
        logger.info("✅ تم جلب الاسم بنجاح (محاولة ثانية)", { cleanUserId, attempt, name: retryResponse.name });
        return retryResponse.name || "مستخدم فيسبوك";
      }
      return platform === "whatsapp" ? cleanUserId : "مستخدم فيسبوك";
    }

    logger.info("✅ تم جلب الاسم بنجاح", {
      cleanUserId,
      attempt,
      name: platform === "whatsapp" ? response.data?.[0]?.phone_number : response.name,
    });
    return platform === "whatsapp"
      ? response.data[0]?.phone_number || cleanUserId
      : response.name || "مستخدم فيسبوك";
  } catch (err) {
    logger.error("❌ خطأ في جلب اسم المستخدم", { userId, platform, err });
    return platform === "whatsapp"
      ? userId.replace("whatsapp_", "")
      : "مستخدم فيسبوك";
  }
}

// Get conversations by query param (expected by dashboard_new.js)
router.get("/conversations", authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const botId = req.query.botId;
    if (!botId) {
      return res.status(400).json({ success: false, message: "botId parameter is required" });
    }
    
    // Find conversations matching either ObjectId or String representation
    const idFilters = mongoose.Types.ObjectId.isValid(botId)
      ? [{ botId: new mongoose.Types.ObjectId(botId) }, { botId: String(botId) }]
      : [{ botId: String(botId) }];

    const conversations = await Conversation.find({ $or: idFilters })
      .sort({ "messages.timestamp": -1, updatedAt: -1, _id: -1 })
      .lean();

    // Normalize messages to ensure legacy and modern fields (role/sender, content/text) are both present
    const normalizedData = conversations.map((conv) => {
      const normalizedMessages = (conv.messages || []).map((m) => {
        const role = m.role || (m.sender === 'user' ? 'user' : 'assistant');
        const content = m.content || m.text || m.message || '';
        return {
          _id: m._id,
          messageId: m.messageId,
          role,
          sender: role === 'user' ? 'user' : 'bot',
          content,
          text: content,
          timestamp: m.timestamp || m.createdAt || new Date(),
        };
      });
      return {
        ...conv,
        messages: normalizedMessages,
      };
    });

    res.status(200).json({
      success: true,
      data: normalizedData,
    });
  } catch (err) {
    logger.error("Error in get conversations route", { err });
    res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// Get conversations for a bot (using messagesController.getMessages)
router.get("/:botId", authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const { botId } = req.params;
    const { type, startDate, endDate, page, limit } = req.query;
    const bot = req.bot;
    const result = await messagesController.fetchMessages({
      botId,
      channelType: type,
      startDate,
      endDate,
      page,
      limit,
    });

    // إذا كان هناك استجابة من getMessages، نعدل الـ conversations لإضافة الـ username
    const conversationsWithUsernames = await Promise.all(
      result.conversations.map(async (conv) => {
        let username = conv.username || conv.userId;
        if (!conv.username || conv.username === "مستخدم فيسبوك" || conv.username === "مستخدم إنستجرام") {
          if (type === "facebook" && bot.facebookApiKey) {
            username = await getSocialUsername(conv.userId, bot, "facebook");
          } else if (type === "instagram" && bot.instagramApiKey) {
            username = await getSocialUsername(conv.userId, bot, "instagram");
          } else if (type === "whatsapp" && bot.whatsappApiKey) {
            username = await getSocialUsername(conv.userId, bot, "whatsapp");
          }
          if (username !== conv.username) {
            conv.username = username;
            await Conversation.findByIdAndUpdate(conv._id, { username });
          }
        }
        return { ...conv, username };
      })
    );

    return res.status(200).json({
      conversations: conversationsWithUsernames,
      totalConversations: result.totalConversations,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
    });
  } catch (err) {
    logger.error("Error fetching conversations", { err: err.message });
    return res
      .status(err.statusCode || 500)
      .json({ message: err.statusCode === 400 ? err.message : "خطأ في السيرفر" });
  }
});

// Get daily messages for a bot
router.get("/daily/:botId", authenticate, loadAccessibleBot, messagesController.getDailyMessages);

// Get social user name
router.get("/social-user/:userId", authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const { userId } = req.params;
    const { botId, platform } = req.query;

    if (!botId || !platform) {
      throw new Error("يرجى تحديد botId وplatform في الطلب");
    }

    if (!["facebook", "instagram", "whatsapp"].includes(platform)) {
      throw new Error("المنصة يجب أن تكون facebook، instagram، أو whatsapp");
    }

    const bot = req.bot;

    const username = await getSocialUsername(userId, bot, platform);
    res.status(200).json({ name: username });
  } catch (err) {
    logger.error("Error fetching social user", { err });
    res.status(500).json({ message: "خطأ في جلب اسم المستخدم" });
  }
});

// Delete a single message
router.delete(
  "/delete-message/:botId/:userId/:messageId",
  authenticate,
  loadAccessibleBot,
  async (req, res) => {
    try {
      const { botId, userId, messageId } = req.params;
      const { type } = req.query;

      const query = { botId, userId };
      if (type) query.channel = type;

      const conversation = await Conversation.findOne(query);
      if (!conversation) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }

      conversation.messages = conversation.messages.filter(
        (msg) => msg._id.toString() !== messageId
      );
      await conversation.save();

      res.status(200).json({ message: "تم حذف الرسالة بنجاح" });
    } catch (err) {
      logger.error("Error deleting message", { err });
      res.status(500).json({ message: "خطأ في السيرفر" });
    }
  }
);

// Delete a single conversation by conversationId
router.delete(
  "/delete-conversation/:botId/:conversationId",
  authenticate,
  loadAccessibleBot,
  async (req, res) => {
    try {
      const { botId, conversationId } = req.params;

      const result = await Conversation.deleteOne({ botId, _id: conversationId });
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }

      res.status(200).json({ message: "تم حذف المحادثة بنجاح" });
    } catch (err) {
      logger.error("Error deleting conversation", { err });
      res.status(500).json({ message: "خطأ في السيرفر" });
    }
  }
);

// Delete a user's conversations
router.delete("/delete-user/:botId/:userId", authenticate, loadAccessibleBot, messagesController.deleteUserMessages);

// Delete all conversations for a bot
router.delete("/delete-all/:botId", authenticate, loadAccessibleBot, messagesController.deleteAllMessages);

// Download all messages
router.get("/download/:botId", authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const { botId } = req.params;
    const { type } = req.query;

    const query = { botId };
    if (type) query.channel = type;

    const conversations = await Conversation.find(query);
    let textContent = "";

    for (const conv of conversations) {
      textContent += `User ID: ${conv.userId}\n`;
      conv.messages.forEach((msg) => {
        textContent += `${
          msg.role === "user" ? "User" : "Bot"
        } (${new Date(msg.timestamp).toLocaleString("ar-EG")}): ${msg.content}\n`;
      });
      textContent += "-------------------------\n";
    }

    res.set("Content-Type", "text/plain");
    res.send(textContent);
  } catch (err) {
    logger.error("Error downloading messages", { err });
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
});

// مسار التبديل بين الرد الآلي والتفاعل البشري (Human Handoff)
router.patch("/conversations/:id/handoff", authenticate, async (req, res) => {
  try {
    const { isHumanHandling } = req.body;
    const conversation = await Conversation.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "المحادثة غير موجودة" });
    }
    const accessibleBot = await Bot.exists(getBotAccessFilter(req, conversation.botId));
    if (!accessibleBot) {
      return res.status(404).json({ success: false, message: "المحادثة غير موجودة" });
    }
    conversation.isHumanHandling = Boolean(isHumanHandling);
    await conversation.save();
    res.json({ success: true, isHumanHandling: conversation.isHumanHandling });
  } catch (err) {
    logger.error("Error updating human handoff", { err });
    res.status(500).json({ success: false, message: "خطأ في تعديل حالة المحادثة" });
  }
});

// الرد اليدوي من موحد الرسائل (Take-over)
router.post("/reply", authenticate, async (req, res) => {
  try {
    const { conversationId, content } = req.body || {};
    const text = typeof content === "string" ? content.trim() : "";
    if (!conversationId || !text) {
      return res.status(400).json({ success: false, message: "conversationId و content مطلوبان" });
    }
    if (text.length > 4000) {
      return res.status(400).json({ success: false, message: "الرسالة طويلة جداً" });
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "المحادثة غير موجودة" });
    }
    const accessibleBot = await Bot.exists(getBotAccessFilter(req, conversation.botId));
    if (!accessibleBot) {
      return res.status(404).json({ success: false, message: "المحادثة غير موجودة" });
    }

    let delivered = false;
    try {
      delivered = await deliverManualReply(conversation, text);
    } catch (err) {
      logger.error("manual_reply_delivery_failed", {
        conversationId,
        channel: conversation.channel,
        err: err.message,
      });
    }

    conversation.messages.push({
      role: "assistant",
      content: text,
      messageId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      timestamp: new Date(),
    });
    conversation.isHumanHandling = true;
    await conversation.save();

    return res.status(200).json({ success: true, delivered });
  } catch (err) {
    logger.error("manual_reply_error", { err: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: "خطأ في إرسال الرد" });
  }
});

module.exports = router;
