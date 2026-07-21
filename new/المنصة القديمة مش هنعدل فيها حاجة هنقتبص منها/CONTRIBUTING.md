# 🤝 دليل المساهمة في Zain AI

شكراً لاهتمامك بالمساهمة في **Zain AI**! نرحب بجميع أنواع المساهمات من تحسينات الكود، إصلاح الأخطاء، إضافة مميزات، أو تحسين التوثيق.

---

## 📋 جدول المحتويات

- [قواعد السلوك](#-قواعد-السلوك)
- [كيف يمكنك المساهمة](#-كيف-يمكنك-المساهمة)
- [إعداد بيئة التطوير](#-إعداد-بيئة-التطوير)
- [معايير الكود](#-معايير-الكود)
- [عملية Pull Request](#-عملية-pull-request)
- [الإبلاغ عن الأخطاء](#-الإبلاغ-عن-الأخطاء)
- [طلب مميزات جديدة](#-طلب-مميزات-جديدة)

---

## 📜 قواعد السلوك

نتوقع من جميع المساهمين:

- **الاحترام**: تعامل مع الجميع بلطف واحترام
- **التعاون**: كن منفتحاً على النقاش البناء والملاحظات
- **التركيز**: ركّز على تحسين المشروع وليس على الخلافات الشخصية
- **الصبر**: تذكر أن المراجعين متطوعون

---

## 🎯 كيف يمكنك المساهمة

### أنواع المساهمات المرحب بها

#### 1. **إصلاح الأخطاء (Bug Fixes)**
- راجع [Issues](https://github.com/hsnshehata/zain-ai/issues) للأخطاء المفتوحة
- ابحث عن الـ label `bug`

#### 2. **إضافة مميزات (Features)**
- تحقق من [Roadmap](https://github.com/hsnshehata/zain-ai/projects) للمميزات المخططة
- اقترح مميزات جديدة عبر Issue

#### 3. **تحسين الأداء (Performance)**
- تحسين سرعة الاستجابة
- تقليل استهلاك الذاكرة
- تحسين استعلامات قاعدة البيانات

#### 4. **تحسين التوثيق (Documentation)**
- إصلاح الأخطاء الإملائية
- إضافة أمثلة توضيحية
- ترجمة التوثيق

#### 5. **كتابة الاختبارات (Tests)**
- زيادة تغطية الاختبارات
- إضافة اختبارات للمميزات الجديدة

---

## 💻 إعداد بيئة التطوير

### 1. Fork المشروع

اضغط على زر **Fork** في صفحة المشروع على GitHub.

### 2. استنساخ المشروع

```bash
git clone https://github.com/YOUR_USERNAME/zain-ai.git
cd zain-ai
```

### 3. إضافة remote للمشروع الأصلي

```bash
git remote add upstream https://github.com/hsnshehata/zain-ai.git
```

### 4. تثبيت الاعتماديات

```bash
npm install
```

### 5. إعداد البيئة

```bash
cp .env.example .env
# عدّل .env بإعداداتك المحلية
```

### 6. تشغيل السيرفر

```bash
npm run dev
```

### 7. تأكد من عمل الاختبارات

```bash
npm test
```

---

## 📝 معايير الكود

### قواعد عامة

#### **1. اللغة**
- **التعليقات**: اكتب التعليقات بالعربية للشرح
- **الأسماء**: استخدم الإنجليزية للمتغيرات والدوال
- **الرسائل**: رسائل الـ console والـ logger بالعربية

```javascript
// ❌ خطأ
const user = getUserData(); // get user data

// ✅ صحيح
const user = getUserData(); // جلب بيانات المستخدم
```

#### **2. تنسيق الكود**
- **Indentation**: استخدم مسافتين (2 spaces)
- **Semicolons**: استخدم الفاصلة المنقوطة
- **Quotes**: استخدم علامات اقتباس مفردة `'`

```javascript
// ✅ صحيح
const botName = 'زين الذكي';
logger.info('تم إنشاء البوت', { botName });
```

#### **3. ES6+ Standards**
- استخدم `const` و `let` بدلاً من `var`
- استخدم Arrow Functions حيث أمكن
- استخدم Template Literals
- استخدم Destructuring

```javascript
// ❌ خطأ
var name = bot.name;
var userId = bot.userId;

// ✅ صحيح
const { name, userId } = bot;
```

#### **4. Async/Await**
- استخدم `async/await` بدلاً من `.then()/.catch()`
- أضف `try/catch` دائماً

```javascript
// ❌ خطأ
function getUser(id) {
  return User.findById(id)
    .then(user => user)
    .catch(err => console.error(err));
}

// ✅ صحيح
async function getUser(id) {
  try {
    const user = await User.findById(id);
    return user;
  } catch (err) {
    logger.error('خطأ في جلب المستخدم', { err: err.message });
    throw err;
  }
}
```

#### **5. Error Handling**
- استخدم `try/catch` في جميع الـ async functions
- استخدم `logger` بدلاً من `console.log`
- أعد رمي الأخطاء (throw) بعد تسجيلها

```javascript
// ✅ صحيح
async function createBot(botData) {
  try {
    const bot = new Bot(botData);
    await bot.save();
    logger.info('تم إنشاء بوت جديد', { botId: bot._id });
    return bot;
  } catch (err) {
    logger.error('خطأ في إنشاء البوت', { err: err.message });
    throw new Error('فشل إنشاء البوت');
  }
}
```

#### **6. Logging**
- استخدم `logger` (Winston) وليس `console.log`
- ضع سياق (context) مع كل log

```javascript
// ❌ خطأ
console.log('Bot created');

// ✅ صحيح
logger.info('تم إنشاء بوت جديد', { botId: bot._id, userId: bot.userId });
```

#### **7. التعامل مع قاعدة البيانات**
- استخدم `select()` لتحديد الحقول المطلوبة فقط
- استخدم `lean()` للقراءة فقط (أسرع)
- أضف indexes على الحقول المستخدمة في البحث

```javascript
// ❌ بطيء
const users = await User.find();

// ✅ أسرع
const users = await User.find()
  .select('username email')
  .lean();
```

### بنية الملفات

#### Controllers

```javascript
// server/controllers/exampleController.js

const Model = require('../models/Model');
const logger = require('../logger');

/**
 * وصف الدالة
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
exports.getAllItems = async (req, res) => {
  try {
    const items = await Model.find().lean();
    res.json({ success: true, data: items });
  } catch (err) {
    logger.error('خطأ في جلب العناصر', { err: err.message });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
};
```

#### Routes

```javascript
// server/routes/example.js

const express = require('express');
const router = express.Router();
const controller = require('../controllers/exampleController');
const authenticate = require('../middleware/authenticate');

// مسارات عامة (بدون مصادقة)
router.get('/public', controller.publicEndpoint);

// مسارات محمية (مع مصادقة)
router.get('/', authenticate, controller.getAllItems);
router.post('/', authenticate, controller.createItem);

module.exports = router;
```

#### Models

```javascript
// server/models/Example.js

const mongoose = require('mongoose');

const exampleSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true, 
    trim: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true // أضف index للحقول المستخدمة في البحث
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

module.exports = mongoose.model('Example', exampleSchema);
```

---

## 🔄 عملية Pull Request

### 1. أنشئ فرعاً جديداً

```bash
# تحديث الفرع الرئيسي من المشروع الأصلي
git checkout main
git pull upstream main

# إنشاء فرع جديد
git checkout -b feature/amazing-feature
# أو
git checkout -b fix/bug-description
```

### 2. اكتب كودك

- اتبع [معايير الكود](#-معايير-الكود)
- أضف تعليقات واضحة
- تأكد من عمل الكود

### 3. اكتب الاختبارات

```bash
# أضف اختبارات للمميزات الجديدة
# في مجلد tests/

# شغّل الاختبارات
npm test
```

### 4. Commit التغييرات

استخدم رسائل commit واضحة بالعربية:

```bash
git add .
git commit -m "إضافة: ميزة التحقق من الهوية الثنائية"
# أو
git commit -m "إصلاح: مشكلة في تجديد توكن فيسبوك"
```

**نمط رسائل الـ Commit:**

```
إضافة: [وصف الميزة]
إصلاح: [وصف المشكلة]
تحسين: [وصف التحسين]
توثيق: [وصف التغيير في التوثيق]
أمان: [وصف التحديث الأمني]
```

### 5. Push الفرع

```bash
git push origin feature/amazing-feature
```

### 6. افتح Pull Request

1. اذهب إلى مشروعك المـ forked على GitHub
2. اضغط **"Compare & pull request"**
3. املأ القالب:

```markdown
## 📝 الوصف
وصف واضح للتغييرات

## 🎯 نوع التغيير
- [ ] إصلاح خطأ (Bug fix)
- [ ] ميزة جديدة (New feature)
- [ ] تحسين أداء (Performance improvement)
- [ ] تحديث توثيق (Documentation update)

## ✅ Checklist
- [ ] الكود يتبع معايير المشروع
- [ ] أضفت تعليقات واضحة
- [ ] أضفت اختبارات للتغييرات
- [ ] كل الاختبارات تعمل
- [ ] حدّثت التوثيق
```

### 7. انتظر المراجعة

- راقب التعليقات من المراجعين
- قم بالتعديلات المطلوبة
- اضغط **Resolve conversation** بعد كل تعديل

---

## 🐛 الإبلاغ عن الأخطاء

### قبل الإبلاغ

1. ابحث في [Issues](https://github.com/hsnshehata/zain-ai/issues) للتأكد من عدم وجود تقرير مماثل
2. تأكد أنك تستخدم أحدث إصدار

### كيفية الإبلاغ

افتح [Issue جديد](https://github.com/hsnshehata/zain-ai/issues/new) واملأ القالب:

```markdown
## 🐛 وصف الخطأ
وصف واضح للمشكلة

## 🔄 خطوات إعادة الخطأ
1. اذهب إلى '...'
2. اضغط على '...'
3. شاهد الخطأ

## ✅ السلوك المتوقع
ماذا كان يجب أن يحدث

## 📸 Screenshots
إن وُجدت

## 💻 البيئة
- OS: [e.g. Windows 11]
- Node: [e.g. 18.16.0]
- Browser: [e.g. Chrome 120]

## 📋 معلومات إضافية
أي تفاصيل مفيدة
```

---

## 💡 طلب مميزات جديدة

### قبل الطلب

1. ابحث في Issues للتأكد من عدم طلبها مسبقاً
2. فكّر: هل الميزة مفيدة للمستخدمين الآخرين؟

### كيفية الطلب

افتح [Issue جديد](https://github.com/hsnshehata/zain-ai/issues/new) بعنوان: `[Feature Request] اسم الميزة`

```markdown
## 💡 وصف الميزة
وصف واضح للميزة المطلوبة

## 🎯 المشكلة
ما المشكلة التي تحلها هذه الميزة؟

## 🔧 الحل المقترح
كيف ترى تطبيق الميزة؟

## 🔄 البدائل
هل فكرت في حلول بديلة؟

## 📋 معلومات إضافية
أي تفاصيل مفيدة
```

---

## ❓ الأسئلة الشائعة

### س: هل يمكنني المساهمة وأنا مبتدئ؟
**ج:** بالتأكيد! ابحث عن Issues بـ label `good first issue`.

### س: كم يستغرق مراجعة PR؟
**ج:** عادةً من 1-7 أيام، حسب حجم التغيير.

### س: هل يمكنني العمل على Issue بدون تعيين؟
**ج:** نعم، لكن علّق على الـ Issue أنك تعمل عليه لتجنب التكرار.

### س: رفض الـ PR الخاص بي، ماذا أفعل؟
**ج:** اقرأ التعليقات، اسأل إذا لم تفهم، وجرب مرة أخرى!

---

## 📞 التواصل

- **Email**: support@zain-ai.com
- **GitHub Issues**: [رابط Issues](https://github.com/hsnshehata/zain-ai/issues)

---

<div align="center">

**شكراً لمساهمتك في Zain AI! 🙏**

نقدر وقتك وجهدك في تحسين المشروع ❤️

</div>
