process.env.CHANNELS_MODE = process.env.CHANNELS_MODE || 'on';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const mongoose = require('mongoose');

const { pickReaction, REACTIONS } = require('../server/services/whatsappReactions');
const { createWhatsAppSessionManager } = require('../server/services/whatsappSessionManager');
const Bot = require('../server/models/Bot');

const BOT_ID = '507f191e810c19729de87011';
const USER_ID = '507f191e810c19729de86011';

// ---------- Classifier unit tests ----------

test('pickReaction classifies thanks in Arabic (with/without diacritics & alef variants) and English', () => {
  const cases = [
    'شكراً',
    'شكرا جزيلا',
    'شُكْراً جَزِيلاً',
    'ألف شكر',
    'الف شكر',
    'متشكر أوي',
    'تسلم ايدك',
    'الله يعطيك العافية',
    'جزاك الله خيراً',
    'شكرااااا',
    'Thanks!',
    'Thank you so much',
    'thx',
    'TYSM',
    'shukran',
  ];
  for (const text of cases) {
    assert.equal(pickReaction(text), '🙏', `expected 🙏 for "${text}"`);
  }
  assert.equal(REACTIONS.THANKS, '🙏');
});

test('pickReaction classifies greetings in Arabic and English', () => {
  const cases = [
    'السلام عليكم',
    'أهلاً وسهلاً',
    'اهلا',
    'مرحباً',
    'مرحبا',
    'صباح الخير',
    'مساء الخير',
    'إزيك',
    'Hello!',
    'hi',
    'HEY there',
    'Good morning',
    'Good evening',
    'salam',
    'ahlan',
  ];
  for (const text of cases) {
    assert.equal(pickReaction(text), '👋', `expected 👋 for "${text}"`);
  }
  assert.equal(REACTIONS.GREETING, '👋');
});

test('pickReaction classifies acknowledgements and confirmations in Arabic and English', () => {
  const cases = [
    'تمام',
    'تماااام',
    'ماشي',
    'حاضر',
    'ممتاز',
    'أوكي',
    'موافق',
    'اتفقنا',
    'ok',
    'Okay!',
    'tamaam',
    'mashi',
    'perfect',
    'Great',
    'nice',
    'done',
    'sounds good',
  ];
  for (const text of cases) {
    assert.equal(pickReaction(text), '👍', `expected 👍 for "${text}"`);
  }
  assert.equal(REACTIONS.ACK, '👍');
});

test('pickReaction classifies order and booking intent in Arabic and English', () => {
  const cases = [
    'عايز اطلب',
    'عايز أطلب منتج',
    'ممكن أطلب الآن؟',
    'حجز',
    'ممكن أحجز موعد بكرة',
    'عايز اوردر',
    'I want to order two items',
    'I would like to place an order',
    'book',
    'Can I book an appointment?',
    'reserve a table for Friday',
  ];
  for (const text of cases) {
    assert.equal(pickReaction(text), '✅', `expected ✅ for "${text}"`);
  }
  assert.equal(REACTIONS.ORDER, '✅');
});

test('pickReaction returns null for complaints, anger, problems, and refund requests', () => {
  const cases = [
    'عندي شكوى',
    'شكوى بخصوص الطلب',
    'أنا زعلان جداً من الخدمة',
    'المنتج وحش',
    'مش عاجبني خالص',
    'عايز استرداد الفلوس',
    'في مشكلة في الطلب',
    'مرحبا عندي مشكلة في التوصيل',
    'تمام بس في مشكلة كبيرة',
    'عايز ألغي الحجز',
    'I want a refund please',
    'I have a complaint',
    'I am very angry',
    'Terrible service',
    'Worst experience ever',
    'This is a scam',
    'There is a problem with my order',
    'Thanks for nothing, terrible experience',
    'Hi, I want a refund',
    '😡',
  ];
  for (const text of cases) {
    assert.equal(pickReaction(text), null, `expected null for complaint "${text}"`);
  }
});

test('pickReaction returns null for empty, media-only, over-300-char, and unknown text', () => {
  assert.equal(pickReaction(''), null);
  assert.equal(pickReaction('    '), null);
  assert.equal(pickReaction(null), null);
  assert.equal(pickReaction(undefined), null);
  assert.equal(pickReaction('[صورة]'), null);
  assert.equal(pickReaction('[رسالة صوتية]'), null);

  const over300 = `thanks ${'a'.repeat(300)}`;
  assert.ok(over300.length > 300);
  assert.equal(pickReaction(over300), null);

  const unknownCases = [
    'بكام التيشيرت الأزرق؟',
    'What are your opening hours?',
    'This shirt is white',
    'Look at the stock',
    '12345',
  ];
  for (const text of unknownCases) {
    assert.equal(pickReaction(text), null, `expected null for unknown "${text}"`);
  }
});

// ---------- Bot schema default test ----------

test('Bot schema defaults agentTools.whatsappReactionsTool.enabled to false', () => {
  const bot = new Bot({
    name: 'Default Reactions Bot',
    userId: new mongoose.Types.ObjectId(),
  });
  assert.equal(bot.agentTools.whatsappReactionsTool.enabled, false);
});

// ---------- Session manager handler-level tests ----------

function createConnectionModel() {
  const documents = new Map();
  return {
    async findOneAndUpdate(filter, update) {
      const key = String(filter.botId);
      const existing = documents.get(key) || {
        _id: '507f191e810c19729de87991',
        botId: filter.botId,
        channel: 'whatsapp',
      };
      Object.assign(existing, update.$setOnInsert || {}, update.$set || {});
      documents.set(key, existing);
      return existing;
    },
    async findOne(filter) {
      return documents.get(String(filter.botId)) || null;
    },
  };
}

class FakeClient extends EventEmitter {
  static instances = [];

  constructor() {
    super();
    this.info = { wid: { user: '201000000001' }, pushname: 'Shop' };
    FakeClient.instances.push(this);
  }

  async initialize() {}
  async destroy() {}
  async logout() {}
  async getState() { return 'CONNECTED'; }
}

class FakeRemoteAuth {}
class FakeMongoStore {}

async function setupManager({ botDoc, processIncomingMessage, warnings = [] }) {
  FakeClient.instances.length = 0;
  const manager = createWhatsAppSessionManager({
    ClientClass: FakeClient,
    RemoteAuthClass: FakeRemoteAuth,
    MongoStoreClass: FakeMongoStore,
    ConnectionModel: createConnectionModel(),
    ConversationModel: { async exists() { return false; } },
    mongooseInstance: {},
    leaseService: {
      async acquire() { return { ownerId: 'worker-1' }; },
      async renew() { return { ownerId: 'worker-1' }; },
      async release() {},
    },
    qrToDataURL: async () => 'data:image/png;base64,qr',
    processIncomingMessage,
    getBot: async () => botDoc,
    logger: {
      info() {},
      warn(event, meta) { warnings.push({ event, meta }); },
      error() {},
    },
    workDirectory: '.test-whatsapp-reactions-runtime',
  });
  await manager.connect({ botId: BOT_ID, userId: USER_ID });
  return { manager, client: FakeClient.instances[0] };
}

test('handleIncomingMessage calls react() exactly once before processIncomingMessage when enabled', async () => {
  const order = [];
  const reactCalls = [];
  const replyCalls = [];
  let replyDone;
  const replyPromise = new Promise((resolve) => { replyDone = resolve; });

  const { manager, client } = await setupManager({
    botDoc: { _id: BOT_ID, agentTools: { whatsappReactionsTool: { enabled: true } } },
    processIncomingMessage: async () => {
      order.push('process');
      return 'العفو! تحت أمرك';
    },
  });

  const message = {
    id: { _serialized: 'msg-enabled-1' },
    from: '201000000099@c.us',
    fromMe: false,
    isStatus: false,
    type: 'chat',
    body: 'شكراً جزيلاً',
    async react(emoji) {
      order.push('react');
      reactCalls.push(emoji);
    },
    async reply(text) {
      order.push('reply');
      replyCalls.push(text);
      replyDone();
    },
  };

  client.emit('message', message);
  await replyPromise;
  await manager.shutdown();

  assert.deepEqual(reactCalls, ['🙏']);
  assert.deepEqual(replyCalls, ['العفو! تحت أمرك']);
  assert.deepEqual(order, ['react', 'process', 'reply']);
});

test('handleIncomingMessage does NOT call react() when whatsappReactionsTool is disabled', async () => {
  const reactCalls = [];
  const replyCalls = [];
  let replyDone;
  const replyPromise = new Promise((resolve) => { replyDone = resolve; });

  const { manager, client } = await setupManager({
    botDoc: { _id: BOT_ID, agentTools: { whatsappReactionsTool: { enabled: false } } },
    processIncomingMessage: async () => 'أهلاً بك',
  });

  const message = {
    id: { _serialized: 'msg-disabled-1' },
    from: '201000000099@c.us',
    fromMe: false,
    isStatus: false,
    type: 'chat',
    body: 'السلام عليكم',
    async react(emoji) {
      reactCalls.push(emoji);
    },
    async reply(text) {
      replyCalls.push(text);
      replyDone();
    },
  };

  client.emit('message', message);
  await replyPromise;
  await manager.shutdown();

  assert.equal(reactCalls.length, 0);
  assert.deepEqual(replyCalls, ['أهلاً بك']);
});

test('handleIncomingMessage swallows react() rejection and still sends AI reply', async () => {
  const reactCalls = [];
  const replyCalls = [];
  const warnings = [];
  let replyDone;
  const replyPromise = new Promise((resolve) => { replyDone = resolve; });

  const { manager, client } = await setupManager({
    botDoc: { _id: BOT_ID, agentTools: { whatsappReactionsTool: { enabled: true } } },
    processIncomingMessage: async () => 'تم الاستلام',
    warnings,
  });

  const message = {
    id: { _serialized: 'msg-reject-1' },
    from: '201000000099@c.us',
    fromMe: false,
    isStatus: false,
    type: 'chat',
    body: 'تمام ماشي',
    async react(emoji) {
      reactCalls.push(emoji);
      throw new Error('WhatsApp react unsupported');
    },
    async reply(text) {
      replyCalls.push(text);
      replyDone();
    },
  };

  client.emit('message', message);
  await replyPromise;
  await manager.shutdown();

  assert.deepEqual(reactCalls, ['👍']);
  assert.deepEqual(replyCalls, ['تم الاستلام']);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, 'whatsapp_message_reaction_failed');
});

test('handleIncomingMessage skips react() for complaints, media-only, and duplicate messages even when enabled', async () => {
  const reactCalls = [];
  const replyCalls = [];
  let replyResolver = null;
  const nextReply = () => new Promise((resolve) => { replyResolver = resolve; });

  const { manager, client } = await setupManager({
    botDoc: { _id: BOT_ID, agentTools: { whatsappReactionsTool: { enabled: true } } },
    processIncomingMessage: async () => 'رد',
  });

  // 1. Complaint -> no react
  let wait = nextReply();
  client.emit('message', {
    id: { _serialized: 'msg-complaint-1' },
    from: '201000000099@c.us',
    fromMe: false,
    isStatus: false,
    type: 'chat',
    body: 'عندي شكوى والخدمة وحشة',
    async react(emoji) { reactCalls.push(emoji); },
    async reply(text) { replyCalls.push(text); replyResolver(); },
  });
  await wait;
  assert.equal(reactCalls.length, 0);

  // 2. Media-only image without caption -> no react
  wait = nextReply();
  client.emit('message', {
    id: { _serialized: 'msg-media-1' },
    from: '201000000099@c.us',
    fromMe: false,
    isStatus: false,
    type: 'image',
    body: '',
    async downloadMedia() { return null; },
    async react(emoji) { reactCalls.push(emoji); },
    async reply(text) { replyCalls.push(text); replyResolver(); },
  });
  await wait;
  assert.equal(reactCalls.length, 0);

  // 3. Matching message followed by duplicate -> react called once total
  wait = nextReply();
  const greetingMsg = {
    id: { _serialized: 'msg-dedupe-1' },
    from: '201000000099@c.us',
    fromMe: false,
    isStatus: false,
    type: 'chat',
    body: 'مرحبا',
    async react(emoji) { reactCalls.push(emoji); },
    async reply(text) { replyCalls.push(text); replyResolver(); },
  };
  client.emit('message', greetingMsg);
  await wait;
  client.emit('message', greetingMsg);
  await new Promise((resolve) => setImmediate(resolve));

  await manager.shutdown();
  assert.deepEqual(reactCalls, ['👋']);
  assert.equal(replyCalls.length, 3);
});

test('pickReaction always mode reacts to every clean message, keeps category emojis, and still suppresses complaints', () => {
  // Price question: null by default, money reaction in always mode.
  assert.equal(pickReaction('عايز اعرف اسعار الباقات'), null);
  assert.equal(pickReaction('عايز اعرف اسعار الباقات', { always: true }), '💰');

  // Media-only placeholders: skipped by default, reacted in always mode.
  assert.equal(pickReaction('[صورة]'), null);
  assert.equal(pickReaction('[صورة]', { always: true }), REACTIONS.DEFAULT);

  // Over-length messages: skipped by default, reacted in always mode.
  const longText = 'أ '.repeat(200).trim();
  assert.equal(pickReaction(longText), null);
  assert.equal(pickReaction(longText, { always: true }), REACTIONS.DEFAULT);

  // Category matches keep their specific emoji even in always mode.
  assert.equal(pickReaction('شكرا جزيلا', { always: true }), REACTIONS.THANKS);
  assert.equal(pickReaction('مرحبا', { always: true }), REACTIONS.GREETING);

  // Complaints / anger / refunds stay silent in always mode too.
  assert.equal(pickReaction('عندي مشكلة كبيرة في الأوردر', { always: true }), null);
  assert.equal(pickReaction('عايز استرجاع فلوسي 😡', { always: true }), null);

  // Empty input stays silent either way.
  assert.equal(pickReaction('', { always: true }), null);
  assert.equal(pickReaction('   ', { always: true }), null);
});

test('pickReaction always mode: rich meaning-based categories with deterministic pool heads', () => {
  const cases = [
    ['مبروك التخرج يا بطل', '🎉'],
    ['هههههههه', '😂'],
    ['ده نار بجد 🔥', '🔥'],
    ['حبيبي يا بطل', '❤️'],
    ['استنى ثانيه واحده', '⏳'],
    ['ليه الرد اتاخر؟', '🤔'],
    ['how much is the plan', '💰'],
    ['congrats on the new baby', '🎉'],
  ];
  for (const [text, expected] of cases) {
    assert.equal(pickReaction(text, { always: true }), expected, `for "${text}"`);
  }
  // Without always (merchant path) none of the rich categories react.
  for (const [text] of cases) {
    assert.equal(pickReaction(text), null, `merchant path must stay narrow for "${text}"`);
  }
});

test('pickReaction always mode: rng adds variety and avoid prevents back-to-back repeats', () => {
  // rng pinned to the last pool element
  const last = () => 0.9999;
  assert.equal(pickReaction('شكرا', { always: true, rng: last }), '🌹');
  assert.equal(pickReaction('تمام', { always: true, rng: last }), '🆗');

  // avoid removes the previous emoji from the candidates
  assert.equal(pickReaction('مرحبا', { always: true, avoid: '👋' }), '🌟');
  assert.equal(pickReaction('مرحبا', { always: true, avoid: '👋', rng: () => 0 }), '🌟');

  // avoid with a single-candidate pool still never returns the avoided emoji
  assert.equal(pickReaction('هههه', { always: true, avoid: '😂', rng: () => 0 }), '🤣');

  // rng = 0 keeps the deterministic head
  assert.equal(pickReaction('بكام الاشتراك', { always: true, rng: () => 0 }), '💰');
});
