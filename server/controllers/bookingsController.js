// server/controllers/bookingsController.js
const Booking = require('../models/Booking');
const Bot = require('../models/Bot');
const logger = require('../logger');
const { dispatchMultiChannelNotification } = require('../services/notificationDispatcher');

const STATUS_ENUM = ['pending', 'confirmed', 'completed', 'rescheduled', 'cancelled'];

const canAccessBot = async (botId, userId, role) => {
  if (role === 'superadmin') return true;
  const bot = await Bot.findById(botId).select('userId');
  if (!bot) return false;
  return String(bot.userId) === String(userId);
};

async function listBookings(req, res) {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const isSuperAdmin = role === 'superadmin';

    let filter = {};
    if (!isSuperAdmin) {
      const bots = await Bot.find({ userId }).select('_id');
      const botIds = bots.map((b) => b._id);
      if (!botIds.length) {
        return res.json({ success: true, data: [], bookings: [], counts: { total: 0, pending: 0, confirmed: 0, byStatus: {} } });
      }
      filter.botId = { $in: botIds };
    } else if (req.query.botId) {
      filter.botId = req.query.botId;
    }

    if (req.query.status && STATUS_ENUM.includes(req.query.status)) {
      filter.status = req.query.status;
    }

    if (req.query.startDate || req.query.endDate) {
      filter.bookingDate = {};
      if (req.query.startDate) filter.bookingDate.$gte = new Date(req.query.startDate);
      if (req.query.endDate) filter.bookingDate.$lte = new Date(req.query.endDate);
    }

    if (req.query.search) {
      const regex = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [
        { customerName: regex },
        { customerPhone: regex },
        { serviceType: regex },
      ];
    }

    const bookings = await Booking.find(filter).sort({ bookingDate: 1, createdAt: -1 }).limit(200);

    const counts = { total: bookings.length, pending: 0, confirmed: 0, byStatus: {} };
    bookings.forEach((b) => {
      counts.byStatus[b.status] = (counts.byStatus[b.status] || 0) + 1;
      if (b.status === 'pending') counts.pending += 1;
      if (b.status === 'confirmed') counts.confirmed += 1;
    });

    return res.json({ success: true, data: bookings, bookings, counts });
  } catch (err) {
    logger.error('bookings_list_error', { userId: req.user.userId, err: err.message });
    return res.status(500).json({ message: 'خطأ في جلب قائمة المواعيد والحجوزات' });
  }
}

async function createBooking(req, res) {
  try {
    const {
      botId,
      customerName,
      customerPhone,
      customerEmail,
      serviceType,
      bookingDate,
      slotDurationMinutes,
      status,
      notes,
    } = req.body;

    if (!botId || !customerName || !bookingDate) {
      return res.status(400).json({ message: 'botId، customerName، و bookingDate مطلوبة' });
    }

    const allowed = await canAccessBot(botId, req.user.userId, req.user.role);
    if (!allowed) return res.status(403).json({ message: 'غير مصرح بالوصول لهذا الوكيل' });

    const safeStatus = STATUS_ENUM.includes(status) ? status : 'pending';
    const parsedDate = new Date(bookingDate);

    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({ message: 'تاريخ الموعد غير صالح' });
    }

    const booking = await Booking.create({
      botId,
      customerName: customerName.trim(),
      customerPhone: (customerPhone || '').trim(),
      customerEmail: (customerEmail || '').trim(),
      serviceType: (serviceType || 'General Appointment').trim(),
      bookingDate: parsedDate,
      slotDurationMinutes: Number(slotDurationMinutes) || 30,
      status: safeStatus,
      notes: (notes || '').trim(),
      history: [{
        status: safeStatus,
        changedBy: req.user.userId,
        note: 'تم إنشاء الموعد يدوياً',
        changedAt: new Date(),
      }],
    });

    // إرسال الإشعار
    dispatchMultiChannelNotification({
      userId: req.user.userId,
      botId,
      event: 'booking_created',
      data: booking,
    }).catch((e) => logger.warn('booking_create_notification_failed', { err: e.message }));

    return res.status(201).json({ success: true, data: booking, booking });
  } catch (err) {
    logger.error('booking_create_error', { err: err.message });
    return res.status(500).json({ message: 'خطأ في إنشاء الموعد' });
  }
}

async function updateBooking(req, res) {
  try {
    const { id } = req.params;
    const {
      customerName,
      customerPhone,
      customerEmail,
      serviceType,
      bookingDate,
      slotDurationMinutes,
      status,
      notes,
      note,
    } = req.body;

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'الموعد غير موجود' });

    const allowed = await canAccessBot(booking.botId, req.user.userId, req.user.role);
    if (!allowed) return res.status(403).json({ message: 'غير مصرح بتعديل هذا الموعد' });

    const prevStatus = booking.status;
    let statusChanged = false;
    let rescheduled = false;

    if (customerName) booking.customerName = customerName.trim();
    if (customerPhone !== undefined) booking.customerPhone = customerPhone.trim();
    if (customerEmail !== undefined) booking.customerEmail = customerEmail.trim();
    if (serviceType) booking.serviceType = serviceType.trim();
    if (notes !== undefined) booking.notes = notes.trim();
    if (slotDurationMinutes) booking.slotDurationMinutes = Number(slotDurationMinutes) || 30;

    if (bookingDate) {
      const newDate = new Date(bookingDate);
      if (!isNaN(newDate.getTime()) && newDate.getTime() !== new Date(booking.bookingDate).getTime()) {
        booking.bookingDate = newDate;
        rescheduled = true;
      }
    }

    if (status && STATUS_ENUM.includes(status) && status !== booking.status) {
      booking.status = status;
      statusChanged = true;
    }

    if (statusChanged || rescheduled || note) {
      if (!Array.isArray(booking.history)) booking.history = [];
      booking.history.push({
        status: booking.status,
        changedBy: req.user.userId,
        note: note || (rescheduled ? 'تم تعديل تاريخ الموعد' : 'تحديث بيانات الموعد'),
        changedAt: new Date(),
      });
    }

    await booking.save();

    // إرسال إشعار بالتحديث
    const eventType = statusChanged
      ? (booking.status === 'cancelled' ? 'booking_cancelled' : (rescheduled ? 'booking_rescheduled' : 'booking_status'))
      : (rescheduled ? 'booking_rescheduled' : 'booking_updated');

    dispatchMultiChannelNotification({
      userId: req.user.userId,
      botId: booking.botId,
      event: eventType,
      data: booking,
    }).catch((e) => logger.warn('booking_update_notification_failed', { err: e.message }));

    return res.json({ success: true, data: booking, booking });
  } catch (err) {
    logger.error('booking_update_error', { id: req.params.id, err: err.message });
    return res.status(500).json({ message: 'خطأ في تحديث الموعد' });
  }
}

async function deleteBooking(req, res) {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'الموعد غير موجود' });

    const allowed = await canAccessBot(booking.botId, req.user.userId, req.user.role);
    if (!allowed) return res.status(403).json({ message: 'غير مصرح بحذف هذا الموعد' });

    await booking.deleteOne();
    return res.json({ success: true, message: 'تم حذف الموعد بنجاح' });
  } catch (err) {
    logger.error('booking_delete_error', { id: req.params.id, err: err.message });
    return res.status(500).json({ message: 'خطأ في حذف الموعد' });
  }
}

/**
 * دالة استخراج وإنشاء/تعديل الحجز تلقائياً من محادثة الذكاء الاصطناعي
 */
async function createOrUpdateFromExtraction({
  botId,
  channel,
  conversationId,
  sourceUserId,
  sourceUsername,
  customerName,
  customerPhone,
  customerEmail,
  serviceType,
  bookingDate,
  notes,
  status,
  isReschedule,
  isCancel,
}) {
  if (!botId || !customerName || !bookingDate) {
    logger.warn('booking_extraction_skipped_missing_required_fields', { botId, customerName, bookingDate });
    return null;
  }

  const parsedDate = new Date(bookingDate);
  if (isNaN(parsedDate.getTime())) {
    logger.warn('booking_extraction_invalid_date', { bookingDate });
    return null;
  }

  // البحث عن حجز مفتوح مسبقاً لهذا العميل
  let existingBooking = null;
  if (conversationId) {
    existingBooking = await Booking.findOne({
      botId,
      conversationId,
      status: { $in: ['pending', 'confirmed', 'rescheduled'] },
    }).sort({ createdAt: -1 });
  }

  if (!existingBooking && customerPhone) {
    existingBooking = await Booking.findOne({
      botId,
      customerPhone,
      status: { $in: ['pending', 'confirmed', 'rescheduled'] },
    }).sort({ createdAt: -1 });
  }

  if (isCancel && existingBooking) {
    existingBooking.status = 'cancelled';
    existingBooking.history.push({
      status: 'cancelled',
      changedBy: null,
      note: 'تم الإلغاء عبر محادثة الذكاء الاصطناعي',
      changedAt: new Date(),
    });
    await existingBooking.save();

    dispatchMultiChannelNotification({
      botId,
      event: 'booking_cancelled',
      data: existingBooking,
    }).catch(() => {});

    return existingBooking;
  }

  if (existingBooking && (isReschedule || ['pending', 'confirmed'].includes(existingBooking.status))) {
    existingBooking.bookingDate = parsedDate;
    if (customerName) existingBooking.customerName = customerName;
    if (customerPhone) existingBooking.customerPhone = customerPhone;
    if (serviceType) existingBooking.serviceType = serviceType;
    if (notes) existingBooking.notes = notes;
    if (status && STATUS_ENUM.includes(status)) existingBooking.status = status;
    else if (isReschedule) existingBooking.status = 'rescheduled';

    existingBooking.history.push({
      status: existingBooking.status,
      changedBy: null,
      note: isReschedule ? 'تم تعديل الموعد تلقائياً من المحادثة' : 'تحديث بيانات الحجز من المحادثة',
      changedAt: new Date(),
    });

    await existingBooking.save();

    dispatchMultiChannelNotification({
      botId,
      event: isReschedule ? 'booking_rescheduled' : 'booking_created',
      data: existingBooking,
    }).catch(() => {});

    return existingBooking;
  }

  const safeStatus = STATUS_ENUM.includes(status) ? status : 'pending';
  const booking = await Booking.create({
    botId,
    conversationId,
    channel: channel || 'web',
    sourceUserId: sourceUserId || '',
    sourceUsername: sourceUsername || '',
    customerName: customerName.trim(),
    customerPhone: (customerPhone || '').trim(),
    customerEmail: (customerEmail || '').trim(),
    serviceType: serviceType || 'General Appointment',
    bookingDate: parsedDate,
    status: safeStatus,
    notes: notes || '',
    history: [{
      status: safeStatus,
      changedBy: null,
      note: 'تم الإنشاء تلقائياً عبر الوكيل الذكي',
      changedAt: new Date(),
    }],
  });

  logger.info('booking_created_by_ai', { botId, bookingId: booking._id, customerName, bookingDate });

  dispatchMultiChannelNotification({
    botId,
    event: 'booking_created',
    data: booking,
  }).catch(() => {});

  return booking;
}

module.exports = {
  listBookings,
  createBooking,
  updateBooking,
  deleteBooking,
  createOrUpdateFromExtraction,
};
