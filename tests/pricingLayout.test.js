'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
test('pricing: 3 columns, all five plans still present with unchanged prices', () => {
  assert.match(html, /pricing-grid-3/);
  for (const [plan, price] of [['free', '0'], ['growth_1k', '199'], ['growth_10k', '499'], ['growth_50k', '999'], ['unlimited', '4999']]) {
    assert.match(html, new RegExp(`data-plan="${plan}"[^]*?data-monthly="${price}"`));
    assert.match(html, new RegExp(`/register\\?plan=${plan}"`));
  }
  assert.equal((html.match(/data-tier="/g) || []).length, 3);
});
