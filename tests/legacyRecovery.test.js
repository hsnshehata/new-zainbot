const test = require('node:test');
const assert = require('node:assert/strict');

function normalizeConversationMessages(messages) {
  return (messages || []).map((m) => {
    const role = m.role || (m.sender === 'user' ? 'user' : 'assistant');
    const content = m.content || m.text || m.message || '';
    return {
      _id: m._id,
      messageId: m.messageId,
      role,
      sender: role === 'user' ? 'user' : 'bot',
      content,
      text: content,
      timestamp: m.timestamp || m.createdAt || new Date(),
    };
  });
}

function normalizeStoreOrder(order) {
  return {
    _id: order._id,
    orderId: order._id,
    customerName: order.customerName || 'عميل المتجر',
    customerPhone: order.customerWhatsapp || order.customerPhone || '',
    customerAddress: order.customerAddress || '',
    totalAmount: order.totalPrice || 0,
    status: order.status || 'pending',
    channel: 'store',
    items: (order.products || []).map(p => ({
      title: p.name || 'منتج',
      quantity: p.quantity || 1,
      price: p.price || 0,
      currency: p.currency || 'EGP'
    })),
    notes: order.customerNote || '',
    createdAt: order.createdAt || new Date(),
    isStoreOrder: true,
  };
}

test('normalizeConversationMessages correctly bridges legacy sender/text to role/content', () => {
  const legacyMessages = [
    { sender: 'user', text: 'أهلاً بك', timestamp: new Date() },
    { sender: 'bot', text: 'مرحباً، كيف أساعدك اليوم؟', timestamp: new Date() },
    { role: 'user', content: 'ما هي أسعار المنتجات؟', timestamp: new Date() },
  ];

  const normalized = normalizeConversationMessages(legacyMessages);
  assert.equal(normalized.length, 3);
  assert.equal(normalized[0].role, 'user');
  assert.equal(normalized[0].content, 'أهلاً بك');
  assert.equal(normalized[1].role, 'assistant');
  assert.equal(normalized[1].content, 'مرحباً، كيف أساعدك اليوم؟');
  assert.equal(normalized[2].role, 'user');
  assert.equal(normalized[2].content, 'ما هي أسعار المنتجات؟');
});

test('normalizeStoreOrder transforms catalog order into unified orders structure', () => {
  const storeOrder = {
    _id: '654321abcdef1234567890cd',
    customerName: 'محمود حسن',
    customerWhatsapp: '01012345678',
    customerAddress: 'الإسكندرية، سموحة',
    totalPrice: 850,
    status: 'pending',
    products: [
      { name: 'حذاء رياضي أسود', quantity: 1, price: 800, currency: 'EGP' },
      { name: 'شحن', quantity: 1, price: 50, currency: 'EGP' },
    ],
    customerNote: 'يرجى الاتصال قبل التوصيل',
    createdAt: new Date(),
  };

  const unified = normalizeStoreOrder(storeOrder);
  assert.equal(unified.customerName, 'محمود حسن');
  assert.equal(unified.customerPhone, '01012345678');
  assert.equal(unified.totalAmount, 850);
  assert.equal(unified.isStoreOrder, true);
  assert.equal(unified.items.length, 2);
  assert.equal(unified.items[0].title, 'حذاء رياضي أسود');
});
