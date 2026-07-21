# 🚀 دليل النشر - Zain AI

دليل شامل لنشر المنصة على بيئات الإنتاج المختلفة.

---

## 📋 جدول المحتويات

- [الإعداد قبل النشر](#-الإعداد-قبل-النشر)
- [النشر على Render](#-النشر-على-render)
- [النشر على Heroku](#-النشر-على-heroku)
- [النشر على VPS](#-النشر-على-vps)
- [النشر على Docker](#-النشر-على-docker)
- [إعداد قاعدة البيانات](#-إعداد-قاعدة-البيانات)
- [إعداد HTTPS](#-إعداد-https)
- [المراقبة والصيانة](#-المراقبة-والصيانة)

---

## ✅ الإعداد قبل النشر

### 1. Checklist ما قبل النشر

- [ ] **اختبار محلي شامل:** تأكد من عمل كل الميزات
- [ ] **Environment Variables جاهزة:** كل المفاتيح موجودة
- [ ] **قاعدة بيانات جاهزة:** MongoDB Atlas أو VPS
- [ ] **npm audit نظيف:** لا توجد ثغرات أمنية
- [ ] **Logs محلية نظيفة:** امسح أي بيانات حساسة
- [ ] **Git clean:** كل التغييرات committed

### 2. تحديث package.json

تأكد من وجود script التشغيل:

```json
{
  "scripts": {
    "start": "node server/server.js",
    "dev": "nodemon server/server.js"
  }
}
```

### 3. تجهيز .env للإنتاج

**⚠️ لا تضع `.env` في Git!**

سنعد المتغيرات على المنصة مباشرةً.

---

## 🌐 النشر على Render

**[Render.com](https://render.com/)** منصة مجانية وسهلة لنشر تطبيقات Node.js.

### الخطوة 1: إنشاء حساب

1. اذهب إلى [render.com](https://render.com/)
2. **Sign Up** مجاناً (استخدم GitHub)
3. ربط حسابك بـ GitHub

### الخطوة 2: إعداد MongoDB Atlas

**لأن Render المجاني لا يوفر MongoDB:**

1. سجل في [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
2. أنشئ **Cluster مجاني** (M0)
3. **Database Access:**
   - Add New Database User
   - Username: `zainai`
   - Password: (قوي عشوائي)
   - Built-in Role: `Read and write to any database`
4. **Network Access:**
   - Add IP Address
   - **Allow Access from Anywhere:** `0.0.0.0/0`
   - (ضروري لأن Render IP ديناميكي)
5. **Connect:**
   - Connect your application
   - انسخ Connection String:
   ```
   mongodb+srv://zainai:<password>@cluster.mongodb.net/zain-ai?retryWrites=true&w=majority
   ```
   - استبدل `<password>` بكلمة المرور

### الخطوة 3: إنشاء Web Service

1. في Render Dashboard → **New +** → **Web Service**
2. **Connect Repository:** اختر `zain-ai` من GitHub
3. **إعدادات:**
   - **Name:** `zain-ai-production`
   - **Region:** اختر الأقرب (مثلاً Frankfurt)
   - **Branch:** `main`
   - **Root Directory:** (اتركه فارغ)
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free

### الخطوة 4: إضافة Environment Variables

في **Environment** tab:

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://zainai:PASSWORD@cluster.mongodb.net/zain-ai?retryWrites=true&w=majority
JWT_SECRET=your_super_secret_random_key_32_chars_min
BASE_URL=https://zain-ai-production.onrender.com

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxx

# Facebook
FACEBOOK_APP_SECRET=xxxxx
FACEBOOK_ACCESS_TOKEN=xxxxx

# WhatsApp
WHATSAPP_ACCESS_TOKEN=xxxxx

# Google OAuth
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com

# Gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your_app_password
```

**مهم:**
- `PORT=10000` (Render يستخدم هذا)
- `BASE_URL` استبدله برابط Render الفعلي بعد النشر

### الخطوة 5: Deploy

1. اضغط **Create Web Service**
2. Render سيبدأ البناء والنشر تلقائياً
3. انتظر حتى يظهر **Live** (5-10 دقائق أول مرة)

### الخطوة 6: تحديث BASE_URL

بعد ما يصير Live:

1. انسخ الرابط: `https://zain-ai-production.onrender.com`
2. ارجع لـ **Environment**
3. عدّل `BASE_URL` للرابط الفعلي
4. احفظ (سيعيد Deploy تلقائياً)

### الخطوة 7: اختبار

1. افتح: `https://zain-ai-production.onrender.com`
2. يجب أن تظهر الصفحة الرئيسية
3. جرب التسجيل والدخول

### ⚠️ ملاحظات Render

- **Free Plan:**
  - يدخل sleep بعد 15 دقيقة بدون نشاط
  - أول request بعد sleep يأخذ 30-60 ثانية
  - 750 ساعة مجانية شهرياً

- **حل مشكلة Sleep:**
  - استخدم [UptimeRobot](https://uptimerobot.com/) لعمل Ping كل 10 دقائق
  - أو ارفع لـ Paid Plan ($7/شهر)

---

## 🔷 النشر على Heroku

### الخطوة 1: إنشاء حساب وتثبيت CLI

```bash
# تثبيت Heroku CLI
# Windows: https://devcenter.heroku.com/articles/heroku-cli
# Mac: brew install heroku/brew/heroku
# Linux: curl https://cli-assets.heroku.com/install.sh | sh

# تسجيل دخول
heroku login
```

### الخطوة 2: إنشاء App

```bash
cd zain-ai
heroku create zain-ai-production

# أو اسم معين
heroku create your-custom-name
```

### الخطوة 3: إضافة MongoDB

**خيار أ: MongoDB Atlas (موصى به)**
- اتبع نفس خطوات Render أعلاه

**خيار ب: mLab (مدفوع على Heroku)**
```bash
heroku addons:create mongolab:sandbox
```

### الخطوة 4: إضافة Environment Variables

```bash
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI="mongodb+srv://..."
heroku config:set JWT_SECRET="your_secret_key"
heroku config:set BASE_URL="https://your-app.herokuapp.com"
heroku config:set OPENAI_API_KEY="sk-proj-xxx"
# ... باقي المتغيرات
```

**أو عبر Dashboard:**
- Settings → Config Vars → Reveal Config Vars

### الخطوة 5: إعداد Procfile

أنشئ ملف `Procfile` في المجلد الرئيسي:

```
web: node server/server.js
```

### الخطوة 6: Deploy

```bash
git add .
git commit -m "Prepare for Heroku deployment"
git push heroku main

# أو لو الفرع اسمه master
git push heroku master:main
```

### الخطوة 7: فتح التطبيق

```bash
heroku open
```

### الخطوة 8: مراقبة Logs

```bash
heroku logs --tail
```

### ⚠️ ملاحظات Heroku

- **Free Dyno:**
  - 550-1000 ساعة مجانية شهرياً
  - يدخل sleep بعد 30 دقيقة بدون نشاط
- **Paid:**
  - Hobby: $7/شهر
  - Professional: $25/شهر

---

## 🖥️ النشر على VPS (DigitalOcean/AWS/Linode)

### المتطلبات

- VPS مع Ubuntu 20.04+
- Domain name (اختياري)
- الوصول عبر SSH

### الخطوة 1: إعداد السيرفر

```bash
# الاتصال بالسيرفر
ssh root@your-server-ip

# تحديث النظام
apt update && apt upgrade -y

# تثبيت Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# التحقق
node --version
npm --version
```

### الخطوة 2: تثبيت MongoDB

```bash
# استيراد المفتاح
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | apt-key add -

# إضافة Repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# التثبيت
apt update
apt install -y mongodb-org

# تشغيل
systemctl start mongod
systemctl enable mongod

# التحقق
systemctl status mongod
```

### الخطوة 3: رفع الكود

**خيار أ: عبر Git**
```bash
# تثبيت Git
apt install -y git

# استنساخ المشروع
cd /var/www
git clone https://github.com/hsnshehata/zain-ai.git
cd zain-ai
```

**خيار ب: عبر SCP**
```bash
# من جهازك المحلي
scp -r zain-ai/ root@your-server-ip:/var/www/
```

### الخطوة 4: تثبيت Dependencies

```bash
cd /var/www/zain-ai
npm install --production
```

### الخطوة 5: إعداد .env

```bash
nano .env
```

أضف المتغيرات:
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb://localhost:27017/zain-ai
# ... باقي المتغيرات
```

### الخطوة 6: تثبيت PM2 (Process Manager)

```bash
npm install -g pm2

# تشغيل التطبيق
pm2 start server/server.js --name "zain-ai"

# تشغيل تلقائي عند إعادة التشغيل
pm2 startup
pm2 save
```

### الخطوة 7: إعداد Nginx (Reverse Proxy)

```bash
# تثبيت Nginx
apt install -y nginx

# إنشاء ملف الإعداد
nano /etc/nginx/sites-available/zain-ai
```

محتوى الملف:
```nginx
server {
    listen 80;
    server_name your-domain.com;  # أو IP

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

تفعيل الإعداد:
```bash
ln -s /etc/nginx/sites-available/zain-ai /etc/nginx/sites-enabled/
nginx -t  # اختبار الإعداد
systemctl restart nginx
```

### الخطوة 8: إعداد Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

### الخطوة 9: اختبار

افتح في المتصفح:
```
http://your-server-ip
# أو
http://your-domain.com
```

---

## 🐳 النشر باستخدام Docker

### الخطوة 1: إنشاء Dockerfile

أنشئ ملف `Dockerfile` في المجلد الرئيسي:

```dockerfile
# استخدم Node 18 Alpine (صغير الحجم)
FROM node:18-alpine

# تثبيت اعتماديات إضافية للبناء
RUN apk add --no-cache python3 make g++

# إعداد مجلد العمل
WORKDIR /app

# نسخ package files
COPY package*.json ./

# تثبيت dependencies
RUN npm ci --only=production

# نسخ الكود
COPY . .

# إنشاء مستخدم غير root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# فتح المنفذ
EXPOSE 5000

# تشغيل التطبيق
CMD ["node", "server/server.js"]
```

### الخطوة 2: إنشاء .dockerignore

```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
uploads/*
server/logs/*
dist/
```

### الخطوة 3: إنشاء docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/zain-ai
      - JWT_SECRET=${JWT_SECRET}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      # ... باقي المتغيرات
    depends_on:
      - mongo
    restart: unless-stopped

  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped

volumes:
  mongo-data:
```

### الخطوة 4: بناء وتشغيل

```bash
# بناء Image
docker build -t zain-ai:latest .

# تشغيل مع Docker Compose
docker-compose up -d

# مراقبة Logs
docker-compose logs -f

# إيقاف
docker-compose down
```

### الخطوة 5: النشر على Docker Hub (اختياري)

```bash
# تسجيل دخول
docker login

# Tag
docker tag zain-ai:latest yourusername/zain-ai:latest

# Push
docker push yourusername/zain-ai:latest
```

---

## 🔒 إعداد HTTPS

### باستخدام Let's Encrypt (مجاني)

```bash
# تثبيت Certbot
apt install -y certbot python3-certbot-nginx

# الحصول على شهادة SSL
certbot --nginx -d your-domain.com -d www.your-domain.com

# تجديد تلقائي
certbot renew --dry-run
```

Nginx سيُحدَّث تلقائياً للاستماع على Port 443 (HTTPS).

---

## 📊 المراقبة والصيانة

### 1. مراقبة Logs

```bash
# PM2
pm2 logs zain-ai

# Heroku
heroku logs --tail

# Docker
docker-compose logs -f app

# مباشر
tail -f server/logs/combined.log
```

### 2. Uptime Monitoring

استخدم:
- [UptimeRobot](https://uptimerobot.com/) (مجاني)
- [Pingdom](https://www.pingdom.com/)
- [Better Uptime](https://betteruptime.com/)

### 3. Prometheus Metrics

```bash
# افتح endpoint المتركات
curl https://your-domain.com/metrics
```

استخدم **Grafana** لعمل Dashboard.

### 4. Backup قاعدة البيانات

**MongoDB Atlas:**
- Backups تلقائية كل 12 ساعة (في Free tier)

**Local MongoDB:**
```bash
# Backup يدوي
mongodump --db zain-ai --out /backups/$(date +%Y%m%d)

# Restore
mongorestore --db zain-ai /backups/20260206/zain-ai

# Cron لـ Backup تلقائي
crontab -e
# أضف: 0 2 * * * mongodump --db zain-ai --out /backups/$(date +\%Y\%m\%d)
```

### 5. تحديث الكود

```bash
# على VPS
cd /var/www/zain-ai
git pull origin main
npm install
pm2 restart zain-ai

# على Heroku
git push heroku main

# على Render
# يحدث تلقائياً عند Push لـ GitHub
```

---

## ✅ Checklist بعد النشر

- [ ] **التطبيق يعمل:** افتح الرابط وتأكد
- [ ] **HTTPS مفعّل:** يظهر القفل في المتصفح
- [ ] **قاعدة البيانات متصلة:** تسجيل مستخدم جديد يعمل
- [ ] **البوتات تعمل:** أنشئ بوت وجرب الشات
- [ ] **Logs تعمل:** راقب الـ Logs لأي أخطاء
- [ ] **Webhooks تعمل:** اختبر Facebook/WhatsApp
- [ ] **Backups مجدولة:** تأكد من حفظ نسخ احتياطية
- [ ] **Monitoring مفعّل:** UptimeRobot أو مشابه
- [ ] **Environment Variables آمنة:** لا Secrets في الكود
- [ ] **Rate Limiting يعمل:** اختبر بطلبات كثيرة

---

## 🆘 مشاكل شائعة بعد النشر

### ❌ Application Error / 503

**السبب:** App لم يبدأ بشكل صحيح

**الحل:**
```bash
# تحقق من Logs
heroku logs --tail
# أو
pm2 logs zain-ai
```

### ❌ Cannot connect to MongoDB

**السبب:** IP غير مسموح أو رابط خاطئ

**الحل:**
- تأكد من IP Whitelist في MongoDB Atlas
- تحقق من `MONGODB_URI` في Environment Variables

### ❌ Webhooks not receiving

**السبب:** Facebook/WhatsApp لا يمكنهم الوصول للـ URL

**الحل:**
- تأكد من HTTPS مفعّل
- تأكد من Firewall يسمح بالاتصالات الخارجية
- اختبر الـ URL يدوياً:
```bash
curl https://your-domain.com/api/webhook/facebook?hub.mode=subscribe&hub.verify_token=hassanshehata&hub.challenge=test
```

---

## 📞 الدعم

- **الوثائق:** [README.md](README.md)
- **GitHub Issues:** [github.com/hsnshehata/zain-ai/issues](https://github.com/hsnshehata/zain-ai/issues)
- **Email:** support@zain-ai.com

---

<div align="center">

**🎉 مبروك! منصتك الآن في الإنتاج! 🎉**

[⬆️ العودة للأعلى](#-دليل-النشر---zain-ai)

</div>
