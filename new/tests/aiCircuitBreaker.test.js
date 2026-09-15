// tests/aiCircuitBreaker.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  AI_CIRCUIT_BREAKER_CATEGORIES,
  createAiCircuitBreaker,
} = require('../server/services/aiCircuitBreaker');
const {
  AiAutoRouteError,
  createAiCompletionOrchestrator,
} = require('../server/services/aiCompletionOrchestrator');
const { encryptCredentialSecret } = require('../server/services/AiCredentialCrypto');

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

function breakerEnvironment(baseMs, maxMs) {
  return {
    AI_CIRCUIT_BASE_COOLDOWN_MS: String(baseMs),
    AI_CIRCUIT_MAX_COOLDOWN_MS: String(maxMs),
  };
}

// --- Minimal orchestrator fixture helpers (copied style from
// tests/aiCompletionOrchestrator.test.js; no cross-file imports) ---

function testEnvironment() {
  return {
    CREDENTIAL_ENCRYPTION_KEY: `base64:${crypto.randomBytes(32).toString('base64')}`,
  };
}

function credentialDoc({ id, provider, secret }, environment) {
  return {
    _id: id,
    name: `cred-${id}`,
    provider,
    baseUrl: '',
    status: 'active',
    ...encryptCredentialSecret(secret, { context: `${id}:${provider}`, environment }),
  };
}

function makeModels(overrides = {}) {
  return {
    AiRoutingPolicy: { find() { return { async lean() { return overrides.policies || []; } }; } },
    AiTierEntitlement: { find() { return { async lean() { return overrides.entitlements || []; } }; } },
    AiUserOverride: { find() { return { async lean() { return overrides.overrides || []; } }; } },
    AiModelCatalog: { find() { return { async lean() { return overrides.catalog || []; } }; } },
    AiCredential: {
      find() {
        return {
          select() {
            return {
              async lean() { return overrides.credentials || []; },
            };
          },
        };
      },
    },
    AiUsageEvent: {
      events: [],
      async create(event) { this.events.push(event); return event; },
    },
    ...overrides.models,
  };
}

function autoPolicy({ catalog, credentials }) {
  const step = (modelIdSuffix, credentialId) => ({
    modelCatalogId: catalog.find((m) => m.modelId.endsWith(modelIdSuffix))._id,
    credentialId,
    mode: 'fixed',
    maxAttempts: 2,
    timeoutMs: 5000,
    fallbackOn: ['timeout', 'rate_limit'],
  });
  return [{
    name: 'global-default',
    enabled: true,
    scopeType: 'global',
    scopeKey: 'global',
    useCase: 'general',
    selectionMode: 'auto',
    priority: 10,
    steps: [
      step('mini', credentials[0]._id),
      step('sonnet', credentials[1]._id),
    ],
  }];
}

function baseSetup() {
  const environment = testEnvironment();
  const credentials = [
    credentialDoc({ id: 'c-1', provider: 'openai', secret: 'sk-test-openai' }, environment),
    credentialDoc({ id: 'c-2', provider: 'anthropic', secret: 'sk-test-anthropic' }, environment),
  ];
  const catalog = [
    { _id: 'm-mini', provider: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT mini', autoEligible: true, enabled: true, capabilities: ['text_input', 'text_output'] },
    { _id: 'm-sonnet', provider: 'anthropic', modelId: 'claude-3-5-sonnet', displayName: 'Sonnet', autoEligible: true, enabled: true, capabilities: ['text_input', 'text_output'] },
  ];
  const user = { _id: 'u-1', subscriptionTier: 'free' };
  const bot = { _id: 'b-1', userId: 'u-1' };
  const options = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 50 };

  return { environment, credentials, catalog, user, bot, options };
}

describe('aiCircuitBreaker', () => {
  test('opens after a single rate_limit failure and reports the cooldown', () => {
    let clock = 1000;
    const breaker = createAiCircuitBreaker({
      environment: breakerEnvironment(30000, 900000),
      logger: silentLogger(),
      now: () => clock,
    });

    assert.equal(breaker.isOpen({ credentialId: 'cred-1' }), false);
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), 0);

    breaker.recordFailure({ credentialId: 'cred-1', category: 'rate_limit' });

    assert.equal(breaker.isOpen({ credentialId: 'cred-1' }), true);
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), 30000);

    clock += 29999;
    assert.equal(breaker.isOpen({ credentialId: 'cred-1' }), true);
    clock += 1;
    assert.equal(breaker.isOpen({ credentialId: 'cred-1' }), false);
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), 0);
  });

  test('consecutive failures grow the cooldown exponentially and cap it', () => {
    let clock = 0;
    const breaker = createAiCircuitBreaker({
      environment: breakerEnvironment(100, 400),
      logger: silentLogger(),
      now: () => clock,
    });

    const observed = [];
    for (let failure = 1; failure <= 5; failure += 1) {
      breaker.recordFailure({ credentialId: 'cred-1', category: 'provider_unavailable' });
      observed.push(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }));
      clock += breaker.cooldownRemainingMs({ credentialId: 'cred-1' }) + 1;
    }

    assert.deepEqual(observed, [100, 200, 400, 400, 400]);
  });

  test('availability categories are the only ones that open the breaker', () => {
    let clock = 0;
    const breaker = createAiCircuitBreaker({
      environment: breakerEnvironment(5000, 60000),
      logger: silentLogger(),
      now: () => clock,
    });

    for (const category of AI_CIRCUIT_BREAKER_CATEGORIES) {
      breaker.recordFailure({ credentialId: `cred-${category}`, category });
      assert.equal(breaker.isOpen({ credentialId: `cred-${category}` }), true);
    }

    for (const category of ['authentication', 'model_unavailable', 'invalid_request', 'content_policy', 'unknown']) {
      breaker.recordFailure({ credentialId: 'cred-config', category });
      assert.equal(breaker.isOpen({ credentialId: 'cred-config' }), false);
      assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-config' }), 0);
    }
  });

  test('config-style failures neither open nor reset an already open breaker', () => {
    let clock = 0;
    const breaker = createAiCircuitBreaker({
      environment: breakerEnvironment(100, 400),
      logger: silentLogger(),
      now: () => clock,
    });

    breaker.recordFailure({ credentialId: 'cred-1', category: 'rate_limit' });
    breaker.recordFailure({ credentialId: 'cred-1', category: 'timeout' });
    const remainingBefore = breaker.cooldownRemainingMs({ credentialId: 'cred-1' });
    assert.equal(remainingBefore, 200);

    breaker.recordFailure({ credentialId: 'cred-1', category: 'authentication' });
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), remainingBefore);

    // The untouched failure streak survives: next availability failure jumps
    // to the third-step cooldown instead of restarting at the base.
    clock += remainingBefore + 1;
    breaker.recordFailure({ credentialId: 'cred-1', category: 'network' });
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), 400);
  });

  test('recordSuccess clears state so the next failure restarts at the base cooldown', () => {
    let clock = 0;
    const breaker = createAiCircuitBreaker({
      environment: breakerEnvironment(100, 400),
      logger: silentLogger(),
      now: () => clock,
    });

    breaker.recordFailure({ credentialId: 'cred-1', category: 'quota_exhausted' });
    breaker.recordFailure({ credentialId: 'cred-1', category: 'network' });
    assert.equal(breaker.isOpen({ credentialId: 'cred-1' }), true);

    breaker.recordSuccess({ credentialId: 'cred-1' });
    assert.equal(breaker.isOpen({ credentialId: 'cred-1' }), false);
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), 0);

    breaker.recordFailure({ credentialId: 'cred-1', category: 'timeout' });
    assert.equal(breaker.cooldownRemainingMs({ credentialId: 'cred-1' }), 100);
  });

  test('orchestrator skips a candidate whose breaker is open and still succeeds on the fallback', async () => {
    const setup = baseSetup();
    const providersUsed = [];
    const breaker = createAiCircuitBreaker({
      environment: setup.environment,
      logger: silentLogger(),
    });
    breaker.recordFailure({ credentialId: 'c-1', category: 'rate_limit' });

    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      breaker,
      sendCompletion: async ({ provider }) => {
        providersUsed.push(provider);
        return { choices: [{ message: { content: 'ok' } }] };
      },
    });

    const result = await orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options });

    assert.equal(providersUsed.length, 1); // only candidate 2 dispatched
    assert.equal(providersUsed[0], 'anthropic');
    assert.equal(result.response.choices[0].message.content, 'ok');
    assert.equal(models.AiUsageEvent.events.length, 1); // no event for the skipped candidate
    assert.equal(models.AiUsageEvent.events[0].credentialId, 'c-2');
    assert.equal(models.AiUsageEvent.events[0].success, true);
  });

  test('orchestrator throws AI_ROUTE_CIRCUIT_OPEN without dispatching when every candidate is cooling down', async () => {
    const setup = baseSetup();
    let dispatches = 0;
    const breaker = createAiCircuitBreaker({
      environment: setup.environment,
      logger: silentLogger(),
    });
    breaker.recordFailure({ credentialId: 'c-1', category: 'rate_limit' });
    breaker.recordFailure({ credentialId: 'c-2', category: 'timeout' });

    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      breaker,
      sendCompletion: async () => {
        dispatches += 1;
        return {};
      },
    });

    await assert.rejects(
      () => orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options }),
      (error) => error instanceof AiAutoRouteError && error.code === 'AI_ROUTE_CIRCUIT_OPEN'
    );
    assert.equal(dispatches, 0);
    assert.equal(models.AiUsageEvent.events.length, 0);
  });

  test('orchestrator records breaker failures for availability errors and success resets them', async () => {
    const setup = baseSetup();
    let calls = 0;
    const breaker = createAiCircuitBreaker({
      environment: setup.environment,
      logger: silentLogger(),
    });

    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      breaker,
      sendCompletion: async () => {
        calls += 1;
        if (calls === 1) {
          const error = new Error('slow down');
          error.status = 429;
          throw error;
        }
        if (calls === 2) {
          // Retry within the same candidate while its breaker is open is fine:
          // the skip check happens per candidate, not per attempt.
          return { choices: [{ message: { content: 'recovered' } }] };
        }
        throw new Error('unexpected extra dispatch');
      },
    });

    const result = await orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options });
    assert.equal(result.response.choices[0].message.content, 'recovered');
    assert.equal(calls, 2);
    assert.equal(breaker.isOpen({ credentialId: 'c-1' }), false); // success cleared it

    // A follow-up request goes straight back to candidate 1 (no lingering skip).
    calls = 0;
    const second = await orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options });
    assert.equal(second.response.choices[0].message.content, 'recovered');
    assert.equal(calls, 2);
  });
});
