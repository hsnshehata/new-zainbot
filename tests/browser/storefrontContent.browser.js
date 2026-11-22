'use strict';
// Optional local browser proof: node tests/browser/storefrontContent.browser.js
// In-memory Mongo only; external network blocked; no production jobs.
// Seeds hostile store/product/category/option/URL text and renders every
// storefront layout, asserting the content stays literal text and inert.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'synthetic-browser-fixture-secret-32-bytes';
process.env.CRON_JOBS_ENABLED = 'false';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const puppeteer = require('puppeteer');

const hostile = (tag) => `<img src=x onerror="window.__xss='${tag}'">`;
const NAME = '"><img src=x onerror="window.__xss=\'name\'"> حقيبة';
const DESC = '<svg onload="window.__xss=\'desc\'"></svg> وصف <b>غامق</b>';
const DETAIL = '<img src=x onerror="window.__xss=\'detail\'"> تفاصيل';
const GROUP = 'اللون"><i onclick="window.__xss=\'grp\'">';
const VALUE = 'أحمر"onmouseover="window.__xss=\'val\'"><u>';
const CAT = '<script>window.__xss="cat"</script>قسم';
const STORE_NAME = '<img src=x onerror="window.__xss=\'store\'">متجر';
const JS_URL = 'javascript:window.__xss="url"';
const BAD_IMG = 'x" onerror="window.__xss=\'img\'';
const SAFE_LINK = 'https://example.invalid/page?a=1&b=2';

(async () => {
  let db, server, browser;
  try {
    db = await MongoMemoryServer.create();
    process.env.MONGODB_URI = db.getUri('storefront-content-fixtures');
    await mongoose.connect(process.env.MONGODB_URI);
    const app = require('../../server/server');
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const Store = require('../../server/models/Store');
    const Product = require('../../server/models/Product');
    const Category = require('../../server/models/Category');
    const owner = new mongoose.Types.ObjectId();
    const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="#f1ebe3"/><rect x="145" y="235" width="350" height="280" rx="32" fill="#9b6744"/></svg>');
    const store = await new Store({
      userId: owner, storeName: STORE_NAME, storeLink: 'synthetic-content', templateId: 1,
      storeDescription: DESC, footerText: DETAIL, storeLogoUrl: BAD_IMG,
      address: hostile('addr'), whatsapp: '"><b>0100', mobilePhone: '"><i>011', landline: '"><i>03', email: 'a"><img src=x onerror=window.__xss=1>@x.invalid',
      website: JS_URL, googleMapsLink: JS_URL,
      socialLinks: { facebook: JS_URL, instagram: SAFE_LINK },
      adminConfig: { enableCart: true, landingLayout: 'layout1',
        banner: { enabled: true, imageUrl: BAD_IMG, linkType: 'external', externalUrl: JS_URL },
        extraSection: { enabled: true, label: hostile('extra'), url: JS_URL },
        supportWidget: { enabled: true, chatLink: JS_URL } },
    }).save({ validateBeforeSave: false });
    const category = await new Category({ storeId: store._id, name: CAT }).save({ validateBeforeSave: false });
    const hostileProduct = await new Product({
      storeId: store._id, productName: NAME, price: 750, stock: 12, currency: 'EGP', category: category._id,
      description: DESC, detailedDescription: DETAIL, imageUrl: svg, images: [svg, BAD_IMG, JS_URL],
      optionsEnabled: true, optionGroups: [{ name: GROUP, values: [VALUE, 'أزرق'], required: true }],
    }).save({ validateBeforeSave: false });
    const badImageProduct = await new Product({
      storeId: store._id, productName: 'منتج صورة خطرة', price: 100, stock: 5, currency: 'EGP', imageUrl: BAD_IMG,
    }).save({ validateBeforeSave: false });

    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const evidenceDir = process.env.QA_EVIDENCE_DIR || '/tmp/storefront-evidence';
    fs.mkdirSync(evidenceDir, { recursive: true });
    const results = [];

    async function inertCheck(page, label) {
      assert.equal(await page.evaluate(() => window.__xss), undefined, `${label}: stored content executed`);
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll('*').forEach(el => {
          for (const a of el.attributes) {
            if (/^on/i.test(a.name)) out.push(`${el.tagName}[${a.name}]`);
            if (/^(href|src|data-url|action)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) out.push(`${el.tagName}[${a.name}=javascript]`);
          }
        });
        document.querySelectorAll('script').forEach(s => { if (/__xss/.test(s.textContent)) out.push('SCRIPT'); });
        return out;
      });
      assert.deepEqual(bad, [], `${label}: active markup found`);
    }

    for (const layout of ['layout1', 'layout2', 'layout3']) {
      await Store.updateOne({ _id: store._id }, { $set: { 'adminConfig.landingLayout': layout } });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
      await page.setRequestInterception(true);
      page.on('request', r => (r.url().startsWith(base) || r.url().startsWith('data:')) ? r.continue() : r.abort());
      page.on('dialog', d => d.dismiss());
      const popups = [];
      page.on('popup', p => popups.push(p.url()));
      await page.goto(`${base}/store/synthetic-content/landing`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.product-card');
      await inertCheck(page, `${layout} grid`);
      const text = await page.evaluate(() => document.body.innerText);
      assert.ok(text.includes(NAME), `${layout}: literal product name visible`);
      assert.ok(text.includes('<b>غامق</b>'), `${layout}: literal description tags shown as text`);
      assert.ok(text.includes(CAT), `${layout}: literal category visible`);
      assert.equal(await page.$$eval('a[href*="example.invalid"]', x => x.filter(a => a.href === 'https://example.invalid/page?a=1&b=2').length >= 1), true, `${layout}: safe https social link preserved`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${evidenceDir}/${layout}-grid.png` });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 400));
      await page.screenshot({ path: `${evidenceDir}/${layout}-footer.png` });
      await inertCheck(page, `${layout} footer`);

      // Search keeps literal semantics.
      const search = await page.$('input[type="search"], input[placeholder*="بحث"], .search input');
      if (search) {
        await search.evaluate(x => { x.value = '<img'; x.dispatchEvent(new Event('input', { bubbles: true })); });
        await new Promise(r => setTimeout(r, 600));
        await inertCheck(page, `${layout} search`);
        await search.evaluate(x => { x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); });
      }

      // Product detail by deep link.
      await page.goto(`${base}/store/synthetic-content/landing?product=${hostileProduct._id}`, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.product-detail-backdrop');
      await inertCheck(page, `${layout} detail`);
      const detailText = await page.$eval('.product-detail-backdrop', x => x.innerText);
      const optionTexts = await page.$$eval('.product-detail-backdrop select option', x => x.map(o => o.textContent));
      assert.ok(detailText.includes(NAME), `${layout}: detail name literal`);
      assert.ok(detailText.includes(DETAIL.trim()), `${layout}: detail description literal: ${JSON.stringify(detailText)}`);
      assert.ok(optionTexts.includes(VALUE), `${layout}: option value literal`);
      assert.ok(detailText.includes(GROUP.trim()) || optionTexts.some(o => o.includes(GROUP.trim())), `${layout}: option group literal`);
      await page.screenshot({ path: `${evidenceDir}/${layout}-detail.png` });
      const thumbs = await page.$$('.product-detail-backdrop .thumbs button');
      for (const t of thumbs) await t.evaluate(x => x.click());
      await inertCheck(page, `${layout} thumbs`);

      // Choose option, add to cart, open the cart drawer.
      await page.select('.product-detail-backdrop select', VALUE);
      await page.click('.product-detail-backdrop [data-add]');
      await page.waitForSelector('.fab-cart, .header-classic .icon.cart, [class*=cart]');
      const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)));
      assert.ok(stored.includes(VALUE.length ? encodeURIComponent(JSON.stringify([{ name: GROUP, value: VALUE }])).slice(0, 20) : ''), `${layout}: cart payload keeps raw option data`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => { const b = document.querySelector('.product-detail-backdrop [data-close], .product-detail-backdrop .close'); if (b) b.click(); });
      await page.evaluate(() => { const b = document.querySelector('.fab-cart, .go-cart'); if (!b) throw new Error('no cart opener'); b.click(); });
      await page.waitForSelector('.cart-drawer .cart-item');
      await inertCheck(page, `${layout} cart`);
      const cartText = await page.$eval('.cart-drawer', x => x.innerText);
      assert.ok(cartText.includes(NAME) && cartText.includes(VALUE), `${layout}: cart shows literal name/options`);
      await page.screenshot({ path: `${evidenceDir}/${layout}-cart.png` });
      assert.deepEqual(popups, [], `${layout}: no unexpected popups`);
      results.push(layout);
      await page.close();
    }
    console.log('STOREFRONT_CONTENT_BROWSER_PASS:', results.join(','), 'evidence', evidenceDir);
  } finally {
    if (browser) await browser.close();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect();
    if (db) await db.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
