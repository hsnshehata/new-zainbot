// QA helper: add summary renderers for the reorganized settings page.
// Idempotent: only registers once. No changes to existing behavior otherwise.
(function () {
  if (window.__zainbotSettingsSummaryPatched) return;
  window.__zainbotSettingsSummaryPatched = true;

  function T() {
    return (window.translations && window.translations[window.currentLanguage]) || {};
  }

  function activeAgent() {
    return window.currentBot || null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function chip(label, on, hintText) {
    const t = T();
    const state = on ? (t.set_state_enabled || 'Enabled') : (t.set_state_disabled || 'Off');
    const color = on ? 'var(--green)' : 'var(--text-muted)';
    const bg = on ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.04)';
    const title = hintText ? ' title="' + esc(hintText) + '"' : '';
    return '<span class="set-chip"' + title + ' style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;background:' + bg + ';color:' + color + ';border:1px solid var(--glass-border);"><span style="width:7px;height:7px;border-radius:50%;background:' + color + ';display:inline-block;"></span>' + esc(label) + ' ΓÇö ' + esc(state) + '</span>';
  }

  function renderInstructionsSummary() {
    const box = document.getElementById('settingsInstructionsSummary');
    const bot = activeAgent();
    if (!box) return;
    const t = T();
    if (!bot) {
      box.innerHTML = '<p style="color:var(--text-muted); font-size:13px; margin:0;">' + esc(t.set_no_agent || 'No active agent selected yet. Create or choose one from the AI Agents page.') + '</p>';
      return;
    }
    const instructions = String(bot.customInstructions || '').trim();
    const lines = instructions ? instructions.split(/\n+/).filter(Boolean).length : 0;
    const objectives = Array.isArray(bot.objectives) ? bot.objectives.filter(Boolean) : [];
    const keywords = Array.isArray(bot.handoffKeywords) ? bot.handoffKeywords.filter(Boolean) : [];
    const welcome = String(bot.welcomeMessage || '').trim();
    box.innerHTML =
      '<div class="set-summary-row"><span class="set-summary-label">' + esc(t.set_label_welcome || 'Welcome message') + '</span><span class="set-summary-value">' + (welcome ? esc(welcome.slice(0, 80)) : esc(t.set_value_not_set || 'Not set')) + '</span></div>' +
      '<div class="set-summary-row"><span class="set-summary-label">' + esc(t.set_label_persona_rules || 'Persona instructions') + '</span><span class="set-summary-value">' + (lines ? esc(lines + ' ' + (t.set_unit_lines || 'lines')) : esc(t.set_value_not_set || 'Not set')) + '</span></div>' +
      '<div class="set-summary-row"><span class="set-summary-label">' + esc(t.set_label_objectives || 'Objectives') + '</span><span class="set-summary-value">' + (objectives.length ? esc(objectives.join(' ┬╖ ')) : esc(t.set_value_not_set || 'Not set')) + '</span></div>' +
      '<div class="set-summary-row"><span class="set-summary-label">' + esc(t.set_label_handoff || 'Human handoff keywords') + '</span><span class="set-summary-value">' + (keywords.length ? esc(keywords.join(', ')) : esc(t.set_value_not_set || 'Not set')) + '</span></div>' +
      '<div class="set-summary-row"><span class="set-summary-label">' + esc(t.set_label_auto_reply || 'AI auto-reply') + '</span><span class="set-summary-value">' + chip(t.set_label_auto_reply || 'AI auto-reply', bot.autoReplyEnabled !== false) + '</span></div>';
  }

  function renderCapabilitiesSummary() {
    const box = document.getElementById('settingsCapabilitiesSummary');
    const bot = activeAgent();
    if (!box) return;
    const t = T();
    if (!bot) {
      box.innerHTML = '<p style="color:var(--text-muted); font-size:13px; margin:0;">' + esc(t.set_no_agent || 'No active agent selected yet. Create or choose one from the AI Agents page.') + '</p>';
      return;
    }
    const tools = bot.agentTools || {};
    const labels = {
      bookingTool: t.set_tool_booking || 'Bookings & appointments',
      orderTrackingTool: t.set_tool_orders || 'Order tracking',
      whatsappNotificationTool: t.set_tool_wa || 'WhatsApp alerts',
      telegramNotificationTool: t.set_tool_tg || 'Telegram alerts',
      salesRecoveryTool: t.set_tool_recovery || 'Abandoned sales recovery',
      dailyDigestTool: t.set_tool_digest || 'Daily digest',
      salesUpsellTool: t.set_tool_upsell || 'Smart upselling'
    };
    const hints = {
      bookingTool: tools.bookingTool && tools.bookingTool.workingHours ? (String(tools.bookingTool.workingHours)) : '',
      dailyDigestTool: tools.dailyDigestTool && tools.dailyDigestTool.digestTime ? (String(tools.dailyDigestTool.digestTime)) : '',
      salesUpsellTool: tools.salesUpsellTool && tools.salesUpsellTool.maxDiscountPercent ? ('Γëñ' + tools.salesUpsellTool.maxDiscountPercent + '%') : ''
    };
    const chips = Object.keys(labels).map((k) => chip(labels[k], !!(tools[k] && tools[k].enabled), hints[k] || ''));
    const skills = Array.isArray(bot.agentSkills) ? bot.agentSkills.filter(Boolean) : [];
    const skillNames = {
      sales_consultant: t.skill_sales || 'Smart Sales Consultant',
      appointment_scheduler: t.skill_appointments || 'Appointment Coordinator',
      order_manager: t.skill_orders || 'Order & Delivery Manager',
      support_specialist: t.skill_support || 'Support & Complaints Specialist',
      winback_agent: t.skill_winback || 'Customer Retention & Win-back'
    };
    const skillChips = skills.map((s) => chip(skillNames[s] || s, true, '')).join('');
    box.innerHTML =
      '<div class="set-summary-row set-summary-wrap"><span class="set-summary-label">' + esc(t.set_label_tools || 'Tools') + '</span><span class="set-summary-value" style="display:flex;flex-wrap:wrap;gap:8px;">' + chips.join('') + '</span></div>' +
      '<div class="set-summary-row set-summary-wrap"><span class="set-summary-label">' + esc(t.set_label_skills || 'Skills') + '</span><span class="set-summary-value" style="display:flex;flex-wrap:wrap;gap:8px;">' + (skillChips || '<span style="color:var(--text-muted);font-size:12px;">' + esc(t.set_value_not_set || 'Not set') + '</span>') + '</span></div>';
  }

  function renderAll() {
    renderInstructionsSummary();
    renderCapabilitiesSummary();
  }

  window.__zainbotRenderSettingsSummary = renderAll;

  document.addEventListener('DOMContentLoaded', () => {
    const openTraining = document.getElementById('openTrainingFromSettingsBtn');
    if (openTraining) {
      openTraining.addEventListener('click', () => {
        if (typeof window.switchTab === 'function') window.switchTab('page-training');
      });
    }
    const openAgents = document.getElementById('openAgentFromSettingsBtn');
    if (openAgents) {
      openAgents.addEventListener('click', () => {
        if (typeof window.switchTab === 'function') window.switchTab('page-agents');
      });
    }
    // Re-render when the settings page is shown: hook into menu-item clicks.
    document.querySelectorAll('.menu-item[data-target="page-settings"]').forEach((el) => {
      el.addEventListener('click', () => setTimeout(renderAll, 60));
    });
    // Also re-render after agent modal closes (agent may have been edited).
    document.querySelectorAll('.agent-modal-close').forEach((el) => {
      el.addEventListener('click', () => setTimeout(renderAll, 200));
    });
    // And after any bot refresh (covers loadAgents + refreshActiveBot flows).
    const origRefresh = window.refreshActiveBot;
    if (typeof origRefresh === 'function') {
      window.refreshActiveBot = function (...args) {
        const r = origRefresh.apply(this, args);
        setTimeout(renderAll, 100);
        return r;
      };
    }
  });
})();
