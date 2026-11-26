// server/services/whatsappReactions.js
// Pure, rule-based, deterministic emoji reaction classifier for inbound
// WhatsApp messages (Arabic + English). No AI calls, no I/O.

const DEFAULT_MAX_LENGTH = 300;

const REACTIONS = Object.freeze({
  THANKS: '🙏',
  GREETING: '👋',
  ACK: '👍',
  ORDER: '✅',
  // Neutral fallback for messages that match no category, used only when the
  // caller opts into reacting to every inbound message (opts.always).
  DEFAULT: '👍',
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

// Rich variety pools, used ONLY in always mode (the platform session).
// The merchant path (always off) keeps the single deterministic emojis above.
// First element of each pool is the deterministic default; opts.rng and
// opts.avoid add variety so consecutive reactions never repeat.
const RICH_POOLS = Object.freeze({
  ORDER: ['✅', '🛒', '📦'],
  THANKS: ['🙏', '💐', '🌹'],
  ACK: ['👍', '👌', '🆗'],
  GREETING: ['👋', '🌟', '😊'],
  LAUGH: ['😂', '🤣'],
  CELEBRATE: ['🎉', '🥳', '👏'],
  LOVE: ['❤️', '😍', '🥰'],
  FIRE: ['🔥', '🤩'],
  WOW: ['😮', '🤯'],
  MONEY: ['💰', '🤑'],
  WAIT: ['⏳', '🕐'],
  QUESTION: ['🤔', '👀'],
  DEFAULT: ['👍', '👌', '🙌', '✨', '🙂'],
});

// Celebration / congrats (normalized)
const CELEBRATE_PHRASES = [
  'مبروك',
  'الف مبروك',
  'تهانينا',
  'اتهنينا',
  'congrats',
  'congratulations',
  'well done',
  'proud of you',
];

// Affection / praise (normalized)
const LOVE_PHRASES = [
  'حبيبي',
  'يا حبيبي',
  'يا قلبي',
  'عاش',
  'تعيش',
  'بحبك',
  'بحبها',
  'جميل جدا',
  'love',
  'love it',
  'i love',
];

// Fire / impressive (normalized)
const FIRE_PHRASES = [
  'جامد',
  'جامده',
  'نار',
  'علي نار',
  'تحفه',
  'روعه',
  'فخم',
  'فخمه',
  'خرافي',
  'خرافيه',
  'أسطوري',
  'اسطوري',
  'fire',
  'lit',
  'dope',
  'amazing',
  'incredible',
];

// Surprise / disbelief (normalized)
const WOW_PHRASES = [
  'مش مصدق',
  'لا ايه',
  'ولا يومك',
  'بجد',
  'جدع',
  'معقول',
  'معقوله',
  'wow',
  'omg',
  'no way',
  'unbelievable',
  'really',
];

// Price / cost questions (normalized)
const MONEY_PHRASES = [
  'بكام',
  'بكام ده',
  'سعر',
  'اسعار',
  'السعر',
  'الاسعار',
  'التكلفه',
  'تكلفه',
  'فلوس',
  'بفلوس',
  'الاشتراك',
  'باقات',
  'الباقات',
  'price',
  'prices',
  'pricing',
  'cost',
  'how much',
];

// Wait / hold on (normalized)
const WAIT_PHRASES = [
  'استنى',
  'استني',
  'استنا',
  'اصبر',
  'لحظه',
  'لحظه واحده',
  'ثانيه',
  'ثانيه واحده',
  'دقيقه',
  'دقيقه واحده',
  'واحده',
  'wait',
  'one sec',
  'one second',
  'hold on',
  'just a moment',
];

// Question openers (normalized, word-boundary matched)
const QUESTION_PHRASES = [
  'هل',
  'ليه',
  'لي',
  'ازاي',
  'ازي',
  'امتى',
  'فين',
  'ايه',
  'ايه رايك',
  'مين',
  'كام',
  'ممكن',
  'ينفع',
  'what',
  'why',
  'how',
  'when',
  'where',
  'which',
  'can i',
  'could you',
  'is it',
  'are you',
  'do you',
  'does it',
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

// Laughter is checked on the RAW text: normalization collapses repeated
// letters (هههه -> ه), so a normalized check can never match.
function hasLaughter(rawText) {
  return /(هه|خخ|😂|🤣|haha|hehe|lol|lmao|xd)/i.test(rawText);
}

// Pick one emoji from a pool: deterministic first element by default, random
// when opts.rng is supplied, and never opts.avoid unless the pool has no
// alternative (so consecutive reactions to the same sender do not repeat).
function pickFromPool(pool, opts) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const avoid = typeof opts?.avoid === 'string' ? opts.avoid : null;
  let candidates = pool;
  if (avoid && pool.length > 1) {
    const filtered = pool.filter((emoji) => emoji !== avoid);
    if (filtered.length > 0) candidates = filtered;
  }
  const rng = typeof opts?.rng === 'function' ? opts.rng : null;
  const idx = rng ? Math.floor(rng() * candidates.length) % candidates.length : 0;
  return candidates[idx];
}

function isQuestion(rawTrimmed, padded) {
  if (/[?؟]\s*$/.test(rawTrimmed)) return true;
  return matchesAnyPhrase(padded, QUESTION_PHRASES);
}

/**
 * Deterministically picks an emoji reaction for an inbound customer message,
 * or returns null when no reaction is appropriate.
 *
 * @param {string} text - Inbound message text.
 * @param {{ maxLength?: number, always?: boolean, avoid?: string, rng?: Function }} [opts]
 *   - `always: true` (platform session) enables the rich meaning-based pools
 *     and reacts to any clean message; negative/complaint signals still
 *     suppress all reactions either way.
 *   - `avoid` (always mode): an emoji not to pick, used to avoid repeating
 *     the previous reaction to the same sender.
 *   - `rng` (always mode): injectable randomness for pool variety; without
 *     it the first pool element is picked deterministically.
 * @returns {string|null}
 */
function pickReaction(text, opts = {}) {
  if (typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  const always = opts?.always === true;
  const maxLength = typeof opts?.maxLength === 'number' ? opts.maxLength : DEFAULT_MAX_LENGTH;
  if (!always && trimmed.length > maxLength) return null;

  // Never react to media-only placeholder text such as [صورة] or [رسالة صوتية],
  // except in always mode where a neutral reaction on media is intended.
  if (!always && /^\[[^\]]+\]$/.test(trimmed)) return null;

  const normalized = normalizeText(trimmed);
  if (!normalized) return null;

  const padded = ` ${normalized} `;

  if (hasNegativeSignal(trimmed, normalized, padded)) {
    return null;
  }

  if (!always) {
    // Merchant path: original four categories, single deterministic emojis.
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

  // Always mode (platform session): rich, meaning-based variety.
  if (hasLaughter(trimmed)) {
    return pickFromPool(RICH_POOLS.LAUGH, opts);
  }
  if (matchesAnyPhrase(padded, CELEBRATE_PHRASES)) {
    return pickFromPool(RICH_POOLS.CELEBRATE, opts);
  }
  if (matchesAnyPhrase(padded, ORDER_BOOKING_PHRASES)) {
    return pickFromPool(RICH_POOLS.ORDER, opts);
  }
  if (matchesAnyPhrase(padded, MONEY_PHRASES)) {
    return pickFromPool(RICH_POOLS.MONEY, opts);
  }
  if (matchesAnyPhrase(padded, LOVE_PHRASES)) {
    return pickFromPool(RICH_POOLS.LOVE, opts);
  }
  if (matchesAnyPhrase(padded, THANKS_PHRASES)) {
    return pickFromPool(RICH_POOLS.THANKS, opts);
  }
  if (matchesAnyPhrase(padded, FIRE_PHRASES)) {
    return pickFromPool(RICH_POOLS.FIRE, opts);
  }
  if (matchesAnyPhrase(padded, WOW_PHRASES)) {
    return pickFromPool(RICH_POOLS.WOW, opts);
  }
  if (matchesAnyPhrase(padded, WAIT_PHRASES)) {
    return pickFromPool(RICH_POOLS.WAIT, opts);
  }
  if (matchesAnyPhrase(padded, ACK_PHRASES)) {
    return pickFromPool(RICH_POOLS.ACK, opts);
  }
  if (matchesAnyPhrase(padded, GREETING_PHRASES)) {
    return pickFromPool(RICH_POOLS.GREETING, opts);
  }
  if (isQuestion(trimmed, padded)) {
    return pickFromPool(RICH_POOLS.QUESTION, opts);
  }

  return pickFromPool(RICH_POOLS.DEFAULT, opts);
}

module.exports = {
  DEFAULT_MAX_LENGTH,
  REACTIONS,
  RICH_POOLS,
  normalizeText,
  pickReaction,
};
