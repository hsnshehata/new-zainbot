// /server/routes/customers.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const ctrl = require('../controllers/customersController');

const router = express.Router();

// The anonymous phone lookup is an identity-confirmation endpoint by
// nature. The global limiter alone allows ~28k probes/day/IP, so this
// route gets a much stricter cap: 10 lookups per 15 minutes per IP is
// generous for real returning customers and useless for harvesting.
const publicLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'تم تجاوز عدد المحاولات المسموح بها، برجاء المحاولة لاحقاً',
    error: 'PublicLookupRateLimit',
    retryAfter: 15 * 60,
  },
});

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
router.get('/public/:storeId/lookup', publicLookupLimiter, ctrl.publicLookup);

module.exports = router;
