'use strict';

const crypto = require('crypto');
const logger = require('../logger');
const IdeaProject = require('../models/IdeaProject');
const IdeaEvaluationRun = require('../models/IdeaEvaluationRun');
const IdeaAgentResult = require('../models/IdeaAgentResult');
const IdeaUsageCounter = require('../models/IdeaUsageCounter');
const IdeaCouncilConfig = require('../models/IdeaCouncilConfig');
const RuntimeLease = require('../models/RuntimeLease');
const User = require('../models/User');

const {
  encryptIdeaField,
  decryptIdeaField,
  encryptIdeaJson,
  decryptIdeaJson,
} = require('./ideaDataCrypto');
const {
  buildAgentPrompt,
  buildChairpersonPrompt,
} = require('./ideaCouncilPrompts');
const {
  validateAgentOutput,
} = require('./ideaCouncilSchemas');
const { OpenAiWebResearchAdapter } = require('./ideaWebResearchAdapter');

// Members list
const ALL_COUNCIL_ROLES = [
  'COLD_CUSTOMER',
  'HARSH_AUDITOR',
  'EXECUTION_EXPERT',
  'MARKET_RESEARCHER',
  'DEVILS_ADVOCATE',
  'WEDGE_HUNTER',
  'UX_DESIGNER',
  'CANDID_CHAMPION',
];

const FOLLOWUP_ROLES_MAP = {
  DEFEND: ['COLD_CUSTOMER', 'DEVILS_ADVOCATE', 'CANDID_CHAMPION'],
  PIVOT: ['MARKET_RESEARCHER', 'WEDGE_HUNTER', 'EXECUTION_EXPERT'],
  VALIDATION_PLAN: ['COLD_CUSTOMER', 'EXECUTION_EXPERT', 'UX_DESIGNER'],
  VOTE: ALL_COUNCIL_ROLES,
  DEEP_DIVE: ['HARSH_AUDITOR', 'EXECUTION_EXPERT', 'COLD_CUSTOMER'],
  COMPARE: ['MARKET_RESEARCHER', 'WEDGE_HUNTER'],
  MVP: ['EXECUTION_EXPERT', 'UX_DESIGNER'],
};

class IdeaEvaluationWorker {
  constructor(deps = {}) {
    this.workerId = deps.workerId || `worker-${crypto.randomUUID().slice(0, 8)}`;
    this.orchestrator = deps.orchestrator || null;
    this.researchAdapter = deps.researchAdapter || new OpenAiWebResearchAdapter();
    this.pollIntervalMs = deps.pollIntervalMs || 2000;
    this.heartbeatIntervalMs = deps.heartbeatIntervalMs || 15000;
    this.leaseDurationMs = deps.leaseDurationMs || 45000;
    this.isRunning = false;
    this.timer = null;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('idea_evaluation_worker_started', { workerId: this.workerId });
    this._poll();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    logger.info('idea_evaluation_worker_stopped', { workerId: this.workerId });
  }

  async _poll() {
    if (!this.isRunning) return;

    try {
      await this._recoverStaleRuns();
      await this._processNextRun();
    } catch (error) {
      logger.error('idea_worker_poll_cycle_error', { error: error.message });
    } finally {
      if (this.isRunning) {
        this.timer = setTimeout(() => this._poll(), this.pollIntervalMs);
      }
    }
  }

  async _recoverStaleRuns() {
    const staleThreshold = new Date(Date.now() - 60000);
    const staleRuns = await IdeaEvaluationRun.find({
      status: 'RUNNING',
      heartbeatAt: { $lt: staleThreshold },
    }).limit(2);

    for (const run of staleRuns) {
      logger.warn('recovering_stale_idea_run', { runId: run._id, workerId: this.workerId });
      await IdeaEvaluationRun.updateOne(
        { _id: run._id },
        { status: 'QUEUED', workerId: null, heartbeatAt: null }
      );
      await RuntimeLease.deleteOne({ resourceKey: `idea-evaluation:${run._id}` });
    }
  }

  async _processNextRun() {
    const config = await IdeaCouncilConfig.getActiveConfig();
    if (!config.enabled) return;

    // Check system-wide running count
    const runningCount = await IdeaEvaluationRun.countDocuments({ status: 'RUNNING' });
    if (runningCount >= config.workerConcurrency) return;

    const run = await IdeaEvaluationRun.findOneAndUpdate(
      { status: 'QUEUED' },
      {
        $set: {
          status: 'RUNNING',
          workerId: this.workerId,
          heartbeatAt: new Date(),
          startedAt: new Date(),
        },
      },
      { new: true, sort: { createdAt: 1 } }
    );

    if (!run) return;

    // Acquire distributed lease
    const leaseKey = `idea-evaluation:${run._id}`;
    const leaseUntil = new Date(Date.now() + this.leaseDurationMs);
    try {
      await RuntimeLease.create({
        resourceKey: leaseKey,
        ownerId: this.workerId,
        acquiredAt: new Date(),
        leaseUntil,
        updatedAt: new Date(),
      });
    } catch (leaseError) {
      logger.warn('idea_run_lease_acquire_failed', { runId: run._id });
      await IdeaEvaluationRun.updateOne({ _id: run._id }, { status: 'QUEUED', workerId: null });
      return;
    }

    // Start heartbeat
    const heartbeatTimer = setInterval(async () => {
      try {
        await IdeaEvaluationRun.updateOne(
          { _id: run._id, status: 'RUNNING' },
          { heartbeatAt: new Date() }
        );
        await RuntimeLease.updateOne(
          { resourceKey: leaseKey, ownerId: this.workerId },
          { leaseUntil: new Date(Date.now() + this.leaseDurationMs), updatedAt: new Date() }
        );
      } catch (err) {
        logger.warn('idea_run_heartbeat_failed', { runId: run._id, error: err.message });
      }
    }, this.heartbeatIntervalMs);

    try {
      await this.executeEvaluationPipeline(run, config);
    } catch (pipelineError) {
      logger.error('idea_evaluation_pipeline_error', { runId: run._id, error: pipelineError.message });
      await this._handleRunFailure(run, pipelineError);
    } finally {
      clearInterval(heartbeatTimer);
      await RuntimeLease.deleteOne({ resourceKey: leaseKey, ownerId: this.workerId }).catch(() => {});
    }
  }

  async executeEvaluationPipeline(run, config) {
    const idea = await IdeaProject.findById(run.ideaId);
    if (!idea) {
      throw new Error(`IdeaProject not found: ${run.ideaId}`);
    }

    const structuredIdea = decryptIdeaJson(idea.encryptedStructuredIdea);
    if (!structuredIdea) {
      throw new Error('Structured idea missing or unreadable');
    }

    const user = await User.findById(run.userId);
    const language = idea.outputLanguage || 'ar';

    // Stage 1: Market Research (if researchEnabled and initial run or compare)
    let sources = run.sourceReferences || [];
    if (config.researchEnabled && (!run.stageProgress?.researchCompleted || sources.length === 0)) {
      await IdeaEvaluationRun.updateOne(
        { _id: run._id },
        { currentStage: 'RESEARCH' }
      );

      const researchResult = await this.researchAdapter.conductResearch({
        structuredIdea,
        language,
      });

      sources = researchResult.sources || [];
      await IdeaEvaluationRun.updateOne(
        { _id: run._id },
        {
          sourceReferences: sources,
          'stageProgress.researchCompleted': true,
          $inc: { 'usageSummary.totalSearchCalls': sources.length > 0 ? 1 : 0 },
        }
      );
    }

    // Stage 2: Agent Analysis
    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      { currentStage: 'ANALYSIS' }
    );

    const targetRoles = run.runType === 'FOLLOW_UP' && run.followupType
      ? (FOLLOWUP_ROLES_MAP[run.followupType] || ALL_COUNCIL_ROLES)
      : ALL_COUNCIL_ROLES;

    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      { 'stageProgress.agentsTotal': targetRoles.length }
    );

    // Parallel execution with bounded concurrency
    const agentOutputs = {};
    const concurrency = config.agentConcurrencyPerRun || 3;
    const rolesQueue = [...targetRoles];

    const workerTasks = Array.from({ length: concurrency }).map(async () => {
      while (rolesQueue.length > 0) {
        const role = rolesQueue.shift();
        if (!role) break;

        try {
          const result = await this._executeSingleAgent({
            run,
            idea,
            user,
            role,
            structuredIdea,
            language,
            sources,
            timeoutMs: config.agentTimeoutMs,
          });

          if (result && result.output) {
            agentOutputs[role] = result.output;
            await IdeaEvaluationRun.updateOne(
              { _id: run._id },
              { $inc: { 'stageProgress.agentsCompleted': 1 } }
            );
          } else {
            await IdeaEvaluationRun.updateOne(
              { _id: run._id },
              { $inc: { 'stageProgress.agentsFailed': 1 } }
            );
          }
        } catch (agentErr) {
          logger.warn('agent_execution_failed', { runId: run._id, role, error: agentErr.message });
          await IdeaEvaluationRun.updateOne(
            { _id: run._id },
            { $inc: { 'stageProgress.agentsFailed': 1 } }
          );
        }
      }
    });

    await Promise.all(workerTasks);

    // Stage 3: Synthesis & Chairperson
    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      { currentStage: 'SYNTHESIS' }
    );

    const chairpersonResult = await this._executeChairperson({
      run,
      idea,
      user,
      structuredIdea,
      agentOutputs,
      language,
      sources,
      timeoutMs: config.agentTimeoutMs * 1.5,
    });

    // Stage 4: Finalizing
    const completedCount = Object.keys(agentOutputs).length;
    const hasChairperson = Boolean(chairpersonResult && chairpersonResult.output);

    let finalStatus = 'FAILED';
    if (hasChairperson) {
      finalStatus = completedCount >= targetRoles.length ? 'COMPLETED' : 'PARTIAL';
    }

    const encryptedFinalReport = chairpersonResult?.output
      ? encryptIdeaJson(chairpersonResult.output)
      : null;

    const encryptedTruthBoard = chairpersonResult?.output?.truthBoardItems
      ? encryptIdeaJson(chairpersonResult.output.truthBoardItems)
      : null;

    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      {
        status: finalStatus,
        currentStage: 'FINALIZING',
        'stageProgress.synthesisCompleted': hasChairperson,
        encryptedFinalReport,
        encryptedTruthBoard,
        completedAt: new Date(),
      }
    );

    // Update IdeaProject
    const projectUpdates = {
      latestRunId: run._id,
      status: finalStatus,
    };
    if (finalStatus === 'COMPLETED' || finalStatus === 'PARTIAL') {
      if (run.runType === 'INITIAL') {
        projectUpdates.initialEvaluationsUsed = 1;
        // Mark usage counter completed
        const yearMonthUtc = `${run.createdAt.getUTCFullYear()}-${String(run.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
        await IdeaUsageCounter.updateOne(
          { counterKey: `${run.userId}:${yearMonthUtc}` },
          { $inc: { initialRunsCompleted: 1 } }
        );
      } else {
        projectUpdates.$inc = { followupRoundsUsed: 1 };
      }
    }
    await IdeaProject.updateOne({ _id: idea._id }, projectUpdates);

    logger.info('idea_evaluation_completed', { runId: run._id, finalStatus, completedAgents: completedCount });
  }

  async _executeSingleAgent({ run, idea, user, role, structuredIdea, language, sources, timeoutMs }) {
    // Check existing
    let existing = await IdeaAgentResult.findOne({ runId: run._id, role });
    if (existing && existing.status === 'COMPLETED' && existing.encryptedOutput) {
      return { output: decryptIdeaJson(existing.encryptedOutput) };
    }

    if (!existing) {
      existing = await IdeaAgentResult.create({
        runId: run._id,
        ideaId: idea._id,
        userId: run.userId,
        role,
        status: 'RUNNING',
        encryptedInputHash: crypto.createHash('sha256').update(`${role}:${JSON.stringify(structuredIdea)}`).digest('hex'),
        startedAt: new Date(),
      });
    }

    const prompt = buildAgentPrompt(role, structuredIdea, {
      language,
      researchEvidence: role === 'MARKET_RESEARCHER' ? sources : null,
    });

    const llmResult = await this._callLlm({
      user,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      useCase: 'idea_analysis',
      feature: 'idea_council',
      stage: 'ANALYSIS',
      agentRole: role,
      operationId: String(run._id),
      timeoutMs,
    });

    if (!llmResult || !llmResult.raw) {
      await IdeaAgentResult.updateOne(
        { _id: existing._id },
        { status: 'FAILED', errorClass: 'empty_response', completedAt: new Date() }
      );
      return null;
    }

    let parsed = this._tryParseJson(llmResult.raw);
    let validation = parsed ? validateAgentOutput(role, parsed) : { valid: false, error: 'JSON parse error' };

    // 1 Self-healing attempt if invalid
    if (!validation.valid && parsed) {
      logger.warn('agent_output_schema_invalid_repairing', { role, error: validation.error });
      const repairPrompt = `The previous JSON response did not match the schema: ${validation.error}. Please fix the JSON and return ONLY the valid JSON:`;
      const repairedLlm = await this._callLlm({
        user,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
          { role: 'assistant', content: llmResult.raw },
          { role: 'user', content: repairPrompt },
        ],
        useCase: 'idea_analysis',
        feature: 'idea_council',
        stage: 'ANALYSIS',
        agentRole: role,
        operationId: String(run._id),
        timeoutMs,
      });

      if (repairedLlm && repairedLlm.raw) {
        parsed = this._tryParseJson(repairedLlm.raw);
        validation = parsed ? validateAgentOutput(role, parsed) : { valid: false, error: 'Repair JSON parse error' };
      }
    }

    if (!validation.valid || !validation.value) {
      await IdeaAgentResult.updateOne(
        { _id: existing._id },
        { status: 'FAILED', errorClass: 'schema_validation_failed', completedAt: new Date() }
      );
      return null;
    }

    const encryptedOutput = encryptIdeaJson(validation.value);
    await IdeaAgentResult.updateOne(
      { _id: existing._id },
      {
        status: 'COMPLETED',
        encryptedOutput,
        confidence: 0.9,
        modelUsed: llmResult.modelId || 'auto',
        providerUsed: llmResult.provider || 'auto',
        tokenUsage: llmResult.tokenUsage || { inputTokens: 0, outputTokens: 0 },
        latencyMs: llmResult.latencyMs || 0,
        completedAt: new Date(),
      }
    );

    // Accumulate usage
    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      {
        $inc: {
          'usageSummary.totalInputTokens': llmResult.tokenUsage?.inputTokens || 0,
          'usageSummary.totalOutputTokens': llmResult.tokenUsage?.outputTokens || 0,
          'usageSummary.totalLatencyMs': llmResult.latencyMs || 0,
        },
      }
    );

    return { output: validation.value };
  }

  async _executeChairperson({ run, idea, user, structuredIdea, agentOutputs, language, sources, timeoutMs }) {
    const prompt = buildChairpersonPrompt(structuredIdea, agentOutputs, {
      language,
      sourceReferences: sources,
    });

    const llmResult = await this._callLlm({
      user,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      useCase: 'idea_synthesis',
      feature: 'idea_council',
      stage: 'SYNTHESIS',
      agentRole: 'CHAIRPERSON',
      operationId: String(run._id),
      timeoutMs,
    });

    if (!llmResult || !llmResult.raw) {
      return null;
    }

    let parsed = this._tryParseJson(llmResult.raw);
    let validation = parsed ? validateAgentOutput('CHAIRPERSON', parsed) : { valid: false, error: 'JSON parse error' };

    if (!validation.valid && parsed) {
      logger.warn('chairperson_output_invalid_repairing', { error: validation.error });
      const repairPrompt = `Fix this synthesis JSON to match the schema exactly. Schema error: ${validation.error}. Return ONLY the valid JSON:`;
      const repaired = await this._callLlm({
        user,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
          { role: 'assistant', content: llmResult.raw },
          { role: 'user', content: repairPrompt },
        ],
        useCase: 'idea_synthesis',
        feature: 'idea_council',
        stage: 'SYNTHESIS',
        agentRole: 'CHAIRPERSON',
        operationId: String(run._id),
        timeoutMs,
      });

      if (repaired && repaired.raw) {
        parsed = this._tryParseJson(repaired.raw);
        validation = parsed ? validateAgentOutput('CHAIRPERSON', parsed) : { valid: false, error: 'Repair JSON parse error' };
      }
    }

    if (!validation.valid || !validation.value) {
      logger.error('chairperson_synthesis_failed_schema', { error: validation.error });
      return null;
    }

    return { output: validation.value };
  }

  async _callLlm(params) {
    const startedAt = Date.now();
    if (this.orchestrator && typeof this.orchestrator.runAutoCompletion === 'function') {
      try {
        const result = await this.orchestrator.runAutoCompletion({
          user: params.user,
          options: {
            useCase: params.useCase || 'idea_analysis',
            feature: params.feature || 'idea_council',
            stage: params.stage,
            agentRole: params.agentRole,
            operationId: params.operationId,
            messages: params.messages,
            timeoutMs: params.timeoutMs,
          },
        });
        const latencyMs = Date.now() - startedAt;
        const text = result.response?.choices?.[0]?.message?.content || result.response?.content || '';
        return {
          raw: text,
          modelId: result.resolution?.candidates?.[0]?.modelId || 'auto',
          provider: result.resolution?.candidates?.[0]?.provider || 'auto',
          tokenUsage: {
            inputTokens: Number(result.response?.usage?.prompt_tokens || 0),
            outputTokens: Number(result.response?.usage?.completion_tokens || 0),
          },
          latencyMs,
        };
      } catch (orchErr) {
        logger.warn('orchestrator_call_failed_fallback_to_openai_direct', { error: orchErr.message });
      }
    }

    // Direct fallback using OpenAI if available
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const axios = require('axios');
        const res = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model: 'gpt-4o-mini',
            messages: params.messages,
            temperature: 0.3,
            response_format: { type: 'json_object' },
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            timeout: params.timeoutMs || 45000,
          }
        );
        const latencyMs = Date.now() - startedAt;
        return {
          raw: res.data.choices[0].message.content,
          modelId: 'gpt-4o-mini',
          provider: 'openai',
          tokenUsage: {
            inputTokens: res.data.usage?.prompt_tokens || 0,
            outputTokens: res.data.usage?.completion_tokens || 0,
          },
          latencyMs,
        };
      } catch (directErr) {
        logger.error('direct_openai_fallback_failed', { error: directErr.message });
      }
    }

    return null;
  }

  _tryParseJson(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      // Extract from markdown codeblock if present
      const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch (_) {}
      }
      return null;
    }
  }

  async _handleRunFailure(run, error) {
    await IdeaEvaluationRun.updateOne(
      { _id: run._id },
      {
        status: 'FAILED',
        errorSummary: {
          code: 'PIPELINE_ERROR',
          message: error.message,
        },
        completedAt: new Date(),
      }
    );

    // Release reserved quota on system failure so user isn't penalized
    if (run.runType === 'INITIAL') {
      await IdeaUsageCounter.releaseReservation(run.userId, run.createdAt);
    }

    await IdeaProject.updateOne(
      { _id: run.ideaId },
      { status: 'FAILED' }
    );
  }
}

// Global worker instance
let workerInstance = null;

function getIdeaEvaluationWorker(deps = {}) {
  if (!workerInstance) {
    workerInstance = new IdeaEvaluationWorker(deps);
  }
  return workerInstance;
}

function startIdeaEvaluationWorker(deps = {}) {
  const worker = getIdeaEvaluationWorker(deps);
  worker.start();
  return worker;
}

module.exports = {
  IdeaEvaluationWorker,
  getIdeaEvaluationWorker,
  startIdeaEvaluationWorker,
  ALL_COUNCIL_ROLES,
  FOLLOWUP_ROLES_MAP,
};
