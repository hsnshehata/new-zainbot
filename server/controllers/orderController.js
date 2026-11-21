// /server/controllers/orderController.js
const crypto = require('crypto');
const Order = require('../models/Order');
const Store = require('../models/Store');
const Product = require('../models/Product');
const Notification = require('../models/Notification');
const Bot = require('../models/Bot');
const { notifyOrderStatus } = require('../services/telegramService');
const stockService = require('../services/stockService');
const orderOps = require('../services/orderOps');
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

    // قراءة المنتجات وحساب الإجمالي (بدون أي تعديل للمخزون هنا). الحجز
    // الذرّي الفعلي يتم بعد حفظ الطلب عبر بروتوكول التوكنات في
    // stockService، حتى يبقى كل خصم قابلًا للاسترجاع بعد أي انقطاع.
    for (const item of products) {
      const productId = item.productId;
      const requestedQuantity = Number(item.quantity);
      if (!productId || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
        logger.warn('order_create_invalid_quantity', { storeId, item });
        return res.status(400).json({ message: 'تم إرسال كمية غير صالحة لأحد المنتجات.' });
      }

      const product = await Product.findOne({ _id: productId, storeId });
      if (!product) {
        logger.warn('order_create_product_not_found', { storeId, productId });
        return res.status(404).json({ message: `المنتج ${productId} غير موجود` });
      }
      // الفحص المبكر للمخزون فقط لطلبات تأكيد واتساب (لا حجز عند الإنشاء
      // لها). للطلبات المؤكدة فورًا لا نرفض هنا أبدًا: الرفض المبكر قد يسبق
      // اكتمال طلب متزامن يحمل نفس مفتاح الطلبية فيعيد 'مخزون غير كافٍ'
      // لطلب كان يجب أن يُعاد تشغيله (replay). الحجز بعد الحفظ هو الحكم.
      const availableStock = typeof product.stock === 'number' ? product.stock : 0;
      if (!willBeConfirmed && availableStock < requestedQuantity) {
        logger.warn('order_create_insufficient_stock', {
          storeId,
          productId,
          productName: product.productName,
          availableStock,
          requestedQuantity
        });
        return res.status(400).json({ message: `المخزون غير كافٍ للمنتج ${product.productName}` });
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

    // إنشاء الطلب مع history ابتدائي. الطلب يُحفظ أولاً بحالة حجز
    // 'pending' (للطلبات المؤكدة فورًا) قبل أي خصم من المخزون: هذه النية
    // المُخزَّنة هي ما يجعل أي انقطاع لاحق قابلًا للمصالحة بدقة، لأن
    // توكنات الحجز على المنتجات تشير دائمًا إلى هذا الطلب.
    const newOrder = new Order({
      storeId,
      userId,
      products: orderProducts,
      totalPrice,
      currency: orderCurrency,
      paymentMethod: safePaymentMethod,
      status: safePaymentMethod === 'whatsapp_confirmation' ? 'pending' : 'confirmed',
      stockStatus: willBeConfirmed ? 'pending' : 'none',
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

  // Duplicate-key race: two concurrent submits with the same key. The
  // loser never touches stock - it waits (bounded) for the winner's order
  // to leave stockStatus 'pending', then replays it (200) or rejects a
  // mismatched payload (409). If the winner failed its reservation and
  // freed the key, the loser retries its own insert once. A winner still
  // pending after the wait gets a 503 so the client retries later.
  let saved = false;
  for (let attempt = 0; attempt < 2 && !saved; attempt += 1) {
    try {
      await newOrder.save();
      saved = true;
    } catch (saveErr) {
      if (!(saveErr && saveErr.code === 11000 && idempotencyKey)) throw saveErr;
      let winner = null;
      for (let poll = 0; poll < 5; poll += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
        // eslint-disable-next-line no-await-in-loop
        winner = await Order.findOne({ storeId, idempotencyKey });
        if (!winner || winner.stockStatus !== 'pending') break;
      }
      if (winner && winner.payloadHash === payloadHash) {
        logger.info('order_create_idempotent_replay_after_race', { storeId, orderId: winner._id });
        return res.status(200).json(winner);
      }
      if (winner) {
        logger.warn('order_create_idempotency_mismatch', { storeId, orderId: winner._id });
        return res.status(409).json({ message: 'مفتاح الطلب ده اتستخدم لطلب مختلف. راجع السلة أو أعد المحاولة.' });
      }
      // Key freed by a failed concurrent reservation: retry our own insert.
      logger.info('order_create_key_freed_retry', { storeId });
    }
  }
  if (!saved) {
    return res.status(503).json({ message: 'الطلب قيد المعالجة. حاول مرة أخرى بعد لحظات.' });
  }

  // الحجز الذرّي للمخزون للطلبات المؤكدة فورًا. كل سطر يُحجز بتوكن
  // idempotent يحمل معرّف الطلب؛ عند فشل أي سطر تُحرَّر الأسطر السابقة
  // (بشكل idempotent أيضًا) ويُلغى الطلب ويُحرَّر مفتاح الطلبية حتى
  // تستطيع إعادة المحاولة بنفس المفتاح بعد توفّر المخزون.
  if (willBeConfirmed) {
    for (const line of orderProducts) {
      const reservation = await stockService.reserveLine(line.productId, storeId, newOrder._id, line.quantity);
      if (!reservation.ok) {
        await stockService.releaseOrderReservations(newOrder);
        await Order.updateOne(
          { _id: newOrder._id },
          {
            $set: {
              status: 'cancelled',
              stockStatus: 'failed',
              'opsFlags.stockError': 'reservation failed: insufficient stock at commit time',
            },
            $unset: { idempotencyKey: '' },
            $push: {
              history: {
                status: 'cancelled',
                changedBy: null,
                changedAt: new Date(),
                note: 'أُلغي تلقائيًا: المخزون نفد أثناء إتمام الطلب',
              },
            },
          }
        );
        const name = reservation.product?.productName || line.name;
        logger.warn('order_create_reservation_failed', { storeId, orderId: newOrder._id, productId: line.productId });
        return res.status(400).json({ message: `المخزون غير كافٍ للمنتج ${name}` });
      }
    }
    newOrder.stockStatus = 'completed';
    await newOrder.save();
    // Tokens are intentionally KEPT on the products: they preserve
    // idempotency for any in-flight duplicate of this same order (a
    // concurrent replay must still find its token). The orphan-token sweep
    // pulls them, bounded and TTL-fenced, once they are stale.
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

    // إشعار صاحب المتجر عبر المسار المتين: إشعار داخلي (مرة واحدة كحد
    // أقصى) + قناة خارجية (مرة واحدة على الأقل). أي فشل بعد حفظ الطلب لا
    // يُفشل طلب المتسوّق - يُعلَّم الطلب وتتولّاه مصالحة الإشعارات.
    try {
      await orderOps.notifyOwnerOfNewOrder(store, newOrder);
    } catch (notifyErr) {
      logger.warn('order_notify_new_order_failed', { storeId, orderId: newOrder._id, err: notifyErr.message });
      await orderOps.flagNotificationPending(newOrder._id, notifyErr);
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
      const pushHistory = () => {
        if (!Array.isArray(order.history)) order.history = [];
        order.history.push({
          status,
          changedBy: userId || null,
          changedAt: new Date(),
          note: `تغيير الحالة من ${prevStatus} إلى ${status}`
        });
      };

      if (status === 'confirmed' && order.paymentMethod === 'whatsapp_confirmation') {
        // خصم المخزون عند التأكيد عبر نفس بروتوكول التوكنات الذرّي: نية
        // مُخزَّنة (stockStatus) ثم حجز idempotent لكل سطر، حتى لا يخصم
        // تأكيدان متزامنان نفس القطعة ولا يضيع خصم عند انقطاع. المخزون
        // غير الكافي يرفض التأكيد ويبقي الطلب pending بدون سجل زائف.
        order.stockStatus = 'pending';
        await order.save();
        for (const item of order.products) {
          const reservation = await stockService.reserveLine(item.productId, storeId, order._id, item.quantity);
          if (!reservation.ok) {
            await stockService.releaseOrderReservations(order);
            await Order.updateOne({ _id: order._id, stockStatus: 'pending' }, { $set: { stockStatus: 'none', 'opsFlags.stockError': 'confirm failed: insufficient stock' } });
            const name = reservation.product?.productName || item.name || String(item.productId);
            logger.warn('order_confirm_insufficient_stock', { storeId, orderId: order._id, productId: item.productId });
            return res.status(409).json({ message: `لا يمكن تأكيد الطلب: المخزون غير كافٍ للمنتج ${name}` });
          }
        }
        order.status = status;
        order.stockStatus = 'completed';
        pushHistory();
        await order.save();
        // Tokens stay until the TTL-fenced orphan sweep pulls them, for the
        // same in-flight-duplicate idempotency reason as in createOrder.
        logger.info('order_confirm_stock_reserved', { storeId, orderId: order._id });
      } else {
        order.status = status;
        pushHistory();
        await order.save();
      }
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
