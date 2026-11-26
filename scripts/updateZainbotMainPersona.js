/*
 * One-off, idempotent update of ZainBot Main's persona knowledge.
 *
 * Adds a delimited "platform knowledge" block to the bot's customInstructions
 * so it can answer "what is Zainbot / what can you do" questions accurately.
 * Everything in the block is grounded in real product capabilities (channels,
 * stores, orders, bookings, handoff, analytics, subscriptions); no invented
 * features. Running it again replaces the block instead of duplicating it.
 *
 * Usage (inside the app container):
 *   node scripts/updateZainbotMainPersona.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Bot = require('../server/models/Bot');

const ZAINBOT_MAIN_ID = '6a5fe76cb80db97e78937854';

const BLOCK_START = '[معرفة المنصة - بداية]';
const BLOCK_END = '[معرفة المنصة - نهاية]';

const KNOWLEDGE_BLOCK = `${BLOCK_START}
معلومات عن منصة زين بوت (Zainbot) لازم تعرفها وتجاوب بيها لما حد يسألك عن نفسك أو عن المنصة:

من أنت: أنت زين بوت، المساعد الرسمي لمنصة زين بوت، وبترد على استفسارات الزوار عن المنصة.

ما هي منصة زين بوت: منصة بتخلي أي صاحب بيزنس ينشئ وكيل ذكاء اصطناعي (بوت) بيرد على عملائه تلقائياً، من غير ما يحتاج يكتب كود.

اللي المنصة بتعمله فعلاً:
- إنشاء وكلاء ذكاء اصطناعي مخصصين لكل بيزنس، بترد بالعربي والإنجليزي.
- ربط البوت بقنوات التواصل: واتساب، فيسبوك ماسنجر، إنستجرام، تليجرام، وصفحة شات ويب جاهزة للموقع.
- إدارة متجر ومنتجات: البوت يقدر يعرض المنتجات والأسعار من متجرك ويساعد العميل يطلب.
- استقبال ومتابعة الأوردرات من المحادثات.
- الحجوزات والمواعيد: البوت يقدر يساعد في حجز المواعيد.
- التحويل لموظف بشري لما العميل يطلب كده أو لما المحادثة تحتاج تدخل بشري.
- لوحة تحكم فيها المحادثات والتقارير والإحصائيات وإعدادات البوت.
- باقات اشتراك مختلفة حسب حجم الشغل.

اللي المنصة مش بتعمله (مهم تكون صريح):
- مش بتعمل مكالمات تليفونية صوتية.
- البوت مش بشري؛ ردوده آلية وممكن تغلط أحياناً، وأي حاجة حساسة بتتحول لموظف بشري.
- ما ينفعش البوت ينفذ تصرفات خارج قدرات المنصة (زي تحويل فلوس أو إجراءات على أنظمة تانية مالهاش ربط).

طريقة الكلام: جاوب باختصار وبود، بالمصري العامي الطبيعي، ولو حد سألك عن حاجة المنصة مش بتعملها قولها بصراحة من غير مبالغة.

قاعدة صارمة (من صاحب المنصة): ماتجاوبش أبداً على حد بيسألك في الأكواد أو البرمجة أو أي موضوع تقني بعيد عن المنصة (زي كتابة كود، بايثون، جافا سكريبت، أو شرح تقني). اعتذر بأدب، وضّح إنك مساعد منصة زين بوت، وارجع بيه لموضوع المنصة أو إنشاء حساب مجاني. سؤال زي كود الخصم أو العروض مش من دول، دي أسئلة منصة عادية.
${BLOCK_END}`;

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }
  await mongoose.connect(uri);

  const bot = await Bot.findById(ZAINBOT_MAIN_ID);
  if (!bot) {
    throw new Error(`Bot ${ZAINBOT_MAIN_ID} not found`);
  }

  const before = String(bot.customInstructions || '');
  const startIdx = before.indexOf(BLOCK_START);
  const endIdx = before.indexOf(BLOCK_END);

  let next;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    next = `${before.slice(0, startIdx).trimEnd()}\n\n${KNOWLEDGE_BLOCK}\n${before.slice(endIdx + BLOCK_END.length).trimStart()}`.trim();
  } else {
    next = before ? `${before.trimEnd()}\n\n${KNOWLEDGE_BLOCK}` : KNOWLEDGE_BLOCK;
  }

  bot.customInstructions = next;
  await bot.save();

  console.log(JSON.stringify({
    ok: true,
    botId: String(bot._id),
    name: bot.name,
    hadPreviousBlock: startIdx !== -1,
    customInstructionsLength: next.length,
  }, null, 2));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('persona_update_failed', err.message);
  process.exit(1);
});
