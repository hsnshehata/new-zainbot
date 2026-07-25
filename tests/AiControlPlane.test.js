const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const AiCredential = require('../server/models/AiCredential');
const AiRoutingPolicy = require('../server/models/AiRoutingPolicy');
const AiTierEntitlement = require('../server/models/AiTierEntitlement');
const AiUsageEvent = require('../server/models/AiUsageEvent');
const {
  AiCredentialCryptoError,
  parseCredentialEncryptionKey,
  buildCredentialContext,
  encryptCredentialSecret,
  decryptCredentialSecret,
} = require('../server/services/AiCredentialCrypto');
const {
  SCOPE_PRECEDENCE,
  resolveAiPolicy,
  classifyAiProviderError,
  shouldRetryAiProviderError,
} = require('../server/services/AiPolicyResolver');
const {
  requireDirectSuperadmin,
  safeCredential,
} = require('../server/routes/AiControlPlane');

const KEY_ONE = `base64:${Buffer.alloc(32, 7).toString('base64')}`;
const KEY_TWO = `base64:${Buffer.alloc(32, 9).toString('base64')}`;

function environmentWithKey(key = KEY_ONE) {
  return { CREDENTIAL_ENCRYPTION_KEY: key };
}

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('credential encryption requires an explicitly encoded 32-byte key', () => {
  assert.throws(
    () => parseCredentialEncryptionKey('plain-text-key'),
    (error) => (
      error instanceof AiCredentialCryptoError
      && error.code === 'AI_CREDENTIAL_KEY_FORMAT'
    )
  );
  assert.throws(
    () => parseCredentialEncryptionKey(
      `base64:${Buffer.alloc(31).toString('base64')}`
    ),
    (error) => (
      error instanceof AiCredentialCryptoError
      && error.code === 'AI_CREDENTIAL_KEY_LENGTH'
    )
  );

  const parsed = parseCredentialEncryptionKey(KEY_ONE);
  assert.equal(parsed.length, 32);
  parsed.fill(0);
});

test('AES-256-GCM credential encryption round-trips without exposing plaintext', () => {
  const context = buildCredentialContext(
    '507f191e810c19729de860ea',
    'openai'
  );
  const first = encryptCredentialSecret('sk-example-secret-value', {
    context,
    environment: environmentWithKey(),
  });
  const second = encryptCredentialSecret('sk-example-secret-value', {
    context,
    environment: environmentWithKey(),
  });

  assert.equal(first.encryptionVersion, 1);
  assert.equal(first.hasSecret, true);
  assert.notEqual(first.secretCiphertext, second.secretCiphertext);
  assert.equal(
    JSON.stringify(first).includes('sk-example-secret-value'),
    false
  );
  assert.equal(
    decryptCredentialSecret(first, {
      context,
      environment: environmentWithKey(),
    }),
    'sk-example-secret-value'
  );
});

test('credential ciphertext is bound to its record context and active key', () => {
  const context = buildCredentialContext('credential-a', 'openai');
  const encrypted = encryptCredentialSecret('sk-example-secret-value', {
    context,
    environment: environmentWithKey(),
  });

  assert.throws(
    () => decryptCredentialSecret(encrypted, {
      context: buildCredentialContext('credential-b', 'openai'),
      environment: environmentWithKey(),
    }),
    (error) => error.code === 'AI_CREDENTIAL_DECRYPT_FAILED'
  );
  assert.throws(
    () => decryptCredentialSecret(encrypted, {
      context,
      environment: environmentWithKey(KEY_TWO),
    }),
    (error) => error.code === 'AI_CREDENTIAL_KEY_MISMATCH'
  );
});

test('AiCredential serialization never returns encrypted secret material', () => {
  const actorId = new mongoose.Types.ObjectId();
  const credential = new AiCredential({
    name: 'Primary',
    provider: 'openai',
    secretCiphertext: 'ciphertext',
    secretIv: 'initialization-vector',
    secretAuthTag: 'authentication-tag',
    encryptionKeyId: 'key-identifier',
    encryptionVersion: 1,
    createdBy: actorId,
    updatedBy: actorId,
  });
  const json = credential.toJSON();

  assert.equal(json.secretCiphertext, undefined);
  assert.equal(json.secretIv, undefined);
  assert.equal(json.secretAuthTag, undefined);
  assert.equal(json.encryptionKeyId, undefined);
  assert.equal(json.hasSecret, true);

  const plainSafe = safeCredential({
    _id: 'credential-1',
    name: 'Primary',
    secret: 'raw',
    secretCiphertext: 'ciphertext',
    secretIv: 'iv',
    secretAuthTag: 'tag',
    encryptionKeyId: 'key',
  });
  assert.equal(plainSafe.secret, undefined);
  assert.equal(plainSafe.secretCiphertext, undefined);
  assert.equal(plainSafe.secretIv, undefined);
  assert.equal(plainSafe.secretAuthTag, undefined);
  assert.equal(plainSafe.encryptionKeyId, undefined);
  assert.equal(plainSafe.hasSecret, true);
});

test('free is the first supported tier and auto routing defaults are enabled', () => {
  assert.equal(AiTierEntitlement.SUPPORTED_AI_TIERS[0], 'free');
  assert.equal(AiTierEntitlement.DEFAULT_FREE_ENTITLEMENT.tier, 'free');
  assert.equal(AiTierEntitlement.DEFAULT_FREE_ENTITLEMENT.allowAuto, true);
  assert.deepEqual(
    SCOPE_PRECEDENCE,
    ['user', 'bot', 'tier', 'global']
  );
});

test('policy resolution prefers user then bot then tier then global', () => {
  const models = [
    {
      _id: 'model-user',
      provider: 'openai',
      modelId: 'user-model',
      capabilities: ['text_input', 'text_output'],
      enabled: true,
    },
    {
      _id: 'model-bot',
      provider: 'openai',
      modelId: 'bot-model',
      capabilities: ['text_input', 'text_output'],
      enabled: true,
    },
    {
      _id: 'model-tier',
      provider: 'openai',
      modelId: 'tier-model',
      capabilities: ['text_input', 'text_output'],
      enabled: true,
    },
    {
      _id: 'model-global',
      provider: 'openai',
      modelId: 'global-model',
      capabilities: ['text_input', 'text_output'],
      enabled: true,
    },
  ];
  const fixedPolicy = (id, scopeType, scopeKey, modelCatalogId) => ({
    _id: id,
    name: id,
    scopeType,
    scopeKey,
    useCase: 'chat',
    selectionMode: 'fixed',
    enabled: true,
    steps: [{
      order: 0,
      selector: 'fixed',
      modelCatalogId,
      credentialId: 'credential-1',
      maxAttempts: 1,
    }],
  });
  const policies = [
    fixedPolicy('global-policy', 'global', 'global', 'model-global'),
    fixedPolicy('tier-policy', 'tier', 'free', 'model-tier'),
    fixedPolicy('bot-policy', 'bot', 'bot-1', 'model-bot'),
    fixedPolicy('user-policy', 'user', 'user-1', 'model-user'),
  ];

  const result = resolveAiPolicy({
    userId: 'user-1',
    botId: 'bot-1',
    policies,
    catalog: models,
    useCase: 'chat',
  });
  assert.equal(result.tier, 'free');
  assert.equal(result.source, 'user');
  assert.equal(result.policyId, 'user-policy');
  assert.equal(result.candidates[0].modelId, 'user-model');

  const withoutUser = resolveAiPolicy({
    userId: 'user-2',
    botId: 'bot-1',
    policies,
    catalog: models,
    useCase: 'chat',
  });
  assert.equal(withoutUser.source, 'bot');
  assert.equal(withoutUser.candidates[0].modelId, 'bot-model');
});

test('auto routing honors free-tier model allowlists and deterministic priority', () => {
  const result = resolveAiPolicy({
    userId: 'user-free',
    policies: [{
      _id: 'free-policy',
      scopeType: 'tier',
      scopeKey: 'free',
      useCase: 'general',
      selectionMode: 'auto',
      enabled: true,
      steps: [{
        order: 0,
        selector: 'auto',
        credentialId: 'credential-free',
        maxAttempts: 2,
      }],
    }],
    entitlements: [{
      tier: 'free',
      enabled: true,
      allowAuto: true,
      allowedModelCatalogIds: ['model-free-second', 'model-free-first'],
      maxFallbackSteps: 2,
    }],
    catalog: [
      {
        _id: 'model-paid',
        provider: 'openai',
        modelId: 'paid-model',
        enabled: true,
        autoEligible: true,
        autoPriority: 1,
        capabilities: ['text_input', 'text_output'],
      },
      {
        _id: 'model-free-second',
        provider: 'google',
        modelId: 'free-second',
        enabled: true,
        autoEligible: true,
        autoPriority: 20,
        capabilities: ['text_input', 'text_output'],
      },
      {
        _id: 'model-free-first',
        provider: 'openai',
        modelId: 'free-first',
        enabled: true,
        autoEligible: true,
        autoPriority: 10,
        capabilities: ['text_input', 'text_output'],
      },
    ],
  });

  assert.equal(result.tier, 'free');
  assert.equal(result.selectionMode, 'auto');
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.modelId),
    ['free-first', 'free-second']
  );
  assert.equal(result.candidates[0].credentialId, 'credential-free');
});

test('an active user override can replace model and credential without widening entitlement', () => {
  const result = resolveAiPolicy({
    userId: 'user-1',
    policies: [{
      _id: 'global',
      scopeType: 'global',
      scopeKey: 'global',
      useCase: 'general',
      selectionMode: 'auto',
      enabled: true,
      steps: [{
        order: 0,
        selector: 'auto',
        credentialId: 'credential-global',
      }],
    }],
    overrides: [{
      _id: 'override-1',
      userId: 'user-1',
      enabled: true,
      routingMode: 'fixed',
      modelCatalogId: 'model-allowed',
      credentialId: 'credential-user',
    }],
    entitlements: [{
      tier: 'free',
      enabled: true,
      allowAuto: true,
      allowedModelCatalogIds: ['model-allowed'],
      maxFallbackSteps: 3,
    }],
    catalog: [
      {
        _id: 'model-allowed',
        provider: 'openai',
        modelId: 'allowed',
        enabled: true,
        capabilities: ['text_input', 'text_output'],
      },
      {
        _id: 'model-blocked',
        provider: 'openai',
        modelId: 'blocked',
        enabled: true,
        capabilities: ['text_input', 'text_output'],
      },
    ],
  });

  assert.equal(result.overrideId, 'override-1');
  assert.equal(result.selectionMode, 'fixed');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].modelId, 'allowed');
  assert.equal(result.candidates[0].credentialId, 'credential-user');
});

test('policy resolution excludes disabled and provider-mismatched credentials', () => {
  const result = resolveAiPolicy({
    userId: 'user-1',
    policies: [{
      _id: 'global',
      scopeType: 'global',
      scopeKey: 'global',
      useCase: 'general',
      selectionMode: 'fixed',
      enabled: true,
      steps: [
        {
          order: 0,
          selector: 'fixed',
          modelCatalogId: 'model-openai',
          credentialId: 'credential-disabled',
        },
        {
          order: 1,
          selector: 'fixed',
          modelCatalogId: 'model-openai',
          credentialId: 'credential-google',
        },
        {
          order: 2,
          selector: 'fixed',
          modelCatalogId: 'model-openai',
          credentialId: 'credential-active',
        },
      ],
    }],
    catalog: [{
      _id: 'model-openai',
      provider: 'openai',
      modelId: 'example',
      enabled: true,
      capabilities: ['text_input', 'text_output'],
    }],
    credentials: [
      {
        _id: 'credential-disabled',
        provider: 'openai',
        status: 'disabled',
      },
      {
        _id: 'credential-google',
        provider: 'google',
        status: 'active',
      },
      {
        _id: 'credential-active',
        provider: 'openai',
        status: 'active',
      },
    ],
  });

  assert.deepEqual(
    result.candidates.map((candidate) => candidate.credentialId),
    ['credential-active']
  );
});

test('provider errors are classified for safe retry and fallback decisions', () => {
  assert.deepEqual(
    classifyAiProviderError({ status: 429, code: 'rate_limit_exceeded' }),
    {
      category: 'rate_limit',
      status: 429,
      code: 'rate_limit_exceeded',
      retryable: true,
      canFallback: true,
    }
  );
  assert.equal(
    classifyAiProviderError({
      status: 429,
      code: 'insufficient_quota',
    }).category,
    'quota_exhausted'
  );
  assert.equal(
    classifyAiProviderError({ status: 400, code: 'invalid_request' }).canFallback,
    false
  );
  assert.equal(
    classifyAiProviderError({ status: 503 }).retryable,
    true
  );
  assert.equal(
    shouldRetryAiProviderError({ status: 503 }, 1, 2),
    true
  );
  assert.equal(
    shouldRetryAiProviderError({ status: 503 }, 2, 2),
    false
  );
});

test('direct-superadmin middleware rejects impersonation and non-admin actors', () => {
  let nextCount = 0;
  const directResponse = fakeResponse();
  requireDirectSuperadmin({
    auth: {
      actorRole: 'superadmin',
      actorUserId: 'admin-1',
      subjectUserId: 'admin-1',
      isImpersonating: false,
    },
  }, directResponse, () => {
    nextCount += 1;
  });
  assert.equal(nextCount, 1);
  assert.equal(directResponse.statusCode, 200);

  const impersonatedResponse = fakeResponse();
  requireDirectSuperadmin({
    auth: {
      actorRole: 'superadmin',
      actorUserId: 'admin-1',
      subjectUserId: 'user-1',
      isImpersonating: true,
    },
  }, impersonatedResponse, () => {
    nextCount += 1;
  });
  assert.equal(impersonatedResponse.statusCode, 403);
  assert.equal(
    impersonatedResponse.body.error,
    'DIRECT_SUPERADMIN_REQUIRED'
  );

  const userResponse = fakeResponse();
  requireDirectSuperadmin({
    auth: {
      actorRole: 'user',
      actorUserId: 'user-1',
      subjectUserId: 'user-1',
      isImpersonating: false,
    },
  }, userResponse, () => {
    nextCount += 1;
  });
  assert.equal(userResponse.statusCode, 403);
  assert.equal(nextCount, 1);

  const incompleteIdentityResponse = fakeResponse();
  requireDirectSuperadmin({
    auth: {
      actorRole: 'superadmin',
      isImpersonating: false,
    },
  }, incompleteIdentityResponse, () => {
    nextCount += 1;
  });
  assert.equal(incompleteIdentityResponse.statusCode, 403);
  assert.equal(nextCount, 1);
});

test('routing and usage schemas enforce ordered fallbacks and derived token totals', async () => {
  const actorId = new mongoose.Types.ObjectId();
  const credentialId = new mongoose.Types.ObjectId();
  const modelId = new mongoose.Types.ObjectId();
  const policy = new AiRoutingPolicy({
    name: 'Free auto',
    scopeType: 'global',
    scopeKey: 'anything',
    selectionMode: 'auto',
    steps: [
      {
        order: 2,
        selector: 'auto',
        credentialId,
      },
      {
        order: 1,
        selector: 'auto',
        credentialId,
      },
    ],
    createdBy: actorId,
    updatedBy: actorId,
  });
  await policy.validate();
  assert.equal(policy.scopeKey, 'global');
  assert.deepEqual(policy.steps.map((step) => step.order), [1, 2]);

  const usage = new AiUsageEvent({
    requestId: 'request-1',
    userId: actorId,
    credentialId,
    modelCatalogId: modelId,
    provider: 'openai',
    modelId: 'example-model',
    success: true,
    inputTokens: 10,
    outputTokens: 15,
    errorClass: 'timeout',
    retryable: true,
  });
  await usage.validate();
  assert.equal(usage.totalTokens, 25);
  assert.equal(usage.errorClass, 'none');
  assert.equal(usage.retryable, false);
});
