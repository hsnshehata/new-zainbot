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
  assert.deepEqual(types, ['Organization', 'WebSite', 'SoftwareApplication', 'FAQPage']);
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

test('FAQ section matches FAQPage JSON-LD and has Arabic translations', () => {
  const html = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  const script = fs.readFileSync(path.join(pub, 'js', 'script.js'), 'utf8');
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = data['@graph'].find((n) => n['@type'] === 'FAQPage');
  assert.ok(faq.mainEntity.length >= 5);
  faq.mainEntity.forEach((q, i) => {
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    assert.ok(html.includes(`>${esc(q.name)}</summary>`), `question ${i + 1} visible on page`);
    assert.ok(html.includes(`>${esc(q.acceptedAnswer.text)}</p>`), `answer ${i + 1} visible on page`);
    assert.equal((script.match(new RegExp(`faq_q${i + 1}:`, 'g')) || []).length, 2, 'en and ar');
  });
});
