'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pub = path.join(__dirname, '..', 'public');

test('home page JSON-LD is valid and describes Organization, WebSite, SoftwareApplication', () => {
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  const data = JSON.parse(m[1]);
  const types = data['@graph'].map((n) => n['@type']);
  assert.deepEqual(types, ['Organization', 'WebSite', 'SoftwareApplication']);
  const app = data['@graph'][2];
  assert.ok(app.featureList.length >= 5);
  assert.equal(app.offers.price, '0');
  assert.match(html, /<meta name="description" content="[^"]{80,200}">/);
});

test('sitemap lists public pages only', () => {
  const xml = fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8');
  assert.match(xml, /<loc>https:\/\/zainbot\.com\/help\.html<\/loc>/);
  assert.doesNotMatch(xml, /\/dashboard</);
});

test('llms.txt says who it is for', () => {
  assert.match(fs.readFileSync(path.join(pub, 'llms.txt'), 'utf8'), /## Who it is for/);
});
