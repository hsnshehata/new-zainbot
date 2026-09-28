const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

process.env.JWT_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.NODE_ENV = 'test';

const User = require('../server/models/User');
const Bot = require('../server/models/Bot');
const OnboardingEvent = require('../server/models/OnboardingEvent');
const { ONBOARDING_STEPS } = require('../server/models/OnboardingEvent');
const { signAccessToken } = require('../server/utils/authTokens');
const {
  onboardingEventsRouter,
  onboardingMetricsRouter,
} = require('../server/routes/onboardingMetrics');

const app = express();
app.use(express.json());
app.use('/api/onboarding-events', onboardingEventsRouter);
app.use('/api/onboarding-metrics', onboardingMetricsRouter);

const USER_A = '507f191e810c19729de860a1';
const USER_B = '507f191e810c19729de860a2';
const ADMIN = '507f191e810c19729de860a3';
const BOT_A = '507f191e810c19729de860b1';
const BOT_B = '507f191e810c19729de860b2';

const accounts = {
  [USER_A]: { _id: USER_A, username: 'alice', role: 'user', status: 'active', sessionVersion: 0 },
  [USER_B]: { _id: USER_B, username: 'bob', role: 'user', status: 'active', sessionVersion: 0 },
  [ADMIN]: { _id: ADMIN, username: 'admin', role: 'superadmin', status: 'active', sessionVersion: 0 },
};

const bots = {
  [BOT_A]: { _id: BOT_A, userId: USER_A },
  [BOT_B]: { _id: BOT_B, userId: USER_B },
};

// In-memory stand-in for the OnboardingEvent collection.
const store = new Map();
const storeKey = (userId, botId, step) => `${userId}|${botId}|${step}`;

const originals = {
  userFindById: User.findById,
  botFindOne: Bot.findOne,
  eventFindOneAndUpdate: OnboardingEvent.findOneAndUpdate,
  eventFindOne: OnboardingEvent.findOne,
  eventCountDocuments: OnboardingEvent.countDocuments,
};

test.beforeEach(() => {
  store.clear();

  User.findById = (id) => ({
    select: () => ({
      lean: async () => {
        const account = accounts[String(id)];
        return account ? { ...account } : null;
      },
    }),
  });

  // Mirrors botAccess ownership: superadmin-without-impersonation sees any
  // bot, everyone else only sees their own.
  Bot.findOne = async (filter) => {
    const bot = bots[String(filter._id)];
    if (!bot) return null;
    if (filter.userId && String(bot.userId) !== String(filter.userId)) return null;
    return { ...bot };
  };

  OnboardingEvent.findOneAndUpdate = async (filter, update, options) => {
    const k = storeKey(filter.userId, filter.botId, filter.step);
    if (!store.has(k)) {
      const doc = {
        _id: `evt-${store.size + 1}`,
        userId: String(filter.userId),
        botId: String(filter.botId),
        step: filter.step,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(update?.$setOnInsert || {}),
      };
      store.set(k, doc);
      if (options?.rawResult) {
        return { value: doc, lastErrorObject: { updatedExisting: false }, ok: 1 };
      }
      return doc;
    }
    const doc = store.get(k);
    if (options?.rawResult) {
      return { value: doc, lastErrorObject: { updatedExisting: true }, ok: 1 };
    }
    return doc;
  };

  OnboardingEvent.findOne = async (filter) =>
    store.get(storeKey(filter.userId, filter.botId, filter.step)) || null;

  OnboardingEvent.countDocuments = async (filter = {}) => {
    let count = 0;
    for (const doc of store.values()) {
      if (filter.step && doc.step !== filter.step) continue;
      if (filter.createdAt?.$gte && doc.createdAt < filter.createdAt.$gte) continue;
      count++;
    }
    return count;
  };
});

test.afterEach(() => {
  User.findById = originals.userFindById;
  Bot.findOne = originals.botFindOne;
  OnboardingEvent.findOneAndUpdate = originals.eventFindOneAndUpdate;
  OnboardingEvent.findOne = originals.eventFindOne;
  OnboardingEvent.countDocuments = originals.eventCountDocuments;
});

function tokenFor(id) {
  const account = accounts[id];
  return signAccessToken({
    _id: account._id,
    username: account.username,
    role: account.role,
    sessionVersion: 0,
  });
}

test('model exposes the funnel steps with a unique user+bot+step key and timestamps', () => {
  assert.deepEqual([...ONBOARDING_STEPS], ['personalized', 'trained', 'tested']);
  assert.deepEqual(OnboardingEvent.schema.path('step').enumValues, [
    'personalized',
    'trained',
    'tested',
  ]);
  assert.ok(OnboardingEvent.schema.options.timestamps);

  const unique = OnboardingEvent.schema
    .indexes()
    .find(([, options]) => options.unique);
  assert.ok(unique, 'Expected a unique index for idempotency');
  assert.deepEqual(Object.keys(unique[0]), ['userId', 'botId', 'step']);
});

test('POST /api/onboarding-events requires authentication', async () => {
  const response = await request(app)
    .post('/api/onboarding-events')
    .send({ botId: BOT_A, step: 'personalized' });

  assert.equal(response.status, 401);
  assert.equal(store.size, 0);
});

test('POST rejects an unknown step without writing anything', async () => {
  const response = await request(app)
    .post('/api/onboarding-events')
    .set('Authorization', `Bearer ${tokenFor(USER_A)}`)
    .send({ botId: BOT_A, step: 'onboarded' });

  assert.equal(response.status, 400);
  assert.equal(store.size, 0);
});

test('POST records a step once; a repeat returns the same row', async () => {
  const auth = `Bearer ${tokenFor(USER_A)}`;
  const payload = { botId: BOT_A, step: 'personalized' };

  const first = await request(app)
    .post('/api/onboarding-events')
    .set('Authorization', auth)
    .send(payload);
  assert.equal(first.status, 201);
  assert.equal(first.body.success, true);
  assert.equal(first.body.created, true);
  assert.equal(first.body.data.step, 'personalized');
  assert.ok(first.body.data.createdAt);

  const second = await request(app)
    .post('/api/onboarding-events')
    .set('Authorization', auth)
    .send(payload);
  assert.equal(second.status, 200);
  assert.equal(second.body.success, true);
  assert.equal(second.body.created, false);
  assert.equal(second.body.data._id, first.body.data._id);
  assert.equal(store.size, 1);
});

test('a user cannot record steps on a bot they do not own; owners stay isolated', async () => {
  const foreign = await request(app)
    .post('/api/onboarding-events')
    .set('Authorization', `Bearer ${tokenFor(USER_B)}`)
    .send({ botId: BOT_A, step: 'personalized' });

  assert.equal(foreign.status, 404);
  assert.equal(store.size, 0);

  const ownA = await request(app)
    .post('/api/onboarding-events')
    .set('Authorization', `Bearer ${tokenFor(USER_A)}`)
    .send({ botId: BOT_A, step: 'personalized' });
  const ownB = await request(app)
    .post('/api/onboarding-events')
    .set('Authorization', `Bearer ${tokenFor(USER_B)}`)
    .send({ botId: BOT_B, step: 'personalized' });

  assert.equal(ownA.status, 201);
  assert.equal(ownB.status, 201);
  assert.equal(ownB.body.created, true);
  assert.notEqual(ownB.body.data._id, ownA.body.data._id);
  assert.equal(store.size, 2);
});

test('GET /api/onboarding-metrics/funnel rejects anonymous and non-superadmin readers', async () => {
  assert.equal(
    (await request(app).get('/api/onboarding-metrics/funnel')).status,
    401
  );

  const denied = await request(app)
    .get('/api/onboarding-metrics/funnel')
    .set('Authorization', `Bearer ${tokenFor(USER_A)}`);
  assert.equal(denied.status, 403);
});

test('funnel counts only the last 30 days and reports conversion rates', async () => {
  const empty = await request(app)
    .get('/api/onboarding-metrics/funnel')
    .set('Authorization', `Bearer ${tokenFor(ADMIN)}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data.counts, {
    personalized: 0,
    trained: 0,
    tested: 0,
  });
  assert.deepEqual(empty.body.data.rates, {
    personalizedToTrained: null,
    trainedToTested: null,
    personalizedToTested: null,
  });

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const seed = (userId, botId, step, ageDays) => {
    const at = new Date(now - ageDays * dayMs);
    store.set(storeKey(userId, botId, step), {
      _id: `seed-${store.size + 1}`,
      userId,
      botId,
      step,
      createdAt: at,
      updatedAt: at,
    });
  };

  seed(USER_A, BOT_A, 'personalized', 1);
  seed(USER_A, BOT_A, 'trained', 1);
  seed(USER_A, BOT_A, 'tested', 1);
  seed(USER_B, BOT_B, 'personalized', 2);
  seed(USER_B, BOT_B, 'trained', 5);
  seed(ADMIN, BOT_A, 'personalized', 2);
  // Stale event on a different bot so it keeps its own idempotency key;
  // it falls outside the 30-day window and must be excluded.
  seed(USER_B, '507f191e810c19729de860b3', 'personalized', 60);

  const response = await request(app)
    .get('/api/onboarding-metrics/funnel')
    .set('Authorization', `Bearer ${tokenFor(ADMIN)}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.windowDays, 30);
  assert.deepEqual(response.body.data.counts, {
    personalized: 3,
    trained: 2,
    tested: 1,
  });
  assert.deepEqual(response.body.data.rates, {
    personalizedToTrained: 0.6667,
    trainedToTested: 0.5,
    personalizedToTested: 0.3333,
  });
  const since = new Date(response.body.data.since).getTime();
  assert.ok(Math.abs(since - (now - 30 * dayMs)) < 60_000);
});
