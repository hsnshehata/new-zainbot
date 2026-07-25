const path = require('path');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');

const ChannelConnection = require('../models/ChannelConnection');
const Conversation = require('../models/Conversation');
const logger = require('../logger');
const { processMessage } = require('../botEngine');
const {
  createRuntimeLeaseService,
} = require('./runtimeLeaseService');

const QR_TTL_MS = 2 * 60 * 1000;
const LEASE_RENEW_INTERVAL_MS = 30_000;
const BACKUP_SYNC_INTERVAL_MS = 60_000;
const RECENT_MESSAGE_TTL_MS = 10 * 60 * 1000;

class WhatsAppSessionError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'WhatsAppSessionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function stableClientId(botId) {
  const value = String(botId || '').trim();
  if (!/^[a-f0-9]{24}$/i.test(value)) {
    throw new WhatsAppSessionError(
      'INVALID_BOT_ID',
      'A valid bot id is required',
      400
    );
  }
  return `bot-${value}`;
}

function safeErrorCode(error, fallback = 'WHATSAPP_RUNTIME_ERROR') {
  const candidate = error?.code || error?.name || fallback;
  return String(candidate)
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/g, '_')
    .slice(0, 100);
}

function maskExternalId(value) {
  const normalized = String(value || '');
  if (normalized.length <= 4) return normalized ? '****' : '';
  return `${'*'.repeat(Math.min(8, normalized.length - 4))}${normalized.slice(-4)}`;
}

function serializeConnection(connection, runtime) {
  const value = connection?.toObject
    ? connection.toObject({ transform: false })
    : { ...(connection || {}) };
  return {
    id: value._id ? String(value._id) : null,
    botId: value.botId ? String(value.botId) : null,
    channel: value.channel || 'whatsapp',
    mode: value.mode || 'whatsapp_web_qr',
    status: value.status || 'disconnected',
    connected: value.status === 'connected',
    externalAccount: maskExternalId(value.externalAccountId),
    externalDisplayName: value.externalDisplayName || '',
    clientId: value.clientId || '',
    sessionStore: value.sessionStore || {
      type: 'mongo_remote_auth',
      sessionName: '',
    },
    requiresRelink: Boolean(value.requiresRelink),
    restoredFromLegacy: Boolean(value.restoredFromLegacy),
    health: value.health || {},
    lastQrAt: value.lastQrAt || null,
    qrExpiresAt: value.qrExpiresAt || null,
    lastReadyAt: value.lastReadyAt || null,
    lastDisconnectedAt: value.lastDisconnectedAt || null,
    qrCode: runtime?.qrCode || null,
  };
}

function createWhatsAppSessionManager(options = {}) {
  const ClientClass = options.ClientClass || Client;
  const RemoteAuthClass = options.RemoteAuthClass || RemoteAuth;
  const MongoStoreClass = options.MongoStoreClass || MongoStore;
  const ConnectionModel = options.ConnectionModel || ChannelConnection;
  const ConversationModel = options.ConversationModel || Conversation;
  const mongooseInstance = options.mongooseInstance || mongoose;
  const leaseService = options.leaseService || createRuntimeLeaseService();
  const qrToDataURL = options.qrToDataURL || QRCode.toDataURL;
  const processIncomingMessage = options.processIncomingMessage || processMessage;
  const log = options.logger || logger;
  const now = options.now || (() => new Date());
  const runtimes = new Map();
  const pendingStarts = new Map();
  const recentMessages = new Map();

  const workDirectory = path.resolve(
    options.workDirectory
      || process.env.WHATSAPP_SESSION_WORKDIR
      || path.join(process.cwd(), 'data', 'whatsapp')
  );

  function getPuppeteerOptions() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
    return {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    };
  }

  async function updateConnection(botId, update, options = {}) {
    return ConnectionModel.findOneAndUpdate(
      { botId, channel: 'whatsapp' },
      {
        $set: {
          ...update,
          'health.lastCheckAt': now(),
        },
        ...(options.setOnInsert ? { $setOnInsert: options.setOnInsert } : {}),
      },
      {
        upsert: Boolean(options.upsert),
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
  }

  function pruneRecentMessages() {
    const cutoff = now().getTime() - RECENT_MESSAGE_TTL_MS;
    for (const [messageId, seenAt] of recentMessages) {
      if (seenAt < cutoff) recentMessages.delete(messageId);
    }
  }

  async function isDuplicateMessage(botId, messageId) {
    if (!messageId) return false;
    pruneRecentMessages();
    const key = `${botId}:${messageId}`;
    if (recentMessages.has(key)) return true;
    const persisted = await ConversationModel.exists({
      botId,
      'messages.messageId': messageId,
    });
    if (persisted) return true;
    recentMessages.set(key, now().getTime());
    return false;
  }

  async function handleIncomingMessage(runtime, message) {
    if (
      !message
      || message.fromMe
      || message.isStatus
      || message.from === 'status@broadcast'
    ) {
      return;
    }

    const messageId = message.id?._serialized || '';
    if (await isDuplicateMessage(runtime.botId, messageId)) {
      return;
    }

    const isImage = message.type === 'image';
    const isVoice = message.type === 'audio' || message.type === 'ptt';
    let mediaDataUrl = null;
    if (isImage || isVoice) {
      const media = await message.downloadMedia();
      if (media?.data && media?.mimetype) {
        mediaDataUrl = `data:${media.mimetype};base64,${media.data}`;
      }
    }

    const reply = await processIncomingMessage(
      runtime.botId,
      message.from,
      message.body || (isImage ? '[صورة]' : isVoice ? '[رسالة صوتية]' : ''),
      isImage,
      isVoice,
      messageId || null,
      'whatsapp',
      mediaDataUrl
    );

    if (typeof reply === 'string' && reply.trim()) {
      await message.reply(reply);
    }

    await updateConnection(runtime.botId, {
      lastMessageAt: now(),
      'health.lastSuccessAt': now(),
      'health.errorCode': '',
    });
  }

  async function stopRuntime(botId, { logout = false, release = true } = {}) {
    const runtime = runtimes.get(String(botId));
    if (!runtime) return;
    runtimes.delete(String(botId));
    if (runtime.leaseTimer) clearInterval(runtime.leaseTimer);

    try {
      if (logout) {
        await runtime.client.logout();
      } else {
        await runtime.client.destroy();
      }
    } catch (error) {
      log.warn('whatsapp_runtime_stop_failed', {
        botId: String(botId),
        error: safeErrorCode(error),
      });
    } finally {
      if (release) {
        await leaseService.release(runtime.resourceKey).catch(() => {});
      }
    }
  }

  async function failRuntime(runtime, error, requiresRelink = false) {
    log.error('whatsapp_runtime_failed', {
      botId: runtime.botId,
      error: safeErrorCode(error),
    });
    await updateConnection(runtime.botId, {
      status: requiresRelink ? 'relink_required' : 'error',
      requiresRelink,
      'health.lastErrorAt': now(),
      'health.errorCode': safeErrorCode(error),
    }).catch(() => {});
    await stopRuntime(runtime.botId, { logout: false, release: true });
  }

  function bindClientEvents(runtime) {
    const { client, botId } = runtime;

    client.on('qr', async (qr) => {
      try {
        const generatedAt = now();
        runtime.qrCode = await qrToDataURL(qr, {
          margin: 2,
          errorCorrectionLevel: 'M',
        });
        runtime.qrExpiresAt = new Date(generatedAt.getTime() + QR_TTL_MS);
        await updateConnection(botId, {
          status: 'qr_required',
          requiresRelink: false,
          lastQrAt: generatedAt,
          qrExpiresAt: runtime.qrExpiresAt,
          'health.errorCode': '',
        });
      } catch (error) {
        await failRuntime(runtime, error);
      }
    });

    client.on('authenticated', async () => {
      runtime.qrCode = null;
      runtime.qrExpiresAt = null;
      await updateConnection(botId, {
        status: 'connecting',
        requiresRelink: false,
        qrExpiresAt: null,
        'health.errorCode': '',
      }).catch(() => {});
    });

    client.on('ready', async () => {
      runtime.qrCode = null;
      runtime.qrExpiresAt = null;
      const readyAt = now();
      const externalAccountId = client.info?.wid?.user || '';
      await updateConnection(botId, {
        status: 'connected',
        requiresRelink: false,
        externalAccountId,
        externalDisplayName: client.info?.pushname || '',
        lastReadyAt: readyAt,
        qrExpiresAt: null,
        'health.lastSuccessAt': readyAt,
        'health.errorCode': '',
      }).catch(() => {});
      log.info('whatsapp_runtime_ready', { botId });
    });

    client.on('remote_session_saved', async () => {
      await updateConnection(botId, {
        'health.lastSuccessAt': now(),
        'health.errorCode': '',
      }).catch(() => {});
      log.info('whatsapp_remote_session_saved', { botId });
    });

    client.on('auth_failure', async (message) => {
      const error = new Error('WhatsApp authentication failed');
      error.code = String(message || 'AUTH_FAILURE').slice(0, 100);
      await failRuntime(runtime, error, true);
    });

    client.on('disconnected', async (reason) => {
      await updateConnection(botId, {
        status: reason === 'LOGOUT' ? 'relink_required' : 'degraded',
        requiresRelink: reason === 'LOGOUT',
        lastDisconnectedAt: now(),
        'health.lastErrorAt': now(),
        'health.errorCode': safeErrorCode({ code: reason }, 'DISCONNECTED'),
      }).catch(() => {});
      await stopRuntime(botId, { logout: false, release: true });
    });

    client.on('message', (message) => {
      handleIncomingMessage(runtime, message).catch((error) => {
        log.error('whatsapp_message_processing_failed', {
          botId,
          error: safeErrorCode(error),
        });
      });
    });
  }

  async function startRuntime({ botId, userId, restoredFromLegacy = false }) {
    const normalizedBotId = String(botId);
    const normalizedUserId = String(userId);
    const clientId = stableClientId(normalizedBotId);
    const resourceKey = `whatsapp:${clientId}`;

    const existing = runtimes.get(normalizedBotId);
    if (existing) {
      return getStatus(normalizedBotId);
    }

    const lease = await leaseService.acquire(resourceKey);
    if (!lease) {
      throw new WhatsAppSessionError(
        'WHATSAPP_SESSION_ALREADY_RUNNING',
        'This WhatsApp session is active on another worker',
        409
      );
    }

    try {
      await updateConnection(normalizedBotId, {
        userId: normalizedUserId,
        mode: 'whatsapp_web_qr',
        status: 'initializing',
        clientId,
        sessionStore: {
          type: 'mongo_remote_auth',
          sessionName: `RemoteAuth-${clientId}`,
        },
        requiresRelink: false,
        restoredFromLegacy: Boolean(restoredFromLegacy),
        capabilities: ['text', 'image', 'audio', 'manual_reply'],
        'health.errorCode': '',
      }, {
        upsert: true,
        setOnInsert: {
          botId: normalizedBotId,
          channel: 'whatsapp',
        },
      });

      const store = new MongoStoreClass({ mongoose: mongooseInstance });
      const authStrategy = new RemoteAuthClass({
        clientId,
        dataPath: workDirectory,
        store,
        backupSyncIntervalMs: BACKUP_SYNC_INTERVAL_MS,
      });
      const client = new ClientClass({
        authStrategy,
        puppeteer: getPuppeteerOptions(),
        qrMaxRetries: 5,
        takeoverOnConflict: false,
      });
      const runtime = {
        botId: normalizedBotId,
        userId: normalizedUserId,
        clientId,
        resourceKey,
        client,
        qrCode: null,
        qrExpiresAt: null,
        leaseTimer: null,
      };
      runtimes.set(normalizedBotId, runtime);
      bindClientEvents(runtime);

      runtime.leaseTimer = setInterval(async () => {
        try {
          const renewed = await leaseService.renew(resourceKey);
          if (!renewed) {
            const error = new Error('WhatsApp runtime lease was lost');
            error.code = 'WHATSAPP_LEASE_LOST';
            await failRuntime(runtime, error);
          }
        } catch (error) {
          await failRuntime(runtime, error);
        }
      }, LEASE_RENEW_INTERVAL_MS);
      runtime.leaseTimer.unref?.();

      Promise.resolve()
        .then(() => client.initialize())
        .catch((error) => failRuntime(runtime, error));

      return getStatus(normalizedBotId);
    } catch (error) {
      await leaseService.release(resourceKey).catch(() => {});
      throw error;
    }
  }

  async function connect(input) {
    const key = String(input.botId);
    if (!pendingStarts.has(key)) {
      pendingStarts.set(
        key,
        startRuntime(input).finally(() => pendingStarts.delete(key))
      );
    }
    return pendingStarts.get(key);
  }

  async function getStatus(botId) {
    const normalizedBotId = String(botId);
    const connection = await ConnectionModel.findOne({
      botId: normalizedBotId,
      channel: 'whatsapp',
    });
    const runtime = runtimes.get(normalizedBotId);
    if (
      runtime?.qrExpiresAt
      && runtime.qrExpiresAt.getTime() <= now().getTime()
    ) {
      runtime.qrCode = null;
    }
    return serializeConnection(connection, runtime);
  }

  async function disconnect(botId) {
    const normalizedBotId = String(botId);
    await stopRuntime(normalizedBotId, { logout: true, release: true });
    const disconnectedAt = now();
    const connection = await updateConnection(normalizedBotId, {
      status: 'disconnected',
      requiresRelink: false,
      externalAccountId: '',
      externalDisplayName: '',
      qrExpiresAt: null,
      lastDisconnectedAt: disconnectedAt,
      'health.lastCheckAt': disconnectedAt,
      'health.errorCode': '',
    });
    return serializeConnection(connection);
  }

  async function sendMessage(botId, chatId, text) {
    const runtime = runtimes.get(String(botId));
    if (!runtime) {
      throw new WhatsAppSessionError(
        'WHATSAPP_SESSION_NOT_RUNNING',
        'The WhatsApp session is not active',
        409
      );
    }
    const state = await runtime.client.getState();
    if (state !== 'CONNECTED') {
      throw new WhatsAppSessionError(
        'WHATSAPP_SESSION_NOT_CONNECTED',
        'The WhatsApp session is not connected',
        409
      );
    }
    return runtime.client.sendMessage(chatId, text);
  }

  async function restorePersistedSessions() {
    const connections = await ConnectionModel.find({
      channel: 'whatsapp',
      mode: 'whatsapp_web_qr',
      requiresRelink: false,
      status: {
        $in: ['connected', 'degraded', 'initializing', 'connecting'],
      },
    }).lean();

    const results = [];
    for (const connection of connections) {
      try {
        await connect({
          botId: connection.botId,
          userId: connection.userId,
          restoredFromLegacy: connection.restoredFromLegacy,
        });
        results.push({ botId: String(connection.botId), restored: true });
      } catch (error) {
        results.push({
          botId: String(connection.botId),
          restored: false,
          error: safeErrorCode(error),
        });
      }
    }
    return results;
  }

  async function shutdown() {
    const botIds = [...runtimes.keys()];
    await Promise.allSettled(
      botIds.map((botId) => stopRuntime(botId, {
        logout: false,
        release: true,
      }))
    );
  }

  return {
    connect,
    disconnect,
    getStatus,
    sendMessage,
    restorePersistedSessions,
    shutdown,
    stableClientId,
    _runtimes: runtimes,
  };
}

let defaultManager;

function getWhatsAppSessionManager() {
  if (!defaultManager) {
    defaultManager = createWhatsAppSessionManager();
  }
  return defaultManager;
}

module.exports = {
  QR_TTL_MS,
  WhatsAppSessionError,
  stableClientId,
  serializeConnection,
  createWhatsAppSessionManager,
  getWhatsAppSessionManager,
};
