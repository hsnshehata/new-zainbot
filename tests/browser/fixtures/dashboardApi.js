'use strict';

// A03 browser fixtures — dashboard API interception table.
//
// DUAL-ENV: this file is (a) required by scripts/run-dashboard-browser-tests.js
// for a Node self-check, and (b) concatenated ABOVE
// tests/browser/dashboardSmoke.browser.js as the raw body of a Browserless
// /chrome/function call. Therefore: NO import/export statements, NO Node-only
// APIs. The module.exports guard at the bottom only activates under Node.
//
// RULE (standing): an API the table does not know is { kind: 'unknown' } —
// the harness fulfills it as a failure AND fails the run. Unknown APIs never
// get a mock success.

var SMOKE_TOKENS = {
  ORDINARY: 'fixture-token-ordinary',
  SUPERADMIN: 'fixture-token-superadmin',
  DEAD: 'fixture-token-dead',
};

var SMOKE_USERS = {
  ordinary: {
    _id: '507f191e810c19729de86001',
    username: 'smoke_user',
    email: 'smoke@example.com',
    role: 'user',
  },
  superadmin: {
    _id: '507f191e810c19729de86002',
    username: 'smoke_admin',
    email: 'smoke-admin@example.com',
    role: 'superadmin',
  },
};

var SMOKE_BOTS = [
  { _id: '507f191e810c19729de86101', name: 'Smoke Bot One', userId: SMOKE_USERS.ordinary._id },
  { _id: '507f191e810c19729de86102', name: 'Smoke Bot Two', userId: SMOKE_USERS.ordinary._id },
];

var SMOKE_LOGIN = { username: 'smoke_user', password: 'SmokePass123' };

// profileMode: 'ok' (token decides) | 'unauthorized' (always 401) |
// 'error500slow' (800ms delay, then 500 — recoverable-state path).
function matchSmokeApi(method, path, authHeader, bodyText, profileMode) {
  var auth = String(authHeader || '').replace(/^Bearer\s+/i, '');

  if (method === 'GET' && path === '/api/config') {
    return {
      kind: 'fulfill',
      status: 200,
      body: {
        googleClientId: 'fixture-google-client-id',
        subscribeWhatsapp: '',
        paymentMethods: ['instapay', 'vodafone_cash', 'orange_money', 'etisalat_cash'],
        plans: {},
      },
    };
  }

  if (method === 'POST' && path === '/api/auth/login') {
    var credentials = null;
    try {
      credentials = JSON.parse(String(bodyText || '{}'));
    } catch (_ignored) {
      credentials = null;
    }
    if (credentials && credentials.username === SMOKE_LOGIN.username
        && credentials.password === SMOKE_LOGIN.password) {
      return {
        kind: 'fulfill',
        status: 200,
        body: {
          success: true,
          token: SMOKE_TOKENS.ORDINARY,
          role: SMOKE_USERS.ordinary.role,
          userId: SMOKE_USERS.ordinary._id,
          username: SMOKE_USERS.ordinary.username,
        },
      };
    }
    return { kind: 'unknown', reason: 'login credentials outside the fixture pair' };
  }

  if (method === 'GET' && path === '/api/users/profile') {
    if (profileMode === 'unauthorized') {
      return { kind: 'fulfill', status: 401, body: { success: false, error: 'INVALID_SESSION' } };
    }
    if (profileMode === 'error500slow') {
      return {
        kind: 'fulfill',
        status: 500,
        delayMs: 800,
        body: { success: false, message: 'fixture profile failure' },
      };
    }
    if (auth === SMOKE_TOKENS.ORDINARY) {
      return {
        kind: 'fulfill',
        status: 200,
        body: {
          success: true,
          data: Object.assign({}, SMOKE_USERS.ordinary, { bots: SMOKE_BOTS }),
        },
      };
    }
    if (auth === SMOKE_TOKENS.SUPERADMIN) {
      return {
        kind: 'fulfill',
        status: 200,
        body: {
          success: true,
          data: Object.assign({}, SMOKE_USERS.superadmin, { bots: SMOKE_BOTS }),
        },
      };
    }
    return {
      kind: 'fulfill',
      status: 401,
      body: { success: false, error: auth ? 'INVALID_SESSION' : 'AUTH_REQUIRED' },
    };
  }

  if (method === 'GET' && path === '/api/subscriptions/mine') {
    // Empty queue — mirrors { success:true, data:[] } so boot-time
    // subscription refresh stays quiet without inventing requests.
    if (!auth) {
      return { kind: 'fulfill', status: 401, body: { success: false, error: 'AUTH_REQUIRED' } };
    }
    return { kind: 'fulfill', status: 200, body: { success: true, data: [] } };
  }

  return { kind: 'unknown', reason: method + ' ' + path + ' is outside the fixture table' };
}

if (typeof module !== 'undefined' && module && module.exports) {
  module.exports = { SMOKE_TOKENS: SMOKE_TOKENS, SMOKE_USERS: SMOKE_USERS, SMOKE_BOTS: SMOKE_BOTS, SMOKE_LOGIN: SMOKE_LOGIN, matchSmokeApi: matchSmokeApi };
}
