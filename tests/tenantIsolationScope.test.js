'use strict';

// tests/tenantIsolationScope.test.js
// Cross-tenant read/write regression coverage for the store-scoped
// dashboard controllers. Follows the pattern of orderStoreScope.test.js:
// controllers are exercised directly against mongodb-memory-server with
// mock req/res, keyed off the access contract enforced by each controller's
// authorizeStoreAccess / canAccessBot:
// - the store (or bot) owner gets full read/write access to their tenant;
// - any other authenticated user gets 403 (store exists) or 404 (missing);
// - a direct (non-impersonating) superadmin may access any tenant;
// - an impersonating superadmin is limited to the impersonated subject's
//   tenants, because the authenticate middleware sets req.user to the
//   subject (mirrored here the same way orderStoreScope does);
// - object ids from another tenant must never resolve through a tenant's
//   URL (no cross-store IDOR on detail/update/delete endpoints), and
//   cross-tenant id references on write endpoints must not mutate the
//   other tenant's data.
//
// Domains covered: customers, products, bookings, employees, expenses,
// suppliers, sales, categories.
//
// Deliberately public surface (storefront reads, verified for isolation
// only, not access-denied): productController.getProducts /
// getBestsellers / getProduct, categoryController.getCategories without
// auth, customersController.publicLookup. These serve the public store
// pages and only filter by storeId / isActive by design.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const Store = require('../server/models/Store');
const Bot = require('../server/models/Bot');
const Customer = require('../server/models/Customer');
const CustomerTransaction = require('../server/models/CustomerTransaction');
const Product = require('../server/models/Product');
const Booking = require('../server/models/Booking');
const Employee = require('../server/models/Employee');
const Expense = require('../server/models/Expense');
const Supplier = require('../server/models/Supplier');
const Sale = require('../server/models/Sale');
const Category = require('../server/models/Category');

const customersController = require('../server/controllers/customersController');
const productController = require('../server/controllers/productController');
const bookingsController = require('../server/controllers/bookingsController');
const employeesController = require('../server/controllers/employeesController');
const expensesController = require('../server/controllers/expensesController');
const suppliersController = require('../server/controllers/suppliersController');
const salesController = require('../server/controllers/salesController');
const categoryController = require('../server/controllers/categoryController');

const OWNER_A = new mongoose.Types.ObjectId();
const OWNER_B = new mongoose.Types.ObjectId();
const ADMIN_ID = new mongoose.Types.ObjectId();

let mongod;
let storeA;
let storeB;
let botA;
let botB;
const docs = {};

function mkRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

// actor shapes mirror what server/middleware/authenticate.js sets:
// - normal session: req.user = the user, req.auth.isImpersonating = false
// - impersonation: req.user = the SUBJECT user, req.auth carries the actor
function mkReq({ actor, params = {}, query = {}, body = {} }) {
  const req = { params, query, body };
  if (actor && actor.kind === 'user') {
    req.user = { userId: String(actor.id), role: 'user' };
    req.auth = {
      actorUserId: String(actor.id),
      subjectUserId: String(actor.id),
      actorRole: 'user',
      isImpersonating: false,
    };
  } else if (actor && actor.kind === 'superadmin') {
    req.user = { userId: String(actor.id), role: 'superadmin' };
    req.auth = {
      actorUserId: String(actor.id),
      subjectUserId: String(actor.id),
      actorRole: 'superadmin',
      isImpersonating: false,
    };
  } else if (actor && actor.kind === 'impersonating') {
    // middleware sets req.user to the impersonated subject
    req.user = { userId: String(actor.subjectId), role: 'user' };
    req.auth = {
      actorUserId: String(ADMIN_ID),
      subjectUserId: String(actor.subjectId),
      actorRole: 'superadmin',
      isImpersonating: true,
    };
  }
  return { req, res: mkRes() };
}

const asOwnerA = { kind: 'user', id: OWNER_A };
const asOwnerB = { kind: 'user', id: OWNER_B };
const asAdmin = { kind: 'superadmin', id: ADMIN_ID };
const asAdminAsA = { kind: 'impersonating', subjectId: OWNER_A };
const asAdminAsB = { kind: 'impersonating', subjectId: OWNER_B };

async function call(controllerFn, actor, { params, query, body } = {}) {
  const { req, res } = mkReq({ actor, params, query, body });
  await controllerFn(req, res);
  return res;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-tenant-isolation-test'));

  [storeA, storeB] = await Store.create([
    { userId: OWNER_A, storeName: 'Tenant Store A', storeLink: 'tenant-store-a', templateId: 1 },
    { userId: OWNER_B, storeName: 'Tenant Store B', storeLink: 'tenant-store-b', templateId: 1 },
  ]);
  [botA, botB] = await Bot.create([
    { name: 'Bot A', userId: OWNER_A },
    { name: 'Bot B', userId: OWNER_B },
  ]);

  docs.customerA = await Customer.create({ storeId: storeA._id, name: 'Customer A', phone: '01000000001' });
  docs.customerB = await Customer.create({ storeId: storeB._id, name: 'Customer B', phone: '01000000002', balance: 500 });

  docs.productA = await Product.create({ storeId: storeA._id, productName: 'Product A', price: 100, currency: 'EGP', stock: 5 });
  docs.productB = await Product.create({ storeId: storeB._id, productName: 'Product B', price: 200, currency: 'EGP', stock: 7 });

  docs.bookingA = await Booking.create({ botId: botA._id, customerName: 'Booker A', bookingDate: new Date('2026-12-01T10:00:00Z'), status: 'pending' });
  docs.bookingB = await Booking.create({ botId: botB._id, customerName: 'Booker B', bookingDate: new Date('2026-12-02T10:00:00Z'), status: 'confirmed' });

  docs.employeeA = await Employee.create({ storeId: storeA._id, name: 'Employee A', phone: '01000000011', salary: 1000 });
  docs.employeeB = await Employee.create({ storeId: storeB._id, name: 'Employee B', phone: '01000000012', salary: 2000 });

  docs.expenseA = await Expense.create({ storeId: storeA._id, type: 'expense', amount: 50, reason: 'rent A' });
  docs.expenseB = await Expense.create({ storeId: storeB._id, type: 'expense', amount: 75, reason: 'rent B' });

  docs.supplierA = await Supplier.create({ storeId: storeA._id, name: 'Supplier A', phone: '01000000021' });
  docs.supplierB = await Supplier.create({ storeId: storeB._id, name: 'Supplier B', phone: '01000000022', balance: 300 });

  docs.saleA = await Sale.create({ storeId: storeA._id, items: [{ name: 'Product A', qty: 1, unitPrice: 100, total: 100 }], subtotal: 100, total: 100, paymentMethod: 'cash' });
  docs.saleB = await Sale.create({ storeId: storeB._id, items: [{ name: 'Product B', qty: 1, unitPrice: 200, total: 200 }], subtotal: 200, total: 200, paymentMethod: 'cash' });

  docs.categoryA = await Category.create({ storeId: storeA._id, name: 'Category A', description: 'a' });
  docs.categoryB = await Category.create({ storeId: storeB._id, name: 'Category B', description: 'b' });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

test('customers: owner lists and creates in their store', async () => {
  const list = await call(customersController.getCustomers, asOwnerA, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.total, 1);
  assert.equal(String(list.payload.customers[0]._id), String(docs.customerA._id));

  const created = await call(customersController.createCustomer, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { name: 'New Customer', phone: '01000000003' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(String(created.payload.customer.storeId), String(storeA._id));
});

test('customers: non-owner gets 403 on read and write', async () => {
  const list = await call(customersController.getCustomers, asOwnerB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(list.statusCode, 403);

  const created = await call(customersController.createCustomer, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { name: 'Intruder', phone: '01999999999' },
  });
  assert.equal(created.statusCode, 403);
  assert.equal(await Customer.countDocuments({ storeId: storeA._id, phone: '01999999999' }), 0);

  const updated = await call(customersController.updateCustomer, asOwnerB, {
    params: { storeId: String(storeA._id), customerId: String(docs.customerA._id) },
    body: { name: 'Hijacked' },
  });
  assert.equal(updated.statusCode, 403);

  const deleted = await call(customersController.deleteCustomer, asOwnerB, {
    params: { storeId: String(storeA._id), customerId: String(docs.customerA._id) },
  });
  assert.equal(deleted.statusCode, 403);
  assert.ok(await Customer.findById(docs.customerA._id));
});

test('customers: cross-store customer id does not resolve through another store URL', async () => {
  // owner A uses their own store URL but references store B's customer id
  const details = await call(customersController.getCustomerDetails, asOwnerA, {
    params: { storeId: String(storeA._id), customerId: String(docs.customerB._id) },
  });
  assert.equal(details.statusCode, 404);

  const updated = await call(customersController.updateCustomer, asOwnerA, {
    params: { storeId: String(storeA._id), customerId: String(docs.customerB._id) },
    body: { name: 'Hijacked B' },
  });
  assert.equal(updated.statusCode, 404);
  assert.equal((await Customer.findById(docs.customerB._id)).name, 'Customer B');

  const tx = await call(customersController.addCustomerTransaction, asOwnerA, {
    params: { storeId: String(storeA._id), customerId: String(docs.customerB._id) },
    body: { amount: 999, type: 'charge', note: 'cross-tenant attempt' },
  });
  assert.equal(tx.statusCode, 404);
  assert.equal((await Customer.findById(docs.customerB._id)).balance, 500);
  assert.equal(await CustomerTransaction.countDocuments({ customerId: docs.customerB._id }), 0);
});

test('customers: superadmin and impersonation scoping', async () => {
  const direct = await call(customersController.getCustomers, asAdmin, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(direct.statusCode, 200);

  const asA = await call(customersController.getCustomers, asAdminAsA, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(asA.statusCode, 200);

  // impersonating a non-owner must not widen access
  const asB = await call(customersController.getCustomers, asAdminAsB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(asB.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Products (write paths; public reads checked for isolation only)
// ---------------------------------------------------------------------------

test('products: owner creates, updates and deletes in their store', async () => {
  const created = await call(productController.createProduct, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { productName: 'Owner Product', price: 10, currency: 'EGP', stock: 3 },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(String(created.payload.storeId), String(storeA._id));

  const updated = await call(productController.updateProduct, asOwnerA, {
    params: { storeId: String(storeA._id), productId: String(docs.productA._id) },
    body: { price: 120 },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal((await Product.findById(docs.productA._id)).price, 120);

  const deleted = await call(productController.deleteProduct, asOwnerA, {
    params: { storeId: String(storeA._id), productId: String(created.payload._id) },
  });
  assert.equal(deleted.statusCode, 200);
});

test('products: non-owner gets 403 on writes and data stays unchanged', async () => {
  const created = await call(productController.createProduct, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { productName: 'Intruder Product', price: 1, currency: 'EGP', stock: 1 },
  });
  assert.equal(created.statusCode, 403);
  assert.equal(await Product.countDocuments({ storeId: storeA._id, productName: 'Intruder Product' }), 0);

  const updated = await call(productController.updateProduct, asOwnerB, {
    params: { storeId: String(storeA._id), productId: String(docs.productA._id) },
    body: { price: 1 },
  });
  assert.equal(updated.statusCode, 403);
  assert.notEqual((await Product.findById(docs.productA._id)).price, 1);

  const deleted = await call(productController.deleteProduct, asOwnerB, {
    params: { storeId: String(storeA._id), productId: String(docs.productA._id) },
  });
  assert.equal(deleted.statusCode, 403);
  assert.ok(await Product.findById(docs.productA._id));
});

test('products: cross-store product id does not resolve through another store URL', async () => {
  const updated = await call(productController.updateProduct, asOwnerA, {
    params: { storeId: String(storeA._id), productId: String(docs.productB._id) },
    body: { price: 1 },
  });
  assert.equal(updated.statusCode, 404);
  assert.equal((await Product.findById(docs.productB._id)).price, 200);

  const deleted = await call(productController.deleteProduct, asOwnerA, {
    params: { storeId: String(storeA._id), productId: String(docs.productB._id) },
  });
  assert.equal(deleted.statusCode, 404);
  assert.ok(await Product.findById(docs.productB._id));
});

test('products: public storefront listing is isolated per store', async () => {
  // public surface by design (no auth on GET products); assert no cross-tenant leak
  const { req, res } = mkReq({ actor: null, params: { storeId: String(storeA._id) }, query: {} });
  await productController.getProducts(req, res);
  assert.equal(res.statusCode, 200);
  const items = res.payload.products || res.payload;
  const ids = items.map((p) => String(p._id));
  assert.ok(ids.includes(String(docs.productA._id)));
  assert.ok(!ids.includes(String(docs.productB._id)));
});

test('products: impersonating superadmin limited to subject tenant', async () => {
  const asB = await call(productController.createProduct, asAdminAsB, {
    params: { storeId: String(storeA._id) },
    body: { productName: 'Impersonation Probe', price: 1, currency: 'EGP', stock: 1 },
  });
  assert.equal(asB.statusCode, 403);

  const direct = await call(productController.updateProduct, asAdmin, {
    params: { storeId: String(storeA._id), productId: String(docs.productA._id) },
    body: { price: 130 },
  });
  assert.equal(direct.statusCode, 200);
});

// ---------------------------------------------------------------------------
// Bookings (bot-scoped tenancy)
// ---------------------------------------------------------------------------

test('bookings: owner lists only their own bots bookings', async () => {
  const list = await call(bookingsController.listBookings, asOwnerA, { query: {} });
  assert.equal(list.statusCode, 200);
  const ids = list.payload.data.map((b) => String(b._id));
  assert.ok(ids.includes(String(docs.bookingA._id)));
  assert.ok(!ids.includes(String(docs.bookingB._id)));
});

test('bookings: unowned botId filter yields empty list, not a fallback to all', async () => {
  const list = await call(bookingsController.listBookings, asOwnerA, { query: { botId: String(botB._id) } });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.data.length, 0);
});

test('bookings: cannot create, update or delete under another users bot', async () => {
  const created = await call(bookingsController.createBooking, asOwnerA, {
    body: { botId: String(botB._id), customerName: 'Intruder', bookingDate: '2026-12-05T10:00:00Z' },
  });
  assert.equal(created.statusCode, 403);
  assert.equal(await Booking.countDocuments({ botId: botB._id, customerName: 'Intruder' }), 0);

  const updated = await call(bookingsController.updateBooking, asOwnerA, {
    params: { id: String(docs.bookingB._id) },
    body: { status: 'cancelled' },
  });
  assert.equal(updated.statusCode, 403);
  assert.equal((await Booking.findById(docs.bookingB._id)).status, 'confirmed');

  const deleted = await call(bookingsController.deleteBooking, asOwnerA, {
    params: { id: String(docs.bookingB._id) },
  });
  assert.equal(deleted.statusCode, 403);
  assert.ok(await Booking.findById(docs.bookingB._id));
});

test('bookings: owner and superadmin manage their bookings', async () => {
  const updated = await call(bookingsController.updateBooking, asOwnerA, {
    params: { id: String(docs.bookingA._id) },
    body: { status: 'confirmed' },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal((await Booking.findById(docs.bookingA._id)).status, 'confirmed');

  const adminRes = await call(bookingsController.updateBooking, asAdmin, {
    params: { id: String(docs.bookingA._id) },
    body: { notes: 'admin note' },
  });
  assert.equal(adminRes.statusCode, 200);

  const created = await call(bookingsController.createBooking, asOwnerA, {
    body: { botId: String(botA._id), customerName: 'Legit', bookingDate: '2026-12-06T10:00:00Z' },
  });
  assert.equal(created.statusCode, 201);
});

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

test('employees: owner manages employees; non-owner gets 403', async () => {
  const list = await call(employeesController.getEmployees, asOwnerA, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.total, 1);

  const created = await call(employeesController.createEmployee, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { name: 'Second Employee', phone: '01000000013', salary: 1500 },
  });
  assert.equal(created.statusCode, 201);

  const deniedList = await call(employeesController.getEmployees, asOwnerB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(deniedList.statusCode, 403);

  const deniedCreate = await call(employeesController.createEmployee, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { name: 'Rogue Employee' },
  });
  assert.equal(deniedCreate.statusCode, 403);
  assert.equal(await Employee.countDocuments({ storeId: storeA._id, name: 'Rogue Employee' }), 0);

  const deniedUpdate = await call(employeesController.updateEmployee, asOwnerB, {
    params: { storeId: String(storeA._id), id: String(docs.employeeA._id) },
    body: { salary: 1 },
  });
  assert.equal(deniedUpdate.statusCode, 403);
  assert.equal((await Employee.findById(docs.employeeA._id)).salary, 1000);
});

test('employees: cross-store employee id does not resolve through another store URL', async () => {
  const got = await call(employeesController.getEmployee, asOwnerA, {
    params: { storeId: String(storeA._id), id: String(docs.employeeB._id) },
  });
  assert.equal(got.statusCode, 404);

  const updated = await call(employeesController.updateEmployee, asOwnerA, {
    params: { storeId: String(storeA._id), id: String(docs.employeeB._id) },
    body: { salary: 1 },
  });
  assert.equal(updated.statusCode, 404);
  assert.equal((await Employee.findById(docs.employeeB._id)).salary, 2000);
});

test('employees: direct superadmin and impersonation scoping', async () => {
  const direct = await call(employeesController.getEmployees, asAdmin, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(direct.statusCode, 200);

  const asB = await call(employeesController.getEmployees, asAdminAsB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(asB.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

test('expenses: owner manages expenses; non-owner gets 403', async () => {
  const list = await call(expensesController.getExpenses, asOwnerA, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.total, 1);

  const created = await call(expensesController.createExpense, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { type: 'expense', amount: 20, reason: 'supplies' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(String(created.payload.expense.storeId), String(storeA._id));

  const deniedList = await call(expensesController.getExpenses, asOwnerB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(deniedList.statusCode, 403);

  const deniedCreate = await call(expensesController.createExpense, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { type: 'expense', amount: 1, reason: 'rogue' },
  });
  assert.equal(deniedCreate.statusCode, 403);
  assert.equal(await Expense.countDocuments({ storeId: storeA._id, reason: 'rogue' }), 0);

  const deniedDelete = await call(expensesController.deleteExpense, asOwnerB, {
    params: { storeId: String(storeA._id), id: String(docs.expenseA._id) },
  });
  assert.equal(deniedDelete.statusCode, 403);
  assert.ok(await Expense.findById(docs.expenseA._id));
});

test('expenses: cross-store expense id does not resolve through another store URL', async () => {
  const updated = await call(expensesController.updateExpense, asOwnerA, {
    params: { storeId: String(storeA._id), id: String(docs.expenseB._id) },
    body: { amount: 1 },
  });
  assert.equal(updated.statusCode, 404);
  assert.equal((await Expense.findById(docs.expenseB._id)).amount, 75);

  const deleted = await call(expensesController.deleteExpense, asOwnerA, {
    params: { storeId: String(storeA._id), id: String(docs.expenseB._id) },
  });
  assert.equal(deleted.statusCode, 404);
  assert.ok(await Expense.findById(docs.expenseB._id));
});

test('expenses: direct superadmin and impersonation scoping', async () => {
  const direct = await call(expensesController.getExpenses, asAdmin, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(direct.statusCode, 200);

  const asB = await call(expensesController.getExpenses, asAdminAsB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(asB.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

test('suppliers: owner manages suppliers; non-owner gets 403', async () => {
  const list = await call(suppliersController.getSuppliers, asOwnerA, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.total, 1);

  const created = await call(suppliersController.createSupplier, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { name: 'Second Supplier' },
  });
  assert.equal(created.statusCode, 201);

  const deniedList = await call(suppliersController.getSuppliers, asOwnerB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(deniedList.statusCode, 403);

  const deniedCreate = await call(suppliersController.createSupplier, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { name: 'Rogue Supplier' },
  });
  assert.equal(deniedCreate.statusCode, 403);
  assert.equal(await Supplier.countDocuments({ storeId: storeA._id, name: 'Rogue Supplier' }), 0);

  const deniedDelete = await call(suppliersController.deleteSupplier, asOwnerB, {
    params: { storeId: String(storeA._id), supplierId: String(docs.supplierA._id) },
  });
  assert.equal(deniedDelete.statusCode, 403);
  assert.ok(await Supplier.findById(docs.supplierA._id));
});

test('suppliers: cross-store supplier id does not resolve through another store URL', async () => {
  const got = await call(suppliersController.getSupplier, asOwnerA, {
    params: { storeId: String(storeA._id), supplierId: String(docs.supplierB._id) },
  });
  assert.equal(got.statusCode, 404);

  const tx = await call(suppliersController.addSupplierTransaction, asOwnerA, {
    params: { storeId: String(storeA._id), supplierId: String(docs.supplierB._id) },
    body: { amount: 999, type: 'purchase', note: 'cross-tenant attempt' },
  });
  assert.equal(tx.statusCode, 404);
  assert.equal((await Supplier.findById(docs.supplierB._id)).balance, 300);
});

test('suppliers: direct superadmin and impersonation scoping', async () => {
  const direct = await call(suppliersController.getSuppliers, asAdmin, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(direct.statusCode, 200);

  const asB = await call(suppliersController.getSuppliers, asAdminAsB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(asB.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

test('sales: owner creates and lists sales; non-owner gets 403', async () => {
  const created = await call(salesController.createSale, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { items: [{ name: 'Product A', qty: 1, unitPrice: 100, total: 100 }], paymentMethod: 'cash' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(String(created.payload.sale.storeId), String(storeA._id));

  const list = await call(salesController.getSales, asOwnerA, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(list.statusCode, 200);
  const ids = list.payload.sales.map((s) => String(s._id));
  assert.ok(ids.includes(String(docs.saleA._id)));
  assert.ok(!ids.includes(String(docs.saleB._id)));

  const deniedList = await call(salesController.getSales, asOwnerB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(deniedList.statusCode, 403);

  const deniedCreate = await call(salesController.createSale, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { items: [{ name: 'rogue', qty: 1, unitPrice: 1, total: 1 }] },
  });
  assert.equal(deniedCreate.statusCode, 403);
});

test('sales: cross-store sale id does not resolve through another store URL', async () => {
  const got = await call(salesController.getSale, asOwnerA, {
    params: { storeId: String(storeA._id), saleId: String(docs.saleB._id) },
  });
  assert.equal(got.statusCode, 404);
});

test('sales: cross-tenant customerId on an account sale does not touch the other tenants customer', async () => {
  // owner A creates an on-account sale referencing store B's customer id;
  // the customer lookup is store-scoped so B's balance must not move
  const created = await call(salesController.createSale, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: {
      items: [{ name: 'Product A', qty: 1, unitPrice: 100, total: 100 }],
      paymentMethod: 'account',
      customerId: String(docs.customerB._id),
      total: 100,
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal((await Customer.findById(docs.customerB._id)).balance, 500);
  assert.equal(await CustomerTransaction.countDocuments({ customerId: docs.customerB._id }), 0);
});

test('sales: direct superadmin and impersonation scoping', async () => {
  const direct = await call(salesController.getSales, asAdmin, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(direct.statusCode, 200);

  const asB = await call(salesController.getSales, asAdminAsB, { params: { storeId: String(storeA._id) }, query: {} });
  assert.equal(asB.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

test('categories: owner manages categories; non-owner gets 403', async () => {
  const created = await call(categoryController.createCategory, asOwnerA, {
    params: { storeId: String(storeA._id) },
    body: { categoryName: 'Owner Category' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(String(created.payload.storeId), String(storeA._id));

  const deniedCreate = await call(categoryController.createCategory, asOwnerB, {
    params: { storeId: String(storeA._id) },
    body: { categoryName: 'Rogue Category' },
  });
  assert.equal(deniedCreate.statusCode, 403);
  assert.equal(await Category.countDocuments({ storeId: storeA._id, name: 'Rogue Category' }), 0);

  const deniedUpdate = await call(categoryController.updateCategory, asOwnerB, {
    params: { storeId: String(storeA._id), categoryId: String(docs.categoryA._id) },
    body: { categoryName: 'Hijacked' },
  });
  assert.equal(deniedUpdate.statusCode, 403);
  assert.equal((await Category.findById(docs.categoryA._id)).name, 'Category A');

  const deniedDelete = await call(categoryController.deleteCategory, asOwnerB, {
    params: { storeId: String(storeA._id), categoryId: String(docs.categoryA._id) },
  });
  assert.equal(deniedDelete.statusCode, 403);
  assert.ok(await Category.findById(docs.categoryA._id));
});

test('categories: cross-store category id does not resolve through another store URL', async () => {
  const got = await call(categoryController.getCategory, asOwnerA, {
    params: { storeId: String(storeA._id), categoryId: String(docs.categoryB._id) },
  });
  assert.equal(got.statusCode, 404);

  const updated = await call(categoryController.updateCategory, asOwnerA, {
    params: { storeId: String(storeA._id), categoryId: String(docs.categoryB._id) },
    body: { categoryName: 'Hijacked B' },
  });
  assert.equal(updated.statusCode, 404);
  assert.equal((await Category.findById(docs.categoryB._id)).name, 'Category B');

  const deleted = await call(categoryController.deleteCategory, asOwnerA, {
    params: { storeId: String(storeA._id), categoryId: String(docs.categoryB._id) },
  });
  assert.equal(deleted.statusCode, 404);
  assert.ok(await Category.findById(docs.categoryB._id));
});

test('categories: list isolation and superadmin/impersonation scoping', async () => {
  const list = await call(categoryController.getCategories, asOwnerA, { params: { storeId: String(storeA._id) } });
  assert.equal(list.statusCode, 200);
  const ids = list.payload.map((c) => String(c._id));
  assert.ok(ids.includes(String(docs.categoryA._id)));
  assert.ok(!ids.includes(String(docs.categoryB._id)));

  const direct = await call(categoryController.getCategories, asAdmin, { params: { storeId: String(storeA._id) } });
  assert.equal(direct.statusCode, 200);

  const asB = await call(categoryController.getCategories, asAdminAsB, { params: { storeId: String(storeA._id) } });
  assert.equal(asB.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Store-ownership foundations
// ---------------------------------------------------------------------------

test('tenancy: a store with no owner is not writable by arbitrary users', async () => {
  // Store.userId is optional in the schema; an orphaned store must not be
  // claimable by any authenticated non-admin user through these endpoints.
  const orphan = await Store.create({ storeName: 'Orphan Store', storeLink: 'orphan-store', templateId: 1 });
  const list = await call(customersController.getCustomers, asOwnerA, { params: { storeId: String(orphan._id) }, query: {} });
  assert.equal(list.statusCode, 403);

  const admin = await call(customersController.getCustomers, asAdmin, { params: { storeId: String(orphan._id) }, query: {} });
  assert.equal(admin.statusCode, 200);
});

test('tenancy: non-existent store id returns 404, not 403 or data', async () => {
  const missingId = new mongoose.Types.ObjectId();
  const list = await call(customersController.getCustomers, asOwnerA, { params: { storeId: String(missingId) }, query: {} });
  assert.equal(list.statusCode, 404);
});
