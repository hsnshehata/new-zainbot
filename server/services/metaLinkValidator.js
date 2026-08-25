// server/services/metaLinkValidator.js
// Server-side validation of Meta credentials before manual Facebook/Instagram
// linking saves them into a bot document, so garbage tokens can no longer be
// stored silently. Dependencies are injectable so the Graph calls can be unit
// tested without network access.
const axios = require('axios');
const logger = require('../logger');

const DEFAULT_GRAPH_VERSION = 'v22.0';
const REQUEST_TIMEOUT_MS = 10_000;

function resolveGraphVersion(configured) {
  return /^v\d+\.\d+$/.test(configured || '') ? configured : DEFAULT_GRAPH_VERSION;
}

function createMetaLinkValidator(deps = {}) {
  const httpGet = deps.httpGet || ((url) => axios.get(url, { timeout: REQUEST_TIMEOUT_MS }));
  const log = deps.logger || logger;
  const graphVersion = resolveGraphVersion(
    deps.graphVersion || process.env.META_GRAPH_API_VERSION
  );

  // Auth-shaped Graph failures: OAuth errors / invalid token codes / 40x.
  function isAuthFailure(error) {
    const status = error.response?.status;
    if (status === 401 || status === 403) return true;
    const graphError = error.response?.data?.error;
    if (!graphError) return false;
    if (graphError.code === 190) return true;
    if (graphError.error_subcode === 463 || graphError.error_subcode === 467) return true;
    return typeof graphError.type === 'string'
      && graphError.type.toLowerCase().includes('oauth');
  }

  async function validateNode({ accessToken, nodeId, fields, platform, codes }) {
    const url = `https://graph.facebook.com/${graphVersion}/${nodeId}?fields=${fields}&access_token=${accessToken}`;
    try {
      const response = await httpGet(url);
      if (response?.data?.id === String(nodeId)) {
        log.info('meta_link_validation_succeeded', { platform });
        return { ok: true };
      }
      log.info('meta_link_validation_failed', { platform, errorCode: codes.notFound });
      return { ok: false, errorCode: codes.notFound };
    } catch (error) {
      let errorCode;
      if (!error.response) {
        errorCode = codes.network;
      } else if (isAuthFailure(error)) {
        errorCode = codes.tokenInvalid;
      } else {
        errorCode = codes.notFound;
      }
      log.info('meta_link_validation_failed', { platform, errorCode });
      return { ok: false, errorCode };
    }
  }

  async function validateFacebook({ accessToken, pageId }) {
    return validateNode({
      accessToken,
      nodeId: pageId,
      fields: 'id,name',
      platform: 'facebook',
      codes: {
        tokenInvalid: 'META_TOKEN_INVALID',
        notFound: 'META_PAGE_NOT_FOUND',
        network: 'META_NETWORK',
      },
    });
  }

  async function validateInstagram({ accessToken, accountId }) {
    return validateNode({
      accessToken,
      nodeId: accountId,
      fields: 'id,username',
      platform: 'instagram',
      codes: {
        tokenInvalid: 'IG_TOKEN_INVALID',
        notFound: 'IG_ACCOUNT_NOT_FOUND',
        network: 'IG_NETWORK',
      },
    });
  }

  return { validateFacebook, validateInstagram, graphVersion };
}

module.exports = { createMetaLinkValidator };
