// /server/routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authenticate = require('../middleware/authenticate');
const bcrypt = require('bcryptjs');
const { validateBody, Joi } = require('../middleware/validate');
const {
  requireDirectActorRole,
  isDirectActor,
} = require('../middleware/authorize');
const logger = require('../logger');
const { serializeUser } = require('../utils/serializers');

const usernameRule = Joi.string().pattern(/^[a-z0-9_-]+$/).min(3).max(20);

const createUserSchema = Joi.object({
  username: usernameRule.required(),
  password: Joi.string().pattern(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/).required()
    .messages({ 'string.pattern.base': 'كلمة المرور يجب أن تحتوي على حروف وأرقام وألا تقل عن 8 أحرف' }),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'كلمات المرور غير متطابقة' }),
  role: Joi.string().valid('user', 'superadmin').required(),
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  whatsapp: Joi.string().allow('', null),
  subscriptionType: Joi.string().valid('free', 'monthly', 'yearly').optional(),
  subscriptionTier: Joi.string().valid('free', 'growth_1k', 'growth_10k', 'growth_50k', 'unlimited').optional(),
  status: Joi.string().valid('active', 'suspended').optional(),
  subscriptionEndDate: Joi.date().allow(null, '').optional(),
  isVerified: Joi.boolean().optional(),
  dailyMessagesUsed: Joi.number().integer().min(0).max(10_000_000).optional(),
  monthlyMessagesUsed: Joi.number().integer().min(0).max(10_000_000).optional(),
  lastUsageReset: Joi.date().allow(null, '').optional()
});

const updateUserSchema = Joi.object({
  username: usernameRule.optional(),
  password: Joi.string().pattern(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/).optional()
    .messages({ 'string.pattern.base': 'كلمة المرور يجب أن تحتوي على حروف وأرقام وألا تقل عن 8 أحرف' }),
  confirmPassword: Joi.optional(),
  role: Joi.string().valid('user', 'superadmin').optional(),
  email: Joi.string().email({ tlds: { allow: false } }).optional(),
  whatsapp: Joi.string().allow('', null).optional(),
  subscriptionType: Joi.string().valid('free', 'monthly', 'yearly').optional(),
  subscriptionTier: Joi.string().valid('free', 'growth_1k', 'growth_10k', 'growth_50k', 'unlimited').optional(),
  status: Joi.string().valid('active', 'suspended').optional(),
  subscriptionEndDate: Joi.date().allow(null, '').optional(),
  isVerified: Joi.boolean().optional(),
  dailyMessagesUsed: Joi.number().integer().min(0).max(10_000_000).optional(),
  monthlyMessagesUsed: Joi.number().integer().min(0).max(10_000_000).optional(),
  lastUsageReset: Joi.date().optional()
}).custom((obj, helpers) => {
  if (obj.password && !obj.confirmPassword) {
    return helpers.error('any.invalid', { message: 'تأكيد كلمة المرور مطلوب' });
  }
  if (obj.password && obj.confirmPassword && obj.password !== obj.confirmPassword) {
    return helpers.error('any.invalid', { message: 'كلمات المرور غير متطابقة' });
  }
  return obj;
});

const ADMIN_LIST_ROLES = new Set(['user', 'superadmin']);
const ADMIN_LIST_STATUSES = new Set(['active', 'suspended', 'deleted']);
const ADMIN_LIST_TIERS = new Set(['free', 'growth_1k', 'growth_10k', 'growth_50k', 'unlimited']);

function boundedInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAdminUserFilter(query) {
  const filter = {};
  const status = String(query.status || '').trim();
  const role = String(query.role || '').trim();
  const tier = String(query.tier || '').trim();
  const search = String(query.q || '').trim().slice(0, 80);

  if (ADMIN_LIST_STATUSES.has(status)) filter.status = status;
  else if (query.includeDeleted !== 'true') filter.status = { $ne: 'deleted' };
  if (ADMIN_LIST_ROLES.has(role)) filter.role = role;
  if (ADMIN_LIST_TIERS.has(tier)) filter.subscriptionTier = tier;
  if (search) {
    const expression = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ username: expression }, { email: expression }, { whatsapp: expression }];
  }
  return filter;
}

// Get current user data
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      logger.warn('❌ User not found', { userId: req.user.userId });
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }
    logger.info('✅ User data fetched', { userId: req.user.userId });
    res.status(200).json({
      email: user.email,
      username: user.username,
      whatsapp: user.whatsapp,
      role: user.role
    });
  } catch (err) {
    logger.error('❌ Error fetching user data', { err });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// Get user profile data (expected by dashboard_new.js)
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      logger.warn('❌ User not found for profile', { userId: req.user.userId });
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }
    logger.info('✅ User profile fetched', { userId: req.user.userId });
    res.status(200).json({
      success: true,
      data: serializeUser(user, { includeBots: true })
    });
  } catch (err) {
    logger.error('❌ Error fetching profile', { err });
    res.status(500).json({ success: false, message: 'خطأ في السيرفر' });
  }
});

// Get all users (Superadmin only)
router.get('/', authenticate, requireDirectActorRole('superadmin'), async (req, res) => {
  try {
    const populateBots = req.query.populate === 'bots';
    const paginated = req.query.paginate === 'true';
    const filter = buildAdminUserFilter(req.query);
    const query = (populateBots
      ? User.find(filter).populate('bots')
      : User.find(filter))
      .sort({ createdAt: -1, _id: -1 });

    if (!paginated) {
      const users = await query;
      return res.status(200).json(
        users.map((user) => serializeUser(user, { includeBots: populateBots }))
      );
    }

    const page = boundedInteger(req.query.page, 1, 100_000);
    const limit = boundedInteger(req.query.limit, 25, 100);
    const [users, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    return res.status(200).json({
      success: true,
      data: users.map((user) => serializeUser(user, { includeBots: populateBots })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    logger.error('Error fetching users', { err });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

router.get('/:id', authenticate, requireDirectActorRole('superadmin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('bots');
    if (!user) {
      return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }
    return res.status(200).json({
      success: true,
      data: serializeUser(user, { includeBots: true }),
    });
  } catch (err) {
    logger.error('admin_user_detail_failed', { userId: req.params.id, error: err.name });
    return res.status(500).json({ success: false, message: 'تعذر جلب بيانات المستخدم' });
  }
});

// Create a new user (Superadmin only)
router.post('/', authenticate, requireDirectActorRole('superadmin'), validateBody(createUserSchema), async (req, res) => {
  const {
    username,
    password,
    role,
    email,
    whatsapp,
    subscriptionType,
    subscriptionTier,
    status,
    subscriptionEndDate,
    isVerified,
    dailyMessagesUsed,
    monthlyMessagesUsed,
    lastUsageReset,
  } = req.body;
  try {
    const normalizedUsername = username.toLowerCase(); // تحويل الـ username للحروف الصغيرة
    const existingUser = await User.findOne({ $or: [{ username: normalizedUsername }, { email }] });
    if (existingUser) {
      return res.status(400).json({ message: 'اسم المستخدم أو البريد الإلكتروني موجود بالفعل' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      username: normalizedUsername,
      password: hashedPassword,
      role,
      email,
      whatsapp,
      subscriptionType: subscriptionType || 'free',
      subscriptionTier: subscriptionTier || 'free',
      status: status || 'active',
      isVerified: isVerified !== undefined ? isVerified : true,
      dailyMessagesUsed: dailyMessagesUsed || 0,
      monthlyMessagesUsed: monthlyMessagesUsed || 0,
      lastUsageReset: lastUsageReset || undefined,
      subscriptionEndDate: subscriptionEndDate || null
    });
    await user.save();
    res.status(201).json({
      message: 'تم إنشاء المستخدم بنجاح',
      data: serializeUser(user),
    });
  } catch (err) {
    logger.error('Error creating user', { err });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// Update a user (Superadmin can update any user, regular user can update themselves)
router.put('/:id', authenticate, validateBody(updateUserSchema), async (req, res) => {
  const { id } = req.params;
  const {
    username,
    password,
    confirmPassword,
    role,
    email,
    whatsapp,
    subscriptionType,
    subscriptionTier,
    status,
    subscriptionEndDate,
    isVerified,
    dailyMessagesUsed,
    monthlyMessagesUsed,
    lastUsageReset,
  } = req.body;

  const directSuperadmin = isDirectActor(req) && req.auth.actorRole === 'superadmin';
  if (!directSuperadmin && id !== req.user.userId) {
    return res.status(403).json({ message: 'غير مصرح لك' });
  }

  try {
    const user = await User.findById(id).select('+sessionVersion');
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }

    // تحديث البيانات الأساسية بشكل آمن
    if (username) {
      const normalizedUsername = username.toLowerCase();
      const existingUser = await User.findOne({
        username: normalizedUsername,
        _id: { $ne: id }
      });
      if (existingUser) {
        return res.status(400).json({ message: 'اسم المستخدم موجود بالفعل' });
      }
      user.username = normalizedUsername;
    }

    if (email) {
      const existingEmail = await User.findOne({
        email: email,
        _id: { $ne: id }
      });
      if (existingEmail) {
        return res.status(400).json({ message: 'البريد الإلكتروني موجود بالفعل' });
      }
      user.email = email;
    }

    if (whatsapp !== undefined) {
      user.whatsapp = whatsapp;
    }

    // تحديث كلمة المرور فقط إذا تم إرسالها والتحقق من تطابقها
    let revokeSessions = false;
    if (password) {
      if (password !== confirmPassword) {
        return res.status(400).json({ message: 'كلمات المرور غير متطابقة' });
      }
      user.password = await bcrypt.hash(password, 10);
      revokeSessions = true;
    }

    // السماح لمدير عام فقط بتعديل الدور والاشتراك
    if (directSuperadmin) {
      if (user.role === 'superadmin' && role && role !== 'superadmin') {
        return res.status(409).json({
          message: 'لا يمكن خفض صلاحية حساب مدير عام من هذه الواجهة',
        });
      }
      if (user.role === 'superadmin' && status && status !== 'active') {
        return res.status(409).json({
          message: 'لا يمكن تعليق حساب مدير عام',
        });
      }
      if (role && role !== user.role) {
        user.role = role;
        revokeSessions = true;
      }
      if (subscriptionType) user.subscriptionType = subscriptionType;
      if (subscriptionTier) user.subscriptionTier = subscriptionTier;
      if (status && status !== user.status) {
        user.status = status;
        revokeSessions = true;
      }
      // تحديث تاريخ الانتهاء، وإذا تم إرسال null يُمسح، وإلا يُحدّث.
      if (subscriptionEndDate !== undefined) {
        user.subscriptionEndDate = subscriptionEndDate || null;
      }
      if (isVerified !== undefined) user.isVerified = isVerified;
      if (dailyMessagesUsed !== undefined) user.dailyMessagesUsed = dailyMessagesUsed;
      if (monthlyMessagesUsed !== undefined) user.monthlyMessagesUsed = monthlyMessagesUsed;
      if (lastUsageReset !== undefined) user.lastUsageReset = lastUsageReset;
    }

    if (revokeSessions) {
      user.sessionVersion = Number(user.sessionVersion || 0) + 1;
    }
    await user.save();
    logger.info('user_updated_successfully', { userId: id, updatedFields: { username, email, whatsapp, password: password ? 'yes' : 'no' } });
    res.status(200).json({
      message: 'تم تحديث المستخدم بنجاح',
      data: serializeUser(user),
    });
  } catch (err) {
    logger.error('error_updating_user', { userId: id, err: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

// Delete a user (Superadmin only)
router.delete('/:id', authenticate, requireDirectActorRole('superadmin'), async (req, res) => {
  const { id } = req.params;
  try {
    const user = await User.findById(id).select('+sessionVersion');
    if (!user) {
      return res.status(404).json({ message: 'المستخدم غير موجود' });
    }
    if (user.role === 'superadmin') {
      return res.status(403).json({ message: 'لا يمكن حذف حساب مدير عام' });
    }
    user.status = 'deleted';
    user.sessionVersion = Number(user.sessionVersion || 0) + 1;
    await user.save();
    res.status(200).json({
      message: 'تم تعطيل المستخدم مع الاحتفاظ ببياناته وقنواته',
      data: serializeUser(user),
    });
  } catch (err) {
    logger.error('Error deleting user', { err });
    res.status(500).json({ message: 'خطأ في السيرفر' });
  }
});

module.exports = router;

// Store-scoped employee management (used by store dashboard)
const employeesCtrl = require('../controllers/employeesController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

router.get('/:storeId/users', authenticate, employeesCtrl.getEmployees);
router.get('/:storeId/users/:id', authenticate, employeesCtrl.getEmployee);
router.post('/:storeId/users', authenticate, upload.single('idImage'), employeesCtrl.createEmployee);
router.put('/:storeId/users/:id', authenticate, upload.single('idImage'), employeesCtrl.updateEmployee);
