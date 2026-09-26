# زين بوت ZainBot AI

**منصة مفتوحة المصدر لوكلاء المبيعات وخدمة العملاء بالذكاء الاصطناعي** — رد وبيع واحجز وتابع عملاءك على مدار الساعة عبر واتساب وماسنجر فيسبوك وانستجرام وتيليجرام وشات الموقع والمتاجر المستضافة. كل ده من لوحة تحكم واحدة بالعربي والإنجليزي.

> **التجربة الحية:** https://zainbot.com · **English docs:** [README.md](README.md)

## المميزات

- **وكلاء ذكاء اصطناعي** متدربين على بياناتك (أسئلة شائعة، كتالوج، هوية البراند) بمفاتيحك الخاصة (OpenAI وGemini وAnthropic وOpenRouter) + تحويل تلقائي عند الأعطال
- **صندوق وارد موحد** — واتساب وماسنجر وانستجرام وتيليجرام وودجت الموقع وشات المتجر
- **تجارة** — كتالوج منتجات وطلبات داخل الشات وحجوزات وعملاء ومبيعات ومصروفات
- **فرز الرسائل** — تصنيف شكوى / نية شراء / اقتراح / استفسار / سبام مع تنبيهات للمالك
- **لجنة الأفكار** — اختبر فكرة مشروعك مع 8 نقاد ذكاء اصطناعي قبل ما تبني
- **تحويل للبشر** وتحليلات ومفاتيح API وويب هوك واشتراكات يدوية (انستاباي / محافظ كاش)

## التشغيل محلياً

المتطلبات: **Node.js ≥ 22** و**MongoDB** (محلي أو Atlas).

```bash
git clone https://github.com/hsnshehata/new-zainbot.git
cd new-zainbot
npm install
cp .env.example .env   # واملأ القيم اللي تحت
npm start              # أو: npm run dev (إعادة تحميل تلقائي)
```

افتح http://localhost:5000 — صفحة التعريف `/` ولوحة التحكم `/dashboard` والهيلث `/health`.

### أهم متغيرات `.env`

| المتغير | إجباري | الاستخدام |
|---|---|---|
| `MONGODB_URI` | ✅ | رابط الاتصال بقاعدة البيانات |
| `JWT_SECRET` | ✅ | نص عشوائي 32 حرف على الأقل (توقيع الدخول) |
| `BASE_URL` | ✅ | الرابط العام، مثال `http://localhost:5000` |
| `CREDENTIAL_ENCRYPTION_KEY` | ✅ | مفتاح `base64:` بطول 32 بايت (تشفير أسرار القنوات والذكاء الاصطناعي) |
| `PORT` | – | الافتراضي `5000` |
| `GOOGLE_CLIENT_ID` | – | الدخول بجوجل |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` | – | قناة تيليجرام |
| `META_*` / `FACEBOOK_*` / `INSTAGRAM_*` / `WHATSAPP_*` | – | قنوات ميتا والويب هوك |
| `SUBSCRIPTION_WHATSAPP_NUMBER` | – | الرقم الظاهر في قسم الأسعار (من غير `+`) |
| `INSTAGRAM_REDIRECT_URI` | – | رابط OAuth؛ الافتراضي `{BASE_URL}/dashboard` |
| `METRICS_TOKEN` | – | حماية `/metrics` |

القائمة الكاملة في [.env.example](.env.example). ممنوع تعمل commit لملف `.env`.

## التشغيل على سيرفر

### الطريقة الأولى — Docker (مُفضلة)

```bash
docker build -t zainbot .
docker run -d --name zainbot --restart unless-stopped \
  -p 5000:5000 --env-file .env \
  -v zainbot-data:/app/data -v zainbot-uploads:/app/uploads \
  zainbot
curl http://localhost:5000/health   # المتوقع {"status":"ok"}
```

### الطريقة الثانية — Coolify / Dokploy / سيرفر VPS

1. وجه التطبيق على الريبو ده (برانش `master`) بنظام بناء **Dockerfile**.
2. حط متغيرات البيئة من الجدول اللي فوق في لوحة التحكم.
3. اربط تخزين دائم (volumes) لمسار `/app/data` (جلسات واتساب) و`/app/uploads`.
4. اعمل Deploy وتأكد إن `/health` بيرجع 200.

### النسخ الاحتياطي

- قاعدة MongoDB فيها المستخدمين والبوتات والمحادثات والمتاجر والطلبات — خد منها `mongodump` بجدول دوري.
- مجلدا `/app/uploads` (صور المنتجات) و`/app/data` (جلسات واتساب) على volumes — انسخهم احتياطياً برضه.

## الأوامر والتستات

| الأمر | بيعمل إيه |
|---|---|
| `npm start` | تشغيل السيرفر للإنتاج |
| `npm run dev` | تشغيل مع إعادة التحميل التلقائي |
| `npm test` | كل التستات (`node scripts/run-tests.js` شامل `tests/ideaCouncil/`) |
| `npm run build:linux` | نسخة standalone عبر `pkg` |

الـ CI بيشغل `npm test` مع كل push/PR.

## هيكل المشروع

```
server/          تطبيق Express (routes وcontrollers وmodels وservices وmiddleware وconfig)
public/          الواجهات — index.html (التسويق) وdashboard.html وصفحات الشات والمتجر
scripts/         run-tests.js وتدقيق قاعدة البيانات القديمة (قراءة فقط)
tests/           تستات API والأمان والترجمات (شامل tests/ideaCouncil/)
docs/internal/   خطط داخلية قديمة (مش وثائق للمستخدم)
Dockerfile       صورة الإنتاج (node:22 ومستخدم غير root وفحص /health)
```

كل نص ظاهر للمستخدم موجود بالعربي **والإنجليزي** معاً ومتغطي بتستات ترجمة.

## المساهمة والأمان

- المساهمات مرحب بها — شوف [CONTRIBUTING.md](CONTRIBUTING.md).
- لقيت ثغرة؟ شوف [SECURITY.md](SECURITY.md) — من فضلك متفتحش issue عامة.

## الرخصة

MIT — شوف ملف [LICENSE](LICENSE).
