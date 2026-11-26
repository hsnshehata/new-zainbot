'use strict';

// Regression test for authenticate middleware attaching subscriptionTier & subscriptionType
// on both access-token and impersonation-token paths, so aiModelAccessService and
// ideaCouncilController honor paid subscriber entitlements instead of treating everyone as 'free'.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-that-is-at-least-32-bytes-long';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../server/models/User');
const AdminImpersonationSession = require('../server/models/AdminImpersonationSession');
const authenticate = require('../server/middleware/authenticate');
const { signAccessToken } = require('../server/utils/authTokens');
const { signImpersonationToken } = require('../server/services/impersonationTokenService');
const { createAiModelAccessService } = require('../server/services/aiModelAccessService');

let mongod;
let paidUser;
let unlimitedUser;
let adminUser;

function runAuthenticate(token) {
  return new Promise((resolve) => {
    const req = {
      requestId: 'req-tier-test',
      get(header) {
        if (String(header).toLowerCase() === 'authorization') {
          return `Bearer ${token}`;
        }
        return undefined;
      },
    };
    const res = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ nextCalled: false, req, res });
        return this;
      },
    };
    authenticate(req, res, () => resolve({ nextCalled: true, req, res }));
  });
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  paidUser = await User.create({
    username: 'paid_merchant',
    email: 'paid@example.com',
    role: 'user',
    status: 'active',
    subscriptionTier: 'growth_10k',
    subscriptionType: 'monthly',
    sessionVersion: 1,
  });

  unlimitedUser = await User.create({
    username: 'enterprise_merchant',
    email: 'enterprise@example.com',
    role: 'user',
    status: 'active',
    subscriptionTier: 'unlimited',
    subscriptionType: 'yearly',
    sessionVersion: 0,
  });

  adminUser = await User.create({
    username: 'super_ops',
    email: 'ops@example.com',
    role: 'superadmin',
    status: 'active',
    subscriptionTier: 'unlimited',
    subscriptionType: 'yearly',
    sessionVersion: 0,
  });
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test('access token auth attaches subscriptionTier and subscriptionType so paid models are entitled', async () => {
  const token = signAccessToken(paidUser);
  const { nextCalled, req } = await runAuthenticate(token);

  assert.equal(nextCalled, true);
  assert.equal(req.user.subscriptionTier, 'growth_10k');
  assert.equal(req.user.subscriptionType, 'monthly');

  // Verify aiModelAccessService grants growth_10k models to req.user
  const queryOf = (docs) => ({ async lean() { return docs; } });
  const catalog = [
    { _id: 'm-free', provider: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o mini', autoEligible: true, enabled: true },
    { _id: 'm-pro', provider: 'anthropic', modelId: 'claude-3-5-sonnet', displayName: 'Claude Sonnet', autoEligible: true, enabled: true },
  ];
  const entitlements = [
    { tier: 'free', enabled: true, allowAuto: true, allowedModelCatalogIds: ['m-free'], blockedModelCatalogIds: [] },
    { tier: 'growth_10k', enabled: true, allowAuto: true, allowedModelCatalogIds: ['m-free', 'm-pro'], blockedModelCatalogIds: [] },
  ];
  const service = createAiModelAccessService({
    AiTierEntitlement: { find: () => queryOf(entitlements) },
    AiUserOverride: { find: () => queryOf([]) },
    AiModelCatalog: { find: () => queryOf(catalog) },
  });

  const allowedList = await service.listAllowedModelsForUser(req.user);
  assert.deepEqual(allowedList.models.map((m) => m.id), ['m-free', 'm-pro']);

  const decision = await service.isModelAllowedForUser(req.user, 'anthropic', 'claude-3-5-sonnet');
  assert.equal(decision.allowed, true);
});

test('impersonation token auth attaches subject subscriptionTier and subscriptionType', async () => {
  const now = new Date();
  const session = await AdminImpersonationSession.create({
    actorUserId: adminUser._id,
    subjectUserId: unlimitedUser._id,
    reason: 'Checking paid tier entitlement during support',
    scopes: ['settings:read'],
    status: 'active',
    actorSessionVersion: 0,
    subjectSessionVersion: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    purgeAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  const token = signImpersonationToken({
    actor: adminUser,
    subject: unlimitedUser,
    session,
  });

  const { nextCalled, req } = await runAuthenticate(token);
  assert.equal(nextCalled, true);
  assert.equal(req.auth.isImpersonating, true);
  assert.equal(req.user.subscriptionTier, 'unlimited');
  assert.equal(req.user.subscriptionType, 'yearly');
});
