'use strict';
const crypto = require('crypto');
const Store = require('../models/Store');
const Bot = require('../models/Bot');
const ChatOrder = require('../models/ChatOrder');
const { catalogWriteFence } = require('./catalogLease');
function failure(code) { const error = new Error(code); error.code = code; return error; }
async function resolveBot(value) {
  const isBot = value && typeof value === 'object' && ('storeId' in value || 'userId' in value || 'name' in value);
  return isBot ? value : Bot.findById(value).select('storeId');
}
async function beginChatWrite(value) {
  const bot = await resolveBot(value);
  if (!bot?.storeId) return null;
  const id = crypto.randomUUID();
  const store = await Store.findOneAndUpdate({ _id: bot.storeId,
    catalogInventoryMode: { $nin: ['transitioning','imported'] } },
    { $push: { catalogChatWrites: { id, startedAt: new Date() } } }, { new: true });
  if (!store) return { blocked: true };
  return { storeId: store._id, id };
}
async function endChatWrite(guard) {
  if (!guard?.id) return;
  await Store.updateOne({ _id: guard.storeId }, { $pull: { catalogChatWrites: { id: guard.id } } });
}
async function beginCatalogTransition(config) {
  // Plain source-only fixtures have no attached bot or chat lifecycle.
  if (!config.botId) return;
  const store = await Store.findOneAndUpdate({ _id: config.storeId,
    'catalogChatWrites.0': { $exists: false }, ...catalogWriteFence(config) },
    { $set: { catalogInventoryMode: 'transitioning' } }, { new: true });
  if (!store) {
    if (!await Store.exists({ _id: config.storeId, ...catalogWriteFence(config) })) throw failure('STALE_CATALOG_SYNC');
    throw failure('CATALOG_CHAT_WRITES_ACTIVE');
  }
  if (await ChatOrder.exists({ botId: config.botId, status: { $in: ['pending','processing','confirmed'] } })) {
    throw failure('CATALOG_OPEN_CHAT_ORDERS');
  }
  const activated = await Store.updateOne({ _id: store._id, catalogInventoryMode: 'transitioning',
    'catalogChatWrites.0': { $exists: false }, ...catalogWriteFence(config) },
    { $set: { catalogInventoryMode: 'imported' } });
  if (!activated.matchedCount) throw failure('STALE_CATALOG_SYNC');
}
module.exports = { beginChatWrite, endChatWrite, beginCatalogTransition };
