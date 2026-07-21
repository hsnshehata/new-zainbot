# 🔒 سياسة الأمان - Zain AI

نأخذ أمان منصة Zain AI على محمل الجد. إذا اكتشفت ثغرة أمنية، نرجو إبلاغنا فوراً.

---

## 🚨 الإبلاغ عن ثغرة أمنية

### ⚠️ **لا تفتح Issue عامة**

الثغرات الأمنية يجب إبلاغنا بها بشكل خاص أولاً.

### 📧 كيفية الإبلاغ

أرسل تقريراً مفصلاً إلى:

**Email:** security@zain-ai.com

**يجب أن يتضمن التقرير:**

1. **وصف الثغرة:**
   - ما نوع المشكلة؟ (SQL Injection, XSS, Authentication bypass, etc.)
   - أين توجد؟ (ملف، route، endpoint)

2. **خطوات إعادة الثغرة:**
   - كيف يمكننا إعادة المشكلة؟
   - خطوات واضحة ومرقمة

3. **التأثير المحتمل:**
   - ما مدى خطورة الثغرة؟
   - من يمكن أن يتأثر؟

4. **Proof of Concept (اختياري):**
   - كود توضيحي
   - Screenshots

5. **معلومات البيئة:**
   - نظام التشغيل
   - نسخة Node.js
   - نسخة المنصة

### 🕐 فترة الاستجابة

- **24 ساعة:** تأكيد استلام البلاغ
- **7 أيام:** تحديث أولي عن التحقيق
- **30 يوم:** إصلاح متوقع (حسب الخطورة)

---

## 🛡️ الثغرات المدعومة

نقبل التقارير عن:

### ✅ في النطاق (In Scope)

- **Authentication/Authorization:**
  - JWT bypass
  - Session hijacking
  - Privilege escalation

- **Injection:**
  - SQL/NoSQL Injection
  - Command Injection
  - Code Injection

- **XSS (Cross-Site Scripting):**
  - Stored XSS
  - Reflected XSS
  - DOM-based XSS

- **CSRF (Cross-Site Request Forgery)**

- **SSRF (Server-Side Request Forgery)**

- **Information Disclosure:**
  - Sensitive data exposure
  - API key leakage

- **Business Logic Flaws:**
  - Rate limit bypass
  - Payment bypass
  - Access control issues

### ❌ خارج النطاق (Out of Scope)

- **Self-XSS:** يتطلب تفاعل المستخدم نفسه
- **DoS/DDoS:** هجمات الحرمان من الخدمة
- **Social Engineering**
- **Physical attacks**
- **Open ports:** بدون استغلال فعلي
- **Missing security headers:** بدون تأثير حقيقي
- **Version disclosure:** معلومات النسخة فقط
- **Clickjacking:** على صفحات غير حساسة
- **SPF/DKIM/DMARC:** إعدادات البريد

---

## 🏆 برنامج Bug Bounty

**الحالة:** غير متاح حالياً

نحن نقدر جهود الباحثين الأمنيين ونعترف بمساهماتهم علناً (مع موافقتهم).

---

## 🔐 أفضل الممارسات الأمنية

### للمطورين

#### 1. **لا تكتب Secrets في الكود**

```javascript
// ❌ خطأ
const apiKey = 'sk-proj-abc123...';

// ✅ صحيح
const apiKey = process.env.OPENAI_API_KEY;
```

#### 2. **استخدم Parameterized Queries**

```javascript
// ❌ خطأ (NoSQL Injection)
const user = await User.findOne({ username: req.body.username });

// ✅ صحيح
const user = await User.findOne({ username: sanitize(req.body.username) });
```

#### 3. **تحقق من Input دائماً**

```javascript
// ✅ صحيح
const schema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required()
});
const { error } = schema.validate(req.body);
if (error) return res.status(400).json({ message: error.details[0].message });
```

#### 4. **استخدم HTTPS فقط في Production**

```javascript
// في server.js
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}
```

#### 5. **Rate Limiting**

```javascript
// ✅ موجود في المنصة
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});
app.use(limiter);
```

### للمستخدمين

#### 1. **استخدم كلمات مرور قوية**
- على الأقل 12 حرف
- أحرف كبيرة، صغيرة، أرقام، رموز
- لا تعيد استخدام نفس الكلمة

#### 2. **فعّل Google 2FA**
- استخدم تطبيق Authenticator

#### 3. **لا تشارك Tokens**
- JWT Tokens شخصية
- لا تضعها في Git
- لا تشاركها عبر email

#### 4. **راقب النشاط**
- تحقق من Logs بانتظام
- راقب تسجيلات الدخول غير المعتادة

#### 5. **حدّث المنصة باستمرار**
```bash
git pull origin main
npm install
npm audit fix
```

---

## 🔍 التدقيق الأمني

### npm audit

```bash
# فحص الثغرات في الاعتماديات
npm audit

# إصلاح تلقائي
npm audit fix

# إصلاح قسري (قد يكسر الكود)
npm audit fix --force
```

### تشغيل مراجعة أمنية

```bash
# تثبيت أدوات Security
npm install -g snyk

# تسجيل دخول
snyk auth

# فحص المشروع
snyk test

# مراقبة مستمرة
snyk monitor
```

---

## 📋 Checklist أمان الإنتاج

قبل Deploy للإنتاج، تأكد من:

### ⚙️ البيئة

- [ ] **`.env` محمي:** غير موجود في Git
- [ ] **JWT_SECRET قوي:** 32+ حرف عشوائي
- [ ] **MONGODB_URI محمي:** Username/Password قويين
- [ ] **HTTPS مفعّل:** لا يوجد HTTP في الإنتاج
- [ ] **NODE_ENV=production**

### 🔐 المصادقة

- [ ] **Rate limiting مفعّل**
- [ ] **Password hashing يعمل** (bcrypt)
- [ ] **JWT expiration محدد** (7 أيام)
- [ ] **Email verification مفعّل**

### 🌐 الشبكة

- [ ] **CORS محدود:** ليس `*` في الإنتاج
- [ ] **Helmet.js مفعّل**
- [ ] **CSP محدد بشكل صحيح**
- [ ] **Trust proxy مضبوط** (لو خلف Load Balancer)

### 💾 قاعدة البيانات

- [ ] **MongoDB authentication مفعّل**
- [ ] **IP Whitelist محدد** (ليس 0.0.0.0/0)
- [ ] **Backups تلقائية مفعّلة**
- [ ] **Indexes على الحقول الحساسة**

### 📝 Logging

- [ ] **Winston logger يعمل**
- [ ] **Logs لا تحتوي Secrets**
- [ ] **Log rotation مفعّل**
- [ ] **تنظيف Logs القديمة**

### 🚀 عام

- [ ] **npm audit نظيف**
- [ ] **Dependencies محدثة**
- [ ] **Error messages لا تكشف تفاصيل**
- [ ] **File uploads محدودة** (الحجم والنوع)

---

## 📚 مراجع أمنية

### أدوات مفيدة

- **OWASP Top 10:** [owasp.org/www-project-top-ten](https://owasp.org/www-project-top-ten/)
- **npm audit:** مدمج في npm
- **Snyk:** [snyk.io](https://snyk.io/)
- **Helmet.js:** [helmetjs.github.io](https://helmetjs.github.io/)

### شهادات

إذا حصلت المنصة على تدقيق أمني، سيتم إدراجه هنا.

---

## 🙏 شكر وتقدير

نشكر الباحثين الأمنيين الذين ساهموا في تحسين أمان المنصة:

<!-- قائمة الباحثين ستُضاف هنا -->

- *لا يوجد بلاغات حتى الآن*

---

## 📧 الاتصال

**للأمور الأمنية فقط:**
- 📧 Email: security@zain-ai.com

**للدعم العام:**
- 💬 GitHub Issues: [github.com/hsnshehata/zain-ai/issues](https://github.com/hsnshehata/zain-ai/issues)
- 📧 Email: support@zain-ai.com

---

## 📄 الترخيص

هذا المشروع مرخص تحت [MIT License](LICENSE).

---

<div align="center">

**الأمان مسؤولية الجميع 🔒**

شكراً لمساعدتنا في جعل Zain AI أكثر أماناً!

</div>
