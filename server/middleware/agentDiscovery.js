'use strict';

// Agent discovery for the home page: Link headers (RFC 8288) and
// Accept: text/markdown content negotiation. Static files only, no new data.

const fs = require('fs');
const path = require('path');

const MARKDOWN_FILE = path.join(__dirname, '../../public/agent/home.md');

const HOME_LINK_HEADER = [
  '</llms.txt>; rel="service-doc"; type="text/plain"',
  '</.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
  '</sitemap.xml>; rel="sitemap"; type="application/xml"',
].join(', ');

function wantsMarkdown(acceptHeader) {
  if (!acceptHeader) return false;
  let markdownQ = 0;
  let htmlQ = 0;
  for (const part of String(acceptHeader).split(',')) {
    const [type, ...params] = part.trim().toLowerCase().split(';');
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    const weight = Number.isFinite(q) ? q : 1;
    if (type === 'text/markdown') markdownQ = Math.max(markdownQ, weight);
    else if (type === 'text/html' || type === 'application/xhtml+xml') htmlQ = Math.max(htmlQ, weight);
  }
  return markdownQ > 0 && markdownQ >= htmlQ;
}

function agentDiscovery(req, res, next) {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || (req.path !== '/' && req.path !== '/index.html')) {
    return next();
  }
  res.append('Link', HOME_LINK_HEADER);
  res.vary('Accept');
  if (!wantsMarkdown(req.headers.accept)) return next();

  fs.readFile(MARKDOWN_FILE, 'utf8', (err, markdown) => {
    if (err) return next();
    res.status(200);
    res.set('Content-Type', 'text/markdown; charset=utf-8');
    res.set('x-markdown-tokens', String(Math.ceil(markdown.length / 4)));
    res.set('Cache-Control', 'public, max-age=3600');
    return res.send(req.method === 'HEAD' ? undefined : markdown);
  });
  return undefined;
}

module.exports = { agentDiscovery, wantsMarkdown, HOME_LINK_HEADER };
