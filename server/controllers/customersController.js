// /server/controllers/customersController.js
const Customer = require('../models/Customer');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Bot = require('../models/Bot');
const logger = require('../logger');

async function authorizeStoreAccess(storeId, userId, userRole) {
  const store = await Store.findById(storeId);
  if (!store) { const e = new Error('المتجر غير موجود'); e.status = 404; throw e; }
  if (userRole === 'superadmin') return store;
  if (String(store.userId) === String(userId)) return store;
  if (store.botId) {
    const bot = await Bot.findById(store.botId);
    if (bot && String(bot.userId) === String(userId)) return store;
  }
  const e = new Error('غير مصرح لك'); e.status = 403; throw e;
}

// قائمة العملاء
exports.getCustomers = async (req, res) => {
  const { storeId } = req.params;
  const { search = '', page = 1, limit = 10 } = req.query;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    const pageNum = parseInt(page) || 1; const limitNum = parseInt(limit) || 10; const skip = (pageNum - 1) * limitNum;
    const q = { storeId };
    if (search) {
      q.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const [items, total] = await Promise.all([
      Customer.find(q).sort({ lastOrderAt: -1 }).skip(skip).limit(limitNum),
      Customer.countDocuments(q)
    ]);
    res.status(200).json({ customers: items, total });
  } catch (err) {
    logger.error('customers_fetch_error', { storeId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في جلب العملاء' });
  }
};

// تفاصيل عميل مع طلباته
exports.getCustomerDetails = async (req, res) => {
  const { storeId, customerId } = req.params;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    const customer = await Customer.findOne({ _id: customerId, storeId });
    if (!customer) return res.status(404).json({ message: 'العميل غير موجود' });
    const orders = await Order.find({ storeId, customerWhatsapp: customer.phone }).sort({ createdAt: -1 });
    res.status(200).json({ customer, orders });
  } catch (err) {
    logger.error('customer_details_error', { storeId, customerId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في جلب ملف العميل' });
  }
};

// بحث عميل بالهاتف (استخدام لاحقًا في صفحة المتجر)
exports.lookupByPhone = async (req, res) => {
  const { storeId } = req.params; const { phone } = req.query;
  const userId = req.user.userId; const role = req.user.role;
  try {
    // Same ownership gate as every other customers endpoint: an authenticated
    // non-owner must not read a store's customer records by phone.
    await authorizeStoreAccess(storeId, userId, role);
    if (!phone) return res.status(400).json({ message: 'رقم الهاتف مطلوب' });
    const customer = await Customer.findOne({ storeId, phone });
    if (!customer) return res.status(404).json({ message: 'لا يوجد عميل لهذا الرقم' });
    res.status(200).json(customer);
  } catch (err) {
    logger.error('customer_lookup_phone_error', { storeId, err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في البحث عن العميل' });
  }
};

// تحديث/إنشاء عميل (داخليًا)
exports.upsertFromOrder = async ({ storeId, name, phone, email, address, orderTotal, currency }) => {
  try {
    const now = new Date();
    const update = {
      name: name || '',
      email: email || '',
      address: address || '',
      $inc: { totalOrders: 1, totalSpent: Number(orderTotal) || 0 },
      currency: currency || 'EGP',
      lastOrderAt: now,
      updatedAt: now,
    };
    await Customer.updateOne({ storeId, phone }, update, { upsert: true });
    logger.info('customer_upsert_from_order', { storeId });
  } catch (err) {
    logger.error('customer_upsert_from_order_error', { storeId, err: err.message, stack: err.stack });
  }
};

// NOTE: the anonymous public phone lookup (publicLookup) was REMOVED.
// Knowing a phone number is not proof of ownership, so any anonymous
// response containing stored name/email/address is a PII oracle even
// with exact-match + throttling. Checkout prefill now uses only the
// shopper's own device cache (public/js/layout*.js). Reintroducing
// server-side prefill requires proof of customer control (an
// authenticated customer session or an approved OTP flow).

// Create a new customer
exports.createCustomer = async (req, res) => {
  const { storeId } = req.params;
  const { name, phone, email, address, notes } = req.body;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    if (!phone) return res.status(400).json({ message: 'رقم الهاتف مطلوب' });
    const existing = await Customer.findOne({ storeId, phone });
    if (existing) return res.status(409).json({ message: 'العميل موجود بالفعل' });
    const c = new Customer({ storeId, name: name||'', phone, email: email||'', address: address||'', notes: notes||'' });
    await c.save();
    res.status(201).json({ customer: c });
  } catch (err) {
    logger.error('customer_create_error', { storeId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في إنشاء العميل' });
  }
};

// Update customer
exports.updateCustomer = async (req, res) => {
  const { storeId, customerId } = req.params;
  const { name, phone, email, address, notes } = req.body;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    const c = await Customer.findOne({ _id: customerId, storeId });
    if (!c) return res.status(404).json({ message: 'العميل غير موجود' });
    if (phone) c.phone = phone;
    if (name !== undefined) c.name = name;
    if (email !== undefined) c.email = email;
    if (address !== undefined) c.address = address;
    if (notes !== undefined) c.notes = notes;
    await c.save();
    res.status(200).json({ customer: c });
  } catch (err) {
    logger.error('customer_update_error', { storeId, customerId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في تحديث العميل' });
  }
};

// Delete customer
exports.deleteCustomer = async (req, res) => {
  const { storeId, customerId } = req.params;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    const c = await Customer.findOneAndDelete({ _id: customerId, storeId });
    if (!c) return res.status(404).json({ message: 'العميل غير موجود' });
    res.status(200).json({ message: 'تم حذف العميل' });
  } catch (err) {
    logger.error('customer_delete_error', { storeId, customerId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في حذف العميل' });
  }
};

const CustomerTransaction = require('../models/CustomerTransaction');

// Get transactions for a customer
exports.getCustomerTransactions = async (req, res) => {
  const { storeId, customerId } = req.params;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    const tx = await CustomerTransaction.find({ storeId, customerId }).sort({ createdAt: -1 });
    res.status(200).json({ transactions: tx });
  } catch (err) {
    logger.error('customer_transactions_fetch_error', { storeId, customerId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في جلب معاملات العميل' });
  }
};

// Add a transaction (charge or payment)
exports.addCustomerTransaction = async (req, res) => {
  const { storeId, customerId } = req.params;
  const { amount, type, note } = req.body; // type: 'charge' (debit) or 'payment' (credit)
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    if (!amount || !['charge','payment'].includes(type)) return res.status(400).json({ message: 'بيانات المعاملة غير كاملة' });
    const customer = await Customer.findOne({ _id: customerId, storeId });
    if (!customer) return res.status(404).json({ message: 'العميل غير موجود' });
    const tx = new CustomerTransaction({ storeId, customerId, amount: Number(amount)||0, type, note: note||'', createdBy: userId });
    await tx.save();
    // Update customer balance: charge increases balance (customer owes), payment decreases balance
    const delta = (type === 'charge') ? Number(amount) : -Number(amount);
    customer.balance = (Number(customer.balance) || 0) + delta;
    await customer.save();
    res.status(201).json({ transaction: tx, balance: customer.balance });
  } catch (err) {
    logger.error('customer_transaction_add_error', { storeId, customerId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في إضافة المعاملة' });
  }
};

// Get printable statement (customer + transactions)
exports.getCustomerStatement = async (req, res) => {
  const { storeId, customerId } = req.params;
  const userId = req.user.userId; const role = req.user.role;
  try {
    await authorizeStoreAccess(storeId, userId, role);
    const customer = await Customer.findOne({ _id: customerId, storeId });
    if (!customer) return res.status(404).json({ message: 'العميل غير موجود' });
    const tx = await CustomerTransaction.find({ storeId, customerId }).sort({ createdAt: -1 });
    res.status(200).json({ customer, transactions: tx });
  } catch (err) {
    logger.error('customer_statement_error', { storeId, customerId, err: err.message, stack: err.stack });
    res.status(err.status || 500).json({ message: err.message || 'خطأ في جلب كشف الحساب' });
  }
};
