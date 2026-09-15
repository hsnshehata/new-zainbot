const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  stableClientId,
  createWhatsAppSessionManager,
} = require('../server/services/whatsappSessionManager');

const BOT_ID = '507f191e810c19729de87009';
const USER_ID = '507f191e810c19729de86003';

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createConnectionModel() {
  const documents = new Map();
  return {
    documents,
    async findOneAndUpdate(filter, update) {
      const key = String(filter.botId);
      const existing = documents.get(key) || {
        _id: '507f191e810c19729de87999',
        botId: filter.botId,
        channel: 'whatsapp',
      };
      Object.assign(existing, update.$setOnInsert || {}, update.$set || {});
      documents.set(key, existing);
      return existing;
    },
    async findOne(filter) {
      return documents.get(String(filter.botId)) || null;
    },
    find() {
      return {
        async lean() {
          return [];
        },
      };
    },
  };
}

class FakeClient extends EventEmitter {
  static instances = [];

  constructor(options) {
    super();
    this.options = options;
    this.destroyCalls = 0;
    this.logoutCalls = 0;
    this.info = {
      wid: { user: '201000000000' },
      pushname: 'Business',
    };
    FakeClient.instances.push(this);
  }

  async initialize() {}

  async destroy() {
    this.destroyCalls += 1;
  }

  async logout() {
    this.logoutCalls += 1;
  }

  async getState() {
    return 'CONNECTED';
  }
}

class FakeRemoteAuth {
  constructor(options) {
    this.options = options;
  }
}

class FakeMongoStore {
  constructor(options) {
    this.options = options;
  }
}

test('stable WhatsApp client ids preserve the legacy bot-id convention', () => {
  assert.equal(stableClientId(BOT_ID), `bot-${BOT_ID}`);
  assert.throws(() => stableClientId('unsafe/id'), /valid bot id/i);
});

test('manager exposes real QR and ready states and preserves sessions on shutdown', async () => {
  FakeClient.instances.length = 0;
  const ConnectionModel = createConnectionModel();
  const released = [];
  const manager = createWhatsAppSessionManager({
    ClientClass: FakeClient,
    RemoteAuthClass: FakeRemoteAuth,
    MongoStoreClass: FakeMongoStore,
    ConnectionModel,
    ConversationModel: { async exists() { return false; } },
    mongooseInstance: {},
    leaseService: {
      async acquire() {
        return { ownerId: 'worker-1' };
      },
      async renew() {
        return { ownerId: 'worker-1' };
      },
      async release(resourceKey) {
        released.push(resourceKey);
      },
    },
    qrToDataURL: async (value) => `data:image/png;base64,${value}`,
    processIncomingMessage: async () => 'reply',
    logger: { info() {}, warn() {}, error() {} },
    workDirectory: '.test-whatsapp-runtime',
  });

  const initial = await manager.connect({ botId: BOT_ID, userId: USER_ID });
  assert.equal(initial.status, 'initializing');
  assert.equal(FakeClient.instances.length, 1);
  const client = FakeClient.instances[0];
  assert.equal(
    client.options.authStrategy.options.clientId,
    `bot-${BOT_ID}`
  );
  assert.equal(
    client.options.authStrategy.options.backupSyncIntervalMs,
    60_000
  );

  const qrWait = manager.waitForQrOrReady(BOT_ID, 1_000);
  await flush();
  client.emit('qr', 'real-whatsapp-qr-payload');
  const qrStatus = await qrWait;
  assert.equal(qrStatus.status, 'qr_required');
  assert.equal(
    qrStatus.qrCode,
    'data:image/png;base64,real-whatsapp-qr-payload'
  );

  client.emit('ready');
  await flush();
  const readyStatus = await manager.getStatus(BOT_ID);
  assert.equal(readyStatus.status, 'connected');
  assert.equal(readyStatus.connected, true);
  assert.match(readyStatus.externalAccount, /0000$/);

  await manager.shutdown();
  assert.equal(client.destroyCalls, 1);
  assert.equal(client.logoutCalls, 0);
  assert.equal(released.length, 1);
});
