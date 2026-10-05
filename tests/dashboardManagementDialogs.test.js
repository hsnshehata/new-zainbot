const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// E03 management dialogs — static behavioral assertions per migrated
// dialog (real keyboard/focus acceptance waits for the A03/A04 harness).
// Rule under test: one lifecycle per dialog, zero permission/workflow
// changes, and no delayed path refocuses a closed dialog.

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');
const dashboardScript = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8')
  .replace(/\r\n/g, '\n');
// F04c: council modal controllers moved verbatim (+t/a11y/requestJson) to the
// eager chunk; lifecycle assertions below read the chunk instead of the main
// bundle. Every assertion keeps its original strength — only the source and
// the renamed identifiers (ideaT->t, window.ZainBotA11y->a11y,
// apiFetch->requestJson, startIdeaPolling->host.onStartPolling) changed.
const councilChunk = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'dashboard-idea-council.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const settingsSummary = fs
  .readFileSync(path.join(workspace, 'public', 'js', 'settings-summary.js'), 'utf8')
  .replace(/\r\n/g, '\n');

test('agentModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="agentModal" role="dialog" aria-modal="true" aria-labelledby="agentModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="agentModal"');
  const head = dashboardHtml.slice(headStart, headStart + 700);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('agentModal open/save/close run the shared lifecycle with agent-only scope', () => {
  assert.match(dashboardScript, /function openAgentModal\(bot = null\)/);
  const openStart = dashboardScript.indexOf('function openAgentModal(bot = null)');
  const openBlock = dashboardScript.slice(openStart, openStart + 800);
  assert.match(openBlock, /if \(!agentModal \|\| !form\) return;/);
  assert.match(dashboardScript, /enforceToolAndSkillTierLimits\(\);\s+openAgentDialog\(\);/);
  const helperStart = dashboardScript.indexOf('const openAgentDialog = () =>');
  assert.notEqual(helperStart, -1, 'Missing openAgentDialog helper');
  const helper = dashboardScript.slice(helperStart, helperStart + 900);
  assert.match(helper, /ZainBotA11y\.openDialog\(agentModal,/);
  assert.match(helper, /background: document\.querySelector\('\.db-wrapper'\)/);

  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.agent-modal-close'\)\.forEach\(\(button\) => button\.addEventListener\('click', \(\) => closeAgentDialog\(\)\)\);/
  );
  const saveStart = dashboardScript.indexOf('await loadAgents();');
  assert.notEqual(saveStart, -1, 'Missing agent save-success path');
  const saveRegion = dashboardScript.slice(Math.max(0, saveStart - 400), saveStart);
  assert.match(saveRegion, /closeAgentDialog\(\);/);
});

test('agent permissions, tier limits and payload shape are untouched', () => {
  // Tier enforcement still gates the open path and every tool/skill toggle.
  assert.match(dashboardScript, /enforceToolAndSkillTierLimits\(\);\s+openAgentDialog\(\);/);
  assert.match(
    dashboardScript,
    /\['agentToolBooking', 'agentToolOrders', 'agentToolWhatsapp', 'agentToolTelegram', 'agentToolSalesRecovery', 'agentToolDailyDigest', 'agentToolSalesUpsell'\]\.forEach/
  );
  // Save still posts the full agent payload with create/update routes.
  assert.match(dashboardScript, /apiFetch\(id \? `\/api\/bots\/\$\{id\}` : '\/api\/bots', \{ method: id \? 'PUT' : 'POST'/);
  assert.match(dashboardScript, /agentSkills: selectedSkills,/);
  // Failure path still alerts without closing.
  assert.match(dashboardScript, /return alert\(result\?\.message \|\| \(translations\[currentLanguage\] \|\| translations\.en\)\.agent_save_failed\)/);
});

test('no delayed agent path refocuses a closed dialog', () => {
  // Post-save chain moves no focus: late responses cannot pull focus back.
  const saveStart = dashboardScript.indexOf('await loadAgents();');
  const saveTail = dashboardScript.slice(saveStart, saveStart + 400);
  assert.match(saveTail, /await loadAgents\(\);/);
  assert.match(saveTail, /refreshActiveBot\(result\)/);
  assert.match(saveTail, /setTimeout\(window\.__zainbotRenderSettingsSummary, 150\)/);
  assert.doesNotMatch(saveTail, /\.focus\(/, 'post-save chain must not touch focus');
  // Helper close on a non-open dialog is a silent no-op (E01 contract):
  // a manual close racing a pending save cannot refocus anything.
  assert.match(dashboardScript, /const closeAgentDialog = \(\) => \{[\s\S]{0,300}ZainBotA11y\.closeDialog\(agentModal\)/);
  // settings-summary's own close listener is a focus-free re-render timer.
  assert.doesNotMatch(settingsSummary, /\.focus\(/, 'summary re-render must not touch focus');
});

test('adminUserModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="adminUserModal" role="dialog" aria-modal="true" aria-labelledby="adminUserModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="adminUserModal"');
  const head = dashboardHtml.slice(headStart, headStart + 700);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('adminUserModal open/save/close run the shared lifecycle with admin-only scope', () => {
  assert.match(dashboardScript, /async function openAdminUserModal\(userId = ''\)/);
  const helperStart = dashboardScript.indexOf('const openAdminUserDialog = () =>');
  assert.notEqual(helperStart, -1, 'Missing openAdminUserDialog helper');
  const helper = dashboardScript.slice(helperStart, helperStart + 900);
  assert.match(helper, /ZainBotA11y\.openDialog\(adminUserModal,/);
  assert.match(helper, /background: document\.querySelector\('\.db-wrapper'\)/);
  // Lifecycle opens only after the edit-fetch resolves (or immediately
  // for create): the late-fetch failure path alerts without opening.
  assert.match(dashboardScript, /if \(!user\) return alert\(t\.admin_account_load_failed\);/);

  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.admin-user-modal-close'\)\.forEach\(\(button\) => button\.addEventListener\('click', \(\) => closeAdminUserDialog\(\)\)\);/
  );
  const saveStart = dashboardScript.indexOf('loadAdminUsers(id ? adminUsersPageState.page : 1);');
  assert.notEqual(saveStart, -1, 'Missing admin save-success path');
  const saveRegion = dashboardScript.slice(Math.max(0, saveStart - 300), saveStart);
  assert.match(saveRegion, /closeAdminUserDialog\(\);/);
});

test('admin role/permission logic and payload shape are untouched', () => {
  // Edit-fetch still populates every permission control from the server user.
  assert.match(dashboardScript, /document\.getElementById\('adminUserRole'\)\.value = user\.role \|\| 'user';/);
  assert.match(dashboardScript, /document\.getElementById\('adminUserTier'\)\.value = user\.subscriptionTier \|\| 'free';/);
  assert.match(dashboardScript, /document\.getElementById\('adminUserStatus'\)\.value = user\.status === 'suspended' \? 'suspended' : 'active';/);
  // Save still posts role/subscription/status/verification with create/update routes.
  assert.match(dashboardScript, /const result = await apiFetch\(id \? `\/api\/users\/\$\{id\}` : '\/api\/users', \{ method: id \? 'PUT' : 'POST'/);
  assert.match(dashboardScript, /role: document\.getElementById\('adminUserRole'\)\.value,/);
  // Failure path still alerts without closing.
  assert.match(dashboardScript, /return alert\(result\?\.message \|\| \(translations\[currentLanguage\] \|\| translations\.en\)\.admin_account_save_failed\)/);
});

test('no delayed admin path refocuses a closed dialog', () => {
  const saveStart = dashboardScript.indexOf('loadAdminUsers(id ? adminUsersPageState.page : 1);');
  const saveTail = dashboardScript.slice(saveStart, saveStart + 200);
  assert.doesNotMatch(saveTail, /\.focus\(/, 'post-save reload must not touch focus');
  assert.match(dashboardScript, /const closeAdminUserDialog = \(\) => \{[\s\S]{0,300}ZainBotA11y\.closeDialog\(adminUserModal\)/);
});

test('impersonationModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="impersonationModal" role="dialog" aria-modal="true" aria-labelledby="impersonationModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="impersonationModal"');
  const head = dashboardHtml.slice(headStart, headStart + 700);
  assert.match(head, /id="impersonationModalTitle" data-i18n="impersonation_title"/);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('impersonationModal open/close run the shared lifecycle with impersonation-only scope', () => {
  assert.match(dashboardScript, /function openImpersonationModal\(userId\)/);
  const helperStart = dashboardScript.indexOf('const openImpersonationDialog = () =>');
  assert.notEqual(helperStart, -1, 'Missing openImpersonationDialog helper');
  const helper = dashboardScript.slice(helperStart, helperStart + 900);
  assert.match(helper, /ZainBotA11y\.openDialog\(impersonationModal,/);
  assert.match(helper, /background: document\.querySelector\('\.db-wrapper'\)/);
  // Fully synchronous opener (no pre-open fetch): subject set, then open.
  const openStart = dashboardScript.indexOf('function openImpersonationModal(userId)');
  const openBlock = dashboardScript.slice(openStart, openStart + 500);
  assert.match(openBlock, /document\.getElementById\('impersonationSubjectId'\)\.value = userId;/);
  assert.match(openBlock, /openImpersonationDialog\(\);/);

  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.impersonation-modal-close'\)\.forEach\(\(button\) => button\.addEventListener\('click', \(\) => closeImpersonationDialog\(\)\)\);/
  );
});

test('impersonation permissions and session workflow are byte-identical', () => {
  // Session start: endpoint, scoping payload, storage keys, reload.
  assert.match(dashboardScript, /apiFetch\('\/api\/admin\/impersonation\/sessions', \{ method: 'POST', body: JSON\.stringify\(\{ subjectUserId: document\.getElementById\('impersonationSubjectId'\)\.value, reason: document\.getElementById\('impersonationReason'\)\.value\.trim\(\) \}\) \}\)/);
  assert.match(dashboardScript, /sessionStorage\.setItem\('zainbot_admin_session'/);
  assert.match(dashboardScript, /sessionStorage\.setItem\('zainbot_impersonation_session_id', data\.session\.id\);/);
  assert.match(dashboardScript, /localStorage\.setItem\('token', data\.token\);/);
  // Session stop: end endpoint, admin restore, cleanup, reload.
  assert.match(dashboardScript, /\/api\/admin\/impersonation\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/end/);
  assert.match(dashboardScript, /sessionStorage\.removeItem\('zainbot_impersonation_session_id'\);/);
  // Failure paths still alert without closing or storing anything.
  assert.match(dashboardScript, /return alert\(response\?\.message \|\| \(translations\[currentLanguage\] \|\| translations\.en\)\.admin_impersonation_start_failed\)/);
});

test('admin-bots opener binds channelModal and routes the shared open', () => {
  // E03c prerequisite fix: bare modal/modalTitle/modalBody had no binding
  // (every call threw ReferenceError before the guard). They address
  // channelModal — the only dialog owning those title/body nodes.
  assert.match(dashboardScript, /const modal = document\.getElementById\('channelModal'\);\s+const modalTitle = document\.getElementById\('channelModalTitle'\);\s+const modalBody = document\.getElementById\('channelModalBody'\);\s+if \(!modal \|\| !modalTitle \|\| !modalBody\) return;/);
  // Missing-user/missing-bots guards untouched ahead of the open.
  assert.match(dashboardScript, /if \(!user \|\| !Array\.isArray\(user\.bots\)\) \{\s+alert\(t\.admin_account_bots_missing\);\s+return;\s+\}/);
  const openStart = dashboardScript.indexOf('async function openUserBotsModal(userId)');
  const openBlock = dashboardScript.slice(openStart, openStart + 2200);
  assert.match(openBlock, /openChannelModal\(\);/);
  assert.doesNotMatch(openBlock, /modal\.classList\.add\('active'\)/, 'raw open bypasses the lifecycle');
});

test('chatPageModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="chatPageModal" role="dialog" aria-modal="true" aria-labelledby="chatPageModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="chatPageModal"');
  const head = dashboardHtml.slice(headStart, headStart + 800);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('chatPageModal captures its opener pre-fetch and opens through the lifecycle', () => {
  assert.match(dashboardScript, /window\.openChatPageModal = async function\(bot = null\)/);
  const openStart = dashboardScript.indexOf('window.openChatPageModal = async function');
  const openBlock = dashboardScript.slice(openStart, openStart + 800);
  // E03b lesson applied: snapshot activeElement BEFORE the customizer fetch.
  assert.match(openBlock, /const opener = document\.activeElement && document\.activeElement\.nodeType === 1/);
  assert.ok(
    openBlock.indexOf('const opener =') < openBlock.indexOf('await apiFetch'),
    'opener captured before the first await'
  );
  assert.match(dashboardScript, /openChatPageDialog\(opener\);/);
  const helperStart = dashboardScript.indexOf('const openChatPageDialog = (opener) =>');
  assert.notEqual(helperStart, -1, 'Missing openChatPageDialog helper');
  const helper = dashboardScript.slice(helperStart, helperStart + 900);
  assert.match(helper, /ZainBotA11y\.openDialog\(chatPageModalEl,/);
  assert.match(helper, /background: document\.querySelector\('\.db-wrapper'\)/);
  // Helper resolves its own element (no bare-modal scope trap).
  assert.match(helper, /const chatPageModalEl = document\.getElementById\('chatPageModal'\);/);
});

test('chatPageModal close paths (buttons + backdrop + save) route the lifecycle', () => {
  assert.match(
    dashboardScript,
    /document\.querySelectorAll\('\.chat-page-modal-close'\)\.forEach\(btn => \{\s+btn\.addEventListener\('click', \(\) => \{\s+closeChatPageDialog\(\);/
  );
  const backdropStart = dashboardScript.indexOf('if (e.target === chatModalEl)');
  assert.notEqual(backdropStart, -1, 'Missing backdrop-click close path');
  assert.match(
    dashboardScript.slice(backdropStart, backdropStart + 200),
    /closeChatPageDialog\(\);/
  );
  const saveStart = dashboardScript.indexOf("alert(t.chat_page_saved_ok || 'Chat page settings saved successfully!');");
  assert.notEqual(saveStart, -1, 'Missing chat-page save-success path');
  const saveRegion = dashboardScript.slice(saveStart, saveStart + 200);
  assert.match(saveRegion, /closeChatPageDialog\(\);/);
});

test('chatPage customizer population, payload and layout hooks are untouched', () => {
  // Load path still populates from the fetch response with the same guards.
  assert.match(dashboardScript, /apiFetch\(`\/api\/chat-page\/bot\/\$\{targetBot\._id\}`\)/);
  assert.match(dashboardScript, /window\.updateLivePreview\(\);/);
  // Save still PUTs the full customizer payload with cache invalidation.
  assert.match(dashboardScript, /apiFetch\(`\/api\/chat-page\/\$\{chatPageId\}`, \{[\s\S]{0,40}method: 'PUT',/);
  assert.match(dashboardScript, /localStorage\.removeItem\('publicChatPage_' \+ payload\.linkId\);/);
  // No layout/CSS sizing changes ride along (B03 owns the grid).
  assert.doesNotMatch(dashboardScript, /chat-customizer-grid/);
});

test('ideaFollowupModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="ideaFollowupModal" role="dialog" aria-modal="true" aria-labelledby="ideaFollowupModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="ideaFollowupModal"');
  const head = dashboardHtml.slice(headStart, headStart + 2200);
  assert.match(head, /id="ideaFollowupModalTitle"/);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('ideaFollowupModal open/close run the shared lifecycle with followup-only scope', () => {
  assert.match(councilChunk, /function openIdeaFollowupModal\(type = 'DEFEND'\)/);
  const openStart = councilChunk.indexOf('function openIdeaFollowupModal(');
  const openBlock = councilChunk.slice(openStart, openStart + 4200);
  // Guards first: no idea / rounds exhausted never open.
  assert.match(openBlock, /if \(!ideaId\) return;/);
  assert.match(openBlock, /alert\(t\('idea_followup_exhausted'\)\);/);
  assert.match(openBlock, /a11y\.openDialog\(modal,/);
  assert.match(openBlock, /background: document\.querySelector\('\.db-wrapper'\)/);

  assert.match(councilChunk, /function closeIdeaFollowupModal\(\) \{\s+const modal = document\.getElementById\('ideaFollowupModal'\);\s+if \(!modal\) return;/);
  const closeStart = councilChunk.indexOf('function closeIdeaFollowupModal()');
  const closeBlock = councilChunk.slice(closeStart, closeStart + 600);
  assert.match(closeBlock, /a11y\.closeDialog\(modal\)/);
  // Every close path inherits the lifecycle via the definition (no new
  // listeners, so reopen cannot double them): run-success ×2, X wiring,
  // backdrop click.
  assert.match(councilChunk, /document\.querySelectorAll\('\.idea-followup-modal-close'\)\.forEach\(btn => \{\s+btn\.addEventListener\('click', closeIdeaFollowupModal\);/);
});

test('followup delayed focus is guarded; council wiring intact in chunk', () => {
  // The 100ms prompt-focus timer fires only while the modal is still open.
  assert.match(
    councilChunk,
    /if \(promptInput\) setTimeout\(\(\) => \{ if \(modal\.classList\.contains\('active'\)\) promptInput\.focus\(\); \}, 100\);/
  );
  assert.doesNotMatch(councilChunk, /setTimeout\(\(\) => promptInput\.focus\(\), 100\)/);
  // Sync validation focus stays: the dialog is necessarily open there.
  assert.match(councilChunk, /if \(promptInput\) promptInput\.focus\(\);/);
  // Council wiring after close is byte-identical: run handoff, polling,
  // renderers, idempotency key, export. (F04d: the poll loop lives in the
  // chunk, so the handoff calls it directly instead of via the host bridge.)
  assert.match(councilChunk, /closeIdeaFollowupModal\(\);\s+currentIdeaRunId = runId;/);
  assert.match(councilChunk, /startIdeaPolling\(currentIdeaRunId\);/);
  assert.match(councilChunk, /renderCouncilAgentsGrid\(\[\]\);/);
  assert.match(councilChunk, /Idempotency-Key/);
});

test('ideaRoundsComparisonModal carries dialog semantics and a translated close name', () => {
  assert.match(
    dashboardHtml,
    /<div class="db-modal" id="ideaRoundsComparisonModal" role="dialog" aria-modal="true" aria-labelledby="ideaCompareModalTitle">/
  );
  const headStart = dashboardHtml.indexOf('id="ideaRoundsComparisonModal"');
  const head = dashboardHtml.slice(headStart, headStart + 2200);
  assert.match(head, /id="ideaCompareModalTitle"/);
  assert.match(head, /data-i18n="idea_compare_modal_title"/);
  assert.match(head, /data-i18n-aria="btn_cancel"/);
});

test('ideaRoundsComparisonModal open/close run the shared lifecycle with compare-only scope', () => {
  assert.match(councilChunk, /function openIdeaCompareModal\(\)/);
  const openStart = councilChunk.indexOf('function openIdeaCompareModal()');
  const openBlock = councilChunk.slice(openStart, openStart + 2200);
  // Guards first: fewer than two rounds never open.
  assert.match(openBlock, /if \(runs\.length < 2\) \{\s+alert\(t\('idea_compare_no_rounds'\)\);\s+return;\s+\}/);
  assert.match(openBlock, /renderRoundsComparison\(runA, runB\);/);
  assert.match(openBlock, /a11y\.openDialog\(modal,/);
  assert.match(openBlock, /background: document\.querySelector\('\.db-wrapper'\)/);

  assert.match(councilChunk, /function closeIdeaCompareModal\(\) \{\s+const modal = document\.getElementById\('ideaRoundsComparisonModal'\);\s+if \(!modal\) return;/);
  const closeStart = councilChunk.indexOf('function closeIdeaCompareModal()');
  const closeBlock = councilChunk.slice(closeStart, closeStart + 600);
  assert.match(closeBlock, /a11y\.closeDialog\(modal\)/);
  // Every close path inherits the lifecycle via the definition (no new
  // listeners, so reopen cannot double them): X wiring + backdrop click.
  assert.match(councilChunk, /document\.querySelectorAll\('\.idea-compare-modal-close'\)\.forEach\(btn => \{\s+btn\.addEventListener\('click', closeIdeaCompareModal\);/);
});

test('compare render/select wiring intact in chunk for F04 extraction', () => {
  // Population, select-change re-render and compare entry points intact.
  assert.match(councilChunk, /function handleCompareSelectChange\(\)/);
  assert.match(councilChunk, /compareBtn\.addEventListener\('click', openIdeaCompareModal\);/);
  // No timers or focus calls anywhere on the compare open/select paths.
  const openStart = councilChunk.indexOf('function openIdeaCompareModal()');
  assert.doesNotMatch(councilChunk.slice(openStart, openStart + 2200), /\.focus\(|setTimeout/);
});
