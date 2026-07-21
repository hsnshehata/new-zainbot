# ⚡ دليل البدء السريع - Zain AI

دعنا نشغّل المنصة في **5 دقائق**!

---

## 📋 المتطلبات الأساسية

قبل البدء، تأكد من تثبيت:

- ✅ **Node.js** v18+ ([تحميل](https://nodejs.org/))
- ✅ **MongoDB** ([تحميل](https://www.mongodb.com/try/download/community))
- ✅ **Git** ([تحميل](https://git-scm.com/))

### التحقق من التثبيت

```bash
node --version    # يجب أن يظهر v18.x أو أحدث
npm --version     # يجب أن يظهر v9.x أو أحدث
mongo --version   # أو mongod --version
```

---

## 🚀 الخطوات (5 دقائق)

### 1️⃣ استنساخ المشروع (30 ثانية)

```bash
git clone https://github.com/hsnshehata/zain-ai.git
cd zain-ai
```

### 2️⃣ تثبيت الاعتماديات (2 دقيقة)

```bash
npm install
```

<details>
<summary>⚠️ في حالة ظهور أخطاء</summary>

```bash
# امسح cache وأعد التثبيت
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```
</details>

### 3️⃣ إعداد قاعدة البيانات (1 دقيقة)

**خيار أ: MongoDB محلي**

```bash
# لو مثبت MongoDB على جهازك
# Windows: شغّل MongoDB Compass أو الخدمة
# Linux/Mac:
sudo systemctl start mongod

# تحقق من التشغيل
mongo --eval "db.version()"
```

**خيار ب: MongoDB Atlas (Cloud - مجاني)**

1. سجل في [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. أنشئ Cluster مجاني
3. اضغط **Connect** → **Connect your application**
4. انسخ Connection String

### 4️⃣ إعداد المتغيرات البيئية (1 دقيقة)

```bash
# انسخ ملف المثال
cp .env.example .env
```

افتح `.env` وعدّل:

```env
# الأساسيات فقط للبدء
PORT=5000
MONGODB_URI=mongodb://localhost:27017/zain-ai
JWT_SECRET=your_secret_key_change_this
BASE_URL=http://localhost:5000

# اختياري: للذكاء الاصطناعي (لو عندك مفتاح)
OPENAI_API_KEY=sk-proj-xxxxx
```

<details>
<summary>💡 كيف أحصل على OpenAI API Key؟</summary>

1. سجل في [OpenAI](https://platform.openai.com/)
2. اذهب إلى [API Keys](https://platform.openai.com/api-keys)
3. اضغط **Create new secret key**
4. انسخه والصقه في `.env`

**مهم:** OpenAI مدفوع، لكن يعطيك رصيد تجريبي.
</details>

### 5️⃣ تشغيل المنصة (30 ثانية)

```bash
npm run dev
```

**النتيجة المتوقعة:**

```
✅ MongoDB connected
⚙️  Server running on http://localhost:5000
⏰ Cron jobs initialized
```

---

## 🎉 تم التشغيل! الآن ماذا؟

### 1️⃣ افتح المنصة

في متصفحك، اذهب إلى:

```
http://localhost:5000
```

### 2️⃣ سجل حساب جديد

```
http://localhost:5000/register
```

**ملاحظة:** لو استخدمت Gmail، يمكنك الدخول مباشرة بـ **Sign in with Google** بعد إعداد Google OAuth.

### 3️⃣ أنشئ بوتك الأول

1. من لوحة التحكم `/dashboard_new`
2. اضغط **إنشاء بوت جديد**
3. أدخل:
   - **الاسم:** بوت تجريبي
   - **رسالة الترحيب:** مرحباً! كيف يمكنني مساعدتك؟
4. اضغط **إنشاء**

### 4️⃣ جرب البوت

```
http://localhost:5000/chat?botId=YOUR_BOT_ID
```

**تلميح:** ستجد Bot ID في صفحة البوت أو URL.

---

## 🧪 اختبار الميزات

### ✅ تجربة الشات الأساسي

1. اذهب لصفحة الشات
2. اكتب: **مرحبا**
3. يجب أن يرد البوت (لو مفعّل OpenAI)

### ✅ تجربة صفحة الشات المخصصة

```
http://localhost:5000/chat-page/YOUR_BOT_ID
```

### ✅ تجربة القواعد (Rules)

1. من لوحة التحكم → **البوت** → **القواعد**
2. أضف قاعدة:
   - **الكلمة المفتاحية:** سعر
   - **الرد:** الأسعار تبدأ من 100 جنيه
3. جرب كتابة "كام السعر؟" في الشات

---

## 🏪 تجربة المتجر (اختياري)

### 1️⃣ أنشئ متجر

1. لوحة التحكم → **إدارة المتاجر**
2. **إنشاء متجر جديد**:
   - **الاسم:** متجري التجريبي
   - **رابط المتجر:** my-test-store
3. **احفظ**

### 2️⃣ أضف منتجات

1. افتح المتجر
2. **إضافة منتج**:
   - **الاسم:** منتج تجريبي
   - **السعر:** 50
   - **المخزون:** 10

### 3️⃣ اربط البوت بالمتجر

1. إعدادات البوت → **ربط متجر**
2. اختر المتجر
3. احفظ

### 4️⃣ افتح المتجر

```
http://localhost:5000/store/my-test-store
```

---

## 🔗 ربط قنوات خارجية

### Facebook Messenger (متقدم)

<details>
<summary>اضغط للشرح</summary>

**المتطلبات:**
- Facebook Page
- Facebook App

**الخطوات:**

1. **أنشئ Facebook App:**
   - [developers.facebook.com](https://developers.facebook.com/)
   - Add Product → Messenger

2. **احصل على Page Access Token:**
   - Settings → Basic → App Secret
   - Messenger → Settings → Access Tokens

3. **اضبط Webhook:**
   - URL: `http://localhost:5000/api/webhook/facebook`
   - Verify Token: `hassanshehata`
   - Subscribe to: `messages`, `messaging_postbacks`

**مهم:** localhost لن يعمل مع Facebook. استخدم:
- [ngrok](https://ngrok.com/): `ngrok http 5000`
- أو deploy على Render/Heroku

4. **في المنصة:**
   - إعدادات البوت → **ربط فيسبوك**
   - Page ID + Access Token
</details>

### WhatsApp (خياران)

**خيار 1: WhatsApp Business API (رسمي)**

<details>
<summary>للشركات (يحتاج موافقة)</summary>

- اتبع نفس خطوات Facebook
- [developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)
</details>

**خيار 2: تطبيق سطح المكتب (أسهل)**

```bash
cd wazainbot
copy config.example.json config.json
npm install
npm start
```

- سجل دخول بحسابك في المنصة
- اختر البوت
- امسح QR Code بـ WhatsApp

---

## 🛠️ الأوامر المفيدة

```bash
# تشغيل (Development مع Auto-restart)
npm run dev

# تشغيل (Production)
npm start

# اختبار
npm test

# بناء Executable
npm run build:win     # Windows
npm run build:linux   # Linux
npm run build:mac     # macOS
npm run build:all     # الكل
```

---

## ❓ مشاكل شائعة

### ❌ MongoDB connection failed

**السبب:** MongoDB غير مشتغل أو رابط خاطئ

**الحل:**
```bash
# Windows
net start MongoDB

# Linux/Mac
sudo systemctl start mongod

# تحقق
mongo --eval "db.version()"
```

### ❌ OPENAI_API_KEY is not defined

**السبب:** لم تضف المفتاح في `.env`

**الحل:**
- البوت سيعمل بدون OpenAI لكن لن يرد بذكاء
- للاختبار، يمكنك الاعتماد على **القواعد (Rules)**

### ❌ Port 5000 already in use

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

**أو غيّر PORT في `.env`:**
```env
PORT=3000
```

### ❌ npm install يفشل

**الحل:**
```bash
# امسح كل شي وأعد التثبيت
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## 📚 الخطوات التالية

الآن وقد شغّلت المنصة:

1. **اقرأ التوثيق الكامل:** [README.md](README.md)
2. **تعلم البنية التقنية:** [ARCHITECTURE.md](ARCHITECTURE.md)
3. **ساهم في المشروع:** [CONTRIBUTING.md](CONTRIBUTING.md)
4. **راجع API:** [API_REFERENCE.md](API_REFERENCE.md) (قريباً)

---

## 💬 الدعم

واجهتك مشكلة؟

- **GitHub Issues:** [فتح Issue](https://github.com/hsnshehata/zain-ai/issues)
- **Email:** support@zain-ai.com

---

<div align="center">

**🎊 مبروك! منصتك شغالة الآن! 🎊**

ابدأ بإنشاء البوتات وتطوير تجربتك

[⬆️ العودة للأعلى](#-دليل-البدء-السريع---zain-ai)

</div>
