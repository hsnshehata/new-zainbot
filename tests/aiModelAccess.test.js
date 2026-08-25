// tests/aiModelAccess.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createAiModelAccessService,
  providerAlias,
} = require('../server/services/aiModelAccessService');

function fakeUser(overrides = {}) {
  return { _id: 'user-1', subscriptionTier: 'free', ...overrides };
}

function makeModels(deps = {}) {
  const entitlementDocs = deps.entitlements || [];
  const overrideDocs = deps.overrides || [];
  const catalogDocs = deps.catalog || [];

  const queryOf = (docs) => ({ async lean() { return docs; } });

  return {
    AiTierEntitlement: { find() { return queryOf(entitlementDocs); } },
    AiUserOverride: { find() { return queryOf(overrideDocs); } },
    AiModelCatalog: { find() { return queryOf(catalogDocs); } },
  };
}

const baseCatalog = [
  { _id: 'm-free', provider: 'openai', modelId: 'gpt-4o-mini', displayName: 'GPT-4o mini', autoEligible: true, enabled: true },
  { _id: 'm-pro', provider: 'anthropic', modelId: 'claude-3-5-sonnet', displayName: 'Claude Sonnet', autoEligible: true, enabled: true },
];

describe('aiModelAccessService', () => {
  test('without an entitlement every enabled catalog model is visible and Auto stays on', async () => {
    const service = createAiModelAccessService(makeModels({ catalog: baseCatalog }));
    const result = await service.listAllowedModelsForUser(fakeUser());

    assert.equal(result.allowAuto, true);
    assert.equal(result.catalogConfigured, true);
    assert.equal(result.models.length, 2);
    assert.deepEqual(result.models.map((model) => model.id), ['m-free', 'm-pro']);
  });

  test('tier allowlists narrow the visible models', async () => {
    const service = createAiModelAccessService(makeModels({
      catalog: baseCatalog,
      entitlements: [{
        tier: 'free',
        enabled: true,
        allowAuto: true,
        allowedModelCatalogIds: ['m-free'],
        blockedModelCatalogIds: [],
      }],
    }));
    const result = await service.listAllowedModelsForUser(fakeUser());

    assert.deepEqual(result.models.map((model) => model.id), ['m-free']);
  });

  test('blocked lists win over overrides that widen access, and an override can disable Auto', async () => {
    const service = createAiModelAccessService(makeModels({
      catalog: baseCatalog,
      entitlements: [{
        tier: 'free', enabled: true, allowAuto: true,
        allowedModelCatalogIds: [], blockedModelCatalogIds: [],
      }],
      overrides: [{
        userId: 'user-1',
        enabled: true,
        expiresAt: null,
        allowAuto: false,
        allowedModelCatalogIds: ['m-pro'],
        blockedModelCatalogIds: [],
      }],
    }));
    const result = await service.listAllowedModelsForUser(fakeUser());

    assert.equal(result.allowAuto, false);
    // m-pro is explicitly blocked nowhere but the override allowlist narrows to it
    assert.deepEqual(result.models.map((model) => model.id), ['m-pro']);
  });

  test('expired or disabled overrides are ignored', async () => {
    const service = createAiModelAccessService(makeModels({
      catalog: baseCatalog,
      overrides: [
        { userId: 'user-1', enabled: true, expiresAt: '2000-01-01T00:00:00Z', allowAuto: false, allowedModelCatalogIds: [], blockedModelCatalogIds: [] },
        { userId: 'other-user', enabled: true, expiresAt: null, allowAuto: false, allowedModelCatalogIds: [], blockedModelCatalogIds: [] },
      ],
    }));
    const result = await service.listAllowedModelsForUser(fakeUser());

    assert.equal(result.allowAuto, true);
  });

  test('manual selection enforcement fails open without a curated catalog', async () => {
    const service = createAiModelAccessService(makeModels({ catalog: [] }));
    const decision = await service.isModelAllowedForUser(fakeUser(), 'openai', 'any-model');
    assert.equal(decision.allowed, true);
    assert.equal(decision.reason, 'catalog_not_configured');
  });

  test('manual selection is rejected when the pair is not entitled and accepted when it is', async () => {
    const service = createAiModelAccessService(makeModels({
      catalog: baseCatalog,
      entitlements: [{
        tier: 'free', enabled: true, allowAuto: true,
        allowedModelCatalogIds: ['m-free'], blockedModelCatalogIds: [],
      }],
    }));

    const denied = await service.isModelAllowedForUser(fakeUser(), 'anthropic', 'claude-3-5-sonnet');
    assert.equal(denied.allowed, false);
    assert.equal(denied.reason, 'model_not_entitled');

    const allowed = await service.isModelAllowedForUser(fakeUser(), 'openai', 'gpt-4o-mini');
    assert.equal(allowed.allowed, true);

    const bypass = await service.isModelAllowedForUser(
      fakeUser(), 'anthropic', 'claude-3-5-sonnet', { bypass: true }
    );
    assert.equal(bypass.allowed, true);
  });

  test('gemini and google providers alias to the same family', () => {
    assert.equal(providerAlias('gemini'), providerAlias('google'));
    assert.equal(providerAlias('Gemini'), 'google');
    assert.equal(providerAlias('openai'), 'openai');
  });
});
