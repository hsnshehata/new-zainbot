'use strict';
const Product = require('../models/Product');
const Store = require('../models/Store');
const Bot = require('../models/Bot');
const { buildStorefrontUrl } = require('./productContext');
// ChatOrder has name-only items, no stock tokens or restoration lifecycle.
// Imported catalogs therefore use the protected storefront for all new chat
// orders/changes, including mixed catalogs. Existing cancellation is metadata
// only: it must never fabricate a stock restoration for an unreserved order.
async function chatInventoryHandoff(botOrId) {
  const isBot = botOrId && typeof botOrId === 'object' && ('storeId' in botOrId || 'userId' in botOrId || 'name' in botOrId);
  const bot = isBot ? botOrId : await Bot.findById(botOrId).select('storeId');
  if (!bot?.storeId) return null;
  const store = await Store.findById(bot.storeId).select('storeLink +catalogInventoryMode').lean();
  if (!['transitioning','imported'].includes(store?.catalogInventoryMode) && !await Product.exists({ storeId: bot.storeId, importSource: { $in: ['woocommerce','shopify'] } })) return null;
  return { saved: false, chatOrder: null, outcome: 'inventory_storefront_required',
    storefrontUrl: store ? buildStorefrontUrl(store.storeLink) : null };
}
module.exports = { chatInventoryHandoff };
