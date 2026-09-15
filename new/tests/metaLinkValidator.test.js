// tests/metaLinkValidator.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createMetaLinkValidator,
} = require('../server/services/metaLinkValidator');
const botsRouter = require('../server/routes/bots');

function makeLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function fakeHttpGet(respond) {
  const calls = [];
  const httpGet = async (url) => {
    calls.push(url);
    return respond(calls.length, url);
  };
  return { httpGet, calls };
}

function graphAuthError() {
  const error = new Error('Request failed with status code 400');
  error.response = {
    status: 400,
    data: {
      error: {
        message: 'Invalid OAuth access token - Cannot parse access token',
        type: 'OAuthException',
        code: 190,
      },
    },
  };
  return error;
}

function networkError() {
  const error = new Error('getaddrinfo ENOTFOUND graph.facebook.com');
  error.code = 'ENOTFOUND';
  return error;
}

describe('metaLinkValidator facebook', () => {
  test('happy path hits the page endpoint and reports ok', async () => {
    const { httpGet, calls } = fakeHttpGet(() => ({ data: { id: '111', name: 'My Page' } }));
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateFacebook({ accessToken: 'EAAtoken|part', pageId: '111' });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      'https://graph.facebook.com/v22.0/111?fields=id,name&access_token=EAAtoken|part'
    );
  });

  test('falls back to v22.0 when no version is configured', async () => {
    const { httpGet, calls } = fakeHttpGet(() => ({ data: { id: '111' } }));
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger() });

    await validator.validateFacebook({ accessToken: 'tok', pageId: '111' });

    assert.match(calls[0], /https:\/\/graph\.facebook\.com\/v22\.0\/111\?/);
  });

  test('id mismatch maps to META_PAGE_NOT_FOUND', async () => {
    const { httpGet } = fakeHttpGet(() => ({ data: { id: '999', name: 'Other Page' } }));
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateFacebook({ accessToken: 'tok', pageId: '111' });

    assert.deepEqual(result, { ok: false, errorCode: 'META_PAGE_NOT_FOUND' });
  });

  test('graph auth error body maps to META_TOKEN_INVALID', async () => {
    const { httpGet } = fakeHttpGet(() => {
      throw graphAuthError();
    });
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateFacebook({ accessToken: 'tok', pageId: '111' });

    assert.deepEqual(result, { ok: false, errorCode: 'META_TOKEN_INVALID' });
  });

  test('404 response maps to META_PAGE_NOT_FOUND', async () => {
    const error = new Error('Request failed with status code 404');
    error.response = { status: 404, data: {} };
    const { httpGet } = fakeHttpGet(() => {
      throw error;
    });
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateFacebook({ accessToken: 'tok', pageId: '111' });

    assert.deepEqual(result, { ok: false, errorCode: 'META_PAGE_NOT_FOUND' });
  });

  test('network throw maps to META_NETWORK', async () => {
    const { httpGet } = fakeHttpGet(() => {
      throw networkError();
    });
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateFacebook({ accessToken: 'tok', pageId: '111' });

    assert.deepEqual(result, { ok: false, errorCode: 'META_NETWORK' });
  });
});

describe('metaLinkValidator instagram', () => {
  test('happy path hits the account endpoint through the Facebook Graph host', async () => {
    const { httpGet, calls } = fakeHttpGet(() => ({ data: { id: '17841400000000', username: 'brand.account' } }));
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v23.0' });

    const result = await validator.validateInstagram({
      accessToken: 'IGQVJtoken',
      accountId: '17841400000000',
    });

    assert.deepEqual(result, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0],
      'https://graph.facebook.com/v23.0/17841400000000?fields=id,username&access_token=IGQVJtoken'
    );
  });

  test('id mismatch maps to IG_ACCOUNT_NOT_FOUND', async () => {
    const { httpGet } = fakeHttpGet(() => ({ data: { id: '1', username: 'other' } }));
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateInstagram({ accessToken: 'tok', accountId: '2' });

    assert.deepEqual(result, { ok: false, errorCode: 'IG_ACCOUNT_NOT_FOUND' });
  });

  test('graph auth error body maps to IG_TOKEN_INVALID', async () => {
    const { httpGet } = fakeHttpGet(() => {
      throw graphAuthError();
    });
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateInstagram({ accessToken: 'tok', accountId: '2' });

    assert.deepEqual(result, { ok: false, errorCode: 'IG_TOKEN_INVALID' });
  });

  test('network throw maps to IG_NETWORK', async () => {
    const { httpGet } = fakeHttpGet(() => {
      throw networkError();
    });
    const validator = createMetaLinkValidator({ httpGet, logger: makeLogger(), graphVersion: 'v22.0' });

    const result = await validator.validateInstagram({ accessToken: 'tok', accountId: '2' });

    assert.deepEqual(result, { ok: false, errorCode: 'IG_NETWORK' });
  });
});

describe('link-social route validation hook', () => {
  function findLinkSocialHandler(router) {
    const layer = router.stack.find((entry) => entry.route && entry.route.path === '/:id/link-social');
    assert.ok(layer, 'link-social route must exist');
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  function createResponse() {
    return {
      statusCode: 200,
      body: undefined,
      status(value) {
        this.statusCode = value;
        return this;
      },
      json(value) {
        this.body = value;
        return this;
      },
    };
  }

  test('setter swaps the validator and failing facebook credentials are rejected before save', async () => {
    const handler = findLinkSocialHandler(botsRouter);
    let validateCalls = 0;
    botsRouter._setMetaLinkValidatorForTests({
      validateFacebook: async (input) => {
        validateCalls += 1;
        assert.equal(input.pageId, '111');
        return { ok: false, errorCode: 'META_TOKEN_INVALID' };
      },
      validateInstagram: async () => ({ ok: false, errorCode: 'IG_ACCOUNT_NOT_FOUND' }),
    });

    try {
      const req = {
        params: { id: '507f1f77bcf86cd799439011' },
        body: { facebookApiKey: 'garbage-token', facebookPageId: '111' },
        requestId: 'request-link-social-1',
        auth: { actorUserId: 'user-1' },
        bot: {},
      };
      const res = createResponse();
      let nextCalled = false;

      await handler(req, res, () => {
        nextCalled = true;
      });

      assert.equal(validateCalls, 1);
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'META_TOKEN_INVALID');
    } finally {
      botsRouter._setMetaLinkValidatorForTests();
    }
  });
});
