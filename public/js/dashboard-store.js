// public/js/dashboard-store.js
// Store setup page: create a store for the current agent, edit its public
// storefront settings, show and copy the public link. Uses only existing
// authenticated endpoints (POST /api/stores, PUT /api/stores/:id) plus the
// read-only GET /api/stores/mine. Own small AR/EN dictionary so the main
// dashboard dictionaries stay untouched.
(function (global) {
  'use strict';

  var TEXT = {
    en: {
      title: 'Store',
      subtitle: 'Your public storefront: catalog, cart and checkout for your customers.',
      no_bot: 'Select an agent first. Each store belongs to one agent.',
      loading: 'Loading your store...',
      load_failed: 'Could not load your store. Check your connection and try again.',
      retry: 'Try again',
      create_title: 'Create your store',
      create_desc: 'Pick a name and a link. You can change everything later. Free plan: 1 store and up to 50 products.',
      name: 'Store name',
      link: 'Store link (English letters, numbers, - or _, at least 4)',
      link_help: 'Your store will open at',
      whatsapp: 'WhatsApp number for orders (with country code, e.g. 2010xxxxxxxx)',
      layout: 'Template',
      layout1: 'Template 1',
      layout2: 'Template 2',
      layout3: 'Template 3',
      create: 'Create store',
      creating: 'Creating...',
      created: 'Your store was created.',
      saved: 'Saved.',
      save: 'Save changes',
      saving: 'Saving...',
      your_link: 'Your store link',
      copy: 'Copy link',
      copied: 'Copied.',
      open: 'Open store',
      settings: 'Store settings',
      description: 'About the store',
      logo: 'Logo image link (https://...)',
      color: 'Main color',
      cart: 'Enable cart and checkout',
      facebook: 'Facebook page link',
      instagram: 'Instagram link',
      address: 'Address',
      footer: 'Footer text',
      checkout_note: 'At checkout customers choose cash on delivery, or send the order to your WhatsApp number above with the order details filled in. Add your WhatsApp number so the second option works.',
      link_checking: 'Checking the link...',
      link_ok: 'This link is available.',
      link_taken: 'This link is already used. Try another one.',
      link_short: 'Use English letters, numbers, - or _ (at least 4).',
      error_generic: 'Something went wrong. Try again.',
      name_required: 'Enter a store name.'
    },
    ar: {
      title: 'المتجر',
      subtitle: 'صفحة متجرك العامة: كتالوج وسلة وإتمام طلب لعملائك.',
      no_bot: 'اختر وكيلًا أولًا. كل متجر يتبع وكيلًا واحدًا.',
      loading: 'جارٍ تحميل متجرك...',
      load_failed: 'تعذّر تحميل متجرك. تحقق من الاتصال وحاول مرة أخرى.',
      retry: 'إعادة المحاولة',
      create_title: 'أنشئ متجرك',
      create_desc: 'اختر اسمًا ورابطًا. تقدر تغيّر كل شيء لاحقًا. الخطة المجانية: متجر واحد وحتى 50 منتجًا.',
      name: 'اسم المتجر',
      link: 'رابط المتجر (حروف إنجليزية وأرقام و - أو _ بحد أدنى 4)',
      link_help: 'سيفتح متجرك على',
      whatsapp: 'رقم واتساب لاستقبال الطلبات (مع كود الدولة مثل 2010xxxxxxxx)',
      layout: 'القالب',
      layout1: 'القالب الأول',
      layout2: 'القالب الثاني',
      layout3: 'القالب الثالث',
      create: 'إنشاء المتجر',
      creating: 'جارٍ الإنشاء...',
      created: 'تم إنشاء متجرك.',
      saved: 'تم الحفظ.',
      save: 'حفظ التعديلات',
      saving: 'جارٍ الحفظ...',
      your_link: 'رابط متجرك',
      copy: 'نسخ الرابط',
      copied: 'تم النسخ.',
      open: 'فتح المتجر',
      settings: 'إعدادات المتجر',
      description: 'نبذة عن المتجر',
      logo: 'رابط صورة الشعار (https://...)',
      color: 'اللون الأساسي',
      cart: 'تفعيل السلة وإتمام الطلب',
      facebook: 'رابط صفحة فيسبوك',
      instagram: 'رابط إنستجرام',
      address: 'العنوان',
      footer: 'نص أسفل الصفحة',
      checkout_note: 'عند إتمام الطلب يختار العميل الدفع عند الاستلام، أو يرسل الطلب إلى رقم واتساب الخاص بك أعلاه وتفاصيل الطلب مكتوبة. أضف رقم واتساب حتى يعمل الخيار الثاني.',
      link_checking: 'جارٍ فحص الرابط...',
      link_ok: 'الرابط متاح.',
      link_taken: 'هذا الرابط مستخدم. جرّب رابطًا آخر.',
      link_short: 'استخدم حروفًا إنجليزية وأرقامًا و - أو _ (4 على الأقل).',
      error_generic: 'حدث خطأ. حاول مرة أخرى.',
      name_required: 'اكتب اسم المتجر.'
    }
  };

  var LAYOUTS = ['layout1', 'layout2', 'layout3'];

  function esc(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeLink(value) {
    return String(value || '').toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  }

  function storeUrl(link) {
    var origin = (global.location && global.location.origin) || 'https://zainbot.com';
    return origin + '/store/' + link;
  }

  function create(deps) {
    var request = deps.request;
    var root = null;
    var ctx = { bot: null, lang: 'ar' };
    var state = { status: 'idle', store: null, error: '' };
    var linkTimer = null;

    function t(key) {
      var table = TEXT[ctx.lang] || TEXT.en;
      return table[key] !== undefined ? table[key] : (TEXT.en[key] || key);
    }

    function getRoot() {
      if (!root) root = global.document.getElementById('storePageRoot');
      return root;
    }

    function message(kind, text) {
      var box = getRoot() && getRoot().querySelector('[data-store-msg]');
      if (!box) return;
      box.textContent = text || '';
      box.style.color = kind === 'error' ? '#f87171' : '#34d399';
      box.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    }

    function errText(err) {
      var m = err && (err.message || (err.data && err.data.message) || (err.payload && err.payload.message));
      return m && String(m).length < 300 ? String(m) : t('error_generic');
    }

    function layoutOptions(selected) {
      return LAYOUTS.map(function (id) {
        return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' + esc(t(id)) + '</option>';
      }).join('');
    }

    function field(id, label, value, attrs) {
      return '<div style="display:grid;gap:6px;"><label for="' + id + '" style="font-size:13px;font-weight:600;">' + esc(label) + '</label>' +
        '<input id="' + id + '" class="form-control" value="' + esc(value) + '" ' + (attrs || '') + '></div>';
    }

    function header() {
      return '<div style="margin-bottom:24px;"><h2 style="margin-bottom:6px;">' + esc(t('title')) + '</h2>' +
        '<p style="color:var(--text-muted);font-size:13px;">' + esc(t('subtitle')) + '</p></div>';
    }

    function render() {
      var el = getRoot();
      if (!el) return;
      el.setAttribute('dir', ctx.lang === 'ar' ? 'rtl' : 'ltr');
      if (!ctx.bot) {
        el.innerHTML = header() + '<p class="glass-card" style="padding:20px;">' + esc(t('no_bot')) + '</p>';
        return;
      }
      if (state.status === 'loading') {
        el.innerHTML = header() + '<p role="status" style="padding:20px;color:var(--text-muted);">' + esc(t('loading')) + '</p>';
        return;
      }
      if (state.status === 'error') {
        el.innerHTML = header() + '<div class="glass-card" style="padding:20px;"><p role="alert">' + esc(t('load_failed')) +
          '</p><button type="button" class="btn btn-secondary btn-sm" data-store-retry>' + esc(t('retry')) + '</button></div>';
        el.querySelector('[data-store-retry]').addEventListener('click', load);
        return;
      }
      if (!state.store) {
        renderCreate(el);
        return;
      }
      renderSettings(el, state.store);
    }

    function renderCreate(el) {
      el.innerHTML = header() +
        '<form class="glass-card" data-store-form style="padding:24px;display:grid;gap:16px;max-width:640px;" novalidate>' +
        '<h3>' + esc(t('create_title')) + '</h3><p style="color:var(--text-muted);font-size:13px;">' + esc(t('create_desc')) + '</p>' +
        field('storeName', t('name'), '', 'maxlength="60" required autocomplete="off"') +
        field('storeLinkInput', t('link'), '', 'maxlength="40" dir="ltr" autocomplete="off" aria-describedby="storeLinkHelp"') +
        '<small id="storeLinkHelp" style="color:var(--text-muted);" dir="auto">' + esc(t('link_help')) + ' <span dir="ltr" data-store-preview></span></small>' +
        field('storeWhatsapp', t('whatsapp'), '', 'inputmode="tel" dir="ltr" autocomplete="off"') +
        '<div style="display:grid;gap:6px;"><label for="storeLayout" style="font-size:13px;font-weight:600;">' + esc(t('layout')) + '</label>' +
        '<select id="storeLayout" class="form-control">' + layoutOptions('layout1') + '</select></div>' +
        '<button type="submit" class="btn btn-primary" data-store-submit>' + esc(t('create')) + '</button>' +
        '<p data-store-msg aria-live="polite" style="min-height:1.4em;"></p></form>';
      var form = el.querySelector('[data-store-form]');
      var linkInput = el.querySelector('#storeLinkInput');
      var nameInput = el.querySelector('#storeName');
      var preview = el.querySelector('[data-store-preview]');
      var touched = false;
      linkInput.addEventListener('input', function () { touched = true; updateLink(); });
      nameInput.addEventListener('input', function () {
        if (!touched) { linkInput.value = normalizeLink(nameInput.value); updateLink(); }
      });
      function updateLink() {
        var v = normalizeLink(linkInput.value);
        preview.textContent = storeUrl(v || '...');
        clearTimeout(linkTimer);
        if (v.length < 4) { message('error', v ? t('link_short') : ''); return; }
        message('ok', t('link_checking'));
        linkTimer = setTimeout(function () {
          request('/api/stores/check-link/' + encodeURIComponent(v), {}, { operation: 'read' }).then(function (r) {
            if (normalizeLink(linkInput.value) !== v) return;
            message(r && r.available ? 'ok' : 'error', r && r.available ? t('link_ok') : t('link_taken'));
          }).catch(function () { message('ok', ''); });
        }, 350);
      }
      preview.textContent = storeUrl('...');
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var name = nameInput.value.trim();
        var link = normalizeLink(linkInput.value);
        if (!name) { message('error', t('name_required')); nameInput.focus(); return; }
        if (link.length < 4) { message('error', t('link_short')); linkInput.focus(); return; }
        var btn = el.querySelector('[data-store-submit]');
        btn.disabled = true; btn.textContent = t('creating');
        request('/api/stores', {
          method: 'POST',
          body: JSON.stringify({
            storeName: name, storeLink: link, whatsapp: el.querySelector('#storeWhatsapp').value.replace(/[^\d]/g, ''),
            landingLayout: el.querySelector('#storeLayout').value, enableCart: true, selectedBotId: String(ctx.bot._id)
          })
        }, { operation: 'mutation' }).then(function (store) {
          state.store = store; state.status = 'ready';
          render();
          message('ok', t('created'));
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = t('create');
          message('error', errText(err));
        });
      });
    }

    function renderSettings(el, store) {
      var link = store.storeLink || '';
      var admin = store.adminConfig || {};
      var social = store.socialLinks || {};
      var url = storeUrl(link);
      el.innerHTML = header() +
        '<div class="glass-card" style="padding:20px;margin-bottom:20px;display:grid;gap:10px;">' +
        '<strong>' + esc(t('your_link')) + '</strong>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">' +
        '<code dir="ltr" data-store-url style="padding:8px 12px;border-radius:8px;background:rgba(255,255,255,0.06);word-break:break-all;">' + esc(url) + '</code>' +
        '<button type="button" class="btn btn-secondary btn-sm" data-store-copy>' + esc(t('copy')) + '</button>' +
        '<a class="btn btn-primary btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(t('open')) + '</a></div></div>' +
        '<form class="glass-card" data-store-form style="padding:24px;display:grid;gap:16px;max-width:760px;" novalidate>' +
        '<h3>' + esc(t('settings')) + '</h3>' +
        field('storeName', t('name'), store.storeName, 'maxlength="60" required') +
        field('storeLinkInput', t('link'), link, 'maxlength="40" dir="ltr"') +
        field('storeWhatsapp', t('whatsapp'), store.whatsapp, 'inputmode="tel" dir="ltr"') +
        '<small style="color:var(--text-muted);line-height:1.7;">' + esc(t('checkout_note')) + '</small>' +
        '<div style="display:grid;gap:6px;"><label for="storeDescription" style="font-size:13px;font-weight:600;">' + esc(t('description')) + '</label>' +
        '<textarea id="storeDescription" class="form-control" rows="3" maxlength="500">' + esc(store.storeDescription || '') + '</textarea></div>' +
        field('storeLogo', t('logo'), store.storeLogoUrl || '', 'type="url" dir="ltr"') +
        '<div style="display:grid;gap:6px;"><label for="storeColor" style="font-size:13px;font-weight:600;">' + esc(t('color')) + '</label>' +
        '<input id="storeColor" type="color" value="' + esc(/^#[0-9a-fA-F]{6}$/.test(store.primaryColor || '') ? store.primaryColor : '#00c4b4') + '" style="width:64px;height:40px;"></div>' +
        '<div style="display:grid;gap:6px;"><label for="storeLayout" style="font-size:13px;font-weight:600;">' + esc(t('layout')) + '</label>' +
        '<select id="storeLayout" class="form-control">' + layoutOptions(LAYOUTS.indexOf(admin.landingLayout) >= 0 ? admin.landingLayout : 'layout1') + '</select></div>' +
        '<label style="display:flex;gap:8px;align-items:center;"><input id="storeCart" type="checkbox"' + (admin.enableCart === false ? '' : ' checked') + '> ' + esc(t('cart')) + '</label>' +
        field('storeFacebook', t('facebook'), social.facebook || '', 'type="url" dir="ltr"') +
        field('storeInstagram', t('instagram'), social.instagram || '', 'type="url" dir="ltr"') +
        field('storeAddress', t('address'), store.address || '', 'maxlength="200"') +
        field('storeFooter', t('footer'), store.footerText || '', 'maxlength="200"') +
        '<button type="submit" class="btn btn-primary" data-store-submit>' + esc(t('save')) + '</button>' +
        '<p data-store-msg aria-live="polite" style="min-height:1.4em;"></p></form>' +
        '<div id="storeProductsRoot" data-store-products></div>';

      el.querySelector('[data-store-copy]').addEventListener('click', function () {
        var done = function () { message('ok', t('copied')); };
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(url).then(done, done);
        } else {
          var range = global.document.createRange();
          range.selectNodeContents(el.querySelector('[data-store-url]'));
          var sel = global.getSelection(); sel.removeAllRanges(); sel.addRange(range);
          try { global.document.execCommand('copy'); } catch (e) { /* ignore */ }
          done();
        }
      });

      el.querySelector('[data-store-form]').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var name = el.querySelector('#storeName').value.trim();
        var newLink = normalizeLink(el.querySelector('#storeLinkInput').value);
        if (!name) { message('error', t('name_required')); return; }
        if (newLink.length < 4) { message('error', t('link_short')); return; }
        var btn = el.querySelector('[data-store-submit]');
        btn.disabled = true; btn.textContent = t('saving');
        request('/api/stores/' + encodeURIComponent(store._id), {
          method: 'PUT',
          body: JSON.stringify({
            storeName: name,
            storeLink: newLink,
            whatsapp: el.querySelector('#storeWhatsapp').value.replace(/[^\d]/g, ''),
            storeDescription: el.querySelector('#storeDescription').value.trim(),
            storeLogoUrl: el.querySelector('#storeLogo').value.trim(),
            primaryColor: el.querySelector('#storeColor').value,
            landingLayout: el.querySelector('#storeLayout').value,
            enableCart: el.querySelector('#storeCart').checked,
            'socialLinks.facebook': el.querySelector('#storeFacebook').value.trim(),
            'socialLinks.instagram': el.querySelector('#storeInstagram').value.trim(),
            address: el.querySelector('#storeAddress').value.trim(),
            footerText: el.querySelector('#storeFooter').value.trim()
          })
        }, { operation: 'mutation' }).then(function (updated) {
          state.store = (updated && updated._id) ? updated : (updated && updated.store) || state.store;
          render();
          message('ok', t('saved'));
        }).catch(function (err) {
          btn.disabled = false; btn.textContent = t('save');
          message('error', errText(err));
        });
      });

      if (global.ZainBotStoreProducts && typeof global.ZainBotStoreProducts.mount === 'function') {
        global.ZainBotStoreProducts.mount({
          root: el.querySelector('[data-store-products]'), store: store, request: request, lang: ctx.lang
        });
      }
    }

    function load() {
      if (!ctx.bot) { state.status = 'idle'; render(); return Promise.resolve(); }
      state.status = 'loading';
      render();
      var botId = String(ctx.bot._id);
      return request('/api/stores/mine?botId=' + encodeURIComponent(botId), {}, { operation: 'read' }).then(function (r) {
        if (!ctx.bot || String(ctx.bot._id) !== botId) return;
        state.store = (r && r.store) || null;
        state.status = 'ready';
        render();
      }).catch(function () {
        state.status = 'error';
        render();
      });
    }

    return {
      open: function (next) {
        var botChanged = String((ctx.bot && ctx.bot._id) || '') !== String((next.bot && next.bot._id) || '');
        ctx = { bot: next.bot || null, lang: next.lang === 'en' ? 'en' : 'ar' };
        if (botChanged) state.store = null;
        return load();
      },
      refreshLanguage: function (lang) {
        ctx.lang = lang === 'en' ? 'en' : 'ar';
        if (state.status !== 'loading') render();
      }
    };
  }

  global.ZainBotStore = { create: create, _text: TEXT, _normalizeLink: normalizeLink };
})(typeof window !== 'undefined' ? window : globalThis);
