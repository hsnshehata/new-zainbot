// tests/aiCompletionOrchestrator.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  AiAutoRouteError,
  createAiCompletionOrchestrator,
} = require('../server/services/aiCompletionOrchestrator');
const { encryptCredentialSecret } = require('../server/services/AiCredentialCrypto');

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
      step('mini', credentials[0]._id),     // openai -> openai credential
      step('sonnet', credentials[1]._id),   // anthropic -> anthropic credential
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

describe('aiCompletionOrchestrator', () => {
  test('routes through the policy candidates, returns the response, and records success usage', async () => {
    const setup = baseSetup();
    let calls = 0;
    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      sendCompletion: async ({ provider, modelId }) => {
        calls += 1;
        assert.equal(provider, 'openai');
        assert.equal(modelId, 'gpt-4o-mini');
        return { choices: [{ message: { content: 'hello' } }], usage: { prompt_tokens: 11, completion_tokens: 7 } };
      },
    });

    const result = await orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options });
    assert.equal(calls, 1);
    assert.equal(result.response.choices[0].message.content, 'hello');
    assert.equal(result.resolution.tier, 'free');

    assert.equal(models.AiUsageEvent.events.length, 1);
    const event = models.AiUsageEvent.events[0];
    assert.equal(event.success, true);
    assert.equal(event.inputTokens, 11);
    assert.equal(event.outputTokens, 7);
    assert.equal(event.fallbackUsed, false);
  });

  test('retries a retryable failure within maxAttempts and moves on with fallbackUsed afterwards', async () => {
    const setup = baseSetup();
    let calls = 0;
    const outcomes = ['fail-timeout', 'fail-rate-limit', 'ok'];
    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      sendCompletion: async ({ provider }) => {
        calls += 1;
        if (calls === 1) {
          const error = new Error('boom');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        if (calls === 2) {
          const error = new Error('slow down');
          error.status = 429;
          assert.equal(provider, 'openai');
          throw error;
        }
        // Third call lands on the second candidate
        assert.equal(provider, 'anthropic');
        return { choices: [{ message: { content: 'ok' } }] };
      },
    });

    const result = await orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options });
    assert.equal(result.response.choices[0].message.content, 'ok');

    assert.equal(models.AiUsageEvent.events.length, 3);
    assert.equal(models.AiUsageEvent.events[0].success, false);
    assert.equal(models.AiUsageEvent.events[0].errorClass, 'timeout');
    assert.equal(models.AiUsageEvent.events[1].errorClass, 'rate_limit');
    assert.equal(models.AiUsageEvent.events[1].fallbackUsed, false); // same candidate retry
    assert.equal(models.AiUsageEvent.events[2].success, true);
    assert.equal(models.AiUsageEvent.events[2].fallbackUsed, true); // second candidate
    assert.deepEqual(models.AiUsageEvent.events.map((e) => e.attempt), [1, 2, 3]);
  });

  test('a non-retryable authentication failure skips straight to the next candidate', async () => {
    const setup = baseSetup();
    let calls = 0;
    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      sendCompletion: async () => {
        calls += 1;
        const error = new Error('bad key');
        error.status = 401;
        throw error;
      },
    });

    await assert.rejects(
      () => orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options }),
      (error) => error instanceof AiAutoRouteError && error.code === 'AI_ROUTE_EXHAUSTED'
    );

    assert.equal(calls, 2); // one per candidate, no retries
    assert.equal(models.AiUsageEvent.events.every((event) => event.success === false), true);
    assert.equal(models.AiUsageEvent.events[1].fallbackUsed, true);
  });

  test('an empty control plane degrades with AI_AUTO_NOT_CONFIGURED and never dispatches', async () => {
    const setup = baseSetup();
    let dispatched = false;
    const models = makeModels({});

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      sendCompletion: async () => { dispatched = true; return {}; },
    });

    await assert.rejects(
      () => orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options }),
      (error) => error.code === 'AI_AUTO_NOT_CONFIGURED'
    );
    assert.equal(dispatched, false);
  });

  test('a tier without Auto entitlement is rejected before any dispatch', async () => {
    const setup = baseSetup();
    let dispatched = false;
    const models = makeModels({
      policies: autoPolicy(setup),
      catalog: setup.catalog,
      credentials: setup.credentials,
      entitlements: [{
        tier: 'free', enabled: true, allowAuto: false,
        allowedModelCatalogIds: [], blockedModelCatalogIds: [],
      }],
    });

    const orchestrator = createAiCompletionOrchestrator({
      models,
      environment: setup.environment,
      userLoader: async () => setup.user,
      sendCompletion: async () => { dispatched = true; return {}; },
    });

    await assert.rejects(
      () => orchestrator.runAutoCompletion({ bot: setup.bot, options: setup.options }),
      (error) => error.code === 'AI_AUTO_NOT_CONFIGURED'
    );
    assert.equal(dispatched, false);
  });
});
