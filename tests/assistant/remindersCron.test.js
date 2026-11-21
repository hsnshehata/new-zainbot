'use strict';

// tests/assistant/remindersCron.test.js
// sendDueReminders: atomically claims due reminders, dispatches through the
// multi-channel notifier with the owner id, retries transient failures with a
// backoff, and moves reminders to failed after maxAttempts. External side
// effects (notification dispatch) are stubbed; the claim semantics are faked
// in memory here and covered against real Mongo in remindersMongo.test.js.

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
  docs: [],
  dispatchCalls: [],
  claimQueries: [],
  dispatchImpl: null,
};

class FakeReminderDoc {
  constructor(doc) {
    Object.assign(this, doc);
    this.attempts = this.attempts ?? 0;
    this.maxAttempts = this.maxAttempts ?? 3;
  }

  async save() {
    if (this.failOnSave) throw new Error('save failed');
    const stored = state.docs.find((d) => d._id === this._id);
    if (stored && stored !== this) Object.assign(stored, this);
    return this;
  }
}

function matchesClaim(doc, query, now) {
  const staleBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const pendingDue =
    doc.status === 'pending' &&
    doc.dueAt <= now &&
    (doc.nextAttemptAt == null || doc.nextAttemptAt <= now);
  const staleClaimed = doc.status === 'claimed' && doc.claimedAt != null && doc.claimedAt <= staleBefore;
  return pendingDue || staleClaimed;
}

stubModule('../../server/models/Reminder', {
  async findOneAndUpdate(query, update, options) {
    const now = update.$set.claimedAt;
    state.claimQueries.push(query);
    const candidates = state.docs
      .filter((d) => matchesClaim(d, query, now))
      .sort((a, b) => a.dueAt - b.dueAt);
    const doc = candidates[0];
    if (!doc) return null;
    doc.status = update.$set.status;
    doc.claimedAt = update.$set.claimedAt;
    doc.claimedBy = update.$set.claimedBy;
    doc.attempts += update.$inc.attempts;
    return doc;
  },
});
// cronJobs يفكّك الدالة عند التحميل، لذلك الوسيط يمرّر عبر state.dispatchImpl
// حتى تقدر الاختبارات تبدّل سلوك القناة لكل حالة.
stubModule('../../server/services/notificationDispatcher', {
  dispatchMultiChannelNotification: async (payload) => {
    state.dispatchCalls.push(payload);
    return state.dispatchImpl(payload);
  },
});
stubModule('../../server/logger', { info() {}, warn() {}, error() {} });

const { sendDueReminders } = require('../../server/cronJobs');

function reset() {
  state.docs = [];
  state.dispatchCalls = [];
  state.claimQueries = [];
  state.dispatchImpl = async () => ({ delivered: 1, failed: 0 });
}

function doc(overrides) {
  const d = new FakeReminderDoc({
    _id: `r${state.docs.length}`,
    user: 'u1',
    text: 'تذكير',
    status: 'pending',
    dueAt: new Date('2026-11-21T19:00:00Z'),
    nextAttemptAt: null,
    ...overrides,
  });
  state.docs.push(d);
  return d;
}

test('due pending reminders are claimed atomically, dispatched, then marked sent', async () => {
  reset();
  const r1 = doc({ user: 'u1', text: 'تابع المخزون' });
  const r2 = doc({ user: 'u2', text: 'call supplier', dueAt: new Date('2026-11-21T19:30:00Z') });
  const result = await sendDueReminders({ now: new Date('2026-11-21T20:00:00Z') });
  assert.deepEqual(result, { claimed: 2, sent: 2, failed: 0 });
  assert.equal(r1.status, 'sent');
  assert.equal(r2.status, 'sent');
  assert.ok(r1.sentAt instanceof Date);
  assert.equal(state.dispatchCalls.length, 2);
  assert.equal(state.dispatchCalls[0].userId, 'u1');
  assert.equal(state.dispatchCalls[0].event, 'assistant_reminder');
  assert.ok(state.dispatchCalls[0].data.message.includes('تابع المخزون'));
  assert.ok(state.claimQueries[0].$or);
});

test('future reminders are not claimed', async () => {
  reset();
  const future = doc({ dueAt: new Date('2026-11-22T19:00:00Z') });
  const result = await sendDueReminders({ now: new Date('2026-11-21T20:00:00Z') });
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
  assert.equal(future.status, 'pending');
});

test('dispatch failure returns the reminder to pending with a retry time', async () => {
  reset();
  const r = doc({ text: 'retry me' });
  state.dispatchImpl = async () => {
    throw new Error('channel down');
  };
  {
    const result = await sendDueReminders({ now: new Date('2026-11-21T20:00:00Z') });
    assert.deepEqual(result, { claimed: 1, sent: 0, failed: 0 });
    assert.equal(r.status, 'pending');
    assert.equal(r.attempts, 1);
    assert.ok(r.nextAttemptAt instanceof Date);
    assert.equal(r.lastError, 'channel down');
  }
});

test('reaching maxAttempts moves the reminder to failed', async () => {
  reset();
  const r = doc({ text: 'doomed', attempts: 2, maxAttempts: 3 });
  state.dispatchImpl = async () => {
    throw new Error('still down');
  };
  {
    const result = await sendDueReminders({ now: new Date('2026-11-21T20:00:00Z') });
    assert.deepEqual(result, { claimed: 1, sent: 0, failed: 1 });
    assert.equal(r.status, 'failed');
    assert.equal(r.attempts, 3);
  }
});

test('a stale claimed reminder is reclaimed and retried', async () => {
  reset();
  const now = new Date('2026-11-21T20:00:00Z');
  const r = doc({
    status: 'claimed',
    claimedAt: new Date(now.getTime() - 30 * 60 * 1000),
    claimedBy: 'dead-instance',
    attempts: 1,
  });
  const result = await sendDueReminders({ now });
  assert.deepEqual(result, { claimed: 1, sent: 1, failed: 0 });
  assert.equal(r.status, 'sent');
  assert.equal(r.attempts, 2);
});

test('a fresh claimed reminder is left alone', async () => {
  reset();
  const now = new Date('2026-11-21T20:00:00Z');
  const r = doc({
    status: 'claimed',
    claimedAt: new Date(now.getTime() - 60 * 1000),
    claimedBy: 'other-instance',
  });
  const result = await sendDueReminders({ now });
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
  assert.equal(r.status, 'claimed');
  assert.equal(r.claimedBy, 'other-instance');
});

test('a reminder whose retry time has not arrived is left pending', async () => {
  reset();
  const now = new Date('2026-11-21T20:00:00Z');
  const r = doc({ nextAttemptAt: new Date(now.getTime() + 60 * 1000), attempts: 1 });
  const result = await sendDueReminders({ now });
  assert.deepEqual(result, { claimed: 0, sent: 0, failed: 0 });
  assert.equal(r.status, 'pending');
});

test('limit caps how many reminders one run claims', async () => {
  reset();
  doc({ text: 'a' });
  doc({ text: 'b' });
  doc({ text: 'c' });
  const result = await sendDueReminders({ now: new Date('2026-11-21T20:00:00Z'), limit: 2 });
  assert.equal(result.sent, 2);
  assert.equal(state.docs.filter((d) => d.status === 'pending').length, 1);
});
