'use strict';

// tests/webhookUrlGuard.test.js
// SSRF guard unit coverage: outbound webhook URLs must be public HTTPS.
// DNS is injected so the tests run fully offline.

const test = require('node:test');
const assert = require('node:assert/strict');

const { assertPublicHttpsUrl, buildPinnedHttpsAgent, isPrivateIp } = require('../server/services/webhookUrlGuard');

const publicResolve = async () => [{ address: '93.184.216.34' }];
const privateResolve = async () => [{ address: '10.0.0.5' }];
const mixedResolve = async () => [{ address: '93.184.216.34' }, { address: '169.254.169.254' }];
const failResolve = async () => {
  throw new Error('ENOTFOUND');
};

test('accepts a public https URL with a public DNS answer', async () => {
  await assertPublicHttpsUrl('https://hooks.example.com/path', { resolve: publicResolve });
});

test('accepts a public IP literal without any DNS lookup', async () => {
  await assertPublicHttpsUrl('https://93.184.216.34/hook', { resolve: failResolve });
});

test('rejects plain http', async () => {
  await assert.rejects(
    () => assertPublicHttpsUrl('http://93.184.216.34/hook', { resolve: failResolve }),
    /https/
  );
});

test('rejects embedded credentials', async () => {
  await assert.rejects(
    () => assertPublicHttpsUrl('https://user:pass@93.184.216.34/hook', { resolve: failResolve })
  );
});

test('rejects private and special IP literals', async () => {
  const blocked = [
    'https://127.0.0.1/',
    'https://10.1.2.3/',
    'https://172.16.0.1/',
    'https://192.168.1.1/',
    'https://169.254.169.254/latest/meta-data', // cloud metadata
    'https://100.64.0.1/',
    'https://0.0.0.0/',
    'https://224.0.0.1/',
    'https://[::1]/',
    'https://[fe80::1]/',
    'https://[fd00::1]/',
    'https://[::ffff:127.0.0.1]/',
  ];
  for (const url of blocked) {
    await assert.rejects(
      () => assertPublicHttpsUrl(url, { resolve: failResolve }),
      /داخلي|صالح/,
      `must block ${url}`
    );
  }
});

test('rejects a hostname that resolves to a private address', async () => {
  await assert.rejects(
    () => assertPublicHttpsUrl('https://internal.example.com/', { resolve: privateResolve }),
    /داخلي/
  );
});

test('rejects when ANY resolved address is private', async () => {
  await assert.rejects(
    () => assertPublicHttpsUrl('https://hooks.example.com/', { resolve: mixedResolve }),
    /داخلي/
  );
});

test('fails closed when DNS resolution errors', async () => {
  await assert.rejects(
    () => assertPublicHttpsUrl('https://hooks.example.com/', { resolve: failResolve }),
    /تعذر/
  );
});

test('isPrivateIp fails closed on non-IP input', () => {
  assert.equal(isPrivateIp('not-an-ip'), true);
});

// Connect-time pinning: the agent must hand the socket OUR vetted address,
// so a DNS flip after validation cannot redirect the connection. TLS SNI
// and certificate verification still use the URL hostname (agent only
// overrides address resolution).

test('pinned agent lookup returns the vetted address for the target hostname', async () => {
  const agent = await buildPinnedHttpsAgent('https://hooks.example.com/path', {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  const { address, family } = await new Promise((resolvePromise, rejectPromise) => {
    agent.options.lookup('hooks.example.com', {}, (err, address, family) => {
      if (err) return rejectPromise(err);
      resolvePromise({ address, family });
    });
  });
  assert.equal(address, '93.184.216.34');
  assert.equal(family, 4);
});

test('pinned agent refuses to resolve any other hostname', async () => {
  const agent = await buildPinnedHttpsAgent('https://hooks.example.com/path', {
    resolve: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  await assert.rejects(
    () =>
      new Promise((resolvePromise, rejectPromise) => {
        agent.options.lookup('evil.example.com', {}, (err) => {
          if (err) return rejectPromise(err);
          resolvePromise();
        });
      }),
    /unexpected hostname/
  );
});

test('pinned agent build fails closed when DNS flips private at delivery time', async () => {
  await assert.rejects(
    () => buildPinnedHttpsAgent('https://hooks.example.com/path', { resolve: privateResolve }),
    /داخلي/
  );
});
