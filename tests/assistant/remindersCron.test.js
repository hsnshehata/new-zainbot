'use strict';

// tests/assistant/remindersCron.test.js
// sendDueReminders: marks pending reminders sent before dispatching, dispatches
// through the multi-channel notifier with the owner id, and isolates
// per-reminder failures. All external side effects are stubbed.

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

const state = {
  findQuery: null,
  reminders: [],
  dispatchCalls: [],
  notifications: [],
};

class FakeReminderDoc {
  constructor(doc) {
    Object.assign(this, doc);
  }

  async save() {
    state.saved = state.saved || [];
    state.saved.push(this);
    if (this.failOnSave) throw new Error('save failed');
    return this;
  }
}

stubModule('../../server/models/Reminder', {
  find(query) {
    state.findQuery = query;
    return {
      sort: () => ({
        limit: async (n) => {
          state.findLimit = n;
          return state.reminders;
        },
      }),
    };
  },
});
stubModule('../../server/services/notificationDispatcher', {
  dispatchMultiChannelNotification: async (payload) => {
    state.dispatchCalls.push(payload);
    return { delivered: 1, failed: 0 };
  },
});
stubModule('../../server/logger', { info() {}, warn() {}, error() {} });

const { sendDueReminders } = require('../../server/cronJobs');

function reset() {
  state.findQuery = null;
  state.reminders = [];
  state.dispatchCalls = [];
  state.saved = [];
}

test('due pending reminders are marked sent then dispatched to their owner', async () => {
  reset();
  const now = new Date('2026-11-21T20:00:00Z');
  state.reminders = [
    new FakeReminderDoc({ _id: 'r1', user: 'u1', text: 'تابع المخزون', status: 'pending', dueAt: new Date('2026-11-21T19:00:00Z') }),
    new FakeReminderDoc({ _id: 'r2', user: 'u2', text: 'call supplier', status: 'pending', dueAt: new Date('2026-11-21T19:30:00Z') }),
  ];
  const result = await sendDueReminders({ now });
  assert.equal(result.sent, 2);
  assert.equal(state.findQuery.status, 'pending');
  assert.ok(state.findQuery.dueAt.$lte instanceof Date);
  assert.equal(state.reminders[0].status, 'sent');
  assert.equal(state.reminders[0].sentAt, now);
  assert.equal(state.dispatchCalls.length, 2);
  assert.equal(state.dispatchCalls[0].userId, 'u1');
  assert.equal(state.dispatchCalls[0].event, 'assistant_reminder');
  assert.ok(state.dispatchCalls[0].data.message.includes('تابع المخزون'));
});

test('a failing reminder does not stop the rest', async () => {
  reset();
  state.reminders = [
    new FakeReminderDoc({ _id: 'bad', user: 'u1', text: 'x', status: 'pending', failOnSave: true }),
    new FakeReminderDoc({ _id: 'good', user: 'u2', text: 'y', status: 'pending' }),
  ];
  const result = await sendDueReminders({ now: new Date() });
  assert.equal(result.sent, 1);
  assert.equal(state.dispatchCalls.length, 1);
  assert.equal(state.dispatchCalls[0].userId, 'u2');
});

test('nothing due: no dispatch, no writes', async () => {
  reset();
  const result = await sendDueReminders({ now: new Date() });
  assert.deepEqual(result, { due: 0, sent: 0 });
  assert.equal(state.dispatchCalls.length, 0);
});
