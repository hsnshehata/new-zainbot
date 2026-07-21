// public/js/overview.js
(function() {
  console.log("overview.js loaded at", new Date().toISOString());

  const ctx = window.dashboardCtx || {};
  const OVERVIEW_CACHE_PREFIX = 'dashboard_overview_cache_v1';
  const buildOverviewCacheKey = (botId) => `${OVERVIEW_CACHE_PREFIX}:${botId || 'anonymous'}`;

  function readOverviewCache(botId) {
    try {
      const cached = localStorage.getItem(buildOverviewCacheKey(botId));
      return cached ? JSON.parse(cached) : null;
    } catch (err) {
      console.warn('Failed to read overview cache:', err);
      return null;
    }
  }

  function writeOverviewCache(botId, snapshot) {
    try {
      localStorage.setItem(buildOverviewCacheKey(botId), JSON.stringify({
        ...snapshot,
        cachedAt: Date.now(),
      }));
    } catch (err) {
      console.warn('Failed to write overview cache:', err);
    }
  }

  // expose cache helpers back to dashboard context
  if (ctx) {
    ctx.readOverviewCache = readOverviewCache;
    ctx.writeOverviewCache = writeOverviewCache;
  }

  let channelsChart, ordersStatusChart, dailyMessagesChart;

  function renderCharts(channelsData, ordersData, dailyMessagesData) {
    const isDarkMode = document.body.classList.contains('dark-mode');
    const textColor = isDarkMode ? '#E0E0E0' : '#333333';
    const gridColor = isDarkMode ? '#3A3A4E' : '#D1D5DB';

    if (channelsChart) channelsChart.destroy();
    if (ordersStatusChart) ordersStatusChart.destroy();
    if (dailyMessagesChart) dailyMessagesChart.destroy();

    const channelsCtx = document.getElementById('channelsChart');
    if (channelsCtx) {
      channelsChart = new Chart(channelsCtx, {
        type: 'doughnut',
        data: {
          labels: ['فيسبوك', 'إنستجرام', 'واتساب', 'ويب'],
          datasets: [{
            data: [channelsData.facebook, channelsData.instagram, channelsData.whatsapp, channelsData.web],
            backgroundColor: ['#1877F2', '#E4405F', '#25D366', '#0ea5e9'],
            borderWidth: 2,
            borderColor: isDarkMode ? '#1A1A2E' : '#FFFFFF'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: textColor,
                font: { size: 14, family: 'Cairo, sans-serif' },
                padding: 15
              }
            },
            tooltip: { rtl: true, textDirection: 'rtl' }
          }
        }
      });
    }

    const ordersCtx = document.getElementById('ordersStatusChart');
    if (ordersCtx) {
      ordersStatusChart = new Chart(ordersCtx, {
        type: 'bar',
        data: {
          labels: ['قيد الانتظار', 'مكتملة', 'ملغاة'],
          datasets: [{
            label: 'عدد الطلبات',
            data: [ordersData.pending, ordersData.completed, ordersData.cancelled],
            backgroundColor: ['#FFA500', '#00C4B4', '#FF6B6B'],
            borderWidth: 2,
            borderColor: isDarkMode ? '#1A1A2E' : '#FFFFFF'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: { rtl: true, textDirection: 'rtl' }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: textColor, font: { family: 'Cairo, sans-serif' } },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: textColor, font: { family: 'Cairo, sans-serif' } },
              grid: { color: gridColor }
            }
          }
        }
      });
    }

    const dailyCtx = document.getElementById('dailyMessagesChart');
    if (dailyCtx && dailyMessagesData.length > 0) {
      const last7Days = dailyMessagesData.slice(-7);
      dailyMessagesChart = new Chart(dailyCtx, {
        type: 'line',
        data: {
          labels: last7Days.map(d => new Date(d.date).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })),
          datasets: [{
            label: 'عدد المحادثات',
            data: last7Days.map(d => d.count),
            borderColor: '#00C4B4',
            backgroundColor: 'rgba(0, 196, 180, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: '#00C4B4',
            pointBorderColor: '#FFFFFF',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              rtl: true,
              textDirection: 'rtl',
              backgroundColor: isDarkMode ? '#2A2A3E' : '#FFFFFF',
              titleColor: textColor,
              bodyColor: textColor,
              borderColor: '#00C4B4',
              borderWidth: 1
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: textColor, font: { family: 'Cairo, sans-serif' } },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: textColor, font: { family: 'Cairo, sans-serif' } },
              grid: { color: gridColor }
            }
          }
        }
      });
    }
  }

  function applyOverviewData(snapshot, source = 'network') {
    if (!snapshot) return;
    const totals = snapshot.totals || {};
    const ordersCard = snapshot.ordersCard || {};
    const botInfo = snapshot.botInfo || {};
    const charts = snapshot.charts || {};

    const totalConversationsEl = document.getElementById('total-conversations');
    if (totalConversationsEl) totalConversationsEl.textContent = totals.conversations ?? '0';

    const totalOrdersEl = document.getElementById('total-orders');
    if (totalOrdersEl) totalOrdersEl.textContent = totals.orders ?? '0';

    const totalRevenueEl = document.getElementById('total-revenue');
    if (totalRevenueEl) totalRevenueEl.textContent = totals.revenueText ?? '0 ج.م';

    const totalProductsEl = document.getElementById('total-products');
    if (totalProductsEl) totalProductsEl.textContent = totals.productsText ?? '0';

    const totalFeedbackEl = document.getElementById('total-feedback');
    if (totalFeedbackEl) totalFeedbackEl.textContent = totals.feedback ?? '0';

    const botStatusEl = document.getElementById('bot-status');
    if (botStatusEl) botStatusEl.textContent = botInfo.statusText ?? 'غير معروف';

    const botExpiryEl = document.getElementById('bot-expiry');
    if (botExpiryEl && botInfo.expiryText) botExpiryEl.textContent = botInfo.expiryText;

    const ordersTitleEl = document.getElementById('orders-card-title');
    if (ordersTitleEl && ordersCard.title) ordersTitleEl.textContent = ordersCard.title;

    const ordersSubEl = document.getElementById('orders-card-sub');
    if (ordersSubEl && ordersCard.subtitle) ordersSubEl.textContent = ordersCard.subtitle;

    const safeChannelsData = charts.channelsData || { facebook: 0, instagram: 0, whatsapp: 0, web: 0 };
    const safeOrdersData = charts.ordersData || { pending: 0, completed: 0, cancelled: 0 };
    const safeDailyMessagesData = charts.dailyMessagesData || [];
    renderCharts(safeChannelsData, safeOrdersData, safeDailyMessagesData);

    console.log(`Overview UI updated from ${source} snapshot at`, new Date().toISOString());
  }

  async function loadOverviewStats(navSnapshot) {
    console.log("loadOverviewStats called...");
    const thisNav = navSnapshot ?? ctx.getNavToken?.() ?? 0;
    if (thisNav !== (ctx.getNavToken?.() ?? thisNav)) {
      console.warn('Stale overview stats skipped at start');
      return;
    }

    const selectedBotId = localStorage.getItem("selectedBotId");
    const token = ctx.getToken?.();
    const availableBots = ctx.getAvailableBots?.() || [];

    if (!selectedBotId || !token) return;

    const snapshot = {
      botId: selectedBotId,
      totals: {
        conversations: 0,
        orders: 0,
        revenue: 0,
        revenueText: '0 ج.م',
        products: 0,
        productsText: '0',
        customers: 0,
        customersText: '0',
        feedback: 0,
      },
      ordersCard: { title: 'الطلبات', subtitle: 'إجمالي الطلبات' },
      botInfo: { statusText: 'جاري التحميل...', subscriptionText: 'جاري التحميل...', expiryText: 'جاري التحميل...' },
      charts: {
        channelsData: { facebook: 0, instagram: 0, whatsapp: 0, web: 0 },
        ordersData: { pending: 0, completed: 0, cancelled: 0 },
        dailyMessagesData: [],
      },
      meta: { updatedAt: Date.now() },
    };

    let chatOrdersCounts = { total: 0, pending: 0, byStatus: {} };
    let chatOrdersNewestTs = 0;
    let totalOrdersCount = 0;
    let revenueTotal = 0;

    try {
      const bot = availableBots.find(b => String(b._id) === String(selectedBotId));
      if (bot) {
        const subscriptionTypes = { free: 'مجاني', monthly: 'شهري', yearly: 'سنوي' };
        snapshot.botInfo.statusText = bot.isActive ? '🟢 نشط' : '🔴 متوقف';
        snapshot.botInfo.subscriptionText = subscriptionTypes[bot.subscriptionType] || 'غير معروف';
        if (bot.autoStopDate) {
          const endDate = new Date(bot.autoStopDate);
          snapshot.botInfo.expiryText = endDate.toLocaleDateString('ar-EG');
        } else {
          snapshot.botInfo.expiryText = 'غير محدد';
        }
      }

      try {
        let totalConversations = 0;
        const channels = ['facebook', 'instagram', 'whatsapp', 'web'];
        for (const channel of channels) {
          try {
            const response = await fetch(
              `/api/messages/${selectedBotId}?type=${channel}&page=1&limit=1`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (response.ok) {
              const data = await response.json();
              const count = data.totalConversations || 0;
              totalConversations += count;
              snapshot.charts.channelsData[channel] = count;
            }
          } catch (err) {
            console.log(`No ${channel} conversations`);
          }
        }
        snapshot.totals.conversations = totalConversations;
      } catch (err) {
        console.error('Error fetching conversations:', err);
        snapshot.totals.conversations = 0;
      }

      try {
        const response = await fetch(`/api/messages/daily/${selectedBotId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (response.ok) {
          snapshot.charts.dailyMessagesData = await response.json();
        }
      } catch (err) {
        console.log('No daily messages data');
      }

      try {
        const chatOrdersUrl = selectedBotId ? `/api/chat-orders?botId=${selectedBotId}` : '/api/chat-orders';
        const chatResp = await handleApiRequest(
          chatOrdersUrl,
          { headers: { Authorization: `Bearer ${token}` } },
          null,
          'فشل في جلب طلبات المحادثة'
        );

        chatOrdersCounts = chatResp?.counts || { total: 0, pending: 0, byStatus: {} };
        const chatOrders = Array.isArray(chatResp?.orders) ? chatResp.orders : [];

        chatOrdersNewestTs = Math.max(
          0,
          ...chatOrders.map((o) => new Date(o.createdAt || o.updatedAt || o.lastModifiedAt || 0).getTime())
        );

        totalOrdersCount += chatOrdersCounts.total || chatOrders.length || 0;

        chatOrders.forEach((order) => {
          const st = (order.status || '').toLowerCase();
          if (st === 'cancelled') snapshot.charts.ordersData.cancelled++;
          else if (st === 'delivered') snapshot.charts.ordersData.completed++;
          else snapshot.charts.ordersData.pending++;
        });
      } catch (err) {
        console.log('No chat orders data');
      }

      try {
        const bot = availableBots.find(b => String(b._id) === String(selectedBotId));
        const storeId = bot && bot.storeId ? (typeof bot.storeId === 'object' ? bot.storeId._id : bot.storeId) : null;

        if (storeId) {
          try {
            const customers = await handleApiRequest(
              `/api/customers/${storeId}/customers`,
              { headers: { Authorization: `Bearer ${token}` } },
              null,
              'فشل في جلب العملاء'
            );
            snapshot.totals.customers = customers.length || 0;
            snapshot.totals.customersText = String(customers.length || 0);
          } catch (err) {
            console.log('No customers found');
            snapshot.totals.customers = 0;
            snapshot.totals.customersText = '0';
          }

          try {
            const orders = await handleApiRequest(
              `/api/orders/${storeId}/orders`,
              { headers: { Authorization: `Bearer ${token}` } },
              null,
              'فشل في جلب الطلبات'
            );
            snapshot.totals.orders = orders.length || 0;
            totalOrdersCount += orders.length;

            revenueTotal += orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
            snapshot.totals.revenue = revenueTotal;
            snapshot.totals.revenueText = `${revenueTotal.toFixed(2)} ج.م`;

            orders.forEach(order => {
              const status = (order.status || '').toLowerCase();
              if (status === 'cancelled') snapshot.charts.ordersData.cancelled++;
              else if (status === 'delivered') snapshot.charts.ordersData.completed++;
              else snapshot.charts.ordersData.pending++;
            });
          } catch (err) {
            console.log('No orders found');
            snapshot.totals.orders = totalOrdersCount;
            snapshot.totals.revenue = revenueTotal;
            snapshot.totals.revenueText = '0 ج.م';
          }

          try {
            const products = await handleApiRequest(
              `/api/products/${storeId}/products`,
              { headers: { Authorization: `Bearer ${token}` } },
              null,
              'فشل في جلب المنتجات'
            );
            snapshot.totals.products = products.length || 0;
            snapshot.totals.productsText = String(products.length || 0);
          } catch (err) {
            console.log('No products found');
            snapshot.totals.products = 0;
            snapshot.totals.productsText = '0';
          }
        } else {
          snapshot.totals.customersText = 'لا يوجد متجر';
          snapshot.totals.revenueText = 'لا يوجد متجر';
          snapshot.totals.productsText = 'لا يوجد متجر';
        }
      } catch (err) {
        console.error('Error in store operations:', err);
        snapshot.totals.customers = 0;
        snapshot.totals.customersText = '0';
        snapshot.totals.revenue = 0;
        snapshot.totals.revenueText = '0 ج.م';
        snapshot.totals.products = 0;
        snapshot.totals.productsText = '0';
      }

      try {
        const feedbackData = await handleApiRequest(
          `/api/feedback/${selectedBotId}`,
          { headers: { Authorization: `Bearer ${token}` } },
          null,
          'فشل في جلب التقييمات'
        );
        const feedbackCount = Array.isArray(feedbackData) ? feedbackData.length : 0;
        snapshot.totals.feedback = feedbackCount;
      } catch (err) {
        console.error('Error fetching feedback:', err);
        snapshot.totals.feedback = 0;
      }

      const lastSeen = Number(localStorage.getItem('chatOrdersLastSeen') || 0);
      const hasNewOrders = chatOrdersCounts.pending > 0 || chatOrdersNewestTs > lastSeen;
      if (hasNewOrders) {
        const pending = chatOrdersCounts.pending || 0;
        snapshot.ordersCard.title = 'يوجد طلبات جديدة ♥';
        snapshot.ordersCard.subtitle = pending > 0 ? `${pending} طلب محادثة جديد` : 'طلبات محادثة جديدة';
      } else {
        snapshot.ordersCard.title = 'الطلبات';
        snapshot.ordersCard.subtitle = 'إجمالي الطلبات';
      }
      snapshot.totals.orders = totalOrdersCount || snapshot.totals.orders || 0;

      if (thisNav !== (ctx.getNavToken?.() ?? thisNav)) {
        console.warn('Stale overview stats skipped before apply');
        return;
      }

      applyOverviewData(snapshot, 'network');
      writeOverviewCache(selectedBotId, snapshot);
    } catch (err) {
      console.error('Error loading overview stats:', err);
    }
  }

  async function loadOverviewPage(navSnapshot) {
    console.log("renderOverview (educational timeline) called...");
    const thisNav = navSnapshot ?? ctx.getNavToken?.() ?? 0;
    const content = document.getElementById('content');
    if (!content) return;

    const selectedBotId = localStorage.getItem("selectedBotId");
    const token = ctx.getToken?.();

    const ensureStyles = () => {
      if (document.getElementById('overview-flow-styles')) return;
      const style = document.createElement('style');
      style.id = 'overview-flow-styles';
      style.textContent = `
        .overview-edu { display: grid; gap: 18px; }
        .overview-hero { padding: 18px; border: 1px solid var(--card-border, rgba(255,255,255,0.08)); border-radius: 16px; background: linear-gradient(135deg, rgba(0,196,180,0.08), rgba(14,165,233,0.08)); box-shadow: 0 16px 40px rgba(0,0,0,0.18); }
        .overview-hero h2 { margin: 0 0 8px; font-size: 1.6rem; display: flex; align-items: center; gap: 10px; }
        .overview-hero p { margin: 0; opacity: 0.9; line-height: 1.6; }
        .flow-grid { display: grid; gap: 14px; }
        @media(min-width: 880px){ .flow-grid { grid-template-columns: repeat(2, 1fr); } }
        .flow-card { border: 1px solid var(--card-border, rgba(255,255,255,0.08)); border-radius: 14px; padding: 16px; background: rgba(255,255,255,0.02); box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: grid; gap: 10px; position: relative; overflow: hidden; }
        .flow-card::before { content: attr(data-step); position: absolute; top: 10px; left: 12px; width: 38px; height: 38px; display: grid; place-items: center; border-radius: 12px; background: rgba(0,196,180,0.35); color: #0d1b2a; font-weight: 800; box-shadow: 0 6px 14px rgba(0,196,180,0.25); }
        body.light-mode .flow-card::before { background: rgba(0,196,180,0.22); color: #0d1b2a; }
        body.light-mode .flow-card { background: rgba(0,0,0,0.02); }
        .flow-title { margin: 0 0 4px; font-size: 1.1rem; display: flex; align-items: center; gap: 10px; }
        .flow-body { margin: 0; line-height: 1.6; opacity: 0.92; }
        .flow-actions { display: flex; flex-wrap: wrap; gap: 8px; }
        .flow-btn { border: 1px solid rgba(0,196,180,0.35); background: rgba(0,196,180,0.12); color: inherit; padding: 8px 12px; border-radius: 10px; cursor: pointer; transition: transform 0.15s ease, border-color 0.2s ease, background 0.2s ease; display: inline-flex; align-items: center; gap: 8px; }
        .flow-btn:hover { transform: translateY(-1px); border-color: rgba(0,196,180,0.6); background: rgba(0,196,180,0.18); }
        .flow-badges { display: flex; flex-wrap: wrap; gap: 8px; }
        .flow-badge { padding: 4px 10px; border-radius: 999px; border: 1px solid var(--card-border, rgba(255,255,255,0.1)); background: rgba(255,255,255,0.04); font-size: 0.85rem; }
        .note { font-size: 0.95rem; opacity: 0.85; display: flex; gap: 8px; align-items: flex-start; }
        .flow-cta { display: grid; gap: 8px; border: 1px dashed rgba(0,196,180,0.45); padding: 12px; border-radius: 12px; background: rgba(0,196,180,0.05); }
        .bot-stats { border: 1px solid var(--card-border, rgba(255,255,255,0.08)); border-radius: 14px; padding: 14px; background: rgba(255,255,255,0.02); box-shadow: 0 8px 24px rgba(0,0,0,0.12); display: grid; gap: 12px; }
        .bot-stats-head h3 { margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
        .bot-stats-head p { margin: 0; opacity: 0.85; }
      `;
      document.head.appendChild(style);
    };

    ensureStyles();

    const steps = [
      {
        step: '01',
        icon: 'fa-book',
        title: 'ابدأ من القواعد (برومبت السيستم)',
        body: 'عرّف البوت بكل سياساتك وأسعارك وسيناريوهات التوفر/عدم التوفر. استورد نماذجنا الجاهزة، عدّل الأقواس بمعلومات شركتك، وأضف أسئلة/أجوبة خاصة.',
        actions: [
          { label: 'فتح القواعد', page: 'rules', icon: 'fa-arrow-right' },
          { label: 'نماذج جاهزة', page: 'rules', hash: '#templates', icon: 'fa-magic' }
        ],
        badges: ['نقطة الانطلاق', 'تدريب البوت']
      },
      {
        step: '02',
        icon: 'fa-comments',
        title: 'خصص صفحة الدردشة وجرب الردود',
        body: 'فعّل صفحة الدردشة، اختر الألوان، حمّل الشعار، فعّل رفع الصور والأسئلة المقترحة. جرّب الردود فورًا، ثم راجع رسائل الويب من تبويب الويب في صفحة الرسائل، وحوّل الردود الجيدة لقاعدة سؤال/جواب من صفحة التقييمات أو الرسائل.',
        actions: [
          { label: 'صفحة الدردشة', page: 'chat-page', icon: 'fa-comment-dots' },
          { label: 'رسائل الويب', page: 'messages', icon: 'fa-envelope' },
          { label: 'التقييمات', page: 'feedback', icon: 'fa-star' }
        ],
        badges: ['تخصيص', 'تجربة سريعة']
      },
      {
        step: '03',
        icon: 'fa-share-alt',
        title: 'انشر وادمج صفحة الدردشة',
        body: 'انسخ الأكواد الجاهزة للدمج في موقعك، أو شارك رابط صفحة الدردشة مباشرة مع عملائك للتحدث مع البوت.',
        actions: [
          { label: 'أكواد التضمين', page: 'chat-page', icon: 'fa-code' }
        ],
        badges: ['نشر سريع']
      },
      {
        step: '04',
        icon: 'fa-store',
        title: 'المتجر الجاهز لمن لا يملك موقع',
        body: 'لو ما عندكش موقع، فعّل المتجر الذكي: أضف المنتجات والأسعار، صمّم الواجهة، وتابع الطلبات والعملاء من نفس اللوحة.',
        actions: [
          { label: 'المتجر الذكي', page: 'store-manager', icon: 'fa-store' }
        ],
        badges: ['منتجات', 'طلبات', 'تصميم المتجر']
      },
      {
        step: '05',
        icon: 'fa-random',
        title: 'ربط القنوات (فيسبوك / إنستجرام / واتساب)',
        body: 'اربط القنوات ليعمل البوت بنفس المنطق على الكل. فعّل الرد على التعليقات من صفحة القنوات ليجاوب تلقائيًا بنفس السياسات والأسعار.',
        actions: [
          { label: 'إدارة القنوات', page: 'channels', icon: 'fa-share-alt' }
        ],
        badges: ['تعليقات الصفحات', 'رسائل خاصة']
      },
      {
        step: '06',
        icon: 'fa-shield-alt',
        title: 'إعدادات الأمان وكلمة الإيقاف',
        body: 'ضع كلمة إيقاف فورية من إعدادات فيسبوك داخل القنوات، عيّن كلمة مرور حسابك لاستخدام تطبيق سطح المكتب لربط واتساب، واضبط تفضيلات البوت.',
        actions: [
          { label: 'الإعدادات', page: 'settings', icon: 'fa-cog' },
          { label: 'إعدادات فيسبوك', page: 'channels', icon: 'fa-facebook' }
        ],
        badges: ['كلمة إيقاف', 'تأمين الحساب']
      },
      {
        step: '07',
        icon: 'fa-paper-plane',
        title: 'مساعد تيليجرام لاستقبال الإشعارات',
        body: 'اربط بوت تيليجرام الخاص بك لإدارة الطلبات وتلقي إشعارات الجديد والمعدّل. استخدم لوحة أزرار الإنستجرام في مساعد تيليجرام لتسهيل التحكم.',
        actions: [
          { label: 'ربط تيليجرام', href: '/telegram-link.html', icon: 'fa-paper-plane' }
        ],
        badges: ['إشعارات فورية', 'أزرار سريعة']
      },
      {
        step: '08',
        icon: 'fa-clipboard-list',
        title: 'متابعة الطلبات والرسائل باستمرار',
        body: 'راقب الطلبات من مركز المتابعة، والرسائل والتقييمات من صفحة الرسائل. لو رد البوت طلع مش بالمستوى أو فيه قيمة سلبية، عدّل الرد فورًا واحفظه كقاعدة سؤال/جواب مباشرة من نفس الصفحة أو من التقييمات لضبط النبرة.',
        actions: [
          { label: 'مركز الطلبات', page: 'orders-center', icon: 'fa-clipboard-list' },
          { label: 'الرسائل', page: 'messages', icon: 'fa-envelope' }
        ],
        badges: ['تحسين مستمر']
      },
      {
        step: '09',
        icon: 'fa-bolt',
        title: 'جاهزية التشغيل وطاقم الخبرة',
        body: 'اتّبع الخط الزمني ده بالترتيب: قواعد ← تجربة الدردشة ← نشر/ربط القنوات ← أمان ← إشعارات تيليجرام ← متابعة الطلبات. المنصة مبنية لتوحيد بيانات القنوات، ضبط الأمان، وتحويل كل تفاعل لفرصة بيع بدون مجهود إضافي منك.',
        actions: [
          { label: 'ابدأ بالقواعد الآن', page: 'rules', icon: 'fa-play' }
        ],
        badges: ['تسلسل موحّد', 'جاهز للإطلاق']
      }
    ];

    const renderSteps = () => steps.map(s => `
      <div class="flow-card" data-step="${s.step}">
        <h3 class="flow-title"><i class="fas ${s.icon}"></i> ${s.title}</h3>
        <p class="flow-body">${s.body}</p>
        ${s.badges?.length ? `<div class="flow-badges">${s.badges.map(b => `<span class="flow-badge">${b}</span>`).join('')}</div>` : ''}
        <div class="flow-actions">
          ${s.actions.map(a => `<button class="flow-btn" data-page="${a.page || ''}" data-href="${a.href || ''}"><i class="fas ${a.icon}"></i>${a.label}</button>`).join('')}
        </div>
      </div>
    `).join('');

    content.innerHTML = `
      <div class="overview-edu">
        <div class="overview-hero">
          <h2><i class="fas fa-route"></i> لمحة تعليمية سريعة</h2>
          <p>اتّبع الخط الزمني لتجهيز بوت خدمة العملاء الخاص بك: من إعداد القواعد حتى ربط القنوات ومتابعة الطلبات، خطوة بخطوة وبأزرار تنقلك مباشرة لكل صفحة.</p>
        </div>
        <div class="flow-grid">${renderSteps()}</div>
        <div class="flow-cta note">
          <i class="fas fa-lightbulb"></i>
          <div>
            <strong>نصيحة:</strong> اختبر الردود بعد كل خطوة، وحوّل أفضل الردود إلى قواعد سؤال/جواب لضبط نبرة البوت باستمرار. نحن في تطوّر مستمر لتعظيم الاستفادة من الذكاء الاصطناعي لخدمة رواد الأعمال وأصحاب المتاجر بعمق أكبر.
          </div>
        </div>
        <div class="bot-stats">
          <div class="bot-stats-head">
            <h3><i class="fas fa-chart-line"></i> عدادات البوت</h3>
            <p>أرقام سريعة من نشاط البوت المختار.</p>
          </div>
          ${selectedBotId ? `
          <div class="stats-grid" id="botStatsGrid">
            <div class="stat-card">
              <div class="stat-label">إجمالي الرسائل</div>
              <div class="stat-value" id="statMessagesCount">--</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">إجمالي المحادثات</div>
              <div class="stat-value" id="statConversationsCount">--</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">طلبات صادرة من المحادثات</div>
              <div class="stat-value" id="statChatOrdersCount">--</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">القواعد الفعالة</div>
              <div class="stat-value" id="statActiveRules">--</div>
            </div>
          </div>
          ` : `
          <div class="placeholder">
            <p>اختر بوتًا من القائمة العلوية لعرض العدادات.</p>
          </div>
          `}
        </div>
      </div>
    `;

    content.querySelectorAll('.flow-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        const href = btn.dataset.href;
        if (href) {
          window.location.href = href;
          return;
        }
        if (page) {
          window.location.hash = `#${page}`;
          if (page === 'rules' && btn.textContent.includes('نماذج')) {
            // إشارة بسيطة لفتح النماذج داخل صفحة القواعد (يمكن استغلالها في JS الصفحة)
            localStorage.setItem('rules_open_templates', '1');
          }
        }
      });
    });

    // جلب عدادات البوت في صفحة اللمحة
    const statsEls = {
      messages: content.querySelector('#statMessagesCount'),
      conversations: content.querySelector('#statConversationsCount'),
      chatOrders: content.querySelector('#statChatOrdersCount'),
      rules: content.querySelector('#statActiveRules'),
    };

    if (selectedBotId && token && statsEls.messages) {
      const statsCacheKey = 'overviewBotStats';
      const cachedStats = window.readPageCache ? window.readPageCache(statsCacheKey, selectedBotId, 2 * 60 * 1000) : null;
      const fetchStats = () => handleApiRequest(`/api/analytics?botId=${selectedBotId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, null, 'فشل في جلب عدادات البوت');

      const applyStats = (stats) => {
        if (!stats) return;
        statsEls.messages.textContent = stats.messagesCount != null ? stats.messagesCount : '--';
        statsEls.conversations.textContent = stats.conversationsCount != null ? stats.conversationsCount : '--';
        statsEls.chatOrders.textContent = stats.chatOrdersCount != null ? stats.chatOrdersCount : '--';
        statsEls.rules.textContent = stats.activeRules != null ? stats.activeRules : '--';
      };

      if (cachedStats) {
        applyStats(cachedStats);
        fetchStats()
          .then((fresh) => {
            if (fresh && window.writePageCache) {
              window.writePageCache(statsCacheKey, selectedBotId, fresh);
            }
            applyStats(fresh);
          })
          .catch((err) => {
            console.warn('⚠️ فشل تحديث عدادات البوت، استخدام الكاش', err);
          });
      } else {
        fetchStats()
          .then((fresh) => {
            applyStats(fresh);
            if (fresh && window.writePageCache) {
              window.writePageCache(statsCacheKey, selectedBotId, fresh);
            }
          })
          .catch((err) => {
            console.warn('⚠️ فشل جلب عدادات البوت', err);
          });
      }
    }

    // لا حاجة للإحصاءات هنا؛ الصفحة تعليمية فقط
  }

  window.loadOverviewPage = loadOverviewPage;
})();
