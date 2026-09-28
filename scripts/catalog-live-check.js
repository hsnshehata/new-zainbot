'use strict';

/*
 * Real-store catalog verification (manual, env-gated).
 *
 * Flow: configure connector via API -> run sync -> assert importedCount > 0 ->
 * fetch products via products API -> assert bot context includes a product name.
 *
 * Secrets come ONLY from environment variables and are NEVER logged.
 * When no store credentials are present the script exits 0 with an honest SKIP.
 *
 * Required (non-secret) env:
 *   CATALOG_LIVE_BASE_URL   e.g. https://app.example.com (no trailing path needed)
 *   CATALOG_LIVE_JWT        test user JWT (Authorization: Bearer)
 *   CATALOG_LIVE_BOT_ID     bot id owning the connector
 *
 * Optional:
 *   CATALOG_LIVE_PROVIDER   shopify | woocommerce (auto-detected when unset)
 *   CATALOG_LIVE_CURRENCY   EGP | USD | SAR (default USD)
 *
 * Provider credentials (at least one set required, else SKIP):
 *   SHOPIFY_TEST_ORIGIN + SHOPIFY_TEST_TOKEN
 *   WOO_TEST_ORIGIN + WOO_TEST_KEY + WOO_TEST_SECRET
 *
 * Exit codes: 0 = PASS or SKIP, 1 = FAIL.
 */

const { buildProductContext } = require('../server/services/productContext');

function maskError(error) {
  // Never include upstream bodies/URLs/tokens: surface only a safe code fragment.
  const message = String((error && error.message) || error || 'UNKNOWN');
  return message.slice(0, 160);
}

function hostOf(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return '(invalid-origin)';
  }
}

function detectProvider(env) {
  const explicit = String(env.CATALOG_LIVE_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'shopify' || explicit === 'woocommerce' || explicit === 'woo') {
    return explicit === 'woo' ? 'woocommerce' : explicit;
  }
  const hasShopify = Boolean(env.SHOPIFY_TEST_ORIGIN && env.SHOPIFY_TEST_TOKEN);
  const hasWoo = Boolean(env.WOO_TEST_ORIGIN && env.WOO_TEST_KEY && env.WOO_TEST_SECRET);
  if (hasShopify && !hasWoo) return 'shopify';
  if (hasWoo && !hasShopify) return 'woocommerce';
  if (hasShopify && hasWoo) return explicit === 'shopify' ? 'shopify' : 'woocommerce';
  return null;
}

async function apiJson(url, { method = 'GET', jwt, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(url, {
    method,
    headers,
    body: payload,
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

function safeStatusDescription(status, data) {
  // Only log numeric status + safe error code strings from our own API contract.
  const code = data && typeof data.error === 'string' ? data.error.slice(0, 48) : null;
  const state = data && typeof data.state === 'string' ? data.state.slice(0, 24) : null;
  return { status, code, state };
}

async function main() {
  const env = process.env;
  const provider = detectProvider(env);

  if (!provider) {
    console.log(
      'SKIP catalog-live-check: no store credentials in env ' +
        '(need SHOPIFY_TEST_ORIGIN+SHOPIFY_TEST_TOKEN or WOO_TEST_ORIGIN+WOO_TEST_KEY+WOO_TEST_SECRET).'
    );
    process.exit(0);
  }

  const baseUrl = String(env.CATALOG_LIVE_BASE_URL || '').trim().replace(/\/+$/, '');
  const jwt = String(env.CATALOG_LIVE_JWT || '').trim();
  const botId = String(env.CATALOG_LIVE_BOT_ID || '').trim();
  const currency = String(env.CATALOG_LIVE_CURRENCY || 'USD').trim().toUpperCase();

  const missing = [];
  if (!baseUrl) missing.push('CATALOG_LIVE_BASE_URL');
  if (!jwt) missing.push('CATALOG_LIVE_JWT');
  if (!botId) missing.push('CATALOG_LIVE_BOT_ID');
  if (!['EGP', 'USD', 'SAR'].includes(currency)) {
    console.error('FAIL catalog-live-check: CATALOG_LIVE_CURRENCY must be one of EGP|USD|SAR.');
    process.exit(1);
  }

  let origin;
  let configureBody;
  if (provider === 'shopify') {
    origin = String(env.SHOPIFY_TEST_ORIGIN || '').trim();
    const token = String(env.SHOPIFY_TEST_TOKEN || '');
    if (!origin || !token) missing.push('SHOPIFY_TEST_ORIGIN/SHOPIFY_TEST_TOKEN');
    else configureBody = { origin, currency, token };
  } else {
    origin = String(env.WOO_TEST_ORIGIN || '').trim();
    const consumerKey = String(env.WOO_TEST_KEY || '');
    const consumerSecret = String(env.WOO_TEST_SECRET || '');
    if (!origin || !consumerKey || !consumerSecret) missing.push('WOO_TEST_ORIGIN/WOO_TEST_KEY/WOO_TEST_SECRET');
    else configureBody = { origin, currency, consumerKey, consumerSecret };
  }
  if (missing.length) {
    console.error(`FAIL catalog-live-check: missing env: ${missing.join(', ')}.`);
    process.exit(1);
  }
  if (!/^https:\/\//i.test(baseUrl)) {
    console.error('FAIL catalog-live-check: CATALOG_LIVE_BASE_URL must start with https://.');
    process.exit(1);
  }

  const connectorPath = `/api/catalog-connectors/bots/${encodeURIComponent(botId)}/${encodeURIComponent(provider)}`;
  console.log(`catalog-live-check: provider=${provider} host=${hostOf(origin)} currency=${currency}`);

  try {
    const configured = await apiJson(`${baseUrl}${connectorPath}`, { method: 'PUT', jwt, body: configureBody });
    if (configured.status !== 200 || configured.data?.configured !== true) {
      console.error(
        `FAIL catalog-live-check: configure rejected ${JSON.stringify(safeStatusDescription(configured.status, configured.data))}.`
      );
      process.exit(1);
    }
    console.log('catalog-live-check: connector configured.');

    const synced = await apiJson(`${baseUrl}${connectorPath}/sync`, { method: 'POST', jwt, body: {} });
    const importedCount = Number(synced.data?.importedCount);
    if (synced.status !== 200 || !Number.isFinite(importedCount) || importedCount <= 0) {
      console.error(
        `FAIL catalog-live-check: sync did not import products ${JSON.stringify(safeStatusDescription(synced.status, synced.data))}.`
      );
      process.exit(1);
    }
    console.log(`catalog-live-check: sync importedCount=${importedCount}.`);

    const bots = await apiJson(`${baseUrl}/api/bots`, { jwt });
    const bot = Array.isArray(bots.data) ? bots.data.find((entry) => String(entry?._id) === botId) : null;
    const storeId = bot?.storeId ? String(bot.storeId) : '';
    if (bots.status !== 200 || !storeId) {
      console.error(`FAIL catalog-live-check: could not resolve storeId (bots status=${bots.status}).`);
      process.exit(1);
    }

    const listed = await apiJson(`${baseUrl}/api/products/${encodeURIComponent(storeId)}/products?limit=5`, { jwt });
    const products = Array.isArray(listed.data?.products) ? listed.data.products : [];
    if (listed.status !== 200 || products.length === 0) {
      console.error(`FAIL catalog-live-check: products API returned no products (status=${listed.status}).`);
      process.exit(1);
    }
    const firstName = String(products[0]?.productName || '').trim();
    if (!firstName) {
      console.error('FAIL catalog-live-check: first product has no productName.');
      process.exit(1);
    }
    console.log(`catalog-live-check: products API returned ${products.length} item(s); first="${firstName.slice(0, 80)}".`);

    const context = buildProductContext(products, firstName, '');
    if (!context.includes(firstName.slice(0, Math.min(firstName.length, 60)))) {
      console.error('FAIL catalog-live-check: bot context does not include the imported product name.');
      process.exit(1);
    }
    console.log('catalog-live-check: PASS (configure -> sync -> products API -> bot context).');
  } catch (error) {
    console.error(`FAIL catalog-live-check: ${maskError(error)}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { detectProvider };
