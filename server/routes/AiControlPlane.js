const express = require('express');
const mongoose = require('mongoose');

const AiCredential = require('../models/AiCredential');
const AiModelCatalog = require('../models/AiModelCatalog');
const AiRoutingPolicy = require('../models/AiRoutingPolicy');
const AiTierEntitlement = require('../models/AiTierEntitlement');
const AiUserOverride = require('../models/AiUserOverride');
const AiUsageEvent = require('../models/AiUsageEvent');
const {
  AiCredentialCryptoError,
  buildCredentialContext,
  encryptCredentialSecret,
} = require('../services/AiCredentialCrypto');

const CREDENTIAL_PRIVATE_FIELDS = Object.freeze([
  'secret',
  'secretCiphertext',
  'secretIv',
  'secretAuthTag',
  'encryptionKeyId',
]);

const CREDENTIAL_CREATE_FIELDS = Object.freeze([
  'name',
  'provider',
  'baseUrl',
  'status',
  'labels',
]);
const CREDENTIAL_UPDATE_FIELDS = Object.freeze([
  'name',
  'baseUrl',
  'status',
  'labels',
]);
const MODEL_CREATE_FIELDS = Object.freeze([
  'provider',
  'modelId',
  'displayName',
  'description',
  'capabilities',
  'enabled',
  'autoEligible',
  'autoPriority',
  'contextWindow',
  'maxOutputTokens',
  'tags',
]);
const MODEL_UPDATE_FIELDS = Object.freeze(
  MODEL_CREATE_FIELDS.filter((field) => !['provider', 'modelId'].includes(field))
);
const POLICY_FIELDS = Object.freeze([
  'name',
  'scopeType',
  'scopeKey',
  'useCase',
  'selectionMode',
  'priority',
  'enabled',
  'effectiveFrom',
  'effectiveUntil',
  'steps',
]);
const TIER_FIELDS = Object.freeze([
  'enabled',
  'allowAuto',
  'allowedModelCatalogIds',
  'blockedModelCatalogIds',
  'requiredCapabilities',
  'maxFallbackSteps',
  'dailyRequestLimit',
  'monthlyRequestLimit',
]);
const OVERRIDE_FIELDS = Object.freeze([
  'enabled',
  'tierOverride',
  'routingMode',
  'policyId',
  'modelCatalogId',
  'credentialId',
  'allowedModelCatalogIds',
  'blockedModelCatalogIds',
  'expiresAt',
  'reason',
]);

function pick(source, fields) {
  const output = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source || {}, field)) {
      output[field] = source[field];
    }
  }
  return output;
}

function toSafeObject(value) {
  if (!value) {
    return value;
  }
  const result = typeof value.toObject === 'function'
    ? value.toObject({ transform: true, virtuals: false })
    : { ...value };
  for (const field of CREDENTIAL_PRIVATE_FIELDS) {
    delete result[field];
  }
  return result;
}

function safeCredential(value) {
  const result = toSafeObject(value);
  if (result) {
    result.hasSecret = true;
  }
  return result;
}

function requireDirectSuperadmin(req, res, next) {
  const actorRole = req.auth?.actorRole || req.user?.role;
  const actorUserId = req.auth?.actorUserId || req.user?.userId || req.user?._id;
  const subjectUserId = req.auth?.subjectUserId
    || req.user?.userId
    || req.user?._id;
  const isImpersonating = req.auth?.isImpersonating === true
    || (
      actorUserId
      && subjectUserId
      && String(actorUserId) !== String(subjectUserId)
    );

  if (
    actorRole !== 'superadmin'
    || !actorUserId
    || !subjectUserId
    || isImpersonating
  ) {
    return res.status(403).json({
      success: false,
      error: 'DIRECT_SUPERADMIN_REQUIRED',
      message: 'This action requires a direct superadmin session',
    });
  }
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise
    .resolve(handler(req, res, next))
    .catch(next);
}

function actorId(req) {
  return req.auth?.actorUserId || req.user?.userId || req.user?._id;
}

function boundedLimit(value, fallback = 50, maximum = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

function booleanQuery(value) {
  if (value === undefined) {
    return undefined;
  }
  return value === true || String(value).toLowerCase() === 'true';
}

function normalizePolicyInput(input) {
  const output = pick(input, POLICY_FIELDS);
  if (output.scopeType === 'global') {
    output.scopeKey = 'global';
  } else if (output.scopeType && !output.scopeKey) {
    const error = new Error('Non-global AI policies require scopeKey');
    error.statusCode = 400;
    error.code = 'AI_POLICY_SCOPE_KEY_REQUIRED';
    throw error;
  }
  if (Array.isArray(output.steps)) {
    output.steps = [...output.steps].sort(
      (left, right) => Number(left.order) - Number(right.order)
    );
  }
  return output;
}

function validateOverrideInput(input) {
  const output = pick(input, OVERRIDE_FIELDS);
  if (output.routingMode === 'fixed' && !output.modelCatalogId) {
    const error = new Error('Fixed AI user overrides require modelCatalogId');
    error.statusCode = 400;
    error.code = 'AI_OVERRIDE_MODEL_REQUIRED';
    throw error;
  }
  return output;
}

function createAuditEmitter(audit) {
  if (typeof audit !== 'function') {
    return async () => {};
  }
  return async (req, action, details) => {
    await audit({
      actorUserId: String(actorId(req)),
      action,
      resourceType: details.resourceType,
      resourceId: String(details.resourceId),
      changedFields: details.changedFields || [],
      requestId: req.requestId || null,
    });
  };
}

function changedFields(body, allowed) {
  const fields = allowed.filter((field) => (
    Object.prototype.hasOwnProperty.call(body || {}, field)
  ));
  if (Object.prototype.hasOwnProperty.call(body || {}, 'secret')) {
    fields.push('secret_rotated');
  }
  return fields;
}

function createAiControlPlaneRouter(options = {}) {
  const router = express.Router();
  const authenticate = options.authenticate
    || require('../middleware/authenticate');
  const Models = {
    AiCredential: options.models?.AiCredential || AiCredential,
    AiModelCatalog: options.models?.AiModelCatalog || AiModelCatalog,
    AiRoutingPolicy: options.models?.AiRoutingPolicy || AiRoutingPolicy,
    AiTierEntitlement: options.models?.AiTierEntitlement || AiTierEntitlement,
    AiUserOverride: options.models?.AiUserOverride || AiUserOverride,
    AiUsageEvent: options.models?.AiUsageEvent || AiUsageEvent,
  };
  const encryptSecret = options.encryptCredentialSecret
    || encryptCredentialSecret;
  const emitAudit = createAuditEmitter(options.audit);
  const environment = options.environment || process.env;

  if (typeof authenticate !== 'function') {
    throw new TypeError('createAiControlPlaneRouter requires authenticate middleware');
  }

  router.use(authenticate, requireDirectSuperadmin);

  router.get('/credentials', asyncRoute(async (req, res) => {
    const query = {};
    if (req.query.provider) {
      query.provider = String(req.query.provider);
    }
    if (req.query.status) {
      query.status = String(req.query.status);
    }
    const credentials = await Models.AiCredential
      .find(query)
      .sort({ provider: 1, name: 1 })
      .limit(boundedLimit(req.query.limit))
      .lean();
    return res.json({
      success: true,
      credentials: credentials.map(safeCredential),
    });
  }));

  router.post('/credentials', asyncRoute(async (req, res) => {
    const secret = req.body?.secret;
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const id = new mongoose.Types.ObjectId();
    const encrypted = encryptSecret(secret, {
      context: buildCredentialContext(id, provider),
      environment,
    });
    const userId = actorId(req);
    const credential = new Models.AiCredential({
      _id: id,
      ...pick(req.body, CREDENTIAL_CREATE_FIELDS),
      provider,
      ...encrypted,
      createdBy: userId,
      updatedBy: userId,
    });
    await credential.save();
    await emitAudit(req, 'ai.credential.created', {
      resourceType: 'AiCredential',
      resourceId: credential._id,
      changedFields: changedFields(req.body, CREDENTIAL_CREATE_FIELDS),
    });
    return res.status(201).json({
      success: true,
      credential: safeCredential(credential),
    });
  }));

  router.patch('/credentials/:id', asyncRoute(async (req, res) => {
    const credential = await Models.AiCredential
      .findById(req.params.id)
      .select('+secretCiphertext +secretIv +secretAuthTag +encryptionKeyId');
    if (!credential) {
      return res.status(404).json({
        success: false,
        error: 'AI_CREDENTIAL_NOT_FOUND',
      });
    }

    const requestedProvider = req.body?.provider
      ? String(req.body.provider).trim().toLowerCase()
      : credential.provider;
    if (
      requestedProvider !== credential.provider
      && !Object.prototype.hasOwnProperty.call(req.body || {}, 'secret')
    ) {
      return res.status(400).json({
        success: false,
        error: 'AI_CREDENTIAL_SECRET_REQUIRED',
        message: 'Changing provider requires a replacement secret',
      });
    }

    Object.assign(credential, pick(req.body, CREDENTIAL_UPDATE_FIELDS));
    credential.provider = requestedProvider;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'secret')) {
      Object.assign(credential, encryptSecret(req.body.secret, {
        context: buildCredentialContext(credential._id, requestedProvider),
        environment,
      }));
    }
    credential.updatedBy = actorId(req);
    await credential.save();
    await emitAudit(req, 'ai.credential.updated', {
      resourceType: 'AiCredential',
      resourceId: credential._id,
      changedFields: changedFields(
        req.body,
        [...CREDENTIAL_UPDATE_FIELDS, 'provider']
      ),
    });
    return res.json({
      success: true,
      credential: safeCredential(credential),
    });
  }));

  router.delete('/credentials/:id', asyncRoute(async (req, res) => {
    const credential = await Models.AiCredential.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: 'disabled',
          updatedBy: actorId(req),
        },
      },
      { new: true, runValidators: true }
    );
    if (!credential) {
      return res.status(404).json({
        success: false,
        error: 'AI_CREDENTIAL_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.credential.disabled', {
      resourceType: 'AiCredential',
      resourceId: credential._id,
      changedFields: ['status'],
    });
    return res.json({
      success: true,
      credential: safeCredential(credential),
    });
  }));

  router.get('/models', asyncRoute(async (req, res) => {
    const query = {};
    if (req.query.provider) {
      query.provider = String(req.query.provider);
    }
    const enabled = booleanQuery(req.query.enabled);
    if (enabled !== undefined) {
      query.enabled = enabled;
    }
    const autoEligible = booleanQuery(req.query.autoEligible);
    if (autoEligible !== undefined) {
      query.autoEligible = autoEligible;
    }
    const models = await Models.AiModelCatalog
      .find(query)
      .sort({ autoPriority: 1, provider: 1, modelId: 1 })
      .limit(boundedLimit(req.query.limit, 100, 200))
      .lean();
    return res.json({ success: true, models });
  }));

  router.post('/models', asyncRoute(async (req, res) => {
    const userId = actorId(req);
    const model = await Models.AiModelCatalog.create({
      ...pick(req.body, MODEL_CREATE_FIELDS),
      createdBy: userId,
      updatedBy: userId,
    });
    await emitAudit(req, 'ai.model.created', {
      resourceType: 'AiModelCatalog',
      resourceId: model._id,
      changedFields: changedFields(req.body, MODEL_CREATE_FIELDS),
    });
    return res.status(201).json({ success: true, model: toSafeObject(model) });
  }));

  router.patch('/models/:id', asyncRoute(async (req, res) => {
    const model = await Models.AiModelCatalog.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...pick(req.body, MODEL_UPDATE_FIELDS),
          updatedBy: actorId(req),
        },
      },
      { new: true, runValidators: true }
    );
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'AI_MODEL_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.model.updated', {
      resourceType: 'AiModelCatalog',
      resourceId: model._id,
      changedFields: changedFields(req.body, MODEL_UPDATE_FIELDS),
    });
    return res.json({ success: true, model: toSafeObject(model) });
  }));

  router.delete('/models/:id', asyncRoute(async (req, res) => {
    const model = await Models.AiModelCatalog.findByIdAndUpdate(
      req.params.id,
      { $set: { enabled: false, updatedBy: actorId(req) } },
      { new: true, runValidators: true }
    );
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'AI_MODEL_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.model.disabled', {
      resourceType: 'AiModelCatalog',
      resourceId: model._id,
      changedFields: ['enabled'],
    });
    return res.json({ success: true, model: toSafeObject(model) });
  }));

  router.get('/policies', asyncRoute(async (req, res) => {
    const query = {};
    for (const field of ['scopeType', 'scopeKey', 'useCase']) {
      if (req.query[field]) {
        query[field] = String(req.query[field]);
      }
    }
    const enabled = booleanQuery(req.query.enabled);
    if (enabled !== undefined) {
      query.enabled = enabled;
    }
    const policies = await Models.AiRoutingPolicy
      .find(query)
      .sort({ scopeType: 1, scopeKey: 1, priority: -1 })
      .limit(boundedLimit(req.query.limit, 100, 200))
      .lean();
    return res.json({ success: true, policies });
  }));

  router.post('/policies', asyncRoute(async (req, res) => {
    const userId = actorId(req);
    const policy = await Models.AiRoutingPolicy.create({
      ...normalizePolicyInput(req.body),
      createdBy: userId,
      updatedBy: userId,
    });
    await emitAudit(req, 'ai.policy.created', {
      resourceType: 'AiRoutingPolicy',
      resourceId: policy._id,
      changedFields: changedFields(req.body, POLICY_FIELDS),
    });
    return res.status(201).json({
      success: true,
      policy: toSafeObject(policy),
    });
  }));

  router.patch('/policies/:id', asyncRoute(async (req, res) => {
    const update = normalizePolicyInput(req.body);
    update.updatedBy = actorId(req);
    const policy = await Models.AiRoutingPolicy.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'AI_POLICY_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.policy.updated', {
      resourceType: 'AiRoutingPolicy',
      resourceId: policy._id,
      changedFields: changedFields(req.body, POLICY_FIELDS),
    });
    return res.json({ success: true, policy: toSafeObject(policy) });
  }));

  router.delete('/policies/:id', asyncRoute(async (req, res) => {
    const policy = await Models.AiRoutingPolicy.findByIdAndUpdate(
      req.params.id,
      { $set: { enabled: false, updatedBy: actorId(req) } },
      { new: true, runValidators: true }
    );
    if (!policy) {
      return res.status(404).json({
        success: false,
        error: 'AI_POLICY_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.policy.disabled', {
      resourceType: 'AiRoutingPolicy',
      resourceId: policy._id,
      changedFields: ['enabled'],
    });
    return res.json({ success: true, policy: toSafeObject(policy) });
  }));

  router.get('/tiers', asyncRoute(async (_req, res) => {
    const tiers = await Models.AiTierEntitlement.find({}).lean();
    const order = new Map(
      AiTierEntitlement.SUPPORTED_AI_TIERS.map((tier, index) => [tier, index])
    );
    tiers.sort((left, right) => (
      (order.get(left.tier) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right.tier) ?? Number.MAX_SAFE_INTEGER)
    ));
    return res.json({ success: true, tiers });
  }));

  router.put('/tiers/:tier', asyncRoute(async (req, res) => {
    const tierName = String(req.params.tier);
    if (!AiTierEntitlement.SUPPORTED_AI_TIERS.includes(tierName)) {
      return res.status(400).json({
        success: false,
        error: 'AI_TIER_INVALID',
      });
    }
    const userId = actorId(req);
    const tier = await Models.AiTierEntitlement.findOneAndUpdate(
      { tier: tierName },
      {
        $set: {
          ...pick(req.body, TIER_FIELDS),
          updatedBy: userId,
        },
        $setOnInsert: {
          tier: tierName,
          createdBy: userId,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
    await emitAudit(req, 'ai.tier.upserted', {
      resourceType: 'AiTierEntitlement',
      resourceId: tier._id,
      changedFields: changedFields(req.body, TIER_FIELDS),
    });
    return res.json({ success: true, tier: toSafeObject(tier) });
  }));

  router.delete('/tiers/:tier', asyncRoute(async (req, res) => {
    const tier = await Models.AiTierEntitlement.findOneAndUpdate(
      { tier: String(req.params.tier) },
      { $set: { enabled: false, updatedBy: actorId(req) } },
      { new: true, runValidators: true }
    );
    if (!tier) {
      return res.status(404).json({
        success: false,
        error: 'AI_TIER_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.tier.disabled', {
      resourceType: 'AiTierEntitlement',
      resourceId: tier._id,
      changedFields: ['enabled'],
    });
    return res.json({ success: true, tier: toSafeObject(tier) });
  }));

  router.get('/overrides', asyncRoute(async (req, res) => {
    const query = {};
    if (req.query.userId) {
      query.userId = String(req.query.userId);
    }
    const enabled = booleanQuery(req.query.enabled);
    if (enabled !== undefined) {
      query.enabled = enabled;
    }
    const overrides = await Models.AiUserOverride
      .find(query)
      .sort({ updatedAt: -1 })
      .limit(boundedLimit(req.query.limit, 100, 200))
      .lean();
    return res.json({ success: true, overrides });
  }));

  router.put('/overrides/:userId', asyncRoute(async (req, res) => {
    const userId = actorId(req);
    const override = await Models.AiUserOverride.findOneAndUpdate(
      { userId: req.params.userId },
      {
        $set: {
          ...validateOverrideInput(req.body),
          updatedBy: userId,
        },
        $setOnInsert: {
          userId: req.params.userId,
          createdBy: userId,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
    await emitAudit(req, 'ai.user_override.upserted', {
      resourceType: 'AiUserOverride',
      resourceId: override._id,
      changedFields: changedFields(req.body, OVERRIDE_FIELDS),
    });
    return res.json({
      success: true,
      override: toSafeObject(override),
    });
  }));

  router.delete('/overrides/:userId', asyncRoute(async (req, res) => {
    const override = await Models.AiUserOverride.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { enabled: false, updatedBy: actorId(req) } },
      { new: true, runValidators: true }
    );
    if (!override) {
      return res.status(404).json({
        success: false,
        error: 'AI_USER_OVERRIDE_NOT_FOUND',
      });
    }
    await emitAudit(req, 'ai.user_override.disabled', {
      resourceType: 'AiUserOverride',
      resourceId: override._id,
      changedFields: ['enabled'],
    });
    return res.json({
      success: true,
      override: toSafeObject(override),
    });
  }));

  router.get('/usage', asyncRoute(async (req, res) => {
    const query = {};
    for (const field of ['userId', 'botId', 'provider', 'modelId', 'tier']) {
      if (req.query[field]) {
        query[field] = String(req.query[field]);
      }
    }
    if (req.query.success !== undefined) {
      query.success = booleanQuery(req.query.success);
    }
    if (req.query.from || req.query.to) {
      query.createdAt = {};
      if (req.query.from) {
        query.createdAt.$gte = new Date(String(req.query.from));
      }
      if (req.query.to) {
        query.createdAt.$lt = new Date(String(req.query.to));
      }
    }
    const usage = await Models.AiUsageEvent
      .find(query)
      .sort({ createdAt: -1 })
      .limit(boundedLimit(req.query.limit, 100, 500))
      .lean();
    return res.json({ success: true, usage });
  }));

  router.use((error, req, res, _next) => {
    if (error instanceof AiCredentialCryptoError) {
      const status = error.code === 'AI_CREDENTIAL_KEY_MISSING'
        || error.code === 'AI_CREDENTIAL_KEY_FORMAT'
        || error.code === 'AI_CREDENTIAL_KEY_LENGTH'
        ? 503
        : 400;
      return res.status(status).json({
        success: false,
        error: error.code,
        message: error.message,
      });
    }
    if (error?.name === 'ValidationError'
        || error?.name === 'CastError'
        || error?.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: error.code || 'AI_CONTROL_VALIDATION_FAILED',
        message: error.message,
      });
    }
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'AI_CONTROL_CONFLICT',
      });
    }
    return res.status(500).json({
      success: false,
      error: 'AI_CONTROL_INTERNAL_ERROR',
      requestId: req.requestId || null,
    });
  });

  return router;
}

module.exports = {
  createAiControlPlaneRouter,
  requireDirectSuperadmin,
  safeCredential,
};
