const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const User = require('../server/models/User');
const {
  JWT_ISSUER,
  JWT_AUDIENCE,
  signAccessToken,
  verifyAccessToken,
} = require('../server/utils/authTokens');
const {
  serializeUser,
  serializeBot,
} = require('../server/utils/serializers');
const { getBotAccessFilter } = require('../server/middleware/botAccess');

const TEST_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';

test.beforeEach(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.NODE_ENV = 'test';
});

test('access tokens carry a revocable session version and verified identity', () => {
  const token = signAccessToken({
    _id: '507f191e810c19729de860ea',
    username: 'demo_user',
    role: 'user',
    sessionVersion: 7,
  }, { expiresIn: '5m' });

  const payload = verifyAccessToken(token);
  assert.equal(payload.sub, '507f191e810c19729de860ea');
  assert.equal(payload.userId, '507f191e810c19729de860ea');
  assert.equal(payload.username, 'demo_user');
  assert.equal(payload.role, 'user');
  assert.equal(payload.sessionVersion, 7);
  assert.equal(payload.tokenType, 'access');
  assert.equal(payload.iss, JWT_ISSUER);
  assert.equal(payload.aud, JWT_AUDIENCE);
});

test('verification rejects a correctly signed token of the wrong type', () => {
  const token = jwt.sign(
    { tokenType: 'email_verification' },
    TEST_SECRET,
    {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: '507f191e810c19729de860ea',
      expiresIn: '5m',
    }
  );

  assert.throws(() => verifyAccessToken(token), /Unexpected token type/);
});

test('the User schema excludes credentials and session state by default', () => {
  assert.equal(User.schema.path('password').options.select, false);
  assert.equal(User.schema.path('sessionVersion').options.select, false);

  const user = new User({
    username: 'demo_user',
    email: 'demo@example.com',
    password: 'hashed-value',
    telegramLinkCode: 'link-code',
  });
  const json = user.toJSON();

  assert.equal(json.password, undefined);
  assert.equal(json.sessionVersion, undefined);
  assert.equal(json.telegramLinkCode, undefined);
  assert.equal(json.role, 'user');
  assert.equal(json.status, 'active');
  assert.equal(json.subscriptionTier, 'free');
});

test('serializers remove user and channel secrets while preserving connection state', () => {
  const serializedUser = serializeUser({
    _id: 'user-1',
    username: 'demo_user',
    password: 'hash',
    sessionVersion: 3,
    googleId: 'google-id',
    telegramUserId: '123',
    telegramLinkCode: 'secret-code',
    bots: [],
  }, { includeBots: true });

  assert.equal(serializedUser.password, undefined);
  assert.equal(serializedUser.sessionVersion, undefined);
  assert.equal(serializedUser.googleId, undefined);
  assert.equal(serializedUser.telegramUserId, undefined);
  assert.equal(serializedUser.telegramLinkCode, undefined);
  assert.deepEqual(serializedUser.channelConnections, { telegram: true });

  const serializedBot = serializeBot({
    _id: 'bot-1',
    userId: 'user-1',
    facebookApiKey: 'facebook-secret',
    facebookPageId: 'page-1',
    instagramApiKey: 'instagram-secret',
    instagramPageId: '',
    whatsappApiKey: 'whatsapp-secret',
    whatsappBusinessAccountId: 'phone-1',
    userApiKey: 'user-secret',
    backupApiKey: 'backup-secret',
    telegramLinkCode: 'telegram-code',
    telegramUserId: 'telegram-user',
  });

  for (const secretField of [
    'facebookApiKey',
    'instagramApiKey',
    'whatsappApiKey',
    'userApiKey',
    'backupApiKey',
    'telegramLinkCode',
  ]) {
    assert.equal(serializedBot[secretField], undefined);
  }
  assert.deepEqual(serializedBot.connections, {
    facebook: true,
    instagram: false,
    whatsapp: true,
    telegram: true,
  });
  assert.deepEqual(serializedBot.credentialStatus, {
    user: true,
    backup: true,
  });
});

test('bot access filters use the subject during impersonation', () => {
  const directAdmin = getBotAccessFilter({
    user: { userId: 'admin-1', role: 'superadmin' },
    auth: {
      actorRole: 'superadmin',
      subjectUserId: 'admin-1',
      isImpersonating: false,
    },
  }, 'bot-1');
  assert.deepEqual(directAdmin, { _id: 'bot-1' });

  const impersonatingAdmin = getBotAccessFilter({
    user: { userId: 'user-1', role: 'user' },
    auth: {
      actorRole: 'superadmin',
      subjectUserId: 'user-1',
      isImpersonating: true,
    },
  }, 'bot-1');
  assert.deepEqual(impersonatingAdmin, { _id: 'bot-1', userId: 'user-1' });

  const regularUser = getBotAccessFilter({
    user: { userId: 'user-2', role: 'user' },
  }, 'bot-2');
  assert.deepEqual(regularUser, { _id: 'bot-2', userId: 'user-2' });
});
