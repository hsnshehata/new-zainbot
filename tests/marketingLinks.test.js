const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const guide = fs.readFileSync(path.join(root, 'public/help.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'public/js/script.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');

test('footer links resolve to real page routes, files, or on-page targets', () => {
  assert.match(server, /app\.use\(express\.static\(path\.join\(__dirname, '\.\.\/public'\)\)\)/);
  const footer = html.split('<footer class="footer">')[1].split('</footer>')[0];
  const links = [...footer.matchAll(/<a\s+href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(links.length > 0);
  for (const href of links) {
    assert.notEqual(href, '#');
    if (href.startsWith('#')) assert.match(html, new RegExp(`id="${href.slice(1)}"`));
    else if (href === '/login' || href === '/register') assert.match(server, new RegExp(`app\\.get\\('${href}'`));
    else assert.ok(fs.existsSync(path.join(root, 'public', href.replace(/^\//, ''))), `${href} should be served as a static file`);
  }
  assert.match(guide, /data-i18n="step3_body"/);
  assert.match(guide, /en: \{/);
  assert.match(guide, /ar: \{/);
  assert.match(guide, /data-i18n-aria="language_label"/);
});

test('help guide translates every visible label and accessible language control', () => {
  const dictionary = vm.runInNewContext('(' + guide.split('const translations = ')[1].split(';\n      const button')[0] + ')');
  const keys = [...guide.matchAll(/data-i18n(?:-aria)?="([a-z0-9_]+)"/g)].map(match => match[1]);
  for (const language of ['en', 'ar']) {
    for (const key of keys) assert.ok(dictionary[language][key], `${language} missing ${key}`);
  }
});

test('pricing, demo and store integration copy reflect actual destinations and availability', () => {
  assert.match(html, /href="#demo"[^>]+data-i18n="hero_btn_secondary"/);
  assert.match(html, /data-i18n="int_manual_import"/);
  assert.doesNotMatch(html, /int-available|href="#"/);
  assert.match(html, /href="\/register\?plan=growth_1k"/);
  assert.match(html, /id="subscribeWhatsappBtn"[^>]+hidden/);
  for (const language of ['en', 'ar']) {
    const section = script.split(`    ${language}: {`)[1].split(language === 'en' ? '    ar: {' : '\n  };\n\n  const langToggleBtn')[0];
    for (const key of ['int_manual_import', 'hero_btn_secondary', 'pricing_payment_desc', 'footer_link_help']) {
      assert.match(section, new RegExp(`\\b${key}:`), `${language} missing ${key}`);
    }
  }
});

test('WhatsApp CTA only opens a configured, valid recipient', () => {
  const start = script.indexOf('  function normalizeWhatsappNumber(');
  const end = script.indexOf('  document.querySelectorAll(\'.plan-cta\')', start);
  assert.ok(start >= 0 && end > start);
  const anchor = {
    style: {}, hidden: false, attrs: {},
    removeAttribute(name) { delete this.attrs[name]; },
    setAttribute(name, value) { this.attrs[name] = value; },
    set href(value) { this.attrs.href = value; },
    get href() { return this.attrs.href; }
  };
  const context = { document: { getElementById: () => anchor }, window: {},
    currentLang: 'en', currentBilling: 'monthly', encodeURIComponent };
  vm.createContext(context);
  vm.runInContext(`${script.slice(script.indexOf('  function buildSubscribeMessage('), end)}\nrefreshWhatsappBtn();`, context);
  assert.equal(anchor.hidden, true);
  assert.equal(anchor.href, undefined);
  context.window.ZAINBOT_SUBSCRIBE_WHATSAPP = 'not-a-number';
  vm.runInContext('refreshWhatsappBtn()', context);
  assert.equal(anchor.hidden, true);
  context.window.ZAINBOT_SUBSCRIBE_WHATSAPP = '01012345678';
  vm.runInContext('refreshWhatsappBtn()', context);
  assert.equal(anchor.hidden, false);
  assert.match(anchor.href, /^https:\/\/wa\.me\/201012345678\?text=/);
  assert.match(decodeURIComponent(anchor.href), /ask about/);
});
