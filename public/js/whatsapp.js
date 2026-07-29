(() => {
  'use strict';

  const POLL_INTERVAL_MS = 2_000;
  const POLL_TIMEOUT_MS = 90_000;

  function getSelectedBotId() {
    return localStorage.getItem('selectedBotId') || '';
  }

  async function request(path, options = {}) {
    const token = typeof window.getAuthToken === 'function'
      ? window.getAuthToken()
      : localStorage.getItem('token');
    if (!token) throw new Error('تسجيل الدخول مطلوب');

    const response = await fetch(path, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.success) {
      throw new Error(payload.message || 'تعذر الاتصال بخدمة واتساب');
    }
    return payload.data;
  }

  function statusText(status) {
    return {
      disconnected: 'غير مرتبط',
      initializing: 'يتم تشغيل جلسة واتساب',
      qr_required: 'امسح رمز الربط من واتساب',
      connecting: 'يتم تأكيد الربط',
      connected: 'الحساب مرتبط ويعمل',
      degraded: 'الجلسة تحتاج إعادة اتصال',
      error: 'تعذر تشغيل جلسة واتساب',
      relink_required: 'يلزم ربط الحساب من جديد',
    }[status] || 'حالة الجلسة غير معروفة';
  }

  function isSafeQrDataUrl(value) {
    return typeof value === 'string'
      && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(value)
      && value.length <= 2_000_000;
  }

  function renderStatus(root, data) {
    const statusElement = root.querySelector('[data-wa-status]');
    const qrElement = root.querySelector('[data-wa-qr]');
    const errorElement = root.querySelector('[data-wa-error]');
    const connectButton = root.querySelector('[data-wa-connect]');
    const disconnectButton = root.querySelector('[data-wa-disconnect]');
    if (!statusElement || !qrElement || !errorElement || !connectButton || !disconnectButton) return;

    statusElement.textContent = statusText(data?.status);
    statusElement.dataset.state = data?.status || 'disconnected';
    connectButton.disabled = ['initializing', 'connecting'].includes(data?.status);
    disconnectButton.disabled = !data || data.status === 'disconnected';
    errorElement.textContent = data?.health?.errorCode
      ? 'توجد مشكلة تشغيل مسجلة. اضغط إعادة المحاولة لتوليد رمز جديد.'
      : '';

    qrElement.replaceChildren();
    if (isSafeQrDataUrl(data?.qrCode)) {
      const image = document.createElement('img');
      image.src = data.qrCode;
      image.alt = 'رمز ربط واتساب';
      image.width = 240;
      image.height = 240;
      image.loading = 'eager';
      qrElement.appendChild(image);
    } else if (data?.status === 'connected') {
      qrElement.textContent = 'تم الربط بنجاح. ستبقى الجلسة محفوظة بعد إعادة التشغيل.';
    } else if (data?.status === 'relink_required') {
      qrElement.textContent = 'انتهت الجلسة السابقة. اضغط إعادة المحاولة لإظهار رمز جديد.';
    } else {
      qrElement.textContent = 'لن يظهر الرمز إلا عند جاهزية عميل واتساب.';
    }
  }

  async function refreshStatus(root, botId) {
    const data = await request(`/api/whatsapp/session?botId=${encodeURIComponent(botId)}`);
    renderStatus(root, data);
    return data;
  }

  async function pollForQr(root, botId) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (root.isConnected && Date.now() < deadline) {
      const data = await refreshStatus(root, botId);
      if (
        data.qrCode
        || ['connected', 'error', 'relink_required', 'degraded', 'disconnected'].includes(data.status)
      ) {
        return data;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    return null;
  }

  async function loadWhatsAppPage(rootEl = document.getElementById('content')) {
    const content = rootEl || document.getElementById('content');
    if (!content) return;
    const botId = getSelectedBotId();
    if (!botId) {
      content.innerHTML = '<div class="placeholder error"><h2>اختر بوتًا أولًا</h2><p>اختر البوت الذي تريد ربط حساب واتساب به.</p></div>';
      return;
    }

    content.innerHTML = `
      <section class="channel-settings" data-wa-root>
        <div class="page-header">
          <h2><i class="fab fa-whatsapp"></i> ربط واتساب</h2>
          <p>اربط الحساب من هاتفك، ثم تبقى الجلسة محفوظة على الخادم.</p>
        </div>
        <div class="card" style="max-width:620px">
          <p data-wa-status aria-live="polite">يتم فحص حالة الجلسة</p>
          <div data-wa-qr aria-live="polite" style="min-height:250px;display:grid;place-items:center;text-align:center"></div>
          <p data-wa-error class="error-message" role="alert"></p>
          <ol>
            <li>افتح واتساب على هاتفك.</li>
            <li>اذهب إلى الأجهزة المرتبطة ثم اختر ربط جهاز.</li>
            <li>اضغط توليد رمز وامسح الرمز الذي يظهر هنا.</li>
          </ol>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <button type="button" class="btn btn-primary" data-wa-connect>توليد رمز الربط</button>
            <button type="button" class="btn btn-secondary" data-wa-disconnect>فصل الجلسة</button>
          </div>
        </div>
      </section>`;

    const root = content.querySelector('[data-wa-root]');
    const connectButton = root.querySelector('[data-wa-connect]');
    const disconnectButton = root.querySelector('[data-wa-disconnect]');

    try {
      await refreshStatus(root, botId);
    } catch (error) {
      root.querySelector('[data-wa-error]').textContent = error.message;
    }

    connectButton.addEventListener('click', async () => {
      connectButton.disabled = true;
      root.querySelector('[data-wa-error]').textContent = '';
      root.querySelector('[data-wa-status]').textContent = 'يتم تجهيز رمز الربط';
      try {
        const data = await request('/api/whatsapp/connect-qr', {
          method: 'POST',
          body: JSON.stringify({ botId }),
        });
        renderStatus(root, data);
        if (!data.qrCode && !['connected', 'error', 'relink_required'].includes(data.status)) {
          await pollForQr(root, botId);
        }
      } catch (error) {
        root.querySelector('[data-wa-error]').textContent = error.message;
      } finally {
        if (root.isConnected) connectButton.disabled = false;
      }
    });

    disconnectButton.addEventListener('click', async () => {
      disconnectButton.disabled = true;
      root.querySelector('[data-wa-error]').textContent = '';
      try {
        const data = await request('/api/whatsapp/disconnect', {
          method: 'POST',
          body: JSON.stringify({ botId }),
        });
        renderStatus(root, data);
      } catch (error) {
        root.querySelector('[data-wa-error]').textContent = error.message;
      } finally {
        if (root.isConnected) disconnectButton.disabled = false;
      }
    });
  }

  window.loadWhatsAppPage = loadWhatsAppPage;
})();
