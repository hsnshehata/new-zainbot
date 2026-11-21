// /server/routes/customers.js
const express = require('express');
const authenticate = require('../middleware/authenticate');
const ctrl = require('../controllers/customersController');

const router = express.Router();

// قائمة العملاء ومشاهدة التفاصيل تتطلب صلاحية المالك/مدير المتجر
router.get('/:storeId/customers', authenticate, ctrl.getCustomers);
router.get('/:storeId/customers/:customerId', authenticate, ctrl.getCustomerDetails);
router.post('/:storeId/customers', authenticate, ctrl.createCustomer);
router.put('/:storeId/customers/:customerId', authenticate, ctrl.updateCustomer);
router.delete('/:storeId/customers/:customerId', authenticate, ctrl.deleteCustomer);
router.get('/:storeId/customers/:customerId/transactions', authenticate, ctrl.getCustomerTransactions);
router.post('/:storeId/customers/:customerId/transactions', authenticate, ctrl.addCustomerTransaction);
router.get('/:storeId/customers/:customerId/statement', authenticate, ctrl.getCustomerStatement);
// lookup بالهاتف (خاص بلوحة التحكم)
router.get('/:storeId/customers-lookup', authenticate, ctrl.lookupByPhone);
// lookup عام بالهاتف لواجهة المتجر — يعيد فقط name/phone/email/address
// NOTE: the anonymous public phone lookup was removed (privacy): it
// returned stored name/email/address to anyone who knew a phone number.
// Checkout prefill now relies on the shopper's own device cache only.
// No /public/:storeId/lookup route exists; do not re-add without
// proof-of-control (e.g. an authenticated customer session).

module.exports = router;
