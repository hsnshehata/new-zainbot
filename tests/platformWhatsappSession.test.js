'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const express = require('express');
const request = require('supertest');

const {
  PLATFORM_SESSION_ID,
  DEFAULT_PLATFORM_BOT_ID,
  BROWSERLESS_PROFILE_DIR,
  buildBrowserlessUrl,
  killOrphanedBrowserlessSession,
  createPlatformWhatsappSession,
} = require('../server/services/platformWhatsappSession');
const PlatformWhatsAppSession = require('../server/models/PlatformWhatsAppSession');
const {
  createAdminPlatformWhatsappRouter,
} = require('../server/routes/adminPlatformWhatsapp');
const User = require('../server/models/User');
const AuditEvent = require('../server/models/AuditEvent');
const { signAccessToken } = require('../server/utils/authTokens');

function flush(ticks = 4) {
  let chain = Promise.resolve();
  for (let i = 0; i < ticks; i += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

function createSessionModel() {
  const docs = new Map();
  return {
    docs,
    async findOneAndUpdate(filter, update) {
      const key = filter.sessionId || PLATFORM_SESSION_ID;
      const existing = docs.get(key) || {
        sessionId: key,
        status: 'disconnected',
        qrCodeData: null,
        connected: false,
        phone: '',
        healthStatus: 'disconnected',
        lastHeartbeat: null,
      };
      const patch = update.$set ? { ...update.$set } : { ...update };
      Object.assign(existing, patch);
      docs.set(key, existing);
      return existing;
    },
    async findOne(filter) {
      return docs.get(filter.sessionId || PLATFORM_SESSION_ID) || null;
    },
    async updateOne(filter, update) {
      const key = filter.sessionId || PLATFORM_SESSION_ID;
      const existing = docs.get(key);
      if (existing) {
        Object.assign(existing, update.$set || update);
      }
      return { modifiedCount: existing ? 1 : 0 };
    },
  };
}

class FakeNoAuth {
  constructor() {
    this.client = null;
  }
}

class FakeClient extends EventEmitter {
  static instances = [];
  static onConstruct = null;

  constructor(options) {
    super();
    this.options = options;
    this.destroyCalls = 0;
    this.logoutCalls = 0;
    this.injectCalls = 0;
    this.initCalls = 0;
    this.info = {
      me: { user: '201099887766' },
      wid: { user: '201099887766' },
    };
    this.cdpCalls = [];
    this.waitForFunctionCalls = [];
    this.evaluateCalls = [];
    this.exposedFunctions = [];
    this.pupBrowser = new EventEmitter();
    this.pupPage = Object.assign(new EventEmitter(), {
      isClosed: () => false,
      exposeFunction: async (name, fn) => {
        this.exposedFunctions.push({ name, fn });
      },
      waitForFunction: async (expr, opts) => {
        this.waitForFunctionCalls.push({ expr, opts });
      },
      evaluate: async (fn) => {
        this.evaluateCalls.push(fn);
        return true;
      },
      target: () => ({
        createCDPSession: async () => ({
          send: async (method) => {
            this.cdpCalls.push(method);
          },
          detach: async () => {
            this.cdpCalls.push('detach');
          },
        }),
      }),
    });
    if (options?.authStrategy) {
      options.authStrategy.client = this;
    }
    if (typeof FakeClient.onConstruct === 'function') {
      FakeClient.onConstruct(this);
    }
    FakeClient.instances.push(this);
  }

  async inject() {
    this.injectCalls += 1;
  }

  async initialize() {
    this.initCalls += 1;
    if (this.options?.authStrategy?.afterBrowserInitialized) {
      await this.options.authStrategy.afterBrowserInitialized();
    }
  }

  async destroy() {
    this.destroyCalls += 1;
  }

  async logout() {
    this.logoutCalls += 1;
  }
}

const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

const fakeFs = {
  mkdirCalls: [],
  existsSync() {
    return false;
  },
  mkdirSync(dir, opts) {
    this.mkdirCalls.push({ dir, opts });
  },
};

test('PlatformWhatsAppSession schema exposes required fields and unique sessionId', () => {
  const schema = PlatformWhatsAppSession.schema;
  assert.equal(schema.path('sessionId').options.unique, true);
  assert.ok(schema.path('status'));
  assert.ok(schema.path('qrCodeData'));
  assert.ok(schema.path('connected'));
  assert.ok(schema.path('phone'));
  assert.ok(schema.path('healthStatus'));
  assert.ok(schema.path('lastHeartbeat'));
  assert.equal(schema.options.timestamps, true);
});

test('inject retry succeeds after navigation error and overrides window.WWebJS.getMsgKeyId', async () => {
  FakeClient.instances.length = 0;
  let attempts = 0;
  FakeClient.onConstruct = (client) => {
    client.inject = async function flakyInject() {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Execution context was destroyed, most likely because of a navigation.');
      }
      if (attempts === 2) {
        throw new Error('Protocol error (Runtime.callFunctionOn): Target closed');
      }
      client.injectCalls += 1;
    };
  };

  try {
    const SessionModel = createSessionModel();
    const service = createPlatformWhatsappSession({
      ClientClass: FakeClient,
      NoAuthClass: FakeNoAuth,
      SessionModel,
      ConversationModel: { async exists() { return false; } },
      fsModule: fakeFs,
      logger: silentLogger,
      browserlessUrl: '',
      profileDir: '/tmp/test-wa-platform-profile',
      injectRetryDelayMs: 5,
    });

    const client = await service.init();
    await client.inject();

    assert.equal(attempts, 3, 'inject should succeed on 3rd attempt after 2 navigation/protocol errors');
    assert.equal(client.injectCalls, 1);
    assert.equal(client.waitForFunctionCalls.length, 2);
    assert.equal(client.waitForFunctionCalls[0].expr, 'document.readyState === "complete"');
    assert.equal(client.evaluateCalls.length, 1, 'should override window.WWebJS.getMsgKeyId after inject');

    // Execute the injected evaluate callback against a simulated window.WWebJS
    const prevWindow = global.window;
    global.window = { WWebJS: { getMsgKeyId: () => 'legacy' } };
    try {
      client.evaluateCalls[0]();
      assert.equal(global.window.WWebJS.getMsgKeyId({ _serialized: 's1' }), 's1');
      assert.equal(global.window.WWebJS.getMsgKeyId({ $1: 'd1' }), 'd1');
      assert.equal(
        global.window.WWebJS.getMsgKeyId({ fromMe: true, remote: '2010@c.us', id: 'ABC' }),
        'true_2010@c.us_ABC'
      );
      assert.equal(global.window.WWebJS.getMsgKeyId({}), 'legacy');
      assert.equal(global.window.WWebJS.getMsgKeyId(null), undefined);
    } finally {
      if (prevWindow === undefined) delete global.window;
      else global.window = prevWindow;
    }

    // Verify NoAuth, webVersionCache, and CDP cache-only clear
    assert.ok(client.options.authStrategy instanceof FakeNoAuth);
    assert.deepEqual(client.options.webVersionCache, { type: 'none' });
    assert.deepEqual(client.cdpCalls, ['Network.clearBrowserCache', 'detach']);

    await service.disconnect();
  } finally {
    FakeClient.onConstruct = null;
  }
});

test("exposeFunction 'already exists' is ignored and transient errors retry up to 3 times", async () => {
  FakeClient.instances.length = 0;
  let exposeAttempts = 0;
  FakeClient.onConstruct = (client) => {
    client.pupPage.exposeFunction = async (name) => {
      exposeAttempts += 1;
      if (name === 'existingBinding') {
        throw new Error(`Failed to add page binding with name ${name}: window['${name}'] already exists!`);
      }
      if (name === 'flakyBinding' && exposeAttempts < 3) {
        throw new Error('Protocol error: Target closed');
      }
    };
    client.inject = async function testInject() {
      await this.pupPage.exposeFunction('existingBinding', () => {});
      await this.pupPage.exposeFunction('flakyBinding', () => {});
    };
  };

  try {
    const SessionModel = createSessionModel();
    const service = createPlatformWhatsappSession({
      ClientClass: FakeClient,
      NoAuthClass: FakeNoAuth,
      SessionModel,
      ConversationModel: { async exists() { return false; } },
      fsModule: fakeFs,
      logger: silentLogger,
      browserlessUrl: '',
      exposeRetryDelayMs: 5,
    });

    const client = await service.init();
    await client.inject();

    assert.equal(client.pupPage.exposeFunction._isIntercepted, true);
    assert.equal(exposeAttempts, 3, 'existingBinding ignores error (1), flakyBinding fails once (2) then succeeds (3)');

    // Second inject must not double-wrap exposeFunction
    const wrappedFn = client.pupPage.exposeFunction;
    await client.inject();
    assert.equal(client.pupPage.exposeFunction, wrappedFn);

    await service.disconnect();
  } finally {
    FakeClient.onConstruct = null;
  }
});

test('safety timer destroys and re-inits after 90s + 5s when ready never fires (fake timers)', async (t) => {
  FakeClient.instances.length = 0;
  const SessionModel = createSessionModel();

  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const service = createPlatformWhatsappSession({
      ClientClass: FakeClient,
      NoAuthClass: FakeNoAuth,
      SessionModel,
      ConversationModel: { async exists() { return false; } },
      fsModule: fakeFs,
      logger: silentLogger,
      browserlessUrl: '',
      initTimeoutMs: 180_000,
      safetyTimeoutMs: 90_000,
      safetyRetryDelayMs: 5_000,
    });

    await service.init();
    assert.equal(FakeClient.instances.length, 1);
    const firstClient = FakeClient.instances[0];

    // Before 90s: still waiting, not destroyed
    t.mock.timers.tick(89_999);
    await flush();
    assert.equal(firstClient.destroyCalls, 0);
    assert.equal(FakeClient.instances.length, 1);

    // At 90s: safety timer fires, destroys stuck client, marks disconnected
    t.mock.timers.tick(1);
    await flush();
    assert.equal(firstClient.destroyCalls, 1);
    assert.equal(service.getClient(), null);
    const midStatus = await service.getStatus();
    assert.equal(midStatus.status, 'disconnected');

    // After 5s retry delay: re-initializes with a fresh client
    t.mock.timers.tick(5_000);
    await flush();
    assert.equal(FakeClient.instances.length, 2);
    const secondClient = FakeClient.instances[1];
    assert.equal(service.getClient(), secondClient);

    // Emit ready on second client -> safety timer cleared, no 3rd client spawned
    secondClient.emit('ready');
    await flush();
    t.mock.timers.tick(120_000);
    await flush();
    assert.equal(secondClient.destroyCalls, 0);
    assert.equal(FakeClient.instances.length, 2);

    await service.disconnect();
  } finally {
    t.mock.timers.reset();
  }
});

test('qr event updates status to qr_ready and stores QR in DB and memory; ready sets connected + phone', async () => {
  FakeClient.instances.length = 0;
  const SessionModel = createSessionModel();
  const service = createPlatformWhatsappSession({
    ClientClass: FakeClient,
    NoAuthClass: FakeNoAuth,
    SessionModel,
    ConversationModel: { async exists() { return false; } },
    qrToDataURL: async (raw) => `data:image/png;base64,QR_${raw}`,
    fsModule: fakeFs,
    logger: silentLogger,
    browserlessUrl: '',
  });

  const client = await service.init();
  client.emit('qr', 'platform-raw-qr');
  await flush();

  const statusAfterQr = await service.getStatus();
  assert.equal(statusAfterQr.status, 'qr_ready');
  assert.equal(statusAfterQr.connected, false);
  assert.equal(statusAfterQr.hasQr, true);
  assert.equal(statusAfterQr.qrCodeData, 'data:image/png;base64,QR_platform-raw-qr');

  const qrInfo = await service.getQr();
  assert.equal(qrInfo.qr, 'platform-raw-qr');
  assert.equal(qrInfo.qrCodeData, 'data:image/png;base64,QR_platform-raw-qr');
  assert.equal(qrInfo.hasQr, true);

  client.emit('authenticated');
  await flush();
  const statusAuth = await service.getStatus();
  assert.equal(statusAuth.status, 'authenticating');
  assert.equal(statusAuth.hasQr, false);

  client.emit('ready');
  await flush();
  const statusReady = await service.getStatus();
  assert.equal(statusReady.status, 'connected');
  assert.equal(statusReady.connected, true);
  assert.equal(statusReady.phone, '201099887766');
  assert.equal(statusReady.qrCodeData, null);
  assert.equal(statusReady.hasQr, false);
  assert.equal(statusReady.healthStatus, 'healthy');

  await service.disconnect();
});

test('incoming message invokes processMessage with platform bot id, sends reply, downloads media, and skips groups/own/status', async () => {
  FakeClient.instances.length = 0;
  const SessionModel = createSessionModel();
  const engineCalls = [];
  const service = createPlatformWhatsappSession({
    ClientClass: FakeClient,
    NoAuthClass: FakeNoAuth,
    SessionModel,
    ConversationModel: { async exists() { return false; } },
    getBot: async () => ({ agentTools: { whatsappReactionsTool: { enabled: false } } }),
    processIncomingMessage: async (...args) => {
      engineCalls.push(args);
      return 'أهلاً بيك في زين بوت!';
    },
    fsModule: fakeFs,
    logger: silentLogger,
    browserlessUrl: '',
  });

  const client = await service.init();
  client.emit('ready');
  await flush();

  // Skipped messages: own, status broadcast, group
  client.emit('message', { fromMe: true, from: '20101@c.us', body: 'hi', id: { _serialized: 'm0' } });
  client.emit('message', { fromMe: false, from: 'status@broadcast', body: 'st', id: { _serialized: 'm1' } });
  client.emit('message', { fromMe: false, from: '12345@g.us', body: 'group', id: { _serialized: 'm2' } });
  await flush();
  assert.equal(engineCalls.length, 0);

  // Normal text message
  const replies = [];
  client.emit('message', {
    fromMe: false,
    isStatus: false,
    from: '20111222333@c.us',
    type: 'chat',
    body: 'عايز تفاصيل الباقات',
    id: { _serialized: 'msg-text-1' },
    reply: async (text) => { replies.push(text); },
  });
  await flush();

  assert.equal(engineCalls.length, 1);
  assert.deepEqual(engineCalls[0], [
    DEFAULT_PLATFORM_BOT_ID,
    '20111222333@c.us',
    'عايز تفاصيل الباقات',
    false,
    false,
    'msg-text-1',
    'whatsapp',
    null,
  ]);
  assert.deepEqual(replies, ['أهلاً بيك في زين بوت!']);

  // Image message downloads media into data URL
  client.emit('message', {
    fromMe: false,
    isStatus: false,
    from: '20111222333@c.us',
    type: 'image',
    body: '',
    id: { _serialized: 'msg-img-1' },
    downloadMedia: async () => ({ mimetype: 'image/jpeg', data: 'BASE64IMG' }),
    reply: async (text) => { replies.push(text); },
  });
  await flush();

  assert.equal(engineCalls.length, 2);
  assert.equal(engineCalls[1][0], DEFAULT_PLATFORM_BOT_ID);
  assert.equal(engineCalls[1][2], '[صورة]');
  assert.equal(engineCalls[1][3], true);
  assert.equal(engineCalls[1][7], 'data:image/jpeg;base64,BASE64IMG');

  await service.disconnect();
});

test('message reactions fire only when bound bot whatsappReactionsTool.enabled is true', async () => {
  FakeClient.instances.length = 0;
  const SessionModel = createSessionModel();
  let reactionsEnabled = false;
  const service = createPlatformWhatsappSession({
    ClientClass: FakeClient,
    NoAuthClass: FakeNoAuth,
    SessionModel,
    ConversationModel: { async exists() { return false; } },
    getBot: async () => ({
      agentTools: { whatsappReactionsTool: { enabled: reactionsEnabled } },
    }),
    processIncomingMessage: async () => 'العفو تحت أمرك',
    fsModule: fakeFs,
    logger: silentLogger,
    browserlessUrl: '',
  });

  const client = await service.init();
  client.emit('ready');
  await flush();

  const reactionsWhenDisabled = [];
  client.emit('message', {
    fromMe: false,
    from: '20111222333@c.us',
    type: 'chat',
    body: 'شكراً جزيلاً',
    id: { _serialized: 'msg-react-1' },
    react: async (emoji) => { reactionsWhenDisabled.push(emoji); },
    reply: async () => {},
  });
  await flush();
  assert.deepEqual(reactionsWhenDisabled, []);

  reactionsEnabled = true;
  const reactionsWhenEnabled = [];
  client.emit('message', {
    fromMe: false,
    from: '20111222333@c.us',
    type: 'chat',
    body: 'شكراً جزيلاً',
    id: { _serialized: 'msg-react-2' },
    react: async (emoji) => { reactionsWhenEnabled.push(emoji); },
    reply: async () => {},
  });
  await flush();
  assert.deepEqual(reactionsWhenEnabled, ['🙏']);

  await service.disconnect();
});

test('disconnect destroys client without logout and marks session disconnected', async () => {
  FakeClient.instances.length = 0;
  const SessionModel = createSessionModel();
  const service = createPlatformWhatsappSession({
    ClientClass: FakeClient,
    NoAuthClass: FakeNoAuth,
    SessionModel,
    ConversationModel: { async exists() { return false; } },
    fsModule: fakeFs,
    logger: silentLogger,
    browserlessUrl: '',
  });

  const client = await service.init();
  client.emit('ready');
  await flush();

  const afterDisconnect = await service.disconnect();
  assert.equal(client.destroyCalls, 1);
  assert.equal(client.logoutCalls, 0, 'disconnect must NOT call client.logout()');
  assert.equal(service.getClient(), null);
  assert.equal(afterDisconnect.status, 'disconnected');
  assert.equal(afterDisconnect.connected, false);
  assert.equal(afterDisconnect.qrCodeData, null);
  assert.equal(afterDisconnect.hasQr, false);
});

test('buildBrowserlessUrl and killOrphanedBrowserlessSession follow Gharam patterns', async () => {
  const { wsEndpoint, wsHeaders } = buildBrowserlessUrl('wss://1.2.3.4.sslip.io:3000?token=secret123');
  const parsed = new URL(wsEndpoint);
  assert.equal(parsed.hostname, '1.2.3.4');
  assert.equal(wsHeaders.Host, '1.2.3.4.sslip.io:3000');
  // 10 min keep-alive: survives deploy restarts, self-cleans zombie browsers that otherwise conflict with fresh pairings.
  assert.equal(parsed.searchParams.get('timeout'), '600000');
  const launch = JSON.parse(parsed.searchParams.get('launch'));
  assert.ok(launch.args.includes(`--user-data-dir=${BROWSERLESS_PROFILE_DIR}`));
  assert.ok(launch.args.includes('--no-sandbox'));

  const calls = [];
  await killOrphanedBrowserlessSession({
    browserlessUrl: 'wss://browserless.example.com?token=tok1',
    browserlessCooldownMs: 0,
    logger: silentLogger,
    axiosInstance: {
      async get(url) {
        calls.push(url);
        if (url.includes('/sessions')) {
          return {
            data: [
              { browserId: 'b-platform', userDataDir: '/workspace/wa-sessions/session-zainbot-platform' },
              { browserId: 'b-other', userDataDir: '/workspace/wa-sessions/session-other' },
            ],
          };
        }
        return { data: {} };
      },
    },
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0], /https:\/\/browserless\.example\.com\/sessions\?token=tok1/);
  assert.match(calls[1], /https:\/\/browserless\.example\.com\/kill\/b-platform\?token=tok1/);
});

test('admin platform-whatsapp routes enforce directSuperadminOnly and serve status/connect-qr/disconnect', async () => {
  const authUsers = new Map();
  const auditEvents = [];
  const origFindById = User.findById;
  const origAuditCreate = AuditEvent.create;

  const makeUser = (id, role) => ({
    _id: id,
    username: `u_${id}`,
    role,
    status: 'active',
    sessionVersion: 0,
  });
  const tokenFor = (user) => {
    authUsers.set(String(user._id), user);
    return signAccessToken(user);
  };

  User.findById = (id) => ({
    select: () => ({ lean: async () => authUsers.get(String(id)) || null }),
  });
  AuditEvent.create = async (evt) => {
    auditEvents.push(evt);
    return { _id: `audit-${auditEvents.length}`, ...evt };
  };

  try {
    let state = {
      sessionId: 'platform',
      status: 'disconnected',
      connected: false,
      phone: '',
      qrCodeData: null,
      hasQr: false,
      healthStatus: 'disconnected',
    };
    const mockService = {
      async getStatus() { return { ...state }; },
      async init() {
        state = {
          ...state,
          status: 'qr_ready',
          qrCodeData: 'data:image/png;base64,MOCKQR',
          hasQr: true,
        };
      },
      async waitForQrOrReady() {
        await flush();
        return { ...state };
      },
      async disconnect() {
        state = {
          ...state,
          status: 'disconnected',
          connected: false,
          qrCodeData: null,
          hasQr: false,
        };
        return { ...state };
      },
    };

    const app = express();
    app.use(express.json());
    app.use('/api/admin/platform-whatsapp', createAdminPlatformWhatsappRouter({
      sessionService: mockService,
      connectWaitMs: 50,
    }));

    const userToken = tokenFor(makeUser('507f191e810c19729de86101', 'user'));
    const adminToken = tokenFor(makeUser('507f191e810c19729de86102', 'superadmin'));

    // Unauthenticated rejected
    const unauth = await request(app).get('/api/admin/platform-whatsapp/status');
    assert.equal(unauth.status, 401);

    // Non-superadmin rejected
    const forbidden = await request(app)
      .get('/api/admin/platform-whatsapp/status')
      .set('Authorization', `Bearer ${userToken}`);
    assert.equal(forbidden.status, 403);

    // Superadmin GET /status
    const st = await request(app)
      .get('/api/admin/platform-whatsapp/status')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(st.status, 200);
    assert.equal(st.body.success, true);
    assert.equal(st.body.data.status, 'disconnected');
    assert.equal(st.body.data.hasQr, false);

    // Superadmin POST /connect-qr
    const conn = await request(app)
      .post('/api/admin/platform-whatsapp/connect-qr')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(conn.status, 200);
    assert.equal(conn.body.data.status, 'qr_ready');
    assert.equal(conn.body.data.hasQr, true);
    assert.equal(conn.body.data.qrCodeData, 'data:image/png;base64,MOCKQR');

    // Superadmin POST /disconnect
    const disc = await request(app)
      .post('/api/admin/platform-whatsapp/disconnect')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(disc.status, 200);
    assert.equal(disc.body.data.status, 'disconnected');
    assert.equal(disc.body.data.hasQr, false);
  } finally {
    User.findById = origFindById;
    AuditEvent.create = origAuditCreate;
  }
});

test('Admin dashboard Platform Settings section includes Platform WhatsApp Arabic RTL UI without bot selector', () => {
  const workspace = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
  const js = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');

  const sectionMatch = html.match(/id="adminSectionPlatformSettings"[\s\S]*?<\/section>/);
  assert.ok(sectionMatch, 'adminSectionPlatformSettings section must exist');
  const sectionHtml = sectionMatch[0];

  assert.match(sectionHtml, /id="platformWhatsappCard"/);
  assert.match(sectionHtml, /WhatsApp المنصة/);
  assert.match(sectionHtml, /id="platformWaStatusBadge"/);
  assert.match(sectionHtml, /id="platformWaQrImg"/);
  assert.match(sectionHtml, /id="platformWaConnectBtn"/);
  assert.match(sectionHtml, /id="platformWaDisconnectBtn"/);
  // Must NOT introduce a bot selector inside platform settings
  assert.doesNotMatch(sectionHtml, /<select\b/i, 'Platform WhatsApp UI must not have a bot selector');

  assert.match(js, /\/api\/admin\/platform-whatsapp\/status/);
  assert.match(js, /\/api\/admin\/platform-whatsapp\/connect-qr/);
  assert.match(js, /\/api\/admin\/platform-whatsapp\/disconnect/);
  assert.match(js, /platform_wa_title:\s*'WhatsApp المنصة'/);
  assert.match(js, /3000/);
});
