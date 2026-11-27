'use strict';

// Small, deterministic conversation rules that must not depend on the model:
// stop / resume requests, repeated "how can I help" tails, and the notes used
// for bots that have no store catalog.

const STOP_MUTE_MS = 12 * 60 * 60 * 1000;

function normalize(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.!؟?،,؛;:"'()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// A stop request is a SHORT message that is only about stopping. Longer
// messages that happen to contain these words are treated as normal talk.
const STOP_PATTERNS = [
  /^(?:لو سمحت |من فضلك |ارجوك |يا برنس |يا باشا )?(?:اسكت|اسكتي|سكت|اسكت خلاص|كفايه|كفايه كده|كفايه خلاص|خلاص كفايه|بس كفايه|بس خلاص|خلاص بس|وقف|وقف رد|وقف الرد|وقفي|بطل|بطل رد|بطل كلام|بطل ترد|بطل تكلمني)(?: كده| خلاص| بقا| بقى| دلوقتي| شكرا)?$/,
  /^(?:من فضلك |لو سمحت |ارجوك )?(?:ما?|م) ?(?:تردش|ترد|تكلمنيش|تبعتلي|تبعتليش|تراسلنيش)(?: عليا| علي| تاني| بقا| بقى| خلاص| كده| تاني خالص)*$/,
  /^(?:لا |مش عايز |مش عاوز )?(?:رد|ردود|رسايل|رسائل)(?: تاني| منك| خلاص)* (?:مش عايز|مش عاوز|كفايه|بطل)$/,
  /^(?:مش عايز|مش عاوز|مش محتاج)(?: اي)?(?: رد| ردود| رسايل| رسائل| منك| حاجه| حاجة)?(?: تاني| بعد كده| خلاص| كده)*$/,
  /^(?:stop|stop it|stop replying|stop messaging me|be quiet|shut up|enough|unsubscribe|leave me alone|dont reply|do not reply|don t reply)$/,
];

const RESUME_PATTERNS = [
  /^(?:كمل|كمل كلام|كمل رد|رجع|رجع رد|ارجع|رجع تاني|ابدا|ابدا تاني|ابدأ|فكك|ممكن تكلمني|كلمني تاني|ردي علي|رد عليا)$/,
  /^(?:start|resume|continue|start again|you can reply|reply again)$/,
];

function detectStopRequest(text) {
  const t = normalize(text);
  if (!t || t.length > 40) return false;
  return STOP_PATTERNS.some((re) => re.test(t));
}

function detectResumeRequest(text) {
  const t = normalize(text);
  if (!t || t.length > 30) return false;
  return RESUME_PATTERNS.some((re) => re.test(t));
}

function stopAckReply(text) {
  return /[a-z]{3,}/i.test(String(text || '')) && !/[\u0600-\u06FF]/.test(String(text || ''))
    ? 'Okay, I will stop replying. Message "start" any time to continue.'
    : 'تمام، هبطل أرد دلوقتي. لو احتجت حاجة بعد كده اكتب "كمل" وأنا معاك.';
}

// Trailing generic offers the model repeats on every turn.
const HELP_TAIL = /(?:[\s\n]*(?:هل )?(?:كيف|ازاي|إزاي)\s+(?:يمكنني|ممكن|اقدر|أقدر|أقدر|يمكنني)\s+(?:مساعدتك|أساعدك|اساعدك|خدمتك)(?:\s+(?:اليوم|النهارده|النهاردة|دلوقتي))?\s*[؟?]?|[\s\n]*(?:تحب|عايز|عاوز)\s+(?:أساعدك|اساعدك)\s+(?:في )?(?:حاجة|حاجه)\s+(?:تانية|تانيه|تاني)\s*[؟?]?|[\s\n]*how\s+can\s+i\s+(?:help|assist)\s+you(?:\s+today)?\s*\??|[\s\n]*is\s+there\s+anything\s+else\s+i\s+can\s+help\s+(?:you\s+)?with\s*\??)\s*$/i;

function stripRepeatedHelpOffer(reply, hasPriorAssistantReply) {
  if (!hasPriorAssistantReply || typeof reply !== 'string') return reply;
  const stripped = reply.replace(HELP_TAIL, '').replace(/[\s\n]+$/g, '');
  // Never return an empty reply because the whole message was the offer.
  return stripped.length >= 8 ? stripped : reply;
}

const STYLE_NOTE =
  '\n[ثبات الأسلوب]: التزم بلهجة واحدة طوال المحادثة: اتبع لغة العميل ولهجته (مصرية عامية لو كتب بالعامية)، ولا تبدّل بين الفصحى والعامية من رد لرد.' +
  ' لا تنهِ كل رد بجملة "كيف يمكنني مساعدتك اليوم؟" أو ما يشبهها ولا تكرر الترحيب بعد أول رد؛ اسأل سؤال متابعة محدد فقط عند الحاجة.' +
  ' لو طلب العميل منك التوقف عن الرد فتوقف.\n';

const PLATFORM_SUBSCRIPTION_NOTE =
  '\n[اشتراكات المنصة]: هذه القناة لا تسجّل طلبات منتجات ولا تتعامل مع كتالوج متجر. اختيار العميل لباقة (حتى لو كتب رقمها فقط) هو طلب اشتراك وليس طلب منتج، ' +
  'فلا تقل أبدًا إن الباقة "غير متوفرة بسعر رسمي" ولا تتصرف كأن هناك مخزونًا. أكد له الباقة وسعرها من قائمة الباقات الواردة في تعليماتك فقط، ' +
  'ثم اشرح الخطوات الموجودة فعلًا: التسجيل من zainbot.com/register، ثم الدفع اليدوي بإحدى الوسائل المذكورة في تعليماتك، ثم التفعيل بمراجعة بشرية. ' +
  'لا تؤكد أن الاشتراك تم أو تفعّل، ولا تطلب بيانات دفع أو كلمات سر.\n';

const STORELESS_ORDER_NOTE =
  '\n[حالة الطلب الفعلية]: لا يوجد متجر أو كتالوج مرتبط بهذا البوت، ولم يُحفظ أي طلب. لا تقل إن طلبًا سُجّل أو تأكد، واشرح للعميل بصراحة ما يمكن عمله فعلًا.\n';

module.exports = {
  STOP_MUTE_MS,
  detectStopRequest,
  detectResumeRequest,
  stopAckReply,
  stripRepeatedHelpOffer,
  STYLE_NOTE,
  PLATFORM_SUBSCRIPTION_NOTE,
  STORELESS_ORDER_NOTE,
};
