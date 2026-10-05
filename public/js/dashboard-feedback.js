'use strict';

/**
 * ZainBot dashboard feedback/resource-state primitive — contract §7.2.
 *
 * window.ZainBotFeedback (Node-exportable for tests, no DOM at load):
 *
 *   renderState(container, state, { t, onRetry?, retryKey?, colSpan? })
 *   notify({ level: 'success'|'info'|'error', key, params? }, t)
 *   withPending(key, controls, operation) -> Promise
 *   refreshLanguage(t)
 *
 * Rules (all enforced + tested):
 * - `t(key, params?)` is INJECTED (C03 adapter). This helper owns NO
 *   dictionary and renders NO backend raw messages: every user-visible
 *   string comes from `t`, and external data only ever lands in
 *   `textContent` (never parsed as markup).
 * - Loading/success/info announce via polite `role="status"`; errors use a
 *   persistent `role="alert"` that stays until the next render — errors are
 *   never auto-dismissed and never steal focus (focus stays where it was).
 * - `aria-busy` is set on the container while loading/stale, cleared after.
 * - `onRetry` is a READ-only affordance: callers must only supply it for
 *   read operations. Mutations never get automatic or rendered retries —
 *   a failed mutation surfaces a persistent error with NO retry button.
 * - `withPending` disables controls for the operation and restores each
 *   control's ORIGINAL disabled state afterwards (pre-disabled stays
 *   disabled), on success, rejection, and synchronous throw alike.
 * - `refreshLanguage(t)` re-renders every tracked container and the last
 *   notification in place: no refetch, no state loss.
 */

var PHASES = ['loading', 'ready', 'empty', 'filtered-empty', 'error', 'stale', 'no-bot'];

var DEFAULT_KEYS = {
  loading: 'feedback_loading',
  stale: 'feedback_stale',
  'no-bot': 'feedback_no_bot'
};

var RETRY_KEY_DEFAULT = 'feedback_retry';
var LIVE_REGION_ID = 'feedbackLiveRegion';
var NOTE_ATTR = 'data-feedback-note';
var MAX_TRACKED_CONTAINERS = 50;

var pendingCounts = {};
var trackedRenders = [];
var lastNotify = null;

function getDoc() {
  if (typeof document !== 'undefined' && document) return document;
  return null;
}

function assertTranslator(t) {
  if (typeof t !== 'function') {
    throw new Error('ZainBotFeedback requires t(key, params?) from the C03 language adapter');
  }
}

function makeNote(doc, role, text) {
  var note = doc.createElement('div');
  note.setAttribute(NOTE_ATTR, role === 'alert' ? 'error' : 'status');
  var textEl = doc.createElement('p');
  textEl.setAttribute('role', role);
  textEl.textContent = text;
  note.appendChild(textEl);
  return { wrapper: note, textEl: textEl };
}

function maybeWrap(doc, node, colSpan) {
  if (colSpan === undefined || colSpan === null) return node;
  var tr = doc.createElement('tr');
  var td = doc.createElement('td');
  td.setAttribute('colspan', String(colSpan));
  td.appendChild(node);
  tr.appendChild(td);
  return tr;
}

function clearContainer(container) {
  if (typeof container.replaceChildren === 'function') {
    container.replaceChildren();
    return;
  }
  while (container.firstChild) container.removeChild(container.firstChild);
}

function removeNote(container) {
  if (!container || typeof container.querySelector !== 'function') return;
  var old = container.querySelector('[' + NOTE_ATTR + ']');
  if (old && typeof old.remove === 'function') old.remove();
}

function trackRender(container, state, opts) {
  for (var i = 0; i < trackedRenders.length; i++) {
    if (trackedRenders[i].container === container) {
      trackedRenders[i] = { container: container, state: state, opts: opts };
      return;
    }
  }
  trackedRenders.push({ container: container, state: state, opts: opts });
  while (trackedRenders.length > MAX_TRACKED_CONTAINERS) trackedRenders.shift();
}

/**
 * Render a resource state into `container`.
 * Replace-phases (loading/ready/empty/filtered-empty/no-bot) clear the
 * container first; preserve-phases (error/stale) keep existing content so
 * a failure never presents as an empty list.
 */
function renderState(container, state, opts) {
  opts = opts || {};
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('renderState requires a container element');
  }
  if (!state || PHASES.indexOf(state.phase) === -1) {
    throw new Error('renderState requires state.phase of ' + PHASES.join('|'));
  }
  assertTranslator(opts.t);
  var doc = getDoc();
  if (!doc) throw new Error('renderState requires a document');

  var phase = state.phase;
  var key = state.key || DEFAULT_KEYS[phase] || null;
  if ((phase === 'empty' || phase === 'filtered-empty' || phase === 'error') && !key) {
    throw new Error('renderState phase "' + phase + '" requires state.key (no raw backend text)');
  }

  var built = null;

  if (phase === 'ready') {
    clearContainer(container);
    container.setAttribute('aria-busy', 'false');
    trackRender(container, state, opts);
    return;
  }

  if (phase === 'loading') {
    clearContainer(container);
    container.setAttribute('aria-busy', 'true');
    var loading = makeNote(doc, 'status', opts.t(key, state.params));
    built = maybeWrap(doc, loading.wrapper, opts.colSpan);
    container.appendChild(built);
    trackRender(container, state, opts);
    return;
  }

  if (phase === 'empty' || phase === 'filtered-empty' || phase === 'no-bot') {
    clearContainer(container);
    container.setAttribute('aria-busy', 'false');
    var empty = makeNote(doc, 'status', opts.t(key, state.params));
    built = maybeWrap(doc, empty.wrapper, opts.colSpan);
    container.appendChild(built);
    trackRender(container, state, opts);
    return;
  }

  // Preserve-phases: keep rendered data, (re)place exactly one note.
  if (phase === 'stale') {
    container.setAttribute('aria-busy', 'true');
    removeNote(container);
    var stale = makeNote(doc, 'status', opts.t(key, state.params));
    container.appendChild(maybeWrap(doc, stale.wrapper, opts.colSpan));
    trackRender(container, state, opts);
    return;
  }

  // phase === 'error'
  container.setAttribute('aria-busy', 'false');
  removeNote(container);
  var alert = makeNote(doc, 'alert', opts.t(key, state.params));
  if (typeof opts.onRetry === 'function') {
    var retry = doc.createElement('button');
    retry.setAttribute('type', 'button');
    retry.textContent = opts.t(opts.retryKey || RETRY_KEY_DEFAULT, state.params);
    retry.addEventListener('click', function () { opts.onRetry(); });
    alert.wrapper.appendChild(retry);
  }
  container.appendChild(maybeWrap(doc, alert.wrapper, opts.colSpan));
  trackRender(container, state, opts);
}

/**
 * Announce a transient outcome. Success/info are polite; errors are
 * persistent alerts. Never moves focus, never builds a toast framework.
 */
function notify(payload, t) {
  payload = payload || {};
  assertTranslator(t);
  if (['success', 'info', 'error'].indexOf(payload.level) === -1) {
    throw new Error('notify requires level of success|info|error');
  }
  if (!payload.key) {
    throw new Error('notify requires key (no raw backend text)');
  }
  var doc = getDoc();
  if (!doc) throw new Error('notify requires a document');
  var region = null;
  if (typeof doc.getElementById === 'function') {
    region = doc.getElementById(LIVE_REGION_ID);
  }
  if (!region) {
    if (!doc.body || typeof doc.createElement !== 'function') {
      throw new Error('notify requires #' + LIVE_REGION_ID + ' or a document body');
    }
    region = doc.createElement('div');
    region.setAttribute('id', LIVE_REGION_ID);
    doc.body.appendChild(region);
  }
  region.setAttribute('role', payload.level === 'error' ? 'alert' : 'status');
  region.textContent = t(payload.key, payload.params);
  lastNotify = { level: payload.level, key: payload.key, params: payload.params };
}

/**
 * Disable `controls` while `operation()` runs, then restore every control's
 * original disabled state (success, rejection, and sync throw alike).
 * `key` names the logical operation; it never skips or dedupes the run —
 * single-flight remains runExclusive's job (D02).
 */
function withPending(key, controls, operation) {
  if (typeof key !== 'string' || key === '') {
    throw new Error('withPending requires a non-empty key');
  }
  if (typeof operation !== 'function') {
    throw new Error('withPending requires an operation function');
  }
  var list = Array.isArray(controls) ? controls : [];
  var previous = list.map(function (el) {
    var was = Boolean(el && el.disabled);
    if (el) el.disabled = true;
    return was;
  });
  function restore() {
    list.forEach(function (el, i) { if (el) el.disabled = previous[i]; });
    pendingCounts[key] = Math.max(0, (pendingCounts[key] || 1) - 1);
    if (!pendingCounts[key]) delete pendingCounts[key];
  }
  pendingCounts[key] = (pendingCounts[key] || 0) + 1;
  var result;
  try {
    result = operation();
  } catch (err) {
    restore();
    throw err;
  }
  return Promise.resolve(result).then(function (value) {
    restore();
    return value;
  }, function (err) {
    restore();
    throw err;
  });
}

/**
 * Re-render every tracked container and the last notification with a new
 * translator. No fetch, no state loss.
 */
function refreshLanguage(t) {
  assertTranslator(t);
  var renders = trackedRenders.slice();
  for (var i = 0; i < renders.length; i++) {
    var entry = renders[i];
    var nextOpts = {};
    for (var name in entry.opts) {
      if (Object.prototype.hasOwnProperty.call(entry.opts, name)) nextOpts[name] = entry.opts[name];
    }
    nextOpts.t = t;
    renderState(entry.container, entry.state, nextOpts);
  }
  if (lastNotify) {
    notify({ level: lastNotify.level, key: lastNotify.key, params: lastNotify.params }, t);
  }
}

var ZainBotFeedback = {
  PHASES: PHASES.slice(),
  LIVE_REGION_ID: LIVE_REGION_ID,
  renderState: renderState,
  notify: notify,
  withPending: withPending,
  refreshLanguage: refreshLanguage
};

if (typeof window !== 'undefined') {
  window.ZainBotFeedback = ZainBotFeedback;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ZainBotFeedback;
}
