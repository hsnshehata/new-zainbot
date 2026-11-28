'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
test('pricing grid never overflows: minmax(0,1fr) columns and no scaled card', () => {
  assert.match(css, /\.pricing-grid-5 \{[^}]*minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.pricing-popular \{[^}]*transform: scale/);
});
