// server/services/aiModelAccessService.js
// Resolves which AI models a user may see and manually select, based on the
// tier entitlement, any active per-user override, and the enabled model
// catalog. Enforcement fails open while no catalog entries are enabled so
// deployments that have not curated the control plane keep legacy behaviour.
const {
  DEFAULT_FREE_ENTITLEMENT,
  buildModelAccess,
  resolveEntitlement,
} = require('./AiPolicyResolver');

function providerAlias(provider) {
  const value = String(provider || '').toLowerCase();
  if (value === 'google' || value === 'gemini') return 'google';
  return value;
}

function isActiveOverride(override, now = new Date()) {
  return Boolean(
    override
    && override.enabled !== false
    && (!override.expiresAt || new Date(override.expiresAt) > now)
  );
}

function createAiModelAccessService(deps = {}) {
  const AiTierEntitlement = deps.AiTierEntitlement;
  const AiUserOverride = deps.AiUserOverride;
  const AiModelCatalog = deps.AiModelCatalog;

  async function loadContext(user) {
    const tier = String(user?.subscriptionTier || 'free');
    const [entitlements, overrides, catalog] = await Promise.all([
      AiTierEntitlement.find({}).lean(),
      AiUserOverride.find({}).lean(),
      AiModelCatalog.find({ enabled: true }).lean(),
    ]);

    const entitlement = resolveEntitlement(entitlements, tier)
      || { ...DEFAULT_FREE_ENTITLEMENT };
    const override = overrides.find(
      (candidate) => (
        String(candidate.userId) === String(user._id || user.userId)
        && isActiveOverride(candidate)
      )
    ) || null;

    return { tier, entitlement, override, catalog };
  }

  // Visible manual models for a user. Empty catalog means the control plane
  // has not been curated yet; the caller decides how to treat that.
  async function listAllowedModelsForUser(user) {
    const { entitlement, override, catalog } = await loadContext(user);
    const access = buildModelAccess(entitlement, override);

    const models = (catalog || [])
      .filter(access)
      .map((model) => ({
        id: String(model._id),
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.displayName,
        autoEligible: model.autoEligible !== false,
      }));

    const effectiveEntitlement = override?.allowAuto === undefined
      ? entitlement
      : { ...entitlement, allowAuto: Boolean(override.allowAuto) };

    return {
      allowAuto: effectiveEntitlement.allowAuto !== false,
      catalogConfigured: (catalog || []).length > 0,
      models,
    };
  }

  // Server-side gate for manual selections saved on a bot.
  async function isModelAllowedForUser(user, provider, modelId, options = {}) {
    if (options.bypass) return { allowed: true, reason: 'bypass' };

    const { catalog } = await loadContext(user);
    if (!catalog || catalog.length === 0) {
      // Legacy fail-open until the catalog is curated by an admin.
      return { allowed: true, reason: 'catalog_not_configured' };
    }

    const accessResult = await listAllowedModelsForUser(user);
    const wantedProvider = providerAlias(provider);
    const wantedModel = String(modelId || '');

    const match = accessResult.models.find((model) => (
      providerAlias(model.provider) === wantedProvider
      && model.modelId === wantedModel
    ));

    return match
      ? { allowed: true, reason: 'allowed', model: match }
      : { allowed: false, reason: 'model_not_entitled' };
  }

  return {
    listAllowedModelsForUser,
    isModelAllowedForUser,
    _internals: { isActiveOverride, providerAlias },
  };
}

module.exports = {
  createAiModelAccessService,
  providerAlias,
};
