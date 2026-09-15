'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  encryptIdeaField,
  decryptIdeaField,
  encryptIdeaJson,
  decryptIdeaJson,
  IdeaCryptoError,
} = require('../../server/services/ideaDataCrypto');

test('ideaDataCrypto: encrypts and decrypts string correctly', () => {
  const original = 'فكرة تطبيق ذكاء اصطناعي ثوري للمبيعات';
  const encrypted = encryptIdeaField(original);
  assert.ok(encrypted.startsWith('v1:'));
  assert.notEqual(encrypted, original);

  const decrypted = decryptIdeaField(encrypted);
  assert.equal(decrypted, original);
});

test('ideaDataCrypto: encrypts and decrypts JSON correctly', () => {
  const payload = {
    title: 'منصة لوجستية',
    score: 95,
    risks: ['المنافسة', 'تكلفة الاستحواذ'],
  };
  const encrypted = encryptIdeaJson(payload);
  const decrypted = decryptIdeaJson(encrypted);
  assert.deepEqual(decrypted, payload);
});

test('ideaDataCrypto: handles null and empty values', () => {
  assert.equal(encryptIdeaField(null), null);
  assert.equal(decryptIdeaField(null), null);
  assert.equal(encryptIdeaField(''), '');
  assert.equal(decryptIdeaField(''), '');
});

test('ideaDataCrypto: fails closed on corrupted auth tag or ciphertext', () => {
  const encrypted = encryptIdeaField('بيانات حساسة');
  const parts = encrypted.split(':');
  // Tamper with ciphertext
  parts[3] = Buffer.from('corrupted').toString('base64');
  const tampered = parts.join(':');

  assert.throws(
    () => decryptIdeaField(tampered),
    (err) => err instanceof IdeaCryptoError && err.code === 'IDEA_DECRYPT_FAILED'
  );
});
