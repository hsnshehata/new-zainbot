'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const supertest = require('supertest');
const mongoose = require('mongoose');

const ideaCouncilRouter = require('../../server/routes/ideaCouncil');
const IdeaProject = require('../../server/models/IdeaProject');
const IdeaEvaluationRun = require('../../server/models/IdeaEvaluationRun');
const IdeaAgentResult = require('../../server/models/IdeaAgentResult');
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

test('ideaCouncil API: getUsage returns unlimited quota for superadmin', async () => {
  const originalFindById = User.findById;
  const originalGetActiveConfig = IdeaCouncilConfig.getActiveConfig;
  const originalGetUsage = IdeaUsageCounter.getUsage;

  const adminToken = signAccessToken({
    _id: userId,
    username: 'admin',
    role: 'superadmin',
    sessionVersion: 1,
  });

  User.findById = () => ({
    select: () => ({
      lean: () => Promise.resolve({
        _id: userId,
        username: 'admin',
        role: 'superadmin',
        status: 'active',
        isVerified: true,
        sessionVersion: 1,
      }),
    }),
  });
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
      .set('Authorization', `Bearer ${adminToken}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.isSuperadmin, true);
    assert.equal(res.body.data.limit, '∞');
    assert.equal(res.body.data.remaining, '∞');
  } finally {
    User.findById = originalFindById;
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

test('ideaCouncil API: getIdeaById returns agents from latest run', async () => {
  const IdeaEvaluationRun = require('../../server/models/IdeaEvaluationRun');
  const IdeaAgentResult = require('../../server/models/IdeaAgentResult');
  const ideaId = new mongoose.Types.ObjectId();
  const runId = new mongoose.Types.ObjectId();

  const originalFindOneProject = IdeaProject.findOne;
  const originalFindOneRun = IdeaEvaluationRun.findOne;
  const originalFindRun = IdeaEvaluationRun.find;
  const originalFindAgent = IdeaAgentResult.find;

  IdeaProject.findOne = () => Promise.resolve({
    _id: ideaId,
    userId,
    isDeleted: false,
    latestRunId: runId,
    encryptedTitle: encryptIdeaField('اختبار الفكرة'),
    encryptedOriginalText: encryptIdeaField('نص فكرة طويل لاختبار الإرجاع'),
    encryptedStructuredIdea: encryptIdeaJson({ title: 'اختبار' }),
    targetMarket: 'Global',
    outputLanguage: 'ar',
    status: 'COMPLETED',
    version: 1,
    initialEvaluationsUsed: 1,
    followupRoundsUsed: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  IdeaEvaluationRun.findOne = () => ({
    lean: () => Promise.resolve({
      _id: runId,
      ideaId,
      userId,
      runType: 'INITIAL',
      roundNumber: 1,
      status: 'COMPLETED',
      currentStage: 'SYNTHESIS',
      encryptedFinalReport: encryptIdeaJson({ verdict: 'BUILD' }),
      encryptedTruthBoard: encryptIdeaJson([]),
      sourceReferences: [{ title: 'Google', url: 'https://google.com' }],
    }),
  });

  IdeaEvaluationRun.find = () => ({
    sort: () => ({
      lean: () => Promise.resolve([
        {
          _id: runId,
          ideaId,
          userId,
          runType: 'INITIAL',
          roundNumber: 1,
          status: 'COMPLETED',
          currentStage: 'SYNTHESIS',
          encryptedFinalReport: encryptIdeaJson({ verdict: 'BUILD' }),
          encryptedTruthBoard: encryptIdeaJson([]),
          sourceReferences: [{ title: 'Google', url: 'https://google.com' }],
        },
      ]),
    }),
  });

  IdeaAgentResult.find = () => ({
    lean: () => Promise.resolve([
      {
        role: 'COLD_CUSTOMER',
        status: 'COMPLETED',
        confidence: 0.9,
        encryptedOutput: encryptIdeaJson({ rejectionReason: 'Too expensive' }),
      },
      {
        role: 'HARSH_AUDITOR',
        status: 'COMPLETED',
        confidence: 0.95,
        encryptedOutput: encryptIdeaJson({ weakestLink: 'High CAC' }),
      },
    ]),
  });

  try {
    const res = await supertest(app)
      .get(`/api/idea-council/ideas/${ideaId}`)
      .set('Authorization', `Bearer ${token}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data.agents));
    assert.equal(res.body.data.agents.length, 2);
    assert.equal(res.body.data.agents[0].role, 'COLD_CUSTOMER');
    assert.equal(res.body.data.agents[0].output.rejectionReason, 'Too expensive');
    assert.equal(res.body.data.latestRun.agents.length, 2);
    assert.ok(Array.isArray(res.body.data.runs));
    assert.equal(res.body.data.runs.length, 1);
    assert.equal(res.body.data.runs[0].roundNumber, 1);
  } finally {
    IdeaProject.findOne = originalFindOneProject;
    IdeaEvaluationRun.findOne = originalFindOneRun;
    IdeaEvaluationRun.find = originalFindRun;
    IdeaAgentResult.find = originalFindAgent;
  }
});

test('ideaCouncil API: /follow-up creates follow-up run with targetCritic', async () => {
  const ideaId = new mongoose.Types.ObjectId();
  const runId = new mongoose.Types.ObjectId();
  const originalFindOneProject = IdeaProject.findOne;
  const originalUpdateProject = IdeaProject.updateOne;
  const originalFindOneRun = IdeaEvaluationRun.findOne;
  const originalCreateRun = IdeaEvaluationRun.create;

  let capturedRunArgs = null;

  IdeaProject.findOne = () => Promise.resolve({
    _id: ideaId,
    userId,
    isDeleted: false,
    followupRoundsUsed: 1,
    version: 2,
  });

  IdeaProject.updateOne = () => Promise.resolve({ modifiedCount: 1 });

  IdeaEvaluationRun.findOne = () => Promise.resolve(null);

  IdeaEvaluationRun.create = (args) => {
    capturedRunArgs = args;
    return Promise.resolve({
      _id: runId,
      status: 'QUEUED',
      ...args,
    });
  };

  try {
    const res = await supertest(app)
      .post(`/api/idea-council/ideas/${ideaId}/follow-up`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        followupType: 'DEFEND',
        targetCritic: 'COLD_CUSTOMER',
        followupPrompt: 'سنقوم بتجربة لمدة 30 يوماً مع 5 عيادات',
      });

    assert.equal(res.status, 202);
    assert.equal(res.body.success, true);
    assert.equal(String(res.body.runId), String(runId));
    assert.ok(capturedRunArgs);
    assert.equal(capturedRunArgs.runType, 'FOLLOW_UP');
    assert.equal(capturedRunArgs.targetCritic, 'COLD_CUSTOMER');
    assert.equal(capturedRunArgs.roundNumber, 3);
  } finally {
    IdeaProject.findOne = originalFindOneProject;
    IdeaProject.updateOne = originalUpdateProject;
    IdeaEvaluationRun.findOne = originalFindOneRun;
    IdeaEvaluationRun.create = originalCreateRun;
  }
});
