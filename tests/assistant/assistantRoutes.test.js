'use strict';

// tests/assistant/assistantRoutes.test.js
// Controller contract: validation, tenant scoping on every lookup, reminder
// lifecycle. Models and the AI service are stubbed via require.cache before
// the controller loads — no DB, no network, no provider calls.

const test = require('node:test');
const assert = require('node:assert/strict');

function stubModule(relativePath, exportsObject) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
  return resolved;
}

const OWNER = '507f191e810c19729de86001';
const OTHER = '507f191e810c19729de86002';
const CONV_ID = '507f191e810c19729de86033';
const REM_ID = '507f191e810c19729de86044';

const state = {
  answerResult: { answer: 'رد ثابت', usedTools: ['business_snapshot'], fallback: true, language: 'ar' },
  answerCalls: [],
  convFindOneQuery: null,
  convFindOneResult: null,
  savedConversations: [],
  reminderCreateCalls: [],
  reminderCount: 0,
  reminderFindQuery: null,
  reminderFindOneUpdate: null,
  reminderDeleteQuery: null,
};

class FakeAssistantConversation {
  constructor(doc) {
    this.user = doc.user;
    this.title = doc.title;
    this.messages = doc.messages || [];
    this._id = CONV_ID;
    this.updatedAt = new Date();
  }

  async save() {
    state.savedConversations.push(this);
    return this;
  }

  static async findOne(query) {
    state.convFindOneQuery = query;
    return state.convFindOneResult;
  }

  static find(query) {
    state.convFindQuery = query;
    return {
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: async () => [{
              _id: CONV_ID,
              title: 't',
              updatedAt: new Date(),
              messages: [{ role: 'user', content: 'hi' }],
            }],
          }),
        }),
      }),
    };
  }

  static async deleteOne(query) {
    state.convDeleteQuery = query;
    return { deletedCount: state.convFindOneResult ? 1 : 0 };
  }
}

const FakeReminder = {
  async create(doc) {
    state.reminderCreateCalls.push(doc);
    return { _id: REM_ID, ...doc };
  },
  async countDocuments(query) {
    state.reminderCountQuery = query;
    return state.reminderCount;
  },
  find(query) {
    state.reminderFindQuery = query;
    return {
      sort: () => ({
        limit: () => ({
          lean: async () => [{ _id: REM_ID, text: 'x', dueAt: new Date(), status: 'pending', createdAt: new Date() }],
        }),
      }),
    };
  },
  async findOneAndUpdate(query, update) {
    state.reminderFindOneUpdate = { query, update };
    if (!state.reminderExists) return null;
    return { _id: REM_ID, status: update.$set.status };
  },
  async deleteOne(query) {
    state.reminderDeleteQuery = query;
    return { deletedCount: state.reminderExists ? 1 : 0 };
  },
};

stubModule('../../server/models/AssistantConversation', FakeAssistantConversation);
stubModule('../../server/models/Reminder', FakeReminder);
stubModule('../../server/models/Bot', { findOne: async () => null });
stubModule('../../server/services/aiFailover', { getAiCompletion: async () => { throw new Error('must not run'); } });
stubModule('../../server/services/aiKeyResolver', {
  createAiKeyResolver: () => ({ listGlobalAiKeys: async () => [] }),
});
stubModule('../../server/logger', { info() {}, warn() {}, error() {} });
stubModule('../../server/services/assistantService', {
  createAssistantService: () => ({
    answer: async (input) => {
      state.answerCalls.push(input);
      return state.answerResult;
    },
  }),
});
// The controller also requires the data-tools module and a stack of real
// mongoose models; those load fine without a DB, so only AI-adjacent modules
// needed stubbing.

const controller = require('../../server/controllers/assistantController');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

function captureNext() {
  const captured = { error: null };
  return {
    captured,
    next: (err) => { captured.error = err; },
  };
}

function reset() {
  state.answerCalls = [];
  state.convFindOneQuery = null;
  state.convFindOneResult = null;
  state.savedConversations = [];
  state.reminderCreateCalls = [];
  state.reminderCount = 0;
  state.reminderExists = true;
}

test('chat: missing message is rejected before any AI or DB work', async () => {
  reset();
  const res = mockRes();
  const { captured, next } = captureNext();
  await controller.chat({ user: { userId: OWNER }, body: {} }, res, next);
  assert.equal(captured.error.statusCode, 400);
  assert.equal(state.answerCalls.length, 0);
});

test('chat: over-long message is rejected', async () => {
  reset();
  const res = mockRes();
  const { captured, next } = captureNext();
  await controller.chat({ user: { userId: OWNER }, body: { message: 'x'.repeat(2001) } }, res, next);
  assert.equal(captured.error.statusCode, 400);
});

test('chat: invalid conversation id is rejected', async () => {
  reset();
  const res = mockRes();
  const { captured, next } = captureNext();
  await controller.chat({ user: { userId: OWNER }, body: { message: 'hi', conversationId: 'nope' } }, res, next);
  assert.equal(captured.error.statusCode, 400);
});

test('chat: conversation lookup is scoped to the authenticated owner', async () => {
  reset();
  const res = mockRes();
  const { captured, next } = captureNext();
  await controller.chat({ user: { userId: OWNER }, body: { message: 'hi', conversationId: CONV_ID } }, res, next);
  assert.equal(String(state.convFindOneQuery.user), OWNER);
  assert.equal(captured.error.statusCode, 404);
});

test('chat: new conversation persists both turns and returns the reply', async () => {
  reset();
  const res = mockRes();
  const { next } = captureNext();
  await controller.chat({ user: { userId: OWNER }, body: { message: 'كام المبيعات؟' } }, res, next);
  assert.equal(res.body.success, true);
  assert.equal(res.body.reply, 'رد ثابت');
  assert.equal(state.savedConversations.length, 1);
  const saved = state.savedConversations[0];
  assert.equal(String(saved.user), OWNER);
  assert.deepEqual(saved.messages.map((m) => m.role), ['user', 'assistant']);
  assert.equal(state.answerCalls[0].userId, OWNER);
});

test('chat: existing conversation passes prior turns as history', async () => {
  reset();
  state.convFindOneResult = new FakeAssistantConversation({
    user: OWNER,
    title: 't',
    messages: [{ role: 'user', content: 'old q' }, { role: 'assistant', content: 'old a' }],
  });
  const res = mockRes();
  const { next } = captureNext();
  await controller.chat({ user: { userId: OWNER }, body: { message: 'تابع', conversationId: CONV_ID } }, res, next);
  assert.equal(res.body.success, true);
  assert.deepEqual(state.answerCalls[0].history, [
    { role: 'user', content: 'old q' },
    { role: 'assistant', content: 'old a' },
  ]);
});

test('listConversations scopes to the owner and trims payloads', async () => {
  reset();
  const res = mockRes();
  const { next } = captureNext();
  await controller.listConversations({ user: { userId: OWNER }, query: {} }, res, next);
  assert.equal(String(state.convFindQuery.user), OWNER);
  assert.equal(res.body.conversations.length, 1);
  assert.equal(res.body.conversations[0].id, CONV_ID);
  assert.equal(res.body.conversations[0].messageCount, 1);
});

test('createReminder validates text, date and limit; success persists owner scope', async () => {
  reset();
  const res1 = mockRes();
  const cap1 = captureNext();
  await controller.createReminder({ user: { userId: OWNER }, body: { text: '', dueAt: Date.now() + 3600e3 } }, res1, cap1.next);
  assert.equal(cap1.captured.error.statusCode, 400);

  const res2 = mockRes();
  const cap2 = captureNext();
  await controller.createReminder({ user: { userId: OWNER }, body: { text: 'x', dueAt: 'not-a-date' } }, res2, cap2.next);
  assert.equal(cap2.captured.error.statusCode, 400);

  const res3 = mockRes();
  const cap3 = captureNext();
  await controller.createReminder({ user: { userId: OWNER }, body: { text: 'x', dueAt: new Date(Date.now() - 3600e3).toISOString() } }, res3, cap3.next);
  assert.equal(cap3.captured.error.statusCode, 400);

  state.reminderCount = 100;
  const res4 = mockRes();
  const cap4 = captureNext();
  await controller.createReminder({ user: { userId: OWNER }, body: { text: 'x', dueAt: new Date(Date.now() + 3600e3).toISOString() } }, res4, cap4.next);
  assert.equal(cap4.captured.error.statusCode, 429);

  state.reminderCount = 0;
  const res5 = mockRes();
  const cap5 = captureNext();
  await controller.createReminder({ user: { userId: OWNER }, body: { text: 'ذكّرني بالمخزون', dueAt: new Date(Date.now() + 3600e3).toISOString() } }, res5, cap5.next);
  assert.equal(res5.statusCode, 201);
  assert.equal(String(state.reminderCreateCalls[0].user), OWNER);
});

test('completeReminder updates only the owner reminder in pending/sent state', async () => {
  reset();
  const res = mockRes();
  const { next } = captureNext();
  await controller.completeReminder({ user: { userId: OTHER }, params: { id: REM_ID } }, res, next);
  assert.equal(String(state.reminderFindOneUpdate.query.user), OTHER);
  assert.deepEqual(state.reminderFindOneUpdate.query.status, { $in: ['pending', 'sent'] });
  assert.equal(res.body.success, true);
});

test('completeReminder: unknown reminder returns 404', async () => {
  reset();
  state.reminderExists = false;
  const res = mockRes();
  const { captured, next } = captureNext();
  await controller.completeReminder({ user: { userId: OWNER }, params: { id: REM_ID } }, res, next);
  assert.equal(captured.error.statusCode, 404);
});

test('listReminders scopes to the owner and honors a valid status filter', async () => {
  reset();
  const res = mockRes();
  const { next } = captureNext();
  await controller.listReminders({ user: { userId: OWNER }, query: { status: 'pending' } }, res, next);
  assert.equal(String(state.reminderFindQuery.user), OWNER);
  assert.equal(state.reminderFindQuery.status, 'pending');
  assert.equal(res.body.reminders.length, 1);

  const res2 = mockRes();
  await controller.listReminders({ user: { userId: OWNER }, query: { status: 'bogus' } }, res2, next);
  assert.equal(state.reminderFindQuery.status, undefined);
});
