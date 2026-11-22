'use strict';

// server/services/assistantDataTools.js
// Read-only business data tools behind the owner assistant ("مساعد زين").
//
// Every tool runs strictly inside the caller's tenant scope: commerce data
// is filtered by the owner's stores, channel data by the owner's bots. No
// tool accepts a store/bot/user id from the outside — scoping is derived
// from the authenticated user only.
//
// Each tool returns a compact JSON-safe object so it can be embedded in an
// AI prompt directly, and ships a bilingual render() used by the
// deterministic fallback answer when no AI provider key is configured.

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(now, days) {
  return new Date(startOfDay(now).getTime() - (days - 1) * DAY_MS);
}

function monthStart(now) {
  const d = startOfDay(now);
  d.setDate(1);
  return d;
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function sumBy(docs, field) {
  return round2((docs || []).reduce((sum, doc) => sum + (Number(doc[field]) || 0), 0));
}

const AR = {
  sales: 'المبيعات',
  expenses: 'المصروفات',
  today: 'اليوم',
  last7: 'آخر 7 أيام',
  month: 'الشهر الحالي',
  orders: 'الطلبات',
  products: 'المنتجات',
  customers: 'العملاء',
  bookings: 'المواعيد',
  inbox: 'الرسائل',
  bots: 'الوكلاء',
  lowStock: 'مخزون منخفض',
  noData: 'لا توجد بيانات بعد.',
};

const STATUS_AR = {
  pending: 'قيد الانتظار',
  processing: 'قيد التجهيز',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  completed: 'مكتمل',
  rescheduled: 'معاد جدولته',
};

function statusLabel(status, lang) {
  if (lang !== 'ar') return status;
  return STATUS_AR[status] || status;
}

/**
 * Build the tool registry. All model access goes through deps.models so the
 * registry is unit-testable without a database.
 *
 * ctx = { now: Date, storeIds: ObjectId[], botIds: ObjectId[] }
 */
function createAssistantDataTools(deps = {}) {
  const models = deps.models || {};

  async function sumSales(storeIds, since) {
    const match = { storeId: { $in: storeIds } };
    if (since) match.createdAt = { $gte: since };
    const rows = await models.Sale.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
    ]);
    return { total: round2(rows[0]?.total), count: rows[0]?.count || 0 };
  }

  async function sumExpenses(storeIds, since) {
    const match = { storeId: { $in: storeIds } };
    if (since) match.createdAt = { $gte: since };
    const rows = await models.Expense.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return { total: round2(rows[0]?.total), count: rows[0]?.count || 0 };
  }

  async function countByStatus(model, scopeField, scopeIds, extra = {}) {
    const rows = await model.aggregate([
      { $match: { [scopeField]: { $in: scopeIds }, ...extra } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const byStatus = {};
    for (const row of rows) byStatus[row._id || 'unknown'] = row.count;
    return byStatus;
  }

  const tools = [
    {
      id: 'business_snapshot',
      always: true,
      keywords: [],
      async run(ctx) {
        const todayStart = startOfDay(ctx.now);
        const [salesToday, expensesToday, conversationsToday, pendingOrders, upcomingBookings, bots, storesCount] = await Promise.all([
          ctx.storeIds.length ? sumSales(ctx.storeIds, todayStart) : { total: 0, count: 0 },
          ctx.storeIds.length ? sumExpenses(ctx.storeIds, todayStart) : { total: 0, count: 0 },
          ctx.botIds.length
            ? models.Conversation.countDocuments({ botId: { $in: ctx.botIds }, 'messages.timestamp': { $gte: todayStart } })
            : 0,
          ctx.botIds.length
            ? models.ChatOrder.countDocuments({ botId: { $in: ctx.botIds }, status: { $in: ['pending', 'processing'] } })
            : 0,
          ctx.botIds.length
            ? models.Booking.countDocuments({
              botId: { $in: ctx.botIds },
              bookingDate: { $gte: ctx.now, $lte: new Date(ctx.now.getTime() + 7 * DAY_MS) },
              status: { $in: ['pending', 'confirmed'] },
            })
            : 0,
          models.Bot.find({ _id: { $in: ctx.botIds } }).select('name isActive').lean(),
          models.Store.countDocuments({ _id: { $in: ctx.storeIds } }),
        ]);
        return {
          date: todayStart.toISOString().slice(0, 10),
          stores: storesCount,
          bots: {
            total: bots.length,
            active: bots.filter((bot) => bot.isActive).length,
          },
          salesToday,
          expensesToday,
          profitToday: round2(salesToday.total - expensesToday.total),
          conversationsToday,
          pendingOrders,
          upcomingBookingsNext7Days: upcomingBookings,
        };
      },
      render(data, lang) {
        if (lang === 'ar') {
          return `📊 ملخص ${AR.today} (${data.date}):\n` +
            `• ${AR.sales}: ${data.salesToday.total} (${data.salesToday.count} عملية)\n` +
            `• ${AR.expenses}: ${data.expensesToday.total} (${data.expensesToday.count} عملية)\n` +
            `• صافي ${AR.today}: ${data.profitToday}\n` +
            `• محادثات ${AR.today}: ${data.conversationsToday}\n` +
            `• طلبات تحتاج متابعة: ${data.pendingOrders}\n` +
            `• ${AR.bookings} القادمة (7 أيام): ${data.upcomingBookingsNext7Days}\n` +
            `• ${AR.bots} النشطة: ${data.bots.active} من ${data.bots.total}`;
        }
        return `📊 Today's snapshot (${data.date}):\n` +
          `• Sales: ${data.salesToday.total} (${data.salesToday.count} sales)\n` +
          `• Expenses: ${data.expensesToday.total} (${data.expensesToday.count} entries)\n` +
          `• Net today: ${data.profitToday}\n` +
          `• Conversations today: ${data.conversationsToday}\n` +
          `• Orders needing follow-up: ${data.pendingOrders}\n` +
          `• Upcoming bookings (7 days): ${data.upcomingBookingsNext7Days}\n` +
          `• Active agents: ${data.bots.active} of ${data.bots.total}`;
      },
    },
    {
      id: 'sales_summary',
      keywords: ['مبيعات', 'المبيعات', 'بيع', 'ربح', 'ارباح', 'أرباح', 'ايراد', 'إيراد', 'دخل', 'sales', 'revenue', 'profit', 'income'],
      async run(ctx) {
        if (!ctx.storeIds.length) return { empty: true };
        const [today, week, month, recent] = await Promise.all([
          sumSales(ctx.storeIds, startOfDay(ctx.now)),
          sumSales(ctx.storeIds, daysAgo(ctx.now, 7)),
          sumSales(ctx.storeIds, monthStart(ctx.now)),
          models.Sale.find({ storeId: { $in: ctx.storeIds } })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('total createdAt items.name items.qty')
            .lean(),
        ]);
        return {
          today,
          last7Days: week,
          thisMonth: month,
          recent: recent.map((sale) => ({
            total: sale.total,
            date: sale.createdAt,
            items: (sale.items || []).map((item) => `${item.name || 'item'} x${item.qty || 1}`),
          })),
        };
      },
      render(data, lang) {
        if (data.empty) return lang === 'ar' ? `${AR.sales}: ${AR.noData}` : `Sales: no data yet.`;
        if (lang === 'ar') {
          return `💰 ${AR.sales}:\n• ${AR.today}: ${data.today.total} (${data.today.count})\n` +
            `• ${AR.last7}: ${data.last7Days.total} (${data.last7Days.count})\n` +
            `• ${AR.month}: ${data.thisMonth.total} (${data.thisMonth.count})`;
        }
        return `💰 Sales:\n• Today: ${data.today.total} (${data.today.count})\n` +
          `• Last 7 days: ${data.last7Days.total} (${data.last7Days.count})\n` +
          `• This month: ${data.thisMonth.total} (${data.thisMonth.count})`;
      },
    },
    {
      id: 'expenses_summary',
      keywords: ['مصروف', 'مصروفات', 'المصروفات', 'مصاريف', 'تكاليف', 'expense', 'expenses', 'costs', 'spending'],
      async run(ctx) {
        if (!ctx.storeIds.length) return { empty: true };
        const [today, week, month, recent] = await Promise.all([
          sumExpenses(ctx.storeIds, startOfDay(ctx.now)),
          sumExpenses(ctx.storeIds, daysAgo(ctx.now, 7)),
          sumExpenses(ctx.storeIds, monthStart(ctx.now)),
          models.Expense.find({ storeId: { $in: ctx.storeIds } })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('amount reason payee createdAt')
            .lean(),
        ]);
        return {
          today,
          last7Days: week,
          thisMonth: month,
          recent: recent.map((expense) => ({
            amount: expense.amount,
            reason: expense.reason || '',
            payee: expense.payee || '',
            date: expense.createdAt,
          })),
        };
      },
      render(data, lang) {
        if (data.empty) return lang === 'ar' ? `${AR.expenses}: ${AR.noData}` : `Expenses: no data yet.`;
        if (lang === 'ar') {
          return `💸 ${AR.expenses}:\n• ${AR.today}: ${data.today.total} (${data.today.count})\n` +
            `• ${AR.last7}: ${data.last7Days.total} (${data.last7Days.count})\n` +
            `• ${AR.month}: ${data.thisMonth.total} (${data.thisMonth.count})`;
        }
        return `💸 Expenses:\n• Today: ${data.today.total} (${data.today.count})\n` +
          `• Last 7 days: ${data.last7Days.total} (${data.last7Days.count})\n` +
          `• This month: ${data.thisMonth.total} (${data.thisMonth.count})`;
      },
    },
    {
      id: 'orders_status',
      keywords: ['طلب', 'طلبات', 'الطلبات', 'اوردر', 'أوردر', 'شحن', 'order', 'orders', 'shipping', 'delivery'],
      async run(ctx) {
        const chatOrders = ctx.botIds.length
          ? await countByStatus(models.ChatOrder, 'botId', ctx.botIds)
          : {};
        const storeOrders = ctx.storeIds.length
          ? await countByStatus(models.Order, 'storeId', ctx.storeIds)
          : {};
        const pendingValue = ctx.botIds.length
          ? await models.ChatOrder.aggregate([
            { $match: { botId: { $in: ctx.botIds }, status: { $in: ['pending', 'processing'] } } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
          ])
          : [];
        return {
          chatOrders,
          storeOrders,
          openOrdersValue: round2(pendingValue[0]?.total),
        };
      },
      render(data, lang) {
        const format = (byStatus) => {
          const entries = Object.entries(byStatus);
          if (!entries.length) return lang === 'ar' ? AR.noData : 'no data yet';
          return entries.map(([status, count]) => `${statusLabel(status, lang)}: ${count}`).join('، ');
        };
        if (lang === 'ar') {
          return `🛒 ${AR.orders}:\n• من المحادثات: ${format(data.chatOrders)}\n• من المتجر: ${format(data.storeOrders)}\n• قيمة الطلبات المفتوحة: ${data.openOrdersValue}`;
        }
        return `🛒 Orders:\n• From chats: ${format(data.chatOrders)}\n• From store: ${format(data.storeOrders)}\n• Open orders value: ${data.openOrdersValue}`;
      },
    },
    {
      id: 'top_products',
      keywords: ['منتج', 'منتجات', 'الأكثر مبيع', 'الاكثر مبيعا', 'بضاعة', 'مخزون', 'stock', 'product', 'products', 'best seller', 'top selling', 'inventory'],
      async run(ctx) {
        if (!ctx.storeIds.length) return { empty: true };
        const since = daysAgo(ctx.now, 30);
        const rows = await models.Sale.aggregate([
          { $match: { storeId: { $in: ctx.storeIds }, createdAt: { $gte: since } } },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.name',
              qty: { $sum: '$items.qty' },
              total: { $sum: '$items.total' },
            },
          },
          { $sort: { qty: -1 } },
          { $limit: 5 },
        ]);
        const lowStock = await models.Product.find({ storeId: { $in: ctx.storeIds }, stockTracked: true })
          .select('productName stock lowStockThreshold')
          .lean();
        const low = lowStock
          .filter((product) => Number(product.stock) <= Number(product.lowStockThreshold ?? 5))
          .slice(0, 10)
          .map((product) => ({ name: product.productName, stock: product.stock, threshold: product.lowStockThreshold ?? 5 }));
        return {
          periodDays: 30,
          top: rows.map((row) => ({ name: row._id || 'item', qty: row.qty, total: round2(row.total) })),
          lowStock: low,
        };
      },
      render(data, lang) {
        if (data.empty) return lang === 'ar' ? `${AR.products}: ${AR.noData}` : `Products: no data yet.`;
        const top = data.top.length
          ? data.top.map((p, i) => `${i + 1}. ${p.name} (${p.qty})`).join('، ')
          : (lang === 'ar' ? AR.noData : 'no sales in 30 days');
        const low = data.lowStock.length
          ? data.lowStock.map((p) => `${p.name} (${p.stock})`).join('، ')
          : (lang === 'ar' ? 'لا يوجد' : 'none');
        if (lang === 'ar') {
          return `📦 ${AR.products} (30 يوم):\n• الأكثر مبيعًا: ${top}\n• ${AR.lowStock}: ${low}`;
        }
        return `📦 Products (30 days):\n• Top selling: ${top}\n• Low stock: ${low}`;
      },
    },
    {
      id: 'customers_summary',
      keywords: ['عميل', 'عملاء', 'العملاء', 'زبون', 'زبائن', 'customer', 'customers', 'clients'],
      async run(ctx) {
        if (!ctx.storeIds.length) return { empty: true };
        const [total, newThisMonth, top] = await Promise.all([
          models.Customer.countDocuments({ storeId: { $in: ctx.storeIds } }),
          models.Customer.countDocuments({ storeId: { $in: ctx.storeIds }, createdAt: { $gte: monthStart(ctx.now) } }),
          models.Customer.find({ storeId: { $in: ctx.storeIds } })
            .sort({ totalSpent: -1 })
            .limit(3)
            .select('name phone totalSpent totalOrders currency')
            .lean(),
        ]);
        return {
          total,
          newThisMonth,
          top: top.map((customer) => ({
            name: customer.name || customer.phone,
            totalSpent: customer.totalSpent || 0,
            totalOrders: customer.totalOrders || 0,
            currency: customer.currency || 'EGP',
          })),
        };
      },
      render(data, lang) {
        if (data.empty) return lang === 'ar' ? `${AR.customers}: ${AR.noData}` : `Customers: no data yet.`;
        if (lang === 'ar') {
          return `👥 ${AR.customers}:\n• الإجمالي: ${data.total}\n• جدد ${AR.month}: ${data.newThisMonth}`;
        }
        return `👥 Customers:\n• Total: ${data.total}\n• New this month: ${data.newThisMonth}`;
      },
    },
    {
      id: 'upcoming_bookings',
      keywords: ['حجز', 'حجوزات', 'موعد', 'مواعيد', 'الحجوزات', 'booking', 'bookings', 'appointment', 'appointments'],
      async run(ctx) {
        if (!ctx.botIds.length) return { empty: true };
        const upcoming = await models.Booking.find({
          botId: { $in: ctx.botIds },
          bookingDate: { $gte: ctx.now },
          status: { $in: ['pending', 'confirmed', 'rescheduled'] },
        })
          .sort({ bookingDate: 1 })
          .limit(5)
          .select('customerName serviceType bookingDate status')
          .lean();
        return {
          count: upcoming.length,
          upcoming: upcoming.map((booking) => ({
            customer: booking.customerName,
            service: booking.serviceType,
            date: booking.bookingDate,
            status: booking.status,
          })),
        };
      },
      render(data, lang) {
        if (data.empty || !data.upcoming.length) {
          return lang === 'ar' ? `📅 ${AR.bookings}: ${AR.noData}` : `📅 Bookings: none upcoming.`;
        }
        const lines = data.upcoming.map((booking) => {
          const date = new Date(booking.date).toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', { timeZone: 'Africa/Cairo' });
          return `• ${booking.customer} — ${booking.service} (${date})`;
        });
        return (lang === 'ar' ? `📅 ${AR.bookings} القادمة:\n` : `📅 Upcoming bookings:\n`) + lines.join('\n');
      },
    },
    {
      id: 'inbox_stats',
      keywords: ['رسائل', 'الرسائل', 'محادثة', 'محادثات', 'المحادثات', 'اينبوكس', 'message', 'messages', 'conversation', 'conversations', 'inbox'],
      async run(ctx) {
        if (!ctx.botIds.length) return { empty: true };
        const todayStart = startOfDay(ctx.now);
        const weekStart = daysAgo(ctx.now, 7);
        const [today, week, byChannel] = await Promise.all([
          models.Conversation.countDocuments({ botId: { $in: ctx.botIds }, 'messages.timestamp': { $gte: todayStart } }),
          models.Conversation.countDocuments({ botId: { $in: ctx.botIds }, 'messages.timestamp': { $gte: weekStart } }),
          models.Conversation.aggregate([
            { $match: { botId: { $in: ctx.botIds } } },
            { $group: { _id: '$channel', count: { $sum: 1 } } },
          ]),
        ]);
        const channels = {};
        for (const row of byChannel) channels[row._id || 'unknown'] = row.count;
        return { today, last7Days: week, channels };
      },
      render(data, lang) {
        if (data.empty) return lang === 'ar' ? `${AR.inbox}: ${AR.noData}` : `Inbox: no data yet.`;
        if (lang === 'ar') {
          return `💬 ${AR.inbox}:\n• محادثات ${AR.today}: ${data.today}\n• ${AR.last7}: ${data.last7Days}`;
        }
        return `💬 Inbox:\n• Conversations today: ${data.today}\n• Last 7 days: ${data.last7Days}`;
      },
    },
    {
      id: 'bots_status',
      keywords: ['بوت', 'البوت', 'وكيل', 'وكلاء', 'الوكيل', 'شغال', 'متوقف', 'bot', 'bots', 'agent', 'agents', 'status'],
      async run(ctx) {
        const bots = await models.Bot.find({ _id: { $in: ctx.botIds } })
          .select('name isActive createdAt')
          .lean();
        return {
          bots: bots.map((bot) => ({ name: bot.name, active: Boolean(bot.isActive) })),
        };
      },
      render(data, lang) {
        if (!data.bots.length) return lang === 'ar' ? `${AR.bots}: ${AR.noData}` : `Agents: none yet.`;
        const lines = data.bots.map((bot) => {
          const state = bot.active
            ? (lang === 'ar' ? 'نشط' : 'active')
            : (lang === 'ar' ? 'متوقف' : 'paused');
          return `• ${bot.name}: ${state}`;
        });
        return (lang === 'ar' ? `🤖 ${AR.bots}:\n` : `🤖 Agents:\n`) + lines.join('\n');
      },
    },
  ];

  const byId = new Map(tools.map((tool) => [tool.id, tool]));

  /**
   * Pick tools for a question: the always-on snapshot plus up to `maxExtra`
   * keyword-matched tools, in registry order.
   */
  function selectTools(question, { maxExtra = 3 } = {}) {
    const text = String(question || '').toLowerCase();
    const selected = tools.filter((tool) => tool.always);
    for (const tool of tools) {
      if (tool.always) continue;
      if (selected.length >= 1 + maxExtra) break;
      if (tool.keywords.some((keyword) => keyword && text.includes(keyword.toLowerCase()))) {
        selected.push(tool);
      }
    }
    return selected;
  }

  async function runTools(selected, ctx) {
    const results = {};
    for (const tool of selected) {
      // A single failing tool must not take down the whole answer; record
      // the failure and let the caller see which tool dropped out.
      try {
        results[tool.id] = await tool.run(ctx);
      } catch (error) {
        results[tool.id] = { error: 'unavailable' };
      }
    }
    return results;
  }

  function renderFallback(selected, results, lang) {
    return selected
      .filter((tool) => results[tool.id] && !results[tool.id].error)
      .map((tool) => tool.render(results[tool.id], lang))
      .join('\n\n');
  }

  return {
    tools,
    byId,
    selectTools,
    runTools,
    renderFallback,
  };
}

module.exports = {
  createAssistantDataTools,
  startOfDay,
  daysAgo,
  monthStart,
};
