// server/services/aiCompletionOrchestrator.js
// Executes the policy-driven "Auto" completion route:
//   resolveAiPolicy -> bounded attempts per candidate -> AiUsageEvent per try
// Candidates whose credential is cooling down in the circuit breaker are
// skipped without a dispatch or usage event; availability failures recorded
// by the classifier open the breaker so dead providers are not hammered on
// every request. Every dependency is injectable so the orchestration rules
// are unit testable without a database or network access.
const crypto = require('crypto');

const logger = require('../logger');
const {
  classifyAiProviderError,
  resolveAiPolicy,
} = require('./AiPolicyResolver');
const {
  buildCredentialContext,
  decryptCredentialSecret,
} = require('./AiCredentialCrypto');
const {
  AI_CIRCUIT_BREAKER_CATEGORIES,
  createAiCircuitBreaker,
} = require('./aiCircuitBreaker');

class AiAutoRouteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiAutoRouteError';
    this.code = code;
  }
}

function tokenUsageFrom(response) {
  const usage = response?.usage;
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  // OpenAI-style first, Anthropic-style second.
  return {
    inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
  };
}

function createAiCompletionOrchestrator(deps = {}) {
  const models = deps.models || {};
  const sendCompletion = deps.sendCompletion;
  const decryptSecret = deps.decryptCredentialSecret || decryptCredentialSecret;
  const environment = deps.environment || process.env;
  const userLoader = deps.userLoader || (async () => null);
  const log = deps.logger || logger;
  // One breaker per orchestrator instance; aiFailover builds this module once,
  // so cooldowns persist across requests within the process.
  const breaker = deps.breaker
    || createAiCircuitBreaker({ environment, logger: log });

  async function recordUsage(event) {
    if (!models.AiUsageEvent) return;
    try {
      await models.AiUsageEvent.create(event);
    } catch (error) {
      log.warn('ai_usage_event_write_failed', { error: error.message });
    }
  }

  function credentialById(credentials, credentialId) {
    return (credentials || []).find(
      (credential) => String(credential._id) === String(credentialId)
    ) || null;
  }

  function decryptCandidateKey(candidate, credential) {
    return decryptSecret(
      {
        secretCiphertext: credential.secretCiphertext,
        secretIv: credential.secretIv,
        secretAuthTag: credential.secretAuthTag,
        encryptionKeyId: credential.encryptionKeyId,
        encryptionVersion: credential.encryptionVersion,
      },
      {
        context: buildCredentialContext(credential._id, credential.provider),
        environment,
      }
    );
  }

  async function runAutoCompletion({ user = null, bot = null, options = {} }) {
    if (
      !models.AiRoutingPolicy
      || !models.AiTierEntitlement
      || !models.AiUserOverride
      || !models.AiModelCatalog
      || !models.AiCredential
      || typeof sendCompletion !== 'function'
    ) {
      throw new AiAutoRouteError('AI_AUTO_NOT_CONFIGURED', 'Auto routing is not configured');
    }

    const [policies, entitlements, overrides, catalog, credentials, resolvedUser] =
      await Promise.all([
        models.AiRoutingPolicy.find({}).lean(),
        models.AiTierEntitlement.find({}).lean(),
        models.AiUserOverride.find({}).lean(),
        models.AiModelCatalog.find({}).lean(),
        models.AiCredential.find({}).select(
          '+secretCiphertext +secretIv +secretAuthTag +encryptionKeyId'
        ).lean(),
        user || (bot?.userId ? userLoader(bot.userId) : Promise.resolve(null)),
      ]);

    const effectiveUser = user || resolvedUser;
    if (!effectiveUser) {
      throw new AiAutoRouteError('AI_AUTO_NOT_CONFIGURED', 'No owning user for this bot');
    }

    let resolution;
    try {
      resolution = resolveAiPolicy({
        userId: effectiveUser._id || effectiveUser.userId,
        botId: bot?._id,
        tier: effectiveUser.subscriptionTier,
        useCase: 'general',
        policies,
        entitlements,
        overrides,
        catalog,
        credentials,
      });
    } catch (error) {
      // Configuration gaps degrade to the legacy completion path.
      throw new AiAutoRouteError('AI_AUTO_NOT_CONFIGURED', error.message);
    }

    const requestId = crypto.randomUUID();
    let runningAttempt = 0;
    let breakerSkips = 0;

    for (let index = 0; index < resolution.candidates.length; index += 1) {
      const candidate = resolution.candidates[index];
      const credential = credentialById(credentials, candidate.credentialId);
      if (!credential) continue;

      let apiKey;
      try {
        apiKey = decryptCandidateKey(candidate, credential);
      } catch (error) {
        runningAttempt += 1;
        await recordUsage({
          requestId,
          userId: effectiveUser._id || effectiveUser.userId,
          botId: bot?._id || null,
          policyId: resolution.policyId || null,
          credentialId: candidate.credentialId,
          modelCatalogId: candidate.modelCatalogId,
          provider: candidate.provider,
          modelId: candidate.modelId,
          tier: resolution.tier,
          useCase: resolution.useCase,
          attempt: runningAttempt,
          success: false,
          latencyMs: 0,
          errorClass: 'authentication',
          retryable: false,
          fallbackUsed: index > 0,
        });
        continue;
      }

      if (breaker.isOpen({ credentialId: candidate.credentialId })) {
        // Skip silently from the usage ledger: no dispatch happened, so there
        // is nothing to bill or audit beyond this log line.
        breakerSkips += 1;
        log.warn('ai_auto_candidate_skipped_circuit_open', {
          requestId,
          credentialId: candidate.credentialId,
          provider: candidate.provider,
          modelId: candidate.modelId,
          cooldownRemainingMs: breaker.cooldownRemainingMs({ credentialId: candidate.credentialId }),
        });
        continue;
      }

      for (let attemptInCandidate = 1; attemptInCandidate <= candidate.maxAttempts; attemptInCandidate += 1) {
        runningAttempt += 1;
        const startedAt = Date.now();
        try {
          const response = await sendCompletion({
            provider: candidate.provider,
            apiKey,
            baseUrl: credential.baseUrl || '',
            modelId: candidate.modelId,
            options,
          });
          breaker.recordSuccess({ credentialId: candidate.credentialId });
          const latencyMs = Date.now() - startedAt;
          const usage = tokenUsageFrom(response);

          await recordUsage({
            requestId,
            userId: effectiveUser._id || effectiveUser.userId,
            botId: bot?._id || null,
            policyId: resolution.policyId || null,
            credentialId: candidate.credentialId,
            modelCatalogId: candidate.modelCatalogId,
            provider: candidate.provider,
            modelId: candidate.modelId,
            tier: resolution.tier,
            useCase: resolution.useCase,
            attempt: runningAttempt,
            success: true,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            latencyMs,
            fallbackUsed: index > 0,
          });

          return { response, resolution };
        } catch (error) {
          const latencyMs = Date.now() - startedAt;
          const classification = classifyAiProviderError(error);

          // Availability failures open the breaker so later requests skip
          // this credential; config-style failures never cool it down.
          if (
            classification.canFallback
            && AI_CIRCUIT_BREAKER_CATEGORIES.has(classification.category)
          ) {
            breaker.recordFailure({
              credentialId: candidate.credentialId,
              category: classification.category,
            });
          }

          await recordUsage({
            requestId,
            userId: effectiveUser._id || effectiveUser.userId,
            botId: bot?._id || null,
            policyId: resolution.policyId || null,
            credentialId: candidate.credentialId,
            modelCatalogId: candidate.modelCatalogId,
            provider: candidate.provider,
            modelId: candidate.modelId,
            tier: resolution.tier,
            useCase: resolution.useCase,
            attempt: runningAttempt,
            success: false,
            latencyMs,
            errorClass: classification.category,
            retryable: classification.retryable,
            fallbackUsed: index > 0,
          });

          if (!classification.retryable || attemptInCandidate >= candidate.maxAttempts) {
            break;
          }
          log.warn('ai_auto_candidate_retrying', {
            requestId,
            provider: candidate.provider,
            modelId: candidate.modelId,
            attemptInCandidate,
            category: classification.category,
          });
        }
      }
    }

    if (breakerSkips > 0 && runningAttempt === 0) {
      throw new AiAutoRouteError(
        'AI_ROUTE_CIRCUIT_OPEN',
        'Every routed AI credential is cooling down in the circuit breaker'
      );
    }

    throw new AiAutoRouteError('AI_ROUTE_EXHAUSTED', 'Every routed AI candidate failed');
  }

  return {
    runAutoCompletion,
    _internals: { tokenUsageFrom },
  };
}

module.exports = {
  AiAutoRouteError,
  createAiCompletionOrchestrator,
};
