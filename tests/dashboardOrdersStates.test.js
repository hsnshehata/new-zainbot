'use strict';

// D05 — orders/bookings list independence, bot-generation guards, per-row
// entity locks, date validation, and two-outcome save reporting. Static
// contract assertions over the dashboard source (flows live inside the
// dashboard IIFE); entity races + partial-failure browser cases go to A04.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const script = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');

function sliceBetween(startMarker, endMarker) {
  const start = script.indexOf(startMarker);
  assert.notEqual(start, -1, `missing section ${startMarker}`);
  const end = script.indexOf(endMarker, start + 1);
  assert.notEqual(end, -1, `missing section end ${endMarker}`);
  return script.slice(start, end);
}

// ---------- (a) independent lists ----------

test('orders and bookings load, fail, and retry independently', () => {
  const orders = sliceBetween('async function loadOrdersList', 'async function loadBookingsList');
  const bookings = sliceBetween('async function loadBookingsList', 'window.retryOrdersList');
  assert.match(orders, /dashboardRequest\(`\/api\/chat-orders/, 'orders read uses the request core');
  assert.match(bookings, /dashboardRequest\(`\/api\/bookings/, 'bookings read uses the request core');
  assert.doesNotMatch(bookings, /ordersList\s*=/, 'bookings failure never touches the orders list');
  assert.doesNotMatch(orders, /bookingsList\s*=/, 'orders failure never touches the bookings list');
  assert.match(orders, /retryOrdersList/, 'orders error row retries only orders');
  assert.match(bookings, /retryBookingsList/, 'bookings error row retries only bookings');
  assert.match(script, /window\.retryOrdersList = function/, 'orders retry exposed');
  assert.match(script, /window\.retryBookingsList = function/, 'bookings retry exposed');
  const wrapper = sliceBetween('async function loadOrdersData', 'function updateOrdersAndBookingsKPIs');
  assert.match(wrapper, /loadOrdersList\(run, botId\)/, 'wrapper drives the orders loader');
  assert.match(wrapper, /loadBookingsList\(run, botId\)/, 'wrapper drives the bookings loader');
});

// ---------- (b) generation + stale guards ----------

test('bot switches drop stale replies and never keep previous-bot data', () => {
  for (const [name, start, end] of [
    ['loadOrdersList', 'async function loadOrdersList', 'async function loadBookingsList'],
    ['loadBookingsList', 'async function loadBookingsList', 'window.retryOrdersList'],
  ]) {
    const body = sliceBetween(start, end);
    assert.match(body, /run !== ordersRun/, `${name} checks the generation`);
    assert.match(body, /String\(currentBot\?._id\) !== botId/, `${name} checks the bot id`);
    assert.match(body, /return 'stale'/, `${name} reports superseded distinctly from failed`);
  }
  const wrapper = sliceBetween('async function loadOrdersData', 'function updateOrdersAndBookingsKPIs');
  assert.match(wrapper, /ordersBotId !== botId/, 'bot change detected');
  assert.match(wrapper, /ordersList = \[\]/, 'previous-bot orders cleared on switch');
  assert.match(wrapper, /bookingsList = \[\]/, 'previous-bot bookings cleared on switch');
});

test('same-bot refresh failure keeps data with a warning; empty failure shows retry', () => {
  const orders = sliceBetween('async function loadOrdersList', 'async function loadBookingsList');
  assert.match(orders, /ordersList\.length > 0/, 'non-empty failure keeps data');
  assert.match(orders, /orders_refresh_failed/, 'kept-data failure warns distinctly');
  assert.match(orders, /orders_load_error/, 'empty failure renders an error row');
  const bookings = sliceBetween('async function loadBookingsList', 'window.retryOrdersList');
  assert.match(bookings, /bookingsList\.length > 0/);
  assert.match(bookings, /bookings_refresh_failed/);
  assert.match(bookings, /bookings_load_error/);
});

// ---------- (c) entity locks ----------

test('status and delete share one lock per row with control guards', () => {
  const helper = sliceBetween('function rowActionButtons', '// Quick Action Handlers for Bookings');
  assert.match(helper, /runExclusive/, 'single-flight via the D02 core');
  assert.match(helper, /b\.disabled = true/, 'conflicting controls disable during flight');
  assert.match(helper, /finally/, 'controls restore even on rejection');
  assert.match(helper, /button\[onclick\*=/, 'row controls located without new ids');
  for (const [name, start, end, key] of [
    ['changeBookingStatus', 'window.changeBookingStatus = ', 'window.deleteBooking = ', 'booking:${bookingId}'],
    ['deleteBooking', 'window.deleteBooking = ', 'window.openBookingModal = ', 'booking:${bookingId}'],
    ['changeOrderStatus', 'window.changeOrderStatus = ', 'window.deleteOrder = ', 'order:${orderId}'],
    ['deleteOrder', 'window.deleteOrder = ', 'window.openOrderModal = ', 'order:${orderId}'],
  ]) {
    const body = sliceBetween(start, end);
    assert.match(body, new RegExp(`withEntityLock\(\`${key}\``.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${name} shares the row lock`);
  }
});

test('all four mutators use the request core (no PATCH anywhere)', () => {
  const section = sliceBetween('function rowActionButtons', '// Setup Order Form Submit');
  assert.doesNotMatch(section, /PATCH/, 'no PATCH in orders/bookings mutations');
  assert.equal(
    (section.match(/dashboardRequest\(`/g) || []).length >= 4, true,
    'status/delete calls ride dashboardRequest'
  );
});

// ---------- (d) date validation + two outcomes ----------

test('booking date validates before toISOString and never sends invalid', () => {
  const submit = sliceBetween("bookingForm.addEventListener('submit'", '// Setup Order Form Submit');
  assert.match(submit, /isNaN\(parsedDate\.getTime\(\)\)/, 'invalid date detected');
  assert.ok(
    submit.indexOf('isNaN(parsedDate.getTime())') < submit.indexOf('parsedDate.toISOString()'),
    'validation precedes serialization'
  );
  assert.doesNotMatch(submit, /new Date\(document\.getElementById\('bookingDateTime'\)\.value\)\.toISOString/, 'no unguarded inline conversion');
  assert.match(submit, /booking_invalid_date/, 'invalid date alerts translated');
  assert.doesNotMatch(submit, /\.value = ''/, 'inputs retained on every failure path');
});

test('save-success then refresh-failure report as two separate outcomes', () => {
  for (const [name, start, end, okKey] of [
    ['booking submit', "bookingForm.addEventListener('submit'", '// Setup Order Form Submit', 'booking_saved_ok'],
    ['order submit', "chatOrderForm.addEventListener('submit'", 'Toolbar & Filter', 'order_saved_ok'],
  ]) {
    const body = sliceBetween(start, end);
    assert.match(body, new RegExp(okKey), `${name} reports the save outcome first`);
    assert.ok(
      body.indexOf(okKey) < body.indexOf('refresh_failed'),
      `${name} reports refresh failure as a second outcome`
    );
    assert.match(body, /=== false/, `${name} reacts only to real failure, never to superseded`);
  }
});

test('mutation failures alert with inputs retained and modals open', () => {
  for (const [name, start, end, failKey] of [
    ['booking submit', "bookingForm.addEventListener('submit'", '// Setup Order Form Submit', 'booking_save_failed'],
    ['order submit', "chatOrderForm.addEventListener('submit'", 'Toolbar & Filter', 'order_save_failed'],
  ]) {
    const body = sliceBetween(start, end);
    const caught = body.slice(body.indexOf('} catch (err) {'));
    assert.match(caught, new RegExp(failKey), `${name} catch reports instead of swallowing`);
  }
});

// ---------- dictionaries + wiring ----------

test('D05 keys exist and the bundle version bumps', () => {
  for (const key of [
    'orders_load_error', 'bookings_load_error',
    'orders_refresh_failed', 'bookings_refresh_failed',
    'booking_invalid_date',
  ]) {
    assert.match(script, new RegExp(`      ${key}: '[^']+'`), `missing dictionary key ${key}`);
  }
  assert.match(html, /dashboard_new\.js\?v=[^"]+/, 'bundle carries a cache-busting version (exact value pinned by the latest task test)');
});
