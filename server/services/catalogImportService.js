const dns = require('dns').promises;
const https = require('https');
const net = require('net');
const Product = require('../models/Product');
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

function nextShopifyPage(link, origin) {
  if (!link) return null;
  const match = link.split(',').find(part => /;\s*rel="next"\s*$/i.test(part.trim()));
  if (!match) return null;
  const raw = /^\s*<([^>]+)>/.exec(match)?.[1];
  if (!raw) throw connectorError('REMOTE_INVALID_RESPONSE');
  let url;
  try { url = new URL(raw, origin); } catch { throw connectorError('UNSAFE_PAGE'); }
  if (url.origin !== origin || url.pathname !== SHOPIFY_PRODUCTS_PATH ||
      !url.searchParams.get('page_info') || url.searchParams.size > 2 ||
      [...url.searchParams.keys()].some(key => !['page_info', 'limit'].includes(key)) ||
      (url.searchParams.has('limit') && url.searchParams.get('limit') !== '100')) throw connectorError('UNSAFE_PAGE');
  return url.pathname + url.search;
}

async function fetchCatalog(config, credentials, request = requestJson) {
  const items = [];
  let path = config.provider === 'shopify'
    ? `${SHOPIFY_PRODUCTS_PATH}?limit=100`
    : '/wp-json/wc/v3/products?per_page=100&page=1';
  const headers = config.provider === 'shopify'
    ? { 'X-Shopify-Access-Token': credentials.token, Accept: 'application/json' }
    : { Authorization: `Basic ${Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64')}`, Accept: 'application/json' };
  for (let page = 1; page <= 5; page++) {
    const response = await request(config.origin, path, headers);
    const batch = config.provider === 'shopify' ? response.body?.products : response.body;
    if (!Array.isArray(batch) || batch.length > 100) throw connectorError('REMOTE_INVALID_RESPONSE');
    items.push(...batch);
    if (config.provider === 'shopify') {
      path = nextShopifyPage(response.headers.link, config.origin);
    } else {
      const pages = Number(response.headers['x-wp-totalpages']);
      if (!Number.isInteger(pages) || pages < 0) throw connectorError('REMOTE_INVALID_RESPONSE');
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
  if (!/^\d+$/.test(id) || !name || typeof name !== 'string' ||
      variant?.price == null || String(variant.price).trim() === '' ||
      !Number.isFinite(price) || price < 0) throw connectorError('REMOTE_INVALID_PRODUCT');
  return {
    importSource: provider, importSourceId: id,
    productName: name.trim().length < 3 ? `Item ${name.trim()}` : name.trim().slice(0, 100),
    description: String(provider === 'shopify' ? item.body_html || '' : item.description || '').replace(/<[^>]*>/g, '').slice(0, 3000),
    price, stock: stockTracked && Number.isFinite(Number(stockValue)) ? Math.max(0, Math.floor(Number(stockValue))) : 0,
    stockTracked,
    currency,
    isActive: provider === 'shopify' ? item.status === 'active' : item.status === 'publish',
  };
}

async function importCatalog(config, credentials, { request = requestJson, productModel = Product } = {}) {
  const items = await fetchCatalog(config, credentials, request);
  const mapped = items.map(item => mapProduct(item, config.provider, config.currency));
  if (!mapped.length) throw connectorError('EMPTY_CATALOG');
  if (new Set(mapped.map(item => item.importSourceId)).size !== mapped.length) throw connectorError('REMOTE_INVALID_RESPONSE');
  for (const product of mapped) {
    await productModel.updateOne(
      { storeId: config.storeId, importSource: config.provider, importSourceId: product.importSourceId },
      { $set: product, $setOnInsert: { storeId: config.storeId } },
      { upsert: true, runValidators: true }
    );
  }
  return mapped.length;
}

module.exports = { normalizeOrigin, resolvePublic, requestJson, fetchCatalog, importCatalog, connectorError };
