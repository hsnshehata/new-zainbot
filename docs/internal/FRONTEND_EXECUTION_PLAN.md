# خطة تنفيذ إصلاح وتطوير واجهة ZainBot — ستة قادة OpenCode

> **للوكلاء المنفذين:** تُقرأ الخطة كاملة و`AGENTS.md` قبل العمل. استخدم `subagent-driven-development` للتفويض أو `executing-plans` للتنفيذ الداخلي، مع تقديم قواعد المشروع وطلبات حسن على أمثلة المهارات. كل مربع تحقق يمثل نتيجة يجب إثباتها، وليس نية تنفيذ.

**التاريخ:** 2026-10-05.

**الحالة:** خطة مكتوبة؛ لم يبدأ تنفيذ الإصلاحات.

**الهدف:** إصلاح المشاكل المثبتة في الداشبورد، استكمال العربية والإنجليزية، تحسين الموبايل والإتاحة وحالات العمليات، ثم فصل الكود وتحسين التحميل دون تغيير وظائف المنصة خلسة.

**المعمارية:** الحفاظ على vanilla JS وExpress، وإدخال وحدات مستقلة تدريجيًا بعقود محددة. ستة قادة داخليين يعملون بالتوازي في الأجزاء المستقلة؛ التعديلات على الملفات المشتركة تمر في مسار دمج واحد. Anti-Gravity منفذ لتاسكات صغيرة محددة وليس مالكًا للمشروع.

**التقنيات الحالية:** Node >=22، Express، MongoDB/Mongoose، HTML/CSS/JavaScript، اختبارات `node:test` وSupertest. إضافة browser runner وminifier محددة أدناه، لا إضافة framework.
**مرجع التصميم:** طلب حسن بالتخطيط فقط، ونقاش الإصلاح التدريجي، والمراجعات الست للقراءة فقط التي أجريت لإعداد هذه الوثيقة. هذه الوثيقة تجمع التصميم التشغيلي والخطة؛ التفاصيل المشروطة تخضع للبوابات المحددة هنا.

## 1. حدود الاتفاق

- المطلوب الآن كتابة الخطة، وليس تشغيل قادة التنفيذ أو Anti-Gravity لإصلاح المنتج.
- طريقة التنفيذ التي اختارها حسن: ستة قادة OpenCode، لكل قائد مسار، ويمكنه تفويض أجزاء صغيرة لوكلاء داخليين وAnti-Gravity.
- عند اعتماد التنفيذ، يعمل القائد حتى ينهي نطاقه أو يصل إلى تبعية/قرار/عائق؛ لا يدعي الإتمام إذا كان منتظرًا غيره.
- لا توجد مدد زمنية أو وعود بنسب تحسن افتراضية. مهلة عملية agy حد تشغيلي لمنع التعليق، وليست تقديرًا لمدة المشروع.
- النطاق الأساسي هو الداشبورد بكل تبويباته. auth يدخل في حفظ اللغة ورسائل الأخطاء والإتاحة المتصلة بالدخول. بقية الصفحات تدخل في regression والحصر؛ مهام المتجر/الشات الإضافية مشروطة بتفعيل نطاقها.
- لا يُعاد تصميم الهوية البصرية بالكامل، ولا تضاف مميزات تحليلات أو panels أو SSR أو PWA جديدة ضمن إصلاحات التقرير.
- لا commit أو push أو PR أو deploy دون طلب صريح منفصل. حتى worktree integration لا يتطلب commit تلقائيًا.

## 2. حقائق تؤسس الخطة — وليست نتائج اختبار نجاح

المصدر: قراءة المشروع بواسطة ستة وكلاء وتحقق المنسق من `package.json` وGit وسكربت agy. يجب إعادة تثبيت الحقائق وقت التنفيذ لأن الأسطر والأحجام تتغير.

| بند التقرير السابق | الحقيقة من قراءة المشروع | القرار |
|---|---|---|
| اللغة لا تحفظ | `applyLanguage()` يستخدم `zainbot_lang` بالفعل | hardening للقيم والتخزين؛ لا بناء نظام بديل |
| sidebar غير موجود/بدائي | drawer وscrim وEscape وRTL موجودة عند 991px | اختبار السلوك وإصلاح focus/inert والعرض |
| Dark Mode Toggle موجود | chat theme presets موجودة؛ لم يُثبت toggle لمظهر dashboard | قرار منتج مشروط، لا الخلط بين الاثنين |
| lazy loading غير موجود | store landing يختار CSS/JS للقالب؛ dashboard لا يؤجل كود التبويبات | تحسين الداشبورد وتدقيق الموجود |
| ملف JS 388KB | `dashboard_new.js`: 388,133 bytes raw، gzip محلي 88,178 | baseline نقل حقيقي قبل تحديد budget |
| كل شيء في ملف | dashboard IIFE كبيرة ومعها helpers موجودة | extraction تدريجي؛ لا نسخ clients/helpers متوازية |
| مشاكل loading فقط | بعض HTTP failures تظهر empty؛ بعض route methods/shapes غير متطابقة | إصلاح العقود قبل تحسين الرسائل |
| a11y 20% والترجمة 40% | لا يوجد قياس يثبت هذه النسب | لا تستخدمها كمؤشر إنجاز |

### ملاحظات البيئة والعمل الموجود

- أثناء التخطيط: `AGENTS.md` معدل بالفعل، و`.github/` غير متتبع. لا overwrite/reset/stash/إضافة تلقائية لهذه الملفات.
- المراجعات وجدت `node/npm` غير موجودين على PATH المعتاد. سكربت agy يشير إلى `/root/.config/opencode/tools/node-v24.21.0-linux-x64/bin/node`؛ يجب اختبار وجوده وإصداره في A01، لا افتراض فقد Node نهائيًا.
- `package.json` يطلب Node >=22؛ أوامر `pkg` تستهدف Node18. لا تعدل packaging ضمن هذه الخطة.
- يوجد اختلاف توثيق `main/master`؛ تحقق عند طلب النشر مستقبلًا. لا تبدل فرع المشروع الآن.
- لا توجد نتائج tests أو browser PASS ناتجة عن كتابة هذه الخطة.

## 3. القيود العامة الملزمة

1. كل إضافة UI عربية وإنجليزية في نفس التغيير. markup: `data-i18n`؛ placeholders: `data-i18n-placeholder`؛ accessible labels: `data-i18n-aria`.
2. كل مفتاح جديد يضاف إلى `en` و`ar` في `public/js/dashboard_new.js`. لا نقل القواميس إلى JSON ضمن هذه الخطة.
3. لا نصوص UI ثابتة في renderers أو errors أو modals. بيانات العملاء وأسماءهم ورسائلهم لا تُترجم ولا تُستبدل.
4. تشغيل `node tests/dashboardTranslations.test.js` لكل دفعة dashboard وقبل أي commit مطلوب لاحقًا.
5. أي تغيير JS معه version query/cache bump لكل HTML مستهلك، مع تنسيق service worker. المنسق يراجع اكتمال bump عند الدمج.
6. النقر في browser tests عبر `mouse.click` مع `elementFromPoint` قبل النقر؛ `evaluate().click()` ليس إثبات تفاعل.
7. الصفحات تختبر باستخدام `Accept: text/html` وbody/headers؛ HTTP200 وحده ليس نجاحًا.
8. لا width:100% عام على buttons؛ CSS scoped و`min-width:0` عند الحاجة.
9. لا automatic retries لطلبات تغير بيانات أو ترسل رسائل. network timeout بعد mutation يعني نتيجة غير مؤكدة، وليس دليلًا على عدم تنفيذها.
10. لا secrets في brief أو تقارير أو git أو console. اختبارات UI تستخدم بيانات مصطنعة ولا خدمات إرسال حقيقية.
11. لا تشغيل production startup لأجل الاختبارات؛ `startServer()` له آثار WhatsApp/jobs. استخدم exported app وfixtures أو staging معزول.
12. لا broad formatting أو تغيير tests لتقليل coverage أو حذف assertions أو إضافة skips كي تمر.
13. لا إضافة dependencies إلا في التاسك المالكة لها، مع lockfile ومبرر. لا nesting مفتوح للوكلاء.

## 4. هيكل الفريق والملكية

| القائد الداخلي | نطاقه | أهم التسليمات | منفذوه |
|---|---|---|---|
| **A — QA & Integration** | baseline، harness، contracts، دمج، أدلة وتقارير | اختبارات المتصفح وrunbook وgate النهائي | داخلي + agy لتاسكات harness محدودة |
| **B — Mobile & Visual Shell** | responsive، drawer layout، RTL CSS، contrast | shell CSS وتجربة الموبايل | agy لتغييرات CSS؛ داخلي للقياس والقبول |
| **C — i18n & Locale** | dictionaries، persistence، rerenders، audit النصوص | ترجمة كاملة للنطاق وحفظ لغة آمن | داخلي للسلوك؛ agy لترجمة slices |
| **D — Async UX & API Contracts** | request core، resource states، locks، عقود backend | لا empty مضلل ولا إرسال مكرر | داخلي للعقود؛ agy لترحيل flows |
| **E — Accessibility & Shared UI** | dialogs، keyboard، labels، forms، announcements | primitives وإتاحة التفاعل | داخلي للـprimitives؛ agy للترحيل |
| **F — Architecture & Performance** | cache/SW، extraction، lazy assets، build | تحميل مؤجل قابل للقياس | داخلي lifecycle/cache؛ agy نقل أجزاء صغيرة |

### دور سمسم — المنسق العام

- إطلاق ستة قادة من نوع `general` عند تنفيذ الخطة؛ سياق كل قائد: هذه الوثيقة + AGENTS + مهماته + حالة التبعيات + الملفات المسموحة.
- حفظ IDs الحقيقية في سجل التنفيذ وقت الإطلاق، لا وضع IDs افتراضية في الذاكرة الدائمة.
- إدارة locks، مراجعة تقارير القادة، دمج التغييرات، تشغيل gates، ورفع القرارات لحسن.
- لا يكون القائد reviewer الوحيد لشغله. review مستقل من قائد آخر أو وكيل داخلي مخصص، والمنسق يعيد gates بعد الدمج.
- كل قائد يمكنه عاملين فرعيين بحد أقصى في اللحظة نفسها؛ أقصى عمق تفويض: قائد → منفذ. المنفذ لا يفوض بدوره.
- البداية ستة قادة نشطين منطقيًا؛ العمل الفعلي المتوازي محدود باستقلال الملفات والموارد. انتظار lock ليس مبررًا لعمل غير مخطط.

## 5. منع التصادم والعزل

### سجل الملكية المركزي

ينشئ A02: `docs/qa/frontend-execution-state.md`. المنسق وحده يكتب السجل المركزي؛ القادة يرجعون نتائجهم أو يكتبون ملفات تقارير مستقلة باسم التاسك.

| المورد | الملكية/طريقة الوصول |
|---|---|
| `public/js/dashboard_new.js` | lock كامل للملف؛ كاتب واحد فقط، حتى إن كانت الدوال مختلفة |
| `public/dashboard.html` | lock كامل للملف؛ لا تعديل markup/CSS/script versions بالتوازي |
| `package.json` + `package-lock.json` | lock كوحدة واحدة؛ A03 ثم F07 |
| `server/server.js` | F02؛ A يكتب tests دون تعديل السيرفر؛ أي تعديل D يحتاج دورًا منفصلًا |
| `public/service-worker.js` | F03/F08؛ غيرهما يطلب bump من المالك |
| auth HTML و`public/js/auth.js` | C02/C07 ثم E07، أو reverse حسب readiness؛ لا تداخل |
| `tests/dashboardTranslations.test.js` | C01 فقط؛ A يراجع ويستخدم الاختبار |
| primitives الجديدة | D يملك request/feedback، E يملك focus، F يملك lazy loader |
| ملفات tests/browser | A مالك harness والfixtures؛ بقية القادة يقدمون scenarios له |
| `AGENTS.md` و`.github/` | عمل سابق؛ محمي من كل القادة |

### طريقة العزل والدمج

- A02 يجهز workspace معزول لكل قائد من baseline متفق عليه؛ استخدام git worktrees عند توافرها، أو نسخة عمل معزولة تحافظ على `.git` المرجعي/patch provenance دون نسخ secrets أو node_modules بلا حاجة.
- لا commits تلقائية لتمكين النقل. ينقل المنسق patches/untracked files الخاصة بالتاسك فقط، ويراجعها ثم يطبقها.
- isolation لا يبيح تغييرات متعارضة في نفس الملف. تحرير نسخة قديمة من ملف مشترك يولد patch stale؛ على صاحبه تحديث baseline وإعادة gate قبل الدمج.
- task يحصل على lock قبل بدء كتابة shared file، ويسلمه بعد دمج وتحقق، لا بمجرد خروج العامل.
- رفض أي touched file خارج allowlist حتى يفسر ويعتمد التغيير. لا force overwrite لحل conflicts.

## 6. Anti-Gravity: بروتوكول التاسكات الصغيرة والتوازي

### مشكلة العزل الحالية

`/root/.config/opencode/skills/agy-delegate/scripts/dispatch.sh` ينسخ token الحساب إلى ملف login مشترك ثم ينسخه للخلف. تشغيل نسختين بالتوازي بدون عزل قد يجعل كل جلسة تستخدم/تحفظ حساب الأخرى. تعدد worktrees وحده لا يعالج ده.

- الوضع الافتراضي: جلسة agy واحدة عبر wrapper الحالي، بالتوازي مع الوكلاء الداخليين.
- A02 يتحقق read-only من دعم CLI/relay لـHOME أو config directory مستقل، ومن `--out-dir` أو آلية output منفصلة؛ لا يخترع flags غير موجودة.
- تفعيل agy parallel مشروط بمسارات login/output/working directory منفصلة، وتجربة جلسَتين read-only بلا تبادل حالة، وتوثيق الأمر المدعوم.
- إذا كان العزل يتطلب تعديل إعدادات/skill خارج المشروع، يُرفع القرار لحسن كتاسك infra مستقلة؛ لا يغيره قائد frontend تلقائيًا.
- بعد الإثبات: أقصى جلستين agy في الوقت نفسه، لكل واحدة مهمة مستقلة وحساب/حالة معزولة. يزيد الحد فقط بطلب منفصل ودليل سلامة.

### قالب كل brief

```xml
<task>
Task ID: B03
Workspace: ABSOLUTE_ISOLATED_WORKSPACE
هدف واحد محدد؛ السلوك الحالي؛ السلوك المطلوب؛ خطوات إعادة المشكلة.
Read: docs/internal/FRONTEND_EXECUTION_PLAN.md, AGENTS.md
Allowed files: قائمة ملفات هذه القطعة فقط
Dependencies: عقود وتاسكات منتهية مع مواقعها
لا تغير API أو dictionary architecture أو ملفات خارج القائمة.
</task>
<verification_loop>
أوامر node الفعلية لاختبار القطعة + dashboardTranslations + syntax إن تغيّر JS.
فحص git diff/status ثم التقرير. browser gate يذكر المنفذ الذي سيشغله إن لم يتوفر للعامل.
</verification_loop>
<action_safety>
No git add/commit/push. No production calls. No secrets or unrelated refactors.
Do not delegate. Return work uncommitted.
</action_safety>
<structured_output_contract>
1 changed behavior; 2 touchedFiles; 3 commands and exit/results;
4 remaining gates; 5 deviations/blockers. Do not call skipped gates PASS.
</structured_output_contract>
```

الأمر الحالي المدعوم، بعد تجهيز brief بملف وعدم تضمين أسرار:

```bash
/root/.config/opencode/skills/agy-delegate/scripts/dispatch.sh \
  --brief /tmp/opencode/B03-brief.txt \
  --cd ABSOLUTE_ISOLATED_WORKSPACE \
  --model gemini-3.8-flash-high \
  --timeout 6m
```

- call timeout أكبر من 6m بسماح تنظيف، مثل 480000ms. لا استدعاء agy دون مهلة صريحة.
- القطعة لا تتجاوز هدفًا واحدًا، عادة دالة واحدة/renderer واحد/مجموعة CSS محددة. التاسك الكبيرة أدناه مقسمة لقطع عند التفويض، ولا تُرسل بعنوان «صلح الموبايل كله».
- اقرأ `result.json`: status وfinalMessage وtouchedFiles؛ راجع الاختبارات المعدلة أولًا ثم diff وأعد الأوامر بنفسك.
- timeout/failure بلا quota: يعود التنفيذ الداخلي لنفس القطعة، لا حلقة retries غير محدودة.
- 429/quota/auth blocking: تتقدم قاعدة AGENTS على fallback في skill؛ إخطار حسن على Telegram بالموديل والعائق، حفظ checkpoint تحت `/workspace` بلا secrets، ثم انتظار تبديل الموديل/«كمل». لا طباعة محتويات التوكنات ولا تجاوز وقف مطلوب.

## 7. العقود المشتركة — تثبت قبل ترحيل المستهلكين

### 7.1 Request core — مالك D02

ملف `public/js/dashboard-request.js` يعلن `window.ZainBotRequest`، ويتيح export لاختبارات Node دون تحميل DOM.

```text
requestJson(url: string, options: RequestInit = {}, policy = {}) -> Promise<any|null>
policy: { operation: 'read'|'mutation', timeoutMs?: number,
          onUnauthorized?: () => void }
read timeout default = 15000ms; mutation timeout explicit or absent.
204/empty body -> null.
throws RequestError: { kind: 'http'|'network'|'timeout'|'parse',
  status: number|null, code: string|null, traceId: string|null,
  retryAfterSeconds: number|null, outcomeUnknown: boolean }
runExclusive(key: string, operation: () => Promise<T>) -> Promise<T>
```

`runExclusive` يرجع نفس Promise لمن يستدعي نفس key أثناء العملية؛ لا يعيد operation. رفض العملية ينظف القفل في `finally`. `401` فقط ينادي callback session؛ `403` ليس logout. لا retry تلقائي. response HTTP200 مع `success:false` يفحصه caller وفق عقد endpoint، لا قاعدة عامة على كل JSON.

### 7.2 Feedback/resource states — مالك D03

ملف `public/js/dashboard-feedback.js`، ولا يُنشأ `ui-feedback.js` بديل.

```text
ResourceState = { phase: 'loading'|'ready'|'empty'|'filtered-empty'|'error'|'stale'|'no-bot',
  key?: string, params?: Record<string,string|number> }
renderState(container, state, { t, onRetry?, colSpan? }) -> void
notify({ level: 'success'|'info'|'error', key, params? }, t) -> void
withPending(key: string, controls: HTMLElement[], operation: () => Promise<T>) -> Promise<T>
refreshLanguage(t) -> void
```

`t(key, params?)` يحصل من C03؛ helper لا يملك قاموسًا ولا يقرأ رسائل upstream. التحميل/النجاح polite؛ الخطأ persistent ومعلن حسب السياق، ولا يسرق focus. preserves original disabled states. لا يستخدم `innerHTML` لرسائل البيانات الخارجية.

### 7.3 Focus primitive — مالك E01

`public/js/ui-accessibility.js` يعلن `window.ZainBotA11y`:

```text
openDialog(element: HTMLElement, options: { initialFocus?: HTMLElement,
  opener?: HTMLElement, background?: HTMLElement[], onClose?: () => void }) -> void
closeDialog(element: HTMLElement) -> void
```

helper مسؤول عن التركيز/stack/inert، وليس API أو polling أو إزالة بيانات forms. يحدد integration handler تنظيف timers وإزالة `.active`. أعلى dialog فقط يتعامل مع Escape/Tab؛ لا يفك عزل الخلفية حتى إغلاق آخر dialog.

### 7.4 Language adapter — مالك C03

يبقى قاموسا الترجمة داخل dashboard IIFE. يمرر المستهلكون dependency:

```text
t(key: string, params?: Record<string,string|number>) -> string
getLanguage() -> 'ar'|'en'
registerLanguageRenderer(id: string, render: () => void) -> () => void
```

renderer يتسجل مرة، يستدعى عند تبديل اللغة دون refetch، ويرجع unregister. يتاح عبر `window.ZainBotDashboardI18n` للـhelpers الخارجية دون كشف mutable dictionaries. unknown key في development يظهر واضحًا ويسجل failure في الاختبار؛ production يستخدم fallback الإنجليزية إن كانت معرفة ثم key، لا invent copy.

### 7.5 Feature loader — مالك F05

```text
window.ZainBotDashboardAssets.loadFeature(id: 'ideaCouncil'|'settingsSummary') -> Promise<any>
```

خريطة same-origin ثابتة؛ dedupe requests، ولا تحميل من URL يقدمه المستخدم. failed Promise تُزال للسماح بمحاولة يدوية. loading/error يستخدم D03. الـSW لا ينزل chunk قبل طلب تبويبها.

## 8. طريقة قراءة بطاقة كل تاسك

- **المنفذ**: من يكتب المنتج/الاختبار، لا صاحب المجال فقط. «agy» تعني brief صغير ثم review داخلي من القائد.
- **الملفات**: allowlist؛ الملف الجديد يصرح به صراحة. إضافة ملف خارجها تعود للمنسق قبل الكتابة.
- **يعتمد على**: لا يبدأ implementation قبل الدمج الناجح للتبعيات. يسمح قراءة وتجهيز خطة assertions فقط.
- **خطوات**: reproduce/assert behavior → تغيير محدود → focused verification → independent review → merge gate.
- **القبول**: الدليل المطلوب لإغلاق التاسك. browser checks تؤدى عبر harness A03/A04؛ إذا غير جاهز يبقى التاسك `awaiting-verification`.
- تغييرات منخفضة الأثر والقابلة للعكس لا تستدعي tests شكلية جديدة. تكتب regression tests عند خطر سلوكي فعلي، لا اختبارات تكرر تفاصيل implementation.

## 9. مسار A — الاختبارات والتنسيق والدمج

### A01 — البيئة والـbaseline [داخلي، قائد A]
**الملفات:** قراءة `package.json`, `package-lock.json`, `scripts/run-tests.js`, `Dockerfile`؛ إنشاء `docs/qa/dashboard-baseline.md`. **يعتمد:** لا شيء.
- [ ] سجل git branch/status والملفات السابقة دون تغييرها.
- [ ] تحقق من binary Node المشار إليه، واستعمل PATH مضبوطًا لكل أمر إن وجد؛ سجل actual Node/npm، وشروط Node>=22.
- [ ] تحقق من parent directories قبل إنشاء workspaces/artifacts. جهز install في بيئة معزولة؛ `PUPPETEER_SKIP_DOWNLOAD=true npm ci` عند وجود Chrome مستقل.
- [ ] شغل `npm test` وfocused gates المذكورة في §16؛ سجل commands/exit والفشل السابق، ولا تصلح خارج نطاقه.
- [ ] سجل baseline الاختبارات وأسماء blockers البيئية منفصلة. قياسات الأصول تصل من F01 لاحقًا وتلحق بالتقرير؛ لا تنتظرها لإطلاق F01 حتى لا تتكون تبعية دائرية.
**القبول:** تقرير قابل لإعادة التشغيل، ولا يوجد PASS بدون output. إذا تعذر runtime تبقى التنفيذات المعتمدة عليه blocked.

### A02 — workspaces وlocks وعزل agy [داخلي، قائد A + المنسق]
**الملفات الجديدة:** `docs/qa/frontend-execution-state.md`, `docs/qa/agy-session-isolation.md`؛ workspaces خارج المنتج. **يعتمد:** A01.
- [ ] أنشئ جدول task/status/owner/dependencies/lock/base revision/report path وفق §5.
- [ ] جهز ست مساحات منفصلة ووضح كيفية نقل patch دون commits ودون ضياع user changes.
- [ ] راجع CLI/relay read-only وأثبت إمكان login/output isolation أو وثق أن parallel agy blocked.
- [ ] عند توافر isolation مدعوم: اختبر جلستين read-only بمهمتين مختلفتين، وافحص عدم تبادل الحسابات والمخرجات؛ لا تعرض credentials في الإثبات.
- [ ] أرسل brief افتتاحي لكل قائد يذكر allowlist وحد التفويض والانتظار عند التبعيات.
**القبول:** لا كاتبين للملفات المشتركة؛ parallel agy إما مثبت أو معطل بوضوح، والوكلاء الداخليين مستقلون.

### A03 — browser harness معزول [داخلي للعقد؛ agy للقطع A03a/b/c]
**الملفات:** تعديل `package.json`, `package-lock.json`؛ إنشاء `scripts/run-dashboard-browser-tests.js`, `tests/browser/dashboardSmoke.browser.js`, `tests/browser/fixtures/dashboardApi.js`. **يعتمد:** A01/A02.
- [ ] A03a، داخلي: ثبت fixtures users ordinary/superadmin + botين + errors/latency. API غير معروف يفشل الاختبار ولا يرجع mock success.
- [ ] A03b، agy: أضف Puppeteer direct devDependency `24.36.1` وscript `test:browser:dashboard` فقط؛ لا تعتمد على package WhatsApp transitively.
- [ ] A03c، agy: harness عبر test exported app أو static shell + intercepted APIs، دون `startServer()`؛ cleanup browser/server في `finally`.
- [ ] داخلي: assert no token→login وprofile401→remove token/login وprofile500→recoverable state بعد D04.
- [ ] استخدم `PUPPETEER_EXECUTABLE_PATH`؛ إذا لم يوجد Chrome سجل blocker، لا تنزيل أو تعديل infrastructure بلا حاجة متفق عليها.
**القبول:** `npm run test:browser:dashboard` قابل للتكرار بدون DB/providers؛ ملفات browser لا تنتهي `.test.js` حتى لا تدخل npm test تلقائيًا.

### A04 — matrix السلوك والـhit testing [داخلي assertions؛ agy قطعة scenario واحدة]
**الملفات:** `tests/browser/dashboardSmoke.browser.js`, `tests/browser/fixtures/dashboardApi.js`؛ إنشاء `docs/qa/dashboard-browser-matrix.md`. **يعتمد:** A03؛ scenarios الإضافية بعد مهمتها.
- [ ] غطِّ `ar/en × 360×800 / 390×844 / 768×1024 / 1440×900` وحواف991/992.
- [ ] قبل click: احسب المركز، `elementFromPoint` يجب أن يكون target أو descendant، ثم `mouse.click`.
- [ ] غطِّ drawer/scrim/Escape/resize، language switching، forms، tabs، admin visibility، dialogs keyboard.
- [ ] غطِّ slow A→fast B، offline، 403/429/500، double submit، حفظ ناجح ثم refresh فاشل.
- [ ] افشل مع uncaught page errors، local asset404، API غير fixture؛ screenshots evidence مساعدة.
**القبول:** scenarios مرتبطة بتاسكات مالكة واضحة؛ لا مناداة fake click ولا تسميات PASS لمتصفحات لم تُجرَّب.

### A05 — HTTP وAPI boundary contracts [داخلي؛ agy test endpoint واحد]
**الملفات الجديدة:** `tests/dashboardHttpContract.test.js`, `tests/dashboardApiContract.test.js`؛ قراءة `tests/phase0Baseline.test.js` ومسارات users/bots/rules/messages/chat-page/catalog. **يعتمد:** A01؛ backend fixes عند ضم assertions الجديدة.
- [ ] assert HTML identity/MIME لـ`/dashboard` وredirect aliases301 و404، باستخدام Accept text/html.
- [ ] assert health/readiness connected/disconnected بstubs حتمية مع restore، لا قبول 200أو503 عشوائيًا كإثبات جاهزية.
- [ ] reuse auth/ownership existing tests؛ أضف نقصًا حقيقيًا فقط في profile/bots/chat-link/catalog.
- [ ] owner/other user/impersonation malformed IDs لا تسرب بيانات أو credentials؛ قراءات لا ترسل providers.
**القبول:** focused tests و`npm test`؛ لا تعديل cache production behavior من هذه التاسك، فهي ملك F02.

### A06 — مراجعة كل دفعة والوثائق [داخلي؛ review مستقل]
**الملفات الجديدة:** `docs/qa/dashboard-release-gates.md`, `docs/qa/page-inventory.md`, `docs/FRONTEND_GUIDE.md`, `docs/COMPONENT_LIBRARY.md`؛ تعديل `README.md`, `README.ar.md`, `CONTRIBUTING.md` عند الحاجة لأوامر جديدة فقط. **يعتمد:** دمج التاسكات الأساسية في B–F، وليس E08/F09 أو قرارات التوسع المشروطة؛ إن فُعّلت إضافات لاحقًا يصدر ملحق قبول جديد.
- [ ] وثق primitives وأسمائها/مسؤولياتها، initialization order، ترجمة ودورة cleanup لكل feature.
- [ ] سجل public pages/routes وحالتها: tested/finding/deferred؛ لا تمنح completion percentage بلا معيار.
- [ ] راجع whole diff واختبارات المعدلة وعدم hardcoded success وعدم dead globals أو leaks.
- [ ] شغل gates §16؛ warm-cache/SW-controlled/release-upgrade؛ اختبر Firefox/Safari إن توفروا، وإلا سجل not-run بدون claim cross-browser.
- [ ] سلم تقرير الإنجاز والفجوات والتغييرات المشروطة التي لم تفعل، دون commit/deploy.
**القبول:** لا task مكتملة ولها gate غير منفذ؛ known baseline failures مصنفة بأدلة وتأثير واضح، وأي blocking regression تمنع إعلان اكتمال الخطة.

## 10. مسار B — الموبايل والشكل

### B01 — reproducible responsive audit [داخلي]
**الملفات الجديدة:** `docs/qa/dashboard-responsive-findings.md`. **يعتمد:** A03؛ قراءة الكود ممكن قبلها.
- [ ] افحص كل tab وmodal عند المقاسات A04 باللغتين، ordinary/superadmin.
- [ ] قس overflow/clipping داخل الحاويات، لا body scrollbar فقط لأن overflow-x قد يخفي العيب.
- [ ] سجل selector/repro/screenshot/expected لكل مشكلة؛ صنف موجود/غير مثبت، وحدد CSS patch مستقل.
**القبول:** backlog bounded مرتبط بـB03/B04/B05 أو بند معلل غير متأثر؛ لا «fix responsive» عامة.

### B02 — استخراج shell CSS دون تغيير المظهر [agy، قطعتان متتابعتان]
**الملفات:** `public/dashboard.html`؛ إنشاء `public/css/dashboard.css`؛ تحديث `tests/dashboardMobileSidebar.test.js` لقراءة الـCSS المنقول. **يعتمد:** B01/A04 baseline.
- [ ] B02a: انقل فقط قواعد shell/sidebar/header والـresponsive المرتبط، مع حفظ ordering/specificity.
- [ ] B02b: انقل shared dashboard forms/modal styling المحدد، لا inline styles كاملة ولا `style.css` العامة.
- [ ] أضف stylesheet reference versioned، وأعد static tests دون تقليل assertions.
- [ ] قارن screenshots/DOM geometry قبل وبعد في desktop/mobile وdialogs.
**القبول:** لا visual regression، globals/layout نفسهما؛ صفحات landing/login لم تتغير. CSS خارج النطاق يبقى كما هو.

### B03 — customizer tablet sizing [agy، patch CSS واحد]
**الملفات:** `public/css/dashboard.css` وmarkup customizer في `public/dashboard.html` إن لزم. **يعتمد:** B02/E03 حسب locks.
- [ ] reproduce `.chat-customizer-grid` عند600/601/768/820/991/1024؛ يحدد collapse حسب available width لا breakpoint تخميني.
- [ ] صحح min-width/grid constraints بحيث preview والcontrols والحفظ لا يختفوا؛ احتفظ بعمودين حين يكفي العرض.
- [ ] أعد اختبار AR/EN والـfocus بعد E03.
**القبول:** لا clipping؛ usable color controls/save؛ focused gate `node tests/chatPageCustomizer.test.js` + browser scenario.

### B04 — drawer قصير الشاشة وreduced motion [agy، patch scoped]
**الملفات:** `public/css/dashboard.css`. **يعتمد:** B02/E04.
- [ ] استخدم dynamic viewport height مع fallback، وscroll region min-height0 عند الحاجة.
- [ ] أضف reduced-motion override خاص بالdashboard، لا تعطيل حركة الموقع كله.
- [ ] تحقق portrait/landscape844×390 وأن logout وآخر menu item قابلان للوصول.
**القبول:** drawer لا يقطع controls ولا يترك scroll lock؛ reduced-motion سليم؛ اختبارsidebar وbrowser.

### B05 — responsive صفحات العمل وRTL geometry [agy، renderer/layout واحد لكل brief]
**الملفات:** `public/css/dashboard.css`, `public/dashboard.html` عند ضرورة markup؛ **يعتمد:** B01/B02/C03.
- [ ] B05a: inbox header/list/composer، عدم خروج textarea/send button من العرض.
- [ ] B05b: orders/bookings tables؛ horizontal scroll داخل container، لا الصفحة؛ actions قابلة للنقر.
- [ ] B05c: settings/subscription forms/admin filter rows حسب findings فقط.
- [ ] راجع touch-targets للcontrols المعدلة وmixed AR/EN الطويل، استخدم logical properties حيث يلزم.
**القبول:** browser قياسات ونقر حقيقي؛ لا width عام على buttons، no loss of desktop layout.

### B06 — contrast/focus consistency [داخلي قياس؛ agy tokens patch]
**الملفات:** `public/css/dashboard.css` فقط، إضافة classes في HTML عند الضرورة. **يعتمد:** B02/E04/E05.
- [ ] سجل foreground/background للنصوص والأزرار والdisabled/status داخل نطاق dashboard.
- [ ] حسّن الأزواج المخالفة: normal text>=4.5:1، large text>=3:1، حدود controls/focus>=3:1 عند انطباق معيار WCAG.
- [ ] لا تغير المعنى باللون وحده؛ icons/text للerror/success؛ keyboard focus-visible لا يغطي المحتوى.
**القبول:** evidence قيم وأمثلة، لا ادعاء WCAG compliance شامل من audit جزئي.

### B07 — theme decision [داخلي؛ مشروطة]
**الملفات قبل القرار:** findings فقط. **يعتمد:** B06.
- [ ] اعرض لحسن حقيقة أن chat presets ليست dashboard theme؛ احسم dark-only أو Light/Dark/System.
- [ ] default dark-only في هذه الخطة: لا تضف toggle ولا تضع task كاملة كأنها shipped.
- [ ] إن اختار feature جديدة: تصميم منفصل يعين storage key وbootstrap قبل paint وpalettes/contrast ومفاتيحAR/EN، ثم subplan قبل التنفيذ.
**القبول:** decision recorded؛ لا JS polling لمنع ومضة theme.

## 11. مسار C — اللغة والترجمة

### C01 — تقوية translation contract [داخلي]
**الملفات:** `tests/dashboardTranslations.test.js`؛ إنشاء `docs/qa/dashboard-i18n-findings.md`. **يعتمد:** A01.
- [ ] راجع extractor الحالي؛ اختبر parity وduplicates وempty values مع fixtures صغيرة تكشف failures بوضوح.
- [ ] احصر dynamic literals حسب renderer، بما فيها impersonation/subscriptions/training/admin؛ لا تصنف customer data كنص واجهة.
- [ ] لا add known-red gate بلا إصلاح في نفس دفعة الدمج؛ findings السابقة لها task محددة أدناه.
**القبول:** الاختبار لا يمر على key مفقود في إحدى اللغتين ولا يفقد assertions السابقة.

### C02 — language persistence hardening [داخلي؛ auth/home قطع مستقلة]
**الملفات:** `public/js/dashboard_new.js`, `public/js/script.js`, `public/login.html`, `public/register.html`, `public/js/auth.js`؛ test جديد `tests/languagePersistence.test.js`. **يعتمد:** C01.
- [ ] لكل entry point: normalize ar/en، guard storage read/write، preserve current defaults، in-memory fallback.
- [ ] storage event من tab أخرى يحدث اللغة دون write-loop؛ لا حاجة refetch.
- [ ] test absent/invalid/blocked storage وreload/navigation؛ assert auth لا يعمل crash بسبب language storage.
- [ ] bump كل JS URL مستهلك لتلك التعديلات في نفس الدفعة.
**القبول:** الاختيار محفوظ إن التخزين متاح، وتعمل الصفحة إن منع؛ توحيد default ليس ضمن المهمة.

### C03 — adapter وإعادة الرسم دون فقد حالة [داخلي]
**الملفات:** `public/js/dashboard_new.js`, `public/js/settings-summary.js`؛ test جديد `tests/dashboardLanguageSwitch.test.js`. **يعتمد:** C02.
- [ ] ثبت interface §7.4 واختباره؛ dictionaries تبقى في الملف الحالي.
- [ ] اعمل render registry، واربط agents/recipients/admin/inbox labels المنسية؛ لا call selectChat لجلب التاريخ عند تغيير لغة.
- [ ] احتفظ filters/pagination/selected chat ودraft؛ لا إضافات listeners في كل language switch.
- [ ] راجع التعريفات المتكررة `renderAdminUsers/loadAdminUsers` لمعرفة الفعالة؛ لا cleanup واسع ضمن المهمة.
**القبول:** switchAR→EN→AR يحدث UI دون requests جديدة أو فقد state؛ helper consumers يحصلون على نفس العقد.

### C04 — labels وcopy التشغيلية [agy، ست قطع]
**الملفات:** `public/dashboard.html`, `public/js/dashboard_new.js`, `public/js/settings-summary.js`. **يعتمد:** C01/C03؛ ينسق مع E04/E05/D flows.
- [ ] C04a: navigation/toggle/search/scrim aria عبر attributes المطلوبة؛ المالك E يحدد semantics.
- [ ] C04b: orders/bookings tooltips/status/Created/fallback labels، لا «Ship/Delivered» ثابتة.
- [ ] C04c: inbox Customer/Web Chat وsystem labels دون ترجمة customer content.
- [ ] C04d: training/instructions/FAQ/agents modal titles وvalidation/confirm local copy.
- [ ] C04e: admin/impersonation/subscription dynamic actions/errors.
- [ ] C04f: settings summary/API keys/webhook/notification textual fallbacks.
**القبول لكل قطعة:** ترجمة dictionaryAR/EN، translation test، regression خاص بالfeature، UI قبل/بعد switch. لا brief يشمل الست معًا.

### C05 — Idea Council والقنوات والنصوص المتبقية [agy، feature واحدة لكل brief]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html` عند markup. **يعتمد:** C03. قطعة المجلس تنفذ قبل F04، الذي ينقلها إلى `public/js/dashboard-idea-council.js` مع الحفاظ على نفس العقود؛ لا انتظار متبادل بين C05 وF04.
- [ ] حصر council output labels/polling/errors/export titles والقنوات/QR/relink ورسائل bootstrap/local validation المتبقية.
- [ ] نقل UI copy إلى dictionaries الرئيسيين، والchunk يستهلك t/getLanguage؛ prompts/results التي يكتبها العميل تبقى محتوى.
- [ ] ربط renderer language hook، وعدم كسر WhatsApp polling/relink.
**القبول:** all audit findings في النطاق لها key أو سبب تصنيف customer/external content؛ tests WhatsApp/council + translations.

### C06 — locale formatting [داخلي contract؛ agy renderer واحد]
**الملفات:** `public/js/dashboard_new.js` والfeature module عند الحاجة؛ test `tests/dashboardLocale.test.js`. **يعتمد:** C03/C04.
- [ ] helper `formatDate(value, options?)` و`formatNumber(value, options?)` يختاران `ar-EG/en-US`، invalid date تعرض translated unavailable لا exception.
- [ ] dates/numbers في orders/bookings/API keys/webhook/admin/catalog تستخدم explicit locale.
- [ ] IDs/phone/email تبقى strings ودون تغيير؛ استخدم bdi/dir المناسب للmixed content.
**القبول:** browser locale مختلف لا يغير لغة العرض المختارة؛ لا تحويل IDs لأرقام أو إعادة تنسيق بيانات نقلAPI.

### C07 — auth messages live switching [داخلي؛ قطعة مستقلة عن dashboard]
**الملفات:** `public/js/auth.js`, `public/login.html`, `public/register.html`؛ `tests/loginTranslations.test.js`؛ test جديد `tests/authLanguageSwitch.test.js`. **يعتمد:** C02؛ قبل E07 على نفس الملفات.
- [ ] الاحتفاظ بالرسالة كkey/params للرسائل المحلية، واستهلاك languagechange لإعادة عرضها.
- [ ] error codes المعروفة فقط mapping؛ server free-text ليست تلقائيًا bilingual.
- [ ] Google button locale update بلا duplicate initialize؛ لا secrets ولا live login خارجي للاختبار.
**القبول:** error/recovery message visible تترجم مع الفورم دون reset أو request جديد؛ القائمة الحالية للقواميس المحلية محفوظة ولا migration شامل.

### C08 — final bilingual audit [داخلي، reviewer غير implementer]
**الملفات:** `docs/qa/dashboard-i18n-findings.md` فقط للنتيجة. **يعتمد:** C04–C07 وD/E/F integrations.
- [ ] افحص كل tab/modal/status باللغتين، dynamic renderers وaccessible names.
- [ ] صنف كل finding resolved/deferred with reason، وما خارجdashboard scope في page inventory.
- [ ] أعد dashboard/landing/login translations tests وA04 language scenarios.
**القبول:** لا unresolved hardcoded UI داخل النطاق المنفذ؛ لا ادعاء ترجمة كامل الموقع من نجاح dashboard فقط.

## 12. مسار D — حالات العمليات وعقود البيانات

### D01 — orders/bookings route contracts [داخلي]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`, `server/controllers/bookingsController.js`؛ test جديد `tests/dashboardOrderRouteContracts.test.js`؛ قراءة routes/controllers chat-orders/bookings. **يعتمد:** A01.
- [ ] regression tests تثبت quick actions PATCH mismatch؛ استخدم PUT route الموجودة.
- [ ] تعامل مع document response للتعديل وmessage response للحذف محليًا دون كسر response contract لبقية clients.
- [ ] store order rows لا تستدعي ChatOrder mutations؛ اختبر النوع والملكية.
- [ ] bookings list يطبق selected botId بعد ownership؛ bot غير مملوك لا يتحول إلى كل بوتات المستخدم.
- [ ] إنشاء chat order يدويًا route غير موجودة: لا invent POST. اعرض unsupported action مترجمًا وتعطل المسار حاليًا؛ إذا طلب حسن دعمه، subplan API منفصل. نفس المبدأ لحقول العميل غير المدعومة: لا UI تعد بحفظ غير حاصل.
**القبول:** test route/status/shape + bot isolation + UI integration؛ لا تراجع في booking create الموجود.

### D02 — request core [داخلي]
**الملفات الجديدة:** `public/js/dashboard-request.js`, `tests/dashboardRequest.test.js`؛ integration script reference في `public/dashboard.html`. **يعتمد:** A01.
- [ ] tests لعقد §7.1:401/403/429/HTML500/invalidJSON/204/network/timeout/headers.
- [ ] implement opt-in helper، FormData بلا إجبار content-type، trace/code/retry-after extraction.
- [ ] mutation failures outcomeUnknown صحيحة ولا replay؛ runExclusive مرتان تنتجان operation واحدة وتحرر القفل بعد rejection.
- [ ] لا استبدال apiFetch عالميًا؛ consumers تُنقل في التاسكات التالية.
**القبول:** request tests PASS + syntax + translations حين يضاف markup؛ onUnauthorized ينادى401 فقط.

### D03 — feedback/resources primitive [داخلي؛ review E]
**الملفات الجديدة:** `public/js/dashboard-feedback.js`, `tests/dashboardFeedback.test.js`؛ `public/dashboard.html`, `public/js/dashboard_new.js` لتوصيلkeys/hooks. **يعتمد:** D02/C03.
- [ ] implement §7.2؛ states/aria-busy/retry/read callbacks وpersistent errors.
- [ ] اختبر loading→error→retry→ready، filtered-empty، لغة أثناء loading، text escaping، no focus theft.
- [ ] withPending guards controls ويحفظ disabled states؛ no separate toast framework.
**القبول:** tests وبروتوكول الإعلانات مع E؛ helper يتلقىkeys/t ولا backend raw messages.

### D04 — bootstrap/overview/inbox [داخلي lifecycle؛ agy renderer/loader واحد]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`؛ test جديد `tests/dashboardInboxStates.test.js`. **يعتمد:** D02/D03/C03.
- [ ] D04a: profile500/offline retry لا login redirect؛ absent token/401 فقط auth redirect.
- [ ] D04b: overview errors لا stats zero كاذبة؛ bot generation يمنع stale replies.
- [ ] D04c: inbox failed response لا empty؛ no-bot state يعطل controls وينظف selection.
- [ ] D04d: sendManualReply يثبت bot/chat/text وrunExclusive؛ Enter+click POST واحدة؛ delayed response لا يمسح draft جديدًا أو يضيف bubble لمحادثة أخرى.
**القبول:** slowA/fastB + double submit + delivered:false feedback؛ browser scenarios A04، لا live messages.

### D05 — orders/bookings states & mutation locks [agy، أربع قطع]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`؛ test جديد `tests/dashboardOrdersStates.test.js`. **يعتمد:** D01/D02/D03.
- [ ] D05a: lists مستقلة؛ failure bookings لا يمنع orders؛ retry للمورد الفاشل فقط.
- [ ] D05b: bot generation وstale state لنفس البوت دون حفظ بيانات بوت قديم.
- [ ] D05c: status/delete entity lock مشترك؛ double submit guard وcontrols conflict.
- [ ] D05d: date validation قبل toISOString، retain inputs عند الفشل؛ save success ثم refresh fail نتيجتان منفصلتان.
**القبول:** partial failure/date invalid/entity races/save+refresh failure tests وbrowser؛ لا retry mutation تلقائي.

### D06 — safe errors & notification outcome [داخلي backend]
**الملفات:** `server/middleware/errorHandler.js`, `server/controllers/notificationsController.js`, `server/controllers/integrationsController.js`؛ tests جديدة `tests/errorHandler.test.js`, `tests/notificationRecipientRoutes.test.js`, `tests/webhookRetryRoutes.test.js`. **يعتمد:** A01.
- [ ] error handler يحفظ code/traceId ويخفي unexpected exception strings، test sentinel لا يظهر.
- [ ] لا تغير nonAPI404 behavior؛ operational validation/CastError لها codes ثابتة.
- [ ] testRecipient يميز outcome `delivered` و`configured`؛ WhatsApp بلا bot ليس إرسالًا ناجحًا.
- [ ] webhook retry HTTP200 success:false له code ثابت؛ لا تسريب provider raw error.
**القبول:** API tests mocked فقط؛ ownership/limits سليمة، attempts مرة واحدة؛ لا global controllers refactor.

### D07 — recipients/webhook/settings resources [agy، أربع قطع]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`؛ test جديد `tests/dashboardNotificationFlows.test.js`. **يعتمد:** D02/D03/D06.
- [ ] D07a: settings resource reads مستقلة؛ early failure لا يمنع recipients/logs.
- [ ] D07b: recipients loading/error/empty/manual retry وcreate/entity guards.
- [ ] D07c: test/delete lock متعارض؛ outcome configured لا يظهر sent.
- [ ] D07d: webhook redelivery confirmation مترجمة وlog lock؛200 success:false failure؛ timeout لا resend، refresh failure لا يغير نتيجة confirmed send.
**القبول:** free-plan403 لا logout، double test/redelivery send واحدة؛ UI error feedback يستخدم D03 لا alert جديدة.

### D08 — subscription request/review [agy، ثلاثة briefs]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`؛ test جديد `tests/dashboardSubscriptionStates.test.js`. **يعتمد:** D02/D03/C04e.
- [ ] D08a: list errors لا empty/catch صامت؛ own/admin resource states.
- [ ] D08b: submit guard، PENDING_REQUEST_EXISTS reconcileGET، retain payment reference بعد timeout.
- [ ] D08c: approve/reject entity lock واحد؛409 مفهوم وGET reconciliation؛500 لا يسبب إعادة approve آليًا.
**القبول:** mutation واحدة وconflict/refresh states؛ لا تعديل subscription activation atomicity في هذا التغيير.

### D09 — بقية workflows dashboard [داخلي audit؛ agy flow واحد]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`؛ test جديد `tests/dashboardRemainingFlows.test.js`. **يعتمد:** D03/C04/C05/E02/E03. قطعة المجلس تثبت قبل F04؛ F04 ينقلها ويحافظ على اختبارها.
- [ ] training/FAQ/instructions: pending/error/success، retain drafts، no duplicate saves؛ لا مجرد console catch.
- [ ] agents/admin CRUD: read states وrow/entity locks وصلاحيات محفوظة؛ لا إظهار معلومات مستخدم آخر.
- [ ] channel connect/relink: state واضح وتنظيف polling عند الإغلاق وتبديل البوت؛ preserve اختبارات relink.
- [ ] council jobs/autosave: differentiate save/run/poll errors؛ لا restart job عند retry read؛ owner F/E لحياة chunk/modal.
- [ ] catalog الموجود الجيد يبقى regression reference؛ لا rewrite client لمجرد التوحيد.
**القبول:** ledger لكل API workflow: covered/existing-correct/explicit-deferred؛ أي workflow أساسي مؤثر داخل النطاق لا يختفي من التقرير النهائي.

## 13. مسار E — الإتاحة والمكونات المشتركة

### E01 — focus primitive [داخلي]
**الملفات الجديدة:** `public/js/ui-accessibility.js`, `tests/uiAccessibility.test.js`. **يعتمد:** A01؛ browser acceptance بعد A03.
- [ ] implement §7.3؛ tab wrapping/hidden-disabled elements/dynamic content/no focusable fallback.
- [ ] preserve prior inert states؛ opener removed fallback؛ stacked dialogs لا تفك isolation مبكرًا.
- [ ] اختبر behavioral fixture ثم browser activeElement/Tab/ShiftTab/Escape.
**القبول:** helper لا business state؛ اختبارات فعلية لا fake DOM وحده كدليل تركيز.

### E02 — operational dialogs [agy، dialog واحد لكل brief]
**الملفات:** `public/dashboard.html`, `public/js/dashboard_new.js`؛ test جديد `tests/dashboardOperationalDialogs.test.js`. **يعتمد:** E01/C03.
- [ ] instructionModal، faqModal، channelModal، bookingModal، chatOrderModal، recipientModal: role/dialog/aria-modal/title/close label.
- [ ] ترحيل كل open/close/cancel/save success إلى lifecycle واحد؛ close button يغلق dialog صاحبه فقط.
- [ ] channel `.active` وتنظيف QR/polling محفوظان؛ dynamic content لا يحبس focus قديمًا.
**القبول:** لكل modal دورة keyboard واسترجاع opener؛ `dashboardWhatsappRelink.test.js` PASS؛ لا ترحيل ستة dialogs في brief واحد.

### E03 — management/customizer/council dialogs [agy، dialog واحد؛ review داخلي async]
**الملفات:** `public/dashboard.html`, `public/js/dashboard_new.js`؛ test جديد `tests/dashboardManagementDialogs.test.js`. **يعتمد:** E01/E02. تنفذ قبل F04؛ نقل wiring إلى council chunk لاحقًا مسؤولية F04 دون إعادة تنفيذ التاسك.
- [ ] agent/adminUser/impersonation/chatPage/ideaFollowup/ideaRoundsComparison بنفس lifecycle.
- [ ] delayed response أو timer لا يعيد focus إلى dialog مغلق؛ reopen لا يضاعف listeners.
- [ ] impersonation permissions/workflow لا تتغير؛ tab stack الأعلى فقط يغلق.
**القبول:** browser open-close-before-load وcustomizer regression؛ C مسؤول keys؛ E يطلب shared lock.

### E04 — keyboard navigation/drawer/account disclosure [داخلي]
**الملفات:** `public/dashboard.html`, `public/js/dashboard_new.js`, `tests/dashboardMobileSidebar.test.js`؛ test جديد `tests/dashboardKeyboardNavigation.test.js`. **يعتمد:** E01/C03؛ B02 styling ثابت.
- [ ] menu items أزرار native مع `data-target`؛ active `aria-current`؛ admin المخفي خارج tab order.
- [ ] user navigation ينقل focus إلى عنوان الصفحة؛ refresh background لا ينقل focus.
- [ ] drawer closed inert؛ open trap/background isolation؛ scrim/Escape/selection/resize cleanup.
- [ ] account menu disclosure: إزالة menu/menuitem إن لم ينفذ menubar semantics؛ Escape يعيد trigger، outside click يغلق.
**القبول:** AR/EN عند 390px/Desktop و991↔992؛ لا stuck scrim/scroll lock، Enter/Space يعملان.

### E05 — labels/help/input error associations [agy، form واحد لكل brief]
**الملفات:** `public/dashboard.html`, `public/js/dashboard_new.js` عند dynamic fields؛ test جديد `tests/dashboardFormAccessibility.test.js`. **يعتمد:** E02/C04.
- [ ] promptTraining/subscriptionRequest/instruction/faq/recipient ثم booking/order/agents/admin/settings حسب inventory.
- [ ] `for` مطابق للـID، وaria-describedby للـhelp/error؛ أسماء icon-only actions عبر C.
- [ ] invalid field aria-invalid، first client-invalid focus؛ server general error لا ينسب لحقل عشوائي.
- [ ] label click يركز حقلًا؛ hidden inputs ليست شرط اسم مرئي.
**القبول:** form inventory كلها resolved/excluded with reason؛ لا change API/business validation ضمن markup task.

### E06 — announcements & reusable UI acceptance [داخلي، بالتنسيق مع D03]
**الملفات:** `public/js/dashboard-feedback.js`, `public/css/dashboard.css` عند fix؛ tests D03؛ وثيقة component library. **يعتمد:** D03/E02/E03.
- [ ] announce loading/success دون focus theft؛ error داخل active dialog وليس inert background.
- [ ] success بعد close في region مرئي وغير inert؛ messages الطويلة والمتكررة وHTML-like text سليمة.
- [ ] وثق استعمال shared cards/buttons/forms الموجودة؛ لا custom select/toggle بديل للـnative لمجرد polish.
- [ ] screen reader manual pass إن توفر؛ سجل الأدوات/الحالات ولا تسمه شاملًا دون اختبار.
**القبول:** helper واحدة للـfeedback ومفاتيح عربية/إنجليزية؛ no duplicate announcements.

### E07 — auth focus/forms [agy، recovery ثم register/reset]
**الملفات:** `public/js/auth.js`, `public/login.html`, `public/register.html`؛ test جديد `tests/authFormAccessibility.test.js`. **يعتمد:** C07.
- [ ] reveal recovery يركز الحقل؛ hide/reset success لا يترك focus على hidden element.
- [ ] local validation تربط error بالحقول وتزيل invalid عند التصحيح؛ password mismatch/strength مثبتة.
- [ ] حافظ على live regions الحالية وترجمة C؛ لا duplicate announcements أو request إضافي.
**القبول:** keyboard AR/EN وlogin translation test؛ لا redesign auth.

### E08 — widget/chat/store accessibility [داخلي، مشروطة بنطاق الصفحات العامة]
**الملفات عند التفعيل:** `public/widget.js`, `public/chat.html`, `public/js/chat.js`, `public/js/layout1.js`, `public/js/layout2.js`, `public/js/layout3.js`؛ tests مستقلة لكل feature. **يعتمد:** A06 inventory وموافقة توسيع النطاق.
- [ ] widget nonmodal: focus عند الفتح والإغلاق، aria-controls؛ hidden panel خارج tab order؛ لا trap للصفحة المضيفة.
- [ ] cross-origin iframe Escape يحتاج protocol منفصل؛ لا claim support غير مثبت.
- [ ] chat attachment native keyboard/stream announcement، وstore categories Enter/Space بعد reproduce للعيب.
**القبول:** tasks الثلاث مستقلة؛ لا تعديل صفحات عامة خلسة؛ كل UI copy جديد يخضع لعقد AGENTS.

## 14. مسار F — المعمارية والأداء والبناء

### F01 — قياس الأصول والتحميل [داخلي]
**الملفات الجديدة:** `scripts/measure-web-assets.js`, `tests/webAssets.test.js`, `docs/qa/dashboard-performance-baseline.md`. **يعتمد:** A01؛ قياسات الشبكة تنتظر A03.
- [ ] script raw/gzip وasset reference existence؛ لا hardcode حجم التقرير القديم كحقيقة دائمة.
- [ ] cold/warm ordinary/superadmin، خمس عينات بنفس viewport/network/CPU؛ median bytes/requests/boot timing ومقدار SW install منفصلًا.
- [ ] لا طلبات provider ولا credentials؛ لا performance monitoring production دائم في هذه المرحلة.
**القبول:** baseline قابل للإعادة وصفر asset references مفقودة؛ الأهداف تقارن به، دون وعد بتحسن 40–50%.

### F02 — HTTP cache policy [داخلي]
**الملفات:** `server/server.js`؛ إنشاء `server/middleware/webAssetCache.js`, `tests/webAssetCache.test.js`. **يعتمد:** F01/A05.
- [ ] أثبت أن `startsWith('/')` يطابق كل المسارات، واستبدله بتصنيف صريح.
- [ ] HTML/API sensitive no-store؛ unversioned JS/CSS revalidate لا immutable؛ service-worker.js no-cache/revalidate.
- [ ] preserve chat CSP/embedding exceptions؛ query version ليس fingerprint content تلقائيًا.
- [ ] اختبر headers لمسارات root/dashboard/JS/SW/API/chat في production/test مع MIME.
**القبول:** cache tests وHTTP smoke ناجحان؛ لا تعديل لبروكسي Coolify ضمن هذه التاسك.

### F03 — service worker coherent with lazy/privacy [داخلي]
**الملفات:** `public/service-worker.js`؛ test جديد `tests/serviceWorker.test.js`. **يعتمد:** F02.
- [ ] precache للـpublic shell فقط؛ لا dashboard monolith أو صفحات خاصة أو API أو non-GET.
- [ ] احترم no-store، ولا ترجع sensitive response من cache؛ نظف caches ذات prefix خاص بـZainBot فقط.
- [ ] حافظ على سياسة الصور إلا لو ظهر عيب مثبت؛ ارفع cache version.
- [ ] اختبر old→new وinstall failure وoffline public shell واختلاف query versions؛ تثبيت SW لا يطلب chunks المؤجلة.
**القبول:** warm/release upgrade ناجح مع A04، وAPI لا تدخل cache؛ لا إضافة PWA feature جديدة.

### F04 — Idea Council extraction eager أولًا [داخلي عقد؛ agy قطع ميكانيكية]
**الملفات:** `public/js/dashboard_new.js`, `public/dashboard.html`؛ إنشاء `public/js/dashboard-idea-council.js`, `tests/dashboardIdeaCouncil.test.js`. **يعتمد:** C03/D03/E03/D09 الخاص بالمجلس/C05 الخاص بالمجلس؛ يجب اكتمال تعديل هذا الجزء قبل نقله، مع الحصول على shared locks.
**العقد:** `window.ZainBotIdeaCouncil.create({requestJson, getLanguage, t, feedback, a11y})` يرجع `{init, load, dispose, refreshLanguage}`؛ كل dependency إضافية تصرح بها؛ لا mutable global جديد.
- [ ] F04a، داخلي: characterization للاستخدامات الحالية/callbacks/state/timers من council section؛ حدود hooks/subscriptions خارج extraction.
- [ ] F04b، agy: نقل pure render/format helpers فقط؛ تستخدم `t` ولا تنسخ dictionaries.
- [ ] F04c، agy: نقل form/event controllers وفق العقد؛ تحميل eager أولًا، و`init()` idempotent.
- [ ] F04d، agy: نقل polling/report/export lifecycle؛ `dispose()` ينظف timers/listeners وlanguage hooks.
- [ ] داخلي: انقل wiring، ثم احذف النسخ القديمة بعد البحث عن consumers؛ حدّث source-slicing tests دون إسكاتها.
**القبول:** list/draft/save/run/report/export/polling تعمل؛ timers تنظف؛ total gzip بعد eager split لا يزيد أكثر من 5% عن baseline إلا بمبرر معتمد؛ لا lazy loading في نفس patch.

### F05 — lazy Council وsettings summary [داخلي]
**الملفات:** `public/js/dashboard_new.js`, `public/js/dashboard-idea-council.js`, `public/js/settings-summary.js`, `public/dashboard.html`؛ إنشاء `public/js/dashboard-assets.js`, `tests/dashboardLazyAssets.test.js`. **يعتمد:** F03/F04/C03/D03.
- [ ] نفذ §7.5 بخريطة same-origin ثابتة وdedupe؛ failed Promise تزال للسماح بـmanual retry؛ التحميل أول دخول للتبويب فقط.
- [ ] summary تستخدم `init()` صريحًا بدل DOMContentLoaded أو patch لدالة refreshActiveBot المحلية؛ dependencies عبر adapter.
- [ ] تبديل التبويب خلال التحميل لا يسبب stale render/focus؛ تبديل اللغة قبل التحميل لا يستدعي undefined function.
- [ ] أزل eager script tags للمؤجلين، وحدّث versions وSW references.
**القبول:** صفر requests للـchunkين قبل تبويباتهما؛ تكرار النقر ينتج طلبًا واحدًا وlisteners مرة واحدة؛ فشل التحميل له manual retry؛ initial bytes أقل بمقدار chunk ناقص overhead المقاس.

### F06 — extraction ثانية مبنية على قياس [داخلي؛ مشروطة]
**الملفات:** findings/performance report قبل القرار؛ ملفات module تحدد في subplan فقط. **يعتمد:** F05/F01.
- [ ] قارن boot/bytes بعد المرحلة الأولى؛ حدد إن ظل admin/inbox/training هو الحمل المؤثر.
- [ ] لو التحسن كافٍ، لا تقسيم لمجرد حجم الملف؛ سجل سبب إغلاق بند المزيد من extraction.
- [ ] إن احتاج: وثق state/dependencies/public callbacks لميزة واحدة، ثم characterization → eager → lazy؛ لا import graph افتراضي.
**القبول:** قرار مبني على دليل، دون وعد main=100KB أو scope معماري مفتوح.

### F07 — reproducible minification build [داخلي للعقد؛ agy ثلاث قطع]
**الملفات:** `package.json`, `package-lock.json`, `Dockerfile`؛ إنشاء `scripts/build-web.js`, `tests/webBuild.test.js`. **يعتمد:** F05 وإطلاق dependency lock بعد A03.
- [ ] F07a، داخلي: اختر وثبت exact esbuild release بعد compatibility check، وسجل version في lockfile؛ لا floating latest في brief.
- [ ] F07b، agy: transform/minify لملفات JS وCSS منفصلين إلى `build/public/`، بدون bundling/property mangling/public sourcemaps؛ source يبقى مقروءًا. ملف esbuild configuration versioned، لا إعادة اختيار إصدار داخل العامل.
- [ ] F07c، agy: أضف `build:web` وDocker builder copy؛ runtime image بلا build devDependencies؛ لا تعديل pkg executables.
- [ ] داخلي: build مرتان بنتيجة deterministic، local/dynamic references موجودة؛ browser harness يختبر source وbuilt output.
**القبول:** gzip الناتج أقل دون runtime regression؛ budget من قياس F01 ثم قرار موثق إن لم يتحسن. JS syntax وglobals وinline callbacks محفوظة.

### F08 — final assets/CSP/cache release gate [داخلي]
**الملفات:** `tests/webCsp.test.js` جديد؛ تعديل versions في HTML المستهلكة و`public/service-worker.js` حسب ledger. **يعتمد:** F07 ودمج جميع JS tasks.
- [ ] chunks من نفس origin تعمل مع CSP الحالية؛ لا إزالة عامة لـunsafe-inline ضمن الخطة.
- [ ] كل JS تغير له version bump في كل consumer؛ صفر asset404؛ service worker update وwarm reload سليمان.
- [ ] قارن خمس عينات نهائية مع baseline؛ افصل raw/gzip/transfer/timing ووضح ما تحسن وما لم يتحسن.
**القبول:** لا stale release أو wrong chunk، وA06 full gate ناجحة؛ لا ادعاء تحسن لم يقس.

### F09 — store lazy assets & chat unused libraries [داخلي، مشروطة]
**الملفات عند التفعيل:** `public/js/store-landing.js`, `public/landing.html`, `public/chat.html`؛ tests جديدة `tests/storeLandingAssets.test.js`, `tests/chatAssetDependencies.test.js`. **يعتمد:** F01 وموافقة توسيع نطاق الصفحات العامة.
- [ ] store: dedupe لـlanding-base.css، canonical IDs لـlayout4/unknown، تحميل CSS/JS المختارين بالتوازي ثم render بعد جاهزيتهما؛ deep links/registry محفوظة.
- [ ] chat: أثبت runtime عدم استعمال FingerprintJS2/uuid قبل حذفهما؛ send/upload/feedback regression عبر fixtures.
**القبول:** template script واحدة وbase CSS واحدة، failure cases واضحة؛ لا إعادة كتابة pagination أو cart أو تحميل المنتجات.

## 15. خريطة الاعتماد وموجات التنفيذ

### الموجة 0 — تشغيل وضبط
`A01 → A02`، ثم إطلاق ستة قادة. يمكنهم القراءة وتجهيز findings بالتوازي. `C01، D02، D06، E01، F01، A03` تكتب ملفات مستقلة؛ dependency lock لـA03 وHTML integration لـD02 يمران في مسار الملف المشترك.

### الموجة 1 — تثبيت العقود والـbaseline
`C02 → C03`، ثم `D03`، و`F02 → F03`، و`A03 → A04 baseline`، و`B01 → B02`. تعديلات dashboard HTML/JS متسلسلة وفق locks؛ لا يبدأ ستة قادة الكتابة فيها في الوقت نفسه.

### الموجة 2 — shell/i18n/functional contracts
`D01`، `E04`، `C04a` متناسقة عبر مالك semantics؛ `B03/B04/B05` بعد CSS extraction؛ `C04–C07` و`E02/E03/E05` بالأدوار المحددة. `D04/D05/D07/D08/D09` تستعمل عقد request/feedback المثبت.

### الموجة 3 — extraction ثم lazy ثم build
`F04 → F05 → F07 → F08` بعد استقرار Council وhooks؛ لا استخراج وسط تعديل نفس renderer. باقي القادة يختبرون regression ويكتبون docs في ملفاتهم المستقلة.

### الموجة 4 — قبول متكامل
`B06، C08، E06، A05 final، A06` ثم whole-branch review والتقرير. `B07/F06/E08/F09` مشروطة؛ عدم تفعيلها قرار معلن، لا task PASS وهمي.

### منع deadlocks
- لا تنتظر task وأنت ممسك بقفل مشترك؛ سلّم lock ثم انتظر.
- C03 adapter يثبت قبل D03، وD03 قبل F04؛ E01 مستقل، E03 lifecycle يثبت قبل F04.
- F04 لا ينتظر F05، وF05 لا يطلب نقل القواميس لإتمام C03.
- عندما يطلب قائدان نفس الملف: المنسق يختار الأسبق حسب DAG؛ الثاني ينفذ tests/findings مستقلة أو ينتظر؛ لا duplicate helper كحل مؤقت.

## 16. أوامر التحقق ومعنى النجاح

### تجهيز runtime
تثبت A01 الـPATH الفعلي. إذا كان binary المحفوظ موجودًا، يحصل كل agent على PATH المعتمد. لا تفترض استمرار export بين tool calls.

```bash
node --version
npm --version
npm test
```

### focused dashboard gates الموجودة فعليًا
```bash
node tests/dashboardTranslations.test.js
node tests/dashboardMobileSidebar.test.js
node tests/dashboardOnboarding.test.js
node tests/dashboardChannelStatus.test.js
node tests/dashboardWhatsappRelink.test.js
node tests/dashboardCatalogConnector.test.js
node tests/mobileRegression.test.js
node tests/chatPageCustomizer.test.js
NODE_ENV=test node tests/phase0Baseline.test.js
node --check public/js/dashboard_new.js
```

أضف focused new test الخاصة بكل task؛ لا تشغل أوامر ملفات جديدة قبل وجودها. `npm test` يستخدم runner المشروع؛ لا تفترض Jest رغم وجود dependency. `node --check` يفحص syntax فقط، وليس behavior gate.

### بعد A03/F07
```bash
npm run test:browser:dashboard
npm run build:web
```

بعد F07 يحتاج harness وضع source/built موثق؛ نفس scenarios تختبر الناتج قبل إعلان build PASS.

### staging smoke، عند وجود بيئة معزولة شغالة
```bash
curl --fail-with-body -sS "$QA_BASE_URL/health"
curl --fail-with-body -sS "$QA_BASE_URL/health/readiness"
curl --fail-with-body -sS -D - -H 'Accept: text/html' "$QA_BASE_URL/dashboard"
curl -sS -D - -o /dev/null "$QA_BASE_URL/dashboard_new"
```

النجاح: health200، readiness200 مع DB up، HTML الداشبورد المتوقع وMIME صحيح، alias301 إلى `/dashboard`. هذه الأوامر لا تشغل سيرفرًا وحدها. readiness503 لا يسمى PASS لتجربة end-to-end.

### Review Focus — خمس حالات يجب إثباتها
1. **bot/tab يتغير أثناء التحميل:** الرد القديم لا يعرض بيانات البوت السابق؛ D04/D05/A04.
2. **click+Enter أو approve+reject أثناء pending:** mutation واحدة دون replay بعد timeout؛ D02/D04/D05/D07/D08.
3. **لغة غير صالحة أو storage محظور وتبديل لغة مع draft:** لا crash أو draft loss أو refetch؛ C02/C03/C07/A04.
4. **dialog يغلق قبل response أو drawer يتغير مقاسه:** التركيز وinert وscroll lock وtimers نظيفة؛ E01–E04/B04/F04.
5. **SW قديم + release جديد + فشل lazy loading:** لا mixed chunks أو sensitive cache؛ F02/F03/F05/F08/A06.

## 17. التقرير وحالات الإنجاز

حالات التاسك: `not-started / ready / in-progress / awaiting-review / awaiting-verification / blocked / completed / deferred-approved`.

قالب التقرير لكل قطعة، يكتبه قائدها في `docs/qa/reports/<TASK-ID>.md` عند التنفيذ:

```markdown
# TASK-ID — عنوان
Status:
Lead / Implementer / Independent reviewer:
Base / Dependencies / Lock ownership:
Changed behavior:
Touched files:
Tests: command | exit | assertions/result | artifact
Browser: viewport | language | scenario | actual result
Cache versions changed:
Deviations / blockers / remaining gates:
Next task permitted by DAG:
```

- completed يتطلب tests/review/merge gates المطلوبة؛ output العامل وحده لا يكفي.
- blocked يحدد السبب وصاحب الحل، ويحفظ checkpoint قابلًا للاستئناف.
- التقرير العام بعد كل دفعة دمج: من أنجز ماذا، ما ثبت، ما تعطل، القرارات المطلوبة، والخطوة التالية. لا يعلن اكتمال المشروع من إكمال مسار واحد.
- كل قائد يعود للمنسق بعد إكمال نطاقه؛ المنسق لا يدمج worktree stale ولا يغير عقد قائد blocked خفية.

## 18. ربط التقرير الأصلي بالخطة

| موضوع | التاسكات | تعريف الإنجاز |
|---|---|---|
| responsive/sidebar | B01–B05، E04، A04 | matrix geometry+real clicks+keyboard |
| dark toggle | B07 | قرار واضح؛ feature جديدة بعد تصميم معتمد |
| loading/spinners/errors | D02–D09 | حالات موارد وفشل حقيقي، لا spinner شكلية |
| error pages | A05/D06 | HTTP/API/HTML404 contract؛ صفحة500 جديدة قرار مستقل |
| animations | B04/B06 | transitions محدودة وreduced motion؛ لا مكتبة إجبارية |
| accessibility | E01–E07/B06 | keyboard/focus/labels/announcements/contrast evidence |
| i18n/RTL/persistence | C01–C08/B05 | عقد dictionaries الحالي وUI state باللغتين |
| modular/reusable/form/toast/modal | D02/D03/E01–E06/F04 | primitives موحدة وعقود موثقة دون framework مستحدث |
| splitting/lazy/minify/SW | F01–F08 | قياسات وassets سليمة وrelease cache ناجح |
| CSR/SSR | لا migration | الحفاظ على النظام؛ لا إصلاح افتراضي |
| realtime/charts/panels | خارج الإصلاح | feature بطلب مستقل لو حسن يريدها |
| docs/testing | A01–A06 | أوامر وأدلة ومصفوفة حالات، لا checklist صورية |

## 19. Checklist قبل فتح التنفيذ

- [ ] حسن راجع الخطة واعتمد نطاق dashboard+auth وطريقة ستة القادة.
- [ ] A01 ثبت البيئة والشجرة والbaseline؛ عمل المستخدم محفوظ.
- [ ] A02 ثبت العزل وlocks؛ parallel agy مثبت بأدلة أو مؤجل دون وقف التوازي الداخلي.
- [ ] briefs القادة تحدد IDs/tasks/allowlists/contracts والبوابات المشروطة.
- [ ] لا commit/push/deploy approval مفترض.

### Brief افتتاحي للقادة الستة

المنسق يرسل ستة طلبات `task` من نوع `general`، لكل طلب الصيغة الآتية مع استبدال المسار:

```text
أنت قائد المسار C في مشروع /workspace/new-zainbot، ومساحة تنفيذك هي WORKSPACE_C.
اقرأ AGENTS.md وdocs/internal/FRONTEND_EXECUTION_PLAN.md خصوصًا §§3–8 و§11 و§15–17.
هدفك إنهاء C01–C08، مع احترام readiness والتبعيات والقرارات المشروطة.
أنت مسؤول عن الملكية والتفويض والمراجعة داخل مسارك؛ لا تنفذ مسارات الآخرين.
سجل الحالة الحالي: docs/qa/frontend-execution-state.md (المنسق وحده يحرره).
لا تعديل shared file قبل lock وبـbaseline جديد، ولا تعديل user changes.
يمكنك تفويض قطعتين مستقلتين فقط في اللحظة نفسها؛ لا recursive subdelegation.
agy وفق §6 ومهلة صريحة وbrief قطعة واحدة؛ التوازي مشروط بإثبات A02.
لا commit/push/deploy ولا اتصال providers حقيقي. لا إعادة تصميم architecture بلا قرار.
عند تبعية أو quota توقف حسب البروتوكول، وأرجع checkpoint وتقريرًا واضحًا.
لكل تاسك أرجع touchedFiles والاختبارات ونتائجها وreview والفجوات.
في النهاية أرجع تقرير المسار، وما ينتظر integration/verification؛ لا تسمه completed قبل الإثبات.
```

توزيع الطلبات: A→§9، B→§10، C→§11، D→§12، E→§13، F→§14. بعد نتائج القطع، المنسق يستأنف نفس جلسة القائد عبر `task_id` الحقيقي بدل إطلاق قائد جديد فقد سياق المسار. إذا احتاج fresh implementer/reviewer، يعطيه brief القطعة دون تاريخ الشات كله.

## 20. Checklist الإغلاق النهائي

- [ ] كل تاسك أساسية لها دليل ومراجعة؛ قرار التاسكات المشروطة واضح ومسجل.
- [ ] route/ownership bugs المحددة أصلحت وثبتت بالاختبارات.
- [ ] bilingual/RTL/keyboard/mobile matrix ناجحة داخل نطاقها.
- [ ] automated suite/browser/build/warm SW gates ناجحة؛ العوائق المعلنة تمنع ادعاء الإكمال إذا كانت blocking.
- [ ] مقارنة أداء نهائية مقاسة، دون نسب وهمية.
- [ ] كل JS تغير له version bump؛ لا فقد user changes ولا أسرار في المخرجات أو git.
- [ ] frontend guide/component library/reports كاملة وقابلة للاستئناف.
- [ ] المنسق سلّم التقرير لحسن؛ النشر تاسك لاحقة بأمر صريح.
