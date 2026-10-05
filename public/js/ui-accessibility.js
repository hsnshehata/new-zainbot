'use strict';

/*
 * ZainBot dialog focus primitive — task E01 (plan §7.3).
 *
 * Owns ONLY dialog focus, stack order, and background isolation (inert).
 * It never fetches, never polls, never stores business state, and never
 * touches modal styling classes or timers: the integration handler passed
 * via `onClose` owns timer cleanup and class removal, and E02/E03 migrate each dashboard modal onto this lifecycle one dialog
 * at a time.
 *
 * Contract:
 *   openDialog(element, { initialFocus?, opener?, background?, onClose? })
 *   closeDialog(element)
 *
 * Browser acceptance (real Tab / Shift+Tab / Escape / activeElement) runs
 * after A03 through the shared browser harness; the Node suite proves the
 * same contract with behavioral fixtures (live tab queries, no cached
 * focusables, no DOM library).
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module !== null && typeof module.exports !== 'undefined') {
    module.exports = api;
  }
  if (root) {
    root.ZainBotA11y = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : undefined, function createZainBotA11y() {
  'use strict';

  // Tab stops only. Ancestors/effects (hidden, disabled, inert ancestors,
  // display:none) are filtered in code so fixtures and browsers agree.
  // NOTE: tests/uiAccessibility.test.js carries a minimal matcher for
  // exactly these selector shapes — keep them simple if this list grows.
  const FOCUSABLE_SELECTOR =
    'a[href], button, input, select, textarea, [tabindex], [contenteditable]';

  // Open dialogs, bottom → top. Each entry:
  // { element, opener, initialFocus, onClose, isolated: [element],
  //   addedTabIndex }
  const stack = [];
  let attachedDoc = null;

  function getDocument() {
    if (typeof globalThis !== 'undefined' && globalThis.document) {
      return globalThis.document;
    }
    return null;
  }

  function getAttr(el, name) {
    try {
      if (el && typeof el.getAttribute === 'function') {
        return el.getAttribute(name);
      }
    } catch (err) {
      void err;
    }
    return null;
  }

  function isHiddenByAncestor(el) {
    let node = null;
    try {
      node = el ? el.parentNode : null;
    } catch (err) {
      void err;
      return false;
    }
    while (node && node.nodeType === 1) {
      if (node.hidden === true) {
        return true;
      }
      try {
        if (typeof node.hasAttribute === 'function') {
          if (node.hasAttribute('hidden')) {
            return true;
          }
          const ariaHidden = node.getAttribute('aria-hidden');
          if (ariaHidden === 'true') {
            return true;
          }
        }
      } catch (err) {
        void err;
      }
      node = node.parentNode || null;
    }
    return false;
  }

  function isHiddenByStyle(el) {
    if (!el) {
      return false;
    }
    try {
      const inline = el.style;
      if (inline && (inline.display === 'none' || inline.visibility === 'hidden')) {
        return true;
      }
    } catch (err) {
      void err;
    }
    try {
      const getter =
        typeof globalThis !== 'undefined' && typeof globalThis.getComputedStyle === 'function'
          ? globalThis.getComputedStyle
          : null;
      if (!getter) {
        return false;
      }
      const style = getter(el);
      if (!style) {
        return false;
      }
      return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
    } catch (err) {
      void err;
      return false;
    }
  }

  // Visible + enabled + attached. Used for explicit targets (initialFocus,
  // opener restore). Tab-order membership adds the tabindex/href rules below.
  function isVisibleTarget(el) {
    if (!el || el.nodeType !== 1) {
      return false;
    }
    if (typeof el.isConnected === 'boolean' && !el.isConnected) {
      return false;
    }
    if (el.disabled) {
      return false;
    }
    if (el.hidden === true) {
      return false;
    }
    try {
      if (typeof el.hasAttribute === 'function' && (el.hasAttribute('hidden') || el.hasAttribute('disabled'))) {
        return false;
      }
    } catch (err) {
      void err;
    }
    const typeAttr = getAttr(el, 'type');
    const typeValue = typeAttr !== null && typeAttr !== undefined ? typeAttr : el.type;
    if (String(el.tagName || '').toUpperCase() === 'INPUT' && String(typeValue || '').toLowerCase() === 'hidden') {
      return false;
    }
    if (isHiddenByAncestor(el) || isHiddenByStyle(el)) {
      return false;
    }
    return true;
  }

  function isTabbable(el) {
    if (!isVisibleTarget(el)) {
      return false;
    }
    const tag = String(el.tagName || '').toUpperCase();
    if (tag === 'A' && getAttr(el, 'href') === null && getAttr(el, 'href') === undefined) {
      return false;
    }
    if (String(getAttr(el, 'contenteditable') || '').toLowerCase() === 'false') {
      return false;
    }
    const rawTabindex = getAttr(el, 'tabindex');
    if (rawTabindex !== null && rawTabindex !== undefined) {
      const parsed = Number(rawTabindex);
      if (Number.isNaN(parsed) || parsed < 0) {
        return false;
      }
    }
    return true;
  }

  // Fresh on every call — never cached — so content added after openDialog
  // (dynamic rows, late labels) joins the tab order instead of trapping a
  // stale set. E02 relies on this: dynamic content must never trap stale focus.
  function getFocusableElements(dialog) {
    let nodes = [];
    try {
      if (dialog && typeof dialog.querySelectorAll === 'function') {
        nodes = Array.prototype.slice.call(dialog.querySelectorAll(FOCUSABLE_SELECTOR));
      }
    } catch (err) {
      void err;
      nodes = [];
    }
    return nodes.filter(isTabbable);
  }

  function isInside(root, node) {
    if (!root || !node) {
      return false;
    }
    if (root === node) {
      return true;
    }
    try {
      return typeof root.contains === 'function' ? !!root.contains(node) : false;
    } catch (err) {
      void err;
      return false;
    }
  }

  function focusElement(el) {
    if (!el || typeof el.focus !== 'function') {
      return false;
    }
    try {
      el.focus({ preventScroll: true });
    } catch (err) {
      void err;
      try {
        el.focus();
      } catch (innerErr) {
        void innerErr;
        return false;
      }
    }
    return true;
  }

  function sawInert(el) {
    if (!el) {
      return false;
    }
    if (el.inert === true) {
      return true;
    }
    try {
      return !!(typeof el.hasAttribute === 'function' && el.hasAttribute('inert'));
    } catch (err) {
      void err;
      return false;
    }
  }

  function applyInert(el) {
    try {
      el.inert = true;
    } catch (err) {
      void err;
    }
    try {
      if (typeof el.setAttribute === 'function' && typeof el.hasAttribute === 'function') {
        if (!el.hasAttribute('inert')) {
          el.setAttribute('inert', '');
        }
      }
    } catch (err) {
      void err;
    }
  }

  function restoreInert(el, wasInert) {
    if (!el) {
      return;
    }
    if (wasInert) {
      try {
        el.inert = true;
      } catch (err) {
        void err;
      }
      return;
    }
    try {
      el.inert = false;
    } catch (err) {
      void err;
    }
    try {
      if (typeof el.removeAttribute === 'function') {
        el.removeAttribute('inert');
      }
    } catch (err) {
      void err;
    }
  }

  // Reference-counted isolation: an element stays inert while ANY open
  // dialog still needs it, and unwinds to its pre-stack state only when the
  // last needing entry closes — regardless of close order. (Per-entry
  // prior-state snapshots alone cannot unwind stacked closes correctly:
  // an upper entry would otherwise "restore" the isolation applied by a
  // lower entry still on the stack.)
  const isolationCounts = new Map(); // element -> { count, wasInert }

  function isolateElement(el) {
    const tracked = isolationCounts.get(el);
    if (tracked) {
      tracked.count += 1;
      return;
    }
    const wasInert = sawInert(el);
    isolationCounts.set(el, { count: 1, wasInert });
    if (!wasInert) {
      applyInert(el);
    }
  }

  function releaseElement(el) {
    const tracked = isolationCounts.get(el);
    if (!tracked) {
      return;
    }
    tracked.count -= 1;
    if (tracked.count <= 0) {
      isolationCounts.delete(el);
      restoreInert(el, tracked.wasInert);
    }
  }

  function restoreFocus(entry, doc) {
    if (stack.length > 0) {
      // The stack is still open, so background isolation still holds: the
      // closed dialog's opener may sit in the inert background, where real
      // browsers drop programmatic focus. Focus stays inside the new top
      // dialog instead — its own opener when that opener lives inside it,
      // else its first focusable control.
      const topEntry = stack[stack.length - 1];
      const top = topEntry.element;
      const topOpener = topEntry.opener;
      if (topOpener && isInside(top, topOpener) && isVisibleTarget(topOpener)) {
        focusElement(topOpener);
        return;
      }
      const items = getFocusableElements(top);
      focusElement(items.length > 0 ? items[0] : top);
      return;
    }
    // Stack is empty: isolation is fully released, so the opener is safe.
    const opener = entry ? entry.opener : null;
    if (opener && isVisibleTarget(opener)) {
      focusElement(opener);
      return;
    }
    // Opener gone (removed, hidden, or disabled since open): never leave
    // focus on a detached element. Fall back to the page body.
    if (doc && doc.body) {
      focusElement(doc.body);
    }
  }

  function onKeyDown(event) {
    if (!event || stack.length === 0) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
    const top = stack[stack.length - 1];
    const key = event.key;
    if (key === 'Escape' || key === 'Esc') {
      // Top dialog only: exactly one dialog closes, lower entries keep
      // their isolation until their own close.
      closeDialog(top.element);
      return;
    }
    if (key !== 'Tab') {
      return;
    }
    const doc = getDocument();
    const active = doc ? doc.activeElement : null;
    const target = event.target || null;
    const items = getFocusableElements(top.element);
    const prevent = () => {
      try {
        if (typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
      } catch (err) {
        void err;
      }
    };
    if (items.length === 0) {
      // No-focusable fallback: hold focus on the dialog itself.
      prevent();
      if (!isInside(top.element, active)) {
        focusElement(top.element);
      }
      return;
    }
    if (!isInside(top.element, target) && !isInside(top.element, active)) {
      // Focus escaped the top dialog (programmatic move past inert):
      // pull it back in instead of letting Tab walk the background.
      prevent();
      focusElement(event.shiftKey ? items[items.length - 1] : items[0]);
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (active === first || !isInside(top.element, active))) {
      prevent();
      focusElement(last);
    } else if (!event.shiftKey && (active === last || !isInside(top.element, active))) {
      prevent();
      focusElement(first);
    }
  }

  function onFocusIn(event) {
    if (stack.length === 0) {
      return;
    }
    const top = stack[stack.length - 1].element;
    const target = event ? event.target : null;
    if (isInside(top, target)) {
      return;
    }
    const items = getFocusableElements(top);
    focusElement(items.length > 0 ? items[0] : top);
  }

  function attachListeners() {
    if (attachedDoc) {
      return;
    }
    const doc = getDocument();
    if (!doc || typeof doc.addEventListener !== 'function') {
      return;
    }
    // Capture phase: the trap runs before dialog-level handlers so Tab can
    // never walk an inert background, and Escape always resolves to the top.
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('focusin', onFocusIn);
    attachedDoc = doc;
  }

  function detachListeners() {
    if (!attachedDoc) {
      return;
    }
    try {
      if (typeof attachedDoc.removeEventListener === 'function') {
        attachedDoc.removeEventListener('keydown', onKeyDown, true);
        attachedDoc.removeEventListener('focusin', onFocusIn);
      }
    } catch (err) {
      void err;
    }
    attachedDoc = null;
  }

  function openDialog(element, options) {
    if (!element || element.nodeType !== 1) {
      throw new TypeError('ZainBotA11y.openDialog requires a dialog HTMLElement.');
    }
    const opts = options || {};
    const existing = stack.find((entry) => entry.element === element);
    if (existing) {
      // Reopen is idempotent: no duplicate stack entry, no extra
      // listeners, no re-applied isolation. Refresh hooks only.
      if (opts.opener !== undefined) {
        existing.opener = opts.opener || null;
      }
      if (opts.onClose !== undefined) {
        existing.onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
      }
      if (opts.initialFocus !== undefined) {
        existing.initialFocus = opts.initialFocus || null;
      }
      return;
    }
    const doc = getDocument();
    let opener = opts.opener || null;
    if ((!opener || opener.nodeType !== 1) && doc && doc.activeElement && doc.activeElement.nodeType === 1) {
      opener = doc.activeElement;
    }
    if (opener && typeof opener.isConnected === 'boolean' && !opener.isConnected) {
      opener = null;
    }

    const isolated = [];
    const seen = new Set();
    const isolate = (candidate) => {
      if (!candidate || candidate.nodeType !== 1 || candidate === element || seen.has(candidate)) {
        return;
      }
      try {
        // Never inert an ancestor of the dialog itself: that would isolate
        // the dialog along with the background.
        if (typeof candidate.contains === 'function' && candidate.contains(element)) {
          return;
        }
      } catch (err) {
        void err;
      }
      seen.add(candidate);
      isolated.push(candidate);
      isolateElement(candidate);
    };
    const background = Array.isArray(opts.background)
      ? opts.background
      : opts.background
        ? [opts.background]
        : [];
    background.forEach(isolate);
    // Stacked dialogs: lower dialogs isolate like background. They restore
    // only when no remaining entry still needs them (see releaseIsolation),
    // so stacked dialogs never release isolation early.
    stack.forEach((entry) => isolate(entry.element));

    const entry = {
      element,
      opener: opener || null,
      initialFocus: opts.initialFocus || null,
      onClose: typeof opts.onClose === 'function' ? opts.onClose : null,
      isolated,
      addedTabIndex: false,
    };
    stack.push(entry);
    attachListeners();

    let target = null;
    if (entry.initialFocus && entry.initialFocus.nodeType === 1 && isInside(element, entry.initialFocus)) {
      if (isVisibleTarget(entry.initialFocus)) {
        target = entry.initialFocus;
      }
    }
    if (!target) {
      const items = getFocusableElements(element);
      target = items.length > 0 ? items[0] : null;
    }
    if (target) {
      focusElement(target);
      return;
    }
    if (getAttr(element, 'tabindex') === null || getAttr(element, 'tabindex') === undefined) {
      try {
        if (typeof element.setAttribute === 'function') {
          element.setAttribute('tabindex', '-1');
          entry.addedTabIndex = true;
        }
      } catch (err) {
        void err;
      }
    }
    focusElement(element);
  }

  function closeDialog(element) {
    if (!element || element.nodeType !== 1) {
      return;
    }
    const index = stack.findIndex((entry) => entry.element === element);
    if (index === -1) {
      return;
    }
    const wasTop = index === stack.length - 1;
    const [entry] = stack.splice(index, 1);
    for (const isolatedEl of entry.isolated) {
      releaseElement(isolatedEl);
    }
    const doc = getDocument();
    try {
      if (entry.addedTabIndex) {
        try {
          if (entry.element && typeof entry.element.removeAttribute === 'function') {
            entry.element.removeAttribute('tabindex');
          }
        } catch (err) {
          void err;
        }
      }
      // Integration-handler hook: timer cleanup and modal class removal
      // live here in E02/E03 consumers — never inside this helper.
      if (typeof entry.onClose === 'function') {
        entry.onClose();
      }
    } finally {
      // Closing a covered dialog never steals focus from the top dialog.
      if (wasTop) {
        restoreFocus(entry, doc);
      }
      if (stack.length === 0) {
        detachListeners();
      }
    }
  }

  return {
    openDialog,
    closeDialog,
  };
});
