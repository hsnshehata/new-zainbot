const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

test('mobile sidebar opens in both LTR and RTL', () => {
  // Base open rule (LTR).
  assert.match(dashboardHtml, /\.db-sidebar\.mobile-open\s*\{\s*transform:\s*translateX\(0\)/);
  // RTL override: html[dir="rtl"] .db-sidebar (0,2,1) beats .db-sidebar.mobile-open
  // (0,2,0), so without this rule the drawer stays off-screen in Arabic while
  // the scrim activates — a stuck blurred screen.
  assert.match(
    dashboardHtml,
    /html\[dir="rtl"\]\s*\.db-sidebar\.mobile-open\s*\{\s*transform:\s*translateX\(0\)/
  );
});

test('mobile sidebar toggle wiring exists', () => {
  assert.match(dashboardScript, /getElementById\('menuMobileToggle'\)/);
  assert.match(dashboardScript, /getElementById\('sidebarScrim'\)/);
  assert.match(dashboardScript, /sidebar\.classList\.toggle\('mobile-open'/);
  assert.match(dashboardScript, /matchMedia\('\(max-width: 991px\)'\)/);
  assert.match(dashboardHtml, /@media\s*\(max-width:\s*991px\)/);
});

test('settings grids fit narrow phone screens', () => {
  // Inline auto-fit grids must collapse with min() so tracks never force a
  // minimum width wider than the card on ~360px phones (RTL clipping).
  assert.match(dashboardHtml, /minmax\(min\(150px,\s*100%\)[^>]*id="plansGrid"/);
  assert.match(dashboardHtml, /id="subscriptionRequestForm"[^>]*minmax\(min\(160px,\s*100%\)/);
  // Plan buttons may wrap instead of forcing their track wider (root .btn is nowrap).
  assert.match(dashboardHtml, /\.plan-pick\s*\{[^}]*white-space:\s*normal/);
  // Grid children must not force tracks wider via automatic minimum size.
  assert.match(dashboardHtml, /#plansGrid\s*>\s*\*,[^}]*min-width:\s*0/);
});
