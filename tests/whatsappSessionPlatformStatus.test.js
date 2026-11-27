'use strict';

// tests/whatsappSessionPlatformStatus.test.js
// GET /api/whatsapp/session for the platform bot must report the platform
// session's live state (the session that actually carries its messages),
// not the per-bot QR manager's stale record.

const test = require('node:test');
const assert = require('node:assert/strict');

function stubModule(relativePath, exportsObject) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
  return resolved;
}

const PLATFORM_BOT_ID = '6a5fe76cb80db97e78937854';

const state = {
  platformStatus: null,
  managerCalls: [],
  managerResult: { status: 'connected', mode: 'whatsapp_web_qr' },
};

stubModule('../server/logger', { info() {}, warn() {}, error() {} });
stubModule('../server/services/platformWhatsappSession', {
  getPlatformBotId: () => PLATFORM_BOT_ID,
  getStatus: async () => state.platformStatus,
});
class FakeManagerError extends Error {}
stubModule('../server/services/whatsappSessionManager', {
  getWhatsAppSessionManager: () => ({
    getStatus: async (botId) => {
      state.managerCalls.push(String(botId));
      return state.managerResult;
    },
  }),
  WhatsAppSessionError: FakeManagerError,
});
stubModule('../server/middleware/authenticate', (req, res, next) => next());
stubModule('../server/middleware/botAccess', {
  loadAccessibleBot: (req, res, next) => next(),
});

const route = require('../server/routes/whatsapp');
const { resolveSessionStatus, PLATFORM_TO_SESSION_STATUS } = route;

test('platform bot reads the platform session live state', async () => {
  state.managerCalls.length = 0;
  state.platformStatus = {
    status: 'connected',
    connected: true,
    phone: '201012345678',
    updatedAt: '2026-11-27T02:36:00.000Z',
    lastHeartbeat: '2026-11-27T03:00:00.000Z',
  };

  const data = await resolveSessionStatus({ _id: PLATFORM_BOT_ID });

  assert.equal(state.managerCalls.length, 0, 'must not consult the QR manager for the platform bot');
  assert.equal(data.status, 'connected');
  assert.equal(data.connected, true);
  assert.equal(data.mode, 'platform');
  assert.equal(data.externalAccount, '201012345678');
  assert.equal(data.lastReadyAt, '2026-11-27T02:36:00.000Z');
  assert.equal(data.lastDisconnectedAt, null);
});

test('platform bot maps intermediate and disconnected states', async () => {
  const cases = [
    ['qr_ready', 'qr_required'],
    ['loading', 'connecting'],
    ['authenticating', 'connecting'],
    ['disconnected', 'disconnected'],
    ['unexpected_value', 'disconnected'],
  ];
  for (const [platformStatus, expected] of cases) {
    state.platformStatus = { status: platformStatus, connected: false, updatedAt: '2026-11-27T03:05:00.000Z' };
    const data = await resolveSessionStatus({ _id: PLATFORM_BOT_ID });
    assert.equal(data.status, expected, `${platformStatus} -> ${expected}`);
    assert.equal(data.connected, false);
  }
  assert.equal(PLATFORM_TO_SESSION_STATUS.connected, 'connected');
});

test('non-platform bot delegates to the per-bot manager', async () => {
  state.managerCalls.length = 0;
  const data = await resolveSessionStatus({ _id: 'other-bot-123' });
  assert.deepEqual(state.managerCalls, ['other-bot-123']);
  assert.equal(data.status, 'connected');
  assert.equal(data.mode, 'whatsapp_web_qr');
});
