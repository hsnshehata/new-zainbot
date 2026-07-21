const express = require("express");
const router = express.Router();
const Conversation = require("../models/Conversation");
const Bot = require("../models/Bot");
const authenticate = require("../middleware/authenticate");
const axios = require("axios");
const messagesController = require("../controllers/messagesController");
const logger = require("../logger");

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

    logger.info("📋 جلب التوكن", {
      attempt,
      botId: bot._id,
      tokenPreview: accessToken ? `${accessToken.slice(0, 10)}...` : "غير موجود",
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
router.get("/conversations", authenticate, async (req, res) => {
  try {
    const botId = req.query.botId;
    if (!botId) {
      return res.status(400).json({ success: false, message: "botId parameter is required" });
    }
    const bot = await Bot.findById(botId);
    if (!bot) {
      return res.status(404).json({ success: false, message: "Bot not found" });
    }
    
    // Find conversations
    const conversations = await Conversation.find({ botId }).lean();
    res.status(200).json({
      success: true,
      data: conversations
    });
  } catch (err) {
    logger.error("Error in get conversations route", { err });
    res.status(500).json({ success: false, message: "خطأ في السيرفر" });
  }
});

// Get conversations for a bot (using messagesController.getMessages)
router.get("/:botId", authenticate, async (req, res) => {
  try {
    const { botId } = req.params;
    const { type, startDate, endDate, page, limit } = req.query;

    // جلب البوت من قاعدة البيانات
    const bot = await Bot.findById(botId);
    if (!bot) {
      throw new Error("البوت غير موجود");
    }

    // استدعاء getMessages من messagesController
    req.params.botId = botId;
    req.query.type = type;
    req.query.startDate = startDate;
    req.query.endDate = endDate;
    req.query.page = page;
    req.query.limit = limit;

    const result = await messagesController.getMessages(req, res);

    // إذا كان هناك استجابة من getMessages، نعدل الـ conversations لإضافة الـ username
    if (result && result.conversations) {
      const conversationsWithUsernames = await Promise.all(
        result.conversations.map(async (conv) => {
          // نجرب نستخدم الـ username الموجود في المحادثة أولاً
          let username = conv.username || conv.userId;
          // لو الـ username مش موجود أو قيمته مش كويسة، نجيب الاسم من الـ API
          if (!conv.username || conv.username === "مستخدم فيسبوك" || conv.username === "مستخدم إنستجرام") {
            if (type === "facebook" && bot.facebookApiKey) {
              logger.info("📋 محاولة جلب اسم المستخدم من فيسبوك", { userId: conv.userId });
              username = await getSocialUsername(conv.userId, bot, "facebook");
            } else if (type === "instagram" && bot.instagramApiKey) {
              logger.info("📋 محاولة جلب اسم المستخدم من إنستجرام", { userId: conv.userId });
              username = await getSocialUsername(conv.userId, bot, "instagram");
            } else if (type === "whatsapp" && bot.whatsappApiKey) {
              logger.info("📋 محاولة جلب اسم المستخدم من واتساب", { userId: conv.userId });
              username = await getSocialUsername(conv.userId, bot, "whatsapp");
            }
            // تحديث الـ username في المحادثة لو اتغير
            if (username !== conv.username) {
              conv.username = username;
              await Conversation.findByIdAndUpdate(conv._id, { username });
            }
          }
          return { ...conv, username };
        })
      );

      // نعدل الاستجابة لتشمل الـ conversations المعدلة مع بيانات الـ Pagination
      res.status(200).json({
        conversations: conversationsWithUsernames,
        totalConversations: result.totalConversations,
        currentPage: result.currentPage,
        totalPages: result.totalPages,
      });
    }
  } catch (err) {
    logger.error("Error fetching conversations", { err });
    res.status(500).json({ message: "خطأ في السيرفر" });
  }
});

// Get daily messages for a bot
router.get("/daily/:botId", authenticate, messagesController.getDailyMessages);

// Get social user name
router.get("/social-user/:userId", authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { botId, platform } = req.query;

    if (!botId || !platform) {
      throw new Error("يرجى تحديد botId وplatform في الطلب");
    }

    if (!["facebook", "instagram", "whatsapp"].includes(platform)) {
      throw new Error("المنصة يجب أن تكون facebook، instagram، أو whatsapp");
    }

    const bot = await Bot.findById(botId);
    if (!bot) {
      throw new Error("البوت غير موجود");
    }

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
  async (req, res) => {
    try {
      const { botId, userId, messageId } = req.params;
      const { type } = req.query;

      let query = { botId, userId };
      if (type === "facebook") {
        query.userId = { $regex: "^(facebook_|facebook_comment_)" };
      } else if (type === "web") {
        query.userId = { $in: ["anonymous", /^web_/] };
      } else if (type === "instagram") {
        query.userId = { $regex: "^(instagram_|instagram_comment_)" };
      } else if (type === "whatsapp") {
        query.userId = { $regex: "^whatsapp_" };
      }

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
router.delete("/delete-user/:botId/:userId", authenticate, messagesController.deleteUserMessages);

// Delete all conversations for a bot
router.delete("/delete-all/:botId", authenticate, messagesController.deleteAllMessages);

// Download all messages
router.get("/download/:botId", authenticate, async (req, res) => {
  try {
    const { botId } = req.params;
    const { type } = req.query;

    let query = { botId };
    if (type === "facebook") {
      query.userId = { $regex: "^(facebook_|facebook_comment_)" };
    } else if (type === "web") {
      query.userId = { $in: ["anonymous", /^web_/] };
    } else if (type === "instagram") {
      query.userId = { $regex: "^(instagram_|instagram_comment_)" };
    } else if (type === "whatsapp") {
      query.userId = { $regex: "^whatsapp_" };
    }

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
    conversation.isHumanHandling = Boolean(isHumanHandling);
    await conversation.save();
    res.json({ success: true, isHumanHandling: conversation.isHumanHandling });
  } catch (err) {
    logger.error("Error updating human handoff", { err });
    res.status(500).json({ success: false, message: "خطأ في تعديل حالة المحادثة" });
  }
});

module.exports = router;
