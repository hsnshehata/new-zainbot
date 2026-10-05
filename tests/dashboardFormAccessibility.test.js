const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// E05 — labels/help/input associations, one form per slice (static
// assertions; E05c extends for instructionForm). Rule under test: every
// visible field has a programmatically-associated label (`for` ↔ id, so
// label-click focuses), and every action has an accessible name. No
// validation/business changes ride along.

const workspace = path.resolve(__dirname, '..');
const dashboardHtml = fs.readFileSync(path.join(workspace, 'public', 'dashboard.html'), 'utf8');

function formInner(formId) {
  const start = dashboardHtml.indexOf(`id="${formId}"`);
  assert.notEqual(start, -1, `Missing form #${formId}`);
  const formOpen = dashboardHtml.lastIndexOf('<form', start);
  const formClose = dashboardHtml.indexOf('</form>', start);
  assert.ok(formClose > formOpen, `Unclosed form #${formId}`);
  return dashboardHtml.slice(formOpen, formClose + '</form>'.length);
}

test('E05b: subscriptionRequestForm labels match their field ids', () => {
  const form = formInner('subscriptionRequestForm');
  for (const [labelKey, fieldId] of [
    ['subscription_label_period', 'subBillingPeriod'],
    ['subscription_label_method', 'subPaymentMethod'],
    ['subscription_label_reference', 'subPaymentReference'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
});

test('E05b: every visible subscription field is labeled; every action named', () => {
  const form = formInner('subscriptionRequestForm');
  const fields = [...form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(fields.length > 0, 'Expected subscription fields');
  for (const [, tag, attrs] of fields) {
    if (/type="(hidden|submit|button)"/.test(attrs)) continue;
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    const labelled =
      (id && new RegExp(`<label[^>]*for="${id}"`).test(form)) ||
      /aria-label="[^"]+"/.test(attrs) ||
      /aria-labelledby="[^"]+"/.test(attrs);
    assert.ok(labelled, `Unnamed ${tag}: ${attrs.slice(0, 80)}`);
  }
  assert.match(form, /<button type="submit"[^>]*data-i18n="subscription_btn_request">/);
  assert.match(form, /<a id="subscriptionWhatsappLink"[^>]*data-i18n="subscription_btn_whatsapp"[^>]*>/);
});

test('E05b: no per-field help text exists, so no describedby is invented', () => {
  const form = formInner('subscriptionRequestForm');
  // If a future slice adds field help, it must be wired — today there is
  // none, and pointing fields at the form-level prose would mislead.
  assert.doesNotMatch(form, /aria-describedby/);
  assert.doesNotMatch(form, /<small[^>]*id=/);
});

test('E05c: instructionForm label matches its field id (lifecycle intact)', () => {
  const form = formInner('instructionForm');
  assert.match(form, /<label for="instructionContentInput"[^>]*data-i18n="label_instruction_content"/);
  assert.match(form, /<textarea[^>]*id="instructionContentInput"/);
  // Hidden id input is exempt from naming; the visible textarea is covered.
  assert.match(form, /<input type="hidden" id="instructionIdInput" \/>/);
  // E02a lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /openInstructionModal\(event\?\.currentTarget\);/);
  assert.match(script, /ZainBotA11y\.openDialog\(instructionModal,/);
});

test('E05c: instructionForm visible field is labeled; no help invented', () => {
  const form = formInner('instructionForm');
  const fields = [...form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(fields.length > 0, 'Expected instruction fields');
  for (const [, tag, attrs] of fields) {
    if (/type="hidden"/.test(attrs)) continue;
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    const labelled =
      (id && new RegExp(`<label[^>]*for="${id}"`).test(form)) ||
      /aria-label="[^"]+"/.test(attrs) ||
      /aria-labelledby="[^"]+"/.test(attrs);
    assert.ok(labelled, `Unnamed ${tag}: ${attrs.slice(0, 80)}`);
  }
  assert.doesNotMatch(form, /aria-describedby/, 'no per-field help exists to link');
});

test('E05d: faqForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('faqForm');
  for (const [labelKey, fieldId] of [
    ['label_faq_question', 'faqQuestionInput'],
    ['label_faq_answer', 'faqAnswerInput'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input type="hidden" id="faqIdInput" \/>/);
  // E02b lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /openFaqModal\(event\?\.currentTarget\);/);
  assert.match(script, /ZainBotA11y\.openDialog\(faqModal,/);
});

test('E05d: faqForm visible fields are labeled; no help invented', () => {
  const form = formInner('faqForm');
  const fields = [...form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(fields.length > 0, 'Expected faq fields');
  for (const [, tag, attrs] of fields) {
    if (/type="hidden"/.test(attrs)) continue;
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    const labelled =
      (id && new RegExp(`<label[^>]*for="${id}"`).test(form)) ||
      /aria-label="[^"]+"/.test(attrs) ||
      /aria-labelledby="[^"]+"/.test(attrs);
    assert.ok(labelled, `Unnamed ${tag}: ${attrs.slice(0, 80)}`);
  }
  assert.doesNotMatch(form, /aria-describedby/, 'no per-field help exists to link');
});

test('E05e: recipientForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('recipientForm');
  for (const [labelKey, fieldId] of [
    ['label_rec_channel', 'recipientChannelSelect'],
    ['label_rec_target', 'recipientTargetInput'],
    ['label_rec_label', 'recipientLabelInput'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input type="hidden" id="recipientIdInput" \/>/);
  // E02e lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /window\.openRecipientModal = function\(\)/);
  const openStart = script.indexOf('window.openRecipientModal = function()');
  const openBlock = script.slice(openStart, openStart + 1200);
  assert.match(openBlock, /ZainBotA11y\.openDialog\(modal,/);
});

test('E05e: existing target help is describedby-linked (first describedby slice)', () => {
  const form = formInner('recipientForm');
  assert.match(form, /<small id="recipientTargetHint"[^>]*data-i18n="hint_rec_target">/);
  assert.match(form, /id="recipientTargetInput"[^>]*aria-describedby="recipientTargetHint"/);
});

test('E05e: checkbox group is named; each box has its wrapping label', () => {
  const form = formInner('recipientForm');
  assert.match(form, /<label id="recipientEventsLabel"[^>]*data-i18n="label_rec_events"/);
  assert.match(form, /<div class="checkbox-group" role="group" aria-labelledby="recipientEventsLabel">/);
  const boxes = [...form.matchAll(/<label class="checkbox-item"><input type="checkbox"[^>]*\/> <span data-i18n="([^"]+)">/g)];
  assert.equal(boxes.length, 5, `Expected 5 wrapped named checkboxes, found ${boxes.length}`);
});

test('E05f: bookingForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('bookingForm');
  for (const [labelKey, fieldId] of [
    ['label_customer_name', 'bookingCustomerName'],
    ['label_customer_phone', 'bookingCustomerPhone'],
    ['label_service_type', 'bookingServiceType'],
    ['label_booking_status', 'bookingStatusSelect'],
    ['label_booking_date', 'bookingDateTime'],
    ['label_slot_duration', 'bookingDuration'],
    ['label_booking_notes', 'bookingNotes'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input type="hidden" id="bookingIdInput" \/>/);
  // E02c lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /window\.openBookingModal = function\(bookingId = null\)/);
  const openStart = script.indexOf('window.openBookingModal = function');
  assert.match(script.slice(openStart, openStart + 2600), /ZainBotA11y\.openDialog\(modal,/);
});

test('E05f: bookingForm visible fields are labeled; D05 date logic untouched', () => {
  const form = formInner('bookingForm');
  const fields = [...form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(fields.length > 0, 'Expected booking fields');
  for (const [, tag, attrs] of fields) {
    if (/type="hidden"/.test(attrs)) continue;
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    const labelled =
      (id && new RegExp(`<label[^>]*for="${id}"`).test(form)) ||
      /aria-label="[^"]+"/.test(attrs) ||
      /aria-labelledby="[^"]+"/.test(attrs);
    assert.ok(labelled, `Unnamed ${tag}: ${attrs.slice(0, 80)}`);
  }
  assert.doesNotMatch(form, /aria-describedby/, 'no per-field help exists to link');
  // Date handling stays exactly as D05 owns it (attribute-only change).
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /const dateRaw = document\.getElementById\('bookingDateTime'\)\.value;/);
  assert.match(script, /isNaN\(parsedDate\.getTime\(\)\)/);
});

test('E05g: chatOrderForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('chatOrderForm');
  for (const [labelKey, fieldId] of [
    ['label_customer_name', 'orderCustomerName'],
    ['label_customer_phone', 'orderCustomerPhone'],
    ['label_customer_address', 'orderCustomerAddress'],
    ['label_order_items', 'orderItemsSummary'],
    ['label_total_amount', 'orderTotalAmount'],
    ['label_order_status', 'orderStatusSelect'],
    ['label_order_note', 'orderCustomerNote'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input type="hidden" id="chatOrderIdInput" \/>/);
  // E02d lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /window\.openOrderModal = function\(orderId = null\)/);
  const openStart = script.indexOf('window.openOrderModal = function');
  assert.match(script.slice(openStart, openStart + 2600), /ZainBotA11y\.openDialog\(modal,/);
});

test('E05g: chatOrderForm visible fields are labeled; D01 guards untouched', () => {
  const form = formInner('chatOrderForm');
  const fields = [...form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)];
  assert.ok(fields.length > 0, 'Expected order fields');
  for (const [, tag, attrs] of fields) {
    if (/type="hidden"/.test(attrs)) continue;
    const id = (attrs.match(/id="([^"]+)"/) || [])[1];
    const labelled =
      (id && new RegExp(`<label[^>]*for="${id}"`).test(form)) ||
      /aria-label="[^"]+"/.test(attrs) ||
      /aria-labelledby="[^"]+"/.test(attrs);
    assert.ok(labelled, `Unnamed ${tag}: ${attrs.slice(0, 80)}`);
  }
  assert.doesNotMatch(form, /aria-describedby/, 'no per-field help exists to link');
  // D01 route contract stays exactly as owned (attribute-only change).
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /res && \(res\.success \|\| res\._id\)/);
  assert.match(script, /chat_order_create_unsupported/);
});

test('E05h: agentForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('agentForm');
  for (const [labelKey, fieldId] of [
    ['agent_name', 'agentName'],
    ['agent_role', 'agentType'],
    ['agent_description', 'agentDescription'],
    ['agent_welcome_message', 'agentWelcomeMessage'],
    ['agent_instructions', 'agentInstructions'],
    ['agent_objectives', 'agentObjectives'],
    ['agent_handoff_keywords', 'agentHandoffKeywords'],
    ['agent_booking_hours_label', 'agentBookingWorkingHours'],
    ['agent_booking_service_label', 'agentBookingDefaultService'],
    ['agent_recovery_delay_label', 'agentSalesRecoveryDelay'],
    ['agent_recovery_msg_label', 'agentSalesRecoveryMsg'],
    ['agent_digest_channel_label', 'agentDailyDigestChannel'],
    ['agent_digest_time_label', 'agentDailyDigestTime'],
    ['agent_sales_tone_label', 'agentSalesTone'],
    ['agent_max_discount_label', 'agentMaxDiscount'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input id="agentId" type="hidden" \/>/);
  // E03a lifecycle + tier enforcement untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /ZainBotA11y\.openDialog\(agentModal,/);
  assert.match(script, /enforceToolAndSkillTierLimits\(\);\s+openAgentDialog\(\);/);
});

test('E05h: agent toggles/skills wrap natively; no help invented', () => {
  const form = formInner('agentForm');
  // 7 tool toggles + 5 skills + auto-reply: wrapping labels name them.
  const toolToggles = [...form.matchAll(/<label[^>]*>\s*<input id="(agentTool[A-Za-z]+|agentAutoReplyEnabled)" type="checkbox"/g)];
  assert.equal(toolToggles.length, 8, `Expected 8 wrapped tool/auto-reply toggles, found ${toolToggles.length}`);
  const skills = [...form.matchAll(/<label class="checkbox-item"><input type="checkbox" name="agentSkill"/g)];
  assert.equal(skills.length, 5, `Expected 5 wrapped skill checkboxes, found ${skills.length}`);
  assert.doesNotMatch(form, /aria-describedby/, 'no per-field help exists to link');
});

test('E05i: adminUserForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('adminUserForm');
  for (const [labelKey, fieldId] of [
    ['admin_username', 'adminUserUsername'],
    ['admin_email', 'adminUserEmail'],
    ['admin_whatsapp', 'adminUserWhatsapp'],
    ['admin_role', 'adminUserRole'],
    ['admin_subscription', 'adminUserSubscriptionType'],
    ['admin_plan_tier', 'adminUserTier'],
    ['th_user_status', 'adminUserStatus'],
    ['admin_verification', 'adminUserVerified'],
    ['admin_daily_usage', 'adminUserDailyUsage'],
    ['admin_monthly_usage', 'adminUserMonthlyUsage'],
    ['admin_temporary_password', 'adminUserPassword'],
    ['admin_confirm_password', 'adminUserConfirmPassword'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input id="adminUserId" type="hidden" \/>/);
  assert.match(form, /<input id="adminUserMode" type="hidden" value="edit" \/>/);
  // E03b lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /async function openAdminUserModal\(userId = ''\)/);
  assert.match(script, /ZainBotA11y\.openDialog\(adminUserModal,/);
});

test('E05i: existing password help is describedby-linked; role logic untouched', () => {
  const form = formInner('adminUserForm');
  assert.match(form, /<small id="adminUserPasswordHint"[^>]*data-i18n="admin_password_help">/);
  assert.match(form, /id="adminUserPassword"[^>]*aria-describedby="adminUserPasswordHint"/);
  // Role/permission population stays exactly as owned (attribute-only change).
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /document\.getElementById\('adminUserRole'\)\.value = user\.role \|\| 'user';/);
  assert.match(script, /role: document\.getElementById\('adminUserRole'\)\.value,/);
});

test('E05j: chatPageForm labels match their field ids (lifecycle intact)', () => {
  const form = formInner('chatPageForm');
  for (const [labelKey, fieldId] of [
    ['label_chat_page_title', 'chatPageTitleInput'],
    ['label_chat_page_slug', 'chatPageSlugInput'],
    ['label_color_header', 'chatColorHeader'],
    ['label_color_bg', 'chatColorBg'],
    ['label_color_bot_bubble', 'chatColorBotBubble'],
    ['label_color_user_bubble', 'chatColorUserBubble'],
    ['label_color_button', 'chatColorButton'],
    ['label_color_title', 'chatColorTitle'],
    ['label_chat_suggested_questions', 'chatPageSuggestedQuestions'],
    ['label_embed_widget_code', 'chatPageWidgetCode'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<input type="hidden" id="chatPageId" \/>/);
  assert.match(form, /<input type="hidden" id="chatPageBotId" \/>/);
  // E03d lifecycle wiring untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /window\.openChatPageModal = async function\(bot = null\)/);
  assert.match(script, /ZainBotA11y\.openDialog\(chatPageModalEl,/);
});

test('E05j: chatPage toggles/upload wrap natively; captions stay bare with reason', () => {
  const form = formInner('chatPageForm');
  const toggles = [...form.matchAll(/<label[^>]*>\s*<input type="checkbox" id="(chatPageSuggestedEnabled|chatPageImageUploadEnabled)"/g)];
  assert.equal(toggles.length, 2, 'Expected 2 wrapped customizer toggles');
  assert.match(form, /<label class="btn btn-secondary btn-sm"[^>]*>\s*<i class="fas fa-upload"><\/i> <span data-i18n="btn_upload_logo">/);
  // Deliberate exclusions (no focusable field to bind): preset-picker
  // caption (cards are div[onclick], keyboard support is a separate
  // decision), logo caption (file input is hidden + label-wrapped), color
  // section caption (prose, not field help). Pinned so wiring them later
  // is a conscious change, not drift.
  assert.doesNotMatch(form, /<label[^>]*data-i18n="label_preset_themes"[^>]*for=/);
  assert.doesNotMatch(form, /<label[^>]*data-i18n="label_chat_page_logo"[^>]*for=/);
});

test('E05k scope: settings-tab forms inventoried; covered vs excluded recorded', () => {
  // backupKeysForm + webhookConfigForm: labeled below (in-scope).
  for (const fid of ['backupKeysForm', 'webhookConfigForm']) {
    assert.notEqual(dashboardHtml.indexOf(`id="${fid}"`), -1, `Missing settings form #${fid}`);
  }
  // Filter rows need no labels: every control already carries a
  // translated accessible name (aria-label / data-i18n-aria).
  for (const fid of ['adminUserFilters', 'adminAuditFilters']) {
    const form = formInner(fid);
    assert.doesNotMatch(form, /<label/, `Filter form ${fid} must stay label-free`);
    const named = [...form.matchAll(/<(input|select)[^>]*>/g)];
    assert.ok(named.length > 0, `Expected filter controls in ${fid}`);
    for (const m of named) {
      assert.ok(/aria-label="[^"]+"|data-i18n-aria="[^"]+"/.test(m[0]), `Unnamed filter control in ${fid}: ${m[0].slice(0, 60)}`);
    }
  }
  // storeConnectorForm: already covered (for↔id + describedby present).
  const store = formInner('storeConnectorForm');
  assert.match(store, /<label for="storeUrl"[^>]*data-i18n="store_url_label"/);
  assert.match(store, /id="storeUrl"[^>]*aria-describedby="storeUrlHelp"/);
  assert.match(store, /<small id="storeUrlHelp"/);
});

test('E05k: backupKeysForm labels match their field ids', () => {
  const form = formInner('backupKeysForm');
  for (const [labelKey, fieldId] of [
    ['label_backup_provider', 'backupProvider'],
    ['label_backup_key', 'backupApiKey'],
    ['label_backup_model', 'backupModel'],
    ['label_backup_url', 'backupBaseUrl'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
});

test('E05k: webhookConfigForm labels match; event group is named', () => {
  const form = formInner('webhookConfigForm');
  for (const [labelKey, fieldId] of [
    ['label_webhook_url', 'webhookUrlInput'],
    ['label_webhook_secret', 'webhookSecretInput'],
  ]) {
    assert.match(form, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(form, new RegExp(`id="${fieldId}"`));
  }
  assert.match(form, /<label id="webhookEventsLabel"[^>]*data-i18n="label_webhook_events"/);
  assert.match(form, /<div class="checkbox-group" role="group" aria-labelledby="webhookEventsLabel">/);
  const boxes = [...form.matchAll(/<label class="checkbox-item"><input type="checkbox" name="webhookEvents"/g)];
  assert.equal(boxes.length, 3, `Expected 3 wrapped event checkboxes, found ${boxes.length}`);
});

test('E05k: adminKeyAddForm + adminNotifyForm labels match their ids', () => {
  const keys = formInner('adminKeyAddForm');
  for (const [labelKey, fieldId] of [
    ['admin_label_name', 'adminKeyName'],
    ['admin_label_provider', 'adminKeyProvider'],
    ['admin_label_key', 'adminKeySecret'],
    ['admin_label_model', 'adminKeyModel'],
    ['admin_label_priority', 'adminKeyPriority'],
    ['admin_label_base_url', 'adminKeyBaseUrl'],
  ]) {
    assert.match(keys, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(keys, new RegExp(`id="${fieldId}"`));
  }
  const notify = formInner('adminNotifyForm');
  for (const [labelKey, fieldId] of [
    ['notify_target', 'notifyTargetSelect'],
    ['notify_username_label', 'notifyUsernameInput'],
    ['notify_title_label', 'notifyTitleInput'],
    ['notify_body_label', 'notifyBodyInput'],
  ]) {
    assert.match(notify, new RegExp(`<label for="${fieldId}"[^>]*data-i18n="${labelKey}"`));
    assert.match(notify, new RegExp(`id="${fieldId}"`));
  }
});

test('E05k: impersonationForm reason matches its field id', () => {
  const form = formInner('impersonationForm');
  assert.match(form, /<label for="impersonationReason"[^>]*data-i18n="impersonation_reason"/);
  assert.match(form, /<textarea[^>]*id="impersonationReason"/);
  assert.match(form, /<input id="impersonationSubjectId" type="hidden" \/>/);
  // E03c session workflow untouched by the label change.
  const script = fs.readFileSync(path.join(workspace, 'public', 'js', 'dashboard_new.js'), 'utf8');
  assert.match(script, /apiFetch\('\/api\/admin\/impersonation\/sessions', \{ method: 'POST'/);
});
