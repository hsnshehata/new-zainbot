'use strict';

// tests/landingDemoDailyCap.test.js
// Global fail-closed daily budget for the public landing demo.

process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.24';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const LandingDemoConfig = require('../server/models/LandingDemoConfig');
const { tryConsumeDailyQuota } = require('../server/routes/landingDemo');

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('zainbot-demo-cap-qa'));
});

test.after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await LandingDemoConfig.deleteMany({});
});

test('consumes atomically up to the cap, then fails closed', async () => {
  const config = await LandingDemoConfig.getConfig();
  config.dailyCap = 2;
  await config.save();

  assert.equal(await tryConsumeDailyQuota(config), 'ok');
  assert.equal(await tryConsumeDailyQuota(config), 'ok');
  assert.equal(await tryConsumeDailyQuota(config), 'exhausted', 'third call must be refused');

  const doc = await LandingDemoConfig.getConfig();
  assert.equal(doc.usageCount, 2, 'count never overshoots the cap');
});

test('concurrent bursts cannot overshoot the cap', async () => {
  const config = await LandingDemoConfig.getConfig();
  config.dailyCap = 5;
  await config.save();

  const results = await Promise.all(Array.from({ length: 20 }, () => tryConsumeDailyQuota(config)));
  assert.equal(results.filter((r) => r === 'ok').length, 5);
  const doc = await LandingDemoConfig.getConfig();
  assert.equal(doc.usageCount, 5);
});

test('a new UTC day rolls the counter over exactly once', async () => {
  const config = await LandingDemoConfig.getConfig();
  config.dailyCap = 1;
  config.usageDate = '2000-01-01';
  config.usageCount = 9999; // stale day, exhausted
  await config.save();

  assert.equal(await tryConsumeDailyQuota(config), 'ok', 'stale day resets');
  assert.equal(await tryConsumeDailyQuota(config), 'exhausted', 'new day cap applies immediately');
  const doc = await LandingDemoConfig.getConfig();
  assert.equal(doc.usageCount, 1);
  assert.notEqual(doc.usageDate, '2000-01-01');
});

test('default config is fail-closed (cap 0) without an explicit owner cap', async () => {
  const config = await LandingDemoConfig.getConfig();
  assert.equal(config.dailyCap, 0);
  assert.equal(await tryConsumeDailyQuota(config), 'not_configured');
});

test('a legacy stored doc without cap fields is not_configured, not exhausted', async () => {
  // Documents written before the cap fields existed carry no dailyCap.
  // The refusal reason must be "not set up", never a false "try tomorrow".
  await LandingDemoConfig.collection.insertOne({ key: 'landing_demo', isEnabled: true });
  const config = await LandingDemoConfig.getConfig();
  assert.equal(await tryConsumeDailyQuota(config), 'not_configured');
});

test('cap 0 is fail-closed: no consumption, no reply', async () => {
  const config = await LandingDemoConfig.getConfig();
  config.dailyCap = 0;
  await config.save();
  assert.equal(await tryConsumeDailyQuota(config), 'not_configured');
  const doc = await LandingDemoConfig.getConfig();
  assert.equal(doc.usageCount, 0);
});
