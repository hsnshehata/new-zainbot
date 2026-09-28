const express = require('express');
const mongoose = require('mongoose');
const Bot = require('../models/Bot');
const Store = require('../models/Store');
const CatalogConnector = require('../models/CatalogConnector');
const authenticate = require('../middleware/authenticate');
const { encryptCredentialSecret, decryptCredentialSecret, buildCredentialContext } = require('../services/AiCredentialCrypto');
const { normalizeOrigin, importCatalog } = require('../services/catalogImportService');

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
  return {
    configured: true, provider: doc.provider, origin: doc.origin, currency: doc.currency,
    state: doc.state, lastError: doc.lastError || null,
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
    if (existing?.state === 'running' && existing.leaseUntil > new Date()) return res.status(409).json({ error: 'SYNC_IN_PROGRESS' });
    const update = { storeId: req.catalogBot.storeId, origin: cleanOrigin, currency, ...secrets,
      state: 'idle', lastError: null, leaseUntil: null, lastSucceededAt: null, lastImportedCount: null };
    const doc = await CatalogConnector.findOneAndUpdate(
      { ...filter, $or: [{ state: { $ne: 'running' } }, { leaseUntil: { $lte: new Date() } }] },
      { $set: update, $setOnInsert: filter }, { upsert: !existing, new: true, runValidators: true }
    );
    if (!doc) return res.status(409).json({ error: 'SYNC_IN_PROGRESS' });
    return res.json(safeStatus(doc));
  } catch (error) {
    if (error.code === 'STORE_LINK_CONFLICT') return res.status(409).json({ error: 'STORE_LINK_CONFLICT' });
    return res.status(error.code?.startsWith('AI_CREDENTIAL_') ? 503 : 500).json({ error: 'CONNECTOR_CONFIG_FAILED' });
  }
});

router.post('/bots/:botId/:provider/sync', async (req, res) => {
  const filter = { botId: req.catalogBot._id, provider: req.params.provider, storeId: req.catalogBot.storeId };
  const lease = new Date(Date.now() + 300_000);
  let doc;
  try {
    doc = await CatalogConnector.findOneAndUpdate(
      { ...filter, $or: [{ state: { $ne: 'running' } }, { leaseUntil: { $lte: new Date() } }] },
      { $set: { state: 'running', leaseUntil: lease, lastError: null } }, { new: true }
    ).select('+token +consumerKey +consumerSecret');
    if (!doc) {
      const existing = await CatalogConnector.exists(filter);
      return res.status(existing ? 409 : 404).json({ error: existing ? 'SYNC_IN_PROGRESS' : 'CONNECTOR_NOT_CONFIGURED' });
    }
    const scope = String(req.catalogBot._id);
    const decrypt = (value, kind) => decryptCredentialSecret(value, { context: buildCredentialContext(scope, kind) });
    const credentials = doc.provider === 'shopify'
      ? { token: decrypt(doc.token, 'catalog-shopify-token') }
      : { consumerKey: decrypt(doc.consumerKey, 'catalog-woo-key'), consumerSecret: decrypt(doc.consumerSecret, 'catalog-woo-secret') };
    const count = await importCatalog(doc, credentials);
    try { require('../botEngine').invalidateStoreCache(doc.storeId); } catch { /* Cache expires naturally. */ }
    await CatalogConnector.updateOne({ _id: doc._id, leaseUntil: lease }, {
      $set: { state: 'succeeded', lastSucceededAt: new Date(), lastImportedCount: count, lastError: null },
      $unset: { leaseUntil: '' }
    });
    return res.json({ state: 'succeeded', importedCount: count });
  } catch (error) {
    // Never return/log upstream error messages: they may contain URLs or credentials.
    const code = ['REMOTE_AUTH_FAILED', 'REMOTE_REQUEST_FAILED', 'REMOTE_TIMEOUT',
      'REMOTE_RESPONSE_TOO_LARGE', 'REMOTE_INVALID_RESPONSE', 'REMOTE_INVALID_PRODUCT',
      'UNSAFE_HOST', 'UNSAFE_PAGE', 'CATALOG_LIMIT_EXCEEDED', 'EMPTY_CATALOG'].includes(error.code)
      ? error.code : 'SYNC_FAILED';
    if (doc) await CatalogConnector.updateOne({ _id: doc._id, leaseUntil: lease }, {
      $set: { state: 'failed', lastError: code }, $unset: { leaseUntil: '' }
    });
    return res.status(502).json({ state: 'failed', error: code });
  }
});

module.exports = router;
