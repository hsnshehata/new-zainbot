const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { normalizeOrigin, resolvePublic, requestJson, importCatalog } = require('../server/services/catalogImportService');
const CatalogConnector = require('../server/models/CatalogConnector');
const Bot = require('../server/models/Bot');
const Store = require('../server/models/Store');
const router = require('../server/routes/catalogConnectors');
const { decryptCredentialSecret, buildCredentialContext } = require('../server/services/AiCredentialCrypto');

const storeId = '507f191e810c19729de860ea';
const config = { origin: 'https://example.com', provider: 'woocommerce', currency: 'USD', storeId };

test('rejects private/mixed DNS, redirects, credential URLs and unexpected origins', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '203.0.113.10']) {
    await assert.rejects(resolvePublic('example.com', async () => [{ address: ip, family: 4 }]), { code: 'UNSAFE_HOST' });
  }
  await assert.rejects(resolvePublic('example.com', async () => [
    { address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 }
  ]), { code: 'UNSAFE_HOST' });
  assert.equal(await resolvePublic('example.com', async () => [{ address: '8.8.8.8', family: 4 }]), '8.8.8.8');
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://127.0.0.1', 'https://example.com:443', 'https://example.com/path']) {
    assert.throws(() => normalizeOrigin(url, 'woocommerce'), { code: 'INVALID_ORIGIN' });
  }
  assert.throws(() => normalizeOrigin('https://example.com', 'shopify'), { code: 'INVALID_ORIGIN' });
  await assert.rejects(requestJson('https://example.com', 'https://evil.com/', {}, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
  }), { code: 'UNSAFE_PAGE' });
});

test('pins public DNS IP to TLS request and refuses HTTP redirect without following it', async () => {
  let requests = 0;
  const response = await requestJson('https://example.com', '/products', {}, {
    lookup: async () => [{ address: '8.8.8.8', family: 4 }],
    transport(url, options, callback) {
      requests++;
      assert.equal(url.hostname, 'example.com');
      options.lookup('example.com', {}, (_error, ip) => assert.equal(ip, '8.8.8.8'));
      const req = new EventEmitter();
      req.end = () => {
        const res = new EventEmitter();
        res.statusCode = 302;
        res.resume = () => {};
        process.nextTick(() => callback(res));
      };
      return req;
    }
  }).then(() => null, error => error);
  assert.equal(response.code, 'REMOTE_REQUEST_FAILED');
  assert.equal(requests, 1);
});

test('imports Woo pages idempotently by source id and leaves manual products alone', async () => {
  const writes = [];
  const model = { async updateOne(filter, update, options) { writes.push({ filter, update, options }); } };
  const request = async (_origin, path, headers) => {
    assert.match(headers.Authorization, /^Basic /);
    if (path.endsWith('page=1')) return { body: [{ id: 12, name: 'Widget', price: '10.50', stock_quantity: 4, status: 'publish' }], headers: { 'x-wp-totalpages': '2' } };
    return { body: [{ id: 13, name: 'Gadget', price: '20', stock_quantity: 0, status: 'draft' }], headers: { 'x-wp-totalpages': '2' } };
  };
  assert.equal(await importCatalog(config, { consumerKey: 'ck_test', consumerSecret: 'cs_test' }, { request, productModel: model }), 2);
  assert.equal(await importCatalog(config, { consumerKey: 'ck_test', consumerSecret: 'cs_test' }, { request, productModel: model }), 2);
  assert.deepEqual(writes[0].filter, { storeId, importSource: 'woocommerce', importSourceId: '12' });
  assert.equal(writes[0].update.$set.price, 10.5);
  assert.equal(writes[0].options.upsert, true);
  assert.equal(writes[1].update.$set.isActive, false);
  assert.deepEqual(writes[0].filter, writes[2].filter);
});

test('an untracked remote inventory is not represented as confirmed out of stock', async () => {
  const writes = [];
  const request = async () => ({ body: [{ id: 22, name: 'Unlimited service', price: '99', stock_quantity: null, manage_stock: false, status: 'publish' }], headers: { 'x-wp-totalpages': '1' } });
  await importCatalog(config, { consumerKey: 'key', consumerSecret: 'secret' }, {
    request, productModel: { async updateOne(_filter, update) { writes.push(update.$set); } }
  });
  assert.equal(writes[0].stockTracked, false);
  assert.equal(writes[0].stock, 0);
});

test('rejects oversized catalog and cross-origin Shopify page before writing anything', async () => {
  const model = { async updateOne() { assert.fail('must not write on failed fetch'); } };
  const shopify = { ...config, origin: 'https://demo.myshopify.com', provider: 'shopify' };
  await assert.rejects(importCatalog(shopify, { token: 'shpat_secret' }, {
    productModel: model,
    request: async () => ({ body: { products: [{ id: 1, title: 'Widget', variants: [{ price: '20' }] }] },
      headers: { link: '<https://evil.com/admin/api/2025-01/products.json?page_info=abc>; rel="next"' } })
  }), { code: 'UNSAFE_PAGE' });
  await assert.rejects(importCatalog(config, { consumerKey: 'key', consumerSecret: 'secret' }, {
    productModel: model,
    request: async () => ({ body: [], headers: { 'x-wp-totalpages': '6' } })
  }), { code: 'CATALOG_LIMIT_EXCEEDED' });
  await assert.rejects(importCatalog(config, { consumerKey: 'key', consumerSecret: 'secret' }, {
    productModel: model,
    request: async () => ({ body: [], headers: { 'x-wp-totalpages': '0' } })
  }), { code: 'EMPTY_CATALOG' });
});

test('configuration encrypts secrets and status never serializes credential fields', async () => {
  const originalFind = CatalogConnector.findOne;
  const originalUpdate = CatalogConnector.findOneAndUpdate;
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY = `base64:${Buffer.alloc(32, 9).toString('base64')}`;
  const botId = '507f191e810c19729de860eb';
  let saved;
  CatalogConnector.findOne = async () => null;
  CatalogConnector.findOneAndUpdate = async (_filter, update) => {
    saved = update.$set;
    return { ...saved, provider: 'shopify' };
  };
  const handler = method => router.stack.find(layer => layer.route?.path === '/bots/:botId/:provider' && layer.route.methods[method]).route.stack[0].handle;
  const invoke = async (fn, body = {}) => {
    const result = { code: 200 };
    const res = { status(code) { result.code = code; return this; }, json(value) { result.body = value; return this; } };
    await fn({ params: { provider: 'shopify' }, body, user: { userId: '507f191e810c19729de860ec' }, catalogBot: { _id: botId, storeId } }, res);
    return result;
  };
  try {
    const response = await invoke(handler('put'), {
      origin: 'https://demo.myshopify.com', currency: 'USD', token: 'shpat_secret_value'
    });
    assert.equal(response.code, 200);
    assert.equal(response.body.configured, true);
    assert.equal(response.body.lastImportedCount, null);
    assert.equal(saved.lastSucceededAt, null);
    assert.doesNotMatch(JSON.stringify(response.body), /shpat_secret_value|secretCiphertext|token/);
    assert.equal(decryptCredentialSecret(saved.token, {
      context: buildCredentialContext(botId, 'catalog-shopify-token')
    }), 'shpat_secret_value');
    CatalogConnector.findOne = async () => ({ ...saved, provider: 'shopify', token: saved.token });
    const status = await invoke(handler('get'));
    assert.equal(status.body.configured, true);
    assert.doesNotMatch(JSON.stringify(status.body), /shpat_secret_value|secretCiphertext|token/);
  } finally {
    CatalogConnector.findOne = originalFind;
    CatalogConnector.findOneAndUpdate = originalUpdate;
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});

test('new owner gets unconfigured GET; first PUT provisions a store, retry reuses it; foreign store is rejected', async () => {
  const originals = {
    botFind: Bot.findOne, botUpdate: Bot.findOneAndUpdate,
    storeFind: Store.findOne, storeUpdate: Store.findOneAndUpdate,
    connectorFind: CatalogConnector.findOne, connectorUpdate: CatalogConnector.findOneAndUpdate,
  };
  const originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY = `base64:${Buffer.alloc(32, 8).toString('base64')}`;
  const botId = '507f191e810c19729de860eb';
  const userId = '507f191e810c19729de860ec';
  const otherId = '507f191e810c19729de860ed';
  const bot = { _id: botId, userId, storeId: undefined };
  const stores = [];
  let creates = 0;
  let connectorWrites = 0;
  Bot.findOne = async filter => filter.userId === userId ? bot : null;
  Bot.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.userId, userId);
    if (bot.storeId) return null;
    bot.storeId = update.$set.storeId;
    return bot;
  };
  Store.findOne = async filter => {
    const found = stores.find(store => filter._id ? String(store._id) === String(filter._id) : String(store.botId) === String(filter.botId));
    if (!found) return null;
    if (found.userId !== userId) return null;
    return found;
  };
  Store.findOneAndUpdate = async (filter, update, options) => {
    assert.equal(filter.userId, userId);
    assert.equal(filter.botId, botId);
    assert.equal(filter.storeLink, `catalog-${botId}`);
    assert.equal(options.upsert, true);
    const existing = stores.find(item => item.storeLink === filter.storeLink);
    if (existing) return existing;
    const created = { _id: storeId, ...update.$setOnInsert };
    stores.push(created);
    creates++;
    return created;
  };
  CatalogConnector.findOne = async () => null;
  CatalogConnector.findOneAndUpdate = async (_filter, update) => {
    connectorWrites++;
    return { ...update.$set, provider: 'shopify' };
  };
  const owner = router.stack.find(layer => layer.name === 'owner').handle;
  assert.ok(router.stack.findIndex(layer => layer.name === 'authenticate') < router.stack.findIndex(layer => layer.name === 'owner'));
  const handler = method => router.stack.find(layer => layer.route?.methods[method] && layer.route.path === '/bots/:botId/:provider').route.stack[0].handle;
  const perform = async (method, subjectId = userId) => {
    const req = {
      method: method.toUpperCase(), params: { botId, provider: 'shopify' }, user: { userId: subjectId },
      auth: { isImpersonating: false },
      body: { origin: 'https://demo.myshopify.com', currency: 'USD', token: 'shpat_test_secret' },
    };
    const outcome = { status: 200 };
    const res = { status(code) { outcome.status = code; return this; }, json(body) { outcome.body = body; return this; } };
    let allowed = false;
    await owner(req, res, () => { allowed = true; });
    if (allowed) await handler(method)(req, res);
    return outcome;
  };
  try {
    assert.deepEqual((await perform('get')).body, { configured: false, state: 'idle' });
    assert.equal(creates, 0);
    assert.equal((await perform('post')).status, 404);
    assert.equal(creates, 0);
    assert.equal((await perform('put')).body.configured, true);
    assert.equal(bot.storeId, storeId);
    assert.equal(stores[0].userId, userId);
    assert.equal(stores[0].botId, botId);
    assert.equal((await perform('put')).status, 200);
    assert.equal(creates, 1);
    assert.equal(connectorWrites, 2);
    // Simulate another request winning the bot compare-and-set during a retry.
    bot.storeId = undefined;
    Bot.findOneAndUpdate = async () => { bot.storeId = storeId; return null; };
    assert.equal((await perform('put')).status, 200);
    assert.equal(creates, 1);
    assert.equal(connectorWrites, 3);
    assert.equal((await perform('put', otherId)).status, 404);
    assert.equal(connectorWrites, 3);

    // A stale or malicious bot.storeId cannot be used to import into somebody else's store.
    bot.storeId = otherId;
    stores.push({ _id: otherId, botId: otherId, userId: otherId });
    assert.equal((await perform('get')).status, 404);
    assert.equal((await perform('put')).status, 404);
    assert.equal(connectorWrites, 3);
  } finally {
    Bot.findOne = originals.botFind;
    Bot.findOneAndUpdate = originals.botUpdate;
    Store.findOne = originals.storeFind;
    Store.findOneAndUpdate = originals.storeUpdate;
    CatalogConnector.findOne = originals.connectorFind;
    CatalogConnector.findOneAndUpdate = originals.connectorUpdate;
    if (originalKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
  }
});

test('live-check flow end to end against a localhost mock (no external network)', async () => {
  const http = require('node:http');
  const { buildProductContext } = require('../server/services/productContext');
  const catalog = [
    { id: 101, name: 'Live Check T-Shirt', price: '49.99', stock_quantity: 7, manage_stock: true, status: 'publish', description: 'soft cotton tee' },
    { id: 102, name: 'Live Check Mug', price: '15', stock_quantity: null, manage_stock: false, status: 'publish', description: 'ceramic mug' },
  ];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== '/wp-json/wc/v3/products') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    const page = Number(url.searchParams.get('page') || '1');
    res.writeHead(200, { 'Content-Type': 'application/json', 'X-WP-TotalPages': '1' });
    res.end(JSON.stringify(page === 1 ? catalog : []));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const port = server.address().port;
    // Same connector fetch shape, but transported over real HTTP to localhost only.
    const request = (_origin, path) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path, timeout: 5000 }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          try {
            resolve({
              body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
              headers: { 'x-wp-totalpages': res.headers['x-wp-totalpages'] },
            });
          } catch (error) { reject(error); }
        });
      }).on('error', reject);
    });
    const stored = [];
    const productModel = {
      async updateOne(filter, update) { stored.push({ filter, doc: update.$set }); },
    };
    const mockConfig = { ...config, origin: 'https://mock.invalid' };
    const importedCount = await importCatalog(
      mockConfig, { consumerKey: 'ck_mock', consumerSecret: 'cs_mock' }, { request, productModel }
    );
    assert.equal(importedCount, 2);
    // Products API shape served from the imported documents.
    const productsApi = {
      products: stored.map((entry, index) => ({
        _id: String(index + 1).padStart(24, '0'), isActive: true, ...entry.doc,
      })),
      total: stored.length,
    };
    assert.ok(productsApi.products.length > 0);
    const firstName = String(productsApi.products[0]?.productName || '');
    assert.match(firstName, /Live Check T-Shirt/);
    // Bot context built from the products API payload includes the product name.
    const context = buildProductContext(productsApi.products, firstName, 'shop');
    assert.match(context, /Live Check T-Shirt/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
