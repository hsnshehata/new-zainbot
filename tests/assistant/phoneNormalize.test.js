'use strict';

// tests/assistant/phoneNormalize.test.js
// Edge-case coverage for Egyptian 01x -> 201x normalization, international E.164,
// Eastern Arabic digits, @c.us / @s.whatsapp.net / @lid / @g.us handling, and
// fail-closed @lid sender phone resolution.

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeArabicDigits,
  isLidJid,
  isGroupJid,
  stripWhatsappJid,
  normalizePhoneToE164Digits,
  parseWhatsappJid,
  toWhatsappChatId,
  maskPhone,
  resolveSenderPhoneFromMessage,
} = require('../../server/services/phoneNormalize');

test('normalizes Egyptian 01x numbers in all common formats to 201xxxxxxxxx', () => {
  const cases = [
    ['01012345678', '201012345678'],
    ['01198765432', '201198765432'],
    ['01200001111', '201200011111'.slice(0, 12)],
    ['01555667788', '201555667788'],
    ['+201012345678', '201012345678'],
    ['201012345678', '201012345678'],
    ['00201012345678', '201012345678'],
    ['+20 010-1234-5678', '201012345678'],
    ['010 1234 5678', '201012345678'],
    ['(010) 1234-5678', '201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '201012345678'],
    ['+٢٠ ١٠١٢٣٤٥٦٧٨', '201012345678'],
    ['whatsapp_01012345678', '201012345678'],
  ];

  // Fix expected for '01200001111' -> '201200001111'
  cases[2][1] = '201200001111';

  for (const [input, expected] of cases) {
    assert.equal(normalizePhoneToE164Digits(input), expected, `Failed for input: ${input}`);
  }
});

test('normalizes non-Egyptian E.164 international numbers cleanly', () => {
  assert.equal(normalizePhoneToE164Digits('+966501234567'), '966501234567');
  assert.equal(normalizePhoneToE164Digits('00971501234567'), '971501234567');
  assert.equal(normalizePhoneToE164Digits('+1 (415) 555-2671'), '14155552671');
});

test('strips @c.us, @s.whatsapp.net, :device suffixes, and @lid cleanly', () => {
  assert.equal(stripWhatsappJid('201012345678@c.us'), '201012345678');
  assert.equal(stripWhatsappJid('201012345678:12@s.whatsapp.net'), '201012345678');
  assert.equal(stripWhatsappJid('198765432109876@lid'), '198765432109876');
  assert.equal(stripWhatsappJid('whatsapp_201012345678@c.us'), '201012345678');

  assert.equal(normalizePhoneToE164Digits('201012345678@c.us'), '201012345678');
  assert.equal(normalizePhoneToE164Digits('201012345678:5@s.whatsapp.net'), '201012345678');
  assert.equal(normalizePhoneToE164Digits('01012345678@c.us'), '201012345678');

  // @lid and group JIDs fail closed by default (never treated as phone numbers)
  assert.equal(isLidJid('198765432109876@lid'), true);
  assert.equal(isLidJid('201012345678@c.us'), false);
  assert.equal(isGroupJid('120363012345@g.us'), true);
  assert.equal(isGroupJid('status@broadcast'), true);

  assert.equal(normalizePhoneToE164Digits('198765432109876@lid'), '');
  assert.equal(normalizePhoneToE164Digits('120363012345@g.us'), '');
  assert.equal(normalizePhoneToE164Digits('status@broadcast'), '');

  const parsedLid = parseWhatsappJid('198765432109876@lid');
  assert.equal(parsedLid.isLid, true);
  assert.equal(parsedLid.id, '198765432109876');
  assert.equal(parsedLid.domain, 'lid');
  assert.equal(parsedLid.phone, '');

  const parsedCus = parseWhatsappJid('201012345678@c.us');
  assert.equal(parsedCus.isUserJid, true);
  assert.equal(parsedCus.isLid, false);
  assert.equal(parsedCus.phone, '201012345678');
});

test('rejects invalid phone strings and non-primitive values', () => {
  for (const bad of ['', '   ', null, undefined, {}, [], '0101234abcd', '12345', '0123', '12345678901234567', '02012345678']) {
    assert.equal(normalizePhoneToE164Digits(bad), '', `Expected empty string for ${JSON.stringify(bad)}`);
  }
});

test('toWhatsappChatId and maskPhone format safely', () => {
  assert.equal(toWhatsappChatId('01012345678'), '201012345678@c.us');
  assert.equal(toWhatsappChatId('198765432109876@lid'), '198765432109876@lid');
  assert.equal(toWhatsappChatId('not-a-phone'), '');

  assert.equal(maskPhone('01012345678'), '********5678');
  assert.equal(maskPhone('201012345678@c.us'), '********5678');
  assert.equal(maskPhone(''), '');
  assert.equal(normalizeArabicDigits('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'), '01234567890123456789');
});

test('resolveSenderPhoneFromMessage handles @c.us directly and resolves @lid via getContact with fail-closed fallback', async () => {
  // Standard @c.us
  assert.equal(
    await resolveSenderPhoneFromMessage({ from: '201012345678@c.us' }),
    '201012345678'
  );

  // @lid with resolvable contact.number
  assert.equal(
    await resolveSenderPhoneFromMessage({
      from: '198765432109876@lid',
      getContact: async () => ({ number: '201099998888', id: { user: '201099998888', server: 'c.us' } }),
    }),
    '201099998888'
  );

  // @lid where contact still points to lid server -> fail closed
  assert.equal(
    await resolveSenderPhoneFromMessage({
      from: '198765432109876@lid',
      getContact: async () => ({ number: '198765432109876', id: { user: '198765432109876', server: 'lid' } }),
    }),
    ''
  );

  // @lid where getContact throws or is absent -> fail closed
  assert.equal(
    await resolveSenderPhoneFromMessage({
      from: '198765432109876@lid',
      getContact: async () => { throw new Error('contact unavailable'); },
    }),
    ''
  );
  assert.equal(
    await resolveSenderPhoneFromMessage({ from: '198765432109876@lid' }),
    ''
  );

  // Group message -> fail closed
  assert.equal(
    await resolveSenderPhoneFromMessage({ from: '120363012345@g.us' }),
    ''
  );
});
