const fs = require('fs');
const path = require('path');
const axios = require('axios');
const QRCode = require('qrcode');
const { Client, NoAuth } = require('whatsapp-web.js');

const PlatformWhatsAppSession = require('../models/PlatformWhatsAppSession');
const Bot = require('../models/Bot');
const Conversation = require('../models/Conversation');
const logger = require('../logger');
const { pickReaction } = require('./whatsappReactions');

const PLATFORM_SESSION_ID = 'platform';
const DEFAULT_PLATFORM_BOT_ID = '6a5fe76cb80db97e78937854';
const DEFAULT_PROFILE_DIR = '/data/wa-platform-profile';
const BROWSERLESS_PROFILE_DIR = '/workspace/wa-sessions/session-zainbot-platform';
const BROWSERLESS_PROFILE_MATCH = 'session-zainbot-platform';

const INIT_TIMEOUT_MS = 180_000;
const SAFETY_TIMEOUT_MS = 90_000;
const SAFETY_RETRY_DELAY_MS = 5_000;
const INJECT_MAX_RETRIES = 8;
const INJECT_RETRY_DELAY_MS = 3_000;
const EXPOSE_MAX_RETRIES = 3;
const EXPOSE_RETRY_DELAY_MS = 2_000;
const BROWSERLESS_COOLDOWN_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 120_000;
const QR_CHANNEL_MAX_AGE_MS = 20 * 60 * 1000;
const HEARTBEAT_PROBE_TIMEOUT_MS = 8_000;
const HEARTBEAT_RECONNECT_COOLDOWN_MS = 2 * 60 * 1000;
const RECENT_MESSAGE_TTL_MS = 10 * 60 * 1000;

function getPlatformBotId() {
  return (process.env.PLATFORM_WHATSAPP_BOT_ID || '').trim() || DEFAULT_PLATFORM_BOT_ID;
}

function resolveProfileDir(overrideDir) {
  return (overrideDir || process.env.WA_PLATFORM_PROFILE_DIR || '').trim() || DEFAULT_PROFILE_DIR;
}

function buildBrowserlessUrl(browserlessUrlOverride) {
  let wsUrlString = (browserlessUrlOverride !== undefined
    ? browserlessUrlOverride
    : process.env.BROWSERLESS_URL) || '';
  const wsHeaders = {};

  if (!wsUrlString) return { wsEndpoint: '', wsHeaders };

  try {
    const parsed = new URL(wsUrlString);
    if (parsed.hostname.includes('.sslip.io')) {
      const match = parsed.hostname.match(/(\d+\.\d+\.\d+\.\d+)\.sslip\.io/);
      if (match) {
        const ip = match[1];
        const originalHost = parsed.host;
        parsed.hostname = ip;
        wsUrlString = parsed.toString();
        wsHeaders.Host = originalHost;
      }
    }
  } catch (err) {
    logger.error('platform_whatsapp_browserless_url_parse_failed', {
      error: err?.message || String(err),
    });
  }

  const wsUrl = new URL(wsUrlString);
  const launchConfig = {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-cache',
      '--disk-cache-size=0',
      `--user-data-dir=${BROWSERLESS_PROFILE_DIR}`,
    ],
  };
  wsUrl.searchParams.append('launch', JSON.stringify(launchConfig));
  wsUrl.searchParams.append('timeout', '600000'); // 10 min keep-alive: long enough for restarts, short enough to self-clean zombies

  return { wsEndpoint: wsUrl.toString(), wsHeaders };
}

async function killOrphanedBrowserlessSession(options = {}) {
  const wsUrlString = (options.browserlessUrl !== undefined
    ? options.browserlessUrl
    : process.env.BROWSERLESS_URL) || '';
  if (!wsUrlString) return;

  const httpClient = options.axiosInstance || axios;
  const log = options.logger || logger;
  const cooldownMs = options.browserlessCooldownMs ?? BROWSERLESS_COOLDOWN_MS;

  try {
    const wsUrl = new URL(wsUrlString);
    const httpProtocol = wsUrl.protocol === 'wss:' ? 'https:' : 'http:';
    const httpUrl = `${httpProtocol}//${wsUrl.host}`;
    const token = wsUrl.searchParams.get('token');

    if (!token) return;

    const sessionsUrl = `${httpUrl}/sessions?token=${encodeURIComponent(token)}`;
    const response = await httpClient.get(sessionsUrl, { timeout: 10_000 });
    const sessions = response?.data;

    if (Array.isArray(sessions)) {
      const sessionsToKill = sessions.filter((s) => {
        let decodedUrl = '';
        try {
          decodedUrl = s.initialConnectURL ? decodeURIComponent(s.initialConnectURL) : '';
        } catch (_e) {
          decodedUrl = s.initialConnectURL || '';
        }
        return (
          (s.userDataDir && s.userDataDir.includes(BROWSERLESS_PROFILE_MATCH))
          || (decodedUrl && decodedUrl.includes(BROWSERLESS_PROFILE_MATCH))
        );
      });

      const uniqueBrowserIds = [
        ...new Set(sessionsToKill.map((s) => {
          if (s.browserId) return s.browserId;
          const wsEp = s.browserWSEndpoint || '';
          const m = wsEp.match(/\/devtools\/browser\/([a-f0-9-]+)/i);
          return m ? m[1] : null;
        }).filter(Boolean)),
      ];

      for (const browserId of uniqueBrowserIds) {
        log.info('platform_whatsapp_killing_orphaned_browserless_session', { browserId });
        const killUrl = `${httpUrl}/kill/${browserId}?token=${encodeURIComponent(token)}`;
        await httpClient.get(killUrl, { timeout: 10_000 }).catch((e) => {
          log.warn('platform_whatsapp_kill_browserless_failed', {
            browserId,
            error: e?.message || String(e),
          });
        });
      }

      if (uniqueBrowserIds.length > 0 && cooldownMs > 0) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    }
  } catch (err) {
    log.warn('platform_whatsapp_browserless_cleanup_failed', {
      error: err?.message || String(err),
    });
  }
}

function createPlatformWhatsappSession(options = {}) {
  const sessionId = options.sessionId || PLATFORM_SESSION_ID;
  const ClientClass = options.ClientClass || Client;
  const NoAuthClass = options.NoAuthClass || NoAuth;
  const SessionModel = options.SessionModel || PlatformWhatsAppSession;
  const BotModel = options.BotModel || Bot;
  const ConversationModel = options.ConversationModel || Conversation;
  const qrToDataURL = options.qrToDataURL || ((qr) => QRCode.toDataURL(qr));
  const axiosInstance = options.axiosInstance || axios;
  const fsModule = options.fsModule || fs;
  const log = options.logger || logger;
  const now = options.now || (() => new Date());
  const pickMessageReaction = options.pickReaction || pickReaction;
  const resolveBotId = options.getPlatformBotId || getPlatformBotId;
  const getBot = options.getBot || (async (botId) => (
    BotModel.findById(botId).select('agentTools.whatsappReactionsTool').lean()
  ));
  const processIncomingMessage = options.processIncomingMessage || ((...args) => (
    // Lazy-require avoids circular or test-time side effects when botEngine is mocked.
    require('../botEngine').processMessage(...args)
  ));
  const handlePlatformMerchantMessage = options.handlePlatformMerchantMessage !== undefined
    ? options.handlePlatformMerchantMessage
    : ((payload) => require('./platformMerchantAssistantRouter').handleIncomingPlatformMessage(payload));

  const initTimeoutMs = options.initTimeoutMs ?? INIT_TIMEOUT_MS;
  const safetyTimeoutMs = options.safetyTimeoutMs ?? SAFETY_TIMEOUT_MS;
  const safetyRetryDelayMs = options.safetyRetryDelayMs ?? SAFETY_RETRY_DELAY_MS;
  const injectMaxRetries = options.injectMaxRetries ?? INJECT_MAX_RETRIES;
  const injectRetryDelayMs = options.injectRetryDelayMs ?? INJECT_RETRY_DELAY_MS;
  const exposeMaxRetries = options.exposeMaxRetries ?? EXPOSE_MAX_RETRIES;
  const exposeRetryDelayMs = options.exposeRetryDelayMs ?? EXPOSE_RETRY_DELAY_MS;
  const browserlessCooldownMs = options.browserlessCooldownMs ?? BROWSERLESS_COOLDOWN_MS;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const heartbeatProbeTimeoutMs = options.heartbeatProbeTimeoutMs ?? HEARTBEAT_PROBE_TIMEOUT_MS;
  const heartbeatReconnectCooldownMs = options.heartbeatReconnectCooldownMs ?? HEARTBEAT_RECONNECT_COOLDOWN_MS;

  let activeClient = null;
  let pendingInit = null;
  let latestQrRaw = null;
  let latestQrDataUrl = null;
  let manualDisconnect = false;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  let safetyTimer = null;
  let safetyRetryTimer = null;
  let qrChannelTimer = null;
  let heartbeatInterval = null;
  const statusWaiters = new Set();
  const recentMessages = new Map();
  // Last reaction emoji per sender, so consecutive reactions never repeat.
  // Small, capped, and reset with the process (variety, not history).
  const lastReactionBySender = new Map();
  const LAST_REACTION_MAX_SENDERS = 1000;

  function rememberLastReaction(sender, emoji) {
    if (!sender || !emoji) return;
    if (lastReactionBySender.size >= LAST_REACTION_MAX_SENDERS) {
      const oldest = lastReactionBySender.keys().next();
      if (!oldest.done) lastReactionBySender.delete(oldest.value);
    }
    lastReactionBySender.set(sender, emoji);
  }

  function notifyWaiters() {
    if (!statusWaiters.size) return;
    const waiters = [...statusWaiters];
    statusWaiters.clear();
    for (const resolve of waiters) resolve();
  }

  function clearSafetyTimers() {
    if (safetyTimer) {
      clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    if (safetyRetryTimer) {
      clearTimeout(safetyRetryTimer);
      safetyRetryTimer = null;
    }
    if (qrChannelTimer) {
      clearTimeout(qrChannelTimer);
      qrChannelTimer = null;
    }
  }

  function clearReconnectState() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = 0;
  }

  async function updateSession(update) {
    return SessionModel.findOneAndUpdate(
      { sessionId },
      { ...update, updatedAt: now() },
      { upsert: true, new: true }
    );
  }

  function scheduleReconnect(reason = 'unknown') {
    if (manualDisconnect || reconnectTimer || activeClient) return;

    reconnectAttempts += 1;
    const delayMs = Math.min(5 * 60 * 1000, 10_000 * (2 ** Math.min(reconnectAttempts - 1, 5)));
    log.info('platform_whatsapp_reconnect_scheduled', {
      sessionId,
      reason,
      attempt: reconnectAttempts,
      delaySeconds: Math.round(delayMs / 1000),
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (manualDisconnect) return;
      init().catch((err) => {
        log.error('platform_whatsapp_scheduled_reconnect_failed', {
          sessionId,
          error: err?.message || String(err),
        });
      });
    }, delayMs);
    reconnectTimer.unref?.();
  }

  function pruneRecentMessages() {
    const cutoff = now().getTime() - RECENT_MESSAGE_TTL_MS;
    for (const [key, seenAt] of recentMessages) {
      if (seenAt < cutoff) recentMessages.delete(key);
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

  async function handleIncomingMessage(message) {
    if (
      !message
      || message.fromMe
      || message.isStatus
      || message.from === 'status@broadcast'
      || (typeof message.from === 'string' && message.from.endsWith('@g.us'))
    ) {
      return;
    }

    const botId = resolveBotId();
    const messageId = message.id?._serialized || message.id?.$1 || '';
    if (await isDuplicateMessage(botId, messageId)) {
      return;
    }

    const isImage = message.type === 'image';
    const isVoice = message.type === 'audio' || message.type === 'ptt';
    const messageText = message.body || (isImage ? '[صورة]' : isVoice ? '[رسالة صوتية]' : '');

    // Route verified merchants and LINK-XXXXXX verification codes to the
    // Merchant Assistant BEFORE the normal ZainBot Main visitor flow.
    // Non-merchant visitors & unresolvable senders return { handled: false }
    // and fall through untouched to botEngine.processMessage.
    if (typeof handlePlatformMerchantMessage === 'function') {
      try {
        const routed = await handlePlatformMerchantMessage({
          message,
          messageText,
          messageId,
          isImage,
          isVoice,
          now: now(),
        });
        if (routed && routed.handled) {
          if (typeof routed.reply === 'string' && routed.reply.trim() && typeof message.reply === 'function') {
            await message.reply(routed.reply);
          }
          return;
        }
      } catch (routerErr) {
        log.error('platform_whatsapp_merchant_router_failed', {
          botId,
          error: routerErr?.message || String(routerErr),
        });
      }
    }

    // Best-effort native WhatsApp reaction when enabled on the bound platform bot.
    // The platform session reacts to every clean inbound message (always
    // mode, rich meaning-based variety); complaint/anger signals still
    // suppress the reaction inside pickReaction, merchant sessions keep the
    // category-only default, and avoid keeps consecutive reactions to the
    // same sender from repeating.
    const reactionEmoji = pickMessageReaction(messageText, {
      always: true,
      avoid: lastReactionBySender.get(message.from),
      rng: Math.random,
    });
    if (reactionEmoji && typeof message.react === 'function') {
      try {
        const bot = await getBot(botId);
        if (bot?.agentTools?.whatsappReactionsTool?.enabled === true) {
          await message.react(reactionEmoji);
          rememberLastReaction(message.from, reactionEmoji);
        }
      } catch (error) {
        log.warn('platform_whatsapp_message_reaction_failed', {
          botId,
          error: error?.message || String(error),
        });
      }
    }

    let mediaDataUrl = null;
    if ((isImage || isVoice) && typeof message.downloadMedia === 'function') {
      const media = await message.downloadMedia();
      if (media?.data && media?.mimetype) {
        mediaDataUrl = `data:${media.mimetype};base64,${media.data}`;
      }
    }

    const reply = await processIncomingMessage(
      botId,
      message.from,
      messageText,
      isImage,
      isVoice,
      messageId || null,
      'whatsapp',
      mediaDataUrl
    );

    if (typeof reply === 'string' && reply.trim() && typeof message.reply === 'function') {
      await message.reply(reply);
    }
  }

  function installInjectPatch(client) {
    if (typeof client.inject !== 'function') return;
    const originalInject = client.inject.bind(client);

    client.inject = async function patchedInject() {
      // Intercept page.exposeFunction to ignore 'already exists' and retry transient protocol errors.
      if (this.pupPage && this.pupPage.exposeFunction && !this.pupPage.exposeFunction._isIntercepted) {
        const originalExpose = this.pupPage.exposeFunction.bind(this.pupPage);
        this.pupPage.exposeFunction = async function interceptedExpose(name, fn) {
          for (let attempt = 1; attempt <= exposeMaxRetries; attempt += 1) {
            try {
              await originalExpose(name, fn);
              return;
            } catch (err) {
              const msg = err?.message || String(err);
              if (msg.includes('already exists')) {
                log.info('platform_whatsapp_expose_already_exists', { sessionId, name });
                return;
              }
              const isTransient = msg.includes('Target closed') || msg.includes('Protocol error');
              if (isTransient && attempt < exposeMaxRetries) {
                log.warn('platform_whatsapp_expose_retry', {
                  sessionId,
                  name,
                  attempt,
                  maxAttempts: exposeMaxRetries,
                  error: msg,
                });
                await new Promise((r) => setTimeout(r, exposeRetryDelayMs));
                continue;
              }
              throw err;
            }
          }
        };
        this.pupPage.exposeFunction._isIntercepted = true;
      }

      for (let i = 1; i <= injectMaxRetries; i += 1) {
        try {
          await originalInject();
          if (this.pupPage && typeof this.pupPage.evaluate === 'function') {
            await this.pupPage.evaluate(() => {
              if (window.WWebJS) {
                const oldGetMsgKeyId = window.WWebJS.getMsgKeyId;
                window.WWebJS.getMsgKeyId = (key) => {
                  if (!key) return undefined;
                  if (key._serialized) return key._serialized;
                  if (key.$1) return key.$1;
                  if (
                    typeof key.fromMe !== 'undefined'
                    && typeof key.remote === 'string'
                    && typeof key.id === 'string'
                  ) {
                    return `${key.fromMe}_${key.remote}_${key.id}`;
                  }
                  return oldGetMsgKeyId ? oldGetMsgKeyId(key) : undefined;
                };
              }
            }).catch(() => {});
          }
          return;
        } catch (err) {
          const msg = err?.message || String(err);
          const isNavigationError = (
            msg.includes('Execution context was destroyed')
            || msg.includes('navigation')
            || msg.includes('Target closed')
            || msg.includes('Protocol error')
          );

          if (isNavigationError && i < injectMaxRetries) {
            log.warn('platform_whatsapp_inject_navigation_retry', {
              sessionId,
              attempt: i,
              maxAttempts: injectMaxRetries,
              error: msg,
            });
            await new Promise((r) => setTimeout(r, injectRetryDelayMs));
            try {
              if (this.pupPage && typeof this.pupPage.waitForFunction === 'function') {
                await this.pupPage.waitForFunction('document.readyState === "complete"', { timeout: 10_000 });
              }
            } catch (_waitErr) {
              // Ignore wait timeout and retry inject.
            }
            continue;
          }
          throw err;
        }
      }
    };
  }

  async function init(initOptions = {}) {
    if (activeClient) {
      return activeClient;
    }
    if (pendingInit) {
      return pendingInit;
    }

    manualDisconnect = false;
    clearReconnectState();
    clearSafetyTimers();

    const startPromise = (async () => {
      const browserlessUrl = initOptions.browserlessUrl !== undefined
        ? initOptions.browserlessUrl
        : (options.browserlessUrl !== undefined ? options.browserlessUrl : process.env.BROWSERLESS_URL);

      await killOrphanedBrowserlessSession({
        browserlessUrl,
        axiosInstance,
        browserlessCooldownMs,
        logger: log,
      });

      let client;
      try {
        latestQrRaw = null;
        latestQrDataUrl = null;
        await updateSession({
          status: 'loading',
          qrCodeData: null,
          connected: false,
        });
        notifyWaiters();

        // Keep persistent WhatsApp service worker and storage intact; clear browser cache only.
        const authStrategy = new NoAuthClass();
        authStrategy.afterBrowserInitialized = async function afterBrowserInitialized() {
          log.info('platform_whatsapp_after_browser_initialized', { sessionId });
          try {
            if (this.client && this.client.pupPage) {
              const page = this.client.pupPage;
              const cdpSession = await page.target().createCDPSession();
              await cdpSession.send('Network.clearBrowserCache');
              log.info('platform_whatsapp_browser_cache_cleared', { sessionId });
              await cdpSession.detach();
            }
          } catch (cdpErr) {
            log.warn('platform_whatsapp_clear_cache_failed', {
              sessionId,
              error: cdpErr?.message || String(cdpErr),
            });
          }
        };

        const clientOptions = {
          authStrategy,
          webVersionCache: {
            type: 'none',
          },
        };

        if (browserlessUrl) {
          const { wsEndpoint, wsHeaders } = buildBrowserlessUrl(browserlessUrl);
          clientOptions.puppeteer = {
            browserWSEndpoint: wsEndpoint,
            headers: Object.keys(wsHeaders).length > 0 ? wsHeaders : undefined,
            timeout: 60_000,
          };
          log.info('platform_whatsapp_browserless_configured', { sessionId });
        } else {
          const userDataDir = resolveProfileDir(initOptions.profileDir || options.profileDir);
          const parentDir = path.dirname(userDataDir);
          try {
            if (!fsModule.existsSync(parentDir)) {
              fsModule.mkdirSync(parentDir, { recursive: true });
            }
          } catch (mkdirErr) {
            log.warn('platform_whatsapp_profile_parent_mkdir_failed', {
              sessionId,
              parentDir,
              error: mkdirErr?.message || String(mkdirErr),
            });
          }

          clientOptions.puppeteer = {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            userDataDir,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu',
              '--disable-cache',
              '--disk-cache-size=0',
              `--user-data-dir=${userDataDir}`,
            ],
          };
          log.info('platform_whatsapp_local_puppeteer_configured', { sessionId, userDataDir });
        }

        client = new ClientClass(clientOptions);
        activeClient = client;

        // WA QR channels go stale: a scan on an old channel authenticates then
        // gets force-logged-out. Recycle the client with a fresh channel if the
        // QR sits unscanned for too long.
        qrChannelTimer = setTimeout(() => {
          qrChannelTimer = null;
          if (manualDisconnect || activeClient !== client) return;
          if (sessionBecameReady) return;
          log.warn('platform_whatsapp_qr_channel_recycled', { sessionId });
          (async () => {
            if (activeClient === client) activeClient = null;
            latestQrRaw = null;
            latestQrDataUrl = null;
            try {
              await client.destroy();
            } catch (_e) {
              // Ignore destroy errors during channel recycle.
            }
            await updateSession({
              status: 'loading',
              qrCodeData: null,
              connected: false,
            }).catch(() => {});
            notifyWaiters();
            init(initOptions).catch((retryErr) => {
              log.error('platform_whatsapp_qr_channel_recycle_failed', {
                sessionId,
                error: retryErr?.message || String(retryErr),
              });
            });
          })();
        }, QR_CHANNEL_MAX_AGE_MS);
        qrChannelTimer.unref?.();

        installInjectPatch(client);

        let sessionBecameReady = false;

        client.on('qr', async (qr) => {
          log.info('platform_whatsapp_qr_received', { sessionId });
          try {
            const qrDataUrl = await qrToDataURL(qr);
            latestQrRaw = qr;
            latestQrDataUrl = qrDataUrl;
            await updateSession({
              status: 'qr_ready',
              qrCodeData: qrDataUrl,
              connected: false,
            });
            notifyWaiters();
          } catch (err) {
            log.error('platform_whatsapp_qr_conversion_failed', {
              sessionId,
              error: err?.message || String(err),
            });
          }
        });

        let authenticatedHandled = false;
        client.on('authenticated', async () => {
          log.info('platform_whatsapp_authenticated', { sessionId, duplicate: authenticatedHandled });
          if (qrChannelTimer) {
            clearTimeout(qrChannelTimer);
            qrChannelTimer = null;
          }
          if (authenticatedHandled) return;
          authenticatedHandled = true;
          latestQrRaw = null;
          latestQrDataUrl = null;
          await updateSession({
            status: 'authenticating',
            qrCodeData: null,
            connected: false,
          }).catch(() => {});
          notifyWaiters();
        });

        client.on('ready', async () => {
          if (sessionBecameReady) {
            log.info('platform_whatsapp_ready_duplicate_suppressed', { sessionId });
            return;
          }
          sessionBecameReady = true;
          clearSafetyTimers();
          clearReconnectState();
          latestQrRaw = null;
          latestQrDataUrl = null;
          let phone = '';
          try {
            phone = client.info?.me?.user || client.info?.wid?.user || '';
          } catch (_e) {
            phone = '';
          }
          log.info('platform_whatsapp_ready', { sessionId, hasPhone: Boolean(phone) });
          await updateSession({
            status: 'connected',
            qrCodeData: null,
            connected: true,
            phone,
            healthStatus: 'healthy',
            lastHeartbeat: now(),
          }).catch(() => {});
          notifyWaiters();
        });

        client.on('auth_failure', async (msg) => {
          log.error('platform_whatsapp_auth_failure', { sessionId, message: msg });
          clearSafetyTimers();
          latestQrRaw = null;
          latestQrDataUrl = null;
          const targetClient = activeClient || client;
          if (activeClient === client) activeClient = null;
          try {
            await targetClient.destroy();
          } catch (err) {
            log.warn('platform_whatsapp_destroy_on_auth_failure_failed', {
              sessionId,
              error: err?.message || String(err),
            });
          }
          await updateSession({
            status: 'disconnected',
            qrCodeData: null,
            connected: false,
            phone: '',
            healthStatus: 'disconnected',
          }).catch(() => {});
          notifyWaiters();
          scheduleReconnect('auth failure');
        });

        client.on('disconnected', async (reason) => {
          log.warn('platform_whatsapp_disconnected', { sessionId, reason });
          clearSafetyTimers();
          latestQrRaw = null;
          latestQrDataUrl = null;
          const targetClient = activeClient || client;
          if (activeClient === client) activeClient = null;
          try {
            await targetClient.destroy();
          } catch (err) {
            log.warn('platform_whatsapp_destroy_on_disconnect_failed', {
              sessionId,
              error: err?.message || String(err),
            });
          }
          await updateSession({
            status: 'disconnected',
            qrCodeData: null,
            connected: false,
            phone: '',
            disconnectReason: reason || '',
            healthStatus: 'disconnected',
          }).catch(() => {});
          notifyWaiters();
          scheduleReconnect('client disconnect');
        });

        client.on('message', (message) => {
          handleIncomingMessage(message).catch((err) => {
            log.error('platform_whatsapp_incoming_message_failed', {
              sessionId,
              error: err?.message || String(err),
            });
          });
        });

        let initTimer = null;
        const initPromise = client.initialize();
        const timeoutPromise = new Promise((_, reject) => {
          initTimer = setTimeout(() => {
            reject(new Error('Initialization timeout (180s)'));
          }, initTimeoutMs);
          initTimer.unref?.();
        });

        try {
          await Promise.race([initPromise, timeoutPromise]);
        } finally {
          if (initTimer) clearTimeout(initTimer);
        }

        log.info('platform_whatsapp_initialized', { sessionId });

        // Safety timer: if initialize resolves but ready never fires, destroy and re-init after 5s.
        if (sessionBecameReady) {
          log.info('platform_whatsapp_safety_timer_skipped', { sessionId });
        } else {
          safetyTimer = setTimeout(async () => {
            safetyTimer = null;
            try {
              if (sessionBecameReady || manualDisconnect || activeClient !== client) return;
              const session = await SessionModel.findOne({ sessionId });
              const stillPendingReady = (
                !session
                || session.status === 'loading'
                || session.status === 'authenticating'
              );
              if (stillPendingReady && activeClient === client) {
                log.warn('platform_whatsapp_safety_timeout_triggered', {
                  sessionId,
                  status: session?.status || 'loading',
                });
                activeClient = null;
                latestQrRaw = null;
                latestQrDataUrl = null;
                try {
                  await client.destroy();
                } catch (_destroyErr) {
                  // Ignore destroy errors during recovery.
                }
                await updateSession({
                  status: 'disconnected',
                  qrCodeData: null,
                  connected: false,
                  healthStatus: 'disconnected',
                }).catch(() => {});
                notifyWaiters();
                safetyRetryTimer = setTimeout(() => {
                  safetyRetryTimer = null;
                  if (manualDisconnect) return;
                  init(initOptions).catch((retryErr) => {
                    log.error('platform_whatsapp_safety_retry_failed', {
                      sessionId,
                      error: retryErr?.message || String(retryErr),
                    });
                  });
                }, safetyRetryDelayMs);
                safetyRetryTimer.unref?.();
              }
            } catch (checkErr) {
              log.error('platform_whatsapp_safety_timeout_error', {
                sessionId,
                error: checkErr?.message || String(checkErr),
              });
            }
          }, safetyTimeoutMs);
          safetyTimer.unref?.();

          client.once('ready', () => {
            clearSafetyTimers();
          });
        }

        if (client.pupBrowser && typeof client.pupBrowser.on === 'function') {
          client.pupBrowser.on('disconnected', async () => {
            log.warn('platform_whatsapp_browser_disconnected', { sessionId });
            if (activeClient === client) {
              activeClient = null;
              clearSafetyTimers();
              latestQrRaw = null;
              latestQrDataUrl = null;
              await updateSession({
                status: 'disconnected',
                qrCodeData: null,
                connected: false,
                healthStatus: 'disconnected',
              }).catch(() => {});
              notifyWaiters();
              scheduleReconnect('browser disconnect');
            }
          });
        }

        if (client.pupPage && typeof client.pupPage.on === 'function') {
          client.pupPage.on('error', async (err) => {
            log.error('platform_whatsapp_page_crashed', {
              sessionId,
              error: err?.message || String(err),
            });
            if (activeClient === client) {
              activeClient = null;
              clearSafetyTimers();
              latestQrRaw = null;
              latestQrDataUrl = null;
              try {
                await client.destroy();
              } catch (_e) {
                // Ignore destroy errors.
              }
              await updateSession({
                status: 'disconnected',
                qrCodeData: null,
                connected: false,
                healthStatus: 'disconnected',
              }).catch(() => {});
              notifyWaiters();
              scheduleReconnect('page crash');
            }
          });

          client.pupPage.on('close', async () => {
            log.warn('platform_whatsapp_page_closed', { sessionId });
            if (activeClient === client) {
              activeClient = null;
              clearSafetyTimers();
              latestQrRaw = null;
              latestQrDataUrl = null;
              try {
                await client.destroy();
              } catch (_e) {
                // Ignore destroy errors.
              }
              await updateSession({
                status: 'disconnected',
                qrCodeData: null,
                connected: false,
                healthStatus: 'disconnected',
              }).catch(() => {});
              notifyWaiters();
              scheduleReconnect('page close');
            }
          });
        }

        return client;
      } catch (err) {
        log.error('platform_whatsapp_init_failed', {
          sessionId,
          error: err?.message || String(err),
        });
        clearSafetyTimers();
        latestQrRaw = null;
        latestQrDataUrl = null;
        const targetClient = activeClient || client;
        if (targetClient) {
          try {
            await targetClient.destroy();
          } catch (destroyErr) {
            log.warn('platform_whatsapp_destroy_after_init_failure_failed', {
              sessionId,
              error: destroyErr?.message || String(destroyErr),
            });
          }
        }
        activeClient = null;
        await updateSession({
          status: 'disconnected',
          qrCodeData: null,
          connected: false,
          healthStatus: 'disconnected',
        }).catch(() => {});
        notifyWaiters();
        scheduleReconnect('initialization failure');
        return null;
      }
    })();

    pendingInit = startPromise.finally(() => {
      pendingInit = null;
    });
    return pendingInit;
  }

  async function getStatus() {
    const doc = await SessionModel.findOne({ sessionId });
    const raw = doc?.toObject ? doc.toObject() : (doc || {});
    let status = raw.status || 'disconnected';
    const live = Boolean(activeClient || pendingInit);
    // After a crash/restart the doc can claim qr_ready/connected with no live
    // client; normalize so the UI and route never act on a phantom session.
    if (!live && status !== 'disconnected') {
      status = 'disconnected';
    }
    const qrCodeData = (status === 'qr_ready') ? (latestQrDataUrl || raw.qrCodeData || null) : null;
    const hasQr = Boolean(qrCodeData);

    return {
      sessionId,
      status,
      connected: Boolean(raw.connected && status === 'connected' && Boolean(activeClient)),
      live,
      phone: raw.phone || '',
      qrCodeData,
      hasQr,
      healthStatus: raw.healthStatus || 'disconnected',
      lastHeartbeat: raw.lastHeartbeat || null,
      updatedAt: raw.updatedAt || null,
    };
  }

  async function getQr() {
    const status = await getStatus();
    return {
      qr: latestQrRaw,
      qrCodeData: status.qrCodeData,
      hasQr: status.hasQr,
      status: status.status,
    };
  }

  async function waitForQrOrReady(timeoutMs = 5_000) {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (true) {
      const status = await getStatus();
      if (status.hasQr || status.connected || (status.status === 'disconnected' && !pendingInit && !activeClient)) {
        return status;
      }
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return status;

      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          statusWaiters.delete(onChange);
          resolve();
        }, remainingMs);
        timer.unref?.();

        function onChange() {
          clearTimeout(timer);
          resolve();
        }
        statusWaiters.add(onChange);
      });
    }
  }

  async function disconnect() {
    manualDisconnect = true;
    clearReconnectState();
    clearSafetyTimers();
    latestQrRaw = null;
    latestQrDataUrl = null;

    const client = activeClient;
    activeClient = null;
    if (client) {
      try {
        // Never call client.logout() and never delete the persistent profile directory.
        await client.destroy();
      } catch (err) {
        log.warn('platform_whatsapp_disconnect_destroy_failed', {
          sessionId,
          error: err?.message || String(err),
        });
      }
    }

    await updateSession({
      status: 'disconnected',
      qrCodeData: null,
      connected: false,
      healthStatus: 'disconnected',
    });
    notifyWaiters();
    return getStatus();
  }

  async function checkSessionHealth(sessionDoc) {
    const session = sessionDoc || await SessionModel.findOne({ sessionId });
    if (!session) return;

    const hasPhone = Boolean(session.phone);

    // 1. Live client in memory: probe browser responsiveness with 8s timeout.
    if (activeClient) {
      let isResponsive = false;
      try {
        if (
          activeClient.pupBrowser
          && activeClient.pupPage
          && !activeClient.pupPage.isClosed()
        ) {
          let probeTimer = null;
          const pingPromise = activeClient.pupPage.evaluate(() => (
            Boolean(window.WWebJS || window.require || document.title)
          ));
          const timeoutPromise = new Promise((_, reject) => {
            probeTimer = setTimeout(
              () => reject(new Error('Heartbeat evaluation timeout (8s)')),
              heartbeatProbeTimeoutMs
            );
            probeTimer.unref?.();
          });
          try {
            isResponsive = Boolean(await Promise.race([pingPromise, timeoutPromise]));
          } finally {
            if (probeTimer) clearTimeout(probeTimer);
          }
        }
      } catch (probeErr) {
        log.warn('platform_whatsapp_heartbeat_probe_failed', {
          sessionId,
          error: probeErr?.message || String(probeErr),
        });
        isResponsive = false;
      }

      if (isResponsive) {
        await SessionModel.updateOne(
          { sessionId },
          { healthStatus: 'healthy', lastHeartbeat: now() }
        ).catch(() => {});
      } else {
        log.warn('platform_whatsapp_heartbeat_unresponsive', { sessionId });
        const stuckClient = activeClient;
        activeClient = null;
        clearSafetyTimers();
        latestQrRaw = null;
        latestQrDataUrl = null;
        try {
          await stuckClient.destroy();
        } catch (_e) {
          // Ignore destroy errors.
        }
        await updateSession({
          status: 'loading',
          healthStatus: 'recovering',
          connected: false,
        }).catch(() => {});

        await killOrphanedBrowserlessSession({
          browserlessUrl: options.browserlessUrl,
          axiosInstance,
          browserlessCooldownMs,
          logger: log,
        });

        if (process.env.NODE_ENV !== 'test' && !manualDisconnect) {
          const restartTimer = setTimeout(() => {
            init().catch((initErr) => {
              log.error('platform_whatsapp_heartbeat_restart_failed', {
                sessionId,
                error: initErr?.message || String(initErr),
              });
            });
          }, 3_000);
          restartTimer.unref?.();
        }
      }
      return;
    }

    // 2. No live client in memory: reconnect if session has a linked phone and should be online.
    const isDisconnected = !session.connected && session.status === 'disconnected';
    const isStuckLoading = session.status === 'loading';
    const shouldBeOnline = session.connected || isDisconnected || isStuckLoading;

    if (hasPhone && shouldBeOnline && !manualDisconnect) {
      const nowMs = now().getTime();
      const lastAttempt = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
      if (nowMs - lastAttempt > heartbeatReconnectCooldownMs) {
        log.info('platform_whatsapp_heartbeat_auto_reconnect', { sessionId });
        await updateSession({
          status: 'loading',
          healthStatus: 'recovering',
        }).catch(() => {});

        await killOrphanedBrowserlessSession({
          browserlessUrl: options.browserlessUrl,
          axiosInstance,
          browserlessCooldownMs,
          logger: log,
        });

        if (process.env.NODE_ENV !== 'test') {
          init().catch((initErr) => {
            log.error('platform_whatsapp_heartbeat_auto_reconnect_failed', {
              sessionId,
              error: initErr?.message || String(initErr),
            });
          });
        }
      }
    }
  }

  function startWhatsAppHeartbeat() {
    if (heartbeatInterval) return;
    if (process.env.NODE_ENV === 'test') return;

    heartbeatInterval = setInterval(async () => {
      try {
        const session = await SessionModel.findOne({ sessionId });
        if (session) {
          await checkSessionHealth(session);
        }
      } catch (err) {
        log.warn('platform_whatsapp_heartbeat_loop_failed', {
          sessionId,
          error: err?.message || String(err),
        });
      }
    }, heartbeatIntervalMs);
    heartbeatInterval.unref?.();
    log.info('platform_whatsapp_heartbeat_started', {
      sessionId,
      intervalMs: heartbeatIntervalMs,
    });
  }

  function stopWhatsAppHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  async function recoverAfterBoot() {
    if (activeClient || pendingInit || manualDisconnect) return;
    const doc = await SessionModel.findOne({ sessionId }).catch(() => null);
    if (!doc) return;
    const status = doc.status || 'disconnected';
    if (status === 'disconnected') return;
    log.info('platform_whatsapp_boot_recovery', { sessionId, status });
    await killOrphanedBrowserlessSession({
      browserlessUrl: options.browserlessUrl,
      axiosInstance,
      browserlessCooldownMs,
      logger: log,
    });
    await init();
  }

  async function shutdown() {
    stopWhatsAppHeartbeat();
    clearReconnectState();
    clearSafetyTimers();
    const client = activeClient;
    activeClient = null;
    if (client) {
      try {
        await client.destroy();
      } catch (_e) {
        // Ignore shutdown errors.
      }
    }
  }

  function getClient() {
    return activeClient;
  }

  return {
    init,
    getStatus,
    getQr,
    waitForQrOrReady,
    disconnect,
    getClient,
    checkSessionHealth,
    startWhatsAppHeartbeat,
    stopWhatsAppHeartbeat,
    recoverAfterBoot,
    shutdown,
  };
}

const defaultSession = createPlatformWhatsappSession();

if (process.env.NODE_ENV !== 'test') {
  defaultSession.startWhatsAppHeartbeat();
  // Recover sessions interrupted by a restart (crash mid-pairing or while
  // connected). NoAuth + persistent profile restores valid pairings without a
  // rescan; dead pairings fall back to a fresh QR.
  const bootRecoverTimer = setTimeout(() => {
    defaultSession.recoverAfterBoot().catch((err) => {
      logger.error('platform_whatsapp_boot_recovery_failed', {
        error: err?.message || String(err),
      });
    });
  }, 5_000);
  bootRecoverTimer.unref?.();
}

module.exports = {
  PLATFORM_SESSION_ID,
  DEFAULT_PLATFORM_BOT_ID,
  DEFAULT_PROFILE_DIR,
  BROWSERLESS_PROFILE_DIR,
  getPlatformBotId,
  buildBrowserlessUrl,
  killOrphanedBrowserlessSession,
  createPlatformWhatsappSession,
  init: (...args) => defaultSession.init(...args),
  getStatus: (...args) => defaultSession.getStatus(...args),
  getQr: (...args) => defaultSession.getQr(...args),
  waitForQrOrReady: (...args) => defaultSession.waitForQrOrReady(...args),
  disconnect: (...args) => defaultSession.disconnect(...args),
  getClient: (...args) => defaultSession.getClient(...args),
  checkSessionHealth: (...args) => defaultSession.checkSessionHealth(...args),
  startWhatsAppHeartbeat: (...args) => defaultSession.startWhatsAppHeartbeat(...args),
  stopWhatsAppHeartbeat: (...args) => defaultSession.stopWhatsAppHeartbeat(...args),
  recoverAfterBoot: (...args) => defaultSession.recoverAfterBoot(...args),
  shutdown: (...args) => defaultSession.shutdown(...args),
};
