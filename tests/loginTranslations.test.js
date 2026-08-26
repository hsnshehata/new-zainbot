const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const loginHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'login.html'), 'utf8').replace(/\r\n/g, '\n');

function loginCopyKeys(language) {
  const start = loginHtml.indexOf(`        ${language}: {`);
  const end = loginHtml.indexOf(language === 'ar' ? '\n        },\n        en: {' : '\n        }\n      };', start);
  assert.notEqual(start, -1, `Missing ${language} login translations`);
  assert.notEqual(end, -1, `Could not delimit ${language} login translations`);
  return new Set([...loginHtml.slice(start, end).matchAll(/\b([a-z][a-z0-9_]*):/g)].map((match) => match[1]));
}

function keysFor(attribute) {
  const pattern = new RegExp(`${attribute}="([a-z][a-z0-9_]*)"`, 'g');
  return new Set([...loginHtml.matchAll(pattern)].map((match) => match[1]));
}

const registerHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'register.html'), 'utf8').replace(/\r\n/g, '\n');

function registerCopyKeys(language) {
  const start = registerHtml.indexOf(`        ${language}: {`);
  const end = registerHtml.indexOf(language === 'ar' ? '\n        },\n        en: {' : '\n        }\n      };', start);
  assert.notEqual(start, -1, `Missing ${language} register translations`);
  assert.notEqual(end, -1, `Could not delimit ${language} register translations`);
  return new Set([...registerHtml.slice(start, end).matchAll(/\b([a-z][a-z0-9_]*):/g)].map((match) => match[1]));
}

function registerKeysFor(attribute) {
  const pattern = new RegExp(`${attribute}="([a-z][a-z0-9_]*)"`, 'g');
  return new Set([...registerHtml.matchAll(pattern)].map((match) => match[1]));
}

test('login interface keys exist in Arabic and English', () => {
  const arabic = loginCopyKeys('ar');
  const english = loginCopyKeys('en');
  const keys = new Set([
    ...keysFor('data-login-i18n'),
    ...keysFor('data-login-placeholder'),
    ...keysFor('data-login-aria'),
  ]);
  assert.deepEqual([...keys].filter((key) => !arabic.has(key)), []);
  assert.deepEqual([...keys].filter((key) => !english.has(key)), []);
});

test('register interface keys exist in Arabic and English', () => {
  const arabic = registerCopyKeys('ar');
  const english = registerCopyKeys('en');
  const keys = new Set([
    ...registerKeysFor('data-register-i18n'),
    ...registerKeysFor('data-register-placeholder'),
    ...registerKeysFor('data-register-aria'),
  ]);
  assert.deepEqual([...keys].filter((key) => !arabic.has(key)), []);
  assert.deepEqual([...keys].filter((key) => !english.has(key)), []);
});
