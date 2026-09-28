const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Bot = require('../models/Bot');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { validateBody, Joi } = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const logger = require('../logger');
const { validatePasswordStrength } = require('../utils/passwordPolicy');
const {
  signAccessToken,
  verifyEmailVerificationToken,
} = require('../utils/authTokens');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('unusable-password', 10);
const SIGNUP_TIERS = new Set(['free', 'growth_1k', 'growth_10k', 'growth_50k', 'unlimited']);
const signupTier = (value) => typeof value === 'string' && SIGNUP_TIERS.has(value) ? value : null;

// مخططات التحقق من البيانات
const registerSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  username: Joi.string().pattern(/^[a-z0-9_-]+$/).min(3).max(20).required(),
  password: Joi.string().pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-={}\[\]|;:"'<>,.?/]).{8,}$/).required()
    .messages({ 'string.pattern.base': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز' }),
  confirmPassword: Joi.any().valid(Joi.ref('password')).required()
    .messages({ 'any.only': 'كلمات المرور غير متطابقة' }),
  botName: Joi.string().min(2).max(50).required(),
  intendedTier: Joi.any().optional(),
  whatsapp: Joi.string().allow(null, '').optional()
});

const loginSchema = Joi.object({
  username: Joi.string().min(3).max(50).required(),
  password: Joi.string().required(),
});

const googleSchema = Joi.object({
  idToken: Joi.string().required(),
  intendedTier: Joi.any().optional(),
});

// إعداد Nodemailer لإرسال ايميلات التفعيل
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const recoveryLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { success: false, message: 'طلبات كثيرة. حاول لاحقًا. / Too many requests. Try later.' } });
const emailSchema = Joi.object({ email: Joi.string().email({ tlds: { allow: false } }).required() });
const resetSchema = Joi.object({ token: Joi.string().hex().length(64).required(), password: registerSchema.extract('password'), confirmPassword: Joi.any().valid(Joi.ref('password')).required() });
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const makeToken = () => crypto.randomBytes(32).toString('hex');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const publicUrl = () => (process.env.BASE_URL || 'https://new.zainbot.com').replace(/\/$/, '');
const emailHtml = (url, label) => `<p>${label}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`;

async function sendVerification(user, token) {
  const url = `${publicUrl()}/login.html#verify=${token}`;
  await transporter.sendMail({ to: user.email, subject: 'Activate your ZainBot account | تفعيل حساب زين بوت',
    html: emailHtml(url, 'Activate your account / فعّل حسابك') });
}

async function provisionBot(userId, name) {
  // Claim the empty bot slot on the user document before checking/creating a bot.
  // A findOne + create race otherwise provisions two agents for simultaneous logins.
  const claimUntil = new Date(Date.now() + 120000);
  const claimed = await User.findOneAndUpdate(
    { _id: userId, bots: { $size: 0 }, $or: [{ botProvisioningUntil: { $exists: false } }, { botProvisioningUntil: { $lt: new Date() } }] },
    { $set: { botProvisioningUntil: claimUntil } }
  );
  if (!claimed) return;
  try {
    const bot = await Bot.findOne({ userId }).select('_id') || await Bot.create({ name: name || 'My Agent', userId });
    await User.updateOne({ _id: userId }, { $addToSet: { bots: bot._id } });
  } finally {
    await User.updateOne({ _id: userId, botProvisioningUntil: claimUntil }, { $unset: { botProvisioningUntil: '' } });
  }
}

async function restoreFailedDelivery(user, tokenHash, fields) {
  const set = {};
  const unset = {};
  for (const field of fields) {
    if (user[field] == null) unset[field] = '';
    else set[field] = user[field];
  }
  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(unset).length) update.$unset = unset;
  // Do not undo a newer resend or a verification completed while SMTP was pending.
  await User.updateOne({ _id: user._id, isVerified: user.isVerified, [fields[0]]: tokenHash }, update);
}

// مسار التسجيل
router.post('/register', validateBody(registerSchema), async (req, res) => {
  const { email, username, password, botName, whatsapp } = req.body;
  try {
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      logger.warn('registration_weak_password', { username, reasons: passwordCheck.errors });
      return res.status(400).json({ message: passwordCheck.errors.join(' | '), success: false });
    }

    const normalizedUsername = username.toLowerCase();
    const normalizedEmail = email.toLowerCase();
    const existingUser = await User.findOne({ $or: [{ username: normalizedUsername }, { email: normalizedEmail }] });
    if (existingUser) {
      logger.warn('❌ Registration failed: username or email exists', { username: normalizedUsername, email });
      return res.status(400).json({ message: 'اسم المستخدم أو البريد الإلكتروني موجود بالفعل', success: false });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      email: normalizedEmail,
      username: normalizedUsername,
      password: hashedPassword,
      whatsapp: whatsapp || null,
      role: 'user',
      isVerified: false,
      pendingBotName: botName,
      intendedTier: signupTier(req.body.intendedTier),
    });
    await user.save();

    const token = makeToken();
    await User.updateOne({ _id: user._id }, { $set: { verificationTokenHash: hashToken(token), verificationExpiresAt: new Date(Date.now() + 3600000) } });
    try {
      await sendVerification(user, token);
    } catch (mailError) {
      logger.error('verification_delivery_failed', { userId: user._id });
      return res.status(503).json({ message: 'تعذر إرسال البريد الآن. حسابك محفوظ؛ استخدم إعادة إرسال التفعيل لاحقًا. / Email unavailable. Your account is saved; request a new link later.', success: false });
    }
    await User.updateOne({ _id: user._id }, { $set: { verificationSentAt: new Date() } });

    logger.info('verification_email_sent', { email });
    res.status(201).json({ message: 'تم إرسال رابط تفعيل إلى بريدك الإلكتروني', intendedTier: user.intendedTier, success: true });
  } catch (err) {
    logger.error('registration_failed', { error: err.name });
    res.status(500).json({ message: 'خطأ في السيرفر، حاول مرة أخرى', success: false });
  }
});

// مسار تفعيل الحساب
async function verifyAccount(req, res, token) {
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cache-Control', 'no-store');
  try {
    let user;
    if (/^[a-f0-9]{64}$/.test(token)) {
      user = await User.findOneAndUpdate({ verificationTokenHash: hashToken(token), verificationExpiresAt: { $gt: new Date() }, isVerified: false },
        { $set: { isVerified: true }, $unset: { verificationTokenHash: '', verificationExpiresAt: '' } }).select('+pendingBotName');
    } else {
      // Links issued before the opaque-token migration remain valid until their JWT expiry.
      const decoded = verifyEmailVerificationToken(token);
      user = await User.findOneAndUpdate({ _id: decoded.userId, isVerified: false, verificationTokenHash: { $exists: false } }, { $set: { isVerified: true } });
      if (user) user.pendingBotName = decoded.botName;
    }
    if (!user) return req.method === 'POST' ? res.status(400).json({ success: false, code: 'verification_invalid' }) : res.redirect('/login.html?verification=invalid');
    try { await provisionBot(user._id, user.pendingBotName); }
    catch (error) { logger.error('verified_bot_provision_failed', { userId: user._id, error: error.name }); }
    logger.info('account_verified', { userId: user._id });
    return req.method === 'POST' ? res.json({ success: true, code: 'verification_success' }) : res.redirect('/login.html?verification=success');
  } catch (err) {
    logger.warn('account_verification_failed', { error: err.name });
    return req.method === 'POST' ? res.status(400).json({ success: false, code: 'verification_invalid' }) : res.redirect('/login.html?verification=invalid');
  }
}

router.get('/verify/:token', (req, res) => verifyAccount(req, res, req.params.token));
router.post('/verify', recoveryLimiter, validateBody(Joi.object({ token: Joi.string().hex().length(64).required() })), (req, res) => verifyAccount(req, res, req.body.token));

router.post('/resend-verification', recoveryLimiter, validateBody(emailSchema), async (req, res) => {
  const response = { success: true, message: 'إذا كان الحساب ينتظر التفعيل، سنرسل رابطًا جديدًا. / If the account awaits verification, we will send a new link.' };
  try {
    const token = makeToken();
    const user = await User.findOneAndUpdate({ email: req.body.email.toLowerCase(), isVerified: false, googleId: { $exists: false },
      $or: [{ verificationSentAt: { $exists: false } }, { verificationSentAt: { $lt: new Date(Date.now() - 60000) } }] },
    { $set: { verificationTokenHash: hashToken(token), verificationExpiresAt: new Date(Date.now() + 3600000), verificationSentAt: new Date() } })
      .select('+verificationTokenHash +verificationExpiresAt +verificationSentAt');
    if (user) {
      try { await sendVerification(user, token); }
      catch (_) {
        logger.error('verification_resend_delivery_failed', { userId: user._id });
        await restoreFailedDelivery(user, hashToken(token), ['verificationTokenHash', 'verificationExpiresAt', 'verificationSentAt']);
      }
    }
    return res.json(response);
  } catch (err) {
    logger.error('verification_resend_failed', { error: err.name });
    return res.status(500).json({ success: false, message: 'حاول لاحقًا / Please try again later.' });
  }
});

router.post('/forgot-password', recoveryLimiter, validateBody(emailSchema), async (req, res) => {
  const response = { success: true, message: 'إذا كان البريد مسجلاً، سنرسل رابط استعادة. / If the email is registered, we will send a recovery link.' };
  try {
    const token = makeToken();
    const user = await User.findOneAndUpdate({ email: req.body.email.toLowerCase(), isVerified: true, password: { $exists: true }, status: { $nin: ['suspended', 'deleted'] },
      $or: [{ resetSentAt: { $exists: false } }, { resetSentAt: { $lt: new Date(Date.now() - 60000) } }] },
    { $set: { resetTokenHash: hashToken(token), resetExpiresAt: new Date(Date.now() + 3600000), resetSentAt: new Date() } })
      .select('+resetTokenHash +resetExpiresAt +resetSentAt');
    if (user) {
      const url = `${publicUrl()}/login.html#reset=${token}`;
      try { await transporter.sendMail({ to: user.email, subject: 'Reset your ZainBot password | استعادة كلمة مرور زين بوت',
        html: emailHtml(url, 'Reset your password / استعد كلمة المرور') }); }
      catch (_) {
        logger.error('password_reset_delivery_failed', { userId: user._id });
        await restoreFailedDelivery(user, hashToken(token), ['resetTokenHash', 'resetExpiresAt', 'resetSentAt']);
      }
    }
    return res.json(response);
  } catch (err) {
    logger.error('password_reset_request_failed', { error: err.name });
    return res.status(500).json({ success: false, message: 'حاول لاحقًا / Please try again later.' });
  }
});

router.post('/reset-password', recoveryLimiter, validateBody(resetSchema), async (req, res) => {
  try {
    if (!validatePasswordStrength(req.body.password).valid) return res.status(400).json({ success: false, message: 'كلمة مرور ضعيفة / Weak password' });
    const password = await bcrypt.hash(req.body.password, 10);
    const user = await User.findOneAndUpdate({ resetTokenHash: hashToken(req.body.token), resetExpiresAt: { $gt: new Date() }, isVerified: true, status: { $nin: ['suspended', 'deleted'] } },
      { $set: { password }, $inc: { sessionVersion: 1 }, $unset: { resetTokenHash: '', resetExpiresAt: '' } });
    if (!user) return res.status(400).json({ success: false, message: 'الرابط غير صالح أو منتهي / Invalid or expired link' });
    return res.json({ success: true, message: 'تم تحديث كلمة المرور / Password updated' });
  } catch (err) {
    logger.error('password_reset_failed', { error: err.name });
    return res.status(500).json({ success: false, message: 'حاول لاحقًا / Please try again later.' });
  }
});

// مسار تسجيل الدخول
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  try {
    const normalizedUsername = username.toLowerCase();
    const user = await User.findOne({ username: normalizedUsername })
      .select('+password +sessionVersion');
    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      logger.warn('❌ Login failed: username not found', { username: normalizedUsername });
      return res.status(400).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة', success: false });
    }
    const isMatch = await bcrypt.compare(password, user.password || DUMMY_PASSWORD_HASH);
    if (!isMatch) {
      logger.warn('❌ Login failed: incorrect password', { username: normalizedUsername });
      return res.status(400).json({ message: 'اسم المستخدم أو كلمة المرور غير صحيحة', success: false });
    }
    if (!user.isVerified) {
      logger.warn('❌ Login failed: account not verified', { username: normalizedUsername });
      return res.status(400).json({ message: 'الحساب غير مفعل، تحقق من بريدك الإلكتروني', success: false });
    }
    if (user.status && user.status !== 'active') {
      logger.warn('login_blocked_account', { userId: user._id, status: user.status });
      return res.status(403).json({
        message: 'This account is suspended. Please contact support.',
        success: false,
      });
    }
    if (!user.bots?.length && !user.googleId) {
      try {
        const pending = await User.findById(user._id).select('+pendingBotName');
        if (pending?.pendingBotName) await provisionBot(user._id, pending.pendingBotName);
      } catch (error) {
        logger.error('pending_bot_provision_failed', { userId: user._id, error: error.name });
      }
    }
    const token = signAccessToken(user);
    logger.info('✅ Login successful', { username: normalizedUsername });
    res.status(200).json({ token, role: user.role, userId: user._id, username: user.username, intendedTier: user.intendedTier || null, success: true });
  } catch (err) {
    logger.error('login_failed_unexpectedly', { error: err.message, stack: err.stack });
    res.status(500).json({ message: 'خطأ في السيرفر، حاول مرة أخرى', success: false });
  }
});

// مسار تسجيل الخروج
router.post('/logout', authenticate, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.userId },
      { $inc: { sessionVersion: 1 } }
    );
    logger.info('user_sessions_revoked', { userId: req.user.userId });
    return res.status(200).json({ message: 'تم تسجيل الخروج بنجاح', success: true });
  } catch (error) {
    logger.error('logout_failed', { userId: req.user.userId, error: error.message });
    return res.status(500).json({ message: 'تعذر تسجيل الخروج', success: false });
  }
});

// مسار تسجيل الدخول عبر جوجل
router.post('/google', validateBody(googleSchema), async (req, res) => {
  const { idToken } = req.body;
  try {
    if (!process.env.GOOGLE_CLIENT_ID) {
      logger.error('❌ Google login failed: GOOGLE_CLIENT_ID not set');
      return res.status(500).json({ message: 'خطأ في إعدادات السيرفر، يرجى التواصل مع الدعم', success: false });
    }

    const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const googleId = payload['sub'];
    const email = payload['email'];
    let user = await User.findOne({ googleId }).select('+sessionVersion');
    if (user) {
      if (user.status && user.status !== 'active') {
        return res.status(403).json({
          message: 'الحساب موقوف، يرجى التواصل مع الدعم',
          success: false,
        });
      }
      const token = signAccessToken(user);
      logger.info('✅ Google login successful', { userId: user._id });
      res.json({ token, role: user.role, userId: user._id, username: user.username, intendedTier: user.intendedTier || null, newUser: false, success: true });
    } else {
      if (!payload.email_verified || !email) return res.status(401).json({ message: 'فشل في التحقق من بيانات جوجل، حاول مرة أخرى', success: false });
      const existingEmailUser = await User.findOne({ email: email.toLowerCase() });
      if (existingEmailUser) {
        logger.warn('❌ Google login failed: email already registered', { email });
        return res.status(400).json({ message: 'البريد الإلكتروني مسجل بالفعل', success: false });
      }
      let username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      if (username.length < 3 || username.length > 20) {
        username = `user_${googleId.slice(0, 8)}`.toLowerCase();
      }
      let count = 1;
      while (await User.findOne({ username })) {
        username = `${email.split('@')[0]}${count}`.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        if (username.length < 3 || username.length > 20) {
          username = `user_${googleId.slice(0, 8)}${count}`.toLowerCase();
        }
        count++;
      }
      user = new User({
        email: email.toLowerCase(),
        username,
        whatsapp: null,
        googleId,
        role: 'user',
        isVerified: true,
        intendedTier: signupTier(req.body.intendedTier),
      });
      await user.save();

      // إنشاء بوت تلقائي
      const bot = new Bot({
        name: 'بوت افتراضي',
        userId: user._id,
      });
      await bot.save();

      user.bots.push(bot._id);
      await user.save();

      const token = signAccessToken(user);
      logger.info('✅ Google registration successful', { email, username });
      res.json({ token, role: user.role, userId: user._id, username: user.username, intendedTier: user.intendedTier, newUser: true, success: true });
    }
  } catch (error) {
    logger.error('google_login_failed', { error: error.message, stack: error.stack });
    res.status(401).json({ message: 'فشل في التحقق من بيانات جوجل، حاول مرة أخرى', success: false });
  }
});

module.exports = router;
