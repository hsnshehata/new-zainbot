const test = require('node:test');
const assert = require('node:assert');
const guard = require('../server/services/channelGuard');

function withEnv(env, fn) {
  const old = { m: process.env.CHANNELS_MODE, a: process.env.CHANNELS_ALLOWLIST_BOT_IDS };
  Object.assign(process.env, env);
  try { fn(); } finally {
    if (old.m === undefined) delete process.env.CHANNELS_MODE; else process.env.CHANNELS_MODE = old.m;
    if (old.a === undefined) delete process.env.CHANNELS_ALLOWLIST_BOT_IDS; else process.env.CHANNELS_ALLOWLIST_BOT_IDS = old.a;
  }
}

test('default is off', () => {
  delete process.env.CHANNELS_MODE;
  assert.strictEqual(guard.mode(), 'off');
  assert.strictEqual(guard.isBotAllowed('b1'), false);
  assert.strictEqual(guard.backgroundJobsAllowed(), false);
  assert.throws(() => guard.assertBotAllowed('b1'), { code: 'CHANNELS_DISABLED' });
});
test('unknown value is off', () => withEnv({ CHANNELS_MODE: 'yes' }, () => assert.strictEqual(guard.mode(), 'off')));
test('allowlist only lets listed bots', () => withEnv({ CHANNELS_MODE: 'allowlist', CHANNELS_ALLOWLIST_BOT_IDS: 'a, b' }, () => {
  assert.ok(guard.isBotAllowed('a'));
  assert.ok(guard.isBotAllowed('b'));
  assert.ok(!guard.isBotAllowed('c'));
  assert.ok(!guard.isBotAllowed(undefined));
  assert.ok(!guard.backgroundJobsAllowed());
}));
test('on allows all and background jobs', () => withEnv({ CHANNELS_MODE: 'on' }, () => {
  assert.ok(guard.isBotAllowed('zzz'));
  assert.ok(guard.backgroundJobsAllowed());
}));
