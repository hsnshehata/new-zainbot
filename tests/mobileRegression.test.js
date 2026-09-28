const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs
  .readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8')
  .replace(/\r\n/g, '\n');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const loginCss = fs
  .readFileSync(path.join(workspace, 'public', 'css', 'login.css'), 'utf8')
  .replace(/\r\n/g, '\n');

const styleBlocks = [...dashboardHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
const embeddedCss = styleBlocks.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBlocksWithSelector(css, selector) {
  const hits = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (selectors.includes(selector)) hits.push(m[2]);
  }
  return hits;
}

function extractAllMediaBodies(css, query) {
  const bodies = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(query, from);
    if (start === -1) break;
    const open = css.indexOf('{', start);
    assert.notEqual(open, -1, `Could not open media query: ${query}`);
    let depth = 0;
    let closed = false;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          bodies.push(css.slice(open + 1, i));
          from = i + 1;
          closed = true;
          break;
        }
      }
    }
    assert.ok(closed, `Unbalanced braces in media query: ${query}`);
  }
  assert.ok(bodies.length > 0, `Missing media query: ${query}`);
  return bodies;
}

function extractMediaBody(css, query) {
  return extractAllMediaBodies(css, query).join('\n');
}

// (1) Flex/grid children must be allowed to shrink below content width.
test('layout shells allow shrinking on narrow screens (min-width:0)', () => {
  for (const selector of ['.db-main', '.db-content', '.db-page', '.glass-card']) {
    const bodies = ruleBlocksWithSelector(embeddedCss, selector);
    assert.ok(bodies.length > 0, `No CSS rule found for ${selector}`);
    const shrinkable = bodies.some((body) => /min-width\s*:\s*0/.test(body));
    assert.ok(shrinkable, `${selector} must declare min-width:0 to avoid 390px clipping`);
  }
});

// (2) 600px breakpoint covers settings + tables via scroll containers, not clipping.
test('600px media query covers settings sections and tables scroll instead of clip', () => {
  const body = extractMediaBody(embeddedCss, '@media (max-width: 600px)');
  assert.match(body, /#page-settings/, '600px query must handle #page-settings');
  assert.match(body, /min-width\s*:\s*0/, '600px query must release min-width constraints');

  assert.match(
    embeddedCss,
    /\.custom-table-container\s*\{[^}]*overflow-x\s*:\s*auto/,
    '.custom-table-container must provide horizontal scroll for wide tables',
  );

  const tables = [...dashboardHtml.matchAll(/<table[^>]*>/g)];
  assert.ok(tables.length > 0, 'Expected at least one dashboard table');
  const unwrapped = [];
  for (const table of tables) {
    const context = dashboardHtml.slice(Math.max(0, table.index - 900), table.index);
    const scrolled = /custom-table-container/.test(context.slice(-600)) || /overflow-x\s*:\s*auto/.test(context);
    if (!scrolled) unwrapped.push(table[0].slice(0, 80));
  }
  assert.deepEqual(unwrapped, [], `Tables without overflow wrapper: ${unwrapped.join(' | ')}`);
});

// (3) Key layout shells must not carry a fixed inline width wider than a phone.
test('no fixed inline width over 390px on key layout shells', () => {
  const layoutDivs = [...dashboardHtml.matchAll(/<div[^>]*class="[^"]*(db-main|db-content|db-page|glass-card)[^"]*"[^>]*>/g)];
  assert.ok(layoutDivs.length > 0, 'Expected key layout divs in dashboard markup');
  const offenders = [];
  for (const div of layoutDivs) {
    const style = (div[0].match(/style="([^"]*)"/) || [])[1] || '';
    for (const m of style.matchAll(/(?:^|;)\s*(width|min-width)\s*:\s*(\d+)px/g)) {
      if (Number(m[2]) > 390) offenders.push(`${m[1]}:${m[2]}px in ${div[0].slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, [], `Fixed widths wider than 390px: ${offenders.join(' | ')}`);
});

// (4) Same translation-key contract as dashboardTranslations.test.js.
function keysInTranslationSection(language) {
  const start = dashboardScript.indexOf(`    ${language}: {`);
  const nextLanguage = language === 'en' ? '    ar: {' : '\n  };\n\n  // Helper: Get JWT token from storage';
  const end = dashboardScript.indexOf(nextLanguage, start + 1);
  assert.notEqual(start, -1, `Missing ${language} translation section`);
  assert.notEqual(end, -1, `Could not delimit ${language} translation section`);
  return new Set([...dashboardScript.slice(start, end).matchAll(/^\s{6}([a-z][a-z0-9_]*):/gm)].map((match) => match[1]));
}

function markupTranslationKeys(attribute) {
  const matcher = new RegExp(`${attribute}="([a-z][a-z0-9_]*)"`, 'g');
  return new Set([...dashboardHtml.matchAll(matcher)].map((match) => match[1]));
}

test('dashboard markup translation keys exist in Arabic and English', () => {
  const english = keysInTranslationSection('en');
  const arabic = keysInTranslationSection('ar');
  const keys = new Set([
    ...markupTranslationKeys('data-i18n'),
    ...markupTranslationKeys('data-i18n-placeholder'),
    ...markupTranslationKeys('data-i18n-aria'),
  ]);
  assert.ok(keys.size > 0, 'Expected data-i18n keys in dashboard markup');
  const missingEnglish = [...keys].filter((key) => !english.has(key));
  const missingArabic = [...keys].filter((key) => !arabic.has(key));
  assert.deepEqual(missingEnglish, [], `Missing English translations: ${missingEnglish.join(', ')}`);
  assert.deepEqual(missingArabic, [], `Missing Arabic translations: ${missingArabic.join(', ')}`);
});

// (5) Channel / catalog / onboarding wiring: JS hooks must resolve to real elements.
const CHANNEL_IDS = [
  'channelModal',
  'channelModalBody',
  'channelModalTitle',
  'statConnectedChannels',
  'chatActiveChannel',
];
const CATALOG_IDS = [
  'storeConnectorForm',
  'storeProvider',
  'storeUrl',
  'storeToken',
  'storeConsumerKey',
  'storeConsumerSecret',
  'storeCurrency',
  'syncStoreCatalog',
  'storeConnectorStatus',
  'storeConnectorFeedback',
];
const ONBOARDING_IDS = [
  'onboardingGuide',
  'onboardingSteps',
  'onboardingProgress',
  'onboardingFeedback',
  'onboardPersonalize',
  'onboardTrain',
  'onboardTest',
];

function jsHookedIds(script) {
  const refs = new Set();
  for (const m of script.matchAll(/getElementById\(\s*['"]([A-Za-z0-9_-]+)['"]/g)) refs.add(m[1]);
  for (const m of script.matchAll(/querySelector(?:All)?\(\s*['"]#([A-Za-z0-9_-]+)/g)) refs.add(m[1]);
  return refs;
}

test('channel/catalog/onboarding ids referenced in JS exist in markup', () => {
  const htmlIds = new Set([...dashboardHtml.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
  const jsTemplates = new Set([...dashboardScript.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));

  for (const id of [...CHANNEL_IDS, ...CATALOG_IDS, ...ONBOARDING_IDS]) {
    assert.ok(htmlIds.has(id), `Static element missing from dashboard.html: #${id}`);
  }

  const family = /channel|whatsapp|telegram|facebook|instagram|store|catalog|sync|onboard|fbDirect|igDirect|tgStatus|tgGenerate|waQr|waDisconnect/i;
  const hooked = [...jsHookedIds(dashboardScript)].filter((id) => family.test(id));
  assert.ok(hooked.length > 0, 'Expected channel/catalog/onboarding hooks in dashboard JS');
  const dangling = hooked.filter((id) => !htmlIds.has(id) && !jsTemplates.has(id));
  assert.deepEqual(dangling, [], `JS hooks with no element anywhere: ${dangling.join(', ')}`);
});

// Login page must also collapse to a single column on phones (covers login.css).
test('login layout collapses to one column on small screens', () => {
  const body = extractMediaBody(loginCss, '@media (max-width: 820px)');
  assert.match(body, /\.login-layout/, '820px query must restyle .login-layout');
  assert.match(body, /grid-template-columns\s*:\s*minmax\(0/, 'login layout must collapse to a single column');
  assert.match(loginCss, /@media\s*\(\s*max-width\s*:\s*480px\s*\)/, 'Expected a 480px phone breakpoint in login.css');
});
