const express = require('express');
const mongoose = require('mongoose');
const Bot = require('../models/Bot');
const Store = require('../models/Store');
const CatalogConnector = require('../models/CatalogConnector');
const authenticate = require('../middleware/authenticate');
const { encryptCredentialSecret, decryptCredentialSecret, buildCredentialContext } = require('../services/AiCredentialCrypto');
const { normalizeOrigin, importCatalog } = require('../services/catalogImportService');
const Product = require('../models/Product');
const { claimableLease, activeLease, claimLeaseUpdate } = require('../services/catalogLease');
const { previewCatalogInventory, reconcileCatalogInventory } = require('../services/catalogInventoryReconciliation');

const router = express.Router();
router.use(authenticate);

async function owner(req, res, next) {
  if (req.auth?.isImpersonating) return res.status(403).json({ error: 'OWNER_ONLY' });
  if (!['shopify', 'woocommerce'].includes(req.params.provider)) return res.status(404).json({ error: 'CONNECTOR_NOT_FOUND' });
  if (!mongoose.isValidObjectId(req.params.botId)) return res.status(404).json({ error: 'BOT_NOT_FOUND' });
  try {
    const bot = await Bot.findOne({ _id: req.params.botId, userId: req.user.userId, archivedAt: null });
    if (!bot) return res.status(404).json({ error: 'BOT_NOT_FOUND' });
    if (bot.storeId) {
      const store = await Store.findOne({ _id: bot.storeId, $or: [
        { userId: req.user.userId, $or: [{ botId: bot._id }, { botId: null }] },
        { userId: null, botId: bot._id }
      ] });
      if (!store) return res.status(404).json({ error: 'STORE_NOT_LINKED' });
    } else if (req.method !== 'GET' && req.method !== 'PUT') {
      return res.status(404).json({ error: 'CONNECTOR_NOT_CONFIGURED' });
    }
    req.catalogBot = bot;
    return next();
  } catch { return res.status(404).json({ error: 'STORE_NOT_LINKED' }); }
}
router.use('/bots/:botId/:provider', owner);

async function ensureOwnedStore(bot, userId) {
  if (bot.storeId) return bot.storeId;

  const owned = { botId: bot._id, $or: [{ userId }, { userId: null }] };
  let store = await Store.findOne(owned);
  if (!store) {
    // The unique storeLink/storeName indexes serialize concurrent first-time PUTs.
    // Never adopt a colliding store unless its bot and owner match this request.
    const id = String(bot._id);
    const storeLink = `catalog-${id}`;
    try {
      store = await Store.findOneAndUpdate(
        { storeLink, botId: bot._id, userId },
        { $setOnInsert: { storeName: `Catalog ${id}`, storeLink, botId: bot._id, userId, templateId: 1 } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      store = await Store.findOne(owned);
      if (!store) {
        const conflict = new Error('STORE_LINK_CONFLICT');
        conflict.code = 'STORE_LINK_CONFLICT';
        throw conflict;
      }
    }
  }

  // Compare-and-set: never overwrite a store another request linked meanwhile.
  const linked = await Bot.findOneAndUpdate(
    { _id: bot._id, userId, archivedAt: null, storeId: null },
    { $set: { storeId: store._id } }, { new: true }
  );
  if (linked) {
    bot.storeId = store._id;
    return store._id;
  }
  const latest = await Bot.findOne({ _id: bot._id, userId, archivedAt: null });
  if (!latest?.storeId) throw new Error('STORE_LINK_FAILED');
  const existing = await Store.findOne({ _id: latest.storeId, $or: [
    { userId, $or: [{ botId: bot._id }, { botId: null }] }, { userId: null, botId: bot._id }
  ] });
  if (!existing) throw new Error('STORE_LINK_FAILED');
  bot.storeId = existing._id;
  return existing._id;
}

function safeStatus(doc) {
  if (!doc) return { configured: false, state: 'idle' };
  const expired = doc.state === 'running' && (!doc.leaseUntil || new Date(doc.leaseUntil).getTime() <= Date.now());
  return {
    configured: true, provider: doc.provider, origin: doc.origin, currency: doc.currency,
    state: expired ? 'failed' : doc.state, lastError: expired ? 'STALE_CATALOG_SYNC' : doc.lastError || null,
    lastSucceededAt: doc.lastSucceededAt || null, lastImportedCount: doc.lastImportedCount ?? null,
  };
}

router.get('/bots/:botId/:provider', async (req, res) => {
  if (!req.catalogBot.storeId) return res.json(safeStatus(null));
  const doc = await CatalogConnector.findOne({ botId: req.catalogBot._id, provider: req.params.provider });
  res.json(safeStatus(doc));
});

router.put('/bots/:botId/:provider', async (req, res) => {
  const { provider } = req.params;
  const { origin, currency, token, consumerKey, consumerSecret } = req.body || {};
  if (!['EGP', 'USD', 'SAR'].includes(currency) ||
      (provider === 'shopify' ? typeof token !== 'string' || token.trim().length < 8 :
        typeof consumerKey !== 'string' || consumerKey.trim().length < 8 ||
        typeof consumerSecret !== 'string' || consumerSecret.trim().length < 8)) {
    return res.status(400).json({ error: 'INVALID_CONNECTOR_CONFIG' });
  }
  let cleanOrigin;
  try { cleanOrigin = normalizeOrigin(origin, provider); }
  catch { return res.status(400).json({ error: 'INVALID_ORIGIN' }); }
  const scope = String(req.catalogBot._id);
  try {
    const secrets = provider === 'shopify'
      ? { token: encryptCredentialSecret(token, { context: buildCredentialContext(scope, 'catalog-shopify-token') }) }
      : {
        consumerKey: encryptCredentialSecret(consumerKey, { context: buildCredentialContext(scope, 'catalog-woo-key') }),
        consumerSecret: encryptCredentialSecret(consumerSecret, { context: buildCredentialContext(scope, 'catalog-woo-secret') }),
      };
    await ensureOwnedStore(req.catalogBot, req.user.userId);
    try { require('../botEngine').invalidateBotCache(req.catalogBot._id); } catch { /* Cache expires naturally. */ }
    const filter = { botId: req.catalogBot._id, provider };
    const existing = await CatalogConnector.findOne(filter);
    const update = { storeId: req.catalogBot.storeId, origin: cleanOrigin, currency, ...secrets,
      state: 'idle', lastError: null, leaseUntil: null, lastSucceededAt: null, lastImportedCount: null };
    const doc = await CatalogConnector.findOneAndUpdate(
      { ...filter, ...(existing ? claimableLease : { state: { $exists: false } }) },
      { $set: update, $setOnInsert: filter, $inc: { syncGeneration: 1 } }, { upsert: !existing, new: true, runValidators: true }
    );
    if (!doc) return res.status(409).json({ error: 'SYNC_IN_PROGRESS' });
    return res.json(safeStatus(doc));
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'SYNC_IN_PROGRESS' });
    if (error.code === 'STORE_LINK_CONFLICT') return res.status(409).json({ error: 'STORE_LINK_CONFLICT' });
    return res.status(error.code?.startsWith('AI_CREDENTIAL_') ? 503 : 500).json({ error: 'CONNECTOR_CONFIG_FAILED' });
  }
});

router.post('/bots/:botId/:provider/sync', async (req, res) => {
  const filter = { botId: req.catalogBot._id, provider: req.params.provider, storeId: req.catalogBot.storeId };
  let lease;
  let doc;
  try {
    doc = await CatalogConnector.findOneAndUpdate(
      { ...filter, ...claimableLease }, claimLeaseUpdate(), { new: true }
    ).select('+token +consumerKey +consumerSecret');
    if (!doc) {
      const existing = await CatalogConnector.exists(filter);
      return res.status(existing ? 409 : 404).json({ error: existing ? 'SYNC_IN_PROGRESS' : 'CONNECTOR_NOT_CONFIGURED' });
    }
    lease = doc.leaseUntil;
    const scope = String(req.catalogBot._id);
    const decrypt = (value, kind) => decryptCredentialSecret(value, { context: buildCredentialContext(scope, kind) });
    const credentials = doc.provider === 'shopify'
      ? { token: decrypt(doc.token, 'catalog-shopify-token') }
      : { consumerKey: decrypt(doc.consumerKey, 'catalog-woo-key'), consumerSecret: decrypt(doc.consumerSecret, 'catalog-woo-secret') };
    const currentFilter = { _id: doc._id, leaseUntil: lease, syncGeneration: doc.syncGeneration, state: 'running' };
    const count = await importCatalog(doc, credentials, { isCurrent: async () => Boolean(await CatalogConnector.exists({ ...currentFilter, ...activeLease })) });
    try { require('../botEngine').invalidateStoreCache(doc.storeId); } catch { /* Cache expires naturally. */ }
    const finished = await CatalogConnector.updateOne({ ...currentFilter, ...activeLease }, {
      $set: { state: 'succeeded', lastSucceededAt: new Date(), lastImportedCount: count, lastError: null },
      $unset: { leaseUntil: '' }
    });
    if (!finished.matchedCount) return res.status(409).json({ state: 'failed', error: 'STALE_CATALOG_SYNC' });
    return res.json({ state: 'succeeded', importedCount: count });
  } catch (error) {
    // Never return/log upstream error messages: they may contain URLs or credentials.
    const code = ['REMOTE_AUTH_FAILED', 'REMOTE_REQUEST_FAILED', 'REMOTE_TIMEOUT',
      'REMOTE_RESPONSE_TOO_LARGE', 'REMOTE_INVALID_RESPONSE', 'REMOTE_INVALID_PRODUCT',
      'UNSAFE_HOST', 'UNSAFE_PAGE', 'CATALOG_LIMIT_EXCEEDED', 'EMPTY_CATALOG',
      'CATALOG_RECONCILIATION_REQUIRED', 'CATALOG_SOURCE_CHANGED', 'STALE_CATALOG_SYNC',
      'CATALOG_CHAT_WRITES_ACTIVE', 'CATALOG_OPEN_CHAT_ORDERS'].includes(error.code)
      ? error.code : 'SYNC_FAILED';
    if (doc) await CatalogConnector.updateOne({ _id: doc._id, leaseUntil: lease, syncGeneration: doc.syncGeneration }, {
      $set: { state: 'failed', lastError: code }, $unset: { leaseUntil: '' }
    });
    return res.status(['CATALOG_RECONCILIATION_REQUIRED', 'CATALOG_SOURCE_CHANGED', 'STALE_CATALOG_SYNC', 'CATALOG_CHAT_WRITES_ACTIVE', 'CATALOG_OPEN_CHAT_ORDERS'].includes(code) ? 409 : 502).json({ state: 'failed', error: code });
  }
});

// Recovery discovery/preview is read-only and passes through the same owner
// and non-impersonation gate as connector configuration and sync.
router.get('/bots/:botId/:provider/reconciliation', async (req, res) => {
  try {
    const products = await Product.find({ storeId: req.catalogBot.storeId, importSource: req.params.provider,
      'catalogInventory.sourceKey': { $exists: false } }).select('_id productName importSourceId').limit(500);
    return res.json({ products });
  } catch { return res.status(503).json({ error: 'CATALOG_PREVIEW_UNAVAILABLE' }); }
});
router.get('/bots/:botId/:provider/reconcile/:productId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) return res.status(404).json({ error: 'CATALOG_PRODUCT_NOT_FOUND' });
  try {
    const doc = await CatalogConnector.findOne({ botId: req.catalogBot._id, provider: req.params.provider, storeId: req.catalogBot.storeId }).select('+token +consumerKey +consumerSecret');
    if (!doc) return res.status(404).json({ error: 'CONNECTOR_NOT_CONFIGURED' });
    const scope = String(req.catalogBot._id);
    const decrypt = (v, kind) => decryptCredentialSecret(v, { context: buildCredentialContext(scope, kind) });
    const credentials = doc.provider === 'shopify' ? { token: decrypt(doc.token, 'catalog-shopify-token') }
      : { consumerKey: decrypt(doc.consumerKey, 'catalog-woo-key'), consumerSecret: decrypt(doc.consumerSecret, 'catalog-woo-secret') };
    return res.json(await previewCatalogInventory(doc, credentials, req.params.productId));
  } catch { return res.status(409).json({ error: 'CATALOG_PREVIEW_UNAVAILABLE' }); }
});

// Explicit owner confirmation of a clean legacy baseline. Never called by
// ordinary sync and never changes known balances, remote stock or destinations.
router.post('/bots/:botId/:provider/reconcile/:productId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) return res.status(404).json({ error: 'CATALOG_PRODUCT_NOT_FOUND' });
  const filter = { botId: req.catalogBot._id, provider: req.params.provider, storeId: req.catalogBot.storeId };
  let lease;
  let doc;
  try {
    doc = await CatalogConnector.findOneAndUpdate({ ...filter, ...claimableLease }, claimLeaseUpdate(), { new: true }).select('+token +consumerKey +consumerSecret');
    if (!doc) return res.status(409).json({ error: 'CONNECTOR_NOT_READY' });
    lease = doc.leaseUntil;
    const currentFilter = { _id: doc._id, leaseUntil: lease, syncGeneration: doc.syncGeneration, state: 'running' };
    const scope = String(req.catalogBot._id);
    const decrypt = (value, kind) => decryptCredentialSecret(value, { context: buildCredentialContext(scope, kind) });
    const credentials = doc.provider === 'shopify' ? { token: decrypt(doc.token, 'catalog-shopify-token') }
      : { consumerKey: decrypt(doc.consumerKey, 'catalog-woo-key'), consumerSecret: decrypt(doc.consumerSecret, 'catalog-woo-secret') };
    const result = await reconcileCatalogInventory(doc, credentials, req.params.productId, req.body, {
      isCurrent: async () => Boolean(await CatalogConnector.exists({ ...currentFilter, ...activeLease })),
    });
    const finished = await CatalogConnector.updateOne({ ...currentFilter, ...activeLease }, { $set: { state: 'idle', lastError: null }, $unset: { leaseUntil: '' } });
    try { require('../botEngine').invalidateStoreCache(doc.storeId); } catch { /* Cache expires naturally. */ }
    return res.json({ state: 'reconciled', ...result, statusRefreshRequired: !finished.matchedCount });
  } catch (error) {
    const allowed = ['INVALID_RECONCILIATION_CONFIRMATION', 'CATALOG_PRODUCT_NOT_FOUND', 'CATALOG_ALREADY_RECONCILED',
      'CATALOG_OPEN_ORDERS', 'CATALOG_REMOTE_PRODUCT_MISSING', 'CATALOG_QUANTITY_UNCONFIRMED', 'CATALOG_SNAPSHOT_CHANGED',
      'STALE_CATALOG_SYNC', 'CATALOG_RECONCILIATION_CONFLICT', 'CATALOG_SOURCE_CHANGED'];
    const code = allowed.includes(error.code) ? error.code : 'RECONCILIATION_FAILED';
    if (doc) await CatalogConnector.updateOne({ _id: doc._id, leaseUntil: lease, syncGeneration: doc.syncGeneration }, {
      $set: { state: 'failed', lastError: code }, $unset: { leaseUntil: '' },
    });
    return res.status(code === 'INVALID_RECONCILIATION_CONFIRMATION' ? 400 : 409).json({ error: code });
  }
});

module.exports = router;
