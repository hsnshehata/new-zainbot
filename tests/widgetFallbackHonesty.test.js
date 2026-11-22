'use strict';

// tests/widgetFallbackHonesty.test.js
// Landing-demo fallback honesty (2026-11-22): when the live preview API is
// unavailable, the demo used to silently serve canned sample replies as if
// they were live. The fallback bubble must now carry a visible sample label
// in both languages, and the live path must stay unlabeled.
//
// script.js is a browser IIFE without exports, so this is a focused
// source-contract test: it pins the fallback branch behavior and guards
// against a regression that removes the label.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'script.js'), 'utf8');

test('fallback branch labels canned replies as samples in Arabic and English', () => {
  assert.match(src, /رد عينة جاهز: المعاينة الحية غير متاحة الآن/);
  assert.match(src, /Sample reply: the live preview is unavailable right now/);
});

test('the label is appended only on the canned fallback path, not the live path', () => {
  // Live path: appendMessage(liveResult.reply, 'out') without the note.
  const liveIdx = src.indexOf("appendMessage(liveResult.reply, 'out');");
  assert.ok(liveIdx > 0, 'live append call exists');
  // Fallback path: appendMessage(aiResult.response + sampleNote, 'out').
  const fallbackIdx = src.indexOf("appendMessage(aiResult.response + sampleNote, 'out');");
  assert.ok(fallbackIdx > liveIdx, 'labeled fallback follows the live branch');
  const bareFallback = src.indexOf("appendMessage(aiResult.response, 'out');");
  assert.equal(bareFallback, -1, 'unlabeled canned reply must not come back');
});

test('embeddable widget.js stays silent-honest (no canned customer replies)', () => {
  const widget = fs.readFileSync(path.join(__dirname, '..', 'public', 'widget.js'), 'utf8');
  assert.doesNotMatch(widget, /getAIResponse|defaultResponse/, 'embeddable widget must not invent replies');
});
