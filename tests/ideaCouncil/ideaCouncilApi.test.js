'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');

const ideaCouncilRouter = require('../../server/routes/ideaCouncil');
const IdeaProject = require('../../server/models/IdeaProject');
const IdeaUsageCounter = require('../../server/models/IdeaUsageCounter');
const IdeaCouncilConfig = require('../../server/models/IdeaCouncilConfig');
const { signAccessToken } = require('../../server/utils/authTokens');
const { encryptIdeaField, encryptIdeaJson } = require('../../server/services/ideaDataCrypto');

const User = require('../../server/models/User');

const TEST_SECRET = 'test-only-secret-that-is-at-least-32-bytes-long';
process.env.JWT_SECRET = TEST_SECRET;
process.env.NODE_ENV = 'test';

const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();

User.findById = () => ({
  select: () => ({
    lean: () => Promise.resolve({
      _id: userId,
      username: 'test_founder',
      role: 'user',
      status: 'active',
      isVerified: true,
      sessionVersion: 1,
    }),
  }),
});
const token = signAccessToken({
  _id: userId,
  username: 'test_founder',
  role: 'user',
  sessionVersion: 1,
});

const app = express();
app.use(express.json());
app.use('/api/idea-council', ideaCouncilRouter);

test('ideaCouncil API: rejects idea description under 100 characters', async () => {
  const res = await supertest(app)
    .post('/api/idea-council/ideas')
    .set('Authorization', `Bearer ${token}`)
    .send({ originalText: 'فكرة قصيرة جداً' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'TEXT_TOO_SHORT');
});

test('ideaCouncil API: creates draft successfully when description >= 100 characters', async () => {
  const originalCreate = IdeaProject.create;
  const fakeId = new mongoose.Types.ObjectId();
  IdeaProject.create = async (doc) => ({
    _id: fakeId,
    ...doc,
    createdAt: new Date(),
  });

  try {
    const longText = 'هذه فكرة مشروع مبتكرة لإنشاء منصة لوجستية تربط بين الشاحنات الصغيرة وأصحاب البضائع في المدن الكبرى لتوفير تكاليف النقل وتسريع التوصيل في نفس اليوم.';
    const res = await supertest(app)
      .post('/api/idea-council/ideas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        originalText: longText,
        targetMarket: 'مصر والسعودية',
        outputLanguage: 'ar',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, fakeId.toString());
    assert.equal(res.body.data.status, 'DRAFT');
  } finally {
    IdeaProject.create = originalCreate;
  }
});

test('ideaCouncil API: IDOR protection returns 404 for ideas owned by another user', async () => {
  const ideaId = new mongoose.Types.ObjectId();
  const originalFindOne = IdeaProject.findOne;

  // Stubs finding idea belonging to otherUserId, so query with userId returns null
  IdeaProject.findOne = (query) => {
    if (String(query.userId) === String(userId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      _id: ideaId,
      userId: otherUserId,
      encryptedTitle: encryptIdeaField('فكرة مستخدم آخر'),
      encryptedOriginalText: encryptIdeaField('نص فكرة مستخدم آخر طويل بما يكفي للاختبار'),
    });
  };

  try {
    const res = await supertest(app)
      .get(`/api/idea-council/ideas/${ideaId}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'IDEA_NOT_FOUND');
  } finally {
    IdeaProject.findOne = originalFindOne;
  }
});

test('ideaCouncil API: getUsage returns monthly quota information', async () => {
  const originalGetActiveConfig = IdeaCouncilConfig.getActiveConfig;
  const originalGetUsage = IdeaUsageCounter.getUsage;

  IdeaCouncilConfig.getActiveConfig = async () => ({
    enabled: true,
    monthlyIdeaLimit: 3,
  });
  IdeaUsageCounter.getUsage = async () => ({
    limit: 3,
    used: 1,
    completed: 1,
    remaining: 2,
    yearMonthUtc: '2026-09',
    nextResetDate: new Date('2026-10-01T00:00:00.000Z'),
  });

  try {
    const res = await supertest(app)
      .get('/api/idea-council/usage')
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.limit, 3);
    assert.equal(res.body.data.used, 1);
    assert.equal(res.body.data.remaining, 2);
    assert.equal(res.body.data.ideasRemaining, 2);
    assert.equal(res.body.data.monthlyLimit, 3);
  } finally {
    IdeaCouncilConfig.getActiveConfig = originalGetActiveConfig;
    IdeaUsageCounter.getUsage = originalGetUsage;
  }
});

test('ideaCouncil API: /draft endpoint accepts rawText and reportLanguage aliases', async () => {
  const originalCreate = IdeaProject.create;
  const fakeId = new mongoose.Types.ObjectId();
  IdeaProject.create = async (doc) => ({
    _id: fakeId,
    ...doc,
    createdAt: new Date(),
  });

  try {
    const longText = 'هذه فكرة مشروع مبتكرة لإنشاء منصة لوجستية تربط بين الشاحنات الصغيرة وأصحاب البضائع في المدن الكبرى لتوفير تكاليف النقل وتسريع التوصيل في نفس اليوم.';
    const res = await supertest(app)
      .post('/api/idea-council/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({
        rawText: longText,
        targetMarket: 'الشرق الأوسط',
        reportLanguage: 'ar',
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.id, fakeId.toString());
    assert.equal(res.body.data._id, fakeId.toString());
    assert.equal(res.body.data.rawIdea.rawText, longText);
  } finally {
    IdeaProject.create = originalCreate;
  }
});

