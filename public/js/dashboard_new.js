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
      model_select_heading: 'AI Model',
      model_select_desc: 'Choose Auto to let the platform pick the best available model for your plan, or select a specific model from the list enabled for your account.',
      model_select_label: 'Model',
      model_select_auto: 'Auto (recommended)',
      model_select_save: 'Save model',
      model_saved_ok: 'Model selection saved successfully!',
      model_save_failed: 'This model is not available on your current plan.',
      model_loading_list: 'Loading available models...'
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
      model_select_heading: 'موديل الذكاء الاصطناعي',
      model_select_desc: 'اختر "تلقائي" ليختار النظام أفضل موديل متاح لباقتك، أو حدد موديلاً معيناً من القائمة المفعّلة لحسابك.',
      model_select_label: 'الموديل',
      model_select_auto: 'تلقائي (مستحسن)',
      model_select_save: 'حفظ الموديل',
      model_saved_ok: 'تم حفظ اختيار الموديل بنجاح!',
      model_save_failed: 'هذا الموديل غير متاح في باقتك الحالية.',
      model_loading_list: 'جاري تحميل الموديلات المتاحة...'
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
      
      const lastMsg = chat.messages && chat.messages.length > 0 ? chat.messages[chat.messages.length - 1].content : '';
      let channelIcon = 'fa-globe';
      let channelColor = 'var(--cyan)';
      
      if (chat.channel === 'whatsapp') { channelIcon = 'fa-brands fa-whatsapp'; channelColor = 'var(--green)'; }
      else if (chat.channel === 'instagram') { channelIcon = 'fa-brands fa-instagram'; channelColor = 'var(--purple-light)'; }
      else if (chat.channel === 'facebook') { channelIcon = 'fa-brands fa-facebook-messenger'; channelColor = 'var(--blue)'; }
      else if (chat.channel === 'telegram') { channelIcon = 'fa-brands fa-telegram'; channelColor = 'var(--blue)'; }

      item.innerHTML = `
        <div class="chat-item-avatar">
          ${chat.username ? chat.username.slice(0, 1).toUpperCase() : 'C'}
          <span class="chat-channel-badge" style="background:${channelColor};"><i class="${channelIcon}"></i></span>
        </div>
        <div class="chat-item-details">
          <div class="chat-item-name">${chat.username || 'Customer'}</div>
          <div class="chat-item-preview">${lastMsg}</div>
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

    chat.messages.forEach(msg => {
      const bubbleRow = document.createElement('div');
      bubbleRow.style.display = 'flex';
      bubbleRow.style.justifyContent = msg.role === 'user' ? 'flex-end' : 'flex-start';
      bubbleRow.style.marginBottom = '12px';

      const bubble = document.createElement('div');
      bubble.style.padding = '10px 16px';
      bubble.style.borderRadius = msg.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0';
      bubble.style.background = msg.role === 'user' ? 'var(--gradient)' : 'rgba(255,255,255,0.04)';
      bubble.style.border = msg.role === 'user' ? 'none' : '1px solid var(--glass-border)';
      bubble.style.maxWidth = '70%';
      bubble.style.fontSize = '14px';
      bubble.textContent = msg.content;

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

  async function loadTrainingData() {
    if (!currentBot) return;

    try {
      // Get bot guidelines
      const res = await apiFetch(`/api/bots/${currentBot._id}`);
      if (res && res.success) {
        document.getElementById('botWelcomeMessage').value = res.data.welcomeMessage || '';
        document.getElementById('botCustomPrompt').value = res.data.customInstructions || '';
      }

      // Get FAQs
      const faqRes = await apiFetch(`/api/rules?botId=${currentBot._id}`);
      if (faqRes && faqRes.success) {
        faqs = faqRes.data;
        renderFaqs();
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

  // 5. ORDERS & APPOINTMENTS LOADER
  let ordersList = [];
  let bookingsList = [];

  async function loadOrdersData() {
    if (!currentBot) return;

    try {
      const orderRes = await apiFetch(`/api/chat-orders?botId=${currentBot._id}`);
      if (orderRes && orderRes.success) {
        ordersList = orderRes.data;
        renderOrders();
      }

      // Fetch bookings list (simulated from customer appointments metadata)
      const bookingRes = await apiFetch(`/api/chat-customers?botId=${currentBot._id}&hasBooking=true`);
      if (bookingRes && bookingRes.success) {
        bookingsList = bookingRes.data;
        renderBookings();
      }
    } catch (e) {
      console.error(e);
    }
  }

  function renderOrders() {
    const ordersTableBody = document.getElementById('ordersTableBody');
    if (!ordersTableBody) return;
    ordersTableBody.innerHTML = '';

    if (ordersList.length === 0) {
      ordersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).orders_empty}</td></tr>`;
      return;
    }

    ordersList.forEach(order => {
      const row = document.createElement('tr');
      const itemsStr = order.items ? order.items.map(it => `${it.title} (x${it.quantity})`).join(', ') : '';
      let badgeClass = 'badge-warning';
      if (order.status === 'confirmed') badgeClass = 'badge-success';
      if (order.status === 'cancelled') badgeClass = 'badge-danger';
      if (order.status === 'delivered') badgeClass = 'badge-info';

      row.innerHTML = `
        <td>#${order._id.slice(-8)}</td>
        <td>${order.customerName || 'Customer'}</td>
        <td>${order.customerPhone || 'N/A'}</td>
        <td>${itemsStr}</td>
        <td>${order.totalAmount ? order.totalAmount + ' EGP' : 'N/A'}</td>
        <td><span class="badge ${badgeClass}">${order.status || 'pending'}</span></td>
      `;
      ordersTableBody.appendChild(row);
    });
  }

  function renderBookings() {
    const bookingsTableBody = document.getElementById('bookingsTableBody');
    if (!bookingsTableBody) return;
    bookingsTableBody.innerHTML = '';

    if (bookingsList.length === 0) {
      bookingsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">${(translations[currentLanguage] || translations.en).bookings_empty}</td></tr>`;
      return;
    }

    bookingsList.forEach(booking => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${booking.name || 'Customer'}</td>
        <td>${booking.phone || 'N/A'}</td>
        <td>${booking.bookingTime ? new Date(booking.bookingTime).toLocaleString() : 'N/A'}</td>
        <td>${booking.notes || 'N/A'}</td>
      `;
      bookingsTableBody.appendChild(row);
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
      actions.append(select, edit); card.append(title, meta, description, actions); list.appendChild(card);
    });
    if (workspaceBots.length === 0) {
      const empty = document.createElement('div'); empty.className = 'glass-card'; empty.textContent = currentLanguage === 'ar' ? 'أنشئ وكيلك الأول للبدء.' : 'Create your first agent to begin.'; list.appendChild(empty);
    }
  }

  async function loadAgents() {
    await loadBots();
    renderAgents();
  }

  const agentModal = document.getElementById('agentModal');
  function openAgentModal(bot = null) {
    const form = document.getElementById('agentForm');
    if (!agentModal || !form) return;
    form.reset();
    document.getElementById('agentId').value = bot?._id || '';
    document.getElementById('agentModalTitle').textContent = bot ? (currentLanguage === 'ar' ? 'تعديل الوكيل' : 'Edit agent') : (currentLanguage === 'ar' ? 'إنشاء وكيل' : 'Create agent');
    if (bot) {
      document.getElementById('agentName').value = bot.name || '';
      document.getElementById('agentType').value = bot.agentType || 'customer_support';
      document.getElementById('agentDescription').value = bot.description || '';
      document.getElementById('agentWelcomeMessage').value = bot.welcomeMessage || '';
      document.getElementById('agentInstructions').value = bot.customInstructions || '';
      document.getElementById('agentObjectives').value = Array.isArray(bot.objectives) ? bot.objectives.join('\n') : '';
      document.getElementById('agentHandoffKeywords').value = Array.isArray(bot.handoffKeywords) ? bot.handoffKeywords.join(', ') : '';
      document.getElementById('agentAutoReplyEnabled').checked = bot.autoReplyEnabled !== false;
    }
    agentModal.classList.add('active');
  }

  document.getElementById('createAgentBtn')?.addEventListener('click', () => openAgentModal());
  document.querySelectorAll('.agent-modal-close').forEach((button) => button.addEventListener('click', () => agentModal?.classList.remove('active')));
  document.getElementById('agentForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('agentId').value;
    const splitValues = (value, separator) => value.split(separator).map((item) => item.trim()).filter(Boolean);
    const payload = {
      name: document.getElementById('agentName').value.trim(), agentType: document.getElementById('agentType').value,
      description: document.getElementById('agentDescription').value.trim(), welcomeMessage: document.getElementById('agentWelcomeMessage').value.trim(),
      customInstructions: document.getElementById('agentInstructions').value.trim(), objectives: splitValues(document.getElementById('agentObjectives').value, '\n'),
      handoffKeywords: splitValues(document.getElementById('agentHandoffKeywords').value, ','), autoReplyEnabled: document.getElementById('agentAutoReplyEnabled').checked,
    };
    const result = await apiFetch(id ? `/api/bots/${id}` : '/api/bots', { method: id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    if (!result || result.error || result.message && !result._id && !result.success) return alert(result?.message || (currentLanguage === 'ar' ? 'فشل حفظ الوكيل.' : 'Could not save agent.'));
    agentModal?.classList.remove('active');
    await loadAgents();
    if (!id && result._id) refreshActiveBot(result);
  });

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

  // Initialize and Boot System
  checkAuthAndLoad();
  applyLanguage(currentLanguage);

})();
