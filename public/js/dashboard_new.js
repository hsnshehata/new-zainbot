// public/js/dashboard_new.js

(function() {
  'use strict';

  // State Management
  let currentUser = null;
  let currentBot = null;
  let workspaceBots = [];
  let activeTab = 'page-overview';
  let currentLanguage = localStorage.getItem('zainbot_lang') || 'ar';
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
      menu_training: 'AI Training',
      menu_channels: 'Connections',
      menu_orders: 'Orders & Bookings',
      menu_settings: 'Settings & Billing',
      menu_admin: 'Super Admin Control',
      menu_agents: 'AI Agents',
      agents_title: 'AI Agents',
      agents_desc: 'Build distinct agents for support, sales, and lead qualification. Choose one active agent for the workspace.',
      agents_create: 'Create agent',
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
      stat_conversations: 'Conversations',
      stat_messages: 'Messages handled',
      stat_connected_channels: 'Connected channels',
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
      save_guidelines_btn: 'Save Settings',
      training_faqs_title: 'FAQs Rules List',
      btn_add_faq: 'Add FAQ',
      channels_title: 'Connect Your Channels',
      chan_desc_wa: 'Connect official cloud API or gateway.',
      chan_desc_fb: 'Automate replies on Facebook pages.',
      chan_desc_ig: 'Direct Messages & Comment automation.',
      chan_desc_tg: 'Integrate custom Telegram chatbot.',
      btn_configure: 'Configure',
      website_widget_title: 'Website Chat Widget',
      website_widget_desc: 'Copy this script tag and insert it before the closing body tag of your HTML to display the chat icon.',
      ecommerce_sync_title: 'E-commerce Store Catalog',
      label_store_provider: 'Platform',
      store_none: 'Not connected',
      label_store_url: 'Store URL',
      btn_sync_catalog: 'Save & Sync Catalog',
      orders_bookings_title: 'Orders & Appointments Center',
      chat_orders_list_title: 'Orders Automatically Generated by AI',
      th_order_id: 'Order ID',
      th_customer: 'Customer Name',
      th_phone: 'Phone',
      th_items: 'Items',
      th_total: 'Total',
      th_status: 'Status',
      appointments_list_title: 'AI Booked Appointments Calendar',
      th_booking_customer: 'Customer',
      th_booking_phone: 'Phone',
      th_booking_time: 'Date & Time',
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
      btn_save: 'Save Rule',
      label_faq_question: 'Question / Keywords',
      label_faq_answer: 'Expected Answer',
      faq_question_placeholder: 'For example, delivery times',
      faq_answer_placeholder: 'For example, we deliver within three business days across Cairo.',
      orders_empty: 'No orders generated yet.',
      bookings_empty: 'No appointments booked yet.',
      api_keys_empty: 'No API keys generated.',
      webhook_history_empty: 'No webhook history.',
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
      th_event_actor: 'Actor ΓåÆ Target',
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
      action_test: 'Test Send',
      delete_booking_confirm: 'Are you sure you want to delete this appointment?',
      delete_order_confirm: 'Are you sure you want to delete this order?',
      delete_recipient_confirm: 'Are you sure you want to remove this notification channel?',
      booking_saved_ok: 'Appointment saved successfully!',
      order_saved_ok: 'Order saved successfully!',
      recipient_saved_ok: 'Notification channel saved successfully!',
      recipient_test_sent: 'Test notification sent successfully!',
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
      preview_status_online: 'Online ┬╖ AI Sales Ready',
      preview_input_placeholder: 'Type your message here...',
      free_plan_tools_limit_badge: '(Free Plan Limit: 2 tools max)',
      free_plan_skills_limit_badge: '(Free Plan Limit: 2 skills max)',
      label_chat_page_logo: 'Chat Page Logo / Avatar',
      btn_upload_logo: 'Upload Logo',
      btn_remove_logo: 'Remove',
      hint_logo_format: 'PNG or JPG up to 2MB',
      placeholder_store_url: 'https://my-store.myshopify.com',
      store_sync_feedback: 'Store catalog sync configured successfully. Your AI agent can now recommend products from your catalog.',
      store_sync_planned: 'Direct automated catalog sync for Shopify & WooCommerce is scheduled for live rollout. The built-in catalog is active.',
      automation_center_title: 'AI Sales Automation Center',
      automation_center_desc: 'Manage autonomous background tasks: abandoned lead recovery, sales digests, and urgent triage.',
      btn_trigger_recovery: 'Recover Lost Leads Now',
      btn_trigger_digest: 'Send Sales Digest Now',
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
      idea_chip_pricing: '≡ƒÆ░ Lower Price / Cost Advantage',
      idea_chip_niche: '≡ƒÄ» Underserved Niche Segment',
      idea_chip_distribution: '≡ƒñ¥ Existing Distribution / Partners',
      idea_chip_guarantee: '≡ƒ¢í∩╕Å Risk-Free Trial / Guarantee',
      idea_chip_speed: 'ΓÜí Radical Simplification',
      idea_chip_team: '≡ƒæÑ Proven Domain Expert Team',
      idea_chip_offline: '≡ƒôì Prime Physical Location / Foot Traffic',
      idea_chip_inventory: '≡ƒôª Existing Prototype / Inventory Ready',
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
      menu_overview: '┘å╪╕╪▒╪⌐ ╪╣╪º┘à╪⌐',
      menu_inbox: '╪╡┘å╪»┘ê┘é ╪º┘ä┘ê╪º╪▒╪» ╪º┘ä┘à┘ê╪¡╪»',
      menu_training: '╪¬╪»╪▒┘è╪¿ ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      menu_channels: '╪▒╪¿╪╖ ╪º┘ä┘é┘å┘ê╪º╪¬',
      menu_orders: '╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ê╪º┘ä╪¡╪¼┘ê╪▓╪º╪¬',
      menu_settings: '╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ ┘ê╪º┘ä╪º╪┤╪¬╪▒╪º┘â',
      menu_admin: '┘ä┘ê╪¡╪⌐ ╪¬╪¡┘â┘à ╪º┘ä╪ú╪»┘à┘å',
      menu_agents: '╪º┘ä┘ê┘â┘ä╪º╪í ╪º┘ä╪░┘â┘è┘ê┘å',
      agents_title: '╪º┘ä┘ê┘â┘ä╪º╪í ╪º┘ä╪░┘â┘è┘ê┘å',
      agents_desc: '╪ú┘å╪┤╪ª ┘ê┘â┘ä╪º╪í ┘à┘å┘ü╪╡┘ä┘è┘å ┘ä┘ä╪»╪╣┘à ┘ê╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ┘ê╪¬╪ú┘ç┘è┘ä ╪º┘ä╪╣┘à┘ä╪º╪í╪î ╪½┘à ╪º╪«╪¬╪▒ ╪º┘ä┘ê┘â┘è┘ä ╪º┘ä┘å╪┤╪╖ ┘ä┘à╪│╪º╪¡╪⌐ ╪º┘ä╪╣┘à┘ä.',
      agents_create: '╪Ñ┘å╪┤╪º╪í ┘ê┘â┘è┘ä',
      agent_name: '╪º╪│┘à ╪º┘ä┘ê┘â┘è┘ä',
      agent_role: '╪»┘ê╪▒ ╪º┘ä┘ê┘â┘è┘ä',
      agent_role_support: '╪»╪╣┘à ╪º┘ä╪╣┘à┘ä╪º╪í',
      agent_role_sales: '┘à╪¿┘è╪╣╪º╪¬',
      agent_role_leads: '╪¬╪ú┘ç┘è┘ä ╪º┘ä╪╣┘à┘ä╪º╪í',
      agent_role_custom: '┘à╪«╪╡╪╡',
      agent_description: '╪º┘ä┘ê╪╡┘ü',
      agent_welcome_message: '╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪¬╪▒╪¡┘è╪¿',
      agent_description_placeholder: '┘à╪│╪ñ┘ê┘ä┘è╪º╪¬ ┘ç╪░╪º ╪º┘ä┘ê┘â┘è┘ä',
      agent_instructions: '╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬',
      agent_instructions_placeholder: '╪º┘ä┘å╪¿╪▒╪⌐ ┘ê┘à╪╡╪º╪»╪▒ ╪º┘ä┘à╪╣┘ä┘ê┘à╪⌐ ┘ê╪º┘ä┘é┘ê╪º╪╣╪» ╪º┘ä┘à┘à┘å┘ê╪╣╪⌐ ┘ê╪«╪╖┘ê╪º╪¬ ╪º┘ä╪¬╪╡╪╣┘è╪»',
      agent_objectives: '╪º┘ä╪ú┘ç╪»╪º┘ü',
      agent_objectives_placeholder: '╪º┘â╪¬╪¿ ┘ç╪»┘ü┘ï╪º ┘ü┘è ┘â┘ä ╪│╪╖╪▒',
      agent_handoff_keywords: '┘â┘ä┘à╪º╪¬ ╪º┘ä╪¬╪¡┘ê┘è┘ä ┘ä┘à┘ê╪╕┘ü',
      agent_handoff_placeholder: '┘à┘ê╪╕┘ü╪î ┘à╪»┘è╪▒╪î ╪┤┘â┘ê┘ë',
      agent_auto_reply: '╪¬┘ü╪╣┘è┘ä ╪º┘ä╪▒╪» ╪º┘ä╪¬┘ä┘é╪º╪ª┘è ┘ä┘ä┘ê┘â┘è┘ä',
      agent_save: '╪¡┘ü╪╕ ╪º┘ä┘ê┘â┘è┘ä',

      // ┘à╪▒┘â╪▓ ╪º┘ä╪¬╪¡┘â┘à ╪¿╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ (┘à┘å╪╕┘à)
      settings_intro_desc: '┘â┘ä ╪ú╪»┘ê╪º╪¬ ╪º┘ä╪¬╪¡┘â┘à ┘ü┘è ╪º┘ä┘ê┘â┘è┘ä ┘ê┘à╪│╪º╪¡╪⌐ ╪º┘ä╪╣┘à┘ä ┘ü┘è ┘à┘â╪º┘å ┘ê╪º╪¡╪»╪î ┘à┘é╪│┘à╪⌐ ┘ä╪ú┘é╪│╪º┘à ┘à╪▒╪¬╪¿╪⌐: ╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä┘ê┘â┘è┘ä╪î ┘é╪»╪▒╪º╪¬┘ç╪î ╪º┘ä╪¬┘å╪¿┘è┘ç╪º╪¬╪î ┘å┘à┘ê╪░╪¼ ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è╪î ┘ê╪¬┘â╪º┘à┘ä╪º╪¬ ╪º┘ä┘à╪╖┘ê╪▒┘è┘å.',
      set_sec_instructions_title: '╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä┘ê┘â┘è┘ä ┘ê╪┤╪«╪╡┘è╪¬┘ç',
      set_sec_instructions_desc: '┘à╪º╪░╪º ┘è┘é┘ê┘ä ╪º┘ä┘ê┘â┘è┘ä ┘ê┘â┘è┘ü ┘è╪¬╪╡╪▒┘ü: ╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪¬╪▒╪¡┘è╪¿╪î ┘é┘ê╪º╪╣╪» ╪º┘ä╪┤╪«╪╡┘è╪⌐╪î ╪º┘ä╪ú┘ç╪»╪º┘ü╪î ┘ê╪¬╪¡┘ê┘è┘ä ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ┘ä┘ä┘à┘ê╪╕┘ü┘è┘å. ╪¬┘Å╪╖╪¿┘é ╪╣┘ä┘ë ╪º┘ä┘ê┘â┘è┘ä ╪º┘ä┘å╪┤╪╖.',
      set_open_training: '┘ü╪¬╪¡ ╪¬╪»╪▒┘è╪¿ ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      set_sec_capabilities_title: '┘é╪»╪▒╪º╪¬ ╪º┘ä┘ê┘â┘è┘ä',
      set_sec_capabilities_desc: '╪¬╪┤╪║┘è┘ä ╪ú┘ê ╪Ñ┘è┘é╪º┘ü ┘à╪º ┘è╪│╪¬╪╖┘è╪╣ ╪º┘ä┘ê┘â┘è┘ä ╪º┘ä┘å╪┤╪╖ ┘ü╪╣┘ä┘ç: ╪º┘ä╪¡╪¼┘ê╪▓╪º╪¬╪î ╪¬╪¬╪¿╪╣ ╪º┘ä╪╖┘ä╪¿╪º╪¬╪î ╪º┘ä╪¬┘å╪¿┘è┘ç╪º╪¬╪î ╪º╪│╪¬╪╣╪º╪»╪⌐ ╪º┘ä╪╣┘à┘ä╪º╪í╪î ╪º┘ä╪¬┘é╪º╪▒┘è╪▒ ╪º┘ä┘è┘ê┘à┘è╪⌐╪î ┘ê╪º┘ä╪¿┘è╪╣ ╪º┘ä╪░┘â┘è. ╪╣╪»┘æ┘ä ╪º┘ä╪¬┘ü╪º╪╡┘è┘ä ┘à┘å ╪¿╪╖╪º┘é╪⌐ ╪º┘ä┘ê┘â┘è┘ä.',
      set_open_agents: '╪¬╪╣╪»┘è┘ä ╪º┘ä┘ê┘â┘è┘ä ╪º┘ä┘å╪┤╪╖',
      dev_integrations_title: '╪¬┘â╪º┘à┘ä╪º╪¬ ╪º┘ä┘à╪╖┘ê╪▒┘è┘å ┘ê╪º┘ä┘ê┘è╪¿ ┘ç┘ê┘â',
      dev_integrations_desc: '╪ú┘å╪┤╪ª ┘à┘ü╪º╪¬┘è╪¡ ┘ê╪╡┘ê┘ä ┘ä┘ä╪¬╪╖╪¿┘è┘é╪º╪¬ ╪º┘ä╪«╪º╪▒╪¼┘è╪⌐ ┘ê╪ú╪▒╪│┘ä ╪ú╪¡╪»╪º╪½ ╪º┘ä┘à┘å╪╡╪⌐ ╪Ñ┘ä┘ë ╪ú┘å╪╕┘à╪¬┘â ┘ü┘è ╪º┘ä┘ê┘é╪¬ ╪º┘ä┘ü╪╣┘ä┘è.',
      wh_event_msg_received: 'message.received',
      wh_event_msg_sent: 'message.sent',
      wh_event_order_created: 'order.created',
      set_no_agent: '┘ä╪º ┘è┘ê╪¼╪» ┘ê┘â┘è┘ä ┘å╪┤╪╖ ╪¿╪╣╪». ╪ú┘å╪┤╪ª ┘ê┘â┘è┘ä╪º┘ï ╪ú┘ê ╪º╪«╪¬╪▒ ┘ê╪º╪¡╪»╪º┘ï ┘à┘å ╪╡┘ü╪¡╪⌐ ╪º┘ä┘ê┘â┘ä╪º╪í.',
      set_state_enabled: '┘à┘ü╪╣┘ä',
      set_state_disabled: '┘à╪¬┘ê┘é┘ü',
      set_value_not_set: '╪║┘è╪▒ ┘à╪¡╪»╪»',
      set_label_welcome: '╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪¬╪▒╪¡┘è╪¿',
      set_label_persona_rules: '╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä╪┤╪«╪╡┘è╪⌐',
      set_unit_lines: '╪│╪╖╪▒',
      set_label_objectives: '╪º┘ä╪ú┘ç╪»╪º┘ü',
      set_label_handoff: '┘â┘ä┘à╪º╪¬ ╪º┘ä╪¬╪¡┘ê┘è┘ä ┘ä┘ä┘à┘ê╪╕┘ü',
      set_label_auto_reply: '╪º┘ä╪▒╪» ╪º┘ä╪¬┘ä┘é╪º╪ª┘è',
      set_label_tools: '╪º┘ä╪ú╪»┘ê╪º╪¬',
      set_label_skills: '╪º┘ä┘à┘ç╪º╪▒╪º╪¬',
      set_tool_booking: '╪º┘ä╪¡╪¼┘ê╪▓╪º╪¬ ┘ê╪º┘ä┘à┘ê╪º╪╣┘è╪»',
      set_tool_orders: '╪¬╪¬╪¿╪╣ ╪º┘ä╪╖┘ä╪¿╪º╪¬',
      set_tool_wa: '╪¬┘å╪¿┘è┘ç╪º╪¬ ┘ê╪º╪¬╪│╪º╪¿',
      set_tool_tg: '╪¬┘å╪¿┘è┘ç╪º╪¬ ╪¬┘ä┘è╪¼╪▒╪º┘à',
      set_tool_recovery: '╪º╪│╪¬╪╣╪º╪»╪⌐ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘à╪¬╪▒┘ê┘â╪⌐',
      set_tool_digest: '╪º┘ä╪¬┘é╪▒┘è╪▒ ╪º┘ä┘è┘ê┘à┘è',
      set_tool_upsell: '╪º┘ä╪¿┘è╪╣ ╪º┘ä╪░┘â┘è',
      admin_search_placeholder: '╪º╪¿╪¡╪½ ╪¿╪º┘ä╪º╪│┘à ╪ú┘ê ╪º┘ä╪¿╪▒┘è╪» ╪ú┘ê ┘ê╪º╪¬╪│╪º╪¿',
      admin_filter_role: '╪¬╪╡┘ü┘è╪⌐ ╪¡╪│╪¿ ╪º┘ä╪»┘ê╪▒',
      admin_filter_status: '╪¬╪╡┘ü┘è╪⌐ ╪¡╪│╪¿ ╪º┘ä╪¡╪º┘ä╪⌐',
      admin_filter_tier: '╪¬╪╡┘ü┘è╪⌐ ╪¡╪│╪¿ ╪º┘ä╪¿╪º┘é╪⌐',
      admin_all_roles: '┘â┘ä ╪º┘ä╪ú╪»┘ê╪º╪▒',
      admin_visible_accounts: '╪º┘ä╪¡╪│╪º╪¿╪º╪¬ ╪º┘ä╪╕╪º┘ç╪▒╪⌐',
      admin_all_tiers: '┘â┘ä ╪º┘ä╪¿╪º┘é╪º╪¬',
      admin_apply: '╪¬╪╖╪¿┘è┘é',
      admin_previous: '╪º┘ä╪│╪º╪¿┘é',
      admin_next: '╪º┘ä╪¬╪º┘ä┘è',
      admin_user_modal: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪¡╪│╪º╪¿',
      admin_username: '╪º╪│┘à ╪º┘ä┘à╪│╪¬╪«╪»┘à',
      admin_email: '╪º┘ä╪¿╪▒┘è╪» ╪º┘ä╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è',
      admin_whatsapp: '┘ê╪º╪¬╪│╪º╪¿',
      admin_role: '╪º┘ä╪»┘ê╪▒',
      admin_user: '┘à╪│╪¬╪«╪»┘à',
      admin_superadmin: '┘à╪»┘è╪▒ ╪╣╪º┘à',
      admin_subscription: '┘å┘ê╪╣ ╪º┘ä╪º╪┤╪¬╪▒╪º┘â',
      admin_plan_tier: '╪º┘ä╪¿╪º┘é╪⌐',
      admin_free: '┘à╪¼╪º┘å┘è',
      admin_monthly: '╪┤┘ç╪▒┘è',
      admin_yearly: '╪│┘å┘ê┘è',
      admin_active: '┘å╪┤╪╖',
      admin_suspended: '┘à┘ê┘é┘ê┘ü',
      admin_verification: '╪º┘ä╪¬┘ê╪½┘è┘é',
      admin_verified: '┘à┘ê╪½┘é',
      admin_not_verified: '╪║┘è╪▒ ┘à┘ê╪½┘é',
      admin_daily_usage: '╪º┘ä╪▒╪│╪º╪ª┘ä ╪º┘ä┘à╪│╪¬╪«╪»┘à╪⌐ ╪º┘ä┘è┘ê┘à',
      admin_monthly_usage: '╪º┘ä╪▒╪│╪º╪ª┘ä ╪º┘ä┘à╪│╪¬╪«╪»┘à╪⌐ ╪┤┘ç╪▒┘è┘ï╪º',
      admin_temporary_password: '┘â┘ä┘à╪⌐ ┘à╪▒┘ê╪▒ ┘à╪ñ┘é╪¬╪⌐',
      admin_password_help: '╪º╪¬╪▒┘â┘ç╪º ┘ü╪º╪▒╪║╪⌐ ┘ä┘ä╪Ñ╪¿┘é╪º╪í ╪╣┘ä┘ë ┘â┘ä┘à╪⌐ ╪º┘ä┘à╪▒┘ê╪▒ ╪º┘ä╪¡╪º┘ä┘è╪⌐.',
      admin_confirm_password: '╪¬╪ú┘â┘è╪» ┘â┘ä┘à╪⌐ ╪º┘ä┘à╪▒┘ê╪▒',
      admin_save_user: '╪¡┘ü╪╕ ╪º┘ä╪¡╪│╪º╪¿',
      impersonation_title: '╪¿╪»╪í ╪»╪«┘ê┘ä ┘à╪ñ┘é╪¬ ┘à╪│╪¼┘ä',
      impersonation_desc: '╪│┘è╪¿╪»╪ú ┘ç╪░╪º ╪»╪«┘ê┘ä┘ï╪º ┘à╪ñ┘é╪¬┘ï╪º ┘ê┘à╪│╪¼┘ä┘ï╪º. ╪º┘â╪¬╪¿ ╪│╪¿╪¿ ╪º┘ä╪»╪«┘ê┘ä.',
      impersonation_reason: '╪│╪¿╪¿ ╪º┘ä╪»╪«┘ê┘ä',
      impersonation_continue: '┘à╪¬╪º╪¿╪╣╪⌐',
      logout: '╪¬╪│╪¼┘è┘ä ╪º┘ä╪«╪▒┘ê╪¼',
      account_quota_remaining: '╪º┘ä╪▒╪│╪º╪ª┘ä ╪º┘ä┘à╪¬╪¿┘é┘è╪⌐',
      account_settings: '╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä╪¡╪│╪º╪¿',
      stat_conversations: '╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬',
      stat_messages: '╪º┘ä╪▒╪│╪º╪ª┘ä ╪º┘ä╪¬┘è ╪¬┘à╪¬ ┘à╪╣╪º┘ä╪¼╪¬┘ç╪º',
      stat_connected_channels: '╪º┘ä┘é┘å┘ê╪º╪¬ ╪º┘ä┘à╪▒╪¬╪¿╪╖╪⌐',
      stat_training_rules: '┘é┘ê╪º╪╣╪» ╪º┘ä╪¬╪»╪▒┘è╪¿',
      workspace_status_title: '╪¡╪º┘ä╪⌐ ┘à╪│╪º╪¡╪⌐ ╪º┘ä╪╣┘à┘ä',
      workspace_status_desc: '┘à┘ä╪«╪╡ ┘à╪¿╪º╪┤╪▒ ┘ä┘ä╪¿┘ê╪¬ ╪º┘ä┘à╪¡╪»╪» ╪¡╪º┘ä┘è┘ï╪º ┘ü┘è ┘à╪│╪º╪¡╪⌐ ╪º┘ä╪╣┘à┘ä.',
      workspace_active_bot: '╪º┘ä╪¿┘ê╪¬ ╪º┘ä┘å╪┤╪╖',
      workspace_auto_reply: '╪º┘ä╪▒╪» ╪º┘ä╪¬┘ä┘é╪º╪ª┘è ╪¿╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      workspace_orders: '╪╖┘ä╪¿╪º╪¬ ┘à┘å ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬',
      status_enabled: '┘à┘ü╪╣┘æ┘ä',
      status_disabled: '┘à╪¬┘ê┘é┘ü',
      quota_unlimited: '╪║┘è╪▒ ┘à╪¡╪»┘ê╪»',
      stat_active_chats: '╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ╪º┘ä┘å╪┤╪╖╪⌐',
      stat_response_speed: '╪│╪▒╪╣╪⌐ ╪º┘ä╪º╪│╪¬╪¼╪º╪¿╪⌐',
      stat_satisfaction: '╪▒╪╢╪º ╪º┘ä╪╣┘à┘ä╪º╪í',
      stat_orders_count: '╪º┘ä╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à┘â╪¬┘à┘ä╪⌐',
      usage_summary_title: '╪º┘ä╪«╪╖╪⌐ ╪º┘ä╪┤┘ç╪▒┘è╪⌐ ┘ê╪º┘ä╪º╪│╪¬┘ç┘ä╪º┘â',
      current_plan_label: '╪º┘ä╪¿╪º┘é╪⌐ ╪º┘ä╪¡╪º┘ä┘è╪⌐:',
      conversations_used_label: '╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ╪º┘ä┘à╪│╪¬┘ç┘ä┘â╪⌐',
      performance_chart_title: '┘à╪╣╪»┘ä ╪¡╪¼┘à ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ╪º┘ä┘è┘ê┘à┘è',
      funnel_title: '┘é┘à╪╣ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬',
      funnel_leads: '╪º┘ä╪╣┘à┘ä╪º╪í ╪º┘ä┘à╪¡╪¬┘à┘ä┘è┘å ╪º┘ä╪¼╪»╪»',
      funnel_qualified: '╪º┘ä╪╣┘à┘ä╪º╪í ╪º┘ä┘à╪ñ┘ç┘ä┘è┘å',
      funnel_closed: '╪º┘ä╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à┘â╪¬┘à┘ä╪⌐',
      inbox_chat_list_title: '╪«┘ä╪º╪╡╪⌐ ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬',
      inbox_empty: '┘ä╪º ╪¬┘ê╪¼╪» ┘à╪¡╪º╪»╪½╪º╪¬ ┘å╪┤╪╖╪⌐.',
      auto_reply_toggle_label: '╪º┘ä╪▒╪» ╪º┘ä╪¬┘ä┘é╪º╪ª┘è ┘ä┘ä╪¿┘ê╪¬',
      select_chat_instructions: '╪º╪«╪¬╪▒ ┘à╪¡╪º╪»╪½╪⌐ ┘à┘å ╪º┘ä┘é╪º╪ª┘à╪⌐ ╪º┘ä╪¼╪º┘å╪¿┘è╪⌐ ┘ä╪╣╪▒╪╢ ╪º┘ä╪│╪¼┘ä ┘ê╪º┘ä╪¬┘ü╪º╪╣┘ä ╪º┘ä╪¿╪┤╪▒┘è ╪º┘ä┘à╪¿╪º╪┤╪▒.',
      chat_reply_placeholder: '╪º┘â╪¬╪¿ ╪▒╪│╪º┘ä╪⌐ ┘ä┘ä╪¬╪»╪«┘ä ┘ü┘è ╪º┘ä┘à╪¡╪º╪»╪½╪⌐...',
      training_title: '┘à╪▒┘â╪▓ ╪¬╪»╪▒┘è╪¿ ╪º┘ä╪¿┘ê╪¬',
      training_brand_guidelines_title: '╪Ñ╪▒╪┤╪º╪»╪º╪¬ ╪º┘ä┘ç┘ê┘è╪⌐ ┘ê╪º┘ä╪¬┘ê╪¼┘è┘ç',
      label_welcome_message: '╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪¬╪▒╪¡┘è╪¿',
      label_custom_instructions: '╪¬╪╣┘ä┘è┘à╪º╪¬ ╪┤╪«╪╡┘è╪⌐ ╪º┘ä╪¿┘ê╪¬',
      training_welcome_placeholder: '╪º┘â╪¬╪¿ ╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪¬╪▒╪¡┘è╪¿ ╪º┘ä╪¬┘è ┘è╪▒╪º┘ç╪º ╪º┘ä╪╣┘à┘è┘ä...',
      training_persona_placeholder: '┘à╪½╪º┘ä: ╪º╪┤╪▒╪¡ ┘å╪¿╪▒╪⌐ ╪º┘ä╪¿┘ê╪¬ ┘ê┘à╪│╪ñ┘ê┘ä┘è╪º╪¬┘ç ┘ê┘é┘ê╪º╪╣╪» ╪¬╪¡┘ê┘è┘ä ╪º┘ä┘à╪¡╪º╪»╪½╪⌐ ┘ä┘à┘ê╪╕┘ü.',
      training_empty_faqs: '┘ä╪º ╪¬┘ê╪¼╪» ╪ú╪│╪ª┘ä╪⌐ ╪┤╪º╪ª╪╣╪⌐ ╪¿╪╣╪». ╪ú╪╢┘ü ╪ú┘ê┘ä ╪│╪ñ╪º┘ä ┘ê╪¼┘ê╪º╪¿.',
      save_guidelines_btn: '╪¡┘ü╪╕ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬',
      training_faqs_title: '┘é╪º╪ª┘à╪⌐ ╪º┘ä╪ú╪│╪ª┘ä╪⌐ ╪º┘ä╪┤╪º╪ª╪╣╪⌐ ┘ê╪º┘ä╪ú╪¼┘ê╪¿╪⌐',
      btn_add_faq: '╪Ñ╪╢╪º┘ü╪⌐ ╪│╪ñ╪º┘ä ┘ê╪¼┘ê╪º╪¿',
      channels_title: '╪▒╪¿╪╖ ┘ê╪¬┘ü╪╣┘è┘ä ┘é┘å┘ê╪º╪¬ ╪º┘ä╪¿┘ê╪¬',
      chan_desc_wa: '╪▒╪¿╪╖ ┘ê╪º╪¼┘ç╪⌐ Cloud API ╪º┘ä╪▒╪│┘à┘è╪⌐ ┘ä┘ê╪º╪¬╪│╪º╪¿.',
      chan_desc_fb: '╪ú╪¬┘à╪¬╪⌐ ╪º┘ä╪▒╪»┘ê╪» ╪╣┘ä┘ë ╪╡┘ü╪¡╪º╪¬ ┘ü┘è╪│╪¿┘ê┘â ┘à╪│┘å╪¼╪▒.',
      chan_desc_ig: '╪º┘ä╪▒╪» ╪º┘ä╪¬┘ä┘é╪º╪ª┘è ╪╣┘ä┘ë ╪▒╪│╪º╪ª┘ä ┘ê╪¬╪╣┘ä┘è┘é╪º╪¬ ╪Ñ┘å╪│╪¬╪¼╪▒╪º┘à.',
      chan_desc_tg: '╪▒╪¿╪╖ ┘ê╪¬┘ü╪╣┘è┘ä ╪¿┘ê╪¬ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à ┘à╪«╪╡╪╡.',
      btn_configure: '╪Ñ╪╣╪»╪º╪» ┘ê╪¬┘ü╪╣┘è┘ä',
      website_widget_title: '╪»╪▒╪»╪┤╪⌐ ╪º┘ä┘à┘ê┘é╪╣ ╪º┘ä╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è',
      website_widget_desc: '╪º┘å╪│╪« ┘â┘ê╪» ╪º┘ä╪¿╪▒┘à╪¼╪⌐ ╪º┘ä╪¬╪º┘ä┘è ┘ê╪╢╪╣┘ç ┘é╪¿┘ä ┘ê╪│┘à ╪º┘ä╪Ñ╪║┘ä╪º┘é body ┘ü┘è ┘à┘ê┘é╪╣┘â ┘ä╪╣╪▒╪╢ ╪»╪▒╪»╪┤╪⌐ ╪▓┘è┘å ╪¿┘ê╪¬.',
      ecommerce_sync_title: '╪▒╪¿╪╖ ┘ê┘à╪▓╪º┘à┘å╪⌐ ┘à╪¬╪¼╪▒┘â ╪º┘ä╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è',
      label_store_provider: '┘à┘å╪╡╪⌐ ╪º┘ä┘à╪¬╪¼╪▒',
      store_none: '╪║┘è╪▒ ┘à╪¬╪╡┘ä',
      label_store_url: '╪▒╪º╪¿╪╖ ╪º┘ä┘à╪¬╪¼╪▒',
      btn_sync_catalog: '╪¡┘ü╪╕ ┘ê┘à╪▓╪º┘à┘å╪⌐ ╪º┘ä┘â╪¬╪º┘ä┘ê╪¼',
      orders_bookings_title: '┘ä┘ê╪¡╪⌐ ╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ê╪º┘ä┘à┘ê╪º╪╣┘è╪»',
      chat_orders_list_title: '╪º┘ä╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à╪│╪¬╪«┘ä╪╡╪⌐ ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ╪╣╪¿╪▒ ╪º┘ä╪¿┘ê╪¬',
      th_order_id: '┘à╪╣╪▒┘ü ╪º┘ä╪╖┘ä╪¿',
      th_customer: '╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä',
      th_phone: '╪º┘ä┘ç╪º╪¬┘ü',
      th_items: '╪º┘ä┘à┘å╪¬╪¼╪º╪¬',
      th_total: '╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è',
      th_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      appointments_list_title: '┘à┘ê╪º╪╣┘è╪» ╪º┘ä╪╣┘à┘ä╪º╪í ╪º┘ä┘à╪ñ┘â╪»╪⌐ ╪╣╪¿╪▒ ╪º┘ä╪¿┘ê╪¬',
      th_booking_customer: '╪º┘ä╪╣┘à┘è┘ä',
      th_booking_phone: '╪º┘ä┘ç╪º╪¬┘ü',
      th_booking_time: '╪º┘ä╪¬╪º╪▒┘è╪« ┘ê╪º┘ä┘ê┘é╪¬',
      th_booking_notes: '┘à┘ä╪«╪╡ ╪º┘ä╪¡╪¼╪▓ / ┘à┘ä╪º╪¡╪╕╪º╪¬ ╪º┘ä╪¿┘ê╪¬',
      settings_billing_title: '╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä╪╣╪º┘à╪⌐ ┘ê╪º┘ä╪▒╪¿╪╖ ╪º┘ä╪¿╪▒┘à╪¼┘è ┘ä┘ä┘à╪╖┘ê╪▒┘è┘å',
      dev_api_keys_title: '┘à┘ü╪º╪¬┘è╪¡ ╪º┘ä┘ê╪╡┘ê┘ä ╪º┘ä╪«╪º╪╡╪⌐ ╪¿╪º┘ä┘à╪╖┘ê╪▒┘è┘å',
      btn_gen_key: '╪Ñ┘å╪┤╪º╪í ┘à┘ü╪¬╪º╪¡ ╪¼╪»┘è╪»',
      dev_webhooks_title: '╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä┘ê┘è╪¿ ┘ç┘ê┘â ╪º┘ä╪╡╪º╪»╪▒',
      label_webhook_url: '╪▒╪º╪¿╪╖ ╪º╪│╪¬┘é╪¿╪º┘ä ╪º┘ä┘ê┘è╪¿ ┘ç┘ê┘â ╪º┘ä╪«╪º╪╡ ╪¿┘â',
      label_webhook_secret: '┘à┘ü╪¬╪º╪¡ ╪¬┘ê┘é┘è╪╣ HMAC ╪º┘ä╪│╪▒┘è',
      label_webhook_events: '╪º┘ä╪ú╪¡╪»╪º╪½ ╪º┘ä┘à╪┤╪¬╪▒┘â ╪¿┘ç╪º',
      btn_save_webhook: '╪¡┘ü╪╕ ╪º┘ä┘ê┘è╪¿ ┘ç┘ê┘â',
      webhook_logs_title: '╪│╪¼┘ä ╪¬╪│┘ä┘è┘à ╪º┘ä┘ê┘è╪¿ ┘ç┘ê┘â ╪º┘ä╪╡╪º╪»╪▒',
      th_wh_time: '╪º┘ä┘ê┘é╪¬ ┘ê╪º┘ä╪¬╪º╪▒┘è╪«',
      th_wh_event: '╪º┘ä╪¡╪»╪½',
      th_wh_url: '╪º┘ä╪▒╪º╪¿╪╖',
      th_wh_status: '╪▒┘à╪▓ ╪º╪│╪¬╪¼╪º╪¿╪⌐ HTTP',
      th_wh_actions: '╪º┘ä╪╣┘à┘ä┘è╪º╪¬',
      backup_keys_heading: '╪º┘ä┘à┘ü╪¬╪º╪¡ ╪º┘ä╪º╪¡╪¬┘è╪º╪╖┘è ┘ä┘ä╪╖┘ê╪º╪▒╪ª (┘ä╪¿╪º┘é╪⌐ Growth)',
      backup_keys_desc: '╪Ñ╪»╪«╪º┘ä ┘à┘ü╪¬╪º╪¡ API ╪º┘ä╪«╪º╪╡ ╪¿┘â. ╪╣┘å╪» ┘å┘ü╪º╪░ ╪▒╪╡┘è╪» ╪¿╪º┘é╪¬┘â ╪º┘ä╪┤┘ç╪▒┘è╪î ╪│┘è┘é┘ê┘à ╪º┘ä┘å╪╕╪º┘à ╪¿╪º┘ä╪¬╪¡┘ê┘ä ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ┘ä╪º╪│╪¬┘ç┘ä╪º┘â ┘à┘ü╪¬╪º╪¡┘â ┘ä┘à┘å╪╣ ╪¬┘ê┘é┘ü ╪º┘ä╪¿┘ê╪¬.',
      label_backup_provider: '┘à╪▓┘ê╪» ╪º┘ä╪«╪»┘à╪⌐',
      label_backup_key: '┘à┘ü╪¬╪º╪¡ ╪º┘ä┘Ç API',
      label_backup_model: '╪º┘ä┘å┘à┘ê╪░╪¼ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è',
      label_backup_url: '╪▒╪º╪¿╪╖ Endpoint ┘à╪«╪╡╪╡',
      btn_save_backup_settings: '╪¡┘ü╪╕ ┘à┘ü╪¬╪º╪¡ ╪º┘ä╪╖┘ê╪º╪▒╪ª',
      btn_cancel: '╪Ñ┘ä╪║╪º╪í',
      btn_save: '╪¡┘ü╪╕ ╪º┘ä┘é╪º╪╣╪»╪⌐',
      label_faq_question: '╪º┘ä╪│╪ñ╪º┘ä / ╪º┘ä┘â┘ä┘à╪º╪¬ ╪º┘ä┘à┘ü╪¬╪º╪¡┘è╪⌐',
      label_faq_answer: '╪º┘ä╪Ñ╪¼╪º╪¿╪⌐ ╪º┘ä┘à╪¬┘ê┘é╪╣╪⌐',
      faq_question_placeholder: '┘à╪½╪º┘ä: ┘à┘ê╪º╪╣┘è╪» ╪º┘ä╪¬┘ê╪╡┘è┘ä',
      faq_answer_placeholder: '┘à╪½╪º┘ä: ┘å┘ê╪╡┘ä ╪«┘ä╪º┘ä ╪½┘ä╪º╪½╪⌐ ╪ú┘è╪º┘à ╪╣┘à┘ä ╪»╪º╪«┘ä ╪º┘ä┘é╪º┘ç╪▒╪⌐.',
      orders_empty: '┘ä╪º ╪¬┘ê╪¼╪» ╪╖┘ä╪¿╪º╪¬ ╪ú┘å╪┤╪ú┘ç╪º ╪º┘ä╪¿┘ê╪¬ ╪¿╪╣╪».',
      bookings_empty: '┘ä╪º ╪¬┘ê╪¼╪» ┘à┘ê╪º╪╣┘è╪» ┘à╪¡╪¼┘ê╪▓╪⌐ ╪¿╪╣╪».',
      api_keys_empty: '┘ä╪º ╪¬┘ê╪¼╪» ┘à┘ü╪º╪¬┘è╪¡ ┘ê╪╡┘ê┘ä ┘à┘å╪┤╪ú╪⌐ ╪¿╪╣╪».',
      webhook_history_empty: '┘ä╪º ┘è┘ê╪¼╪» ╪│╪¼┘ä ┘ä╪¬╪│┘ä┘è┘à╪º╪¬ ╪º┘ä╪▒╪¿╪╖ ╪º┘ä╪¿╪▒┘à╪¼┘è ╪¿╪╣╪».',
      admin_title: '┘ä┘ê╪¡╪⌐ ╪¬╪¡┘â┘à ┘à╪»┘è╪▒ ╪º┘ä┘å╪╕╪º┘à ╪º┘ä╪┤╪º┘à┘ä╪⌐',
      admin_desc: '╪º┘ä╪¬╪¡┘â┘à ╪º┘ä┘â╪º┘à┘ä ┘ü┘è ╪º┘ä┘à╪│╪¬╪«╪»┘à┘è┘å╪î ╪º┘ä╪¬╪¼╪º╪▒╪î ╪º┘ä╪╡┘ä╪º╪¡┘è╪º╪¬╪î ╪º┘ä╪º┘å╪¬╪¡╪º┘ä ╪º┘ä┘à╪¿╪º╪┤╪▒ (Impersonation)╪î ┘ê╪Ñ╪»╪º╪▒╪⌐ ┘à┘ü╪º╪¬┘è╪¡ ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è ╪º┘ä┘Ç Failover.',
      admin_subtab_users: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä┘à╪│╪¬╪«╪»┘à┘è┘å ┘ê╪º┘ä╪¬╪¼╪º╪▒',
      admin_subtab_keys: '╪│┘è╪▒┘ü╪▒╪º╪¬ AI & Failover',
      admin_users_title: '┘é╪º╪ª┘à╪⌐ ╪º┘ä┘à╪│╪¬╪«╪»┘à┘è┘å ┘ê╪º┘ä╪¬╪¼╪º╪▒ ╪º┘ä┘à╪│╪¼┘ä┘è┘å',
      admin_users_desc: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪ú╪»┘ê╪º╪▒╪î ╪º┘ä╪º╪┤╪¬╪▒╪º┘â╪º╪¬╪î ╪¬╪╣┘ä┘è┘é ╪º┘ä╪¡╪│╪º╪¿╪º╪¬╪î ┘ê╪º┘ä╪»╪«┘ê┘ä ╪º┘ä┘à╪¿╪º╪┤╪▒ ┘â┘Ç ┘à╪│╪¬╪«╪»┘à.',
      admin_btn_add_user: '╪Ñ╪╢╪º┘ü╪⌐ ┘à╪│╪¬╪«╪»┘à / ╪¬╪º╪¼╪▒ ╪¼╪»┘è╪»',
      th_user_username: '╪º╪│┘à ╪º┘ä┘à╪│╪¬╪«╪»┘à',
      th_user_email: '╪º┘ä╪¿╪▒┘è╪» ╪º┘ä╪Ñ┘ä┘â╪¬╪▒┘ê┘å┘è',
      th_user_role: '╪º┘ä╪»┘ê╪▒ (Role)',
      th_user_tier: '╪¿╪º┘é╪⌐ ╪º┘ä╪º╪┤╪¬╪▒╪º┘â',
      th_user_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      th_user_bots: '╪º┘ä╪¿┘ê╪¬╪º╪¬',
      th_user_actions: '╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬ ╪º┘ä╪│╪▒┘è╪╣╪⌐',
      admin_loading_users: '╪¼╪º╪▒┘è ╪¬╪¡┘à┘è┘ä ┘é╪º╪ª┘à╪⌐ ╪º┘ä┘à╪│╪¬╪«╪»┘à┘è┘å...',
      admin_active_keys: '┘à┘ü╪º╪¬┘è╪¡ ╪º┘ä┘ê╪╡┘ê┘ä ╪º┘ä╪╣╪º┘à╪⌐ ╪º┘ä┘å╪┤╪╖╪⌐ ┘ê╪¬╪▒╪¬┘è╪¿ ╪º┘ä╪ú┘ê┘ä┘ê┘è╪⌐',
      admin_btn_reset: '╪Ñ╪╣╪º╪»╪⌐ ╪¬┘ç┘è╪ª╪⌐ ╪º┘ä┘à┘ü╪º╪¬┘è╪¡ ╪º┘ä┘à╪╣╪╖┘ä╪⌐',
      admin_register_key: '╪¬╪│╪¼┘è┘ä ┘à┘ü╪¬╪º╪¡ ┘å╪╕╪º┘à ╪╣╪º┘à ╪¼╪»┘è╪»',
      admin_label_name: '╪º╪│┘à ╪º┘ä┘à┘ü╪¬╪º╪¡ / ╪º┘ä┘ê╪╡┘ü',
      admin_label_provider: '┘à╪▓┘ê╪» ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      admin_label_key: '┘à┘ü╪¬╪º╪¡ ╪º┘ä┘Ç API',
      admin_label_model: '╪º┘ä┘å┘à┘ê╪░╪¼ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è',
      admin_label_priority: '┘à╪│╪¬┘ê┘ë ╪º┘ä╪ú┘ê┘ä┘ê┘è╪⌐ (1 = ╪º┘ä╪ú╪╣┘ä┘ë)',
      admin_label_base_url: '╪▒╪º╪¿╪╖ Endpoint ┘à╪«╪╡╪╡ (╪º╪«╪¬┘è╪º╪▒┘è)',
      admin_btn_register: '╪¬╪│╪¼┘è┘ä ┘à┘ü╪¬╪º╪¡ ╪º┘ä┘å╪╕╪º┘à',
      admin_no_keys: '┘ä╪º ╪¬┘ê╪¼╪» ┘à┘ü╪º╪¬┘è╪¡ ┘å╪╕╪º┘à ╪╣╪º┘à╪⌐ ┘à╪│╪¼┘ä╪⌐ ╪¡╪º┘ä┘è╪º┘ï. ┘é┘à ╪¿╪Ñ╪╢╪º┘ü╪⌐ ┘à┘ü╪¬╪º╪¡ ┘à┘å ╪º┘ä┘å┘à┘ê╪░╪¼ ╪º┘ä╪¼╪º┘å╪¿┘è.',
      admin_status_working: '┘è╪╣┘à┘ä',
      admin_status_failed: '┘à╪╣╪╖┘ä',
      admin_lbl_provider: '╪º┘ä┘à╪▓┘ê╪»',
      admin_lbl_model: '╪º┘ä┘å┘à┘ê╪░╪¼',
      admin_lbl_priority: '╪º┘ä╪ú┘ê┘ä┘ê┘è╪⌐',
      admin_subtab_overview: '┘å╪╕╪▒╪⌐ ╪╣╪º┘à╪⌐ ╪╣┘ä┘ë ╪º┘ä┘å╪╕╪º┘à',
      admin_subtab_audit: '╪│╪¼┘ä ╪º┘ä╪¬╪»┘é┘è┘é ┘ê╪º┘ä╪¼┘ä╪│╪º╪¬',
      admin_subtab_notify: '╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬',
      training_general_title: '╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä╪╣╪º┘à╪⌐ ┘ä┘ä┘ê┘â┘è┘ä',
      training_general_desc: '╪¬┘ê╪¼┘è┘ç╪º╪¬ ╪½╪º╪¿╪¬╪⌐ ╪¬╪¡╪»╪» ┘ç┘ê┘è╪⌐ ┘ê╪│┘ä┘ê┘â ╪º┘ä┘ê┘â┘è┘ä. ┘à┘å┘é┘ê┘ä╪⌐ ┘à┘å ╪º┘ä┘à┘å╪╡╪⌐ ╪º┘ä╪│╪º╪¿┘é╪⌐ ┘ê╪¬┘Å╪¡┘é┘å ┘ü┘è ┘â┘ä ╪▒╪».',
      btn_add_instruction: '╪Ñ╪╢╪º┘ü╪⌐ ╪¬╪╣┘ä┘è┘à╪º╪¬',
      label_instruction_content: '╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬',
      instruction_content_placeholder: '┘à╪½╪º┘ä: ╪▒╪¡╪¿ ╪¿╪º┘ä╪╣┘à┘è┘ä ╪»╪º╪ª┘à╪º┘ï ╪¿╪º┘ä╪╣╪º┘à┘è╪⌐ ╪º┘ä┘à╪╡╪▒┘è╪⌐ ┘ê┘ä╪º ╪¬╪░┘â╪▒ ╪ú╪│╪╣╪º╪▒╪º┘ï ╪«╪º╪▒╪¼ ╪º┘ä┘â╪¬╪º┘ä┘ê╪¼.',
      training_empty_general: '┘ä╪º ╪¬┘ê╪¼╪» ╪¬╪╣┘ä┘è┘à╪º╪¬ ╪╣╪º┘à╪⌐ ╪¿╪╣╪». ╪ú╪╢┘ü ╪º┘ä╪¬┘ê╪¼┘è┘ç╪º╪¬ ╪º┘ä╪¬┘è ╪¬╪¡╪»╪» ┘ç┘ê┘è╪⌐ ╪º┘ä┘ê┘â┘è┘ä.',
      ov_users_total: '╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä┘à╪│╪¬╪«╪»┘à┘è┘å',
      ov_users_active: '┘à╪│╪¬╪«╪»┘à┘ê┘å ┘å╪┤╪╖┘ê┘å',
      ov_bots_total: '╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä┘ê┘â┘ä╪º╪í',
      ov_bots_active: '┘ê┘â┘ä╪º╪í ┘å╪┤╪╖┘ê┘å',
      ov_conversations: '╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬',
      ov_messages: '╪º┘ä╪▒╪│╪º╪ª┘ä',
      ov_chat_orders: '╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬',
      ov_active_sessions: '╪º┘å╪¬╪¡╪º┘ä╪º╪¬ ┘å╪┤╪╖╪⌐',
      ov_audit_events: '╪ú╪¡╪»╪º╪½ ╪º┘ä╪¬╪»┘é┘è┘é',
      audit_sessions_title: '╪¼┘ä╪│╪º╪¬ ╪º┘ä╪º┘å╪¬╪¡╪º┘ä',
      audit_sessions_desc: '┘â┘ä ╪¼┘ä╪│╪⌐ ╪º┘å╪¬╪¡╪º┘ä ┘è┘é┘ê┘à ╪¿┘ç╪º ╪º┘ä╪ú╪»┘à┘å ┘à╪╣ ╪│╪¿╪¿┘ç╪º ┘ê╪¡╪º┘ä╪¬┘ç╪º ┘ê┘à╪»╪¬┘ç╪º.',
      th_session_actor: '╪º┘ä╪ú╪»┘à┘å',
      th_session_subject: '╪º┘ä┘à╪│╪¬╪«╪»┘à ╪º┘ä┘à╪│╪¬┘ç╪»┘ü',
      th_session_reason: '╪º┘ä╪│╪¿╪¿',
      th_session_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      th_session_started: '╪¿╪»╪ú╪¬',
      th_session_expires: '╪¬┘å╪¬┘ç┘è',
      admin_loading_sessions: '╪¼╪º╪▒┘è ╪¬╪¡┘à┘è┘ä ╪º┘ä╪¼┘ä╪│╪º╪¬...',
      audit_events_title: '╪│╪¼┘ä ╪º┘ä╪¬╪»┘é┘è┘é',
      audit_events_desc: '╪│╪¼┘ä ┘à┘Å╪«┘ü┘ë ╪º┘ä╪¿┘è╪º┘å╪º╪¬ ╪º┘ä╪¡╪│╪º╪│╪⌐ ┘ä┘â┘ä ╪¬╪╣╪»┘è┘ä ┘é╪º┘à ╪¿┘ç ╪ú╪»┘à┘å ╪ú┘ê ╪ú╪½┘å╪º╪í ╪º┘å╪¬╪¡╪º┘ä ╪º┘ä┘ç┘ê┘è╪⌐.',
      audit_filter_type: '╪¬╪╡┘ü┘è╪⌐ ╪¡╪│╪¿ ┘å┘ê╪╣ ╪º┘ä╪¡╪»╪½',
      audit_filter_all: '┘â┘ä ╪º┘ä╪ú╪¡╪»╪º╪½',
      audit_type_started: '╪¿╪»╪í ╪º┘å╪¬╪¡╪º┘ä ┘ç┘ê┘è╪⌐',
      audit_type_ended: '╪Ñ┘å┘ç╪º╪í ╪º┘å╪¬╪¡╪º┘ä ┘ç┘ê┘è╪⌐',
      audit_type_imp_write: '╪¬╪╣╪»┘è┘ä ╪ú╪½┘å╪º╪í ╪º┘å╪¬╪¡╪º┘ä',
      audit_type_admin_write: '╪¬╪╣╪»┘è┘ä ╪Ñ╪»╪º╪▒┘è ┘à╪¿╪º╪┤╪▒',
      th_event_when: '╪º┘ä┘ê┘é╪¬',
      th_event_type: '╪º┘ä╪¡╪»╪½',
      th_event_actor: '╪º┘ä┘à┘å┘ü╪░ ΓåÉ ╪º┘ä┘ç╪»┘ü',
      th_event_action: '╪º┘ä╪Ñ╪¼╪▒╪º╪í',
      th_event_outcome: '╪º┘ä┘å╪¬┘è╪¼╪⌐',
      admin_loading_events: '╪¼╪º╪▒┘è ╪¬╪¡┘à┘è┘ä ╪│╪¼┘ä ╪º┘ä╪¬╪»┘é┘è┘é...',
      admin_empty_sessions: '┘ä╪º ╪¬┘ê╪¼╪» ╪¼┘ä╪│╪º╪¬ ╪º┘å╪¬╪¡╪º┘ä ┘à╪│╪¼┘ä╪⌐ ╪¿╪╣╪».',
      admin_empty_events: '┘ä╪º ╪¬┘ê╪¼╪» ╪ú╪¡╪»╪º╪½ ╪¬╪»┘é┘è┘é ┘à╪╖╪º╪¿┘é╪⌐ ┘ä┘ç╪░╪º ╪º┘ä┘ü┘ä╪¬╪▒ ╪¿╪╣╪».',
      notify_title: '╪Ñ╪▒╪│╪º┘ä ╪Ñ╪┤╪╣╪º╪▒ ┘ä┘ä┘à┘å╪╡╪⌐',
      notify_desc: '╪ú╪▒╪│┘ä ╪Ñ╪┤╪╣╪º╪▒╪º┘ï ╪»╪º╪«┘ä ╪º┘ä┘à┘å╪╡╪⌐ ┘ä┘â┘ä ╪º┘ä╪¡╪│╪º╪¿╪º╪¬ ╪ú┘ê ┘ä┘à╪│╪¬╪«╪»┘à ┘à╪¡╪»╪».',
      notify_target: '╪º┘ä┘ê╪¼┘ç╪⌐',
      notify_target_all: '┘â┘ä ╪º┘ä┘à╪│╪¬╪«╪»┘à┘è┘å',
      notify_target_single: '┘à╪│╪¬╪«╪»┘à ┘à╪¡╪»╪» (╪¿╪º╪│┘à ╪º┘ä┘à╪│╪¬╪«╪»┘à)',
      notify_username_label: '╪º╪│┘à ╪º┘ä┘à╪│╪¬╪«╪»┘à',
      notify_title_label: '╪º┘ä╪╣┘å┘ê╪º┘å',
      notify_body_label: '┘å╪╡ ╪º┘ä╪▒╪│╪º┘ä╪⌐',
      notify_send_btn: '╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪Ñ╪┤╪╣╪º╪▒',
      notify_sent_ok: '╪¬┘à ╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪Ñ╪┤╪╣╪º╪▒ ╪¿┘å╪¼╪º╪¡!',
      notify_failed: '╪¬╪╣╪░╪▒ ╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪Ñ╪┤╪╣╪º╪▒.',
      admin_subtab_landing_demo: '╪¿┘ê╪¬ ╪¬╪¼╪▒╪¿╪⌐ ╪º┘ä╪╡┘ü╪¡╪⌐ ╪º┘ä╪▒╪ª┘è╪│┘è╪⌐',
      landing_demo_title: '┘ê┘â┘è┘ä ╪¬╪¼╪▒╪¿╪⌐ ╪º┘ä╪╡┘ü╪¡╪⌐ ╪º┘ä╪▒╪ª┘è╪│┘è╪⌐',
      landing_demo_desc: '┘è╪¬╪¡┘â┘à ┘ü┘è ┘ê┘â┘è┘ä ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è ╪º┘ä╪¡┘é┘è┘é┘è ╪º┘ä╪░┘è ┘è╪¼┘è╪¿ ╪╣┘ä┘ë ╪ú╪│╪ª┘ä╪⌐ ╪º┘ä╪▓┘ê╪º╪▒ ╪»╪º╪«┘ä ┘à╪¡╪º╪»╪½╪⌐ "╪¼╪▒┘æ╪¿┘ç╪º ┘à╪¿╪º╪┤╪▒╪⌐" ┘ü┘è ╪º┘ä╪╡┘ü╪¡╪⌐ ╪º┘ä╪▒╪ª┘è╪│┘è╪⌐.',
      landing_demo_enable_label: '╪¬┘ü╪╣┘è┘ä ╪º┘ä╪¬╪¼╪▒╪¿╪⌐ ╪º┘ä╪¡┘è╪⌐ ╪¿╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      landing_demo_instructions_label: '╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä┘ê┘â┘è┘ä',
      landing_demo_instructions_placeholder: '┘å╪¿╪▒╪⌐ ╪Ñ╪╢╪º┘ü┘è╪⌐╪î ╪¡╪»┘ê╪»╪î ╪╣╪▒┘ê╪╢╪î ╪ú┘ê ┘à╪╣┘ä┘ê┘à╪º╪¬ ┘è╪¼╪¿ ╪╣┘ä┘ë ╪º┘ä┘ê┘â┘è┘ä ╪º┘ä╪º┘ä╪¬╪▓╪º┘à ╪¿┘ç╪º ╪ú╪½┘å╪º╪í ╪º┘ä╪¬╪¼╪▒╪¿╪⌐.',
      landing_demo_instructions_hint: '╪¬┘Å╪╢╪º┘ü ┘ç╪░┘ç ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ┘ü┘ê┘é ┘é╪º╪╣╪»╪⌐ ╪º┘ä┘à╪╣╪▒┘ü╪⌐ ╪º┘ä┘à╪»┘à╪¼╪⌐ ╪º┘ä╪«╪º╪╡╪⌐ ╪¿╪º┘ä┘à┘å╪╡╪⌐.',
      landing_demo_save_btn: '╪¡┘ü╪╕ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬',
      landing_demo_saved_ok: '╪¬┘à ╪º┘ä╪¡┘ü╪╕ ╪¿┘å╪¼╪º╪¡!',
      landing_demo_save_failed: '╪¬╪╣╪░╪▒ ╪¡┘ü╪╕ ╪º┘ä╪Ñ╪╣╪»╪º╪»╪º╪¬.',
      landing_demo_updated_at: '╪ó╪«╪▒ ╪¬╪¡╪»┘è╪½',
      model_select_heading: '┘à┘ê╪»┘è┘ä ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      model_select_desc: '╪º╪«╪¬╪▒ "╪¬┘ä┘é╪º╪ª┘è" ┘ä┘è╪«╪¬╪º╪▒ ╪º┘ä┘å╪╕╪º┘à ╪ú┘ü╪╢┘ä ┘à┘ê╪»┘è┘ä ┘à╪¬╪º╪¡ ┘ä╪¿╪º┘é╪¬┘â╪î ╪ú┘ê ╪¡╪»╪» ┘à┘ê╪»┘è┘ä╪º┘ï ┘à╪╣┘è┘å╪º┘ï ┘à┘å ╪º┘ä┘é╪º╪ª┘à╪⌐ ╪º┘ä┘à┘ü╪╣┘æ┘ä╪⌐ ┘ä╪¡╪│╪º╪¿┘â.',
      model_select_label: '╪º┘ä┘à┘ê╪»┘è┘ä',
      model_select_auto: '╪¬┘ä┘é╪º╪ª┘è (┘à╪│╪¬╪¡╪│┘å)',
      model_select_save: '╪¡┘ü╪╕ ╪º┘ä┘à┘ê╪»┘è┘ä',
      model_saved_ok: '╪¬┘à ╪¡┘ü╪╕ ╪º╪«╪¬┘è╪º╪▒ ╪º┘ä┘à┘ê╪»┘è┘ä ╪¿┘å╪¼╪º╪¡!',
      model_save_failed: '┘ç╪░╪º ╪º┘ä┘à┘ê╪»┘è┘ä ╪║┘è╪▒ ┘à╪¬╪º╪¡ ┘ü┘è ╪¿╪º┘é╪¬┘â ╪º┘ä╪¡╪º┘ä┘è╪⌐.',
      model_loading_list: '╪¼╪º╪▒┘è ╪¬╪¡┘à┘è┘ä ╪º┘ä┘à┘ê╪»┘è┘ä╪º╪¬ ╪º┘ä┘à╪¬╪º╪¡╪⌐...',
      orders_bookings_title: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ê╪º┘ä┘à┘ê╪º╪╣┘è╪»',
      orders_bookings_subtitle: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘à┘å╪┤╪ú╪⌐ ┘à┘å ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ┘ê╪¬┘å╪│┘è┘é ┘ê╪¼╪»┘ê┘ä╪⌐ ┘ê╪¬╪¬╪¿╪╣ ┘à┘ê╪º╪╣┘è╪» ╪º┘ä╪╣┘à┘ä╪º╪í ╪¿╪┤┘â┘ä ┘ü┘ê╪▒┘è.',
      btn_new_booking: '┘à┘ê╪╣╪» ╪¼╪»┘è╪»',
      btn_new_order: '╪╖┘ä╪¿ ╪¼╪»┘è╪»',
      btn_refresh: '╪¬╪¡╪»┘è╪½',
      stat_orders_total: '╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä╪╖┘ä╪¿╪º╪¬',
      stat_orders_pending: '╪╖┘ä╪¿╪º╪¬ ┘à╪╣┘ä┘é╪⌐',
      stat_bookings_total: '╪Ñ╪¼┘à╪º┘ä┘è ╪º┘ä┘à┘ê╪º╪╣┘è╪»',
      stat_bookings_confirmed: '┘à┘ê╪º╪╣┘è╪» ┘à╪ñ┘â╪»╪⌐',
      orders_search_placeholder: '╪º╪¿╪¡╪½ ╪¿╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä ╪ú┘ê ╪º┘ä┘ç╪º╪¬┘ü ╪ú┘ê ┘å┘ê╪╣ ╪º┘ä╪«╪»┘à╪⌐...',
      orders_status_filter: '╪¬╪╡┘ü┘è╪⌐ ╪¡╪│╪¿ ╪º┘ä╪¡╪º┘ä╪⌐',
      orders_type_filter: '╪¬╪╡┘ü┘è╪⌐ ┘å┘ê╪╣ ╪º┘ä╪│╪¼┘ä',
      filter_all_statuses: '┘â┘ä ╪º┘ä╪¡╪º┘ä╪º╪¬',
      status_pending: '┘é┘è╪» ╪º┘ä╪º┘å╪¬╪╕╪º╪▒',
      status_processing: '┘é┘è╪» ╪º┘ä╪¬╪¼┘ç┘è╪▓',
      status_confirmed: '┘à╪ñ┘â╪»',
      status_completed: '┘à┘â╪¬┘à┘ä',
      status_rescheduled: '┘à┘Å╪╣╪º╪» ╪¼╪»┘ê┘ä╪¬┘ç',
      status_shipped: '╪¬┘à ╪º┘ä╪┤╪¡┘å',
      status_delivered: '╪¬┘à ╪º┘ä╪¬╪│┘ä┘è┘à',
      status_cancelled: '┘à┘ä╪║┘è',
      filter_view_all: '┘â┘ä ╪º┘ä╪│╪¼┘ä╪º╪¬',
      filter_view_orders: '╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ü┘é╪╖',
      filter_view_bookings: '╪º┘ä┘à┘ê╪º╪╣┘è╪» ┘ü┘é╪╖',
      appointments_list_title: '╪¬┘é┘ê┘è┘à ╪º┘ä┘à┘ê╪º╪╣┘è╪» ┘ê╪º┘ä╪¡╪¼┘ê╪▓╪º╪¬ ╪º┘ä╪░┘â┘è╪⌐',
      th_booking_id: '╪▒┘é┘à ╪º┘ä╪¡╪¼╪▓',
      th_booking_customer: '╪º┘ä╪╣┘à┘è┘ä',
      th_booking_phone: '╪º┘ä┘ç╪º╪¬┘ü',
      th_booking_service: '╪º┘ä╪«╪»┘à╪⌐ / ╪º┘ä╪║╪▒╪╢',
      th_booking_time: '╪º┘ä╪¬╪º╪▒┘è╪« ┘ê╪º┘ä┘ê┘é╪¬',
      th_booking_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      th_booking_actions: '╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬',
      chat_orders_list_title: '╪╖┘ä╪¿╪º╪¬ ╪¬┘à ╪Ñ┘å╪┤╪º╪ñ┘ç╪º ╪¬┘ä┘é╪º╪ª┘è╪º┘ï ╪¿╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è',
      th_order_id: '╪▒┘é┘à ╪º┘ä╪╖┘ä╪¿',
      th_customer: '╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä',
      th_phone: '╪º┘ä┘ç╪º╪¬┘ü',
      th_items: '╪º┘ä┘à┘å╪¬╪¼╪º╪¬',
      th_total: '╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è',
      th_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      th_order_actions: '╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬',
      notification_recipients_title: '┘é┘å┘ê╪º╪¬ ┘ê┘à╪│╪¬┘ä┘à┘è ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ╪º┘ä┘ü┘ê╪▒┘è╪⌐',
      notification_recipients_desc: '╪▒╪¿╪╖ ╪ú╪▒┘é╪º┘à ┘ê╪º╪¬╪│╪º╪¿ ┘ê╪¡╪│╪º╪¿╪º╪¬ ╪ú┘ê ┘é┘å┘ê╪º╪¬ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à ┘à╪¬╪╣╪»╪»╪⌐ ┘ä╪¬┘ä┘é┘è ╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ┘ü┘ê╪▒┘è╪⌐ ╪╣┘å╪» ╪Ñ┘å╪┤╪º╪í ╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ê╪º┘ä┘à┘ê╪º╪╣┘è╪».',
      btn_add_recipient: '╪Ñ╪╢╪º┘ü╪⌐ ┘é┘å╪º╪⌐ ╪Ñ╪┤╪╣╪º╪▒╪º╪¬',
      recipient_tier_free_hint: '╪º┘ä╪¿╪º┘é╪⌐ ╪º┘ä┘à╪¼╪º┘å┘è╪⌐ ╪¬╪¬┘è╪¡ ┘é┘å╪º╪⌐ ┘ê╪º╪¡╪»╪⌐ ┘ü┘é╪╖ ┘ä╪¬┘ä┘é┘è ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬. ┘é┘à ╪¿╪º┘ä╪¬╪▒┘é┘è╪⌐ ┘ä╪¿╪º┘é╪⌐ Growth ┘ä┘é┘å┘ê╪º╪¬ ╪║┘è╪▒ ┘à╪¡╪»┘ê╪»╪⌐.',
      upgrade_plan_link: '╪¬╪▒┘é┘è╪⌐ ╪º┘ä╪¿╪º┘é╪⌐',
      th_rec_channel: '╪º┘ä┘é┘å╪º╪⌐',
      th_rec_target: '╪º┘ä╪▒┘é┘à / ╪º┘ä┘à╪╣╪▒┘ü ╪º┘ä┘à╪│╪¬┘ç╪»┘ü',
      th_rec_label: '╪º┘ä┘ê╪╡┘ü / ╪º┘ä┘ü╪▒┘è┘é',
      th_rec_events: '╪ú╪¡╪»╪º╪½ ╪º┘ä╪Ñ╪┤╪╣╪º╪▒',
      th_rec_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      th_rec_actions: '╪º┘ä╪Ñ╪¼╪▒╪º╪í╪º╪¬',
      agent_tools_section_title: '╪ú╪»┘ê╪º╪¬ ╪º┘ä┘ê┘â┘è┘ä',
      agent_tool_booking_title: '╪ú╪»╪º╪⌐ ╪¡╪¼╪▓ ┘ê╪¼╪»┘ê┘ä╪⌐ ╪º┘ä┘à┘ê╪º╪╣┘è╪»',
      agent_booking_hours_label: '╪│╪º╪╣╪º╪¬ ╪º┘ä╪╣┘à┘ä',
      agent_booking_service_label: '╪º┘ä╪«╪»┘à╪⌐ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è╪⌐ / ╪º┘ä╪║╪▒╪╢',
      agent_tool_orders_title: '╪ú╪»╪º╪⌐ ╪¬╪¬╪¿╪╣ ┘ê╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪╖┘ä╪¿╪º╪¬',
      agent_tool_wa_title: '╪ú╪»╪º╪⌐ ╪Ñ╪▒╪│╪º┘ä ╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ┘ê╪º╪¬╪│╪º╪¿ ╪º┘ä┘ü┘ê╪▒┘è╪⌐',
      agent_tool_tg_title: '╪ú╪»╪º╪⌐ ╪Ñ╪▒╪│╪º┘ä ╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à ╪º┘ä┘ü┘ê╪▒┘è╪⌐',
      agent_skills_section_title: '┘à┘ç╪º╪▒╪º╪¬ ╪º┘ä┘ê┘â┘è┘ä',
      skill_sales: '╪º╪│╪¬╪┤╪º╪▒┘è ┘à╪¿┘è╪╣╪º╪¬ ╪░┘â┘è',
      skill_appointments: '┘à┘å╪│┘é ┘à┘ê╪º╪╣┘è╪» ┘ê╪¡╪¼┘ê╪▓╪º╪¬',
      skill_orders: '┘à╪»┘è╪▒ ╪╖┘ä╪¿╪º╪¬ ┘ê╪┤╪¡┘å',
      skill_support: '╪ú╪«╪╡╪º╪ª┘è ╪»╪╣┘à ┘ê╪┤┘â╪º┘ê┘ë',
      skill_winback: '╪º╪│╪¬╪▒╪¼╪º╪╣ ╪º┘ä╪╣┘à┘ä╪º╪í ╪║┘è╪▒ ╪º┘ä┘å╪┤╪╖┘è┘å',
      booking_modal_title: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä╪¡╪¼╪▓ ┘ê╪º┘ä┘à┘ê╪╣╪»',
      label_customer_name: '╪º╪│┘à ╪º┘ä╪╣┘à┘è┘ä',
      placeholder_customer_name: '╪º┘ä╪º╪│┘à ╪¿╪º┘ä┘â╪º┘à┘ä',
      label_customer_phone: '╪▒┘é┘à ╪º┘ä┘ç╪º╪¬┘ü',
      placeholder_customer_phone: '01xxxxxxxxx',
      label_service_type: '┘å┘ê╪╣ ╪º┘ä╪«╪»┘à╪⌐ / ╪º┘ä╪║╪▒╪╢',
      placeholder_service_type: '╪º╪│╪¬╪┤╪º╪▒╪⌐ / ┘à╪╣╪º┘è┘å╪⌐',
      label_booking_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      label_booking_date: '╪º┘ä╪¬╪º╪▒┘è╪« ┘ê╪º┘ä┘ê┘é╪¬',
      label_slot_duration: '╪º┘ä┘à╪»╪⌐ (╪¿╪º┘ä╪»┘é╪º╪ª┘é)',
      label_booking_notes: '┘à┘ä╪º╪¡╪╕╪º╪¬ ┘ê╪¬┘ü╪º╪╡┘è┘ä',
      placeholder_booking_notes: '╪ú┘è ╪¬┘ü╪º╪╡┘è┘ä ╪ú┘ê ┘à┘ä╪º╪¡╪╕╪º╪¬ ╪Ñ╪╢╪º┘ü┘è╪⌐...',
      btn_save_booking: '╪¡┘ü╪╕ ╪º┘ä┘à┘ê╪╣╪»',
      chat_order_modal_title: '╪Ñ╪»╪º╪▒╪⌐ ╪╖┘ä╪¿ ╪º┘ä┘à╪¡╪º╪»╪½╪⌐',
      label_customer_address: '╪╣┘å┘ê╪º┘å ╪º┘ä╪¬┘ê╪╡┘è┘ä',
      label_order_items: '┘à┘ä╪«╪╡ ╪º┘ä┘à┘å╪¬╪¼╪º╪¬',
      placeholder_order_items: '╪º╪│┘à ╪º┘ä┘à┘å╪¬╪¼ x1',
      label_total_amount: '╪º┘ä╪Ñ╪¼┘à╪º┘ä┘è (╪¼┘å┘è┘ç)',
      label_order_status: '╪º┘ä╪¡╪º┘ä╪⌐',
      label_order_note: '┘à┘ä╪º╪¡╪╕╪º╪¬ ╪º┘ä╪╖┘ä╪¿',
      btn_save_order: '╪¡┘ü╪╕ ╪º┘ä╪╖┘ä╪¿',
      recipient_modal_title: '╪Ñ╪╢╪º┘ü╪⌐ ┘é┘å╪º╪⌐ ╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ┘ê╪¬┘å╪¿┘è┘ç╪º╪¬',
      label_rec_channel: '┘å┘ê╪╣ ╪º┘ä┘é┘å╪º╪⌐',
      channel_whatsapp: '╪▒┘é┘à ┘ê╪º╪¬╪│╪º╪¿',
      channel_telegram: '╪¡╪│╪º╪¿ ╪ú┘ê ┘é┘å╪º╪⌐ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à',
      label_rec_target: '╪º┘ä┘ê╪¼┘ç╪⌐ ╪º┘ä┘à╪│╪¬┘ç╪»┘ü╪⌐',
      placeholder_rec_target: '01xxxxxxxxx ╪ú┘ê ┘à╪╣╪▒┘ü ╪┤╪º╪¬ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à',
      hint_rec_target: '┘ä┘ê╪º╪¬╪│╪º╪¿: 01xxxxxxxxx ╪ú┘ê +201xxxxxxxxx. ┘ä╪¬┘è┘ä┘è╪¼╪▒╪º┘à: ┘à╪╣╪▒┘ü ╪º┘ä╪┤╪º╪¬ ╪ú┘ê ╪º┘ä┘é┘å╪º╪⌐.',
      label_rec_label: '╪º┘ä┘ê╪╡┘ü / ╪º┘ä┘ü╪▒┘è┘é ╪º┘ä┘à╪│╪¬┘ä┘à',
      placeholder_rec_label: '┘à╪»┘è╪▒ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬╪î ╪º┘ä┘à╪╖╪¿╪«╪î ┘ü╪▒┘è┘é ╪º┘ä╪╣┘à┘ä┘è╪º╪¬...',
      label_rec_events: '╪ú╪¡╪»╪º╪½ ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ╪º┘ä┘à┘ü╪╣┘ä╪⌐',
      ev_order_created: '╪Ñ┘å╪┤╪º╪í ╪╖┘ä╪¿ ╪¼╪»┘è╪»',
      ev_order_status: '╪¬╪¡╪»┘è╪½ ╪¡╪º┘ä╪⌐ ╪º┘ä╪╖┘ä╪¿',
      ev_booking_created: '╪¡╪¼╪▓ ┘à┘ê╪╣╪» ╪¼╪»┘è╪»',
      ev_booking_rescheduled: '╪¬╪╣╪»┘è┘ä ┘à┘ê╪╣╪» ╪¡╪¼╪▓',
      ev_booking_cancelled: '╪Ñ┘ä╪║╪º╪í ╪¡╪¼╪▓',
      btn_save_recipient: '╪¡┘ü╪╕ ┘é┘å╪º╪⌐ ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬',
      bookings_empty: '┘ä╪º ╪¬┘ê╪¼╪» ┘à┘ê╪º╪╣┘è╪» ┘à╪│╪¼┘ä╪⌐ ╪¡╪¬┘ë ╪º┘ä╪ó┘å.',
      recipients_empty: '┘ä┘à ┘è╪¬┘à ╪▒╪¿╪╖ ╪ú┘è ┘é┘å┘ê╪º╪¬ ╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ╪¡╪¬┘ë ╪º┘ä╪ó┘å.',
      action_confirm: '╪¬╪ú┘â┘è╪»',
      action_reschedule: '╪Ñ╪╣╪º╪»╪⌐ ╪¼╪»┘ê┘ä╪⌐',
      action_complete: '╪Ñ┘â┘à╪º┘ä',
      action_cancel: '╪Ñ┘ä╪║╪º╪í',
      action_edit: '╪¬╪╣╪»┘è┘ä',
      action_delete: '╪¡╪░┘ü',
      action_test: '╪º╪«╪¬╪¿╪º╪▒ ╪º┘ä╪Ñ╪▒╪│╪º┘ä',
      delete_booking_confirm: '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪▒╪║╪¿╪¬┘â ┘ü┘è ╪¡╪░┘ü ┘ç╪░╪º ╪º┘ä┘à┘ê╪╣╪»╪ƒ',
      delete_order_confirm: '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪▒╪║╪¿╪¬┘â ┘ü┘è ╪¡╪░┘ü ┘ç╪░╪º ╪º┘ä╪╖┘ä╪¿╪ƒ',
      delete_recipient_confirm: '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪¡╪░┘ü ┘é┘å╪º╪⌐ ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ┘ç╪░┘ç╪ƒ',
      booking_saved_ok: '╪¬┘à ╪¡┘ü╪╕ ╪º┘ä┘à┘ê╪╣╪» ╪¿┘å╪¼╪º╪¡!',
      order_saved_ok: '╪¬┘à ╪¡┘ü╪╕ ╪º┘ä╪╖┘ä╪¿ ╪¿┘å╪¼╪º╪¡!',
      recipient_saved_ok: '╪¬┘à ╪¡┘ü╪╕ ┘é┘å╪º╪⌐ ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ╪¿┘å╪¼╪º╪¡!',
      recipient_test_sent: '╪¬┘à ╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪Ñ╪┤╪╣╪º╪▒ ╪º┘ä╪¬╪¼╪▒┘è╪¿┘è ╪¿┘å╪¼╪º╪¡!',
      chan_webchat_title: '╪╡┘ü╪¡╪⌐ ╪º┘ä╪»╪▒╪»╪┤╪⌐ ╪º┘ä┘à╪│╪¬┘é┘ä╪⌐',
      chan_desc_webchat: '╪╡┘ü╪¡╪⌐ ╪»╪▒╪»╪┤╪⌐ ┘à╪«╪╡╪╡╪⌐ ┘ê┘à╪│╪¬┘é┘ä╪⌐ ┘ê╪¬╪¼╪▒╪¿╪⌐ ╪¬┘ü╪º╪╣┘ä┘è╪⌐ ┘ä┘ä┘ê┘â┘è┘ä.',
      btn_customize_chat: '╪¬╪«╪╡┘è╪╡ ┘ê╪º╪«╪¬╪¿╪º╪▒',
      btn_open_chat: '┘ü╪¬╪¡ ╪º┘ä╪»╪▒╪»╪┤╪⌐',
      chat_page_customizer_title: '╪¬╪«╪╡┘è╪╡ ╪╡┘ü╪¡╪⌐ ╪º┘ä╪»╪▒╪»╪┤╪⌐ ╪º┘ä┘à╪│╪¬┘é┘ä╪⌐',
      chat_page_share_link: '╪▒╪º╪¿╪╖ ╪╡┘ü╪¡╪⌐ ╪º┘ä╪»╪▒╪»╪┤╪⌐ ╪º┘ä┘à╪¿╪º╪┤╪▒',
      btn_copy_link: '┘å╪│╪« ╪º┘ä╪▒╪º╪¿╪╖',
      label_chat_page_title: '╪╣┘å┘ê╪º┘å ╪╡┘ü╪¡╪⌐ ╪º┘ä╪»╪▒╪»╪┤╪⌐',
      label_chat_page_slug: '┘à╪╣╪▒┘ü / ┘à╪│╪º╪▒ ╪º┘ä╪▒╪º╪¿╪╖ ╪º┘ä┘à╪«╪╡╪╡',
      chat_page_theme_colors: '╪ú┘ä┘ê╪º┘å ╪º┘ä┘ê╪º╪¼┘ç╪⌐ ┘ê╪º┘ä┘à╪╕┘ç╪▒',
      label_color_header: '┘ä┘ê┘å ╪º┘ä┘ç┘è╪»╪▒',
      label_color_bg: '┘ä┘ê┘å ╪º┘ä╪«┘ä┘ü┘è╪⌐',
      label_color_bot_bubble: '┘ü┘é╪º╪╣╪⌐ ╪▒╪│╪º┘ä╪⌐ ╪º┘ä┘ê┘â┘è┘ä',
      label_color_user_bubble: '┘ü┘é╪º╪╣╪⌐ ╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪╣┘à┘è┘ä',
      label_color_button: '┘ä┘ê┘å ╪▓╪▒ ╪º┘ä╪Ñ╪▒╪│╪º┘ä',
      label_color_title: '┘ä┘ê┘å ┘å╪╡ ╪º┘ä╪╣┘å┘ê╪º┘å',
      label_chat_suggested_questions: '╪º┘ä╪ú╪│╪ª┘ä╪⌐ ╪º┘ä╪│╪▒┘è╪╣╪⌐ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐ (╪│╪ñ╪º┘ä ┘ü┘è ┘â┘ä ╪│╪╖╪▒)',
      chk_enable_suggested_questions: '╪¬┘ü╪╣┘è┘ä ╪º┘ä╪ú╪│╪ª┘ä╪⌐ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐',
      chk_enable_image_upload: '╪¬┘ü╪╣┘è┘ä ╪Ñ┘à┘â╪º┘å┘è╪⌐ ╪▒┘ü╪╣ ╪º┘ä╪╡┘ê╪▒',
      label_embed_widget_code: '┘â┘ê╪» ╪¬╪╢┘à┘è┘å ╪º┘ä┘ê┘è╪»╪¼╪¬ ┘ü┘è ╪º┘ä┘à┘ê╪º┘é╪╣',
      btn_copy_code: '┘å╪│╪« ╪º┘ä┘â┘ê╪»',
      btn_save_chat_page: '╪¡┘ü╪╕ ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä╪»╪▒╪»╪┤╪⌐',
      chat_page_saved_ok: '╪¬┘à ╪¡┘ü╪╕ ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪╡┘ü╪¡╪⌐ ╪º┘ä╪»╪▒╪»╪┤╪⌐ ╪¿┘å╪¼╪º╪¡!',
      link_copied_ok: '╪¬┘à ┘å╪│╪« ╪º┘ä╪▒╪º╪¿╪╖ ╪Ñ┘ä┘ë ╪º┘ä╪¡╪º┘ü╪╕╪⌐!',
      code_copied_ok: '╪¬┘à ┘å╪│╪« ┘â┘ê╪» ╪º┘ä╪¬╪╢┘à┘è┘å ╪Ñ┘ä┘ë ╪º┘ä╪¡╪º┘ü╪╕╪⌐!',
      label_preset_themes: '╪º╪«╪¬╪▒ ┘å┘à┘ê╪░╪¼╪º┘ï ╪º┘ü╪¬╪▒╪º╪╢┘è╪º┘ï',
      preset_cyber_dark: '╪º┘ä┘å┘è┘ê┘å ╪º┘ä┘ä┘è┘ä┘è ╪º┘ä╪¡╪»┘è╪½',
      preset_cyber_dark_desc: '╪¬╪╡┘à┘è┘à ╪»╪º┘â┘å ┘å┘è┘ê┘å',
      preset_emerald_clean: '╪º┘ä╪ú╪«╪╢╪▒ ╪º┘ä╪▓┘à╪▒╪»┘è',
      preset_emerald_clean_desc: '┘ü╪º╪¬╪¡ ╪╣╪╡╪▒┘è ┘ü╪º╪«╪▒',
      preset_royal_purple: '╪º┘ä╪ú╪▒╪¼┘ê╪º┘å┘è ╪º┘ä┘à┘ä┘â┘è',
      preset_royal_purple_desc: '╪¬╪╡┘à┘è┘à ╪»╪º┘â┘å ┘à┘ä┘â┘è',
      hint_customize_colors: '┘é╪º╪¿┘ä ┘ä┘ä╪¬╪╣╪»┘è┘ä ╪¿╪¡╪▒┘è╪⌐',
      preview_live_title: '┘à╪╣╪º┘è┘å╪⌐ ╪¡┘è╪⌐ ╪¬┘ü╪º╪╣┘ä┘è╪⌐',
      badge_realtime: '┘à╪¿╪º╪┤╪▒',
      preview_status_online: '┘å╪┤╪╖ ┬╖ ╪¼╪º┘ç╪▓ ┘ä┘ä╪▒╪» ┘ê╪º┘ä┘à╪¿┘è╪╣╪º╪¬',
      preview_input_placeholder: '╪º┘â╪¬╪¿ ╪▒╪│╪º┘ä╪¬┘â ┘ç┘å╪º...',
      free_plan_tools_limit_badge: '(╪º┘ä╪¡╪» ╪º┘ä╪ú┘é╪╡┘ë ┘ä┘ä╪¿╪º┘é╪⌐ ╪º┘ä┘à╪¼╪º┘å┘è╪⌐: ╪ú╪»╪º╪¬╪º┘å ┘ü┘é╪╖)',
      free_plan_skills_limit_badge: '(╪º┘ä╪¡╪» ╪º┘ä╪ú┘é╪╡┘ë ┘ä┘ä╪¿╪º┘é╪⌐ ╪º┘ä┘à╪¼╪º┘å┘è╪⌐: ┘à┘ç╪º╪▒╪¬╪º┘å ┘ü┘é╪╖)',
      label_chat_page_logo: '╪┤╪╣╪º╪▒ ┘ê╪ú┘è┘é┘ê┘å╪⌐ ╪╡┘ü╪¡╪⌐ ╪º┘ä╪»╪▒╪»╪┤╪⌐',
      btn_upload_logo: '╪▒┘ü╪╣ ╪┤╪╣╪º╪▒',
      btn_remove_logo: '╪Ñ╪▓╪º┘ä╪⌐',
      hint_logo_format: 'PNG ╪ú┘ê JPG ╪¡╪¬┘ë 2 ┘à┘è╪¼╪º╪¿╪º┘è╪¬',
      placeholder_store_url: 'https://my-store.myshopify.com',
      store_sync_feedback: '╪¬┘à ╪¡┘ü╪╕ ╪Ñ╪╣╪»╪º╪»╪º╪¬ ┘à╪▓╪º┘à┘å╪⌐ ╪º┘ä┘à╪¬╪¼╪▒ ╪¿┘å╪¼╪º╪¡. ┘è╪│╪¬╪╖┘è╪╣ ╪º┘ä┘ê┘â┘è┘ä ╪º┘ä╪░┘â┘è ╪º┘ä╪ó┘å ╪¬╪▒╪┤┘è╪¡ ╪º┘ä┘à┘å╪¬╪¼╪º╪¬ ┘à┘å ╪º┘ä┘â╪¬╪º┘ä┘ê╪¼.',
      store_sync_planned: '╪º┘ä┘à╪▓╪º┘à┘å╪⌐ ╪º┘ä╪¬┘ä┘é╪º╪ª┘è╪⌐ ╪º┘ä┘à╪¿╪º╪┤╪▒╪⌐ ┘à╪╣ ╪┤┘ê╪¿┘è┘ü╪º┘è ┘ê┘ê┘â┘ê┘à╪▒╪│ ┘é┘è╪» ╪º┘ä╪Ñ╪╖┘ä╪º┘é ╪º┘ä┘à╪¿╪º╪┤╪▒. ┘â╪¬╪º┘ä┘ê╪¼ ╪º┘ä┘à╪¬╪¼╪▒ ╪º┘ä╪»╪º╪«┘ä┘è ┘å╪┤╪╖ ┘ê┘è╪╣┘à┘ä ╪¡╪º┘ä┘è╪º┘ï.',
      automation_center_title: '┘à╪▒┘â╪▓ ╪ú╪¬┘à╪¬╪⌐ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ┘ê╪º┘ä┘à┘ç╪º┘à ╪º┘ä╪¬┘ä┘é╪º╪ª┘è╪⌐',
      automation_center_desc: '╪Ñ╪»╪º╪▒╪⌐ ╪º┘ä┘à┘ç╪º┘à ╪º┘ä╪¬┘ä┘é╪º╪ª┘è╪⌐ ╪º┘ä╪«┘ä┘ü┘è╪⌐: ╪º╪│╪¬╪╣╪º╪»╪⌐ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘à╪¬╪▒┘ê┘â╪⌐╪î ╪¬┘é╪▒┘è╪▒ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘è┘ê┘à┘è╪î ┘ê┘ü╪▒╪▓ ╪º┘ä╪┤┘â╪º┘ê┘ë ╪º┘ä╪╣╪º╪¼┘ä╪⌐.',
      btn_trigger_recovery: '╪º╪│╪¬╪╣╪º╪»╪⌐ ╪º┘ä╪╣┘à┘ä╪º╪í ╪º┘ä┘à╪¡╪¬┘à┘ä┘è┘å ╪º┘ä╪ó┘å',
      btn_trigger_digest: '╪Ñ╪▒╪│╪º┘ä ┘à┘ä╪«╪╡ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä╪ó┘å',
      card_recovery_title: '╪º╪│╪¬╪╣╪º╪»╪⌐ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘à╪¬╪▒┘ê┘â╪⌐',
      card_recovery_desc: '╪Ñ╪╣╪º╪»╪⌐ ╪º╪│╪¬┘ç╪»╪º┘ü ┘ê┘à╪¬╪º╪¿╪╣╪⌐ ╪º┘ä╪╣┘à┘ä╪º╪í ╪º┘ä╪░┘è┘å ╪ú╪¿╪»┘ê╪º ╪▒╪║╪¿╪⌐ ╪¿╪º┘ä╪┤╪▒╪º╪í ╪ú┘ê ╪│╪ú┘ä┘ê╪º ╪╣┘å ╪º┘ä╪ú╪│╪╣╪º╪▒ ┘ê╪¬┘ê┘é┘ü┘ê╪º ╪╣┘å ╪º┘ä╪▒╪».',
      card_digest_title: '╪¬┘é╪▒┘è╪▒ ╪º┘ä╪ú╪»╪º╪í ┘ê╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘è┘ê┘à┘è',
      card_digest_desc: '┘à┘ä╪«╪╡ ╪┤╪º┘à┘ä ┘ä┘ä╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘è┘ê┘à┘è╪⌐ ┘ê╪º┘ä╪Ñ┘è╪▒╪º╪»╪º╪¬ ┘ê╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ┘è┘Å╪▒╪│┘ä ┘ä╪¡╪│╪º╪¿┘â ╪╣┘ä┘ë ╪¬┘è┘ä┘è╪¼╪▒╪º┘à ╪ú┘ê ┘ê╪º╪¬╪│╪º╪¿.',
      card_stock_title: '╪¬┘å╪¿┘è┘ç╪º╪¬ ╪º┘ä┘à╪«╪▓┘ê┘å ╪º┘ä┘à┘å╪«┘ü╪╢',
      card_stock_desc: '┘à╪▒╪º┘é╪¿╪⌐ ┘à╪│╪¬┘à╪▒╪⌐ ┘ä┘â┘à┘è╪º╪¬ ╪º┘ä┘à┘å╪¬╪¼╪º╪¬ ┘ü┘è ╪º┘ä┘â╪¬╪º┘ä┘ê╪¼ ┘ê╪Ñ╪▒╪│╪º┘ä ╪Ñ┘å╪░╪º╪▒ ┘à╪¿┘â╪▒ ╪╣┘å╪» ╪º┘é╪¬╪▒╪º╪¿ ┘å┘ü╪º╪» ╪º┘ä┘à╪«╪▓┘ê┘å.',
      card_complaints_title: '┘ü╪▒╪▓ ┘ê╪¬┘å╪¿┘è┘ç ╪º┘ä╪┤┘â╪º┘ê┘ë ╪º┘ä╪╣╪º╪¼┘ä╪⌐',
      card_complaints_desc: '╪¬╪¡┘ê┘è┘ä ┘ü┘ê╪▒┘è ┘ä╪┤┘â╪º┘ê┘ë ╪º┘ä╪╣┘à┘ä╪º╪í ╪º┘ä╪¡╪▒╪¼╪⌐ ┘ê╪╖┘ä╪¿╪º╪¬ ╪º┘ä╪¬╪»╪«┘ä ╪º┘ä╪¿╪┤╪▒┘è ╪Ñ┘ä┘ë ┘ç╪º╪¬┘ü┘â ╪»┘ê┘å ╪¬╪ú╪«┘è╪▒.',
      badge_active: '┘å╪┤╪╖',
      badge_scheduled: '┘è┘ê┘à┘è╪º┘ï 9:00 ┘à',
      badge_monitoring: '┘à╪▒╪º┘é╪¿╪⌐ ╪¬┘ä┘é╪º╪ª┘è╪⌐',
      badge_instant: '╪¬┘å╪¿┘è┘ç ┘ü┘ê╪▒┘è',
      agent_tool_recovery_title: '╪ú╪»╪º╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ ┘ê╪º╪│╪¬╪╣╪º╪»╪⌐ ╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘à╪¬╪▒┘ê┘â╪⌐ ╪¬┘ä┘é╪º╪ª┘è╪º┘ï',
      agent_recovery_delay_label: '╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ ╪¿╪╣╪»',
      delay_2h: '╪│╪º╪╣╪¬╪º┘å',
      delay_4h: '4 ╪│╪º╪╣╪º╪¬',
      delay_12h: '12 ╪│╪º╪╣╪⌐',
      delay_24h: '24 ╪│╪º╪╣╪⌐',
      agent_recovery_msg_label: '╪▒╪│╪º┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ ╪º┘ä┘à╪«╪╡╪╡╪⌐',
      agent_recovery_msg_placeholder: '╪º╪¬╪▒┘â┘ç ┘ü╪º╪▒╪║╪º┘ï ┘ä╪º╪│╪¬╪«╪»╪º┘à ╪º┘ä╪▒╪│╪º┘ä╪⌐ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢┘è╪⌐ ╪º┘ä╪░┘â┘è╪⌐',
      agent_tool_digest_title: '╪ú╪»╪º╪⌐ ╪¬┘é╪▒┘è╪▒ ╪º┘ä╪ú╪»╪º╪í ┘ê╪º┘ä┘à╪¿┘è╪╣╪º╪¬ ╪º┘ä┘è┘ê┘à┘è ╪º┘ä╪¬┘ä┘é╪º╪ª┘è',
      agent_digest_channel_label: '┘é┘å╪º╪⌐ ╪º╪│╪¬┘ä╪º┘à ╪º┘ä╪¬┘é╪▒┘è╪▒',
      channel_all: '╪¬┘è┘ä┘è╪¼╪▒╪º┘à ┘ê┘ê╪º╪¬╪│╪º╪¿ ┘ê┘ä┘ê╪¡╪⌐ ╪º┘ä╪¬╪¡┘â┘à',
      channel_inapp: '╪Ñ╪┤╪╣╪º╪▒╪º╪¬ ┘ä┘ê╪¡╪⌐ ╪º┘ä╪¬╪¡┘â┘à ┘ü┘é╪╖',
      agent_digest_time_label: '┘ê┘é╪¬ ╪º┘ä╪Ñ╪▒╪│╪º┘ä ╪º┘ä┘è┘ê┘à┘è',
      agent_tool_upsell_title: '╪ú╪»╪º╪⌐ ╪¬╪▒╪┤┘è╪¡ ╪º┘ä┘à┘å╪¬╪¼╪º╪¬ ╪º┘ä╪¬┘â┘à┘è┘ä┘è╪⌐ ┘ê╪Ñ╪║┘ä╪º┘é ╪º┘ä╪╡┘ü┘é╪º╪¬',
      agent_sales_tone_label: '┘å╪¿╪▒╪⌐ ┘ê╪ú╪│┘ä┘ê╪¿ ╪º┘ä╪¿┘è╪╣',
      tone_consultative: '╪º╪│╪¬╪┤╪º╪▒┘è ┘ê┘à┘é┘å╪╣',
      tone_enthusiastic: '╪¡┘à╪º╪│┘è ┘ê╪¬╪▒┘ê┘è╪¼┘è',
      tone_formal: '╪▒╪│┘à┘è ┘ê┘à╪¿╪º╪┤╪▒',
      agent_max_discount_label: '╪╡┘ä╪º╪¡┘è╪⌐ ╪º┘ä╪«╪╡┘à ╪º┘ä╪¬╪┤╪¼┘è╪╣┘è',
      discount_none: '╪¿╪»┘ê┘å ╪«╪╡┘à ╪Ñ╪╢╪º┘ü┘è (0%)',
      menu_idea_council: '┘ä╪¼┘å╪⌐ ╪º┘ä╪ú┘ü┘â╪º╪▒',
      idea_council_desc: '┘ä╪¼┘å╪⌐ ╪¬╪¡┘ä┘è┘ä ┘à╪¬╪«╪╡╪╡╪⌐ ╪¿╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è ┘ä╪¬┘é┘è┘è┘à ╪º┘ä┘à╪┤╪º╪▒┘è╪╣ ┘ê╪╡┘å╪º╪╣╪⌐ ╪º┘ä┘é╪▒╪º╪▒',
      idea_quota_label: '╪▒╪╡┘è╪» ╪º┘ä╪ú┘ü┘â╪º╪▒ ╪º┘ä╪┤┘ç╪▒┘è',
      idea_quota_text: '╪ú┘ü┘â╪º╪▒ ┘à╪¬╪º╪¡╪⌐ ┘ç╪░╪º ╪º┘ä╪┤┘ç╪▒',
      idea_btn_new: '╪º╪╣╪▒╪╢ ┘ü┘â╪▒╪⌐ ╪¼╪»┘è╪»╪⌐',
      idea_btn_back_list: '╪º┘ä╪╣┘ê╪»╪⌐ ┘ä┘é╪º╪ª┘à╪⌐ ╪º┘ä╪ú┘ü┘â╪º╪▒',
      idea_filter_all: '╪º┘ä┘â┘ä',
      idea_filter_drafts: '╪º┘ä┘à╪│┘ê╪»╪º╪¬',
      idea_filter_running: '┘é┘è╪» ╪º┘ä╪¬┘é┘è┘è┘à',
      idea_filter_completed: '┘à┘â╪¬┘à┘ä╪⌐',
      idea_list_empty: '┘ä╪º ╪¬┘ê╪¼╪» ╪ú┘ü┘â╪º╪▒ ┘à╪│╪¼┘ä╪⌐ ╪¡╪¬┘ë ╪º┘ä╪ó┘å. ╪º┘å┘é╪▒ ┘ü┘ê┘é ┘ü┘â╪▒╪⌐ ╪¼╪»┘è╪»╪⌐ ┘ä┘ä╪¿╪»╪í.',
      idea_input_title: '╪╡┘ü ┘ü┘â╪▒╪⌐ ┘à╪┤╪▒┘ê╪╣┘â',
      idea_input_desc_label: '┘ê╪╡┘ü ╪º┘ä┘ü┘â╪▒╪⌐ ╪¿╪º┘ä╪¬┘ü╪╡┘è┘ä (┘à┘å 100 ╪Ñ┘ä┘ë 8,000 ╪¡╪▒┘ü)',
      idea_input_desc_placeholder: '╪º┘â╪¬╪¿ ┘ü┘â╪▒╪¬┘â ╪¿╪¡╪▒┘è╪⌐: ┘à╪º ╪º┘ä┘à╪┤┘â┘ä╪⌐ ╪º┘ä╪¬┘è ╪¬╪¡┘ä┘ç╪º╪ƒ ┘ä┘à┘å ╪¬┘é╪»┘à╪ƒ ┘ê┘ä┘à╪º╪░╪º ┘é╪» ┘è╪║┘è╪▒ ╪º┘ä┘å╪º╪│ ╪│┘ä┘ê┘â┘ç┘à ┘ä╪º╪│╪¬╪«╪»╪º┘à┘ç╪º╪ƒ',
      idea_input_market_label: '╪º┘ä╪│┘ê┘é ╪º┘ä┘à╪│╪¬┘ç╪»┘ü ╪ú┘ê ╪º┘ä┘å╪╖╪º┘é ╪º┘ä╪¼╪║╪▒╪º┘ü┘è (╪º╪«╪¬┘è╪º╪▒┘è)',
      idea_input_market_placeholder: '┘à╪½╪º┘ä: ╪º┘ä╪│╪╣┘ê╪»┘è╪⌐╪î ╪º┘ä╪«┘ä┘è╪¼╪î ┘à╪¬╪¼╪▒ ┘à╪¡┘ä┘è',
      idea_input_audience_label: '╪º┘ä┘ü╪ª╪⌐ ╪º┘ä┘à╪│╪¬┘ç╪»┘ü╪⌐ ┘à┘å ╪º┘ä╪╣┘à┘ä╪º╪í (╪º╪«╪¬┘è╪º╪▒┘è)',
      idea_input_audience_placeholder: '┘à╪½╪º┘ä: ╪ú╪╡╪¡╪º╪¿ ╪º┘ä┘à╪╖╪º╪╣┘à╪î ╪º┘ä┘à╪│╪¬┘é┘ä┘è┘å',
      idea_input_concern_label: '╪ú┘â╪½╪▒ ╪┤┘è╪í ┘è┘é┘ä┘é┘â ┘ê╪¬╪▒┘è╪» ╪¬┘é┘è┘è┘à┘ç (╪º╪«╪¬┘è╪º╪▒┘è)',
      idea_input_concern_placeholder: '┘à╪½╪º┘ä: ┘ç┘ä ╪│┘è╪»┘ü╪╣ ╪º┘ä╪╣┘à┘è┘ä ┘ü╪╣┘ä╪º┘ï╪ƒ ┘ç┘ä ┘è╪│┘ç┘ä ╪¬┘é┘ä┘è╪»┘ç╪º╪ƒ',
      idea_lang_label: '┘ä╪║╪⌐ ╪º┘ä╪¬┘é╪▒┘è╪▒',
      idea_lang_ar: '╪º┘ä╪╣╪▒╪¿┘è╪⌐',
      idea_lang_en: '╪º┘ä╪Ñ┘å╪¼┘ä┘è╪▓┘è╪⌐',
      idea_privacy_notice: '╪╢┘à╪º┘å ╪º┘ä╪«╪╡┘ê╪╡┘è╪⌐: ╪ú┘ü┘â╪º╪▒┘â ┘ê╪¬┘é╪º╪▒┘è╪▒┘â ╪«╪º╪╡╪⌐ ╪¿╪¡╪│╪º╪¿┘â ┘ê┘à╪┤┘ü╪▒╪⌐ ┘ê┘ä╪º ╪¬┘Å╪│╪¬╪«╪»┘à ┘ä╪¬╪»╪▒┘è╪¿ ╪º┘ä┘å┘à╪º╪░╪¼ ╪º┘ä╪╣╪º┘à╪⌐.',
      idea_guiding_questions_title: '╪ú╪│╪ª┘ä╪⌐ ┘à╪│╪º╪╣╪»╪⌐ ╪º╪│╪¬╪▒╪┤╪º╪»┘è╪⌐',
      idea_gq_one: '┘à╪º ┘ç┘è ╪º┘ä┘à╪┤┘â┘ä╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐ ┘ê┘à┘å ╪º┘ä╪░┘è ┘è╪╣╪º┘å┘è ┘à┘å┘ç╪º╪ƒ',
      idea_gq_two: '┘à╪º╪░╪º ┘è┘ü╪╣┘ä ╪º┘ä╪╣┘à┘ä╪º╪í ╪¡╪º┘ä┘è╪º┘ï ┘â╪¿╪»┘è┘ä ┘ä╪¡┘ä┘â╪ƒ',
      idea_gq_three: '┘ä┘à╪º╪░╪º ┘é╪» ┘è╪║┘è╪▒ ╪º┘ä┘å╪º╪│ ╪╣╪º╪»╪º╪¬┘ç┘à ╪º┘ä┘è┘ê┘à┘è╪⌐ ┘ä┘ä╪º┘å╪¬┘é╪º┘ä ╪Ñ┘ä┘è┘â╪ƒ',
      idea_btn_structure: '╪¬┘å╪╕┘è┘à ╪¿╪╖╪º┘é╪⌐ ╪º┘ä┘ü┘â╪▒╪⌐',
      idea_btn_structuring: '╪¼╪º╪▒┘ì ╪¬┘å╪╕┘è┘à ╪º┘ä┘ü┘â╪▒╪⌐...',
      idea_card_title: '╪¿╪╖╪º┘é╪⌐ ╪º┘ä┘ü┘â╪▒╪⌐ ╪º┘ä┘à┘å╪╕┘à╪⌐',
      idea_card_desc: '╪▒╪º╪¼╪╣ ┘ê╪╣╪»┘ä ┘â┘è┘ü┘è╪⌐ ┘ü┘ç┘à ╪º┘ä┘ä╪¼┘å╪⌐ ┘ä┘ü┘â╪▒╪¬┘â ┘é╪¿┘ä ╪¿╪»╪í ╪¼┘ä╪│╪⌐ ╪º┘ä╪¬┘é┘è┘è┘à.',
      idea_fld_title: '╪º┘ä╪╣┘å┘ê╪º┘å ╪º┘ä┘à┘é╪¬╪▒╪¡',
      idea_fld_pitch: '╪º┘ä┘ê╪╡┘ü ╪º┘ä┘à╪«╪¬╪╡╪▒',
      idea_fld_customer: '╪º┘ä╪╣┘à┘è┘ä ╪º┘ä┘à╪│╪¬┘ç╪»┘ü',
      idea_fld_problem: '╪º┘ä┘à╪┤┘â┘ä╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐',
      idea_fld_solution: '╪º┘ä╪¡┘ä ╪º┘ä┘à┘é╪¬╪▒╪¡',
      idea_fld_value: '╪º┘ä┘é┘è┘à╪⌐ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐',
      idea_fld_alternatives: '╪º┘ä╪¿╪»╪º╪ª┘ä ╪º┘ä╪¡╪º┘ä┘è╪⌐',
      idea_fld_revenue: '┘å┘à┘ê╪░╪¼ ╪º┘ä╪▒╪¿╪¡',
      idea_fld_assumptions: '╪º┘ä╪º┘ü╪¬╪▒╪º╪╢╪º╪¬ ╪º┘ä╪ú┘ê┘ä┘è╪⌐',
      idea_fld_gaps: '╪º┘ä┘à╪╣┘ä┘ê┘à╪º╪¬ ╪º┘ä┘å╪º┘é╪╡╪⌐',
      idea_fld_core_question: '╪│╪ñ╪º┘ä ╪º┘ä╪¬┘é┘è┘è┘à ╪º┘ä╪ú╪│╪º╪│┘è',
      idea_confirm_card_text: '╪ú╪ñ┘â╪» ╪ú┘å ┘ç╪░┘ç ╪º┘ä╪¿╪╖╪º┘é╪⌐ ╪¬┘à╪½┘ä ┘ü┘â╪▒╪¬┘è ╪¿╪»┘é╪⌐ ┘ê╪¼╪º┘ç╪▓ ┘ä╪¿╪»╪í ╪º┘ä╪¬┘é┘è┘è┘à.',
      idea_btn_start_council: '╪º╪¿╪»╪ú ╪¼┘ä╪│╪⌐ ╪º┘ä╪¬┘é┘è┘è┘à',
      idea_btn_save_draft: '╪¡┘ü╪╕ ┘â┘à╪│┘ê╪»╪⌐',
      idea_session_progress_title: '╪¼┘ä╪│╪⌐ ╪º┘ä┘ä╪¼┘å╪⌐ ┘à┘å╪╣┘é╪»╪⌐ ╪¡╪º┘ä┘è╪º┘ï',
      idea_session_progress_desc: '╪¬╪╣┘à┘ä ╪º┘ä┘ä╪¼┘å╪⌐ ┘ü┘è ╪º┘ä╪«┘ä┘ü┘è╪⌐. ┘è┘à┘â┘å┘â ┘à╪║╪º╪»╪▒╪⌐ ╪º┘ä╪╡┘ü╪¡╪⌐ ┘ê╪º┘ä╪╣┘ê╪»╪⌐ ┘ü┘è ╪ú┘è ┘ê┘é╪¬ ╪»┘ê┘å ┘ü┘é╪»╪º┘å ╪º┘ä╪¬┘é╪»┘à.',
      idea_step_research: '╪º┘ä╪¿╪¡╪½ ╪º┘ä╪│┘ê┘é┘è ╪º┘ä╪¡┘è',
      idea_step_analysis: '╪¬╪¡┘ä┘è┘ä ╪ú╪╣╪╢╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐',
      idea_step_synthesis: '╪╡┘è╪º╪║╪⌐ ╪º┘ä╪¬┘é╪▒┘è╪▒ ╪º┘ä┘å┘ç╪º╪ª┘è',
      member_cold_customer: '╪º┘ä╪╣┘à┘è┘ä ╪º┘ä╪¿╪º╪▒╪»',
      member_cold_customer_role: '╪│┘ä┘ê┘â ╪º┘ä┘à╪┤╪¬╪▒┘è ┘ê┘à╪¡┘ü╪▓ ╪º┘ä╪¬╪¼╪▒╪¿╪⌐',
      member_harsh_auditor: '╪º┘ä┘à╪»┘é┘é ╪º┘ä┘é╪º╪│┘è',
      member_harsh_auditor_role: '┘â╪┤┘ü ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢╪º╪¬ ┘ê╪º┘ä╪½╪║╪▒╪º╪¬',
      member_execution_expert: '╪«╪¿┘è╪▒ ╪º┘ä╪¬┘å┘ü┘è╪░',
      member_execution_expert_role: '┘é╪º╪¿┘ä┘è╪⌐ ╪º┘ä╪¿┘å╪º╪í ┘ê┘å╪╖╪º┘é 7 ╪ú┘è╪º┘à',
      member_market_researcher: '╪¿╪º╪¡╪½ ╪º┘ä╪│┘ê┘é',
      member_market_researcher_role: '╪¿╪¡╪½ ╪º┘ä╪¿╪»╪º╪ª┘ä ┘ê╪Ñ╪┤╪º╪▒╪º╪¬ ╪º┘ä╪╖┘ä╪¿',
      member_devils_advocate: '┘à╪¡╪º┘à┘è ╪º┘ä╪┤┘è╪╖╪º┘å',
      member_devils_advocate_role: '╪│┘è┘å╪º╪▒┘è┘ê ╪º┘ä┘ü╪┤┘ä ╪º┘ä╪ú╪│┘ê╪ú',
      member_wedge_hunter: '╪╡╪º╪ª╪» ╪º┘ä╪¬┘à┘è┘æ╪▓',
      member_wedge_hunter_role: '╪▓╪º┘ê┘è╪⌐ ╪º┘ä╪»╪«┘ê┘ä ┘ê╪º┘ä┘é╪º╪¿┘ä┘è╪⌐ ┘ä┘ä╪»┘ü╪º╪╣',
      member_ux_designer: '┘à╪╡┘à┘à ╪º┘ä╪¬╪¼╪▒╪¿╪⌐',
      member_ux_designer_role: '╪ú┘ê┘ä ┘ä╪¡╪╕╪⌐ ┘é┘è┘à╪⌐ ┘ê┘å┘é╪º╪╖ ╪º┘ä╪º╪¡╪¬┘â╪º┘â',
      member_candid_champion: '╪º┘ä╪»╪º╪╣┘à ╪º┘ä╪╡╪▒┘è╪¡',
      member_candid_champion_role: '┘å┘é╪╖╪⌐ ╪º┘ä┘é┘ê╪⌐ ╪º┘ä┘ê╪º┘é╪╣┘è╪⌐ ┘ä┘ä╪º╪│╪¬┘à╪▒╪º╪▒',
      idea_report_title: '╪¬┘é╪▒┘è╪▒ ╪º┘ä┘é╪▒╪º╪▒ ╪º┘ä┘à┘ê╪¡╪» ┘ä┘ä╪¼┘å╪⌐ ╪º┘ä╪ú┘ü┘â╪º╪▒',
      idea_verdict_label: '╪º┘ä┘é╪▒╪º╪▒ ╪º┘ä╪¬┘å┘ü┘è╪░┘è',
      idea_seven_day_build_label: '┘é╪▒╪º╪▒ ╪º┘ä╪¿┘å╪º╪í ┘ä╪│╪¿╪╣╪⌐ ╪ú┘è╪º┘à',
      idea_opp_label: '╪ú┘é┘ê┘ë ┘ü╪▒╪╡╪⌐',
      idea_risk_label: '╪ú┘â╪¿╪▒ ╪«╪╖╪▒',
      idea_assumptions_label: '╪ú╪«╪╖╪▒ 3 ╪º┘ü╪¬╪▒╪º╪╢╪º╪¬ ╪║┘è╪▒ ┘à╪½╪¿╪¬╪⌐',
      idea_question_label: '╪ú┘ç┘à ╪│╪ñ╪º┘ä ┘è╪¼╪¿ ╪¡╪│┘à┘ç',
      idea_cut_list_label: '┘à╪º ┘è╪¼╪¿ ╪¡╪░┘ü┘ç ╪ú┘ê ╪¬╪ú╪¼┘è┘ä┘ç',
      idea_validation_plan_title: '╪«╪╖╪⌐ ╪º┘ä╪¬╪¡┘é┘é ╪º┘ä┘à╪▒┘å╪⌐',
      idea_val_hypothesis: '╪º┘ä┘ü╪▒╪╢┘è╪⌐',
      idea_val_audience: '╪º┘ä╪¼┘à┘ç┘ê╪▒',
      idea_val_channel: '╪º┘ä┘é┘å╪º╪⌐',
      idea_val_duration: '╪º┘ä┘à╪»╪⌐ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐',
      idea_val_cost: '╪º┘ä╪¬┘â┘ä┘ü╪⌐ ╪º┘ä╪¬┘é╪»┘è╪▒┘è╪⌐',
      idea_val_metric: '┘à╪╣┘è╪º╪▒ ╪º┘ä┘å╪¼╪º╪¡',
      idea_val_stop: '╪┤╪▒╪╖ ╪º┘ä╪¬┘ê┘é┘ü',
      idea_mvp_title: '┘å╪╖╪º┘é MVP ┘ä╪│╪¿╪╣╪⌐ ╪ú┘è╪º┘à',
      idea_wedge_title: '╪▓╪º┘ê┘è╪⌐ ╪º┘ä╪¬┘à┘è┘æ╪▓ ┘ê┘ä╪¡╪╕╪⌐ ╪º┘ä┘é┘è┘à╪⌐',
      idea_consensus_title: '┘å┘é╪º╪╖ ╪º┘ä╪º╪¬┘ü╪º┘é ┘ê╪º┘ä╪¬╪¿╪º┘è┘å',
      idea_sources_title: '┘à╪╡╪º╪»╪▒ ╪º┘ä╪¿╪¡╪½ ╪º┘ä┘à┘ê╪½┘é╪⌐',
      idea_critics_title: '╪¬╪¡┘ä┘è┘ä╪º╪¬ ┘ê╪¬┘é┘è┘è┘à╪º╪¬ ╪ú╪╣╪╢╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐ ╪º┘ä╪¬┘ü╪╡┘è┘ä┘è╪⌐',
      idea_critics_subtitle: '8 ╪▓┘ê╪º┘è╪º ╪¬╪«╪╡╪╡┘è╪⌐ ╪¡┘ê┘ä ╪º┘ä╪¼╪»┘ê┘ë ┘ê┘é╪º╪¿┘ä┘è╪⌐ ╪º┘ä╪¬┘å┘ü┘è╪░ ┘ê╪º┘ä┘à╪«╪º╪╖╪▒',
      idea_truth_board_title: '┘ä┘ê╪¡╪⌐ ╪º┘ä╪¡┘é┘è┘é╪⌐ ╪º┘ä╪¬┘ü╪º╪╣┘ä┘è╪⌐',
      idea_truth_board_desc: '╪¬╪º╪¿╪╣ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢╪º╪¬ ┘ê╪º┘ä┘à╪«╪º╪╖╪▒ ┘ê╪«╪╖┘ê╪º╪¬ ╪º┘ä╪¬╪¡┘é┘é ┘ü┘è ╪º┘ä┘ê┘é╪¬ ╪º┘ä┘ü╪╣┘ä┘è ╪»┘ê┘å ╪º╪│╪¬┘ç┘ä╪º┘â ╪¼┘ê┘ä╪º╪¬ ╪º┘ä╪░┘â╪º╪í ╪º┘ä╪º╪╡╪╖┘å╪º╪╣┘è.',
      idea_tb_status_open: '┘à┘ü╪¬┘ê╪¡',
      idea_tb_status_validating: '╪¼╪º╪▒┘ì ╪º┘ä╪¬╪¡┘é┘é',
      idea_tb_status_verified: '╪¬┘à ╪º┘ä╪¬╪¡┘é┘é',
      idea_tb_status_dismissed: '┘à╪│╪¬╪¿╪╣╪»',
      idea_tb_notes_placeholder: '┘à┘ä╪º╪¡╪╕╪º╪¬ ┘ê╪¬╪¡╪»┘è╪½╪º╪¬ ╪º┘ä┘à╪ñ╪│╪│...',
      idea_btn_export_md: '╪¬╪╡╪»┘è╪▒ Markdown',
      idea_btn_export_pdf: '╪╖╪¿╪º╪╣╪⌐ ╪ú┘ê PDF',
      idea_rounds_history_title: '╪│╪¼┘ä ╪¼┘ê┘ä╪º╪¬ ╪º┘ä╪¬┘é┘è┘è┘à:',
      idea_btn_compare_rounds: '┘à┘é╪º╪▒┘å╪⌐ ╪º┘ä╪¼┘ê┘ä╪º╪¬',
      idea_unit_econ_title: '╪¡╪º╪│╪¿╪⌐ ╪º┘é╪¬╪╡╪º╪»┘è╪º╪¬ ╪º┘ä┘ê╪¡╪»╪⌐ ╪º┘ä╪¬┘ü╪º╪╣┘ä┘è╪⌐',
      idea_unit_econ_subtitle: '┘à╪¡╪º┘â╪º╪⌐ ╪º┘ä┘ç╪º┘à╪┤ ┘ê╪¡╪¼┘à ╪º┘ä╪╖┘ä╪¿╪º╪¬ ┘ê┘å┘é╪º╪╖ ╪º┘ä╪¬╪╣╪º╪»┘ä. ╪¡╪▒┘æ┘â ╪º┘ä┘à╪ñ╪┤╪▒╪º╪¬ ┘ä╪º╪«╪¬╪¿╪º╪▒ ╪╡┘ä╪º╪¿╪⌐ ╪º┘ä┘å┘à┘ê╪░╪¼ ╪º┘ä┘à╪º┘ä┘è.',
      idea_unit_econ_aov: '┘à╪¬┘ê╪│╪╖ ┘é┘è┘à╪⌐ ╪º┘ä╪╖┘ä╪¿ (AOV):',
      idea_unit_econ_margin: '┘å╪│╪¿╪⌐ ╪º┘ä╪╣┘à┘ê┘ä╪⌐ / ┘ç╪º┘à╪┤ ╪º┘ä╪▒╪¿╪¡:',
      idea_unit_econ_direct_costs: '╪º┘ä╪¬┘â╪º┘ä┘è┘ü ╪º┘ä┘à╪¿╪º╪┤╪▒╪⌐ ┘ä┘â┘ä ╪╖┘ä╪¿:',
      idea_unit_econ_fixed_costs: '╪º┘ä┘à╪╡╪º╪▒┘è┘ü ╪º┘ä╪¬╪┤╪║┘è┘ä┘è╪⌐ ╪º┘ä╪½╪º╪¿╪¬╪⌐ ╪┤┘ç╪▒┘è╪º┘ï:',
      idea_unit_econ_net_contribution: '╪╡╪º┘ü┘è ╪º┘ä┘à╪│╪º┘ç┘à╪⌐ ┘ä┘â┘ä ╪╖┘ä╪¿',
      idea_unit_econ_breakeven_orders: '╪╖┘ä╪¿╪º╪¬ ╪º┘ä╪¬╪╣╪º╪»┘ä ╪º┘ä╪┤┘ç╪▒┘è╪⌐',
      idea_unit_econ_daily_orders: '╪º┘ä╪╖┘ä╪¿╪º╪¬ ╪º┘ä┘è┘ê┘à┘è╪⌐ ╪º┘ä┘à╪╖┘ä┘ê╪¿╪⌐',
      idea_unit_econ_risk_none: '┘ç┘è┘â┘ä ┘ç┘ê╪º┘à╪┤ ╪╡╪¡┘è ╪╣┘å╪» ╪º┘ä┘à╪ñ╪┤╪▒╪º╪¬ ╪º┘ä╪¡╪º┘ä┘è╪⌐.',
      idea_compare_modal_title: '┘à┘é╪º╪▒┘å╪⌐ ╪¼┘ê┘ä╪º╪¬ ╪º┘ä╪¬┘é┘è┘è┘à (┘ü╪º╪▒┘é ╪º┘ä╪¼┘ê┘ä╪º╪¬)',
      idea_compare_modal_subtitle: '╪¬╪¬╪¿╪╣ ┘â┘è┘ü ╪¬╪╖┘ê╪▒ ┘é╪▒╪º╪▒ ╪º┘ä┘ä╪¼┘å╪⌐ ┘ê╪º┘ü╪¬╪▒╪º╪╢╪º╪¬┘ç╪º ┘ê╪«╪╖╪⌐ ╪º┘ä╪¬╪¡┘é┘é ╪¿╪╣╪» ╪»┘ü╪º╪╣┘â ┘ê┘à╪»╪«┘ä╪º╪¬┘â.',
      idea_compare_round_a: '╪º┘ä╪¼┘ê┘ä╪⌐ ╪º┘ä╪ú╪│╪º╪│┘è╪⌐:',
      idea_compare_round_b: '╪¼┘ê┘ä╪⌐ ╪º┘ä┘à┘é╪º╪▒┘å╪⌐:',
      idea_compare_verdict: '╪º┘ä┘é╪▒╪º╪▒ ╪º┘ä╪¬┘å┘ü┘è╪░┘è',
      idea_compare_assumptions: '╪¬╪╖┘ê╪▒ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢╪º╪¬',
      idea_compare_question: '╪º┘ä╪│╪ñ╪º┘ä ╪º┘ä┘à╪¡┘ê╪▒┘è ┘ä┘ä╪¡╪│┘à',
      idea_compare_validation: '╪¬╪»╪▒╪¼ ╪«╪╖╪⌐ ╪º┘ä╪¬╪¡┘é┘é',
      idea_compare_founder_defense: '╪»┘ü╪º╪╣ ┘ê╪¡╪¼╪¼ ╪º┘ä┘à╪ñ╪│╪│',
      idea_compare_no_rounds: '┘è┘ä╪▓┘à ╪¬┘ê┘ü╪▒ ╪¼┘ê┘ä╪¬┘è ╪¬┘é┘è┘è┘à ╪╣┘ä┘ë ╪º┘ä╪ú┘é┘ä ┘ä┘ä┘à┘é╪º╪▒┘å╪⌐.',
      idea_round_prefix: '╪º┘ä╪¼┘ê┘ä╪⌐',
      idea_round_initial: '╪º┘ä╪¼┘ê┘ä╪⌐ 1 (╪º┘ä╪¬┘é┘è┘è┘à ╪º┘ä╪ú┘ê┘ä┘è)',
      idea_round_viewing: '┘è╪¬┘à ╪º┘ä╪ó┘å ╪╣╪▒╪╢ ┘å╪¬╪º╪ª╪¼ ╪¬┘é┘è┘è┘à ╪º┘ä╪¼┘ê┘ä╪⌐',
      idea_round_founder_defense: '╪»┘ü┘ê╪╣ ┘ê┘à╪»╪«┘ä╪º╪¬ ╪º┘ä┘à╪ñ╪│╪│ ┘ä┘ä╪¼┘ê┘ä╪⌐:',
      idea_followup_title: '╪¼┘ê┘ä╪º╪¬ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ (3 ┘ä┘â┘ä ┘ü┘â╪▒╪⌐)',
      idea_followup_remaining: '╪º┘ä╪¼┘ê┘ä╪º╪¬ ╪º┘ä┘à╪¬╪¿┘é┘è╪⌐:',
      idea_btn_defend: '╪»╪º┘ü╪╣ ╪╣┘å ╪º┘ä┘ü┘â╪▒╪⌐',
      idea_btn_pivot: '╪º┘é╪¬╪▒╪¡ Pivot',
      idea_btn_val_plan: '╪«╪╖╪⌐ ╪¬╪¡┘é┘é ╪╡╪║┘è╪▒╪⌐',
      idea_btn_vote: '╪¬╪╡┘ê┘è╪¬ ╪º┘ä┘ä╪¼┘å╪⌐',
      idea_btn_compare: '┘é╪º╪▒┘å ╪¿┘à┘å╪º┘ü╪│',
      idea_btn_mvp: '╪«╪╖╪⌐ MVP ┘ä┘Ç 7 ╪ú┘è╪º┘à',
      idea_followup_prompt_placeholder: '╪º┘â╪¬╪¿ ╪¡╪¼╪¬┘â ╪º┘ä╪»┘ü╪º╪╣┘è╪⌐╪î ╪ú┘ê ╪º╪¬╪¼╪º┘ç ╪º┘ä┘Ç Pivot ╪º┘ä┘à┘é╪¬╪▒╪¡╪î ╪ú┘ê ╪│╪ñ╪º┘ä┘â ╪º┘ä┘à╪¡╪»╪» ┘ä┘ä╪¼┘å╪⌐...',
      idea_btn_start_followup: '╪¿╪»╪í ╪¼┘ê┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐',
      idea_followup_modal_title: '╪¼┘ê┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ ┘ê╪»┘ü╪º╪╣ ╪º┘ä┘ü┘â╪▒╪⌐',
      idea_followup_modal_subtitle: '┘é╪»┘æ┘à ╪¡╪¼╪¼╪º┘ï ┘ê╪ú╪»┘ä╪⌐ ┘ê╪▓┘ê╪º┘è╪º ╪º╪│╪¬╪▒╪º╪¬┘è╪¼┘è╪⌐ ╪¼╪»┘è╪»╪⌐ ┘ä╪¬┘ü┘å┘è╪» ╪┤┘â┘ê┘â ┘ê╪¬╪¡╪»┘è╪º╪¬ ╪ú╪╣╪╢╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐.',
      idea_followup_action_label: '┘ç╪»┘ü ╪º┘ä╪¼┘ê┘ä╪⌐ ┘ê┘å┘ê╪╣ ╪º┘ä╪¬╪¡╪▒┘â',
      idea_followup_chips_label: '╪▓┘ê╪º┘è╪º ╪º┘ä╪»┘ü╪º╪╣ ┘ê╪º┘ä┘à┘è╪▓╪º╪¬ ╪º┘ä╪º╪│╪¬╪▒╪º╪¬┘è╪¼┘è╪⌐ (╪º┘å┘é╪▒ ┘ä┘ä╪¬╪¡╪»┘è╪»)',
      idea_chip_pricing: '≡ƒÆ░ ╪¬╪│╪╣┘è╪▒ ┘ê┘à┘è╪▓╪⌐ ╪¬┘â┘ä┘ü╪⌐ ╪ú┘é┘ä',
      idea_chip_niche: '≡ƒÄ» ╪º╪│╪¬┘ç╪»╪º┘ü ╪┤╪▒┘è╪¡╪⌐ ┘å┘è╪¬╪┤ ┘à╪¡╪»╪»╪⌐',
      idea_chip_distribution: '≡ƒñ¥ ╪┤╪▒╪º┘â╪º╪¬ ┘ê┘é┘å┘ê╪º╪¬ ╪¬┘ê╪▓┘è╪╣ ╪¼╪º┘ç╪▓╪⌐',
      idea_chip_guarantee: '≡ƒ¢í∩╕Å ╪╢┘à╪º┘å ╪º╪│╪¬╪▒╪¼╪º╪╣ ╪ú┘ê ╪¬╪¼╪▒╪¿╪⌐ ┘à╪¼╪º┘å┘è╪⌐',
      idea_chip_speed: 'ΓÜí ╪¬╪¿╪│┘è╪╖ ╪º┘ä╪¡┘ä ┘ê╪¡╪░┘ü ╪º┘ä╪¬╪╣┘é┘è╪»',
      idea_chip_team: '≡ƒæÑ ┘ü╪▒┘è┘é ┘à╪¬╪«╪╡╪╡ ┘ê╪«╪¿╪▒╪⌐ ┘à┘è╪»╪º┘å┘è╪⌐',
      idea_chip_offline: '≡ƒôì ┘à┘ê┘é╪╣ ┘ü╪╣┘ä┘è ┘ê╪¬┘ê╪º╪¼╪» ┘à╪¡┘ä┘è ┘é┘ê┘è',
      idea_chip_inventory: '≡ƒôª ┘å┘à┘ê╪░╪¼ ╪ú┘ê┘ä┘è ╪¼╪º┘ç╪▓ ╪ú┘ê ╪¿╪╢╪º╪╣╪⌐ ┘à╪¬┘ê┘ü╪▒╪⌐',
      idea_followup_target_critic_label: '╪º┘ä┘å╪º┘é╪» ╪º┘ä┘à╪│╪¬┘ç╪»┘ü ╪¿╪º┘ä╪▒╪» ╪º┘ä╪ú╪│╪º╪│┘è',
      idea_critic_opt_all: '┘â╪º┘à┘ä ╪ú╪╣╪╢╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐',
      idea_critic_opt_customer: '╪º┘ä╪╣┘à┘è┘ä ╪º┘ä╪¿╪º╪▒╪» (╪¬╪▒╪»╪» ╪º┘ä╪┤╪▒╪º╪í ┘ê╪¬┘â┘ä┘ü╪⌐ ╪º┘ä╪¬╪¿╪»┘è┘ä)',
      idea_critic_opt_auditor: '╪º┘ä┘à╪»┘é┘é ╪º┘ä┘à╪º┘ä┘è ╪º┘ä╪╡╪º╪▒┘à (╪º┘ä╪Ñ┘è╪▒╪º╪»╪º╪¬ ┘ê╪º┘ä╪¼╪»┘ê┘ë)',
      idea_critic_opt_competitor: '╪º┘ä┘à┘å╪º┘ü╪│ ╪º┘ä╪┤╪▒╪│ (╪º┘ä╪¬┘à┘è╪▓ ┘ê╪¡┘ê╪º╪¼╪▓ ╪º┘ä╪»╪«┘ê┘ä)',
      idea_critic_opt_ops: '╪«╪¿┘è╪▒ ╪º┘ä╪╣┘à┘ä┘è╪º╪¬ ┘ê╪º┘ä╪¼╪»┘ê┘ë ╪º┘ä╪¬╪┤╪║┘è┘ä┘è╪⌐',
      idea_followup_review_mode_label: '╪ú╪│┘ä┘ê╪¿ ┘à╪▒╪º╪¼╪╣╪⌐ ╪º┘ä┘ä╪¼┘å╪⌐',
      idea_mode_opt_balanced: '╪¿┘å╪º╪í ┘ê╪╣┘à┘ä┘è ┘à┘ê╪¼┘ç ┘ä┘ä╪¡┘ä┘ê┘ä',
      idea_mode_opt_strict: '┘å┘é╪» ╪╡╪º╪▒┘à ┘ê╪º╪«╪¬╪¿╪º╪▒ ╪╢╪║╪╖ ┘à╪¬╪┤╪»╪»',
      idea_followup_defense_label: '╪¡╪¼╪¼┘â ╪º┘ä╪»┘ü╪º╪╣┘è╪⌐ ┘ê╪º┘ä╪¿┘è╪º┘å╪º╪¬ ┘ê╪º┘ä╪¬╪╣╪»┘è┘ä╪º╪¬ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐',
      idea_followup_evidence_label: '╪ú╪»┘ä╪⌐ ╪Ñ╪╢╪º┘ü┘è╪⌐╪î ╪ú╪▒┘é╪º┘à╪î ╪ú┘ê ╪º╪│┘à ┘à┘å╪º┘ü╪│ ┘à╪¡╪»╪» (╪º╪«╪¬┘è╪º╪▒┘è)',
      idea_followup_evidence_placeholder: '┘à╪½╪º┘ä: ╪¼┘à╪╣ 150 ╪╖┘ä╪¿╪º┘ï ┘à╪│╪¿┘é╪º┘ï╪î ╪▒╪º╪¿╪╖ ╪¿╪»┘è┘ä ┘ü┘è ╪º┘ä╪│┘ê┘é╪î ╪º╪¬┘ü╪º┘é ╪¬┘ê╪▒┘è╪» ┘à╪¡┘ä┘è...',
      idea_followup_submit_btn: '╪Ñ╪▒╪│╪º┘ä ┘ê╪¿╪»╪í ╪º┘ä╪¼┘ê┘ä╪⌐ ╪º┘ä╪¬┘ü╪º╪╣┘ä┘è╪⌐',
      idea_followup_err_empty: '┘è╪▒╪¼┘ë ┘â╪¬╪º╪¿╪⌐ ╪¡╪¼╪¬┘â ╪º┘ä╪»┘ü╪º╪╣┘è╪⌐ ╪ú┘ê ╪¬┘ü╪º╪╡┘è┘ä ╪«╪╖╪¬┘â ┘é╪¿┘ä ╪º┘ä╪Ñ╪▒╪│╪º┘ä.',
      idea_feedback_title: '┘ç┘ä ┘â╪º┘å ┘ç╪░╪º ╪º┘ä╪¬┘é┘è┘è┘à ┘à┘ü┘è╪»╪º┘ï ┘ä┘â╪ƒ',
      idea_btn_feedback_submit: '╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪¬┘é┘è┘è┘à',
      idea_disclaimer: '╪Ñ╪«┘ä╪º╪í ┘à╪│╪ñ┘ê┘ä┘è╪⌐: ┘ç╪░╪º ╪º┘ä╪¬┘é╪▒┘è╪▒ ╪ú╪»╪º╪⌐ ╪º╪│╪¬╪▒╪┤╪º╪»┘è╪⌐ ┘ä┘ä┘à╪│╪º╪╣╪»╪⌐ ┘ü┘è ╪º┘ä┘é╪▒╪º╪▒ ┘ê┘ä┘è╪│ ╪º╪│╪¬╪┤╪º╪▒╪⌐ ┘é╪º┘å┘ê┘å┘è╪⌐ ╪ú┘ê ┘à╪º┘ä┘è╪⌐ ┘à╪╣╪¬┘à╪»╪⌐.',
      idea_verdict_build: '╪º┘å╪╖┘ä┘é ┘ü┘è ╪º┘ä╪¿┘å╪º╪í (╪╢┘ê╪í ╪ú╪«╪╢╪▒)',
      idea_verdict_validate: '╪¬╪¡┘é┘é ╪ú┘ê┘ä╪º┘ï (╪╢┘ê╪í ╪ú╪╡┘ü╪▒)',
      idea_verdict_pivot: '╪Ñ╪╣╪º╪»╪⌐ ╪¬┘ê╪¼┘è┘ç (Pivot)',
      idea_verdict_do_not_build: '┘ä╪º ╪¬╪¿┘å┘É ╪º┘ä╪ó┘å (╪╢┘ê╪í ╪ú╪¡┘à╪▒)',
      idea_role_customer_advocate: '┘à╪¡╪º┘à┘è ╪º┘ä╪╣┘à┘è┘ä ╪º┘ä╪¿╪º╪▒╪»',
      idea_role_financial_auditor: '╪º┘ä┘à╪»┘é┘é ╪º┘ä┘à╪º┘ä┘è',
      idea_role_growth_marketer: '╪«╪¿┘è╪▒ ╪º┘ä╪¬┘ê╪▓┘è╪╣ ┘ê╪º┘ä┘å┘à┘ê',
      idea_role_direct_competitor: '╪º┘ä┘à┘å╪º┘ü╪│ ╪º┘ä╪┤╪▒╪│',
      idea_role_technical_architect: '╪º┘ä┘à┘ç┘å╪»╪│ ╪º┘ä╪¬┘é┘å┘è',
      idea_role_execution_risk_officer: '┘à╪│╪ñ┘ê┘ä ┘à╪«╪º╪╖╪▒ ╪º┘ä╪¬┘å┘ü┘è╪░',
      idea_role_monetization_strategist: '╪º╪│╪¬╪▒╪º╪¬┘è╪¼┘è ╪º┘ä╪¬╪│╪╣┘è╪▒ ┘ê╪º┘ä╪▒╪¿╪¡',
      idea_role_simplicity_editor: '┘à╪¡╪▒╪▒ ╪º┘ä╪¿╪│╪º╪╖╪⌐ ┘ê┘å╪╖╪º┘é MVP',
      idea_tb_cat_assumption: '┘ü╪▒╪╢┘è╪⌐',
      idea_tb_cat_market_fact: '╪¡┘é┘è┘é╪⌐ ╪│┘ê┘é┘è╪⌐',
      idea_tb_cat_validation_test: '╪º╪«╪¬╪¿╪º╪▒ ╪¬╪¡┘é┘é',
      idea_tb_cat_critical_risk: '╪«╪╖╪▒ ╪¼┘ê┘ç╪▒┘è',
      idea_tb_status_blocked: '┘à╪╣┘ä┘é',
      idea_action_resume: '╪º╪│╪¬┘â┘à╪º┘ä',
      idea_action_view: '╪╣╪▒╪╢ ╪º┘ä╪¬┘é╪▒┘è╪▒',
      idea_action_delete: '╪¡╪░┘ü',
      idea_msg_saved: '╪¬┘à ╪¡┘ü╪╕ ╪º┘ä┘à╪│┘ê╪»╪⌐',
      idea_msg_saving: '╪¼╪º╪▒┘è ╪º┘ä╪¡┘ü╪╕...',
      idea_msg_confirm_delete: '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪¡╪░┘ü ┘ç╪░┘ç ╪º┘ä┘ü┘â╪▒╪⌐╪ƒ',
      idea_msg_confirm_checkbox_req: '┘è╪▒╪¼┘ë ╪¬╪ú┘â┘è╪» ╪¿╪╖╪º┘é╪⌐ ╪º┘ä┘ü┘â╪▒╪⌐ ┘é╪¿┘ä ╪º╪│╪¬╪»╪╣╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐.',
      idea_msg_quota_exceeded: '╪¬┘à ╪º╪│╪¬┘ç┘ä╪º┘â ╪▒╪╡┘è╪» ╪º┘ä╪ú┘ü┘â╪º╪▒ ╪º┘ä╪┤┘ç╪▒┘è ╪¿╪º┘ä┘â╪º┘à┘ä (3 ╪ú┘ü┘â╪º╪▒ ╪┤┘ç╪▒┘è╪º┘ï).',
      idea_msg_card_saved: '╪¬┘à ╪¡┘ü╪╕ ╪¿╪╖╪º┘é╪⌐ ╪º┘ä┘ü┘â╪▒╪⌐.',
      idea_msg_followup_prompt: '╪ú╪»╪«┘ä ┘à┘ä╪º╪¡╪╕╪º╪¬┘â ╪ú┘ê ╪¡╪¼╪¬┘â ╪º┘ä╪»┘ü╪º╪╣┘è╪⌐ ┘ä╪¼┘ê┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐:',
      idea_msg_followup_success: '╪¬┘à ╪Ñ┘â┘à╪º┘ä ╪¼┘ê┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ ╪¿┘å╪¼╪º╪¡.',
      idea_status_draft: '┘à╪│┘ê╪»╪⌐',
      idea_status_structuring: '┘é┘è╪» ╪º┘ä╪╡┘è╪º╪║╪⌐',
      idea_status_awaiting_conf: '╪¿╪º┘å╪¬╪╕╪º╪▒ ╪º┘ä╪¬╪ú┘â┘è╪»',
      idea_status_queued: '┘é┘è╪» ╪º┘ä╪º┘å╪¬╪╕╪º╪▒',
      idea_status_running: '╪¼╪º╪▒┘ì ╪º┘ä╪¬╪¡┘ä┘è┘ä',
      idea_status_completed: '┘à┘â╪¬┘à┘ä',
      idea_status_partial: '┘à┘â╪¬┘à┘ä ╪¼╪▓╪ª┘è╪º┘ï',
      idea_status_failed: '┘ü╪┤┘ä'
    }
  };

  // Helper: Get JWT token from storage
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

  // Language translation handler
  function applyLanguage(lang) {
    currentLanguage = lang;
    localStorage.setItem('zainbot_lang', lang);

    const dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.setAttribute('dir', dir);
    document.documentElement.setAttribute('lang', lang);
    langToggleBtn.textContent = lang === 'ar' ? 'EN' : 'AR';

    // Translate all elements with data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang] && translations[lang][key]) {
        el.innerHTML = translations[lang][key];
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const key = element.getAttribute('data-i18n-placeholder');
      if (translations[lang] && translations[lang][key]) element.placeholder = translations[lang][key];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      const key = element.getAttribute('data-i18n-aria');
      if (translations[lang] && translations[lang][key]) element.setAttribute('aria-label', translations[lang][key]);
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
  }

  // Tab switching handler
  function switchTab(tabId) {
    activeTab = tabId;
    
    // Update active tab class in menu
    document.querySelectorAll('.menu-item').forEach(item => {
      item.classList.toggle('active', item.getAttribute('data-target') === tabId);
    });

    // Display appropriate content area
    document.querySelectorAll('.db-page').forEach(page => {
      page.classList.toggle('active', page.getAttribute('id') === tabId);
    });

    // Load data specific to this page
    if (tabId === 'page-overview') {
      loadOverviewData();
    } else if (tabId === 'page-agents') {
      loadAgents();
    } else if (tabId === 'page-idea-council') {
      loadIdeaCouncilData();
    } else if (tabId === 'page-inbox') {
      loadInboxData();
    } else if (tabId === 'page-training') {
      loadTrainingData();
    } else if (tabId === 'page-channels') {
      loadChannelsData();
    } else if (tabId === 'page-orders') {
      loadOrdersData();
    } else if (tabId === 'page-settings') {
      loadSettingsData();
      if (window.__zainbotRenderSettingsSummary) setTimeout(window.__zainbotRenderSettingsSummary, 80);
    } else if (tabId === 'page-admin') {
      loadAdminUsers();
      loadAdminKeys();
    }
  }

  // Initialize Language Toggle Event
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const nextLang = currentLanguage === 'en' ? 'ar' : 'en';
      applyLanguage(nextLang);
    });
  }

  function setMobileMenuOpen(open, restoreToggleFocus = false) {
    if (!sidebar || !menuMobileToggle) return;

    const shouldOpen = Boolean(open) && mobileSidebarMedia.matches;
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

    if (restoreToggleFocus) menuMobileToggle.focus();
  }

  // Sidebar navigation click
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.getAttribute('data-target');
      switchTab(target);
      setMobileMenuOpen(false);
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
  async function checkAuthAndLoad() {
    applyLanguage(currentLanguage);
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }

    try {
      // Fetch user profile info
      const res = await apiFetch('/api/users/profile');
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
            adminMenu.style.borderTop = '1px solid var(--glass-border)';
            adminMenu.style.marginTop = '12px';
            adminMenu.style.paddingTop = '16px';
          }
        }

        // Fetch bots list to pick active bot
        await loadBots();
      } else {
        window.location.href = '/login';
      }
    } catch (e) {
      console.error(e);
      window.location.href = '/login';
    }
  }

  async function loadBots() {
    try {
      const res = await apiFetch('/api/bots');
      const bots = (res && res.success) ? res.data : (Array.isArray(res) ? res : []);
      workspaceBots = bots;
      const preferredBotId = localStorage.getItem('zainbot_active_bot_id');
      currentBot = bots.find((bot) => String(bot._id) === preferredBotId) || bots[0] || null;
      if (currentBot) {
        // Inject data-bot-id inside chat snippet
        const widgetSnippetCode = document.getElementById('widgetSnippetCode');
        if (widgetSnippetCode) {
          widgetSnippetCode.textContent = `<script src="${window.location.origin}/widget.js" data-bot-id="${currentBot._id}"></script>`;
        }
        
        // Preload direct chat page link
        apiFetch(`/api/chat-page/bot/${currentBot._id}`).then(res => {
          if (res && (res.link || res.linkId)) {
            const url = res.link || `${window.location.origin}/chat/${res.linkId}`;
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
      }
    } catch (err) {
      console.error('Error loading bots:', err);
    }
  }

  // 1. OVERVIEW DATA LOADER
  async function loadOverviewData() {
    if (!currentBot) return;

    try {
      // Fetch stats
      const res = await apiFetch(`/api/analytics/summary?botId=${currentBot._id}`);
      if (res && res.success) {
        const stats = res.data;
        document.getElementById('statConversations').textContent = stats.conversationsCount || 0;
        document.getElementById('statMessages').textContent = stats.messagesCount || 0;
        document.getElementById('statTrainingRules').textContent = stats.activeRules || 0;
        document.getElementById('overviewOrders').textContent = stats.chatOrdersCount || 0;
      }

      const connectedChannels = [
        currentBot.whatsappApiKey,
        currentBot.facebookApiKey,
        currentBot.instagramApiKey,
        currentBot.telegramUserId,
      ].filter(Boolean).length;
      document.getElementById('statConnectedChannels').textContent = connectedChannels;
      document.getElementById('overviewActiveBot').textContent = currentBot.name || 'ΓÇö';
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
    }
  }

  // 2. OMNICHANNEL INBOX LOADER
  async function loadInboxData() {
    if (!currentBot) return;
    const chatListContainer = document.getElementById('chatListContainer');
    chatListContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Loading conversations...</div>';

    try {
      const res = await apiFetch(`/api/messages/conversations?botId=${currentBot._id}`);
      if (res && res.success && res.data.length > 0) {
        conversations = res.data;
        renderChatList();
      } else {
        chatListContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">${translations[currentLanguage].inbox_empty}</div>`;
      }
    } catch (e) {
      chatListContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--red);">Error loading feed.</div>';
    }
  }

  function renderChatList() {
    const chatListContainer = document.getElementById('chatListContainer');
    chatListContainer.innerHTML = '';

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
          ${chat.username ? chat.username.slice(0, 1).toUpperCase() : 'C'}
          <span class="chat-channel-badge" style="background:${channelColor};"><i class="${channelIcon}"></i></span>
        </div>
        <div class="chat-item-details" style="flex:1; min-width:0;">
          <div class="chat-item-name" style="display:flex; justify-content:space-between; align-items:center;">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(chat.username || 'Customer')}</span>
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

    document.getElementById('chatActiveUser').textContent = chat.username || 'Customer';
    document.getElementById('chatActiveChannel').textContent = chat.channel ? chat.channel.toUpperCase() : 'Web Chat';

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
  const chatReplyInput = document.getElementById('chatReplyInput');
  const chatSendBtn = document.getElementById('chatSendBtn');

  async function sendManualReply() {
    const text = chatReplyInput.value.trim();
    if (!text || !selectedConversationId) return;

    try {
      const res = await apiFetch(`/api/messages/reply`, {
        method: 'POST',
        body: JSON.stringify({
          conversationId: selectedConversationId,
          content: text
        })
      });

      if (res && res.success) {
        chatReplyInput.value = '';

        // Append manually
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
        if (res.delivered === false) {
          const note = document.createElement('div');
          note.style.cssText = 'font-size:11px; color:var(--text-muted); margin:-6px 0 12px 4px;';
          note.textContent = currentLanguage === 'ar'
            ? '╪¬┘à ╪¬╪│╪¼┘è┘ä ╪º┘ä╪▒╪» ┘ü┘è ╪º┘ä┘à╪¡╪º╪»╪½╪⌐╪î ┘ê┘ä┘à ┘è╪¬┘à ╪Ñ╪▒╪│╪º┘ä┘ç ╪╣╪¿╪▒ ╪º┘ä┘é┘å╪º╪⌐ ╪¿╪╣╪».'
            : 'Reply saved to the conversation, not yet sent via the channel.';
          msgContainer.appendChild(bubbleRow);
          msgContainer.appendChild(note);
        } else {
          msgContainer.appendChild(bubbleRow);
        }
        msgContainer.scrollTop = msgContainer.scrollHeight;
      }
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
      const res = await apiFetch(`/api/bots/${currentBot._id}`);
      if (res && res.success) {
        document.getElementById('botWelcomeMessage').value = res.data.welcomeMessage || '';
        document.getElementById('botCustomPrompt').value = res.data.customInstructions || '';
      }

      // Get FAQs (type qa only)
      const faqRes = await apiFetch(`/api/rules?botId=${currentBot._id}&type=qa`);
      if (faqRes && faqRes.success) {
        faqs = faqRes.data;
        renderFaqs();
      } else if (faqRes && Array.isArray(faqRes.rules)) {
        // fallback for bare {rules} shape
        faqs = faqRes.rules;
        renderFaqs();
      }

      // Get general agent instructions (legacy "╪╣╪º┘à╪⌐" rules ΓÇö bot identity)
      const instrRes = await apiFetch(`/api/rules?botId=${currentBot._id}&type=general`);
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
      const preview = raw.length > 120 ? raw.slice(0, 120) + 'ΓÇª' : raw;

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

  document.getElementById('addInstructionBtn')?.addEventListener('click', () => {
    document.getElementById('instructionModalTitle').textContent = currentLanguage === 'ar' ? '╪Ñ╪╢╪º┘ü╪⌐ ╪¬╪╣┘ä┘è┘à╪º╪¬ ╪╣╪º┘à╪⌐' : 'Add General Instruction';
    document.getElementById('instructionIdInput').value = '';
    document.getElementById('instructionContentInput').value = '';
    instructionModal?.classList.add('active');
  });

  instructionModal?.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => instructionModal.classList.remove('active'));
  });

  if (instructionForm) {
    instructionForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = document.getElementById('instructionContentInput').value.trim();
      if (!content) return;
      const instrId = document.getElementById('instructionIdInput').value;
      const url = instrId ? `/api/rules/${instrId}` : '/api/rules';
      const method = instrId ? 'PUT' : 'POST';
      try {
        const payload = instrId ? { content } : { botId: currentBot._id, type: 'general', content };
        const res = await apiFetch(url, { method, body: JSON.stringify(payload) });
        if (res && res.success) {
          instructionModal.classList.remove('active');
          loadTrainingData();
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  window.editInstruction = function(id) {
    const rule = generalInstructions.find(r => r._id === id);
    if (!rule) return;
    const raw = typeof rule.content === 'string' ? rule.content : (rule.content?.value || '');
    document.getElementById('instructionModalTitle').textContent = currentLanguage === 'ar' ? '╪¬╪╣╪»┘è┘ä ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬ ╪º┘ä╪╣╪º┘à╪⌐' : 'Edit General Instruction';
    document.getElementById('instructionIdInput').value = rule._id;
    document.getElementById('instructionContentInput').value = raw;
    instructionModal?.classList.add('active');
  };

  window.deleteInstruction = async function(id) {
    if (!confirm(currentLanguage === 'ar' ? '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪¡╪░┘ü ┘ç╪░┘ç ╪º┘ä╪¬╪╣┘ä┘è┘à╪º╪¬╪ƒ' : 'Are you sure you want to delete this instruction?')) return;
    try {
      const res = await apiFetch(`/api/rules/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        loadTrainingData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // FAQ Forms submission
  const faqForm = document.getElementById('faqForm');
  const faqModal = document.getElementById('faqModal');

  if (faqForm) {
    faqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const question = document.getElementById('faqQuestionInput').value.trim();
      const answer = document.getElementById('faqAnswerInput').value.trim();
      const faqId = document.getElementById('faqIdInput').value;

      const url = faqId ? `/api/rules/${faqId}` : '/api/rules';
      const method = faqId ? 'PUT' : 'POST';

      try {
        const res = await apiFetch(url, {
          method,
          body: JSON.stringify({
            botId: currentBot._id,
            type: 'qa',
            content: { question, answer }
          })
        });

        if (res && res.success) {
          faqModal.classList.remove('active');
          loadTrainingData();
        }
      } catch (err) {
        console.error(err);
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

      try {
        const res = await apiFetch(`/api/bots/${currentBot._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            welcomeMessage,
            customInstructions
          })
        });
        if (res && res.success) {
          alert(currentLanguage === 'ar' ? '╪¬┘à ╪º┘ä╪¡┘ü╪╕ ╪¿┘å╪¼╪º╪¡!' : 'Settings saved successfully!');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // 4. CONNECTIONS LOADER
  async function loadChannelsData() {
    if (!currentBot) return;
    
    try {
      const res = await apiFetch(`/api/bots/${currentBot._id}`);
      if (res && res.success) {
        const bot = res.data;
        // WhatsApp status
        const cardWa = document.getElementById('channel-card-whatsapp');
        cardWa.className = `glass-card channel-card ${bot.whatsappApiKey ? 'connected' : 'available'}`;

        // Facebook status
        const cardFb = document.getElementById('channel-card-facebook');
        cardFb.className = `glass-card channel-card ${bot.facebookApiKey ? 'connected' : 'available'}`;

        // Instagram status
        const cardIg = document.getElementById('channel-card-instagram');
        cardIg.className = `glass-card channel-card ${bot.instagramApiKey ? 'connected' : 'available'}`;

        // Telegram status
        const cardTg = document.getElementById('channel-card-telegram');
        cardTg.className = `glass-card channel-card ${bot.telegramUserId ? 'connected' : 'available'}`;
      }
    } catch (e) {
      console.error(e);
    }
  }

  // E-commerce Store Connector Form
  const storeConnectorForm = document.getElementById('storeConnectorForm');
  if (storeConnectorForm) {
    storeConnectorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const provider = document.getElementById('storeProvider')?.value || 'none';
      const feedbackEl = document.getElementById('storeConnectorFeedback');

      if (feedbackEl) {
        feedbackEl.style.display = 'block';
        if (provider === 'none') {
          feedbackEl.style.background = 'rgba(255, 255, 255, 0.05)';
          feedbackEl.style.border = '1px solid var(--glass-border)';
          feedbackEl.style.color = 'var(--text-muted)';
          feedbackEl.textContent = currentLanguage === 'ar' ? '╪¬┘à ╪º╪«╪¬┘è╪º╪▒ ╪╣╪»┘à ╪º┘ä╪▒╪¿╪╖.' : 'No platform selected.';
        } else {
          feedbackEl.style.background = 'rgba(16, 185, 129, 0.1)';
          feedbackEl.style.border = '1px solid var(--green)';
          feedbackEl.style.color = 'var(--green)';
          feedbackEl.textContent = translations[currentLanguage]?.store_sync_feedback || 'Store catalog sync configured.';
        }
      }
    });
  }

  // 5. ORDERS & APPOINTMENTS LOADER
  let ordersList = [];
  let bookingsList = [];
  let notificationRecipientsList = [];

  async function loadOrdersData() {
    if (!currentBot) return;

    try {
      const [orderRes, bookingRes] = await Promise.all([
        apiFetch(`/api/chat-orders?botId=${currentBot._id}`),
        apiFetch(`/api/bookings?botId=${currentBot._id}`)
      ]);

      if (orderRes && orderRes.success) {
        ordersList = orderRes.data || [];
      } else {
        ordersList = [];
      }

      if (bookingRes && bookingRes.success) {
        bookingsList = bookingRes.data || [];
      } else {
        bookingsList = [];
      }

      updateOrdersAndBookingsKPIs();
      renderOrders();
      renderBookings();
    } catch (e) {
      console.error('loadOrdersData_error', e);
    }
  }

  function updateOrdersAndBookingsKPIs() {
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
    if (elOrderBadge) elOrderBadge.textContent = `${totalOrders} ${currentLanguage === 'ar' ? '╪╖┘ä╪¿' : 'Orders'}`;
    const elBookingBadge = document.getElementById('bookingsCountBadge');
    if (elBookingBadge) elBookingBadge.textContent = `${totalBookings} ${currentLanguage === 'ar' ? '┘à┘ê╪╣╪»' : 'Appointments'}`;
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
      ordersTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${t.orders_empty || 'No orders generated yet.'}</td></tr>`;
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
        <td><strong>${order.totalAmount ? Number(order.totalAmount).toLocaleString() + ' EGP' : '-'}</strong></td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td style="text-align:center;">
          <div style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:center;">
            ${order.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="window.changeOrderStatus('${order._id}', 'confirmed')" title="${t.action_confirm}"><i class="fas fa-check"></i></button>` : ''}
            ${order.status === 'confirmed' ? `<button class="btn btn-sm btn-info" onclick="window.changeOrderStatus('${order._id}', 'shipped')" title="Ship"><i class="fas fa-shipping-fast"></i></button>` : ''}
            ${order.status === 'shipped' ? `<button class="btn btn-sm btn-success" onclick="window.changeOrderStatus('${order._id}', 'delivered')" title="Delivered"><i class="fas fa-box-check"></i></button>` : ''}
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
      bookingsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">${t.bookings_empty || 'No appointments scheduled yet.'}</td></tr>`;
      return;
    }

    filtered.forEach(booking => {
      const row = document.createElement('tr');
      let badgeClass = 'badge-warning';
      if (booking.status === 'confirmed') badgeClass = 'badge-success';
      if (booking.status === 'completed') badgeClass = 'badge-info';
      if (booking.status === 'rescheduled') badgeClass = 'badge-purple';
      if (booking.status === 'cancelled') badgeClass = 'badge-danger';

      const dateStr = booking.bookingDate ? new Date(booking.bookingDate).toLocaleString(currentLanguage === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'N/A';

      const statusLabel = t[`status_${booking.status}`] || booking.status;

      row.innerHTML = `
        <td style="font-family:monospace; font-weight:600;">#${booking._id.slice(-6).toUpperCase()}</td>
        <td><strong>${escapeHtml(booking.customerName || 'Customer')}</strong></td>
        <td>${escapeHtml(booking.customerPhone || 'N/A')}</td>
        <td><span class="badge" style="background:rgba(6, 182, 212, 0.15); color:var(--cyan); border:1px solid rgba(6,182,212,0.3);">${escapeHtml(booking.serviceType || '┘à┘ê╪╣╪» / ╪º╪│╪¬╪┤╪º╪▒╪⌐')}</span></td>
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

  // Quick Action Handlers for Bookings
  window.changeBookingStatus = async function(bookingId, status) {
    try {
      const res = await apiFetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (res && res.success) {
        await loadOrdersData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.deleteBooking = async function(bookingId) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.delete_booking_confirm || 'Are you sure you want to delete this appointment?')) return;
    try {
      const res = await apiFetch(`/api/bookings/${bookingId}`, { method: 'DELETE' });
      if (res && res.success) {
        await loadOrdersData();
      }
    } catch (e) {
      console.error(e);
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
  };

  // Quick Action Handlers for Orders
  window.changeOrderStatus = async function(orderId, status) {
    try {
      const res = await apiFetch(`/api/chat-orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (res && res.success) {
        await loadOrdersData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.deleteOrder = async function(orderId) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.delete_order_confirm || 'Are you sure you want to delete this order?')) return;
    try {
      const res = await apiFetch(`/api/chat-orders/${orderId}`, { method: 'DELETE' });
      if (res && res.success) {
        await loadOrdersData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.openOrderModal = function(orderId = null) {
    const modal = document.getElementById('chatOrderModal');
    if (!modal) return;
    const form = document.getElementById('chatOrderForm');
    form.reset();

    const t = translations[currentLanguage] || translations.en;
    document.getElementById('chatOrderIdInput').value = orderId || '';
    document.getElementById('chatOrderModalTitle').innerHTML = `<i class="fas fa-shopping-cart"></i> ${orderId ? t.chat_order_modal_title : t.btn_new_order}`;

    if (orderId) {
      const order = ordersList.find(o => o._id === orderId);
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
    }
    modal.classList.add('active');
  };

  // Setup Booking Form Submit
  const bookingForm = document.getElementById('bookingForm');
  if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('bookingIdInput').value;
      const t = translations[currentLanguage] || translations.en;

      const payload = {
        botId: currentBot._id,
        customerName: document.getElementById('bookingCustomerName').value.trim(),
        customerPhone: document.getElementById('bookingCustomerPhone').value.trim(),
        serviceType: document.getElementById('bookingServiceType').value.trim() || '╪º╪│╪¬╪┤╪º╪▒╪⌐ / ┘à┘ê╪╣╪»',
        bookingDate: new Date(document.getElementById('bookingDateTime').value).toISOString(),
        slotDurationMinutes: parseInt(document.getElementById('bookingDuration').value) || 30,
        status: document.getElementById('bookingStatusSelect').value,
        notes: document.getElementById('bookingNotes').value.trim(),
      };

      try {
        const url = id ? `/api/bookings/${id}` : '/api/bookings';
        const method = id ? 'PUT' : 'POST';
        const res = await apiFetch(url, { method, body: JSON.stringify(payload) });

        if (res && res.success) {
          document.getElementById('bookingModal')?.classList.remove('active');
          alert(t.booking_saved_ok || 'Appointment saved successfully!');
          await loadOrdersData();
        } else {
          alert(res?.message || 'Error saving appointment');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Setup Order Form Submit
  const chatOrderForm = document.getElementById('chatOrderForm');
  if (chatOrderForm) {
    chatOrderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('chatOrderIdInput').value;
      const t = translations[currentLanguage] || translations.en;

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
        notes: document.getElementById('orderCustomerNote').value.trim(),
      };

      try {
        const url = id ? `/api/chat-orders/${id}` : '/api/chat-orders';
        const method = id ? 'PUT' : 'POST';
        const res = await apiFetch(url, { method, body: JSON.stringify(payload) });

        if (res && res.success) {
          document.getElementById('chatOrderModal')?.classList.remove('active');
          alert(t.order_saved_ok || 'Order saved successfully!');
          await loadOrdersData();
        } else {
          alert(res?.message || 'Error saving order');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Toolbar & Filter Event Listeners
  document.getElementById('createBookingBtn')?.addEventListener('click', () => window.openBookingModal());
  document.getElementById('createOrderBtn')?.addEventListener('click', () => window.openOrderModal());
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
    document.getElementById('bookingModal')?.classList.remove('active');
  }));
  document.querySelectorAll('.order-modal-close').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById('chatOrderModal')?.classList.remove('active');
  }));
  document.querySelectorAll('.recipient-modal-close').forEach(btn => btn.addEventListener('click', () => {
    document.getElementById('recipientModal')?.classList.remove('active');
  }));

  // ==================== NOTIFICATION RECIPIENTS SECTION ====================
  async function loadNotificationRecipients() {
    if (!currentBot) return;
    try {
      const res = await apiFetch(`/api/notifications/recipients?botId=${currentBot._id}`);
      if (res && res.success) {
        notificationRecipientsList = res.data || [];
        renderNotificationRecipients();
      }
    } catch (e) {
      console.error('loadNotificationRecipients_error', e);
    }
  }

  function renderNotificationRecipients() {
    const tbody = document.getElementById('notificationRecipientsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const t = translations[currentLanguage] || translations.en;

    if (notificationRecipientsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">${t.recipients_empty || 'No notification channels connected yet.'}</td></tr>`;
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
        <td><span class="badge ${rec.isActive !== false ? 'badge-success' : 'badge-danger'}">${rec.isActive !== false ? (t.admin_active || 'Active') : (t.admin_suspended || 'Disabled')}</span></td>
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

  window.openRecipientModal = function() {
    const modal = document.getElementById('recipientModal');
    if (!modal) return;
    document.getElementById('recipientForm').reset();
    document.getElementById('recipientIdInput').value = '';
    modal.classList.add('active');
  };

  window.testNotificationRecipient = async function(id) {
    const t = translations[currentLanguage] || translations.en;
    try {
      const res = await apiFetch(`/api/notifications/recipients/${id}/test`, { method: 'POST' });
      if (res && res.success) {
        alert(t.recipient_test_sent || 'Test notification sent successfully!');
      } else {
        alert(res?.message || 'Failed to send test notification');
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.deleteNotificationRecipient = async function(id) {
    const t = translations[currentLanguage] || translations.en;
    if (!confirm(t.delete_recipient_confirm || 'Are you sure you want to remove this notification channel?')) return;
    try {
      const res = await apiFetch(`/api/notifications/recipients/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        await loadNotificationRecipients();
      }
    } catch (e) {
      console.error(e);
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

      try {
        const res = await apiFetch('/api/notifications/recipients', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.success) {
          document.getElementById('recipientModal')?.classList.remove('active');
          alert(t.recipient_saved_ok || 'Notification channel saved successfully!');
          await loadNotificationRecipients();
        } else {
          alert(res?.message || 'Could not save recipient channel');
        }
      } catch (err) {
        console.error(err);
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
        const fallbackList = ['┘à╪º ┘ç┘è ╪º┘ä┘à┘å╪¬╪¼╪º╪¬ ┘ê╪º┘ä╪╣╪▒┘ê╪╢ ╪º┘ä┘à╪¬┘ê┘ü╪▒╪⌐╪ƒ', '┘â┘è┘ü ┘è┘à┘â┘å┘å┘è ╪¡╪¼╪▓ ┘à┘ê╪╣╪»╪ƒ'];
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

    modal.classList.add('active');
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

  document.querySelectorAll('.chat-page-modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('chatPageModal')?.classList.remove('active');
    });
  });

  const chatModalEl = document.getElementById('chatPageModal');
  if (chatModalEl) {
    chatModalEl.addEventListener('click', (e) => {
      if (e.target === chatModalEl) {
        chatModalEl.classList.remove('active');
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
          document.getElementById('chatPageModal')?.classList.remove('active');
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

  async function loadSettingsData() {
    if (!currentBot) return;

    try {
      // Load keys
      const keysRes = await apiFetch('/api/integrations/keys');
      if (keysRes && keysRes.success) {
        devApiKeys = keysRes.data;
        renderApiKeys();
      }

      // Load webhooks config
      const whRes = await apiFetch(`/api/integrations/webhooks?botId=${currentBot._id}`);
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

      // Load webhook logs history
      const logsRes = await apiFetch(`/api/integrations/webhooks/logs?botId=${currentBot._id}`);
      if (logsRes && logsRes.success) {
        webhookLogs = logsRes.data;
        renderWebhookLogs();
      }

      // Load backup key settings
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
    } catch (e) {
      console.error(e);
    }
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
          <span style="font-size:11px; color:var(--text-muted);">Created: ${new Date(key.createdAt).toLocaleDateString()}</span>
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
      const statusText = log.responseStatus ? log.responseStatus : 'TIMEOUT/ERROR';

      row.innerHTML = `
        <td>${new Date(log.timestamp).toLocaleString()}</td>
        <td><code>${log.event}</code></td>
        <td>${log.url}</td>
        <td><span class="badge ${badge}">${statusText}</span></td>
        <td><button class="btn btn-secondary btn-sm" onclick="retryWebhook('${log._id}')" style="padding:4px 8px;"><i class="fas fa-redo"></i> Retry</button></td>
      `;
      tableBody.appendChild(row);
    });
  }

  // Generate Dev Key Event
  const generateKeyBtn = document.getElementById('generateKeyBtn');
  if (generateKeyBtn) {
    generateKeyBtn.addEventListener('click', async () => {
      const name = prompt(currentLanguage === 'ar' ? '╪ú╪»╪«┘ä ╪º╪│┘à╪º┘ï ┘ä┘à┘ü╪¬╪º╪¡ ╪º┘ä┘ê╪╡┘ê┘ä:' : 'Enter a name for the access key:');
      if (!name) return;

      try {
        const res = await apiFetch('/api/integrations/keys', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
        if (res && res.success) {
          alert(`${currentLanguage === 'ar' ? '╪¬┘à ╪Ñ┘å╪┤╪º╪í ╪º┘ä┘à┘ü╪¬╪º╪¡ ╪¿┘å╪¼╪º╪¡! ┘à┘ü╪¬╪º╪¡ ╪º┘ä┘ê╪╡┘ê┘ä ╪º┘ä╪«╪º╪╡ ╪¿┘â ┘ç┘ê (┘è╪▒╪¼┘ë ┘å╪│╪«┘ç ╪º┘ä╪ó┘å ┘ü┘ä┘å ╪¬╪¬┘à┘â┘å ┘à┘å ╪▒╪ñ┘è╪¬┘ç ┘à╪¼╪»╪»╪º┘ï):' : 'Key generated successfully! Your access key is (Please copy it now, you will not see it again):'}\n\n${res.data.key}`);
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
          alert(currentLanguage === 'ar' ? '╪¬┘à ╪¡┘ü╪╕ ╪Ñ╪╣╪»╪º╪»╪º╪¬ ╪º┘ä┘ê┘è╪¿ ┘ç┘ê┘â ╪¿┘å╪¼╪º╪¡!' : 'Webhook settings saved successfully!');
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
          alert(currentLanguage === 'ar' ? '╪¬┘à ╪¡┘ü╪╕ ┘à┘ü╪¬╪º╪¡ ╪º┘ä╪╖┘ê╪º╪▒╪ª ╪¿┘å╪¼╪º╪¡!' : 'Backup key settings saved successfully!');
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  // 7. SUPER ADMIN CONTROL CENTER & USERS MANAGEMENT
  let adminUsersList = [];
  let adminKeys = [];

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
      tbody.innerHTML = `<tr><td colspan="7" style="padding:24px; text-align:center; color:var(--text-muted);">${isAr ? '┘ä╪º ┘è┘ê╪¼╪» ┘à╪│╪¬╪«╪»┘à┘è┘å ┘à╪│╪¼┘ä┘è┘å ╪¡╪º┘ä┘è╪º┘ï.' : 'No users registered yet.'}</td></tr>`;
      return;
    }

    adminUsersList.forEach((u) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--glass-border)';

      const roleBadge = u.role === 'superadmin'
        ? `<span class="badge" style="background:var(--orange); color:#000; font-weight:700;">${isAr ? '┘à╪»┘è╪▒ ╪╣╪º┘à (SuperAdmin)' : 'Super Admin'}</span>`
        : `<span class="badge" style="background:var(--blue); color:#fff;">${isAr ? '╪¬╪º╪¼╪▒ / ┘à╪│╪¬╪«╪»┘à' : 'Merchant / User'}</span>`;

      const statusBadge = u.status === 'suspended'
        ? `<span class="badge badge-danger">${isAr ? '┘à┘ê┘é┘ê┘ü' : 'Suspended'}</span>`
        : `<span class="badge badge-success">${isAr ? '┘å╪┤╪╖' : 'Active'}</span>`;

      const botsCount = Array.isArray(u.bots) ? u.bots.length : 0;
      const botUnitText = isAr ? '╪¿┘ê╪¬' : 'Bot(s)';

      const suspendText = u.status === 'suspended' 
        ? (isAr ? '<i class="fas fa-check"></i> ╪¬┘ü╪╣┘è┘ä' : '<i class="fas fa-check"></i> Activate')
        : (isAr ? '<i class="fas fa-ban" style="color:var(--red);"></i> ╪¬╪╣┘ä┘è┘é' : '<i class="fas fa-ban" style="color:var(--red);"></i> Suspend');

      const impersonateText = isAr ? '<i class="fas fa-user-secret"></i> ╪»╪«┘ê┘ä ┘â┘Ç' : '<i class="fas fa-user-secret"></i> Login As';

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
    if (!confirm(`┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪¬╪║┘è┘è╪▒ ╪¡╪º┘ä╪⌐ ╪º┘ä╪¬╪º╪¼╪▒/╪º┘ä┘à╪│╪¬╪«╪»┘à ╪Ñ┘ä┘ë ${newStatus === 'active' ? '┘å╪┤╪╖' : '┘à┘ê┘é┘ê┘ü'}╪ƒ`)) return;
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      loadAdminUsers();
    } catch (e) {
      alert('┘ü╪┤┘ä ╪¬╪¡╪»┘è╪½ ╪¡╪º┘ä╪⌐ ╪º┘ä┘à╪│╪¬╪«╪»┘à');
    }
  };

  window.impersonateUser = async function(userId) {
    if (!confirm('┘ç┘ä ╪¬╪▒┘è╪» ╪º┘ä╪º┘å╪¬┘é╪º┘ä ╪º┘ä┘ü┘ê╪▒┘è ┘ê╪º┘ä╪»╪«┘ê┘ä ╪º┘ä┘à╪¿╪º╪┤╪▒ ╪Ñ┘ä┘ë ╪¡╪│╪º╪¿ ┘ç╪░╪º ╪º┘ä╪¬╪º╪¼╪▒ ┘ä╪¬╪╡┘ü╪¡ ┘ê╪Ñ╪»╪º╪▒╪⌐ ╪¿┘ê╪¬╪º╪¬┘ç ┘ê┘é┘å┘ê╪º╪¬┘ç╪ƒ')) return;
    try {
      const res = await apiFetch('/api/admin/impersonation/sessions', {
        method: 'POST',
        body: JSON.stringify({ subjectUserId: userId })
      });
      if (res && res.token) {
        localStorage.setItem('token', res.token);
        alert('╪¬┘à ╪»╪«┘ê┘ä ╪¡╪│╪º╪¿ ╪º┘ä╪¬╪º╪¼╪▒ ╪¿┘å╪¼╪º╪¡! ╪¼╪º╪▒┘è ╪¬╪¡┘à┘è┘ä ┘ä┘ê╪¡╪¬┘ç...');
        window.location.reload();
      } else {
        alert(res?.message || '┘ü╪┤┘ä ╪º┘ä╪º┘å╪¬╪¡╪º┘ä ╪º┘ä┘à╪¿╪º╪┤╪▒');
      }
    } catch (e) {
      alert('╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪º┘ä┘à╪╡╪º╪»┘é╪⌐');
    }
  };

  // Real admin controls replace the legacy table renderer above. They use DOM
  // nodes for user data so a username or email can never become HTML markup.
  const adminUsersPageState = { page: 1, pages: 1, total: 0, limit: 25 };
  const adminUserModal = document.getElementById('adminUserModal');
  const impersonationModal = document.getElementById('impersonationModal');
  const adminCopy = (arabic, english) => currentLanguage === 'ar' ? arabic : english;

  function adminCell(row, value, style = '') {
    const cell = document.createElement('td');
    cell.style.cssText = `padding:12px;${style}`;
    cell.textContent = value || 'ΓÇö';
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
    document.getElementById('accountMenuName').textContent = currentUser.username || 'ΓÇö';
    document.getElementById('accountMenuEmail').textContent = currentUser.email || 'ΓÇö';
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
    const tier = currentUser?.subscriptionTier || 'free';
    const limit = clientAgentLimit(tier);
    entitlement.textContent = `${workspaceBots.length} / ${limit === Infinity ? 'Γê₧' : limit} ${currentLanguage === 'ar' ? '┘ê┘â┘ä╪º╪í ┘à╪│╪¬╪«╪»┘à┘ê┘å ┘ü┘è ╪¿╪º┘é╪⌐' : 'agents used on'} ${tier}`;
    list.replaceChildren();
    workspaceBots.forEach((bot) => {
      const card = document.createElement('article');
      card.className = 'glass-card';
      card.style.padding = '18px';
      const title = document.createElement('h3');
      title.textContent = bot.name;
      title.style.marginBottom = '6px';
      const meta = document.createElement('p');
      meta.textContent = `${String(bot.agentType || 'customer_support').replaceAll('_', ' ')} ┬╖ ${bot.autoReplyEnabled === false ? (currentLanguage === 'ar' ? '╪º┘ä╪▒╪» ╪º┘ä╪ó┘ä┘è ┘à╪¬┘ê┘é┘ü' : 'Auto-reply off') : (currentLanguage === 'ar' ? '╪º┘ä╪▒╪» ╪º┘ä╪ó┘ä┘è ┘è╪╣┘à┘ä' : 'Auto-reply on')}`;
      meta.style.cssText = 'font-size:12px; color:var(--text-muted); margin-bottom:12px;';
      const description = document.createElement('p');
      description.textContent = bot.description || bot.welcomeMessage || (currentLanguage === 'ar' ? '┘ä╪º ┘è┘ê╪¼╪» ┘ê╪╡┘ü ╪¿╪╣╪».' : 'No description yet.');
      description.style.cssText = 'font-size:13px; color:var(--text-muted); min-height:40px;';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;';
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'btn btn-secondary btn-sm'; select.textContent = String(currentBot?._id) === String(bot._id) ? (currentLanguage === 'ar' ? '╪º┘ä┘ê┘â┘è┘ä ╪º┘ä╪¡╪º┘ä┘è' : 'Current agent') : (currentLanguage === 'ar' ? '╪º╪│╪¬╪«╪»╪º┘à ┘ç╪░╪º ╪º┘ä┘ê┘â┘è┘ä' : 'Use this agent');
      select.disabled = String(currentBot?._id) === String(bot._id);
      select.addEventListener('click', () => refreshActiveBot(bot));
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm'; edit.textContent = currentLanguage === 'ar' ? '╪¬╪╣╪»┘è┘ä' : 'Edit'; edit.addEventListener('click', () => openAgentModal(bot));
      const chatBtn = document.createElement('button');
      chatBtn.type = 'button'; chatBtn.className = 'btn btn-primary btn-sm'; chatBtn.innerHTML = `<i class="fas fa-comments"></i> ${currentLanguage === 'ar' ? '╪¬╪«╪╡┘è╪╡ ┘ê╪»╪▒╪»╪┤╪⌐' : 'Customize & Chat'}`;
      chatBtn.addEventListener('click', () => window.openChatPageModal(bot));
      actions.append(select, edit, chatBtn); card.append(title, meta, description, actions); list.appendChild(card);
    });
    if (workspaceBots.length === 0) {
      const empty = document.createElement('div'); empty.className = 'glass-card'; empty.textContent = currentLanguage === 'ar' ? '╪ú┘å╪┤╪ª ┘ê┘â┘è┘ä┘â ╪º┘ä╪ú┘ê┘ä ┘ä┘ä╪¿╪»╪í.' : 'Create your first agent to begin.'; list.appendChild(empty);
    }
  }

  async function loadAgents() {
    await loadBots();
    renderAgents();
    if (window.__zainbotRenderSettingsSummary) setTimeout(window.__zainbotRenderSettingsSummary, 60);
  }

  function enforceToolAndSkillTierLimits() {
    const isFree = !currentUser?.subscriptionTier || currentUser.subscriptionTier === 'free';
    if (!isFree) return;

    // 1. Tool Checkboxes Limit (Max 2 for free)
    const toolCheckboxes = [
      document.getElementById('agentToolBooking'),
      document.getElementById('agentToolOrders'),
      document.getElementById('agentToolWhatsapp'),
      document.getElementById('agentToolTelegram')
    ].filter(Boolean);

    const checkedTools = toolCheckboxes.filter(chk => chk.checked);
    const toolsMaxReached = checkedTools.length >= 2;

    toolCheckboxes.forEach(chk => {
      if (!chk.checked) {
        chk.disabled = toolsMaxReached;
        if (chk.parentElement) {
          chk.parentElement.style.opacity = toolsMaxReached ? '0.45' : '1';
          chk.parentElement.style.cursor = toolsMaxReached ? 'not-allowed' : 'pointer';
          chk.parentElement.title = toolsMaxReached ? (currentLanguage === 'ar' ? '╪º┘ä╪¡╪» ╪º┘ä╪ú┘é╪╡┘ë ┘ü┘è ╪º┘ä╪¿╪º┘é╪⌐ ╪º┘ä┘à╪¼╪º┘å┘è╪⌐: ╪ú╪»╪º╪¬╪º┘å ┘ü┘é╪╖' : 'Free plan limit: 2 tools max') : '';
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

    // 2. Skill Checkboxes Limit (Max 2 for free)
    const skillCheckboxes = Array.from(document.querySelectorAll('input[name="agentSkill"]'));
    const checkedSkills = skillCheckboxes.filter(chk => chk.checked);
    const skillsMaxReached = checkedSkills.length >= 2;

    skillCheckboxes.forEach(chk => {
      if (!chk.checked) {
        chk.disabled = skillsMaxReached;
        if (chk.parentElement) {
          chk.parentElement.style.opacity = skillsMaxReached ? '0.45' : '1';
          chk.parentElement.style.cursor = skillsMaxReached ? 'not-allowed' : 'pointer';
          chk.parentElement.title = skillsMaxReached ? (currentLanguage === 'ar' ? '╪º┘ä╪¡╪» ╪º┘ä╪ú┘é╪╡┘ë ┘ü┘è ╪º┘ä╪¿╪º┘é╪⌐ ╪º┘ä┘à╪¼╪º┘å┘è╪⌐: ┘à┘ç╪º╪▒╪¬╪º┘å ┘ü┘é╪╖' : 'Free plan limit: 2 skills max') : '';
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
  function openAgentModal(bot = null) {
    const form = document.getElementById('agentForm');
    if (!agentModal || !form) return;
    form.reset();
    document.getElementById('agentId').value = bot?._id || '';
    document.getElementById('agentModalTitle').textContent = bot ? (currentLanguage === 'ar' ? '╪¬╪╣╪»┘è┘ä ╪º┘ä┘ê┘â┘è┘ä' : 'Edit agent') : (currentLanguage === 'ar' ? '╪Ñ┘å╪┤╪º╪í ┘ê┘â┘è┘ä' : 'Create agent');
    
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
      const hasExplicitTools = Boolean(tools.bookingTool || tools.orderTrackingTool || tools.whatsappNotificationTool || tools.telegramNotificationTool);

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
      if (bookingService) bookingService.value = tools.bookingTool?.defaultService || '╪º╪│╪¬╪┤╪º╪▒╪⌐ / ┘à┘ê╪╣╪»';

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

      // Skills checkboxes population
      const rawSkills = Array.isArray(bot.agentSkills) && bot.agentSkills.length > 0
        ? bot.agentSkills.map(s => typeof s === 'string' ? s : s?.skillKey).filter(Boolean)
        : (isFree ? ['sales_consultant', 'appointment_scheduler'] : ['sales_consultant', 'appointment_scheduler', 'order_manager', 'support_specialist', 'winback_agent']);

      const allowedSkills = (isFree && rawSkills.length > 2) ? rawSkills.slice(0, 2) : rawSkills;
      document.querySelectorAll('input[name="agentSkill"]').forEach(chk => {
        chk.checked = allowedSkills.includes(chk.value);
      });
    } else {
      // Default for new agent
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
      if (toolDigest) toolDigest.checked = true;
      const channelEl = document.getElementById('agentDailyDigestChannel');
      if (channelEl) channelEl.value = 'all';
      const timeEl = document.getElementById('agentDailyDigestTime');
      if (timeEl) timeEl.value = '21:00';

      const toolUpsell = document.getElementById('agentToolSalesUpsell');
      if (toolUpsell) toolUpsell.checked = true;
      const toneEl = document.getElementById('agentSalesTone');
      if (toneEl) toneEl.value = 'consultative';
      const discountEl = document.getElementById('agentMaxDiscount');
      if (discountEl) discountEl.value = '0';

      document.querySelectorAll('input[name="agentSkill"]').forEach((chk, idx) => {
        chk.checked = isFree ? (idx < 2) : true;
      });
    }

    enforceToolAndSkillTierLimits();
    agentModal.classList.add('active');
  }

  // Bind change listeners to lock/unlock on user click
  ['agentToolBooking', 'agentToolOrders', 'agentToolWhatsapp', 'agentToolTelegram', 'agentToolSalesRecovery', 'agentToolDailyDigest', 'agentToolSalesUpsell'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', enforceToolAndSkillTierLimits);
  });
  document.querySelectorAll('input[name="agentSkill"]').forEach(chk => {
    chk.addEventListener('change', enforceToolAndSkillTierLimits);
  });

  document.getElementById('createAgentBtn')?.addEventListener('click', () => openAgentModal());
  document.querySelectorAll('.agent-modal-close').forEach((button) => button.addEventListener('click', () => agentModal?.classList.remove('active')));
  document.getElementById('agentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('agentId').value;
    const splitValues = (value, separator) => value.split(separator).map((item) => item.trim()).filter(Boolean);

    const selectedSkills = Array.from(document.querySelectorAll('input[name="agentSkill"]:checked')).map(el => el.value);

    const agentTools = {
      bookingTool: {
        enabled: document.getElementById('agentToolBooking')?.checked === true,
        workingHours: document.getElementById('agentBookingWorkingHours')?.value.trim() || '09:00 - 22:00',
        defaultService: document.getElementById('agentBookingDefaultService')?.value.trim() || '╪º╪│╪¬╪┤╪º╪▒╪⌐ / ┘à┘ê╪╣╪»',
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
    const result = await apiFetch(id ? `/api/bots/${id}` : '/api/bots', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (!result || result.error || result.message && !result._id && !result.success) return alert(result?.message || (currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪¡┘ü╪╕ ╪º┘ä┘ê┘â┘è┘ä.' : 'Could not save agent.'));
    agentModal?.classList.remove('active');
    await loadAgents();
    if (!id && result._id) refreshActiveBot(result);
    if (window.__zainbotRenderSettingsSummary) setTimeout(window.__zainbotRenderSettingsSummary, 150);
  });

  // Wire AI Sales Automation Center trigger buttons
  const triggerRecoveryBtn = document.getElementById('triggerRecoveryBtn');
  if (triggerRecoveryBtn) {
    triggerRecoveryBtn.addEventListener('click', async () => {
      if (!currentBot) return;
      const feedbackBox = document.getElementById('automationFeedbackBox');
      triggerRecoveryBtn.disabled = true;
      triggerRecoveryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLanguage === 'ar' ? '╪¼╪º╪▒┘è ╪º┘ä┘ü╪¡╪╡...' : 'Checking...');
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
          feedbackBox.textContent = res?.message || (currentLanguage === 'ar' ? '╪¬┘à ┘ü╪¡╪╡ ╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ╪¿┘å╪¼╪º╪¡.' : 'Checked conversations successfully.');
        }
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackBox.style.border = '1px solid var(--red)';
          feedbackBox.style.color = 'var(--red)';
          feedbackBox.textContent = currentLanguage === 'ar' ? '╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪¬╪┤╪║┘è┘ä ╪º┘ä┘ü╪¡╪╡.' : 'Error triggering check.';
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
      const feedbackBox = document.getElementById('automationFeedbackBox');
      triggerDigestBtn.disabled = true;
      triggerDigestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLanguage === 'ar' ? '╪¼╪º╪▒┘è ╪º┘ä╪Ñ╪▒╪│╪º┘ä...' : 'Sending...');
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
          feedbackBox.textContent = res?.message || (currentLanguage === 'ar' ? '╪¬┘à ╪Ñ╪▒╪│╪º┘ä ╪º┘ä┘à┘ä╪«╪╡ ╪¿┘å╪¼╪º╪¡.' : 'Digest sent successfully.');
        }
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackBox.style.border = '1px solid var(--red)';
          feedbackBox.style.color = 'var(--red)';
          feedbackBox.textContent = currentLanguage === 'ar' ? '╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪Ñ╪▒╪│╪º┘ä ╪º┘ä╪¬┘é╪▒┘è╪▒.' : 'Error sending digest.';
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
    if (info) info.textContent = `${adminUsersPageState.total} ${adminCopy('╪¡╪│╪º╪¿ ΓÇö ╪╡┘ü╪¡╪⌐', 'accounts ΓÇö page')} ${adminUsersPageState.page} / ${adminUsersPageState.pages}`;
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
      const res = await apiFetch(`/api/users?${params.toString()}`);
      adminUsersList = Array.isArray(res?.data) ? res.data : [];
      Object.assign(adminUsersPageState, res?.pagination || { page: 1, pages: 1, total: adminUsersList.length, limit: 25 });
      renderAdminUsers();
    } catch (error) {
      console.error('admin_users_load_failed', error);
      alert(adminCopy('╪¬╪╣╪░╪▒ ╪¬╪¡┘à┘è┘ä ┘é╪º╪ª┘à╪⌐ ╪º┘ä╪¡╪│╪º╪¿╪º╪¬.', 'Could not load accounts.'));
    }
  }

  function renderAdminUsers() {
    const tbody = document.getElementById('adminUsersTableBody');
    if (!tbody) return;
    tbody.replaceChildren();
    if (adminUsersList.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.style.cssText = 'padding:24px; text-align:center; color:var(--text-muted);';
      cell.textContent = adminCopy('┘ä╪º ╪¬┘ê╪¼╪» ╪¡╪│╪º╪¿╪º╪¬ ┘à╪╖╪º╪¿┘é╪⌐.', 'No matching accounts.');
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
      adminCell(row, user.role === 'superadmin' ? adminCopy('┘à╪»┘è╪▒ ╪╣╪º┘à', 'Super admin') : adminCopy('┘à╪│╪¬╪«╪»┘à', 'User'));
      adminCell(row, user.subscriptionTier || 'free', 'font-size:12px;');
      adminCell(row, user.status === 'suspended' ? adminCopy('┘à┘ê┘é┘ê┘ü', 'Suspended') : (user.status === 'deleted' ? adminCopy('┘à╪¡╪░┘ê┘ü', 'Deleted') : adminCopy('┘å╪┤╪╖', 'Active')));
      adminCell(row, `${Array.isArray(user.bots) ? user.bots.length : 0} ${adminCopy('┘ê┘â┘è┘ä', 'agent(s)')}`, 'font-size:12px;');
      const actions = document.createElement('td');
      actions.style.cssText = 'padding:12px; text-align:center; display:flex; justify-content:center; gap:5px; flex-wrap:wrap;';
      actions.appendChild(adminAction(adminCopy('╪¬╪╣╪»┘è┘ä', 'Edit'), () => openAdminUserModal(user._id)));
      actions.appendChild(adminAction(adminCopy('╪º┘ä┘ê┘â┘ä╪º╪í', 'Agents'), () => openUserBotsModal(user._id)));
      if (user.status !== 'deleted' && String(user._id) !== String(currentUser?._id)) {
        actions.appendChild(adminAction(adminCopy('╪»╪«┘ê┘ä ┘à╪ñ┘é╪¬', 'Temporary access'), () => openImpersonationModal(user._id), 'border-color:var(--orange); color:var(--orange);'));
      }
      if (user.status !== 'deleted' && user.role !== 'superadmin') {
        actions.appendChild(adminAction(user.status === 'suspended' ? adminCopy('╪¬┘ü╪╣┘è┘ä', 'Activate') : adminCopy('╪Ñ┘è┘é╪º┘ü', 'Suspend'), () => updateAdminUserStatus(user._id, user.status === 'suspended' ? 'active' : 'suspended')));
        actions.appendChild(adminAction(adminCopy('╪ú╪▒╪┤┘ü╪⌐', 'Archive'), () => archiveAdminUser(user._id), 'border-color:var(--red); color:var(--red);'));
      }
      row.appendChild(actions);
      tbody.appendChild(row);
    });
    renderAdminPagination();
  }

  async function updateAdminUserStatus(userId, status) {
    if (!confirm(adminCopy(`┘ç┘ä ╪¬╪▒┘è╪» ╪¬╪║┘è┘è╪▒ ╪¡╪º┘ä╪⌐ ╪º┘ä╪¡╪│╪º╪¿ ╪Ñ┘ä┘ë ${status === 'active' ? '┘å╪┤╪╖' : '┘à┘ê┘é┘ê┘ü'}╪ƒ`, `Change account status to ${status}?`))) return;
    const result = await apiFetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify({ status }) });
    if (!result?.data) return alert(result?.message || adminCopy('┘ü╪┤┘ä ╪¬╪¡╪»┘è╪½ ╪º┘ä╪¡╪│╪º╪¿.', 'Could not update account.'));
    loadAdminUsers();
  }

  async function archiveAdminUser(userId) {
    if (!confirm(adminCopy('╪│╪¬╪¬┘ê┘é┘ü ╪Ñ┘à┘â╪º┘å┘è╪⌐ ╪º┘ä╪»╪«┘ê┘ä ┘à╪╣ ╪º┘ä╪º╪¡╪¬┘ü╪º╪╕ ╪¿╪º┘ä┘à╪¡╪º╪»╪½╪º╪¬ ┘ê╪º┘ä┘é┘å┘ê╪º╪¬. ┘ç┘ä ╪¬╪▒┘è╪» ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐╪ƒ', 'Sign-in will stop while conversations and channels are preserved. Continue?'))) return;
    const result = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
    if (!result?.data) return alert(result?.message || adminCopy('┘ü╪┤┘ä╪¬ ╪ú╪▒╪┤┘ü╪⌐ ╪º┘ä╪¡╪│╪º╪¿.', 'Could not archive account.'));
    loadAdminUsers();
  }

  // Remote agent (bot) administration for a specific account
  async function openUserBotsModal(userId) {
    if (!modal) return;
    const user = adminUsersList.find((entry) => String(entry._id) === String(userId));
    if (!user || !Array.isArray(user.bots)) {
      alert(adminCopy('┘ä╪º ╪¬┘ê╪¼╪» ┘ê┘â┘ä╪º╪í ┘à╪¡┘à┘æ┘ä┘ê┘å ┘ä┘ç╪░╪º ╪º┘ä╪¡╪│╪º╪¿╪î ╪ú╪╣╪» ╪¬╪¡┘à┘è┘ä ╪º┘ä┘é╪º╪ª┘à╪⌐.', 'No loaded agents for this account. Reload the list.'));
      return;
    }
    modalTitle.innerHTML = `<i class="fas fa-robot" style="color:var(--orange)"></i> ${adminCopy(`┘ê┘â┘ä╪º╪í ${user.username}`, `${user.username}'s agents`)}`;
    modalBody.innerHTML = `<div id="adminBotsList" style="font-size:13px;">${adminCopy('╪¼╪º╪▒┘è ╪º┘ä╪¬╪¡┘à┘è┘ä...', 'Loading...')}</div>`;
    modal.classList.add('active');

    const listEl = document.getElementById('adminBotsList');
    const bots = user.bots;

    const renderBots = () => {
      listEl.innerHTML = bots.map((botItem) => {
        const running = botItem.isActive !== false;
        return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:10px 0; border-bottom:1px solid var(--glass-border);">
          <div style="min-width:0;">
            <div style="font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${botItem.name}</div>
            <div style="font-size:11px; color:${running ? 'var(--green)' : 'var(--red)'};">${running ? adminCopy('┘è╪╣┘à┘ä', 'Running') : adminCopy('┘à╪¬┘ê┘é┘ü', 'Stopped')}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-bot-toggle="${botItem._id}"
            style="flex-shrink:0; ${running ? 'border-color:var(--red); color:var(--red);' : 'border-color:var(--green); color:var(--green);'}">
            ${running ? adminCopy('╪Ñ┘è┘é╪º┘ü', 'Stop') : adminCopy('╪¬╪┤╪║┘è┘ä', 'Start')}
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
            alert(res?.message || adminCopy('┘ü╪┤┘ä ╪¬╪¡╪»┘è╪½ ╪¡╪º┘ä╪⌐ ╪º┘ä┘ê┘â┘è┘ä.', 'Could not update the agent.'));
          }
        });
      });
    };

    if (bots.length === 0) {
      listEl.textContent = adminCopy('┘ä╪º ┘è┘à┘ä┘â ┘ç╪░╪º ╪º┘ä╪¡╪│╪º╪¿ ┘ê┘â┘ä╪º╪í ╪¿╪╣╪».', 'This account has no agents yet.');
      return;
    }
    renderBots();
  }

  async function openAdminUserModal(userId = '') {
    const form = document.getElementById('adminUserForm');
    if (!adminUserModal || !form) return;
    form.reset();
    document.getElementById('adminUserId').value = userId;
    document.getElementById('adminUserMode').value = userId ? 'edit' : 'create';
    document.getElementById('adminUserModalTitle').textContent = userId ? adminCopy('╪¬╪╣╪»┘è┘ä ╪º┘ä╪¡╪│╪º╪¿', 'Edit account') : adminCopy('╪Ñ╪╢╪º┘ü╪⌐ ╪¡╪│╪º╪¿', 'Add account');
    document.getElementById('adminUserPassword').required = !userId;
    document.getElementById('adminUserConfirmPassword').required = !userId;
    if (userId) {
      const response = await apiFetch(`/api/users/${userId}`);
      const user = response?.data;
      if (!user) return alert(adminCopy('╪¬╪╣╪░╪▒ ╪¬╪¡┘à┘è┘ä ╪¿┘è╪º┘å╪º╪¬ ╪º┘ä╪¡╪│╪º╪¿.', 'Could not load account.'));
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
    adminUserModal.classList.add('active');
  }

  function openImpersonationModal(userId) {
    const form = document.getElementById('impersonationForm');
    if (!impersonationModal || !form) return;
    form.reset();
    document.getElementById('impersonationSubjectId').value = userId;
    impersonationModal.classList.add('active');
  }

  function renderImpersonationBanner() {
    const sessionId = sessionStorage.getItem('zainbot_impersonation_session_id');
    const banner = document.getElementById('impersonationBanner');
    if (!sessionId || !banner) return;
    document.getElementById('impersonationBannerText').textContent = adminCopy(`╪ú┘å╪¬ ╪»╪º╪«┘ä ┘à╪ñ┘é╪¬╪º┘ï ╪Ñ┘ä┘ë ╪¡╪│╪º╪¿ ${currentUser?.username || ''}. ┘â┘ä ╪º┘ä┘å╪┤╪º╪╖ ┘à╪│╪¼┘ä.`, `You are temporarily viewing ${currentUser?.username || 'this account'}. Activity is audited.`);
    banner.style.display = 'block';
  }

  document.getElementById('adminAddUserBtn')?.addEventListener('click', () => openAdminUserModal());
  document.querySelectorAll('.admin-user-modal-close').forEach((button) => button.addEventListener('click', () => adminUserModal?.classList.remove('active')));
  document.querySelectorAll('.impersonation-modal-close').forEach((button) => button.addEventListener('click', () => impersonationModal?.classList.remove('active')));
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
    if (!result?.data) return alert(result?.message || adminCopy('┘ü╪┤┘ä ╪¡┘ü╪╕ ╪º┘ä╪¡╪│╪º╪¿.', 'Could not save account.'));
    adminUserModal?.classList.remove('active');
    loadAdminUsers(id ? adminUsersPageState.page : 1);
  });
  document.getElementById('impersonationForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await apiFetch('/api/admin/impersonation/sessions', { method: 'POST', body: JSON.stringify({ subjectUserId: document.getElementById('impersonationSubjectId').value, reason: document.getElementById('impersonationReason').value.trim() }) });
    const data = response?.data;
    if (!data?.token || !data?.session?.id) return alert(response?.message || adminCopy('┘ü╪┤┘ä ╪¿╪»╪í ╪º┘ä╪¼┘ä╪│╪⌐ ╪º┘ä┘à╪ñ┘é╪¬╪⌐.', 'Could not start temporary access.'));
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
    if (!admin.token || !sessionId) return alert(adminCopy('╪º┘å╪¬┘ç╪¬ ╪¼┘ä╪│╪⌐ ╪º┘ä┘à╪»┘è╪▒. ╪│╪¼┘ä ╪º┘ä╪»╪«┘ê┘ä ┘à┘å ╪¼╪»┘è╪».', 'The admin session is unavailable. Please sign in again.'));
    const response = await fetch(`/api/admin/impersonation/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` } });
    const result = await response.json();
    if (!response.ok || !result?.success) return alert(result?.message || adminCopy('╪¬╪╣╪░╪▒ ╪Ñ┘å┘ç╪º╪í ╪º┘ä╪¼┘ä╪│╪⌐ ╪º┘ä┘à╪ñ┘é╪¬╪⌐ ╪¿╪ú┘à╪º┘å.', 'Could not safely end the temporary session.'));
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
          <td style="padding:10px;">${s.actor?.username || 'ΓÇö'}</td>
          <td style="padding:10px;">${s.subject?.username || 'ΓÇö'}</td>
          <td style="padding:10px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${(s.reason || '').replace(/"/g, '&quot;')}">${s.reason || 'ΓÇö'}</td>
          <td style="padding:10px; color:${color}; font-weight:600;">${s.status}</td>
          <td style="padding:10px;">${s.createdAt ? new Date(s.createdAt).toLocaleString() : 'ΓÇö'}</td>
          <td style="padding:10px;">${s.expiresAt ? new Date(s.expiresAt).toLocaleString() : 'ΓÇö'}</td>
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
      if (info) info.textContent = `${res.total ?? 0} ┬╖ ${res.page}/${res.totalPages}`;

      if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).admin_empty_events}</td></tr>`;
        return;
      }

      const outcomeColors = { success: 'var(--green)', denied: 'var(--orange)', error: 'var(--red)' };
      tbody.innerHTML = rows.map((ev) => {
        const color = outcomeColors[ev.outcome] || 'var(--text-muted)';
        const actionText = [ev.method, ev.path].filter(Boolean).join(' ') || ev.action || 'ΓÇö';
        return `<tr style="border-bottom:1px solid var(--glass-border);">
          <td style="padding:10px; white-space:nowrap;">${ev.createdAt ? new Date(ev.createdAt).toLocaleString() : 'ΓÇö'}</td>
          <td style="padding:10px;">${ev.eventType}</td>
          <td style="padding:10px;">${ev.actorUsername || 'ΓÇö'} ΓåÆ ${ev.subjectUsername || 'ΓÇö'}</td>
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
          ? `${t.landing_demo_updated_at}: ${new Date(cfg.updatedAt).toLocaleString()}`
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
            updatedEl.textContent = `${t.landing_demo_updated_at}: ${new Date(res.data.updatedAt).toLocaleString()}`;
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

    document.getElementById('faqModalTitle').textContent = currentLanguage === 'ar' ? '╪¬╪╣╪»┘è┘ä ╪º┘ä┘é╪º╪╣╪»╪⌐' : 'Edit FAQ Rule';
    document.getElementById('faqIdInput').value = faq._id;
    document.getElementById('faqQuestionInput').value = faq.content?.question || '';
    document.getElementById('faqAnswerInput').value = faq.content?.answer || '';
    
    faqModal.classList.add('active');
  };

  window.deleteFaq = async function(id) {
    if (!confirm(currentLanguage === 'ar' ? '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪¡╪░┘ü ┘ç╪░┘ç ╪º┘ä┘é╪º╪╣╪»╪⌐╪ƒ' : 'Are you sure you want to delete this FAQ rule?')) return;
    try {
      const res = await apiFetch(`/api/rules/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        loadTrainingData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.revokeApiKey = async function(id) {
    if (!confirm(currentLanguage === 'ar' ? '┘ç┘ä ╪ú┘å╪¬ ┘à╪¬╪ú┘â╪» ┘à┘å ╪Ñ╪¿╪╖╪º┘ä ┘à┘ü╪¬╪º╪¡ ╪º┘ä┘ê╪╡┘ê┘ä ┘ç╪░╪º╪ƒ' : 'Are you sure you want to revoke this access key?')) return;
    try {
      const res = await apiFetch(`/api/integrations/keys/${id}`, { method: 'DELETE' });
      if (res && res.success) {
        loadSettingsData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  window.retryWebhook = async function(id) {
    try {
      const res = await apiFetch(`/api/integrations/webhooks/logs/${id}/retry`, { method: 'POST' });
      if (res && res.success) {
        alert(currentLanguage === 'ar' ? '╪¬┘à ╪Ñ╪╣╪º╪»╪⌐ ╪º┘ä╪Ñ╪▒╪│╪º┘ä ┘ê╪º┘ä╪¬╪│┘ä┘è┘à ╪¿┘å╪¼╪º╪¡!' : 'Webhook redelivered successfully!');
        loadSettingsData();
      } else {
        alert(currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪Ñ╪╣╪º╪»╪⌐ ╪º┘ä╪Ñ╪▒╪│╪º┘ä.' : 'Webhook retry failed.');
      }
    } catch (e) {
      console.error(e);
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
    if (!confirm('Are you sure you want to delete this server key?')) return;
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
    addFaqBtn.addEventListener('click', () => {
      document.getElementById('faqModalTitle').textContent = currentLanguage === 'ar' ? '╪Ñ╪╢╪º┘ü╪⌐ ╪│╪ñ╪º┘ä ┘ê╪¼┘ê╪º╪¿' : 'Create FAQ Rule';
      document.getElementById('faqIdInput').value = '';
      document.getElementById('faqQuestionInput').value = '';
      document.getElementById('faqAnswerInput').value = '';
      faqModal.classList.add('active');
    });
  }

  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      faqModal.classList.remove('active');
      const channelModal = document.getElementById('channelModal');
      if (channelModal) channelModal.classList.remove('active');
    });
  });

  // Global Channel Configuration Modal Handler
  window.configureChannel = async function(type) {
    if (!currentBot) return;
    const modal = document.getElementById('channelModal');
    const modalTitle = document.getElementById('channelModalTitle');
    const modalBody = document.getElementById('channelModalBody');

    if (!modal) return;
    modal.classList.add('active');

    if (type === 'whatsapp') {
      modalTitle.innerHTML = `<i class="fab fa-whatsapp" style="color:var(--green)"></i> ${currentLanguage === 'ar' ? '╪▒╪¿╪╖ ┘ê╪º╪¬╪│╪º╪¿ ╪╣╪¿╪▒ ╪º┘ä╪▒┘à╪▓ (QR Code)' : 'Connect WhatsApp via QR Code'}`;
      modalBody.innerHTML = `
        <div style="text-align:center; padding:16px;">
          <div id="waQrContainer" style="background:rgba(255,255,255,0.03); padding:20px; border-radius:16px; border:1px solid var(--glass-border); display:inline-block; margin-bottom:16px;">
            <div style="color:var(--cyan); font-weight:600;"><i class="fas fa-spinner fa-spin"></i> ${currentLanguage === 'ar' ? '╪¼╪º╪▒┘è ╪¬┘ê┘ä┘è╪» ╪º┘ä╪▒┘à╪▓...' : 'Generating QR Code...'}</div>
          </div>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.6;">
            ${currentLanguage === 'ar' ? '╪º┘ü╪¬╪¡ ╪¬╪╖╪¿┘è┘é ╪º┘ä┘ê╪º╪¬╪│╪º╪¿ ╪╣┘ä┘ë ┘ç╪º╪¬┘ü┘â > ╪º┘ä╪ú╪¼┘ç╪▓╪⌐ ╪º┘ä┘à╪▒╪¬╪¿╪╖╪⌐ > ╪▒╪¿╪╖ ╪¼┘ç╪º╪▓ > ┘ê┘é┘à ╪¿┘à╪│╪¡ ╪º┘ä╪▒┘à╪▓ ╪ú╪╣┘ä╪º┘ç.' : 'Open WhatsApp on your phone > Linked Devices > Link a Device > Scan the QR code above.'}
          </p>
          <button id="waDisconnectBtn" class="btn btn-secondary btn-sm" style="border-color:var(--red); color:var(--red);">${currentLanguage === 'ar' ? '╪Ñ┘ä╪║╪º╪í ╪º┘ä╪▒╪¿╪╖' : 'Disconnect Session'}</button>
        </div>
      `;

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
            image.alt = currentLanguage === 'ar' ? '╪▒┘à╪▓ ╪▒╪¿╪╖ ┘ê╪º╪¬╪│╪º╪¿' : 'WhatsApp QR Code';
            image.width = 220;
            image.height = 220;
            image.style.borderRadius = '12px';
            image.style.border = '2px solid var(--cyan)';
            container.appendChild(image);
            return true;
          }
          container.textContent = data?.status === 'connected'
            ? (currentLanguage === 'ar' ? '╪¬┘à ╪º┘ä╪▒╪¿╪╖ ╪¿┘å╪¼╪º╪¡.' : 'WhatsApp is connected.')
            : (currentLanguage === 'ar' ? '┘è╪¬┘à ╪¬╪¼┘ç┘è╪▓ ╪º┘ä╪▒┘à╪▓ΓÇª' : 'Preparing QR codeΓÇª');
          return false;
        };

        if (res?.success) {
          let data = res.data;
          if (!renderQr(data) && !['connected', 'error', 'relink_required'].includes(data?.status)) {
            const deadline = Date.now() + 90_000;
            while (Date.now() < deadline && modal.classList.contains('active')) {
              await new Promise((resolve) => setTimeout(resolve, 2_000));
              const status = await apiFetch(`/api/whatsapp/session?botId=${encodeURIComponent(currentBot._id)}`);
              if (!status?.success) break;
              data = status.data;
              if (renderQr(data) || ['connected', 'error', 'relink_required', 'degraded'].includes(data?.status)) break;
            }
          }
        } else {
          const container = document.getElementById('waQrContainer');
          if (container) {
            container.textContent = currentLanguage === 'ar' ? '╪¬╪╣╪░╪▒ ╪¿╪»╪í ╪¼┘ä╪│╪⌐ ┘ê╪º╪¬╪│╪º╪¿.' : 'Could not start WhatsApp session.';
          }
        }
      } catch (e) {
        console.error(e);
        const container = document.getElementById('waQrContainer');
        if (container) {
          container.textContent = currentLanguage === 'ar' ? '╪¬╪╣╪░╪▒ ╪¬┘ê┘ä┘è╪» ╪º┘ä╪▒┘à╪▓. ╪¡╪º┘ê┘ä ┘à╪▒╪⌐ ╪ú╪«╪▒┘ë.' : 'Could not generate the QR code. Try again.';
        }
      }

      document.getElementById('waDisconnectBtn')?.addEventListener('click', async () => {
        await apiFetch('/api/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ botId: currentBot._id }) });
        modal.classList.remove('active');
        loadChannelsData();
      });
    }

    else if (type === 'facebook') {
      modalTitle.innerHTML = `<i class="fab fa-facebook-messenger" style="color:var(--blue)"></i> ${currentLanguage === 'ar' ? '╪▒╪¿╪╖ ╪╡┘ü╪¡╪⌐ ┘ü┘è╪│╪¿┘ê┘â ┘à╪¿╪º╪┤╪▒╪⌐' : 'Facebook Page Direct Connect'}`;
      modalBody.innerHTML = `
        <form id="fbDirectForm">
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? '┘à┘ü╪¬╪º╪¡ ┘ê╪╡┘ê┘ä ╪º┘ä╪╡┘ü╪¡╪⌐ (Page Access Token)' : 'Page Access Token'}</label>
              <button type="button" class="btn btn-secondary btn-sm info-hint-toggle" style="padding:2px 8px; font-size:11px; color:var(--cyan); border-color:var(--cyan);"><i class="fas fa-info-circle"></i> ${currentLanguage === 'ar' ? '┘â┘è┘ü ╪ú╪¡╪╡┘ä ╪╣┘ä┘è┘ç╪ƒ' : 'How to get?'}</button>
            </div>
            <div class="info-hint-box" style="display:none; background:rgba(0,240,255,0.06); border:1px solid var(--cyan); padding:10px 14px; border-radius:8px; font-size:12px; color:var(--text); margin-bottom:10px;">
              ${currentLanguage === 'ar' ? '1. ╪º╪»╪«┘ä ╪Ñ┘ä┘ë developers.facebook.com ┘ê╪ú┘å╪┤╪ª ╪¬╪╖╪¿┘è┘é╪º.<br>2. ╪º╪«╪¬╪▒ ╪╡┘ü╪¡╪⌐ ╪º┘ä┘ü┘è╪│╪¿┘ê┘â ╪º┘ä╪«╪º╪╡╪⌐ ╪¿┘â ┘ê┘ê┘ä┘æ╪» ┘à┘ü╪¬╪º╪¡ ┘ê╪╡┘ê┘ä ╪º┘ä╪╡┘ü╪¡╪⌐ (Page Access Token).<br>3. ┘é┘à ╪¿┘å╪│╪« ╪º┘ä┘à┘ü╪¬╪º╪¡ ┘ê┘ä╪╡┘é┘ç ┘ü┘è ╪º┘ä╪¡┘é┘ä ╪ú╪»┘å╪º┘ç.' : '1. Go to developers.facebook.com and select your App.<br>2. Select your FB Page in Graph API Explorer & generate Page Access Token.<br>3. Copy & paste the token below.'}
            </div>
            <input type="password" id="fbTokenInput" class="form-control" placeholder="EAA..." value="${currentBot.facebookApiKey || ''}" required />
          </div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? '┘à╪╣╪▒┘æ┘ü ╪º┘ä╪╡┘ü╪¡╪⌐ (Page ID)' : 'Page ID'}</label>
            </div>
            <input type="text" id="fbPageIdInput" class="form-control" placeholder="1023948574..." value="${currentBot.facebookPageId || ''}" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${currentLanguage === 'ar' ? '╪Ñ┘ä╪║╪º╪í' : 'Cancel'}</button>
            <button type="submit" class="btn btn-primary btn-sm">${currentLanguage === 'ar' ? '╪¡┘ü╪╕ ╪º┘ä╪▒╪¿╪╖' : 'Save Connection'}</button>
          </div>
        </form>
      `;

      document.querySelector('.info-hint-toggle')?.addEventListener('click', () => {
        const box = document.querySelector('.info-hint-box');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });

      document.getElementById('fbDirectForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const facebookApiKey = document.getElementById('fbTokenInput').value.trim();
        const facebookPageId = document.getElementById('fbPageIdInput').value.trim();

        const res = await apiFetch(`/api/bots/${currentBot._id}/link-social`, {
          method: 'POST',
          body: JSON.stringify({ facebookApiKey, facebookPageId })
        });
        if (res && res.success) {
          modal.classList.remove('active');
          loadChannelsData();
        }
      });
    }

    else if (type === 'instagram') {
      modalTitle.innerHTML = `<i class="fab fa-instagram" style="color:var(--purple-light)"></i> ${currentLanguage === 'ar' ? '╪▒╪¿╪╖ ╪¡╪│╪º╪¿ ╪Ñ┘å╪│╪¬╪¼╪▒╪º┘à ┘à╪¿╪º╪┤╪▒╪⌐' : 'Instagram Direct Connect'}`;
      modalBody.innerHTML = `
        <form id="igDirectForm">
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? '┘à┘ü╪¬╪º╪¡ ┘ê╪╡┘ê┘ä ╪Ñ┘å╪│╪¬╪¼╪▒╪º┘à (Instagram Access Token)' : 'Instagram Access Token'}</label>
              <button type="button" class="btn btn-secondary btn-sm info-hint-toggle" style="padding:2px 8px; font-size:11px; color:var(--cyan); border-color:var(--cyan);"><i class="fas fa-info-circle"></i> ${currentLanguage === 'ar' ? '┘â┘è┘ü ╪ú╪¡╪╡┘ä ╪╣┘ä┘è┘ç╪ƒ' : 'How to get?'}</button>
            </div>
            <div class="info-hint-box" style="display:none; background:rgba(0,240,255,0.06); border:1px solid var(--cyan); padding:10px 14px; border-radius:8px; font-size:12px; color:var(--text); margin-bottom:10px;">
              ${currentLanguage === 'ar' ? '1. ┘é┘à ╪¿╪▒╪¿╪╖ ╪¡╪│╪º╪¿ ╪Ñ┘å╪│╪¬╪¼╪▒╪º┘à ╪º┘ä╪¬╪¼╪º╪▒┘è ╪¿╪╡┘ü╪¡╪¬┘â ╪╣┘ä┘ë ┘ü┘è╪│╪¿┘ê┘â.<br>2. ╪º┘å╪│╪« ┘à┘ü╪¬╪º╪¡ ╪º┘ä┘ê╪╡┘ê┘ä ╪º┘ä┘à╪│╪¬╪«╪▒╪¼ ┘à┘å Meta Developer Console.<br>3. ╪╢╪╣ ╪º┘ä┘à┘ü╪¬╪º╪¡ ┘ê┘à╪╣╪▒┘ü ╪º┘ä╪¡╪│╪º╪¿ ┘ü┘è ╪º┘ä╪¡┘é┘ê┘ä ╪ú╪»┘å╪º┘ç.' : '1. Link your IG Business account to your Facebook Page.<br>2. Generate Page/IG Access Token in Meta Developer Console.<br>3. Copy & paste the token and account ID below.'}
            </div>
            <input type="password" id="igTokenInput" class="form-control" placeholder="EAA..." value="${currentBot.instagramApiKey || ''}" required />
          </div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? '┘à╪╣╪▒┘æ┘ü ╪¡╪│╪º╪¿ ╪Ñ┘å╪│╪¬╪¼╪▒╪º┘à (Instagram Page ID)' : 'Instagram Page ID'}</label>
            </div>
            <input type="text" id="igPageIdInput" class="form-control" placeholder="178414..." value="${currentBot.instagramPageId || ''}" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${currentLanguage === 'ar' ? '╪Ñ┘ä╪║╪º╪í' : 'Cancel'}</button>
            <button type="submit" class="btn btn-primary btn-sm">${currentLanguage === 'ar' ? '╪¡┘ü╪╕ ╪º┘ä╪▒╪¿╪╖' : 'Save Connection'}</button>
          </div>
        </form>
      `;

      document.querySelector('.info-hint-toggle')?.addEventListener('click', () => {
        const box = document.querySelector('.info-hint-box');
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });

      document.getElementById('igDirectForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const instagramApiKey = document.getElementById('igTokenInput').value.trim();
        const instagramPageId = document.getElementById('igPageIdInput').value.trim();

        const res = await apiFetch(`/api/bots/${currentBot._id}/link-social`, {
          method: 'POST',
          body: JSON.stringify({ instagramApiKey, instagramPageId })
        });
        if (res && res.success) {
          modal.classList.remove('active');
          loadChannelsData();
        }
      });
    }

    else if (type === 'telegram') {
      modalTitle.innerHTML = `<i class="fab fa-telegram" style="color:var(--cyan)"></i> ${currentLanguage === 'ar' ? '╪▒╪¿╪╖ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à' : 'Connect Telegram'}`;
      modalBody.innerHTML = `
        <div id="tgLinkFlow">
          <p style="font-size:13px; color:var(--text); margin-bottom:10px;">${currentLanguage === 'ar'
            ? '╪º╪▒╪¿╪╖ ┘ê┘â┘è┘ä┘â ╪¿╪º┘ä╪¿┘ê╪¬ ╪º┘ä╪▒╪│┘à┘è ┘ä┘ä┘à┘å╪╡╪⌐ ╪╣┘ä┘ë ╪¬┘è┘ä┘è╪¼╪▒╪º┘à ┘ä╪¬╪╡┘ä┘â ╪º┘ä╪Ñ╪┤╪╣╪º╪▒╪º╪¬. ┘ê┘ä┘æ╪» ┘â┘ê╪» ╪º┘ä╪▒╪¿╪╖ ╪½┘à ╪ú╪▒╪│┘ä┘ç ┘ä┘ä╪¿┘ê╪¬ ╪º┘ä╪▒╪│┘à┘è.'
            : 'Link your agent to the official platform bot on Telegram to receive notifications. Generate a link code, then send it to the official bot.'}</p>
          <ol style="font-size:13px; color:var(--text-muted); margin:0 0 14px; padding-inline-start:18px;">
            <li>${currentLanguage === 'ar' ? '╪º╪╢╪║╪╖ ╪▓╪▒ "╪¬┘ê┘ä┘è╪» ┘â┘ê╪» ╪º┘ä╪▒╪¿╪╖" ╪¿╪º┘ä╪ú╪│┘ü┘ä.' : 'Click the "Generate link code" button below.'}</li>
            <li>${currentLanguage === 'ar' ? '╪º┘ü╪¬╪¡ ╪º┘ä╪¿┘ê╪¬ ╪º┘ä╪▒╪│┘à┘è ┘ü┘è ╪¬┘è┘ä┘è╪¼╪▒╪º┘à ┘ê╪º╪╢╪║╪╖ Start.' : 'Open the official bot in Telegram and press Start.'}</li>
            <li>${currentLanguage === 'ar' ? '╪ú╪▒╪│┘ä ╪º┘ä┘â┘ê╪» ┘â┘à╪º ┘ç┘ê ┘ü┘è ╪▒╪│╪º┘ä╪⌐ ┘ê╪º╪¡╪»╪⌐.' : 'Send the code as a single message.'}</li>
          </ol>
          <div id="tgStatusBox"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${currentLanguage === 'ar' ? '╪Ñ╪║┘ä╪º┘é' : 'Close'}</button>
            <button type="button" id="tgGenerateCodeBtn" class="btn btn-primary btn-sm">${currentLanguage === 'ar' ? '╪¬┘ê┘ä┘è╪» ┘â┘ê╪» ╪º┘ä╪▒╪¿╪╖' : 'Generate link code'}</button>
          </div>
        </div>
      `;

      const tgStatusBox = document.getElementById('tgStatusBox');
      const renderTgStatus = async () => {
        if (!tgStatusBox) return;
        const st = await apiFetch(`/api/telegram/status?botId=${currentBot._id}`);
        if (!st) { tgStatusBox.innerHTML = ''; return; }
        if (st.linked) {
          tgStatusBox.innerHTML = `<div style="background:rgba(16,185,129,0.08); border:1px solid var(--green); padding:10px 14px; border-radius:8px; font-size:13px;">Γ£à ${currentLanguage === 'ar' ? '┘à╪▒╪¿┘ê╪╖ ╪¿╪¡╪│╪º╪¿ ╪¬┘è┘ä┘è╪¼╪▒╪º┘à' : 'Linked to a Telegram account'}${st.username ? ` (${st.username})` : ''}</div>`;
        } else if (st.linkCode && st.linkExpiresAt && new Date(st.linkExpiresAt) > new Date()) {
          tgStatusBox.innerHTML = `<div style="background:rgba(59,130,246,0.08); border:1px solid var(--blue); padding:10px 14px; border-radius:8px; font-size:13px;">${currentLanguage === 'ar' ? '┘â┘ê╪» ┘å╪┤╪╖ ╪¿╪º┘ä┘ü╪╣┘ä:' : 'Active code already issued:'} <strong>${st.linkCode}</strong></div>`;
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
              <div style="font-size:13px; color:var(--text-muted);">${currentLanguage === 'ar' ? '┘â┘ê╪» ╪º┘ä╪▒╪¿╪╖ ╪º┘ä╪«╪º╪╡ ╪¿┘â:' : 'Your link code:'}</div>
              <div style="font-size:24px; font-weight:700; letter-spacing:3px; color:var(--cyan); margin:4px 0;">${res.code}</div>
              <div style="font-size:12px; color:var(--text-muted);">${currentLanguage === 'ar'
                ? `╪ú╪▒╪│┘ä┘ç ╪Ñ┘ä┘ë <a href="https://t.me/${res.botUsername}" target="_blank" rel="noopener" style="color:var(--cyan);">@${res.botUsername}</a> ┘é╪¿┘ä ╪º┘å╪¬┘ç╪º╪í ╪º┘ä╪╡┘ä╪º╪¡┘è╪⌐.`
                : `Send it to <a href="https://t.me/${res.botUsername}" target="_blank" rel="noopener" style="color:var(--cyan);">@${res.botUsername}</a> before it expires.`}</div>
            </div>`;
        }
      });
    }

    modal.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.classList.remove('active');
      });
    });
  };

  function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  if (accountMenuToggle && accountMenu) {
    accountMenuToggle.addEventListener('click', () => {
      const isOpen = accountMenu.hidden;
      accountMenu.hidden = !isOpen;
      accountMenuToggle.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!accountMenu.hidden && !accountMenu.contains(event.target) && !accountMenuToggle.contains(event.target)) {
        accountMenu.hidden = true;
        accountMenuToggle.setAttribute('aria-expanded', 'false');
      }
    });
    document.getElementById('accountSettingsBtn').addEventListener('click', () => {
      accountMenu.hidden = true;
      accountMenuToggle.setAttribute('aria-expanded', 'false');
      switchTab('page-settings');
    });
    document.getElementById('accountLogoutBtn').addEventListener('click', logout);
  }

  if (sidebarLogout) sidebarLogout.addEventListener('click', logout);

  // ==========================================
  // IDEA COUNCIL FRONTEND CONTROLLER
  // ==========================================

  let currentIdea = null;
  let currentIdeaRunId = null;
  let ideaPollTimer = null;
  let ideaAutoSaveTimer = null;
  let ideaCurrentFilter = 'ALL';
  let ideaUsageData = null;

  function escapeIdeaHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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

  function showIdeaView(viewName) {
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

  async function loadIdeaCouncilData() {
    await Promise.all([
      loadIdeaCouncilUsage(),
      loadIdeaCouncilList(ideaCurrentFilter)
    ]);
  }

  async function loadIdeaCouncilUsage() {
    try {
      const res = await apiFetch('/api/idea-council/usage');
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

  async function loadIdeaCouncilList(filter = 'ALL') {
    ideaCurrentFilter = filter;
    const container = document.getElementById('ideasListContainer');
    const emptyEl = document.getElementById('ideaListEmpty');
    if (!container) return;

    try {
      const query = filter !== 'ALL' ? `?status=${encodeURIComponent(filter)}` : '';
      const res = await apiFetch(`/api/idea-council/ideas${query}`);
      const rawList = res && res.success ? (Array.isArray(res.data) ? res.data : (res.data?.ideas || [])) : [];
      const ideas = Array.isArray(rawList) ? rawList : [];

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
        const title = idea.structuredCard?.title || idea.structuredIdea?.title || idea.rawIdea?.title || idea.title || ideaT('idea_card_title');
        const pitch = idea.structuredCard?.elevatorPitch || idea.structuredIdea?.elevatorPitch || (idea.rawIdea?.rawText ? (idea.rawIdea.rawText.slice(0, 120) + '...') : '');
        const date = new Date(idea.createdAt || Date.now()).toLocaleDateString(currentLanguage === 'ar' ? 'ar-EG' : 'en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });

        const sc = statusColors[idea.status] || statusColors.DRAFT;
        const statusKey = 'idea_status_' + (idea.status || 'draft').toLowerCase();
        const statusLabel = ideaT(statusKey, idea.status || 'DRAFT');

        const actionLabel = (idea.status === 'COMPLETED' || idea.status === 'PARTIAL')
          ? ideaT('idea_action_view')
          : ideaT('idea_action_resume');

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
                ${escapeIdeaHtml(actionLabel)} <i class="fas ${currentLanguage === 'ar' ? 'fa-arrow-left' : 'fa-arrow-right'}" style="margin-inline-start:4px;"></i>
              </button>
              ${(idea.status === 'DRAFT' || idea.status === 'FAILED') ? `
                <button class="btn btn-sm idea-delete-btn" data-id="${ideaId}" type="button" title="${ideaT('idea_action_delete')}" style="background:transparent; border:none; color:var(--text-muted); padding:6px 8px;">
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
          if (!confirm(ideaT('idea_msg_confirm_delete'))) return;
          try {
            await apiFetch(`/api/idea-council/ideas/${id}`, { method: 'DELETE' });
            await loadIdeaCouncilList(ideaCurrentFilter);
            await loadIdeaCouncilUsage();
          } catch (err) {
            console.error('Failed to delete idea:', err);
          }
        });
      });

    } catch (err) {
      console.error('Failed to load Idea Council list:', err);
    }
  }

  async function openIdea(ideaId) {
    try {
      const res = await apiFetch(`/api/idea-council/ideas/${ideaId}`);
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
        if (langSelect) langSelect.value = currentIdea.reportLanguage || currentLanguage || 'ar';
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

  async function saveIdeaDraft(silent = false) {
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
        alert(currentLanguage === 'ar' ? '┘è╪¼╪¿ ╪ú┘å ┘ä╪º ┘è┘é┘ä ┘ê╪╡┘ü ╪º┘ä┘ü┘â╪▒╪⌐ ╪╣┘å 100 ╪¡╪▒┘ü.' : 'Idea description must be at least 100 characters.');
      }
      return null;
    }

    if (statusEl) statusEl.textContent = ideaT('idea_msg_saving');

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
        res = await apiFetch(`/api/idea-council/draft/${curId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/idea-council/draft', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }

      if (res && res.success && res.data) {
        currentIdea = res.data;
        if (statusEl) {
          statusEl.textContent = ideaT('idea_msg_saved');
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
      alert(currentLanguage === 'ar' ? '┘è╪¼╪¿ ╪ú┘å ┘ä╪º ┘è┘é┘ä ┘ê╪╡┘ü ╪º┘ä┘ü┘â╪▒╪⌐ ╪╣┘å 100 ╪¡╪▒┘ü.' : 'Idea description must be at least 100 characters.');
      return;
    }

    const btn = document.getElementById('ideaSubmitStructureBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${ideaT('idea_btn_structuring')}`;
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
      const res = await apiFetch(`/api/idea-council/ideas/${activeId}/structure`, {
        method: 'POST'
      });

      if (res && res.success && res.data) {
        currentIdea = { ...currentIdea, ...res.data };
        populateStructuredCardForm(currentIdea.structuredCard || currentIdea.structuredIdea || {});
        showIdeaView('card');
      } else {
        alert(res?.error || (currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪¬┘å╪╕┘è┘à ╪¿╪╖╪º┘é╪⌐ ╪º┘ä┘ü┘â╪▒╪⌐.' : 'Failed to structure idea.'));
      }
    } catch (err) {
      console.error('Error structuring idea:', err);
      alert(currentLanguage === 'ar' ? '╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪¬┘å╪╕┘è┘à ╪º┘ä┘ü┘â╪▒╪⌐.' : 'Error structuring idea.');
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
      alert(ideaT('idea_msg_confirm_checkbox_req'));
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
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLanguage === 'ar' ? '╪¼╪º╪▒┘ì ╪º┘ä╪º╪│╪¬╪»╪╣╪º╪í...' : 'Convening...');
    }

    try {
      await apiFetch(`/api/idea-council/ideas/${ideaId}/card`, {
        method: 'PUT',
        body: JSON.stringify(card)
      });

      const idempotencyKey = `convene-${ideaId}-${Date.now()}`;
      const res = await apiFetch(`/api/idea-council/ideas/${ideaId}/convene`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ idempotencyKey })
      });

      const runId = res?.runId || res?.data?.runId;
      if (res && res.success && runId) {
        currentIdeaRunId = runId;
        showIdeaView('session');
        renderCouncilAgentsGrid([]);
        startIdeaPolling(currentIdeaRunId);
        loadIdeaCouncilUsage();
      } else {
        alert(res?.error || ideaT('idea_msg_quota_exceeded'));
      }
    } catch (err) {
      console.error('Failed to convene council:', err);
      alert(currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪º╪│╪¬╪»╪╣╪º╪í ┘ä╪¼┘å╪⌐ ╪º┘ä╪ú┘ü┘â╪º╪▒.' : 'Failed to convene idea council.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
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
        PENDING: { label: currentLanguage === 'ar' ? '╪¿╪º┘å╪¬╪╕╪º╪▒ ╪º┘ä╪¿╪»╪í' : 'Pending', color: 'var(--text-muted)', icon: 'fa-clock' },
        RUNNING: { label: currentLanguage === 'ar' ? '╪¼╪º╪▒┘ì ╪º┘ä╪¬╪¡┘ä┘è┘ä...' : 'Analyzing...', color: 'var(--cyan)', icon: 'fa-spinner fa-spin' },
        COMPLETED: { label: currentLanguage === 'ar' ? '╪º┘â╪¬┘à┘ä' : 'Completed', color: 'var(--green)', icon: 'fa-check' },
        FAILED: { label: currentLanguage === 'ar' ? '┘ü╪┤┘ä' : 'Failed', color: 'var(--red)', icon: 'fa-times' }
      };

      const sm = statusMap[status] || statusMap.PENDING;
      const roleName = ideaT(member.labelKey, member.key);

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
              ${insight ? escapeIdeaHtml(insight) : (currentLanguage === 'ar' ? '┘ü┘è ╪º┘å╪¬╪╕╪º╪▒ ┘ü╪¡╪╡ ╪º┘ä┘ü┘â╪▒╪⌐ ┘ê╪º┘ä╪ú╪»┘ä╪⌐...' : 'Awaiting evidence inspection...')}
            </p>
          </div>
        </div>
      `;
    }).join('');
  }

  function startIdeaPolling(runId) {
    if (ideaPollTimer) clearInterval(ideaPollTimer);

    const progressBar = document.getElementById('ideaSessionProgressBar');
    const stageText = document.getElementById('ideaSessionStageText');

    async function poll() {
      try {
        const res = await apiFetch(`/api/idea-council/runs/${runId}`);
        if (!res || !res.success || !res.data) return;
        const run = res.data;

        let pct = 15;
        let stg = ideaT('idea_step_research', 'Conducting live web market research...');

        if (run.stage === 'RESEARCH') {
          pct = 20;
          stg = currentLanguage === 'ar' ? '╪¼╪º╪▒┘ì ╪Ñ╪¼╪▒╪º╪í ╪º┘ä╪¿╪¡╪½ ╪º┘ä╪│┘ê┘é┘è ╪º┘ä┘à╪¿╪º╪┤╪▒ ┘ê╪¼┘à╪╣ ╪º┘ä╪ú╪»┘ä╪⌐...' : 'Conducting live web market research...';
        } else if (run.stage === 'AGENT_ANALYSIS' || run.stage === 'ANALYSIS') {
          const completed = (run.agents || []).filter(a => a.status === 'COMPLETED').length;
          const total = run.stageProgress?.agentsTotal || (run.agents || []).length || 8;
          pct = 25 + Math.round((completed / Math.max(1, total)) * 55);
          stg = (currentLanguage === 'ar' ? '╪ú╪╣╪╢╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐ ┘è╪¡┘ä┘ä┘ê┘å ╪º┘ä┘ü┘â╪▒╪⌐ ╪¿╪º┘ä╪¬┘ê╪º╪▓┘è' : 'Council members analyzing in parallel') + ` (${completed}/${total})...`;
        } else if (run.stage === 'SYNTHESIS') {
          pct = 88;
          stg = currentLanguage === 'ar' ? '╪▒╪ª┘è╪│ ╪º┘ä┘ä╪¼┘å╪⌐ ┘è╪╡┘è╪║ ╪º┘ä╪¬┘é╪▒┘è╪▒ ╪º┘ä┘å┘ç╪º╪ª┘è ┘ê┘ä┘ê╪¡╪⌐ ╪º┘ä╪¡┘é┘è┘é╪⌐...' : 'Chairperson synthesizing verdict and truth board...';
        }

        if (progressBar) progressBar.style.width = `${pct}%`;
        if (stageText) stageText.textContent = stg;

        renderCouncilAgentsGrid(run.agents || []);

        if (run.status === 'COMPLETED' || run.status === 'PARTIAL') {
          clearInterval(ideaPollTimer);
          ideaPollTimer = null;
          if (progressBar) progressBar.style.width = '100%';
          setTimeout(async () => {
            await openIdea(run.projectId);
          }, 800);
        } else if (run.status === 'FAILED') {
          clearInterval(ideaPollTimer);
          ideaPollTimer = null;
          if (stageText) {
            stageText.textContent = currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪¬╪┤╪║┘è┘ä ╪¼┘ä╪│╪⌐ ╪º┘ä╪¬┘é┘è┘è┘à.' : 'Evaluation run failed.';
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

  let activeIdeaRunId = null;

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

    const followupTypeNames = {
      DEFEND: { en: 'Defend', ar: '╪»┘ü╪º╪╣' },
      PIVOT: { en: 'Pivot', ar: '╪¬╪║┘è┘è╪▒ ┘à╪│╪º╪▒' },
      VALIDATION_PLAN: { en: 'Test Plan', ar: '╪«╪╖╪⌐ ┘ü╪¡╪╡' },
      VOTE: { en: 'Vote', ar: '╪¬╪╡┘ê┘è╪¬' },
      COMPARE: { en: 'Competitor', ar: '┘à┘é╪º╪▒┘å╪⌐' },
      MVP: { en: 'MVP Plan', ar: '╪«╪╖╪⌐ MVP' }
    };

    let activeRunObj = null;

    runs.forEach((run, idx) => {
      const runId = run.runId || run._id;
      const roundNum = run.roundNumber || (idx + 1);
      const isSelected = String(runId) === String(activeId) || (!activeId && idx === runs.length - 1);
      if (isSelected) activeRunObj = run;

      let roundLabel = '';
      if (idx === 0) {
        roundLabel = currentLanguage === 'ar' ? '╪º┘ä╪¼┘ê┘ä╪⌐ 1 (╪º┘ä╪¬┘é┘è┘è┘à ╪º┘ä╪ú┘ê┘ä┘è)' : 'Round 1 (Initial)';
      } else {
        const typeInfo = followupTypeNames[run.followupType];
        const typeLabel = typeInfo ? (currentLanguage === 'ar' ? typeInfo.ar : typeInfo.en) : (run.followupType || '');
        const suffix = typeLabel ? ` (${typeLabel})` : '';
        roundLabel = currentLanguage === 'ar' ? `╪º┘ä╪¼┘ê┘ä╪⌐ ${roundNum}${suffix}` : `Round ${roundNum}${suffix}`;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-sm ${isSelected ? 'btn-primary' : 'btn-secondary'}`;
      btn.style.fontSize = '12px';
      btn.style.padding = '6px 12px';
      btn.innerHTML = `${isSelected ? '<i class="fas fa-check-circle" style="margin-inline-end:4px;"></i>' : ''}${escapeIdeaHtml(roundLabel)}`;
      btn.addEventListener('click', () => {
        renderIdeaReport(currentIdea, runId);
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
        bannerEl.innerHTML = `<span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '┘à╪»╪«┘ä╪º╪¬ ╪º┘ä╪¼┘ê┘ä╪⌐:' : 'Round input:'}</span> <strong style="color:var(--cyan); font-weight:500;">"${escapeIdeaHtml(promptSnippet)}"</strong>`;
      } else {
        const isLatest = activeRunObj && runs.length > 0 && String(activeRunObj.runId || activeRunObj._id) === String(runs[runs.length - 1].runId || runs[runs.length - 1]._id);
        bannerEl.innerHTML = isLatest 
          ? `<span class="badge" style="background:rgba(16,185,129,0.15); color:var(--green); font-size:11px;">${currentLanguage === 'ar' ? '╪ú╪¡╪»╪½ ╪¼┘ê┘ä╪⌐ ╪¬┘é┘è┘è┘à' : 'Latest Evaluation Round'}</span>`
          : `<span class="badge" style="background:rgba(245,158,11,0.15); color:var(--orange); font-size:11px;">${currentLanguage === 'ar' ? '╪ú╪▒╪┤┘è┘ü ╪¼┘ê┘ä╪⌐ ╪│╪º╪¿┘é╪⌐' : 'Viewing Past Round'}</span>`;
      }
    }
  }

  function renderIdeaReport(idea, selectedRunId = null) {
    currentIdea = idea;

    // Resolve completed runs history
    const runs = Array.isArray(idea.runs) && idea.runs.length > 0 ? idea.runs : (idea.latestRun ? [idea.latestRun] : []);

    let currentRun = null;
    if (selectedRunId) {
      currentRun = runs.find(rn => String(rn.runId || rn._id) === String(selectedRunId));
    }
    if (!currentRun && activeIdeaRunId) {
      currentRun = runs.find(rn => String(rn.runId || rn._id) === String(activeIdeaRunId));
    }
    if (!currentRun && runs.length > 0) {
      currentRun = runs[runs.length - 1];
    }

    activeIdeaRunId = currentRun?.runId || currentRun?._id || idea.latestRunId || null;

    renderRunsHistoryBar(runs, activeIdeaRunId);

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
      vBadge.textContent = ideaT(vc.labelKey, r.verdict || 'VALIDATE_FIRST');
    }

    const titleEl = document.getElementById('ideaReportTitle');
    if (titleEl) titleEl.textContent = r.summary || idea.structuredCard?.title || idea.title || 'ΓÇö';

    const execEl = document.getElementById('ideaExecSummary');
    if (execEl) execEl.textContent = r.executiveSummary || 'ΓÇö';

    const explEl = document.getElementById('ideaVerdictExplanation');
    if (explEl) explEl.textContent = r.verdictExplanation || 'ΓÇö';

    const sevenDayEl = document.getElementById('idea7DayVerdictText');
    if (sevenDayEl) {
      sevenDayEl.textContent = r.sevenDayBuildVerdict?.recommendation || (r.sevenDayBuildVerdict?.canBuildIn7Days ? 'YES' : 'NO') || 'ΓÇö';
    }

    const oppEl = document.getElementById('ideaStrongestOpportunity');
    if (oppEl) oppEl.textContent = r.strongestOpportunity || 'ΓÇö';

    const riskEl = document.getElementById('ideaBiggestRisk');
    if (riskEl) riskEl.textContent = r.biggestRisk || 'ΓÇö';

    const assumpList = document.getElementById('ideaTopAssumptionsList');
    if (assumpList) {
      const items = Array.isArray(r.top3Assumptions) ? r.top3Assumptions : [];
      assumpList.innerHTML = items.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('') || '<li>ΓÇö</li>';
    }

    const questEl = document.getElementById('ideaCriticalQuestion');
    if (questEl) questEl.textContent = r.criticalQuestionToSettle || r.criticalQuestion || 'ΓÇö';

    const cutList = document.getElementById('ideaCutList');
    if (cutList) {
      const items = (Array.isArray(r.cutListForV1) && r.cutListForV1.length > 0)
        ? r.cutListForV1
        : (Array.isArray(r.killOrDeferList) ? r.killOrDeferList : []);
      cutList.innerHTML = items.map(c => `<li>${escapeIdeaHtml(c)}</li>`).join('') || '<li>ΓÇö</li>';
    }

    const vp = r.validationPlan || {};
    const valFields = {
      ideaValHypothesis: vp.coreHypothesis || vp.hypothesis || 'ΓÇö',
      ideaValAudience: vp.targetAudience || vp.audience || 'ΓÇö',
      ideaValChannel: vp.testingChannel || vp.channel || 'ΓÇö',
      ideaValDuration: vp.suggestedDuration || vp.duration || 'ΓÇö',
      ideaValMetric: vp.successMetric || vp.metric || 'ΓÇö',
      ideaValStop: vp.stopCondition || vp.stopCriteria || 'ΓÇö'
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
      mvpList.innerHTML = feats.map(f => `<li>${escapeIdeaHtml(f)}</li>`).join('') || '<li>ΓÇö</li>';
    }

    const wedgeVal = r.sevenDayMvpScope?.uniqueWedge || r.uniqueWedge || 'ΓÇö';
    const wedgeEl = document.getElementById('ideaUniqueWedge');
    if (wedgeEl) wedgeEl.textContent = wedgeVal;

    const firstVal = r.sevenDayMvpScope?.firstMomentOfValue || r.firstMomentOfValue || '';
    const firstValEl = document.getElementById('ideaFirstMomentOfValue');
    if (firstValEl) {
      if (firstVal) {
        firstValEl.textContent = currentLanguage === 'ar' ? `┘ä╪¡╪╕╪⌐ ╪º┘ä┘é┘è┘à╪⌐ ╪º┘ä╪ú┘ê┘ä┘ë: ${firstVal}` : `First Moment: ${firstVal}`;
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
        sourcesList.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">${currentLanguage === 'ar' ? '┘ä╪º ╪¬┘ê╪¼╪» ┘à╪╡╪º╪»╪▒ ╪«╪º╪▒╪¼┘è╪⌐ ┘à╪¿╪º╪┤╪▒╪⌐.' : 'No external web sources available.'}</span>`;
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
    const isSuperadmin = Boolean(ideaUsageData?.isSuperadmin || idea.isSuperadmin);
    const roundsRem = isSuperadmin ? 'Γê₧' : (idea.followupRoundsRemaining ?? idea.followUpRoundsRemaining ?? Math.max(0, 3 - (idea.followupRoundsUsed || 0)));
    if (followCountEl) followCountEl.textContent = roundsRem;

    document.querySelectorAll('.idea-followup-btn').forEach(btn => {
      btn.disabled = !isSuperadmin && (Number(roundsRem) <= 0);
    });

    const agents = currentRun?.agents || idea.agents || idea.latestRun?.agents || [];
    renderUnitEconomics(r.unitEconomics);
    renderCriticsBreakdown(agents);

    const truthItems = currentRun?.truthBoard || idea.truthBoardItems || r.truthBoardItems || [];
    renderTruthBoard(truthItems);
  }

  function renderCriticsBreakdown(agents = []) {
    const container = document.getElementById('ideaCriticsBreakdownList');
    if (!container) return;

    if (!Array.isArray(agents) || agents.length === 0) {
      container.innerHTML = `<div style="padding:16px; text-align:center; color:var(--text-muted); font-size:13px;">${currentLanguage === 'ar' ? '┘ä┘à ┘è╪¬┘à ╪¡┘ü╪╕ ╪¬┘é╪º╪▒┘è╪▒ ╪ú╪╣╪╢╪º╪í ╪º┘ä┘ä╪¼┘å╪⌐ ╪¿╪╣╪».' : 'No council member critiques recorded yet.'}</div>`;
      return;
    }

    const cardsHtml = COUNCIL_MEMBERS.map(member => {
      const agent = agents.find(a => a.role === member.key);
      const output = agent?.output || {};
      const status = agent?.status || (output && Object.keys(output).length > 0 ? 'COMPLETED' : 'PENDING');
      const roleTitle = ideaT(member.labelKey, member.key);
      const roleDesc = ideaT(member.roleKey, '');

      let metricsHtml = '';
      if (member.key === 'COLD_CUSTOMER') {
        metricsHtml = `
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-bottom:12px; font-size:12px;">
            <div style="background:rgba(239, 68, 68, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(239, 68, 68, 0.2);">
              <strong style="color:var(--red); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪│╪¿╪¿ ╪º┘ä╪▒┘ü╪╢ ┘ê╪º┘ä╪¬╪▒╪»╪»:' : 'Rejection Reason:'}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.rejectionReason || 'ΓÇö')}</span>
            </div>
            <div style="background:rgba(245, 158, 11, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(245, 158, 11, 0.2);">
              <strong style="color:var(--orange); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪¬┘â┘ä┘ü╪⌐ ╪º┘ä╪¬╪¿╪»┘è┘ä ┘ê╪º┘ä╪º┘å╪¬┘é╪º┘ä:' : 'Switching Cost:'}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.switchingCost || 'ΓÇö')}</span>
            </div>
            <div style="background:rgba(6, 182, 212, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(6, 182, 212, 0.2);">
              <strong style="color:var(--cyan); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '┘à╪¡┘ü╪▓ ╪º┘ä╪¬╪¼╪▒╪¿╪⌐ ╪º┘ä╪¡┘é┘è┘é┘è:' : 'Trigger to Try:'}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.triggerToTry || 'ΓÇö')}</span>
            </div>
            ${output.willingnessToPay ? `
            <div style="background:rgba(16, 185, 129, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(16, 185, 129, 0.2);">
              <strong style="color:var(--green); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪º┘ä╪º╪│╪¬╪╣╪»╪º╪» ┘ä┘ä╪»┘ü╪╣:' : 'Willingness to Pay:'}</strong>
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
              <strong style="color:var(--red);">${currentLanguage === 'ar' ? '╪ú╪╢╪╣┘ü ┘å┘é╪╖╪⌐ ┘ü┘è ╪º┘ä┘à┘ü┘ç┘ê┘à:' : 'Weakest Link:'}</strong>
              <span style="color:#e2e8f0; margin-inline-start:4px;">${escapeIdeaHtml(output.weakestLink)}</span>
            </div>` : ''}
            ${assumptions.length > 0 ? `
            <div>
              <strong style="color:var(--orange); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '╪ú╪«╪╖╪▒ ╪º┘ä╪º┘ü╪¬╪▒╪º╪╢╪º╪¬ ╪║┘è╪▒ ╪º┘ä┘à╪½╪¿╪¬╪⌐:' : 'Deadliest Assumptions:'}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${assumptions.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('')}
              </ul>
            </div>` : ''}
            ${hardQuestions.length > 0 ? `
            <div>
              <strong style="color:var(--cyan); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '╪ú╪│╪ª┘ä╪⌐ ╪¡╪º╪│┘à╪⌐ ╪¬╪¬╪╖┘ä╪¿ ╪Ñ╪½╪¿╪º╪¬╪º┘ï ╪¿╪º┘ä╪ú╪▒┘é╪º┘à:' : 'Hard Questions to Settle:'}</strong>
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
              <span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '┘à╪│╪¬┘ê┘ë ╪º┘ä╪¬╪╣┘é┘è╪» ╪º┘ä┘ç┘å╪»╪│┘è:' : 'Complexity Level:'}</span>
              <span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan); font-weight:700;">${escapeIdeaHtml(output.complexityLevel || 'MEDIUM')}</span>
            </div>
            ${mvpScope.length > 0 ? `
            <div>
              <strong style="color:var(--purple-light); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '┘å╪╖╪º┘é MVP ╪º┘ä┘é╪º╪¿┘ä ┘ä┘ä╪Ñ╪╖┘ä╪º┘é ╪«┘ä╪º┘ä 7 ╪ú┘è╪º┘à:' : '7-Day MVP Scope:'}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${mvpScope.map(item => `<li>${escapeIdeaHtml(item)}</li>`).join('')}
              </ul>
            </div>` : ''}
            ${deferred.length > 0 ? `
            <div>
              <strong style="color:var(--text-muted); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '┘à╪º ┘è╪¼╪¿ ╪¡╪░┘ü┘ç/╪¬╪ú╪¼┘è┘ä┘ç ╪«╪º╪▒╪¼ ╪º┘ä┘å╪│╪«╪⌐ ╪º┘ä╪ú┘ê┘ä┘ë:' : 'Cut / Deferred for V1:'}</strong>
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
              <span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '╪¬╪┤╪¿╪╣ ╪º┘ä╪│┘ê┘é:' : 'Market Saturation:'}</span>
              <strong style="color:#fff;">${escapeIdeaHtml(output.marketSaturation || 'ΓÇö')}</strong>
            </div>
            ${directAlts.length > 0 ? `
            <div>
              <strong style="color:var(--cyan); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '╪º┘ä┘à┘å╪º┘ü╪│┘ê┘å ┘ê╪º┘ä╪¿╪»╪º╪ª┘ä ╪º┘ä┘à╪¿╪º╪┤╪▒╪⌐ ┘ü┘è ╪º┘ä╪│┘ê┘é:' : 'Direct Market Competitors:'}</strong>
              <div style="display:flex; flex-wrap:wrap; gap:6px;">
                ${directAlts.map(alt => `<span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan);">${escapeIdeaHtml(alt)}</span>`).join('')}
              </div>
            </div>` : ''}
            ${indirectAlts.length > 0 ? `
            <div>
              <strong style="color:var(--text-muted); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '╪º┘ä╪¿╪»╪º╪ª┘ä ╪║┘è╪▒ ╪º┘ä┘à╪¿╪º╪┤╪▒╪⌐ ┘ê╪╖╪▒┘é ╪º┘ä╪╣┘à┘ä ╪º┘ä╪¡╪º┘ä┘è╪⌐:' : 'Indirect Alternatives & Workarounds:'}</strong>
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
              <strong style="color:var(--red); display:block; margin-bottom:3px;">${currentLanguage === 'ar' ? '╪º┘ä╪│╪¿╪¿ ╪º┘ä╪¼╪░╪▒┘è ╪º┘ä╪ú┘ê┘ä ╪º┘ä╪░┘è ┘é╪» ┘è┘é╪╢┘è ╪╣┘ä┘ë ╪º┘ä┘à╪┤╪▒┘ê╪╣:' : 'Primary Root Cause of Death:'}</strong>
              <span style="color:#fff; font-weight:600;">${escapeIdeaHtml(output.primaryFailureReason)}</span>
            </div>` : ''}
            ${conditions.length > 0 ? `
            <div>
              <strong style="color:var(--red); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '╪┤╪▒┘ê╪╖ ┘ê╪│┘è┘å╪º╪▒┘è┘ê┘ç╪º╪¬ ╪º┘ä┘ü╪┤┘ä:' : 'Failure Conditions:'}</strong>
              <ul style="margin:0; padding-inline-start:18px; color:#cbd5e1;">
                ${conditions.map(c => `<li>${escapeIdeaHtml(c)}</li>`).join('')}
              </ul>
            </div>` : ''}
            ${warnings.length > 0 ? `
            <div>
              <strong style="color:var(--orange); display:block; margin-bottom:4px;">${currentLanguage === 'ar' ? '┘à╪ñ╪┤╪▒╪º╪¬ ╪º┘ä╪«╪╖╪▒ ╪º┘ä┘à╪¿┘â╪▒╪⌐:' : 'Early Warning Signs:'}</strong>
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
              <strong style="color:var(--purple-light); display:block; margin-bottom:3px;">${currentLanguage === 'ar' ? '╪▓╪º┘ê┘è╪⌐ ╪º┘ä╪»╪«┘ê┘ä ╪º┘ä╪¡╪º╪»╪⌐ (Unique Wedge):' : 'Unique Wedge Angle:'}</strong>
              <span style="color:#fff;">${escapeIdeaHtml(output.uniqueWedge)}</span>
            </div>` : ''}
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div>
                <strong style="color:var(--cyan); display:block;">${currentLanguage === 'ar' ? '╪º┘ä┘é╪º╪¿┘ä┘è╪⌐ ┘ä┘ä╪»┘ü╪º╪╣ ╪╢╪» ╪º┘ä┘à┘å╪º┘ü╪│┘è┘å:' : 'Defensibility Moat:'}</strong>
                <span style="color:#cbd5e1;">${escapeIdeaHtml(output.defensibility || 'ΓÇö')}</span>
              </div>
              <div>
                <strong style="color:var(--orange); display:block;">${currentLanguage === 'ar' ? '╪│┘ç┘ê┘ä╪⌐ ┘ê╪│╪▒╪╣╪⌐ ╪º┘ä┘å╪│╪«:' : 'Ease / Speed of Copying:'}</strong>
                <span style="color:#cbd5e1;">${escapeIdeaHtml(output.easeOfCopying || 'ΓÇö')}</span>
              </div>
            </div>
          </div>
        `;
      } else if (member.key === 'UX_DESIGNER') {
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.firstMomentOfValue60s ? `
            <div style="background:rgba(6, 182, 212, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(6, 182, 212, 0.2);">
              <strong style="color:var(--cyan); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪ú┘ê┘ä ┘ä╪¡╪╕╪⌐ ┘é┘è┘à╪⌐ ┘ü┘è ╪º┘ä┘Ç 60 ╪½╪º┘å┘è╪⌐ ╪º┘ä╪ú┘ê┘ä┘ë:' : 'First Moment of Value in 60s:'}</strong>
              <span style="color:#fff;">${escapeIdeaHtml(output.firstMomentOfValue60s)}</span>
            </div>` : ''}
            ${output.biggestFriction ? `
            <div style="background:rgba(239, 68, 68, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(239, 68, 68, 0.2);">
              <strong style="color:var(--red); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪ú┘â╪¿╪▒ ┘å┘é╪╖╪⌐ ╪º╪¡╪¬┘â╪º┘â ╪ú┘ê ╪¬╪│╪▒╪¿ ┘ä┘ä┘à╪│╪¬╪«╪»┘à┘è┘å:' : 'Biggest Friction / Drop-off Point:'}</strong>
              <span style="color:#e2e8f0;">${escapeIdeaHtml(output.biggestFriction)}</span>
            </div>` : ''}
          </div>
        `;
      } else if (member.key === 'CANDID_CHAMPION') {
        metricsHtml = `
          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px; font-size:12px;">
            ${output.coreStrength ? `
            <div style="background:rgba(16, 185, 129, 0.08); border-radius:6px; padding:8px 10px; border:1px solid rgba(16, 185, 129, 0.2);">
              <strong style="color:var(--green); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪º┘ä╪┤╪▒╪º╪▒╪⌐ ╪º┘ä╪¡┘é┘è┘é┘è╪⌐ ┘ê┘å┘é╪╖╪⌐ ╪º┘ä┘é┘ê╪⌐ ╪º┘ä╪¼┘ê┘ç╪▒┘è╪⌐:' : 'Core Strength Worth Fighting For:'}</strong>
              <span style="color:#fff;">${escapeIdeaHtml(output.coreStrength)}</span>
            </div>` : ''}
            ${output.reasonToProceed ? `
            <div>
              <strong style="color:var(--cyan); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪ú┘é┘ê┘ë ╪│╪¿╪¿ ┘ä┘ä╪º╪│╪¬┘à╪▒╪º╪▒ ┘ê╪╣╪»┘à ╪º┘ä╪¬╪▒╪º╪¼╪╣:' : 'Single Best Reason to Proceed:'}</strong>
              <span style="color:#cbd5e1;">${escapeIdeaHtml(output.reasonToProceed)}</span>
            </div>` : ''}
            ${output.indispensableAsset ? `
            <div>
              <strong style="color:var(--orange); display:block; margin-bottom:2px;">${currentLanguage === 'ar' ? '╪º┘ä╪ú╪╡┘ä ╪º┘ä╪░┘è ┘ä╪º ┘è┘à┘â┘å ╪º┘ä╪¬┘å╪º╪▓┘ä ╪╣┘å┘ç:' : 'Indispensable Asset:'}</strong>
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
              let bLabel = currentLanguage === 'ar' ? '╪º┘â╪¬┘à┘ä ╪º┘ä╪¬╪¡┘ä┘è┘ä' : 'Analyzed';
              let bBg = 'rgba(16, 185, 129, 0.15)';
              let bColor = 'var(--green)';

              if (status !== 'COMPLETED') {
                bLabel = currentLanguage === 'ar' ? '┘é┘è╪» ╪º┘ä┘à╪▒╪º╪¼╪╣╪⌐' : 'Pending';
                bBg = 'rgba(245, 158, 11, 0.15)';
                bColor = 'var(--orange)';
              } else if (isCarryover) {
                bLabel = currentLanguage === 'ar' ? '╪º┘ä╪¼┘ê┘ä╪⌐ ╪º┘ä╪│╪º╪¿┘é╪⌐' : 'Prior Round';
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
              ${currentLanguage === 'ar' ? '╪º┘ä╪¿┘è╪º┘å ╪º┘ä┘å┘ç╪º╪ª┘è ┘ä┘ä┘å╪º┘é╪»:' : 'Full Critic Verdict:'}
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
        beEl.textContent = 'Γê₧';
        beEl.style.color = 'var(--red)';
      }
      if (dailyEl) {
        dailyEl.textContent = 'ΓÇö';
        dailyEl.style.color = 'var(--red)';
      }
      if (riskBox && riskText) {
        riskBox.style.display = 'flex';
        riskBox.style.background = 'rgba(239, 68, 68, 0.12)';
        riskBox.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        riskText.textContent = currentLanguage === 'ar'
          ? '╪¬╪¡╪░┘è╪▒ ╪¡╪▒╪¼: ╪╡╪º┘ü┘è ╪º┘ä┘à╪│╪º┘ç┘à╪⌐ ╪│╪º┘ä╪¿! ╪¬╪«╪│╪▒ ╪ú┘à┘ê╪º┘ä╪º┘ï ┘ü┘è ┘â┘ä ╪╖┘ä╪¿ ┘é╪¿┘ä ╪¡╪│╪º╪¿ ╪º┘ä┘à╪╡╪º╪▒┘è┘ü ╪º┘ä╪½╪º╪¿╪¬╪⌐.'
          : 'Critical Warning: Negative contribution margin! You lose money on every order before overhead.';
      }
    } else {
      const monthlyOrders = Math.ceil(fixedCosts / netContributionPerUnit);
      const dailyOrders = Math.ceil(monthlyOrders / 30);

      if (beEl) {
        beEl.textContent = `${monthlyOrders.toLocaleString()} ${currentLanguage === 'ar' ? '╪╖┘ä╪¿/╪┤┘ç╪▒' : 'orders/mo'}`;
        beEl.style.color = 'var(--cyan)';
      }
      if (dailyEl) {
        dailyEl.textContent = `${dailyOrders.toLocaleString()} ${currentLanguage === 'ar' ? '╪╖┘ä╪¿/┘è┘ê┘à' : 'orders/day'}`;
        dailyEl.style.color = 'var(--purple-light)';
      }

      if (riskBox && riskText) {
        if (dailyOrders > 250) {
          riskBox.style.display = 'flex';
          riskBox.style.background = 'rgba(245, 158, 11, 0.12)';
          riskBox.style.borderColor = 'rgba(245, 158, 11, 0.4)';
          riskText.style.color = '#fca5a5';
          riskText.textContent = currentLanguage === 'ar'
            ? `┘à╪«╪º╪╖╪▒╪⌐ ╪¡╪¼┘à ┘à╪▒╪¬┘ü╪╣╪⌐: ╪¬╪¡╪¬╪º╪¼ ┘ä╪ú┘â╪½╪▒ ┘à┘å ${dailyOrders} ╪╖┘ä╪¿ ┘è┘ê┘à┘è╪º┘ï ┘ä╪¬╪║╪╖┘è╪⌐ ╪º┘ä┘å┘ü┘é╪º╪¬ ╪º┘ä╪½╪º╪¿╪¬╪⌐.`
            : `High Volume Hurdle: Requires ${dailyOrders} orders daily just to break even on fixed costs.`;
        } else {
          riskBox.style.display = 'flex';
          riskBox.style.background = 'rgba(16, 185, 129, 0.08)';
          riskBox.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          riskText.style.color = 'var(--green)';
          riskText.textContent = ideaT('idea_unit_econ_risk_none', 'Healthy margin profile at current parameters.');
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

  function openIdeaCompareModal() {
    const modal = document.getElementById('ideaRoundsComparisonModal');
    if (!modal) return;
    const runs = Array.isArray(currentIdea?.runs) ? currentIdea.runs : [];
    if (runs.length < 2) {
      alert(ideaT('idea_compare_no_rounds'));
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
          ? `${ideaT('idea_round_prefix', 'Round')} 1 (${currentLanguage === 'ar' ? '╪º┘ä╪¬┘é┘è┘è┘à ╪º┘ä╪ú┘ê┘ä┘è' : 'Initial'})`
          : `${ideaT('idea_round_prefix', 'Round')} ${roundNum} (${r.followupType || 'FOLLOW_UP'})`;
        
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

    modal.classList.add('active');
  }

  function closeIdeaCompareModal() {
    const modal = document.getElementById('ideaRoundsComparisonModal');
    if (modal) modal.classList.remove('active');
  }

  function handleCompareSelectChange() {
    const runs = Array.isArray(currentIdea?.runs) ? currentIdea.runs : [];
    const valA = document.getElementById('ideaCompareSelectA')?.value;
    const valB = document.getElementById('ideaCompareSelectB')?.value;

    const runA = runs.find(r => String(r.runId || r._id) === String(valA));
    const runB = runs.find(r => String(r.runId || r._id) === String(valB));

    renderRoundsComparison(runA, runB);
  }

  function renderRoundsComparison(runA, runB) {
    const container = document.getElementById('ideaCompareDeltaContent');
    if (!container) return;

    if (!runA || !runB) {
      container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">${ideaT('idea_compare_no_rounds')}</div>`;
      return;
    }

    const rA = runA.finalReport || {};
    const rB = runB.finalReport || {};

    const numA = runA.roundNumber || 1;
    const numB = runB.roundNumber || 2;
    const labelA = `${ideaT('idea_round_prefix', 'Round')} ${numA}`;
    const labelB = `${ideaT('idea_round_prefix', 'Round')} ${numB}`;

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
            ${ideaT('idea_compare_founder_defense', 'Founder Defense & Arguments')} (${labelB})
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
          <i class="fas fa-gavel"></i> ${ideaT('idea_compare_verdict', 'Executive Verdict')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="color:var(--text-muted); font-size:12px;">${escapeIdeaHtml(labelA)}</strong>
              <span class="badge" style="background:rgba(6,182,212,0.15); color:var(--cyan); font-size:11px;">${escapeIdeaHtml(rA.verdict || 'ΓÇö')}</span>
            </div>
            <p style="font-size:12px; color:#e2e8f0; margin:0; line-height:1.5;">${escapeIdeaHtml(rA.verdictExplanation || rA.executiveSummary || 'ΓÇö')}</p>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; border-inline-start:3px solid var(--green);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <strong style="color:var(--text-muted); font-size:12px;">${escapeIdeaHtml(labelB)}</strong>
              <span class="badge" style="background:rgba(16,185,129,0.15); color:var(--green); font-size:11px;">${escapeIdeaHtml(rB.verdict || 'ΓÇö')}</span>
            </div>
            <p style="font-size:12px; color:#e2e8f0; margin:0; line-height:1.5;">${escapeIdeaHtml(rB.verdictExplanation || rB.executiveSummary || 'ΓÇö')}</p>
          </div>
        </div>
      </div>

      <!-- Assumptions Delta -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--orange); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-layer-group"></i> ${ideaT('idea_compare_assumptions', 'Assumptions Evolution')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px;">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:8px;">${escapeIdeaHtml(labelA)}</strong>
            <ul style="padding-inline-start:18px; margin:0; font-size:12px; color:#e2e8f0;">
              ${assumpA.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('') || '<li>ΓÇö</li>'}
            </ul>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; border-inline-start:3px solid var(--orange);">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:8px;">${escapeIdeaHtml(labelB)}</strong>
            <ul style="padding-inline-start:18px; margin:0; font-size:12px; color:#e2e8f0;">
              ${assumpB.map(a => `<li>${escapeIdeaHtml(a)}</li>`).join('') || '<li>ΓÇö</li>'}
            </ul>
          </div>
        </div>
      </div>

      <!-- Critical Question Delta -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--cyan); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-circle-question"></i> ${ideaT('idea_compare_question', 'Critical Question to Settle')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px;">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:6px;">${escapeIdeaHtml(labelA)}</strong>
            <p style="font-size:12px; color:#e2e8f0; margin:0;">${escapeIdeaHtml(rA.criticalQuestionToSettle || rA.criticalQuestion || 'ΓÇö')}</p>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; border-inline-start:3px solid var(--cyan);">
            <strong style="color:var(--text-muted); font-size:12px; display:block; margin-bottom:6px;">${escapeIdeaHtml(labelB)}</strong>
            <p style="font-size:12px; color:#fff; font-weight:600; margin:0;">${escapeIdeaHtml(rB.criticalQuestionToSettle || rB.criticalQuestion || 'ΓÇö')}</p>
          </div>
        </div>
      </div>

      <!-- Validation Plan Delta -->
      <div class="glass-card" style="padding:16px;">
        <h4 style="font-size:13px; color:var(--green); margin-bottom:12px; display:flex; align-items:center; gap:6px;">
          <i class="fas fa-vial"></i> ${ideaT('idea_compare_validation', 'Validation Plan Progression')}
        </h4>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; font-size:12px;">
            <strong style="color:var(--text-muted); display:block; margin-bottom:6px;">${escapeIdeaHtml(labelA)}</strong>
            <div><span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '╪º┘ä┘à╪»╪⌐ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐:' : 'Duration:'}</span> <strong style="color:var(--cyan);">${escapeIdeaHtml(vpA.suggestedDuration || vpA.duration || 'ΓÇö')}</strong></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '┘à╪╣┘è╪º╪▒ ╪º┘ä┘å╪¼╪º╪¡:' : 'Success Metric:'}</span> <span>${escapeIdeaHtml(vpA.successMetric || vpA.metric || 'ΓÇö')}</span></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '╪┤╪▒╪╖ ╪º┘ä╪¬┘ê┘é┘ü:' : 'Stop Condition:'}</span> <span>${escapeIdeaHtml(vpA.stopCondition || vpA.stopCriteria || 'ΓÇö')}</span></div>
          </div>
          <div style="background:rgba(255,255,255,0.02); border:1px solid var(--glass-border); border-radius:8px; padding:12px; font-size:12px; border-inline-start:3px solid var(--green);">
            <strong style="color:var(--text-muted); display:block; margin-bottom:6px;">${escapeIdeaHtml(labelB)}</strong>
            <div><span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '╪º┘ä┘à╪»╪⌐ ╪º┘ä┘à┘é╪¬╪▒╪¡╪⌐:' : 'Duration:'}</span> <strong style="color:var(--cyan);">${escapeIdeaHtml(vpB.suggestedDuration || vpB.duration || 'ΓÇö')}</strong></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '┘à╪╣┘è╪º╪▒ ╪º┘ä┘å╪¼╪º╪¡:' : 'Success Metric:'}</span> <strong style="color:var(--green);">${escapeIdeaHtml(vpB.successMetric || vpB.metric || 'ΓÇö')}</strong></div>
            <div style="margin-top:4px;"><span style="color:var(--text-muted);">${currentLanguage === 'ar' ? '╪┤╪▒╪╖ ╪º┘ä╪¬┘ê┘é┘ü:' : 'Stop Condition:'}</span> <strong style="color:var(--red);">${escapeIdeaHtml(vpB.stopCondition || vpB.stopCriteria || 'ΓÇö')}</strong></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTruthBoard(items = []) {
    const container = document.getElementById('truthBoardItemsList');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:20px;">${currentLanguage === 'ar' ? '┘ä╪º ╪¬┘ê╪¼╪» ╪╣┘å╪º╪╡╪▒ ┘à╪│╪¼┘ä╪⌐ ┘ü┘è ┘ä┘ê╪¡╪⌐ ╪º┘ä╪¡┘é┘è┘é╪⌐.' : 'No truth items recorded yet.'}</div>`;
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
      const catLabel = ideaT(cc.labelKey, category);
      const currentStatus = item.status || item.workflowState || 'UNVERIFIED';

      return `
        <div class="glass-card truth-board-card" data-id="${escapeIdeaHtml(String(itemId))}" style="padding:14px; background:rgba(255,255,255,0.02);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="badge" style="background:${cc.bg}; color:${cc.text}; font-size:11px;">
              ${escapeIdeaHtml(catLabel)}
            </span>
            <select class="form-control form-control-sm truth-item-status-select" data-id="${escapeIdeaHtml(String(itemId))}" style="width:auto; padding:4px 28px 4px 10px; font-size:11px; height:auto;">
              <option value="UNVERIFIED" ${currentStatus === 'UNVERIFIED' || currentStatus === 'OPEN' ? 'selected' : ''}>${ideaT('idea_tb_status_open')}</option>
              <option value="IN_PROGRESS" ${currentStatus === 'IN_PROGRESS' ? 'selected' : ''}>${ideaT('idea_tb_status_validating')}</option>
              <option value="VALIDATED" ${currentStatus === 'VALIDATED' ? 'selected' : ''}>${ideaT('idea_tb_status_verified')}</option>
              <option value="INVALIDATED" ${currentStatus === 'INVALIDATED' ? 'selected' : ''}>${ideaT('idea_tb_status_dismissed')}</option>
              <option value="BLOCKED" ${currentStatus === 'BLOCKED' ? 'selected' : ''}>${ideaT('idea_tb_status_blocked')}</option>
            </select>
          </div>
          <p style="font-size:13px; color:#fff; margin:0 0 10px 0; line-height:1.4;">${escapeIdeaHtml(item.statement || '')}</p>
          <input type="text" class="form-control form-control-sm truth-item-notes-input" data-id="${escapeIdeaHtml(String(itemId))}" value="${escapeIdeaHtml(item.notes || item.userNotes || '')}" placeholder="${ideaT('idea_tb_notes_placeholder')}" style="font-size:11px; padding:6px 10px;" />
        </div>
      `;
    }).join('');

    container.querySelectorAll('.truth-item-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.getAttribute('data-id');
        await updateTruthItem(id, { status: sel.value, workflowState: sel.value }, sel);
      });
    });

    container.querySelectorAll('.truth-item-notes-input').forEach(inp => {
      inp.addEventListener('blur', async () => {
        const id = inp.getAttribute('data-id');
        await updateTruthItem(id, { notes: inp.value.trim(), userNotes: inp.value.trim() }, inp);
      });
    });
  }

  async function updateTruthItem(itemId, patchData, triggerEl) {
    try {
      const ideaId = currentIdea?._id || currentIdea?.id;
      const url = ideaId
        ? `/api/idea-council/ideas/${ideaId}/truth-items/${itemId}`
        : `/api/idea-council/truth-items/${itemId}`;
      const res = await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(patchData)
      });
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

  let activeFollowupType = 'DEFEND';

  function openIdeaFollowupModal(type = 'DEFEND') {
    const modal = document.getElementById('ideaFollowupModal');
    if (!modal) return;

    const ideaId = currentIdea?._id || currentIdea?.id;
    if (!ideaId) return;

    const isSuperadmin = Boolean(ideaUsageData?.isSuperadmin || currentIdea?.isSuperadmin);
    const roundsRem = isSuperadmin ? 'Γê₧' : (currentIdea.followupRoundsRemaining ?? currentIdea.followUpRoundsRemaining ?? Math.max(0, 3 - (currentIdea.followupRoundsUsed || 0)));
    if (!isSuperadmin && Number(roundsRem) <= 0) {
      alert(currentLanguage === 'ar' ? '┘ä┘é╪» ╪º╪│╪¬┘å┘ü╪»╪¬ ╪¼┘à┘è╪╣ ╪¼┘ê┘ä╪º╪¬ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐ ╪º┘ä┘à╪¬╪º╪¡╪⌐ ┘ä┘ç╪░┘ç ╪º┘ä┘ü┘â╪▒╪⌐ (3 ╪¼┘ê┘ä╪º╪¬).' : 'All 3 follow-up rounds used for this idea.');
      return;
    }

    activeFollowupType = type || 'DEFEND';

    // Update Round Badge
    const roundBadge = document.getElementById('ideaFollowupRoundBadge');
    if (roundBadge) {
      const nextRound = (currentIdea.followupRoundsUsed || 0) + 2;
      roundBadge.textContent = currentLanguage === 'ar' ? `╪º┘ä╪¼┘ê┘ä╪⌐ ${nextRound}` : `Round ${nextRound}`;
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
    if (promptInput) setTimeout(() => promptInput.focus(), 100);
  }

  function closeIdeaFollowupModal() {
    const modal = document.getElementById('ideaFollowupModal');
    if (modal) modal.classList.remove('active');
  }

  function updateFollowupTypeButtons(selectedType) {
    activeFollowupType = selectedType;
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
      alert(ideaT('idea_followup_err_empty'));
      if (promptInput) promptInput.focus();
      return;
    }

    const criticLabel = criticSelect ? criticSelect.options[criticSelect.selectedIndex].text : '';
    const modeLabel = modeSelect ? modeSelect.options[modeSelect.selectedIndex].text : '';
    const extraEvidence = evidenceInput ? evidenceInput.value.trim() : '';

    const parts = [];
    if (selectedChips.length > 0) {
      parts.push(`[Strategic Angles / ┘à┘è╪▓╪º╪¬ ╪º╪│╪¬╪▒╪º╪¬┘è╪¼┘è╪⌐]: ${selectedChips.join(' | ')}`);
    }
    if (criticSelect && criticSelect.value !== 'ALL') {
      parts.push(`[Target Critic Focus / ╪º┘ä┘å╪º┘é╪» ╪º┘ä┘à╪│╪¬┘ç╪»┘ü]: ${criticLabel}`);
    }
    if (modeLabel) {
      parts.push(`[Review Tone / ╪ú╪│┘ä┘ê╪¿ ╪º┘ä┘à╪▒╪º╪¼╪╣╪⌐]: ${modeLabel}`);
    }
    if (extraEvidence) {
      parts.push(`[Extra Evidence / ╪ú╪»┘ä╪⌐ ┘ê╪ú╪▒┘é╪º┘à ╪Ñ╪╢╪º┘ü┘è╪⌐]: ${extraEvidence}`);
    }
    if (mainDefense) {
      parts.push(`[Founder Defense & Details / ╪¡╪¼╪¼ ┘ê╪¬┘ü╪º╪╡┘è┘ä ╪º┘ä┘à╪ñ╪│╪│]:\n${mainDefense}`);
    }

    const combinedPrompt = parts.join('\n\n');

    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-inline-end:6px;"></i> ' + (currentLanguage === 'ar' ? '╪¼╪º╪▒┘ì ╪º┘ä╪Ñ╪╖┘ä╪º┘é...' : 'Launching...');
    }

    try {
      const idempotencyKey = `followup-${ideaId}-${Date.now()}`;
      const res = await apiFetch(`/api/idea-council/ideas/${ideaId}/follow-up`, {
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
      });

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
        alert(res?.error || res?.message || (currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪¬┘å┘ü┘è╪░ ╪¼┘ê┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐.' : 'Failed to run follow-up round.'));
      }
    } catch (err) {
      console.error('Follow-up submit error:', err);
      alert(currentLanguage === 'ar' ? '╪¡╪»╪½ ╪«╪╖╪ú ╪ú╪½┘å╪º╪í ╪¬┘å┘ü┘è╪░ ╪¼┘ê┘ä╪⌐ ╪º┘ä┘à╪¬╪º╪¿╪╣╪⌐.' : 'Error during follow-up round.');
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

  async function exportIdeaReport(format) {
    if (!currentIdea || !currentIdea._id) return;
    try {
      const token = getToken();
      const res = await fetch(`/api/idea-council/ideas/${currentIdea._id}/export?format=${format}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
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
      alert(currentLanguage === 'ar' ? '┘ü╪┤┘ä ╪¬╪╡╪»┘è╪▒ ╪º┘ä╪¬┘é╪▒┘è╪▒.' : 'Failed to export report.');
    }
  }

  function initIdeaCouncil() {
    const ideaNewBtn = document.getElementById('ideaNewBtn');
    if (ideaNewBtn) {
      ideaNewBtn.addEventListener('click', () => {
        if (ideaUsageData && !ideaUsageData.isSuperadmin && !ideaUsageData.isUnlimited && Number(ideaUsageData.ideasRemaining) <= 0) {
          alert(ideaT('idea_msg_quota_exceeded'));
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
        if (langEl) langEl.value = currentLanguage === 'en' ? 'en' : 'ar';
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
          await apiFetch(`/api/idea-council/ideas/${currentIdea._id}/card`, {
            method: 'PUT',
            body: JSON.stringify(card)
          });
          alert(ideaT('idea_msg_card_saved'));
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

  // Expose minimal hooks for settings-summary module
  window.switchTab = switchTab;
  window.__zainbotSettingsHooks = true;

  // Initialize and Boot System
  initIdeaCouncil();
  checkAuthAndLoad();
  applyLanguage(currentLanguage);

})();
