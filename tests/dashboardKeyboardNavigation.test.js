const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// E04 — keyboard navigation / drawer / account disclosure.
// Static assertions over markup+wiring, plus behavioral fixtures that eval
// the real switchTab/focusPageHeading/setMobileMenuOpen/account-block
// sources in a fake DOM (extracted by brace matching — no DOM library).
// Drawer focus move/trap itself is E01-proven; here we prove the drawer
// opens THROUGH that lifecycle. Real browser matrix waits for A03/A04.

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function extractFunction(source, needle) {
  const start = source.indexOf(needle);
  assert.notEqual(start, -1, `Missing source block: ${needle}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces after: ${needle}`);
}

// --- Minimal fake DOM ---------------------------------------------------------

function makeDoc() {
  const doc = {
    activeElement: null,
    listeners: {},
    byId: {},
    addEventListener(type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); },
    fire(type, event) { (doc.listeners[type] || []).forEach((fn) => fn(event)); },
  };
  function makeEl(tag, attrs = {}) {
    const attrMap = new Map(Object.entries(attrs));
    const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      parent: null,
      hidden: false,
      isConnected: true,
      style: {},
      textContent: '',
      value: '',
      focused: false,
      focusCalls: 0,
      listeners: {},
      getAttribute: (n) => (attrMap.has(n) ? attrMap.get(n) : null),
      setAttribute: (n, v) => { attrMap.set(n, String(v)); },
      removeAttribute: (n) => { attrMap.delete(n); },
      hasAttribute: (n) => attrMap.has(n),
      classList: {
        toggle(c, force) {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          } else if (force) classes.add(c);
          else classes.delete(c);
        },
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      addEventListener(t, fn) { (el.listeners[t] = el.listeners[t] || []).push(fn); },
      fire(t, event) { (el.listeners[t] || []).forEach((fn) => fn(event)); },
      appendChild(c) { c.parent = el; el.children.push(c); return c; },
      contains(n) {
        let cur = n;
        while (cur) {
          if (cur === el) return true;
          cur = cur.parent;
        }
        return false;
      },
      focus() {
        el.focusCalls += 1;
        el.focused = true;
        doc.activeElement = el;
      },
      querySelector(sel) {
        const tags = sel.split(',').map((s) => s.trim().toUpperCase());
        const walk = (node) => {
          for (const c of node.children) {
            if (tags.includes(c.tagName)) return c;
            const found = walk(c);
            if (found) return found;
          }
          return null;
        };
        return walk(el);
      },
    };
    if (attrs.id) doc.byId[attrs.id] = el;
    return el;
  }
  doc.makeEl = makeEl;
  doc.querySelector = (sel) => {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return doc.byId[id] || null;
    }
    if (sel === '.db-main') return doc.main || null;
    return null;
  };
  doc.getElementById = (id) => doc.byId[id] || null;
  doc.querySelectorAll = (sel) => {
    if (sel === '.menu-item') return doc.menuButtons || [];
    if (sel === '.db-page') return doc.pages || [];
    return [];
  };
  return doc;
}

// --- Static: native menu buttons ----------------------------------------------

test('menu items are native buttons preserving data-target and labels', () => {
  const buttons = [...dashboardHtml.matchAll(/<button type="button" class="menu-item[^"]*" data-target="([^"]+)"[^>]*>/g)];
  assert.equal(buttons.length, 9, `Expected 9 menu buttons, found ${buttons.length}`);
  assert.deepEqual(
    buttons.map((m) => m[1]).sort(),
    ['page-admin', 'page-agents', 'page-channels', 'page-idea-council', 'page-inbox', 'page-orders', 'page-overview', 'page-settings', 'page-training']
  );
  assert.doesNotMatch(dashboardHtml, /<div class="menu-item/, 'No div menu items may remain');
  assert.match(dashboardHtml, /<button type="button" class="menu-item active" data-target="page-overview" aria-current="page">/);
});

test('hidden admin menu stays out of the tab order', () => {
  assert.match(dashboardHtml, /id="menu-admin" style="display:none;/);
  assert.match(dashboardScript, /adminMenu\.removeAttribute\('tabindex'\)/);
});

// --- Static: account disclosure ---------------------------------------------------

test('account menu is a plain disclosure, not menu/menuitem semantics', () => {
  assert.doesNotMatch(dashboardHtml, /role="menu"/);
  assert.doesNotMatch(dashboardHtml, /role="menuitem"/);
  assert.doesNotMatch(dashboardHtml, /aria-haspopup/);
  assert.match(dashboardHtml, /id="accountMenuToggle"[^>]*aria-controls="accountMenu"/);
  assert.match(dashboardScript, /accountMenuToggle\.focus\(\)/);
});

// --- Static: scoped focus-visible styles --------------------------------------------

test('scoped keyboard focus styles exist without touching layout', () => {
  assert.match(dashboardHtml, /button\.menu-item \{[^}]*background: transparent;/);
  assert.match(dashboardHtml, /button\.menu-item \{[^}]*text-align: start;/);
  assert.match(dashboardHtml, /\.db-sidebar \.menu-item:focus-visible,/);
  assert.match(dashboardHtml, /outline: 2px solid var\(--cyan\);/);
  assert.doesNotMatch(dashboardHtml, /E04[\s\S]{0,400}\.chat-customizer-grid/, 'E04 styles must not touch customizer layout');
});

// --- Static: wiring shape ---------------------------------------------------------------

test('user navigation passes focusHeading; refresh paths do not', () => {
  assert.match(dashboardScript, /item\.setAttribute\('aria-current', 'page'\)/);
  assert.match(dashboardScript, /if \(opts && opts\.focusHeading\) focusPageHeading\(tabId\);/);
  for (const site of [
    "switchTab('page-agents', { focusHeading: true })",
    "switchTab('page-training', { focusHeading: true })",
    "switchTab('page-training', { focusHeading: true })",
    "switchTab('page-settings', { focusHeading: true })",
  ]) {
    assert.ok(dashboardScript.includes(site), `Missing user-nav focus: ${site}`);
  }
  // E04 fix round 1: menu selection commits to the heading AFTER the
  // close restores the opener (single focus move, no flag involved).
  const clickStart = dashboardScript.indexOf('// Sidebar navigation click');
  assert.notEqual(clickStart, -1, 'Missing menu-click wiring');
  const clickBlock = dashboardScript.slice(clickStart, clickStart + 900);
  const order = ['switchTab(target);', 'setMobileMenuOpen(false);', 'focusPageHeading(target);']
    .map((s) => clickBlock.indexOf(s));
  assert.ok(order.every((i) => i !== -1), 'Menu handler must switch, close, then focus the heading');
  assert.ok(order[0] < order[1] && order[1] < order[2], 'Menu handler order: switch → close → heading');
  assert.match(dashboardScript, /if \(activeTab === 'page-overview'\) switchTab\('page-overview'\);/);
});

test('drawer and account close paths converge on shared cleanup', () => {
  assert.match(dashboardScript, /a11y\.openDialog\(sidebar,/);
  assert.match(dashboardScript, /background: document\.querySelector\('\.db-main'\)/);
  assert.match(dashboardScript, /a11y\.closeDialog\(sidebar\)/);
  assert.match(dashboardScript, /onClose: \(\) => setDrawerVisual\(false\)/);
  const scrimIdx = dashboardScript.indexOf("sidebarScrim.addEventListener('click'");
  assert.notEqual(scrimIdx, -1, 'Missing scrim close wiring');
  assert.match(dashboardScript, /sidebarScrim\.addEventListener\('click', \(\) => \{\s+setMobileMenuOpen\(false, true\);/);
  assert.match(dashboardScript, /event\.key === 'Escape' && sidebar\?\.classList\.contains\('mobile-open'\)/);
  assert.match(dashboardScript, /const handleSidebarBreakpointChange = \(\) => setMobileMenuOpen\(false\);/);
});

// --- Behavioral: switchTab ---------------------------------------------------------------

function switchTabHarness() {
  const doc = makeDoc();
  doc.menuButtons = ['page-overview', 'page-agents', 'page-inbox'].map((id, i) =>
    doc.makeEl('button', { class: i === 0 ? 'menu-item active' : 'menu-item', 'data-target': id })
  );
  const pages = {};
  for (const id of ['page-overview', 'page-agents', 'page-inbox']) {
    const page = doc.makeEl('section', { id, class: id === 'page-overview' ? 'db-page active' : 'db-page' });
    if (id !== 'page-inbox') page.appendChild(doc.makeEl('h2', {}));
    pages[id] = page;
  }
  doc.pages = Object.values(pages);
  const stubs = [
    'loadOverviewData', 'loadAgents', 'enterCouncilTab', 'loadInboxData',
    'loadTrainingData', 'loadChannelsData', 'loadOrdersData', 'enterSettingsTab',
    'loadAdminUsers', 'loadAdminKeys',
  ].map((n) => `function ${n}() {}`).join('\n');
  const src = `let activeTab = 'page-overview';\n${stubs}\n`
    + `${extractFunction(dashboardScript, 'function focusPageHeading(tabId)')}\n`
    + `${extractFunction(dashboardScript, 'function switchTab(tabId, opts)')}`;
  const sandbox = { document: doc, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { doc, pages, run: (code) => vm.runInContext(code, sandbox) };
}

test('user navigation sets aria-current and focuses the page heading', () => {
  const { doc, pages, run } = switchTabHarness();
  run(`switchTab('page-agents', { focusHeading: true });`);
  assert.equal(doc.menuButtons[0].getAttribute('aria-current'), null);
  assert.equal(doc.menuButtons[1].getAttribute('aria-current'), 'page');
  assert.equal(doc.activeElement, pages['page-agents'].children[0], 'heading focused');
  assert.equal(pages['page-agents'].children[0].getAttribute('tabindex'), '-1');
});

test('background refresh never moves focus and keeps headings untouched', () => {
  const { doc, pages, run } = switchTabHarness();
  const before = doc.activeElement;
  run(`switchTab('page-overview');`);
  assert.equal(doc.activeElement, before, 'no focus theft on refresh');
  assert.equal(pages['page-overview'].children[0].getAttribute('tabindex'), null, 'no tabindex injected on refresh');
  assert.equal(doc.menuButtons[0].getAttribute('aria-current'), 'page', 'aria-current still maintained');
});

test('heading-less pages fall back to the section itself', () => {
  const { doc, pages, run } = switchTabHarness();
  run(`switchTab('page-inbox', { focusHeading: true });`);
  assert.equal(doc.activeElement, pages['page-inbox'], 'section focused as fallback');
});

// --- Behavioral: drawer lifecycle -------------------------------------------------------------

function drawerHarness(matches) {
  const doc = makeDoc();
  const sidebar = doc.makeEl('aside', { id: 'sidebar' });
  const toggle = doc.makeEl('button', { id: 'menuMobileToggle' });
  const scrim = doc.makeEl('button', { id: 'sidebarScrim' });
  doc.main = doc.makeEl('main', { class: 'db-main' });
  doc.body = doc.makeEl('body', {});
  const firstItem = doc.makeEl('button', { class: 'menu-item' });
  sidebar.appendChild(firstItem);
  const media = {
    matches,
    listeners: {},
    addEventListener(t, fn) { (media.listeners[t] = media.listeners[t] || []).push(fn); },
    fireChange() { (media.listeners.change || []).forEach((fn) => fn()); },
  };
  const a11yCalls = [];
  // E01-faithful stack emulation (the real helper is proven in
  // uiAccessibility.test.js): close restores the opener when the stack
  // empties, otherwise focuses into the new top dialog.
  const a11yStack = [];
  const sandbox = {
    document: doc,
    window: {
      matchMedia: () => media,
      ZainBotA11y: {
        openDialog(el, opts) {
          a11yCalls.push(['open', el, opts]);
          a11yStack.push({ el, opener: opts && opts.opener });
        },
        closeDialog(el) {
          a11yCalls.push(['close', el]);
          const at = a11yStack.findIndex((e) => e.el === el);
          if (at === -1) return;
          const [closed] = a11yStack.splice(at, 1);
          if (a11yStack.length > 0) {
            const top = a11yStack[a11yStack.length - 1].el;
            const first = (top.children || []).find((c) => typeof c.focus === 'function') || top;
            if (first && typeof first.focus === 'function') first.focus();
          } else if (closed.opener && typeof closed.opener.focus === 'function' && !closed.opener.hidden) {
            closed.opener.focus();
          }
        },
      },
    },
    console,
  };
  vm.createContext(sandbox);
  const consts = [
    "const sidebar = document.getElementById('sidebar');",
    "const menuMobileToggle = document.getElementById('menuMobileToggle');",
    "const sidebarScrim = document.getElementById('sidebarScrim');",
    "const mobileSidebarMedia = window.matchMedia('(max-width: 991px)');",
  ].join('\n');
  const src = `${consts}\n`
    + `${extractFunction(dashboardScript, 'function setMobileMenuOpen(open, restoreToggleFocus = false)')}\n`
    + `${extractFunction(dashboardScript, 'function setDrawerVisual(shouldOpen)')}`;
  vm.runInContext(src, sandbox);
  const run = (code) => vm.runInContext(code, sandbox);
  // Wire the module's own listeners the way the IIFE does.
  run(`menuMobileToggle.addEventListener('click', () => {
    setMobileMenuOpen(!sidebar.classList.contains('mobile-open'));
  });`);
  run(`sidebarScrim.addEventListener('click', () => { setMobileMenuOpen(false, true); });`);
  run(`document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
      setMobileMenuOpen(false, true);
    }
  });`);
  run(`const handleSidebarBreakpointChange = () => setMobileMenuOpen(false);
    mobileSidebarMedia.addEventListener('change', handleSidebarBreakpointChange);`);
  return { doc, sidebar, toggle, scrim, media, a11yCalls, run };
}

test('opening the drawer on mobile isolates, traps (via lifecycle) and focuses inward', () => {
  const { doc, sidebar, toggle, scrim, a11yCalls, run } = drawerHarness(true);
  doc.activeElement = toggle;
  run(`setMobileMenuOpen(true);`);
  assert.ok(sidebar.classList.contains('mobile-open'));
  assert.ok(scrim.classList.contains('active'));
  assert.equal(a11yCalls.length, 1, 'exactly one lifecycle open');
  assert.equal(a11yCalls[0][0], 'open');
  assert.equal(a11yCalls[0][1], sidebar);
  assert.equal(a11yCalls[0][2].background, doc.main, 'background isolated, scrim stays live');
  assert.equal(typeof a11yCalls[0][2].onClose, 'function');
});

test('every close path converges: scrim, Escape, selection and resize clean up', () => {
  const { doc, sidebar, toggle, scrim, media, a11yCalls, run } = drawerHarness(true);
  run(`setMobileMenuOpen(true);`);
  assert.equal(a11yCalls.length, 1);
  scrim.fire('click', {});
  assert.ok(!sidebar.classList.contains('mobile-open'), 'scrim closes');
  assert.ok(!scrim.classList.contains('active'), 'scrim visual cleared');
  assert.ok(!doc.body.classList.contains('sidebar-open'), 'no stuck scroll-lock');
  assert.equal(doc.activeElement, toggle, 'focus restored to toggle');

  run(`setMobileMenuOpen(true);`);
  doc.fire('keydown', { key: 'Escape' });
  assert.ok(!sidebar.classList.contains('mobile-open'), 'Escape closes');

  run(`setMobileMenuOpen(true);`);
  media.fireChange();
  assert.ok(!sidebar.classList.contains('mobile-open'), 'resize cleans up');
  assert.ok(!scrim.classList.contains('active'), 'scrim cleared on resize');
  const closes = a11yCalls.filter((c) => c[0] === 'close');
  assert.equal(closes.length, 3, 'each close releases lifecycle isolation');
  assert.ok(closes.every((c) => c[1] === sidebar));
});

test('desktop never opens the drawer', () => {
  const { sidebar, scrim, a11yCalls, run } = drawerHarness(false);
  run(`setMobileMenuOpen(true);`);
  assert.ok(!sidebar.classList.contains('mobile-open'));
  assert.ok(!scrim.classList.contains('active'));
  assert.equal(a11yCalls.filter((c) => c[0] === 'open').length, 0, 'no lifecycle traffic on desktop');
});

// --- Behavioral: selection-commit vs cancel focus intent -------------------------------
// E04 fix round 1 (coordinator decision): mobile menu-select ends on the
// page heading; cancel/Escape/scrim keep standard restore-to-opener.

function selectionHarness() {
  const doc = makeDoc();
  const sidebar = doc.makeEl('aside', { id: 'sidebar' });
  const toggle = doc.makeEl('button', { id: 'menuMobileToggle' });
  const scrim = doc.makeEl('button', { id: 'sidebarScrim' });
  doc.main = doc.makeEl('main', { class: 'db-main' });
  doc.body = doc.makeEl('body', {});
  doc.menuButtons = ['page-overview', 'page-agents'].map((id) =>
    doc.makeEl('button', { class: 'menu-item', 'data-target': id })
  );
  doc.menuButtons.forEach((b) => sidebar.appendChild(b));
  const pages = {};
  for (const id of ['page-overview', 'page-agents']) {
    const page = doc.makeEl('section', { id, class: 'db-page' });
    page.appendChild(doc.makeEl('h2', {}));
    pages[id] = page;
  }
  doc.pages = Object.values(pages);
  const media = {
    matches: true,
    listeners: {},
    addEventListener(t, fn) { (media.listeners[t] = media.listeners[t] || []).push(fn); },
  };
  const a11yStack = [];
  const sandbox = {
    document: doc,
    window: {
      matchMedia: () => media,
      ZainBotA11y: {
        openDialog(el, opts) { a11yStack.push({ el, opener: opts && opts.opener }); },
        closeDialog(el) {
          const at = a11yStack.findIndex((e) => e.el === el);
          if (at === -1) return;
          const [closed] = a11yStack.splice(at, 1);
          if (a11yStack.length === 0 && closed.opener && typeof closed.opener.focus === 'function' && !closed.opener.hidden) {
            closed.opener.focus();
          }
        },
      },
    },
    console,
  };
  vm.createContext(sandbox);
  const consts = [
    "const sidebar = document.getElementById('sidebar');",
    "const menuMobileToggle = document.getElementById('menuMobileToggle');",
    "const sidebarScrim = document.getElementById('sidebarScrim');",
    "const mobileSidebarMedia = window.matchMedia('(max-width: 991px)');",
    'let activeTab = \'page-overview\';',
    'function loadOverviewData() {}',
    'function loadAgents() {}',
    'function enterCouncilTab() {}',
    'function loadInboxData() {}',
    'function loadTrainingData() {}',
    'function loadChannelsData() {}',
    'function loadOrdersData() {}',
    'function enterSettingsTab() {}',
    'function loadAdminUsers() {}',
    'function loadAdminKeys() {}',
  ].join('\n');
  const clickStart = dashboardScript.indexOf('// Sidebar navigation click');
  assert.notEqual(clickStart, -1, 'Missing menu-click wiring');
  const clickOpen = dashboardScript.indexOf('{', dashboardScript.indexOf('forEach', clickStart));
  let depth = 0;
  let clickEnd = -1;
  for (let i = clickOpen; i < dashboardScript.length; i++) {
    if (dashboardScript[i] === '{') depth += 1;
    if (dashboardScript[i] === '}') {
      depth -= 1;
      if (depth === 0) { clickEnd = i; break; }
    }
  }
  // Include the closing ');' of the forEach call.
  const clickBlock = dashboardScript.slice(clickStart, clickEnd + 3);
  const src = `${consts}\n`
    + `${extractFunction(dashboardScript, 'function setMobileMenuOpen(open, restoreToggleFocus = false)')}\n`
    + `${extractFunction(dashboardScript, 'function setDrawerVisual(shouldOpen)')}\n`
    + `${extractFunction(dashboardScript, 'function focusPageHeading(tabId)')}\n`
    + `${extractFunction(dashboardScript, 'function switchTab(tabId, opts)')}\n`
    + `${clickBlock}\n`
    + `document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('mobile-open')) {
        setMobileMenuOpen(false, true);
      }
    });`;
  vm.runInContext(src, sandbox);
  const run = (code) => vm.runInContext(code, sandbox);
  return { doc, sidebar, toggle, pages, run };
}

test('mobile menu-select ends on the page heading, not the opener', () => {
  const { doc, sidebar, toggle, pages, run } = selectionHarness();
  doc.activeElement = toggle;
  run(`setMobileMenuOpen(true);`);
  assert.ok(sidebar.classList.contains('mobile-open'));
  const agentsBtn = doc.menuButtons[1];
  agentsBtn.fire('click', {});
  assert.ok(!sidebar.classList.contains('mobile-open'), 'selection closes the drawer');
  assert.equal(doc.activeElement, pages['page-agents'].children[0], 'selection-commit ends on the heading');
});

test('Escape cancel ends on the opener and never touches the heading', () => {
  const { doc, sidebar, toggle, pages, run } = selectionHarness();
  doc.activeElement = toggle;
  run(`setMobileMenuOpen(true);`);
  doc.fire('keydown', { key: 'Escape' });
  assert.ok(!sidebar.classList.contains('mobile-open'), 'Escape closes');
  assert.equal(doc.activeElement, toggle, 'cancel restores the opener');
  assert.equal(pages['page-agents'].children[0].focusCalls, 0, 'heading untouched on cancel');
});

// --- Behavioral: account disclosure -------------------------------------------------------

function accountHarness() {
  const doc = makeDoc();
  const toggle = doc.makeEl('button', { id: 'accountMenuToggle' });
  const menu = doc.makeEl('div', { id: 'accountMenu' });
  menu.hidden = true;
  const settingsBtn = doc.makeEl('button', { id: 'accountSettingsBtn' });
  const logoutBtn = doc.makeEl('button', { id: 'accountLogoutBtn' });
  menu.appendChild(settingsBtn);
  menu.appendChild(logoutBtn);
  const outside = doc.makeEl('div', {});
  const calls = { switchTab: [], logout: 0 };
  const sandbox = {
    document: doc,
    console,
    switchTab: (id, opts) => { calls.switchTab.push([id, opts]); },
    logout: () => { calls.logout += 1; },
  };
  vm.createContext(sandbox);
  const consts = [
    "const accountMenuToggle = document.getElementById('accountMenuToggle');",
    "const accountMenu = document.getElementById('accountMenu');",
  ].join('\n');
  const blockStart = dashboardScript.indexOf('if (accountMenuToggle && accountMenu) {');
  assert.notEqual(blockStart, -1, 'Missing account-menu block');
  let depth = 0;
  const open = dashboardScript.indexOf('{', blockStart);
  let end = -1;
  for (let i = open; i < dashboardScript.length; i++) {
    if (dashboardScript[i] === '{') depth += 1;
    if (dashboardScript[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  const block = dashboardScript.slice(blockStart, end + 1);
  vm.runInContext(`${consts}\n${block}`, sandbox);
  return { doc, toggle, menu, outside, calls };
}

test('account toggle discloses; Escape closes and returns focus; outside click closes silently', () => {
  const { doc, toggle, menu, outside, calls } = accountHarness();
  toggle.fire('click', {});
  assert.equal(menu.hidden, false, 'toggle opens');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');

  doc.activeElement = menu;
  doc.fire('keydown', { key: 'Escape' });
  assert.equal(menu.hidden, true, 'Escape closes');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(doc.activeElement, toggle, 'focus returns to trigger');

  toggle.fire('click', {});
  assert.equal(menu.hidden, false, 'toggle reopens');
  doc.activeElement = outside;
  doc.fire('click', { target: outside });
  assert.equal(menu.hidden, true, 'outside click closes');
  assert.equal(doc.activeElement, outside, 'outside click steals no focus');
  assert.deepEqual(calls.switchTab, [], 'no navigation happened here');
});
