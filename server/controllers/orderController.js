// /server/controllers/orderController.js
const crypto = require('crypto');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const Bot = require('../models/Bot');
const { notifyNewOrder, notifyOrderStatus } = require('../services/telegramService');
const { upsertFromOrder } = require('./customersController');
const logger = require('../logger');

// إنشاء طلب جديد
exports.createOrder = async (req, res) => {
  const { storeId } = req.params;
  const {
    products,
    paymentMethod,
    customerName,
    customerWhatsapp,
    customerEmail,
    customerAddress,
    customerNote
  } = req.body;
  const userId = req.user ? req.user.userId : null; // الزبون ممكن يكون زائر

  const sanitizeWhatsapp = (value = '') => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    const normalized = trimmed.replace(/\s+/g, '');
    if (normalized.startsWith('+')) {
      return `+${normalized.slice(1).replace(/\D+/g, '')}`;
    }
    return normalized.replace(/\D+/g, '');
  };

  try {
    logger.info('order_create_attempt', {
      storeId,
      userId,
      productsCount: Array.isArray(products) ? products.length : 0,
      paymentMethod
    });

    // التحقق من وجود المتجر
    const store = await Store.findById(storeId);
    if (!store) {
      logger.warn('order_create_store_not_found', { storeId });
      return res.status(404).json({ message: 'المتجر غير موجود' });
    }

    // التحقق من المنتجات
    if (!products || !Array.isArray(products) || products.length === 0) {
      logger.warn('order_create_no_products', { storeId });
      return res.status(400).json({ message: 'يجب إرسال قائمة منتجات صالحة' });
    }

    const safeCustomerName = typeof customerName === 'string' ? customerName.trim() : '';
    const sanitizedWhatsapp = sanitizeWhatsapp(customerWhatsapp);
    const safeEmail = typeof customerEmail === 'string' ? customerEmail.trim() : '';
    const safeAddress = typeof customerAddress === 'string' ? customerAddress.trim() : '';
    const safeNote = typeof customerNote === 'string' ? customerNote.trim() : '';
    const safePaymentMethod = paymentMethod === 'cash_on_delivery' ? 'cash_on_delivery' : 'whatsapp_confirmation';

    if (!safeCustomerName || sanitizedWhatsapp.length < 6) {
      logger.warn('order_create_missing_customer_details', { storeId });
      return res.status(400).json({ message: 'يرجى إدخال اسمك ورقم واتساب صالح للتواصل.' });
    }
    if (!safeAddress || safeAddress.length < 8) {
      logger.warn('order_create_missing_address', { storeId });
      return res.status(400).json({ message: 'يرجى كتابة العنوان بالتفصيل (المدينة/المنطقة/الشارع/معلم قريب) لإتمام الطلب.' });
    }

    // Guest-checkout idempotency: the storefront sends a stable key per
    // checkout attempt and resends it on retries; a replay returns the
    // original order instead of creating a duplicate (which would
    // double-decrement stock and re-send owner notifications). The same
    // key with a different payload is rejected (409).
    const rawKey = req.get('idempotency-key');
    const idempotencyKey = rawKey ? String(rawKey).trim().slice(0, 128) : '';
    let payloadHash = '';
    if (idempotencyKey) {
      payloadHash = crypto.createHash('sha256').update(JSON.stringify({
        storeId: String(storeId),
        products: products.map((p) => ({ productId: String(p.productId), quantity: Number(p.quantity), selectedOptions: Array.isArray(p.selectedOptions) ? p.selectedOptions : [] })),
        paymentMethod: safePaymentMethod,
        customerName: safeCustomerName,
        customerWhatsapp: sanitizedWhatsapp,
        customerEmail: safeEmail,
        customerAddress: safeAddress,
        customerNote: safeNote,
      })).digest('hex');
      const existing = await Order.findOne({ storeId, idempotencyKey });
      if (existing) {
        if (existing.payloadHash === payloadHash) {
          logger.info('order_create_idempotent_replay', { storeId, orderId: existing._id });
          return res.status(200).json(existing);
        }
        logger.warn('order_create_idempotency_mismatch', { storeId, orderId: existing._id });
        return res.status(409).json({ message: 'مفتاح الطلب ده اتستخدم لطلب مختلف. راجع السلة أو أعد المحاولة.' });
      }
    }

    let totalPrice = 0;
    const orderProducts = [];
    const willBeConfirmed = safePaymentMethod !== 'whatsapp_confirmation';
    const reserved = [];

    // عند فشل لاحق نرجّع أي كميات محجوزة حتى لا تضيع من المخزون
    const releaseReservations = async () => {
      for (const r of reserved) {
        await Product.updateOne({ _id: r.productId }, { $inc: { stock: r.quantity } })
          .catch((e) => logger.error('order_stock_release_failed', { storeId, productId: r.productId, err: e.message }));
      }
      reserved.length = 0;
    };

    // التحقق من المخزون وحساب الإجمالي، مع حجز ذرّي للكمية عند الطلب
    // المؤكد فورًا (الدفع عند الاستلام) حتى لا يبيع طلبان متزامنان آخر
    // قطعة. طلبات تأكيد واتساب تبقى pending بدون خصم هنا - الخصم يتم
    // عند التأكيد في updateOrder كما كان سابقًا.
    for (const item of products) {
      const productId = item.productId;
      const requestedQuantity = Number(item.quantity);
      if (!productId || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        logger.warn('order_create_invalid_quantity', { storeId, item });
        await releaseReservations();
        return res.status(400).json({ message: 'تم إرسال كمية غير صالحة لأحد المنتجات.' });
      }

      let product;
      if (willBeConfirmed) {
        product = await Product.findOneAndUpdate(
          { _id: productId, storeId, stock: { $gte: requestedQuantity } },
          { $inc: { stock: -requestedQuantity } },
          { new: true }
        );
        if (!product) {
          const exists = await Product.findOne({ _id: productId, storeId }).select('productName stock');
          await releaseReservations();
          if (!exists) {
            logger.warn('order_create_product_not_found', { storeId, productId });
            return res.status(404).json({ message: `المنتج ${productId} غير موجود` });
          }
          logger.warn('order_create_insufficient_stock', {
            storeId,
            productId,
            productName: exists.productName,
            availableStock: exists.stock,
            requestedQuantity
          });
          return res.status(400).json({ message: `المخزون غير كافٍ للمنتج ${exists.productName}` });
        }
        reserved.push({ productId: product._id, quantity: requestedQuantity });
      } else {
        product = await Product.findOne({ _id: productId, storeId });
        if (!product) {
          logger.warn('order_create_product_not_found', { storeId, productId });
          await releaseReservations();
          return res.status(404).json({ message: `المنتج ${productId} غير موجود` });
        }
        const availableStock = typeof product.stock === 'number' ? product.stock : 0;
        if (availableStock < requestedQuantity) {
          logger.warn('order_create_insufficient_stock', {
            storeId,
            productId,
            productName: product.productName,
            availableStock,
            requestedQuantity
          });
          await releaseReservations();
          return res.status(400).json({ message: `المخزون غير كافٍ للمنتج ${product.productName}` });
        }
      }
      const unitPrice = product.hasOffer && product.discountedPrice ? product.discountedPrice : product.price;
      const numericPrice = Number(unitPrice) || 0;
      const currency = product.currency || 'EGP';
      // مرر خيارات المنتج لو موجودة
      const selectedOptions = Array.isArray(item.selectedOptions)
        ? item.selectedOptions.filter(o => o && typeof o.name === 'string' && typeof o.value === 'string')
        : [];
      if (selectedOptions.length){
        logger.info('order_create_item_options', {
          storeId,
          productId: product._id,
          productName: product.productName,
          options: selectedOptions.map(o => `${o.name}:${o.value}`).join(' | ')
        });
      }

      orderProducts.push({
        productId: product._id,
        quantity: requestedQuantity,
        selectedOptions,
        price: numericPrice,
        currency,
        name: product.productName,
        imageUrl: product.imageUrl || ''
      });
      totalPrice += numericPrice * requestedQuantity;
    }

    const orderCurrency = orderProducts[0]?.currency || 'EGP';

    // إنشاء الطلب مع history ابتدائي
    const newOrder = new Order({
      storeId,
      userId,
      products: orderProducts,
      totalPrice,
      currency: orderCurrency,
      paymentMethod: safePaymentMethod,
      status: safePaymentMethod === 'whatsapp_confirmation' ? 'pending' : 'confirmed',
      customerName: safeCustomerName,
      customerWhatsapp: sanitizedWhatsapp,
      customerEmail: safeEmail,
      customerAddress: safeAddress,
      customerNote: safeNote,
      idempotencyKey: idempotencyKey || undefined,
      payloadHash,
      history: [{
        status: safePaymentMethod === 'whatsapp_confirmation' ? 'pending' : 'confirmed',
        changedBy: userId || null,
        changedAt: new Date(),
        note: 'تم إنشاء الطلب'
      }]
    });

  try {
    await newOrder.save();
  } catch (saveErr) {
    // Save failed after atomic reservations: release the stock first.
    await releaseReservations();
    // Duplicate idempotency key (tight race with a concurrent submit):
    // replay the winner instead of failing the shopper.
    if (saveErr && saveErr.code === 11000 && idempotencyKey) {
      const winner = await Order.findOne({ storeId, idempotencyKey });
      if (winner && winner.payloadHash === payloadHash) {
        logger.info('order_create_idempotent_replay_after_race', { storeId, orderId: winner._id });
        return res.status(200).json(winner);
      }
      if (winner) {
        logger.warn('order_create_idempotency_mismatch', { storeId, orderId: winner._id });
        return res.status(409).json({ message: 'مفتاح الطلب ده اتستخدم لطلب مختلف. راجع السلة أو أعد المحاولة.' });
      }
    }
    throw saveErr;
  }
  logger.info('order_created', {
    storeId,
    orderId: newOrder._id,
    customerName: safeCustomerName,
    status: newOrder.status,
    totalPrice,
    currency: orderCurrency
  });

    // تحديث ملف العميل
    try {
      await upsertFromOrder({
        storeId,
        name: safeCustomerName,
        phone: sanitizedWhatsapp,
        email: safeEmail,
        address: safeAddress,
        orderTotal: totalPrice,
        currency: orderCurrency,
      });
    } catch (e) {
      logger.warn('order_customer_upsert_failed', { storeId, orderId: newOrder._id, err: e.message });
    }

    // لا يوجد خصم مخزون بعد الحفظ: الطلبات المؤكدة فورًا حُجزت كمياتها
    // ذرّيًا قبل إنشاء الطلب (أعلاه)، وطلبات pending تُخصم عند التأكيد
    // في updateOrder. لا يبقى هنا مسار فشل يحتاج opsFlags للمخزون.

    // إشعار لصاحب المتجر
    let formattedTotal = `${totalPrice.toFixed(2)} ${orderCurrency}`;
    try {
      formattedTotal = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: orderCurrency }).format(totalPrice);
    } catch (formatErr) {
      logger.warn('order_total_format_failed', { storeId, orderId: newOrder._id, currency: orderCurrency, err: formatErr.message });
    }

    // Guarded for the same reason: the order exists already, so a
    // notification failure must not fail the shopper's request.
    try {
      const notification = new Notification({
        user: store.userId,
        title: `طلب جديد في ${store.storeName}`,
        message: `تم إنشاء طلب جديد (${newOrder._id}) بإجمالي ${formattedTotal}.`,
        isRead: false
      });
      await notification.save();
      logger.info('order_notification_created', { storeId, orderId: newOrder._id, userId: store.userId });
    } catch (notifErr) {
      logger.error('order_notification_failed', { storeId, orderId: newOrder._id, err: notifErr.message });
      await Order.updateOne(
        { _id: newOrder._id },
        { $set: { 'opsFlags.notificationPending': true, 'opsFlags.notificationError': String(notifErr.message || 'notification failed').slice(0, 300) } }
      ).catch((flagErr) => logger.error('order_opsflag_write_failed', { orderId: newOrder._id, err: flagErr.message }));
    }

    // حدد البوت المرتبط بالمتجر (لو لم يُخزَّن botId في المتجر نبحث عنه)
    let botIdForNotify = store.botId || null;
    if (!botIdForNotify) {
      const botForStore = await Bot.findOne({ storeId: store._id }).select('_id');
      if (botForStore) botIdForNotify = botForStore._id;
    }

    try {
      await notifyNewOrder(store.userId, {
        storeName: store.storeName,
        orderId: newOrder._id,
        status: newOrder.status,
        total: totalPrice,
        currency: orderCurrency,
        customerName: safeCustomerName,
        customerAddress: safeAddress,
        customerWhatsapp: sanitizedWhatsapp,
        items: orderProducts,
      }, botIdForNotify);
    } catch (notifyErr) {
      logger.warn('order_notify_new_order_failed', { storeId, orderId: newOrder._id, err: notifyErr.message });
    }

    res.status(201).json(newOrder);
  } catch (err) {
    logger.error('order_create_error', { storeId, err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في إنشاء الطلب' });
  }
};

// تحديث حالة الطلب
exports.updateOrder = async (req, res) => {
  const { storeId, orderId } = req.params;
  const { status } = req.body;
  const userId = req.user.userId;

  try {
    // التحقق من وجود المتجر
    const store = await Store.findOne({ _id: storeId, userId });
    if (!store) {
      logger.warn('order_update_store_not_found', { storeId, userId });
      return res.status(404).json({ message: 'المتجر غير موجود' });
    }

    // التحقق من وجود الطلب
    const order = await Order.findOne({ _id: orderId, storeId });
    if (!order) {
      logger.warn('order_update_not_found', { storeId, orderId });
      return res.status(404).json({ message: 'الطلب غير موجود' });
    }

    // حفظ السجل القديم للحالة والتحقق من التغيير
    if (status && status !== order.status) {
      const prevStatus = order.status;
      order.status = status;
      // أضف إدخال إلى history
      if (!Array.isArray(order.history)) order.history = [];
      order.history.push({
        status,
        changedBy: userId || null,
        changedAt: new Date(),
        note: `تغيير الحالة من ${prevStatus} إلى ${status}`
      });

      if (status === 'confirmed' && order.paymentMethod === 'whatsapp_confirmation') {
        // تحديث المخزون عند التأكيد
        for (const item of order.products) {
          const product = await Product.findById(item.productId);
          product.stock -= item.quantity;
          await product.save();
          logger.info('order_update_stock', { storeId, orderId, productId: product._id, productName: product.productName, stock: product.stock });
        }
      }
      await order.save();
      logger.info('order_updated', { storeId, orderId: order._id, status });

      // إشعار لصاحب المتجر
      const notification = new Notification({
        user: store.userId,
        title: `تحديث حالة الطلب ${order._id}`,
        message: `تم تحديث حالة الطلب إلى ${status}.`,
        isRead: false
      });
      await notification.save();
      logger.info('order_status_notification_created', { storeId, orderId: order._id, userId: store.userId, status });

      try {
        let botIdForNotify = store.botId || null;
        if (!botIdForNotify) {
          const botForStore = await Bot.findOne({ storeId: store._id }).select('_id');
          if (botForStore) botIdForNotify = botForStore._id;
        }
        await notifyOrderStatus(store.userId, {
          storeName: store.storeName,
          orderId: order._id,
          status: order.status,
        }, botIdForNotify);
      } catch (notifyErr) {
        logger.warn('order_notify_status_failed', { storeId, orderId: order._id, err: notifyErr.message });
      }
    } else {
      // لو نفس الحالة أو مافي status جديد نرجع الطلب كما هو
      await order.save();
    }

    res.status(200).json(order);
  } catch (err) {
    logger.error('order_update_error', { storeId, orderId, err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في تحديث الطلب' });
  }
};

// جلب الطلبات
exports.getOrders = async (req, res) => {
  const { storeId } = req.params;
  const userId = req.user.userId;

  try {
    // Orders contain customer PII: only the store owner (or a direct,
    // non-impersonating superadmin) may list them. Mirrors the access
    // pattern used by updateOrder and getBotAccessFilter.
    const subjectUserId = req.auth?.subjectUserId || userId;
    const actorRole = req.auth?.actorRole || req.user?.role;
    const isImpersonating = Boolean(req.auth?.isImpersonating);
    const storeFilter = (actorRole === 'superadmin' && !isImpersonating)
      ? { _id: storeId }
      : { _id: storeId, userId: subjectUserId };
    const store = await Store.findOne(storeFilter);
    if (!store) {
      logger.warn('orders_fetch_store_not_found', { storeId, requestedBy: userId });
      return res.status(404).json({ message: 'المتجر غير موجود' });
    }

    const orders = await Order.find({ storeId }).sort({ createdAt: -1 });
    logger.info('orders_fetch_success', { storeId, count: orders.length });
    // orders الآن تحتوي على حقل history
    res.status(200).json(orders);
  } catch (err) {
    logger.error('orders_fetch_error', { storeId, err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في جلب الطلبات' });
  }
};
