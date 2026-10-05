const test = require('node:test');
const assert = require('node:assert/strict');

const Conversation = require('../server/models/Conversation');
const Rule = require('../server/models/Rule');
const ChatOrder = require('../server/models/ChatOrder');
const controller = require('../server/controllers/analyticsController');

const OID = '507f191e810c19729de86001';

function mockRes() {
  const res = { statusCode: 0, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const orig = {};
function stubAll({ counts = {}, agg = [{ n: 7 }] } = {}) {
  orig.countDocumentsC = Conversation.countDocuments;
  orig.aggregate = Conversation.aggregate;
  orig.countDocumentsR = Rule.countDocuments;
  orig.countDocumentsO = ChatOrder.countDocuments;
  let pipeline = null;
  Conversation.countDocuments = async () => counts.conversations ?? 3;
  Conversation.aggregate = async (p) => { pipeline = p; return agg; };
  Rule.countDocuments = async () => counts.rules ?? 2;
  ChatOrder.countDocuments = async (q) => {
    if (q && q.status && q.status.$in) return counts.confirmed ?? 1;
    if (q && q.status && q.status.$ne) return counts.qualified ?? 2;
    return counts.orders ?? 4;
  };
  return { getPipeline: () => pipeline };
}
function restoreAll() {
  Conversation.countDocuments = orig.countDocumentsC;
  Conversation.aggregate = orig.aggregate;
  Rule.countDocuments = orig.countDocumentsR;
  ChatOrder.countDocuments = orig.countDocumentsO;
}

test('analytics summary: missing botId → 400 without DB calls', async () => {
  let called = 0;
  orig.countDocumentsC = Conversation.countDocuments;
  Conversation.countDocuments = async () => { called++; return 0; };
  try {
    const res = mockRes();
    await controller.getAnalytics({ query: {} }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(called, 0);
  } finally {
    Conversation.countDocuments = orig.countDocumentsC;
  }
});

test('analytics summary: malformed botId → 400 BAD_ID_FORMAT', async () => {
  const res = mockRes();
  await controller.getAnalytics({ query: { botId: 'not-an-id' } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'BAD_ID_FORMAT');
});

test('analytics summary: success shape with DB-side unique count', async () => {
  const { getPipeline } = stubAll({});
  try {
    const res = mockRes();
    await controller.getAnalytics({ query: { botId: OID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.messagesCount, 7);
    assert.equal(res.body.data.conversationsCount, 3);
    assert.equal(res.body.data.chatOrdersCount, 4);
    assert.equal(res.body.data.activeRules, 2);
    assert.deepEqual(res.body.data.funnel, { leads: 3, qualified: 2, closed: 1 });
  } finally {
    restoreAll();
  }
});

test('analytics summary: aggregation pipeline stays in Mongo (match/unwind/group/count)', async () => {
  const { getPipeline } = stubAll({ agg: [{ n: 5 }] });
  try {
    const res = mockRes();
    await controller.getAnalytics({ query: { botId: OID } }, res);
    const stages = getPipeline().map((s) => Object.keys(s)[0]);
    assert.deepEqual(stages, ['$match', '$unwind', '$group', '$count']);
    assert.equal(res.body.data.messagesCount, 5);
  } finally {
    restoreAll();
  }
});

test('analytics summary: empty aggregate → messagesCount 0, never throws', async () => {
  stubAll({ agg: [] });
  try {
    const res = mockRes();
    await controller.getAnalytics({ query: { botId: OID } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.messagesCount, 0);
  } finally {
    restoreAll();
  }
});
