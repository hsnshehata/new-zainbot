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
      preview_status_online: 'Online · AI Sales Ready',
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
      idea_truth_board_title: 'Dynamic Truth Board',
      idea_truth_board_desc: 'Track key assumptions, risks, and validation steps in real time without consuming AI quotas.',
      idea_tb_status_open: 'Open',
      idea_tb_status_validating: 'Validating',
      idea_tb_status_verified: 'Verified',
      idea_tb_status_dismissed: 'Dismissed',
      idea_tb_notes_placeholder: 'Founder validation notes...',
      idea_btn_export_md: 'Export Markdown',
      idea_btn_export_pdf: 'Print / PDF',
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
      menu_overview: 'نظرة عامة',
      menu_inbox: 'صندوق الوارد الموحد',
      menu_training: 'تدريب الذكاء الاصطناعي',
      menu_channels: 'ربط القنوات',
      menu_orders: 'الطلبات والحجوزات',
      menu_settings: 'الإعدادات والاشتراك',
      menu_admin: 'لوحة تحكم الأدمن',
      menu_agents: 'الوكلاء الذكيون',
      agents_title: 'الوكلاء الذكيون',
      agents_desc: 'أنشئ وكلاء منفصلين للدعم والمبيعات وتأهيل العملاء، ثم اختر الوكيل النشط لمساحة العمل.',
      agents_create: 'إنشاء وكيل',
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
      stat_conversations: 'المحادثات',
      stat_messages: 'الرسائل التي تمت معالجتها',
      stat_connected_channels: 'القنوات المرتبطة',
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
      save_guidelines_btn: 'حفظ الإعدادات',
      training_faqs_title: 'قائمة الأسئلة الشائعة والأجوبة',
      btn_add_faq: 'إضافة سؤال وجواب',
      channels_title: 'ربط وتفعيل قنوات البوت',
      chan_desc_wa: 'ربط واجهة Cloud API الرسمية لواتساب.',
      chan_desc_fb: 'أتمتة الردود على صفحات فيسبوك مسنجر.',
      chan_desc_ig: 'الرد التلقائي على رسائل وتعليقات إنستجرام.',
      chan_desc_tg: 'ربط وتفعيل بوت تيليجرام مخصص.',
      btn_configure: 'إعداد وتفعيل',
      website_widget_title: 'دردشة الموقع الإلكتروني',
      website_widget_desc: 'انسخ كود البرمجة التالي وضعه قبل وسم الإغلاق body في موقعك لعرض دردشة زين بوت.',
      ecommerce_sync_title: 'ربط ومزامنة متجرك الإلكتروني',
      label_store_provider: 'منصة المتجر',
      store_none: 'غير متصل',
      label_store_url: 'رابط المتجر',
      btn_sync_catalog: 'حفظ ومزامنة الكتالوج',
      orders_bookings_title: 'لوحة إدارة الطلبات والمواعيد',
      chat_orders_list_title: 'الطلبات المستخلصة تلقائياً عبر البوت',
      th_order_id: 'معرف الطلب',
      th_customer: 'اسم العميل',
      th_phone: 'الهاتف',
      th_items: 'المنتجات',
      th_total: 'الإجمالي',
      th_status: 'الحالة',
      appointments_list_title: 'مواعيد العملاء المؤكدة عبر البوت',
      th_booking_customer: 'العميل',
      th_booking_phone: 'الهاتف',
      th_booking_time: 'التاريخ والوقت',
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
      btn_save: 'حفظ القاعدة',
      label_faq_question: 'السؤال / الكلمات المفتاحية',
      label_faq_answer: 'الإجابة المتوقعة',
      faq_question_placeholder: 'مثال: مواعيد التوصيل',
      faq_answer_placeholder: 'مثال: نوصل خلال ثلاثة أيام عمل داخل القاهرة.',
      orders_empty: 'لا توجد طلبات أنشأها البوت بعد.',
      bookings_empty: 'لا توجد مواعيد محجوزة بعد.',
      api_keys_empty: 'لا توجد مفاتيح وصول منشأة بعد.',
      webhook_history_empty: 'لا يوجد سجل لتسليمات الربط البرمجي بعد.',
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
      action_test: 'اختبار الإرسال',
      delete_booking_confirm: 'هل أنت متأكد من رغبتك في حذف هذا الموعد؟',
      delete_order_confirm: 'هل أنت متأكد من رغبتك في حذف هذا الطلب؟',
      delete_recipient_confirm: 'هل أنت متأكد من حذف قناة الإشعارات هذه؟',
      booking_saved_ok: 'تم حفظ الموعد بنجاح!',
      order_saved_ok: 'تم حفظ الطلب بنجاح!',
      recipient_saved_ok: 'تم حفظ قناة الإشعارات بنجاح!',
      recipient_test_sent: 'تم إرسال الإشعار التجريبي بنجاح!',
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
      free_plan_tools_limit_badge: '(الحد الأقصى للباقة المجانية: أداتان فقط)',
      free_plan_skills_limit_badge: '(الحد الأقصى للباقة المجانية: مهارتان فقط)',
      label_chat_page_logo: 'شعار وأيقونة صفحة الدردشة',
      btn_upload_logo: 'رفع شعار',
      btn_remove_logo: 'إزالة',
      hint_logo_format: 'PNG أو JPG حتى 2 ميجابايت',
      placeholder_store_url: 'https://my-store.myshopify.com',
      store_sync_feedback: 'تم حفظ إعدادات مزامنة المتجر بنجاح. يستطيع الوكيل الذكي الآن ترشيح المنتجات من الكتالوج.',
      store_sync_planned: 'المزامنة التلقائية المباشرة مع شوبيفاي ووكومرس قيد الإطلاق المباشر. كتالوج المتجر الداخلي نشط ويعمل حالياً.',
      automation_center_title: 'مركز أتمتة المبيعات والمهام التلقائية',
      automation_center_desc: 'إدارة المهام التلقائية الخلفية: استعادة المبيعات المتروكة، تقرير المبيعات اليومي، وفرز الشكاوى العاجلة.',
      btn_trigger_recovery: 'استعادة العملاء المحتملين الآن',
      btn_trigger_digest: 'إرسال ملخص المبيعات الآن',
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
      idea_truth_board_title: 'لوحة الحقيقة التفاعلية',
      idea_truth_board_desc: 'تابع الافتراضات والمخاطر وخطوات التحقق في الوقت الفعلي دون استهلاك جولات الذكاء الاصطناعي.',
      idea_tb_status_open: 'مفتوح',
      idea_tb_status_validating: 'جارٍ التحقق',
      idea_tb_status_verified: 'تم التحقق',
      idea_tb_status_dismissed: 'مستبعد',
      idea_tb_notes_placeholder: 'ملاحظات وتحديثات المؤسس...',
      idea_btn_export_md: 'تصدير Markdown',
      idea_btn_export_pdf: 'طباعة أو PDF',
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
            ? 'تم تسجيل الرد في المحادثة، ولم يتم إرساله عبر القناة بعد.'
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

      // Get general agent instructions (legacy "عامة" rules — bot identity)
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

  document.getElementById('addInstructionBtn')?.addEventListener('click', () => {
    document.getElementById('instructionModalTitle').textContent = currentLanguage === 'ar' ? 'إضافة تعليمات عامة' : 'Add General Instruction';
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
    document.getElementById('instructionModalTitle').textContent = currentLanguage === 'ar' ? 'تعديل التعليمات العامة' : 'Edit General Instruction';
    document.getElementById('instructionIdInput').value = rule._id;
    document.getElementById('instructionContentInput').value = raw;
    instructionModal?.classList.add('active');
  };

  window.deleteInstruction = async function(id) {
    if (!confirm(currentLanguage === 'ar' ? 'هل أنت متأكد من حذف هذه التعليمات؟' : 'Are you sure you want to delete this instruction?')) return;
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
          alert(currentLanguage === 'ar' ? 'تم الحفظ بنجاح!' : 'Settings saved successfully!');
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
          feedbackEl.textContent = currentLanguage === 'ar' ? 'تم اختيار عدم الربط.' : 'No platform selected.';
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
    if (elOrderBadge) elOrderBadge.textContent = `${totalOrders} ${currentLanguage === 'ar' ? 'طلب' : 'Orders'}`;
    const elBookingBadge = document.getElementById('bookingsCountBadge');
    if (elBookingBadge) elBookingBadge.textContent = `${totalBookings} ${currentLanguage === 'ar' ? 'موعد' : 'Appointments'}`;
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
        serviceType: document.getElementById('bookingServiceType').value.trim() || 'استشارة / موعد',
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
      const name = prompt(currentLanguage === 'ar' ? 'أدخل اسماً لمفتاح الوصول:' : 'Enter a name for the access key:');
      if (!name) return;

      try {
        const res = await apiFetch('/api/integrations/keys', {
          method: 'POST',
          body: JSON.stringify({ name })
        });
        if (res && res.success) {
          alert(`${currentLanguage === 'ar' ? 'تم إنشاء المفتاح بنجاح! مفتاح الوصول الخاص بك هو (يرجى نسخه الآن فلن تتمكن من رؤيته مجدداً):' : 'Key generated successfully! Your access key is (Please copy it now, you will not see it again):'}\n\n${res.data.key}`);
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
          alert(currentLanguage === 'ar' ? 'تم حفظ إعدادات الويب هوك بنجاح!' : 'Webhook settings saved successfully!');
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
          alert(currentLanguage === 'ar' ? 'تم حفظ مفتاح الطوارئ بنجاح!' : 'Backup key settings saved successfully!');
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
    if (!confirm(`هل أنت متأكد من تغيير حالة التاجر/المستخدم إلى ${newStatus === 'active' ? 'نشط' : 'موقوف'}؟`)) return;
    try {
      await apiFetch(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus })
      });
      loadAdminUsers();
    } catch (e) {
      alert('فشل تحديث حالة المستخدم');
    }
  };

  window.impersonateUser = async function(userId) {
    if (!confirm('هل تريد الانتقال الفوري والدخول المباشر إلى حساب هذا التاجر لتصفح وإدارة بوتاته وقنواته؟')) return;
    try {
      const res = await apiFetch('/api/admin/impersonation/sessions', {
        method: 'POST',
        body: JSON.stringify({ subjectUserId: userId })
      });
      if (res && res.token) {
        localStorage.setItem('token', res.token);
        alert('تم دخول حساب التاجر بنجاح! جاري تحميل لوحته...');
        window.location.reload();
      } else {
        alert(res?.message || 'فشل الانتحال المباشر');
      }
    } catch (e) {
      alert('حدث خطأ أثناء المصادقة');
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
    const tier = currentUser?.subscriptionTier || 'free';
    const limit = clientAgentLimit(tier);
    entitlement.textContent = `${workspaceBots.length} / ${limit === Infinity ? '∞' : limit} ${currentLanguage === 'ar' ? 'وكلاء مستخدمون في باقة' : 'agents used on'} ${tier}`;
    list.replaceChildren();
    workspaceBots.forEach((bot) => {
      const card = document.createElement('article');
      card.className = 'glass-card';
      card.style.padding = '18px';
      const title = document.createElement('h3');
      title.textContent = bot.name;
      title.style.marginBottom = '6px';
      const meta = document.createElement('p');
      meta.textContent = `${String(bot.agentType || 'customer_support').replaceAll('_', ' ')} · ${bot.autoReplyEnabled === false ? (currentLanguage === 'ar' ? 'الرد الآلي متوقف' : 'Auto-reply off') : (currentLanguage === 'ar' ? 'الرد الآلي يعمل' : 'Auto-reply on')}`;
      meta.style.cssText = 'font-size:12px; color:var(--text-muted); margin-bottom:12px;';
      const description = document.createElement('p');
      description.textContent = bot.description || bot.welcomeMessage || (currentLanguage === 'ar' ? 'لا يوجد وصف بعد.' : 'No description yet.');
      description.style.cssText = 'font-size:13px; color:var(--text-muted); min-height:40px;';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;';
      const select = document.createElement('button');
      select.type = 'button'; select.className = 'btn btn-secondary btn-sm'; select.textContent = String(currentBot?._id) === String(bot._id) ? (currentLanguage === 'ar' ? 'الوكيل الحالي' : 'Current agent') : (currentLanguage === 'ar' ? 'استخدام هذا الوكيل' : 'Use this agent');
      select.disabled = String(currentBot?._id) === String(bot._id);
      select.addEventListener('click', () => refreshActiveBot(bot));
      const edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm'; edit.textContent = currentLanguage === 'ar' ? 'تعديل' : 'Edit'; edit.addEventListener('click', () => openAgentModal(bot));
      const chatBtn = document.createElement('button');
      chatBtn.type = 'button'; chatBtn.className = 'btn btn-primary btn-sm'; chatBtn.innerHTML = `<i class="fas fa-comments"></i> ${currentLanguage === 'ar' ? 'تخصيص ودردشة' : 'Customize & Chat'}`;
      chatBtn.addEventListener('click', () => window.openChatPageModal(bot));
      actions.append(select, edit, chatBtn); card.append(title, meta, description, actions); list.appendChild(card);
    });
    if (workspaceBots.length === 0) {
      const empty = document.createElement('div'); empty.className = 'glass-card'; empty.textContent = currentLanguage === 'ar' ? 'أنشئ وكيلك الأول للبدء.' : 'Create your first agent to begin.'; list.appendChild(empty);
    }
  }

  async function loadAgents() {
    await loadBots();
    renderAgents();
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
          chk.parentElement.title = toolsMaxReached ? (currentLanguage === 'ar' ? 'الحد الأقصى في الباقة المجانية: أداتان فقط' : 'Free plan limit: 2 tools max') : '';
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
          chk.parentElement.title = skillsMaxReached ? (currentLanguage === 'ar' ? 'الحد الأقصى في الباقة المجانية: مهارتان فقط' : 'Free plan limit: 2 skills max') : '';
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
    document.getElementById('agentModalTitle').textContent = bot ? (currentLanguage === 'ar' ? 'تعديل الوكيل' : 'Edit agent') : (currentLanguage === 'ar' ? 'إنشاء وكيل' : 'Create agent');
    
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
    const result = await apiFetch(id ? `/api/bots/${id}` : '/api/bots', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (!result || result.error || result.message && !result._id && !result.success) return alert(result?.message || (currentLanguage === 'ar' ? 'فشل حفظ الوكيل.' : 'Could not save agent.'));
    agentModal?.classList.remove('active');
    await loadAgents();
    if (!id && result._id) refreshActiveBot(result);
  });

  // Wire AI Sales Automation Center trigger buttons
  const triggerRecoveryBtn = document.getElementById('triggerRecoveryBtn');
  if (triggerRecoveryBtn) {
    triggerRecoveryBtn.addEventListener('click', async () => {
      if (!currentBot) return;
      const feedbackBox = document.getElementById('automationFeedbackBox');
      triggerRecoveryBtn.disabled = true;
      triggerRecoveryBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLanguage === 'ar' ? 'جاري الفحص...' : 'Checking...');
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
          feedbackBox.textContent = res?.message || (currentLanguage === 'ar' ? 'تم فحص المحادثات بنجاح.' : 'Checked conversations successfully.');
        }
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackBox.style.border = '1px solid var(--red)';
          feedbackBox.style.color = 'var(--red)';
          feedbackBox.textContent = currentLanguage === 'ar' ? 'حدث خطأ أثناء تشغيل الفحص.' : 'Error triggering check.';
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
      triggerDigestBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLanguage === 'ar' ? 'جاري الإرسال...' : 'Sending...');
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
          feedbackBox.textContent = res?.message || (currentLanguage === 'ar' ? 'تم إرسال الملخص بنجاح.' : 'Digest sent successfully.');
        }
      } catch (err) {
        if (feedbackBox) {
          feedbackBox.style.display = 'block';
          feedbackBox.style.background = 'rgba(239, 68, 68, 0.15)';
          feedbackBox.style.border = '1px solid var(--red)';
          feedbackBox.style.color = 'var(--red)';
          feedbackBox.textContent = currentLanguage === 'ar' ? 'حدث خطأ أثناء إرسال التقرير.' : 'Error sending digest.';
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
    if (info) info.textContent = `${adminUsersPageState.total} ${adminCopy('حساب — صفحة', 'accounts — page')} ${adminUsersPageState.page} / ${adminUsersPageState.pages}`;
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
      alert(adminCopy('تعذر تحميل قائمة الحسابات.', 'Could not load accounts.'));
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
      cell.textContent = adminCopy('لا توجد حسابات مطابقة.', 'No matching accounts.');
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
      adminCell(row, user.role === 'superadmin' ? adminCopy('مدير عام', 'Super admin') : adminCopy('مستخدم', 'User'));
      adminCell(row, user.subscriptionTier || 'free', 'font-size:12px;');
      adminCell(row, user.status === 'suspended' ? adminCopy('موقوف', 'Suspended') : (user.status === 'deleted' ? adminCopy('محذوف', 'Deleted') : adminCopy('نشط', 'Active')));
      adminCell(row, `${Array.isArray(user.bots) ? user.bots.length : 0} ${adminCopy('وكيل', 'agent(s)')}`, 'font-size:12px;');
      const actions = document.createElement('td');
      actions.style.cssText = 'padding:12px; text-align:center; display:flex; justify-content:center; gap:5px; flex-wrap:wrap;';
      actions.appendChild(adminAction(adminCopy('تعديل', 'Edit'), () => openAdminUserModal(user._id)));
      actions.appendChild(adminAction(adminCopy('الوكلاء', 'Agents'), () => openUserBotsModal(user._id)));
      if (user.status !== 'deleted' && String(user._id) !== String(currentUser?._id)) {
        actions.appendChild(adminAction(adminCopy('دخول مؤقت', 'Temporary access'), () => openImpersonationModal(user._id), 'border-color:var(--orange); color:var(--orange);'));
      }
      if (user.status !== 'deleted' && user.role !== 'superadmin') {
        actions.appendChild(adminAction(user.status === 'suspended' ? adminCopy('تفعيل', 'Activate') : adminCopy('إيقاف', 'Suspend'), () => updateAdminUserStatus(user._id, user.status === 'suspended' ? 'active' : 'suspended')));
        actions.appendChild(adminAction(adminCopy('أرشفة', 'Archive'), () => archiveAdminUser(user._id), 'border-color:var(--red); color:var(--red);'));
      }
      row.appendChild(actions);
      tbody.appendChild(row);
    });
    renderAdminPagination();
  }

  async function updateAdminUserStatus(userId, status) {
    if (!confirm(adminCopy(`هل تريد تغيير حالة الحساب إلى ${status === 'active' ? 'نشط' : 'موقوف'}؟`, `Change account status to ${status}?`))) return;
    const result = await apiFetch(`/api/users/${userId}`, { method: 'PUT', body: JSON.stringify({ status }) });
    if (!result?.data) return alert(result?.message || adminCopy('فشل تحديث الحساب.', 'Could not update account.'));
    loadAdminUsers();
  }

  async function archiveAdminUser(userId) {
    if (!confirm(adminCopy('ستتوقف إمكانية الدخول مع الاحتفاظ بالمحادثات والقنوات. هل تريد المتابعة؟', 'Sign-in will stop while conversations and channels are preserved. Continue?'))) return;
    const result = await apiFetch(`/api/users/${userId}`, { method: 'DELETE' });
    if (!result?.data) return alert(result?.message || adminCopy('فشلت أرشفة الحساب.', 'Could not archive account.'));
    loadAdminUsers();
  }

  // Remote agent (bot) administration for a specific account
  async function openUserBotsModal(userId) {
    if (!modal) return;
    const user = adminUsersList.find((entry) => String(entry._id) === String(userId));
    if (!user || !Array.isArray(user.bots)) {
      alert(adminCopy('لا توجد وكلاء محمّلون لهذا الحساب، أعد تحميل القائمة.', 'No loaded agents for this account. Reload the list.'));
      return;
    }
    modalTitle.innerHTML = `<i class="fas fa-robot" style="color:var(--orange)"></i> ${adminCopy(`وكلاء ${user.username}`, `${user.username}'s agents`)}`;
    modalBody.innerHTML = `<div id="adminBotsList" style="font-size:13px;">${adminCopy('جاري التحميل...', 'Loading...')}</div>`;
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
            <div style="font-size:11px; color:${running ? 'var(--green)' : 'var(--red)'};">${running ? adminCopy('يعمل', 'Running') : adminCopy('متوقف', 'Stopped')}</div>
          </div>
          <button type="button" class="btn btn-secondary btn-sm" data-bot-toggle="${botItem._id}"
            style="flex-shrink:0; ${running ? 'border-color:var(--red); color:var(--red);' : 'border-color:var(--green); color:var(--green);'}">
            ${running ? adminCopy('إيقاف', 'Stop') : adminCopy('تشغيل', 'Start')}
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
            alert(res?.message || adminCopy('فشل تحديث حالة الوكيل.', 'Could not update the agent.'));
          }
        });
      });
    };

    if (bots.length === 0) {
      listEl.textContent = adminCopy('لا يملك هذا الحساب وكلاء بعد.', 'This account has no agents yet.');
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
    document.getElementById('adminUserModalTitle').textContent = userId ? adminCopy('تعديل الحساب', 'Edit account') : adminCopy('إضافة حساب', 'Add account');
    document.getElementById('adminUserPassword').required = !userId;
    document.getElementById('adminUserConfirmPassword').required = !userId;
    if (userId) {
      const response = await apiFetch(`/api/users/${userId}`);
      const user = response?.data;
      if (!user) return alert(adminCopy('تعذر تحميل بيانات الحساب.', 'Could not load account.'));
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
    document.getElementById('impersonationBannerText').textContent = adminCopy(`أنت داخل مؤقتاً إلى حساب ${currentUser?.username || ''}. كل النشاط مسجل.`, `You are temporarily viewing ${currentUser?.username || 'this account'}. Activity is audited.`);
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
    if (!result?.data) return alert(result?.message || adminCopy('فشل حفظ الحساب.', 'Could not save account.'));
    adminUserModal?.classList.remove('active');
    loadAdminUsers(id ? adminUsersPageState.page : 1);
  });
  document.getElementById('impersonationForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await apiFetch('/api/admin/impersonation/sessions', { method: 'POST', body: JSON.stringify({ subjectUserId: document.getElementById('impersonationSubjectId').value, reason: document.getElementById('impersonationReason').value.trim() }) });
    const data = response?.data;
    if (!data?.token || !data?.session?.id) return alert(response?.message || adminCopy('فشل بدء الجلسة المؤقتة.', 'Could not start temporary access.'));
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
    if (!admin.token || !sessionId) return alert(adminCopy('انتهت جلسة المدير. سجل الدخول من جديد.', 'The admin session is unavailable. Please sign in again.'));
    const response = await fetch(`/api/admin/impersonation/sessions/${encodeURIComponent(sessionId)}/end`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` } });
    const result = await response.json();
    if (!response.ok || !result?.success) return alert(result?.message || adminCopy('تعذر إنهاء الجلسة المؤقتة بأمان.', 'Could not safely end the temporary session.'));
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
          <td style="padding:10px;">${s.actor?.username || '—'}</td>
          <td style="padding:10px;">${s.subject?.username || '—'}</td>
          <td style="padding:10px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${(s.reason || '').replace(/"/g, '&quot;')}">${s.reason || '—'}</td>
          <td style="padding:10px; color:${color}; font-weight:600;">${s.status}</td>
          <td style="padding:10px;">${s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}</td>
          <td style="padding:10px;">${s.expiresAt ? new Date(s.expiresAt).toLocaleString() : '—'}</td>
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
          <td style="padding:10px; white-space:nowrap;">${ev.createdAt ? new Date(ev.createdAt).toLocaleString() : '—'}</td>
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

    document.getElementById('faqModalTitle').textContent = currentLanguage === 'ar' ? 'تعديل القاعدة' : 'Edit FAQ Rule';
    document.getElementById('faqIdInput').value = faq._id;
    document.getElementById('faqQuestionInput').value = faq.content?.question || '';
    document.getElementById('faqAnswerInput').value = faq.content?.answer || '';
    
    faqModal.classList.add('active');
  };

  window.deleteFaq = async function(id) {
    if (!confirm(currentLanguage === 'ar' ? 'هل أنت متأكد من حذف هذه القاعدة؟' : 'Are you sure you want to delete this FAQ rule?')) return;
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
    if (!confirm(currentLanguage === 'ar' ? 'هل أنت متأكد من إبطال مفتاح الوصول هذا؟' : 'Are you sure you want to revoke this access key?')) return;
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
        alert(currentLanguage === 'ar' ? 'تم إعادة الإرسال والتسليم بنجاح!' : 'Webhook redelivered successfully!');
        loadSettingsData();
      } else {
        alert(currentLanguage === 'ar' ? 'فشل إعادة الإرسال.' : 'Webhook retry failed.');
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
      document.getElementById('faqModalTitle').textContent = currentLanguage === 'ar' ? 'إضافة سؤال وجواب' : 'Create FAQ Rule';
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
      modalTitle.innerHTML = `<i class="fab fa-whatsapp" style="color:var(--green)"></i> ${currentLanguage === 'ar' ? 'ربط واتساب عبر الرمز (QR Code)' : 'Connect WhatsApp via QR Code'}`;
      modalBody.innerHTML = `
        <div style="text-align:center; padding:16px;">
          <div id="waQrContainer" style="background:rgba(255,255,255,0.03); padding:20px; border-radius:16px; border:1px solid var(--glass-border); display:inline-block; margin-bottom:16px;">
            <div style="color:var(--cyan); font-weight:600;"><i class="fas fa-spinner fa-spin"></i> ${currentLanguage === 'ar' ? 'جاري توليد الرمز...' : 'Generating QR Code...'}</div>
          </div>
          <p style="font-size:13px; color:var(--text-muted); margin-bottom:16px; line-height:1.6;">
            ${currentLanguage === 'ar' ? 'افتح تطبيق الواتساب على هاتفك > الأجهزة المرتبطة > ربط جهاز > وقم بمسح الرمز أعلاه.' : 'Open WhatsApp on your phone > Linked Devices > Link a Device > Scan the QR code above.'}
          </p>
          <button id="waDisconnectBtn" class="btn btn-secondary btn-sm" style="border-color:var(--red); color:var(--red);">${currentLanguage === 'ar' ? 'إلغاء الربط' : 'Disconnect Session'}</button>
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
            image.alt = currentLanguage === 'ar' ? 'رمز ربط واتساب' : 'WhatsApp QR Code';
            image.width = 220;
            image.height = 220;
            image.style.borderRadius = '12px';
            image.style.border = '2px solid var(--cyan)';
            container.appendChild(image);
            return true;
          }
          container.textContent = data?.status === 'connected'
            ? (currentLanguage === 'ar' ? 'تم الربط بنجاح.' : 'WhatsApp is connected.')
            : (currentLanguage === 'ar' ? 'يتم تجهيز الرمز…' : 'Preparing QR code…');
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
            container.textContent = currentLanguage === 'ar' ? 'تعذر بدء جلسة واتساب.' : 'Could not start WhatsApp session.';
          }
        }
      } catch (e) {
        console.error(e);
        const container = document.getElementById('waQrContainer');
        if (container) {
          container.textContent = currentLanguage === 'ar' ? 'تعذر توليد الرمز. حاول مرة أخرى.' : 'Could not generate the QR code. Try again.';
        }
      }

      document.getElementById('waDisconnectBtn')?.addEventListener('click', async () => {
        await apiFetch('/api/whatsapp/disconnect', { method: 'POST', body: JSON.stringify({ botId: currentBot._id }) });
        modal.classList.remove('active');
        loadChannelsData();
      });
    }

    else if (type === 'facebook') {
      modalTitle.innerHTML = `<i class="fab fa-facebook-messenger" style="color:var(--blue)"></i> ${currentLanguage === 'ar' ? 'ربط صفحة فيسبوك مباشرة' : 'Facebook Page Direct Connect'}`;
      modalBody.innerHTML = `
        <form id="fbDirectForm">
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? 'مفتاح وصول الصفحة (Page Access Token)' : 'Page Access Token'}</label>
              <button type="button" class="btn btn-secondary btn-sm info-hint-toggle" style="padding:2px 8px; font-size:11px; color:var(--cyan); border-color:var(--cyan);"><i class="fas fa-info-circle"></i> ${currentLanguage === 'ar' ? 'كيف أحصل عليه؟' : 'How to get?'}</button>
            </div>
            <div class="info-hint-box" style="display:none; background:rgba(0,240,255,0.06); border:1px solid var(--cyan); padding:10px 14px; border-radius:8px; font-size:12px; color:var(--text); margin-bottom:10px;">
              ${currentLanguage === 'ar' ? '1. ادخل إلى developers.facebook.com وأنشئ تطبيقا.<br>2. اختر صفحة الفيسبوك الخاصة بك وولّد مفتاح وصول الصفحة (Page Access Token).<br>3. قم بنسخ المفتاح ولصقه في الحقل أدناه.' : '1. Go to developers.facebook.com and select your App.<br>2. Select your FB Page in Graph API Explorer & generate Page Access Token.<br>3. Copy & paste the token below.'}
            </div>
            <input type="password" id="fbTokenInput" class="form-control" placeholder="EAA..." value="${currentBot.facebookApiKey || ''}" required />
          </div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? 'معرّف الصفحة (Page ID)' : 'Page ID'}</label>
            </div>
            <input type="text" id="fbPageIdInput" class="form-control" placeholder="1023948574..." value="${currentBot.facebookPageId || ''}" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${currentLanguage === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" class="btn btn-primary btn-sm">${currentLanguage === 'ar' ? 'حفظ الربط' : 'Save Connection'}</button>
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
      modalTitle.innerHTML = `<i class="fab fa-instagram" style="color:var(--purple-light)"></i> ${currentLanguage === 'ar' ? 'ربط حساب إنستجرام مباشرة' : 'Instagram Direct Connect'}`;
      modalBody.innerHTML = `
        <form id="igDirectForm">
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? 'مفتاح وصول إنستجرام (Instagram Access Token)' : 'Instagram Access Token'}</label>
              <button type="button" class="btn btn-secondary btn-sm info-hint-toggle" style="padding:2px 8px; font-size:11px; color:var(--cyan); border-color:var(--cyan);"><i class="fas fa-info-circle"></i> ${currentLanguage === 'ar' ? 'كيف أحصل عليه؟' : 'How to get?'}</button>
            </div>
            <div class="info-hint-box" style="display:none; background:rgba(0,240,255,0.06); border:1px solid var(--cyan); padding:10px 14px; border-radius:8px; font-size:12px; color:var(--text); margin-bottom:10px;">
              ${currentLanguage === 'ar' ? '1. قم بربط حساب إنستجرام التجاري بصفحتك على فيسبوك.<br>2. انسخ مفتاح الوصول المستخرج من Meta Developer Console.<br>3. ضع المفتاح ومعرف الحساب في الحقول أدناه.' : '1. Link your IG Business account to your Facebook Page.<br>2. Generate Page/IG Access Token in Meta Developer Console.<br>3. Copy & paste the token and account ID below.'}
            </div>
            <input type="password" id="igTokenInput" class="form-control" placeholder="EAA..." value="${currentBot.instagramApiKey || ''}" required />
          </div>
          <div class="form-group">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <label>${currentLanguage === 'ar' ? 'معرّف حساب إنستجرام (Instagram Page ID)' : 'Instagram Page ID'}</label>
            </div>
            <input type="text" id="igPageIdInput" class="form-control" placeholder="178414..." value="${currentBot.instagramPageId || ''}" required />
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${currentLanguage === 'ar' ? 'إلغاء' : 'Cancel'}</button>
            <button type="submit" class="btn btn-primary btn-sm">${currentLanguage === 'ar' ? 'حفظ الربط' : 'Save Connection'}</button>
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
      modalTitle.innerHTML = `<i class="fab fa-telegram" style="color:var(--cyan)"></i> ${currentLanguage === 'ar' ? 'ربط تيليجرام' : 'Connect Telegram'}`;
      modalBody.innerHTML = `
        <div id="tgLinkFlow">
          <p style="font-size:13px; color:var(--text); margin-bottom:10px;">${currentLanguage === 'ar'
            ? 'اربط وكيلك بالبوت الرسمي للمنصة على تيليجرام لتصلك الإشعارات. ولّد كود الربط ثم أرسله للبوت الرسمي.'
            : 'Link your agent to the official platform bot on Telegram to receive notifications. Generate a link code, then send it to the official bot.'}</p>
          <ol style="font-size:13px; color:var(--text-muted); margin:0 0 14px; padding-inline-start:18px;">
            <li>${currentLanguage === 'ar' ? 'اضغط زر "توليد كود الربط" بالأسفل.' : 'Click the "Generate link code" button below.'}</li>
            <li>${currentLanguage === 'ar' ? 'افتح البوت الرسمي في تيليجرام واضغط Start.' : 'Open the official bot in Telegram and press Start.'}</li>
            <li>${currentLanguage === 'ar' ? 'أرسل الكود كما هو في رسالة واحدة.' : 'Send the code as a single message.'}</li>
          </ol>
          <div id="tgStatusBox"></div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
            <button type="button" class="btn btn-secondary btn-sm modal-close-btn">${currentLanguage === 'ar' ? 'إغلاق' : 'Close'}</button>
            <button type="button" id="tgGenerateCodeBtn" class="btn btn-primary btn-sm">${currentLanguage === 'ar' ? 'توليد كود الربط' : 'Generate link code'}</button>
          </div>
        </div>
      `;

      const tgStatusBox = document.getElementById('tgStatusBox');
      const renderTgStatus = async () => {
        if (!tgStatusBox) return;
        const st = await apiFetch(`/api/telegram/status?botId=${currentBot._id}`);
        if (!st) { tgStatusBox.innerHTML = ''; return; }
        if (st.linked) {
          tgStatusBox.innerHTML = `<div style="background:rgba(16,185,129,0.08); border:1px solid var(--green); padding:10px 14px; border-radius:8px; font-size:13px;">✅ ${currentLanguage === 'ar' ? 'مربوط بحساب تيليجرام' : 'Linked to a Telegram account'}${st.username ? ` (${st.username})` : ''}</div>`;
        } else if (st.linkCode && st.linkExpiresAt && new Date(st.linkExpiresAt) > new Date()) {
          tgStatusBox.innerHTML = `<div style="background:rgba(59,130,246,0.08); border:1px solid var(--blue); padding:10px 14px; border-radius:8px; font-size:13px;">${currentLanguage === 'ar' ? 'كود نشط بالفعل:' : 'Active code already issued:'} <strong>${st.linkCode}</strong></div>`;
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
              <div style="font-size:13px; color:var(--text-muted);">${currentLanguage === 'ar' ? 'كود الربط الخاص بك:' : 'Your link code:'}</div>
              <div style="font-size:24px; font-weight:700; letter-spacing:3px; color:var(--cyan); margin:4px 0;">${res.code}</div>
              <div style="font-size:12px; color:var(--text-muted);">${currentLanguage === 'ar'
                ? `أرسله إلى <a href="https://t.me/${res.botUsername}" target="_blank" rel="noopener" style="color:var(--cyan);">@${res.botUsername}</a> قبل انتهاء الصلاحية.`
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
    { key: 'customer_advocate', icon: 'fa-user-check', labelKey: 'idea_role_customer_advocate' },
    { key: 'financial_auditor', icon: 'fa-coins', labelKey: 'idea_role_financial_auditor' },
    { key: 'growth_marketer', icon: 'fa-chart-line', labelKey: 'idea_role_growth_marketer' },
    { key: 'direct_competitor', icon: 'fa-chess-knight', labelKey: 'idea_role_direct_competitor' },
    { key: 'technical_architect', icon: 'fa-server', labelKey: 'idea_role_technical_architect' },
    { key: 'execution_risk_officer', icon: 'fa-shield-halved', labelKey: 'idea_role_execution_risk_officer' },
    { key: 'monetization_strategist', icon: 'fa-hand-holding-dollar', labelKey: 'idea_role_monetization_strategist' },
    { key: 'simplicity_editor', icon: 'fa-scissors', labelKey: 'idea_role_simplicity_editor' }
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
    const flds = {
      ideaCardFldTitle: card.title || '',
      ideaCardFldPitch: card.elevatorPitch || '',
      ideaCardFldCustomer: card.targetCustomer || '',
      ideaCardFldRevenue: card.revenueModel || '',
      ideaCardFldProblem: card.coreProblem || '',
      ideaCardFldSolution: card.proposedSolution || '',
      ideaCardFldValue: card.valueProposition || '',
      ideaCardFldAlternatives: card.currentAlternatives || '',
      ideaCardFldCoreQuestion: card.coreEvaluationQuestion || ''
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
        alert(currentLanguage === 'ar' ? 'يجب أن لا يقل وصف الفكرة عن 100 حرف.' : 'Idea description must be at least 100 characters.');
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
      alert(currentLanguage === 'ar' ? 'يجب أن لا يقل وصف الفكرة عن 100 حرف.' : 'Idea description must be at least 100 characters.');
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
        alert(res?.error || (currentLanguage === 'ar' ? 'فشل تنظيم بطاقة الفكرة.' : 'Failed to structure idea.'));
      }
    } catch (err) {
      console.error('Error structuring idea:', err);
      alert(currentLanguage === 'ar' ? 'حدث خطأ أثناء تنظيم الفكرة.' : 'Error structuring idea.');
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

    const card = {
      title: document.getElementById('ideaCardFldTitle')?.value.trim() || '',
      elevatorPitch: document.getElementById('ideaCardFldPitch')?.value.trim() || '',
      targetCustomer: document.getElementById('ideaCardFldCustomer')?.value.trim() || '',
      revenueModel: document.getElementById('ideaCardFldRevenue')?.value.trim() || '',
      coreProblem: document.getElementById('ideaCardFldProblem')?.value.trim() || '',
      proposedSolution: document.getElementById('ideaCardFldSolution')?.value.trim() || '',
      valueProposition: document.getElementById('ideaCardFldValue')?.value.trim() || '',
      currentAlternatives: document.getElementById('ideaCardFldAlternatives')?.value.trim() || '',
      coreEvaluationQuestion: document.getElementById('ideaCardFldCoreQuestion')?.value.trim() || ''
    };

    const btn = document.getElementById('ideaStartCouncilBtn');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (currentLanguage === 'ar' ? 'جارٍ الاستدعاء...' : 'Convening...');
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
      alert(currentLanguage === 'ar' ? 'فشل استدعاء لجنة الأفكار.' : 'Failed to convene idea council.');
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
      const insight = agentResult?.keyInsight || agentResult?.recommendation || '';

      const statusMap = {
        PENDING: { label: currentLanguage === 'ar' ? 'بانتظار البدء' : 'Pending', color: 'var(--text-muted)', icon: 'fa-clock' },
        RUNNING: { label: currentLanguage === 'ar' ? 'جارٍ التحليل...' : 'Analyzing...', color: 'var(--cyan)', icon: 'fa-spinner fa-spin' },
        COMPLETED: { label: currentLanguage === 'ar' ? 'اكتمل' : 'Completed', color: 'var(--green)', icon: 'fa-check' },
        FAILED: { label: currentLanguage === 'ar' ? 'فشل' : 'Failed', color: 'var(--red)', icon: 'fa-times' }
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
              ${insight ? escapeIdeaHtml(insight) : (currentLanguage === 'ar' ? 'في انتظار فحص الفكرة والأدلة...' : 'Awaiting evidence inspection...')}
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
          stg = currentLanguage === 'ar' ? 'جارٍ إجراء البحث السوقي المباشر وجمع الأدلة...' : 'Conducting live web market research...';
        } else if (run.stage === 'AGENT_ANALYSIS') {
          const completed = (run.agents || []).filter(a => a.status === 'COMPLETED').length;
          pct = 25 + Math.round((completed / 8) * 55);
          stg = (currentLanguage === 'ar' ? 'أعضاء اللجنة يحللون الفكرة بالتوازي' : 'Council members analyzing in parallel') + ` (${completed}/8)...`;
        } else if (run.stage === 'SYNTHESIS') {
          pct = 88;
          stg = currentLanguage === 'ar' ? 'رئيس اللجنة يصيغ التقرير النهائي ولوحة الحقيقة...' : 'Chairperson synthesizing verdict and truth board...';
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
            stageText.textContent = currentLanguage === 'ar' ? 'فشل تشغيل جلسة التقييم.' : 'Evaluation run failed.';
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

  function renderIdeaReport(idea) {
    currentIdea = idea;
    const r = idea.synthesisReport || {};

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
    if (questEl) questEl.textContent = r.criticalQuestionToSettle || '—';

    const cutList = document.getElementById('ideaCutList');
    if (cutList) {
      const items = Array.isArray(r.cutListForV1) ? r.cutListForV1 : [];
      cutList.innerHTML = items.map(c => `<li>${escapeIdeaHtml(c)}</li>`).join('') || '<li>—</li>';
    }

    const vp = r.validationPlan || {};
    const valFields = {
      ideaValHypothesis: vp.coreHypothesis || '—',
      ideaValAudience: vp.targetAudience || '—',
      ideaValChannel: vp.testingChannel || '—',
      ideaValDuration: vp.suggestedDuration || '—',
      ideaValMetric: vp.successMetric || '—',
      ideaValStop: vp.stopCondition || '—'
    };
    Object.keys(valFields).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = valFields[id];
    });

    const mvpList = document.getElementById('ideaMvpScopeList');
    if (mvpList) {
      const feats = Array.isArray(r.sevenDayMvpScope?.coreFeatures) ? r.sevenDayMvpScope.coreFeatures : [];
      mvpList.innerHTML = feats.map(f => `<li>${escapeIdeaHtml(f)}</li>`).join('') || '<li>—</li>';
    }

    const wedgeEl = document.getElementById('ideaUniqueWedge');
    if (wedgeEl) wedgeEl.textContent = r.sevenDayMvpScope?.uniqueWedge || '—';

    const firstValEl = document.getElementById('ideaFirstMomentOfValue');
    if (firstValEl) firstValEl.textContent = r.sevenDayMvpScope?.firstMomentOfValue ? (`First Moment: ${r.sevenDayMvpScope.firstMomentOfValue}`) : '';

    const sourcesList = document.getElementById('ideaSourcesList');
    if (sourcesList) {
      const sources = Array.isArray(idea.marketResearchPack?.sources) ? idea.marketResearchPack.sources : (r.sources || []);
      if (sources.length === 0) {
        sourcesList.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">${currentLanguage === 'ar' ? 'لا توجد مصادر خارجية مباشرة.' : 'No external web sources available.'}</span>`;
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
    const roundsRem = idea.followUpRoundsRemaining ?? 3;
    if (followCountEl) followCountEl.textContent = roundsRem;

    document.querySelectorAll('.idea-followup-btn').forEach(btn => {
      btn.disabled = (roundsRem <= 0);
    });

    renderTruthBoard(idea.truthBoardItems || r.truthBoardItems || []);
  }

  function renderTruthBoard(items = []) {
    const container = document.getElementById('truthBoardItemsList');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `<div style="font-size:13px; color:var(--text-muted); text-align:center; padding:20px;">${currentLanguage === 'ar' ? 'لا توجد عناصر مسجلة في لوحة الحقيقة.' : 'No truth items recorded yet.'}</div>`;
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

  async function handleFollowUpClick(type) {
    const ideaId = currentIdea?._id || currentIdea?.id;
    if (!ideaId) return;
    const roundsRem = currentIdea.followUpRoundsRemaining ?? currentIdea.followupRoundsRemaining ?? 3;
    if (roundsRem <= 0) {
      alert(currentLanguage === 'ar' ? 'لقد استنفدت جميع جولات المتابعة المتاحة لهذه الفكرة (3 جولات).' : 'All 3 follow-up rounds used for this idea.');
      return;
    }

    const promptText = window.prompt(ideaT('idea_msg_followup_prompt'));
    if (!promptText || !promptText.trim()) return;

    const clickedBtn = document.querySelector(`.idea-followup-btn[data-type="${type}"]`);
    const originalText = clickedBtn ? clickedBtn.innerHTML : '';
    if (clickedBtn) {
      clickedBtn.disabled = true;
      clickedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }

    try {
      const idempotencyKey = `followup-${ideaId}-${Date.now()}`;
      const res = await apiFetch(`/api/idea-council/ideas/${ideaId}/follow-up`, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          type,
          followupType: type,
          userPrompt: promptText.trim(),
          followupPrompt: promptText.trim(),
          idempotencyKey
        })
      });

      const runId = res?.runId || res?.data?.runId;
      if (res && res.success && runId) {
        currentIdeaRunId = runId;
        showIdeaView('session');
        renderCouncilAgentsGrid([]);
        startIdeaPolling(currentIdeaRunId);
        loadIdeaCouncilUsage();
        alert(ideaT('idea_msg_followup_success'));
      } else if (res && res.success && res.data) {
        currentIdea = res.data;
        renderIdeaReport(currentIdea);
        alert(ideaT('idea_msg_followup_success'));
      } else {
        alert(res?.error || (currentLanguage === 'ar' ? 'فشل تنفيذ جولة المتابعة.' : 'Failed to run follow-up round.'));
      }
    } catch (err) {
      console.error('Follow-up error:', err);
      alert(currentLanguage === 'ar' ? 'حدث خطأ أثناء تنفيذ جولة المتابعة.' : 'Error during follow-up round.');
    } finally {
      if (clickedBtn) {
        clickedBtn.disabled = false;
        clickedBtn.innerHTML = originalText;
      }
    }
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
      alert(currentLanguage === 'ar' ? 'فشل تصدير التقرير.' : 'Failed to export report.');
    }
  }

  function initIdeaCouncil() {
    const ideaNewBtn = document.getElementById('ideaNewBtn');
    if (ideaNewBtn) {
      ideaNewBtn.addEventListener('click', () => {
        if (ideaUsageData && ideaUsageData.ideasRemaining <= 0) {
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
        const card = {
          title: document.getElementById('ideaCardFldTitle')?.value.trim() || '',
          elevatorPitch: document.getElementById('ideaCardFldPitch')?.value.trim() || '',
          targetCustomer: document.getElementById('ideaCardFldCustomer')?.value.trim() || '',
          revenueModel: document.getElementById('ideaCardFldRevenue')?.value.trim() || '',
          coreProblem: document.getElementById('ideaCardFldProblem')?.value.trim() || '',
          proposedSolution: document.getElementById('ideaCardFldSolution')?.value.trim() || '',
          valueProposition: document.getElementById('ideaCardFldValue')?.value.trim() || '',
          currentAlternatives: document.getElementById('ideaCardFldAlternatives')?.value.trim() || '',
          coreEvaluationQuestion: document.getElementById('ideaCardFldCoreQuestion')?.value.trim() || ''
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
  }

  // Initialize and Boot System
  initIdeaCouncil();
  checkAuthAndLoad();
  applyLanguage(currentLanguage);

})();
