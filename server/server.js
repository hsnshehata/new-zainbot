require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// server/server.js
const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const facebookRoutes = require('./routes/facebook');
const webhookRoutes = require('./routes/webhook');
const authRoutes = require('./routes/auth');
const botsRoutes = require('./routes/bots');
const usersRoutes = require('./routes/users');
const rulesRoutes = require('./routes/rules');
const botRoutes = require('./routes/bot');
const analyticsRoutes = require('./routes/analytics');
const chatPageRoutes = require('./routes/chat-page');
const messagesRoutes = require('./routes/messages');
const indexRoutes = require('./routes/index');
const instagramAuthRoutes = require('./routes/instagramAuth');
const uploadRoutes = require('./routes/upload');
const notificationRoutes = require('./routes/notifications');
const storesRoutes = require('./routes/stores');
const productsRoutes = require('./routes/products');
const catalogConnectorRoutes = require('./routes/catalogConnectors');
const integrationsRoutes = require('./routes/integrations');
const adminKeysRoutes = require('./routes/adminKeys');
const landingDemoRoutes = require('./routes/landingDemo');
const adminLandingDemoRoutes = require('./routes/adminLandingDemo');
const adminPlatformSettingsRoutes = require('./routes/adminPlatformSettings');
const adminPlatformWhatsappRoutes = require('./routes/adminPlatformWhatsapp');
const platformWhatsappSession = require('./services/platformWhatsappSession');
const { getEffectiveSubscriptionWhatsapp } = require('./services/platformSettingsService');
const {
  createAdminImpersonationRouter,
} = require('./routes/adminImpersonation');
const {
  signImpersonationToken,
} = require('./services/impersonationTokenService');
const {
  createAiControlPlaneRouter,
} = require('./routes/AiControlPlane');
const categoriesRoutes = require('./routes/categories'); // إضافة routes الأقسام
const customersRoutes = require('./routes/customers');
const suppliersRoutes = require('./routes/suppliers');
const salesRoutes = require('./routes/sales');
const ordersRoutes = require('./routes/orders');
const expensesRoutes = require('./routes/expenses');
const chatOrdersRoutes = require('./routes/chatOrders');
const chatCustomersRoutes = require('./routes/chatCustomers');
const bookingsRoutes = require('./routes/bookings');
const telegramRoutes = require('./routes/telegram');
const whatsappRoutes = require('./routes/whatsapp');
const ideaCouncilRoutes = require('./routes/ideaCouncil');
const assistantRoutes = require('./routes/assistant');
const copilotRoutes = require('./routes/copilot');
const {
  startIdeaEvaluationWorker,
} = require('./services/ideaEvaluationWorker');
const AppError = require('./utils/appError');
const errorHandler = require('./middleware/errorHandler');
const { webAssetCache } = require('./middleware/webAssetCache');
// removed waRoutes (local WA app)
const connectDB = require('./db');
const Conversation = require('./models/Conversation');
const Bot = require('./models/Bot');
const Feedback = require('./models/Feedback');
const Store = require('./models/Store');
const Category = require('./models/Category'); // إضافة موديل Category
const logger = require('./logger');
const promClient = require('prom-client');
const {
  checkAutoStopBots,
  refreshInstagramTokens,
  refreshFacebookTokens,
  checkLowStock,
  recoverAbandonedSalesConversations,
  sendDailyPerformanceSummary,
  checkSubscriptionExpiringSoon,
  cleanupOldLogs,
  checkDueReminders,
  checkExpiredAssistantActions,
  checkExpiredCopilotDrafts,
} = require('./cronJobs');
const authenticate = require('./middleware/authenticate');
const { loadAccessibleBot } = require('./middleware/botAccess');
const auditMutation = require('./middleware/auditMutation');
const {
  getWhatsAppSessionManager,
} = require('./services/whatsappSessionManager');

const whatsappSessionManager = getWhatsAppSessionManager();
let activeHttpServer = null;
let shutdownStarted = false;

// إعداد cache لتخزين طلبات الـ API مؤقتاً (5 دقايق)

// إعداد Rate Limiting (100 طلب كل 15 دقيقة لكل IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 300, // عدد الطلبات المسموح بيها لكل IP
  message: {
    message: 'تم تجاوز الحد الأقصى لعدد الطلبات، برجاء المحاولة مرة أخرى بعد 15 دقيقة',
    error: 'RateLimitExceeded',
    retryAfter: 15 * 60 // عدد الثواني المتبقية
  }
});

// معدل تشديد لمسارات المصادقة الحساسة
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: {
    message: 'تم تجاوز عدد محاولات الدخول، حاول لاحقاً',
    error: 'AuthRateLimit',
    retryAfter: 15 * 60
  }
});

// معدل مخصص للويب هوكس لتفادي التدفق الزائد
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'تم تجاوز الحد المسموح لطلبات الويب هوك مؤقتاً',
    error: 'WebhookRateLimit',
    retryAfter: 60
  }
});

const app = express();

// إعداد المتركات Prometheus
const register = new promClient.Registry();
if (process.env.NODE_ENV !== 'test') {
  promClient.collectDefaultMetrics({ register });
}
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

// تفعيل trust proxy للتعامل مع X-Forwarded-For من Render
app.set('trust proxy', 1);

// تفعيل Helmet مع ضبط سياسة الـ CSP للسماح بمصادر الواجهة الخارجية المستخدمة
app.use(helmet({
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
        'https://cdnjs.cloudflare.com',
        'https://connect.facebook.net',
        'https://accounts.google.com',
        'https://static.cloudflareinsights.com'
      ],
      scriptSrcAttr: ["'unsafe-inline'"], // السماح بـ inline event handlers مثل onclick
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdnjs.cloudflare.com',
        'https://fonts.googleapis.com',
        'https://accounts.google.com'
      ],
      fontSrc: [
        "'self'",
        'data:',
        'https://cdnjs.cloudflare.com',
        'https://fonts.gstatic.com',
        'https://r2cdn.perplexity.ai',
        'https://frontend-cdn.perplexity.ai'
      ],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https:', 'wss:'],
      frameSrc: [
        "'self'",
        'https://www.youtube.com',
        'https://www.youtube-nocookie.com',
        'https://player.vimeo.com',
        'https://accounts.google.com/'
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

// إضافة معرّف بسيط لكل طلب لتتبعه في اللوجز
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const routeLabel = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.path || 'unknown';
    end({ method: req.method, route: routeLabel, status: res.statusCode });
  });
  next();
});

// صفحة الشات العامة (/chat/:linkId) مصممة للتضمين في مواقع العملاء عبر
// الويدجت، لذلك تسمح بأي frame ancestor مع الحفاظ على بقية تقييدات CSP.
// أي مسار آخر يبقى محصوراً على نفس المصدر كما ضبطه helmet.
app.use((req, res, next) => {
  if (req.path.startsWith('/chat/')) {
    res.removeHeader('X-Frame-Options');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
        "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com https://r2cdn.perplexity.ai https://frontend-cdn.perplexity.ai",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https: wss:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors *",
      ].join('; ')
    );
  }
  next();
});

// إضافة Cross-Origin-Opener-Policy Header
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

// Web-asset cache policy (F02): explicit classification lives in
// server/middleware/webAssetCache.js — no startsWith('/') catch-all, no
// immutable for unversioned JS/CSS, query version is not a fingerprint.
app.use(webAssetCache);

// Middleware
app.use((req, res, next) => {
  // إضافة headers لتحسين الأداء والأمان
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // صفحة الشات العامة مسموح بتضمينها من مواقع العملاء (frame-ancestors *)
  if (!req.path.startsWith('/chat/')) {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const safePath = req.path.startsWith('/api/auth/verify/') ? '/api/auth/verify/:token' : req.path;
  logger.info('request', { requestId: req.requestId, method: req.method, path: safePath, ip: req.ip });
  next();
});

// Middleware
function normalizeOrigin(origin) {
  return origin.trim().replace(/\/+$/, '');
}

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.BASE_URL || '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);
if (process.env.NODE_ENV !== 'production') {
  configuredOrigins.push('http://localhost:5000', 'http://127.0.0.1:5000');
}
const allowedOrigins = new Set(configuredOrigins);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
      return callback(null, true);
    }
    return callback(new AppError('Origin is not allowed', 403, 'CorsDenied'));
  },
  credentials: true,
}));

app.use(express.json({
  limit: '2mb',
  verify(req, _res, buffer) {
    if (
      req.originalUrl.startsWith('/api/webhook')
      || req.originalUrl.startsWith('/api/telegram/webhook')
    ) {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(auditMutation);

app.use(express.static(path.join(__dirname, '../public')));

// تطبيق Rate Limiting للجميع
app.use(limiter);

// تطبيق Rate Limiting مخصص لمسارات اللوجين والتسجيل وتسجيل الدخول بجوجل
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/google', authLimiter);
app.use('/api/auth/verify', authLimiter);

// Rate limit معتمد على المستخدم للمسارات المحمية
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'تم تجاوز عدد الطلبات المسموح بها للحساب مؤقتاً، حاول لاحقاً',
    error: 'AccountRateLimit',
    retryAfter: 15 * 60,
  },
});

const authenticatedPaths = [
  '/api/bots',
  '/api/users',
  '/api/rules',
  '/api/analytics',
  '/api/messages',
  '/api/notifications',
  '/api/stores',
  '/api/products',
  '/api/categories',
  '/api/customers',
  '/api/suppliers',
  '/api/sales',
  '/api/orders',
  '/api/expenses',
  '/api/chat-orders',
  '/api/chat-customers',
  '/api/bookings',
  '/api/integrations',
  '/api/admin',
  '/api/upload',
  '/api/idea-council',
  '/api/assistant',
  '/api/copilot',
];
// Public storefront endpoints. The routers below intentionally leave
// these handlers unauthenticated for anonymous shoppers (see the
// 'بدون authenticate للوصول العام' comments), but the app-level gate
// would shadow them, so they are mounted explicitly BEFORE it.
// Handlers apply their own public-safe projections (PUBLIC_PRODUCT_FIELDS)
// and input validation.
{
  const storeController = require('./controllers/storeController');
  const productController = require('./controllers/productController');
  const categoryController = require('./controllers/categoryController');
  const orderController = require('./controllers/orderController');
  app.get('/api/stores/store/:storeLink', storeController.getStoreByLink);
  app.get('/api/products/:storeId/products', productController.getProducts);
  app.get('/api/products/:storeId/products/bestsellers', productController.getBestsellers);
  app.get('/api/categories/:storeId/categories', categoryController.getCategories);
  app.post('/api/orders/:storeId/orders', orderController.createOrder);
}

app.use(authenticatedPaths, authenticate, accountLimiter);

// Route لجلب GOOGLE_CLIENT_ID + public subscription info (no secrets)
app.get('/api/config', async (req, res) => {
  let plans = {};
  try {
    // eslint-disable-next-line global-require
    const { PLANS } = require('./config/plans');
    plans = Object.fromEntries(Object.values(PLANS).map((p) => [p.tier, { monthlyEGP: p.monthlyEGP, yearlyEGP: p.yearlyEGP, agents: p.agents === Infinity ? -1 : p.agents }]));
  } catch (e) { plans = {}; }
  const { value: subscribeWhatsapp } = await getEffectiveSubscriptionWhatsapp();
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    subscribeWhatsapp,
    paymentMethods: ['instapay', 'vodafone_cash', 'orange_money', 'etisalat_cash'],
    plans,
  });
});

// Route لملف assetlinks.json (للتحقق من ملكية الموقع من جوجل)
app.get('/.well-known/assetlinks.json', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/.well-known/assetlinks.json');
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(filePath);
  } catch (err) {
    logger.error('assetlinks_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Failed to load assetlinks.json' });
  }
});

// Routes
app.use('/api/webhook', webhookLimiter, webhookRoutes);
app.use('/api/bots', facebookRoutes);
app.use('/api/bots', botsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/rules', rulesRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/chat-page', chatPageRoutes);
app.use('/api/ai-usage', require('./routes/aiUsage'));
app.use('/api/messages', messagesRoutes);
app.use('/api/instagram', instagramAuthRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/stores', storesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/catalog-connectors', catalogConnectorRoutes);
app.use('/api/categories', categoriesRoutes); // إضافة routes الأقسام
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/chat-orders', chatOrdersRoutes);
app.use('/api/chat-customers', chatCustomersRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/telegram', telegramRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/integrations', integrationsRoutes);
app.use('/api/admin/keys', adminKeysRoutes);
app.use('/api/admin/system', require('./routes/adminSystem'));
app.use('/api/admin/landing-demo', adminLandingDemoRoutes);
app.use('/api/admin/platform-settings', adminPlatformSettingsRoutes);
app.use('/api/admin/platform-whatsapp', adminPlatformWhatsappRoutes);
app.use('/api/landing-demo', landingDemoRoutes);
app.use('/api/ai', require('./routes/aiModels'));
app.use(
  '/api/admin/impersonation',
  createAdminImpersonationRouter({
    issueToken: signImpersonationToken,
  })
);
app.use('/api/admin/ai', createAiControlPlaneRouter());
app.use('/api/idea-council', ideaCouncilRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/copilot', copilotRoutes);
app.use('/api/onboarding-events', require('./routes/onboardingMetrics').onboardingEventsRouter);
app.use('/api/onboarding-metrics', require('./routes/onboardingMetrics').onboardingMetricsRouter);
app.use('/', indexRoutes);

// مسار المتركات (حماية اختيارية عبر METRICS_TOKEN)
app.get('/metrics', async (req, res, next) => {
  try {
    const token = process.env.METRICS_TOKEN;
    if (!token) {
      return res.status(503).send('metrics are not configured');
    }
    const provided = req.header('x-metrics-key') || '';
    const expectedBuffer = Buffer.from(token);
    const providedBuffer = Buffer.from(provided);
    if (
      expectedBuffer.length !== providedBuffer.length
      || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
    ) {
      return res.status(401).send('unauthorized');
    }
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    return res.send(metrics);
  } catch (err) {
    return next(err);
  }
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'zainbot',
  });
});

app.get('/health/readiness', (_req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    status: databaseReady ? 'ready' : 'not_ready',
    checks: {
      database: databaseReady ? 'up' : 'down',
    },
  });
});

// Route لصفحة المتجر
app.get('/store/:storeLink', async (req, res) => {
  try {
    const { storeLink } = req.params;
    const store = await Store.findOne({ storeLink });
    if (!store) {
      logger.warn('store_not_found', { storeLink });
      return res.status(404).json({ message: 'المتجر غير موجود' });
    }
    const filePath = path.join(__dirname, '../public/store.html');
    logger.info('serve_store_page', { storeLink, filePath });
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error('serve_store_error', { err: err.message, stack: err.stack });
        res.status(500).json({ message: 'Failed to load store page' });
      }
    });
  } catch (err) {
    logger.error('store_route_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Something went wrong!' });
  }
});

// Route للاندينج بيج
app.get('/store/:storeLink/landing', async (req, res) => {
  try {
    const { storeLink } = req.params;
    const store = await Store.findOne({ storeLink });
    if (!store) {
      logger.warn('store_landing_not_found', { storeLink });
      return res.status(404).json({ message: 'المتجر غير موجود' });
    }
    const filePath = path.join(__dirname, '../public/landing.html');
    logger.info('serve_landing_page', { storeLink, filePath });
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error('serve_landing_error', { err: err.message, stack: err.stack });
        res.status(500).json({ message: 'Failed to load landing page' });
      }
    });
  } catch (err) {
    logger.error('landing_route_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Something went wrong!' });
  }
});

// نقطة النهاية للتحقق من التوكن
app.get('/api/auth/check', authenticate, async (req, res) => {
  res.json({
    success: true,
    role: req.user.role,
    userId: req.user.userId,
    username: req.user.username,
    auth: {
      actorUserId: req.auth.actorUserId,
      subjectUserId: req.auth.subjectUserId,
      actorRole: req.auth.actorRole,
      subjectRole: req.auth.subjectRole,
      isImpersonating: req.auth.isImpersonating,
      impersonationSessionId: req.auth.impersonationSessionId,
      scopes: req.auth.scopes,
    },
  });
});

// Route لإدارة التقييمات
app.post('/api/feedback', async (req, res) => {
  try {
    const { userId, botId, messageId, type, messageContent } = req.body;
    if (!userId || !botId || !messageId || !type || !messageContent) {
      return res.status(400).json({ message: 'userId, botId, messageId, type, and messageContent are required.' });
    }
    if (!['like', 'dislike'].includes(type)) {
      return res.status(400).json({ message: 'type must be like or dislike.' });
    }

    const feedback = await Feedback.findOneAndUpdate(
      { userId, messageId },
      { botId, userId, messageId, type, messageContent, timestamp: new Date(), isVisible: true },
      { upsert: true, new: true }
    );

    logger.info('feedback_saved', { botId, userId, messageId, type });
    res.status(200).json(feedback);
  } catch (err) {
    logger.error('feedback_save_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

app.get('/api/feedback/:botId', authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const { botId } = req.params;
    const feedback = await Feedback.find({ botId, isVisible: true }).sort({ timestamp: -1 });

    const feedbackWithCompat = feedback.map(item => ({
      ...item._doc,
      feedback: item.type === 'like' ? 'positive' : 'negative'
    }));

    logger.info('feedback_fetch_success', { botId });
    res.status(200).json(feedbackWithCompat);
  } catch (err) {
    logger.error('feedback_fetch_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// Route لجلب المحادثات بتاعت المستخدم مع البوت
app.get('/api/conversations/:botId/:userId', authenticate, loadAccessibleBot, async (req, res) => {
  try {
    const { botId, userId } = req.params;
    const conversations = await Conversation.find({ botId, userId }).sort({ 'messages.timestamp': -1 });
    res.status(200).json(conversations);
  } catch (err) {
    logger.error('conversations_fetch_error', { botId: req.params.botId, userId: req.params.userId, err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
});

// Routes للصفحات
app.get('/dashboard', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/dashboard.html');
    logger.info('serve_dashboard_page', { filePath });
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error('serve_dashboard_error', { err: err.message, stack: err.stack });
        res.status(500).json({ message: 'Failed to load dashboard page' });
      }
    });
  } catch (err) {
    logger.error('dashboard_route_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Something went wrong!' });
  }
});

app.get('/dashboard_new', (req, res) => {
  // Legacy alias: the dashboard lives at /dashboard now.
  res.redirect(301, '/dashboard');
});

app.get('/login', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/login.html');
    logger.info('serve_login_page', { filePath });
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error('serve_login_error', { err: err.message, stack: err.stack });
        res.status(500).json({ message: 'Failed to load login page' });
      }
    });
  } catch (err) {
    logger.error('login_route_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Something went wrong!' });
  }
});

app.get('/register', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/register.html');
    logger.info('serve_register_page', { filePath });
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error('serve_register_error', { err: err.message, stack: err.stack });
        res.status(500).json({ message: 'Failed to load register page' });
      }
    });
  } catch (err) {
    logger.error('register_route_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Something went wrong!' });
  }
});

app.get('/set-whatsapp', (req, res) => {
  // Legacy page removed: WhatsApp linking now lives inside the dashboard.
  res.redirect(301, '/dashboard');
});

app.get(['/chat', '/chat.html', '/chat/:linkId'], (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/chat.html');
    logger.info('serve_chat_page', { filePath });
    res.sendFile(filePath, (err) => {
      if (err) {
        logger.error('serve_chat_error', { err: err.message, stack: err.stack });
        res.status(500).json({ message: 'Failed to load chat page' });
      }
    });
  } catch (err) {
    logger.error('chat_route_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Something went wrong!' });
  }
});

// SEO Routes - مسارات تحسين محركات البحث
app.get('/sitemap.xml', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/sitemap.xml');
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // تخزين مؤقت لمدة 24 ساعة
    res.sendFile(filePath);
  } catch (err) {
    logger.error('sitemap_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Sitemap not found' });
  }
});

app.get('/robots.txt', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/robots.txt');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // تخزين مؤقت لمدة 24 ساعة
    res.sendFile(filePath);
  } catch (err) {
    logger.error('robots_error', { err: err.message, stack: err.stack });
    res.status(500).json({ message: 'Robots.txt not found' });
  }
});

// Ignore Cloudflare cdn-cgi challenge platform scripts gracefully
app.use('/cdn-cgi/*', (req, res) => {
  res.status(204).end();
});

// مسار غير موجود
app.use((req, res, next) => {
  next(new AppError('المسار غير موجود', 404, 'NotFound'));
});

// معالج أخطاء مركزي
app.use(errorHandler);

function installFatalProcessHandlers() {
  process.once('uncaughtException', (err) => {
    logger.error('uncaught_exception', {
      err: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    // Log and continue: transient rejections from browser/CDP clients (puppeteer,
    // whatsapp-web.js destroy races) must not take down the whole server.
    logger.error('unhandled_rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  const gracefulShutdown = async (signal) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    logger.info('server_shutdown_started', { signal });

    if (activeHttpServer) {
      activeHttpServer.close();
    }
    await whatsappSessionManager.shutdown().catch((error) => {
      logger.error('whatsapp_shutdown_failed', { error: error.message });
    });
    await platformWhatsappSession.shutdown().catch((error) => {
      logger.error('platform_whatsapp_shutdown_failed', { error: error.message });
    });
    await mongoose.disconnect().catch((error) => {
      logger.error('mongodb_shutdown_failed', { error: error.message });
    });
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });
}

async function startServer() {
  await connectDB();
  const restoreResults = await whatsappSessionManager.restorePersistedSessions();
  logger.info('whatsapp_sessions_restore_started', {
    total: restoreResults.length,
    restored: restoreResults.filter((result) => result.restored).length,
  });
  startBackgroundJobs();

  const port = process.env.PORT || 5000;
  activeHttpServer = app.listen(port, '0.0.0.0', () => {
    logger.info('server_started', { port });
  });
  return activeHttpServer;
}

// Background jobs (crons + workers). Staging and other isolated environments
// set CRON_JOBS_ENABLED=false so no scheduled sends, recovery runs, or
// subscription sweeps run against their database at all.
function startBackgroundJobs() {
  if (!require('./services/channelGuard').backgroundJobsAllowed()) {
    logger.info('background_jobs_disabled', { reason: 'CHANNELS_MODE is not on' });
    return false;
  }
  if (String(process.env.CRON_JOBS_ENABLED || 'true').trim().toLowerCase() === 'false') {
    logger.info('background_jobs_disabled', { reason: 'CRON_JOBS_ENABLED=false' });
    return false;
  }
  checkAutoStopBots();
  refreshInstagramTokens();
  refreshFacebookTokens();
  checkLowStock();
  recoverAbandonedSalesConversations();
  sendDailyPerformanceSummary();
  checkSubscriptionExpiringSoon();
  cleanupOldLogs();
  checkDueReminders();
  checkExpiredAssistantActions();
  checkExpiredCopilotDrafts();
  startIdeaEvaluationWorker();
  startOrderOpsSweep();
  return true;
}

// Durable order reconciliation: releases stock reservations orphaned by an
// interrupted request (only new-protocol orders with stockStatus 'pending'
// older than the fencing TTL, and stale reservation tokens), and retries
// owner notifications flagged notificationPending with claim fencing and an
// attempt budget. All operations underneath are idempotent, and nothing
// here ever touches legacy orders or products without reservation tokens.
function startOrderOpsSweep() {
  const stockService = require('./services/stockService');
  const orderOps = require('./services/orderOps');
  const run = async () => {
    try {
      const reconciled = await stockService.reconcileStuckOrders();
      const tokens = await stockService.reconcileOrphanTokens();
      const restores = await stockService.reconcileInterruptedRestores();
      const notified = await orderOps.retryPendingNotifications();
      if (reconciled || tokens || restores || notified.recovered || notified.failed) {
        logger.info('order_ops_sweep', { reconciled, orphanTokens: tokens, interruptedRestores: restores, ...notified });
      }
    } catch (err) {
      logger.error('order_ops_sweep_failed', { err: err.message });
    }
  };
  run();
  setInterval(run, 10 * 60 * 1000).unref();
}

if (require.main === module && process.env.NODE_ENV !== 'test') {
  installFatalProcessHandlers();
  startServer().catch((error) => {
    logger.error('server_start_failed', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = app;
module.exports.startServer = startServer;
module.exports.startBackgroundJobs = startBackgroundJobs;
module.exports.normalizeOrigin = normalizeOrigin;
