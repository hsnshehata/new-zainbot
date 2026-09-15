const test = require('node:test');
const assert = require('node:assert/strict');
const cronJobs = require('../server/cronJobs');

test('all required cron jobs are properly exported and callable functions', () => {
  const expectedJobs = [
    'checkAutoStopBots',
    'refreshInstagramTokens',
    'refreshFacebookTokens',
    'checkLowStock',
    'recoverAbandonedSalesConversations',
    'sendDailyPerformanceSummary',
    'checkSubscriptionExpiringSoon',
    'cleanupOldLogs',
  ];

  for (const job of expectedJobs) {
    assert.equal(typeof cronJobs[job], 'function', `cron job ${job} should be an exported function`);
  }
});

test('cron jobs schedule registration runs without syntax or runtime error', () => {
  const t1 = cronJobs.checkLowStock();
  const t2 = cronJobs.recoverAbandonedSalesConversations();
  const t3 = cronJobs.sendDailyPerformanceSummary();
  const t4 = cronJobs.checkSubscriptionExpiringSoon();
  const t5 = cronJobs.refreshFacebookTokens();
  const t6 = cronJobs.checkAutoStopBots();
  const t7 = cronJobs.refreshInstagramTokens();
  const t8 = cronJobs.cleanupOldLogs();

  assert.ok(t1 && typeof t1.stop === 'function');
  assert.ok(t2 && typeof t2.stop === 'function');
  assert.ok(t3 && typeof t3.stop === 'function');
  assert.ok(t4 && typeof t4.stop === 'function');
  assert.ok(t5 && typeof t5.stop === 'function');

  t1.stop();
  t2.stop();
  t3.stop();
  t4.stop();
  t5.stop();
  t6.stop();
  t7.stop();
  t8.stop();
});
