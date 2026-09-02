const test = require('node:test');
const assert = require('node:assert/strict');
const { formatOrderNotificationMessage, formatBookingNotificationMessage } = require('../server/services/notificationDispatcher');

test('formatOrderNotificationMessage creates proper bilingual alert text', () => {
  const order = {
    _id: '654321abcdef1234567890ab',
    customerName: 'أحمد محمود',
    customerPhone: '01012345678',
    customerAddress: 'القاهرة، المعادي',
    totalAmount: 450,
    items: [{ title: 'تيشيرت أسود قطن', quantity: 2, price: 200 }, { title: 'مصاريف الشحن', quantity: 1, price: 50 }],
  };

  const message = formatOrderNotificationMessage(order, 'created');
  assert.match(message, /طلب جديد من المحادثة/);
  assert.match(message, /أحمد محمود/);
  assert.match(message, /01012345678/);
  assert.match(message, /450/);
});

test('formatBookingNotificationMessage creates proper bilingual appointment alert text', () => {
  const booking = {
    _id: '654321abcdef1234567890bc',
    customerName: 'سارة علي',
    customerPhone: '01123456789',
    serviceType: 'استشارة تسويقية',
    bookingDate: new Date('2026-10-15T14:30:00Z'),
    slotDurationMinutes: 45,
    notes: 'ترغب في مناقشة خطة إعلانات تيك توك',
  };

  const message = formatBookingNotificationMessage(booking, 'created');
  assert.match(message, /حجز موعد جديد من المحادثة/);
  assert.match(message, /سارة علي/);
  assert.match(message, /01123456789/);
  assert.match(message, /استشارة تسويقية/);
});
