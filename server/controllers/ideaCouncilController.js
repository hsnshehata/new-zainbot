'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const IdeaProject = require('../models/IdeaProject');
const IdeaEvaluationRun = require('../models/IdeaEvaluationRun');
const IdeaAgentResult = require('../models/IdeaAgentResult');
const IdeaUsageCounter = require('../models/IdeaUsageCounter');
const IdeaCouncilConfig = require('../models/IdeaCouncilConfig');
const User = require('../models/User');

const {
  encryptIdeaField,
  decryptIdeaField,
  encryptIdeaJson,
  decryptIdeaJson,
} = require('../services/ideaDataCrypto');
const {
  buildStructurerPrompt,
} = require('../services/ideaCouncilPrompts');
const {
  validateAgentOutput,
} = require('../services/ideaCouncilSchemas');

// Helper to extract authenticated user id
function getUserId(req) {
  return req.user?.userId || req.user?._id || req.auth?.actorUserId || req.auth?.subjectUserId;
}

// GET /usage
async function getUsage(req, res) {
  try {
    const userId = getUserId(req);
    const config = await IdeaCouncilConfig.getActiveConfig();
    const usage = await IdeaUsageCounter.getUsage(userId, config.monthlyIdeaLimit);

    return res.status(200).json({
      success: true,
      data: {
        enabled: config.enabled,
        limit: usage.limit,
        monthlyLimit: usage.limit,
        used: usage.used,
        completed: usage.completed,
        remaining: usage.remaining,
        ideasRemaining: usage.remaining,
        yearMonthUtc: usage.yearMonthUtc,
        nextResetDate: usage.nextResetDate,
      },
    });
  } catch (error) {
    logger.error('get_idea_usage_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to retrieve usage counter' });
  }
}

// GET /ideas
async function getIdeas(req, res) {
  try {
    const userId = getUserId(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const status = req.query.status;

    const query = { userId, isDeleted: false };
    if (status && status !== 'ALL') {
      query.status = status;
    }

    const [total, ideas] = await Promise.all([
      IdeaProject.countDocuments(query),
      IdeaProject.find(query)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('latestRunId', 'status currentStage encryptedFinalReport completedAt')
        .lean(),
    ]);

    const formattedIdeas = ideas.map((idea) => {
      let title = 'Untitled';
      try {
        title = decryptIdeaField(idea.encryptedTitle) || 'Untitled';
      } catch (_) {}

      let finalReport = null;
      if (idea.latestRunId?.encryptedFinalReport) {
        try {
          finalReport = decryptIdeaJson(idea.latestRunId.encryptedFinalReport);
        } catch (_) {}
      }

      return {
        id: idea._id,
        title,
        status: idea.status,
        outputLanguage: idea.outputLanguage,
        targetMarket: idea.targetMarket,
        targetAudience: idea.targetAudience,
        initialEvaluationsUsed: idea.initialEvaluationsUsed,
        followupRoundsUsed: idea.followupRoundsUsed,
        followupRoundsRemaining: Math.max(0, 3 - idea.followupRoundsUsed),
        verdict: finalReport?.verdict || null,
        sevenDayBuildVerdict: finalReport?.sevenDayBuildVerdict || null,
        createdAt: idea.createdAt,
        updatedAt: idea.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        ideas: formattedIdeas,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    logger.error('list_ideas_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to retrieve ideas' });
  }
}

// POST /ideas
async function createIdea(req, res) {
  try {
    const userId = getUserId(req);
    const originalText = req.body.originalText || req.body.rawText;
    const targetMarket = req.body.targetMarket;
    const targetAudience = req.body.targetAudience;
    const primaryConcern = req.body.primaryConcern;
    const outputLanguage = req.body.outputLanguage || req.body.reportLanguage;

    if (!originalText || typeof originalText !== 'string' || originalText.trim().length < 100) {
      return res.status(400).json({
        success: false,
        error: 'TEXT_TOO_SHORT',
        message: 'Idea description must be at least 100 characters',
      });
    }

    if (originalText.length > 8000) {
      return res.status(400).json({
        success: false,
        error: 'TEXT_TOO_LONG',
        message: 'Idea description must not exceed 8,000 characters',
      });
    }

    const defaultTitle = originalText.trim().slice(0, 60);
    const encryptedTitle = encryptIdeaField(defaultTitle);
    const encryptedOriginalText = encryptIdeaField(originalText.trim());

    const project = await IdeaProject.create({
      userId,
      encryptedTitle,
      encryptedOriginalText,
      targetMarket: targetMarket ? String(targetMarket).trim() : null,
      targetAudience: targetAudience ? String(targetAudience).trim() : null,
      primaryConcern: primaryConcern ? String(primaryConcern).trim() : null,
      outputLanguage: outputLanguage === 'en' ? 'en' : 'ar',
      status: 'DRAFT',
    });

    return res.status(201).json({
      success: true,
      data: {
        id: project._id,
        _id: project._id,
        title: defaultTitle,
        status: project.status,
        outputLanguage: project.outputLanguage,
        reportLanguage: project.outputLanguage,
        rawIdea: {
          rawText: originalText.trim(),
          title: defaultTitle,
          targetMarket: project.targetMarket,
          targetAudience: project.targetAudience,
          primaryConcern: project.primaryConcern,
        },
        createdAt: project.createdAt,
      },
    });
  } catch (error) {
    logger.error('create_idea_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to create idea draft' });
  }
}

// GET /ideas/:ideaId
async function getIdeaById(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;

    const project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
    if (!project) {
      return res.status(404).json({ success: false, error: 'IDEA_NOT_FOUND', message: 'Idea not found' });
    }

    const title = decryptIdeaField(project.encryptedTitle);
    const originalText = decryptIdeaField(project.encryptedOriginalText);
    const structuredIdea = decryptIdeaJson(project.encryptedStructuredIdea);

    let latestRun = null;
    let synthesisReport = null;
    let truthBoardItems = [];
    let sourceReferences = [];

    if (project.latestRunId) {
      const runDoc = await IdeaEvaluationRun.findOne({ _id: project.latestRunId, userId }).lean();
      if (runDoc) {
        const finalReport = decryptIdeaJson(runDoc.encryptedFinalReport);
        const truthBoard = decryptIdeaJson(runDoc.encryptedTruthBoard);
        synthesisReport = finalReport;
        truthBoardItems = Array.isArray(truthBoard) ? truthBoard : (truthBoard?.items || []);
        sourceReferences = runDoc.sourceReferences || [];
        latestRun = {
          runId: runDoc._id,
          runType: runDoc.runType,
          followupType: runDoc.followupType,
          status: runDoc.status,
          currentStage: runDoc.currentStage,
          stageProgress: runDoc.stageProgress,
          sourceReferences,
          finalReport,
          truthBoard,
          usageSummary: runDoc.usageSummary,
          startedAt: runDoc.startedAt,
          completedAt: runDoc.completedAt,
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        id: project._id,
        _id: project._id,
        title,
        originalText,
        rawText: originalText,
        rawIdea: {
          rawText: originalText,
          title,
          targetMarket: project.targetMarket,
          targetAudience: project.targetAudience,
          primaryConcern: project.primaryConcern,
        },
        structuredIdea,
        structuredCard: structuredIdea,
        status: project.status,
        version: project.version,
        outputLanguage: project.outputLanguage,
        reportLanguage: project.outputLanguage,
        targetMarket: project.targetMarket,
        targetAudience: project.targetAudience,
        primaryConcern: project.primaryConcern,
        initialEvaluationsUsed: project.initialEvaluationsUsed,
        followupRoundsUsed: project.followupRoundsUsed,
        followupRoundsRemaining: Math.max(0, 3 - project.followupRoundsUsed),
        latestRun,
        activeRunId: project.latestRunId,
        synthesisReport,
        truthBoardItems,
        marketResearchPack: { sources: sourceReferences },
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  } catch (error) {
    logger.error('get_idea_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to retrieve idea' });
  }
}

// PATCH /ideas/:ideaId
async function updateIdea(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;
    const originalText = req.body.originalText || req.body.rawText;
    let structuredIdea = req.body.structuredIdea || req.body.structuredCard;
    if (!structuredIdea && (req.body.title || req.body.elevatorPitch || req.body.coreProblem)) {
      structuredIdea = {
        title: req.body.title,
        elevatorPitch: req.body.elevatorPitch,
        targetCustomer: req.body.targetCustomer,
        revenueModel: req.body.revenueModel,
        coreProblem: req.body.coreProblem,
        proposedSolution: req.body.proposedSolution,
        valueProposition: req.body.valueProposition,
        currentAlternatives: req.body.currentAlternatives,
        coreEvaluationQuestion: req.body.coreEvaluationQuestion,
      };
    }
    const { targetMarket, targetAudience, primaryConcern, version } = req.body;
    const outputLanguage = req.body.outputLanguage || req.body.reportLanguage;

    const query = { _id: ideaId, userId, isDeleted: false };
    if (version !== undefined && version !== null) {
      query.version = version;
    }

    const updates = { $inc: { version: 1 } };
    if (originalText && typeof originalText === 'string') {
      updates.encryptedOriginalText = encryptIdeaField(originalText.trim());
    }
    if (structuredIdea && typeof structuredIdea === 'object') {
      const validation = validateAgentOutput('STRUCTURER', structuredIdea);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: 'STRUCTURED_CARD_INVALID',
          message: validation.error,
        });
      }
      updates.encryptedStructuredIdea = encryptIdeaJson(validation.value);
      if (validation.value.title) {
        updates.encryptedTitle = encryptIdeaField(validation.value.title);
      }
    }
    if (targetMarket !== undefined) updates.targetMarket = targetMarket;
    if (targetAudience !== undefined) updates.targetAudience = targetAudience;
    if (primaryConcern !== undefined) updates.primaryConcern = primaryConcern;
    if (outputLanguage && ['ar', 'en'].includes(outputLanguage)) updates.outputLanguage = outputLanguage;

    const updated = await IdeaProject.findOneAndUpdate(query, updates, { new: true });
    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'IDEA_NOT_FOUND_OR_CONFLICT',
        message: 'Idea not found or optimistic lock conflict',
      });
    }

    const decryptedTitle = decryptIdeaField(updated.encryptedTitle);
    const decryptedRaw = decryptIdeaField(updated.encryptedOriginalText);
    const decryptedCard = decryptIdeaJson(updated.encryptedStructuredIdea);

    return res.status(200).json({
      success: true,
      data: {
        id: updated._id,
        _id: updated._id,
        title: decryptedTitle,
        version: updated.version,
        status: updated.status,
        outputLanguage: updated.outputLanguage,
        reportLanguage: updated.outputLanguage,
        structuredIdea: decryptedCard,
        structuredCard: decryptedCard,
        rawIdea: {
          rawText: decryptedRaw,
          title: decryptedTitle,
          targetMarket: updated.targetMarket,
          targetAudience: updated.targetAudience,
          primaryConcern: updated.primaryConcern,
        },
      },
    });
  } catch (error) {
    logger.error('update_idea_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to update idea' });
  }
}

// DELETE /ideas/:ideaId
async function deleteIdea(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;

    const project = await IdeaProject.findOne({ _id: ideaId, userId });
    if (!project) {
      return res.status(404).json({ success: false, error: 'IDEA_NOT_FOUND', message: 'Idea not found' });
    }

    // Cascading delete across runs, results, and project
    await Promise.all([
      IdeaProject.deleteOne({ _id: ideaId }),
      IdeaEvaluationRun.deleteMany({ ideaId }),
      IdeaAgentResult.deleteMany({ ideaId }),
    ]);

    logger.info('idea_deleted_cascading', { ideaId, userId });
    return res.status(200).json({ success: true, message: 'Idea and all related data deleted successfully' });
  } catch (error) {
    logger.error('delete_idea_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to delete idea' });
  }
}

// POST /ideas/:ideaId/structure
async function structureIdea(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;

    const project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
    if (!project) {
      return res.status(404).json({ success: false, error: 'IDEA_NOT_FOUND', message: 'Idea not found' });
    }

    const rawText = decryptIdeaField(project.encryptedOriginalText);
    const language = project.outputLanguage || 'ar';

    const prompt = buildStructurerPrompt(rawText, {
      language,
      targetMarket: project.targetMarket,
      targetAudience: project.targetAudience,
      primaryConcern: project.primaryConcern,
    });

    await IdeaProject.updateOne({ _id: ideaId }, { status: 'STRUCTURING' });

    // Call orchestrator or direct LLM
    const { getIdeaEvaluationWorker } = require('../services/ideaEvaluationWorker');
    const worker = getIdeaEvaluationWorker();
    const user = await User.findById(userId);

    const llmRes = await worker._callLlm({
      user,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      useCase: 'idea_structuring',
      feature: 'idea_council',
      stage: 'STRUCTURING',
      agentRole: 'STRUCTURER',
      operationId: String(project._id),
      timeoutMs: 45000,
    });

    if (!llmRes || !llmRes.raw) {
      await IdeaProject.updateOne({ _id: ideaId }, { status: 'DRAFT' });
      return res.status(502).json({
        success: false,
        error: 'AI_RESPONSE_FAILED',
        message: 'Structuring model failed to produce a response',
      });
    }

    const parsed = worker._tryParseJson(llmRes.raw);
    const validation = parsed ? validateAgentOutput('STRUCTURER', parsed) : { valid: false, error: 'JSON parse error' };

    if (!validation.valid || !validation.value) {
      await IdeaProject.updateOne({ _id: ideaId }, { status: 'DRAFT' });
      return res.status(422).json({
        success: false,
        error: 'STRUCTURED_OUTPUT_INVALID',
        message: validation.error || 'Model output failed schema validation',
      });
    }

    const structuredIdea = validation.value;
    const encryptedStructuredIdea = encryptIdeaJson(structuredIdea);
    const encryptedTitle = encryptIdeaField(structuredIdea.title);

    await IdeaProject.updateOne(
      { _id: ideaId },
      {
        encryptedStructuredIdea,
        encryptedTitle,
        status: 'AWAITING_CONFIRMATION',
        $inc: { version: 1 },
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        id: project._id,
        status: 'AWAITING_CONFIRMATION',
        structuredIdea,
      },
    });
  } catch (error) {
    logger.error('structure_idea_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to structure idea' });
  }
}

// POST /ideas/:ideaId/evaluations
async function startEvaluation(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;
    const idempotencyKey = req.header('idempotency-key') || req.body.idempotencyKey || `eval-${ideaId}-${Date.now()}`;

    // Check config
    const config = await IdeaCouncilConfig.getActiveConfig();
    if (!config.enabled) {
      return res.status(403).json({
        success: false,
        error: 'IDEA_COUNCIL_DISABLED',
        message: 'Idea Council is currently disabled by administrator',
      });
    }

    const project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
    if (!project) {
      return res.status(404).json({ success: false, error: 'IDEA_NOT_FOUND', message: 'Idea not found' });
    }

    if (!project.encryptedStructuredIdea) {
      return res.status(400).json({
        success: false,
        error: 'IDEA_NOT_CONFIRMED',
        message: 'Idea must be structured and confirmed before starting evaluation',
      });
    }

    // Check if another run is in progress for this idea
    const activeRun = await IdeaEvaluationRun.findOne({
      ideaId,
      status: { $in: ['QUEUED', 'RUNNING'] },
    });
    if (activeRun) {
      return res.status(409).json({
        success: false,
        error: 'IDEA_RUN_IN_PROGRESS',
        message: 'An evaluation is already running for this idea',
        runId: activeRun._id,
        data: { runId: activeRun._id, status: activeRun.status },
      });
    }

    // Check idempotency for previous run
    const existingRun = await IdeaEvaluationRun.findOne({ userId, idempotencyKey });
    if (existingRun) {
      return res.status(202).json({
        success: true,
        runId: existingRun._id,
        data: {
          runId: existingRun._id,
          status: existingRun.status,
          pollAfterMs: 2000,
        },
      });
    }

    // Atomic quota reservation for initial run
    const quota = await IdeaUsageCounter.reserveQuota(userId, config.monthlyIdeaLimit);
    if (!quota.allowed) {
      return res.status(429).json({
        success: false,
        error: 'IDEA_LIMIT_REACHED',
        message: `Monthly idea limit of ${config.monthlyIdeaLimit} reached for this account`,
        data: { limit: quota.limit, used: quota.used },
      });
    }

    // Create run
    const run = await IdeaEvaluationRun.create({
      ideaId: project._id,
      userId,
      runType: 'INITIAL',
      status: 'QUEUED',
      idempotencyKey,
      ideaSnapshotVersion: project.version,
    });

    await IdeaProject.updateOne(
      { _id: project._id },
      { status: 'QUEUED', latestRunId: run._id }
    );

    return res.status(202).json({
      success: true,
      runId: run._id,
      data: {
        runId: run._id,
        status: 'QUEUED',
        pollAfterMs: 2000,
      },
    });
  } catch (error) {
    logger.error('start_evaluation_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to start evaluation' });
  }
}

// GET /runs/:runId
async function getRunStatus(req, res) {
  try {
    const userId = getUserId(req);
    const { runId } = req.params;

    const run = await IdeaEvaluationRun.findOne({ _id: runId, userId });
    if (!run) {
      return res.status(404).json({ success: false, error: 'RUN_NOT_FOUND', message: 'Run not found' });
    }

    // Fetch individual agent results
    const agentResults = await IdeaAgentResult.find({ runId: run._id }).lean();
    const formattedAgents = agentResults.map((ar) => ({
      role: ar.role,
      status: ar.status,
      confidence: ar.confidence,
      output: ar.encryptedOutput ? decryptIdeaJson(ar.encryptedOutput) : null,
      errorClass: ar.errorClass,
      latencyMs: ar.latencyMs,
    }));

    const finalReport = run.encryptedFinalReport ? decryptIdeaJson(run.encryptedFinalReport) : null;
    const truthBoard = run.encryptedTruthBoard ? decryptIdeaJson(run.encryptedTruthBoard) : null;

    return res.status(200).json({
      success: true,
      data: {
        runId: run._id,
        ideaId: run.ideaId,
        projectId: run.ideaId,
        runType: run.runType,
        followupType: run.followupType,
        status: run.status,
        currentStage: run.currentStage,
        stage: run.currentStage,
        stageProgress: run.stageProgress,
        progress: run.stageProgress,
        agents: formattedAgents,
        sourceReferences: run.sourceReferences || [],
        finalReport,
        truthBoard,
        usageSummary: run.usageSummary,
        errorSummary: run.errorSummary,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
      },
    });
  } catch (error) {
    logger.error('get_run_status_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to retrieve run status' });
  }
}

// POST /ideas/:ideaId/follow-ups
async function startFollowup(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;
    const followupType = req.body.followupType || req.body.type;
    const followupPrompt = req.body.followupPrompt || req.body.userPrompt;
    const idempotencyKey = req.header('idempotency-key') || req.body.idempotencyKey || `followup-${ideaId}-${Date.now()}`;

    const project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
    if (!project) {
      return res.status(404).json({ success: false, error: 'IDEA_NOT_FOUND', message: 'Idea not found' });
    }

    if (project.followupRoundsUsed >= 3) {
      return res.status(429).json({
        success: false,
        error: 'FOLLOWUP_LIMIT_REACHED',
        message: 'All 3 follow-up rounds have been used for this idea',
      });
    }

    const activeRun = await IdeaEvaluationRun.findOne({
      ideaId,
      status: { $in: ['QUEUED', 'RUNNING'] },
    });
    if (activeRun) {
      return res.status(409).json({
        success: false,
        error: 'IDEA_RUN_IN_PROGRESS',
        message: 'An evaluation is already running for this idea',
        runId: activeRun._id,
        data: { runId: activeRun._id, status: activeRun.status },
      });
    }

    const existingRun = await IdeaEvaluationRun.findOne({ userId, idempotencyKey });
    if (existingRun) {
      return res.status(202).json({
        success: true,
        runId: existingRun._id,
        data: {
          runId: existingRun._id,
          status: existingRun.status,
          pollAfterMs: 2000,
        },
      });
    }

    const run = await IdeaEvaluationRun.create({
      ideaId: project._id,
      userId,
      runType: 'FOLLOW_UP',
      followupType,
      followupPrompt: followupPrompt ? String(followupPrompt).trim() : null,
      status: 'QUEUED',
      idempotencyKey,
      ideaSnapshotVersion: project.version,
    });

    await IdeaProject.updateOne(
      { _id: project._id },
      { status: 'QUEUED', latestRunId: run._id }
    );

    return res.status(202).json({
      success: true,
      runId: run._id,
      data: {
        runId: run._id,
        status: 'QUEUED',
        pollAfterMs: 2000,
      },
    });
  } catch (error) {
    logger.error('start_followup_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to start follow-up round' });
  }
}

// POST /runs/:runId/retry
async function retryRun(req, res) {
  try {
    const userId = getUserId(req);
    const { runId } = req.params;

    const run = await IdeaEvaluationRun.findOne({ _id: runId, userId });
    if (!run) {
      return res.status(404).json({ success: false, error: 'RUN_NOT_FOUND', message: 'Run not found' });
    }

    if (run.status !== 'FAILED' && run.status !== 'PARTIAL') {
      return res.status(400).json({
        success: false,
        error: 'RUN_NOT_RETRYABLE',
        message: 'Only FAILED or PARTIAL runs can be retried',
      });
    }

    // Reset failed agent results to PENDING so worker will re-attempt them
    await IdeaAgentResult.updateMany(
      { runId: run._id, status: 'FAILED' },
      { status: 'PENDING' }
    );

    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      { status: 'QUEUED', errorSummary: null }
    );

    return res.status(202).json({
      success: true,
      data: { runId: run._id, status: 'QUEUED', pollAfterMs: 2000 },
    });
  } catch (error) {
    logger.error('retry_run_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to retry run' });
  }
}

// POST /runs/:runId/cancel
async function cancelRun(req, res) {
  try {
    const userId = getUserId(req);
    const { runId } = req.params;

    const run = await IdeaEvaluationRun.findOne({ _id: runId, userId });
    if (!run) {
      return res.status(404).json({ success: false, error: 'RUN_NOT_FOUND', message: 'Run not found' });
    }

    if (run.status === 'COMPLETED' || run.status === 'CANCELED') {
      return res.status(400).json({
        success: false,
        message: `Run is already ${run.status}`,
      });
    }

    await IdeaEvaluationRun.updateOne({ _id: run._id }, { status: 'CANCELED' });
    await IdeaProject.updateOne({ _id: run.ideaId }, { status: 'CANCELED' });

    return res.status(200).json({ success: true, message: 'Run canceled' });
  } catch (error) {
    logger.error('cancel_run_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to cancel run' });
  }
}

// PATCH /ideas/:ideaId/truth-items/:itemId OR PATCH /truth-items/:itemId
async function updateTruthItem(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId, itemId } = req.params;
    const workflowState = req.body.workflowState || req.body.status;
    const userNotes = req.body.userNotes !== undefined ? req.body.userNotes : req.body.notes;

    let run = null;
    let project = null;

    if (ideaId) {
      project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
      if (project && project.latestRunId) {
        run = await IdeaEvaluationRun.findOne({ _id: project.latestRunId, userId });
      }
    }

    if (!run) {
      const recentRuns = await IdeaEvaluationRun.find({ userId }).sort({ createdAt: -1 }).limit(20);
      for (const r of recentRuns) {
        if (r.encryptedTruthBoard) {
          const tb = decryptIdeaJson(r.encryptedTruthBoard);
          const list = Array.isArray(tb) ? tb : (tb?.items || []);
          if (list.some((it) => String(it.id) === String(itemId) || String(it._id) === String(itemId))) {
            run = r;
            break;
          }
        }
      }
    }

    if (!run || !run.encryptedTruthBoard) {
      return res.status(404).json({ success: false, error: 'TRUTH_BOARD_NOT_FOUND', message: 'Truth board not available' });
    }

    const truthBoard = decryptIdeaJson(run.encryptedTruthBoard) || [];
    const list = Array.isArray(truthBoard) ? truthBoard : (truthBoard.items || []);
    const itemIndex = list.findIndex((item) => String(item.id) === String(itemId) || String(item._id) === String(itemId));

    if (itemIndex === -1) {
      return res.status(404).json({ success: false, error: 'ITEM_NOT_FOUND', message: 'Truth item not found' });
    }

    if (workflowState) {
      list[itemIndex].workflowState = workflowState;
      list[itemIndex].status = workflowState;
    }
    if (userNotes !== undefined) {
      list[itemIndex].userNotes = userNotes;
      list[itemIndex].notes = userNotes;
    }

    const updatedTruthBoard = Array.isArray(truthBoard) ? list : { ...truthBoard, items: list };
    const encryptedTruthBoard = encryptIdeaJson(updatedTruthBoard);
    await IdeaEvaluationRun.updateOne({ _id: run._id }, { encryptedTruthBoard });

    return res.status(200).json({
      success: true,
      data: {
        item: list[itemIndex],
      },
    });
  } catch (error) {
    logger.error('update_truth_item_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to update truth item' });
  }
}

// POST /ideas/:ideaId/feedback
async function submitFeedback(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;
    const { rating, comment } = req.body;

    const project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
    if (!project) {
      return res.status(404).json({ success: false, error: 'IDEA_NOT_FOUND', message: 'Idea not found' });
    }

    logger.info('idea_council_feedback_submitted', {
      ideaId,
      userId,
      rating: Number(rating),
      hasComment: Boolean(comment),
    });

    return res.status(200).json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    logger.error('submit_feedback_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to submit feedback' });
  }
}

// GET /ideas/:ideaId/export
async function exportIdeaReport(req, res) {
  try {
    const userId = getUserId(req);
    const { ideaId } = req.params;
    const format = req.query.format === 'html' ? 'html' : 'md';

    const project = await IdeaProject.findOne({ _id: ideaId, userId, isDeleted: false });
    if (!project || !project.latestRunId) {
      return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND', message: 'Completed report not found' });
    }

    const run = await IdeaEvaluationRun.findOne({ _id: project.latestRunId, userId });
    const finalReport = run?.encryptedFinalReport ? decryptIdeaJson(run.encryptedFinalReport) : null;
    const title = decryptIdeaField(project.encryptedTitle) || 'Idea Report';

    if (!finalReport) {
      return res.status(404).json({ success: false, error: 'REPORT_NOT_FOUND', message: 'Report is not ready yet' });
    }

    if (format === 'md') {
      const markdown = `# ${title}\n\n`
        + `**Verdict:** ${finalReport.verdict}\n\n`
        + `**7-Day Build Verdict:** ${finalReport.sevenDayBuildVerdict}\n\n`
        + `## Executive Summary\n${finalReport.executiveSummary}\n\n`
        + `## Explanation\n${finalReport.verdictExplanation}\n\n`
        + `## Strongest Opportunity\n${finalReport.strongestOpportunity}\n\n`
        + `## Biggest Risk\n${finalReport.biggestRisk}\n\n`
        + `## Top 3 Assumptions\n${(finalReport.top3Assumptions || []).map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n`
        + `## Critical Question\n${finalReport.criticalQuestion}\n\n`
        + `## 7-Day MVP Scope\n${(finalReport.sevenDayMvpScope || []).map((s) => `- ${s}`).join('\n')}\n\n`
        + `## Validation Plan\n`
        + `- **Hypothesis:** ${finalReport.validationPlan?.hypothesis}\n`
        + `- **Target Audience:** ${finalReport.validationPlan?.targetAudience}\n`
        + `- **Channel:** ${finalReport.validationPlan?.channel}\n`
        + `- **Duration:** ${finalReport.validationPlan?.suggestedDuration}\n`
        + `- **Success Metric:** ${finalReport.validationPlan?.successMetric}\n`
        + `- **Stop Condition:** ${finalReport.validationPlan?.stopCondition}\n`;

      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="idea-report-${ideaId}.md"`);
      return res.send(markdown);
    }

    // HTML print-ready format
    const html = `<!DOCTYPE html>
<html lang="${project.outputLanguage || 'ar'}" dir="${project.outputLanguage === 'en' ? 'ltr' : 'rtl'}">
<head>
  <meta charset="UTF-8">
  <title>${title} — Idea Council Report</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #1e293b; line-height: 1.6; max-width: 900px; margin: 0 auto; }
    h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #0284c7; color: #fff; font-weight: 700; margin-bottom: 20px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="badge">${finalReport.verdict}</div>
  <div class="card">
    <h3>Executive Summary</h3>
    <p>${finalReport.executiveSummary}</p>
    <p>${finalReport.verdictExplanation}</p>
  </div>
  <div class="card">
    <h3>Key Takeaways</h3>
    <p><strong>Strongest Opportunity:</strong> ${finalReport.strongestOpportunity}</p>
    <p><strong>Biggest Risk:</strong> ${finalReport.biggestRisk}</p>
    <p><strong>Critical Question:</strong> ${finalReport.criticalQuestion}</p>
  </div>
  <div class="card">
    <h3>Validation Plan (${finalReport.validationPlan?.suggestedDuration})</h3>
    <p><strong>Hypothesis:</strong> ${finalReport.validationPlan?.hypothesis}</p>
    <p><strong>Channel:</strong> ${finalReport.validationPlan?.channel}</p>
    <p><strong>Success Metric:</strong> ${finalReport.validationPlan?.successMetric}</p>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (error) {
    logger.error('export_idea_report_error', { error: error.message });
    return res.status(500).json({ success: false, message: 'Failed to export report' });
  }
}

module.exports = {
  getUsage,
  getIdeas,
  createIdea,
  getIdeaById,
  updateIdea,
  deleteIdea,
  structureIdea,
  startEvaluation,
  getRunStatus,
  startFollowup,
  retryRun,
  cancelRun,
  updateTruthItem,
  submitFeedback,
  exportIdeaReport,
};
