'use strict';

// Regression test for POST /api/bot media SSRF and Meta/WhatsApp platform token exfiltration.
// Verifies getMediaAuthHeader host/channel/scheme restrictions and assertSafeMediaUrl /
// fetchImageAsBase64 / transcribeAudio private-IP, scheme, and redirect protections.

const test = require('node:test');
const assert = require('node:assert/strict');

function stubModule(relativePath, exportsObject) {
  const resolved = require.resolve(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
  return resolved;
}

const axiosGetCalls = [];
const axiosPostCalls = [];
let axiosGetImpl = async () => ({ status: 200, data: Buffer.from('img-bytes'), headers: { 'content-type': 'image/jpeg' } });

stubModule('axios', {
  get: async (url, config) => {
    axiosGetCalls.push({ url, config });
    return axiosGetImpl(url, config);
  },
  post: async (url, body, config) => {
    axiosPostCalls.push({ url, config });
    return { data: { text: 'مرحبا صوت' } };
  },
});
stubModule('../server/logger', { info() {}, warn() {}, error() {} });

const {
  getMediaAuthHeader,
  assertSafeMediaUrl,
  fetchImageAsBase64,
  transcribeAudio,
} = require('../server/botEngine');

const publicResolve = async () => [{ address: '157.240.22.35', family: 4 }];
const privateResolve = async () => [{ address: '169.254.169.254', family: 4 }];

test('getMediaAuthHeader NEVER leaks platform tokens on web channel or untrusted/HTTP URLs', () => {
  const prevFb = process.env.FACEBOOK_ACCESS_TOKEN;
  const prevWa = process.env.WHATSAPP_ACCESS_TOKEN;
  process.env.FACEBOOK_ACCESS_TOKEN = 'FB_SECRET_TOKEN_SENTINEL';
  process.env.WHATSAPP_ACCESS_TOKEN = 'WA_SECRET_TOKEN_SENTINEL';

  try {
    // Web channel must NEVER attach tokens — not even to Meta hosts
    assert.deepEqual(getMediaAuthHeader('web', 'https://attacker.tld/leak'), {});
    assert.deepEqual(getMediaAuthHeader('web', 'https://graph.facebook.com/v20.0/123'), {});
    assert.deepEqual(getMediaAuthHeader('web', 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'), {});

    // Untrusted hosts on whatsapp/facebook/instagram must NEVER receive tokens
    assert.deepEqual(getMediaAuthHeader('whatsapp', 'https://attacker.tld/steal'), {});
    assert.deepEqual(getMediaAuthHeader('whatsapp', 'https://evil-graph.facebook.com.attacker.tld/steal'), {});
    assert.deepEqual(getMediaAuthHeader('facebook', 'https://attacker.tld/steal'), {});
    assert.deepEqual(getMediaAuthHeader('instagram', 'https://attacker.tld/steal'), {});

    // Plain http:// must NEVER receive tokens
    assert.deepEqual(getMediaAuthHeader('whatsapp', 'http://lookaside.fbsbx.com/file'), {});
    assert.deepEqual(getMediaAuthHeader('facebook', 'http://graph.facebook.com/file'), {});

    // Legitimate HTTPS Meta/WhatsApp CDN URLs DO receive the matching channel token
    assert.deepEqual(
      getMediaAuthHeader('whatsapp', 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123'),
      { Authorization: 'Bearer WA_SECRET_TOKEN_SENTINEL' }
    );
    assert.deepEqual(
      getMediaAuthHeader('whatsapp', 'https://mmg.whatsapp.net/v/t62.7118-24/file'),
      { Authorization: 'Bearer WA_SECRET_TOKEN_SENTINEL' }
    );
    assert.deepEqual(
      getMediaAuthHeader('facebook', 'https://scontent.xx.fbcdn.net/v/t1.15752-9/photo.jpg'),
      { Authorization: 'Bearer FB_SECRET_TOKEN_SENTINEL' }
    );
    assert.deepEqual(
      getMediaAuthHeader('instagram', 'https://scontent.cdninstagram.com/v/photo.jpg'),
      { Authorization: 'Bearer FB_SECRET_TOKEN_SENTINEL' }
    );
  } finally {
    if (prevFb !== undefined) process.env.FACEBOOK_ACCESS_TOKEN = prevFb;
    else delete process.env.FACEBOOK_ACCESS_TOKEN;
    if (prevWa !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = prevWa;
    else delete process.env.WHATSAPP_ACCESS_TOKEN;
  }
});

test('assertSafeMediaUrl blocks non-http(s) schemes, localhost, private/link-local IPs, and private DNS answers', async () => {
  const blockedUrls = [
    'file:///etc/passwd',
    'ftp://example.com/file.png',
    'gopher://127.0.0.1:6379/_INFO',
    'http://localhost/admin',
    'http://127.0.0.1:5000/metrics',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/internal',
    'http://172.16.0.5/internal',
    'http://192.168.1.1/router',
    'http://[::1]/secret',
    'http://[fe80::1]/secret',
    'http://[::ffff:169.254.169.254]/latest/meta-data/',
    'https://user:pass@93.184.216.34/img.png',
  ];

  for (const url of blockedUrls) {
    await assert.rejects(
      () => assertSafeMediaUrl(url, { resolve: publicResolve }),
      (err) => err && err.code === 'MEDIA_URL_BLOCKED',
      `expected ${url} to be blocked`
    );
  }

  // Hostname resolving to metadata/private IP must also be blocked
  await assert.rejects(
    () => assertSafeMediaUrl('https://rebind.attacker.tld/img.jpg', { resolve: privateResolve }),
    (err) => err && err.code === 'MEDIA_URL_BLOCKED'
  );

  // Public HTTPS URL with public DNS answer is allowed
  const ok = await assertSafeMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', {
    resolve: publicResolve,
  });
  assert.equal(ok.hostname, 'lookaside.fbsbx.com');
});

test('fetchImageAsBase64 and transcribeAudio block SSRF before axios.get and strip tokens on untrusted hosts/redirects', async () => {
  const prevFb = process.env.FACEBOOK_ACCESS_TOKEN;
  const prevWa = process.env.WHATSAPP_ACCESS_TOKEN;
  process.env.FACEBOOK_ACCESS_TOKEN = 'FB_SECRET_TOKEN_SENTINEL';
  process.env.WHATSAPP_ACCESS_TOKEN = 'WA_SECRET_TOKEN_SENTINEL';
  const prevLemon = process.env.LEMONFOX_API_KEY;
  const prevOpenai = process.env.OPENAI_API_KEY;
  process.env.LEMONFOX_API_KEY = 'test-lemonfox-key';
  delete process.env.OPENAI_API_KEY; // exercise the LemonFox path

  try {
    // 1. Metadata IP SSRF blocked before axios.get is ever called
    axiosGetCalls.length = 0;
    await assert.rejects(
      () => fetchImageAsBase64('http://169.254.169.254/latest/meta-data/', 'web', { resolve: publicResolve })
    );
    await assert.rejects(
      () => transcribeAudio('http://127.0.0.1:5000/metrics', 'web', { resolve: publicResolve })
    );
    assert.equal(axiosGetCalls.length, 0, 'blocked SSRF URLs must never reach axios.get');

    // 2. Public attacker URL on web channel receives ZERO Authorization header
    axiosGetCalls.length = 0;
    axiosGetImpl = async () => ({ status: 200, data: Buffer.from('abc'), headers: { 'content-type': 'image/jpeg' } });
    const dataUrl = await fetchImageAsBase64('https://attacker.tld/photo.jpg', 'web', { resolve: publicResolve });
    assert.ok(dataUrl.startsWith('data:image/jpeg;base64,'));
    assert.equal(axiosGetCalls.length, 1);
    assert.equal(axiosGetCalls[0].config.headers.Authorization, undefined);

    // 3. Legitimate WhatsApp CDN download attaches WA token and succeeds
    axiosGetCalls.length = 0;
    const waDataUrl = await fetchImageAsBase64(
      'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123',
      'whatsapp',
      { resolve: publicResolve }
    );
    assert.ok(waDataUrl.startsWith('data:image/jpeg;base64,'));
    assert.equal(axiosGetCalls[0].config.headers.Authorization, 'Bearer WA_SECRET_TOKEN_SENTINEL');

    // 4. Redirect to private IP is blocked on the redirect hop
    axiosGetCalls.length = 0;
    axiosGetImpl = async () => ({
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      data: Buffer.alloc(0),
    });
    await assert.rejects(
      () => fetchImageAsBase64('https://attacker.tld/redirect', 'web', { resolve: publicResolve })
    );
    assert.equal(axiosGetCalls.length, 1, 'redirect target to metadata IP must be blocked before second request');

    // 5. Redirect from trusted host to untrusted host drops the Authorization header
    axiosGetCalls.length = 0;
    let hop = 0;
    axiosGetImpl = async () => {
      hop += 1;
      if (hop === 1) {
        return { status: 302, headers: { location: 'https://thirdparty.example/file.ogg' }, data: Buffer.alloc(0) };
      }
      return { status: 200, data: Buffer.from('audio-bytes'), headers: { 'content-type': 'audio/ogg' } };
    };
    const transcript = await transcribeAudio(
      'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=456',
      'whatsapp',
      { resolve: publicResolve }
    );
    assert.equal(transcript, 'مرحبا صوت');
    assert.equal(axiosGetCalls.length, 2);
    assert.equal(axiosGetCalls[0].config.headers.Authorization, 'Bearer WA_SECRET_TOKEN_SENTINEL');
    assert.equal(axiosGetCalls[1].config.headers.Authorization, undefined, 'token must not be forwarded on redirect to untrusted host');
  } finally {
    if (prevLemon !== undefined) process.env.LEMONFOX_API_KEY = prevLemon;
    else delete process.env.LEMONFOX_API_KEY;
    if (prevOpenai !== undefined) process.env.OPENAI_API_KEY = prevOpenai;
    if (prevFb !== undefined) process.env.FACEBOOK_ACCESS_TOKEN = prevFb;
    else delete process.env.FACEBOOK_ACCESS_TOKEN;
    if (prevWa !== undefined) process.env.WHATSAPP_ACCESS_TOKEN = prevWa;
    else delete process.env.WHATSAPP_ACCESS_TOKEN;
  }
});
