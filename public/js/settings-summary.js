// Settings summary renderers for the reorganized settings page.
// F05: lazy chunk. No DOMContentLoaded listener (the script executes after
// DOM ready when lazy-loaded, so such a listener would never fire) and no
// refreshActiveBot patch (freshness comes from init() rendering on every
// settings-tab entry plus the dashboard's existing guarded re-render call
// sites). Deps arrive via the create() adapter: state snapshots and copy,
// both read live at use-time. Behavior otherwise identical to the eager
// version (same renderers, same E03 focus-free wiring).
(function (global) {
  'use strict';

  // Deps: { getState: () => ({ translations, bot }) | null,
  //         t: (key) => string }.
  // The dashboard passes live closures over __zainbotSettingsState and the
  // C03 adapter, so language switches need no re-init (read at use-time).
  function create(deps) {
    var opts = deps || {};
    var getState = typeof opts.getState === 'function' ? opts.getState : function () { return null; };
    var translate = typeof opts.t === 'function' ? opts.t : function (key) { return key; };

    var wired = false;

    function tx(key) {
      try {
        return translate(key);
      } catch (err) {
        var table = null;
        try {
          var st = getState();
          table = (st && st.translations) || {};
        } catch (_ignored) { /* offline fallback below */ }
        return (table && table[key]) || key;
      }
    }

    function activeAgent() {
      var st = null;
      try {
        st = getState();
      } catch (_ignored) { /* no state */
      }
      return (st && st.bot) || null;
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function chip(label, on, hintText) {
      var state = on ? tx('set_state_enabled') : tx('set_state_disabled');
      var color = on ? 'var(--green)' : 'var(--text-muted)';
      var bg = on ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)';
      var title = hintText ? ' title="' + esc(hintText) + '"' : '';
      return '<span class="set-chip"' + title + ' style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;background:' + bg + ';color:' + color + ';border:1px solid var(--glass-border);"><span style="width:7px;height:7px;border-radius:50%;background:' + color + ';display:inline-block;"></span>' + esc(label) + ' — ' + esc(state) + '</span>';
    }

    function renderInstructionsSummary() {
      var box = global.document.getElementById('settingsInstructionsSummary');
      var bot = activeAgent();
      if (!box) return;
      if (!bot) {
        box.innerHTML = '<p style="color:var(--text-muted); font-size:13px; margin:0;">' + esc(tx('set_no_agent')) + '</p>';
        return;
      }
      var instructions = String(bot.customInstructions || '').trim();
      var lines = instructions ? instructions.split(/\n+/).filter(Boolean).length : 0;
      var objectives = Array.isArray(bot.objectives) ? bot.objectives.filter(Boolean) : [];
      var keywords = Array.isArray(bot.handoffKeywords) ? bot.handoffKeywords.filter(Boolean) : [];
      var welcome = String(bot.welcomeMessage || '').trim();
      box.innerHTML =
        '<div class="set-summary-row"><span class="set-summary-label">' + esc(tx('set_label_welcome')) + '</span><span class="set-summary-value">' + (welcome ? esc(welcome.slice(0, 80)) : esc(tx('set_value_not_set'))) + '</span></div>' +
        '<div class="set-summary-row"><span class="set-summary-label">' + esc(tx('set_label_persona_rules')) + '</span><span class="set-summary-value">' + (lines ? esc(lines + ' ' + tx('set_unit_lines')) : esc(tx('set_value_not_set'))) + '</span></div>' +
        '<div class="set-summary-row"><span class="set-summary-label">' + esc(tx('set_label_objectives')) + '</span><span class="set-summary-value">' + (objectives.length ? esc(objectives.join(' · ')) : esc(tx('set_value_not_set'))) + '</span></div>' +
        '<div class="set-summary-row"><span class="set-summary-label">' + esc(tx('set_label_handoff')) + '</span><span class="set-summary-value">' + (keywords.length ? esc(keywords.join(', ')) : esc(tx('set_value_not_set'))) + '</span></div>' +
        '<div class="set-summary-row"><span class="set-summary-label">' + esc(tx('set_label_auto_reply')) + '</span><span class="set-summary-value">' + chip(tx('set_label_auto_reply'), bot.autoReplyEnabled !== false) + '</span></div>';
    }

    function renderCapabilitiesSummary() {
      var box = global.document.getElementById('settingsCapabilitiesSummary');
      var bot = activeAgent();
      if (!box) return;
      if (!bot) {
        box.innerHTML = '<p style="color:var(--text-muted); font-size:13px; margin:0;">' + esc(tx('set_no_agent')) + '</p>';
        return;
      }
      var tools = bot.agentTools || {};
      var labels = {
        bookingTool: tx('set_tool_booking'),
        orderTrackingTool: tx('set_tool_orders'),
        whatsappNotificationTool: tx('set_tool_wa'),
        telegramNotificationTool: tx('set_tool_tg'),
        salesRecoveryTool: tx('set_tool_recovery'),
        dailyDigestTool: tx('set_tool_digest'),
        salesUpsellTool: tx('set_tool_upsell')
      };
      var hints = {
        bookingTool: tools.bookingTool && tools.bookingTool.workingHours ? (String(tools.bookingTool.workingHours)) : '',
        dailyDigestTool: tools.dailyDigestTool && tools.dailyDigestTool.digestTime ? (String(tools.dailyDigestTool.digestTime)) : '',
        salesUpsellTool: tools.salesUpsellTool && tools.salesUpsellTool.maxDiscountPercent ? ('≤' + tools.salesUpsellTool.maxDiscountPercent + '%') : ''
      };
      var chips = Object.keys(labels).map(function (k) { return chip(labels[k], !!(tools[k] && tools[k].enabled), hints[k] || ''); });
      var skills = Array.isArray(bot.agentSkills) ? bot.agentSkills.filter(Boolean) : [];
      var skillNames = {
        sales_consultant: tx('skill_sales'),
        appointment_scheduler: tx('skill_appointments'),
        order_manager: tx('skill_orders'),
        support_specialist: tx('skill_support'),
        winback_agent: tx('skill_winback')
      };
      var skillChips = skills.map(function (s) { return chip(skillNames[s] || s, true, ''); }).join('');
      box.innerHTML =
        '<div class="set-summary-row set-summary-wrap"><span class="set-summary-label">' + esc(tx('set_label_tools')) + '</span><span class="set-summary-value" style="display:flex;flex-wrap:wrap;gap:8px;">' + chips.join('') + '</span></div>' +
        '<div class="set-summary-row set-summary-wrap"><span class="set-summary-label">' + esc(tx('set_label_skills')) + '</span><span class="set-summary-value" style="display:flex;flex-wrap;gap:8px;">' + (skillChips || '<span style="color:var(--text-muted);font-size:12px;">' + esc(tx('set_value_not_set')) + '</span>') + '</span></div>';
    }

    function renderAll() {
      renderInstructionsSummary();
      renderCapabilitiesSummary();
    }

    // Explicit entry: wires once, repaints every call. The dashboard calls
    // this on every settings-tab entry (fresh paint replaces the old
    // refreshActiveBot patch); the dashboard's other guarded re-render call
    // sites (bot refresh, post-save, language switch) keep working unchanged.
    function init() {
      if (!wired) {
        wired = true;
        var doc = global.document;
        var openTraining = doc.getElementById('openTrainingFromSettingsBtn');
        if (openTraining) {
          openTraining.addEventListener('click', function () {
            if (typeof global.switchTab === 'function') global.switchTab('page-training');
          });
        }
        var openAgents = doc.getElementById('openAgentFromSettingsBtn');
        if (openAgents) {
          openAgents.addEventListener('click', function () {
            if (typeof global.switchTab === 'function') global.switchTab('page-agents');
          });
        }
        // Re-render after agent modal closes (agent may have been edited).
        // Focus-free timer (E03): never touches focus.
        var closeButtons = doc.querySelectorAll('.agent-modal-close');
        for (var i = 0; i < closeButtons.length; i++) {
          closeButtons[i].addEventListener('click', function () {
            setTimeout(renderAll, 200);
          });
        }
      }
      renderAll();
    }

    return { init: init, render: renderAll };
  }

  // Eager singleton preserves the existing global contract (E03-safe):
  // the dashboard's guarded __zainbotRenderSettingsSummary call sites keep
  // working, and init() is a separate explicit step owned by the tab flow.
  // Deps are live closures so language/state are read at use-time.
  function dashboardDeps() {
    return {
      getState: function () {
        try {
          if (typeof global.__zainbotSettingsState === 'function') return global.__zainbotSettingsState();
        } catch (_ignored) { /* no state */
        }
        return null;
      },
      t: function (key) {
        try {
          if (global.ZainBotDashboardI18n) return global.ZainBotDashboardI18n.t(key);
        } catch (_ignored) { /* offline fallback below */ }
        var table = null;
        try {
          var st = typeof global.__zainbotSettingsState === 'function' ? global.__zainbotSettingsState() : null;
          table = (st && st.translations) || {};
        } catch (_fallbackIgnored) { /* key fallback below */ }
        return (table && table[key]) || key;
      },
    };
  }

  if (global.__zainbotSettingsSummaryPatched) return;
  global.__zainbotSettingsSummaryPatched = true;

  var singleton = create(dashboardDeps());
  global.__zainbotRenderSettingsSummary = function () {
    return singleton.render();
  };
  global.ZainBotSettingsSummary = {
    init: function () {
      return singleton.init();
    },
    render: function () {
      return singleton.render();
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
