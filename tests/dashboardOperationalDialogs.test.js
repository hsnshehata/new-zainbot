const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// E02 operational dialogs — fix-round-1 regression net (static behavioral
// assertions; real keyboard/focus acceptance waits for the A03/A04 harness).
// Rule under test: a close button closes ONLY its dialog — no global
// `.modal-close-btn` fan-out, no cross-modal `.active` stripping.

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function faqCloseBlock() {
  const start = dashboardScript.indexOf('faqModal?.querySelectorAll');
  assert.notEqual(start, -1, 'Missing faqModal-scoped close wiring');
  return dashboardScript.slice(start, dashboardScript.indexOf('});', start) + 3);
}

test('faqModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="faqModal" role="dialog" aria-modal="true" aria-labelledby="faqModalTitle">/
  );
  assert.match(
    dashboardHtml,
    /id="faqModalTitle"[\s\S]{0,200}data-i18n-aria="btn_cancel"/
  );
});

test('no global .modal-close-btn handler remains', () => {
  assert.doesNotMatch(
    dashboardScript,
    /document\.querySelectorAll\('\.modal-close-btn'\)/,
    'A document-wide close handler closes every dialog at once'
  );
});

test('faqModal X closes only faqModal through the shared lifecycle', () => {
  assert.match(
    dashboardScript,
    /faqModal\?\.querySelectorAll\('\.modal-close-btn'\)/
  );
  const block = faqCloseBlock();
  assert.match(block, /closeFaqModal\(\)/);
  assert.doesNotMatch(block, /channelModal/, 'faq close must not touch channelModal');
  assert.doesNotMatch(block, /faqModal\.classList\.remove/, 'faq close must route via closeDialog, not raw classList');
});

test('channelModal close is scoped and lifecycle-routed; faq close leaves it alone', () => {
  // E02f migrated channelModal: its X routes closeChannelModal (no raw
  // classList close, no helper bypass). Scoping proofs live in the E02f
  // tests below; here we pin the decoupling contract only.
  const block = faqCloseBlock();
  assert.doesNotMatch(block, /channelModal/, 'faq close must not touch channelModal');
});

test('bookingModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="bookingModal" role="dialog" aria-modal="true" aria-labelledby="bookingModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="bookingModal"');
  const head = dashboardHtml.slice(headStart, headStart + 600);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('bookingModal open/save/close run the shared lifecycle with booking-only scope', () => {
  assert.match(dashboardScript, /window\.openBookingModal = function\(bookingId = null\)/);
  const openStart = dashboardScript.indexOf('window.openBookingModal = function');
  const openBlock = dashboardScript.slice(openStart, openStart + 2600);
  assert.match(openBlock, /ZainBotA11y\.openDialog\(modal,/);
  assert.match(openBlock, /background: document\.querySelector\('\.db-wrapper'\)/);
  assert.doesNotMatch(openBlock, /setInterval|polling|qrCode/i, 'booking open owns no QR/polling');

  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.booking-modal-close'\)\.forEach\(btn => btn\.addEventListener\('click', \(\) => \{\s+closeBookingModal\(\);/
  );
  const saveStart = dashboardScript.indexOf('alert(t.booking_saved_ok)');
  assert.notEqual(saveStart, -1, 'Missing booking save-success path');
  assert.match(
    dashboardScript.slice(Math.max(0, saveStart - 200), saveStart),
    /closeBookingModal\(\);/
  );
});

test('chatOrderModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="chatOrderModal" role="dialog" aria-modal="true" aria-labelledby="chatOrderModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="chatOrderModal"');
  const head = dashboardHtml.slice(headStart, headStart + 600);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('chatOrderModal open/save/close run the shared lifecycle with order-only scope', () => {
  assert.match(dashboardScript, /window\.openOrderModal = function\(orderId = null\)/);
  const openStart = dashboardScript.indexOf('window.openOrderModal = function');
  const openBlock = dashboardScript.slice(openStart, openStart + 2600);
  // D01 guards preserved inside the opener: disabled creation path + store-row guard.
  assert.match(openBlock, /chat_order_create_unsupported/);
  assert.match(openBlock, /isStoreOrder/);
  assert.match(openBlock, /ZainBotA11y\.openDialog\(modal,/);
  assert.match(openBlock, /background: document\.querySelector\('\.db-wrapper'\)/);
  assert.doesNotMatch(openBlock, /setInterval|polling|qrCode/i, 'order open owns no polling');

  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.order-modal-close'\)\.forEach\(btn => btn\.addEventListener\('click', \(\) => \{\s+closeOrderModal\(\);/
  );
  const saveStart = dashboardScript.indexOf('alert(t.order_saved_ok)');
  assert.notEqual(saveStart, -1, 'Missing order save-success path');
  const saveRegion = dashboardScript.slice(Math.max(0, saveStart - 300), saveStart);
  assert.match(saveRegion, /closeOrderModal\(\);/);
  // D01 PUT shape contract untouched: document-response OR success wrapper.
  assert.match(saveRegion, /res && \(res\.success \|\| res\._id\)/);
});

test('recipientModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="recipientModal" role="dialog" aria-modal="true" aria-labelledby="recipientModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="recipientModal"');
  const head = dashboardHtml.slice(headStart, headStart + 600);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('recipientModal open/save/close run the shared lifecycle with recipient-only scope', () => {
  assert.match(dashboardScript, /window\.openRecipientModal = function\(\)/);
  const openStart = dashboardScript.indexOf('window.openRecipientModal = function');
  const openBlock = dashboardScript.slice(openStart, openStart + 1600);
  assert.match(openBlock, /ZainBotA11y\.openDialog\(modal,/);
  assert.match(openBlock, /background: document\.querySelector\('\.db-wrapper'\)/);
  assert.doesNotMatch(openBlock, /setInterval|polling|qrCode/i, 'recipient open owns no polling');

  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.recipient-modal-close'\)\.forEach\(btn => btn\.addEventListener\('click', \(\) => \{\s+closeRecipientModal\(\);/
  );
  const saveStart = dashboardScript.indexOf('alert(t.recipient_saved_ok)');
  assert.notEqual(saveStart, -1, 'Missing recipient save-success path');
  assert.match(
    dashboardScript.slice(Math.max(0, saveStart - 200), saveStart),
    /closeRecipientModal\(\);/
  );
  // D07 flows untouched: test/delete never route through the dialog lifecycle.
  const flowsStart = dashboardScript.indexOf('window.testNotificationRecipient = async function');
  const flowsEnd = dashboardScript.indexOf("document.getElementById('addRecipientBtn')");
  assert.notEqual(flowsStart, -1, 'Missing recipient test flow');
  assert.notEqual(flowsEnd, -1, 'Missing recipient add wiring');
  const flowsBlock = dashboardScript.slice(flowsStart, flowsEnd);
  assert.doesNotMatch(flowsBlock, /ZainBotA11y|closeRecipientModal/);
});

test('channelModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="channelModal" role="dialog" aria-modal="true" aria-labelledby="channelModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="channelModal"');
  const head = dashboardHtml.slice(headStart, headStart + 600);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('channelModal opens on fresh dynamic nodes per branch (never stale content)', () => {
  // Four branch insertions (whatsapp/fb/ig/telegram) + the admin-bots
  // opener (E03c) — every open path routes the shared helper.
  const opens = dashboardScript.match(/^\s+openChannelModal\(\);$/gm) || [];
  assert.equal(opens.length, 5, `Expected branch opens + admin-bots opener, found ${opens.length}`);
  const helperStart = dashboardScript.indexOf('const openChannelModal = () =>');
  assert.notEqual(helperStart, -1, 'Missing openChannelModal helper');
  const helper = dashboardScript.slice(helperStart, helperStart + 900);
  assert.match(helper, /ZainBotA11y\.openDialog\(channelModalEl,/);
  assert.match(helper, /background: document\.querySelector\('\.db-wrapper'\)/);
});

test('every channel close path routes closeChannelModal; the .active poll gate survives', () => {
  // Static X + waDisconnect + fb/ig success + dynamic buttons = 5 sites.
  const closes = dashboardScript.match(/^\s+closeChannelModal\(\);$/gm) || [];
  assert.equal(closes.length, 5, `Expected 5 routed close sites, found ${closes.length}`);
  // The QR session-poll loop still stops on close via the .active gate.
  assert.match(
    dashboardScript,
    /while \(Date\.now\(\) < deadline && modal\.classList\.contains\('active'\)\)/
  );
  // onClose removes .active, so Escape-driven closeDialog stops polling too.
  assert.match(dashboardScript, /onClose: \(\) => channelModalEl\.classList\.remove\('active'\)/);
  // No raw classList close left in channel paths besides onClose + fallback.
  const helperStart = dashboardScript.indexOf('const openChannelModal = () =>');
  const logoutStart = dashboardScript.indexOf('function logout()');
  const region = dashboardScript.slice(helperStart, logoutStart);
  const rawRemoves = region.match(/\.classList\.remove\('active'\)/g) || [];
  assert.equal(rawRemoves.length, 2, `Expected only onClose + fallback removes, found ${rawRemoves.length}`);
});

test('channel close wiring adds no listeners and relink delegation is intact', () => {
  const staticWires = dashboardScript.match(/getElementById\('channelModal'\)\?\.querySelectorAll\('\.modal-close-btn'\)/g) || [];
  assert.equal(staticWires.length, 1, 'Static X must wire exactly once (no doubled listeners on reopen)');
  assert.match(
    dashboardScript,
    /modal\.querySelectorAll\('\.modal-close-btn'\)\.forEach\(btn => \{\s+btn\.addEventListener\('click', \(\) => \{\s+closeChannelModal\(\);/
  );
  assert.match(
    dashboardScript,
    /getElementById\('waRelinkBtn'\)\?\.addEventListener\('click', \(\) => \{\s+if \(typeof window\.configureChannel === 'function'\) window\.configureChannel\('whatsapp'\);/
  );
});
