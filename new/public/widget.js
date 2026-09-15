/*!
 * ZainBot website chat widget
 *
 * Usage (on any customer website):
 *   <script src="https://<your-zainbot-domain>/widget.js" data-bot-id="<BOT_ID>" defer></script>
 *
 * The widget resolves the bot's public chat page, then renders a floating
 * launcher that opens the chat inside an embedded panel.
 */
(function () {
  'use strict';

  if (window.__zainbotWidgetLoaded) return;
  window.__zainbotWidgetLoaded = true;

  var scriptEl =
    document.currentScript ||
    (function () {
      var all = document.getElementsByTagName('script');
      return all[all.length - 1];
    })();

  var botId = scriptEl ? scriptEl.getAttribute('data-bot-id') : null;
  var origin = window.location.origin;
  try {
    if (scriptEl && scriptEl.src) origin = new URL(scriptEl.src).origin;
  } catch (e) { /* keep default origin */ }

  if (!botId) {
    console.error('[ZainBot] widget: the script tag needs a data-bot-id attribute');
    return;
  }

  function isRTL() {
    return (document.documentElement.getAttribute('dir') || '').toLowerCase() === 'rtl';
  }

  var CSS = [
    '.zbw-root{position:fixed;bottom:20px;inset-inline-end:20px;z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}',
    '.zbw-launcher{width:60px;height:60px;border-radius:50%;border:none;cursor:pointer;color:#fff;',
      'background:linear-gradient(135deg,#7c3aed,#3b82f6);box-shadow:0 8px 24px rgba(59,130,246,.35);',
      'display:flex;align-items:center;justify-content:center;transition:transform .15s ease;}',
    '.zbw-launcher:hover{transform:scale(1.06);}',
    '.zbw-launcher svg{width:28px;height:28px;fill:currentColor;}',
    '.zbw-panel{display:none;flex-direction:column;width:380px;height:600px;max-width:calc(100vw - 32px);',
      'max-height:calc(100vh - 96px);background:#fff;border-radius:16px;overflow:hidden;',
      'box-shadow:0 24px 64px rgba(2,6,23,.35);border:1px solid rgba(2,6,23,.08);}',
    '.zbw-panel.zbw-open{display:flex;}',
    '.zbw-header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;',
      'background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;font-size:13px;font-weight:600;}',
    '.zbw-close{background:transparent;border:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:4px 8px;}',
    '.zbw-frame{flex:1;width:100%;border:none;background:#fff;}',
    '@media (max-width:480px){',
      '.zbw-panel.zbw-open{position:fixed;inset:0;width:100%;height:100%;max-width:none;max-height:none;border-radius:0;}',
      '.zbw-root{inset-inline-end:16px;bottom:16px;}',
    '}'
  ].join('');

  function injectStyles() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function iconChat() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3C6.9 3 2.8 6.6 2.8 11c0 2.5 1.3 4.7 3.4 6.2-.1.9-.5 2.3-1.6 3.3 0 0 2.6-.2 4.6-1.6.9.2 1.8.3 2.8.3 5.1 0 9.2-3.6 9.2-8.1S17.1 3 12 3z"/></svg>';
  }
  function iconClose() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z"/></svg>';
  }

  function buildUI(linkId) {
    injectStyles();

    var root = document.createElement('div');
    root.className = 'zbw-root';

    var panel = document.createElement('div');
    panel.className = 'zbw-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', isRTL() ? 'نافذة الدردشة' : 'Chat window');

    var header = document.createElement('div');
    header.className = 'zbw-header';
    var title = document.createElement('span');
    title.textContent = isRTL() ? 'زين بوت' : 'ZainBot';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'zbw-close';
    closeBtn.type = 'button';
    closeBtn.innerHTML = iconClose();
    closeBtn.setAttribute('aria-label', isRTL() ? 'إغلاق الدردشة' : 'Close chat');
    header.appendChild(title);
    header.appendChild(closeBtn);

    var frame = document.createElement('iframe');
    frame.className = 'zbw-frame';
    frame.src = origin + '/chat/' + encodeURIComponent(linkId);
    frame.title = 'ZainBot Chat';
    frame.setAttribute('loading', 'lazy');

    panel.appendChild(header);
    panel.appendChild(frame);

    var launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'zbw-launcher';
    launcher.innerHTML = iconChat();
    launcher.setAttribute('aria-label', isRTL() ? 'افتح الدردشة' : 'Open chat');

    var open = false;
    function setOpen(next) {
      open = next;
      panel.classList.toggle('zbw-open', open);
      launcher.style.display = open ? 'none' : 'flex';
    }

    launcher.addEventListener('click', function () { setOpen(true); });
    closeBtn.addEventListener('click', function () { setOpen(false); });

    root.appendChild(panel);
    root.appendChild(launcher);

    function mount() {
      document.body.appendChild(root);
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  fetch(origin + '/api/chat-page/public/bot/' + encodeURIComponent(botId), {
    headers: { Accept: 'application/json' }
  })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      if (data && data.success && data.linkId) {
        buildUI(data.linkId);
      } else {
        console.info('[ZainBot] widget: no chat page is configured for this bot yet');
      }
    })
    .catch(function (err) {
      console.info('[ZainBot] widget: could not reach the chat service', err);
    });
})();
