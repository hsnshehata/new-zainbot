# 🏗️ البنية التقنية لـ Zain AI

دليل شامل لفهم البنية التقنية للمنصة والعلاقات بين المكونات.

---

## 📋 جدول المحتويات

- [نظرة عامة](#-نظرة-عامة)
- [معمارية النظام](#-معمارية-النظام)
- [طبقات التطبيق](#-طبقات-التطبيق)
- [تدفق البيانات](#-تدفق-البيانات)
- [محرك البوت](#-محرك-البوت-botengine)
- [نظام Webhooks](#-نظام-webhooks)
- [قاعدة البيانات](#-قاعدة-البيانات)
- [نظام الأمان](#-نظام-الأمان)
- [المهام الدورية](#-المهام-الدورية)
- [تطبيق سطح المكتب](#-تطبيق-سطح-المكتب)

---

## 🌐 نظرة عامة

Zain AI هي منصة **Monolithic** مع فصل واضح للمسؤوليات عبر طبقات متعددة:

```
┌─────────────────────────────────────────────────────────┐
│                    Client Layer                         │
│  (Browser, Mobile, Desktop App, External Platforms)    │
└────────────┬────────────────────────────────────────────┘
             │ HTTPS/WebSocket
┌────────────▼────────────────────────────────────────────┐
│                  Presentation Layer                     │
│         (Static Files, HTML/CSS/JS Frontend)           │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│                   Application Layer                     │
│     (Express.js Server, Routes, Middleware, JWT)       │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│                    Business Logic                       │
│  (Controllers, Bot Engine, OpenAI, Webhooks Handlers)  │
└────────────┬────────────────────────────────────────────┘
             │
┌────────────▼────────────────────────────────────────────┐
│                    Data Access Layer                    │
│            (Mongoose Models, MongoDB)                   │
└─────────────────────────────────────────────────────────┘
```

---

## 🏛️ معمارية النظام

### المكونات الرئيسية

```
┌────────────────────────────────────────────────────────────┐
│                       Zain AI Platform                     │
│                                                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   Express    │  │    MongoDB   │  │   OpenAI     │   │
│  │   Server     │◄─┤   Database   │  │     API      │   │
│  └──────┬───────┘  └──────────────┘  └──────▲───────┘   │
│         │                                     │            │
│  ┌──────▼───────────────────────────────────┴────────┐   │
│  │           Bot Engine (Brain)                      │   │
│  │  • Message Processing                             │   │
│  │  • AI Integration                                 │   │
│  │  • Intent Extraction                              │   │
│  └───────────────────────────────────────────────────┘   │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │         Webhooks Layer                              │ │
│  │  Facebook │ WhatsApp │ Instagram │ Telegram        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐ │
│  │          Cron Jobs (Scheduled Tasks)                │ │
│  │  • Auto-stop bots                                   │ │
│  │  • Token refresh                                    │ │
│  │  • Stock alerts                                     │ │
│  └─────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘

         ▲                    ▲                    ▲
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Web App │         │  Mobile │         │ Desktop │
    │ (HTML/  │         │   Apps  │         │  Electron│
    │  JS/CSS)│         │         │         │  WazainBot│
    └─────────┘         └─────────┘         └─────────┘
```

### تكنولوجيا Stack

| الطبقة | التكنولوجيا | الدور |
|--------|-------------|-------|
| **Backend** | Node.js + Express | Web Server |
| **Database** | MongoDB + Mongoose | Data Storage |
| **AI Engine** | OpenAI API | Chat Intelligence |
| **Auth** | JWT + bcrypt | Security |
| **Logging** | Winston | Monitoring |
| **Scheduling** | node-cron | Background Jobs |
| **File Upload** | Multer | Media Handling |
| **Email** | Nodemailer | Verification |
| **Caching** | NodeCache | Performance |
| **Metrics** | Prometheus (prom-client) | Analytics |
| **Security** | Helmet + Rate Limiting | Protection |
| **Desktop** | Electron + whatsapp-web.js | WhatsApp Integration |

---

## 📚 طبقات التطبيق

### 1. **Presentation Layer (العرض)**

**الموقع:** `public/`

```
public/
├── *.html          # صفحات HTML
├── css/            # Stylesheets
├── js/             # JavaScript للعميل
└── templates/      # قوالب المتاجر
```

**المسؤولية:**
- عرض UI للمستخدمين
- التفاعل مع المستخدم
- إرسال الطلبات للـ API

### 2. **Routing Layer (التوجيه)**

**الموقع:** `server/routes/`

```javascript
// مثال: server/routes/bots.js
router.get('/', authenticate, botsController.getAllBots);
router.post('/', authenticate, botsController.createBot);
router.put('/:id', authenticate, botsController.updateBot);
router.delete('/:id', authenticate, botsController.deleteBot);
```

**المسؤولية:**
- تعريف نقاط النهاية (Endpoints)
- ربط الـ URLs بالـ Controllers
- تطبيق Middleware (authenticate, validation)

### 3. **Middleware Layer (الوسيط)**

**الموقع:** `server/middleware/`

```javascript
// authenticate.js - JWT Verification
module.exports = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'غير مصرح' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'توكن غير صالح' });
  }
};
```

**المسؤولية:**
- مصادقة المستخدم (JWT)
- معالجة الأخطاء
- Rate Limiting
- Logging

### 4. **Business Logic Layer (المنطق)**

**الموقع:** `server/controllers/`

```javascript
// مثال: server/controllers/botsController.js
exports.createBot = async (req, res) => {
  try {
    const { name, welcomeMessage } = req.body;
    const bot = new Bot({
      name,
      userId: req.user.userId,
      welcomeMessage
    });
    await bot.save();
    res.status(201).json({ success: true, data: bot });
  } catch (err) {
    logger.error('خطأ في إنشاء البوت', { err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
```

**المسؤولية:**
- معالجة الطلبات
- تطبيق القواعد التجارية
- التفاعل مع قاعدة البيانات
- معالجة الأخطاء

### 5. **Data Access Layer (البيانات)**

**الموقع:** `server/models/`

```javascript
// مثال: server/models/Bot.js
const botSchema = new mongoose.Schema({
  name: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
  // ... حقول أخرى
});

module.exports = mongoose.model('Bot', botSchema);
```

**المسؤولية:**
- تعريف هيكل البيانات (Schema)
- التحقق من صحة البيانات (Validation)
- العلاقات بين الـ Models

---

## 🔄 تدفق البيانات

### سيناريو 1: مستخدم يرسل رسالة للبوت عبر الويب

```
┌─────────────┐
│   Browser   │
│ (Chat Page) │
└──────┬──────┘
       │ POST /api/bot
       │ { botId, message, userId }
       ▼
┌──────────────────┐
│  Express Server  │
│                  │
│  1. Rate Limit   │ ◄─ يفحص عدد الطلبات
│  2. Validate     │ ◄─ يتحقق من البيانات
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Bot Controller  │ ◄─ /server/routes/bot.js → controllers/botController.js
│                  │
│  • Find Bot      │ ◄─ يجلب البوت من DB
│  • Check Active  │ ◄─ يتأكد أن البوت نشط
│  • Call Engine   │
└──────┬───────────┘
       │
       ▼
┌─────────────────────────────────┐
│        Bot Engine               │ ◄─ /server/botEngine.js
│                                 │
│  1. Load Conversation History   │ ◄─ MongoDB: Conversation model
│  2. Check Rules                 │ ◄─ MongoDB: Rule model
│  3. Extract Media (if any)      │ ◄─ Download images/voice
│  4. Call OpenAI                 │ ◄─ External API
│  5. Extract Intents             │ ◄─ Phone, orders, products
│  6. Save Conversation           │ ◄─ MongoDB: Update messages[]
│  7. Create Chat Order (if any)  │ ◄─ MongoDB: ChatOrder model
└─────────┬───────────────────────┘
          │
          ▼
   ┌──────────────┐
   │   MongoDB    │
   │              │
   │ • Bot        │
   │ • Conversation│
   │ • ChatOrder  │
   │ • Product    │
   └──────────────┘
          │
          ▼
   ┌──────────────┐
   │   Response   │ ◄─ { reply: "..." }
   │   to Client  │
   └──────────────┘
```

### سيناريو 2: Webhook من Facebook يستقبل رسالة

```
┌─────────────────┐
│  Facebook API   │
└────────┬────────┘
         │ POST /api/webhook/facebook
         │ { object: 'page', entry: [...] }
         ▼
┌────────────────────────┐
│  Webhook Route         │ ◄─ /server/routes/webhook.js
│                        │
│  1. Verify Signature   │ ◄─ يتحقق من أن الطلب من Facebook
│  2. Rate Limit         │ ◄─ webhook-specific limiter
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Facebook Controller   │ ◄─ /server/controllers/facebookController.js
│                        │
│  • Parse Webhook       │
│  • Extract Message     │
│  • Find Bot by PageId  │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Bot Engine            │ ◄─ processMessage()
│  (نفس الخطوات أعلاه)   │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│  Send Reply            │
│  POST graph.facebook   │
│  .com/v20.0/me/messages│
└────────────────────────┘
```

---

## 🤖 محرك البوت (botEngine)

**الموقع:** `server/botEngine.js`

### المسؤوليات

1. **معالجة الرسائل** (processMessage)
2. **معالجة الملاحظات** (processFeedback)
3. **استخراج النوايا** (extractIntents)
4. **معالجة الصور** (fetchImageAsBase64)
5. **معالجة الصوت** (transcribeAudio)

### تدفق processMessage

```javascript
async function processMessage({
  botId,
  userId,
  message,
  isImage = false,
  mediaUrl = null,
  isVoice = false,
  channel = 'web'
}) {
  // 1. جلب البوت
  const bot = await Bot.findById(botId);
  if (!bot || !bot.isActive) throw new Error('البوت غير نشط');

  // 2. فحص Mute
  const conversation = await Conversation.findOne({ botId, userId, channel });
  if (conversation?.mutedUntil > Date.now()) {
    return { reply: null }; // لا ترد
  }

  // 3. منع التكرار
  const messageId = `${botId}-${userId}-${message}-${Date.now()}`;
  if (messageCache.get(messageId)) {
    throw new Error('رسالة مكررة');
  }
  messageCache.set(messageId, true);

  // 4. معالجة الصوت
  if (isVoice) {
    const transcription = await transcribeAudio(audioUrl, channel);
    message = transcription;
  }

  // 5. معالجة الصورة
  let imageContent = null;
  if (isImage && mediaUrl) {
    imageContent = await fetchImageAsBase64(mediaUrl, channel);
  }

  // 6. تحميل المحادثة السابقة
  const history = conversation?.messages || [];

  // 7. فحص القواعد (Rules)
  const rules = await Rule.find({ botId, isActive: true });
  for (const rule of rules) {
    if (message.toLowerCase().includes(rule.keyword.toLowerCase())) {
      return { reply: rule.response };
    }
  }

  // 8. بناء Prompt لـ OpenAI
  let systemPrompt = buildSystemPrompt(bot, store, products);
  let userPrompt = buildUserPrompt(message, imageContent);

  // 9. استدعاء OpenAI
  const aiResponse = await openai.chat.completions.create({
    model: isImage ? 'gpt-4.1-nano-2025-04-14' : 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: 500
  });

  const reply = aiResponse.choices[0].message.content;

  // 10. استخراج النوايا
  const intents = await extractIntents(message, reply);

  // 11. حفظ المحادثة
  conversation.messages.push(
    { role: 'user', content: message, timestamp: Date.now(), messageId },
    { role: 'assistant', content: reply, timestamp: Date.now() }
  );
  await conversation.save();

  // 12. إنشاء طلب إذا استُخرج
  if (intents.hasOrder) {
    await createChatOrder({ botId, userId, intents });
  }

  // 13. حفظ بيانات العميل
  if (intents.hasPhone) {
    await upsertChatCustomer({ botId, userId, phone: intents.phone });
  }

  return { reply };
}
```

---

## 🔗 نظام Webhooks

### التدفق العام

```
Platform (FB/WA/IG) → Webhook URL → Verification → Controller → Bot Engine → Response
```

### 1. Facebook Messenger

**Endpoint:** `POST /api/webhook/facebook`

```javascript
// التحقق (GET)
if (req.query['hub.verify_token'] === 'hassanshehata') {
  res.send(req.query['hub.challenge']);
}

// الاستقبال (POST)
const { object, entry } = req.body;
if (object === 'page') {
  for (const e of entry) {
    const { messaging } = e;
    for (const event of messaging) {
      const { sender, message } = event;
      // معالجة الرسالة...
    }
  }
}
```

### 2. WhatsApp Business

**Endpoint:** `POST /api/webhook/whatsapp`

```javascript
const { entry } = req.body;
for (const e of entry) {
  const { changes } = e;
  for (const change of changes) {
    const { value } = change;
    const { messages } = value;
    for (const msg of messages) {
      const { from, text, type } = msg;
      // معالجة حسب النوع (text/image/audio)
    }
  }
}
```

### 3. Instagram

**Endpoint:** `POST /api/webhook/instagram`

مماثل لـ Facebook مع اختلافات في البنية.

---

## 💾 قاعدة البيانات

### Schema Diagram

```
┌─────────────┐         ┌─────────────┐
│    User     │1      * │    Bot      │
│             ├─────────┤             │
│ _id         │  owns   │ _id         │
│ username    │         │ name        │
│ email       │         │ userId (FK) │
│ role        │         │ isActive    │
└─────────────┘         └──────┬──────┘
                               │
                       1       │       *
                        ┌──────▼──────────┐
                        │  Conversation   │
                        │                 │
                        │ botId (FK)      │
                        │ userId          │
                        │ messages[]      │
                        │ channel         │
                        └──────┬──────────┘
                               │
                        *      │       1
                        ┌──────▼──────────┐
                        │   ChatOrder     │
                        │                 │
                        │ botId (FK)      │
                        │ customerId (FK) │
                        │ items[]         │
                        │ status          │
                        └─────────────────┘

┌─────────────┐         ┌─────────────┐
│   Store     │1      * │   Product   │
│             ├─────────┤             │
│ _id         │  has    │ storeId (FK)│
│ name        │         │ name        │
│ storeLink   │         │ price       │
└─────────────┘         └─────────────┘
```

### Indexes المهمة

```javascript
// User
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true });

// Bot
botSchema.index({ userId: 1 });
botSchema.index({ isActive: 1 });

// Conversation
conversationSchema.index({ botId: 1, userId: 1, channel: 1 }, { unique: true });
conversationSchema.index({ 'messages.timestamp': -1 });

// Product
productSchema.index({ storeId: 1 });
productSchema.index({ categoryId: 1 });
```

---

## 🔐 نظام الأمان

### 1. JWT Authentication

```javascript
// إنشاء التوكن
const token = jwt.sign(
  { userId: user._id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

// التحقق من التوكن
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

### 2. Password Hashing

```javascript
// التشفير
const hashedPassword = await bcrypt.hash(password, 10);

// المقارنة
const isMatch = await bcrypt.compare(password, user.password);
```

### 3. Rate Limiting

```javascript
// حد عام: 300 طلب / 15 دقيقة
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});

// حد Auth: 7 طلبات / 15 دقيقة
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 7
});
```

### 4. Helmet.js

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      // ...
    }
  }
}));
```

---

## ⏰ المهام الدورية

### نظام Cron

```javascript
// server/cronJobs.js

// 1. فحص البوتات المنتهية (يومياً 12:00 صباحاً)
cron.schedule('0 0 * * *', async () => {
  const expiredBots = await Bot.find({
    isActive: true,
    autoStopDate: { $lte: new Date() }
  });
  await Bot.updateMany(
    { _id: { $in: expiredBots.map(b => b._id) } },
    { $set: { isActive: false } }
  );
});

// 2. تجديد توكينات Facebook (يومياً 2:00 صباحاً)
cron.schedule('0 2 * * *', async () => {
  const bots = await Bot.find({
    lastFacebookTokenRefresh: { $lte: fiftyDaysAgo }
  });
  for (const bot of bots) {
    const newToken = await refreshFacebookToken(bot.facebookApiKey);
    bot.facebookApiKey = newToken;
    bot.lastFacebookTokenRefresh = Date.now();
    await bot.save();
  }
});

// 3. تنبيهات المخزون (يومياً 8:00 صباحاً)
cron.schedule('0 8 * * *', async () => {
  const lowStockProducts = await Product.find({
    $expr: { $lte: ['$stock', '$lowStockThreshold'] }
  });
  // إرسال إشعار...
});

// 4. تنظيف اللوجز (أسبوعياً، السبت 3:00 صباحاً)
cron.schedule('0 3 * * 6', async () => {
  const logsDir = path.join(__dirname, 'logs');
  const files = await fs.readdir(logsDir);
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  for (const file of files) {
    const stats = await fs.stat(path.join(logsDir, file));
    if (stats.mtimeMs < thirtyDaysAgo) {
      await fs.unlink(path.join(logsDir, file));
    }
  }
});
```

---

## 🖥️ تطبيق سطح المكتب

### بنية Electron

```
wazainbot/
├── main.js              # Main Process
├── preload.js           # Preload Script
├── config.json          # Configuration
└── src/
    ├── renderer/        # UI (HTML/CSS/JS)
    └── utils/           # Helper Functions
```

### التدفق

```
1. Login → API: POST /api/auth/login
2. Get Bots → API: GET /api/bots
3. Start WhatsApp Session → whatsapp-web.js
4. QR Code → Display in UI
5. Session Ready → Listen for messages
6. Incoming Message → API: POST /api/bot
7. Get Reply → Send via WhatsApp
```

### تخزين الجلسات

```javascript
// في %APPDATA%/wazainbot/wa-sessions/
const sessionPath = path.join(
  process.env.APPDATA,
  'wazainbot',
  'wa-sessions',
  `bot-${botId}`
);

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: `bot-${botId}`,
    dataPath: sessionPath
  })
});
```

---

## 📊 Monitoring & Logging

### Winston Logger

```javascript
// server/logger.js
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console()
  ]
});

// الاستخدام
logger.info('تم إنشاء بوت', { botId, userId });
logger.error('خطأ في المعالجة', { err: err.message });
```

### Prometheus Metrics

```javascript
// Endpoint: GET /metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status']
});

// تسجيل تلقائي
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.route?.path, status: res.statusCode });
  });
  next();
});
```

---

## 🔄 Deployment Architecture

### Production Setup

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer (NGINX)                │
└────────────┬────────────────────────────────────────────┘
             │ HTTPS
   ┌─────────┴─────────┐
   │                   │
   ▼                   ▼
┌──────┐          ┌──────┐
│ App  │          │ App  │ (Multiple Instances)
│ Node │          │ Node │
└──┬───┘          └──┬───┘
   │                 │
   └────────┬────────┘
            │
            ▼
      ┌──────────┐
      │ MongoDB  │ (Replica Set)
      │ Cluster  │
      └──────────┘
```

### Environment-based Configuration

```javascript
const config = {
  development: {
    port: 5000,
    mongoUri: 'mongodb://localhost:27017/zain-ai',
    logLevel: 'debug'
  },
  production: {
    port: process.env.PORT || 80,
    mongoUri: process.env.MONGODB_URI,
    logLevel: 'info'
  }
};

module.exports = config[process.env.NODE_ENV || 'development'];
```

---

## 📚 مراجع إضافية

- [نماذج البيانات التفصيلية](README.md#-نماذج-البيانات-models)
- [واجهات API](API_REFERENCE.md)
- [دليل المساهمة](CONTRIBUTING.md)

---

<div align="center">

**للأسئلة التقنية:** support@zain-ai.com

</div>
