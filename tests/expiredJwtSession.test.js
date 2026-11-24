'use strict';
// An expired JWT must count as "no session" (and be cleared) even when the
// stored tokenExpiry is missing or stale, so /login never bounces to
// /dashboard and back.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeEnv(items) {
  const store = new Map(Object.entries(items));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const win = { localStorage, location: { href: '' }, atob: (s) => Buffer.from(s, 'base64').toString('binary') };
  const ctx = vm.createContext({ window: win, localStorage, atob: win.atob, alert() {}, document: {}, console, Date, parseInt, JSON, String });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'utils.js'), 'utf8'), ctx);
  return { win, store };
}
const jwt = (exp) => `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
const now = Math.floor(Date.now() / 1000);

let e = makeEnv({ token: jwt(now - 60), role: 'user', userId: 'u1' });
assert.strictEqual(e.win.getAuthToken(), null, 'expired JWT without tokenExpiry is no session');
assert.strictEqual(e.store.has('token'), false, 'expired token cleared');
assert.strictEqual(e.store.has('role'), false);

e = makeEnv({ token: jwt(now - 60), tokenExpiry: String(Date.now() + 3600000) });
assert.strictEqual(e.win.getAuthToken(), null, 'expired JWT with stale tokenExpiry is no session');

e = makeEnv({ token: jwt(now + 3600), tokenExpiry: String(Date.now() + 3600000) });
assert.ok(e.win.getAuthToken(), 'valid JWT kept');
assert.strictEqual(e.store.has('token'), true);

e = makeEnv({ token: 'not-a-jwt' });
assert.strictEqual(e.win.getAuthToken(), 'not-a-jwt', 'unreadable token is left to the server');
console.log('expired jwt session tests passed');
