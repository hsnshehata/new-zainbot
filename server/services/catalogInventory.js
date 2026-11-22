'use strict';
// Imported stock is a remote base minus durable local allocations. Tokens are
// retry fences, not the balance: completed-token cleanup must not erase sales.
const managedExpression = { $ne: [{ $type: '$catalogInventory.sourceKey' }, 'missing'] };
function allocationAfter(delta) {
  return { $max: [0, { $add: [{ $ifNull: ['$catalogInventory.localAllocated', 0] }, delta] }] };
}
function stockAfterAllocation(delta, localStockExpression) {
  return { $cond: [managedExpression,
    { $cond: [{ $eq: ['$stockTracked', false] }, 0,
      { $max: [0, { $subtract: ['$catalogInventory.remoteQuantity', allocationAfter(delta)] }] }] },
    localStockExpression] };
}
function inventoryAfterAllocation(delta) {
  return { $cond: [managedExpression,
    { $mergeObjects: ['$catalogInventory', { localAllocated: allocationAfter(delta) }] }, '$$REMOVE'] };
}
function inventoryUnavailable(product) {
  if (!product?.importSource) return null;
  if (!product.catalogInventory?.sourceKey) return 'CATALOG_RECONCILIATION_REQUIRED';
  if (!(product.catalogInventory.syncGeneration > 0)) return 'CATALOG_SYNC_INCOMPLETE';
  if (product.stockTracked === false) return 'CATALOG_QUANTITY_UNCONFIRMED';
  return null;
}
module.exports = { managedExpression, allocationAfter, stockAfterAllocation, inventoryAfterAllocation, inventoryUnavailable };
