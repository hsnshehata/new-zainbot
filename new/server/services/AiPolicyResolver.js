const SCOPE_PRECEDENCE = Object.freeze(['user', 'bot', 'tier', 'global']);
const DEFAULT_FREE_ENTITLEMENT = Object.freeze({
  tier: 'free',
  enabled: true,
  allowAuto: true,
  allowedModelCatalogIds: Object.freeze([]),
  blockedModelCatalogIds: Object.freeze([]),
  requiredCapabilities: Object.freeze(['text_input', 'text_output']),
  maxFallbackSteps: 3,
  dailyRequestLimit: null,
  monthlyRequestLimit: null,
});

class AiPolicyResolutionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AiPolicyResolutionError';
    this.code = code;
    this.details = details;
  }
}

function toPlain(value) {
  if (!value) {
    return value;
  }
  if (typeof value.toObject === 'function') {
    return value.toObject({ transform: false, virtuals: false });
  }
  return value;
}

function idOf(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object' && value._id) {
    return String(value._id);
  }
  return String(value);
}

function isCurrentlyActive(value, now) {
  const item = toPlain(value);
  if (!item || item.enabled === false) {
    return false;
  }
  if (item.effectiveFrom && new Date(item.effectiveFrom) > now) {
    return false;
  }
  if (item.effectiveUntil && new Date(item.effectiveUntil) <= now) {
    return false;
  }
  if (item.expiresAt && new Date(item.expiresAt) <= now) {
    return false;
  }
  return true;
}

function capabilitiesInclude(model, requiredCapabilities) {
  const available = new Set(model.capabilities || []);
  return (requiredCapabilities || []).every((capability) => available.has(capability));
}

function resolveEntitlement(entitlements, tier) {
  const all = (entitlements || []).map(toPlain);
  const exact = all.find(
    (entitlement) => entitlement.tier === tier && entitlement.enabled !== false
  );
  if (exact) {
    return exact;
  }
  const configuredFree = all.find(
    (entitlement) => entitlement.tier === 'free' && entitlement.enabled !== false
  );
  return configuredFree || DEFAULT_FREE_ENTITLEMENT;
}

function findActiveOverride(overrides, userId, now) {
  const candidates = (Array.isArray(overrides) ? overrides : [overrides])
    .filter(Boolean)
    .map(toPlain)
    .filter((override) => idOf(override.userId) === idOf(userId))
    .filter((override) => isCurrentlyActive(override, now));
  candidates.sort((left, right) => (
    new Date(right.updatedAt || right.createdAt || 0)
      - new Date(left.updatedAt || left.createdAt || 0)
  ));
  return candidates[0] || null;
}

function policyMatchesScope(policy, scopeType, context) {
  if (policy.scopeType !== scopeType) {
    return false;
  }
  if (scopeType === 'global') {
    return policy.scopeKey === 'global' || policy.scopeKey === '';
  }
  const expected = {
    user: context.userId,
    bot: context.botId,
    tier: context.tier,
  }[scopeType];
  return Boolean(expected) && String(policy.scopeKey) === String(expected);
}

function policyMatchesUseCase(policy, useCase) {
  return policy.useCase === useCase || policy.useCase === 'general';
}

function selectPolicy(policies, context, explicitPolicyId, now) {
  const active = (policies || [])
    .map(toPlain)
    .filter((policy) => isCurrentlyActive(policy, now))
    .filter((policy) => policyMatchesUseCase(policy, context.useCase));

  if (explicitPolicyId) {
    const explicit = active.find((policy) => idOf(policy) === idOf(explicitPolicyId));
    if (!explicit) {
      throw new AiPolicyResolutionError(
        'AI_OVERRIDE_POLICY_UNAVAILABLE',
        'The user override references an unavailable routing policy'
      );
    }
    return { policy: explicit, source: 'user_override' };
  }

  for (const scopeType of SCOPE_PRECEDENCE) {
    const scoped = active
      .filter((policy) => policyMatchesScope(policy, scopeType, context))
      .sort((left, right) => {
        const byPriority = Number(right.priority || 0) - Number(left.priority || 0);
        if (byPriority !== 0) {
          return byPriority;
        }
        return new Date(right.updatedAt || right.createdAt || 0)
          - new Date(left.updatedAt || left.createdAt || 0);
      });
    if (scoped.length > 0) {
      return { policy: scoped[0], source: scopeType };
    }
  }

  throw new AiPolicyResolutionError(
    'AI_POLICY_NOT_FOUND',
    'No active AI routing policy matches this request',
    { tier: context.tier, useCase: context.useCase }
  );
}

function buildModelAccess(entitlement, override) {
  const entitlementAllowed = new Set(
    (entitlement.allowedModelCatalogIds || []).map(idOf).filter(Boolean)
  );
  const overrideAllowed = new Set(
    (override?.allowedModelCatalogIds || []).map(idOf).filter(Boolean)
  );
  const blocked = new Set([
    ...(entitlement.blockedModelCatalogIds || []).map(idOf),
    ...(override?.blockedModelCatalogIds || []).map(idOf),
  ].filter(Boolean));

  return (model) => {
    const modelId = idOf(model);
    if (blocked.has(modelId)) {
      return false;
    }
    if (entitlementAllowed.size > 0 && !entitlementAllowed.has(modelId)) {
      return false;
    }
    if (overrideAllowed.size > 0 && !overrideAllowed.has(modelId)) {
      return false;
    }
    return true;
  };
}

function providersMatch(modelProvider, credentialProvider) {
  const aliases = {
    google: 'google',
    gemini: 'google',
  };
  return (aliases[modelProvider] || modelProvider)
    === (aliases[credentialProvider] || credentialProvider);
}

function buildCredentialAccess(credentials) {
  if (credentials === undefined || credentials === null) {
    return () => true;
  }
  const byId = new Map(
    (credentials || []).map(toPlain).map((credential) => [
      idOf(credential),
      credential,
    ])
  );
  return (credentialId, modelProvider) => {
    const credential = byId.get(idOf(credentialId));
    return Boolean(
      credential
      && credential.status === 'active'
      && providersMatch(modelProvider, credential.provider)
    );
  };
}

function sortAutoModels(models, preferredModelCatalogId) {
  const preferred = idOf(preferredModelCatalogId);
  return [...models].sort((left, right) => {
    const leftPreferred = idOf(left) === preferred ? 0 : 1;
    const rightPreferred = idOf(right) === preferred ? 0 : 1;
    if (leftPreferred !== rightPreferred) {
      return leftPreferred - rightPreferred;
    }
    const priority = Number(left.autoPriority ?? 100)
      - Number(right.autoPriority ?? 100);
    if (priority !== 0) {
      return priority;
    }
    return `${left.provider}:${left.modelId}`
      .localeCompare(`${right.provider}:${right.modelId}`);
  });
}

function candidateFrom(model, step, credentialId, sourceStep) {
  return {
    modelCatalogId: idOf(model),
    provider: model.provider,
    modelId: model.modelId,
    credentialId: idOf(credentialId),
    maxAttempts: Math.max(1, Math.min(3, Number(step.maxAttempts || 1))),
    timeoutMs: Math.max(1000, Math.min(120000, Number(step.timeoutMs || 30000))),
    fallbackOn: [...(step.fallbackOn || [])],
    sourceStep,
  };
}

function buildCandidates({
  policy,
  catalog,
  entitlement,
  override,
  requiredCapabilities,
  credentials,
}) {
  const models = (catalog || [])
    .map(toPlain)
    .filter((model) => model && model.enabled !== false);
  const modelById = new Map(models.map((model) => [idOf(model), model]));
  const canUseModel = buildModelAccess(entitlement, override);
  const canUseCredential = buildCredentialAccess(credentials);
  const entitlementCapabilities = entitlement.requiredCapabilities || [];
  const requestCapabilities = [
    ...new Set([
      ...entitlementCapabilities,
      ...(requiredCapabilities || []),
    ]),
  ];
  const candidates = [];
  const seen = new Set();

  const addCandidate = (model, step, credentialId, sourceStep) => {
    if (
      !model
      || !credentialId
      || !canUseModel(model)
      || !canUseCredential(credentialId, model.provider)
    ) {
      return;
    }
    const capabilities = [
      ...new Set([
        ...requestCapabilities,
        ...(step.requiredCapabilities || []),
      ]),
    ];
    if (!capabilitiesInclude(model, capabilities)) {
      return;
    }
    const candidate = candidateFrom(model, step, credentialId, sourceStep);
    const key = `${candidate.modelCatalogId}:${candidate.credentialId}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  };

  const orderedSteps = [...(policy.steps || [])]
    .sort((left, right) => Number(left.order) - Number(right.order));

  if (override?.routingMode === 'fixed' && override.modelCatalogId) {
    const model = modelById.get(idOf(override.modelCatalogId));
    const inheritedCredential = override.credentialId || orderedSteps[0]?.credentialId;
    addCandidate(
      model,
      { ...orderedSteps[0], selector: 'fixed' },
      inheritedCredential,
      'user_override'
    );
  }

  for (const step of orderedSteps) {
    const credentialId = override?.credentialId || step.credentialId;
    const selector = step.selector
      || (policy.selectionMode === 'auto' ? 'auto' : 'fixed');

    if (selector === 'fixed') {
      addCandidate(
        modelById.get(idOf(step.modelCatalogId)),
        step,
        credentialId,
        Number(step.order)
      );
      continue;
    }

    if (entitlement.allowAuto === false) {
      continue;
    }
    const autoModels = models.filter((model) => (
      model.autoEligible !== false
      && (!step.provider || model.provider === step.provider)
    ));
    for (const model of sortAutoModels(
      autoModels,
      step.preferredModelCatalogId
    )) {
      addCandidate(model, step, credentialId, Number(step.order));
    }
  }

  return candidates.slice(0, Number(entitlement.maxFallbackSteps || 3));
}

function resolveAiPolicy(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
  const userId = idOf(input.userId || input.user?._id || input.user?.id);
  const botId = idOf(input.botId || input.bot?._id || input.bot?.id);
  if (!userId) {
    throw new AiPolicyResolutionError(
      'AI_POLICY_USER_REQUIRED',
      'A user is required to resolve AI routing'
    );
  }

  const override = findActiveOverride(input.overrides, userId, now);
  const tier = override?.tierOverride || input.tier || input.user?.subscriptionTier || 'free';
  const entitlement = resolveEntitlement(input.entitlements, tier);
  const useCase = input.useCase || 'general';
  const { policy, source } = selectPolicy(
    input.policies,
    { userId, botId, tier, useCase },
    override?.policyId,
    now
  );

  const selectionMode = override?.routingMode
    && override.routingMode !== 'inherit'
    ? override.routingMode
    : policy.selectionMode;

  if (selectionMode === 'auto' && entitlement.allowAuto === false) {
    throw new AiPolicyResolutionError(
      'AI_AUTO_NOT_ENTITLED',
      'Automatic model selection is disabled for this tier',
      { tier }
    );
  }

  const candidates = buildCandidates({
    policy: { ...policy, selectionMode },
    catalog: input.catalog,
    entitlement,
    override,
    requiredCapabilities: input.requiredCapabilities,
    credentials: input.credentials,
  });
  if (candidates.length === 0) {
    throw new AiPolicyResolutionError(
      'AI_ROUTE_UNAVAILABLE',
      'No enabled and entitled model route is available',
      { tier, policyId: idOf(policy) }
    );
  }

  return {
    tier,
    useCase,
    selectionMode,
    source,
    policyId: idOf(policy),
    overrideId: idOf(override),
    entitlement: {
      tier: entitlement.tier,
      allowAuto: entitlement.allowAuto !== false,
      maxFallbackSteps: Number(entitlement.maxFallbackSteps || 3),
      dailyRequestLimit: entitlement.dailyRequestLimit ?? null,
      monthlyRequestLimit: entitlement.monthlyRequestLimit ?? null,
    },
    candidates,
  };
}

function extractStatus(error) {
  const value = error?.status
    ?? error?.statusCode
    ?? error?.response?.status;
  const status = Number(value);
  return Number.isInteger(status) ? status : null;
}

function normalizedErrorCode(error) {
  return String(
    error?.code
    || error?.error?.code
    || error?.response?.data?.error?.code
    || ''
  ).trim().toLowerCase();
}

function classifyAiProviderError(error) {
  const status = extractStatus(error);
  const code = normalizedErrorCode(error);
  const name = String(error?.name || '').toLowerCase();
  const timeout = code === 'etimedout'
    || code === 'econnaborted'
    || code === 'abort_err'
    || name.includes('timeout')
    || name === 'aborterror'
    || status === 408;
  if (timeout) {
    return {
      category: 'timeout',
      status,
      code: code || 'timeout',
      retryable: true,
      canFallback: true,
    };
  }

  if (['econnreset', 'econnrefused', 'enotfound', 'eai_again'].includes(code)) {
    return {
      category: 'network',
      status,
      code,
      retryable: true,
      canFallback: true,
    };
  }

  if (code.includes('insufficient_quota') || status === 402) {
    return {
      category: 'quota_exhausted',
      status,
      code: code || 'insufficient_quota',
      retryable: false,
      canFallback: true,
    };
  }

  if (status === 429 || code.includes('rate_limit')) {
    return {
      category: 'rate_limit',
      status,
      code: code || 'rate_limit',
      retryable: true,
      canFallback: true,
    };
  }

  if (status && status >= 500) {
    return {
      category: 'provider_unavailable',
      status,
      code: code || 'provider_server_error',
      retryable: true,
      canFallback: true,
    };
  }

  if (status === 401 || status === 403 || code.includes('auth')) {
    return {
      category: 'authentication',
      status,
      code: code || 'authentication',
      retryable: false,
      canFallback: true,
    };
  }

  if (status === 404 || code.includes('model_not_found')) {
    return {
      category: 'model_unavailable',
      status,
      code: code || 'model_not_found',
      retryable: false,
      canFallback: true,
    };
  }

  if (code.includes('content_filter') || code.includes('content_policy')) {
    return {
      category: 'content_policy',
      status,
      code,
      retryable: false,
      canFallback: false,
    };
  }

  if (status === 400 || status === 422 || code.includes('invalid')) {
    return {
      category: 'invalid_request',
      status,
      code: code || 'invalid_request',
      retryable: false,
      canFallback: false,
    };
  }

  return {
    category: 'unknown',
    status,
    code: code || 'unknown',
    retryable: false,
    canFallback: true,
  };
}

function shouldRetryAiProviderError(error, attempt, maxAttempts) {
  const classification = classifyAiProviderError(error);
  return classification.retryable
    && Number(attempt) < Math.max(1, Number(maxAttempts || 1));
}

module.exports = {
  SCOPE_PRECEDENCE,
  DEFAULT_FREE_ENTITLEMENT,
  AiPolicyResolutionError,
  resolveEntitlement,
  resolveAiPolicy,
  classifyAiProviderError,
  shouldRetryAiProviderError,
};
