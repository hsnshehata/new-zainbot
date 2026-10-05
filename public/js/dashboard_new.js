// public/js/dashboard_new.js

(function() {
  'use strict';

  /* <zainbot-lang-persistence> */
  window.ZainbotLangPersistence = window.ZainbotLangPersistence || (function () {
    var STORAGE_KEY = 'zainbot_lang';
    var memoryLanguage = null;
    function normalizeLanguage(value, defaultLanguage) {
      if (value === 'ar' || value === 'en') return value;
      return defaultLanguage;
    }
    function getStorage() {
      try {
        if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
      } catch (err) { /* storage blocked */ }
      return null;
    }
    function readStoredLanguage(defaultLanguage) {
      if (memoryLanguage === 'ar' || memoryLanguage === 'en') return memoryLanguage;
      var storage = getStorage();
      if (!storage) return defaultLanguage;
      try {
        return normalizeLanguage(storage.getItem(STORAGE_KEY), defaultLanguage);
      } catch (err) {
        return defaultLanguage;
      }
    }
    function writeStoredLanguage(language, defaultLanguage) {
      var normalized = normalizeLanguage(language, defaultLanguage);
      memoryLanguage = normalized;
      var storage = getStorage();
      if (!storage) return normalized;
      try {
        storage.setItem(STORAGE_KEY, normalized);
      } catch (err) { /* keep in-memory fallback */ }
      return normalized;
    }
    function resolveExternalLanguage(event, currentLanguage, defaultLanguage) {
      if (!event) return null;
      if (event.key !== null && event.key !== undefined && event.key !== STORAGE_KEY) return null;
      var next = normalizeLanguage(event.newValue, defaultLanguage);
      if (next === currentLanguage) return null;
      return next;
    }
    return {
      storageKey: STORAGE_KEY,
      normalizeLanguage: normalizeLanguage,
      readStoredLanguage: readStoredLanguage,
      writeStoredLanguage: writeStoredLanguage,
      resolveExternalLanguage: resolveExternalLanguage
    };
  })();
  /* </zainbot-lang-persistence> */

  /* <zainbot-dashboard-i18n> */
  window.ZainBotDashboardI18n = window.ZainBotDashboardI18n || (function () {
    var renderers = {};
    function getLanguage() {
      var lang = null;
      try {
        lang = (typeof currentLanguage !== 'undefined' && currentLanguage) || null;
      } catch (err) {
        lang = null;
      }
      if (lang !== 'ar' && lang !== 'en') {
        try {
          lang = window.ZainbotLangPersistence
            ? window.ZainbotLangPersistence.readStoredLanguage('ar')
            : 'ar';
        } catch (err2) {
          lang = 'ar';
        }
      }
      return lang;
    }
    function table() {
      try {
        if (typeof translations !== 'undefined' && translations) return translations;
      } catch (err) { /* fall through */ }
      return {};
    }
    function lookup(key) {
      var lang = getLanguage();
      var dict = table();
      if (dict[lang] && dict[lang][key] !== undefined && dict[lang][key] !== '') {
        return { value: dict[lang][key], missing: false };
      }
      if (dict.en && dict.en[key] !== undefined && dict.en[key] !== '') {
        return { value: dict.en[key], missing: true };
      }
      return { value: null, missing: true };
    }
    function interpolate(template, params) {
      if (!params) return template;
      return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
        return params[name] !== undefined && params[name] !== null ? String(params[name]) : match;
      });
    }
    function t(key, params) {
      var found = lookup(key);
      if (!found.missing) return interpolate(found.value, params);
      var strict = false;
      try {
        strict = typeof window !== 'undefined' && window.ZainbotI18nStrict === true;
      } catch (err) { strict = false; }
      if (strict) return '[i18n-missing:' + key + ']';
      if (found.value !== null) return interpolate(found.value, params);
      return key;
    }
    function registerLanguageRenderer(id, render) {
      if (typeof id !== 'string' || !id || typeof render !== 'function') {
        throw new Error('registerLanguageRenderer requires (id: string, render: function)');
      }
      renderers[id] = render;
      return function unregister() {
        if (renderers[id] === render) delete renderers[id];
      };
    }
    function refreshLanguageRenderers() {
      Object.keys(renderers).forEach(function (id) {
        try {
          renderers[id]();
        } catch (err) {
          if (typeof console !== 'undefined' && console.error) console.error('language renderer failed:', id, err);
        }
      });
    }
    return {
      t: t,
      getLanguage: getLanguage,
      registerLanguageRenderer: registerLanguageRenderer,
      refreshLanguageRenderers: refreshLanguageRenderers
    };
  })();
  /* </zainbot-dashboard-i18n> */

  /* <zainbot-dashboard-locale> */
  function dashboardLanguage() {
    try {
      if (typeof currentLanguage !== 'undefined' && (currentLanguage === 'ar' || currentLanguage === 'en')) {
        return currentLanguage;
      }
    } catch (err) { /* fall through to default */ }
    return 'en';
  }
  function dashboardUnavailableText() {
    try {
      if (typeof window !== 'undefined' && window.ZainBotDashboardI18n) {
        return window.ZainBotDashboardI18n.t('format_date_unavailable');
      }
    } catch (err) { /* fall through */ }
    try {
      if (typeof translations !== 'undefined' && translations) {
        var lang = dashboardLanguage();
        if (translations[lang] && translations[lang].format_date_unavailable) {
          return translations[lang].format_date_unavailable;
        }
        if (translations.en && translations.en.format_date_unavailable) {
          return translations.en.format_date_unavailable;
        }
      }
    } catch (err2) { /* fall through */ }
    return 'Unavailable';
  }
  function formatDate(value, options) {
    if (value === undefined || value === null || value === '') {
      return dashboardUnavailableText();
    }
    var date = value instanceof Date ? value : new Date(value);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      return dashboardUnavailableText();
    }
    try {
      return date.toLocaleString(dashboardLanguage() === 'ar' ? 'ar-EG' : 'en-US', options);
    } catch (err) {
      return dashboardUnavailableText();
    }
  }
  function formatNumber(value, options) {
    if (value === undefined || value === null || value === '') return '';
    var num = typeof value === 'number' ? value : Number(value);
    if (typeof num !== 'number' || Number.isNaN(num)) {
      return String(value === undefined || value === null ? '' : value);
    }
    try {
      return num.toLocaleString(dashboardLanguage() === 'ar' ? 'ar-EG' : 'en-US', options);
    } catch (err) {
      return String(num);
    }
  }
  /* </zainbot-dashboard-locale> */

  // State Management
  let currentUser = null;
  let currentBot = null;
  let workspaceBots = [];
  let activeTab = 'page-overview';
  let currentLanguage = window.ZainbotLangPersistence.readStoredLanguage('ar');
  let conversations = [];
  let selectedConversationId = null;

  // Cache/DOM selectors
  const sidebar = document.getElementById('sidebar');
  const menuMobileToggle = document.getElementById('menuMobileToggle');
  const sidebarScrim = document.getElementById('sidebarScrim');
  const mobileSidebarMedia = window.matchMedia('(max-width: 991px)');
  const langToggleBtn = document.getElementById('dashboardLangToggle');
  const headerUsername = document.getElementById('headerUsername');
  const headerUserAvatar = document.getElementById('headerUserAvatar');
  const sidebarLogout = document.getElementById('sidebarLogout');
  const accountMenuToggle = document.getElementById('accountMenuToggle');
  const accountMenu = document.getElementById('accountMenu');
  
  // Translation Table
  const translations = {
    en: {
      menu_overview: 'Overview',
      menu_inbox: 'Omnichannel Inbox',
      inbox_select_chat: 'Select a chat',
      inbox_no_channel: 'No active channel',
      menu_training: 'AI Training',
      menu_channels: 'Connections',
      menu_orders: 'Orders & Bookings',
      menu_settings: 'Settings & Billing',
      menu_admin: 'Super Admin Control',
      menu_agents: 'AI Agents',
      agents_title: 'AI Agents',
      onboard_title: 'Get your first real reply',
      onboard_progress: '{count} of 3 steps complete',
      onboard_personalize_title: '1. Personalize your agent',
      onboard_personalize_desc: 'Give your agent a welcome message, description or instructions for your business.',
      onboard_personalize_action: 'Edit agent',
      onboard_train_title: '2. Add a real answer',
      onboard_train_desc: 'Save a question and answer your customers actually ask.',
      onboard_train_action: 'Add FAQ',
      onboard_test_title: '3. Try the live chat',
      onboard_test_desc: 'Send a question through your agent’s web chat and check its reply. Opening the page alone does not complete this step.',
      onboard_test_action: 'Open live chat',
      onboard_done: 'Complete',
      onboard_todo: 'To do',
      onboard_checking: 'Checking progress…',
      onboard_no_bot: 'Create an agent to start. Your progress will appear here once it is available.',
      onboard_create: 'Create an agent',
      onboard_unavailable: 'Could not check progress. Return to Overview to retry.',
      onboard_chat_unavailable: 'Could not load the live chat link. Please try again.',
      agents_desc: 'Build distinct agents for support, sales, and lead qualification. Choose one active agent for the workspace.',
      agents_create: 'Create agent',
      agent_modal_create: 'Create agent',
      agent_modal_edit: 'Edit agent',
      agents_entitlement_unit: 'agents used on',
      agent_autoreply_off: 'Auto-reply off',
      agent_autoreply_on: 'Auto-reply on',
      agent_no_description: 'No description yet.',
      agent_current: 'Current agent',
      agent_use_this: 'Use this agent',
      agent_customize_chat: 'Customize & Chat',
      agents_empty_create_first: 'Create your first agent to begin.',
      agent_free_tools_limit: 'Free plan limit: 3 tools max, all skills included',
      agent_save_failed: 'Could not save agent.',
      agent_name: 'Agent name',
      agent_role: 'Agent role',
      agent_role_support: 'Customer support',
      agent_role_sales: 'Sales',
      agent_role_leads: 'Lead qualification',
      agent_role_custom: 'Custom',
      agent_description: 'Description',
      agent_welcome_message: 'Welcome message',
      agent_description_placeholder: 'What this agent is responsible for',
      agent_instructions: 'Instructions',
      agent_instructions_placeholder: 'Tone, source of truth, do-not-do rules, and escalation behavior',
      agent_objectives: 'Objectives',
      agent_objectives_placeholder: 'One objective per line',
      agent_handoff_keywords: 'Human handoff keywords',
      agent_handoff_placeholder: 'human, manager, complaint',
      agent_auto_reply: 'AI auto-reply enabled',
      agent_save: 'Save agent',

      // Settings control center (reorganized)
      settings_intro_desc: 'All agent and workspace controls in one place, organized into ordered sections: Agent Instructions, Agent Capabilities, Notifications, AI Model, Developer Integrations.',
      set_sec_instructions_title: 'Agent Instructions & Personality',
      set_sec_instructions_desc: 'What your agent says and how it behaves: welcome message, persona rules, objectives, and handoff to humans. Applies to the active agent.',
      set_open_training: 'Open AI Training',
      set_sec_capabilities_title: 'Agent Capabilities',
      set_sec_capabilities_desc: 'Enable or disable what the active agent can do: bookings, order tracking, notifications, recovery, digests, and upselling. Edit details in the agent card.',
      set_open_agents: 'Edit Active Agent',
      dev_integrations_title: 'Developer Integrations & Webhooks',
      dev_integrations_desc: 'Generate access keys for external apps and push platform events to your own systems in real time.',
      wh_event_msg_received: 'message.received',
      wh_event_msg_sent: 'message.sent',
      wh_event_order_created: 'order.created',
      set_no_agent: 'No active agent selected yet. Create or choose one from the AI Agents page.',
      set_state_enabled: 'Enabled',
      set_state_disabled: 'Off',
      set_value_not_set: 'Not set',
      set_label_welcome: 'Welcome message',
      set_label_persona_rules: 'Persona instructions',
      set_unit_lines: 'lines',
      set_label_objectives: 'Objectives',
      set_label_handoff: 'Human handoff keywords',
      set_label_auto_reply: 'AI auto-reply',
      set_label_tools: 'Tools',
      set_label_skills: 'Skills',
      set_tool_booking: 'Bookings & appointments',
      set_tool_orders: 'Order tracking',
      set_tool_wa: 'WhatsApp alerts',
      set_tool_tg: 'Telegram alerts',
      set_tool_recovery: 'Abandoned sales recovery',
      set_tool_digest: 'Daily digest',
      set_tool_upsell: 'Smart upselling',
      admin_search_placeholder: 'Search username, email, or WhatsApp',
      admin_filter_role: 'Filter by role',
      admin_filter_status: 'Filter by status',
      admin_filter_tier: 'Filter by plan tier',
      admin_all_roles: 'All roles',
      admin_visible_accounts: 'Visible accounts',
      admin_all_tiers: 'All tiers',
      admin_apply: 'Apply',
      admin_previous: 'Previous',
      admin_next: 'Next',
      admin_pagination_unit: 'accounts — page',
      admin_load_failed: 'Could not load accounts.',
      admin_empty_match: 'No matching accounts.',
      admin_role_superadmin_word: 'Super admin',
      admin_role_user_word: 'User',
      admin_status_deleted: 'Deleted',
      admin_bots_unit: 'agent(s)',
      admin_action_edit: 'Edit',
      admin_action_agents: 'Agents',
      admin_action_temp_access: 'Temporary access',
      admin_action_activate: 'Activate',
      admin_action_suspend: 'Suspend',
      admin_action_archive: 'Archive',
      admin_status_change_confirm: 'Change account status to {status}?',
      admin_update_failed: 'Could not update account.',
      admin_archive_confirm: 'Sign-in will stop while conversations and channels are preserved. Continue?',
      admin_archive_failed: 'Could not archive account.',
      admin_account_bots_missing: 'No loaded agents for this account. Reload the list.',
      admin_account_bots_title: `{username}'s agents`,
      admin_bots_loading: 'Loading...',
      admin_bot_running: 'Running',
      admin_bot_stopped: 'Stopped',
      admin_bot_stop: 'Stop',
      admin_bot_start: 'Start',
      admin_bot_update_failed: 'Could not update the agent.',
      admin_account_no_bots: 'This account has no agents yet.',
      admin_user_modal_edit: 'Edit account',
      admin_user_modal_add: 'Add account',
      admin_account_load_failed: 'Could not load account.',
      admin_impersonation_banner: 'You are temporarily viewing {username}. Activity is audited.',
      admin_impersonation_self: 'this account',
      admin_account_save_failed: 'Could not save account.',
      admin_impersonation_start_failed: 'Could not start temporary access.',
      admin_session_expired: 'The admin session is unavailable. Please sign in again.',
      admin_impersonation_end_failed: 'Could not safely end the temporary session.',
      admin_exit_impersonation: 'Exit and return to admin',
      admin_tier_growth_1k: 'Growth 1K',
      admin_tier_growth_10k: 'Growth 10K',
      admin_tier_growth_50k: 'Growth 50K',
      admin_tier_unlimited: 'Unlimited',
      admin_legacy_status_confirm: 'Are you sure you want to change the merchant/user status to {status}?',
      admin_legacy_status_failed: 'Could not update the user status.',
      admin_legacy_impersonate_confirm: 'Switch immediately into this merchant account to browse and manage their bots and channels?',
      admin_legacy_impersonate_ok: 'Signed in to the merchant account. Loading their dashboard...',
      admin_legacy_impersonate_failed: 'Direct impersonation failed.',
      admin_legacy_auth_error: 'An authentication error occurred.',
      admin_key_delete_confirm: 'Are you sure you want to delete this server key?',
      admin_user_modal: 'Manage user',
      admin_username: 'Username',
      admin_email: 'Email',
      admin_whatsapp: 'WhatsApp',
      admin_role: 'Role',
      admin_user: 'User',
      admin_superadmin: 'Super admin',
      admin_subscription: 'Subscription',
      admin_plan_tier: 'Plan tier',
      admin_free: 'Free',
      admin_monthly: 'Monthly',
      admin_yearly: 'Yearly',
      admin_active: 'Active',
      admin_suspended: 'Suspended',
      admin_verification: 'Verification',
      admin_verified: 'Verified',
      admin_not_verified: 'Not verified',
      admin_daily_usage: 'Daily messages used',
      admin_monthly_usage: 'Monthly messages used',
      admin_temporary_password: 'Temporary password',
      admin_password_help: 'Leave empty to keep the existing password.',
      admin_confirm_password: 'Confirm password',
      admin_save_user: 'Save user',
      impersonation_title: 'Start audited access',
      impersonation_desc: 'This starts a temporary, audited session. Enter the reason for access.',
      impersonation_reason: 'Reason',
      impersonation_continue: 'Continue',
      logout: 'Logout',
      account_quota_remaining: 'Messages remaining',
      account_settings: 'Account settings',
      account_help_guide: 'First conversation guide',
      stat_conversations: 'Conversations',
      stat_messages: 'Messages handled',
      stat_connected_channels: 'Reported links (delivery unverified)',
      stat_training_rules: 'Training rules',
      workspace_status_title: 'Workspace status',
      workspace_status_desc: 'A live summary of the bot currently selected for this workspace.',
      workspace_active_bot: 'Active bot',
      workspace_auto_reply: 'AI auto-reply',
      workspace_orders: 'Orders from chats',
      status_enabled: 'Enabled',
      status_disabled: 'Disabled',
      quota_unlimited: 'Unlimited',
      stat_active_chats: 'Active Chats',
      stat_response_speed: 'Avg Response Speed',
      stat_satisfaction: 'Customer Satisfaction',
      stat_orders_count: 'Completed Orders',
      usage_summary_title: 'Monthly Plan & Quota',
      current_plan_label: 'Current Plan:',
      conversations_used_label: 'Conversations Used',
      performance_chart_title: 'Conversation Volume Trend',
      funnel_title: 'Sales Pipeline',
      funnel_leads: 'New Leads',
      funnel_qualified: 'Qualified Leads',
      funnel_closed: 'Closed Won',
      inbox_chat_list_title: 'Conversations Feed',
      inbox_empty: 'No conversations found.',
      inbox_loading: 'Loading conversations...',
      inbox_load_error: 'Error loading feed.',
      inbox_default_name: 'Customer',
      inbox_default_channel: 'Web Chat',
      inbox_reply_saved_not_sent: 'Reply saved to the conversation, not yet sent via the channel.',
      inbox_no_bot: 'Select an agent to view conversations.',
      inbox_reply_failed: 'Could not confirm sending. Check the conversation before retrying — the message may have been sent.',
      overview_stats_failed: 'Could not refresh overview stats. Previous values are kept.',
      bootstrap_load_failed: 'Could not load your profile. Check your connection, then retry — you are still signed in.',
      auto_reply_toggle_label: 'AI Auto-Reply',
      select_chat_instructions: 'Select a conversation from the feed to view history and chat.',
      chat_reply_placeholder: 'Type a message to take over...',
      training_title: 'AI Training Center',
      training_brand_guidelines_title: 'Brand Guidelines & Prompt',
      label_welcome_message: 'Welcome Message',
      label_custom_instructions: 'Custom Persona Instructions',
      training_welcome_placeholder: 'Enter a standard greeting message...',
      training_persona_placeholder: "For example, describe the bot's tone, responsibilities, and escalation rules.",
      training_empty_faqs: 'No FAQ rules yet. Add your first question and answer.',
      instruction_modal_add: 'Add General Instruction',
      instruction_modal_edit: 'Edit General Instruction',
      instruction_delete_confirm: 'Are you sure you want to delete this instruction?',
      faq_modal_add: 'Create FAQ Rule',
      faq_modal_edit: 'Edit FAQ Rule',
      faq_delete_confirm: 'Are you sure you want to delete this FAQ rule?',
      training_guidelines_saved: 'Settings saved successfully!',
      training_guidelines_failed: 'Could not save settings. Your edits were kept.',
      faq_save_failed: 'Could not save the FAQ. Your edits were kept.',
      instruction_save_failed: 'Could not save the instruction. Your edits were kept.',
      training_load_failed: 'Could not refresh training data. Previous values are kept.',
      save_guidelines_btn: 'Save Settings',
      training_faqs_title: 'FAQs Rules List',
      btn_add_faq: 'Add FAQ',
      channels_title: 'Connect Your Channels',
      chan_desc_wa: 'Connect official cloud API or gateway.',
      chan_desc_fb: 'Automate replies on Facebook pages.',
      chan_desc_ig: 'Direct Messages & Comment automation.',
      chan_desc_tg: 'Integrate custom Telegram chatbot.',
      chan_wa_qr_title: 'Connect WhatsApp via QR Code',
      chan_wa_qr_generating: 'Generating QR Code...',
      chan_wa_qr_steps: 'Open WhatsApp on your phone > Linked Devices > Link a Device > Scan the QR code above.',
      chan_wa_disconnect: 'Disconnect Session',
      chan_wa_qr_alt: 'WhatsApp QR Code',
      chan_wa_connected_ok: 'WhatsApp is connected.',
      chan_wa_preparing_qr: 'Preparing QR code…',
      chan_wa_session_failed: 'Could not start WhatsApp session.',
      chan_wa_qr_failed: 'Could not generate the QR code. Try again.',
      chan_fb_title: 'Facebook Page Direct Connect',
      chan_fb_token_label: 'Page Access Token',
      chan_fb_id_label: 'Page ID',
      chan_fb_steps: '1. Go to developers.facebook.com and select your App.<br>2. Select your FB Page in Graph API Explorer & generate Page Access Token.<br>3. Copy & paste the token below.',
      chan_ig_title: 'Instagram Direct Connect',
      chan_ig_token_label: 'Instagram Access Token',
      chan_ig_id_label: 'Instagram Page ID',
      chan_ig_steps: '1. Link your IG Business account to your Facebook Page.<br>2. Generate Page/IG Access Token in Meta Developer Console.<br>3. Copy & paste the token and account ID below.',
      chan_how_to: 'How to get?',
      chan_save_connection: 'Save Connection',
      chan_tg_title: 'Connect Telegram',
      chan_tg_intro: 'Link your agent to the official platform bot on Telegram to receive notifications. Generate a link code, then send it to the official bot.',
      chan_tg_step_1: 'Click the "Generate link code" button below.',
      chan_tg_step_2: 'Open the official bot in Telegram and press Start.',
      chan_tg_step_3: 'Send the code as a single message.',
      chan_tg_generate_code: 'Generate link code',
      chan_tg_linked_ok: 'Linked to a Telegram account',
      chan_tg_active_code: 'Active code already issued:',
      chan_tg_your_code: 'Your link code:',
      chan_tg_send_before_expiry: 'Send it to <a href="https://t.me/{u}" target="_blank" rel="noopener" style="color:var(--cyan);">@{u}</a> before it expires.',
      chan_status_checking: 'Checking status…',
      chan_status_unavailable: 'Status unavailable — please retry',
      chan_status_inactive: 'Agent disabled',
      chan_status_paused: 'Auto-reply disabled',
      chan_status_not_setup: 'Not configured',
      chan_status_unverified: 'Configured — live connection unverified',
      chan_status_wa_connected: 'Session reports connected — delivery unverified',
      chan_status_wa_attention: 'Session needs attention — reconnect or check QR',
      chan_status_tg_linked: 'Account linked — delivery unverified',
      wa_relink_banner_title: 'WhatsApp needs reconnecting',
      wa_relink_banner_desc: 'Your WhatsApp session was disconnected or needs attention. Reconnect now to keep receiving messages — your previous settings are kept.',
      wa_relink_banner_action: 'Reconnect WhatsApp',
      wa_relink_banner_action_aria: 'Reconnect WhatsApp via QR code',
      btn_configure: 'Configure',
      website_widget_title: 'Website Chat Widget',
      website_widget_desc: 'Copy this script tag and insert it before the closing body tag of your HTML to display the chat icon.',
      ecommerce_sync_title: 'Product information for your agent',
      th_booking_notes: 'AI Summary / Notes',
      settings_billing_title: 'Settings & Developer Integrations',
      dev_api_keys_title: 'Developer Access Keys',
      btn_gen_key: 'Generate Key',
      dev_webhooks_title: 'Outbound Webhooks URL',
      label_webhook_url: 'Destination Webhook URL',
      label_webhook_secret: 'Signing Secret Key (HMAC)',
      label_webhook_events: 'Subscribed Events',
      btn_save_webhook: 'Save Config',
      webhook_logs_title: 'Outgoing Webhook Delivery History',
      th_wh_time: 'Timestamp',
      th_wh_event: 'Event',
      th_wh_url: 'URL',
      th_wh_status: 'HTTP Status',
      th_wh_actions: 'Action',
      backup_keys_heading: 'Quota Fail-safe backup API key (Growth plan)',
      backup_keys_desc: 'Input your own API key. If your monthly package quota is depleted, our engine will automatically switch to your key instead of shutting down the bot.',
      label_backup_provider: 'AI Provider',
      label_backup_key: 'API Key',
      label_backup_model: 'Default Model',
      label_backup_url: 'Custom Endpoint Base URL',
      btn_save_backup_settings: 'Save Key Settings',
      btn_cancel: 'Cancel',
      btn_close: 'Close',
      btn_save: 'Save Rule',
      label_faq_question: 'Question / Keywords',
      label_faq_answer: 'Expected Answer',
      faq_question_placeholder: 'For example, delivery times',
      faq_answer_placeholder: 'For example, we deliver within three business days across Cairo.',
      orders_empty: 'No orders generated yet.',
      api_keys_empty: 'No API keys generated.',
      webhook_history_empty: 'No webhook history.',
      webhook_status_timeout: 'TIMEOUT/ERROR',
      webhook_retry_action: 'Retry',
      webhook_saved_ok: 'Webhook settings saved successfully!',
      webhook_retry_ok: 'Webhook redelivered successfully!',
      webhook_retry_failed: 'Webhook retry failed.',
      apikey_name_prompt: 'Enter a name for the access key:',
      apikey_created_alert: 'Key generated successfully! Your access key is (Please copy it now, you will not see it again):\n\n{key}',
      apikey_revoke_confirm: 'Are you sure you want to revoke this access key?',
      backup_saved_ok: 'Backup key settings saved successfully!',
      admin_title: 'Super Admin Control Center',
      admin_desc: 'Full system management: users, merchants, roles, direct impersonation, and global AI failover provider keys.',
      admin_subtab_users: 'Users & Merchants Control',
      admin_subtab_keys: 'AI Failover Servers & Keys',
      admin_users_title: 'Registered Users & Merchants',
      admin_users_desc: 'Manage roles, subscriptions, suspend accounts, and impersonate users.',
      admin_btn_add_user: 'Add New User / Merchant',
      th_user_username: 'Username',
      th_user_email: 'Email',
      th_user_role: 'Role',
      th_user_tier: 'Plan Tier',
      th_user_status: 'Status',
      th_user_bots: 'Bots',
      th_user_actions: 'Quick Actions',
      admin_loading_users: 'Loading users list...',
      admin_active_keys: 'Active Global API Keys & Priority Order',
      admin_btn_reset: 'Reset Failed Keys',
      admin_register_key: 'Register Global Provider Key',
      admin_label_name: 'Key Name / Description',
      admin_label_provider: 'AI Provider',
      admin_label_key: 'API Key',
      admin_label_model: 'Default Model',
      admin_label_priority: 'Priority Rank (1 = Highest)',
      admin_label_base_url: 'Base URL (Optional)',
      admin_btn_register: 'Register Server Key',
      admin_no_keys: 'No global server keys registered. Register one on the right.',
      admin_status_working: 'WORKING',
      admin_status_failed: 'FAILED',
      admin_lbl_provider: 'Provider',
      admin_lbl_model: 'Model',
      admin_lbl_priority: 'Priority',
      admin_subtab_overview: 'System Overview',
      admin_subtab_audit: 'Audit & Sessions',
      admin_subtab_notify: 'Notifications',
      training_general_title: 'General Agent Instructions',
      training_general_desc: 'Standing directives that define your agent\'s identity and behavior. These carry over from the previous platform and are injected into every reply.',
      btn_add_instruction: 'Add Instruction',
      label_instruction_content: 'Instruction',
      instruction_content_placeholder: 'For example, always greet customers in Egyptian Arabic and never quote prices outside the catalog.',
      training_empty_general: 'No general instructions yet. Add the directives that define your agent\'s identity.',
      ov_users_total: 'Total users',
      ov_users_active: 'Active users',
      ov_bots_total: 'Total agents',
      ov_bots_active: 'Active agents',
      ov_conversations: 'Conversations',
      ov_messages: 'Messages',
      ov_chat_orders: 'Chat orders',
      ov_active_sessions: 'Active impersonations',
      ov_audit_events: 'Audit events',
      audit_sessions_title: 'Impersonation Sessions',
      audit_sessions_desc: 'Every admin impersonation session with its reason, status, and lifetime.',
      th_session_actor: 'Admin',
      th_session_subject: 'Target user',
      th_session_reason: 'Reason',
      th_session_status: 'Status',
      th_session_started: 'Started',
      th_session_expires: 'Expires',
      admin_loading_sessions: 'Loading sessions...',
      audit_events_title: 'Audit Log',
      audit_events_desc: 'Redacted record of every admin and impersonated mutation.',
      audit_filter_type: 'Filter by event type',
      audit_filter_all: 'All events',
      audit_type_started: 'Impersonation started',
      audit_type_ended: 'Impersonation ended',
      audit_type_imp_write: 'Impersonated write',
      audit_type_admin_write: 'Admin write',
      th_event_when: 'When',
      th_event_type: 'Event',
      th_event_actor: 'Actor → Target',
      th_event_action: 'Action',
      th_event_outcome: 'Outcome',
      admin_loading_events: 'Loading audit log...',
      admin_empty_sessions: 'No impersonation sessions recorded yet.',
      admin_empty_events: 'No audit events match this filter yet.',
      notify_title: 'Send Platform Notification',
      notify_desc: 'Deliver an in-app notification to every account or to one specific user.',
      notify_target: 'Target',
      notify_target_all: 'All users',
      notify_target_single: 'Specific user (by username)',
      notify_username_label: 'Username',
      notify_title_label: 'Title',
      notify_body_label: 'Message',
      notify_send_btn: 'Send notification',
      notify_sent_ok: 'Notification delivered successfully!',
      notify_failed: 'Could not send the notification.',
      admin_subtab_landing_demo: 'Landing Demo Bot',
      landing_demo_title: 'Landing Page Demo Agent',
      landing_demo_desc: 'Controls the real AI agent answering visitor questions inside the "Try it live" chat on the marketing landing page.',
      landing_demo_enable_label: 'Live AI demo enabled',
      landing_demo_instructions_label: 'Agent instructions',
      landing_demo_instructions_placeholder: 'Extra tone, boundaries, offers, or knowledge the demo agent must follow.',
      landing_demo_instructions_hint: 'These instructions are added on top of the built-in platform knowledge base.',
      landing_demo_save_btn: 'Save settings',
      landing_demo_saved_ok: 'Saved successfully!',
      landing_demo_save_failed: 'Could not save the settings.',
      landing_demo_updated_at: 'Last updated',
      model_select_heading: 'AI Model',
      model_select_desc: 'Choose Auto to let the platform pick the best available model for your plan, or select a specific model from the list enabled for your account.',
      model_select_label: 'Model',
      model_select_auto: 'Auto (recommended)',
      model_select_save: 'Save model',
      model_saved_ok: 'Model selection saved successfully!',
      model_save_failed: 'This model is not available on your current plan.',
      model_loading_list: 'Loading available models...',
      orders_bookings_title: 'Orders & Appointments Center',
      orders_bookings_subtitle: 'Manage orders created from live chats and schedule, modify, and track customer appointments in real time.',
      btn_new_booking: 'New Appointment',
      btn_new_order: 'New Order',
      btn_refresh: 'Refresh',
      stat_orders_total: 'Total Orders',
      stat_orders_pending: 'Pending Orders',
      stat_bookings_total: 'Total Appointments',
      stat_bookings_confirmed: 'Confirmed Bookings',
      orders_search_placeholder: 'Search by customer name, phone, or service...',
      orders_status_filter: 'Filter by status',
      orders_type_filter: 'Filter view type',
      filter_all_statuses: 'All Statuses',
      status_pending: 'Pending',
      status_processing: 'Processing',
      status_confirmed: 'Confirmed',
      status_completed: 'Completed',
      status_rescheduled: 'Rescheduled',
      status_shipped: 'Shipped',
      status_delivered: 'Delivered',
      status_cancelled: 'Cancelled',
      filter_view_all: 'All Records',
      filter_view_orders: 'Orders Only',
      filter_view_bookings: 'Appointments Only',
      appointments_list_title: 'AI Booked Appointments Calendar',
      th_booking_id: 'Booking ID',
      th_booking_customer: 'Customer',
      th_booking_phone: 'Phone',
      th_booking_service: 'Service / Purpose',
      th_booking_time: 'Date & Time',
      th_booking_status: 'Status',
      th_booking_actions: 'Actions',
      chat_orders_list_title: 'Orders Automatically Generated by AI',
      th_order_id: 'Order ID',
      th_customer: 'Customer Name',
      th_phone: 'Phone',
      th_items: 'Items',
      th_total: 'Total',
      th_status: 'Status',
      th_order_actions: 'Actions',
      notification_recipients_title: 'Multi-Channel Notification Recipients',
      notification_recipients_desc: 'Connect multiple WhatsApp numbers and Telegram accounts/channels to receive instant order and appointment notifications.',
      btn_add_recipient: 'Add Notification Channel',
      recipient_tier_free_hint: 'Free plan allows 1 notification recipient channel. Upgrade to Growth for unlimited channels.',
      upgrade_plan_link: 'Upgrade Plan',
      subscription_title: 'Subscription & Upgrade',
      subscription_desc: 'Monthly subscriptions with manual activation. Pay with Instapay or cash wallet, then contact the owner on WhatsApp.',
      subscription_current_free: 'Free plan',
      subscription_intent_hint: 'You selected {plan}. It is not active yet; review the payment instructions before requesting activation.',
      subscription_whatsapp_message: 'Hello ZainBot, I have a question about the {plan} plan and how to activate it.',
      subscription_plan_free: 'Free • 0',
      subscription_plan_growth1: 'Growth Starter • 199',
      subscription_plan_growth2: 'Growth Plus • 499',
      subscription_plan_growth3: 'Growth Pro • 999',
      subscription_plan_enterprise: 'Enterprise • 4999',
      subscription_label_period: 'Billing period',
      subscription_monthly: 'Monthly',
      subscription_yearly: 'Yearly (save 2 months)',
      subscription_label_method: 'Payment method',
      pay_instapay: 'Instapay',
      pay_vodafone: 'Vodafone Cash',
      pay_orange: 'Orange Money',
      pay_etisalat: 'Etisalat Cash',
      subscription_label_reference: 'Payment reference / receipt',
      subscription_reference_placeholder: 'Transaction ID or sender number',
      subscription_btn_request: 'Submit activation request',
      subscription_btn_whatsapp: 'Contact on WhatsApp',
      subscription_payment_hint: 'We accept: Instapay • Vodafone Cash • Orange Money • Etisalat Cash. Activation is manual within hours after receipt review.',
      th_sub_tier: 'Plan',
      th_sub_period: 'Period',
      th_sub_method: 'Method',
      th_sub_status: 'Status',
      th_sub_date: 'Date',
      th_sub_user: 'User',
      th_sub_actions: 'Actions',
      admin_subtab_subs: 'Subscriptions',
      admin_subs_title: 'Subscription Requests',
      admin_subs_desc: 'Review manual payments (Instapay / cash wallet) and approve to activate the plan.',
      admin_subs_all: 'All statuses',
      admin_subs_pending: 'Pending',
      admin_subs_approved: 'Approved',
      admin_subs_rejected: 'Rejected',
      admin_subs_refresh: 'Refresh',
      admin_subs_loading: 'Loading requests...',
      subscription_my_requests_empty: 'No requests yet.',
      subscription_already_free: 'You are already on the free plan.',
      subscription_request_sent: 'Request sent. Contact us on WhatsApp with your receipt to activate.',
      subscription_request_failed: 'Could not submit request',
      subscription_request_pending: 'You already have a request under review. Showing its current status — no new request was sent.',
      subscription_request_unknown: 'Could not confirm submission — your payment reference was kept. Check your requests before trying again.',
      subscription_review_conflict: 'This request was already reviewed. Showing the current status — nothing was sent twice.',
      subscription_list_error: 'Could not load subscription requests.',
      subscription_admin_empty: 'No requests.',
      subscription_action_approve: 'Approve',
      subscription_action_reject: 'Reject',
      subscription_action_error: 'Error',
      th_rec_channel: 'Channel',
      th_rec_target: 'Target / Destination',
      th_rec_label: 'Label / Description',
      th_rec_events: 'Subscribed Events',
      th_rec_status: 'Status',
      th_rec_actions: 'Actions',
      agent_tools_section_title: 'Agent Tools',
      agent_tool_booking_title: 'Appointment & Booking Scheduling Tool',
      agent_booking_hours_label: 'Working Hours',
      agent_booking_service_label: 'Default Service / Purpose',
      agent_tool_orders_title: 'Order Tracking & Management Tool',
      agent_tool_wa_title: 'Instant WhatsApp Notifications Tool',
      agent_tool_tg_title: 'Instant Telegram Notifications Tool',
      agent_skills_section_title: 'Agent Skills',
      skill_sales: 'Smart Sales Consultant',
      skill_appointments: 'Appointment Coordinator',
      skill_orders: 'Order & Delivery Manager',
      skill_support: 'Support & Complaints Specialist',
      skill_winback: 'Customer Retention & Win-back',
      booking_modal_title: 'Manage Appointment',
      label_customer_name: 'Customer Name',
      placeholder_customer_name: 'Full Name',
      label_customer_phone: 'Phone Number',
      placeholder_customer_phone: '01xxxxxxxxx',
      label_service_type: 'Service / Purpose',
      placeholder_service_type: 'Consultation / Review',
      label_booking_status: 'Status',
      label_booking_date: 'Date & Time',
      label_slot_duration: 'Duration (Minutes)',
      label_booking_notes: 'Notes / AI Summary',
      placeholder_booking_notes: 'Additional details, requests, or notes...',
      btn_save_booking: 'Save Appointment',
      chat_order_modal_title: 'Manage Chat Order',
      label_customer_address: 'Delivery Address',
      label_order_items: 'Items Summary',
      placeholder_order_items: 'Product name x1',
      label_total_amount: 'Total Amount (EGP)',
      label_order_status: 'Status',
      label_order_note: 'Order Note',
      btn_save_order: 'Save Order',
      recipient_modal_title: 'Add Notification Channel',
      label_rec_channel: 'Notification Channel',
      channel_whatsapp: 'WhatsApp Number',
      channel_telegram: 'Telegram Account / Channel ID',
      label_rec_target: 'Target Destination',
      placeholder_rec_target: '01xxxxxxxxx or Telegram Chat ID',
      hint_rec_target: 'For WhatsApp: 01xxxxxxxxx or +201xxxxxxxxx. For Telegram: Chat ID or channel ID.',
      label_rec_label: 'Label / Team Description',
      placeholder_rec_label: 'Sales Manager, Kitchen, Operations...',
      label_rec_events: 'Subscribed Alert Events',
      ev_order_created: 'New Orders',
      ev_order_status: 'Order Status Updates',
      ev_booking_created: 'New Appointments',
      ev_booking_rescheduled: 'Rescheduled Bookings',
      ev_booking_cancelled: 'Cancelled Bookings',
      btn_save_recipient: 'Save Notification Channel',
      bookings_empty: 'No appointments scheduled yet.',
      recipients_empty: 'No notification channels connected yet.',
      action_confirm: 'Confirm',
      action_reschedule: 'Reschedule',
      action_complete: 'Complete',
      action_cancel: 'Cancel',
      action_edit: 'Edit',
      action_delete: 'Delete',
      action_ship: 'Ship',
      action_deliver: 'Delivered',
      action_test: 'Test Send',
      delete_booking_confirm: 'Are you sure you want to delete this appointment?',
      delete_order_confirm: 'Are you sure you want to delete this order?',
      delete_recipient_confirm: 'Are you sure you want to remove this notification channel?',
      booking_saved_ok: 'Appointment saved successfully!',
      order_saved_ok: 'Order saved successfully!',
      booking_save_failed: 'Error saving appointment',
      order_save_failed: 'Error saving order',
      orders_load_error: 'Could not load orders.',
      bookings_load_error: 'Could not load appointments.',
      orders_refresh_failed: 'Saved, but the orders list could not be refreshed.',
      bookings_refresh_failed: 'Saved, but the appointments list could not be refreshed.',
      booking_invalid_date: 'The appointment date is invalid. Fix it before saving.',
      orders_count_unit: 'Orders',
      bookings_count_unit: 'Appointments',
      created_label: 'Created',
      format_date_unavailable: 'Unavailable',
      chat_order_create_unsupported: 'Manual order creation is not supported yet. Orders are created automatically from chat.',
      store_order_readonly: 'Store orders are read-only here. Manage them in the store dashboard.',
      recipient_saved_ok: 'Notification channel saved successfully!',
      recipient_save_failed: 'Could not save recipient channel',
      recipient_test_sent: 'Test notification sent successfully!',
      recipient_test_failed: 'Failed to send test notification',
      recipient_test_configured: 'Test not delivered. The channel is saved and configured, but nothing was sent.',
      recipient_delete_failed: 'Could not remove this notification channel.',
      recipients_load_error: 'Could not load notification channels.',
      recipients_loading: 'Loading notification channels.',
      webhook_retry_confirm: 'Redeliver this webhook payload to the endpoint now?',
      webhook_logs_refresh_failed: 'Delivery confirmed, but the log list could not be refreshed.',
      chan_webchat_title: 'Dedicated Chat Page',
      chan_desc_webchat: 'Standalone customized chat page and live bot tester.',
      btn_customize_chat: 'Customize & Test',
      btn_open_chat: 'Open Chat',
      chat_page_customizer_title: 'Customize Dedicated Web Chat Page',
      chat_page_share_link: 'Direct Chat Page URL',
      btn_copy_link: 'Copy Link',
      label_chat_page_title: 'Chat Page Title',
      label_chat_page_slug: 'Custom Link ID / Slug',
      chat_page_theme_colors: 'Theme & Interface Colors',
      label_color_header: 'Header Color',
      label_color_bg: 'Background',
      label_color_bot_bubble: 'Bot Message Bubble',
      label_color_user_bubble: 'User Message Bubble',
      label_color_button: 'Send Button',
      label_color_title: 'Title Text Color',
      label_chat_suggested_questions: 'Suggested Quick Questions (One per line)',
      chk_enable_suggested_questions: 'Enable Suggested Questions',
      chk_enable_image_upload: 'Enable Image Upload',
      label_embed_widget_code: 'Website Embed Code (Widget)',
      btn_copy_code: 'Copy',
      btn_save_chat_page: 'Save Settings',
      chat_page_saved_ok: 'Chat page settings saved successfully!',
      link_copied_ok: 'Link copied to clipboard!',
      code_copied_ok: 'Widget code copied to clipboard!',
      label_preset_themes: 'Choose Default Theme',
      preset_cyber_dark: 'Cyber Dark',
      preset_cyber_dark_desc: 'Neon Modern',
      preset_emerald_clean: 'Emerald Clean',
      preset_emerald_clean_desc: 'Luxury Light',
      preset_royal_purple: 'Royal Violet',
      preset_royal_purple_desc: 'Velvet Dark',
      hint_customize_colors: 'Fully Customizable',
      preview_live_title: 'Live Interactive Preview',
      badge_realtime: 'Real-time',
      preview_status_online: 'Online · AI Sales Ready',
      preview_input_placeholder: 'Type your message here...',
      free_plan_tools_limit_badge: '(Free Plan Limit: 3 tools max, all skills included)',
      free_plan_skills_limit_badge: '(Free Plan: all skills included)',
      label_chat_page_logo: 'Chat Page Logo / Avatar',
      btn_upload_logo: 'Upload Logo',
      btn_remove_logo: 'Remove',
      hint_logo_format: 'PNG or JPG up to 2MB',
      store_sync_scope: 'Import runs only when you press Sync. Up to 500 products per run; Shopify uses the first variant. Imported products become available as store context for the agent.',
      store_provider_label: 'Platform',
      store_url_label: 'HTTPS store origin (no path)',
      store_url_placeholder: 'https://example.myshopify.com',
      store_woo_url_placeholder: 'https://example.com',
      store_shopify_url_help: 'Use your https://store.myshopify.com address, without a path or query.',
      store_woo_url_help: 'Use the HTTPS address of your WooCommerce site, without a path or query.',
      store_currency_label: 'Product currency',
      store_token_label: 'Shopify Admin API access token',
      store_token_help: 'Enter an Admin API token with read_products permission. Enter it again to update saved settings; it cannot be viewed after saving.',
      store_key_label: 'WooCommerce consumer key',
      store_secret_label: 'WooCommerce consumer secret',
      store_woo_help: 'Create a WooCommerce REST API key with products read access. Enter both credentials again to update saved settings; they cannot be viewed after saving.',
      store_save: 'Save connection',
      store_sync: 'Sync saved connection',
      store_status_loading: 'Checking connection…',
      store_status_unconfigured: 'No connection saved for this platform.',
      store_status_idle: 'Connection saved. Ready for manual sync.',
      store_status_running: 'Sync in progress.',
      store_status_succeeded: 'Last sync succeeded.',
      store_status_failed: 'Last sync failed.',
      store_status_details: 'Imported: {count} · Last successful sync: {time}',
      store_status_no_sync: 'No successful sync yet.',
      store_no_bot: 'Select an agent to configure a catalog.',
      store_saving: 'Saving connection…',
      store_saved: 'Connection saved. You can now sync manually.',
      store_syncing: 'Importing products…',
      store_synced: 'Import finished: {count} products.',
      store_load_error: 'Could not load connection status. Try switching platforms or reopening Connections.',
      store_error_generic: 'Connection request failed. Please try again.',
      store_error_invalid_config: 'Enter a supported currency and valid credentials (at least 8 characters).',
      store_error_invalid_origin: 'Enter an HTTPS store address without a path, query or port. Shopify requires a myshopify.com address.',
      store_error_store_not_linked: 'This agent has no linked store. Link a store before configuring the catalog.',
      store_error_owner_only: 'Only the account owner can manage catalog connections.',
      store_error_sync_in_progress: 'A sync is already in progress. Check again later.',
      store_error_not_configured: 'Save this platform’s connection before syncing.',
      store_error_auth: 'The store rejected the credentials. Check their permissions and save new credentials.',
      store_error_remote: 'Could not read the store catalog. Check the store API and try again.',
      store_error_limit: 'The catalog exceeds the 500-product limit. No new import was completed.',
      store_error_empty: 'The store returned no products to import.',
      store_error_unsafe: 'The store address or response is not supported. Check the HTTPS site address.',
      store_training_path: 'After importing, test an actual product question in chat. Add extra business rules in AI Training.',
      store_open_training: 'Open AI Training',
      feedback_loading: 'Loading…',
      feedback_retry: 'Retry',
      lazy_load_failed: 'Couldn’t load this section. Check your connection, then retry.',
      feedback_stale: 'Showing saved data while refreshing…',
      feedback_no_bot: 'Select an agent to load this section.',
      automation_center_title: 'AI Sales Automation Center',
      automation_center_desc: 'Manage autonomous background tasks: abandoned lead recovery, sales digests, and urgent triage.',
      btn_trigger_recovery: 'Recover Lost Leads Now',
      btn_trigger_digest: 'Send Sales Digest Now',
      automation_checking: 'Checking...',
      automation_checked_ok: 'Checked conversations successfully.',
      automation_check_failed: 'Error triggering check.',
      automation_sending: 'Sending...',
      automation_digest_sent: 'Digest sent successfully.',
      automation_digest_failed: 'Error sending digest.',
      card_recovery_title: 'Abandoned Sales Recovery',
      card_recovery_desc: 'Automatically re-engages leads who showed buying intent but stopped responding.',
      card_digest_title: 'Daily Performance Digest',
      card_digest_desc: 'Summarizes today\'s orders, revenue, and active chats to your Telegram or WhatsApp.',
      card_stock_title: 'Low Stock Alerts',
      card_stock_desc: 'Instantly alerts you when product quantities fall below the safe limit.',
      card_complaints_title: 'Urgent Complaint Triage',
      card_complaints_desc: 'Dispatches immediate alerts to your phone if a customer files a complaint.',
      badge_active: 'Active',
      badge_scheduled: 'Daily at 21:00',
      badge_monitoring: 'Auto Monitoring',
      badge_instant: 'Instant Alert',
      agent_tool_recovery_title: 'Automated Abandoned Sales & Inquiries Recovery',
      agent_recovery_delay_label: 'Follow-up After',
      delay_2h: '2 Hours',
      delay_4h: '4 Hours',
      delay_12h: '12 Hours',
      delay_24h: '24 Hours',
      agent_recovery_msg_label: 'Custom Follow-up Message',
      agent_recovery_msg_placeholder: 'Leave empty for automatic friendly recovery message',
      agent_tool_digest_title: 'Daily Performance & Sales Digest Tool',
      agent_digest_channel_label: 'Notification Channel',
      channel_all: 'Telegram, WhatsApp & Dashboard',
      channel_telegram_only: 'Telegram Only',
      channel_whatsapp_only: 'WhatsApp Only',
      channel_inapp: 'Dashboard Notifications Only',
      agent_digest_time_label: 'Delivery Time',
      agent_tool_upsell_title: 'Smart Catalog Upselling & Closing Strategy',
      agent_sales_tone_label: 'Sales Persona Tone',
      tone_consultative: 'Consultative & Helpful',
      tone_enthusiastic: 'Enthusiastic & Promotional',
      tone_formal: 'Direct & Professional',
      agent_max_discount_label: 'Closing Incentive Discount',
      discount_none: 'No extra discounts (0%)',
      menu_idea_council: 'Idea Council',
      idea_council_desc: 'AI-powered strategic validation panel and decision pipeline for founders',
      idea_quota_label: 'Monthly Idea Quota',
      idea_quota_text: 'ideas available this month',
      idea_btn_new: 'New Idea',
      idea_btn_back_list: 'Back to Ideas',
      idea_filter_all: 'All',
      idea_filter_drafts: 'Drafts',
      idea_filter_running: 'In Progress',
      idea_filter_completed: 'Completed',
      idea_list_empty: 'No ideas submitted yet. Click New Idea to start.',
      idea_input_title: 'Describe Your Project Idea',
      idea_input_desc_label: 'Raw Idea Description (100 - 8,000 characters)',
      idea_input_desc_placeholder: 'Describe what you want to build, the core problem it solves, and why people would use it...',
      idea_input_market_label: 'Target Market / Geography (Optional)',
      idea_input_market_placeholder: 'e.g. Saudi Arabia, GCC, Global SaaS',
      idea_input_audience_label: 'Target Audience / Customer Profile (Optional)',
      idea_input_audience_placeholder: 'e.g. B2B Founders, Independent Cafes',
      idea_input_concern_label: 'Primary Concern to Evaluate (Optional)',
      idea_input_concern_placeholder: 'e.g. Will customers actually pay? Is it easy to clone?',
      idea_lang_label: 'Report Language',
      idea_lang_ar: 'Arabic',
      idea_lang_en: 'English',
      idea_privacy_notice: 'Confidentiality guarantee: Your idea and reports are private to your account and never used to train general AI models.',
      idea_guiding_questions_title: 'Guiding Questions',
      idea_gq_one: 'What is the core problem and who suffers from it?',
      idea_gq_two: 'What are they currently doing instead?',
      idea_gq_three: 'Why would they change their daily habit to switch to you?',
      idea_btn_structure: 'Structure Idea Card',
      idea_btn_structuring: 'Structuring Idea...',
      idea_card_title: 'Structured Idea Card',
      idea_card_desc: 'Review and adjust how the Council understands your idea before analysis begins.',
      idea_fld_title: 'Suggested Title',
      idea_fld_pitch: 'Elevator Pitch',
      idea_fld_customer: 'Target Customer',
      idea_fld_problem: 'Core Problem',
      idea_fld_solution: 'Proposed Solution',
      idea_fld_value: 'Value Proposition',
      idea_fld_alternatives: 'Current Alternatives',
      idea_fld_revenue: 'Revenue Model',
      idea_fld_assumptions: 'Initial Assumptions',
      idea_fld_gaps: 'Information Gaps',
      idea_fld_core_question: 'Core Evaluation Question',
      idea_confirm_card_text: 'I confirm this structured card accurately represents my idea.',
      idea_btn_start_council: 'Convene Idea Council',
      idea_btn_save_draft: 'Save Draft',
      idea_session_progress_title: 'Council Session in Progress',
      idea_session_progress_desc: 'The council runs in the background. You can safely leave this page and come back anytime.',
      idea_step_research: 'Live Market Research',
      idea_step_analysis: 'Council Members Analysis',
      idea_step_synthesis: 'Synthesizing Verdict',
      member_cold_customer: 'The Cold Customer',
      member_cold_customer_role: 'Buyer Inertia & Willingness to Pay',
      member_harsh_auditor: 'The Harsh Auditor',
      member_harsh_auditor_role: 'Hidden Flaws & Lethal Assumptions',
      member_execution_expert: 'The Execution Expert',
      member_execution_expert_role: 'Technical Feasibility & 7-Day MVP',
      member_market_researcher: 'The Market Researcher',
      member_market_researcher_role: 'Competitor Landscape & Demand',
      member_devils_advocate: "The Devil's Advocate",
      member_devils_advocate_role: 'Pre-Mortem & Root Failure Cause',
      member_wedge_hunter: 'The Wedge Hunter',
      member_wedge_hunter_role: 'Unique Wedge & Defensibility',
      member_ux_designer: 'The UX Designer',
      member_ux_designer_role: 'First 60s Value & Friction Points',
      member_candid_champion: 'The Candid Champion',
      member_candid_champion_role: 'Viable Core Worth Fighting For',
      idea_report_title: 'Council Decision & Synthesis Report',
      idea_verdict_label: 'Executive Verdict',
      idea_seven_day_build_label: '7-Day Build Verdict',
      idea_opp_label: 'Strongest Opportunity',
      idea_risk_label: 'Biggest Risk',
      idea_assumptions_label: 'Top 3 Unproven Assumptions',
      idea_question_label: 'Critical Question to Settle',
      idea_cut_list_label: 'Cut / Defer List for V1',
      idea_validation_plan_title: 'Adaptive Validation Plan',
      idea_val_hypothesis: 'Hypothesis',
      idea_val_audience: 'Audience',
      idea_val_channel: 'Channel',
      idea_val_duration: 'Suggested Duration',
      idea_val_cost: 'Estimated Cost',
      idea_val_metric: 'Success Metric',
      idea_val_stop: 'Stop Condition',
      idea_mvp_title: '7-Day MVP Scope',
      idea_wedge_title: 'Unique Wedge & Value',
      idea_consensus_title: 'Consensus & Dissent Points',
      idea_sources_title: 'Verified Market Sources',
      idea_critics_title: 'Council Members Detailed Critiques',
      idea_critics_subtitle: '8 specialized angles on viability, execution, and risks',
      idea_truth_board_title: 'Dynamic Truth Board',
      idea_truth_board_desc: 'Track key assumptions, risks, and validation steps in real time without consuming AI quotas.',
      idea_tb_status_open: 'Open',
      idea_tb_status_validating: 'Validating',
      idea_tb_status_verified: 'Verified',
      idea_tb_status_dismissed: 'Dismissed',
      idea_tb_notes_placeholder: 'Founder validation notes...',
      idea_btn_export_md: 'Export Markdown',
      idea_btn_export_pdf: 'Print / PDF',
      idea_rounds_history_title: 'Evaluation History:',
      idea_btn_compare_rounds: 'Compare Rounds',
      idea_unit_econ_title: 'Interactive Unit Economics Calculator',
      idea_unit_econ_subtitle: 'Simulate margins, order volume, and breakeven thresholds. Adjust sliders to test stress levels.',
      idea_unit_econ_aov: 'Average Order Value (AOV):',
      idea_unit_econ_margin: 'Take Rate / Margin %:',
      idea_unit_econ_direct_costs: 'Direct Per-Order Costs:',
      idea_unit_econ_fixed_costs: 'Monthly Fixed Costs:',
      idea_unit_econ_net_contribution: 'Net Contribution / Order',
      idea_unit_econ_breakeven_orders: 'Monthly Breakeven Orders',
      idea_unit_econ_daily_orders: 'Required Daily Orders',
      idea_unit_econ_risk_none: 'Healthy margin profile at current parameters.',
      idea_compare_modal_title: 'Evaluation Rounds Comparison (Round Delta)',
      idea_compare_modal_subtitle: "Track how the council's verdict, assumptions, and validation plan evolved after your defense.",
      idea_compare_round_a: 'Base Round:',
      idea_compare_round_b: 'Comparison Round:',
      idea_compare_verdict: 'Executive Verdict',
      idea_compare_assumptions: 'Assumptions Evolution',
      idea_compare_question: 'Critical Question to Settle',
      idea_compare_validation: 'Validation Plan Progression',
      idea_compare_founder_defense: 'Founder Defense & Arguments',
      idea_compare_no_rounds: 'Need at least 2 evaluation rounds to compare.',
      idea_round_prefix: 'Round',
      idea_round_initial: 'Round 1 (Initial)',
      idea_round_viewing: 'Viewing Round',
      idea_round_founder_defense: 'Founder Defense / Input:',
      idea_followup_title: 'Follow-up Rounds (3 per idea)',
      idea_followup_remaining: 'Rounds remaining:',
      idea_btn_defend: 'Defend Idea',
      idea_btn_pivot: 'Propose Pivot',
      idea_btn_val_plan: 'Small Test Plan',
      idea_btn_vote: 'Council Vote',
      idea_btn_compare: 'Compare Competitor',
      idea_btn_mvp: '7-Day MVP Plan',
      idea_followup_prompt_placeholder: 'Enter your defense arguments, proposed pivot direction, or specific question...',
      idea_btn_start_followup: 'Start Follow-up Round',
      idea_followup_modal_title: 'Council Follow-up & Defense',
      idea_followup_modal_subtitle: 'Present new arguments, strategic angles, and evidence to challenge council skepticism.',
      idea_followup_action_label: 'Round Goal & Action Type',
      idea_followup_chips_label: 'Strategic Advantage Angles (Click to toggle)',
      idea_chip_pricing: '💰 Lower Price / Cost Advantage',
      idea_chip_niche: '🎯 Underserved Niche Segment',
      idea_chip_distribution: '🤝 Existing Distribution / Partners',
      idea_chip_guarantee: '🛡️ Risk-Free Trial / Guarantee',
      idea_chip_speed: '⚡ Radical Simplification',
      idea_chip_team: '👥 Proven Domain Expert Team',
      idea_chip_offline: '📍 Prime Physical Location / Foot Traffic',
      idea_chip_inventory: '📦 Existing Prototype / Inventory Ready',
      idea_followup_target_critic_label: 'Primary Critic to Address',
      idea_critic_opt_all: 'Entire Council (All Members)',
      idea_critic_opt_customer: 'Cold Customer (Hesitation & Switching Cost)',
      idea_critic_opt_auditor: 'Harsh Auditor (Financials & Unit Economics)',
      idea_critic_opt_competitor: 'Vicious Competitor (Differentiation & Moat)',
      idea_critic_opt_ops: 'Operations & Feasibility Expert',
      idea_followup_review_mode_label: 'Council Review Tone',
      idea_mode_opt_balanced: 'Constructive & Pragmatic',
      idea_mode_opt_strict: 'High-Stress Skeptical',
      idea_followup_defense_label: 'Your Defense, Answers & Strategic Evidence',
      idea_followup_evidence_label: 'Extra Proof, Numbers, or Competitor Reference (Optional)',
      idea_followup_evidence_placeholder: 'e.g. 150 pre-orders, link to alternative, supplier agreement...',
      idea_followup_submit_btn: 'Submit & Launch Round',
      idea_followup_err_empty: 'Please enter your defense arguments or plan details.',
      idea_feedback_title: 'Was this evaluation helpful?',
      idea_btn_feedback_submit: 'Send Feedback',
      idea_disclaimer: 'Disclaimer: This report is an AI-generated decision-support tool, not certified legal or financial advice.',
      idea_verdict_build: 'Build (Green Light)',
      idea_verdict_validate: 'Validate First (Amber Light)',
      idea_verdict_pivot: 'Pivot Needed',
      idea_verdict_do_not_build: 'Do Not Build (Red Light)',
      idea_role_customer_advocate: 'Customer Advocate',
      idea_role_financial_auditor: 'Financial Auditor',
      idea_role_growth_marketer: 'Distribution & Growth',
      idea_role_direct_competitor: 'Direct Competitor',
      idea_role_technical_architect: 'Technical Architect',
      idea_role_execution_risk_officer: 'Execution & Risk',
      idea_role_monetization_strategist: 'Monetization Strategist',
      idea_role_simplicity_editor: 'Simplicity & MVP Scope',
      idea_tb_cat_assumption: 'Assumption',
      idea_tb_cat_market_fact: 'Market Fact',
      idea_tb_cat_validation_test: 'Validation Test',
      idea_tb_cat_critical_risk: 'Critical Risk',
      idea_tb_status_blocked: 'Blocked',
      idea_action_resume: 'Resume',
      idea_action_view: 'View Report',
      idea_action_delete: 'Delete',
      idea_msg_saved: 'Draft saved',
      idea_msg_saving: 'Saving draft...',
      idea_msg_confirm_delete: 'Are you sure you want to delete this idea?',
      idea_msg_confirm_checkbox_req: 'Please confirm the structured card before convening the Council.',
      idea_msg_quota_exceeded: 'Monthly idea quota reached (3 ideas/month).',
      idea_msg_card_saved: 'Structured card saved.',
      idea_msg_followup_prompt: 'Enter context or arguments for this follow-up round:',
      idea_msg_followup_success: 'Follow-up round completed.',
      idea_desc_min_length: 'Idea description must be at least 100 characters.',
      idea_structure_failed: 'Failed to structure idea.',
      idea_structure_error: 'Error structuring idea.',
      idea_list_error: 'Could not load ideas.',
      idea_convening: 'Convening...',
      idea_convene_failed: 'Failed to convene idea council.',
      idea_run_failed: 'Evaluation run failed.',
      idea_status_pending: 'Pending',
      idea_awaiting_evidence: 'Awaiting evidence inspection...',
      idea_stage_research: 'Conducting live web market research...',
      idea_stage_parallel: 'Council members analyzing in parallel',
      idea_stage_synth: 'Chairperson synthesizing verdict and truth board...',
      idea_round_1: 'Round 1 (Initial)',
      idea_round_n: 'Round {n}{suffix}',
      idea_round_input: 'Round input:',
      idea_round_latest: 'Latest Evaluation Round',
      idea_round_archive: 'Viewing Past Round',
      idea_no_sources: 'No external web sources available.',
      idea_no_critiques: 'No council member critiques recorded yet.',
      idea_critic_rejection: 'Rejection Reason:',
      idea_critic_switching: 'Switching Cost:',
      idea_critic_trigger: 'Trigger to Try:',
      idea_critic_willingness: 'Willingness to Pay:',
      idea_weakest_link: 'Weakest Link:',
      idea_deadliest_assumptions: 'Deadliest Assumptions:',
      idea_hard_questions: 'Hard Questions to Settle:',
      idea_complexity_level: 'Complexity Level:',
      idea_mvp_scope: '7-Day MVP Scope:',
      idea_cut_deferred: 'Cut / Deferred for V1:',
      idea_market_saturation: 'Market Saturation:',
      idea_direct_competitors: 'Direct Market Competitors:',
      idea_indirect_alternatives: 'Indirect Alternatives & Workarounds:',
      idea_root_cause: 'Primary Root Cause of Death:',
      idea_failure_conditions: 'Failure Conditions:',
      idea_early_warnings: 'Early Warning Signs:',
      idea_wedge_angle: 'Unique Wedge Angle:',
      idea_defensibility: 'Defensibility Moat:',
      idea_copy_ease: 'Ease / Speed of Copying:',
      idea_first_value_60s: 'First Moment of Value in 60s:',
      idea_friction_point: 'Biggest Friction / Drop-off Point:',
      idea_core_strength: 'Core Strength Worth Fighting For:',
      idea_proceed_reason: 'Single Best Reason to Proceed:',
      idea_indispensable_asset: 'Indispensable Asset:',
      idea_critic_verdict_full: 'Full Critic Verdict:',
      idea_round_analyzed: 'Analyzed',
      idea_round_review: 'Pending',
      idea_round_prior: 'Prior Round',
      idea_first_moment: 'First Moment: {v}',
      idea_unit_orders_mo: 'orders/mo',
      idea_unit_orders_day: 'orders/day',
      idea_econ_critical: 'Critical Warning: Negative contribution margin! You lose money on every order before overhead.',
      idea_econ_hurdle: 'High Volume Hurdle: Requires {n} orders daily just to break even on fixed costs.',
      idea_round_initial_short: 'Initial',
      idea_plan_duration: 'Duration:',
      idea_plan_metric: 'Success Metric:',
      idea_plan_stop: 'Stop Condition:',
      idea_truth_empty: 'No truth items recorded yet.',
      idea_followup_exhausted: 'All 3 follow-up rounds used for this idea.',
      idea_followup_launching: 'Launching...',
      idea_followup_failed: 'Failed to run follow-up round.',
      idea_followup_error: 'Error during follow-up round.',
      idea_export_failed: 'Failed to export report.',
      idea_followup_defend: 'Defend',
      idea_followup_pivot: 'Pivot',
      idea_followup_validation: 'Test Plan',
      idea_followup_vote: 'Vote',
      idea_followup_compare: 'Competitor',
      idea_followup_mvp: 'MVP Plan',
      idea_status_draft: 'Draft',
      idea_status_structuring: 'Structuring',
      idea_status_awaiting_conf: 'Awaiting Confirmation',
      idea_status_queued: 'Queued',
      idea_status_running: 'In Progress',
      idea_status_completed: 'Completed',
      idea_status_partial: 'Partial',
      idea_status_failed: 'Failed'
    },
    ar: {
      menu_overview: 'نظرة عامة',
      menu_inbox: 'صندوق الوارد الموحد',
      inbox_select_chat: 'اختر محادثة',
      inbox_no_channel: 'لا توجد قناة نشطة',
      menu_training: 'تدريب الذكاء الاصطناعي',
      menu_channels: 'ربط القنوات',
      menu_orders: 'الطلبات والحجوزات',
      menu_settings: 'الإعدادات والاشتراك',
      menu_admin: 'لوحة تحكم الأدمن',
      menu_agents: 'الوكلاء الذكيون',
      agents_title: 'الوكلاء الذكيون',
      onboard_title: 'احصل على أول رد حقيقي',
      onboard_progress: 'اكتملت {count} من ٣ خطوات',
      onboard_personalize_title: '١. خصّص وكيلك',
      onboard_personalize_desc: 'أضف رسالة ترحيب أو وصفًا أو تعليمات تناسب نشاطك.',
      onboard_personalize_action: 'تعديل الوكيل',
      onboard_train_title: '٢. أضف إجابة حقيقية',
      onboard_train_desc: 'احفظ سؤالًا وإجابة يسأل عنهما عملاؤك فعلًا.',
      onboard_train_action: 'إضافة سؤال وجواب',
      onboard_test_title: '٣. جرّب الدردشة المباشرة',
      onboard_test_desc: 'أرسل سؤالًا من صفحة دردشة وكيلك وتأكد من رده. فتح الصفحة وحده لا يكمل الخطوة.',
      onboard_test_action: 'فتح الدردشة',
      onboard_done: 'مكتملة',
      onboard_todo: 'لم تكتمل',
      onboard_checking: 'جارٍ التحقق من التقدم…',
      onboard_no_bot: 'أنشئ وكيلًا للبدء. سيظهر تقدمك هنا بعد إنشائه.',
      onboard_create: 'إنشاء وكيل',
      onboard_unavailable: 'تعذر التحقق من التقدم. ارجع إلى النظرة العامة للمحاولة مجددًا.',
      onboard_chat_unavailable: 'تعذر تحميل رابط الدردشة المباشرة. حاول مجددًا.',
      agents_desc: 'أنشئ وكلاء منفصلين للدعم والمبيعات وتأهيل العملاء، ثم اختر الوكيل النشط لمساحة العمل.',
      agents_create: 'إنشاء وكيل',
      agent_modal_create: 'إنشاء وكيل',
      agent_modal_edit: 'تعديل الوكيل',
      agents_entitlement_unit: 'وكلاء مستخدمون في باقة',
      agent_autoreply_off: 'الرد الآلي متوقف',
      agent_autoreply_on: 'الرد الآلي يعمل',
      agent_no_description: 'لا يوجد وصف بعد.',
      agent_current: 'الوكيل الحالي',
      agent_use_this: 'استخدام هذا الوكيل',
      agent_customize_chat: 'تخصيص ودردشة',
      agents_empty_create_first: 'أنشئ وكيلك الأول للبدء.',
      agent_free_tools_limit: 'الحد الأقصى في الباقة المجانية: 3 أدوات فقط وجميع المهارات متاحة',
      agent_save_failed: 'فشل حفظ الوكيل.',
      agent_name: 'اسم الوكيل',
      agent_role: 'دور الوكيل',
      agent_role_support: 'دعم العملاء',
      agent_role_sales: 'مبيعات',
      agent_role_leads: 'تأهيل العملاء',
      agent_role_custom: 'مخصص',
      agent_description: 'الوصف',
      agent_welcome_message: 'رسالة الترحيب',
      agent_description_placeholder: 'مسؤوليات هذا الوكيل',
      agent_instructions: 'التعليمات',
      agent_instructions_placeholder: 'النبرة ومصادر المعلومة والقواعد الممنوعة وخطوات التصعيد',
      agent_objectives: 'الأهداف',
      agent_objectives_placeholder: 'اكتب هدفًا في كل سطر',
      agent_handoff_keywords: 'كلمات التحويل لموظف',
      agent_handoff_placeholder: 'موظف، مدير، شكوى',
      agent_auto_reply: 'تفعيل الرد التلقائي للوكيل',
      agent_save: 'حفظ الوكيل',

      // مركز التحكم بالإعدادات (منظم)
      settings_intro_desc: 'كل أدوات التحكم في الوكيل ومساحة العمل في مكان واحد، مقسمة لأقسام مرتبة: تعليمات الوكيل، قدراته، التنبيهات، نموذج الذكاء الاصطناعي، وتكاملات المطورين.',
      set_sec_instructions_title: 'تعليمات الوكيل وشخصيته',
      set_sec_instructions_desc: 'ماذا يقول الوكيل وكيف يتصرف: رسالة الترحيب، قواعد الشخصية، الأهداف، وتحويل المحادثات للموظفين. تُطبق على الوكيل النشط.',
      set_open_training: 'فتح تدريب الذكاء الاصطناعي',
      set_sec_capabilities_title: 'قدرات الوكيل',
      set_sec_capabilities_desc: 'تشغيل أو إيقاف ما يستطيع الوكيل النشط فعله: الحجوزات، تتبع الطلبات، التنبيهات، استعادة العملاء، التقارير اليومية، والبيع الذكي. عدّل التفاصيل من بطاقة الوكيل.',
      set_open_agents: 'تعديل الوكيل النشط',
      dev_integrations_title: 'تكاملات المطورين والويب هوك',
      dev_integrations_desc: 'أنشئ مفاتيح وصول للتطبيقات الخارجية وأرسل أحداث المنصة إلى أنظمتك في الوقت الفعلي.',
      wh_event_msg_received: 'message.received',
      wh_event_msg_sent: 'message.sent',
      wh_event_order_created: 'order.created',
      set_no_agent: 'لا يوجد وكيل نشط بعد. أنشئ وكيلاً أو اختر واحداً من صفحة الوكلاء.',
      set_state_enabled: 'مفعل',
      set_state_disabled: 'متوقف',
      set_value_not_set: 'غير محدد',
      set_label_welcome: 'رسالة الترحيب',
      set_label_persona_rules: 'تعليمات الشخصية',
      set_unit_lines: 'سطر',
      set_label_objectives: 'الأهداف',
      set_label_handoff: 'كلمات التحويل للموظف',
      set_label_auto_reply: 'الرد التلقائي',
      set_label_tools: 'الأدوات',
      set_label_skills: 'المهارات',
      set_tool_booking: 'الحجوزات والمواعيد',
      set_tool_orders: 'تتبع الطلبات',
      set_tool_wa: 'تنبيهات واتساب',
      set_tool_tg: 'تنبيهات تليجرام',
      set_tool_recovery: 'استعادة المبيعات المتروكة',
      set_tool_digest: 'التقرير اليومي',
      set_tool_upsell: 'البيع الذكي',
      admin_search_placeholder: 'ابحث بالاسم أو البريد أو واتساب',
      admin_filter_role: 'تصفية حسب الدور',
      admin_filter_status: 'تصفية حسب الحالة',
      admin_filter_tier: 'تصفية حسب الباقة',
      admin_all_roles: 'كل الأدوار',
      admin_visible_accounts: 'الحسابات الظاهرة',
      admin_all_tiers: 'كل الباقات',
      admin_apply: 'تطبيق',
      admin_previous: 'السابق',
      admin_next: 'التالي',
      admin_pagination_unit: 'حساب — صفحة',
      admin_load_failed: 'تعذر تحميل قائمة الحسابات.',
      admin_empty_match: 'لا توجد حسابات مطابقة.',
      admin_role_superadmin_word: 'مدير عام',
      admin_role_user_word: 'مستخدم',
      admin_status_deleted: 'محذوف',
      admin_bots_unit: 'وكيل',
      admin_action_edit: 'تعديل',
      admin_action_agents: 'الوكلاء',
      admin_action_temp_access: 'دخول مؤقت',
      admin_action_activate: 'تفعيل',
      admin_action_suspend: 'إيقاف',
      admin_action_archive: 'أرشفة',
      admin_status_change_confirm: 'هل تريد تغيير حالة الحساب إلى {status}؟',
      admin_update_failed: 'فشل تحديث الحساب.',
      admin_archive_confirm: 'ستتوقف إمكانية الدخول مع الاحتفاظ بالمحادثات والقنوات. هل تريد المتابعة؟',
      admin_archive_failed: 'فشلت أرشفة الحساب.',
      admin_account_bots_missing: 'لا توجد وكلاء محمّلون لهذا الحساب، أعد تحميل القائمة.',
      admin_account_bots_title: 'وكلاء {username}',
      admin_bots_loading: 'جاري التحميل...',
      admin_bot_running: 'يعمل',
      admin_bot_stopped: 'متوقف',
      admin_bot_stop: 'إيقاف',
      admin_bot_start: 'تشغيل',
      admin_bot_update_failed: 'فشل تحديث حالة الوكيل.',
      admin_account_no_bots: 'لا يملك هذا الحساب وكلاء بعد.',
      admin_user_modal_edit: 'تعديل الحساب',
      admin_user_modal_add: 'إضافة حساب',
      admin_account_load_failed: 'تعذر تحميل بيانات الحساب.',
      admin_impersonation_banner: 'أنت داخل مؤقتاً إلى حساب {username}. كل النشاط مسجل.',
      admin_impersonation_self: 'هذا الحساب',
      admin_account_save_failed: 'فشل حفظ الحساب.',
      admin_impersonation_start_failed: 'فشل بدء الجلسة المؤقتة.',
      admin_session_expired: 'انتهت جلسة المدير. سجل الدخول من جديد.',
      admin_impersonation_end_failed: 'تعذر إنهاء الجلسة المؤقتة بأمان.',
      admin_exit_impersonation: 'خروج والعودة للإدارة',
      admin_tier_growth_1k: 'النمو 1K',
      admin_tier_growth_10k: 'النمو 10K',
      admin_tier_growth_50k: 'النمو 50K',
      admin_tier_unlimited: 'غير محدودة',
      admin_legacy_status_confirm: 'هل أنت متأكد من تغيير حالة التاجر/المستخدم إلى {status}؟',
      admin_legacy_status_failed: 'فشل تحديث حالة المستخدم',
      admin_legacy_impersonate_confirm: 'هل تريد الانتقال الفوري والدخول المباشر إلى حساب هذا التاجر لتصفح وإدارة بوتاته وقنواته؟',
      admin_legacy_impersonate_ok: 'تم دخول حساب التاجر بنجاح! جاري تحميل لوحته...',
      admin_legacy_impersonate_failed: 'فشل الانتحال المباشر',
      admin_legacy_auth_error: 'حدث خطأ أثناء المصادقة',
      admin_key_delete_confirm: 'هل أنت متأكد من حذف مفتاح الخادم هذا؟',
      admin_user_modal: 'إدارة الحساب',
      admin_username: 'اسم المستخدم',
      admin_email: 'البريد الإلكتروني',
      admin_whatsapp: 'واتساب',
      admin_role: 'الدور',
      admin_user: 'مستخدم',
      admin_superadmin: 'مدير عام',
      admin_subscription: 'نوع الاشتراك',
      admin_plan_tier: 'الباقة',
      admin_free: 'مجاني',
      admin_monthly: 'شهري',
      admin_yearly: 'سنوي',
      admin_active: 'نشط',
      admin_suspended: 'موقوف',
      admin_verification: 'التوثيق',
      admin_verified: 'موثق',
      admin_not_verified: 'غير موثق',
      admin_daily_usage: 'الرسائل المستخدمة اليوم',
      admin_monthly_usage: 'الرسائل المستخدمة شهريًا',
      admin_temporary_password: 'كلمة مرور مؤقتة',
      admin_password_help: 'اتركها فارغة للإبقاء على كلمة المرور الحالية.',
      admin_confirm_password: 'تأكيد كلمة المرور',
      admin_save_user: 'حفظ الحساب',
      impersonation_title: 'بدء دخول مؤقت مسجل',
      impersonation_desc: 'سيبدأ هذا دخولًا مؤقتًا ومسجلًا. اكتب سبب الدخول.',
      impersonation_reason: 'سبب الدخول',
      impersonation_continue: 'متابعة',
      logout: 'تسجيل الخروج',
      account_quota_remaining: 'الرسائل المتبقية',
      account_settings: 'إعدادات الحساب',
      account_help_guide: 'دليل أول محادثة',
      stat_conversations: 'المحادثات',
      stat_messages: 'الرسائل التي تمت معالجتها',
      stat_connected_channels: 'روابط مسجّلة (التسليم غير مؤكد)',
      stat_training_rules: 'قواعد التدريب',
      workspace_status_title: 'حالة مساحة العمل',
      workspace_status_desc: 'ملخص مباشر للبوت المحدد حاليًا في مساحة العمل.',
      workspace_active_bot: 'البوت النشط',
      workspace_auto_reply: 'الرد التلقائي بالذكاء الاصطناعي',
      workspace_orders: 'طلبات من المحادثات',
      status_enabled: 'مفعّل',
      status_disabled: 'متوقف',
      quota_unlimited: 'غير محدود',
      stat_active_chats: 'المحادثات النشطة',
      stat_response_speed: 'سرعة الاستجابة',
      stat_satisfaction: 'رضا العملاء',
      stat_orders_count: 'الطلبات المكتملة',
      usage_summary_title: 'الخطة الشهرية والاستهلاك',
      current_plan_label: 'الباقة الحالية:',
      conversations_used_label: 'المحادثات المستهلكة',
      performance_chart_title: 'معدل حجم المحادثات اليومي',
      funnel_title: 'قمع المبيعات',
      funnel_leads: 'العملاء المحتملين الجدد',
      funnel_qualified: 'العملاء المؤهلين',
      funnel_closed: 'الطلبات المكتملة',
      inbox_chat_list_title: 'خلاصة المحادثات',
      inbox_empty: 'لا توجد محادثات نشطة.',
      inbox_loading: 'جاري تحميل المحادثات...',
      inbox_load_error: 'تعذر تحميل المحادثات.',
      inbox_default_name: 'عميل',
      inbox_default_channel: 'دردشة الموقع',
      inbox_reply_saved_not_sent: 'تم تسجيل الرد في المحادثة، ولم يتم إرساله عبر القناة بعد.',
      inbox_no_bot: 'اختر وكيلًا لعرض المحادثات.',
      inbox_reply_failed: 'تعذر تأكيد الإرسال. تحقق من المحادثة قبل إعادة المحاولة — ربما تم إرسال الرسالة.',
      overview_stats_failed: 'تعذر تحديث إحصاءات النظرة العامة. تم الاحتفاظ بالقيم السابقة.',
      bootstrap_load_failed: 'تعذر تحميل ملفك الشخصي. تحقق من الاتصال ثم أعد المحاولة — ما زلت مسجلًا للدخول.',
      auto_reply_toggle_label: 'الرد التلقائي للبوت',
      select_chat_instructions: 'اختر محادثة من القائمة الجانبية لعرض السجل والتفاعل البشري المباشر.',
      chat_reply_placeholder: 'اكتب رسالة للتدخل في المحادثة...',
      training_title: 'مركز تدريب البوت',
      training_brand_guidelines_title: 'إرشادات الهوية والتوجيه',
      label_welcome_message: 'رسالة الترحيب',
      label_custom_instructions: 'تعليمات شخصية البوت',
      training_welcome_placeholder: 'اكتب رسالة الترحيب التي يراها العميل...',
      training_persona_placeholder: 'مثال: اشرح نبرة البوت ومسؤولياته وقواعد تحويل المحادثة لموظف.',
      training_empty_faqs: 'لا توجد أسئلة شائعة بعد. أضف أول سؤال وجواب.',
      instruction_modal_add: 'إضافة تعليمات عامة',
      instruction_modal_edit: 'تعديل التعليمات العامة',
      instruction_delete_confirm: 'هل أنت متأكد من حذف هذه التعليمات؟',
      faq_modal_add: 'إضافة سؤال وجواب',
      faq_modal_edit: 'تعديل القاعدة',
      faq_delete_confirm: 'هل أنت متأكد من حذف هذه القاعدة؟',
      training_guidelines_saved: 'تم الحفظ بنجاح!',
      training_guidelines_failed: 'تعذر حفظ الإعدادات. تم الاحتفاظ بتعديلاتك.',
      faq_save_failed: 'تعذر حفظ السؤال. تم الاحتفاظ بتعديلاتك.',
      instruction_save_failed: 'تعذر حفظ التعليمات. تم الاحتفاظ بتعديلاتك.',
      training_load_failed: 'تعذر تحديث بيانات التدريب. تم الاحتفاظ بالقيم السابقة.',
      save_guidelines_btn: 'حفظ الإعدادات',
      training_faqs_title: 'قائمة الأسئلة الشائعة والأجوبة',
      btn_add_faq: 'إضافة سؤال وجواب',
      channels_title: 'ربط وتفعيل قنوات البوت',
      chan_desc_wa: 'ربط واجهة Cloud API الرسمية لواتساب.',
      chan_desc_fb: 'أتمتة الردود على صفحات فيسبوك مسنجر.',
      chan_desc_ig: 'الرد التلقائي على رسائل وتعليقات إنستجرام.',
      chan_desc_tg: 'ربط وتفعيل بوت تيليجرام مخصص.',
      chan_wa_qr_title: 'ربط واتساب عبر الرمز (QR Code)',
      chan_wa_qr_generating: 'جاري توليد الرمز...',
      chan_wa_qr_steps: 'افتح تطبيق الواتساب على هاتفك > الأجهزة المرتبطة > ربط جهاز > وقم بمسح الرمز أعلاه.',
      chan_wa_disconnect: 'إلغاء الربط',
      chan_wa_qr_alt: 'رمز ربط واتساب',
      chan_wa_connected_ok: 'تم الربط بنجاح.',
      chan_wa_preparing_qr: 'يتم تجهيز الرمز…',
      chan_wa_session_failed: 'تعذر بدء جلسة واتساب.',
      chan_wa_qr_failed: 'تعذر توليد الرمز. حاول مرة أخرى.',
      chan_fb_title: 'ربط صفحة فيسبوك مباشرة',
      chan_fb_token_label: 'مفتاح وصول الصفحة (Page Access Token)',
      chan_fb_id_label: 'معرّف الصفحة (Page ID)',
      chan_fb_steps: '1. ادخل إلى developers.facebook.com وأنشئ تطبيقا.<br>2. اختر صفحة الفيسبوك الخاصة بك وولّد مفتاح وصول الصفحة (Page Access Token).<br>3. قم بنسخ المفتاح ولصقه في الحقل أدناه.',
      chan_ig_title: 'ربط حساب إنستجرام مباشرة',
      chan_ig_token_label: 'مفتاح وصول إنستجرام (Instagram Access Token)',
      chan_ig_id_label: 'معرّف حساب إنستجرام (Instagram Page ID)',
      chan_ig_steps: '1. قم بربط حساب إنستجرام التجاري بصفحتك على فيسبوك.<br>2. انسخ مفتاح الوصول المستخرج من Meta Developer Console.<br>3. ضع المفتاح ومعرف الحساب في الحقول أدناه.',
      chan_how_to: 'كيف أحصل عليه؟',
      chan_save_connection: 'حفظ الربط',
      chan_tg_title: 'ربط تيليجرام',
      chan_tg_intro: 'اربط وكيلك بالبوت الرسمي للمنصة على تيليجرام لتصلك الإشعارات. ولّد كود الربط ثم أرسله للبوت الرسمي.',
      chan_tg_step_1: 'اضغط زر "توليد كود الربط" بالأسفل.',
      chan_tg_step_2: 'افتح البوت الرسمي في تيليجرام واضغط Start.',
      chan_tg_step_3: 'أرسل الكود كما هو في رسالة واحدة.',
      chan_tg_generate_code: 'توليد كود الربط',
      chan_tg_linked_ok: 'مربوط بحساب تيليجرام',
      chan_tg_active_code: 'كود نشط بالفعل:',
      chan_tg_your_code: 'كود الربط الخاص بك:',
      chan_tg_send_before_expiry: 'أرسله إلى <a href="https://t.me/{u}" target="_blank" rel="noopener" style="color:var(--cyan);">@{u}</a> قبل انتهاء الصلاحية.',
      chan_status_checking: 'جارٍ فحص الحالة…',
      chan_status_unavailable: 'تعذر جلب الحالة — حاول مجددًا',
      chan_status_inactive: 'الوكيل معطّل',
      chan_status_paused: 'الرد الآلي متوقف',
      chan_status_not_setup: 'غير مهيأ',
      chan_status_unverified: 'إعدادات محفوظة — الاتصال الفعلي غير مؤكد',
      chan_status_wa_connected: 'الجلسة تظهر متصلة — تسليم الرسائل غير مؤكد',
      chan_status_wa_attention: 'الجلسة تحتاج متابعة — أعد الربط أو افحص رمز QR',
      chan_status_tg_linked: 'الحساب مربوط — تسليم الرسائل غير مؤكد',
      wa_relink_banner_title: 'واتساب يحتاج إعادة ربط',
      wa_relink_banner_desc: 'انقطعت جلسة واتساب أو تحتاج إلى متابعة. أعد الربط الآن لاستمرار استقبال الرسائل — إعداداتك السابقة محفوظة.',
      wa_relink_banner_action: 'إعادة ربط واتساب',
      wa_relink_banner_action_aria: 'إعادة ربط واتساب عبر رمز QR',
      btn_configure: 'إعداد وتفعيل',
      website_widget_title: 'دردشة الموقع الإلكتروني',
      website_widget_desc: 'انسخ كود البرمجة التالي وضعه قبل وسم الإغلاق body في موقعك لعرض دردشة زين بوت.',
      ecommerce_sync_title: 'معلومات المنتجات للوكيل',
      th_booking_notes: 'ملخص الحجز / ملاحظات البوت',
      settings_billing_title: 'الإعدادات العامة والربط البرمجي للمطورين',
      dev_api_keys_title: 'مفاتيح الوصول الخاصة بالمطورين',
      btn_gen_key: 'إنشاء مفتاح جديد',
      dev_webhooks_title: 'إعدادات الويب هوك الصادر',
      label_webhook_url: 'رابط استقبال الويب هوك الخاص بك',
      label_webhook_secret: 'مفتاح توقيع HMAC السري',
      label_webhook_events: 'الأحداث المشترك بها',
      btn_save_webhook: 'حفظ الويب هوك',
      webhook_logs_title: 'سجل تسليم الويب هوك الصادر',
      th_wh_time: 'الوقت والتاريخ',
      th_wh_event: 'الحدث',
      th_wh_url: 'الرابط',
      th_wh_status: 'رمز استجابة HTTP',
      th_wh_actions: 'العمليات',
      backup_keys_heading: 'المفتاح الاحتياطي للطوارئ (لباقة Growth)',
      backup_keys_desc: 'إدخال مفتاح API الخاص بك. عند نفاذ رصيد باقتك الشهري، سيقوم النظام بالتحول تلقائياً لاستهلاك مفتاحك لمنع توقف البوت.',
      label_backup_provider: 'مزود الخدمة',
      label_backup_key: 'مفتاح الـ API',
      label_backup_model: 'النموذج الافتراضي',
      label_backup_url: 'رابط Endpoint مخصص',
      btn_save_backup_settings: 'حفظ مفتاح الطوارئ',
      btn_cancel: 'إلغاء',
      btn_close: 'إغلاق',
      btn_save: 'حفظ القاعدة',
      label_faq_question: 'السؤال / الكلمات المفتاحية',
      label_faq_answer: 'الإجابة المتوقعة',
      faq_question_placeholder: 'مثال: مواعيد التوصيل',
      faq_answer_placeholder: 'مثال: نوصل خلال ثلاثة أيام عمل داخل القاهرة.',
      orders_empty: 'لا توجد طلبات أنشأها البوت بعد.',
      api_keys_empty: 'لا توجد مفاتيح وصول منشأة بعد.',
      webhook_history_empty: 'لا يوجد سجل لتسليمات الربط البرمجي بعد.',
      webhook_status_timeout: 'TIMEOUT/ERROR',
      webhook_retry_action: 'إعادة المحاولة',
      webhook_saved_ok: 'تم حفظ إعدادات الويب هوك بنجاح!',
      webhook_retry_ok: 'تم إعادة الإرسال والتسليم بنجاح!',
      webhook_retry_failed: 'فشل إعادة الإرسال.',
      apikey_name_prompt: 'أدخل اسماً لمفتاح الوصول:',
      apikey_created_alert: 'تم إنشاء المفتاح بنجاح! مفتاح الوصول الخاص بك هو (يرجى نسخه الآن فلن تتمكن من رؤيته مجدداً):\n\n{key}',
      apikey_revoke_confirm: 'هل أنت متأكد من إبطال مفتاح الوصول هذا؟',
      backup_saved_ok: 'تم حفظ مفتاح الطوارئ بنجاح!',
      admin_title: 'لوحة تحكم مدير النظام الشاملة',
      admin_desc: 'التحكم الكامل في المستخدمين، التجار، الصلاحيات، الانتحال المباشر (Impersonation)، وإدارة مفاتيح الذكاء الاصطناعي الـ Failover.',
      admin_subtab_users: 'إدارة المستخدمين والتجار',
      admin_subtab_keys: 'سيرفرات AI & Failover',
      admin_users_title: 'قائمة المستخدمين والتجار المسجلين',
      admin_users_desc: 'إدارة الأدوار، الاشتراكات، تعليق الحسابات، والدخول المباشر كـ مستخدم.',
      admin_btn_add_user: 'إضافة مستخدم / تاجر جديد',
      th_user_username: 'اسم المستخدم',
      th_user_email: 'البريد الإلكتروني',
      th_user_role: 'الدور (Role)',
      th_user_tier: 'باقة الاشتراك',
      th_user_status: 'الحالة',
      th_user_bots: 'البوتات',
      th_user_actions: 'الإجراءات السريعة',
      admin_loading_users: 'جاري تحميل قائمة المستخدمين...',
      admin_active_keys: 'مفاتيح الوصول العامة النشطة وترتيب الأولوية',
      admin_btn_reset: 'إعادة تهيئة المفاتيح المعطلة',
      admin_register_key: 'تسجيل مفتاح نظام عام جديد',
      admin_label_name: 'اسم المفتاح / الوصف',
      admin_label_provider: 'مزود الذكاء الاصطناعي',
      admin_label_key: 'مفتاح الـ API',
      admin_label_model: 'النموذج الافتراضي',
      admin_label_priority: 'مستوى الأولوية (1 = الأعلى)',
      admin_label_base_url: 'رابط Endpoint مخصص (اختياري)',
      admin_btn_register: 'تسجيل مفتاح النظام',
      admin_no_keys: 'لا توجد مفاتيح نظام عامة مسجلة حالياً. قم بإضافة مفتاح من النموذج الجانبي.',
      admin_status_working: 'يعمل',
      admin_status_failed: 'معطل',
      admin_lbl_provider: 'المزود',
      admin_lbl_model: 'النموذج',
      admin_lbl_priority: 'الأولوية',
      admin_subtab_overview: 'نظرة عامة على النظام',
      admin_subtab_audit: 'سجل التدقيق والجلسات',
      admin_subtab_notify: 'الإشعارات',
      training_general_title: 'التعليمات العامة للوكيل',
      training_general_desc: 'توجيهات ثابتة تحدد هوية وسلوك الوكيل. منقولة من المنصة السابقة وتُحقن في كل رد.',
      btn_add_instruction: 'إضافة تعليمات',
      label_instruction_content: 'التعليمات',
      instruction_content_placeholder: 'مثال: رحب بالعميل دائماً بالعامية المصرية ولا تذكر أسعاراً خارج الكتالوج.',
      training_empty_general: 'لا توجد تعليمات عامة بعد. أضف التوجيهات التي تحدد هوية الوكيل.',
      ov_users_total: 'إجمالي المستخدمين',
      ov_users_active: 'مستخدمون نشطون',
      ov_bots_total: 'إجمالي الوكلاء',
      ov_bots_active: 'وكلاء نشطون',
      ov_conversations: 'المحادثات',
      ov_messages: 'الرسائل',
      ov_chat_orders: 'طلبات المحادثات',
      ov_active_sessions: 'انتحالات نشطة',
      ov_audit_events: 'أحداث التدقيق',
      audit_sessions_title: 'جلسات الانتحال',
      audit_sessions_desc: 'كل جلسة انتحال يقوم بها الأدمن مع سببها وحالتها ومدتها.',
      th_session_actor: 'الأدمن',
      th_session_subject: 'المستخدم المستهدف',
      th_session_reason: 'السبب',
      th_session_status: 'الحالة',
      th_session_started: 'بدأت',
      th_session_expires: 'تنتهي',
      admin_loading_sessions: 'جاري تحميل الجلسات...',
      audit_events_title: 'سجل التدقيق',
      audit_events_desc: 'سجل مُخفى البيانات الحساسة لكل تعديل قام به أدمن أو أثناء انتحال الهوية.',
      audit_filter_type: 'تصفية حسب نوع الحدث',
      audit_filter_all: 'كل الأحداث',
      audit_type_started: 'بدء انتحال هوية',
      audit_type_ended: 'إنهاء انتحال هوية',
      audit_type_imp_write: 'تعديل أثناء انتحال',
      audit_type_admin_write: 'تعديل إداري مباشر',
      th_event_when: 'الوقت',
      th_event_type: 'الحدث',
      th_event_actor: 'المنفذ ← الهدف',
      th_event_action: 'الإجراء',
      th_event_outcome: 'النتيجة',
      admin_loading_events: 'جاري تحميل سجل التدقيق...',
      admin_empty_sessions: 'لا توجد جلسات انتحال مسجلة بعد.',
      admin_empty_events: 'لا توجد أحداث تدقيق مطابقة لهذا الفلتر بعد.',
      notify_title: 'إرسال إشعار للمنصة',
      notify_desc: 'أرسل إشعاراً داخل المنصة لكل الحسابات أو لمستخدم محدد.',
      notify_target: 'الوجهة',
      notify_target_all: 'كل المستخدمين',
      notify_target_single: 'مستخدم محدد (باسم المستخدم)',
      notify_username_label: 'اسم المستخدم',
      notify_title_label: 'العنوان',
      notify_body_label: 'نص الرسالة',
      notify_send_btn: 'إرسال الإشعار',
      notify_sent_ok: 'تم إرسال الإشعار بنجاح!',
      notify_failed: 'تعذر إرسال الإشعار.',
      admin_subtab_landing_demo: 'بوت تجربة الصفحة الرئيسية',
      landing_demo_title: 'وكيل تجربة الصفحة الرئيسية',
      landing_demo_desc: 'يتحكم في وكيل الذكاء الاصطناعي الحقيقي الذي يجيب على أسئلة الزوار داخل محادثة "جرّبها مباشرة" في الصفحة الرئيسية.',
      landing_demo_enable_label: 'تفعيل التجربة الحية بالذكاء الاصطناعي',
      landing_demo_instructions_label: 'تعليمات الوكيل',
      landing_demo_instructions_placeholder: 'نبرة إضافية، حدود، عروض، أو معلومات يجب على الوكيل الالتزام بها أثناء التجربة.',
      landing_demo_instructions_hint: 'تُضاف هذه التعليمات فوق قاعدة المعرفة المدمجة الخاصة بالمنصة.',
      landing_demo_save_btn: 'حفظ الإعدادات',
      landing_demo_saved_ok: 'تم الحفظ بنجاح!',
      landing_demo_save_failed: 'تعذر حفظ الإعدادات.',
      landing_demo_updated_at: 'آخر تحديث',
      model_select_heading: 'موديل الذكاء الاصطناعي',
      model_select_desc: 'اختر "تلقائي" ليختار النظام أفضل موديل متاح لباقتك، أو حدد موديلاً معيناً من القائمة المفعّلة لحسابك.',
      model_select_label: 'الموديل',
      model_select_auto: 'تلقائي (مستحسن)',
      model_select_save: 'حفظ الموديل',
      model_saved_ok: 'تم حفظ اختيار الموديل بنجاح!',
      model_save_failed: 'هذا الموديل غير متاح في باقتك الحالية.',
      model_loading_list: 'جاري تحميل الموديلات المتاحة...',
      orders_bookings_title: 'إدارة الطلبات والمواعيد',
      orders_bookings_subtitle: 'إدارة الطلبات المنشأة من المحادثات وتنسيق وجدولة وتتبع مواعيد العملاء بشكل فوري.',
      btn_new_booking: 'موعد جديد',
      btn_new_order: 'طلب جديد',
      btn_refresh: 'تحديث',
      stat_orders_total: 'إجمالي الطلبات',
      stat_orders_pending: 'طلبات معلقة',
      stat_bookings_total: 'إجمالي المواعيد',
      stat_bookings_confirmed: 'مواعيد مؤكدة',
      orders_search_placeholder: 'ابحث باسم العميل أو الهاتف أو نوع الخدمة...',
      orders_status_filter: 'تصفية حسب الحالة',
      orders_type_filter: 'تصفية نوع السجل',
      filter_all_statuses: 'كل الحالات',
      status_pending: 'قيد الانتظار',
      status_processing: 'قيد التجهيز',
      status_confirmed: 'مؤكد',
      status_completed: 'مكتمل',
      status_rescheduled: 'مُعاد جدولته',
      status_shipped: 'تم الشحن',
      status_delivered: 'تم التسليم',
      status_cancelled: 'ملغي',
      filter_view_all: 'كل السجلات',
      filter_view_orders: 'الطلبات فقط',
      filter_view_bookings: 'المواعيد فقط',
      appointments_list_title: 'تقويم المواعيد والحجوزات الذكية',
      th_booking_id: 'رقم الحجز',
      th_booking_customer: 'العميل',
      th_booking_phone: 'الهاتف',
      th_booking_service: 'الخدمة / الغرض',
      th_booking_time: 'التاريخ والوقت',
      th_booking_status: 'الحالة',
      th_booking_actions: 'الإجراءات',
      chat_orders_list_title: 'طلبات تم إنشاؤها تلقائياً بالذكاء الاصطناعي',
      th_order_id: 'رقم الطلب',
      th_customer: 'اسم العميل',
      th_phone: 'الهاتف',
      th_items: 'المنتجات',
      th_total: 'الإجمالي',
      th_status: 'الحالة',
      th_order_actions: 'الإجراءات',
      notification_recipients_title: 'قنوات ومستلمي الإشعارات الفورية',
      notification_recipients_desc: 'ربط أرقام واتساب وحسابات أو قنوات تيليجرام متعددة لتلقي إشعارات فورية عند إنشاء الطلبات والمواعيد.',
      btn_add_recipient: 'إضافة قناة إشعارات',
      recipient_tier_free_hint: 'الباقة المجانية تتيح قناة واحدة فقط لتلقي الإشعارات. قم بالترقية لباقة Growth لقنوات غير محدودة.',
      upgrade_plan_link: 'ترقية الباقة',
      subscription_title: 'الاشتراك والترقية',
      subscription_desc: 'اشتراكات شهرية بتفعيل يدوي. ادفع عبر انستاباي أو محفظة كاش ثم تواصل مع المالك على واتساب.',
      subscription_current_free: 'الباقة المجانية',
      subscription_intent_hint: 'اخترت باقة {plan}. الباقة لم تُفعّل بعد؛ راجع تعليمات الدفع قبل طلب التفعيل.',
      subscription_whatsapp_message: 'أهلًا زين بوت، عندي سؤال عن باقة {plan} وطريقة تفعيلها.',
      subscription_plan_free: 'مجاني • 0',
      subscription_plan_growth1: 'النمو الأساسي • 199',
      subscription_plan_growth2: 'النمو المتقدم • 499',
      subscription_plan_growth3: 'النمو الاحترافي • 999',
      subscription_plan_enterprise: 'الشركات • 4999',
      subscription_label_period: 'فترة الدفع',
      subscription_monthly: 'شهري',
      subscription_yearly: 'سنوي (وفّر شهرين)',
      subscription_label_method: 'طريقة الدفع',
      pay_instapay: 'انستاباي',
      pay_vodafone: 'فودافون كاش',
      pay_orange: 'أورانج موني',
      pay_etisalat: 'اتصالات كاش',
      subscription_label_reference: 'مرجع الدفع / الإيصال',
      subscription_reference_placeholder: 'رقم العملية أو رقم المرسل',
      subscription_btn_request: 'إرسال طلب التفعيل',
      subscription_btn_whatsapp: 'تواصل واتساب',
      subscription_payment_hint: 'نقبل: انستاباي • فودافون كاش • أورانج موني • اتصالات كاش. التفعيل يدوي خلال ساعات بعد مراجعة الإيصال.',
      th_sub_tier: 'الخطة',
      th_sub_period: 'الفترة',
      th_sub_method: 'الطريقة',
      th_sub_status: 'الحالة',
      th_sub_date: 'التاريخ',
      th_sub_user: 'المستخدم',
      th_sub_actions: 'إجراءات',
      admin_subtab_subs: 'الاشتراكات',
      admin_subs_title: 'طلبات الاشتراك',
      admin_subs_desc: 'راجع المدفوعات اليدوية (انستاباي / محافظ الكاش) واعتمد لتفعيل الخطة.',
      admin_subs_all: 'كل الحالات',
      admin_subs_pending: 'قيد الانتظار',
      admin_subs_approved: 'مقبول',
      admin_subs_rejected: 'مرفوض',
      admin_subs_refresh: 'تحديث',
      admin_subs_loading: 'جاري تحميل الطلبات...',
      subscription_my_requests_empty: 'لا توجد طلبات بعد.',
      subscription_already_free: 'أنت بالفعل على الباقة المجانية.',
      subscription_request_sent: 'تم إرسال طلبك بنجاح. تواصل واتساب بصورة التحويل للتفعيل.',
      subscription_request_failed: 'تعذر إرسال الطلب',
      subscription_request_pending: 'لديك طلب قيد المراجعة بالفعل. يتم عرض حالته الحالية — لم يُرسل طلب جديد.',
      subscription_request_unknown: 'تعذر تأكيد الإرسال — تم الاحتفاظ بمرجع الدفع. تحقق من طلباتك قبل إعادة المحاولة.',
      subscription_review_conflict: 'تمت مراجعة هذا الطلب مسبقًا. يتم عرض الحالة الحالية — لم يُرسل شيء مرتين.',
      subscription_list_error: 'تعذر تحميل طلبات الاشتراك.',
      subscription_admin_empty: 'لا توجد طلبات.',
      subscription_action_approve: 'اعتماد وتفعيل',
      subscription_action_reject: 'رفض',
      subscription_action_error: 'خطأ',
      th_rec_channel: 'القناة',
      th_rec_target: 'الرقم / المعرف المستهدف',
      th_rec_label: 'الوصف / الفريق',
      th_rec_events: 'أحداث الإشعار',
      th_rec_status: 'الحالة',
      th_rec_actions: 'الإجراءات',
      agent_tools_section_title: 'أدوات الوكيل',
      agent_tool_booking_title: 'أداة حجز وجدولة المواعيد',
      agent_booking_hours_label: 'ساعات العمل',
      agent_booking_service_label: 'الخدمة الافتراضية / الغرض',
      agent_tool_orders_title: 'أداة تتبع وإدارة الطلبات',
      agent_tool_wa_title: 'أداة إرسال إشعارات واتساب الفورية',
      agent_tool_tg_title: 'أداة إرسال إشعارات تيليجرام الفورية',
      agent_skills_section_title: 'مهارات الوكيل',
      skill_sales: 'استشاري مبيعات ذكي',
      skill_appointments: 'منسق مواعيد وحجوزات',
      skill_orders: 'مدير طلبات وشحن',
      skill_support: 'أخصائي دعم وشكاوى',
      skill_winback: 'استرجاع العملاء غير النشطين',
      booking_modal_title: 'إدارة الحجز والموعد',
      label_customer_name: 'اسم العميل',
      placeholder_customer_name: 'الاسم بالكامل',
      label_customer_phone: 'رقم الهاتف',
      placeholder_customer_phone: '01xxxxxxxxx',
      label_service_type: 'نوع الخدمة / الغرض',
      placeholder_service_type: 'استشارة / معاينة',
      label_booking_status: 'الحالة',
      label_booking_date: 'التاريخ والوقت',
      label_slot_duration: 'المدة (بالدقائق)',
      label_booking_notes: 'ملاحظات وتفاصيل',
      placeholder_booking_notes: 'أي تفاصيل أو ملاحظات إضافية...',
      btn_save_booking: 'حفظ الموعد',
      chat_order_modal_title: 'إدارة طلب المحادثة',
      label_customer_address: 'عنوان التوصيل',
      label_order_items: 'ملخص المنتجات',
      placeholder_order_items: 'اسم المنتج x1',
      label_total_amount: 'الإجمالي (جنيه)',
      label_order_status: 'الحالة',
      label_order_note: 'ملاحظات الطلب',
      btn_save_order: 'حفظ الطلب',
      recipient_modal_title: 'إضافة قناة إشعارات وتنبيهات',
      label_rec_channel: 'نوع القناة',
      channel_whatsapp: 'رقم واتساب',
      channel_telegram: 'حساب أو قناة تيليجرام',
      label_rec_target: 'الوجهة المستهدفة',
      placeholder_rec_target: '01xxxxxxxxx أو معرف شات تيليجرام',
      hint_rec_target: 'لواتساب: 01xxxxxxxxx أو +201xxxxxxxxx. لتيليجرام: معرف الشات أو القناة.',
      label_rec_label: 'الوصف / الفريق المستلم',
      placeholder_rec_label: 'مدير المبيعات، المطبخ، فريق العمليات...',
      label_rec_events: 'أحداث الإشعارات المفعلة',
      ev_order_created: 'إنشاء طلب جديد',
      ev_order_status: 'تحديث حالة الطلب',
      ev_booking_created: 'حجز موعد جديد',
      ev_booking_rescheduled: 'تعديل موعد حجز',
      ev_booking_cancelled: 'إلغاء حجز',
      btn_save_recipient: 'حفظ قناة الإشعارات',
      bookings_empty: 'لا توجد مواعيد مسجلة حتى الآن.',
      recipients_empty: 'لم يتم ربط أي قنوات إشعارات حتى الآن.',
      action_confirm: 'تأكيد',
      action_reschedule: 'إعادة جدولة',
      action_complete: 'إكمال',
      action_cancel: 'إلغاء',
      action_edit: 'تعديل',
      action_delete: 'حذف',
      action_ship: 'شحن',
      action_deliver: 'تم التوصيل',
      action_test: 'اختبار الإرسال',
      delete_booking_confirm: 'هل أنت متأكد من رغبتك في حذف هذا الموعد؟',
      delete_order_confirm: 'هل أنت متأكد من رغبتك في حذف هذا الطلب؟',
      delete_recipient_confirm: 'هل أنت متأكد من حذف قناة الإشعارات هذه؟',
      booking_saved_ok: 'تم حفظ الموعد بنجاح!',
      order_saved_ok: 'تم حفظ الطلب بنجاح!',
      booking_save_failed: 'تعذر حفظ الموعد.',
      order_save_failed: 'تعذر حفظ الطلب.',
      orders_load_error: 'تعذر تحميل الطلبات.',
      bookings_load_error: 'تعذر تحميل المواعيد.',
      orders_refresh_failed: 'تم الحفظ، لكن تعذر تحديث قائمة الطلبات.',
      bookings_refresh_failed: 'تم الحفظ، لكن تعذر تحديث قائمة المواعيد.',
      booking_invalid_date: 'تاريخ الموعد غير صالح. صححه قبل الحفظ.',
      orders_count_unit: 'طلب',
      bookings_count_unit: 'موعد',
      created_label: 'تم الإنشاء',
      format_date_unavailable: 'غير متاح',
      chat_order_create_unsupported: 'إنشاء الطلبات يدويًا غير مدعوم حاليًا. تُنشأ الطلبات تلقائيًا من المحادثات.',
      store_order_readonly: 'طلبات المتجر للعرض فقط هنا. أدرها من لوحة تحكم المتجر.',
      recipient_saved_ok: 'تم حفظ قناة الإشعارات بنجاح!',
      recipient_save_failed: 'تعذر حفظ قناة الإشعارات',
      recipient_test_sent: 'تم إرسال الإشعار التجريبي بنجاح!',
      recipient_test_failed: 'فشل إرسال الإشعار التجريبي',
      recipient_test_configured: 'لم يتم التسليم. القناة محفوظة ومُعدّة، لكن لم يُرسل شيء.',
      recipient_delete_failed: 'تعذر حذف قناة الإشعارات.',
      recipients_load_error: 'تعذر تحميل قنوات الإشعارات.',
      recipients_loading: 'جارٍ تحميل قنوات الإشعارات.',
      webhook_retry_confirm: 'إعادة إرسال حمولة الويب هوك إلى الرابط الآن؟',
      webhook_logs_refresh_failed: 'تم تأكيد التسليم، لكن تعذر تحديث قائمة السجل.',
      chan_webchat_title: 'صفحة الدردشة المستقلة',
      chan_desc_webchat: 'صفحة دردشة مخصصة ومستقلة وتجربة تفاعلية للوكيل.',
      btn_customize_chat: 'تخصيص واختبار',
      btn_open_chat: 'فتح الدردشة',
      chat_page_customizer_title: 'تخصيص صفحة الدردشة المستقلة',
      chat_page_share_link: 'رابط صفحة الدردشة المباشر',
      btn_copy_link: 'نسخ الرابط',
      label_chat_page_title: 'عنوان صفحة الدردشة',
      label_chat_page_slug: 'معرف / مسار الرابط المخصص',
      chat_page_theme_colors: 'ألوان الواجهة والمظهر',
      label_color_header: 'لون الهيدر',
      label_color_bg: 'لون الخلفية',
      label_color_bot_bubble: 'فقاعة رسالة الوكيل',
      label_color_user_bubble: 'فقاعة رسالة العميل',
      label_color_button: 'لون زر الإرسال',
      label_color_title: 'لون نص العنوان',
      label_chat_suggested_questions: 'الأسئلة السريعة المقترحة (سؤال في كل سطر)',
      chk_enable_suggested_questions: 'تفعيل الأسئلة المقترحة',
      chk_enable_image_upload: 'تفعيل إمكانية رفع الصور',
      label_embed_widget_code: 'كود تضمين الويدجت في المواقع',
      btn_copy_code: 'نسخ الكود',
      btn_save_chat_page: 'حفظ إعدادات الدردشة',
      chat_page_saved_ok: 'تم حفظ إعدادات صفحة الدردشة بنجاح!',
      link_copied_ok: 'تم نسخ الرابط إلى الحافظة!',
      code_copied_ok: 'تم نسخ كود التضمين إلى الحافظة!',
      label_preset_themes: 'اختر نموذجاً افتراضياً',
      preset_cyber_dark: 'النيون الليلي الحديث',
      preset_cyber_dark_desc: 'تصميم داكن نيون',
      preset_emerald_clean: 'الأخضر الزمردي',
      preset_emerald_clean_desc: 'فاتح عصري فاخر',
      preset_royal_purple: 'الأرجواني الملكي',
      preset_royal_purple_desc: 'تصميم داكن ملكي',
      hint_customize_colors: 'قابل للتعديل بحرية',
      preview_live_title: 'معاينة حية تفاعلية',
      badge_realtime: 'مباشر',
      preview_status_online: 'نشط · جاهز للرد والمبيعات',
      preview_input_placeholder: 'اكتب رسالتك هنا...',
      free_plan_tools_limit_badge: '(الحد الأقصى للباقة المجانية: 3 أدوات فقط وجميع المهارات متاحة)',
      free_plan_skills_limit_badge: '(الباقة المجانية: جميع المهارات متاحة)',
      label_chat_page_logo: 'شعار وأيقونة صفحة الدردشة',
      btn_upload_logo: 'رفع شعار',
      btn_remove_logo: 'إزالة',
      hint_logo_format: 'PNG أو JPG حتى 2 ميجابايت',
      store_sync_scope: 'الاستيراد يدوي عند الضغط على زر المزامنة فقط. الحد الأقصى ٥٠٠ منتج في كل مرة؛ في Shopify يُستخدم أول خيار للمنتج. المنتجات المستوردة تصبح متاحة للوكيل ضمن بيانات المتجر.',
      store_provider_label: 'المنصة',
      store_url_label: 'رابط المتجر HTTPS (بدون مسار)',
      store_url_placeholder: 'https://example.myshopify.com',
      store_woo_url_placeholder: 'https://example.com',
      store_shopify_url_help: 'استخدم عنوان https://store.myshopify.com بدون مسار أو استعلام.',
      store_woo_url_help: 'استخدم عنوان موقع WooCommerce الآمن HTTPS بدون مسار أو استعلام.',
      store_currency_label: 'عملة المنتجات',
      store_token_label: 'رمز الوصول إلى Shopify Admin API',
      store_token_help: 'أدخل رمز Admin API بصلاحية read_products. لتعديل الإعدادات أدخله مجددًا؛ لا يمكن عرضه بعد الحفظ.',
      store_key_label: 'مفتاح WooCommerce',
      store_secret_label: 'السر الخاص بمفتاح WooCommerce',
      store_woo_help: 'أنشئ مفتاح WooCommerce REST API بصلاحية قراءة المنتجات. لتعديل الإعدادات أدخل المفتاح والسر مجددًا؛ لا يمكن عرضهما بعد الحفظ.',
      store_save: 'حفظ الربط',
      store_sync: 'مزامنة الربط المحفوظ',
      store_status_loading: 'جارٍ التحقق من الربط…',
      store_status_unconfigured: 'لا يوجد ربط محفوظ لهذه المنصة.',
      store_status_idle: 'الربط محفوظ وجاهز للمزامنة اليدوية.',
      store_status_running: 'المزامنة جارية.',
      store_status_succeeded: 'نجحت آخر مزامنة.',
      store_status_failed: 'فشلت آخر مزامنة.',
      store_status_details: 'تم استيراد: {count} · آخر مزامنة ناجحة: {time}',
      store_status_no_sync: 'لم تحدث مزامنة ناجحة بعد.',
      store_no_bot: 'اختر وكيلًا لإعداد الكتالوج.',
      store_saving: 'جارٍ حفظ الربط…',
      store_saved: 'تم حفظ الربط. يمكنك المزامنة يدويًا الآن.',
      store_syncing: 'جارٍ استيراد المنتجات…',
      store_synced: 'اكتمل الاستيراد: {count} منتج.',
      store_load_error: 'تعذّر تحميل حالة الربط. جرّب تبديل المنصة أو فتح الاتصالات مجددًا.',
      store_error_generic: 'فشل الطلب. حاول مرة أخرى.',
      store_error_invalid_config: 'أدخل عملة مدعومة وبيانات اعتماد صحيحة (٨ أحرف على الأقل).',
      store_error_invalid_origin: 'أدخل رابط متجر HTTPS بدون مسار أو استعلام أو منفذ. Shopify يتطلب عنوان myshopify.com.',
      store_error_store_not_linked: 'الوكيل غير مرتبط بمتجر. اربط متجرًا أولاً لإعداد الكتالوج.',
      store_error_owner_only: 'مالك الحساب فقط يقدر يدير ربط الكتالوج.',
      store_error_sync_in_progress: 'فيه مزامنة شغالة بالفعل. تحقق لاحقًا.',
      store_error_not_configured: 'احفظ ربط المنصة دي قبل المزامنة.',
      store_error_auth: 'المتجر رفض بيانات الاعتماد. تحقق من الصلاحيات واحفظ بيانات جديدة.',
      store_error_remote: 'تعذّرت قراءة كتالوج المتجر. تحقق من واجهة المتجر وحاول مجددًا.',
      store_error_limit: 'الكتالوج تجاوز حد ٥٠٠ منتج. لم يكتمل استيراد جديد.',
      store_error_empty: 'المتجر لم يرجع منتجات للاستيراد.',
      store_error_unsafe: 'عنوان المتجر أو استجابته غير مدعومين. تحقق من رابط HTTPS.',
      store_training_path: 'بعد الاستيراد جرّب سؤالًا عن منتج حقيقي في الدردشة، وأضف قواعد عملك الإضافية في تدريب الذكاء الاصطناعي.',
      store_open_training: 'فتح تدريب الذكاء الاصطناعي',
      feedback_loading: 'جارٍ التحميل…',
      feedback_retry: 'إعادة المحاولة',
      lazy_load_failed: 'تعذّر تحميل هذا القسم. تحقق من الاتصال ثم أعد المحاولة.',
      feedback_stale: 'تُعرض بيانات محفوظة أثناء التحديث…',
      feedback_no_bot: 'اختر وكيلًا لعرض هذا القسم.',
      automation_center_title: 'مركز أتمتة المبيعات والمهام التلقائية',
      automation_center_desc: 'إدارة المهام التلقائية الخلفية: استعادة المبيعات المتروكة، تقرير المبيعات اليومي، وفرز الشكاوى العاجلة.',
      btn_trigger_recovery: 'استعادة العملاء المحتملين الآن',
      btn_trigger_digest: 'إرسال ملخص المبيعات الآن',
      automation_checking: 'جاري الفحص...',
      automation_checked_ok: 'تم فحص المحادثات بنجاح.',
      automation_check_failed: 'حدث خطأ أثناء تشغيل الفحص.',
      automation_sending: 'جاري الإرسال...',
      automation_digest_sent: 'تم إرسال الملخص بنجاح.',
      automation_digest_failed: 'حدث خطأ أثناء إرسال التقرير.',
      card_recovery_title: 'استعادة المبيعات المتروكة',
      card_recovery_desc: 'إعادة استهداف ومتابعة العملاء الذين أبدوا رغبة بالشراء أو سألوا عن الأسعار وتوقفوا عن الرد.',
      card_digest_title: 'تقرير الأداء والمبيعات اليومي',
      card_digest_desc: 'ملخص شامل للطلبات اليومية والإيرادات والمحادثات يُرسل لحسابك على تيليجرام أو واتساب.',
      card_stock_title: 'تنبيهات المخزون المنخفض',
      card_stock_desc: 'مراقبة مستمرة لكميات المنتجات في الكتالوج وإرسال إنذار مبكر عند اقتراب نفاد المخزون.',
      card_complaints_title: 'فرز وتنبيه الشكاوى العاجلة',
      card_complaints_desc: 'تحويل فوري لشكاوى العملاء الحرجة وطلبات التدخل البشري إلى هاتفك دون تأخير.',
      badge_active: 'نشط',
      badge_scheduled: 'يومياً 9:00 م',
      badge_monitoring: 'مراقبة تلقائية',
      badge_instant: 'تنبيه فوري',
      agent_tool_recovery_title: 'أداة المتابعة واستعادة المبيعات المتروكة تلقائياً',
      agent_recovery_delay_label: 'المتابعة بعد',
      delay_2h: 'ساعتان',
      delay_4h: '4 ساعات',
      delay_12h: '12 ساعة',
      delay_24h: '24 ساعة',
      agent_recovery_msg_label: 'رسالة المتابعة المخصصة',
      agent_recovery_msg_placeholder: 'اتركه فارغاً لاستخدام الرسالة الافتراضية الذكية',
      agent_tool_digest_title: 'أداة تقرير الأداء والمبيعات اليومي التلقائي',
      agent_digest_channel_label: 'قناة استلام التقرير',
      channel_all: 'تيليجرام وواتساب ولوحة التحكم',
      channel_telegram_only: 'تيليجرام فقط',
      channel_whatsapp_only: 'واتساب فقط',
      channel_inapp: 'إشعارات لوحة التحكم فقط',
      agent_digest_time_label: 'وقت الإرسال اليومي',
      agent_tool_upsell_title: 'أداة ترشيح المنتجات التكميلية وإغلاق الصفقات',
      agent_sales_tone_label: 'نبرة وأسلوب البيع',
      tone_consultative: 'استشاري ومقنع',
      tone_enthusiastic: 'حماسي وترويجي',
      tone_formal: 'رسمي ومباشر',
      agent_max_discount_label: 'صلاحية الخصم التشجيعي',
      discount_none: 'بدون خصم إضافي (0%)',
      menu_idea_council: 'لجنة الأفكار',
      idea_council_desc: 'لجنة تحليل متخصصة بالذكاء الاصطناعي لتقييم المشاريع وصناعة القرار',
      idea_quota_label: 'رصيد الأفكار الشهري',
      idea_quota_text: 'أفكار متاحة هذا الشهر',
      idea_btn_new: 'اعرض فكرة جديدة',
      idea_btn_back_list: 'العودة لقائمة الأفكار',
      idea_filter_all: 'الكل',
      idea_filter_drafts: 'المسودات',
      idea_filter_running: 'قيد التقييم',
      idea_filter_completed: 'مكتملة',
      idea_list_empty: 'لا توجد أفكار مسجلة حتى الآن. انقر فوق فكرة جديدة للبدء.',
      idea_input_title: 'صف فكرة مشروعك',
      idea_input_desc_label: 'وصف الفكرة بالتفصيل (من 100 إلى 8,000 حرف)',
      idea_input_desc_placeholder: 'اكتب فكرتك بحرية: ما المشكلة التي تحلها؟ لمن تقدم؟ ولماذا قد يغير الناس سلوكهم لاستخدامها؟',
      idea_input_market_label: 'السوق المستهدف أو النطاق الجغرافي (اختياري)',
      idea_input_market_placeholder: 'مثال: السعودية، الخليج، متجر محلي',
      idea_input_audience_label: 'الفئة المستهدفة من العملاء (اختياري)',
      idea_input_audience_placeholder: 'مثال: أصحاب المطاعم، المستقلين',
      idea_input_concern_label: 'أكثر شيء يقلقك وتريد تقييمه (اختياري)',
      idea_input_concern_placeholder: 'مثال: هل سيدفع العميل فعلاً؟ هل يسهل تقليدها؟',
      idea_lang_label: 'لغة التقرير',
      idea_lang_ar: 'العربية',
      idea_lang_en: 'الإنجليزية',
      idea_privacy_notice: 'ضمان الخصوصية: أفكارك وتقاريرك خاصة بحسابك ومشفرة ولا تُستخدم لتدريب النماذج العامة.',
      idea_guiding_questions_title: 'أسئلة مساعدة استرشادية',
      idea_gq_one: 'ما هي المشكلة الأساسية ومن الذي يعاني منها؟',
      idea_gq_two: 'ماذا يفعل العملاء حالياً كبديل لحلك؟',
      idea_gq_three: 'لماذا قد يغير الناس عاداتهم اليومية للانتقال إليك؟',
      idea_btn_structure: 'تنظيم بطاقة الفكرة',
      idea_btn_structuring: 'جارٍ تنظيم الفكرة...',
      idea_card_title: 'بطاقة الفكرة المنظمة',
      idea_card_desc: 'راجع وعدل كيفية فهم اللجنة لفكرتك قبل بدء جلسة التقييم.',
      idea_fld_title: 'العنوان المقترح',
      idea_fld_pitch: 'الوصف المختصر',
      idea_fld_customer: 'العميل المستهدف',
      idea_fld_problem: 'المشكلة الأساسية',
      idea_fld_solution: 'الحل المقترح',
      idea_fld_value: 'القيمة المقترحة',
      idea_fld_alternatives: 'البدائل الحالية',
      idea_fld_revenue: 'نموذج الربح',
      idea_fld_assumptions: 'الافتراضات الأولية',
      idea_fld_gaps: 'المعلومات الناقصة',
      idea_fld_core_question: 'سؤال التقييم الأساسي',
      idea_confirm_card_text: 'أؤكد أن هذه البطاقة تمثل فكرتي بدقة وجاهز لبدء التقييم.',
      idea_btn_start_council: 'ابدأ جلسة التقييم',
      idea_btn_save_draft: 'حفظ كمسودة',
      idea_session_progress_title: 'جلسة اللجنة منعقدة حالياً',
      idea_session_progress_desc: 'تعمل اللجنة في الخلفية. يمكنك مغادرة الصفحة والعودة في أي وقت دون فقدان التقدم.',
      idea_step_research: 'البحث السوقي الحي',
      idea_step_analysis: 'تحليل أعضاء اللجنة',
      idea_step_synthesis: 'صياغة التقرير النهائي',
      member_cold_customer: 'العميل البارد',
      member_cold_customer_role: 'سلوك المشتري ومحفز التجربة',
      member_harsh_auditor: 'المدقق القاسي',
      member_harsh_auditor_role: 'كشف الافتراضات والثغرات',
      member_execution_expert: 'خبير التنفيذ',
      member_execution_expert_role: 'قابلية البناء ونطاق 7 أيام',
      member_market_researcher: 'باحث السوق',
      member_market_researcher_role: 'بحث البدائل وإشارات الطلب',
      member_devils_advocate: 'محامي الشيطان',
      member_devils_advocate_role: 'سيناريو الفشل الأسوأ',
      member_wedge_hunter: 'صائد التميّز',
      member_wedge_hunter_role: 'زاوية الدخول والقابلية للدفاع',
      member_ux_designer: 'مصمم التجربة',
      member_ux_designer_role: 'أول لحظة قيمة ونقاط الاحتكاك',
      member_candid_champion: 'الداعم الصريح',
      member_candid_champion_role: 'نقطة القوة الواقعية للاستمرار',
      idea_report_title: 'تقرير القرار الموحد للجنة الأفكار',
      idea_verdict_label: 'القرار التنفيذي',
      idea_seven_day_build_label: 'قرار البناء لسبعة أيام',
      idea_opp_label: 'أقوى فرصة',
      idea_risk_label: 'أكبر خطر',
      idea_assumptions_label: 'أخطر 3 افتراضات غير مثبتة',
      idea_question_label: 'أهم سؤال يجب حسمه',
      idea_cut_list_label: 'ما يجب حذفه أو تأجيله',
      idea_validation_plan_title: 'خطة التحقق المرنة',
      idea_val_hypothesis: 'الفرضية',
      idea_val_audience: 'الجمهور',
      idea_val_channel: 'القناة',
      idea_val_duration: 'المدة المقترحة',
      idea_val_cost: 'التكلفة التقديرية',
      idea_val_metric: 'معيار النجاح',
      idea_val_stop: 'شرط التوقف',
      idea_mvp_title: 'نطاق MVP لسبعة أيام',
      idea_wedge_title: 'زاوية التميّز ولحظة القيمة',
      idea_consensus_title: 'نقاط الاتفاق والتباين',
      idea_sources_title: 'مصادر البحث الموثقة',
      idea_critics_title: 'تحليلات وتقييمات أعضاء اللجنة التفصيلية',
      idea_critics_subtitle: '8 زوايا تخصصية حول الجدوى وقابلية التنفيذ والمخاطر',
      idea_truth_board_title: 'لوحة الحقيقة التفاعلية',
      idea_truth_board_desc: 'تابع الافتراضات والمخاطر وخطوات التحقق في الوقت الفعلي دون استهلاك جولات الذكاء الاصطناعي.',
      idea_tb_status_open: 'مفتوح',
      idea_tb_status_validating: 'جارٍ التحقق',
      idea_tb_status_verified: 'تم التحقق',
      idea_tb_status_dismissed: 'مستبعد',
      idea_tb_notes_placeholder: 'ملاحظات وتحديثات المؤسس...',
      idea_btn_export_md: 'تصدير Markdown',
      idea_btn_export_pdf: 'طباعة أو PDF',
      idea_rounds_history_title: 'سجل جولات التقييم:',
      idea_btn_compare_rounds: 'مقارنة الجولات',
      idea_unit_econ_title: 'حاسبة اقتصاديات الوحدة التفاعلية',
      idea_unit_econ_subtitle: 'محاكاة الهامش وحجم الطلبات ونقاط التعادل. حرّك المؤشرات لاختبار صلابة النموذج المالي.',
      idea_unit_econ_aov: 'متوسط قيمة الطلب (AOV):',
      idea_unit_econ_margin: 'نسبة العمولة / هامش الربح:',
      idea_unit_econ_direct_costs: 'التكاليف المباشرة لكل طلب:',
      idea_unit_econ_fixed_costs: 'المصاريف التشغيلية الثابتة شهرياً:',
      idea_unit_econ_net_contribution: 'صافي المساهمة لكل طلب',
      idea_unit_econ_breakeven_orders: 'طلبات التعادل الشهرية',
      idea_unit_econ_daily_orders: 'الطلبات اليومية المطلوبة',
      idea_unit_econ_risk_none: 'هيكل هوامش صحي عند المؤشرات الحالية.',
      idea_compare_modal_title: 'مقارنة جولات التقييم (فارق الجولات)',
      idea_compare_modal_subtitle: 'تتبع كيف تطور قرار اللجنة وافتراضاتها وخطة التحقق بعد دفاعك ومدخلاتك.',
      idea_compare_round_a: 'الجولة الأساسية:',
      idea_compare_round_b: 'جولة المقارنة:',
      idea_compare_verdict: 'القرار التنفيذي',
      idea_compare_assumptions: 'تطور الافتراضات',
      idea_compare_question: 'السؤال المحوري للحسم',
      idea_compare_validation: 'تدرج خطة التحقق',
      idea_compare_founder_defense: 'دفاع وحجج المؤسس',
      idea_compare_no_rounds: 'يلزم توفر جولتي تقييم على الأقل للمقارنة.',
      idea_round_prefix: 'الجولة',
      idea_round_initial: 'الجولة 1 (التقييم الأولي)',
      idea_round_viewing: 'يتم الآن عرض نتائج تقييم الجولة',
      idea_round_founder_defense: 'دفوع ومدخلات المؤسس للجولة:',
      idea_followup_title: 'جولات المتابعة (3 لكل فكرة)',
      idea_followup_remaining: 'الجولات المتبقية:',
      idea_btn_defend: 'دافع عن الفكرة',
      idea_btn_pivot: 'اقترح Pivot',
      idea_btn_val_plan: 'خطة تحقق صغيرة',
      idea_btn_vote: 'تصويت اللجنة',
      idea_btn_compare: 'قارن بمنافس',
      idea_btn_mvp: 'خطة MVP لـ 7 أيام',
      idea_followup_prompt_placeholder: 'اكتب حجتك الدفاعية، أو اتجاه الـ Pivot المقترح، أو سؤالك المحدد للجنة...',
      idea_btn_start_followup: 'بدء جولة المتابعة',
      idea_followup_modal_title: 'جولة المتابعة ودفاع الفكرة',
      idea_followup_modal_subtitle: 'قدّم حججاً وأدلة وزوايا استراتيجية جديدة لتفنيد شكوك وتحديات أعضاء اللجنة.',
      idea_followup_action_label: 'هدف الجولة ونوع التحرك',
      idea_followup_chips_label: 'زوايا الدفاع والميزات الاستراتيجية (انقر للتحديد)',
      idea_chip_pricing: '💰 تسعير وميزة تكلفة أقل',
      idea_chip_niche: '🎯 استهداف شريحة نيتش محددة',
      idea_chip_distribution: '🤝 شراكات وقنوات توزيع جاهزة',
      idea_chip_guarantee: '🛡️ ضمان استرجاع أو تجربة مجانية',
      idea_chip_speed: '⚡ تبسيط الحل وحذف التعقيد',
      idea_chip_team: '👥 فريق متخصص وخبرة ميدانية',
      idea_chip_offline: '📍 موقع فعلي وتواجد محلي قوي',
      idea_chip_inventory: '📦 نموذج أولي جاهز أو بضاعة متوفرة',
      idea_followup_target_critic_label: 'الناقد المستهدف بالرد الأساسي',
      idea_critic_opt_all: 'كامل أعضاء اللجنة',
      idea_critic_opt_customer: 'العميل البارد (تردد الشراء وتكلفة التبديل)',
      idea_critic_opt_auditor: 'المدقق المالي الصارم (الإيرادات والجدوى)',
      idea_critic_opt_competitor: 'المنافس الشرس (التميز وحواجز الدخول)',
      idea_critic_opt_ops: 'خبير العمليات والجدوى التشغيلية',
      idea_followup_review_mode_label: 'أسلوب مراجعة اللجنة',
      idea_mode_opt_balanced: 'بناء وعملي موجه للحلول',
      idea_mode_opt_strict: 'نقد صارم واختبار ضغط متشدد',
      idea_followup_defense_label: 'حججك الدفاعية والبيانات والتعديلات المقترحة',
      idea_followup_evidence_label: 'أدلة إضافية، أرقام، أو اسم منافس محدد (اختياري)',
      idea_followup_evidence_placeholder: 'مثال: جمع 150 طلباً مسبقاً، رابط بديل في السوق، اتفاق توريد محلي...',
      idea_followup_submit_btn: 'إرسال وبدء الجولة التفاعلية',
      idea_followup_err_empty: 'يرجى كتابة حجتك الدفاعية أو تفاصيل خطتك قبل الإرسال.',
      idea_feedback_title: 'هل كان هذا التقييم مفيداً لك؟',
      idea_btn_feedback_submit: 'إرسال التقييم',
      idea_disclaimer: 'إخلاء مسؤولية: هذا التقرير أداة استرشادية للمساعدة في القرار وليس استشارة قانونية أو مالية معتمدة.',
      idea_verdict_build: 'انطلق في البناء (ضوء أخضر)',
      idea_verdict_validate: 'تحقق أولاً (ضوء أصفر)',
      idea_verdict_pivot: 'إعادة توجيه (Pivot)',
      idea_verdict_do_not_build: 'لا تبنِ الآن (ضوء أحمر)',
      idea_role_customer_advocate: 'محامي العميل البارد',
      idea_role_financial_auditor: 'المدقق المالي',
      idea_role_growth_marketer: 'خبير التوزيع والنمو',
      idea_role_direct_competitor: 'المنافس الشرس',
      idea_role_technical_architect: 'المهندس التقني',
      idea_role_execution_risk_officer: 'مسؤول مخاطر التنفيذ',
      idea_role_monetization_strategist: 'استراتيجي التسعير والربح',
      idea_role_simplicity_editor: 'محرر البساطة ونطاق MVP',
      idea_tb_cat_assumption: 'فرضية',
      idea_tb_cat_market_fact: 'حقيقة سوقية',
      idea_tb_cat_validation_test: 'اختبار تحقق',
      idea_tb_cat_critical_risk: 'خطر جوهري',
      idea_tb_status_blocked: 'معلق',
      idea_action_resume: 'استكمال',
      idea_action_view: 'عرض التقرير',
      idea_action_delete: 'حذف',
      idea_msg_saved: 'تم حفظ المسودة',
      idea_msg_saving: 'جاري الحفظ...',
      idea_msg_confirm_delete: 'هل أنت متأكد من حذف هذه الفكرة؟',
      idea_msg_confirm_checkbox_req: 'يرجى تأكيد بطاقة الفكرة قبل استدعاء اللجنة.',
      idea_msg_quota_exceeded: 'تم استهلاك رصيد الأفكار الشهري بالكامل (3 أفكار شهرياً).',
      idea_msg_card_saved: 'تم حفظ بطاقة الفكرة.',
      idea_msg_followup_prompt: 'أدخل ملاحظاتك أو حجتك الدفاعية لجولة المتابعة:',
      idea_msg_followup_success: 'تم إكمال جولة المتابعة بنجاح.',
      idea_desc_min_length: 'يجب أن لا يقل وصف الفكرة عن 100 حرف.',
      idea_structure_failed: 'فشل تنظيم بطاقة الفكرة.',
      idea_structure_error: 'حدث خطأ أثناء تنظيم الفكرة.',
      idea_list_error: 'تعذر تحميل الأفكار.',
      idea_convening: 'جارٍ الاستدعاء...',
      idea_convene_failed: 'فشل استدعاء لجنة الأفكار.',
      idea_run_failed: 'فشل تشغيل جلسة التقييم.',
      idea_status_pending: 'بانتظار البدء',
      idea_awaiting_evidence: 'في انتظار فحص الفكرة والأدلة...',
      idea_stage_research: 'جارٍ إجراء البحث السوقي المباشر وجمع الأدلة...',
      idea_stage_parallel: 'أعضاء اللجنة يحللون الفكرة بالتوازي',
      idea_stage_synth: 'رئيس اللجنة يصيغ التقرير النهائي ولوحة الحقيقة...',
      idea_round_1: 'الجولة 1 (التقييم الأولي)',
      idea_round_n: 'الجولة {n}{suffix}',
      idea_round_input: 'مدخلات الجولة:',
      idea_round_latest: 'أحدث جولة تقييم',
      idea_round_archive: 'أرشيف جولة سابقة',
      idea_no_sources: 'لا توجد مصادر خارجية مباشرة.',
      idea_no_critiques: 'لم يتم حفظ تقارير أعضاء اللجنة بعد.',
      idea_critic_rejection: 'سبب الرفض والتردد:',
      idea_critic_switching: 'تكلفة التبديل والانتقال:',
      idea_critic_trigger: 'محفز التجربة الحقيقي:',
      idea_critic_willingness: 'الاستعداد للدفع:',
      idea_weakest_link: 'أضعف نقطة في المفهوم:',
      idea_deadliest_assumptions: 'أخطر الافتراضات غير المثبتة:',
      idea_hard_questions: 'أسئلة حاسمة تتطلب إثباتاً بالأرقام:',
      idea_complexity_level: 'مستوى التعقيد الهندسي:',
      idea_mvp_scope: 'نطاق MVP القابل للإطلاق خلال 7 أيام:',
      idea_cut_deferred: 'ما يجب حذفه/تأجيله خارج النسخة الأولى:',
      idea_market_saturation: 'تشبع السوق:',
      idea_direct_competitors: 'المنافسون والبدائل المباشرة في السوق:',
      idea_indirect_alternatives: 'البدائل غير المباشرة وطرق العمل الحالية:',
      idea_root_cause: 'السبب الجذري الأول الذي قد يقضي على المشروع:',
      idea_failure_conditions: 'شروط وسيناريوهات الفشل:',
      idea_early_warnings: 'مؤشرات الخطر المبكرة:',
      idea_wedge_angle: 'زاوية الدخول الحادة (Unique Wedge):',
      idea_defensibility: 'القابلية للدفاع ضد المنافسين:',
      idea_copy_ease: 'سهولة وسرعة النسخ:',
      idea_first_value_60s: 'أول لحظة قيمة في الـ 60 ثانية الأولى:',
      idea_friction_point: 'أكبر نقطة احتكاك أو تسرب للمستخدمين:',
      idea_core_strength: 'الشرارة الحقيقية ونقطة القوة الجوهرية:',
      idea_proceed_reason: 'أقوى سبب للاستمرار وعدم التراجع:',
      idea_indispensable_asset: 'الأصل الذي لا يمكن التنازل عنه:',
      idea_critic_verdict_full: 'البيان النهائي للناقد:',
      idea_round_analyzed: 'اكتمل التحليل',
      idea_round_review: 'قيد المراجعة',
      idea_round_prior: 'الجولة السابقة',
      idea_first_moment: 'لحظة القيمة الأولى: {v}',
      idea_unit_orders_mo: 'طلب/شهر',
      idea_unit_orders_day: 'طلب/يوم',
      idea_econ_critical: 'تحذير حرج: صافي المساهمة سالب! تخسر أموالاً في كل طلب قبل حساب المصاريف الثابتة.',
      idea_econ_hurdle: 'مخاطرة حجم مرتفعة: تحتاج لأكثر من {n} طلب يومياً لتغطية النفقات الثابتة.',
      idea_round_initial_short: 'التقييم الأولي',
      idea_plan_duration: 'المدة المقترحة:',
      idea_plan_metric: 'معيار النجاح:',
      idea_plan_stop: 'شرط التوقف:',
      idea_truth_empty: 'لا توجد عناصر مسجلة في لوحة الحقيقة.',
      idea_followup_exhausted: 'لقد استنفدت جميع جولات المتابعة المتاحة لهذه الفكرة (3 جولات).',
      idea_followup_launching: 'جارٍ الإطلاق...',
      idea_followup_failed: 'فشل تنفيذ جولة المتابعة.',
      idea_followup_error: 'حدث خطأ أثناء تنفيذ جولة المتابعة.',
      idea_export_failed: 'فشل تصدير التقرير.',
      idea_followup_defend: 'دفاع',
      idea_followup_pivot: 'تغيير مسار',
      idea_followup_validation: 'خطة فحص',
      idea_followup_vote: 'تصويت',
      idea_followup_compare: 'مقارنة',
      idea_followup_mvp: 'خطة MVP',
      idea_status_draft: 'مسودة',
      idea_status_structuring: 'قيد الصياغة',
      idea_status_awaiting_conf: 'بانتظار التأكيد',
      idea_status_queued: 'قيد الانتظار',
      idea_status_running: 'جارٍ التحليل',
      idea_status_completed: 'مكتمل',
      idea_status_partial: 'مكتمل جزئياً',
      idea_status_failed: 'فشل'
    }
  };

  // Helper: Get JWT token from storage
  window.__zainbotSettingsState = () => ({ translations: translations[currentLanguage], bot: currentBot });

  function getToken() {
    return localStorage.getItem('token');
  }

  // Helper: API calls with JWT auth header
  async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return null;
    }

    return response.json();
  }

  // D04: request helper for lifecycle flows. Uses the D02 request core when
  // present (15s read timeout, 401-only session callback, no auto-retry);
  // falls back to apiFetch otherwise. Login redirect happens ONLY via the
  // 401 callback or a missing token — never on network/HTTP failures.
  function dashboardRequest(url, options, policy) {
    const core = window.ZainBotRequest;
    if (core && typeof core.requestJson === 'function') {
      return core.requestJson(url, options || {}, {
        operation: (policy && policy.operation) || 'read',
        timeoutMs: policy && policy.timeoutMs,
        onUnauthorized: () => { window.location.href = '/login'; },
      });
    }
    return apiFetch(url, options);
  }

  function dashboardT(key, params) {
    const adapter = window.ZainBotDashboardI18n;
    if (adapter && typeof adapter.t === 'function') return adapter.t(key, params);
    const table = translations[currentLanguage] || translations.en;
    let template = (table && table[key]) || translations.en[key] || key;
    if (params) {
      template = String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (m, name) => (
        params[name] !== undefined && params[name] !== null ? String(params[name]) : m
      ));
    }
    return template;
  }

  function notifyDashboard(level, key, params) {
    if (window.ZainBotFeedback && typeof window.ZainBotFeedback.notify === 'function') {
      window.ZainBotFeedback.notify({ level, key, params }, dashboardT);
    }
  }

  // Language translation handler
  // C02 review Low-1: every render below uses the NORMALIZED value, never the raw param.
  function applyLanguage(lang) {
    currentLanguage = window.ZainbotLangPersistence.writeStoredLanguage(lang, 'ar');

    const dir = currentLanguage === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', currentLanguage);
    langToggleBtn.textContent = currentLanguage === 'ar' ? 'EN' : 'AR';

    // Translate all elements with data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[currentLanguage] && translations[currentLanguage][key]) {
        el.innerHTML = translations[currentLanguage][key];
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (translations[currentLanguage] && translations[currentLanguage][key]) element.placeholder = translations[currentLanguage][key];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      const key = element.getAttribute('data-i18n-aria');
      if (translations[currentLanguage] && translations[currentLanguage][key]) element.setAttribute('aria-label', translations[currentLanguage][key]);
    });

    // Re-render tabular contents or messages since they are translated dynamically
    renderFaqs();
    if (typeof renderGeneralInstructions === 'function') renderGeneralInstructions();
    renderOrders();
    renderBookings();
    renderApiKeys();
    renderWebhookLogs();
    renderAdminKeys();
    renderAccountMenu();
    paintSelectedPlan();
    if (currentUser) refreshSubscriptionMeta();
    if (channelStatusSnapshot && String(channelStatusSnapshot.botId) === String(currentBot?._id)) renderChannelStatuses(channelStatusSnapshot.states);
    if (window.__zainbotRenderSettingsSummary) window.__zainbotRenderSettingsSummary();
    renderOnboarding();
    renderCatalogStatus();
    // Registry renderers (agents, recipients, admin table, inbox list) re-render
    // from in-memory state only: no fetch, no selectChat history load, and
    // filters/pagination/selection/drafts survive the switch.
    window.ZainBotDashboardI18n.refreshLanguageRenderers();
  }

  // Render registry wiring. Function declarations hoist, so these resolve to the
  // live definitions below — notably the paginated/DOM-based renderAdminUsers,
  // NOT the superseded legacy table renderer. Re-registering an id replaces it,
  // so switches never accumulate callbacks.
  window.ZainBotDashboardI18n.registerLanguageRenderer('agents', renderAgents);
  window.ZainBotDashboardI18n.registerLanguageRenderer('notification-recipients', renderNotificationRecipients);
  window.ZainBotDashboardI18n.registerLanguageRenderer('admin-users', renderAdminUsers);
  window.ZainBotDashboardI18n.registerLanguageRenderer('chat-list', renderChatList);
  // D03: feedback primitive re-renders its tracked states/notifications from
  // the C03 adapter on language switch — no refetch, no state loss. Single
  // line so line-sliced wiring harnesses can execute it standalone.
  window.ZainBotDashboardI18n.registerLanguageRenderer('feedback', function () { if (window.ZainBotFeedback) window.ZainBotFeedback.refreshLanguage(window.ZainBotDashboardI18n.t); });

  // Tab switching handler
  function switchTab(tabId, opts) {
    activeTab = tabId;

    // Update active tab class in menu
    document.querySelectorAll('.menu-item').forEach(item => {
      const isActive = item.getAttribute('data-target') === tabId;
      item.classList.toggle('active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });

    // Display appropriate content area
    document.querySelectorAll('.db-page').forEach(page => {
      page.classList.toggle('active', page.getAttribute('id') === tabId);
    });

    // E04: user navigation moves focus to the page heading. Background
    // refresh call sites omit the flag, so data reloads never steal focus.
    if (opts && opts.focusHeading) focusPageHeading(tabId);

    // Load data specific to this page
    if (tabId === 'page-overview') {
      loadOverviewData();
    } else if (tabId === 'page-agents') {
      loadAgents();
    } else if (tabId === 'page-idea-council') {
      enterCouncilTab();
    } else if (tabId === 'page-inbox') {
      loadInboxData();
    } else if (tabId === 'page-training') {
      loadTrainingData();
    } else if (tabId === 'page-channels') {
      loadChannelsData();
    } else if (tabId === 'page-orders') {
      loadOrdersData();
    } else if (tabId === 'page-settings') {
      enterSettingsTab();
    } else if (tabId === 'page-admin') {
      loadAdminUsers();
      loadAdminKeys();
    }
  }

  // E04: move focus to the page heading on USER navigation only. Pages
  // without a heading (page-inbox today — C-track copy owns a future
  // heading) fall back to the page section itself.
  function focusPageHeading(tabId) {
    const page = document.getElementById(tabId);
    if (!page) return;
    const target = page.querySelector('h1, h2') || page;
    try {
      if (typeof target.hasAttribute === 'function' && !target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
      }
      if (typeof target.focus === 'function') target.focus();
    } catch (err) { /* focus is best-effort */ }
  }

  // Initialize Language Toggle Event
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const nextLang = currentLanguage === 'en' ? 'ar' : 'en';
      applyLanguage(nextLang);
    });
  }

  // Cross-tab sync: adopt language changes from other tabs. The resolver never
  // writes, and echoes carry an unchanged value so receiving tabs resolve null.
  window.addEventListener('storage', (event) => {
    const next = window.ZainbotLangPersistence.resolveExternalLanguage(event, currentLanguage, 'ar');
    if (next) applyLanguage(next);
  });

  function setMobileMenuOpen(open, restoreToggleFocus = false) {
    if (!sidebar || !menuMobileToggle) return;

    const shouldOpen = Boolean(open) && mobileSidebarMedia.matches;
    setDrawerVisual(shouldOpen);

    // E04: the open drawer traps focus and isolates the background via the
    // shared lifecycle (E01); close releases both. All close paths funnel
    // through here, so no stuck scrim, scroll-lock, or inert remains.
    try {
      const a11y = window.ZainBotA11y;
      if (shouldOpen) {
        if (a11y && typeof a11y.openDialog === 'function') {
          a11y.openDialog(sidebar, {
            opener: document.activeElement && document.activeElement.nodeType === 1
              ? document.activeElement
              : undefined,
            background: document.querySelector('.db-main'),
            onClose: () => setDrawerVisual(false),
          });
        }
      } else if (a11y && typeof a11y.closeDialog === 'function') {
        a11y.closeDialog(sidebar);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!shouldOpen) setDrawerVisual(false);
    }

    if (restoreToggleFocus) menuMobileToggle.focus();
  }

  // E04: drawer visuals only (class/aria/scroll-lock). Kept separate from
  // the lifecycle above so onClose and every close path converge here and
  // the helper-missing fallback behaves identically.
  function setDrawerVisual(shouldOpen) {
    if (!sidebar || !menuMobileToggle) return;
    sidebar.classList.toggle('mobile-open', shouldOpen);
    document.body.classList.toggle('sidebar-open', shouldOpen);
    menuMobileToggle.setAttribute('aria-expanded', String(shouldOpen));

    if (mobileSidebarMedia.matches) {
      sidebar.setAttribute('aria-hidden', String(!shouldOpen));
    } else {
      sidebar.removeAttribute('aria-hidden');
    }

    if (sidebarScrim) {
      sidebarScrim.classList.toggle('active', shouldOpen);
      sidebarScrim.setAttribute('aria-hidden', String(!shouldOpen));
    }
  }

  // Sidebar navigation click
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      switchTab(target);
      setMobileMenuOpen(false);
      // E04 fix round 1 (coordinator decision): selection-commit ends on
      // the page heading — asserted AFTER the close restores the opener
      // (single heading focus; no double move). Cancel/Escape/scrim paths
      // keep standard restore-to-opener and never call focusPageHeading.
      focusPageHeading(target);
    });
  });

  // Mobile menu toggle
  if (menuMobileToggle && sidebar) {
    menuMobileToggle.addEventListener('click', () => {
      setMobileMenuOpen(!sidebar.classList.contains('mobile-open'));
    });
  }

  if (sidebarScrim) {
    sidebarScrim.addEventListener('click', () => {
      setMobileMenuOpen(false, true);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar?.classList.contains('mobile-open')) {
      setMobileMenuOpen(false, true);
    }
  });

  const handleSidebarBreakpointChange = () => setMobileMenuOpen(false);
  if (typeof mobileSidebarMedia.addEventListener === 'function') {
    mobileSidebarMedia.addEventListener('change', handleSidebarBreakpointChange);
  } else {
    mobileSidebarMedia.addListener(handleSidebarBreakpointChange);
  }
  setMobileMenuOpen(false);

  // User Auth and Load Details
  // D04a: bootstrap. Login redirect happens ONLY for a missing token or a
  // 401 (via the request core's session callback). Network/500 failures show
  // a recoverable error with manual retry — the session is kept.
  let bootstrapBusy = false;
  function showBootstrapError() {
    document.getElementById('bootstrapError')?.removeAttribute('hidden');
  }
  function hideBootstrapError() {
    document.getElementById('bootstrapError')?.setAttribute('hidden', '');
  }
  async function checkAuthAndLoad() {
    applyLanguage(currentLanguage);
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }
    if (bootstrapBusy) return;
    bootstrapBusy = true;
    hideBootstrapError();

    try {
      // Fetch user profile info
      const res = await dashboardRequest('/api/users/profile');
      if (res && res.success) {
        currentUser = res.data;
        
        // Show username
        headerUsername.textContent = currentUser.username;
        headerUserAvatar.textContent = currentUser.username.slice(0, 1).toUpperCase();
        renderAccountMenu();
        renderImpersonationBanner();

        // Show AI failover panel for superadmins
        if (currentUser.role === 'superadmin') {
          const adminMenu = document.getElementById('menu-admin');
          if (adminMenu) {
            adminMenu.style.display = 'flex';
            // E04: hidden admin stays out of the tab order (display:none);
            // never leave a stray tabindex behind when revealing it.
            adminMenu.removeAttribute('tabindex');
            adminMenu.style.borderTop = '1px solid var(--glass-border)';
            adminMenu.style.marginTop = '12px';
            adminMenu.style.paddingTop = '16px';
          }
        }

        // Fetch bots list to pick active bot
        await loadBots();
      } else {
        showBootstrapError();
      }
    } catch (e) {
      console.error(e);
      // A 401 already redirected via the session callback; anything else is
      // recoverable with a manual retry.
      if (!e || e.status !== 401) showBootstrapError();
    } finally {
      bootstrapBusy = false;
    }
  }
  document.getElementById('bootstrapRetryBtn')?.addEventListener('click', () => checkAuthAndLoad());

  async function loadBots() {
    try {
      const res = await apiFetch('/api/bots');
      if (!res?.success && !Array.isArray(res)) throw new Error('Bots unavailable');
      const bots = (res && res.success) ? res.data : (Array.isArray(res) ? res : []);
      workspaceBots = bots;
      const preferredBotId = localStorage.getItem('zainbot_active_bot_id');
      currentBot = bots.find((bot) => String(bot._id) === preferredBotId) || bots[0] || null;
      if (currentBot) {
        const loadedBotId = String(currentBot._id);
        // Inject data-bot-id inside chat snippet
        const widgetSnippetCode = document.getElementById('widgetSnippetCode');
        if (widgetSnippetCode) {
          widgetSnippetCode.textContent = `<script src="${window.location.origin}/widget.js" data-bot-id="${currentBot._id}"></script>`;
        }
        
        // Preload direct chat page link
        chatPageLink(loadedBotId).then(url => {
          if (url && String(currentBot?._id) === loadedBotId) {
            const directCardLink = document.getElementById('btnDirectWebChat');
            if (directCardLink) directCardLink.href = url;
            const openBtn = document.getElementById('openChatPageBtn');
            if (openBtn) openBtn.href = url;
            const liveLinkEl = document.getElementById('chatPageLiveLink');
            if (liveLinkEl) { liveLinkEl.href = url; liveLinkEl.textContent = url; }
          }
        }).catch(err => console.warn('Could not preload chat page link:', err));

        // Load the initial overview only. Refreshing the agent page must not
        // switch the user away from the page they chose.
        if (activeTab === 'page-overview') switchTab('page-overview');
      } else {
        console.warn('No bots found for this user.');
        if (activeTab === 'page-overview') loadOnboarding();
      }
    } catch (err) {
      console.error('Error loading bots:', err);
      onboardingSnapshot = { status: 'error' };
      renderOnboarding();
    }
  }

  // 1. OVERVIEW DATA LOADER
  const chatLinks = new Map();
  function chatPageLink(botId) {
    const id = String(botId);
    if (!chatLinks.has(id)) {
      const request = apiFetch(`/api/chat-page/bot/${encodeURIComponent(id)}`).then(res => {
        if (!res?.success || !res.linkId) throw new Error('Chat page unavailable');
        return `${window.location.origin}/chat/${encodeURIComponent(res.linkId)}`;
      }).catch(err => { chatLinks.delete(id); throw err; });
      chatLinks.set(id, request);
    }
    return chatLinks.get(id);
  }

  let onboardingSnapshot = null;
  let onboardingRun = 0;
  const guide = document.getElementById('onboardingGuide');
  async function loadOnboardingFaqs(botId) {
    const rules = [];
    let page = 1;
    do {
      const res = await apiFetch(`/api/rules?botId=${encodeURIComponent(botId)}&type=qa&limit=100&page=${page}`);
      if (!res?.success || !Array.isArray(res.data)) throw new Error('FAQ progress unavailable');
      rules.push(...res.data);
      if (window.ZainBotOnboarding.progress(null, rules, []).trained || page >= (res.totalPages || 1)) break;
      page++;
    } while (true);
    return rules;
  }
  function renderOnboarding() {
    if (!guide) return;
    const t = translations[currentLanguage] || translations.en;
    const snapshot = onboardingSnapshot;
    document.getElementById('onboardingProgress').textContent = snapshot?.status === 'ready'
      ? t.onboard_progress.replace('{count}', Object.values(snapshot.steps).filter(Boolean).length)
      : snapshot?.status === 'empty' ? t.onboard_no_bot : snapshot?.status === 'error' ? t.onboard_unavailable : t.onboard_checking;
    const feedback = document.getElementById('onboardingFeedback');
    feedback.hidden = snapshot?.status === 'ready' || !snapshot;
    feedback.textContent = snapshot?.status === 'empty' ? t.onboard_no_bot : snapshot?.status === 'error' ? t.onboard_unavailable : '';
    const personalize = document.getElementById('onboardPersonalize');
    personalize.textContent = snapshot?.status === 'empty' ? t.onboard_create : t.onboard_personalize_action;
    document.getElementById('onboardTrain').disabled = !currentBot;
    document.getElementById('onboardTest').disabled = !currentBot;
    for (const key of ['personalized', 'trained', 'tested']) {
      const step = guide.querySelector(`[data-step="${key}"]`);
      const done = snapshot?.status === 'ready' && snapshot.steps[key];
      step.dataset.state = done ? 'done' : 'pending';
      step.querySelector('.onboarding-status').textContent = snapshot?.status === 'ready' ? (done ? t.onboard_done : t.onboard_todo) : '';
    }
  }

  async function loadOnboarding() {
    if (!guide) return;
    const run = ++onboardingRun;
    const botId = currentBot?._id;
    onboardingSnapshot = botId ? null : { status: 'empty' };
    renderOnboarding();
    if (!botId) return;
    try {
      const [botRes, faqRes] = await Promise.all([
        apiFetch(`/api/bots/${encodeURIComponent(botId)}`),
        loadOnboardingFaqs(botId)
      ]);
      if (!botRes?.success) throw new Error('Progress unavailable');
      const rules = faqRes;
      // The conversation feed is needed only after a saved FAQ exists.
      const trained = window.ZainBotOnboarding.progress(botRes.data, rules, []).trained;
      const convRes = trained ? await apiFetch(`/api/messages/conversations?botId=${encodeURIComponent(botId)}`) : null;
      if (trained && (!convRes?.success || !Array.isArray(convRes.data))) throw new Error('Conversation progress unavailable');
      if (run !== onboardingRun || String(currentBot?._id) !== String(botId)) return;
      const steps = window.ZainBotOnboarding.progress(botRes.data, rules, convRes?.data || []);
      onboardingSnapshot = { status: 'ready', steps, botId };
      // Once completed, keep the guide available as a compact summary on return visits.
      if (Object.values(steps).every(Boolean) && guide.dataset.completedBot !== String(botId)) {
        guide.open = false;
        guide.dataset.completedBot = String(botId);
      }
      renderOnboarding();
    } catch (err) {
      if (run !== onboardingRun || String(currentBot?._id) !== String(botId)) return;
      onboardingSnapshot = { status: 'error' };
      renderOnboarding();
      console.warn('Could not load onboarding progress:', err);
    }
  }

  document.getElementById('onboardPersonalize')?.addEventListener('click', () => {
    const bot = currentBot;
    switchTab('page-agents', { focusHeading: true });
    openAgentModal(bot);
  });
  document.getElementById('onboardTrain')?.addEventListener('click', () => {
    switchTab('page-training', { focusHeading: true });
    document.getElementById('addFaqBtn')?.click();
  });
  document.getElementById('onboardTest')?.addEventListener('click', async () => {
    if (!currentBot) return;
    const preview = window.open('', '_blank');
    if (preview) preview.opener = null;
    try {
      const url = await chatPageLink(currentBot._id);
      if (preview) preview.location.href = url;
      else window.location.href = url;
    } catch (err) {
      preview?.close();
      const feedback = document.getElementById('onboardingFeedback');
      feedback.hidden = false;
      feedback.textContent = (translations[currentLanguage] || translations.en).onboard_chat_unavailable;
    }
  });

  // D04b: overview. A per-call generation plus a bot-id guard drops stale
  // replies (slow bot A never paints over selected bot B). Failed stats are
  // never written — previous values (or the initial "—") stay, with an error
  // announcement instead of fake zero stats.
  let overviewRun = 0;
  async function loadOverviewData() {
    loadOnboarding();
    if (!currentBot) return;
    const run = ++overviewRun;
    const botId = String(currentBot._id);

    try {
      // Fetch stats
      const res = await dashboardRequest(`/api/analytics/summary?botId=${currentBot._id}`);
      if (run !== overviewRun || String(currentBot?._id) !== botId) return;
      if (!(res && res.success)) throw new Error('Overview stats unavailable');
      const stats = res.data;
      document.getElementById('statConversations').textContent = stats.conversationsCount || 0;
      document.getElementById('statMessages').textContent = stats.messagesCount || 0;
      document.getElementById('statTrainingRules').textContent = stats.activeRules || 0;
      document.getElementById('overviewOrders').textContent = stats.chatOrdersCount || 0;

      await refreshChannelStatuses(currentBot);
      if (run !== overviewRun || String(currentBot?._id) !== botId) return;
      document.getElementById('overviewActiveBot').textContent = currentBot.name || '—';
      document.getElementById('overviewAutoReply').textContent = (translations[currentLanguage] || translations.en)[currentBot.autoReplyEnabled === false ? 'status_disabled' : 'status_enabled'];

      // Load billing data
      document.getElementById('overviewPlanName').textContent = currentUser.subscriptionTier ? currentUser.subscriptionTier.toUpperCase() : 'FREE';
      
      const quotaMax = quotaLimitForTier(currentUser.subscriptionTier);

      const used = currentUser.monthlyMessagesUsed || 0;
      const pct = Math.min(100, Math.round((used / quotaMax) * 100));

      document.getElementById('billingQuotaText').textContent = currentUser.subscriptionTier === 'unlimited' ? `${used} / ${(translations[currentLanguage] || translations.en).quota_unlimited}` : `${used} / ${quotaMax}`;
      document.getElementById('billingQuotaFill').style.width = pct + '%';
      renderAccountMenu();
    } catch (e) {
      console.error(e);
      if (run !== overviewRun || String(currentBot?._id) !== botId) return;
      notifyDashboard('error', 'overview_stats_failed');
    }
  }

  // 2. OMNICHANNEL INBOX LOADER
  // D04c: generation-guarded chat reads (a slow bot-A reply never paints over
  // selected bot B). A failed response never renders as empty — it renders a
  // persistent error with a READ-only retry. With no bot, selection resets
  // and the composer disables instead of stranding a dead draft.
  let inboxRun = 0;
  function setComposerEnabled(on) {
    const input = document.getElementById('chatReplyInput');
    const send = document.getElementById('chatSendBtn');
    const toggle = document.getElementById('autoReplyToggle');
    if (input) input.disabled = !on;
    if (send) send.disabled = !on;
    if (toggle) toggle.disabled = !on;
  }
  function resetInboxForNoBot() {
    selectedConversationId = null;
    conversations = [];
    const chatListContainer = document.getElementById('chatListContainer');
    if (chatListContainer && window.ZainBotFeedback) {
      window.ZainBotFeedback.renderState(chatListContainer, { phase: 'no-bot', key: 'inbox_no_bot' }, { t: dashboardT });
    }
    const msgContainer = document.getElementById('chatMessagesContainer');
    if (msgContainer) msgContainer.innerHTML = '';
    const t = translations[currentLanguage] || translations.en;
    const nameEl = document.getElementById('chatActiveUser');
    if (nameEl) nameEl.textContent = t.inbox_select_chat;
    setComposerEnabled(false);
  }
  async function loadInboxData() {
    const run = ++inboxRun;
    const t = translations[currentLanguage] || translations.en;
    const chatListContainer = document.getElementById('chatListContainer');
    if (!currentBot) {
      resetInboxForNoBot();
      return;
    }
    const botId = String(currentBot._id);
    if (window.ZainBotFeedback) {
      window.ZainBotFeedback.renderState(chatListContainer, { phase: 'loading', key: 'inbox_loading' }, { t: dashboardT });
    } else {
      chatListContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">${t.inbox_loading}</div>`;
    }

    try {
      const res = await dashboardRequest(`/api/messages/conversations?botId=${currentBot._id}`);
      if (run !== inboxRun || String(currentBot?._id) !== botId) return;
      if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
        conversations = res.data;
        renderChatList();
      } else if (res && res.success) {
        conversations = [];
        selectedConversationId = null;
        setComposerEnabled(false);
        if (window.ZainBotFeedback) {
          window.ZainBotFeedback.renderState(chatListContainer, { phase: 'empty', key: 'inbox_empty' }, { t: dashboardT });
        } else {
          chatListContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">${t.inbox_empty}</div>`;
        }
      } else {
        throw new Error('Inbox unavailable');
      }
    } catch (e) {
      console.error(e);
      if (run !== inboxRun || String(currentBot?._id) !== botId) return;
      if (window.ZainBotFeedback) {
        window.ZainBotFeedback.renderState(chatListContainer, { phase: 'error', key: 'inbox_load_error' }, { t: dashboardT, onRetry: () => loadInboxData() });
      } else {
        chatListContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--red);">${t.inbox_load_error}</div>`;
      }
    }
  }

  function renderChatList() {
    const chatListContainer = document.getElementById('chatListContainer');
    chatListContainer.innerHTML = '';
    const t = translations[currentLanguage] || translations.en;

    conversations.forEach(chat => {
      const item = document.createElement('div');
      item.className = `chat-item ${selectedConversationId === chat._id ? 'active' : ''}`;
      
      const lastMsgObj = chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1] : null;
      const lastMsg = lastMsgObj ? (lastMsgObj.content || lastMsgObj.text || lastMsgObj.message || '') : '';
      let channelIcon = 'fa-globe';
      let channelColor = 'var(--cyan)';
      
      if (chat.channel === 'whatsapp') { channelIcon = 'fa-brands fa-whatsapp'; channelColor = 'var(--green)'; }
      else if (chat.channel === 'instagram') { channelIcon = 'fa-brands fa-instagram'; channelColor = 'var(--purple-light)'; }
      else if (chat.channel === 'facebook') { channelIcon = 'fa-brands fa-facebook-messenger'; channelColor = 'var(--blue)'; }
      else if (chat.channel === 'telegram') { channelIcon = 'fa-brands fa-telegram'; channelColor = 'var(--blue)'; }

      const categoryBadge = chat.category 
        ? `<span class="badge" style="font-size:10px; margin-inline-start:6px; background:rgba(6,182,212,0.15); color:var(--cyan); border:1px solid rgba(6,182,212,0.3); padding:2px 6px;">${escapeHtml(chat.category)}</span>`
        : '';

      item.innerHTML = `
        <div class="chat-item-avatar">
          ${(chat.username || t.inbox_default_name).slice(0, 1).toUpperCase()}
          <span class="chat-channel-badge" style="background:${channelColor};"><i class="${channelIcon}"></i></span>
        </div>
        <div class="chat-item-details" style="flex:1; min-width:0;">
          <div class="chat-item-name" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(chat.username || t.inbox_default_name)}</span>
            ${categoryBadge}
          </div>
          <div class="chat-item-preview">${escapeHtml(lastMsg)}</div>
        </div>
      `;

      item.addEventListener('click', () => {
        selectChat(chat);
      });

      chatListContainer.appendChild(item);
    });
  }

  async function selectChat(chat) {
    selectedConversationId = chat._id;
    renderChatList(); // refresh active state

    const t = translations[currentLanguage] || translations.en;
    document.getElementById('chatActiveUser').removeAttribute('data-i18n');
    document.getElementById('chatActiveChannel').removeAttribute('data-i18n');
    document.getElementById('chatActiveUser').textContent = chat.username || t.inbox_default_name;
    document.getElementById('chatActiveChannel').textContent = chat.channel ? chat.channel.toUpperCase() : t.inbox_default_channel;

    // Enable inputs
    document.getElementById('chatReplyInput').removeAttribute('disabled');
    document.getElementById('chatSendBtn').removeAttribute('disabled');
    const autoReplyToggle = document.getElementById('autoReplyToggle');
    autoReplyToggle.removeAttribute('disabled');
    autoReplyToggle.checked = chat.autoReply !== false; // default true

    // Render messages
    const msgContainer = document.getElementById('chatMessagesContainer');
    msgContainer.innerHTML = '';

    (chat.messages || []).forEach(msg => {
      const isUser = msg.role === 'user' || msg.sender === 'user';
      const textContent = msg.content || msg.text || msg.message || '';

      const bubbleRow = document.createElement('div');
      bubbleRow.style.display = 'flex';
      bubbleRow.style.justifyContent = isUser ? 'flex-end' : 'flex-start';
      bubbleRow.style.marginBottom = '12px';

      const bubble = document.createElement('div');
      bubble.style.padding = '10px 16px';
      bubble.style.borderRadius = isUser ? '12px 12px 0 12px' : '12px 12px 12px 0';
      bubble.style.background = isUser ? 'var(--gradient)' : 'rgba(255,255,255,0.04)';
      bubble.style.border = isUser ? 'none' : '1px solid var(--glass-border)';
      bubble.style.maxWidth = '70%';
      bubble.style.fontSize = '14px';
      bubble.textContent = textContent;

      bubbleRow.appendChild(bubble);
      msgContainer.appendChild(bubbleRow);
    });

    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  // Handle take-over manual reply
  // D04d: single-flight via runExclusive (Enter+click = ONE POST) with a
  // bot/chat/text snapshot taken at send time. A delayed response never
  // clears a NEW draft and never bubbles into another conversation.
  // delivered:false is surfaced distinctly; failures notify once with an
  // outcome-unknown-safe message and NEVER auto-resend.
  const chatReplyInput = document.getElementById('chatReplyInput');
  const chatSendBtn = document.getElementById('chatSendBtn');

  function appendReplyBubble(text, showNotSentNote, t) {
    const msgContainer = document.getElementById('chatMessagesContainer');
    const bubbleRow = document.createElement('div');
    bubbleRow.style.display = 'flex';
    bubbleRow.style.justifyContent = 'flex-start';
    bubbleRow.style.marginBottom = '12px';

    const bubble = document.createElement('div');
    bubble.style.padding = '10px 16px';
    bubble.style.borderRadius = '12px 12px 12px 0';
    bubble.style.background = 'rgba(255,255,255,0.04)';
    bubble.style.border = '1px solid var(--glass-border)';
    bubble.style.maxWidth = '70%';
    bubble.style.fontSize = '14px';
    bubble.textContent = text;

    bubbleRow.appendChild(bubble);
    msgContainer.appendChild(bubbleRow);
    if (showNotSentNote) {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:11px; color:var(--text-muted); margin:-6px 0 12px 4px;';
      note.textContent = t.inbox_reply_saved_not_sent;
      msgContainer.appendChild(note);
    }
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  async function postManualReply(snapshot) {
    const t = translations[currentLanguage] || translations.en;
    const res = await dashboardRequest('/api/messages/reply', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: snapshot.chatId,
        content: snapshot.text
      })
    }, { operation: 'mutation' });

    if (!res || !res.success) {
      notifyDashboard('error', 'inbox_reply_failed');
      throw new Error('Manual reply failed');
    }

    // Record into the SNAPSHOT conversation, never the currently selected one.
    const target = conversations.find(c => String(c._id) === snapshot.chatId);
    if (target) {
      target.messages = target.messages || [];
      target.messages.push({ role: 'assistant', content: snapshot.text, manual: true, timestamp: new Date().toISOString() });
    }
    if (String(selectedConversationId) === snapshot.chatId) {
      // Clear only the sent text: a NEW draft typed meanwhile is kept.
      if (chatReplyInput.value.trim() === snapshot.text) chatReplyInput.value = '';
      appendReplyBubble(snapshot.text, res.delivered === false, t);
      renderChatList();
    } else if (target) {
      renderChatList();
    }
  }

  async function sendManualReply() {
    const text = chatReplyInput.value.trim();
    const chatId = selectedConversationId ? String(selectedConversationId) : '';
    const botId = currentBot ? String(currentBot._id) : '';
    if (!text || !chatId || !botId) return;
    const snapshot = { botId, chatId, text };
    const key = `manual-reply:${botId}:${chatId}`;
    const core = window.ZainBotRequest;
    const run = core && typeof core.runExclusive === 'function'
      ? (k, op) => core.runExclusive(k, op)
      : (k, op) => op();
    const feedback = window.ZainBotFeedback;
    const guarded = feedback && typeof feedback.withPending === 'function'
      ? () => feedback.withPending(key, [chatSendBtn], () => postManualReply(snapshot))
      : () => postManualReply(snapshot);
    try {
      await run(key, guarded);
    } catch (e) {
      console.error(e);
    }
  }

  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendManualReply);
  }
  if (chatReplyInput) {
    chatReplyInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendManualReply();
    });
  }

  // Human handoff toggle: turning auto-reply off hands the chat to a human
  const autoReplyToggleEl = document.getElementById('autoReplyToggle');
  if (autoReplyToggleEl) {
    autoReplyToggleEl.addEventListener('change', async () => {
      if (!selectedConversationId) return;
      try {
        await apiFetch(`/api/messages/conversations/${selectedConversationId}/handoff`, {
          method: 'PATCH',
          body: JSON.stringify({ isHumanHandling: !autoReplyToggleEl.checked })
        });
      } catch (e) {
        console.error(e);
      }
    });
  }

  // 3. AI TRAINING CENTER LOADER
  let faqs = [];
  let generalInstructions = [];

  async function loadTrainingData() {
    if (!currentBot) return;

    try {
      // Get bot guidelines
      const res = await dashboardRequest(`/api/bots/${currentBot._id}`);
      if (res && res.success) {
        document.getElementById('botWelcomeMessage').value = res.data.welcomeMessage || '';
        document.getElementById('botCustomPrompt').value = res.data.customInstructions || '';
      }

      // Get FAQs (type qa only)
      const faqRes = await dashboardRequest(`/api/rules?botId=${currentBot._id}&type=qa`);
      if (faqRes && faqRes.success) {
        faqs = faqRes.data;
        renderFaqs();
      } else if (faqRes && Array.isArray(faqRes.rules)) {
        // fallback for bare {rules} shape
        faqs = faqRes.rules;
        renderFaqs();
      }

      // Get general agent instructions (legacy "عامة" rules — bot identity)
      const instrRes = await dashboardRequest(`/api/rules?botId=${currentBot._id}&type=general`);
      if (instrRes && instrRes.success) {
        generalInstructions = instrRes.data;
        renderGeneralInstructions();
      } else if (instrRes && Array.isArray(instrRes.rules)) {
        generalInstructions = instrRes.rules;
        renderGeneralInstructions();
      } else if (instrRes && Array.isArray(instrRes)) {
        generalInstructions = instrRes;
        renderGeneralInstructions();
      }
    } catch (e) {
      console.error(e);
      // Reads keep previously loaded data; the failure announces instead of
      // wiping the lists into a misleading empty state.
      notifyDashboard('error', 'training_load_failed');
    }
  }

  function renderFaqs() {
    const faqListContainer = document.getElementById('faqListContainer');
    if (!faqListContainer) return;
    faqListContainer.innerHTML = '';

    if (faqs.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = 'text-align:center; padding:20px; color:var(--text-muted);';
      emptyState.textContent = (translations[currentLanguage] || translations.en).training_empty_faqs;
      faqListContainer.appendChild(emptyState);
      return;
    }

    faqs.forEach(rule => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.padding = '14px 18px';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';

      card.innerHTML = `
        <div style="flex:1; overflow:hidden;">
          <h4 style="font-size:14px; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Q: ${rule.content?.question || ''}</h4>
          <p style="font-size:12px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">A: ${rule.content?.answer || ''}</p>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary btn-sm" onclick="editFaq('${rule._id}')" style="padding:6px 10px;"><i class="fas fa-edit"></i></button>
          <button class="btn btn-secondary btn-sm" onclick="deleteFaq('${rule._id}')" style="padding:6px 10px; border-color:rgba(239, 68, 68, 0.3); color:var(--red);"><i class="fas fa-trash"></i></button>
        </div>
      `;

      faqListContainer.appendChild(card);
    });
  }

  function renderGeneralInstructions() {
    const container = document.getElementById('instructionListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (generalInstructions.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.style.cssText = 'text-align:center; padding:20px; color:var(--text-muted);';
      emptyState.textContent = (translations[currentLanguage] || translations.en).training_empty_general;
      container.appendChild(emptyState);
      return;
    }

    generalInstructions.forEach(rule => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.padding = '14px 18px';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';
      const raw = typeof rule.content === 'string' ? rule.content : (rule.content?.value || '');
      const preview = raw.length > 120 ? raw.slice(0, 120) + '…' : raw;

      card.innerHTML = `
        <div style="flex:1; overflow:hidden;">
          <p style="font-size:13px; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${preview.replace(/</g,'&lt;')}</p>
        </div>
        <div style="display:flex; gap:10px; flex-shrink:0; margin-inline-start:12px;">
          <button class="btn btn-secondary btn-sm" onclick="editInstruction('${rule._id}')" style="padding:6px 10px;"><i class="fas fa-edit"></i></button>
          <button class="btn btn-secondary btn-sm" onclick="deleteInstruction('${rule._id}')" style="padding:6px 10px; border-color:rgba(239, 68, 68, 0.3); color:var(--red);"><i class="fas fa-trash"></i></button>
        </div>
      `;
      container.appendChild(card);
    });
  }

  // General instruction modal wiring
  const instructionForm = document.getElementById('instructionForm');
  const instructionModal = document.getElementById('instructionModal');

  // E02a: instructionModal runs on the shared focus lifecycle
  // (window.ZainBotA11y, §7.3). The helper owns focus/stack/inert only;
  // `.active` stays the visual switch — removed by onClose and by the
  // explicit fallback in closeInstructionModal. No timers belong here.
  const openInstructionModal = (opener) => {
    if (!instructionModal) return;
    instructionModal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(instructionModal, {
          opener: opener && opener.nodeType === 1 ? opener : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => instructionModal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeInstructionModal = () => {
    if (!instructionModal) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(instructionModal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      instructionModal.classList.remove('active');
    }
  };

  document.getElementById('addInstructionBtn')?.addEventListener('click', (event) => {
    document.getElementById('instructionModalTitle').textContent = (translations[currentLanguage] || translations.en).instruction_modal_add;
    document.getElementById('instructionIdInput').value = '';
    document.getElementById('instructionContentInput').value = '';
    openInstructionModal(event?.currentTarget);
  });

  instructionModal?.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => closeInstructionModal());
  });

  if (instructionForm) {
    instructionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = document.getElementById('instructionContentInput').value.trim();
      if (!content) return;
      // D09: single-flight save (no duplicate instructions); drafts stay in
      // the open modal on every failure path.
      const core = window.ZainBotRequest;
      const run = core && typeof core.runExclusive === 'function'
        ? (k, op) => core.runExclusive(k, op)
        : (k, op) => op();
      const feedback = window.ZainBotFeedback;
      const submitBtn = instructionForm.querySelector('[type="submit"]');
      const guarded = feedback && typeof feedback.withPending === 'function' && submitBtn
        ? () => feedback.withPending('instruction-save', [submitBtn], () => saveInstruction(content))
        : () => saveInstruction(content);
      try {
        await run('instruction-save', guarded);
      } catch (err) {
        console.error(err);
      }

      async function saveInstruction(body) {
        const instrId = document.getElementById('instructionIdInput').value;
        const url = instrId ? `/api/rules/${instrId}` : '/api/rules';
        const method = instrId ? 'PUT' : 'POST';
        try {
          const payload = instrId ? { content: body } : { botId: currentBot._id, type: 'general', content: body };
          const res = await dashboardRequest(url, { method, body: JSON.stringify(payload) }, { operation: 'mutation' });
          if (res && res.success) {
            closeInstructionModal();
            loadTrainingData();
          } else {
            alert((translations[currentLanguage] || translations.en).instruction_save_failed);
          }
        } catch (err) {
          console.error(err);
          alert((translations[currentLanguage] || translations.en).instruction_save_failed);
        }
      }
    });
  }

  window.editInstruction = function(id) {
    const rule = generalInstructions.find(r => r._id === id);
    if (!rule) return;
    const raw = typeof rule.content === 'string' ? rule.content : (rule.content?.value || '');
    document.getElementById('instructionModalTitle').textContent = (translations[currentLanguage] || translations.en).instruction_modal_edit;
    document.getElementById('instructionIdInput').value = rule._id;
    document.getElementById('instructionContentInput').value = raw;
    openInstructionModal(document.activeElement);
  };

  window.deleteInstruction = async function(id) {
    if (!confirm((translations[currentLanguage] || translations.en).instruction_delete_confirm)) return;
    try {
      await withEntityLock(`training-rule:${id}`, id, async () => {
        const res = await dashboardRequest(`/api/rules/${id}`, { method: 'DELETE' }, { operation: 'mutation' });
        if (res && res.success) {
          loadTrainingData();
        } else {
          alert((translations[currentLanguage] || translations.en).instruction_save_failed);
        }
      });
    } catch (e) {
      console.error(e);
      alert((translations[currentLanguage] || translations.en).instruction_save_failed);
    }
  };

  // FAQ Forms submission
  const faqForm = document.getElementById('faqForm');
  const faqModal = document.getElementById('faqModal');

  // E02b: faqModal runs on the shared focus lifecycle
  // (window.ZainBotA11y, §7.3), same pattern as E02a. The helper owns
  // focus/stack/inert only; `.active` stays the visual switch — removed by
  // onClose and by the explicit fallback in closeFaqModal. FAQ owns no
  // timers or polling, so onClose has nothing else to clean up.
  const openFaqModal = (opener) => {
    if (!faqModal) return;
    faqModal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(faqModal, {
          opener: opener && opener.nodeType === 1 ? opener : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => faqModal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeFaqModal = () => {
    if (!faqModal) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(faqModal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      faqModal.classList.remove('active');
    }
  };

  if (faqForm) {
    faqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = document.getElementById('faqQuestionInput').value.trim();
      const answer = document.getElementById('faqAnswerInput').value.trim();
      const faqId = document.getElementById('faqIdInput').value;

      // D09: single-flight save (no duplicate FAQs); drafts stay in the open
      // modal on every failure path.
      const core = window.ZainBotRequest;
      const run = core && typeof core.runExclusive === 'function'
        ? (k, op) => core.runExclusive(k, op)
        : (k, op) => op();
      const feedback = window.ZainBotFeedback;
      const submitBtn = faqForm.querySelector('[type="submit"]');
      const guarded = feedback && typeof feedback.withPending === 'function' && submitBtn
        ? () => feedback.withPending('faq-save', [submitBtn], () => saveFaq(question, answer, faqId))
        : () => saveFaq(question, answer, faqId);
      try {
        await run('faq-save', guarded);
      } catch (err) {
        console.error(err);
      }

      async function saveFaq(q, a, id) {
        const url = id ? `/api/rules/${id}` : '/api/rules';
        const method = id ? 'PUT' : 'POST';
        try {
          const res = await dashboardRequest(url, {
            method,
            body: JSON.stringify({
              botId: currentBot._id,
              type: 'qa',
              content: { question: q, answer: a }
            })
          }, { operation: 'mutation' });

          if (res && res.success) {
            closeFaqModal();
            loadTrainingData();
          } else {
            alert((translations[currentLanguage] || translations.en).faq_save_failed);
          }
        } catch (err) {
          console.error(err);
          alert((translations[currentLanguage] || translations.en).faq_save_failed);
        }
      }
    });
  }

  // Guidelines form
  const promptTrainingForm = document.getElementById('promptTrainingForm');
  if (promptTrainingForm) {
    promptTrainingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const welcomeMessage = document.getElementById('botWelcomeMessage').value.trim();
      const customInstructions = document.getElementById('botCustomPrompt').value.trim();

      // D09: single-flight save; inputs are untouched on failure.
      const core = window.ZainBotRequest;
      const run = core && typeof core.runExclusive === 'function'
        ? (k, op) => core.runExclusive(k, op)
        : (k, op) => op();
      const feedback = window.ZainBotFeedback;
      const submitBtn = promptTrainingForm.querySelector('[type="submit"]');
      const guarded = feedback && typeof feedback.withPending === 'function' && submitBtn
        ? () => feedback.withPending('guidelines-save', [submitBtn], () => saveGuidelines(welcomeMessage, customInstructions))
        : () => saveGuidelines(welcomeMessage, customInstructions);
      try {
        await run('guidelines-save', guarded);
      } catch (err) {
        console.error(err);
      }

      async function saveGuidelines(welcome, instructions) {
        try {
          const res = await dashboardRequest(`/api/bots/${currentBot._id}`, {
            method: 'PUT',
            body: JSON.stringify({
              welcomeMessage: welcome,
              customInstructions: instructions
            })
          }, { operation: 'mutation' });
          if (res && res.success) {
            alert((translations[currentLanguage] || translations.en).training_guidelines_saved);
          } else {
            alert((translations[currentLanguage] || translations.en).training_guidelines_failed);
          }
        } catch (err) {
          console.error(err);
          alert((translations[currentLanguage] || translations.en).training_guidelines_failed);
        }
      }
    });
  }

  // 4. CONNECTIONS LOADER
  let channelStatusSnapshot = null;

  // Only the WhatsApp session and Telegram account link have status endpoints.
  // Meta page IDs are configuration, not evidence of a live connection.
  function deriveChannelStates(bot, whatsapp, telegram) {
    if (bot.isActive === false) return Object.fromEntries(
      ['whatsapp', 'facebook', 'instagram', 'telegram'].map(channel => [channel, 'inactive'])
    );
    const connections = bot.connections || {};
    const states = {
      whatsapp: whatsapp == null ? 'unavailable'
        : whatsapp.status === 'connected' ? 'wa_connected'
          : whatsapp.status === 'disconnected' && !connections.whatsapp ? 'not_setup' : 'wa_attention',
      facebook: connections.facebook ? 'unverified' : 'not_setup',
      instagram: connections.instagram ? 'unverified' : 'not_setup',
      telegram: telegram == null ? 'unavailable' : telegram.linked ? 'tg_linked' : 'not_setup'
    };
    if (bot.autoReplyEnabled === false) {
      for (const channel of ['whatsapp', 'facebook', 'instagram']) {
        if (states[channel] !== 'not_setup' && states[channel] !== 'unavailable') states[channel] = 'paused';
      }
    }
    return states;
  }

  function renderChannelStatuses(states) {
    const copy = translations[currentLanguage] || translations.en;
    for (const [channel, state] of Object.entries(states)) {
      const card = document.getElementById(`channel-card-${channel}`);
      if (!card) continue;
      card.classList.toggle('connected', state === 'wa_connected' || state === 'tg_linked');
      card.classList.toggle('available', state !== 'wa_connected' && state !== 'tg_linked');
      const label = card.querySelector('.channel-status');
      if (label) label.textContent = copy[`chan_status_${state}`];
    }
    const count = document.getElementById('statConnectedChannels');
    if (count) count.textContent = ['whatsapp', 'telegram'].filter(channel =>
      ['wa_connected', 'tg_linked'].includes(states[channel])
    ).length;
    const waRelinkBanner = document.getElementById('waRelinkBanner');
    if (waRelinkBanner) waRelinkBanner.hidden = states.whatsapp !== 'wa_attention';
  }

  async function refreshChannelStatuses(bot) {
    const botId = String(bot._id);
    if (String(channelStatusSnapshot?.botId) !== botId) {
      const count = document.getElementById('statConnectedChannels');
      if (count) count.textContent = '—';
      for (const channel of ['whatsapp', 'facebook', 'instagram', 'telegram']) {
        const label = document.querySelector(`#channel-card-${channel} .channel-status`);
        if (label) label.textContent = (translations[currentLanguage] || translations.en).chan_status_checking;
      }
    }
    const [wa, tg] = await Promise.allSettled([
      apiFetch(`/api/whatsapp/session?botId=${encodeURIComponent(botId)}`),
      apiFetch(`/api/telegram/status?botId=${encodeURIComponent(botId)}`)
    ]);
    if (String(currentBot?._id) !== botId) return;
    const whatsapp = wa.status === 'fulfilled' && wa.value?.success ? wa.value.data : null;
    const telegram = tg.status === 'fulfilled' && typeof tg.value?.linked === 'boolean' ? tg.value : null;
    const states = deriveChannelStates(bot, whatsapp, telegram);
    channelStatusSnapshot = { botId, states };
    renderChannelStatuses(states);
  }

  async function loadChannelsData() {
    loadCatalogStatus();
    if (!currentBot) return;
    const botId = String(currentBot._id);
    try {
      const res = await apiFetch(`/api/bots/${encodeURIComponent(botId)}`);
      if (String(currentBot?._id) !== botId) return;
      if (!res?.success) throw new Error('Bot status unavailable');
      await refreshChannelStatuses(res.data);
    } catch (e) {
      console.error(e);
      if (String(currentBot?._id) === botId) {
        const states = Object.fromEntries(['whatsapp', 'facebook', 'instagram', 'telegram'].map(channel => [channel, 'unavailable']));
        channelStatusSnapshot = { botId, states };
        renderChannelStatuses(states);
      }
    }
  }

  // WhatsApp disconnect UX: banner relink reuses the existing QR modal flow only.
  document.getElementById('waRelinkBtn')?.addEventListener('click', () => {
    if (typeof window.configureChannel === 'function') window.configureChannel('whatsapp');
  });

  const catalogForm = document.getElementById('storeConnectorForm');
  const catalogProvider = document.getElementById('storeProvider');
  const catalogUrl = document.getElementById('storeUrl');
  const catalogCurrency = document.getElementById('storeCurrency');
  const catalogToken = document.getElementById('storeToken');
  const catalogKey = document.getElementById('storeConsumerKey');
  const catalogSecret = document.getElementById('storeConsumerSecret');
  const catalogSyncButton = document.getElementById('syncStoreCatalog');
  const catalogSaveButton = document.getElementById('saveStoreConnector');
  const catalogStatusEl = document.getElementById('storeConnectorStatus');
  const catalogFeedbackEl = document.getElementById('storeConnectorFeedback');
  let catalogStatus = null;
  let catalogLoadFailed = false;
  let catalogBusy = false;
  let catalogRequest = 0;
  let catalogFeedbackKey = '';
  let catalogFeedbackParams = {};

  function canManageCatalog() {
    if (!currentBot?._id || !currentUser?._id) return false;
    return String(currentBot.userId?._id || currentBot.userId) === String(currentUser._id);
  }

  function catalogText(key, params = {}) {
    return (translations[currentLanguage][key] || translations[currentLanguage].store_error_generic)
      .replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''));
  }

  function catalogErrorKey(code) {
    return ({
      INVALID_CONNECTOR_CONFIG: 'store_error_invalid_config', INVALID_ORIGIN: 'store_error_invalid_origin',
      STORE_NOT_LINKED: 'store_error_store_not_linked', OWNER_ONLY: 'store_error_owner_only',
      SYNC_IN_PROGRESS: 'store_error_sync_in_progress', CONNECTOR_NOT_CONFIGURED: 'store_error_not_configured',
      REMOTE_AUTH_FAILED: 'store_error_auth', REMOTE_REQUEST_FAILED: 'store_error_remote',
      REMOTE_TIMEOUT: 'store_error_remote', REMOTE_RESPONSE_TOO_LARGE: 'store_error_remote',
      REMOTE_INVALID_RESPONSE: 'store_error_remote', REMOTE_INVALID_PRODUCT: 'store_error_remote',
      CATALOG_LIMIT_EXCEEDED: 'store_error_limit', EMPTY_CATALOG: 'store_error_empty',
      UNSAFE_HOST: 'store_error_unsafe', UNSAFE_PAGE: 'store_error_unsafe'
    })[code] || 'store_error_generic';
  }

  function catalogFeedback(key, params = {}) {
    catalogFeedbackKey = key;
    catalogFeedbackParams = params;
    catalogFeedbackEl.textContent = key ? catalogText(key, params) : '';
  }

  function renderCatalogStatus() {
    if (!catalogForm) return;
    const woo = catalogProvider.value === 'woocommerce';
    document.getElementById('shopifyCredentials').hidden = woo;
    document.getElementById('shopifyCredentials').style.display = woo ? 'none' : 'grid';
    document.getElementById('wooCredentials').hidden = !woo;
    document.getElementById('wooCredentials').style.display = woo ? 'grid' : 'none';
    catalogToken.required = !woo;
    catalogKey.required = catalogSecret.required = woo;
    document.getElementById('storeUrlHelp').textContent = catalogText(woo ? 'store_woo_url_help' : 'store_shopify_url_help');
    catalogUrl.placeholder = catalogText(woo ? 'store_woo_url_placeholder' : 'store_url_placeholder');
    catalogForm.querySelectorAll('input, select').forEach(el => { el.disabled = catalogBusy || !canManageCatalog(); });
    catalogSaveButton.disabled = catalogBusy || !canManageCatalog();
    catalogSyncButton.disabled = catalogBusy || !canManageCatalog() || !catalogStatus?.configured || catalogStatus.state === 'running';
    if (!currentBot?._id) catalogStatusEl.textContent = catalogText('store_no_bot');
    else if (!canManageCatalog()) catalogStatusEl.textContent = catalogText('store_error_owner_only');
    else if (!catalogStatus) catalogStatusEl.textContent = catalogText(catalogLoadFailed ? 'store_load_error' : 'store_status_loading');
    else {
      const stateKey = catalogStatus.configured ? `store_status_${catalogStatus.state}` : 'store_status_unconfigured';
      const parts = [catalogText(stateKey)];
      if (catalogStatus.configured) {
        if (catalogStatus.origin) parts.push(catalogStatus.origin);
        if (catalogStatus.lastSucceededAt) {
          const time = new Date(catalogStatus.lastSucceededAt);
          if (!Number.isNaN(time.getTime())) parts.push(catalogText('store_status_details', {
            count: formatNumber(Number(catalogStatus.lastImportedCount) || 0),
            time: formatDate(time, { dateStyle: 'medium', timeStyle: 'short' })
          }));
        } else parts.push(catalogText('store_status_no_sync'));
        if (catalogStatus.lastError) parts.push(catalogText(catalogErrorKey(catalogStatus.lastError)));
      }
      catalogStatusEl.textContent = parts.join(' · ');
    }
    catalogFeedbackEl.textContent = catalogFeedbackKey ? catalogText(catalogFeedbackKey, catalogFeedbackParams) : '';
  }

  async function catalogRequestJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }
    });
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('unauthorized');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'CONNECTOR_REQUEST_FAILED');
    return data;
  }

  function catalogEndpoint(botId, provider) {
    return `/api/catalog-connectors/bots/${encodeURIComponent(botId)}/${encodeURIComponent(provider)}`;
  }

  async function loadCatalogStatus() {
    const request = ++catalogRequest;
    catalogStatus = null;
    catalogLoadFailed = false;
    catalogFeedback('', {});
    renderCatalogStatus();
    if (!canManageCatalog()) return;
    const botId = String(currentBot._id);
    const provider = catalogProvider.value;
    try {
      const status = await catalogRequestJson(catalogEndpoint(botId, provider));
      if (request !== catalogRequest || String(currentBot?._id) !== botId || catalogProvider.value !== provider) return;
      catalogStatus = status;
      catalogUrl.value = status.origin || '';
      catalogCurrency.value = status.currency || 'EGP';
    } catch (error) {
      if (request !== catalogRequest) return;
      catalogLoadFailed = true;
      catalogFeedback(error.message === 'unauthorized' ? '' : error.message === 'STORE_NOT_LINKED' || error.message === 'OWNER_ONLY'
        ? catalogErrorKey(error.message) : '');
    }
    if (request === catalogRequest) renderCatalogStatus();
  }

  catalogProvider?.addEventListener('change', () => {
    const provider = catalogProvider.value;
    catalogForm.reset();
    catalogProvider.value = provider;
    catalogToken.value = catalogKey.value = catalogSecret.value = '';
    loadCatalogStatus();
  });
  catalogForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (catalogBusy || !canManageCatalog()) return;
    const botId = String(currentBot._id);
    const provider = catalogProvider.value;
    const request = ++catalogRequest;
    catalogBusy = true;
    catalogFeedback('store_saving');
    renderCatalogStatus();
    const body = { origin: catalogUrl.value.trim(), currency: catalogCurrency.value };
    if (provider === 'shopify') body.token = catalogToken.value;
    else { body.consumerKey = catalogKey.value; body.consumerSecret = catalogSecret.value; }
    const payload = JSON.stringify(body);
    delete body.token;
    delete body.consumerKey;
    delete body.consumerSecret;
    // Never retain credentials after issuing the request, including failed requests.
    catalogToken.value = catalogKey.value = catalogSecret.value = '';
    try {
      const status = await catalogRequestJson(catalogEndpoint(botId, provider), { method: 'PUT', body: payload });
      if (request !== catalogRequest || String(currentBot?._id) !== botId || catalogProvider.value !== provider) return;
      catalogStatus = status;
      catalogUrl.value = status.origin || '';
      catalogFeedback('store_saved');
    } catch (error) {
      if (request === catalogRequest) catalogFeedback(catalogErrorKey(error.message));
    } finally {
      catalogBusy = false;
      if (request === catalogRequest) renderCatalogStatus();
    }
  });
  catalogSyncButton?.addEventListener('click', async () => {
    if (catalogBusy || !catalogStatus?.configured || catalogStatus.state === 'running' || !canManageCatalog()) return;
    const botId = String(currentBot._id);
    const provider = catalogProvider.value;
    const request = ++catalogRequest;
    catalogBusy = true;
    catalogFeedback('store_syncing');
    renderCatalogStatus();
    try {
      const result = await catalogRequestJson(`${catalogEndpoint(botId, provider)}/sync`, { method: 'POST' });
      if (request === catalogRequest && String(currentBot?._id) === botId && catalogProvider.value === provider) {
        catalogFeedback('store_synced', { count: result.importedCount });
      }
    } catch (error) {
      if (request === catalogRequest) catalogFeedback(catalogErrorKey(error.message));
    } finally {
      catalogBusy = false;
      if (request === catalogRequest) await loadCatalogStatusAfterSync(botId, provider, request);
    }
  });

  async function loadCatalogStatusAfterSync(botId, provider, request) {
    try {
      const status = await catalogRequestJson(catalogEndpoint(botId, provider));
      if (request === catalogRequest && String(currentBot?._id) === botId && catalogProvider.value === provider) catalogStatus = status;
    } catch { /* Keep the outcome visible if refreshing status fails. */ }
    if (request === catalogRequest) renderCatalogStatus();
  }

  document.getElementById('openCatalogTrainingBtn')?.addEventListener('click', () => switchTab('page-training', { focusHeading: true }));

  // 5. ORDERS & APPOINTMENTS LOADER
  let ordersList = [];
  let bookingsList = [];
  let notificationRecipientsList = [];

  // D05a/b: the two lists load INDEPENDENTLY — a bookings failure never
  // blocks orders, and each list retries alone. A per-call generation plus a
  // bot-id guard drops stale replies; switching bots clears both lists first
  // so previous-bot data is never kept. A same-bot refresh failure keeps the
  // old data with a stale warning instead of wiping it.
  // Returns true (loaded), false (failed), or 'stale' (superseded: a newer
  // run owns the UI, so callers must not report it as a failure).
  let ordersRun = 0;
  let ordersBotId = null;
  function ordersListErrorRow(tbody, message, retryFnName, t) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--red); padding:24px;">${message} <button class="btn btn-sm btn-secondary" type="button" onclick="window.${retryFnName}()">${t.feedback_retry}</button></td></tr>`;
  }
  async function loadOrdersList(run, botId) {
    const t = translations[currentLanguage] || translations.en;
    const ordersTableBody = document.getElementById('ordersTableBody');
    try {
      const orderRes = await dashboardRequest(`/api/chat-orders?botId=${botId}`);
      if (run !== ordersRun || String(currentBot?._id) !== botId) return 'stale';
      if (!(orderRes && orderRes.success)) throw new Error('Orders unavailable');
      ordersList = orderRes.data || [];
      renderOrders();
      updateOrdersAndBookingsKPIs();
      return true;
    } catch (e) {
      console.error('loadOrdersList_error', e);
      if (run !== ordersRun || String(currentBot?._id) !== botId) return 'stale';
      if (ordersTableBody) {
        if (ordersList.length > 0) {
          notifyDashboard('error', 'orders_refresh_failed');
        } else {
          ordersListErrorRow(ordersTableBody, t.orders_load_error, 'retryOrdersList', t);
        }
      }
      return false;
    }
  }
  async function loadBookingsList(run, botId) {
    const t = translations[currentLanguage] || translations.en;
    const bookingsTableBody = document.getElementById('bookingsTableBody');
    try {
      const bookingRes = await dashboardRequest(`/api/bookings?botId=${botId}`);
      if (run !== ordersRun || String(currentBot?._id) !== botId) return 'stale';
      if (!(bookingRes && bookingRes.success)) throw new Error('Bookings unavailable');
      bookingsList = bookingRes.data || [];
      renderBookings();
      updateOrdersAndBookingsKPIs();
      return true;
    } catch (e) {
      console.error('loadBookingsList_error', e);
      if (run !== ordersRun || String(currentBot?._id) !== botId) return 'stale';
      if (bookingsTableBody) {
        if (bookingsList.length > 0) {
          notifyDashboard('error', 'bookings_refresh_failed');
        } else {
          ordersListErrorRow(bookingsTableBody, t.bookings_load_error, 'retryBookingsList', t);
        }
      }
      return false;
    }
  }
  window.retryOrdersList = function() {
    if (!currentBot) return Promise.resolve(false);
    const run = ++ordersRun;
    const botId = String(currentBot._id);
    return loadOrdersList(run, botId);
  };
  window.retryBookingsList = function() {
    if (!currentBot) return Promise.resolve(false);
    const run = ++ordersRun;
    const botId = String(currentBot._id);
    return loadBookingsList(run, botId);
  };
  async function loadOrdersData() {
    if (!currentBot) {
      ordersList = [];
      bookingsList = [];
      ordersBotId = null;
      updateOrdersAndBookingsKPIs();
      renderOrders();
      renderBookings();
      return { orders: false, bookings: false };
    }
    const botId = String(currentBot._id);
    const run = ++ordersRun;
    if (ordersBotId !== botId) {
      ordersBotId = botId;
      ordersList = [];
      bookingsList = [];
      updateOrdersAndBookingsKPIs();
      renderOrders();
      renderBookings();
    }
    const [ordersRes, bookingsRes] = await Promise.all([
      loadOrdersList(run, botId),
      loadBookingsList(run, botId)
    ]);
    updateOrdersAndBookingsKPIs();
    return {
      orders: ordersRes === 'stale' ? null : ordersRes,
      bookings: bookingsRes === 'stale' ? null : bookingsRes,
    };
  }

  function updateOrdersAndBookingsKPIs() {
    const t = translations[currentLanguage] || translations.en;
    const totalOrders = ordersList.length;
    const pendingOrders = ordersList.filter(o => o.status === 'pending' || o.status === 'processing').length;
    const totalBookings = bookingsList.length;
    const confirmedBookings = bookingsList.filter(b => b.status === 'confirmed').length;

    const elOrdersTotal = document.getElementById('statOrdersTotal');
    if (elOrdersTotal) elOrdersTotal.textContent = totalOrders;
    const elOrdersPending = document.getElementById('statOrdersPending');
    if (elOrdersPending) elOrdersPending.textContent = pendingOrders;
    const elBookingsTotal = document.getElementById('statBookingsTotal');
    if (elBookingsTotal) elBookingsTotal.textContent = totalBookings;
    const elBookingsConfirmed = document.getElementById('statBookingsConfirmed');
    if (elBookingsConfirmed) elBookingsConfirmed.textContent = confirmedBookings;

    const elOrderBadge = document.getElementById('ordersCountBadge');
    if (elOrderBadge) elOrderBadge.textContent = `${totalOrders} ${t.orders_count_unit}`;
    const elBookingBadge = document.getElementById('bookingsCountBadge');
    if (elBookingBadge) elBookingBadge.textContent = `${totalBookings} ${t.bookings_count_unit}`;
  }

  function getFilteredOrders() {
    const search = (document.getElementById('ordersSearchInput')?.value || '').toLowerCase().trim();
    const status = document.getElementById('ordersStatusFilter')?.value || '';
    return ordersList.filter(order => {
      if (status && order.status !== status) return false;
      if (search) {
        const name = (order.customerName || '').toLowerCase();
        const phone = (order.customerPhone || '').toLowerCase();
        const address = (order.customerAddress || '').toLowerCase();
        return name.includes(search) || phone.includes(search) || address.includes(search);
      }
      return true;
    });
  }

  function getFilteredBookings() {
    const search = (document.getElementById('ordersSearchInput')?.value || '').toLowerCase().trim();
    const status = document.getElementById('ordersStatusFilter')?.value || '';
    return bookingsList.filter(b => {
      if (status && b.status !== status) return false;
      if (search) {
        const name = (b.customerName || '').toLowerCase();
        const phone = (b.customerPhone || '').toLowerCase();
        const service = (b.serviceType || '').toLowerCase();
        return name.includes(search) || phone.includes(search) || service.includes(search);
      }
      return true;
    });
  }

  function renderOrders() {
    const ordersTableBody = document.getElementById('ordersTableBody');
    if (!ordersTableBody) return;
    ordersTableBody.innerHTML = '';
    const t = translations[currentLanguage] || translations.en;

    const filtered = getFilteredOrders();
    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${t.orders_empty}</td></tr>`;
      return;
    }

    filtered.forEach(order => {
      const row = document.createElement('tr');
      const itemsStr = order.items && order.items.length ? order.items.map(it => `${it.title} (x${it.quantity})`).join(', ') : (order.notes || '-');
      
      let badgeClass = 'badge-warning';
      if (order.status === 'confirmed' || order.status === 'delivered') badgeClass = 'badge-success';
      if (order.status === 'cancelled') badgeClass = 'badge-danger';
      if (order.status === 'shipped') badgeClass = 'badge-info';

      const statusLabel = t[`status_${order.status}`] || order.status;

      row.innerHTML = `
        <td style="font-family:monospace; font-weight:600;">
          #${order._id.slice(-6).toUpperCase()}
          ${order.isStoreOrder ? '<span class="badge" style="font-size:10px; margin-inline-start:4px; background:rgba(139,92,246,0.2); color:var(--purple-light);">Store</span>' : '<span class="badge" style="font-size:10px; margin-inline-start:4px; background:rgba(6,182,212,0.15); color:var(--cyan);">Chat</span>'}
        </td>
        <td><strong>${escapeHtml(order.customerName || 'Customer')}</strong></td>
        <td>${escapeHtml(order.customerPhone || 'N/A')}</td>
        <td style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(itemsStr)}</td>
        <td><strong><bdi>${order.totalAmount ? formatNumber(order.totalAmount) + ' EGP' : '-'}</bdi></strong></td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
            ${order.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="window.changeOrderStatus('${order._id}', 'confirmed')" title="${t.action_confirm}"><i class="fas fa-check"></i></button>` : ''}
            ${order.status === 'confirmed' ? `<button class="btn btn-sm btn-info" onclick="window.changeOrderStatus('${order._id}', 'shipped')" title="${t.action_ship}"><i class="fas fa-shipping-fast"></i></button>` : ''}
            ${order.status === 'shipped' ? `<button class="btn btn-sm btn-success" onclick="window.changeOrderStatus('${order._id}', 'delivered')" title="${t.action_deliver}"><i class="fas fa-box-check"></i></button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="window.openOrderModal('${order._id}')" title="${t.action_edit}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="window.deleteOrder('${order._id}')" title="${t.action_delete}"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
      ordersTableBody.appendChild(row);
    });
  }

  function renderBookings() {
    const bookingsTableBody = document.getElementById('bookingsTableBody');
    if (!bookingsTableBody) return;
    bookingsTableBody.innerHTML = '';
    const t = translations[currentLanguage] || translations.en;

    const filtered = getFilteredBookings();
    if (filtered.length === 0) {
      bookingsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${t.bookings_empty}</td></tr>`;
      return;
    }

    filtered.forEach(booking => {
      const row = document.createElement('tr');
      let badgeClass = 'badge-warning';
      if (booking.status === 'confirmed') badgeClass = 'badge-success';
      if (booking.status === 'completed') badgeClass = 'badge-info';
      if (booking.status === 'rescheduled') badgeClass = 'badge-purple';
      if (booking.status === 'cancelled') badgeClass = 'badge-danger';

      const dateStr = booking.bookingDate ? formatDate(booking.bookingDate, {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'N/A';

      const statusLabel = t[`status_${booking.status}`] || booking.status;

      row.innerHTML = `
        <td style="font-family:monospace; font-weight:600;">#${booking._id.slice(-6).toUpperCase()}</td>
        <td><strong>${escapeHtml(booking.customerName || 'Customer')}</strong></td>
        <td>${escapeHtml(booking.customerPhone || 'N/A')}</td>
        <td><span class="badge" style="background:rgba(6, 182, 212, 0.15); color:var(--cyan); border:1px solid rgba(6,182,212,0.3);">${escapeHtml(booking.serviceType || 'موعد / استشارة')}</span></td>
        <td><i class="fas fa-calendar-day" style="color:var(--text-muted); margin-inline-end:4px;"></i> ${dateStr}</td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
            ${booking.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="window.changeBookingStatus('${booking._id}', 'confirmed')" title="${t.action_confirm}"><i class="fas fa-check"></i></button>` : ''}
            ${booking.status === 'confirmed' ? `<button class="btn btn-sm btn-info" onclick="window.changeBookingStatus('${booking._id}', 'completed')" title="${t.action_complete}"><i class="fas fa-check-double"></i></button>` : ''}
            <button class="btn btn-sm btn-secondary" onclick="window.openBookingModal('${booking._id}')" title="${t.action_edit}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="window.deleteBooking('${booking._id}')" title="${t.action_delete}"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
      bookingsTableBody.appendChild(row);
    });
  }

  // D05c: shared per-row entity lock for status + delete. Both actions on
  // the same row share one lock key, so the second attempt attaches to the
  // in-flight request instead of sending a duplicate mutation. Conflicting
  // row controls disable for the flight and restore their original states.
  // The disable/restore runs INSIDE the exclusive operation (single
  // execution), so concurrent attachers can never wedge the controls.
  function rowActionButtons(id) {
    return Array.from(document.querySelectorAll(`button[onclick*="${id}"]`));
  }
  async function withEntityLock(key, id, operation) {
    const core = window.ZainBotRequest;
    const run = core && typeof core.runExclusive === 'function'
      ? (k, op) => core.runExclusive(k, op)
      : (k, op) => op();
    return run(key, async () => {
      const buttons = rowActionButtons(id);
      const previous = buttons.map((b) => b.disabled);
      buttons.forEach((b) => { b.disabled = true; });
      try {
        return await operation();
      } finally {
        buttons.forEach((b, i) => { b.disabled = previous[i]; });
      }
    });
  }

  // Quick Action Handlers for Bookings
  window.changeBookingStatus = async function(bookingId, status) {
    try {
      await withEntityLock(`booking:${bookingId}`, bookingId, async () => {
        const res = await dashboardRequest(`/api/bookings/${bookingId}`, {
          method: 'PUT',
          body: JSON.stringify({ status })
        });
        if (res && res.success) {
          await loadOrdersData();
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  window.deleteBooking = async function(bookingId) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.delete_booking_confirm)) return;
    try {
      await withEntityLock(`booking:${bookingId}`, bookingId, async () => {
        const res = await dashboardRequest(`/api/bookings/${bookingId}`, { method: 'DELETE' });
        if (res && res.success) {
          await loadOrdersData();
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  // E02c: bookingModal runs on the shared focus lifecycle
  // (window.ZainBotA11y, §7.3), same pattern as E02a/E02b. The helper owns
  // focus/stack/inert only; `.active` stays the visual switch — removed by
  // onClose and by the explicit fallback in closeBookingModal. Booking owns
  // no QR/polling; date handling stays exactly as D05 owns it.
  const closeBookingModal = () => {
    const bookingModalEl = document.getElementById('bookingModal');
    if (!bookingModalEl) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(bookingModalEl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      bookingModalEl.classList.remove('active');
    }
  };

  window.openBookingModal = function(bookingId = null) {
    const modal = document.getElementById('bookingModal');
    if (!modal) return;
    const form = document.getElementById('bookingForm');
    form.reset();

    const t = translations[currentLanguage] || translations.en;
    document.getElementById('bookingIdInput').value = bookingId || '';
    document.getElementById('bookingModalTitle').innerHTML = `<i class="fas fa-calendar-alt"></i> ${bookingId ? t.booking_modal_title : t.btn_new_booking}`;

    if (bookingId) {
      const booking = bookingsList.find(b => b._id === bookingId);
      if (booking) {
        document.getElementById('bookingCustomerName').value = booking.customerName || '';
        document.getElementById('bookingCustomerPhone').value = booking.customerPhone || '';
        document.getElementById('bookingServiceType').value = booking.serviceType || '';
        document.getElementById('bookingStatusSelect').value = booking.status || 'pending';
        document.getElementById('bookingDuration').value = booking.slotDurationMinutes || 30;
        document.getElementById('bookingNotes').value = booking.notes || '';
        if (booking.bookingDate) {
          const d = new Date(booking.bookingDate);
          d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
          document.getElementById('bookingDateTime').value = d.toISOString().slice(0, 16);
        }
      }
    } else {
      const now = new Date();
      now.setHours(now.getHours() + 1, 0, 0, 0);
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      document.getElementById('bookingDateTime').value = now.toISOString().slice(0, 16);
    }
    modal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(modal, {
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
  };

  // Quick Action Handlers for Orders
  // Server exposes PUT (raw updated document, no success wrapper) and DELETE
  // ({ message }, no success wrapper): both shapes are handled locally here.
  window.changeOrderStatus = async function(orderId, status) {
    const t = translations[currentLanguage] || translations.en;
    const row = ordersList.find(o => String(o._id) === String(orderId));
    if (row && row.isStoreOrder) {
      alert(t.store_order_readonly);
      return;
    }
    try {
      await withEntityLock(`order:${orderId}`, orderId, async () => {
        const res = await dashboardRequest(`/api/chat-orders/${orderId}`, {
          method: 'PUT',
          body: JSON.stringify({ status })
        });
        if (res && (res.success || res._id)) {
          await loadOrdersData();
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  window.deleteOrder = async function(orderId) {
    const t = translations[currentLanguage] || translations.en;
    const row = ordersList.find(o => String(o._id) === String(orderId));
    if (row && row.isStoreOrder) {
      alert(t.store_order_readonly);
      return;
    }
    if (!confirm(t.delete_order_confirm)) return;
    try {
      await withEntityLock(`order:${orderId}`, orderId, async () => {
        const res = await dashboardRequest(`/api/chat-orders/${orderId}`, { method: 'DELETE' });
        if (res && (res.success || res.message)) {
          await loadOrdersData();
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  // E02d: chatOrderModal runs on the shared focus lifecycle
  // (window.ZainBotA11y, §7.3), same pattern as E02a/b/c. The helper owns
  // focus/stack/inert only; `.active` stays the visual switch — removed by
  // onClose and by the explicit fallback in closeOrderModal. D01's route
  // contract (PUT shapes, store-row guard, disabled creation path) is
  // untouched; order owns no polling.
  const closeOrderModal = () => {
    const orderModalEl = document.getElementById('chatOrderModal');
    if (!orderModalEl) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(orderModalEl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      orderModalEl.classList.remove('active');
    }
  };

  window.openOrderModal = function(orderId = null) {
    const t = translations[currentLanguage] || translations.en;
    // Manual chat-order creation has no server route: the path stays disabled
    // and reports a translated unsupported-action state instead of inventing
    // a POST that would 404.
    if (!orderId) {
      alert(t.chat_order_create_unsupported);
      return;
    }
    const modal = document.getElementById('chatOrderModal');
    if (!modal) return;
    const order = ordersList.find(o => String(o._id) === String(orderId));
    // Store rows are Order documents, not ChatOrders: block ChatOrder
    // mutations on them locally (the server would 404 the lookup anyway).
    if (order && order.isStoreOrder) {
      alert(t.store_order_readonly);
      return;
    }
    const form = document.getElementById('chatOrderForm');
    form.reset();

    document.getElementById('chatOrderIdInput').value = orderId || '';
    document.getElementById('chatOrderModalTitle').innerHTML = `<i class="fas fa-shopping-cart"></i> ${orderId ? t.chat_order_modal_title : t.btn_new_order}`;

    if (orderId) {
      if (order) {
        document.getElementById('orderCustomerName').value = order.customerName || '';
        document.getElementById('orderCustomerPhone').value = order.customerPhone || '';
        document.getElementById('orderCustomerAddress').value = order.customerAddress || '';
        document.getElementById('orderTotalAmount').value = order.totalAmount || 0;
        document.getElementById('orderStatusSelect').value = order.status || 'pending';
        document.getElementById('orderCustomerNote').value = order.notes || '';
        const itemsStr = order.items ? order.items.map(it => `${it.title} x${it.quantity}`).join(', ') : '';
        document.getElementById('orderItemsSummary').value = itemsStr;
      }
      // The server update route only honors status/note/items/deliveryFee/
      // totalAmount: customer identity fields are display-only in the editor.
      document.getElementById('orderCustomerName').readOnly = true;
      document.getElementById('orderCustomerPhone').readOnly = true;
      document.getElementById('orderCustomerAddress').readOnly = true;
    }
    modal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(modal, {
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
  };

  // Setup Booking Form Submit
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('bookingIdInput').value;
      const t = translations[currentLanguage] || translations.en;

      // D05d: validate BEFORE toISOString — an invalid date never sends.
      // Inputs are retained on every failure path below (nothing clears them).
      const dateRaw = document.getElementById('bookingDateTime').value;
      const parsedDate = new Date(dateRaw);
      if (!dateRaw || isNaN(parsedDate.getTime())) {
        alert(t.booking_invalid_date);
        return;
      }

      const payload = {
        botId: currentBot._id,
        customerName: document.getElementById('bookingCustomerName').value.trim(),
        customerPhone: document.getElementById('bookingCustomerPhone').value.trim(),
        serviceType: document.getElementById('bookingServiceType').value.trim() || 'استشارة / موعد',
        bookingDate: parsedDate.toISOString(),
        slotDurationMinutes: parseInt(document.getElementById('bookingDuration').value) || 30,
        status: document.getElementById('bookingStatusSelect').value,
        notes: document.getElementById('bookingNotes').value.trim(),
      };

      try {
        const url = id ? `/api/bookings/${id}` : '/api/bookings';
        const method = id ? 'PUT' : 'POST';
        const res = await dashboardRequest(url, { method, body: JSON.stringify(payload) }, { operation: 'mutation' });

        if (res && res.success) {
          closeBookingModal();
          alert(t.booking_saved_ok);
          // The save outcome is already reported: a refresh failure is a
          // SECOND, separate outcome — never a silent rewrite of the save.
          const refresh = await loadOrdersData();
          if (refresh.orders === false) alert(t.orders_refresh_failed);
          if (refresh.bookings === false) alert(t.bookings_refresh_failed);
        } else {
          alert(res?.message || t.booking_save_failed);
        }
      } catch (err) {
        console.error(err);
        alert(t.booking_save_failed);
      }
    });
  }

  // Setup Order Form Submit (edit-only: no POST /api/chat-orders route exists)
  const chatOrderForm = document.getElementById('chatOrderForm');
  if (chatOrderForm) {
    chatOrderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('chatOrderIdInput').value;
      const t = translations[currentLanguage] || translations.en;

      if (!id) {
        alert(t.chat_order_create_unsupported);
        return;
      }

      const itemsText = document.getElementById('orderItemsSummary').value.trim();
      const items = itemsText ? [{ title: itemsText, quantity: 1, price: parseFloat(document.getElementById('orderTotalAmount').value) || 0 }] : [];

      const payload = {
        botId: currentBot._id,
        customerName: document.getElementById('orderCustomerName').value.trim(),
        customerPhone: document.getElementById('orderCustomerPhone').value.trim(),
        customerAddress: document.getElementById('orderCustomerAddress').value.trim(),
        items,
        totalAmount: parseFloat(document.getElementById('orderTotalAmount').value) || 0,
        status: document.getElementById('orderStatusSelect').value,
        note: document.getElementById('orderCustomerNote').value.trim(),
      };

      try {
        const res = await dashboardRequest(`/api/chat-orders/${id}`, { method: 'PUT', body: JSON.stringify(payload) }, { operation: 'mutation' });

        if (res && (res.success || res._id)) {
          closeOrderModal();
          alert(t.order_saved_ok);
          // Save and refresh are TWO separate outcomes.
          const refresh = await loadOrdersData();
          if (refresh.orders === false) alert(t.orders_refresh_failed);
          if (refresh.bookings === false) alert(t.bookings_refresh_failed);
        } else {
          alert(res?.message || t.order_save_failed);
        }
      } catch (err) {
        console.error(err);
        alert(t.order_save_failed);
      }
    });
  }

  // Toolbar & Filter Event Listeners
  document.getElementById('createBookingBtn')?.addEventListener('click', () => window.openBookingModal());
  document.getElementById('createOrderBtn')?.addEventListener('click', () => window.openOrderModal());
  // No POST /api/chat-orders route exists: keep the creation path disabled
  // (the click guard above still reports the translated reason if reached).
  const createOrderBtn = document.getElementById('createOrderBtn');
  if (createOrderBtn) {
    createOrderBtn.disabled = true;
    createOrderBtn.title = (translations[currentLanguage] || translations.en).chat_order_create_unsupported || '';
  }
  document.getElementById('refreshOrdersBtn')?.addEventListener('click', () => loadOrdersData());
  document.getElementById('ordersSearchInput')?.addEventListener('input', () => { renderOrders(); renderBookings(); });
  document.getElementById('ordersStatusFilter')?.addEventListener('change', () => { renderOrders(); renderBookings(); });
  document.getElementById('ordersTypeFilter')?.addEventListener('change', (e) => {
    const val = e.target.value;
    const ordersCard = document.getElementById('ordersCardContainer');
    const bookingsCard = document.getElementById('appointmentsCardContainer');
    if (ordersCard) ordersCard.style.display = (val === 'all' || val === 'orders') ? 'block' : 'none';
    if (bookingsCard) bookingsCard.style.display = (val === 'all' || val === 'bookings') ? 'block' : 'none';
  });

  document.querySelectorAll('.booking-modal-close').forEach(btn => btn.addEventListener('click', () => {
    closeBookingModal();
  }));
  document.querySelectorAll('.order-modal-close').forEach(btn => btn.addEventListener('click', () => {
    closeOrderModal();
  }));
  document.querySelectorAll('.recipient-modal-close').forEach(btn => btn.addEventListener('click', () => {
    closeRecipientModal();
  }));

  // ==================== NOTIFICATION RECIPIENTS SECTION ====================
  // D07b: loading/error/empty states with a manual retry for reads only.
  async function loadNotificationRecipients() {
    const tbody = document.getElementById('notificationRecipientsTableBody');
    if (!tbody) return false;
    if (!currentBot) return false;
    const t = translations[currentLanguage] || translations.en;
    const botId = String(currentBot._id);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">${t.recipients_loading}</td></tr>`;
    try {
      const res = await dashboardRequest(`/api/notifications/recipients?botId=${botId}`);
      if (String(currentBot?._id) !== botId) return 'stale';
      if (!(res && res.success)) throw new Error('Recipients unavailable');
      notificationRecipientsList = res.data || [];
      renderNotificationRecipients();
      return true;
    } catch (e) {
      console.error('loadNotificationRecipients_error', e);
      if (String(currentBot?._id) !== botId) return 'stale';
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--red); padding:20px;">${t.recipients_load_error} <button class="btn btn-sm btn-secondary" type="button" onclick="window.retryRecipientsList()">${t.feedback_retry}</button></td></tr>`;
      return false;
    }
  }
  window.retryRecipientsList = function() {
    return loadNotificationRecipients();
  };

  function renderNotificationRecipients() {
    const tbody = document.getElementById('notificationRecipientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const t = translations[currentLanguage] || translations.en;

    if (notificationRecipientsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">${t.recipients_empty}</td></tr>`;
      return;
    }

    notificationRecipientsList.forEach(rec => {
      const row = document.createElement('tr');
      const channelBadge = rec.channel === 'whatsapp' 
        ? `<span class="badge" style="background:#25D366; color:#000;"><i class="fab fa-whatsapp"></i> WhatsApp</span>`
        : `<span class="badge" style="background:#0088cc; color:#fff;"><i class="fab fa-telegram-plane"></i> Telegram</span>`;
      
      const eventsStr = Array.isArray(rec.events) ? rec.events.map(ev => `<span class="badge badge-secondary" style="font-size:10px; margin:2px;">${t[`ev_${ev}`] || ev}</span>`).join('') : '-';

      row.innerHTML = `
        <td>${channelBadge}</td>
        <td><strong>${escapeHtml(rec.target)}</strong></td>
        <td>${escapeHtml(rec.label || '-')}</td>
        <td>${eventsStr}</td>
        <td><span class="badge ${rec.isActive !== false ? 'badge-success' : 'badge-danger'}">${rec.isActive !== false ? t.admin_active : t.admin_suspended}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px; justify-content:center;">
            <button class="btn btn-sm btn-info" onclick="window.testNotificationRecipient('${rec._id}')" title="${t.action_test}"><i class="fas fa-paper-plane"></i></button>
            <button class="btn btn-sm btn-danger" onclick="window.deleteNotificationRecipient('${rec._id}')" title="${t.action_delete}"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });
  }

  // E02e: recipientModal runs on the shared focus lifecycle
  // (window.ZainBotA11y, §7.3), same pattern as E02a/b/c/d. The helper owns
  // focus/stack/inert only; `.active` stays the visual switch — removed by
  // onClose and by the explicit fallback in closeRecipientModal. Create/
  // test/delete flows (D07) are untouched; recipient owns no polling.
  const closeRecipientModal = () => {
    const recipientModalEl = document.getElementById('recipientModal');
    if (!recipientModalEl) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(recipientModalEl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      recipientModalEl.classList.remove('active');
    }
  };

  window.openRecipientModal = function() {
    const modal = document.getElementById('recipientModal');
    if (!modal) return;
    document.getElementById('recipientForm').reset();
    document.getElementById('recipientIdInput').value = '';
    modal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(modal, {
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
  };

  // D07c: test + delete share one lock per recipient row (D06 outcome
  // contract: `delivered` means sent; `configured` renders as
  // configured-not-sent, never as sent). A free-plan 403 surfaces its message
  // and never logs out (redirect happens on 401 only).
  window.testNotificationRecipient = async function(id) {
    const t = translations[currentLanguage] || translations.en;
    try {
      await withEntityLock(`recipient:${id}`, id, async () => {
        const res = await dashboardRequest(`/api/notifications/recipients/${id}/test`, { method: 'POST' }, { operation: 'mutation' });
        if (res && res.success && res.outcome === 'delivered') {
          alert(t.recipient_test_sent);
        } else if (res && res.outcome === 'configured') {
          alert(t.recipient_test_configured);
        } else {
          alert(res?.message || t.recipient_test_failed);
        }
      });
    } catch (e) {
      console.error(e);
      alert(t.recipient_test_failed);
    }
  };

  window.deleteNotificationRecipient = async function(id) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.delete_recipient_confirm)) return;
    try {
      await withEntityLock(`recipient:${id}`, id, async () => {
        const res = await dashboardRequest(`/api/notifications/recipients/${id}`, { method: 'DELETE' }, { operation: 'mutation' });
        if (res && res.success) {
          await loadNotificationRecipients();
        } else {
          alert(res?.message || t.recipient_delete_failed);
        }
      });
    } catch (e) {
      console.error(e);
      alert(t.recipient_delete_failed);
    }
  };

  document.getElementById('addRecipientBtn')?.addEventListener('click', () => window.openRecipientModal());
  const recipientForm = document.getElementById('recipientForm');
  if (recipientForm) {
    recipientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = translations[currentLanguage] || translations.en;
      const selectedEvents = Array.from(document.querySelectorAll('input[name="recipientEvents"]:checked')).map(el => el.value);

      const payload = {
        botId: currentBot._id,
        channel: document.getElementById('recipientChannelSelect').value,
        target: document.getElementById('recipientTargetInput').value.trim(),
        label: document.getElementById('recipientLabelInput').value.trim(),
        events: selectedEvents,
      };

      // D07b: create guard — one in-flight create (no duplicate channels),
      // submit conflicting control disabled, inputs retained on failure.
      const core = window.ZainBotRequest;
      const run = core && typeof core.runExclusive === 'function'
        ? (k, op) => core.runExclusive(k, op)
        : (k, op) => op();
      const feedback = window.ZainBotFeedback;
      const submitBtn = recipientForm.querySelector('[type="submit"]');
      const guarded = feedback && typeof feedback.withPending === 'function' && submitBtn
        ? () => feedback.withPending('recipient-create', [submitBtn], () => saveRecipient(payload))
        : () => saveRecipient(payload);
      try {
        await run('recipient-create', guarded);
      } catch (err) {
        console.error(err);
      }

      async function saveRecipient(body) {
        try {
          const res = await dashboardRequest('/api/notifications/recipients', {
            method: 'POST',
            body: JSON.stringify(body)
          }, { operation: 'mutation' });

          if (res && res.success) {
            closeRecipientModal();
            alert(t.recipient_saved_ok);
            await loadNotificationRecipients();
          } else {
            // Free-plan 403 and validation errors surface their message here
            // and never log out (redirect happens on 401 only).
            alert(res?.message || t.recipient_save_failed);
          }
        } catch (err) {
          console.error(err);
          alert(t.recipient_save_failed);
        }
      }
    });
  }

  // 5.5 DEDICATED WEB CHAT PAGE CUSTOMIZER & LIVE PREVIEW
  const THEME_PRESETS = {
    cyber_dark: {
      header: '#0F172A',
      outerBackgroundColor: '#0A0F1D',
      containerBackgroundColor: '#0F172A',
      chatAreaBackground: '#0B1329',
      botMessageBackground: '#1E293B',
      botMessageTextColor: '#FFFFFF',
      userMessageBackground: '#06B6D4',
      userMessageTextColor: '#FFFFFF',
      sendButtonColor: '#06B6D4',
      button: '#06B6D4',
      titleColor: '#FFFFFF',
    },
    emerald_clean: {
      header: '#065F46',
      outerBackgroundColor: '#F8FAFC',
      containerBackgroundColor: '#FFFFFF',
      chatAreaBackground: '#F1F5F9',
      botMessageBackground: '#E2E8F0',
      botMessageTextColor: '#0F172A',
      userMessageBackground: '#059669',
      userMessageTextColor: '#FFFFFF',
      sendButtonColor: '#059669',
      button: '#059669',
      titleColor: '#FFFFFF',
    },
    royal_purple: {
      header: '#1E1145',
      outerBackgroundColor: '#0F0728',
      containerBackgroundColor: '#180D38',
      chatAreaBackground: '#130A2A',
      botMessageBackground: '#2A1659',
      botMessageTextColor: '#FFFFFF',
      userMessageBackground: '#8B5CF6',
      userMessageTextColor: '#FFFFFF',
      sendButtonColor: '#8B5CF6',
      button: '#8B5CF6',
      titleColor: '#FFFFFF',
    }
  };

  let currentChatLogoUrl = '';
  let chatLogoFileToUpload = null;

  window.handleChatLogoChange = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    chatLogoFileToUpload = file;
    currentChatLogoUrl = URL.createObjectURL(file);

    const logoImg = document.getElementById('chatPageLogoImg');
    const defaultIcon = document.getElementById('chatPageDefaultLogoIcon');
    const removeBtn = document.getElementById('removeChatLogoBtn');

    if (logoImg) {
      logoImg.src = currentChatLogoUrl;
      logoImg.style.display = 'block';
    }
    if (defaultIcon) defaultIcon.style.display = 'none';
    if (removeBtn) removeBtn.style.display = 'inline-flex';

    window.updateLivePreview();
  };

  window.removeChatLogo = function() {
    chatLogoFileToUpload = null;
    currentChatLogoUrl = '';
    const input = document.getElementById('chatPageLogoInput');
    if (input) input.value = '';

    const logoImg = document.getElementById('chatPageLogoImg');
    const defaultIcon = document.getElementById('chatPageDefaultLogoIcon');
    const removeBtn = document.getElementById('removeChatLogoBtn');

    if (logoImg) {
      logoImg.src = '';
      logoImg.style.display = 'none';
    }
    if (defaultIcon) defaultIcon.style.display = 'block';
    if (removeBtn) removeBtn.style.display = 'none';

    window.updateLivePreview();
  };

  window.applyThemePreset = function(presetKey) {
    const preset = THEME_PRESETS[presetKey];
    if (!preset) return;

    document.querySelectorAll('.theme-preset-card').forEach(card => {
      const isActive = card.getAttribute('data-preset') === presetKey;
      card.classList.toggle('active', isActive);
      card.style.borderColor = isActive ? 'var(--cyan)' : 'var(--glass-border)';
    });

    document.getElementById('chatColorHeader').value = preset.header;
    document.getElementById('chatColorBg').value = preset.outerBackgroundColor;
    document.getElementById('chatColorBotBubble').value = preset.botMessageBackground;
    document.getElementById('chatColorUserBubble').value = preset.userMessageBackground;
    document.getElementById('chatColorButton').value = preset.sendButtonColor;
    document.getElementById('chatColorTitle').value = preset.titleColor;

    window.updateLivePreview();
  };

  window.updateLivePreview = function() {
    const title = document.getElementById('chatPageTitleInput')?.value.trim() || 'ZainBot AI Sales Agent';
    const headerColor = document.getElementById('chatColorHeader')?.value || '#0f172a';
    const bgColor = document.getElementById('chatColorBg')?.value || '#0a0f1d';
    const botBubbleColor = document.getElementById('chatColorBotBubble')?.value || '#1e293b';
    const userBubbleColor = document.getElementById('chatColorUserBubble')?.value || '#06b6d4';
    const buttonColor = document.getElementById('chatColorButton')?.value || '#06b6d4';
    const titleColor = document.getElementById('chatColorTitle')?.value || '#ffffff';
    const questionsText = document.getElementById('chatPageSuggestedQuestions')?.value || '';
    const questionsEnabled = document.getElementById('chatPageSuggestedEnabled')?.checked !== false;
    const imageUploadEnabled = document.getElementById('chatPageImageUploadEnabled')?.checked !== false;

    // Update Header & Avatar
    const previewHeader = document.getElementById('previewHeader');
    if (previewHeader) previewHeader.style.backgroundColor = headerColor;

    const previewLogoImg = document.getElementById('previewLogoImg');
    const previewDefaultIcon = document.getElementById('previewDefaultIcon');
    if (currentChatLogoUrl) {
      if (previewLogoImg) {
        previewLogoImg.src = currentChatLogoUrl;
        previewLogoImg.style.display = 'block';
      }
      if (previewDefaultIcon) previewDefaultIcon.style.display = 'none';
    } else {
      if (previewLogoImg) {
        previewLogoImg.src = '';
        previewLogoImg.style.display = 'none';
      }
      if (previewDefaultIcon) previewDefaultIcon.style.display = 'block';
    }

    const previewTitle = document.getElementById('previewChatTitle');
    if (previewTitle) {
      previewTitle.textContent = title;
      previewTitle.style.color = titleColor;
    }

    // Update Container & Backgrounds
    const previewContainer = document.getElementById('livePreviewContainer');
    if (previewContainer) previewContainer.style.backgroundColor = bgColor;

    const previewChatArea = document.getElementById('previewChatArea');
    if (previewChatArea) previewChatArea.style.backgroundColor = bgColor;

    const previewFooter = document.getElementById('previewInputFooter');
    if (previewFooter) previewFooter.style.backgroundColor = headerColor;

    // Update Bubbles
    const isLightBotBubble = botBubbleColor.toLowerCase() === '#e2e8f0' || botBubbleColor.toLowerCase() === '#ffffff' || botBubbleColor.toLowerCase() === '#f8fafc';
    const botTextColor = isLightBotBubble ? '#0F172A' : '#FFFFFF';

    const b1 = document.getElementById('previewBotBubble1');
    if (b1) {
      b1.style.backgroundColor = botBubbleColor;
      b1.style.color = botTextColor;
    }
    const b2 = document.getElementById('previewBotBubble2');
    if (b2) {
      b2.style.backgroundColor = botBubbleColor;
      b2.style.color = botTextColor;
    }

    const ub = document.getElementById('previewUserBubble');
    if (ub) {
      ub.style.backgroundColor = userBubbleColor;
      ub.style.color = '#FFFFFF';
    }

    // Update Button & Image Toggle
    const sendBtn = document.getElementById('previewSendBtn');
    if (sendBtn) sendBtn.style.backgroundColor = buttonColor;

    const imgBtn = document.getElementById('previewImageBtn');
    if (imgBtn) imgBtn.style.display = imageUploadEnabled ? 'block' : 'none';

    // Update Questions Chips
    const questionsBar = document.getElementById('previewQuestionsBar');
    if (questionsBar) {
      if (questionsEnabled) {
        questionsBar.style.display = 'flex';
        questionsBar.innerHTML = '';
        const questionsList = questionsText.split('\n').map(s => s.trim()).filter(Boolean);
        const fallbackList = ['ما هي المنتجات والعروض المتوفرة؟', 'كيف يمكنني حجز موعد؟'];
        const displayList = questionsList.length > 0 ? questionsList : fallbackList;

        displayList.slice(0, 4).forEach((q, idx) => {
          const chip = document.createElement('div');
          chip.style.cssText = `padding:4px 10px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid ${buttonColor}; color:#fff; font-size:10px; white-space:nowrap; cursor:pointer; transition:all 0.2s; animation:questionFadeIn 0.3s ease ${(idx*0.1).toFixed(2)}s forwards;`;
          chip.textContent = q;
          chip.onclick = () => {
            const userB = document.getElementById('previewUserBubble');
            if (userB) userB.textContent = q;
          };
          questionsBar.appendChild(chip);
        });
      } else {
        questionsBar.style.display = 'none';
      }
    }
  };

  window.openChatPageModal = async function(bot = null) {
    const targetBot = bot || currentBot;
    if (!targetBot) return;

    const modal = document.getElementById('chatPageModal');
    if (!modal) return;

    // E03d pre-fetch opener capture (E03b lesson): the customizer load
    // below awaits the network, and activeElement may move meanwhile —
    // snapshot the opener before the first await.
    const opener = document.activeElement && document.activeElement.nodeType === 1
      ? document.activeElement
      : undefined;

    try {
      const res = await apiFetch(`/api/chat-page/bot/${targetBot._id}`);
      if (res && (res.success || res.link)) {
        document.getElementById('chatPageId').value = res.chatPageId || '';
        document.getElementById('chatPageBotId').value = targetBot._id;
        document.getElementById('chatPageTitleInput').value = res.title || targetBot.name || 'ZainBot AI Sales Agent';
        document.getElementById('chatPageSlugInput').value = res.linkId || '';

        // Reset and populate Logo
        currentChatLogoUrl = res.logoUrl || '';
        chatLogoFileToUpload = null;
        const logoInput = document.getElementById('chatPageLogoInput');
        if (logoInput) logoInput.value = '';

        const logoImg = document.getElementById('chatPageLogoImg');
        const defaultLogoIcon = document.getElementById('chatPageDefaultLogoIcon');
        const removeLogoBtn = document.getElementById('removeChatLogoBtn');

        if (currentChatLogoUrl) {
          if (logoImg) {
            logoImg.src = currentChatLogoUrl;
            logoImg.style.display = 'block';
          }
          if (defaultLogoIcon) defaultLogoIcon.style.display = 'none';
          if (removeLogoBtn) removeLogoBtn.style.display = 'inline-flex';
        } else {
          if (logoImg) {
            logoImg.src = '';
            logoImg.style.display = 'none';
          }
          if (defaultLogoIcon) defaultLogoIcon.style.display = 'block';
          if (removeLogoBtn) removeLogoBtn.style.display = 'none';
        }

        const colors = res.colors || {};
        document.getElementById('chatColorHeader').value = colors.header || '#0f172a';
        document.getElementById('chatColorBg').value = colors.outerBackgroundColor || '#0a0f1d';
        document.getElementById('chatColorBotBubble').value = colors.botMessageBackground || '#1e293b';
        document.getElementById('chatColorUserBubble').value = colors.userMessageBackground || '#06b6d4';
        document.getElementById('chatColorButton').value = colors.sendButtonColor || '#06b6d4';
        document.getElementById('chatColorTitle').value = res.titleColor || colors.titleColor || '#ffffff';

        const questions = Array.isArray(res.suggestedQuestions) ? res.suggestedQuestions.join('\n') : '';
        document.getElementById('chatPageSuggestedQuestions').value = questions;
        document.getElementById('chatPageSuggestedEnabled').checked = res.suggestedQuestionsEnabled !== false;
        document.getElementById('chatPageImageUploadEnabled').checked = res.imageUploadEnabled !== false;

        const liveLink = res.link || `${window.location.origin}/chat/${res.linkId}`;
        const liveLinkEl = document.getElementById('chatPageLiveLink');
        if (liveLinkEl) {
          liveLinkEl.href = liveLink;
          liveLinkEl.textContent = liveLink;
        }
        const openBtn = document.getElementById('openChatPageBtn');
        if (openBtn) openBtn.href = liveLink;

        const directCardLink = document.getElementById('btnDirectWebChat');
        if (directCardLink) directCardLink.href = liveLink;

        const widgetSnippet = `<script src="${window.location.origin}/widget.js" data-bot-id="${targetBot._id}"></script>`;
        document.getElementById('chatPageWidgetCode').value = widgetSnippet;

        // Trigger Live Preview Update
        window.updateLivePreview();
      }
    } catch (e) {
      console.error('Error fetching chat page:', e);
    }

    openChatPageDialog(opener);
  };

  window.copyChatPageDirectLink = function() {
    const linkEl = document.getElementById('chatPageLiveLink');
    if (!linkEl) return;
    const url = linkEl.href || linkEl.textContent;
    navigator.clipboard.writeText(url).then(() => {
      const t = translations[currentLanguage] || translations.en;
      alert(t.link_copied_ok || 'Link copied to clipboard!');
    });
  };

  window.copyWidgetEmbedCode = function() {
    const input = document.getElementById('chatPageWidgetCode');
    if (!input) return;
    navigator.clipboard.writeText(input.value).then(() => {
      const t = translations[currentLanguage] || translations.en;
      alert(t.code_copied_ok || 'Widget code copied to clipboard!');
    });
  };

  window.openDirectChatPage = async function(bot = null) {
    const targetBot = bot || currentBot;
    if (!targetBot) return;
    try {
      const res = await apiFetch(`/api/chat-page/bot/${targetBot._id}`);
      if (res && (res.link || res.linkId)) {
        const url = res.link || `${window.location.origin}/chat/${res.linkId}`;
        window.open(url, '_blank');
      } else {
        window.open(`${window.location.origin}/chat/${targetBot._id}`, '_blank');
      }
    } catch (e) {
      window.open(`${window.location.origin}/chat/${targetBot._id}`, '_blank');
    }
  };

  // E03d: chatPageModal runs on the shared focus lifecycle (§7.3), same
  // pattern as E03a/b/c. The helper owns focus/stack/inert only; `.active`
  // stays the visual switch — removed by onClose and by the explicit
  // fallback in closeChatPageDialog. Customizer population, preview,
  // payload and layout hooks are untouched and move no focus, so a late
  // load/save response never refocuses a closed dialog (close on a
  // non-open dialog is a no-op). No layout/CSS changes (B03 owns sizing).
  const openChatPageDialog = (opener) => {
    const chatPageModalEl = document.getElementById('chatPageModal');
    if (!chatPageModalEl) return;
    chatPageModalEl.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(chatPageModalEl, {
          opener: opener && opener.nodeType === 1 ? opener : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => chatPageModalEl.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeChatPageDialog = () => {
    const chatPageModalEl = document.getElementById('chatPageModal');
    if (!chatPageModalEl) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(chatPageModalEl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      chatPageModalEl.classList.remove('active');
    }
  };

  document.querySelectorAll('.chat-page-modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      closeChatPageDialog();
    });
  });

  const chatModalEl = document.getElementById('chatPageModal');
  if (chatModalEl) {
    chatModalEl.addEventListener('click', (e) => {
      if (e.target === chatModalEl) {
        closeChatPageDialog();
      }
    });
  }

  const chatPageForm = document.getElementById('chatPageForm');
  if (chatPageForm) {
    chatPageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = translations[currentLanguage] || translations.en;
      const chatPageId = document.getElementById('chatPageId').value;
      if (!chatPageId) return;

      let finalLogoUrl = currentChatLogoUrl;
      if (chatLogoFileToUpload) {
        try {
          const formData = new FormData();
          formData.append('image', chatLogoFileToUpload);
          const uploadRes = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          }).then(r => r.json());
          if (uploadRes && uploadRes.imageUrl) {
            finalLogoUrl = uploadRes.imageUrl;
          }
        } catch (uploadErr) {
          console.warn('Logo upload failed, proceeding with previous logo url:', uploadErr);
        }
      }

      const chosenBg = document.getElementById('chatColorBg')?.value || '#0a0f1d';
      const questionsText = document.getElementById('chatPageSuggestedQuestions')?.value || '';
      const questionsList = questionsText.split('\n').map(s => s.trim()).filter(Boolean);

      const payload = {
        title: document.getElementById('chatPageTitleInput').value.trim(),
        titleColor: document.getElementById('chatColorTitle').value,
        linkId: document.getElementById('chatPageSlugInput').value.trim(),
        logoUrl: finalLogoUrl,
        colors: {
          header: document.getElementById('chatColorHeader').value,
          outerBackgroundColor: chosenBg,
          containerBackgroundColor: chosenBg,
          chatAreaBackground: chosenBg,
          botMessageBackground: document.getElementById('chatColorBotBubble').value,
          botMessageTextColor: '#ffffff',
          userMessageBackground: document.getElementById('chatColorUserBubble').value,
          userMessageTextColor: '#ffffff',
          sendButtonColor: document.getElementById('chatColorButton').value,
          button: document.getElementById('chatColorButton').value,
          titleColor: document.getElementById('chatColorTitle').value,
        },
        suggestedQuestions: questionsList,
        suggestedQuestionsEnabled: document.getElementById('chatPageSuggestedEnabled').checked,
        imageUploadEnabled: document.getElementById('chatPageImageUploadEnabled').checked,
      };

      try {
        const res = await apiFetch(`/api/chat-page/${chatPageId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          // Invalidate client caches
          try {
            if (window.clearPageCache) window.clearPageCache('publicChatPage');
            localStorage.removeItem('publicChatPage_' + payload.linkId);
            localStorage.removeItem('publicChatPage_' + chatPageId);
          } catch (cErr) {}

          alert(t.chat_page_saved_ok || 'Chat page settings saved successfully!');
          closeChatPageDialog();
          if (res.link) {
            const liveLinkEl = document.getElementById('chatPageLiveLink');
            if (liveLinkEl) { liveLinkEl.href = res.link; liveLinkEl.textContent = res.link; }
            const directCardLink = document.getElementById('btnDirectWebChat');
            if (directCardLink) directCardLink.href = res.link;
          }
        } else {
          alert(res?.message || 'Failed to save chat page settings');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 6. DEVELOPER SETTINGS & WEBHOOKS
  let devApiKeys = [];
  let webhookLogs = [];

  // D07a: settings resources load INDEPENDENTLY — each section has its own
  // try/catch, so an early failure never blocks recipients/logs. Every
  // section returns true (loaded), false (failed), or 'stale' (superseded).
  let settingsRun = 0;
  async function loadSettingsApiKeys() {
    try {
      const keysRes = await dashboardRequest('/api/integrations/keys');
      if (!(keysRes && keysRes.success)) throw new Error('Keys unavailable');
      devApiKeys = keysRes.data;
      renderApiKeys();
      return true;
    } catch (e) {
      console.error('loadSettingsApiKeys_error', e);
      return false;
    }
  }
  async function loadSettingsWebhookConfig(botId) {
    try {
      const whRes = await dashboardRequest(`/api/integrations/webhooks?botId=${botId}`);
      if (whRes && whRes.success && whRes.data) {
        const config = whRes.data;
        document.getElementById('webhookUrlInput').value = config.url || '';
        document.getElementById('webhookSecretInput').value = config.secret || '';

        // Toggles checkbox events
        const checkboxes = document.getElementsByName('webhookEvents');
        checkboxes.forEach(chk => {
          chk.checked = config.events ? config.events.includes(chk.value) : false;
        });
      }
      return true;
    } catch (e) {
      console.error('loadSettingsWebhookConfig_error', e);
      return false;
    }
  }
  async function loadSettingsWebhookLogs(botId) {
    try {
      const logsRes = await dashboardRequest(`/api/integrations/webhooks/logs?botId=${botId}`);
      if (!(logsRes && logsRes.success)) throw new Error('Webhook logs unavailable');
      webhookLogs = logsRes.data;
      renderWebhookLogs();
      return true;
    } catch (e) {
      console.error('loadSettingsWebhookLogs_error', e);
      return false;
    }
  }
  async function loadSettingsData() {
    if (!currentBot) return;
    const botId = String(currentBot._id);
    const run = ++settingsRun;

    await loadSettingsApiKeys();
    if (run !== settingsRun || String(currentBot?._id) !== botId) return;
    await loadSettingsWebhookConfig(botId);
    if (run !== settingsRun || String(currentBot?._id) !== botId) return;
    await loadSettingsWebhookLogs(botId);
    if (run !== settingsRun || String(currentBot?._id) !== botId) return;

    // Local bot-direct paints (no fetch).
    const backupKeysSec = document.getElementById('backupKeysSection');
    if (backupKeysSec) {
      const isGrowth = currentUser && currentUser.subscriptionTier && currentUser.subscriptionTier.startsWith('growth');
      backupKeysSec.style.display = isGrowth ? 'block' : 'none';
    }

    document.getElementById('backupProvider').value = currentBot.backupProvider || 'openai';
    document.getElementById('backupApiKey').value = currentBot.backupApiKey || '';
    document.getElementById('backupModel').value = currentBot.backupModel || '';
    document.getElementById('backupBaseUrl').value = currentBot.backupBaseUrl || '';

    // Load the model selector for this account's entitlements
    await loadPrimaryModelSelect();

    // Load multi-channel notification recipients
    await loadNotificationRecipients();
  }

  function modelOptionValue(provider, modelId) {
    return `${provider}::${modelId}`;
  }

  async function loadPrimaryModelSelect() {
    const select = document.getElementById('primaryModelSelect');
    if (!select || !currentBot) return;
    const t = translations[currentLanguage] || translations.en;

    try {
      const res = await apiFetch('/api/ai/available-models');
      if (!res || !res.success) return;
      const { allowAuto, models } = res.data;

      select.innerHTML = '';
      if (allowAuto !== false) {
        const autoOption = document.createElement('option');
        autoOption.value = '';
        autoOption.textContent = t.model_select_auto;
        select.appendChild(autoOption);
      }
      (models || []).forEach((model) => {
        const option = document.createElement('option');
        option.value = modelOptionValue(model.provider, model.modelId);
        option.textContent = `${model.displayName} (${model.provider})`;
        select.appendChild(option);
      });

      // Preselect the bot's saved manual model when it is still offered.
      const savedProvider = String(currentBot.userProvider || '').toLowerCase();
      const savedModel = String(currentBot.userModel || '');
      const savedValue = savedModel
        ? modelOptionValue(savedProvider === 'gemini' ? 'google' : savedProvider, savedModel)
        : '';
      if (savedValue && [...select.options].some((opt) => opt.value === savedValue)) {
        select.value = savedValue;
      } else if (![...select.options].some((opt) => opt.value === '')) {
        // Auto not allowed and saved model unavailable: default to first entry
        if (select.options.length > 0) select.selectedIndex = 0;
      }
    } catch (e) {
      console.error(e);
    }
  }

  const savePrimaryModelBtn = document.getElementById('savePrimaryModelBtn');
  savePrimaryModelBtn?.addEventListener('click', async () => {
    if (!currentBot) return;
    const t = translations[currentLanguage] || translations.en;
    const select = document.getElementById('primaryModelSelect');
    const msgEl = document.getElementById('modelSaveMsg');
    const showMsg = (text, ok) => {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.style.color = ok ? 'var(--green)' : 'var(--red)';
    };

    if (!select) return;
    const [provider, modelId] = String(select.value).split('::');

    try {
      savePrimaryModelBtn.disabled = true;
      const res = await apiFetch(`/api/bots/${currentBot._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          userProvider: provider || 'openai',
          userModel: modelId || ''
        })
      });
      savePrimaryModelBtn.disabled = false;

      if (res && res.success) {
        currentBot.userProvider = provider || '';
        currentBot.userModel = modelId || '';
        showMsg(t.model_saved_ok, true);
      } else if (res && res.error === 'AI_MODEL_NOT_ENTITLED') {
        showMsg(t.model_save_failed, false);
      } else {
        showMsg(t.model_save_failed, false);
      }
    } catch (e) {
      savePrimaryModelBtn.disabled = false;
      console.error(e);
      showMsg(t.model_save_failed, false);
    }
  });

  function renderApiKeys() {
    const apiKeysContainer = document.getElementById('apiKeysContainer');
    if (!apiKeysContainer) return;
    apiKeysContainer.innerHTML = '';

    if (devApiKeys.length === 0) {
      apiKeysContainer.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).api_keys_empty}</div>`;
      return;
    }

    devApiKeys.forEach(key => {
      const card = document.createElement('div');
      card.className = 'glass-card';
      card.style.padding = '12px 16px';
      card.style.marginBottom = '8px';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';

      card.innerHTML = `
        <div>
          <h4 style="font-size:13px; font-weight:600; margin-bottom:2px;">${key.name}</h4>
          <span style="font-size:11px; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).created_label}: ${formatDate(key.createdAt, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="revokeApiKey('${key._id}')" style="padding:6px 10px; border-color:rgba(239, 68, 68, 0.3); color:var(--red);"><i class="fas fa-trash"></i></button>
      `;
      apiKeysContainer.appendChild(card);
    });
  }

  function renderWebhookLogs() {
    const tableBody = document.getElementById('webhookLogsTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    if (webhookLogs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).webhook_history_empty}</td></tr>`;
      return;
    }

    webhookLogs.forEach(log => {
      const row = document.createElement('tr');
      const badge = log.success ? 'badge-success' : 'badge-danger';
      const t = translations[currentLanguage] || translations.en;
      const statusText = log.responseStatus ? log.responseStatus : t.webhook_status_timeout;

      row.innerHTML = `
        <td>${formatDate(log.timestamp)}</td>
        <td><code>${log.event}</code></td>
        <td>${log.url}</td>
        <td><span class="badge ${badge}">${statusText}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick="retryWebhook('${log._id}')" style="padding:4px 8px;"><i class="fas fa-redo"></i> ${t.webhook_retry_action}</button></td>
      `;
      tableBody.appendChild(row);
    });
  }

  // Generate Dev Key Event
  const generateKeyBtn = document.getElementById('generateKeyBtn');
  if (generateKeyBtn) {
    generateKeyBtn.addEventListener('click', async () => {
      const t = translations[currentLanguage] || translations.en;
      const name = prompt(t.apikey_name_prompt);
      if (!name) return;

      try {
        const res = await apiFetch('/api/integrations/keys', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
        if (res && res.success) {
          alert(t.apikey_created_alert.split('{key}').join(res.data.key));
          loadSettingsData();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Save webhook config
  const webhookConfigForm = document.getElementById('webhookConfigForm');
  if (webhookConfigForm) {
    webhookConfigForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const url = document.getElementById('webhookUrlInput').value.trim();
      const checkBoxes = document.getElementsByName('webhookEvents');
      const events = [];
      checkBoxes.forEach(chk => {
        if (chk.checked) events.push(chk.value);
      });

      try {
        const res = await apiFetch('/api/integrations/webhooks', {
          method: 'POST',
          body: JSON.stringify({
            botId: currentBot._id,
            url,
            events
          })
        });
        if (res && res.success) {
          document.getElementById('webhookSecretInput').value = res.data.secret;
          alert((translations[currentLanguage] || translations.en).webhook_saved_ok);
          loadSettingsData();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Backup keys settings save
  const backupKeysForm = document.getElementById('backupKeysForm');
  if (backupKeysForm) {
    backupKeysForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const backupProvider = document.getElementById('backupProvider').value;
      const backupApiKey = document.getElementById('backupApiKey').value.trim();
      const backupModel = document.getElementById('backupModel').value.trim();
      const backupBaseUrl = document.getElementById('backupBaseUrl').value.trim();

      try {
        const res = await apiFetch(`/api/bots/${currentBot._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            backupProvider,
            backupApiKey,
            backupModel,
            backupBaseUrl
          })
        });

        if (res && res.success) {
          alert((translations[currentLanguage] || translations.en).backup_saved_ok);
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  // 7. SUPER ADMIN CONTROL CENTER & USERS MANAGEMENT
  let adminUsersList = [];
  let adminKeys = [];

  // C03: SUPERSEDED legacy pair (kept without cleanup per plan). Function hoisting
  // means the paginated loader + DOM-based renderer below are the live ones that
  // every caller — and the language render registry — actually invoke.
  async function loadAdminUsers() {
    try {
      const res = await apiFetch('/api/users?populate=bots');
      adminUsersList = Array.isArray(res) ? res : (res && res.data ? res.data : []);
      renderAdminUsers();
    } catch (e) {
      console.error('Error loading admin users:', e);
    }
  }

  function renderAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const isAr = currentLanguage === 'ar';

    if (adminUsersList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">${isAr ? 'لا يوجد مستخدمين مسجلين حالياً.' : 'No users registered yet.'}</td></tr>`;
      return;
    }

    adminUsersList.forEach((u) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--glass-border)';

      const roleBadge = u.role === 'superadmin'
        ? `<span class="badge" style="background:var(--orange); color:#000; font-weight:700;">${isAr ? 'مدير عام (SuperAdmin)' : 'Super Admin'}</span>`
        : `<span class="badge" style="background:var(--blue); color:#fff;">${isAr ? 'تاجر / مستخدم' : 'Merchant / User'}</span>`;

      const statusBadge = u.status === 'suspended'
        ? `<span class="badge badge-danger">${isAr ? 'موقوف' : 'Suspended'}</span>`
        : `<span class="badge badge-success">${isAr ? 'نشط' : 'Active'}</span>`;

      const botsCount = Array.isArray(u.bots) ? u.bots.length : 0;
      const botUnitText = isAr ? 'بوت' : 'Bot(s)';

      const suspendText = u.status === 'suspended' 
        ? (isAr ? '<i class="fas fa-check"></i> تفعيل' : '<i class="fas fa-check"></i> Activate')
        : (isAr ? '<i class="fas fa-ban" style="color:var(--red);"></i> تعليق' : '<i class="fas fa-ban" style="color:var(--red);"></i> Suspend');

      const impersonateText = isAr ? '<i class="fas fa-user-secret"></i> دخول كـ' : '<i class="fas fa-user-secret"></i> Login As';

      tr.innerHTML = `
        <td style="padding:12px; font-weight:600;">${u.username}</td>
        <td style="padding:12px; font-size:12px; color:var(--cyan);">${u.email}</td>
        <td style="padding:12px;">${roleBadge}</td>
        <td style="padding:12px; font-size:12px;">${u.subscriptionTier || 'free'}</td>
        <td style="padding:12px;">${statusBadge}</td>
        <td style="padding:12px; font-size:12px;">${botsCount} ${botUnitText}</td>
        <td style="padding:12px; text-align:center;">
          <button class="btn btn-secondary btn-sm" onclick="toggleUserStatus('${u._id}', '${u.status === 'suspended' ? 'active' : 'suspended'}')" style="padding:4px 8px; font-size:11px; margin-left:4px;">
            ${suspendText}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="impersonateUser('${u._id}')" style="padding:4px 8px; font-size:11px; border-color:var(--orange); color:var(--orange);">
            ${impersonateText}
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.toggleUserStatus = async function(userId, newStatus) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.admin_legacy_status_confirm.replace('{status}', newStatus === 'active' ? t.admin_active : t.admin_suspended))) return;
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      loadAdminUsers();
    } catch (e) {
      alert(t.admin_legacy_status_failed);
    }
  };

  window.impersonateUser = async function(userId) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.admin_legacy_impersonate_confirm)) return;
    try {
      const res = await apiFetch('/api/admin/impersonation/sessions', {
        method: 'POST',
        body: JSON.stringify({ subjectUserId: userId })
      });
      if (res && res.token) {
        localStorage.setItem('token', res.token);
        alert(t.admin_legacy_impersonate_ok);
        window.location.reload();
      } else {
        alert(res?.message || t.admin_legacy_impersonate_failed);
      }
    } catch (e) {
      alert(t.admin_legacy_auth_error);
    }
  };

  // Real admin controls replace the legacy table renderer above. They use DOM
  // nodes for user data so a username or email can never become HTML markup.
  const adminUsersPageState = { page: 1, pages: 1, total: 0, limit: 25 };
  const adminUserModal = document.getElementById('adminUserModal');
  // E03b: adminUserModal runs on the shared focus lifecycle (§7.3), same
  // pattern as E03a. The helper owns focus/stack/inert only; `.active`
  // stays the visual switch — removed by onClose and by the explicit
  // fallback in closeAdminUserDialog. Role/tier/status population, payloads
  // and the post-save reload are untouched and move no focus, so a late
  // edit-fetch or save response never refocuses a closed dialog (close on
  // a non-open dialog is a no-op).
  const openAdminUserDialog = () => {
    if (!adminUserModal) return;
    adminUserModal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(adminUserModal, {
          opener: document.activeElement && document.activeElement.nodeType === 1
            ? document.activeElement
            : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => adminUserModal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeAdminUserDialog = () => {
    if (!adminUserModal) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(adminUserModal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      adminUserModal.classList.remove('active');
    }
  };
  const impersonationModal = document.getElementById('impersonationModal');

  function adminCell(row, value, style = '') {
    const cell = document.createElement('td');
    cell.style.cssText = `padding:12px;${style}`;
    cell.textContent = value || '—';
    row.appendChild(cell);
  }

  function quotaLimitForTier(tier) {
    return ({ growth_1k: 1000, growth_10k: 10000, growth_50k: 50000, unlimited: 999999 })[tier] || 250;
  }

  function renderAccountMenu() {
    if (!currentUser) return;
    const text = translations[currentLanguage] || translations.en;
    const used = Number(currentUser.monthlyMessagesUsed) || 0;
    const unlimited = currentUser.subscriptionTier === 'unlimited';
    const remaining = unlimited ? text.quota_unlimited : Math.max(0, quotaLimitForTier(currentUser.subscriptionTier) - used);
    document.getElementById('accountMenuName').textContent = currentUser.username || '—';
    document.getElementById('accountMenuEmail').textContent = currentUser.email || '—';
    document.getElementById('accountMenuQuota').textContent = unlimited ? remaining : `${remaining} / ${quotaLimitForTier(currentUser.subscriptionTier)}`;
  }

  function clientAgentLimit(tier) {
    return ({ free: 1, growth_1k: 5, growth_10k: 15, growth_50k: 50, unlimited: Infinity })[tier] || 1;
  }

  function refreshActiveBot(bot) {
    currentBot = bot;
    localStorage.setItem('zainbot_active_bot_id', String(bot._id));
    const widgetSnippetCode = document.getElementById('widgetSnippetCode');
    if (widgetSnippetCode) widgetSnippetCode.textContent = `<script src="${window.location.origin}/widget.js" data-bot-id="${bot._id}"></script>`;
    loadAgents();
  }

  function renderAgents() {
    const list = document.getElementById('agentsList');
    const entitlement = document.getElementById('agentsEntitlement');
    if (!list || !entitlement) return;
    const t = translations[currentLanguage] || translations.en;
    const tier = currentUser?.subscriptionTier || 'free';
    const limit = clientAgentLimit(tier);
    entitlement.textContent = `${workspaceBots.length} / ${limit === Infinity ? '∞' : limit} ${t.agents_entitlement_unit} ${tier}`;
    list.replaceChildren();
    workspaceBots.forEach((bot) => {
      const card = document.createElement('article');
      card.className = 'glass-card';
      card.style.padding = '18px';
      const title = document.createElement('h3');
      title.textContent = bot.name;
      title.style.marginBottom = '6px';
      const meta = document.createElement('p');
      meta.textContent = `${String(bot.agentType || 'customer_support').replaceAll('_', ' ')} · ${bot.autoReplyEnabled === false ? t.agent_autoreply_off : t.agent_autoreply_on}`;
      meta.style.cssText = 'font-size:12px; color:var(--text-muted); margin-bottom:12px;';
      const description = document.createElement('p');
      description.textContent = bot.description || bot.welcomeMessage || t.agent_no_description;
      description.style.cssText = 'font-size:13px; color:var(--text-muted); min-height:40px;';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;';
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'btn btn-secondary btn-sm'; select.textContent = String(currentBot?._id) === String(bot._id) ? t.agent_current : t.agent_use_this;
      select.disabled = String(currentBot?._id) === String(bot._id);
      select.addEventListener('click', () => refreshActiveBot(bot));
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm'; edit.textContent = t.action_edit; edit.addEventListener('click', () => openAgentModal(bot));
      const chatBtn = document.createElement('button');
      chatBtn.type = 'button'; chatBtn.className = 'btn btn-primary btn-sm'; chatBtn.innerHTML = `<i class="fas fa-comments"></i> ${t.agent_customize_chat}`;
      chatBtn.addEventListener('click', () => window.openChatPageModal(bot));
      actions.append(select, edit, chatBtn); card.append(title, meta, description, actions); list.appendChild(card);
    });
    if (workspaceBots.length === 0) {
      const empty = document.createElement('div'); empty.className = 'glass-card'; empty.textContent = t.agents_empty_create_first; list.appendChild(empty);
    }
  }

  async function loadAgents() {
    await loadBots();
    renderAgents();
    if (window.__zainbotRenderSettingsSummary) setTimeout(window.__zainbotRenderSettingsSummary, 60);
  }

  var FREE_MAX_TOOLS = 3;
  function enforceToolAndSkillTierLimits() {
    var isFree = !currentUser?.subscriptionTier || currentUser.subscriptionTier === 'free';
    var skillCheckboxes = Array.from(document.querySelectorAll('input[name="agentSkill"]'));
    // Skills are unlimited on all plans: always enable.
    skillCheckboxes.forEach(function (chk) {
      chk.disabled = false;
      if (chk.parentElement) {
        chk.parentElement.style.opacity = '1';
        chk.parentElement.style.cursor = 'pointer';
        chk.parentElement.title = '';
      }
    });
    if (!isFree) {
      ['agentToolBooking', 'agentToolOrders', 'agentToolWhatsapp', 'agentToolTelegram', 'agentToolSalesRecovery', 'agentToolDailyDigest', 'agentToolSalesUpsell'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) {
          el.disabled = false;
          if (el.parentElement) {
            el.parentElement.style.opacity = '1';
            el.parentElement.style.cursor = 'pointer';
            el.parentElement.title = '';
          }
        }
      });
      return;
    }

    // 1. Tool Checkboxes Limit (Max 3 for free, across all agent tools)
    const toolCheckboxes = [
      document.getElementById('agentToolBooking'),
      document.getElementById('agentToolOrders'),
      document.getElementById('agentToolWhatsapp'),
      document.getElementById('agentToolTelegram'),
      document.getElementById('agentToolSalesRecovery'),
      document.getElementById('agentToolDailyDigest'),
      document.getElementById('agentToolSalesUpsell')
    ].filter(Boolean);

    const checkedTools = toolCheckboxes.filter(chk => chk.checked);
    const toolsMaxReached = checkedTools.length >= FREE_MAX_TOOLS;

    toolCheckboxes.forEach(chk => {
      if (!chk.checked) {
        chk.disabled = toolsMaxReached;
        if (chk.parentElement) {
          chk.parentElement.style.opacity = toolsMaxReached ? '0.45' : '1';
          chk.parentElement.style.cursor = toolsMaxReached ? 'not-allowed' : 'pointer';
          chk.parentElement.title = toolsMaxReached ? (translations[currentLanguage] || translations.en).agent_free_tools_limit : '';
        }
      } else {
        chk.disabled = false;
        if (chk.parentElement) {
          chk.parentElement.style.opacity = '1';
          chk.parentElement.style.cursor = 'pointer';
          chk.parentElement.title = '';
        }
      }
    });
  }

  const agentModal = document.getElementById('agentModal');
  // E03a: agentModal runs on the shared focus lifecycle (§7.3), same
  // pattern as E02. The helper owns focus/stack/inert only; `.active`
  // stays the visual switch — removed by onClose and by the explicit
  // fallback in closeAgentDialog. Permissions, tier limits, payloads and
  // the delayed post-save paths (loadAgents/refreshActiveBot/summary
  // timer) are untouched and move no focus, so a late response never
  // refocuses a closed dialog (close on a non-open dialog is a no-op).
  const openAgentDialog = () => {
    if (!agentModal) return;
    agentModal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(agentModal, {
          opener: document.activeElement && document.activeElement.nodeType === 1
            ? document.activeElement
            : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => agentModal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeAgentDialog = () => {
    if (!agentModal) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(agentModal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      agentModal.classList.remove('active');
    }
  };
  function openAgentModal(bot = null) {
    const form = document.getElementById('agentForm');
    if (!agentModal || !form) return;
    form.reset();
    document.getElementById('agentId').value = bot?._id || '';
    document.getElementById('agentModalTitle').textContent = bot ? (translations[currentLanguage] || translations.en).agent_modal_edit : (translations[currentLanguage] || translations.en).agent_modal_create;
    
    const isFree = !currentUser?.subscriptionTier || currentUser.subscriptionTier === 'free';

    if (bot) {
      document.getElementById('agentName').value = bot.name || '';
      document.getElementById('agentType').value = bot.agentType || 'customer_support';
      document.getElementById('agentDescription').value = bot.description || '';
      document.getElementById('agentWelcomeMessage').value = bot.welcomeMessage || '';
      document.getElementById('agentInstructions').value = bot.customInstructions || '';
      document.getElementById('agentObjectives').value = Array.isArray(bot.objectives) ? bot.objectives.join('\n') : '';
      document.getElementById('agentHandoffKeywords').value = Array.isArray(bot.handoffKeywords) ? bot.handoffKeywords.join(', ') : '';
      document.getElementById('agentAutoReplyEnabled').checked = bot.autoReplyEnabled !== false;

      // Tools population
      const tools = bot.agentTools || {};
      const hasExplicitTools = Boolean(tools.bookingTool || tools.orderTrackingTool || tools.whatsappNotificationTool || tools.telegramNotificationTool || tools.salesRecoveryTool || tools.dailyDigestTool || tools.salesUpsellTool || tools.messageClassificationTool);

      const toolBooking = document.getElementById('agentToolBooking');
      const toolOrders = document.getElementById('agentToolOrders');
      const toolWa = document.getElementById('agentToolWhatsapp');
      const toolTg = document.getElementById('agentToolTelegram');

      if (hasExplicitTools) {
        if (toolBooking) toolBooking.checked = Boolean(tools.bookingTool?.enabled);
        if (toolOrders) toolOrders.checked = Boolean(tools.orderTrackingTool?.enabled);
        if (toolWa) toolWa.checked = Boolean(tools.whatsappNotificationTool?.enabled);
        if (toolTg) toolTg.checked = Boolean(tools.telegramNotificationTool?.enabled);
      } else {
        // Legacy bot without tools configured
        if (toolBooking) toolBooking.checked = true;
        if (toolOrders) toolOrders.checked = true;
        if (toolWa) toolWa.checked = !isFree;
        if (toolTg) toolTg.checked = !isFree;
      }

      const bookingHours = document.getElementById('agentBookingWorkingHours');
      if (bookingHours) bookingHours.value = tools.bookingTool?.workingHours || '09:00 - 22:00';
      const bookingService = document.getElementById('agentBookingDefaultService');
      if (bookingService) bookingService.value = tools.bookingTool?.defaultService || 'استشارة / موعد';

      // Sales & Marketing tools population
      const toolRecovery = document.getElementById('agentToolSalesRecovery');
      if (toolRecovery) toolRecovery.checked = tools.salesRecoveryTool ? tools.salesRecoveryTool.enabled !== false : true;
      const delayEl = document.getElementById('agentSalesRecoveryDelay');
      if (delayEl) delayEl.value = String(tools.salesRecoveryTool?.delayHours || 2);
      const msgEl = document.getElementById('agentSalesRecoveryMsg');
      if (msgEl) msgEl.value = tools.salesRecoveryTool?.customMessage || '';

      const toolDigest = document.getElementById('agentToolDailyDigest');
      if (toolDigest) toolDigest.checked = tools.dailyDigestTool ? tools.dailyDigestTool.enabled !== false : true;
      const channelEl = document.getElementById('agentDailyDigestChannel');
      if (channelEl) channelEl.value = tools.dailyDigestTool?.preferredChannel || 'all';
      const timeEl = document.getElementById('agentDailyDigestTime');
      if (timeEl) timeEl.value = tools.dailyDigestTool?.digestTime || '21:00';

      const toolUpsell = document.getElementById('agentToolSalesUpsell');
      if (toolUpsell) toolUpsell.checked = tools.salesUpsellTool ? tools.salesUpsellTool.enabled !== false : true;
      const toneEl = document.getElementById('agentSalesTone');
      if (toneEl) toneEl.value = tools.salesUpsellTool?.salesTone || 'consultative';
      const discountEl = document.getElementById('agentMaxDiscount');
      if (discountEl) discountEl.value = String(tools.salesUpsellTool?.maxDiscountPercent || 0);

      // Skills checkboxes population (all skills available on every plan)
      const rawSkills = Array.isArray(bot.agentSkills) && bot.agentSkills.length > 0
        ? bot.agentSkills.map(s => typeof s === 'string' ? s : s?.skillKey).filter(Boolean)
        : ['sales_consultant', 'appointment_scheduler', 'order_manager', 'support_specialist', 'winback_agent'];

      const allowedSkills = rawSkills;
      document.querySelectorAll('input[name="agentSkill"]').forEach(chk => {
        chk.checked = allowedSkills.includes(chk.value);
      });
    } else {
      // Default for new agent: free gets 3 tools (booking + orders + recovery), all skills
      const toolBooking = document.getElementById('agentToolBooking');
      if (toolBooking) toolBooking.checked = true;
      const toolOrders = document.getElementById('agentToolOrders');
      if (toolOrders) toolOrders.checked = true;
      const toolWa = document.getElementById('agentToolWhatsapp');
      if (toolWa) toolWa.checked = !isFree;
      const toolTg = document.getElementById('agentToolTelegram');
      if (toolTg) toolTg.checked = !isFree;

      const toolRecovery = document.getElementById('agentToolSalesRecovery');
      if (toolRecovery) toolRecovery.checked = true;
      const delayEl = document.getElementById('agentSalesRecoveryDelay');
      if (delayEl) delayEl.value = '2';
      const msgEl = document.getElementById('agentSalesRecoveryMsg');
      if (msgEl) msgEl.value = '';

      const toolDigest = document.getElementById('agentToolDailyDigest');
      if (toolDigest) toolDigest.checked = !isFree;
      const channelEl = document.getElementById('agentDailyDigestChannel');
      if (channelEl) channelEl.value = 'all';
      const timeEl = document.getElementById('agentDailyDigestTime');
      if (timeEl) timeEl.value = '21:00';

      const toolUpsell = document.getElementById('agentToolSalesUpsell');
      if (toolUpsell) toolUpsell.checked = !isFree;
      const toneEl = document.getElementById('agentSalesTone');
      if (toneEl) toneEl.value = 'consultative';
      const discountEl = document.getElementById('agentMaxDiscount');
      if (discountEl) discountEl.value = '0';

      document.querySelectorAll('input[name="agentSkill"]').forEach((chk) => {
        chk.checked = true;
      });
    }

    enforceToolAndSkillTierLimits();
    openAgentDialog();
  }

  // Bind change listeners to lock/unlock on user click
  ['agentToolBooking', 'agentToolOrders', 'agentToolWhatsapp', 'agentToolTelegram', 'agentToolSalesRecovery', 'agentToolDailyDigest', 'agentToolSalesUpsell'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', enforceToolAndSkillTierLimits);
  });
  document.querySelectorAll('input[name="agentSkill"]').forEach(chk => {
    chk.addEventListener('change', enforceToolAndSkillTierLimits);
  });

  document.getElementById('createAgentBtn')?.addEventListener('click', () => openAgentModal());
  document.querySelectorAll('.agent-modal-close').forEach((button) => button.addEventListener('click', () => closeAgentDialog()));
  document.getElementById('agentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('agentId').value;
    const splitValues = (value, separator) => value.split(separator).map((item) => item.trim()).filter(Boolean);

    const selectedSkills = Array.from(document.querySelectorAll('input[name="agentSkill"]:checked')).map(el => el.value);
    const agentTools = {
      bookingTool: {
        enabled: document.getElementById('agentToolBooking')?.checked === true,
        workingHours: document.getElementById('agentBookingWorkingHours')?.value.trim() || '09:00 - 22:00',
        defaultService: document.getElementById('agentBookingDefaultService')?.value.trim() || 'استشارة / موعد',
      },
      orderTrackingTool: {
        enabled: document.getElementById('agentToolOrders')?.checked === true,
      },
      whatsappNotificationTool: {
        enabled: document.getElementById('agentToolWhatsapp')?.checked === true,
      },
      telegramNotificationTool: {
        enabled: document.getElementById('agentToolTelegram')?.checked === true,
      },
      salesRecoveryTool: {
        enabled: document.getElementById('agentToolSalesRecovery')?.checked === true,
        delayHours: parseInt(document.getElementById('agentSalesRecoveryDelay')?.value) || 2,
        customMessage: document.getElementById('agentSalesRecoveryMsg')?.value?.trim() || '',
      },
      dailyDigestTool: {
        enabled: document.getElementById('agentToolDailyDigest')?.checked === true,
        preferredChannel: document.getElementById('agentDailyDigestChannel')?.value || 'all',
        digestTime: document.getElementById('agentDailyDigestTime')?.value || '21:00',
      },
      salesUpsellTool: {
        enabled: document.getElementById('agentToolSalesUpsell')?.checked === true,
        salesTone: document.getElementById('agentSalesTone')?.value || 'consultative',
        maxDiscountPercent: parseInt(document.getElementById('agentMaxDiscount')?.value) || 0,
      },
      messageClassificationTool: {
        enabled: true,
        autoTag: true,
      }
    };

    const payload = {
      name: document.getElementById('agentName').value.trim(),
      agentType: document.getElementById('agentType').value,
      description: document.getElementById('agentDescription').value.trim(),
      welcomeMessage: document.getElementById('agentWelcomeMessage').value.trim(),
      customInstructions: document.getElementById('agentInstructions').value.trim(),
      objectives: splitValues(document.getElementById('agentObjectives').value, '\n'),
      handoffKeywords: splitValues(document.getElementById('agentHandoffKeywords').value, ','),
      autoReplyEnabled: document.getElementById('agentAutoReplyEnabled').checked,
      agentTools,
      agentSkills: selectedSkills,
    };
    // D09: single-flight agent save (no duplicate agents on double submit);
    // the dialog stays open with the draft on every failure path.
    const agentCore = window.ZainBotRequest;
    const agentRun = agentCore && typeof agentCore.runExclusive === 'function'
      ? (k, op) => agentCore.runExclusive(k, op)
      : (k, op) => op();
    const agentFeedback = window.ZainBotFeedback;
    const agentFormEl = document.getElementById('agentForm');
    const agentSubmitBtn = agentFormEl ? agentFormEl.querySelector('[type="submit"]') : null;
    const agentGuarded = agentFeedback && typeof agentFeedback.withPending === 'function' && agentSubmitBtn
      ? () => agentFeedback.withPending(id ? `agent-save:${id}` : 'agent-save:new', [agentSubmitBtn], () => saveAgent(payload, id))
      : () => saveAgent(payload, id);
    try {
      await agentRun(id ? `agent-save:${id}` : 'agent-save:new', agentGuarded);
    } catch (err) {
      console.error(err);
      alert((translations[currentLanguage] || translations.en).agent_save_failed);
    }

    async function saveAgent(body, id) {
      const result = await apiFetch(id ? `/api/bots/${id}` : '/api/bots', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      if (!result || result.error || result.message && !result._id && !result.success) return alert(result?.message || (translations[currentLanguage] || translations.en).agent_save_failed);
      closeAgentDialog();
      await loadAgents();
      if (!id && result._id) refreshActiveBot(result);
      if (window.__zainbotRenderSettingsSummary) setTimeout(window.__zainbotRenderSettingsSummary, 150);
    }
  });

  // Wire AI Sales Automation Center trigger buttons
  const triggerRecoveryBtn = document.getElementById('triggerRecoveryBtn');
  if (triggerRecoveryBtn) {
    triggerRecoveryBtn.addEventListener('click', async () => {
      if (!currentBot) return;
      const t = translations[currentLanguage] || translations.en;
      const feedbackBox = document.getElementById('automationFeedbackBox');
      triggerRecoveryBtn.disabled = true;
      triggerRecoveryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t.automation_checking;
      try {
        const res = await apiFetch(`/api/bots/${currentBot._id}/trigger-automation`, {
          method: 'POST',
          body: JSON.stringify({ action: 'sales_recovery' })
        });
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(16, 185, 129, 0.15)';
          feedbackBox.style.border = '1px solid var(--green)';
          feedbackBox.style.color = 'var(--green)';
          feedbackBox.textContent = res?.message || t.automation_checked_ok;
        }
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackBox.style.border = '1px solid var(--red)';
          feedbackBox.style.color = 'var(--red)';
          feedbackBox.textContent = t.automation_check_failed;
        }
      } finally {
        triggerRecoveryBtn.disabled = false;
        triggerRecoveryBtn.innerHTML = '<i class="fas fa-rotate"></i> ' + (translations[currentLanguage]?.btn_trigger_recovery || 'Recover Lost Leads Now');
      }
    });
  }

  const triggerDigestBtn = document.getElementById('triggerDigestBtn');
  if (triggerDigestBtn) {
    triggerDigestBtn.addEventListener('click', async () => {
      if (!currentBot) return;
      const t = translations[currentLanguage] || translations.en;
      const feedbackBox = document.getElementById('automationFeedbackBox');
      triggerDigestBtn.disabled = true;
      triggerDigestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t.automation_sending;
      try {
        const res = await apiFetch(`/api/bots/${currentBot._id}/trigger-automation`, {
          method: 'POST',
          body: JSON.stringify({ action: 'daily_digest' })
        });
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(6, 182, 212, 0.15)';
          feedbackBox.style.border = '1px solid var(--cyan)';
          feedbackBox.style.color = 'var(--cyan)';
          feedbackBox.textContent = res?.message || t.automation_digest_sent;
        }
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackBox.style.border = '1px solid var(--red)';
          feedbackBox.style.color = 'var(--red)';
          feedbackBox.textContent = t.automation_digest_failed;
        }
      } finally {
        triggerDigestBtn.disabled = false;
        triggerDigestBtn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + (translations[currentLanguage]?.btn_trigger_digest || 'Send Sales Digest Now');
      }
    });
  }

  function adminAction(label, action, style = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-sm';
    button.style.cssText = `padding:4px 8px; font-size:11px;${style}`;
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  function renderAdminPagination() {
    const info = document.getElementById('adminUsersPaginationInfo');
    const previous = document.getElementById('adminUsersPrevBtn');
    const next = document.getElementById('adminUsersNextBtn');
    const t = translations[currentLanguage] || translations.en;
    if (info) info.textContent = `${adminUsersPageState.total} ${t.admin_pagination_unit} ${adminUsersPageState.page} / ${adminUsersPageState.pages}`;
    if (previous) previous.disabled = adminUsersPageState.page <= 1;
    if (next) next.disabled = adminUsersPageState.page >= adminUsersPageState.pages;
  }

  async function loadAdminUsers(page = adminUsersPageState.page) {
    try {
      const params = new URLSearchParams({ paginate: 'true', populate: 'bots', page: String(page), limit: '25' });
      const search = document.getElementById('adminUserSearch')?.value.trim();
      const role = document.getElementById('adminUserRoleFilter')?.value;
      const status = document.getElementById('adminUserStatusFilter')?.value;
      const tier = document.getElementById('adminUserTierFilter')?.value;
      if (search) params.set('q', search);
      if (role) params.set('role', role);
      if (status) params.set('status', status);
      if (tier) params.set('tier', tier);
      const res = await dashboardRequest(`/api/users?${params.toString()}`);
      adminUsersList = Array.isArray(res?.data) ? res.data : [];
      Object.assign(adminUsersPageState, res?.pagination || { page: 1, pages: 1, total: adminUsersList.length, limit: 25 });
      renderAdminUsers();
    } catch (error) {
      console.error('admin_users_load_failed', error);
      alert((translations[currentLanguage] || translations.en).admin_load_failed);
    }
  }

  function renderAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    tbody.replaceChildren();
    const t = translations[currentLanguage] || translations.en;
    if (adminUsersList.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.style.cssText = 'padding:24px; text-align:center; color:var(--text-muted);';
      cell.textContent = t.admin_empty_match;
      row.appendChild(cell);
      tbody.appendChild(row);
      renderAdminPagination();
      return;
    }
    adminUsersList.forEach((user) => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid var(--glass-border)';
      adminCell(row, user.username, 'font-weight:600;');
      adminCell(row, user.email, 'font-size:12px; color:var(--cyan);');
      adminCell(row, user.role === 'superadmin' ? t.admin_role_superadmin_word : t.admin_role_user_word);
      adminCell(row, user.subscriptionTier || 'free', 'font-size:12px;');
      adminCell(row, user.status === 'suspended' ? t.admin_suspended : (user.status === 'deleted' ? t.admin_status_deleted : t.admin_active));
      adminCell(row, `${Array.isArray(user.bots) ? user.bots.length : 0} ${t.admin_bots_unit}`, 'font-size:12px;');
      const actions = document.createElement('td');
      actions.style.cssText = 'padding:12px; text-align:center; display:flex; justify-content:center; gap:5px; flex-wrap:wrap;';
      actions.appendChild(adminAction(t.admin_action_edit, () => openAdminUserModal(user._id)));
      actions.appendChild(adminAction(t.admin_action_agents, () => openUserBotsModal(user._id)));
      if (user.status !== 'deleted' && String(user._id) !== String(currentUser?._id)) {
        actions.appendChild(adminAction(t.admin_action_temp_access, () => openImpersonationModal(user._id), 'border-color:var(--orange); color:var(--orange);'));
      }
      if (user.status !== 'deleted' && user.role !== 'superadmin') {
        actions.appendChild(adminAction(user.status === 'suspended' ? t.admin_action_activate : t.admin_action_suspend, () => updateAdminUserStatus(user._id, user.status === 'suspended' ? 'active' : 'suspended')));
        actions.appendChild(adminAction(t.admin_action_archive, () => archiveAdminUser(user._id), 'border-color:var(--red); color:var(--red);'));
      }
      row.appendChild(actions);
      tbody.appendChild(row);
    });
    renderAdminPagination();
  }

  async function updateAdminUserStatus(userId, status) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.admin_status_change_confirm.replace('{status}', status === 'active' ? t.admin_active : t.admin_suspended))) return;
    // D09: one lock per account row — double confirm clicks attach instead
    // of sending duplicate status mutations. Permissions untouched.
    try {
      await withEntityLock(`admin-user:${userId}`, userId, async () => {
        const result = await dashboardRequest(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify({ status }) }, { operation: 'mutation' });
        if (!result?.data) {
          alert(result?.message || t.admin_update_failed);
          return;
        }
        loadAdminUsers();
      });
    } catch (err) {
      console.error(err);
      alert(t.admin_update_failed);
    }
  }

  async function archiveAdminUser(userId) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.admin_archive_confirm)) return;
    try {
      await withEntityLock(`admin-user:${userId}`, userId, async () => {
        const result = await dashboardRequest(`/api/users/${userId}`, { method: 'DELETE' }, { operation: 'mutation' });
        if (!result?.data) {
          alert(result?.message || t.admin_archive_failed);
          return;
        }
        loadAdminUsers();
      });
    } catch (err) {
      console.error(err);
      alert(t.admin_archive_failed);
    }
  }

  // Remote agent (bot) administration for a specific account
  async function openUserBotsModal(userId) {
    // E03c prerequisite fix (pre-existing defect, proven by vm repro:
    // `modal`/`modalTitle`/`modalBody` had no binding in scope, so every
    // call threw `ReferenceError: modal is not defined` before reaching
    // the guard). They address channelModal — the only dialog owning
    // `channelModalTitle`/`channelModalBody` — so bind them explicitly.
    const modal = document.getElementById('channelModal');
    const modalTitle = document.getElementById('channelModalTitle');
    const modalBody = document.getElementById('channelModalBody');
    if (!modal || !modalTitle || !modalBody) return;
    const t = translations[currentLanguage] || translations.en;
    const user = adminUsersList.find((entry) => String(entry._id) === String(userId));
    if (!user || !Array.isArray(user.bots)) {
      alert(t.admin_account_bots_missing);
      return;
    }
    modalTitle.innerHTML = `<i class="fas fa-robot" style="color:var(--orange)"></i> ${t.admin_account_bots_title.split('{username}').join(user.username)}`;
    modalBody.innerHTML = `<div id="adminBotsList" style="font-size:13px;">${t.admin_bots_loading}</div>`;
    // E03c: this opener drives channelModal (already on the lifecycle since
    // E02f) — route it through the shared open so focus is trapped and
    // Escape works here too; content is injected synchronously above, so
    // the helper opens on fresh nodes. Missing-user/missing-bots guards
    // and toggle logic untouched.
    openChannelModal();

    const listEl = document.getElementById('adminBotsList');
    const bots = user.bots;

    const renderBots = () => {
      const t = translations[currentLanguage] || translations.en;
      listEl.innerHTML = bots.map((botItem) => {
        const running = botItem.isActive !== false;
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--glass-border);">
          <div style="min-width:0;">
            <div style="font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${botItem.name}</div>
            <div style="font-size:11px; color:${running ? 'var(--green)' : 'var(--red)'};">${running ? t.admin_bot_running : t.admin_bot_stopped}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-bot-toggle="${botItem._id}"
            style="flex-shrink:0; ${running ? 'border-color:var(--red); color:var(--red);' : 'border-color:var(--green); color:var(--green);'}">
            ${running ? t.admin_bot_stop : t.admin_bot_start}
          </button>
        </div>`;
      }).join('');

      listEl.querySelectorAll('[data-bot-toggle]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const target = bots.find((b) => String(b._id) === btn.getAttribute('data-bot-toggle'));
          if (!target) return;
          btn.disabled = true;
          const res = await apiFetch(`/api/bots/${target._id}`, {
            method: 'PUT',
            body: JSON.stringify({ isActive: target.isActive === false })
          });
          btn.disabled = false;
          if (res && res.success && res.data) {
            target.isActive = res.data.isActive;
            renderBots();
          } else {
            alert(res?.message || (translations[currentLanguage] || translations.en).admin_bot_update_failed);
          }
        });
      });
    };

    if (bots.length === 0) {
      listEl.textContent = (translations[currentLanguage] || translations.en).admin_account_no_bots;
      return;
    }
    renderBots();
  }

  async function openAdminUserModal(userId = '') {
    const form = document.getElementById('adminUserForm');
    if (!adminUserModal || !form) return;
    const t = translations[currentLanguage] || translations.en;
    form.reset();
    document.getElementById('adminUserId').value = userId;
    document.getElementById('adminUserMode').value = userId ? 'edit' : 'create';
    document.getElementById('adminUserModalTitle').textContent = userId ? t.admin_user_modal_edit : t.admin_user_modal_add;
    document.getElementById('adminUserPassword').required = !userId;
    document.getElementById('adminUserConfirmPassword').required = !userId;
    if (userId) {
      const response = await apiFetch(`/api/users/${userId}`);
      const user = response?.data;
      if (!user) return alert(t.admin_account_load_failed);
      document.getElementById('adminUserUsername').value = user.username || '';
      document.getElementById('adminUserEmail').value = user.email || '';
      document.getElementById('adminUserWhatsapp').value = user.whatsapp || '';
      document.getElementById('adminUserRole').value = user.role || 'user';
      document.getElementById('adminUserSubscriptionType').value = user.subscriptionType || 'free';
      document.getElementById('adminUserTier').value = user.subscriptionTier || 'free';
      document.getElementById('adminUserStatus').value = user.status === 'suspended' ? 'suspended' : 'active';
      document.getElementById('adminUserVerified').value = user.isVerified === false ? 'false' : 'true';
      document.getElementById('adminUserDailyUsage').value = user.dailyMessagesUsed || 0;
      document.getElementById('adminUserMonthlyUsage').value = user.monthlyMessagesUsed || 0;
    }
    openAdminUserDialog();
  }

  function openImpersonationModal(userId) {
    const form = document.getElementById('impersonationForm');
    if (!impersonationModal || !form) return;
    form.reset();
    document.getElementById('impersonationSubjectId').value = userId;
    openImpersonationDialog();
  }

  function renderImpersonationBanner() {
    const sessionId = sessionStorage.getItem('zainbot_impersonation_session_id');
    const banner = document.getElementById('impersonationBanner');
    if (!sessionId || !banner) return;
    const t = translations[currentLanguage] || translations.en;
    document.getElementById('impersonationBannerText').textContent = t.admin_impersonation_banner.split('{username}').join(currentUser?.username || t.admin_impersonation_self);
    banner.style.display = 'block';
  }

  document.getElementById('adminAddUserBtn')?.addEventListener('click', () => openAdminUserModal());
  document.querySelectorAll('.admin-user-modal-close').forEach((button) => button.addEventListener('click', () => closeAdminUserDialog()));
  // E03c: impersonationModal runs on the shared focus lifecycle (§7.3),
  // same pattern as E03a/b. The helper owns focus/stack/inert only;
  // `.active` stays the visual switch — removed by onClose and by the
  // explicit fallback in closeImpersonationDialog. The session workflow
  // (start/stop, scoping, subject handling, reload) is byte-identical and
  // moves no focus. Both openers are fully synchronous (no pre-open
  // fetch), so the helper's activeElement-default opener is exact — the
  // E03b pre-fetch-capture lesson does not apply here.
  const openImpersonationDialog = () => {
    if (!impersonationModal) return;
    impersonationModal.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(impersonationModal, {
          opener: document.activeElement && document.activeElement.nodeType === 1
            ? document.activeElement
            : undefined,
          background: document.querySelector('.db-wrapper'),
          onClose: () => impersonationModal.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeImpersonationDialog = () => {
    if (!impersonationModal) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(impersonationModal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      impersonationModal.classList.remove('active');
    }
  };

  document.querySelectorAll('.impersonation-modal-close').forEach((button) => button.addEventListener('click', () => closeImpersonationDialog()));
  document.getElementById('adminUserFilters')?.addEventListener('submit', (event) => { event.preventDefault(); loadAdminUsers(1); });
  document.getElementById('adminUsersPrevBtn')?.addEventListener('click', () => loadAdminUsers(Math.max(1, adminUsersPageState.page - 1)));
  document.getElementById('adminUsersNextBtn')?.addEventListener('click', () => loadAdminUsers(Math.min(adminUsersPageState.pages, adminUsersPageState.page + 1)));
  document.getElementById('adminUserForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('adminUserId').value;
    const password = document.getElementById('adminUserPassword').value;
    const payload = {
      username: document.getElementById('adminUserUsername').value.trim(), email: document.getElementById('adminUserEmail').value.trim(), whatsapp: document.getElementById('adminUserWhatsapp').value.trim(),
      role: document.getElementById('adminUserRole').value, subscriptionType: document.getElementById('adminUserSubscriptionType').value, subscriptionTier: document.getElementById('adminUserTier').value,
      status: document.getElementById('adminUserStatus').value, isVerified: document.getElementById('adminUserVerified').value === 'true',
      dailyMessagesUsed: Number(document.getElementById('adminUserDailyUsage').value || 0), monthlyMessagesUsed: Number(document.getElementById('adminUserMonthlyUsage').value || 0),
    };
    if (password) { payload.password = password; payload.confirmPassword = document.getElementById('adminUserConfirmPassword').value; }
    const result = await apiFetch(id ? `/api/users/${id}` : '/api/users', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (!result?.data) return alert(result?.message || (translations[currentLanguage] || translations.en).admin_account_save_failed);
    closeAdminUserDialog();
    loadAdminUsers(id ? adminUsersPageState.page : 1);
  });
  document.getElementById('impersonationForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await apiFetch('/api/admin/impersonation/sessions', { method: 'POST', body: JSON.stringify({ subjectUserId: document.getElementById('impersonationSubjectId').value, reason: document.getElementById('impersonationReason').value.trim() }) });
    const data = response?.data;
    if (!data?.token || !data?.session?.id) return alert(response?.message || (translations[currentLanguage] || translations.en).admin_impersonation_start_failed);
    sessionStorage.setItem('zainbot_admin_session', JSON.stringify({ token: localStorage.getItem('token'), tokenExpiry: localStorage.getItem('tokenExpiry'), role: localStorage.getItem('role'), userId: localStorage.getItem('userId'), username: localStorage.getItem('username') }));
    sessionStorage.setItem('zainbot_impersonation_session_id', data.session.id);
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.subject?.role || 'user');
    localStorage.setItem('userId', data.subject?.id || document.getElementById('impersonationSubjectId').value);
    localStorage.setItem('username', data.subject?.username || '');
    window.location.reload();
  });
  document.getElementById('exitImpersonationBtn')?.addEventListener('click', async () => {
    let admin;
    try { admin = JSON.parse(sessionStorage.getItem('zainbot_admin_session') || '{}'); } catch (_error) { admin = {}; }
    const sessionId = sessionStorage.getItem('zainbot_impersonation_session_id');
    if (!admin.token || !sessionId) return alert((translations[currentLanguage] || translations.en).admin_session_expired);
    const response = await fetch(`/api/admin/impersonation/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` } });
    const result = await response.json();
    if (!response.ok || !result?.success) return alert(result?.message || (translations[currentLanguage] || translations.en).admin_impersonation_end_failed);
    Object.entries(admin).forEach(([key, value]) => value === null || value === undefined ? localStorage.removeItem(key) : localStorage.setItem(key, value));
    sessionStorage.removeItem('zainbot_admin_session');
    sessionStorage.removeItem('zainbot_impersonation_session_id');
    window.location.reload();
  });

  // Subtabs switching (registry-based so new admin tabs plug in cleanly)
  const adminSubtabs = [
    { id: 'adminTabUsersBtn', sectionId: 'adminSectionUsers', onLoad: loadAdminUsers },
    { id: 'adminTabKeysBtn', sectionId: 'adminSectionKeys', onLoad: loadAdminKeys },
    { id: 'adminTabOverviewBtn', sectionId: 'adminSectionOverview', onLoad: loadAdminOverview },
    { id: 'adminTabAuditBtn', sectionId: 'adminSectionAudit', onLoad: () => { loadAdminSessions(); loadAdminAudit(); } },
    { id: 'adminTabNotifyBtn', sectionId: 'adminSectionNotify', onLoad: null },
    { id: 'adminTabSubsBtn', sectionId: 'adminSectionSubs', onLoad: loadAdminSubs },
    { id: 'adminTabLandingDemoBtn', sectionId: 'adminSectionLandingDemo', onLoad: loadAdminLandingDemo },
  ].map((entry) => ({ ...entry, button: document.getElementById(entry.id), section: document.getElementById(entry.sectionId) }))
    .filter((entry) => entry.button && entry.section);

  function activateAdminSubtab(active) {
    adminSubtabs.forEach((entry) => {
      const isActive = entry === active;
      entry.button.classList.toggle('active', isActive);
      entry.button.style.background = isActive ? 'var(--orange)' : 'transparent';
      entry.button.style.color = isActive ? '#000' : 'var(--text)';
      entry.button.style.borderColor = isActive ? 'var(--orange)' : 'var(--glass-border)';
      entry.section.style.display = isActive ? 'block' : 'none';
    });
    if (typeof active.onLoad === 'function') active.onLoad();
  }

  adminSubtabs.forEach((entry) => {
    entry.button.addEventListener('click', () => activateAdminSubtab(entry));
  });

  // --- System Overview loader ---
  async function loadAdminOverview() {
    try {
      const res = await apiFetch('/api/admin/system/overview');
      if (!(res && res.success)) return;
      const stats = res.data;
      const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      set('ovUsersTotal', stats.usersTotal ?? 0);
      set('ovUsersActive', stats.usersActive ?? 0);
      set('ovBotsTotal', stats.botsTotal ?? 0);
      set('ovBotsActive', stats.botsActive ?? 0);
      set('ovConversations', stats.conversations ?? 0);
      set('ovMessages', stats.messages ?? 0);
      set('ovChatOrders', stats.chatOrders ?? 0);
      set('ovActiveSessions', stats.activeImpersonations ?? 0);
      set('ovAuditEvents', stats.auditEvents ?? 0);
    } catch (e) {
      console.error(e);
    }
  }

  // --- Impersonation sessions list ---
  let adminSessionsPage = 1;

  async function loadAdminSessions(page = 1) {
    const tbody = document.getElementById('adminSessionsTableBody');
    if (!tbody) return;
    try {
      adminSessionsPage = page;
      const res = await apiFetch(`/api/admin/impersonation/sessions?page=${page}&limit=10`);
      if (!res || !res.success) return;
      const rows = res.data || [];

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).admin_empty_sessions}</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map((s) => {
        const statusColors = { active: 'var(--green)', ended: 'var(--text-muted)', revoked: 'var(--red)', expired: 'var(--orange)' };
        const color = statusColors[s.status] || 'var(--text-muted)';
        return `<tr style="border-bottom:1px solid var(--glass-border);">
          <td style="padding:10px;">${s.actor?.username || '—'}</td>
          <td style="padding:10px;">${s.subject?.username || '—'}</td>
          <td style="padding:10px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${(s.reason || '').replace(/"/g, '&quot;')}">${s.reason || '—'}</td>
          <td style="padding:10px; color:${color}; font-weight:600;">${s.status}</td>
        <td style="padding:10px;">${s.createdAt ? formatDate(s.createdAt) : '—'}</td>
        <td style="padding:10px;">${s.expiresAt ? formatDate(s.expiresAt) : '—'}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById('adminSessionsPrevBtn')?.addEventListener('click', () => {
    if (adminSessionsPage > 1) loadAdminSessions(adminSessionsPage - 1);
  });
  document.getElementById('adminSessionsNextBtn')?.addEventListener('click', () => {
    loadAdminSessions(adminSessionsPage + 1);
  });

  // --- Audit log viewer ---
  let adminAuditPage = 1;

  async function loadAdminAudit(page = 1) {
    const tbody = document.getElementById('adminAuditTableBody');
    if (!tbody) return;
    try {
      adminAuditPage = page;
      const typeFilter = document.getElementById('adminAuditTypeFilter')?.value || '';
      const res = await apiFetch(`/api/admin/system/audit?page=${page}&limit=15&eventType=${encodeURIComponent(typeFilter)}`);
      if (!res || !res.success) return;
      const rows = res.data || [];
      const info = document.getElementById('adminAuditPaginationInfo');
      if (info) info.textContent = `${res.total ?? 0} · ${res.page}/${res.totalPages}`;

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).admin_empty_events}</td></tr>`;
        return;
      }

      const outcomeColors = { success: 'var(--green)', denied: 'var(--orange)', error: 'var(--red)' };
      tbody.innerHTML = rows.map((ev) => {
        const color = outcomeColors[ev.outcome] || 'var(--text-muted)';
        const actionText = [ev.method, ev.path].filter(Boolean).join(' ') || ev.action || '—';
        return `<tr style="border-bottom:1px solid var(--glass-border);">
          <td style="padding:10px; white-space:nowrap;">${ev.createdAt ? formatDate(ev.createdAt) : '—'}</td>
          <td style="padding:10px;">${ev.eventType}</td>
          <td style="padding:10px;">${ev.actorUsername || '—'} → ${ev.subjectUsername || '—'}</td>
          <td style="padding:10px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${actionText.replace(/"/g, '&quot;')}">${actionText}</td>
          <td style="padding:10px; color:${color}; font-weight:600;">${ev.outcome}${ev.statusCode ? ` (${ev.statusCode})` : ''}</td>
        </tr>`;
      }).join('');
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById('adminAuditFilters')?.addEventListener('submit', (e) => {
    e.preventDefault();
    loadAdminAudit(1);
  });
  document.getElementById('adminAuditPrevBtn')?.addEventListener('click', () => {
    if (adminAuditPage > 1) loadAdminAudit(adminAuditPage - 1);
  });
  document.getElementById('adminAuditNextBtn')?.addEventListener('click', () => {
    loadAdminAudit(adminAuditPage + 1);
  });

  // --- Broadcast notifications ---
  const notifyTargetSelect = document.getElementById('notifyTargetSelect');
  notifyTargetSelect?.addEventListener('change', () => {
    const group = document.getElementById('notifyUsernameGroup');
    if (group) group.style.display = notifyTargetSelect.value === 'single' ? 'block' : 'none';
  });

  document.getElementById('adminNotifyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const resultEl = document.getElementById('notifyResultMsg');
    const t = translations[currentLanguage] || translations.en;
    const showResult = (msg, ok) => {
      if (!resultEl) return;
      resultEl.textContent = msg;
      resultEl.style.color = ok ? 'var(--green)' : 'var(--red)';
    };

    const title = document.getElementById('notifyTitleInput')?.value.trim();
    const message = document.getElementById('notifyBodyInput')?.value.trim();
    if (!title || !message) return;

    try {
      let res;
      if (notifyTargetSelect && notifyTargetSelect.value === 'single') {
        const username = document.getElementById('notifyUsernameInput')?.value.trim().toLowerCase();
        if (!username) return;
        let match = adminUsersList.find((u) => u.username === username);
        if (!match) {
          const lookup = await apiFetch('/api/users');
          const candidates = Array.isArray(lookup) ? lookup : (lookup && lookup.data ? lookup.data : []);
          match = candidates.find((u) => u.username === username);
        }
        if (!match) {
          showResult(t.notify_failed, false);
          return;
        }
        res = await apiFetch('/api/notifications/single', {
          method: 'POST',
          body: JSON.stringify({ userId: match._id, title, message })
        });
      } else {
        res = await apiFetch('/api/notifications/global', {
          method: 'POST',
          body: JSON.stringify({ title, message })
        });
      }

      if (res && (res.message || res.success)) {
        showResult(t.notify_sent_ok, true);
        const form = document.getElementById('adminNotifyForm');
        if (form) form.reset();
        if (document.getElementById('notifyUsernameGroup')) document.getElementById('notifyUsernameGroup').style.display = 'none';
      } else {
        showResult(t.notify_failed, false);
      }
    } catch (err) {
      console.error(err);
      showResult(t.notify_failed, false);
    }
  });

  async function loadAdminKeys() {
    try {
      const res = await apiFetch('/api/admin/keys');
      if (res && res.success) {
        adminKeys = res.data;
        renderAdminKeys();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderAdminKeys() {
    const container = document.getElementById('adminKeysListContainer');
    if (!container) return;
    container.innerHTML = '';

    const t = translations[currentLanguage] || translations.en;

    if (adminKeys.length === 0) {
      container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted);">${t.admin_no_keys}</div>`;
      return;
    }

    adminKeys.forEach((key, idx) => {
      const row = document.createElement('div');
      row.className = 'admin-key-row';
      
      const badgeClass = key.status === 'working' ? 'badge-success' : 'badge-danger';
      const statusText = key.status === 'working' ? t.admin_status_working : t.admin_status_failed;
      const opacity = key.isActive ? '1' : '0.5';

      row.innerHTML = `
        <div class="admin-key-details" style="opacity:${opacity};">
          <span class="admin-key-drag-handle"><i class="fas fa-grip-vertical"></i></span>
          <span style="font-weight:700; font-family:'Space Grotesk'; font-size:14px;">${idx + 1}.</span>
          <div>
            <h4 style="font-size:14px; font-weight:600; display:inline-block; margin-right:8px;">${key.name}</h4>
            <span class="badge ${badgeClass}" style="transform:scale(0.8);">${statusText}</span>
            <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
              ${t.admin_lbl_provider}: <strong>${key.provider}</strong> | ${t.admin_lbl_model}: <strong>${key.defaultModel}</strong> | ${t.admin_lbl_priority}: <strong>${key.priority}</strong>
            </div>
            ${key.errorMessage ? `<div style="font-size:10px; color:var(--red); margin-top:2px;">Error: ${key.errorMessage}</div>` : ''}
          </div>
        </div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-secondary btn-sm" onclick="toggleAdminKeyActive('${key._id}', ${!key.isActive})" style="padding:6px 10px;">
            <i class="fas ${key.isActive ? 'fa-eye-slash' : 'fa-eye'}"></i>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="deleteAdminKey('${key._id}')" style="padding:6px 10px; border-color:rgba(239, 68, 68, 0.3); color:var(--red);">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      container.appendChild(row);
    });
  }

  // Global Keys registration add
  const adminKeyAddForm = document.getElementById('adminKeyAddForm');
  if (adminKeyAddForm) {
    adminKeyAddForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('adminKeyName').value.trim();
      const provider = document.getElementById('adminKeyProvider').value;
      const apiKey = document.getElementById('adminKeySecret').value.trim();
      const defaultModel = document.getElementById('adminKeyModel').value.trim();
      const priority = document.getElementById('adminKeyPriority').value;
      const baseUrl = document.getElementById('adminKeyBaseUrl').value.trim();

      try {
        const res = await apiFetch('/api/admin/keys', {
          method: 'POST',
          body: JSON.stringify({
            name,
            provider,
            apiKey,
            defaultModel,
            priority,
            baseUrl
          })
        });

        if (res && res.success) {
          adminKeyAddForm.reset();
          loadAdminKeys();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Reset Failed Keys
  const adminResetKeysBtn = document.getElementById('adminResetKeysBtn');
  if (adminResetKeysBtn) {
    adminResetKeysBtn.addEventListener('click', async () => {
      try {
        const res = await apiFetch('/api/admin/keys/reset', { method: 'POST' });
        if (res && res.success) {
          loadAdminKeys();
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  // --- Landing demo agent configuration ---
  async function loadAdminLandingDemo() {
    try {
      const res = await apiFetch('/api/admin/landing-demo');
      if (!(res && res.success)) return;
      const cfg = res.data || {};
      const enabledEl = document.getElementById('landingDemoEnabled');
      const instructionsEl = document.getElementById('landingDemoInstructions');
      if (enabledEl) enabledEl.checked = cfg.isEnabled !== false;
      if (instructionsEl) instructionsEl.value = cfg.instructions || '';
      const updatedEl = document.getElementById('landingDemoUpdatedAt');
      if (updatedEl) {
        const t = translations[currentLanguage] || translations.en;
        updatedEl.textContent = cfg.updatedAt
          ? `${t.landing_demo_updated_at}: ${formatDate(cfg.updatedAt)}`
          : '';
      }
    } catch (e) {
      console.error(e);
    }
  }

  const landingDemoSaveBtn = document.getElementById('landingDemoSaveBtn');
  if (landingDemoSaveBtn) {
    landingDemoSaveBtn.addEventListener('click', async () => {
      const t = translations[currentLanguage] || translations.en;
      const statusEl = document.getElementById('landingDemoStatusMsg');
      const payload = {
        isEnabled: document.getElementById('landingDemoEnabled')?.checked !== false,
        instructions: document.getElementById('landingDemoInstructions')?.value || '',
      };
      try {
        landingDemoSaveBtn.disabled = true;
        if (statusEl) statusEl.textContent = '';
        const res = await apiFetch('/api/admin/landing-demo', { method: 'PUT', body: JSON.stringify(payload) });
        if (res && res.success) {
          if (statusEl) {
            statusEl.style.color = 'var(--green)';
            statusEl.textContent = t.landing_demo_saved_ok;
          }
          const updatedEl = document.getElementById('landingDemoUpdatedAt');
          if (updatedEl && res.data && res.data.updatedAt) {
            updatedEl.textContent = `${t.landing_demo_updated_at}: ${formatDate(res.data.updatedAt)}`;
          }
        } else {
          if (statusEl) {
            statusEl.style.color = 'var(--red)';
            statusEl.textContent = (res && res.message) || t.landing_demo_save_failed;
          }
        }
      } catch (e) {
        console.error(e);
        if (statusEl) {
          statusEl.style.color = 'var(--red)';
          statusEl.textContent = t.landing_demo_save_failed;
        }
      } finally {
        landingDemoSaveBtn.disabled = false;
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
      }
    });
  }

  // Global Window functions mapped to window for HTML onclick trigger buttons
  window.editFaq = async function(id) {
    const faq = faqs.find(f => f._id === id);
    if (!faq) return;

    document.getElementById('faqModalTitle').textContent = (translations[currentLanguage] || translations.en).faq_modal_edit;
    document.getElementById('faqIdInput').value = faq._id;
    document.getElementById('faqQuestionInput').value = faq.content?.question || '';
    document.getElementById('faqAnswerInput').value = faq.content?.answer || '';

    openFaqModal(document.activeElement);
  };

  window.deleteFaq = async function(id) {
    if (!confirm((translations[currentLanguage] || translations.en).faq_delete_confirm)) return;
    try {
      await withEntityLock(`training-rule:${id}`, id, async () => {
        const res = await dashboardRequest(`/api/rules/${id}`, { method: 'DELETE' }, { operation: 'mutation' });
        if (res && res.success) {
          loadTrainingData();
        } else {
          alert((translations[currentLanguage] || translations.en).faq_save_failed);
        }
      });
    } catch (e) {
      console.error(e);
      alert((translations[currentLanguage] || translations.en).faq_save_failed);
    }
  };

  window.revokeApiKey = async function(id) {
    if (!confirm((translations[currentLanguage] || translations.en).apikey_revoke_confirm)) return;
    try {
      const res = await apiFetch(`/api/integrations/keys/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        loadSettingsData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // D07d: webhook redelivery. Translated confirmation FIRST; one in-flight
  // redelivery per log id (double-click attaches, never resends); the
  // request is a mutation with NO timeout, so a timeout can never trigger a
  // resend. HTTP-200 success:false (D06 WEBHOOK_DELIVERY_FAILED) renders as
  // delivery failure. A refresh failure after a confirmed send is reported
  // distinctly and never rewrites the confirmed outcome.
  window.retryWebhook = async function(id) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.webhook_retry_confirm)) return;
    try {
      await withEntityLock(`webhook-log:${id}`, id, async () => {
        const res = await dashboardRequest(`/api/integrations/webhooks/logs/${id}/retry`, { method: 'POST' }, { operation: 'mutation' });
        if (res && res.success) {
          alert(t.webhook_retry_ok);
          const botId = currentBot ? String(currentBot._id) : null;
          if (botId) {
            const logsOk = await loadSettingsWebhookLogs(botId);
            if (!logsOk) notifyDashboard('error', 'webhook_logs_refresh_failed');
          }
        } else {
          alert(res?.message || t.webhook_retry_failed);
        }
      });
    } catch (e) {
      console.error(e);
      alert(t.webhook_retry_failed);
    }
  };

  window.toggleAdminKeyActive = async function(id, activeState) {
    try {
      const res = await apiFetch(`/api/admin/keys/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: activeState })
      });
      if (res && res.success) {
        loadAdminKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.deleteAdminKey = async function(id) {
    if (!confirm((translations[currentLanguage] || translations.en).admin_key_delete_confirm)) return;
    try {
      const res = await apiFetch(`/api/admin/keys/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        loadAdminKeys();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Setup FAQ Modal Buttons Click
  const addFaqBtn = document.getElementById('addFaqBtn');
  if (addFaqBtn) {
    addFaqBtn.addEventListener('click', (event) => {
      document.getElementById('faqModalTitle').textContent = (translations[currentLanguage] || translations.en).faq_modal_add;
      document.getElementById('faqIdInput').value = '';
      document.getElementById('faqQuestionInput').value = '';
      document.getElementById('faqAnswerInput').value = '';
      openFaqModal(event?.currentTarget);
    });
  }

  // E02b fix round 1: a close button closes ONLY its dialog — no global
  // `.modal-close-btn` fan-out. faqModal's buttons run the shared lifecycle.
  faqModal?.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => closeFaqModal());
  });

  // E02f: channelModal runs on the shared focus lifecycle (§7.3).
  // The helper owns focus/stack/inert only; `.active` stays BOTH the visual
  // switch AND the QR session-poll gate
  // (`while (... && modal.classList.contains('active'))`): onClose plus every
  // explicit close path remove it, so closing (including Escape) stops the
  // poll loop at the next 2s check. Dynamic content is injected
  // synchronously per branch and openChannelModal() runs on each branch's
  // fresh nodes; the helper queries focusables live, so late content never
  // traps stale focus. No doubled listeners: the static X wires once here,
  // dynamic buttons re-wire on fresh nodes per open (innerHTML replaces
  // them), exactly as before.
  const openChannelModal = () => {
    const channelModalEl = document.getElementById('channelModal');
    if (!channelModalEl) return;
    channelModalEl.classList.add('active');
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.openDialog === 'function') {
        window.ZainBotA11y.openDialog(channelModalEl, {
          // No event param flows into the configureChannel branches (relink
          // + row buttons call it directly): the helper defaults the opener
          // to document.activeElement.
          background: document.querySelector('.db-wrapper'),
          onClose: () => channelModalEl.classList.remove('active'),
        });
      }
    } catch (err) {
      console.error(err);
    }
  };
  const closeChannelModal = () => {
    const channelModalEl = document.getElementById('channelModal');
    if (!channelModalEl) return;
    try {
      if (window.ZainBotA11y && typeof window.ZainBotA11y.closeDialog === 'function') {
        window.ZainBotA11y.closeDialog(channelModalEl);
      }
    } catch (err) {
      console.error(err);
    } finally {
      channelModalEl.classList.remove('active');
    }
  };

  document.getElementById('channelModal')?.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      closeChannelModal();
    });
  });

  // Global Channel Configuration Modal Handler
  window.configureChannel = async function(type) {
    if (!currentBot) return;
    const t = translations[currentLanguage] || translations.en;
    const modal = document.getElementById('channelModal');
    const modalTitle = document.getElementById('channelModalTitle');
    const modalBody = document.getElementById('channelModalBody');

    if (!modal) return;
    modal.classList.add('active');

    if (type === 'whatsapp') {
      modalTitle.innerHTML = `<i class="fab fa-whatsapp" style="color:var(--green)"></i> ${t.chan_wa_qr_title}`;
      modalBody.innerHTML = `
        <div style="text-align:center; padding:16px;">
          <div id="waQrContainer" role="status" style="background:rgba(255,255,255,0.03); padding:20px; border-radius:16px; border:1px solid var(--glass-border); display:inline-block; margin-bottom:16px;">
            <div style="color:var(--cyan); font-weight:600;"><i class="fas fa-spinner fa-spin"></i> ${t.chan_wa_qr_generating}</div>
          </div>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.6;">
            ${t.chan_wa_qr_steps}
          </p>
          <button id="waDisconnectBtn" class="btn btn-secondary btn-sm" style="border-color:var(--red); color:var(--red);">${t.chan_wa_disconnect}</button>
        </div>
      `;

      // Fresh nodes injected above — open on them, never on stale content.
      openChannelModal();

      try {
        const res = await apiFetch('/api/whatsapp/connect-qr', {
          method: 'POST',
          body: JSON.stringify({ botId: currentBot._id })
        });
        const renderQr = (data) => {
          const container = document.getElementById('waQrContainer');
          if (!container) return Boolean(data?.qrCode);
          container.replaceChildren();
          const qrCode = data?.qrCode;
          if (
            typeof qrCode === 'string'
            && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(qrCode)
            && qrCode.length <= 2_000_000
          ) {
            const image = document.createElement('img');
            image.src = qrCode;
            image.alt = t.chan_wa_qr_alt;
            image.width = 220;
            image.height = 220;
            image.style.borderRadius = '12px';
            image.style.border = '2px solid var(--cyan)';
            container.appendChild(image);
            return true;
          }
          container.textContent = data?.status === 'connected'
            ? t.chan_wa_connected_ok
            : t.chan_wa_preparing_qr;
          return false;
        };

        if (res?.success) {
          let data = res.data;
          // D09: the QR poll loop stops on modal close AND on bot switch, so
          // a switched bot never inherits another bot's QR/session paint.
          // The pinned qrBotId is queried (not the live selection), and any
          // response arriving after a switch is dropped before painting.
          const qrBotId = String(currentBot._id);
          if (!renderQr(data) && !['connected', 'error', 'relink_required'].includes(data?.status)) {
            const deadline = Date.now() + 90_000;
            while (Date.now() < deadline && modal.classList.contains('active')) {
              await new Promise((resolve) => setTimeout(resolve, 2_000));
              if (String(currentBot?._id) !== qrBotId) break;
              const status = await apiFetch(`/api/whatsapp/session?botId=${encodeURIComponent(qrBotId)}`);
              if (String(currentBot?._id) !== qrBotId) break;
              if (!status?.success) break;
              data = status.data;
              if (renderQr(data) || ['connected', 'error', 'relink_required', 'degraded'].includes(data?.status)) break;
            }
          }
        } else {
          const container = document.getElementById('waQrContainer');
          if (container) {
            container.textContent = t.chan_wa_session_failed;
          }
        }
      } catch (e) {
        console.error(e);
        const container = document.getElementById('waQrContainer');
        if (container) {
          container.textContent = t.chan_wa_qr_failed;
        }
      }

      document.getElementById('waDisconnectBtn')?.addEventListener('click', async () => {
        await apiFetch('/api/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ botId: currentBot._id }) });
        closeChannelModal();
        loadChannelsData();
      });
    }

    else if (type === 'facebook') {
      modalTitle.innerHTML = `<i class="fab fa-facebook-messenger" style="color:var(--blue)"></i> ${t.chan_fb_title}`;
      modalBody.innerHTML = `
        <form id="fbDirectForm">
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${t.chan_fb_token_label}</label>
              <button type="button" class="btn btn-secondary btn-sm info-hint-toggle" style="padding:2px 8px; font-size:11px; color:var(--cyan); border-color:var(--cyan);"><i class="fas fa-info-circle"></i> ${t.chan_how_to}</button>
            </div>
            <div class="info-hint-box" style="display:none; background:rgba(0,240,255,0.06); border:1px solid var(--cyan); padding:10px 14px; border-radius:8px; font-size:12px; color:var(--text); margin-bottom:10px;">
              ${t.chan_fb_steps}
            </div>
            <input type="password" id="fbTokenInput" class="form-control" placeholder="EAA..." value="${currentBot.facebookApiKey || ''}" required />
          </div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${t.chan_fb_id_label}</label>
            </div>
            <input type="text" id="fbPageIdInput" class="form-control" placeholder="1023948574..." value="${currentBot.facebookPageId || ''}" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${t.btn_cancel}</button>
      <button type="submit" class="btn btn-primary btn-sm">${t.chan_save_connection}</button>
          </div>
        </form>
      `;

      document.querySelector('.info-hint-toggle')?.addEventListener('click', () => {
        const box = document.querySelector('.info-hint-box');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });

      // Fresh nodes injected above — open on them, never on stale content.
      openChannelModal();

      document.getElementById('fbDirectForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const facebookApiKey = document.getElementById('fbTokenInput').value.trim();
        const facebookPageId = document.getElementById('fbPageIdInput').value.trim();

        const res = await apiFetch(`/api/bots/${currentBot._id}/link-social`, {
          method: 'POST',
          body: JSON.stringify({ facebookApiKey, facebookPageId })
        });
        if (res && res.success) {
          closeChannelModal();
          loadChannelsData();
        }
      });
    }

    else if (type === 'instagram') {
      modalTitle.innerHTML = `<i class="fab fa-instagram" style="color:var(--purple-light)"></i> ${t.chan_ig_title}`;
      modalBody.innerHTML = `
        <form id="igDirectForm">
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${t.chan_ig_token_label}</label>
              <button type="button" class="btn btn-secondary btn-sm info-hint-toggle" style="padding:2px 8px; font-size:11px; color:var(--cyan); border-color:var(--cyan);"><i class="fas fa-info-circle"></i> ${t.chan_how_to}</button>
            </div>
            <div class="info-hint-box" style="display:none; background:rgba(0,240,255,0.06); border:1px solid var(--cyan); padding:10px 14px; border-radius:8px; font-size:12px; color:var(--text); margin-bottom:10px;">
              ${t.chan_ig_steps}
            </div>
            <input type="password" id="igTokenInput" class="form-control" placeholder="EAA..." value="${currentBot.instagramApiKey || ''}" required />
          </div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${t.chan_ig_id_label}</label>
            </div>
            <input type="text" id="igPageIdInput" class="form-control" placeholder="178414..." value="${currentBot.instagramPageId || ''}" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${t.btn_cancel}</button>
      <button type="submit" class="btn btn-primary btn-sm">${t.chan_save_connection}</button>
          </div>
        </form>
      `;

      document.querySelector('.info-hint-toggle')?.addEventListener('click', () => {
        const box = document.querySelector('.info-hint-box');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });

      // Fresh nodes injected above — open on them, never on stale content.
      openChannelModal();

      document.getElementById('igDirectForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const instagramApiKey = document.getElementById('igTokenInput').value.trim();
        const instagramPageId = document.getElementById('igPageIdInput').value.trim();

        const res = await apiFetch(`/api/bots/${currentBot._id}/link-social`, {
          method: 'POST',
          body: JSON.stringify({ instagramApiKey, instagramPageId })
        });
        if (res && res.success) {
          closeChannelModal();
          loadChannelsData();
        }
      });
    }

    else if (type === 'telegram') {
      modalTitle.innerHTML = `<i class="fab fa-telegram" style="color:var(--cyan)"></i> ${t.chan_tg_title}`;
      modalBody.innerHTML = `
        <div id="tgLinkFlow">
          <p style="font-size:13px; color:var(--text); margin-bottom:10px;">${t.chan_tg_intro}</p>
          <ol style="font-size:13px; color:var(--text-muted); margin:0 0 14px; padding-inline-start:18px;">
      <li>${t.chan_tg_step_1}</li>
      <li>${t.chan_tg_step_2}</li>
      <li>${t.chan_tg_step_3}</li>
          </ol>
          <div id="tgStatusBox"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
      <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${t.btn_close}</button>
      <button type="button" id="tgGenerateCodeBtn" class="btn btn-primary btn-sm">${t.chan_tg_generate_code}</button>
          </div>
        </div>
      `;

      const tgStatusBox = document.getElementById('tgStatusBox');
      // Fresh nodes injected above — open on them, never on stale content.
      openChannelModal();
      const renderTgStatus = async () => {
        if (!tgStatusBox) return;
        const st = await apiFetch(`/api/telegram/status?botId=${currentBot._id}`);
        if (!st) { tgStatusBox.innerHTML = ''; return; }
        if (st.linked) {
          tgStatusBox.innerHTML = `<div style="background:rgba(16,185,129,0.08); border:1px solid var(--green); padding:10px 14px; border-radius:8px; font-size:13px;">✅ ${t.chan_tg_linked_ok}${st.username ? ` (${st.username})` : ''}</div>`;
        } else if (st.linkCode && st.linkExpiresAt && new Date(st.linkExpiresAt) > new Date()) {
          tgStatusBox.innerHTML = `<div style="background:rgba(59,130,246,0.08); border:1px solid var(--blue); padding:10px 14px; border-radius:8px; font-size:13px;">${t.chan_tg_active_code} <strong>${st.linkCode}</strong></div>`;
        } else {
          tgStatusBox.innerHTML = '';
        }
      };
      renderTgStatus();

      document.getElementById('tgGenerateCodeBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('tgGenerateCodeBtn');
        if (!btn) return;
        btn.disabled = true;
        const res = await apiFetch('/api/telegram/link-code', {
          method: 'POST',
          body: JSON.stringify({ botId: currentBot._id })
        });
        btn.disabled = false;
        if (res && res.code && tgStatusBox) {
          tgStatusBox.innerHTML = `
            <div style="background:rgba(6,182,212,0.08); border:1px solid var(--cyan); padding:12px 14px; border-radius:8px;">
              <div style="font-size:13px; color:var(--text-muted);">${t.chan_tg_your_code}</div>
              <div style="font-size:24px; font-weight:700; letter-spacing:3px; color:var(--cyan); margin:4px 0;">${res.code}</div>
              <div style="font-size:12px; color:var(--text-muted);">${t.chan_tg_send_before_expiry.split('{u}').join(res.botUsername)}</div>
            </div>`;
        }
      });
    }

    modal.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        closeChannelModal();
      });
    });
  };

  function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  if (accountMenuToggle && accountMenu) {
    const closeAccountMenu = (returnFocus) => {
      if (accountMenu.hidden) return;
      accountMenu.hidden = true;
      accountMenuToggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) accountMenuToggle.focus();
    };
    accountMenuToggle.addEventListener('click', () => {
      const isOpen = accountMenu.hidden;
      accountMenu.hidden = !isOpen;
      accountMenuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!accountMenu.hidden && !accountMenu.contains(event.target) && !accountMenuToggle.contains(event.target)) {
        closeAccountMenu(false);
      }
    });
    // E04: plain disclosure — Escape closes and returns focus to the
    // trigger (no menu/menuitem arrow-key semantics are implemented).
    document.addEventListener('keydown', (event) => {
      if ((event.key === 'Escape' || event.key === 'Esc') && !accountMenu.hidden) {
        closeAccountMenu(true);
      }
    });
    document.getElementById('accountSettingsBtn').addEventListener('click', () => {
      accountMenu.hidden = true;
      accountMenuToggle.setAttribute('aria-expanded', 'false');
      switchTab('page-settings', { focusHeading: true });
    });
    document.getElementById('accountLogoutBtn').addEventListener('click', logout);
  }

  if (sidebarLogout) sidebarLogout.addEventListener('click', logout);

  // ==========================================
  // IDEA COUNCIL FRONTEND CONTROLLER
  // ==========================================

  // F05: lazy council bootstrap. The chunk loads on FIRST tab entry via
  // window.ZainBotDashboardAssets (dedupe + evict-on-fail); init+load run
  // only while the tab is still active (stale guard). Loading/error surface
  // via D03 notify plus an untracked inline note — deliberately NOT
  // renderState-tracked, so a later language switch never repaints over
  // council content. Dictionaries + t/getLanguage adapters stay here.
  let ideaCouncilModule = null;
  let councilChunkReady = false;
  let councilLoadToken = 0;

  function ensureCouncilModule() {
    if (!ideaCouncilModule) {
      if (!window.ZainBotIdeaCouncil || typeof window.ZainBotIdeaCouncil.create !== 'function') {
        throw new Error('[F05] dashboard-idea-council.js must load before use (via dashboard-assets.js)');
      }
      if (!window.ZainBotRequest || typeof window.ZainBotRequest.requestJson !== 'function') {
        throw new Error('[F05] dashboard-request.js must load before dashboard_new.js');
      }
      if (typeof window.ZainBotRequest.fetchBlob !== 'function') {
        throw new Error('[F05] dashboard-request.js must provide fetchBlob before dashboard_new.js');
      }
      ideaCouncilModule = window.ZainBotIdeaCouncil.create({
        requestJson: (...args) => window.ZainBotRequest.requestJson(...args),
        fetchBlob: (...args) => window.ZainBotRequest.fetchBlob(...args),
        getLanguage: () => currentLanguage,
        t: (key, fallback = '') => ideaT(key, fallback),
        feedback: window.ZainBotFeedback || null,
        a11y: window.ZainBotA11y || null,
      });
    }
    return ideaCouncilModule;
  }

  function showCouncilLoading() {
    const container = document.getElementById('ideasListContainer');
    if (container) {
      container.setAttribute('aria-busy', 'true');
      container.innerHTML = '<p data-council-note style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;"><i class="fas fa-spinner fa-spin" style="margin-inline-end:8px;"></i>' + ideaT('feedback_loading') + '</p>';
    }
    if (window.ZainBotFeedback && typeof window.ZainBotFeedback.notify === 'function') {
      window.ZainBotFeedback.notify({ level: 'info', key: 'feedback_loading' }, (key) => ideaT(key));
    }
  }

  function showCouncilLoadError(retry) {
    const container = document.getElementById('ideasListContainer');
    if (container) {
      container.setAttribute('aria-busy', 'false');
      container.innerHTML = '<p data-council-note style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">' + ideaT('lazy_load_failed') + '</p><p style="padding:0 24px 24px;text-align:center;"><button type="button" id="ideaChunkRetryBtn" class="btn btn-secondary btn-sm">' + ideaT('feedback_retry') + '</button></p>';
      const retryBtn = document.getElementById('ideaChunkRetryBtn');
      if (retryBtn && typeof retry === 'function') {
        retryBtn.addEventListener('click', retry);
      }
    }
    if (window.ZainBotFeedback && typeof window.ZainBotFeedback.notify === 'function') {
      window.ZainBotFeedback.notify({ level: 'error', key: 'lazy_load_failed' }, (key) => ideaT(key));
    }
  }

  function enterCouncilTab() {
    const myToken = ++councilLoadToken;
    const stillActive = () => myToken === councilLoadToken && activeTab === 'page-idea-council';
    if (!window.ZainBotDashboardAssets || typeof window.ZainBotDashboardAssets.loadFeature !== 'function') {
      showCouncilLoadError(() => enterCouncilTab());
      return;
    }
    if (!councilChunkReady) showCouncilLoading();
    window.ZainBotDashboardAssets.loadFeature('ideaCouncil').then(() => {
      if (!stillActive()) return;
      councilChunkReady = true;
      ensureCouncilModule().init();
      ensureCouncilModule().load();
    }).catch(() => {
      if (!stillActive()) return;
      showCouncilLoadError(() => enterCouncilTab());
    });
  }

  // F05: summary chunk loads on FIRST settings entry; init() wires once and
  // repaints every entry (replaces the refreshActiveBot-patch freshness).
  // Rendering into hidden boxes on a late resolve is benign (correct data).
  function enterSettingsTab() {
    loadSettingsData();
    if (!window.ZainBotDashboardAssets || typeof window.ZainBotDashboardAssets.loadFeature !== 'function') return;
    window.ZainBotDashboardAssets.loadFeature('settingsSummary').then(() => {
      if (window.ZainBotSettingsSummary && typeof window.ZainBotSettingsSummary.init === 'function') {
        window.ZainBotSettingsSummary.init();
      }
    }).catch(() => {
      if (window.ZainBotFeedback && typeof window.ZainBotFeedback.notify === 'function') {
        window.ZainBotFeedback.notify({ level: 'error', key: 'lazy_load_failed' }, (key) => ideaT(key));
      }
    });
  }

  function ideaT(key, fallback = '') {
    if (typeof translations !== 'undefined' && translations[currentLanguage] && translations[currentLanguage][key]) {
      return translations[currentLanguage][key];
    }
    if (typeof translations !== 'undefined' && translations.en && translations.en[key]) {
      return translations.en[key];
    }
    return fallback || key;
  }

  // Expose minimal hooks for settings-summary module
  window.switchTab = switchTab;
  window.__zainbotSettingsHooks = true;
  // ===== Manual subscriptions (Instapay / cash wallet + WhatsApp) =====
  let selectedPlanTier = 'growth_1k';
  let intendedPlanTier = null;
  let planManuallyChosen = false;
  const paidTiers = new Set(['growth_1k', 'growth_10k', 'growth_50k', 'unlimited']);

  function paintSelectedPlan() {
    document.querySelectorAll('.plan-pick').forEach(function (btn) {
      const active = btn.getAttribute('data-tier') === selectedPlanTier;
      btn.style.borderColor = active ? 'var(--orange)' : 'var(--glass-border)';
      btn.style.background = active ? 'rgba(255,150,50,0.15)' : '';
    });
    const badge = document.getElementById('currentPlanBadge');
    if (badge && currentUser) {
      const tier = currentUser.subscriptionTier || 'free';
      badge.textContent = tier === 'free'
        ? (translations[currentLanguage]?.subscription_current_free || 'Free plan')
        : tier;
    }
    const hint = document.getElementById('planIntentHint');
    if (hint) {
      hint.hidden = !intendedPlanTier || planManuallyChosen || currentUser?.subscriptionTier === intendedPlanTier;
      if (!hint.hidden) {
        const planName = document.querySelector(`.plan-pick[data-tier="${intendedPlanTier}"]`)?.textContent?.trim() || intendedPlanTier;
        hint.textContent = (translations[currentLanguage] || translations.en).subscription_intent_hint.replace('{plan}', planName);
      }
    }
  }

  document.querySelectorAll('.plan-pick').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectedPlanTier = btn.getAttribute('data-tier') || 'growth_1k';
      planManuallyChosen = true;
      paintSelectedPlan();
      refreshSubscriptionMeta();
    });
  });

  function normalizeWhatsappNumber(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (/^0\d{10}$/.test(digits)) return '20' + digits.slice(1);
    return digits;
  }

  let subscriptionConfigSnapshot = null;
  let subscriptionConfigRequest = null;
  async function refreshSubscriptionMeta() {
    try {
      // C03: memoize /api/config so language switches (and concurrent calls)
      // re-paint from cache with zero new requests. Boot warms the cache.
      if (!subscriptionConfigSnapshot) {
        if (!subscriptionConfigRequest) {
          subscriptionConfigRequest = fetch('/api/config')
            .then((res) => (res.ok ? res.json() : {}))
            .catch(() => ({}));
        }
        subscriptionConfigSnapshot = await subscriptionConfigRequest;
        subscriptionConfigRequest = null;
      }
      const cfg = subscriptionConfigSnapshot || {};
      const num = normalizeWhatsappNumber(cfg.subscribeWhatsapp || '');
      const link = document.getElementById('subscriptionWhatsappLink');
      if (link) {
        link.hidden = !/^\d{10,15}$/.test(num);
        link.style.display = link.hidden ? 'none' : '';
        if (!link.hidden) {
          const name = document.querySelector(`.plan-pick[data-tier="${selectedPlanTier}"]`)?.textContent?.trim() || selectedPlanTier;
          const msg = (translations[currentLanguage] || translations.en).subscription_whatsapp_message.replace('{plan}', name);
          link.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
        } else link.removeAttribute('href');
      }
    } catch (e) {}
    paintSelectedPlan();
  }

  // D08a: own requests list with clear loading/error/empty states — a load
  // failure renders an error row with a manual retry, never a silent empty.
  async function loadMySubscriptionRequests() {
    const body = document.getElementById('mySubscriptionRequestsBody');
    if (!body) return false;
    const t = translations[currentLanguage] || translations.en;
    body.replaceChildren();
    const loadingTr = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 5;
    loadingTd.style.cssText = 'padding:14px; text-align:center; color:var(--text-muted);';
    loadingTd.textContent = t.admin_subs_loading;
    loadingTr.appendChild(loadingTd);
    body.appendChild(loadingTr);
    try {
      const res = await dashboardRequest('/api/subscriptions/mine');
      if (!(res && res.success)) throw new Error('My requests unavailable');
      const rows = res.data || [];
      body.replaceChildren();
      if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.style.cssText = 'padding:14px; text-align:center; color:var(--text-muted);';
        td.textContent = t.subscription_my_requests_empty;
        tr.appendChild(td);
        body.appendChild(tr);
        return true;
      }
      rows.forEach(function (r) {
        const tr = document.createElement('tr');
        [r.tier, r.billingPeriod, r.paymentMethod, r.status, new Date(r.createdAt).toLocaleString()].forEach(function (v) {
          const td = document.createElement('td');
          td.style.padding = '10px';
          td.textContent = String(v || '—');
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      return true;
    } catch (e) {
      console.error('loadMySubscriptionRequests_error', e);
      body.replaceChildren();
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.style.cssText = 'padding:14px; text-align:center; color:var(--red);';
      td.textContent = t.subscription_list_error + ' ';
      const retry = document.createElement('button');
      retry.className = 'btn btn-sm btn-secondary';
      retry.type = 'button';
      retry.textContent = t.feedback_retry;
      retry.addEventListener('click', () => loadMySubscriptionRequests());
      td.appendChild(retry);
      tr.appendChild(td);
      body.appendChild(tr);
      return false;
    }
  }

  document.getElementById('subscriptionRequestForm')?.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const t = translations[currentLanguage] || translations.en;
    if (selectedPlanTier === 'free') {
      alert(t.subscription_already_free);
      return;
    }
    // D08b: submit guard — one in-flight POST (Enter+click = ONE request).
    // The payment reference clears ONLY on a confirmed success; on conflict,
    // timeout, or unknown outcome it is retained and reconciled via GET.
    const core = window.ZainBotRequest;
    const run = core && typeof core.runExclusive === 'function'
      ? (k, op) => core.runExclusive(k, op)
      : (k, op) => op();
    const feedback = window.ZainBotFeedback;
    const submitBtn = document.querySelector('#subscriptionRequestForm [type="submit"]');
    const guarded = feedback && typeof feedback.withPending === 'function' && submitBtn
      ? () => feedback.withPending('subscription-request', [submitBtn], () => postSubscriptionRequest())
      : () => postSubscriptionRequest();
    try {
      await run('subscription-request', guarded);
    } catch (err) {
      console.error(err);
    }

    async function postSubscriptionRequest() {
      const refEl = document.getElementById('subPaymentReference');
      const payload = {
        tier: selectedPlanTier,
        billingPeriod: document.getElementById('subBillingPeriod')?.value || 'monthly',
        paymentMethod: document.getElementById('subPaymentMethod')?.value || 'instapay',
        paymentReference: refEl?.value || '',
      };
      try {
        const res = await dashboardRequest('/api/subscriptions/request', { method: 'POST', body: JSON.stringify(payload) }, { operation: 'mutation' });
        if (res && res.success) {
          alert(t.subscription_request_sent);
          if (refEl) refEl.value = '';
          await loadMySubscriptionRequests();
          return;
        }
        alert((res && (res.message || res.error)) || t.subscription_request_failed);
      } catch (err) {
        console.error('subscription_request_error', err);
        if (err && (err.code === 'PENDING_REQUEST_EXISTS' || err.status === 409)) {
          // A pending request already exists: show its state, reconcile via
          // GET — never re-POST.
          alert(t.subscription_request_pending);
          await loadMySubscriptionRequests();
        } else if (err && (err.kind === 'timeout' || err.kind === 'network')) {
          // Outcome unknown after a mutation: the reference is retained and
          // the list reconciles via GET — never a blind re-POST.
          alert(t.subscription_request_unknown);
          await loadMySubscriptionRequests();
        } else {
          alert((err && err.message) || t.subscription_request_failed);
        }
      }
    }
  });

  // D08a: admin requests list with clear loading/error/empty states.
  async function loadAdminSubs() {
    const body = document.getElementById('adminSubsTableBody');
    if (!body) return false;
    const t = translations[currentLanguage] || translations.en;
    const status = document.getElementById('adminSubsStatusFilter')?.value || '';
    body.replaceChildren();
    const loadingTr = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 6;
    loadingTd.style.cssText = 'padding:20px; text-align:center; color:var(--text-muted);';
    loadingTd.textContent = t.admin_subs_loading;
    loadingTr.appendChild(loadingTd);
    body.appendChild(loadingTr);
    try {
      const res = await dashboardRequest('/api/subscriptions/requests' + (status ? '?status=' + encodeURIComponent(status) : ''));
      if (!(res && res.success)) throw new Error('Admin requests unavailable');
      const rows = res.data || [];
      body.replaceChildren();
      if (!rows.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.style.cssText = 'padding:20px; text-align:center; color:var(--text-muted);';
        td.textContent = t.subscription_admin_empty;
        tr.appendChild(td);
        body.appendChild(tr);
        return true;
      }
      rows.forEach(function (r) {
        const tr = document.createElement('tr');
        const user = r.userId && typeof r.userId === 'object' ? (r.userId.username + ' / ' + r.userId.email) : String(r.userId);
        const cells = [user, r.tier, r.billingPeriod, r.paymentMethod + (r.paymentReference ? ' • ' + r.paymentReference : ''), r.status];
        cells.forEach(function (v) {
          const td = document.createElement('td');
          td.style.padding = '10px';
          td.textContent = String(v || '—');
          tr.appendChild(td);
        });
        const actions = document.createElement('td');
        actions.style.padding = '10px';
        if (r.status === 'pending') {
          const ok = document.createElement('button');
          ok.className = 'btn btn-primary btn-sm';
          ok.textContent = t.subscription_action_approve;
          ok.addEventListener('click', function () {
            reviewSubscriptionRequest(r._id, 'approve', [ok, no]);
          });
          const no = document.createElement('button');
          no.className = 'btn btn-secondary btn-sm';
          no.style.marginInlineStart = '6px';
          no.textContent = t.subscription_action_reject;
          no.addEventListener('click', function () {
            reviewSubscriptionRequest(r._id, 'reject', [ok, no]);
          });
          actions.append(ok, no);
        } else {
          actions.textContent = '—';
        }
        tr.appendChild(actions);
        body.appendChild(tr);
      });
      return true;
    } catch (e) {
      console.error('loadAdminSubs_error', e);
      body.replaceChildren();
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.style.cssText = 'padding:20px; text-align:center; color:var(--red);';
      td.textContent = t.subscription_list_error + ' ';
      const retry = document.createElement('button');
      retry.className = 'btn btn-sm btn-secondary';
      retry.type = 'button';
      retry.textContent = t.feedback_retry;
      retry.addEventListener('click', () => loadAdminSubs());
      td.appendChild(retry);
      tr.appendChild(td);
      body.appendChild(tr);
      return false;
    }
  }

  // D08c: approve + reject share ONE lock per request id — an approve/reject
  // race sends a single PUT. A 409 means another review already landed:
  // report the conflict and reconcile via GET, never re-PUT. A 500 may have
  // persisted the review server-side: report it, reconcile read-only, and
  // NEVER auto-retry the approval. UI-only: activation atomicity untouched.
  async function reviewSubscriptionRequest(id, action, buttons) {
    const t = translations[currentLanguage] || translations.en;
    const controls = Array.isArray(buttons) ? buttons : [];
    const previous = controls.map((b) => b.disabled);
    controls.forEach((b) => { b.disabled = true; });
    try {
      await withEntityLock(`subscription-request:${id}`, id, async () => {
        try {
          const resp = await dashboardRequest('/api/subscriptions/requests/' + id, { method: 'PUT', body: JSON.stringify({ action }) }, { operation: 'mutation' });
          if (resp && resp.success) {
            await loadAdminSubs();
          } else {
            alert((resp && resp.message) || t.subscription_action_error);
          }
        } catch (err) {
          console.error('subscription_review_error', err);
          if (err && err.status === 409) {
            alert(t.subscription_review_conflict);
            await loadAdminSubs();
          } else {
            alert((err && err.message) || t.subscription_action_error);
            await loadAdminSubs();
          }
        }
      });
    } finally {
      controls.forEach((b, i) => { b.disabled = previous[i]; });
    }
  }

  document.getElementById('adminSubsRefreshBtn')?.addEventListener('click', loadAdminSubs);
  document.getElementById('adminSubsStatusFilter')?.addEventListener('change', loadAdminSubs);

  const _origCheckAuthAndLoad = checkAuthAndLoad;
  checkAuthAndLoad = async function () {
    await _origCheckAuthAndLoad();
    intendedPlanTier = paidTiers.has(currentUser?.intendedTier) ? currentUser.intendedTier : null;
    if (currentUser && !intendedPlanTier) {
      try {
        const pending = localStorage.getItem('zainbot_pending_plan');
        const time = Number(localStorage.getItem('zainbot_pending_plan_time'));
        if (paidTiers.has(pending) && time > 0 && Date.now() - time < 60 * 60 * 1000) intendedPlanTier = pending;
      } catch (e) { /* Storage may be disabled. */ }
    }
    try {
      localStorage.removeItem('zainbot_pending_plan');
      localStorage.removeItem('zainbot_pending_plan_time');
    } catch (e) { /* Storage may be disabled. */ }
    if (intendedPlanTier && !planManuallyChosen) selectedPlanTier = intendedPlanTier;
    paintSelectedPlan();
    refreshSubscriptionMeta();
    loadMySubscriptionRequests();
  };

  // Initialize and Boot System
  // F05: council inits on first tab entry (lazy); nothing council at boot.
  checkAuthAndLoad();
  applyLanguage(currentLanguage);

})();
