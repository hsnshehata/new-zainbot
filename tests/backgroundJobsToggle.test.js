'use strict';

// tests/backgroundJobsToggle.test.js
// CRON_JOBS_ENABLED=false must prevent every background job from starting
// (staging isolation control); default behavior stays enabled. cronJobs and
// the idea worker are stubbed via require.cache before server.js loads.

const test = require('node:test');
const assert = require('node:assert/strict');

const cronPath = require.resolve('../server/cronJobs');
const workerPath = require.resolve('../server/services/ideaEvaluationWorker');

const calls = [];
const recorder = (name) => () => { calls.push(name); };
const cronStub = new Proxy({}, { get: (_t, prop) => recorder(String(prop)) });
require.cache[cronPath] = { id: cronPath, filename: cronPath, loaded: true, exports: cronStub };
require.cache[workerPath] = {
  id: workerPath,
  filename: workerPath,
  loaded: true,
  exports: { startIdeaEvaluationWorker: recorder('startIdeaEvaluationWorker') },
};

const { startBackgroundJobs } = require('../server/server');

test('CRON_JOBS_ENABLED=false starts no background jobs', () => {
  process.env.CRON_JOBS_ENABLED = 'false';
  calls.length = 0;
  assert.equal(startBackgroundJobs(), false);
  assert.deepEqual(calls, []);
});

test('default (unset) starts every background job', () => {
  delete process.env.CRON_JOBS_ENABLED;
  calls.length = 0;
  assert.equal(startBackgroundJobs(), true);
  for (const expected of [
    'checkAutoStopBots',
    'refreshInstagramTokens',
    'refreshFacebookTokens',
    'checkLowStock',
    'recoverAbandonedSalesConversations',
    'sendDailyPerformanceSummary',
    'checkSubscriptionExpiringSoon',
    'cleanupOldLogs',
    'checkDueReminders',
    'startIdeaEvaluationWorker',
  ]) {
    assert.ok(calls.includes(expected), `missing ${expected}`);
  }
});
