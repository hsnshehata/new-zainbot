'use strict';
// Optional local browser proof: node tests/browser/chatLinks.browser.js
// In-memory Mongo only. All AI responses are stubbed in the browser.
// External network requests are blocked, and no production startup/jobs run.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'synthetic-browser-fixture-secret-32-bytes';
process.env.CRON_JOBS_ENABLED = 'false';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const puppeteer = require('puppeteer');

(async () => {
  let db, server, browser;
  try {
    db = await MongoMemoryServer.create();
    process.env.MONGODB_URI = db.getUri('chat-link-browser-fixtures');
    await mongoose.connect(process.env.MONGODB_URI);
    const app = require('../../server/server');
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    process.env.APP_URL = base;
    const Store = require('../../server/models/Store');
    const Product = require('../../server/models/Product');
    const Bot = require('../../server/models/Bot');
    const ChatPage = require('../../server/models/ChatPage');
    const { buildProductContext, buildStorefrontUrl } = require('../../server/services/productContext');
    const owner = new mongoose.Types.ObjectId();
    const store = await Store.create({ userId: owner, storeName: 'متجر تجربة الروابط', storeLink: 'synthetic-link-store', templateId: 1, adminConfig: { enableCart: true, landingLayout: 'layout1' } });
    const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640"><rect width="640" height="640" fill="#f1ebe3"/><path d="M230 250V185a90 90 0 01180 0v65" fill="none" stroke="#51321f" stroke-width="22"/><rect x="145" y="235" width="350" height="280" rx="32" fill="#9b6744"/><path d="M170 285h300" stroke="#bc916d" stroke-width="5"/><circle cx="320" cy="350" r="14" fill="#ddc3a5"/></svg>');
    const product = await Product.create({ storeId: store._id, productName: 'حقيبة تجربة الروابط', price: 750, stock: 12, description: 'منتج اصطناعي لاختبار الرابط فقط', imageUrl: image, currency: 'EGP' });
    const bot = await Bot.create({ userId: owner, name: 'Synthetic link bot', storeId: store._id });
    await ChatPage.create({ userId: owner, botId: bot._id, linkId: 'syntheticlinkchat', title: 'تجربة محلية لروابط المنتجات' });
    const context = buildProductContext([product.toObject()], 'حقيبة', store.storeLink);
    const productLine = context.split('\n').find(line => line.startsWith('المنتج:'));
    const expected = buildStorefrontUrl(store.storeLink, String(product._id));
    let reply = productLine;
    let aiRequests = 0;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    async function intercept(target) {
      await target.setRequestInterception(true);
      target.on('request', request => {
        if (request.url().startsWith(base + '/api/bot') && request.method() === 'POST') {
          aiRequests++;
          return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply }) });
        }
        if (request.url().startsWith(base) || request.url().startsWith('data:')) return request.continue();
        return request.abort();
      });
    }
    await intercept(page);
    await page.goto(base + '/chat/syntheticlinkchat', { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.getElementById('chatTitle').textContent.includes('تجربة محلية'));
    await page.type('#messageInput', 'بكام الحقيبة؟');
    await page.click('#sendMessageBtn');
    await page.waitForSelector('.bot-message a.link-button');
    assert.equal(await page.$eval('.bot-message a.link-button', x => x.href), expected);
    assert.equal(await page.$eval('.bot-message a.link-button', x => x.rel), 'noopener noreferrer');
    const evidenceDir = process.env.QA_EVIDENCE_DIR || '/tmp';
    fs.mkdirSync(evidenceDir, { recursive: true });
    await page.waitForFunction(() => [...document.querySelectorAll('.message')].every(x => getComputedStyle(x).opacity === '1'));
    await page.screenshot({ path: evidenceDir + '/chat-link-rendered.png', fullPage: true });

    // Open the actual rendered link against the same seeded Express app.
    const productPage = await browser.newPage();
    await productPage.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await intercept(productPage);
    await productPage.goto(await page.$eval('.bot-message a.link-button', x => x.href), { waitUntil: 'networkidle0' });
    await productPage.waitForSelector('.product-detail-backdrop');
    assert.ok((await productPage.$eval('.product-detail-backdrop', x => x.innerText)).includes(product.productName));
    assert.equal(new URL(productPage.url()).searchParams.get('product'), String(product._id));
    await productPage.waitForFunction(() => [...document.images].filter(x => x.closest('.product-detail-backdrop')).every(x => x.complete && x.naturalWidth > 0));
    await productPage.screenshot({ path: evidenceDir + '/chat-link-product-destination.png', fullPage: true });

    await page.bringToFront();
    console.log('Browser destination verified; testing unsafe markup');
    // HTML and quoted attributes must stay text, never active DOM.
    reply = '<img src=x onerror="window.syntheticXss=1"> <svg onload="window.syntheticXss=2"></svg> https://example.invalid/\" onclick=\"window.syntheticXss=3\"';
    await page.$eval('#messageInput', x => { x.value = 'اختبار نص غير موثوق'; });
    await page.click('#sendMessageBtn');
    await page.waitForFunction(() => [...document.querySelectorAll('.bot-message')].some(x => x.textContent.includes('syntheticXss')));
    assert.equal(await page.evaluate(() => window.syntheticXss), undefined);
    assert.equal(await page.$$eval('.bot-message img, .bot-message svg, .bot-message [onclick]', x => x.length), 0);
    assert.equal(aiRequests, 2);
    console.log('CHAT_LINK_BROWSER_PASS: origin, supported deep link, Arabic punctuation, rendered destination, safe markup; AI responses locally stubbed.');
    console.log('EVIDENCE', evidenceDir + '/chat-link-rendered.png', evidenceDir + '/chat-link-product-destination.png');
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect();
    if (db) await db.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
