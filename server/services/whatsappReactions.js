// server/services/whatsappReactions.js
// Pure, rule-based, deterministic emoji reaction classifier for inbound
// WhatsApp messages (Arabic + English). No AI calls, no I/O.

const DEFAULT_MAX_LENGTH = 300;

const REACTIONS = Object.freeze({
  THANKS: '🙏',
  GREETING: '👋',
  ACK: '👍',
  ORDER: '✅',
});

// Negative / complaint / anger / problem signals.
// Checked first; any match suppresses all reactions (returns null).
const NEGATIVE_EMOJIS = ['😡', '🤬', '😠', '👎', '😤', '💔'];

// Arabic negative stems (normalized: alef -> ا, ة -> ه, ى -> ي, no diacritics).
// Substring-matched so inflections (المشكلة، مشكلتي، زعلانة، الشكوى) are caught.
const NEGATIVE_ARABIC_STEMS = [
  'شكوي',
  'شكوت',
  'شكاو',
  'زعلان',
  'غضبان',
  'متضايق',
  'مضايق',
  'وحش',
  'مش عاجب',
  'ما عجب',
  'غير راض',
  'مش راض',
  'استرداد',
  'استرجاع',
  'رجع فلوس',
  'رجعوا فلوس',
  'عايز فلوس',
  'مشكل',
  'مشاكل',
  'سيئ',
  'سيء',
  'اسوا',
  'اسوء',
  'زفت',
  'فاشل',
  'خربان',
  'بايظ',
  'تالف',
  'مكسور',
  'نصب',
  'نصاب',
  'احتيال',
  'كذب',
  'كذاب',
  'غش',
  'غلط',
  'خطا',
  'تاخير',
  'متاخر',
  'اتاخرت',
  'الغاء',
  'الغي',
  'مش تمام',
  'مو تمام',
  'مش كويس',
  'مو كويس',
  'مش حلو',
  'مو حلو',
  'مش شغال',
  'لا يعمل',
  'ما يشتغل',
];

// English negative words & phrases (whole-word/phrase matched).
const NEGATIVE_ENGLISH_PHRASES = [
  'refund',
  'refunds',
  'complaint',
  'complaints',
  'complain',
  'complaining',
  'angry',
  'furious',
  'mad',
  'upset',
  'terrible',
  'horrible',
  'awful',
  'worst',
  'scam',
  'scammer',
  'fraud',
  'problem',
  'problems',
  'issue',
  'issues',
  'broken',
  'damaged',
  'defective',
  'wrong',
  'missing',
  'late',
  'delayed',
  'cancel',
  'cancelled',
  'canceled',
  'unacceptable',
  'disappointed',
  'disappointing',
  'rude',
  'pathetic',
  'useless',
  'sucks',
  'hate',
  'bad',
  'poor',
  'rip off',
  'ripoff',
  'not working',
  'does not work',
  'doesnt work',
  'dont work',
  'not ok',
  'not okay',
  'not good',
  'not great',
  'not nice',
  'not happy',
  'never again',
  'waste of',
];

// Positive intent tables (normalized, whole-word/phrase matched for precision).
// Priority order: ORDER -> THANKS -> ACK -> GREETING.

// Order / booking request intent -> ✅
const ORDER_BOOKING_PHRASES = [
  // Arabic (normalized)
  'عايز اطلب',
  'عاوز اطلب',
  'اريد اطلب',
  'اريد الطلب',
  'ابي اطلب',
  'ابغي اطلب',
  'ممكن اطلب',
  'بدي اطلب',
  'اطلب',
  'عمل طلب',
  'طلب جديد',
  'تاكيد الطلب',
  'عايز اوردر',
  'عاوز اوردر',
  'اوردر',
  'حجز',
  'احجز',
  'عايز احجز',
  'عاوز احجز',
  'اريد حجز',
  'ابي احجز',
  'ابغي احجز',
  'ممكن احجز',
  'حجز موعد',
  'تاكيد الحجز',
  'حجزت',
  'طلبت',
  // English
  'want to order',
  'like to order',
  'place an order',
  'place order',
  'make an order',
  'new order',
  'confirm order',
  'order now',
  'want to buy',
  'like to buy',
  'want to book',
  'like to book',
  'book now',
  'book an appointment',
  'book appointment',
  'book a',
  'book an',
  'make a booking',
  'confirm booking',
  'booking',
  'book',
  'reserve',
  'reservation',
];

// Thanks -> 🙏
const THANKS_PHRASES = [
  // Arabic (normalized)
  'شكرا',
  'وشكرا',
  'شكرا جزيلا',
  'الف شكر',
  'مشكور',
  'مشكوره',
  'مشكورين',
  'متشكر',
  'متشكره',
  'متشكرين',
  'اشكرك',
  'اشكركم',
  'تسلم',
  'تسلمي',
  'تسلمو',
  'تسلموا',
  'تسلم ايدك',
  'يسلمو',
  'يسلموا',
  'الله يعطيك العافيه',
  'يعطيك العافيه',
  'يعطيكم العافيه',
  'جزاك الله خيرا',
  'جزاك الله خير',
  'جزاكم الله خير',
  'بارك الله فيك',
  'ممنون',
  'ميرسي',
  'مرسي',
  'ثانكس',
  'ثانكيو',
  // English & Arabizi
  'thanks',
  'thank you',
  'thank u',
  'thx',
  'tysm',
  'ty',
  'many thanks',
  'much appreciated',
  'appreciate it',
  'cheers',
  'shukran',
  'shokran',
  'shkran',
];

// Acknowledgements / confirmations -> 👍
const ACK_PHRASES = [
  // Arabic (normalized)
  'تمام',
  'وتمام',
  'ماشي',
  'وماشي',
  'حاضر',
  'طيب',
  'موافق',
  'موافقه',
  'ممتاز',
  'ممتازه',
  'رائع',
  'رائعه',
  'عظيم',
  'هايل',
  'زي الفل',
  'مزبوط',
  'مظبوط',
  'اتفقنا',
  'تم',
  'وصل',
  'وصلت',
  'مفهوم',
  'فهمت',
  'واضح',
  'اكيد',
  'بالتاكيد',
  'اوك',
  'اوكي',
  'قشطه',
  'اشطه',
  'ميه ميه',
  'عال العال',
  // English & Arabizi
  'tamaam',
  'tamam',
  'mashi',
  'mashy',
  'ok',
  'okay',
  'okey',
  'perfect',
  'great',
  'nice',
  'awesome',
  'cool',
  'done',
  'got it',
  'understood',
  'sounds good',
  'all good',
  'very good',
  'alright',
  'all right',
  'confirmed',
  'agreed',
  'noted',
  'wonderful',
  'excellent',
  'fantastic',
  'will do',
  'copy that',
];

// Greetings -> 👋
const GREETING_PHRASES = [
  // Arabic (normalized)
  'السلام عليكم',
  'وعليكم السلام',
  'عليكم السلام',
  'سلام عليكم',
  'سلام',
  'اهلا',
  'اهلا وسهلا',
  'اهلين',
  'يا هلا',
  'هلا',
  'مرحبا',
  'مرحبتين',
  'مراحب',
  'صباح الخير',
  'صباح النور',
  'مساء الخير',
  'مساء النور',
  'ازيك',
  'ازيكم',
  'عامل ايه',
  'عاملين ايه',
  'كيفك',
  'كيفكم',
  'كيف الحال',
  'شلونك',
  'شلونكم',
  'هاي',
  'هلو',
  'هالو',
  // English & Arabizi
  'salam',
  'salaam',
  'assalamu alaikum',
  'salam alaikum',
  'ahlan',
  'marhaba',
  'marhaban',
  'hala',
  'hello',
  'hi',
  'hey',
  'heya',
  'hiya',
  'good morning',
  'good afternoon',
  'good evening',
  'greetings',
  'howdy',
];

function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    // Remove Arabic diacritics (tashkeel) and tatweel
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    // Normalize Arabic alef variants, taa marbuta, and alef maqsura
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    // Strip apostrophes so contractions (doesn't, don't) stay single tokens
    .replace(/['’]/g, '')
    // Replace punctuation with spaces to preserve word boundaries
    .replace(/[.,!?;:،؛؟"()[\]{}\-_/\\+~`@#$%^&*=|<>]/g, ' ')
    // Collapse 3+ repeated characters (e.g. شكرااا -> شكرا, hellooo -> hello)
    .replace(/(.)\1{2,}/gu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasNegativeSignal(rawText, normalized, padded) {
  for (const emoji of NEGATIVE_EMOJIS) {
    if (rawText.includes(emoji)) return true;
  }
  for (const stem of NEGATIVE_ARABIC_STEMS) {
    if (normalized.includes(stem)) return true;
  }
  for (const phrase of NEGATIVE_ENGLISH_PHRASES) {
    if (padded.includes(` ${phrase} `)) return true;
  }
  return false;
}

function matchesAnyPhrase(padded, phrases) {
  for (const phrase of phrases) {
    if (padded.includes(` ${phrase} `)) return true;
  }
  return false;
}

/**
 * Deterministically picks an emoji reaction for an inbound customer message,
 * or returns null when no reaction is appropriate.
 *
 * @param {string} text - Inbound message text.
 * @param {{ maxLength?: number }} [opts] - Optional classifier overrides.
 * @returns {string|null}
 */
function pickReaction(text, opts = {}) {
  if (typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const maxLength = typeof opts?.maxLength === 'number' ? opts.maxLength : DEFAULT_MAX_LENGTH;
  if (trimmed.length > maxLength) return null;

  // Never react to media-only placeholder text such as [صورة] or [رسالة صوتية].
  if (/^\[[^\]]+\]$/.test(trimmed)) return null;

  const normalized = normalizeText(trimmed);
  if (!normalized) return null;

  const padded = ` ${normalized} `;

  if (hasNegativeSignal(trimmed, normalized, padded)) {
    return null;
  }

  if (matchesAnyPhrase(padded, ORDER_BOOKING_PHRASES)) {
    return REACTIONS.ORDER;
  }
  if (matchesAnyPhrase(padded, THANKS_PHRASES)) {
    return REACTIONS.THANKS;
  }
  if (matchesAnyPhrase(padded, ACK_PHRASES)) {
    return REACTIONS.ACK;
  }
  if (matchesAnyPhrase(padded, GREETING_PHRASES)) {
    return REACTIONS.GREETING;
  }

  return null;
}

module.exports = {
  DEFAULT_MAX_LENGTH,
  REACTIONS,
  normalizeText,
  pickReaction,
};
