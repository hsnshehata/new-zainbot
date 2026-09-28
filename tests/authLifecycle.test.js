const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const nodemailer = require('nodemailer');
const fs = require('node:fs');
const path = require('node:path');
const { OAuth2Client } = require('google-auth-library');
const User = require('../server/models/User');
const Bot = require('../server/models/Bot');
const { serializeUser } = require('../server/utils/serializers');
const { signEmailVerificationToken } = require('../server/utils/authTokens');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://example.test';
const originalTransport = nodemailer.createTransport;
let sent = [];
let mailFails = false;
nodemailer.createTransport = () => ({ sendMail: async (mail) => {
  if (mailFails) throw new Error('SMTP unavailable');
  sent.push(mail);
} });
const auth = require('../server/routes/auth');
nodemailer.createTransport = originalTransport;
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/auth', auth);

const originals = {
  save: User.prototype.save,
  findOne: User.findOne,
  findOneAndUpdate: User.findOneAndUpdate,
  updateOne: User.updateOne,
  findOneBot: Bot.findOne,
  create: Bot.create,
  saveBot: Bot.prototype.save,
  verifyIdToken: OAuth2Client.prototype.verifyIdToken,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
};

test.afterEach(() => {
  User.prototype.save = originals.save;
  User.findOne = originals.findOne;
  User.findOneAndUpdate = originals.findOneAndUpdate;
  User.updateOne = originals.updateOne;
  Bot.findOne = originals.findOneBot;
  Bot.create = originals.create;
  Bot.prototype.save = originals.saveBot;
  OAuth2Client.prototype.verifyIdToken = originals.verifyIdToken;
  if (originals.googleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originals.googleClientId;
  sent = [];
  mailFails = false;
});

test('SMTP failure preserves pending signup and resend issues a usable replacement', async () => {
  let user;
  User.findOne = async () => null;
  User.prototype.save = async function () { user = this; return this; };
  User.updateOne = async (_filter, update) => { Object.assign(user, update.$set || {}); return {}; };
  mailFails = true;
  const registration = await request(app).post('/api/auth/register').send({
    email: 'person@gmail.com', username: 'person_1', password: 'Strong1!password', confirmPassword: 'Strong1!password', botName: 'Assistant',
  });
  assert.equal(registration.status, 503);
  assert.equal(user.isVerified, false);
  assert.ok(user.verificationTokenHash);
  mailFails = false;
  User.findOneAndUpdate = (filter, update) => ({ select: async () => {
    assert.equal(filter.email, 'person@gmail.com');
    const previous = { ...user.toObject({ transform: false }) };
    Object.assign(user, update.$set);
    return previous;
  } });
  const resend = await request(app).post('/api/auth/resend-verification').send({ email: 'person@gmail.com' });
  assert.equal(resend.status, 200);
  assert.equal(sent.length, 1);
  const token = sent[0].html.match(/verify=([a-f0-9]{64})/)[1];
  assert.equal(user.verificationTokenHash, crypto.createHash('sha256').update(token).digest('hex'));
});

test('verification consumes a link once, preserving the selected plan for a different device', async () => {
  const token = crypto.randomBytes(32).toString('hex');
  let used = false;
  let bots = 0;
  const account = { _id: '507f191e810c19729de860ea', pendingBotName: 'Assistant', intendedTier: 'growth_1k', subscriptionTier: 'free' };
  User.findOneAndUpdate = (filter) => ({ select: async () => {
    if (filter._id) return account;
    assert.equal(filter.verificationTokenHash, crypto.createHash('sha256').update(token).digest('hex'));
    if (used) return null;
    used = true;
    return account;
  } });
  Bot.findOne = () => ({ select: async () => null });
  Bot.create = async () => { bots++; return { _id: '507f191e810c19729de860eb' }; };
  User.updateOne = async () => ({});
  const first = await request(app).post('/api/auth/verify').send({ token });
  const second = await request(app).post('/api/auth/verify').send({ token });
  assert.equal(first.body.code, 'verification_success');
  assert.equal(second.body.code, 'verification_invalid');
  assert.equal(first.headers['referrer-policy'], 'no-referrer');
  assert.equal(bots, 1);
  assert.equal(serializeUser(account).intendedTier, 'growth_1k');
  assert.equal(account.subscriptionTier, 'free');
});

test('forgot response does not enumerate accounts; reset tokens expire and are single-use', async () => {
  User.findOneAndUpdate = () => ({ select: async () => null });
  const missing = await request(app).post('/api/auth/forgot-password').send({ email: 'missing@example.com' });
  const existing = await request(app).post('/api/auth/forgot-password').send({ email: 'exists@example.com' });
  assert.deepEqual(missing.body, existing.body);
  const token = crypto.randomBytes(32).toString('hex');
  let used = false;
  User.findOneAndUpdate = async (filter, update) => {
    assert.equal(filter.resetTokenHash, crypto.createHash('sha256').update(token).digest('hex'));
    assert.ok(filter.resetExpiresAt.$gt instanceof Date);
    assert.equal(update.$inc.sessionVersion, 1);
    if (used) return null;
    used = true;
    return { _id: '507f191e810c19729de860ea' };
  };
  const body = { token, password: 'Strong1!password', confirmPassword: 'Strong1!password' };
  assert.equal((await request(app).post('/api/auth/reset-password').send(body)).status, 200);
  assert.equal((await request(app).post('/api/auth/reset-password').send(body)).status, 400);
  assert.equal((await request(app).post('/api/auth/reset-password').send({ ...body, password: 'weak', confirmPassword: 'weak' })).status, 400);
  User.findOneAndUpdate = async (filter) => {
    assert.ok(filter.resetExpiresAt.$gt instanceof Date);
    return null; // Expired tokens cannot match the database's expiry predicate.
  };
  assert.equal((await request(app).post('/api/auth/reset-password').send({ ...body, token: crypto.randomBytes(32).toString('hex') })).status, 400);
});

test('resend applies an account cooldown and does not disclose an unknown email', async () => {
  let calls = 0;
  User.findOneAndUpdate = (filter) => ({ select: async () => {
    calls++;
    assert.ok(filter.$or[1].verificationSentAt.$lt instanceof Date);
    return null;
  } });
  const unknown = await request(app).post('/api/auth/resend-verification').send({ email: 'unknown@example.com' });
  assert.equal(calls, 1);
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.success, true);
  assert.equal(sent.length, 0);
});

test('signup saves a whitelisted intent without granting subscription entitlements, and profile exposes it', async () => {
  for (const [choice, expected] of [['growth_1k', 'growth_1k'], ['unlimited', 'unlimited'], ['free', 'free'], ['../../unlimited', null], [null, null]]) {
    let user;
    User.findOne = async () => null;
    User.prototype.save = async function () { user = this; return this; };
    User.updateOne = async () => ({});
    const payload = { email: 'plan@example.com', username: 'plan_user', password: 'Strong1!password', confirmPassword: 'Strong1!password', botName: 'Assistant', subscriptionTier: 'unlimited', subscriptionType: 'yearly', role: 'superadmin' };
    if (choice !== null) payload.intendedTier = choice;
    const result = await request(app).post('/api/auth/register').send(payload);
    assert.equal(result.status, 201);
    assert.equal(result.body.intendedTier, expected);
    assert.equal(user.subscriptionTier, 'free');
    assert.equal(user.subscriptionType, 'free');
    assert.equal(serializeUser(user).intendedTier, expected);
    assert.equal(sent.length, 1);
    sent = [];
  }
});

test('Google creation stores intent only; existing Google account cannot be changed with signup intent', async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: 'google-12345', email: 'plan@example.com', email_verified: true }) });
  let user;
  User.findOne = (filter) => filter.googleId ? { select: async () => user || null } : Promise.resolve(null);
  User.prototype.save = async function () { if (this instanceof User) user = this; return this; };
  Bot.prototype.save = async function () { return this; };

  const created = await request(app).post('/api/auth/google').send({ idToken: 'google-token', intendedTier: 'growth_50k', subscriptionTier: 'unlimited', role: 'superadmin' });
  assert.equal(created.status, 200);
  assert.equal(created.body.newUser, true);
  assert.equal(created.body.intendedTier, 'growth_50k');
  assert.equal(user.subscriptionTier, 'free');
  assert.equal(user.role, 'user');

  const existing = await request(app).post('/api/auth/google').send({ idToken: 'google-token', intendedTier: 'unlimited' });
  assert.equal(existing.status, 200);
  assert.equal(existing.body.newUser, false);
  assert.equal(existing.body.intendedTier, 'growth_50k');
  assert.equal(user.intendedTier, 'growth_50k');
  assert.equal(user.subscriptionTier, 'free');
});

test('failed resend and password reset email restore the prior usable link and retry window', async () => {
  for (const [route, prefix, verified] of [
    ['resend-verification', 'verification', false],
    ['forgot-password', 'reset', true],
  ]) {
    const tokenField = `${prefix}TokenHash`;
    const expiryField = `${prefix}ExpiresAt`;
    const sentField = `${prefix}SentAt`;
    const priorHash = 'a'.repeat(64);
    const previous = { _id: '507f191e810c19729de860ea', email: 'person@example.com', isVerified: verified,
      [tokenField]: priorHash, [expiryField]: new Date(Date.now() + 300000), [sentField]: new Date(Date.now() - 120000) };
    const stored = { ...previous };
    User.findOneAndUpdate = (_filter, update) => ({ select: async () => {
      Object.assign(stored, update.$set);
      return previous;
    } });
    User.updateOne = async (filter, update) => {
      assert.equal(filter[tokenField], stored[tokenField]);
      assert.equal(filter.isVerified, verified);
      Object.assign(stored, update.$set || {});
      for (const key of Object.keys(update.$unset || {})) delete stored[key];
      return { matchedCount: 1 };
    };
    mailFails = true;
    const response = await request(app).post(`/api/auth/${route}`)
      .set('X-Forwarded-For', verified ? '192.0.2.72' : '192.0.2.71')
      .send({ email: previous.email });
    assert.equal(response.status, 200);
    assert.equal(stored[tokenField], priorHash);
    assert.deepEqual(stored[expiryField], previous[expiryField]);
    assert.deepEqual(stored[sentField], previous[sentField]);
    mailFails = false;
  }
});

test('legacy GET verification cannot activate an account after its link was replaced', async () => {
  const userId = '507f191e810c19729de860ea';
  const jwt = signEmailVerificationToken(userId, 'Agent');
  User.findOneAndUpdate = async (filter) => {
    assert.deepEqual(filter.verificationTokenHash, { $exists: false });
    return null;
  };
  const response = await request(app).get(`/api/auth/verify/${jwt}`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.location, '/login.html?verification=invalid');
  assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.ok(!response.headers.location.includes(jwt));
});

test('login does not reveal unverified or suspended status to an incorrect password', async () => {
  const password = await bcrypt.hash('Strong1!password', 4);
  for (const [isVerified, status] of [[false, 'active'], [true, 'suspended']]) {
    User.findOne = () => ({ select: async () => ({ _id: '507f191e810c19729de860ea', username: 'person', password, isVerified, status }) });
    const missing = await request(app).post('/api/auth/login').send({ username: 'missing', password: 'Wrong1!password' });
    const wrong = await request(app).post('/api/auth/login').send({ username: 'person', password: 'Wrong1!password' });
    assert.deepEqual(wrong.body, missing.body);
    assert.equal(wrong.status, missing.status);
    const correct = await request(app).post('/api/auth/login').send({ username: 'person', password: 'Strong1!password' });
    assert.equal(correct.status, isVerified ? 403 : 400);
  }
});

test('Google-only accounts reject password login with the same response as an unknown username', async () => {
  User.findOne = () => ({ select: async () => null });
  const missing = await request(app).post('/api/auth/login').send({ username: 'unknown', password: 'Strong1!password' });
  User.findOne = () => ({ select: async () => ({ username: 'google_user', googleId: '123', isVerified: true, status: 'active' }) });
  const google = await request(app).post('/api/auth/login').send({ username: 'google_user', password: 'Strong1!password' });
  assert.equal(google.status, missing.status);
  assert.deepEqual(google.body, missing.body);
});

test('concurrent bot provisioning claims only one empty slot with a recoverable lease', async () => {
  const token = crypto.randomBytes(32).toString('hex');
  const userId = '507f191e810c19729de860ea';
  let verified = false;
  let claimed = false;
  let creations = 0;
  User.findOneAndUpdate = (filter) => {
    if (filter.verificationTokenHash) return { select: async () => verified ? null : (verified = true, { _id: userId, pendingBotName: 'Agent' }) };
    assert.ok(filter.$or[1].botProvisioningUntil.$lt instanceof Date);
    if (claimed) return Promise.resolve(null);
    claimed = true;
    return Promise.resolve({ _id: userId });
  };
  User.updateOne = async (_filter, update) => { if (update.$unset?.botProvisioningUntil) claimed = false; return {}; };
  Bot.findOne = () => ({ select: async () => null });
  Bot.create = async () => { creations++; await new Promise((resolve) => setTimeout(resolve, 20)); return { _id: '507f191e810c19729de860eb' }; };
  // Two requests racing the claim directly through a verification and a login retry.
  const password = await bcrypt.hash('Strong1!password', 4);
  User.findOne = () => ({ select: async () => ({ _id: userId, username: 'person', password, isVerified: true, status: 'active', bots: [] }) });
  User.findById = () => ({ select: async () => ({ pendingBotName: 'Agent' }) });
  const [verification, login] = await Promise.all([
    request(app).post('/api/auth/verify').set('X-Forwarded-For', '192.0.2.73').send({ token }),
    request(app).post('/api/auth/login').send({ username: 'person', password: 'Strong1!password' }),
  ]);
  assert.equal(verification.status, 200);
  assert.equal(login.status, 200);
  assert.equal(creations, 1);
});

test('Google signup requires a verified email, and user JSON hides recovery metadata', async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => ({ sub: 'google-12345', email: 'person@example.com', email_verified: false }) });
  User.findOne = (filter) => filter.googleId ? { select: async () => null } : Promise.resolve(null);
  assert.equal((await request(app).post('/api/auth/google').send({ idToken: 'token' })).status, 401);
  const user = new User({ username: 'person', email: 'person@example.com', pendingBotName: 'Agent', botProvisioningUntil: new Date(), verificationTokenHash: 'secret', verificationExpiresAt: new Date(), verificationSentAt: new Date(), resetTokenHash: 'secret', resetExpiresAt: new Date(), resetSentAt: new Date() });
  for (const value of [user.toJSON(), user.toObject()]) {
    for (const field of ['pendingBotName', 'botProvisioningUntil', 'verificationTokenHash', 'verificationExpiresAt', 'verificationSentAt', 'resetTokenHash', 'resetExpiresAt', 'resetSentAt']) assert.equal(value[field], undefined);
  }
});

test('registration page displays the selected plan in both languages and ignores unknown query choices', () => {
  const markup = fs.readFileSync(path.join(__dirname, '../public/register.html'), 'utf8');
  const authScript = fs.readFileSync(path.join(__dirname, '../public/js/auth.js'), 'utf8');
  assert.match(markup, /data-register-i18n="selected_plan_default"/);
  assert.match(markup, /selected_plan_message: 'الباقة المختارة مبدئيًا: \{plan\}'/);
  assert.match(markup, /selected_plan_message: 'Your intended plan: \{plan\}'/);
  assert.match(markup, /allowedTiers\.includes\(selectedTier\) \? selectedTier : null/);
  assert.match(authScript, /registerForm && window\.zainbotSignupIntendedTier/);
});
