'use strict';
const Product = require('../models/Product');
const Order = require('../models/Order');
const ChatOrder = require('../models/ChatOrder');
async function hasOpenChatOrders(config) {
  return config.botId ? Boolean(await ChatOrder.exists({ botId: config.botId, status: { $in: ['pending','processing','confirmed'] } })) : false;
}
const { catalogWriteFence } = require('./catalogLease');
const { fetchCatalog, requestJson, mapProduct, sourceKey, connectorError } = require('./catalogImportService');

async function previewCatalogInventory(config, credentials, productId,
  { productModel = Product, orderModel = Order, request = requestJson } = {}) {
  const product = await productModel.findOne({ _id: productId, storeId: config.storeId, importSource: config.provider });
  if (!product) throw connectorError('CATALOG_PRODUCT_NOT_FOUND');
  const items = await fetchCatalog(config, credentials, request);
  const matches = items.filter(item => String(item?.id) === String(product.importSourceId));
  if (matches.length !== 1) throw connectorError('CATALOG_REMOTE_PRODUCT_MISSING');
  const remote = mapProduct(matches[0], config.provider, config.currency);
  const openOrder = Boolean(await orderModel.exists({ 'products.productId': product._id, $or: [
    { status: { $in: ['pending', 'confirmed'] } }, { stockStatus: { $in: ['pending', 'restoring'] } },
  ] }));
  return { productId: String(product._id), localProductName: product.productName,
    remoteProductName: remote.productName, provider: config.provider, origin: config.origin,
    sourceId: product.importSourceId, sourceKey: sourceKey(config, remote),
    remoteQuantity: remote.stockTracked ? remote.stock : null,
    canReconcile: !product.catalogInventory?.sourceKey && remote.stockTracked && !openOrder && !product.reservations?.length && !await hasOpenChatOrders(config),
    requiresPhysicalSellableCount: true };
}

// Only establishes a missing historical baseline. Never resets a known local
// allocation. The caller owns authorization and a current connector lease.
async function reconcileCatalogInventory(config, credentials, productId, confirmation,
  { productModel = Product, orderModel = Order, request = requestJson, isCurrent = async () => true } = {}) {
  const writeFence = catalogWriteFence(config);
  const { confirm, expectedSourceKey, expectedRemoteQuantity, sellableQuantity } = confirmation || {};
  if (confirm !== true || typeof expectedSourceKey !== 'string' || !Number.isSafeInteger(expectedRemoteQuantity) || expectedRemoteQuantity < 0 ||
      !Number.isSafeInteger(sellableQuantity) || sellableQuantity < 0 || sellableQuantity > expectedRemoteQuantity ||
      !Number.isSafeInteger(config.syncGeneration) || config.syncGeneration < 1) {
    throw connectorError('INVALID_RECONCILIATION_CONFIRMATION');
  }
  const scope = { _id: productId, storeId: config.storeId, importSource: config.provider };
  const product = await productModel.findOne(scope);
  if (!product) throw connectorError('CATALOG_PRODUCT_NOT_FOUND');
  if (product.catalogInventory?.sourceKey) throw connectorError('CATALOG_ALREADY_RECONCILED');
  const liabilities = { 'products.productId': product._id, $or: [
    { status: { $in: ['pending', 'confirmed'] } },
    { stockStatus: { $in: ['pending', 'restoring'] } },
  ] };
  if (product.reservations?.length || await orderModel.exists(liabilities) || await hasOpenChatOrders(config)) throw connectorError('CATALOG_OPEN_ORDERS');
  const items = await fetchCatalog(config, credentials, request);
  const matches = items.filter(item => String(item?.id) === String(product.importSourceId));
  if (matches.length !== 1) throw connectorError('CATALOG_REMOTE_PRODUCT_MISSING');
  const remote = mapProduct(matches[0], config.provider, config.currency);
  if (!remote.stockTracked) throw connectorError('CATALOG_QUANTITY_UNCONFIRMED');
  if (sourceKey(config, remote) !== expectedSourceKey) throw connectorError('CATALOG_SOURCE_CHANGED');
  if (remote.stock !== expectedRemoteQuantity) throw connectorError('CATALOG_SNAPSHOT_CHANGED');
  if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
  // Legacy imported products cannot gain new checkout reservations or local
  // invoice stock writes while this check runs. Recheck old order operations.
  if (await orderModel.exists(liabilities) || await hasOpenChatOrders(config)) throw connectorError('CATALOG_OPEN_ORDERS');
  if (!await isCurrent()) throw connectorError('STALE_CATALOG_SYNC');
  const result = await productModel.updateOne({ ...scope, ...writeFence,
    'catalogInventory.sourceKey': { $exists: false }, reservations: { $size: 0 },
    updatedAt: product.updatedAt,
  }, { $set: {
    stock: sellableQuantity, stockTracked: true, updatedAt: new Date(),
    catalogInventory: { sourceKey: sourceKey(config, remote), remoteQuantity: remote.stock,
      localAllocated: remote.stock - sellableQuantity, syncGeneration: config.syncGeneration },
  } }, { runValidators: true });
  if (!result.matchedCount) throw connectorError('CATALOG_RECONCILIATION_CONFLICT');
  return { productId: String(product._id), remoteQuantity: remote.stock, sellableQuantity };
}
module.exports = { previewCatalogInventory, reconcileCatalogInventory };
