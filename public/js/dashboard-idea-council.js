// public/js/dashboard-idea-council.js
// F04d: eager council chunk — render helpers (F04b) + form/event
// controllers (F04c) + polling/report/export lifecycle (this task).
// Eager <script>, NO lazy in this patch. Dictionaries stay in
// dashboard_new.js (t/getLanguage in, never copied). Council state is
// module-private; timers owned: ideaAutoSaveTimer + ideaPollTimer + the
// 800ms open-after-complete timer (all cleared in dispose).
(function (global) {
  'use strict';

  // Contract: window.ZainBotIdeaCouncil.create({ requestJson, fetchBlob,
  // getLanguage, t, feedback, a11y, onListReady })
  //   -> { init, load, dispose, refreshLanguage, ...transitional surface }.
  // requestJson/t/getLanguage/fetchBlob are consumed; feedback is accepted
  // + reserved (confirm/alert stay verbatim per D09-F4); a11y feeds the two
  // E03-owned modals with live-DOM fallback. onListReady is an optional
  // host hook fired after a successful list paint so the host can retire
  // its own loading announcement (the global live region keeps the last
  // message otherwise). The F04c host bridge is gone:
  // the d-slice lives here now.
  function create(deps) {
    const opts = deps || {};
    const t = opts.t;
    const getLanguage = opts.getLanguage;
    const requestJson = opts.requestJson;
    const fetchBlob = opts.fetchBlob;
    const onListReady = typeof opts.onListReady === 'function' ? opts.onListReady : null;
    if (typeof t !== 'function') {
      throw new Error('[idea-council] create() requires t(key, fallback?)');
    }
    if (typeof getLanguage !== 'function') {
      throw new Error('[idea-council] create() requires getLanguage()');
    }
    if (typeof requestJson !== 'function') {
      throw new Error('[idea-council] create() requires requestJson(url, options, policy)');
    }
    if (typeof fetchBlob !== 'function') {
      throw new Error('[idea-council] create() requires fetchBlob(url, options, policy)');
    }
    const { feedback } = opts;
    void feedback;
    // Explicit a11y dep (E01 primitive); live-DOM fallback keeps the two
    // E03-owned modals working exactly as before if not injected.
    const a11y = opts.a11y
      || (typeof window !== 'undefined' ? window.ZainBotA11y : null)
      || null;

    // Session-expiry behavior, verbatim from apiFetch (401 matrix: D02).
    function handleUnauthorized() {
      try { localStorage.removeItem('token'); } catch (_ignored) { /* storage blocked */ }
      window.location.href = '/login';
    }

    // C03 language registry (live lookup at use-time, never snapshotted).
    function languageRegistry() {
      if (typeof window !== 'undefined' && window.ZainBotDashboardI18n
        && typeof window.ZainBotDashboardI18n.registerLanguageRenderer === 'function') {
        return window.ZainBotDashboardI18n;
      }
      return null;
    }

    // Council-private state (moved host-side in F04c; lastIdeas +
    // currentView + unregister handle added for the F04d lifecycle).
    let currentIdea = null;
    let currentIdeaRunId = null;
    let ideaAutoSaveTimer = null;
    let ideaPollTimer = null;
    let pendingOpenTimer = null;
    let ideaCurrentFilter = 'ALL';
    let ideaUsageData = null;
    let activeIdeaRunId = null;
    let activeFollowupType = 'DEFEND';
    let lastIdeas = null;
    let currentView = 'list';
    let unregisterLanguageRenderer = null;

    // Run re-select with module-owned write-back (F04b shim logic, absorbed).
    function selectRun(runId) {
      activeIdeaRunId = renderIdeaReport(currentIdea, runId, ideaUsageData, activeIdeaRunId);
    }

  const COUNCIL_MEMBERS = [
    { key: 'COLD_CUSTOMER', icon: 'fa-user-check', labelKey: 'member_cold_customer', roleKey: 'member_cold_customer_role' },
    { key: 'HARSH_AUDITOR', icon: 'fa-shield-halved', labelKey: 'member_harsh_auditor', roleKey: 'member_harsh_auditor_role' },
    { key: 'EXECUTION_EXPERT', icon: 'fa-laptop-code', labelKey: 'member_execution_expert', roleKey: 'member_execution_expert_role' },
    { key: 'MARKET_RESEARCHER', icon: 'fa-chart-line', labelKey: 'member_market_researcher', roleKey: 'member_market_researcher_role' },
    { key: 'DEVILS_ADVOCATE', icon: 'fa-fire', labelKey: 'member_devils_advocate', roleKey: 'member_devils_advocate_role' },
    { key: 'WEDGE_HUNTER', icon: 'fa-bullseye', labelKey: 'member_wedge_hunter', roleKey: 'member_wedge_hunter_role' },
    { key: 'UX_DESIGNER', icon: 'fa-compass-drafting', labelKey: 'member_ux_designer', roleKey: 'member_ux_designer_role' },
    { key: 'CANDID_CHAMPION', icon: 'fa-award', labelKey: 'member_candid_champion', roleKey: 'member_candid_champion_role' }
  ];

  function escapeIdeaHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // D09-F2: every view switch stops polling + the pending open. Timers
  // already fired or cleared are no-ops here, so the run-completion flow
  // (timer cleared in poll, pending timer already fired) is unaffected —
  // while a stale run can never hijack a fresh view again.
  function stopIdeaPolling() {
    if (ideaPollTimer) clearInterval(ideaPollTimer);
    ideaPollTimer = null;
    if (pendingOpenTimer) clearTimeout(pendingOpenTimer);
    pendingOpenTimer = null;
  }

  function showIdeaView(viewName) {
    stopIdeaPolling();
    currentView = viewName;
    const viewMap = {
      list: document.getElementById('ideaListView'),
      input: document.getElementById('ideaInputView'),
      card: document.getElementById('ideaCardView'),
      session: document.getElementById('ideaSessionView'),
      report: document.getElementById('ideaReportView')
    };
    Object.keys(viewMap).forEach(key => {
      if (viewMap[key]) {
        viewMap[key].style.display = (key === viewName ? 'block' : 'none');
      }
    });
  }

  function populateStructuredCardForm(card) {
    if (!card) return;
    const alternativesVal = Array.isArray(card.currentAlternatives || card.alternatives)
      ? (card.currentAlternatives || card.alternatives).join(', ')
      : (card.currentAlternatives || card.alternatives || '');

    const flds = {
      ideaCardFldTitle: card.title || '',
      ideaCardFldPitch: card.elevatorPitch || card.valueProposition || '',
      ideaCardFldCustomer: card.targetCustomer || '',
      ideaCardFldRevenue: card.revenueModel || card.businessModel || '',
      ideaCardFldProblem: card.coreProblem || card.problem || '',
      ideaCardFldSolution: card.proposedSolution || card.solution || '',
      ideaCardFldValue: card.valueProposition || card.elevatorPitch || '',
      ideaCardFldAlternatives: alternativesVal,
      ideaCardFldCoreQuestion: card.coreEvaluationQuestion || card.criticalQuestion || card.criticalQuestionToSettle || ''
    };
    Object.keys(flds).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = flds[id];
    });
    const chk = document.getElementById('ideaConfirmCheckbox');
    if (chk) chk.checked = false;
  }

  function updateIdeaCharCount() {
    const rawEl = document.getElementById('ideaRawText');
    const charEl = document.getElementById('ideaCharCount');
    if (!rawEl || !charEl) return;
    const len = rawEl.value.length;
    charEl.textContent = `${len} / 8,000`;
    charEl.style.color = (len >= 100 && len <= 8000) ? 'var(--cyan)' : 'var(--text-muted)';
  }

  function renderCouncilAgentsGrid(agents = []) {
    const grid = document.getElementById('ideaAgentsGrid');
    if (!grid) return;

    grid.innerHTML = COUNCIL_MEMBERS.map(member => {
      const agentResult = agents.find(a => a.role === member.key);
      const status = agentResult?.status || 'PENDING';
      const output = agentResult?.output;
      const insight = output?.summary || agentResult?.keyInsight || agentResult?.recommendation || '';

      const statusMap = {
      PENDING: { label: t('idea_status_pending'), color: 'var(--text-muted)', icon: 'fa-clock' },
      RUNNING: { label: t('idea_status_running'), color: 'var(--cyan)', icon: 'fa-spinner fa-spin' },
      COMPLETED: { label: t('idea_status_completed'), color: 'var(--green)', icon: 'fa-check' },
      FAILED: { label: t('idea_status_failed'), color: 'var(--red)', icon: 'fa-times' }
      };

      const sm = statusMap[status] || statusMap.PENDING;
      const roleName = t(member.labelKey, member.key);

      return `
        <div class="glass-card" style="padding:16px; display:flex; flex-direction:column; justify-content:space-between; border-inline-start:3px solid ${sm.color};">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <i class="fas ${member.icon}" style="color:var(--cyan); font-size:16px;"></i>
                <strong style="font-size:13px; color:#fff;">${escapeIdeaHtml(roleName)}</strong>
              </div>
              <span style="font-size:11px; color:${sm.color}; display:flex; align-items:center; gap:4px;">
                <i class="fas ${sm.icon}"></i> ${escapeIdeaHtml(sm.label)}
              </span>
            </div>
            <p style="font-size:12px; color:var(--text-muted); margin:0; line-height:1.4;">
              ${insight ? escapeIdeaHtml(insight) : t('idea_awaiting_evidence')}
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderRunsHistoryBar(runs = [], activeId = null) {
    const historyBar = document.getElementById('ideaRoundsHistoryBar');
    const buttonsContainer = document.getElementById('ideaRunsButtons');
    const bannerEl = document.getElementById('ideaCurrentRoundBanner');
    if (!historyBar || !buttonsContainer) return;

    if (!Array.isArray(runs) || runs.length <= 1) {
      historyBar.style.display = 'none';
      return;
    }

    historyBar.style.display = 'flex';
    buttonsContainer.innerHTML = '';

      const followupTypeKeys = {
        DEFEND: 'idea_followup_defend',
        PIVOT: 'idea_followup_pivot',
        VALIDATION_PLAN: 'idea_followup_validation',
        VOTE: 'idea_followup_vote',
        COMPARE: 'idea_followup_compare',
        MVP: 'idea_followup_mvp'
      };

    let activeRunObj = null;

    runs.forEach((run, idx) => {
      const runId = run.runId || run._id;
      const roundNum = run.roundNumber || (idx + 1);
      const isSelected = String(runId) === String(activeId) || (!activeId && idx === runs.length - 1);
      if (isSelected) activeRunObj = run;

      let roundLabel = '';
      if (idx === 0) {
        roundLabel = t('idea_round_1');
      } else {
        const typeKey = followupTypeKeys[run.followupType];
        const typeLabel = typeKey ? t(typeKey) : (run.followupType || '');
        const suffix = typeLabel ? ` (${typeLabel})` : '';
        roundLabel = t('idea_round_n').replace('{n}', roundNum).replace('{suffix}', suffix);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`;
      btn.style.fontSize = '12px';
      btn.style.padding = '6px 12px';
      btn.innerHTML = `${isSelected ? '<i class="fas fa-check-circle" style="margin-inline-end:4px;"></i>' : ''}${escapeIdeaHtml(roundLabel)}`;
      btn.addEventListener('click', () => {
        selectRun(runId);
      });
      buttonsContainer.appendChild(btn);
    });

    const compareBtn = document.getElementById('ideaCompareRoundsBtn');
    if (compareBtn) {
      compareBtn.style.display = runs.length >= 2 ? 'inline-flex' : 'none';
    }

    if (bannerEl) {
      if (activeRunObj && activeRunObj.followupPrompt) {
        const promptSnippet = activeRunObj.followupPrompt.length > 70 ? activeRunObj.followupPrompt.slice(0, 70) + '...' : activeRunObj.followupPrompt;
        bannerEl.innerHTML = `<span style="color:var(--text-muted);">${t('idea_round_input')}</span> <strong style="color:var(--cyan); font-weight:500;">"${escapeIdeaHtml(promptSnippet)}"</strong>`;
      } else {
        const isLatest = activeRunObj && runs.length > 0 && String(activeRunObj.runId || activeRunObj._id) === String(runs[runs.length - 1].runId || runs[runs.length - 1]._id);
        bannerEl.innerHTML = isLatest 
      ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:var(--green); font-size:11px;">${t('idea_round_latest')}</span>`
      : `<span class="badge" style="background:rgba(245,158,11,0.15); color:var(--orange); font-size:11px;">${t('idea_round_archive')}</span>`;
      }
    }
  }

  function renderIdeaReport(idea, selectedRunId = null, usage = null, prevActiveRunId = null) {
    // Resolve completed runs history
    const runs = Array.isArray(idea.runs) && idea.runs.length > 0 ? idea.runs : (idea.latestRun ? [idea.latestRun] : []);

    let currentRun = null;
    if (selectedRunId) {
      currentRun = runs.find(rn => String(rn.runId || rn._id) === String(selectedRunId));
    }
    if (!currentRun && prevActiveRunId) {
      currentRun = runs.find(rn => String(rn.runId || rn._id) === String(prevActiveRunId));
    }
    if (!currentRun && runs.length > 0) {
      currentRun = runs[runs.length - 1];
    }

    const activeRunId = currentRun?.runId || currentRun?._id || idea.latestRunId || null;

    renderRunsHistoryBar(runs, activeRunId);

    const r = currentRun?.finalReport || idea.synthesisReport || {};

    const vBadge = document.getElementById('ideaVerdictBadge');
    if (vBadge) {
      const vColors = {
        BUILD: { bg: 'rgba(16, 185, 129, 0.2)', text: 'var(--green)', labelKey: 'idea_verdict_build' },
        VALIDATE_FIRST: { bg: 'rgba(6, 182, 212, 0.2)', text: 'var(--cyan)', labelKey: 'idea_verdict_validate' },
        PIVOT: { bg: 'rgba(245, 158, 11, 0.2)', text: 'var(--orange)', labelKey: 'idea_verdict_pivot' },
        DO_NOT_BUILD: { bg: 'rgba(239, 68, 68, 0.2)', text: 'var(--red)', labelKey: 'idea_verdict_do_not_build' }
      };
      const vc = vColors[r.verdict] || vColors.VALIDATE_FIRST;
      vBadge.style.background = vc.bg;
      vBadge.style.color = vc.text;
      vBadge.textContent = t(vc.labelKey, r.verdict || 'VALIDATE_FIRST');
    }

    const titleEl = document.getElementById('ideaReportTitle');
    if (titleEl) titleEl.textContent = r.summary || idea.structuredCard?.title || idea.title || '—';

    const execEl = document.getElementById('ideaExecSummary');
    if (execEl) execEl.textContent = r.executiveSummary || '—';

    const explEl = document.getElementById('ideaVerdictExplanation');
    if (explEl) explEl.textContent = r.verdictExplanation || '—';

    const sevenDayEl = document.getElementById('idea7DayVerdictText');
    if (sevenDayEl) {
      sevenDayEl.textContent = r.sevenDayBuildVerdict?.recommendation || (r.sevenDayBuildVerdict?.canBuildIn7Days ? 'YES' : 'NO') || '—';
    }

    const oppEl = document.getElementById('ideaStrongestOpportunity');
    if (oppEl) oppEl.textContent = r.strongestOpportunity || '—';

    const riskEl = document.getElementById('ideaBiggestRisk');
    if (riskEl) riskEl.textContent = r.biggestRisk || '—';

    const assumpList = document.getElementById('ideaTopAssumptionsList');
    if (assumpList) {
      const items = Array.isArray(r.top3Assumptions) ? r.top3Assumptions : [];
      assumpList.innerHTML = items.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('') || '<li>—</li>';
    }

    const questEl = document.getElementById('ideaCriticalQuestion');
    if (questEl) questEl.textContent = r.criticalQuestionToSettle || r.criticalQuestion || '—';

    const cutList = document.getElementById('ideaCutList');
    if (cutList) {
      const items = (Array.isArray(r.cutListForV1) && r.cutListForV1.length > 0)
        ? r.cutListForV1
        : (Array.isArray(r.killOrDeferList) ? r.killOrDeferList : []);
      cutList.innerHTML = items.map(c => `<li>${escapeIdeaHtml(c)}</li>`).join('') || '<li>—</li>';
    }

    const vp = r.validationPlan || {};
    const valFields = {
      ideaValHypothesis: vp.coreHypothesis || vp.hypothesis || '—',
      ideaValAudience: vp.targetAudience || vp.audience || '—',
      ideaValChannel: vp.testingChannel || vp.channel || '—',
      ideaValDuration: vp.suggestedDuration || vp.duration || '—',
      ideaValMetric: vp.successMetric || vp.metric || '—',
      ideaValStop: vp.stopCondition || vp.stopCriteria || '—'
    };
    Object.keys(valFields).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = valFields[id];
    });

    const mvpList = document.getElementById('ideaMvpScopeList');
    if (mvpList) {
      let feats = [];
      if (Array.isArray(r.sevenDayMvpScope)) {
        feats = r.sevenDayMvpScope;
      } else if (Array.isArray(r.sevenDayMvpScope?.coreFeatures)) {
        feats = r.sevenDayMvpScope.coreFeatures;
      }
      mvpList.innerHTML = feats.map(f => `<li>${escapeIdeaHtml(f)}</li>`).join('') || '<li>—</li>';
    }

    const wedgeVal = r.sevenDayMvpScope?.uniqueWedge || r.uniqueWedge || '—';
    const wedgeEl = document.getElementById('ideaUniqueWedge');
    if (wedgeEl) wedgeEl.textContent = wedgeVal;

    const firstVal = r.sevenDayMvpScope?.firstMomentOfValue || r.firstMomentOfValue || '';
    const firstValEl = document.getElementById('ideaFirstMomentOfValue');
    if (firstValEl) {
      if (firstVal) {
        firstValEl.textContent = t('idea_first_moment').split('{v}').join(firstVal);
      } else {
        firstValEl.textContent = '';
      }
    }

    const sourcesList = document.getElementById('ideaSourcesList');
    if (sourcesList) {
      const sources = Array.isArray(currentRun?.sourceReferences) && currentRun.sourceReferences.length > 0
        ? currentRun.sourceReferences
        : (Array.isArray(idea.marketResearchPack?.sources) ? idea.marketResearchPack.sources : (r.sources || []));
      if (sources.length === 0) {
        sourcesList.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">${t('idea_no_sources')}</span>`;
      } else {
        sourcesList.innerHTML = sources.map(s => `
          <div style="font-size:12px; padding:8px 12px; background:rgba(255,255,255,0.02); border-radius:6px; border:1px solid var(--glass-border);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <a href="${escapeIdeaHtml(s.url)}" target="_blank" rel="noopener" style="color:var(--cyan); font-weight:600;">
                ${escapeIdeaHtml(s.title || s.url)}
              </a>
              <span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan); font-size:10px;">${escapeIdeaHtml(s.credibilityScore || 'WEB')}</span>
            </div>
            ${s.snippet ? `<p style="margin:4px 0 0 0; color:var(--text-muted); font-size:11px;">${escapeIdeaHtml(s.snippet)}</p>` : ''}
          </div>
        `).join('');
      }
    }

    const followCountEl = document.getElementById('ideaFollowupCountText');
    const isSuperadmin = Boolean(usage?.isSuperadmin || idea.isSuperadmin);
    const roundsRem = isSuperadmin ? '∞' : (idea.followupRoundsRemaining ?? idea.followUpRoundsRemaining ?? Math.max(0, 3 - (idea.followupRoundsUsed || 0)));
    if (followCountEl) followCountEl.textContent = roundsRem;

    document.querySelectorAll('.idea-followup-btn').forEach(btn => {
      btn.disabled = !isSuperadmin && (Number(roundsRem) <= 0);
    });

    const agents = currentRun?.agents || idea.agents || idea.latestRun?.agents || [];
    renderUnitEconomics(r.unitEconomics);
    renderCriticsBreakdown(agents);

    const truthItems = currentRun?.truthBoard || idea.truthBoardItems || r.truthBoardItems || [];
    renderTruthBoard(truthItems, updateTruthItem);

    return activeRunId;
  }

  function renderCriticsBreakdown(agents = []) {
    const container = document.getElementById('ideaCriticsBreakdownList');
    if (!container) return;

    if (!Array.isArray(agents) || agents.length === 0) {
      container.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">${t('idea_no_critiques')}</div>`;
      return;
    }

    const cardsHtml = COUNCIL_MEMBERS.map(member => {
      const agent = agents.find(a => a.role === member.key);
      const output = agent?.output || {};
      const status = agent?.status || (output && Object.keys(output).length > 0 ? 'COMPLETED' : 'PENDING');
      const roleTitle = t(member.labelKey, member.key);
      const roleDesc = t(member.roleKey, '');

      let metricsHtml = '';
      if (member.key === 'COLD_CUSTOMER') {
        metricsHtml = `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-bottom:12px; font-size:12px;">
            <div style="background:rgba(239, 68, 68, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(239, 68, 68, 0.2);">
              <strong style="color:var(--red); display:block; margin-bottom:2px;">${t('idea_critic_rejection')}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.rejectionReason || '—')}</span>
            </div>
            <div style="background:rgba(245, 158, 11, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(245, 158, 11, 0.2);">
              <strong style="color:var(--orange); display:block; margin-bottom:2px;">${t('idea_critic_switching')}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.switchingCost || '—')}</span>
            </div>
            <div style="background:rgba(6, 182, 212, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(6, 182, 212, 0.2);">
              <strong style="color:var(--cyan); display:block; margin-bottom:2px;">${t('idea_critic_trigger')}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.triggerToTry || '—')}</span>
            </div>
            ${output.willingnessToPay ? `
            <div style="background:rgba(16, 185, 129, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(16, 185, 129, 0.2);">
              <strong style="color:var(--green); display:block; margin-bottom:2px;">${t('idea_critic_willingness')}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.willingnessToPay)}</span>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'HARSH_AUDITOR') {
        const assumptions = Array.isArray(output.top3Assumptions) ? output.top3Assumptions : [];
        const hardQuestions = Array.isArray(output.hardQuestions) ? output.hardQuestions : [];
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.weakestLink ? `
            <div style="background:rgba(239, 68, 68, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(239, 68, 68, 0.2);">
              <strong style="color:var(--red);">${t('idea_weakest_link')}</strong>
              <span style="color:#e2e8f0; margin-inline-start:4px;">${escapeIdeaHtml(output.weakestLink)}</span>
            </div>` : ''}
            ${assumptions.length > 0 ? `
            <div>
              <strong style="color:var(--orange); display:block; margin-bottom:4px;">${t('idea_deadliest_assumptions')}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${assumptions.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('')}
              </ul>
            </div>` : ''}
            ${hardQuestions.length > 0 ? `
            <div>
              <strong style="color:var(--cyan); display:block; margin-bottom:4px;">${t('idea_hard_questions')}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${hardQuestions.map(q => `<li>${escapeIdeaHtml(q)}</li>`).join('')}
              </ul>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'EXECUTION_EXPERT') {
        const mvpScope = Array.isArray(output.mvpScope7Days) ? output.mvpScope7Days : [];
        const deferred = Array.isArray(output.deferredItems) ? output.deferredItems : [];
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="color:var(--text-muted);">${t('idea_complexity_level')}</span>
              <span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan); font-weight:700;">${escapeIdeaHtml(output.complexityLevel || 'MEDIUM')}</span>
            </div>
            ${mvpScope.length > 0 ? `
            <div>
              <strong style="color:var(--purple-light); display:block; margin-bottom:4px;">${t('idea_mvp_scope')}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${mvpScope.map(item => `<li>${escapeIdeaHtml(item)}</li>`).join('')}
              </ul>
            </div>` : ''}
            ${deferred.length > 0 ? `
            <div>
              <strong style="color:var(--text-muted); display:block; margin-bottom:4px;">${t('idea_cut_deferred')}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:var(--text-muted);">
                ${deferred.map(item => `<li>${escapeIdeaHtml(item)}</li>`).join('')}
              </ul>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'MARKET_RESEARCHER') {
        const directAlts = Array.isArray(output.directAlternatives) ? output.directAlternatives : [];
        const indirectAlts = Array.isArray(output.indirectAlternatives) ? output.indirectAlternatives : [];
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            <div style="display:flex; gap:12px; align-items:center;">
              <span style="color:var(--text-muted);">${t('idea_market_saturation')}</span>
              <strong style="color:#fff;">${escapeIdeaHtml(output.marketSaturation || '—')}</strong>
            </div>
            ${directAlts.length > 0 ? `
            <div>
              <strong style="color:var(--cyan); display:block; margin-bottom:4px;">${t('idea_direct_competitors')}</strong>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${directAlts.map(alt => `<span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan);">${escapeIdeaHtml(alt)}</span>`).join('')}
              </div>
            </div>` : ''}
            ${indirectAlts.length > 0 ? `
            <div>
              <strong style="color:var(--text-muted); display:block; margin-bottom:4px;">${t('idea_indirect_alternatives')}</strong>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${indirectAlts.map(alt => `<span class="badge" style="background:rgba(255,255,255,0.06); color:var(--text-muted);">${escapeIdeaHtml(alt)}</span>`).join('')}
              </div>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'DEVILS_ADVOCATE') {
        const conditions = Array.isArray(output.failureConditions) ? output.failureConditions : [];
        const warnings = Array.isArray(output.earlyWarningSigns) ? output.earlyWarningSigns : [];
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.primaryFailureReason ? `
            <div style="background:rgba(239, 68, 68, 0.1); border-radius:6px; padding:10px 12px; border:1px solid rgba(239, 68, 68, 0.3);">
              <strong style="color:var(--red); display:block; margin-bottom:3px;">${t('idea_root_cause')}</strong>
              <span style="color:#fff; font-weight:600;">${escapeIdeaHtml(output.primaryFailureReason)}</span>
            </div>` : ''}
            ${conditions.length > 0 ? `
            <div>
              <strong style="color:var(--red); display:block; margin-bottom:4px;">${t('idea_failure_conditions')}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${conditions.map(c => `<li>${escapeIdeaHtml(c)}</li>`).join('')}
              </ul>
            </div>` : ''}
            ${warnings.length > 0 ? `
            <div>
              <strong style="color:var(--orange); display:block; margin-bottom:4px;">${t('idea_early_warnings')}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${warnings.map(w => `<li>${escapeIdeaHtml(w)}</li>`).join('')}
              </ul>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'WEDGE_HUNTER') {
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.uniqueWedge ? `
            <div style="background:rgba(168, 85, 247, 0.1); border-radius:6px; padding:10px 12px; border:1px solid rgba(168, 85, 247, 0.3);">
              <strong style="color:var(--purple-light); display:block; margin-bottom:3px;">${t('idea_wedge_angle')}</strong>
              <span style="color:#fff;">${escapeIdeaHtml(output.uniqueWedge)}</span>
            </div>` : ''}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <strong style="color:var(--cyan); display:block;">${t('idea_defensibility')}</strong>
                <span style="color:#cbd5e1;">${escapeIdeaHtml(output.defensibility || '—')}</span>
              </div>
              <div>
                <strong style="color:var(--orange); display:block;">${t('idea_copy_ease')}</strong>
                <span style="color:#cbd5e1;">${escapeIdeaHtml(output.easeOfCopying || '—')}</span>
              </div>
            </div>
          </div>
        `;
      } else if (member.key === 'UX_DESIGNER') {
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.firstMomentOfValue60s ? `
            <div style="background:rgba(6, 182, 212, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(6, 182, 212, 0.2);">
              <strong style="color:var(--cyan); display:block; margin-bottom:2px;">${t('idea_first_value_60s')}</strong>
              <span style="color:#fff;">${escapeIdeaHtml(output.firstMomentOfValue60s)}</span>
            </div>` : ''}
            ${output.biggestFriction ? `
            <div style="background:rgba(239, 68, 68, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(239, 68, 68, 0.2);">
              <strong style="color:var(--red); display:block; margin-bottom:2px;">${t('idea_friction_point')}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.biggestFriction)}</span>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'CANDID_CHAMPION') {
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.coreStrength ? `
            <div style="background:rgba(16, 185, 129, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(16, 185, 129, 0.2);">
              <strong style="color:var(--green); display:block; margin-bottom:2px;">${t('idea_core_strength')}</strong>
              <span style="color:#fff;">${escapeIdeaHtml(output.coreStrength)}</span>
            </div>` : ''}
            ${output.reasonToProceed ? `
            <div>
              <strong style="color:var(--cyan); display:block; margin-bottom:2px;">${t('idea_proceed_reason')}</strong>
              <span style="color:#cbd5e1;">${escapeIdeaHtml(output.reasonToProceed)}</span>
            </div>` : ''}
            ${output.indispensableAsset ? `
            <div>
              <strong style="color:var(--orange); display:block; margin-bottom:2px;">${t('idea_indispensable_asset')}</strong>
              <span style="color:#cbd5e1;">${escapeIdeaHtml(output.indispensableAsset)}</span>
            </div>` : ''}
          </div>
        `;
      }

      return `
        <div class="glass-card" style="padding:16px 20px; border-inline-start:4px solid var(--cyan); background:rgba(15, 23, 42, 0.65);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:36px; height:36px; border-radius:8px; background:rgba(6,182,212,0.12); display:flex; align-items:center; justify-content:center; color:var(--cyan); font-size:16px;">
                <i class="fas ${member.icon}"></i>
              </div>
              <div>
                <strong style="font-size:14px; color:#fff; display:block;">${escapeIdeaHtml(roleTitle)}</strong>
                <span style="font-size:12px; color:var(--text-muted);">${escapeIdeaHtml(roleDesc)}</span>
              </div>
            </div>
            ${(() => {
              const isCarryover = Boolean(agent?.isFromPreviousRound);
              let bLabel = t('idea_round_analyzed');
              let bBg = 'rgba(16, 185, 129, 0.15)';
              let bColor = 'var(--green)';

              if (status !== 'COMPLETED') {
                bLabel = t('idea_round_review');
                bBg = 'rgba(245, 158, 11, 0.15)';
                bColor = 'var(--orange)';
              } else if (isCarryover) {
                bLabel = t('idea_round_prior');
                bBg = 'rgba(6, 182, 212, 0.15)';
                bColor = 'var(--cyan)';
              }

              return `<span class="badge" style="background:${bBg}; color:${bColor}; font-size:11px;">${escapeIdeaHtml(bLabel)}</span>`;
            })()}
          </div>

          ${metricsHtml}

          ${output.summary ? `
          <div style="border-top:1px solid var(--glass-border); padding-top:10px; margin-top:8px;">
            <span style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:600; display:block; margin-bottom:4px;">
              ${t('idea_critic_verdict_full')}
            </span>
            <p style="font-size:13px; color:#f1f5f9; line-height:1.6; margin:0;">
              ${escapeIdeaHtml(output.summary)}
            </p>
          </div>` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = cardsHtml;
  }

  function updateUnitEconomicsDisplay(currency = 'EGP') {
    const aovInput = document.getElementById('ideaCalcRangeAov');
    const marginInput = document.getElementById('ideaCalcRangeMargin');
    const directInput = document.getElementById('ideaCalcRangeDirectCosts');
    const fixedInput = document.getElementById('ideaCalcRangeFixedCosts');

    if (!aovInput || !marginInput || !directInput || !fixedInput) return;

    const aov = parseFloat(aovInput.value) || 0;
    const marginPct = parseFloat(marginInput.value) || 0;
    const directCosts = parseFloat(directInput.value) || 0;
    const fixedCosts = parseFloat(fixedInput.value) || 0;

    const valAov = document.getElementById('ideaCalcValAov');
    const valMargin = document.getElementById('ideaCalcValMargin');
    const valDirect = document.getElementById('ideaCalcValDirectCosts');
    const valFixed = document.getElementById('ideaCalcValFixedCosts');

    if (valAov) valAov.textContent = `${aov} ${currency}`;
    if (valMargin) valMargin.textContent = `${marginPct}%`;
    if (valDirect) valDirect.textContent = `${directCosts} ${currency}`;
    if (valFixed) valFixed.textContent = `${fixedCosts.toLocaleString()} ${currency}`;

    const grossMarginPerUnit = aov * (marginPct / 100);
    const netContributionPerUnit = grossMarginPerUnit - directCosts;

    const netEl = document.getElementById('ideaCalcNetContribution');
    const beEl = document.getElementById('ideaCalcBreakevenOrders');
    const dailyEl = document.getElementById('ideaCalcDailyOrders');
    const riskBox = document.getElementById('ideaCalcFinancialRiskBox');
    const riskText = document.getElementById('ideaCalcFinancialRiskText');

    if (netEl) {
      netEl.textContent = `${netContributionPerUnit >= 0 ? '+' : ''}${netContributionPerUnit.toFixed(1)} ${currency}`;
      netEl.style.color = netContributionPerUnit > 0 ? 'var(--green)' : 'var(--red)';
    }

    if (netContributionPerUnit <= 0) {
      if (beEl) {
        beEl.textContent = '∞';
        beEl.style.color = 'var(--red)';
      }
      if (dailyEl) {
        dailyEl.textContent = '—';
        dailyEl.style.color = 'var(--red)';
      }
      if (riskBox && riskText) {
        riskBox.style.display = 'flex';
        riskBox.style.background = 'rgba(239, 68, 68, 0.12)';
        riskBox.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        riskText.textContent = t('idea_econ_critical');
      }
    } else {
      const monthlyOrders = Math.ceil(fixedCosts / netContributionPerUnit);
      const dailyOrders = Math.ceil(monthlyOrders / 30);

      if (beEl) {
        beEl.textContent = `${monthlyOrders.toLocaleString()} ${t('idea_unit_orders_mo')}`;
        beEl.style.color = 'var(--cyan)';
      }
      if (dailyEl) {
        dailyEl.textContent = `${dailyOrders.toLocaleString()} ${t('idea_unit_orders_day')}`;
        dailyEl.style.color = 'var(--purple-light)';
      }

      if (riskBox && riskText) {
        if (dailyOrders > 250) {
          riskBox.style.display = 'flex';
          riskBox.style.background = 'rgba(245, 158, 11, 0.12)';
          riskBox.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          riskText.style.color = '#fca5a5';
          riskText.textContent = t('idea_econ_hurdle').split('{n}').join(dailyOrders);
        } else {
          riskBox.style.display = 'flex';
          riskBox.style.background = 'rgba(16, 185, 129, 0.08)';
          riskBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          riskText.style.color = 'var(--green)';
          riskText.textContent = t('idea_unit_econ_risk_none', 'Healthy margin profile at current parameters.');
        }
      }
    }
  }

  function renderUnitEconomics(ueData = null) {
    const card = document.getElementById('ideaUnitEconomicsCard');
    if (!card) return;

    const currency = ueData?.currency || 'EGP';
    const badge = document.getElementById('ideaUnitEconCurrencyBadge');
    if (badge) badge.textContent = currency;

    const aovInput = document.getElementById('ideaCalcRangeAov');
    const marginInput = document.getElementById('ideaCalcRangeMargin');
    const directInput = document.getElementById('ideaCalcRangeDirectCosts');
    const fixedInput = document.getElementById('ideaCalcRangeFixedCosts');

    if (aovInput && typeof ueData?.averageOrderValue === 'number' && ueData.averageOrderValue > 0) aovInput.value = ueData.averageOrderValue;
    if (marginInput && typeof ueData?.takeRatePercent === 'number' && ueData.takeRatePercent > 0) marginInput.value = ueData.takeRatePercent;
    if (directInput && typeof ueData?.directCostsPerUnit === 'number') directInput.value = ueData.directCostsPerUnit;
    if (fixedInput && typeof ueData?.estimatedMonthlyFixedCosts === 'number' && ueData.estimatedMonthlyFixedCosts > 0) fixedInput.value = ueData.estimatedMonthlyFixedCosts;

    updateUnitEconomicsDisplay(currency);

    if (!card.dataset.eventsBound) {
      card.dataset.eventsBound = 'true';
      ['ideaCalcRangeAov', 'ideaCalcRangeMargin', 'ideaCalcRangeDirectCosts', 'ideaCalcRangeFixedCosts'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('input', () => {
            const currentCurrency = document.getElementById('ideaUnitEconCurrencyBadge')?.textContent || 'EGP';
            updateUnitEconomicsDisplay(currentCurrency);
          });
        }
      });
    }

    if (ueData?.keyFinancialRisk) {
      const riskText = document.getElementById('ideaCalcFinancialRiskText');
      const riskBox = document.getElementById('ideaCalcFinancialRiskBox');
      if (riskText && riskBox) {
        riskBox.style.display = 'flex';
        riskText.textContent = ueData.keyFinancialRisk;
      }
    }
  }

  function renderRoundsComparison(runA, runB) {
    const container = document.getElementById('ideaCompareDeltaContent');
    if (!container) return;

    if (!runA || !runB) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${t('idea_compare_no_rounds')}</div>`;
      return;
    }

    const rA = runA.finalReport || {};
    const rB = runB.finalReport || {};

    const numA = runA.roundNumber || 1;
    const numB = runB.roundNumber || 2;
    const labelA = `${t('idea_round_prefix', 'Round')} ${numA}`;
    const labelB = `${t('idea_round_prefix', 'Round')} ${numB}`;

    const assumpA = Array.isArray(rA.top3Assumptions) ? rA.top3Assumptions : [];
    const assumpB = Array.isArray(rB.top3Assumptions) ? rB.top3Assumptions : [];

    const vpA = rA.validationPlan || {};
    const vpB = rB.validationPlan || {};

    let defenseHtml = '';
    if (runB.followupPrompt) {
      defenseHtml = `
        <div class="glass-card" style="border-inline-start:3px solid var(--purple-light); padding:14px;">
          <h4 style="font-size:13px; color:var(--purple-light); margin-bottom:6px;">
            <i class="fas fa-shield-halved" style="margin-inline-end:6px;"></i>
            ${t('idea_compare_founder_defense', 'Founder Defense & Arguments')} (${labelB})
          </h4>
          <p style="font-size:13px; color:#fff; margin:0; line-height:1.5;">"${escapeIdeaHtml(runB.followupPrompt)}"</p>
          ${runB.strategicAngles && runB.strategicAngles.length > 0 ? `
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
              ${runB.strategicAngles.map(a => `<span class="badge" style="font-size:10px; background:rgba(124,58,237,0.2); color:var(--purple-light);">${escapeIdeaHtml(a)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    container.innerHTML = `
      ${defenseHtml}

      <!-- Verdict Comparison -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--cyan); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-gavel"></i> ${t('idea_compare_verdict', 'Executive Verdict')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="color:var(--text-muted); font-size:12px;">${escapeIdeaHtml(labelA)}</strong>
              <span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan); font-size:11px;">${escapeIdeaHtml(rA.verdict || '—')}</span>
            </div>
            <p style="font-size:12px; color:#e2e8f0; margin:0; line-height:1.5;">${escapeIdeaHtml(rA.verdictExplanation || rA.executiveSummary || '—')}</p>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; border-inline-start:3px solid var(--green);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="color:var(--text-muted); font-size:12px;">${escapeIdeaHtml(labelB)}</strong>
              <span class="badge" style="background:rgba(16,185,129,0.15); color:var(--green); font-size:11px;">${escapeIdeaHtml(rB.verdict || '—')}</span>
            </div>
            <p style="font-size:12px; color:#e2e8f0; margin:0; line-height:1.5;">${escapeIdeaHtml(rB.verdictExplanation || rB.executiveSummary || '—')}</p>
          </div>
        </div>
      </div>

      <!-- Assumptions Delta -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--orange); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-layer-group"></i> ${t('idea_compare_assumptions', 'Assumptions Evolution')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px;">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:8px;">${escapeIdeaHtml(labelA)}</strong>
            <ul style="padding-inline-start:18px; margin:0; font-size:12px; color:#e2e8f0;">
              ${assumpA.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('') || '<li>—</li>'}
            </ul>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; border-inline-start:3px solid var(--orange);">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:8px;">${escapeIdeaHtml(labelB)}</strong>
            <ul style="padding-inline-start:18px; margin:0; font-size:12px; color:#e2e8f0;">
              ${assumpB.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('') || '<li>—</li>'}
            </ul>
          </div>
        </div>
      </div>

      <!-- Critical Question Delta -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--cyan); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-circle-question"></i> ${t('idea_compare_question', 'Critical Question to Settle')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px;">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:6px;">${escapeIdeaHtml(labelA)}</strong>
            <p style="font-size:12px; color:#e2e8f0; margin:0;">${escapeIdeaHtml(rA.criticalQuestionToSettle || rA.criticalQuestion || '—')}</p>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; border-inline-start:3px solid var(--cyan);">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:6px;">${escapeIdeaHtml(labelB)}</strong>
            <p style="font-size:12px; color:#fff; font-weight:600; margin:0;">${escapeIdeaHtml(rB.criticalQuestionToSettle || rB.criticalQuestion || '—')}</p>
          </div>
        </div>
      </div>

      <!-- Validation Plan Delta -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--green); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-vial"></i> ${t('idea_compare_validation', 'Validation Plan Progression')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; font-size:12px;">
            <strong style="color:var(--text-muted); display:block; margin-bottom:6px;">${escapeIdeaHtml(labelA)}</strong>
            <div><span style="color:var(--text-muted);">${t('idea_plan_duration')}</span> <strong style="color:var(--cyan);">${escapeIdeaHtml(vpA.suggestedDuration || vpA.duration || '—')}</strong></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${t('idea_plan_metric')}</span> <span>${escapeIdeaHtml(vpA.successMetric || vpA.metric || '—')}</span></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${t('idea_plan_stop')}</span> <span>${escapeIdeaHtml(vpA.stopCondition || vpA.stopCriteria || '—')}</span></div>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; font-size:12px; border-inline-start:3px solid var(--green);">
            <strong style="color:var(--text-muted); display:block; margin-bottom:6px;">${escapeIdeaHtml(labelB)}</strong>
            <div><span style="color:var(--text-muted);">${t('idea_plan_duration')}</span> <strong style="color:var(--cyan);">${escapeIdeaHtml(vpB.suggestedDuration || vpB.duration || '—')}</strong></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${t('idea_plan_metric')}</span> <strong style="color:var(--green);">${escapeIdeaHtml(vpB.successMetric || vpB.metric || '—')}</strong></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${t('idea_plan_stop')}</span> <strong style="color:var(--red);">${escapeIdeaHtml(vpB.stopCondition || vpB.stopCriteria || '—')}</strong></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTruthBoard(items = [], onUpdateTruthItem) {
    const container = document.getElementById('truthBoardItemsList');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:20px;">${t('idea_truth_empty')}</div>`;
      return;
    }

    const catColors = {
      ASSUMPTION: { bg: 'rgba(168, 85, 247, 0.15)', text: 'var(--purple-light)', labelKey: 'idea_tb_cat_assumption' },
      MARKET_FACT: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--blue)', labelKey: 'idea_tb_cat_market_fact' },
      VALIDATION_TEST: { bg: 'rgba(6, 182, 212, 0.15)', text: 'var(--cyan)', labelKey: 'idea_tb_cat_validation_test' },
      CRITICAL_RISK: { bg: 'rgba(239, 68, 68, 0.15)', text: 'var(--red)', labelKey: 'idea_tb_cat_critical_risk' }
    };

    container.innerHTML = items.map(item => {
      const itemId = item.id || item._id;
      const category = item.category || item.type || 'ASSUMPTION';
      const cc = catColors[category] || catColors.ASSUMPTION;
      const catLabel = t(cc.labelKey, category);
      const currentStatus = item.status || item.workflowState || 'UNVERIFIED';

      return `
        <div class="glass-card truth-board-card" data-id="${escapeIdeaHtml(String(itemId))}" style="padding:14px; background:rgba(255,255,255,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="badge" style="background:${cc.bg}; color:${cc.text}; font-size:11px;">
              ${escapeIdeaHtml(catLabel)}
            </span>
            <select class="form-control form-control-sm truth-item-status-select" data-id="${escapeIdeaHtml(String(itemId))}" style="width:auto; padding:4px 28px 4px 10px; font-size:11px; height:auto;">
              <option value="UNVERIFIED" ${currentStatus === 'UNVERIFIED' || currentStatus === 'OPEN' ? 'selected' : ''}>${t('idea_tb_status_open')}</option>
              <option value="IN_PROGRESS" ${currentStatus === 'IN_PROGRESS' ? 'selected' : ''}>${t('idea_tb_status_validating')}</option>
              <option value="VALIDATED" ${currentStatus === 'VALIDATED' ? 'selected' : ''}>${t('idea_tb_status_verified')}</option>
              <option value="INVALIDATED" ${currentStatus === 'INVALIDATED' ? 'selected' : ''}>${t('idea_tb_status_dismissed')}</option>
              <option value="BLOCKED" ${currentStatus === 'BLOCKED' ? 'selected' : ''}>${t('idea_tb_status_blocked')}</option>
            </select>
          </div>
          <p style="font-size:13px; color:#fff; margin:0 0 10px 0; line-height:1.4;">${escapeIdeaHtml(item.statement || '')}</p>
          <input type="text" class="form-control form-control-sm truth-item-notes-input" data-id="${escapeIdeaHtml(String(itemId))}" value="${escapeIdeaHtml(item.notes || item.userNotes || '')}" placeholder="${t('idea_tb_notes_placeholder')}" style="font-size:11px; padding:6px 10px;" />
        </div>
      `;
    }).join('');

    container.querySelectorAll('.truth-item-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.getAttribute('data-id');
        await onUpdateTruthItem(id, { status: sel.value, workflowState: sel.value }, sel);
      });
    });

    container.querySelectorAll('.truth-item-notes-input').forEach(inp => {
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-id');
        await onUpdateTruthItem(id, { notes: inp.value.trim(), userNotes: inp.value.trim() }, inp);
      });
    });
  }

  function updateFollowupTypeButtons(selectedType) {
    document.querySelectorAll('.idea-fup-type-btn').forEach(btn => {
      const btnType = btn.getAttribute('data-type');
      if (btnType === selectedType) {
        btn.classList.add('active');
        btn.style.background = 'rgba(124, 58, 237, 0.25)';
        btn.style.borderColor = 'var(--purple-light)';
        btn.style.color = '#fff';
      } else {
        btn.classList.remove('active');
        btn.style.background = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
    });

    const iconEl = document.getElementById('ideaFollowupModalIcon');
    if (iconEl) {
      const iconMap = {
        DEFEND: 'fa-shield-halved',
        PIVOT: 'fa-shuffle',
        VALIDATION_PLAN: 'fa-vial',
        VOTE: 'fa-check-to-slot',
        COMPARE: 'fa-code-compare',
        MVP: 'fa-rocket'
      };
      iconEl.className = `fas ${iconMap[selectedType] || 'fa-shield-halved'}`;
    }
  }

  async function loadIdeaCouncilData() {
    await Promise.all([
      loadIdeaCouncilUsage(),
      loadIdeaCouncilList(ideaCurrentFilter)
    ]);
  }

  async function loadIdeaCouncilUsage() {
    try {
      const res = await requestJson('/api/idea-council/usage', {}, { onUnauthorized: handleUnauthorized });
      if (res && res.success && res.data) {
        ideaUsageData = res.data;
        const remainingEl = document.getElementById('ideaQuotaRemaining');
        const limitEl = document.getElementById('ideaQuotaLimit');
        if (remainingEl) remainingEl.textContent = ideaUsageData.ideasRemaining;
        if (limitEl) limitEl.textContent = ideaUsageData.monthlyLimit;
      }
    } catch (err) {
      console.error('Failed to load Idea Council usage:', err);
    }
  }

  // D09-F1: a list failure renders a persistent error with a read-only
  // retry — never a misleading empty list. Genuinely empty (success + [])
  // keeps the existing empty state.
  function renderIdeaListError() {
    const container = document.getElementById('ideasListContainer');
    const emptyEl = document.getElementById('ideaListEmpty');
    if (emptyEl) emptyEl.style.display = 'none';
    if (!container) return;
    if (feedback && typeof feedback.renderState === 'function') {
      feedback.renderState(
        container,
        { phase: 'error', key: 'idea_list_error' },
        { t: (key) => t(key), onRetry: () => loadIdeaCouncilList(ideaCurrentFilter) }
      );
      return;
    }
    container.innerHTML = '';
    container.style.display = 'block';
    const note = document.createElement('p');
    note.style.cssText = 'padding:24px;text-align:center;color:var(--red);font-size:13px;';
    note.textContent = t('idea_list_error');
    container.appendChild(note);
  }

  async function loadIdeaCouncilList(filter = 'ALL') {
    ideaCurrentFilter = filter;
    try {
      const query = filter !== 'ALL' ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await requestJson(`/api/idea-council/ideas${query}`, {}, { onUnauthorized: handleUnauthorized });
      if (!(res && res.success)) throw new Error('Idea list unavailable');
      const rawList = Array.isArray(res.data) ? res.data : (res.data?.ideas || []);
      const ideas = Array.isArray(rawList) ? rawList : [];
      lastIdeas = ideas;
      paintIdeaList(ideas);
      if (onListReady) {
        try { onListReady(); } catch (_hookErr) { /* host hook must never break the list */ }
      }
    } catch (err) {
      console.error('Failed to load Idea Council list:', err);
      renderIdeaListError();
    }
  }

  function paintIdeaList(ideas) {
    const container = document.getElementById('ideasListContainer');
    const emptyEl = document.getElementById('ideaListEmpty');
    if (!container) return;

    if (ideas.length === 0) {
      container.innerHTML = '';
      container.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    container.style.display = 'grid';

    const statusColors = {
      DRAFT: { bg: 'rgba(148, 163, 184, 0.15)', text: 'var(--text-muted)' },
      STRUCTURING: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--blue)' },
      AWAITING_CONFIRMATION: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--orange)' },
      QUEUED: { bg: 'rgba(6, 182, 212, 0.15)', text: 'var(--cyan)' },
      RUNNING: { bg: 'rgba(6, 182, 212, 0.15)', text: 'var(--cyan)' },
      COMPLETED: { bg: 'rgba(16, 185, 129, 0.15)', text: 'var(--green)' },
      PARTIAL: { bg: 'rgba(245, 158, 11, 0.15)', text: 'var(--orange)' },
      FAILED: { bg: 'rgba(239, 68, 68, 0.15)', text: 'var(--red)' },
      CANCELED: { bg: 'rgba(148, 163, 184, 0.15)', text: 'var(--text-muted)' }
    };

    container.innerHTML = ideas.map(idea => {
      const ideaId = idea._id || idea.id;
      const title = idea.structuredCard?.title || idea.structuredIdea?.title || idea.rawIdea?.title || idea.title || t('idea_card_title');
      const pitch = idea.structuredCard?.elevatorPitch || idea.structuredIdea?.elevatorPitch || (idea.rawIdea?.rawText ? (idea.rawIdea.rawText.slice(0, 120) + '...') : '');
      const date = new Date(idea.createdAt || Date.now()).toLocaleDateString(getLanguage() === 'ar' ? 'ar-EG' : 'en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      const sc = statusColors[idea.status] || statusColors.DRAFT;
      const statusKey = 'idea_status_' + (idea.status || 'draft').toLowerCase();
      const statusLabel = t(statusKey, idea.status || 'DRAFT');

      const actionLabel = (idea.status === 'COMPLETED' || idea.status === 'PARTIAL')
        ? t('idea_action_view')
        : t('idea_action_resume');

      return `
        <div class="glass-card idea-item-card" data-id="${ideaId}" style="display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; padding:20px;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <span class="badge" style="background:${sc.bg}; color:${sc.text}; font-size:11px; padding:4px 8px; border-radius:10px;">
                ${idea.status === 'RUNNING' ? '<i class="fas fa-spinner fa-spin" style="margin-inline-end:4px;"></i>' : ''}${escapeIdeaHtml(statusLabel)}
              </span>
              <span style="font-size:11px; color:var(--text-muted);">${date}</span>
            </div>
            <h4 style="font-size:15px; margin-bottom:8px; line-height:1.4; color:#fff;">${escapeIdeaHtml(title)}</h4>
            <p style="font-size:12px; color:var(--text-muted); line-height:1.5; margin-bottom:16px;">${escapeIdeaHtml(pitch)}</p>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--glass-border); padding-top:12px; margin-top:auto;">
            <button class="btn btn-secondary btn-sm idea-open-card-btn" data-id="${ideaId}" type="button" style="font-size:12px;">
              ${escapeIdeaHtml(actionLabel)} <i class="fas ${getLanguage() === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}" style="margin-inline-start:4px;"></i>
            </button>
            ${(idea.status === 'DRAFT' || idea.status === 'FAILED') ? `
              <button class="btn btn-sm idea-delete-btn" data-id="${ideaId}" type="button" title="${t('idea_action_delete')}" style="background:transparent; border:none; color:var(--text-muted); padding:6px 8px;">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.idea-item-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.idea-delete-btn')) return;
        const id = card.getAttribute('data-id');
        openIdea(id);
      });
    });

    container.querySelectorAll('.idea-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!confirm(t('idea_msg_confirm_delete'))) return;
        try {
          await requestJson(`/api/idea-council/ideas/${id}`, { method: 'DELETE' }, { operation: 'mutation', onUnauthorized: handleUnauthorized });
          await loadIdeaCouncilList(ideaCurrentFilter);
          await loadIdeaCouncilUsage();
        } catch (err) {
          console.error('Failed to delete idea:', err);
        }
      });
    });
  }

  async function openIdea(ideaId) {
    try {
      const res = await requestJson(`/api/idea-council/ideas/${ideaId}`, {}, { onUnauthorized: handleUnauthorized });
      if (!res || !res.success || !res.data) return;
      currentIdea = res.data;

      if (currentIdea.status === 'DRAFT') {
        const rawInput = document.getElementById('ideaRawText');
        const mktInput = document.getElementById('ideaTargetMarket');
        const audInput = document.getElementById('ideaTargetAudience');
        const conInput = document.getElementById('ideaPrimaryConcern');
        const langSelect = document.getElementById('ideaOutputLang');

        if (rawInput) rawInput.value = currentIdea.rawIdea?.rawText || '';
        if (mktInput) mktInput.value = currentIdea.rawIdea?.targetMarket || '';
        if (audInput) audInput.value = currentIdea.rawIdea?.targetAudience || '';
        if (conInput) conInput.value = currentIdea.rawIdea?.primaryConcern || '';
        if (langSelect) langSelect.value = currentIdea.reportLanguage || getLanguage() || 'ar';
        updateIdeaCharCount();
        showIdeaView('input');
      } else if (currentIdea.status === 'STRUCTURING' || currentIdea.status === 'AWAITING_CONFIRMATION') {
        populateStructuredCardForm(currentIdea.structuredCard || {});
        showIdeaView('card');
      } else if (currentIdea.status === 'QUEUED' || currentIdea.status === 'RUNNING') {
        showIdeaView('session');
        if (currentIdea.activeRunId) {
        startIdeaPolling(currentIdea.activeRunId);
        }
      } else if (currentIdea.status === 'COMPLETED' || currentIdea.status === 'PARTIAL') {
        renderIdeaReport(currentIdea);
        showIdeaView('report');
      }
    } catch (err) {
      console.error('Failed to open idea:', err);
    }
  }

  // D09-F3/F4: concurrent saves (autosave tick + manual click + structure
  // pre-save) share one in-flight request instead of persisting duplicate
  // drafts. Drafts stay in the form on every failure path.
  let ideaSaveFlight = null;
  async function saveIdeaDraft(silent = false) {
    if (ideaSaveFlight) return ideaSaveFlight;
    ideaSaveFlight = saveIdeaDraftOnce(silent);
    try {
      return await ideaSaveFlight;
    } finally {
      ideaSaveFlight = null;
    }
  }

  async function saveIdeaDraftOnce(silent = false) {
    const rawEl = document.getElementById('ideaRawText');
    const mktEl = document.getElementById('ideaTargetMarket');
    const audEl = document.getElementById('ideaTargetAudience');
    const conEl = document.getElementById('ideaPrimaryConcern');
    const langEl = document.getElementById('ideaOutputLang');
    const statusEl = document.getElementById('ideaAutoSaveStatus');

    const rawText = rawEl ? rawEl.value.trim() : '';
    const targetMarket = mktEl ? mktEl.value.trim() : '';
    const targetAudience = audEl ? audEl.value.trim() : '';
    const primaryConcern = conEl ? conEl.value.trim() : '';
    const reportLanguage = langEl ? langEl.value : 'ar';

    if (rawText.length < 100) {
      if (!silent) {
        alert(t('idea_desc_min_length'));
      }
      return null;
    }

    if (statusEl) statusEl.textContent = t('idea_msg_saving');

    const payload = {
      rawText,
      originalText: rawText,
      targetMarket,
      targetAudience,
      primaryConcern,
      reportLanguage,
      outputLanguage: reportLanguage
    };

    try {
      let res;
      const curId = currentIdea?._id || currentIdea?.id;
      if (curId) {
        res = await requestJson(`/api/idea-council/draft/${curId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        }, { operation: 'mutation', onUnauthorized: handleUnauthorized });
      } else {
        res = await requestJson('/api/idea-council/draft', {
          method: 'POST',
          body: JSON.stringify(payload)
        }, { operation: 'mutation', onUnauthorized: handleUnauthorized });
      }

      if (res && res.success && res.data) {
        currentIdea = res.data;
        if (statusEl) {
          statusEl.textContent = t('idea_msg_saved');
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
        }
        return currentIdea;
      }
    } catch (err) {
      console.error('Failed to save idea draft:', err);
      if (statusEl) statusEl.textContent = '';
    }
    return null;
  }

  async function handleIdeaStructureSubmit(e) {
    if (e) e.preventDefault();
    const rawEl = document.getElementById('ideaRawText');
    const rawText = rawEl ? rawEl.value.trim() : '';

    if (rawText.length < 100) {
      alert(t('idea_desc_min_length'));
      return;
    }

    const btn = document.getElementById('ideaSubmitStructureBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('idea_btn_structuring')}`;
    }

    try {
      const curId = currentIdea?._id || currentIdea?.id;
      if (!curId) {
        const saved = await saveIdeaDraft(true);
        if (!saved) return;
      } else {
        await saveIdeaDraft(true);
      }

      const activeId = currentIdea?._id || currentIdea?.id;
      const res = await requestJson(`/api/idea-council/ideas/${activeId}/structure`, {
        method: 'POST'
      }, { operation: 'mutation', onUnauthorized: handleUnauthorized });

      if (res && res.success && res.data) {
        currentIdea = { ...currentIdea, ...res.data };
        populateStructuredCardForm(currentIdea.structuredCard || currentIdea.structuredIdea || {});
        showIdeaView('card');
      } else {
        alert(res?.error || t('idea_structure_failed'));
      }
    } catch (err) {
      console.error('Error structuring idea:', err);
      alert(t('idea_structure_error'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  async function handleConveneCouncilSubmit(e) {
    if (e) e.preventDefault();
    const confirmCheck = document.getElementById('ideaConfirmCheckbox');
    if (!confirmCheck || !confirmCheck.checked) {
      alert(t('idea_msg_confirm_checkbox_req'));
      return;
    }

    const ideaId = currentIdea?._id || currentIdea?.id;
    if (!ideaId) return;

    const titleVal = document.getElementById('ideaCardFldTitle')?.value.trim() || '';
    const pitchVal = document.getElementById('ideaCardFldPitch')?.value.trim() || '';
    const customerVal = document.getElementById('ideaCardFldCustomer')?.value.trim() || '';
    const revenueVal = document.getElementById('ideaCardFldRevenue')?.value.trim() || '';
    const problemVal = document.getElementById('ideaCardFldProblem')?.value.trim() || '';
    const solutionVal = document.getElementById('ideaCardFldSolution')?.value.trim() || '';
    const valueVal = document.getElementById('ideaCardFldValue')?.value.trim() || '';
    const altVal = document.getElementById('ideaCardFldAlternatives')?.value.trim() || '';
    const questionVal = document.getElementById('ideaCardFldCoreQuestion')?.value.trim() || '';

    const card = {
      title: titleVal,
      elevatorPitch: pitchVal,
      targetCustomer: customerVal,
      revenueModel: revenueVal,
      businessModel: revenueVal,
      coreProblem: problemVal,
      problem: problemVal,
      proposedSolution: solutionVal,
      solution: solutionVal,
      valueProposition: valueVal,
      currentAlternatives: altVal,
      alternatives: altVal,
      coreEvaluationQuestion: questionVal,
      criticalQuestion: questionVal
    };

    const btn = document.getElementById('ideaStartCouncilBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t('idea_convening');
    }

    try {
      await requestJson(`/api/idea-council/ideas/${ideaId}/card`, {
        method: 'PUT',
        body: JSON.stringify(card)
      }, { operation: 'mutation', onUnauthorized: handleUnauthorized });

      const idempotencyKey = `convene-${ideaId}-${Date.now()}`;
      const res = await requestJson(`/api/idea-council/ideas/${ideaId}/convene`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ idempotencyKey })
      }, { operation: 'mutation', onUnauthorized: handleUnauthorized });

      const runId = res?.runId || res?.data?.runId;
      if (res && res.success && runId) {
        currentIdeaRunId = runId;
        showIdeaView('session');
        renderCouncilAgentsGrid([]);
        startIdeaPolling(currentIdeaRunId);
        loadIdeaCouncilUsage();
      } else {
        alert(res?.error || t('idea_msg_quota_exceeded'));
      }
    } catch (err) {
      console.error('Failed to convene council:', err);
      alert(t('idea_convene_failed'));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
  }

  function openIdeaCompareModal() {
    const modal = document.getElementById('ideaRoundsComparisonModal');
    if (!modal) return;
    const runs = Array.isArray(currentIdea?.runs) ? currentIdea.runs : [];
    if (runs.length < 2) {
      alert(t('idea_compare_no_rounds'));
      return;
    }

    const selectA = document.getElementById('ideaCompareSelectA');
    const selectB = document.getElementById('ideaCompareSelectB');
    if (selectA && selectB) {
      selectA.innerHTML = '';
      selectB.innerHTML = '';

      runs.forEach((r, idx) => {
        const roundNum = r.roundNumber || (idx + 1);
        const label = idx === 0 
          ? `${t('idea_round_prefix', 'Round')} 1 (${t('idea_round_initial_short')})`
          : `${t('idea_round_prefix', 'Round')} ${roundNum} (${r.followupType || 'FOLLOW_UP'})`;
        
        const optA = document.createElement('option');
        optA.value = r.runId || r._id;
        optA.textContent = label;
        selectA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = r.runId || r._id;
        optB.textContent = label;
        selectB.appendChild(optB);
      });

      selectA.value = runs[0].runId || runs[0]._id;
      selectB.value = runs[runs.length - 1].runId || runs[runs.length - 1]._id;
    }

    const runA = runs[0];
    const runB = runs[runs.length - 1];
    renderRoundsComparison(runA, runB);

    // E03f: compare modal on the shared focus lifecycle (§7.3). The
    // helper owns focus/stack/inert only; `.active` stays the visual
    // switch — removed by onClose and by the explicit fallback in
    // closeIdeaCompareModal below. Opener defaults to activeElement
    // (this opener is fully synchronous: guards, populate, render, open).
    modal.classList.add('active');
    try {
      if (a11y && typeof a11y.openDialog === 'function') {
        a11y.openDialog(modal, {
          opener: document.activeElement && document.activeElement.nodeType === 1
            ? document.activeElement
            : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => modal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  }

  function closeIdeaCompareModal() {
    const modal = document.getElementById('ideaRoundsComparisonModal');
    if (!modal) return;
    try {
      if (a11y && typeof a11y.closeDialog === 'function') {
        a11y.closeDialog(modal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      modal.classList.remove('active');
    }
  }

  function handleCompareSelectChange() {
    const runs = Array.isArray(currentIdea?.runs) ? currentIdea.runs : [];
    const valA = document.getElementById('ideaCompareSelectA')?.value;
    const valB = document.getElementById('ideaCompareSelectB')?.value;

    const runA = runs.find(r => String(r.runId || r._id) === String(valA));
    const runB = runs.find(r => String(r.runId || r._id) === String(valB));

    renderRoundsComparison(runA, runB);
  }

  async function updateTruthItem(itemId, patchData, triggerEl) {
    try {
      const ideaId = currentIdea?._id || currentIdea?.id;
      const url = ideaId
        ? `/api/idea-council/ideas/${ideaId}/truth-items/${itemId}`
        : `/api/idea-council/truth-items/${itemId}`;
      const res = await requestJson(url, {
        method: 'PATCH',
        body: JSON.stringify(patchData)
      }, { operation: 'mutation', onUnauthorized: handleUnauthorized });
      if (res && res.success && triggerEl) {
        const card = triggerEl.closest('.truth-board-card');
        if (card) {
          card.style.borderColor = 'var(--green)';
          setTimeout(() => { card.style.borderColor = ''; }, 1200);
        }
      }
    } catch (err) {
      console.error('Failed to update truth item:', err);
    }
  }

  function openIdeaFollowupModal(type = 'DEFEND') {
    const modal = document.getElementById('ideaFollowupModal');
    if (!modal) return;

    const ideaId = currentIdea?._id || currentIdea?.id;
    if (!ideaId) return;

    const isSuperadmin = Boolean(ideaUsageData?.isSuperadmin || currentIdea?.isSuperadmin);
    const roundsRem = isSuperadmin ? '∞' : (currentIdea.followupRoundsRemaining ?? currentIdea.followUpRoundsRemaining ?? Math.max(0, 3 - (currentIdea.followupRoundsUsed || 0)));
    if (!isSuperadmin && Number(roundsRem) <= 0) {
      alert(t('idea_followup_exhausted'));
      return;
    }

    activeFollowupType = type || 'DEFEND';

    // Update Round Badge
    const roundBadge = document.getElementById('ideaFollowupRoundBadge');
    if (roundBadge) {
      const nextRound = (currentIdea.followupRoundsUsed || 0) + 2;
      roundBadge.textContent = t('idea_round_n').split('{n}').join(nextRound).split('{suffix}').join('');
    }

    // Update Rounds Left text
    const roundsLeftEl = document.getElementById('ideaFollowupModalRoundsLeft');
    if (roundsLeftEl) {
      roundsLeftEl.textContent = roundsRem;
    }

    // Update active button in type grid
    updateFollowupTypeButtons(activeFollowupType);

    // Reset chips to inactive
    document.querySelectorAll('.idea-strategy-chip').forEach(chip => {
      chip.classList.remove('active');
      chip.style.background = 'rgba(255,255,255,0.05)';
      chip.style.borderColor = 'var(--glass-border)';
      chip.style.color = '#e2e8f0';
      chip.style.fontWeight = 'normal';
    });

    // Reset prompt and inputs
    const promptInput = document.getElementById('ideaFollowupPromptInput');
    const evidenceInput = document.getElementById('ideaFollowupEvidenceInput');
    const charCount = document.getElementById('ideaFollowupCharCount');
    const criticSelect = document.getElementById('ideaFollowupTargetCritic');
    const modeSelect = document.getElementById('ideaFollowupReviewMode');

    if (promptInput) promptInput.value = '';
    if (evidenceInput) evidenceInput.value = '';
    if (charCount) charCount.textContent = '0';
    if (criticSelect) criticSelect.value = 'ALL';
    if (modeSelect) modeSelect.value = 'BALANCED';

    modal.classList.add('active');
    // E03e: followup modal on the shared focus lifecycle (§7.3). The
    // helper owns focus/stack/inert only; `.active` stays the visual
    // switch — removed by onClose and by the explicit fallback in
    // closeIdeaFollowupModal below. Opener defaults to activeElement
    // (this opener is fully synchronous: guards, populate, then open).
    try {
      if (a11y && typeof a11y.openDialog === 'function') {
        a11y.openDialog(modal, {
          opener: document.activeElement && document.activeElement.nodeType === 1
            ? document.activeElement
            : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => modal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
    // E03e timer guard (plan: no timer refocuses a closed dialog): the
    // delayed prompt focus fires only while the modal is still open. The
    // sync validation focus in submitFollowupModal stays as-is — the
    // dialog is necessarily open at that point.
    if (promptInput) setTimeout(() => { if (modal.classList.contains('active')) promptInput.focus(); }, 100);
  }

  function closeIdeaFollowupModal() {
    const modal = document.getElementById('ideaFollowupModal');
    if (!modal) return;
    try {
      if (a11y && typeof a11y.closeDialog === 'function') {
        a11y.closeDialog(modal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      modal.classList.remove('active');
    }
  }

  async function submitFollowupModal() {
    const ideaId = currentIdea?._id || currentIdea?.id;
    if (!ideaId) return;

    const promptInput = document.getElementById('ideaFollowupPromptInput');
    const evidenceInput = document.getElementById('ideaFollowupEvidenceInput');
    const criticSelect = document.getElementById('ideaFollowupTargetCritic');
    const modeSelect = document.getElementById('ideaFollowupReviewMode');
    const submitBtn = document.getElementById('ideaFollowupSubmitBtn');

    const mainDefense = promptInput ? promptInput.value.trim() : '';
    const selectedChips = Array.from(document.querySelectorAll('.idea-strategy-chip.active')).map(c => c.textContent.trim());

    if (!mainDefense && selectedChips.length === 0) {
      alert(t('idea_followup_err_empty'));
      if (promptInput) promptInput.focus();
      return;
    }

    const criticLabel = criticSelect ? criticSelect.options[criticSelect.selectedIndex].text : '';
    const modeLabel = modeSelect ? modeSelect.options[modeSelect.selectedIndex].text : '';
    const extraEvidence = evidenceInput ? evidenceInput.value.trim() : '';

    const parts = [];
    if (selectedChips.length > 0) {
      parts.push(`[Strategic Angles / ميزات استراتيجية]: ${selectedChips.join(' | ')}`);
    }
    if (criticSelect && criticSelect.value !== 'ALL') {
      parts.push(`[Target Critic Focus / الناقد المستهدف]: ${criticLabel}`);
    }
    if (modeLabel) {
      parts.push(`[Review Tone / أسلوب المراجعة]: ${modeLabel}`);
    }
    if (extraEvidence) {
      parts.push(`[Extra Evidence / أدلة وأرقام إضافية]: ${extraEvidence}`);
    }
    if (mainDefense) {
      parts.push(`[Founder Defense & Details / حجج وتفاصيل المؤسس]:\n${mainDefense}`);
    }

    const combinedPrompt = parts.join('\n\n');

    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-inline-end:6px;"></i> ' + t('idea_followup_launching');
    }

    try {
      const idempotencyKey = `followup-${ideaId}-${Date.now()}`;
      const res = await requestJson(`/api/idea-council/ideas/${ideaId}/follow-up`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          type: activeFollowupType,
          followupType: activeFollowupType,
          targetCritic: criticSelect ? criticSelect.value : 'ALL',
          userPrompt: combinedPrompt,
          followupPrompt: combinedPrompt,
          idempotencyKey
        })
      }, { operation: 'mutation', onUnauthorized: handleUnauthorized });

      const runId = res?.runId || res?.data?.runId;
      if (res && res.success && runId) {
        closeIdeaFollowupModal();
        currentIdeaRunId = runId;
        showIdeaView('session');
        renderCouncilAgentsGrid([]);
        startIdeaPolling(currentIdeaRunId);
        loadIdeaCouncilUsage();
      } else if (res && res.success && res.data) {
        closeIdeaFollowupModal();
        currentIdea = res.data;
        renderIdeaReport(currentIdea);
      } else {
        alert(res?.error || res?.message || t('idea_followup_failed'));
      }
    } catch (err) {
      console.error('Follow-up submit error:', err);
      alert(t('idea_followup_error'));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  }

  function handleFollowUpClick(type) {
    openIdeaFollowupModal(type);
  }

  function initIdeaCouncil() {
    const ideaNewBtn = document.getElementById('ideaNewBtn');
    if (ideaNewBtn) {
      ideaNewBtn.addEventListener('click', () => {
        if (ideaUsageData && !ideaUsageData.isSuperadmin && !ideaUsageData.isUnlimited && Number(ideaUsageData.ideasRemaining) <= 0) {
          alert(t('idea_msg_quota_exceeded'));
          return;
        }
        currentIdea = null;
        currentIdeaRunId = null;
        const rawEl = document.getElementById('ideaRawText');
        const mktEl = document.getElementById('ideaTargetMarket');
        const audEl = document.getElementById('ideaTargetAudience');
        const conEl = document.getElementById('ideaPrimaryConcern');
        const langEl = document.getElementById('ideaOutputLang');

        if (rawEl) rawEl.value = '';
        if (mktEl) mktEl.value = '';
        if (audEl) audEl.value = '';
        if (conEl) conEl.value = '';
        if (langEl) langEl.value = getLanguage() === 'en' ? 'en' : 'ar';
        updateIdeaCharCount();
        showIdeaView('input');
      });
    }

    const cancelInputBtn = document.getElementById('ideaCancelInputBtn');
    if (cancelInputBtn) {
      cancelInputBtn.addEventListener('click', () => {
        showIdeaView('list');
        loadIdeaCouncilList(ideaCurrentFilter);
      });
    }

    const rawTextEl = document.getElementById('ideaRawText');
    if (rawTextEl) {
      rawTextEl.addEventListener('input', () => {
        updateIdeaCharCount();
        clearTimeout(ideaAutoSaveTimer);
        const len = rawTextEl.value.length;
        if (len >= 100 && len <= 8000) {
          ideaAutoSaveTimer = setTimeout(() => {
            saveIdeaDraft(true);
          }, 2000);
        }
      });
    }

    const saveDraftBtn = document.getElementById('ideaSaveDraftBtn');
    if (saveDraftBtn) {
      saveDraftBtn.addEventListener('click', () => {
        saveIdeaDraft(false);
      });
    }

    const createForm = document.getElementById('ideaCreateForm');
    if (createForm) {
      createForm.addEventListener('submit', handleIdeaStructureSubmit);
    }

    const cardBackBtn = document.getElementById('ideaCardBackBtn');
    if (cardBackBtn) {
      cardBackBtn.addEventListener('click', () => {
        showIdeaView('list');
        loadIdeaCouncilList(ideaCurrentFilter);
      });
    }

    const saveCardBtn = document.getElementById('ideaSaveCardBtn');
    if (saveCardBtn) {
      saveCardBtn.addEventListener('click', async () => {
        if (!currentIdea || !currentIdea._id) return;
        const titleVal = document.getElementById('ideaCardFldTitle')?.value.trim() || '';
        const pitchVal = document.getElementById('ideaCardFldPitch')?.value.trim() || '';
        const customerVal = document.getElementById('ideaCardFldCustomer')?.value.trim() || '';
        const revenueVal = document.getElementById('ideaCardFldRevenue')?.value.trim() || '';
        const problemVal = document.getElementById('ideaCardFldProblem')?.value.trim() || '';
        const solutionVal = document.getElementById('ideaCardFldSolution')?.value.trim() || '';
        const valueVal = document.getElementById('ideaCardFldValue')?.value.trim() || '';
        const altVal = document.getElementById('ideaCardFldAlternatives')?.value.trim() || '';
        const questionVal = document.getElementById('ideaCardFldCoreQuestion')?.value.trim() || '';

        const card = {
          title: titleVal,
          elevatorPitch: pitchVal,
          targetCustomer: customerVal,
          revenueModel: revenueVal,
          businessModel: revenueVal,
          coreProblem: problemVal,
          problem: problemVal,
          proposedSolution: solutionVal,
          solution: solutionVal,
          valueProposition: valueVal,
          currentAlternatives: altVal,
          alternatives: altVal,
          coreEvaluationQuestion: questionVal,
          criticalQuestion: questionVal
        };
        try {
          await requestJson(`/api/idea-council/ideas/${currentIdea._id}/card`, {
            method: 'PUT',
            body: JSON.stringify(card)
          }, { operation: 'mutation', onUnauthorized: handleUnauthorized });
          alert(t('idea_msg_card_saved'));
        } catch (err) {
          console.error('Failed to save card:', err);
        }
      });
    }

    const cardEditForm = document.getElementById('ideaCardEditForm');
    if (cardEditForm) {
      cardEditForm.addEventListener('submit', handleConveneCouncilSubmit);
    }

    const reportBackBtn = document.getElementById('ideaReportBackBtn');
    if (reportBackBtn) {
      reportBackBtn.addEventListener('click', () => {
        showIdeaView('list');
        loadIdeaCouncilList(ideaCurrentFilter);
      });
    }

    const exportMdBtn = document.getElementById('ideaExportMdBtn');
    if (exportMdBtn) {
      exportMdBtn.addEventListener('click', () => exportIdeaReport('markdown'));
    }

    const exportPdfBtn = document.getElementById('ideaExportPdfBtn');
    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => exportIdeaReport('html'));
    }

    document.querySelectorAll('.idea-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.idea-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const st = btn.getAttribute('data-status') || 'ALL';
        loadIdeaCouncilList(st);
      });
    });

    document.querySelectorAll('.idea-followup-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        handleFollowUpClick(type);
      });
    });

    document.querySelectorAll('.idea-followup-modal-close').forEach(btn => {
      btn.addEventListener('click', closeIdeaFollowupModal);
    });

    const followupModalEl = document.getElementById('ideaFollowupModal');
    if (followupModalEl) {
      followupModalEl.addEventListener('click', (e) => {
        if (e.target === followupModalEl) closeIdeaFollowupModal();
      });
    }

    document.querySelectorAll('.idea-strategy-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
          chip.style.background = 'rgba(6, 182, 212, 0.2)';
          chip.style.borderColor = 'var(--cyan)';
          chip.style.color = 'var(--cyan)';
          chip.style.fontWeight = '600';
        } else {
          chip.style.background = 'rgba(255, 255, 255, 0.05)';
          chip.style.borderColor = 'var(--glass-border)';
          chip.style.color = '#e2e8f0';
          chip.style.fontWeight = 'normal';
        }
      });
    });

    document.querySelectorAll('.idea-fup-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const btnType = btn.getAttribute('data-type');
        updateFollowupTypeButtons(btnType);
      });
    });

    const followupPromptInput = document.getElementById('ideaFollowupPromptInput');
    const followupCharCount = document.getElementById('ideaFollowupCharCount');
    if (followupPromptInput && followupCharCount) {
      followupPromptInput.addEventListener('input', () => {
        followupCharCount.textContent = followupPromptInput.value.length;
      });
    }

    const followupSubmitBtn = document.getElementById('ideaFollowupSubmitBtn');
    if (followupSubmitBtn) {
      followupSubmitBtn.addEventListener('click', submitFollowupModal);
    }

    const compareBtn = document.getElementById('ideaCompareRoundsBtn');
    if (compareBtn) {
      compareBtn.addEventListener('click', openIdeaCompareModal);
    }

    document.querySelectorAll('.idea-compare-modal-close').forEach(btn => {
      btn.addEventListener('click', closeIdeaCompareModal);
    });

    const compareModalEl = document.getElementById('ideaRoundsComparisonModal');
    if (compareModalEl) {
      compareModalEl.addEventListener('click', (e) => {
        if (e.target === compareModalEl) closeIdeaCompareModal();
      });
    }

    const compareSelectA = document.getElementById('ideaCompareSelectA');
    if (compareSelectA) {
      compareSelectA.addEventListener('change', handleCompareSelectChange);
    }

    const compareSelectB = document.getElementById('ideaCompareSelectB');
    if (compareSelectB) {
      compareSelectB.addEventListener('change', handleCompareSelectChange);
    }
  }

  function startIdeaPolling(runId) {
    if (ideaPollTimer) clearInterval(ideaPollTimer);

    const progressBar = document.getElementById('ideaSessionProgressBar');
    const stageText = document.getElementById('ideaSessionStageText');

    async function poll() {
      try {
        const res = await requestJson(`/api/idea-council/runs/${runId}`, {}, { onUnauthorized: handleUnauthorized });
        if (!res || !res.success || !res.data) return;
        const run = res.data;

        let pct = 15;
        let stg = t('idea_step_research', 'Conducting live web market research...');

        if (run.stage === 'RESEARCH') {
          pct = 20;
          stg = t('idea_stage_research');
        } else if (run.stage === 'AGENT_ANALYSIS' || run.stage === 'ANALYSIS') {
          const completed = (run.agents || []).filter(a => a.status === 'COMPLETED').length;
          const total = run.stageProgress?.agentsTotal || (run.agents || []).length || 8;
          pct = 25 + Math.round((completed / Math.max(1, total)) * 55);
          stg = t('idea_stage_parallel') + ` (${completed}/${total})...`;
        } else if (run.stage === 'SYNTHESIS') {
          pct = 88;
          stg = t('idea_stage_synth');
        }

        if (progressBar) progressBar.style.width = `${pct}%`;
        if (stageText) stageText.textContent = stg;

        renderCouncilAgentsGrid(run.agents || []);

        if (run.status === 'COMPLETED' || run.status === 'PARTIAL') {
          clearInterval(ideaPollTimer);
          ideaPollTimer = null;
          if (progressBar) progressBar.style.width = '100%';
          pendingOpenTimer = setTimeout(async () => {
            await openIdea(run.projectId);
          }, 800);
        } else if (run.status === 'FAILED') {
          clearInterval(ideaPollTimer);
          ideaPollTimer = null;
          if (stageText) {
            stageText.textContent = t('idea_run_failed');
            stageText.style.color = 'var(--red)';
          }
        }
      } catch (err) {
        console.error('Idea polling error:', err);
      }
    }

    poll();
    ideaPollTimer = setInterval(poll, 2000);
  }

  async function exportIdeaReport(format) {
    if (!currentIdea || !currentIdea._id) return;
    try {
      const { blob } = await fetchBlob(`/api/idea-council/ideas/${currentIdea._id}/export?format=${format}`, {}, { onUnauthorized: handleUnauthorized });
      if (format === 'html') {
        const url = window.URL.createObjectURL(blob);
        const printWin = window.open(url, '_blank');
        if (printWin) printWin.focus();
      } else {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (currentIdea.structuredCard?.title || currentIdea.title || 'idea_report')
          .replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_') + '.md';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert(t('idea_export_failed'));
    }
  }
    let initialized = false;

    // Idempotent: second call is a no-op (false) — never double-binds.
    function init() {
      if (initialized) return false;
      initialized = true;
      initIdeaCouncil();
      const registry = languageRegistry();
      if (registry) {
        unregisterLanguageRenderer = registry.registerLanguageRenderer('idea-council', () => {
          refreshLanguage();
        });
      }
      return true;
    }

    // Tab-entry loader (usage + list in parallel).
    function load() {
      return loadIdeaCouncilData();
    }

    // Clears EVERY owned timer/listener claim: autosave debounce, poll
    // interval, delayed open-after-complete, init claim, language hook.
    // (D09-F2: the poll loop can no longer outlive the panel.)
    function dispose() {
      if (ideaAutoSaveTimer) clearTimeout(ideaAutoSaveTimer);
      ideaAutoSaveTimer = null;
      if (ideaPollTimer) clearInterval(ideaPollTimer);
      ideaPollTimer = null;
      if (pendingOpenTimer) clearTimeout(pendingOpenTimer);
      pendingOpenTimer = null;
      if (typeof unregisterLanguageRenderer === 'function') {
        try { unregisterLanguageRenderer(); } catch (_ignored) { /* never break dispose */ }
        unregisterLanguageRenderer = null;
      }
      initialized = false;
    }

    // No-fetch re-render from cached in-memory state (C03 registry calls
    // this on language switch). Report repaints from currentIdea; the list
    // repaints from the last loaded page. False = nothing cached to paint.
    function refreshLanguage() {
      if (currentView === 'report' && currentIdea) {
        activeIdeaRunId = renderIdeaReport(currentIdea, activeIdeaRunId, ideaUsageData, activeIdeaRunId);
        return true;
      }
      if (currentView === 'list' && Array.isArray(lastIdeas)) {
        paintIdeaList(lastIdeas);
        return true;
      }
      return false;
    }

    return {
      init,
      load,
      dispose,
      refreshLanguage,
      selectRun,
      paintIdeaList,
      escapeIdeaHtml,
      showIdeaView,
      populateStructuredCardForm,
      updateIdeaCharCount,
      renderCouncilAgentsGrid,
      renderRunsHistoryBar,
      renderIdeaReport,
      renderCriticsBreakdown,
      updateUnitEconomicsDisplay,
      renderUnitEconomics,
      renderRoundsComparison,
      renderTruthBoard,
      updateFollowupTypeButtons,
      loadIdeaCouncilData,
      loadIdeaCouncilUsage,
      loadIdeaCouncilList,
      openIdea,
      saveIdeaDraft,
      handleIdeaStructureSubmit,
      handleConveneCouncilSubmit,
      openIdeaCompareModal,
      closeIdeaCompareModal,
      handleCompareSelectChange,
      updateTruthItem,
      openIdeaFollowupModal,
      closeIdeaFollowupModal,
      submitFollowupModal,
      handleFollowUpClick,
      startIdeaPolling,
      exportIdeaReport,
    };
  }

  const api = { create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ZainBotIdeaCouncil = api;
})(typeof window !== 'undefined' ? window : globalThis);
