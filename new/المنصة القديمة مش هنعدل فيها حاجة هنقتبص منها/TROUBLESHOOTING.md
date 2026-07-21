# 🔧 دليل حل المشاكل - Zain AI

دليل شامل لحل المشاكل الشائعة في المنصة.

---

## 📋 جدول المحتويات

- [مشاكل التثبيت](#-مشاكل-التثبيت)
- [مشاكل قاعدة البيانات](#-مشاكل-قاعدة-البيانات)
- [مشاكل المصادقة](#-مشاكل-المصادقة)
- [مشاكل البوتات](#-مشاكل-البوتات)
- [مشاكل OpenAI](#-مشاكل-openai)
- [مشاكل Webhooks](#-مشاكل-webhooks)
- [مشاكل WhatsApp Desktop](#-مشاكل-whatsapp-desktop)
- [مشاكل الأداء](#-مشاكل-الأداء)
- [أخطاء شائعة](#-أخطاء-شائعة)

---

## 🔨 مشاكل التثبيت

### ❌ npm install يفشل

**الأعراض:**
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**الحلول:**

**1. امسح Cache وأعد التثبيت:**
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**2. استخدم --legacy-peer-deps:**
```bash
npm install --legacy-peer-deps
```

**3. تحديث npm:**
```bash
npm install -g npm@latest
```

### ❌ Python/node-gyp errors

**الأعراض:**
```
gyp ERR! find Python
```

**الحل (Windows):**
```bash
npm install --global windows-build-tools
# أو
npm config set python python2.7
```

**الحل (Linux):**
```bash
sudo apt-get install build-essential
sudo apt-get install python3
```

### ❌ Permission denied

**الأعراض:**
```
EACCES: permission denied
```

**الحل:**

**Linux/Mac:**
```bash
sudo npm install --unsafe-perm
# أو الأفضل: إصلاح صلاحيات npm
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
```

**Windows:**
- شغّل Command Prompt كـ Administrator

---

## 💾 مشاكل قاعدة البيانات

### ❌ MongoDB connection failed

**الأعراض:**
```
❌ MongoDB connection failed after retries
MongooseError: connect ECONNREFUSED 127.0.0.1:27017
```

**الأسباب المحتملة:**

#### 1. MongoDB غير مشتغل

**التحقق:**
```bash
# Windows
net start MongoDB

# Linux
sudo systemctl status mongod

# Mac
brew services list
```

**الحل:**
```bash
# Windows
net start MongoDB

# Linux
sudo systemctl start mongod
sudo systemctl enable mongod  # لتشغيل تلقائي

# Mac
brew services start mongodb-community
```

#### 2. رابط خاطئ في MONGODB_URI

**التحقق من `.env`:**
```env
# محلي
MONGODB_URI=mongodb://localhost:27017/zain-ai

# Atlas
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/zain-ai
```

**الأخطاء الشائعة:**
- ❌ `mongodb://localhost:27017` (بدون اسم قاعدة)
- ❌ `mongodb://127.0.0.1:27017/test` (اسم خاطئ)
- ✅ `mongodb://localhost:27017/zain-ai` (صحيح)

#### 3. Firewall يمنع الاتصال

**الحل:**
```bash
# السماح للمنفذ 27017
sudo ufw allow 27017
```

### ❌ Authentication failed (MongoDB Atlas)

**الأعراض:**
```
MongoServerError: bad auth
```

**الحل:**

1. **تحقق من الـ Username/Password:**
   - لا تستخدم أحرف خاصة في كلمة المرور
   - أو استخدم URL encoding

2. **أضف IP Address للـ Whitelist:**
   - في Atlas Dashboard → Network Access
   - Add IP Address → Allow Access from Anywhere (0.0.0.0/0)

3. **تحقق من Connection String:**
```env
# الصيغة الصحيحة
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/zain-ai?retryWrites=true&w=majority
```

### ❌ Too many connections

**الأعراض:**
```
MongoServerError: too many connections
```

**الحل:**

**1. قلل maxPoolSize:**
```javascript
// في db.js
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 10  // كان 20
});
```

**2. أغلق الاتصالات غير المستخدمة:**
```javascript
await mongoose.connection.close();
```

---

## 🔐 مشاكل المصادقة

### ❌ JWT token is invalid

**الأعراض:**
```json
{ "message": "توكن غير صالح" }
```

**الأسباب:**

#### 1. Token منتهي الصلاحية

**الحل:**
- سجل دخول مرة أخرى
- Token صالح لـ 7 أيام فقط

#### 2. JWT_SECRET تغير

**الحل:**
- لا تغيّر `JWT_SECRET` في `.env` بعد إنشاء التوكينات
- لو غيّرته، كل المستخدمين يحتاجون تسجيل دخول جديد

#### 3. Token مش موجود في Header

**التحقق (Browser DevTools):**
```javascript
// في Network tab → Headers
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**الحل:**
```javascript
// تأكد من إرسال التوكن في الـ Header
fetch('/api/bots', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

### ❌ Cannot register with Gmail

**الأعراض:**
```json
{ "message": "يرجى استخدام Google Sign-In للحسابات بنطاق @gmail.com" }
```

**السبب:**
- المنصة ترفض تسجيل Gmail بالطريقة العادية

**الحل:**
- استخدم **Sign in with Google**
- أو استخدم بريد غير Gmail

### ❌ Email verification not sent

**الأعراض:**
- سجلت لكن البريد لم يصل

**الحلول:**

#### 1. تحقق من إعدادات Gmail في `.env`

```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your_16_char_app_password  # ليس كلمة المرور العادية!
```

**كيفية الحصول على App Password:**
1. [Google Account](https://myaccount.google.com/)
2. Security → 2-Step Verification (فعّله أولاً)
3. App passwords → Generate
4. انسخه (16 حرف بدون مسافات)

#### 2. تحقق من Spam folder

البريد قد يكون في المهملات.

#### 3. تحقق من Logs

```bash
# في server/logs/combined.log
grep "email" server/logs/combined.log
```

---

## 🤖 مشاكل البوتات

### ❌ Bot is not responding

**الأعراض:**
- ترسل رسالة لكن لا يرد البوت

**الحلول:**

#### 1. تحقق من حالة البوت

**في لوحة التحكم:**
- تأكد أن `isActive = true`
- تأكد أن الاشتراك لم ينته (`autoStopDate`)

**عبر API:**
```bash
curl http://localhost:5000/api/bots/BOT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 2. تحقق من OpenAI API Key

**في `.env`:**
```env
OPENAI_API_KEY=sk-proj-xxxxx
```

**اختبار المفتاح:**
```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_OPENAI_API_KEY"
```

**لو المفتاح خاطئ:**
```json
{
  "error": {
    "message": "Incorrect API key provided",
    "type": "invalid_request_error"
  }
}
```

#### 3. تحقق من Logs

```bash
tail -f server/logs/combined.log
```

ابحث عن:
```
❌ خطأ في معالجة الرسالة
❌ OpenAI API error
```

### ❌ Bot keeps saying "عذراً..."

**الأعراض:**
- البوت يرد دائماً بـ "عذراً، حدث خطأ..."

**الأسباب:**

#### 1. OpenAI rate limit

```json
{
  "error": {
    "message": "Rate limit reached",
    "type": "rate_limit_error"
  }
}
```

**الحل:**
- انتظر دقائق
- أو ارفع حد الاستخدام في OpenAI Dashboard

#### 2. Insufficient quota

```json
{
  "error": {
    "message": "You exceeded your current quota",
    "type": "insufficient_quota"
  }
}
```

**الحل:**
- أضف رصيد في [OpenAI Billing](https://platform.openai.com/account/billing)

#### 3. Model not available

**الحل:**
- تأكد من نموذج OpenAI في `botEngine.js`:
```javascript
model: 'gpt-4o-mini'  // تحقق من توفره
```

### ❌ Conversation history not saving

**الأعراض:**
- البوت لا يتذكر المحادثة السابقة

**الحل:**

**تحقق من Conversation model:**
```javascript
const conversation = await Conversation.findOne({ botId, userId, channel });
console.log(conversation?.messages?.length);  // يجب أن يكون > 0
```

**تحقق من Indexes:**
```bash
# في Mongo Shell
use zain-ai
db.conversations.getIndexes()
```

---

## 🧠 مشاكل OpenAI

### ❌ OpenAI API timeout

**الأعراض:**
```
Error: Request timed out
```

**الحل:**

**زيادة Timeout:**
```javascript
// في botEngine.js
const aiResponse = await openai.chat.completions.create({
  // ...config
}, {
  timeout: 30000  // 30 ثانية بدلاً من 10
});
```

### ❌ Context length exceeded

**الأعراض:**
```json
{
  "error": {
    "message": "maximum context length is 4096 tokens",
    "type": "invalid_request_error"
  }
}
```

**الحل:**

**1. قلل عدد الرسائل في السياق:**
```javascript
// في botEngine.js
const recentMessages = conversation.messages.slice(-10);  // آخر 10 رسائل فقط
```

**2. استخدم نموذج بسياق أكبر:**
```javascript
model: 'gpt-4-turbo'  // يدعم 128k tokens بدلاً من 4k
```

---

## 🔗 مشاكل Webhooks

### ❌ Facebook Webhook verification failed

**الأعراض:**
```
The URL couldn't be validated. Callback verification failed.
```

**الحلول:**

#### 1. Verify Token خاطئ

**يجب أن يكون:**
```
hassanshehata
```

**تحقق في Facebook App:**
- Webhook Settings → Verify Token = `hassanshehata`

#### 2. الـ URL غير متاح

**المشكلة:**
- `localhost` لا يعمل مع Facebook

**الحل:**

**استخدم ngrok:**
```bash
ngrok http 5000
# انسخ HTTPS URL مثلاً:
# https://abc123.ngrok.io

# في Facebook:
# Webhook URL = https://abc123.ngrok.io/api/webhook/facebook
```

**أو Deploy على Render/Heroku:**
- URL = `https://your-app.onrender.com/api/webhook/facebook`

#### 3. Endpoint لا يستجيب لـ GET

**التحقق:**
```bash
curl "http://localhost:5000/api/webhook/facebook?hub.mode=subscribe&hub.verify_token=hassanshehata&hub.challenge=test123"

# يجب أن يرجع:
test123
```

**لو فشل، راجع:**
```javascript
// server/routes/webhook.js
router.get('/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === 'hassanshehata') {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

### ❌ Webhook receives messages but bot doesn't respond

**الحلول:**

#### 1. تحقق من Logs

```bash
tail -f server/logs/combined.log
```

ابحث عن:
```
✅ Received webhook: facebook
❌ Bot not found for pageId: xxx
```

#### 2. تحقق من Page ID

**في إعدادات البوت:**
- `facebookPageId` يجب أن يطابق Page ID في Facebook

**كيفية الحصول على Page ID:**
1. اذهب لـ Facebook Page
2. About → Page ID

#### 3. تحقق من الـ Token

**اختبار Token:**
```bash
curl "https://graph.facebook.com/v20.0/me?access_token=YOUR_PAGE_ACCESS_TOKEN"

# يجب أن يرجع:
{
  "name": "Page Name",
  "id": "123456789"
}
```

---

## 📱 مشاكل WhatsApp Desktop

### ❌ QR Code doesn't appear

**الأعراض:**
- التطبيق يفتح لكن لا يظهر QR

**الحلول:**

#### 1. Chromium download failed

**الحل:**
```bash
cd wazainbot
rm -rf node_modules/.cache/puppeteer
npm install
```

#### 2. Port مشغول

**الحل:**
```bash
# في config.json
{
  "apiBaseUrl": "http://localhost:5000"  # تأكد أن المنفذ صحيح
}
```

### ❌ Session keeps disconnecting

**الأعراض:**
- تمسح QR لكن الجلسة تفصل بعد دقائق

**الحلول:**

#### 1. امسح الجلسة القديمة

**Windows:**
```bash
rmdir /s "%APPDATA%\wazainbot\wa-sessions"
```

**Linux/Mac:**
```bash
rm -rf ~/.local/share/wazainbot/wa-sessions
```

#### 2. تحديث whatsapp-web.js

```bash
cd wazainbot
npm update whatsapp-web.js
```

### ❌ Messages not being sent

**التحقق:**

**1. هل الجلسة READY؟**
```javascript
// في WazainBot console
// يجب أن ترى:
✅ WhatsApp session ready for bot: xxx
```

**2. تحقق من API connection:**
```bash
curl http://localhost:5000/api/bots \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## ⚡ مشاكل الأداء

### ❌ Server is slow

**الأعراض:**
- Requests تأخذ وقت طويل (>2 ثانية)

**الحلول:**

#### 1. أضف Indexes

```javascript
// في Models
botSchema.index({ userId: 1 });
conversationSchema.index({ botId: 1, userId: 1, channel: 1 });
productSchema.index({ storeId: 1 });
```

#### 2. استخدم .lean()

```javascript
// ❌ بطيء
const bots = await Bot.find({ userId });

// ✅ أسرع
const bots = await Bot.find({ userId }).lean();
```

#### 3. استخدم select()

```javascript
// ❌ يجلب كل الحقول
const users = await User.find();

// ✅ يجلب فقط ما تحتاج
const users = await User.find().select('username email');
```

### ❌ MongoDB running out of memory

**الأعراض:**
```
MongoServerError: MemoryError
```

**الحل:**

**1. قلل maxPoolSize:**
```javascript
mongoose.connect(MONGODB_URI, {
  maxPoolSize: 10
});
```

**2. أضف Pagination:**
```javascript
// ❌ يجلب الكل
const messages = await Conversation.find();

// ✅ صفحات
const messages = await Conversation.find()
  .limit(50)
  .skip(page * 50);
```

---

## 💥 أخطاء شائعة

### ❌ Cannot read property 'x' of undefined

**السبب:**
- محاولة الوصول لخاصية في object غير موجود

**الحل:**
```javascript
// ❌ خطأ
const name = user.profile.name;

// ✅ صحيح
const name = user?.profile?.name || 'Unknown';
```

### ❌ UnhandledPromiseRejectionWarning

**السبب:**
- Promise مرفوض بدون catch

**الحل:**
```javascript
// ❌ خطأ
async function test() {
  await doSomething();  // لو فشل سيتسبب في crash
}

// ✅ صحيح
async function test() {
  try {
    await doSomething();
  } catch (err) {
    logger.error('Error:', err);
  }
}
```

### ❌ EADDRINUSE: Port already in use

**الحل:**

**Windows:**
```bash
netstat -ano | findstr :5000
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
lsof -i :5000
kill -9 <PID>
```

**أو غيّر PORT:**
```env
PORT=3000
```

---

## 🆘 الدعم

لو جربت كل الحلول وما نفع:

### 📧 فتح Issue على GitHub

[github.com/hsnshehata/zain-ai/issues/new](https://github.com/hsnshehata/zain-ai/issues/new)

**اذكر:**
- نظام التشغيل (Windows/Linux/Mac)
- نسخة Node.js (`node --version`)
- الخطأ الكامل (من Logs)
- الخطوات لإعادة المشكلة

### 📧 البريد الإلكتروني

support@zain-ai.com

---

## 🔍 أدوات Debugging مفيدة

### تشغيل في Debug Mode

```bash
DEBUG=* npm run dev
```

### مراقبة Logs مباشر

```bash
tail -f server/logs/combined.log server/logs/error.log
```

### فحص MongoDB

```bash
# دخول Mongo Shell
mongo

use zain-ai

# عدد المستخدمين
db.users.countDocuments()

# آخر 5 محادثات
db.conversations.find().sort({createdAt: -1}).limit(5)

# فحص Indexes
db.bots.getIndexes()
```

### فحص Port مستخدم

```bash
# Windows
netstat -ano | findstr :5000

# Linux/Mac
lsof -i :5000
```

---

<div align="center">

**لم تجد الحل؟**

[فتح Issue](https://github.com/hsnshehata/zain-ai/issues) • [البريد الإلكتروني](mailto:support@zain-ai.com)

</div>
