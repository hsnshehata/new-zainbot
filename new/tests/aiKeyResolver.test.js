// tests/aiKeyResolver.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  createAiKeyResolver,
  normalizeProvider,
} = require('../server/services/aiKeyResolver');
const {
  encryptCredentialSecret,
  decryptCredentialSecret,
} = require('../server/services/AiCredentialCrypto');

function testEnvironment() {
  const key = crypto.randomBytes(32).toString('base64');
  return {
    CREDENTIAL_ENCRYPTION_KEY: `base64:${key}`,
    OPENAI_API_KEY: 'env-openai-key',
  };
}

function makeCredentialModel(initialDocs = []) {
  const model = {
    documents: initialDocs,
    updates: [],
    find(_query) {
      const chain = {
        select() { return chain; },
        sort() { return chain; },
        async lean() {
          return model.documents.filter((doc) => doc.status === 'active');
        },
      };
      return chain;
    },
    async findByIdAndUpdate(id, update) {
      model.updates.push({ id: String(id), update });
    },
  };
  return model;
}

function makeProviderKeyModel(initialDocs = []) {
  const model = {
    state: initialDocs.map((doc) => ({ ...doc })),
    resetCalls: 0,
    find(query) {
      const chain = {
        select() { return chain; },
        sort() { return chain; },
        async lean() {
          return model.state
            .filter((doc) => (
              (!query.isActive || doc.isActive)
              && (!query.status || doc.status === query.status)
            ))
            .sort((a, b) => (a.priority || 0) - (b.priority || 0));
        },
      };
      return chain;
    },
    async updateMany(_filter, update) {
      model.resetCalls += 1;
      model.state.forEach((doc) => {
        doc.status = update.status;
      });
    },
    async findByIdAndUpdate(id, update) {
      model.updates.push({ id: String(id), update });
    },
  };
  return model;
}

function encryptedCredentialDoc({ id, name, provider, secret }, environment) {
  const encrypted = encryptCredentialSecret(secret, {
    context: `${id}:${provider}`,
    environment,
  });
  return {
    _id: id,
    name,
    provider,
    baseUrl: '',
    status: 'active',
    ...encrypted,
  };
}

describe('aiKeyResolver', () => {
  test('encrypted credentials win over every other source and decrypt with their context', async () => {
    const environment = testEnvironment();
    const credentialModel = makeCredentialModel([
      encryptedCredentialDoc({ id: 'cred-1', name: 'primary', provider: 'openai', secret: 'sk-secret-primary' }, environment),
    ]);
    const providerKeyModel = makeProviderKeyModel([
      { _id: 'legacy-1', name: 'legacy', provider: 'openai', apiKey: 'sk-legacy', priority: 1, isActive: true, status: 'working' },
    ]);

    const resolver = createAiKeyResolver({
      AiCredential: credentialModel,
      ProviderKey: providerKeyModel,
      environment,
      decryptCredentialSecret,
    });

    const keys = await resolver.listGlobalAiKeys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0].source, 'ai_credential');
    assert.equal(keys[0].apiKey, 'sk-secret-primary');
    assert.equal(keys[0].provider, 'openai');
  });

  test('a credential that fails decryption is marked as error and legacy keys are used', async () => {
    const environment = testEnvironment();
    const broken = encryptedCredentialDoc({
      id: 'cred-broken',
      name: 'broken',
      provider: 'anthropic',
      secret: 'sk-anthropic-secret',
    }, environment);
    // Corrupt the ciphertext so authentication always fails
    broken.secretCiphertext = Buffer.from('tampered-payload').toString('base64');

    const credentialModel = makeCredentialModel([broken]);
    const providerKeyModel = makeProviderKeyModel([
      { _id: 'legacy-1', name: 'legacy', provider: 'gemini', apiKey: 'g-key', priority: 2, isActive: true, status: 'working' },
    ]);

    const resolver = createAiKeyResolver({
      AiCredential: credentialModel,
      ProviderKey: providerKeyModel,
      environment,
      decryptCredentialSecret,
    });

    const keys = await resolver.listGlobalAiKeys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0].source, 'provider_key');
    assert.equal(keys[0].apiKey, 'g-key');

    assert.equal(credentialModel.updates.length, 1);
    assert.equal(credentialModel.updates[0].update.$set.status, 'error');
    assert.ok(credentialModel.updates[0].update.$inc);
    assert.equal(credentialModel.updates[0].update.$inc.failureCount, 1);
  });

  test('legacy provider keys are used when the control plane is empty and they self-heal once', async () => {
    const environment = testEnvironment();
    const providerKeyModel = makeProviderKeyModel([
      { _id: 'k1', name: 'bench', provider: 'openai', apiKey: 'sk-a', priority: 2, isActive: true, status: 'failed' },
      { _id: 'k2', name: 'live', provider: 'openrouter', apiKey: 'or-b', priority: 1, isActive: true, status: 'failed' },
    ]);

    const resolver = createAiKeyResolver({
      AiCredential: makeCredentialModel([]),
      ProviderKey: providerKeyModel,
      environment,
      decryptCredentialSecret,
    });

    const keys = await resolver.listGlobalAiKeys();
    assert.equal(providerKeyModel.resetCalls, 1);
    assert.equal(keys.length, 2);
    assert.deepEqual(keys.map((key) => key.apiKey), ['or-b', 'sk-a']);
    assert.equal(keys.every((key) => key.source === 'provider_key'), true);
  });

  test('the environment key is the final fallback and nothing is returned without it', async () => {
    const environment = testEnvironment();
    const resolver = createAiKeyResolver({
      AiCredential: makeCredentialModel([]),
      ProviderKey: makeProviderKeyModel([]),
      environment,
      decryptCredentialSecret,
    });

    const keys = await resolver.listGlobalAiKeys();
    assert.equal(keys.length, 1);
    assert.equal(keys[0].source, 'env');
    assert.equal(keys[0].apiKey, 'env-openai-key');

    const strictResolver = createAiKeyResolver({
      AiCredential: makeCredentialModel([]),
      ProviderKey: makeProviderKeyModel([]),
      environment: { CREDENTIAL_ENCRYPTION_KEY: environment.CREDENTIAL_ENCRYPTION_KEY },
      decryptCredentialSecret,
    });
    assert.deepEqual(await strictResolver.listGlobalAiKeys(), []);
  });

  test('candidate markers persist success and failure outcomes on the credential', async () => {
    const environment = testEnvironment();
    const credentialModel = makeCredentialModel([
      encryptedCredentialDoc({ id: 'cred-marks', name: 'marked', provider: 'custom', secret: 'secret-value-123' }, environment),
    ]);
    const providerKeyModel = makeProviderKeyModel([]);

    const resolver = createAiKeyResolver({
      AiCredential: credentialModel,
      ProviderKey: providerKeyModel,
      environment,
      decryptCredentialSecret,
    });

    const [candidate] = await resolver.listGlobalAiKeys();
    await candidate.markSuccess();

    const successUpdate = credentialModel.updates.at(-1);
    assert.equal(successUpdate.update.$set.status, 'active');
    assert.equal(successUpdate.update.$set.failureCount, 0);

    await candidate.markFailure('PROVIDER_TIMEOUT');
    const failureUpdate = credentialModel.updates.at(-1);
    assert.equal(failureUpdate.update.$set.status, 'error');
    assert.equal(failureUpdate.update.$set.lastErrorCode, 'PROVIDER_TIMEOUT');
    assert.equal(failureUpdate.update.$inc.failureCount, 1);
  });

  test('google credentials are normalized to the gemini dispatcher provider', () => {
    assert.equal(normalizeProvider('google'), 'gemini');
    assert.equal(normalizeProvider('OpenAI'), 'openai');
    assert.equal(normalizeProvider(undefined), '');
  });
});
