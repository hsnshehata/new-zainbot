// public/js/dashboard-assets.js
// F05: lazy feature loader. window.ZainBotDashboardAssets.loadFeature(id)
// loads 'ideaCouncil' | 'settingsSummary' on first tab entry ONLY.
// Static same-origin map (never a user-supplied URL); concurrent callers
// share one Promise (dedupe); a failed load evicts so a later manual retry
// issues a fresh request. A 200-that-isn't-JS (e.g. an HTML error page)
// fires onload — so the expected namespace is verified before resolving.
(function (global) {
  'use strict';

  var VERSION = '20261005-f05';

  // Static same-origin map. Versions bump here (F-owned) when a chunk changes;
  // the SW stays query-blind (one entry per path), so no SW edit is needed.
  var FEATURE_MAP = {
    ideaCouncil: '/js/dashboard-idea-council.js?v=' + VERSION,
    settingsSummary: '/js/settings-summary.js?v=' + VERSION,
  };

  var EXPECTED_GLOBAL = {
    ideaCouncil: 'ZainBotIdeaCouncil',
    settingsSummary: 'ZainBotSettingsSummary',
  };

  var pending = {};

  function featureUrl(id) {
    return FEATURE_MAP[id];
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var doc = global.document;
      if (!doc || typeof doc.createElement !== 'function'
        || !doc.head || typeof doc.head.appendChild !== 'function') {
        reject(new Error('[dashboard-assets] no document to load ' + url));
        return;
      }
      var script = doc.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function () {
        resolve(url);
      };
      script.onerror = function () {
        reject(new Error('[dashboard-assets] failed to load ' + url));
      };
      doc.head.appendChild(script);
    });
  }

  function loadFeature(id) {
    if (!Object.prototype.hasOwnProperty.call(FEATURE_MAP, id)) {
      return Promise.reject(new Error('[dashboard-assets] unknown feature ' + String(id)));
    }
    if (Object.prototype.hasOwnProperty.call(pending, id)) {
      return pending[id];
    }
    var namespace = EXPECTED_GLOBAL[id];
    if (global[namespace]) {
      return Promise.resolve(global[namespace]);
    }
    var url = FEATURE_MAP[id];
    if (url.charAt(0) !== '/') {
      return Promise.reject(new Error('[dashboard-assets] refusing non-same-origin url ' + url));
    }
    var task = loadScript(url).then(function () {
      var exported = global[namespace];
      if (!exported) {
        throw new Error('[dashboard-assets] loaded but namespace missing: ' + id);
      }
      return exported;
    });
    pending[id] = task;
    task.then(null, function () {
      if (pending[id] === task) delete pending[id];
    });
    return task;
  }

  var api = { loadFeature: loadFeature };
  // Exposed for tests/version audits. Frozen: the map is static by contract.
  var exposed = {
    ideaCouncil: FEATURE_MAP.ideaCouncil,
    settingsSummary: FEATURE_MAP.settingsSummary,
  };
  api.FEATURES = typeof Object.freeze === 'function' ? Object.freeze(exposed) : exposed;
  api.VERSION = VERSION;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ZainBotDashboardAssets = api;
})(typeof window !== 'undefined' ? window : globalThis);
