const test = require('node:test');
const assert = require('node:assert/strict');
const { extractBookingIntent } = require('../server/botEngine');

test('extractBookingIntent returns null if message has no appointment intent', async () => {
  const result = await extractBookingIntent({
    bot: { _id: '654321abcdef1234567890ab' },
    channel: 'web',
    userMessageContent: 'السلام عليكم، بكام التيشيرت ده؟',
    conversationId: '654321abcdef1234567890bc',
    sourceUserId: 'user-1',
    sourceUsername: 'عميل',
  });

  assert.equal(result, null);
});

test('extractBookingIntent returns null on empty or non-string input', async () => {
  const result = await extractBookingIntent({
    bot: { _id: '654321abcdef1234567890ab' },
    channel: 'web',
    userMessageContent: '',
    conversationId: '654321abcdef1234567890bc',
  });

  assert.equal(result, null);
});

