const dns = require('dns').promises;
const https = require('https');
const net = require('net');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { catalogWriteFence } = require('./catalogLease');
const { beginCatalogTransition } = require('./catalogTransition');
const SHOPIFY_PRODUCTS_PATH = '/admin/api/2026-07/products.json';

const blocked = new net.BlockList();
for (const [base, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10],
  ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(base, bits);

function connectorError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeOrigin(input, provider) {
  if (typeof input !== 'string' || input.length > 255) throw connectorError('INVALID_ORIGIN');
  let url;
  try { url = new URL(input); } catch { throw connectorError('INVALID_ORIGIN'); }
  const authority = /^https:\/\/([^/?#]+)/i.exec(input)?.[1] || '';
  if (url.protocol !== 'https:' || /:\d+$/.test(authority) || url.port || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || !/^[a-z0-9.-]+$/i.test(url.hostname) ||
      !url.hostname.includes('.') || net.isIP(url.hostname) || url.hostname.endsWith('.')) {
    throw connectorError('INVALID_ORIGIN');
  }
  if (provider === 'shopify' && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(url.hostname)) {
    throw connectorError('INVALID_ORIGIN');
  }
  return url.origin;
}

async function resolvePublic(hostname, lookup = dns.lookup) {
  let addresses;
  try { addresses = await lookup(hostname, { all: true, verbatim: true }); }
  catch { throw connectorError('UNSAFE_HOST'); }
  // IPv6-only or mixed addresses are deliberately unsupported: never fall back to a private address.
  if (!addresses?.length || addresses.some(({ address, family }) => family !== 4 ||
      !net.isIPv4(address) || blocked.check(address))) throw connectorError('UNSAFE_HOST');
  return addresses[0].address;
}

async function requestJson(origin, path, headers, { lookup = dns.lookup, transport = https.request } = {}) {
  const base = new URL(origin);
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.protocol !== 'https:') throw connectorError('UNSAFE_PAGE');
  const address = await resolvePublic(base.hostname, lookup);
  return new Promise((resolve, reject) => {
    const req = transport(url, {
      method: 'GET', headers, timeout: 8000, agent: false,
      lookup: (_hostname, _options, cb) => cb(null, address, 4),
    }, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(connectorError(res.statusCode === 401 || res.statusCode === 403 ? 'REMOTE_AUTH_FAILED' : 'REMOTE_REQUEST_FAILED'));
      }
      let size = 0;
      const chunks = [];
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2_000_000) { req.destroy(connectorError('REMOTE_RESPONSE_TOO_LARGE')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        try { resolve({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')), headers: res.headers }); }
        catch { reject(connectorError('REMOTE_INVALID_RESPONSE')); }
      });
    });
    req.on('timeout', () => req.destroy(connectorError('REMOTE_TIMEOUT')));
    req.on('error', error => reject(error.code?.startsWith('REMOTE_') ? error : connectorError('REMOTE_REQUEST_FAILED')));
    req.end();
  });
}

function nextShopifyPage(link, origin, page = 1) {
  if (link == null || link === '') {
    if (page > 1) throw connectorError('REMOTE_INVALID_RESPONSE');
    return null;
  }
  if (typeof link !== 'string' || link.length > 10000) throw connectorError('REMOTE_INVALID_RESPONSE');
  let next = null; const seen = new Set();
  for (const part of link.split(',')) {
    const match = /^\s*<([^>]+)>;\s*rel="(next|previous)"\s*$/i.exec(part);
    if (!match || seen.has(match[2].toLowerCase())) throw connectorError('REMOTE_INVALID_RESPONSE');
    const rel = match[2].toLowerCase(); seen.add(rel);
    let url; try { url = new URL(match[1], origin); } catch { throw connectorError('UNSAFE_PAGE'); }
    if (url.username || url.password || url.hash || url.origin !== origin || url.pathname !== SHOPIFY_PRODUCTS_PATH || !url.searchParams.get('page_info') ||
        url.searchParams.getAll('page_info').length !== 1 || url.searchParams.getAll('limit').length > 1 ||
        url.searchParams.size > 2 || [...url.searchParams.keys()].some(key => !['page_info','limit'].includes(key)) ||
        (url.searchParams.has('limit') && url.searchParams.get('limit') !== '100')) throw connectorError('UNSAFE_PAGE');
    if (rel === 'next') next = url.pathname + url.search;
  }
  if ((page === 1 && seen.has('previous')) || (page > 1 && !seen.has('previous'))) throw connectorError('REMOTE_INVALID_RESPONSE');
  return next;
}

async function fetchCatalog(config, credentials, request = requestJson) {
  const items = [];
  let declaredPages = null; const visited = new Set();
  let path = config.provider === 'shopify'
    ? `${SHOPIFY_PRODUCTS_PATH}?limit=100`
    : '/wp-json/wc/v3/products?per_page=100&page=1';
  const headers = config.provider === 'shopify'
    ? { 'X-Shopify-Access-Token': credentials.token, Accept: 'application/json' }
    : { Authorization: `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')}`, Accept: 'application/json' };
  for (let page = 1; page <= 5; page++) {
    if (visited.has(path)) throw connectorError('REMOTE_INVALID_RESPONSE');
    visited.add(path);
    const response = await request(config.origin, path, headers);
    const batch = config.provider === 'shopify' ? response.body?.products : response.body;
    if (!Array.isArray(batch) || batch.length > 100) throw connectorError('REMOTE_INVALID_RESPONSE');
    items.push(...batch);
    if (config.provider === 'shopify') {
      path = nextShopifyPage(response.headers.link, config.origin, page);
      if ((path || page > 1) && batch.length === 0) throw connectorError('REMOTE_INVALID_RESPONSE');
    } else {
      const rawPages = response.headers['x-wp-totalpages'];
      if (!/^(0|[1-9]\d*)$/.test(String(rawPages))) throw connectorError('REMOTE_INVALID_RESPONSE');
      const pages = Number(rawPages);
      if (Number.isSafeInteger(pages) && pages > 5) throw connectorError('CATALOG_LIMIT_EXCEEDED');
      if (!Number.isSafeInteger(pages) || (declaredPages !== null && pages !== declaredPages) ||
          (pages === 0 && (page !== 1 || batch.length !== 0)) || (pages > 0 && (page > pages || !batch.length))) throw connectorError('REMOTE_INVALID_RESPONSE');
      declaredPages = pages;
      path = page < pages ? `/wp-json/wc/v3/products?per_page=100&page=${page + 1}` : null;
    }
    if (!path) return items;
  }
  throw connectorError('CATALOG_LIMIT_EXCEEDED');
}

function mapProduct(item, provider, currency) {
  const id = String(item?.id || '');
  const variant = provider === 'shopify' ? item?.variants?.[0] : item;
  const name = provider === 'shopify' ? item?.title : item?.name;
  const price = Number(variant?.price);
  const stockValue = provider === 'shopify' ? variant?.inventory_quantity : item?.stock_quantity;
  const stockTracked = stockValue != null && (provider === 'shopify'
    ? variant?.inventory_management !== null : item?.manage_stock !== false);
  if (stockTracked && (String(stockValue).trim() === '' || !Number.isFinite(Number(stockValue)) || !Number.isSafeInteger(Math.floor(Number(stockValue))))) throw connectorError('REMOTE_INVALID_PRODUCT');
  if (!/^\d+$/.test(id) || !name || typeof name !== 'string' ||
      variant?.price == null || String(variant.price).trim() === '' ||
      !Number.isFinite(price) || price < 0) throw connectorError('REMOTE_INVALID_PRODUCT');
  return {
    importSource: provider, importSourceId: id,
    remoteVariantId: provider === 'shopify' ? String(variant?.id || '') : '',
    productName: name.trim().length < 3 ? `Item ${name.trim()}` : name.trim().slice(0, 100),
    description: String(provider === 'shopify' ? item.body_html || '' : item.description || '').replace(/<[^>]*>/g, '').slice(0, 3000),
    price, stock: stockTracked && Number.isFinite(Number(stockValue)) ? Math.max(0, Math.floor(Number(stockValue))) : 0,
    stockTracked,
    currency,
    isActive: provider === 'shopify' ? item.status === 'active' : item.status === 'publish',
  };
}

function sourceKey(config, product) {
  return JSON.stringify([String(config._id || config.botId || ''), config.origin, config.provider, product.importSourceId, product.remoteVariantId]);
}

// A generation-zero seed has never been published by this protocol. It may
// remain after a worker loses its lease during the inert upsert. Only this
// exact zero-liability state can be rebound, never a known product balance.
function isUnpublishedSeed(product) {
  return Boolean(product?.catalogInventory?.sourceKey &&
    product.catalogInventory.syncGeneration === 0 && product.catalogInventory.localAllocated === 0 &&
    product.isActive === false && product.stock === 0 && product.salesCount === 0 &&
    Array.isArray(product.reservations) && product.reservations.length === 0 &&
    Array.isArray(product.restorations) && product.restorations.length === 0);
}
async function assertRecoverableSeed(product, orderModel) {
  if (!isUnpublishedSeed(product) || await orderModel.exists({ 'products.productId': product._id })) {
    throw connectorError('CATALOG_SOURCE_CHANGED');
  }
}
async function bindUnpublishedSeed(config, product, key, remoteQuantity,
  { productModel, orderModel, isCurrent, writeFence }) {
  if (!product.catalogInventory?.sourceKey) throw connectorError('CATALOG_RECONCILIATION_REQUIRED');
  if (product.catalogInventory.sourceKey === key) {
    if (product.catalogInventory.syncGeneration === 0) await assertRecoverableSeed(product, orderModel);
    return;
  }
  await assertRecoverableSeed(product, orderModel);
  if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
  const result = await productModel.updateOne({ _id: product._id, storeId: config.storeId,
    importSource: config.provider, importSourceId: product.importSourceId,
    'catalogInventory.sourceKey': product.catalogInventory.sourceKey,
    'catalogInventory.syncGeneration': 0, 'catalogInventory.localAllocated': 0,
    isActive: false, stock: 0, salesCount: 0, reservations: { $size: 0 }, restorations: { $size: 0 },
    updatedAt: product.updatedAt, ...writeFence,
  }, { $set: { 'catalogInventory.sourceKey': key, 'catalogInventory.remoteQuantity': remoteQuantity,
    updatedAt: new Date() } });
  if (!result.matchedCount) {
    const latest = await productModel.findOne({ _id: product._id });
    if (latest?.catalogInventory?.sourceKey === key) return;
    if (!await productModel.findOne({ _id: product._id, ...writeFence })) throw connectorError('STALE_CATALOG_SYNC');
    throw connectorError('CATALOG_SOURCE_CHANGED');
  }
}

async function importCatalog(config, credentials, { request = requestJson, productModel = Product, orderModel = Order, isCurrent = async () => true } = {}) {
  const writeFence = catalogWriteFence(config);
  const generation = Number(config.syncGeneration);
  if (!Number.isSafeInteger(generation) || generation < 1) throw connectorError('INVALID_SYNC_GENERATION');
  const items = await fetchCatalog(config, credentials, request);
  const mapped = items.map(item => mapProduct(item, config.provider, config.currency));
  if (new Set(mapped.map(item => item.importSourceId)).size !== mapped.length) throw connectorError('REMOTE_INVALID_RESPONSE');
  // Validate all historical/source bindings before any write in this batch.
  for (const product of mapped) {
    const existing = await productModel.findOne({ storeId: config.storeId, importSource: config.provider, importSourceId: product.importSourceId });
    if (existing && !existing.catalogInventory?.sourceKey) throw connectorError('CATALOG_RECONCILIATION_REQUIRED');
    if (existing && existing.catalogInventory.sourceKey !== sourceKey(config, product)) await assertRecoverableSeed(existing, orderModel);
  }
  await beginCatalogTransition(config);
  for (const mappedProduct of mapped) {
    if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
    const { remoteVariantId, ...product } = mappedProduct;
    const key = sourceKey(config, mappedProduct);
    const filter = { storeId: config.storeId, importSource: config.provider, importSourceId: product.importSourceId };
    try {
      await productModel.updateOne(filter, { $setOnInsert: {
        ...product, stock: 0, isActive: false, storeId: config.storeId,
        catalogInventory: { sourceKey: key, remoteQuantity: product.stock, localAllocated: 0, syncGeneration: 0 },
      } }, { upsert: true, runValidators: true });
    } catch (error) { if (error.code !== 11000) throw error; }
    if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
    const seed = await productModel.findOne(filter);
    if (seed) await bindUnpublishedSeed(config, seed, key, product.stock, { productModel, orderModel, isCurrent, writeFence });
    // Single-product atomic update: reserve/release can race a sync without
    // losing their allocation. An older lease can never overwrite a newer one.
    const set = Object.fromEntries(Object.entries(product).map(([k,v]) => [k, { $literal: v }]));
    set.stock = product.stockTracked
      ? { $max: [0, { $subtract: [product.stock, '$catalogInventory.localAllocated'] }] } : 0;
    set['catalogInventory.remoteQuantity'] = product.stock;
    set['catalogInventory.syncGeneration'] = generation;
    set.updatedAt = '$$NOW';
    const result = await productModel.updateOne({ ...filter, ...writeFence,
      'catalogInventory.sourceKey': key, 'catalogInventory.syncGeneration': { $lt: generation },
    }, [{ $set: set }]);
    if (!result.matchedCount) {
      const latest = await productModel.findOne(filter);
      if (!latest?.catalogInventory?.sourceKey) throw connectorError('CATALOG_RECONCILIATION_REQUIRED');
      if (latest.catalogInventory.sourceKey !== key) throw connectorError('CATALOG_SOURCE_CHANGED');
      if (latest.catalogInventory.syncGeneration !== generation) throw connectorError('STALE_CATALOG_SYNC');
    }
  }
  if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
  // fetchCatalog returns only after every bounded page succeeded. A failed,
  // truncated or invalid fetch never reaches missing-row reconciliation.
  if (typeof productModel.updateMany === 'function') {
    const prefix = JSON.stringify([String(config._id || config.botId || ''), config.origin, config.provider]).slice(0, -1) + ',';
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await productModel.updateMany({ storeId: config.storeId, importSource: config.provider,
      importSourceId: { $nin: mapped.map(p => p.importSourceId) },
      'catalogInventory.sourceKey': { $regex: '^' + escaped },
      'catalogInventory.syncGeneration': { $lt: generation }, ...writeFence,
    }, { $set: { isActive: false, stockTracked: false, stock: 0,
      'catalogInventory.remoteQuantity': 0, 'catalogInventory.syncGeneration': generation } });
  }
  if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
  return mapped.length;
}

module.exports = { normalizeOrigin, resolvePublic, requestJson, fetchCatalog, mapProduct, sourceKey, importCatalog, connectorError };
