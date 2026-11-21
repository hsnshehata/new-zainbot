'use strict';

// server/services/webhookUrlGuard.js
// SSRF guard for customer-configured outbound webhook URLs. Merchants can
// point webhook deliveries at arbitrary URLs, so every delivery path
// (config save, live dispatch, manual retry) must prove the target is a
// public HTTPS endpoint before any bytes leave the server.
//
// Layers:
//  1. URL shape: https only, no embedded credentials, hostname present.
//  2. IP literals are checked directly (no DNS needed).
//  3. Hostnames are resolved and EVERY returned address must be public;
//     this runs again at dispatch time so a hostname re-pointed at a
//     private range after validation is still blocked.
//
// Connect-time pinning: delivery paths use buildPinnedHttpsAgent(), whose
// custom `lookup` returns OUR vetted address for the socket connect. Node
// still runs TLS with the URL hostname for SNI and certificate
// verification, so pinning the IP does not weaken TLS. A DNS answer that
// flips after validation cannot redirect the socket: axios never
// re-resolves on its own.

const dns = require('dns').promises;
const net = require('net');
const https = require('https');

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (cloud metadata)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // 192.0.0.0/24 incl. TEST-NET-1 (192.0.2.0/24)
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && p[2] === 100) || // TEST-NET-2
    (a === 203 && b === 0 && p[2] === 113) || // TEST-NET-3
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(ip) {
  const norm = ip.toLowerCase();
  if (norm === '::1' || norm === '::') return true;
  if (norm.startsWith('fe80') || norm.startsWith('fe90') || norm.startsWith('fea0') || norm.startsWith('feb0')) return true; // link-local fe80::/10
  if (norm.startsWith('fc') || norm.startsWith('fd')) return true; // ULA fc00::/7
  const mapped = norm.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]); // IPv4-mapped, dotted form
  const hexMapped = norm.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    // IPv4-mapped, hex groups form (how WHATWG URLs serialize it)
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return false;
}

function isPrivateIp(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not an IP at all: fail closed
}

/**
 * Assert that rawUrl is a public HTTPS endpoint safe to POST to.
 * Throws an Error with an Arabic user-facing message on rejection.
 * @param {string} rawUrl
 * @param {{ resolve?: (hostname: string) => Promise<{address: string}[]> }} [opts]
 *        resolve is injectable for tests; defaults to dns.lookup(all).
 */
async function assertPublicHttpsUrl(rawUrl, opts = {}) {
  const resolve =
    opts.resolve ||
    (async (hostname) => dns.lookup(hostname, { all: true, verbatim: true }));

  const fail = (msg) => {
    const e = new Error(msg);
    e.code = 'WEBHOOK_URL_BLOCKED';
    throw e;
  };

  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    fail('رابط الويب هوك غير صالح');
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('رابط الويب هوك غير صالح');
  }

  if (url.protocol !== 'https:') {
    fail('رابط الويب هوك يجب أن يبدأ بـ https');
  }
  if (url.username || url.password) {
    fail('رابط الويب هوك يجب ألا يحتوي على بيانات دخول');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets
  if (!hostname) fail('رابط الويب هوك غير صالح');

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      fail('رابط الويب هوك يشير إلى عنوان داخلي غير مسموح به');
    }
    return { url, hostname, addresses: null };
  }

  let addresses;
  try {
    addresses = await resolve(hostname);
  } catch {
    fail('تعذر التحقق من عنوان رابط الويب هوك');
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    fail('تعذر التحقق من عنوان رابط الويب هوك');
  }
  for (const entry of addresses) {
    if (isPrivateIp(entry.address)) {
      fail('رابط الويب هوك يشير إلى عنوان داخلي غير مسموح به');
    }
  }
  return { url, hostname, addresses };
}

/**
 * Build an https.Agent that pins the socket connect to an address we
 * resolved and vetted, while TLS SNI and certificate verification still
 * use the URL's hostname. Throws (same messages) when the URL fails the
 * guard, so calling this IS the validation step for delivery paths.
 *
 * @param {string} rawUrl
 * @param {{ resolve?: Function }} [opts] resolve injectable for tests
 * @returns {Promise<https.Agent>}
 */
async function buildPinnedHttpsAgent(rawUrl, opts = {}) {
  const { hostname, addresses } = await assertPublicHttpsUrl(rawUrl, opts);

  if (!addresses) {
    // IP-literal URL: no lookup will happen, a plain agent is already pinned.
    return new https.Agent();
  }

  const vetted = addresses.map((a) => ({
    address: a.address,
    family: a.family || (net.isIPv6(a.address) ? 6 : 4),
  }));
  let cursor = 0;
  const lookup = (requestedHostname, _options, callback) => {
    if (requestedHostname !== hostname) {
      // Never let the agent resolve anything but the validated hostname.
      return callback(new Error('webhookUrlGuard: unexpected hostname'));
    }
    const chosen = vetted[cursor % vetted.length];
    cursor += 1;
    callback(null, chosen.address, chosen.family);
  };
  return new https.Agent({ lookup });
}

module.exports = { assertPublicHttpsUrl, buildPinnedHttpsAgent, isPrivateIp };
