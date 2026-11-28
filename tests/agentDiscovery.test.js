'use strict';

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { agentDiscovery, wantsMarkdown } = require('../server/middleware/agentDiscovery');

const publicDir = path.join(__dirname, '..', 'public');

function startApp() {
  const app = express();
  app.use(agentDiscovery);
  app.use('/.well-known/agent-skills', express.static(path.join(publicDir, '.well-known', 'agent-skills'), { dotfiles: 'allow' }));
  app.get('/', (req, res) => res.type('html').send('<html>home</html>'));
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function get(server, urlPath, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: server.address().port, path: urlPath, method, headers }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('wantsMarkdown honours q-values', () => {
  assert.equal(wantsMarkdown('text/markdown'), true);
  assert.equal(wantsMarkdown('text/markdown, text/html;q=0.5'), true);
  assert.equal(wantsMarkdown('text/html,application/xhtml+xml,*/*;q=0.8'), false);
  assert.equal(wantsMarkdown('text/html, text/markdown;q=0.5'), false);
  assert.equal(wantsMarkdown(''), false);
  assert.equal(wantsMarkdown(undefined), false);
});

test('home page: Link headers always, markdown only when asked', async () => {
  const server = await startApp();
  try {
    const html = await get(server, '/', { Accept: 'text/html' });
    assert.equal(html.status, 200);
    assert.match(html.headers['content-type'], /html/);
    assert.match(html.headers.link, /rel="describedby"/);
    assert.match(html.headers.link, /rel="service-doc"/);
    assert.match(html.headers.vary, /Accept/i);

    const md = await get(server, '/', { Accept: 'text/markdown' });
    assert.equal(md.status, 200);
    assert.match(md.headers['content-type'], /^text\/markdown/);
    assert.ok(Number(md.headers['x-markdown-tokens']) > 50);
    assert.match(md.body, /^# ZainBot/);
    assert.match(md.headers.link, /rel="describedby"/);

    const head = await get(server, '/', { Accept: 'text/markdown' }, 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');

    const other = await get(server, '/missing', { Accept: 'text/markdown' });
    assert.equal(other.headers.link, undefined, 'only the home page gets the discovery header');
  } finally {
    server.close();
  }
});

test('agent skills index is valid and its digest matches the served SKILL.md', async () => {
  const server = await startApp();
  try {
    const indexRes = await get(server, '/.well-known/agent-skills/index.json');
    assert.equal(indexRes.status, 200);
    const index = JSON.parse(indexRes.body);
    assert.equal(index.$schema, 'https://schemas.agentskills.io/discovery/0.2.0/schema.json');
    assert.ok(index.skills.length >= 1);
    for (const skill of index.skills) {
      assert.match(skill.name, /^[a-z0-9-]+$/);
      assert.equal(skill.type, 'skill-md');
      assert.ok(skill.description);
      const urlPath = new URL(skill.url).pathname;
      const served = await get(server, urlPath);
      assert.equal(served.status, 200);
      const digest = `sha256:${crypto.createHash('sha256').update(served.body).digest('hex')}`;
      assert.equal(skill.digest, digest, `${skill.name} digest must match the served file`);
    }
  } finally {
    server.close();
  }
});

test('robots.txt declares content signals and keeps discovery files crawlable', () => {
  const robots = fs.readFileSync(path.join(publicDir, 'robots.txt'), 'utf8');
  assert.match(robots, /^Content-Signal: ai-train=no, search=yes, ai-input=yes$/m);
  assert.match(robots, /^Allow: \/\.well-known\/$/m);
  assert.match(robots, /^Sitemap: https:\/\/zainbot\.com\/sitemap\.xml$/m);
  // the Content-Signal line belongs to the User-agent: * group (no blank line before it)
  const lines = robots.split('\n');
  const idx = lines.findIndex((l) => l.startsWith('Content-Signal:'));
  assert.ok(lines[idx - 1].trim() !== '');
});

test('llms.txt links only to pages that exist in this repo or the sitemap', () => {
  const llms = fs.readFileSync(path.join(publicDir, 'llms.txt'), 'utf8');
  assert.match(llms, /^# ZainBot/);
  assert.ok(fs.existsSync(path.join(publicDir, 'agent', 'home.md')));
  assert.ok(fs.existsSync(path.join(publicDir, 'help.html')));
  assert.ok(fs.existsSync(path.join(publicDir, 'register.html')));
});
