# 📋 سجل التغييرات (Changelog)

جميع التغييرات المهمة في المشروع موثقة في هذا الملف.

النسخة المعتمدة: [Semantic Versioning](https://semver.org/)

## [1.0.0] - 2026-02-06

### ✨ إضافات جديدة (Added)

#### 🤖 نظام البوتات الأساسي
- إنشاء وإدارة بوتات متعددة لكل مستخدم
- دعم الاشتراكات (Free, Monthly, Yearly)
- نظام الإيقاف التلقائي للبوتات عند انتهاء الاشتراك
- رسائل ترحيب قابلة للتخصيص
- نظام قواعد (Rules) لردود مخصصة

#### 🧠 الذكاء الاصطناعي
- تكامل كامل مع OpenAI API
  - GPT-4o-mini للمحادثات النصية
  - GPT-4.1-nano-2025-04-14 للصور
- معالجة الرسائل النصية والصوتية والصور
- تحويل الصوت إلى نص باستخدام LemonFox API
- استخراج النوايا (رقم الهاتف، الطلبات، استفسارات)
- ذاكرة محادثة ذكية مع حفظ السياق
- منع الرسائل المكررة باستخدام NodeCache

#### 🔗 تكامل القنوات
- **Facebook Messenger**
  - استقبال وإرسال الرسائل
  - Webhooks مع تحقق آمن
  - تجديد تلقائي للتوكينات
- **WhatsApp Business API**
  - دعم كامل للرسائل
  - معالجة الصور والصوت
  - Webhooks آمن
- **Instagram Direct Messages**
  - رسائل مباشرة
  - دعم التعليقات
  - تجديد تلقائي للتوكينات
- **Telegram Bot**
  - إشعارات للطلبات الجديدة
  - تحديثات حالة الطلبات
  - دعم متعدد اللغات (عربي/إنجليزي)
- **Web Chat**
  - صفحة شات مخصصة لكل بوت
  - واجهة مستخدم سلسة

#### 🏪 نظام المتجر الإلكتروني
- إنشاء وإدارة متاجر إلكترونية
- ربط البوتات بالمتاجر
- إدارة المنتجات والأقسام
- نظام طلبات الشات (Chat Orders) مع استخراج تلقائي
- إدارة العملاء (Chat Customers)
- 5 قوالب متجر مختلفة
- لاندينج بيج مخصص لكل متجر
- روابط متاجر قابلة للتخصيص

#### 💼 إدارة الأعمال
- نظام إدارة الموردين (Suppliers)
- تتبع المبيعات (Sales)
- إدارة الطلبات (Orders)
- تتبع المصروفات (Expenses)
- إدارة العملاء (Customers)
- نظام الموظفين (Employees)
- فواتير الشراء (Purchase Invoices)

#### 📊 التحليلات والتقارير
- لوحة تحليلات شاملة
- إحصائيات المحادثات
- تتبع أداء البوتات
- نظام الملاحظات (Feedback)
- Prometheus Metrics للمراقبة
- تقارير يومية عبر تيليجرام

#### 🔐 الأمان والمصادقة
- نظام JWT Authentication
- Google OAuth Login
- نظام أدوار (User, SuperAdmin)
- تحقق من البريد الإلكتروني
- إرسال رسائل تحقق عبر Gmail
- Rate Limiting متقدم:
  - حد عام: 300 طلب / 15 دقيقة
  - حد مصادقة: 7 طلبات / 15 دقيقة
  - حد webhooks: 60 طلب / دقيقة
- Helmet.js للحماية من الثغرات
- CORS مع إعدادات آمنة
- CSP (Content Security Policy)

#### 💻 تطبيق سطح المكتب (WazainBot)
- تطبيق Electron لربط WhatsApp Web
- مسح QR Code مباشر
- حفظ جلسات WhatsApp محلياً
- إدارة بوتات متعددة
- عداد الرسائل المباشر
- مزامنة تلقائية مع المنصة

#### ⏰ المهام الدورية (Cron Jobs)
- فحص البوتات المنتهية يومياً
- تجديد توكينات Instagram/Facebook تلقائياً
- تنبيهات المخزون المنخفض
- تنظيف اللوجز القديمة أسبوعياً

#### 📱 واجهات المستخدم
- لوحة تحكم شاملة جديدة
- صفحة تسجيل دخول/تسجيل
- صفحة إعدادات متقدمة
- صفحة المحادثات
- صفحة الإشعارات
- صفحة التحليلات
- صفحة إدارة المتاجر
- صفحة 404 مخصصة

#### 🛠️ أدوات التطوير
- نظام Logging متقدم (Winston)
- اختبارات Jest
- Build system لإنشاء binaries
  - Windows (x64)
  - Linux (x64)
  - macOS (x64)
- Nodemon للتطوير
- دعم Environment Variables

---

## 🔮 المخطط المستقبلي (Roadmap)

### [1.1.0] - قريباً

#### مخطط
- [ ] دعم Discord Bot
- [ ] دعم Slack Integration
- [ ] نظام التذاكر (Ticketing System)
- [ ] Live Chat مع تحويل للبشر
- [ ] نظام الأولويات للمحادثات
- [ ] AI Training على بيانات محددة
- [ ] تقارير متقدمة بـ Charts
- [ ] نظام دفع إلكتروني مدمج
- [ ] Multi-language Support للواجهة
- [ ] Mobile App (React Native)

### [1.2.0] - مستقبلاً

#### مخطط
- [ ] WhatsApp Cloud API Integration
- [ ] Voice Calls Support
- [ ] Video Messages Support
- [ ] Bot Templates Marketplace
- [ ] Webhook Builder (No-Code)
- [ ] AI Auto-Training من المحادثات
- [ ] Sentiment Analysis للمحادثات
- [ ] CRM Integration (Salesforce, HubSpot)
- [ ] Email Marketing Integration
- [ ] SMS Gateway Integration

---

## 📝 أنواع التغييرات

- `إضافة` - ميزات جديدة
- `تغيير` - تغييرات في مميزات موجودة
- `إهمال` - مميزات ستُحذف قريباً
- `حذف` - مميزات تم حذفها
- `إصلاح` - إصلاح أخطاء
- `أمان` - تحديثات أمنية

---

## 🔗 روابط مفيدة

- [الصفحة الرئيسية](https://github.com/hsnshehata/zain-ai)
- [التوثيق الكامل](README.md)
- [دليل المساهمة](CONTRIBUTING.md)
- [الإصدارات](https://github.com/hsnshehata/zain-ai/releases)

---

<div align="center">

**لمتابعة آخر التحديثات، راقب [Releases](https://github.com/hsnshehata/zain-ai/releases)**

</div>
