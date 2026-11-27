// tests/autoReplyGuard.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createAutoReplyGuard,
  isOwnNumberMessage,
} = require('../server/utils/autoReplyGuard');
const {
  DEFAULT_BLOCKED_SENDERS,
  getBlockedSenders,
  isBlockedSender,
  recordBlockedSenderHit,
} = require('../server/config/blockedSenders');

function fakeClock(start = 1_000_000) {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => { now += ms; },
  };
}

describe('isOwnNumberMessage', () => {
  test('matches digit forms across @c.us and serialized wid', () => {
    assert.equal(isOwnNumberMessage('201279425543@c.us', '201279425543@c.us'), true);
    assert.equal(isOwnNumberMessage('+20 127 942 5543', '201279425543@c.us'), true);
  });
  test('rejects different or missing numbers', () => {
    assert.equal(isOwnNumberMessage('201111111111@c.us', '201279425543@c.us'), false);
    assert.equal(isOwnNumberMessage('', '201279425543@c.us'), false);
    assert.equal(isOwnNumberMessage('201279425543@c.us', ''), false);
    assert.equal(isOwnNumberMessage(null, null), false);
  });
});

describe('createAutoReplyGuard', () => {
  test('allows replies under the per-sender cap', () => {
    const clock = fakeClock();
    const guard = createAutoReplyGuard({ now: clock.now, maxPerSenderPerWindow: 3 });
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, true);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, true);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, true);
  });

  test('trips a sender circuit at the cap and opens cooldown', () => {
    const clock = fakeClock();
    const guard = createAutoReplyGuard({
      now: clock.now,
      maxPerSenderPerWindow: 3,
      senderCooldownMs: 60_000,
    });
    guard.allowAndRecord('bot1', 'alice');
    guard.allowAndRecord('bot1', 'alice');
    guard.allowAndRecord('bot1', 'alice');
    const blocked = guard.allowAndRecord('bot1', 'alice');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'sender_circuit_tripped');
    // still open during cooldown, and other senders unaffected
    clock.advance(30_000);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, false);
    assert.equal(guard.allowAndRecord('bot1', 'alice').reason, 'sender_circuit_open');
    assert.equal(guard.allowAndRecord('bot1', 'bob').allowed, true);
    // cooldown expiry restores replies
    clock.advance(31_000);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, true);
  });

  test('repeat trips double the cooldown up to the ceiling', () => {
    const clock = fakeClock();
    const guard = createAutoReplyGuard({
      now: clock.now,
      maxPerSenderPerWindow: 1,
      senderCooldownMs: 10_000,
      maxSenderCooldownMs: 25_000,
    });
    guard.allowAndRecord('bot1', 'alice');
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, false); // trip 1: 10s
    clock.advance(10_001);
    guard.allowAndRecord('bot1', 'alice');
    const second = guard.allowAndRecord('bot1', 'alice'); // trip 2: 20s
    assert.equal(second.allowed, false);
    clock.advance(15_000);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, false); // still in 20s cooldown
    clock.advance(5_001);
    guard.allowAndRecord('bot1', 'alice');
    guard.allowAndRecord('bot1', 'alice'); // trip 3: would be 40s, capped at 25s
    clock.advance(24_999);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, false);
    clock.advance(2);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, true);
  });

  test('sliding window: old replies stop counting', () => {
    const clock = fakeClock();
    const guard = createAutoReplyGuard({
      now: clock.now,
      windowMs: 60_000,
      maxPerSenderPerWindow: 2,
      senderCooldownMs: 60_000,
    });
    guard.allowAndRecord('bot1', 'alice');
    guard.allowAndRecord('bot1', 'alice');
    clock.advance(61_000);
    assert.equal(guard.allowAndRecord('bot1', 'alice').allowed, true);
  });

  test('global bot circuit caps total replies across senders', () => {
    const clock = fakeClock();
    const guard = createAutoReplyGuard({
      now: clock.now,
      maxPerSenderPerWindow: 100,
      maxPerBotPerWindow: 3,
      botCooldownMs: 30_000,
    });
    guard.allowAndRecord('bot1', 'a');
    guard.allowAndRecord('bot1', 'b');
    guard.allowAndRecord('bot1', 'c');
    const blocked = guard.allowAndRecord('bot1', 'd');
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.reason, 'bot_circuit_tripped');
    assert.equal(guard.allowAndRecord('bot1', 'a').reason, 'bot_circuit_open');
    // other bots unaffected
    assert.equal(guard.allowAndRecord('bot2', 'a').allowed, true);
    clock.advance(30_001);
    assert.equal(guard.allowAndRecord('bot1', 'a').allowed, true);
  });
});

describe('blockedSenders', () => {
  test('defaults include only the approved Instinct assistant number', () => {
    const set = getBlockedSenders({});
    assert.equal(set.has('16506588328'), true);
    assert.equal(set.size, 1);
    assert.deepEqual(DEFAULT_BLOCKED_SENDERS, ['16506588328']);
  });

  test('env adds numbers in any format', () => {
    const set = getBlockedSenders({ BLOCKED_SENDER_NUMBERS: '+20 100 000 0000, 20111 222 3333' });
    assert.equal(set.has('201000000000'), true);
    assert.equal(set.has('201112223333'), true);
  });

  test('isBlockedSender matches formatted senders', () => {
    const set = getBlockedSenders({});
    assert.equal(isBlockedSender('+1 650 658-8328', set), true);
    assert.equal(isBlockedSender('16506588328@c.us', set), true);
    assert.equal(isBlockedSender('16508702892@c.us', set), false);
    assert.equal(isBlockedSender('201279425543@c.us', set), false);
  });

  test('recordBlockedSenderHit counts only blocked senders', () => {
    const set = getBlockedSenders({});
    const first = recordBlockedSenderHit('+1 (650) 658-8328', set);
    const second = recordBlockedSenderHit('16506588328@c.us', set);
    assert.equal(first > 0, true);
    assert.equal(second, first + 1);
    assert.equal(recordBlockedSenderHit('201279425543@c.us', set), 0);
  });
});
