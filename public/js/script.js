/* ===== ZAINBOT AI — Landing Page Script ===== */
(function() {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ===== NAVBAR SCROLL EFFECT ===== */
  const navbar = document.getElementById('navbar');
  let lastScroll = 0;

  function handleNavScroll() {
    const scrolled = window.scrollY > 20;
    navbar.classList.toggle('scrolled', scrolled);
  }
  window.addEventListener('scroll', handleNavScroll, { passive: true });

  /* ===== MOBILE MENU ===== */
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');

  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('mobile-open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen);
  });

  navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('mobile-open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  /* ===== SMOOTH SCROLL ===== */
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const offset = navbar.offsetHeight + 10;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      }
    });
  });

  /* ===== SCROLL REVEAL ===== */
  const revealElements = document.querySelectorAll('.reveal');
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  revealElements.forEach(el => revealObserver.observe(el));

  /* ===== HERO MOUSE PARALLAX ===== */
  const heroVisual = document.getElementById('heroVisual');
  if (heroVisual && !prefersReducedMotion) {
    const floatingCards = heroVisual.querySelectorAll('.floating-card');
    const orbs = heroVisual.querySelectorAll('.ai-orb');
    const dashboard = heroVisual.querySelector('.dashboard-card');

    heroVisual.addEventListener('mousemove', (e) => {
      const rect = heroVisual.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      floatingCards.forEach(card => {
        const depth = parseFloat(card.dataset.depth) || 1;
        card.style.transform = `translate(${x * depth * 12}px, ${y * depth * 12}px)`;
      });

      if (dashboard) {
        dashboard.style.transform = `translate(${x * 8}px, ${y * 8}px) rotateY(${x * 3}deg) rotateX(${-y * 3}deg)`;
      }
    });

    heroVisual.addEventListener('mouseleave', () => {
      floatingCards.forEach(card => { card.style.transform = ''; });
      if (dashboard) dashboard.style.transform = '';
    });
  }

  /* ===== ANIMATED COUNTERS ===== */
  const counters = document.querySelectorAll('.metric-value');
  let countersAnimated = false;

  function animateCounter(el) {
    if (!el.dataset.target) return;
    const target = parseFloat(el.dataset.target);
    if (isNaN(target)) return;
    const suffix = el.dataset.suffix || '';
    const duration = 2000;
    const startTime = performance.now();
    const isDecimal = target % 1 !== 0;

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;

      if (isDecimal) {
        el.textContent = current.toFixed(1) + suffix;
      } else {
        el.textContent = Math.floor(current) + suffix;
      }

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = target + suffix;
      }
    }

    if (prefersReducedMotion) {
      el.textContent = target + suffix;
    } else {
      requestAnimationFrame(update);
    }
  }

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !countersAnimated) {
        countersAnimated = true;
        counters.forEach(animateCounter);
        counterObserver.disconnect();
      }
    });
  }, { threshold: 0.3 });

  if (counters.length) counterObserver.observe(counters[0].closest('.metrics'));

  /* ===== TESTIMONIAL CAROUSEL ===== */
  const track = document.getElementById('testimonialTrack');
  const slides = track ? track.children : [];
  const dotsContainer = document.getElementById('testimonialDots');
  const prevBtn = document.getElementById('testPrev');
  const nextBtn = document.getElementById('testNext');
  let currentSlide = 0;
  let autoplayInterval = null;
  const AUTOPLAY_DELAY = 5000;

  if (track && slides.length) {
    // Create dots
    for (let i = 0; i < slides.length; i++) {
      const dot = document.createElement('button');
      dot.className = 'testimonial-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
      dot.addEventListener('click', () => goToSlide(i));
      dotsContainer.appendChild(dot);
    }

    function goToSlide(index) {
      currentSlide = (index + slides.length) % slides.length;
      track.style.transform = `translateX(-${currentSlide * 100}%)`;
      dotsContainer.querySelectorAll('.testimonial-dot').forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
      });
    }

    function nextSlide() { goToSlide(currentSlide + 1); }
    function prevSlide() { goToSlide(currentSlide - 1); }

    nextBtn.addEventListener('click', () => { nextSlide(); resetAutoplay(); });
    prevBtn.addEventListener('click', () => { prevSlide(); resetAutoplay(); });

    function startAutoplay() {
      if (prefersReducedMotion) return;
      autoplayInterval = setInterval(nextSlide, AUTOPLAY_DELAY);
    }
    function stopAutoplay() { clearInterval(autoplayInterval); }
    function resetAutoplay() { stopAutoplay(); startAutoplay(); }

    const carousel = document.getElementById('testimonialCarousel');
    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);

    // Keyboard navigation
    carousel.setAttribute('tabindex', '0');
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { prevSlide(); resetAutoplay(); }
      if (e.key === 'ArrowRight') { nextSlide(); resetAutoplay(); }
    });

    startAutoplay();
  }

  /* ===== AI CHAT DEMO ===== */
  const demoChatBody = document.getElementById('demoChatBody');
  const demoChatForm = document.getElementById('demoChatForm');
  const demoChatInput = document.getElementById('demoChatInput');
  const promptChips = document.querySelectorAll('.prompt-chip');
  const confidenceFill = document.getElementById('confidenceFill');
  const confidenceValue = document.getElementById('confidenceValue');

  const aiResponses = [
    {
      triggers: ['where is my order', 'track', 'order status', 'delivery', 'my order', 'shipped', 'package'],
      response: 'I can help with order updates. In a connected workspace, the agent checks the information you provide and guides the customer to the next step.',
      confidence: 97
    },
    {
      triggers: ['pricing', 'price', 'cost', 'plan', 'how much', 'subscription', 'billing'],
      response: 'The current workspace starts on the free plan. Your available quota and any enabled features are always visible from the account menu in the dashboard.',
      confidence: 95
    },
    {
      triggers: ['book', 'appointment', 'schedule', 'meeting', 'demo', 'call'],
      response: "I'd be happy to help you book an appointment! 📅 Here are some available slots:\n\n• Tuesday at 2:00 PM\n• Wednesday at 11:00 AM\n• Thursday at 4:00 PM\n\nWhich time works best for you?",
      confidence: 93
    },
    {
      triggers: ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon'],
      response: "Hello! 👋 I'm ZainBot AI, your virtual assistant. I can help with orders, pricing, appointments, product questions, and more. What can I do for you today?",
      confidence: 99
    },
    {
      triggers: ['refund', 'return', 'cancel', 'money back', 'exchange'],
      response: 'I understand you need help with a return or refund. No worries — items can be returned within 30 days of delivery. Would you like me to start a return request for you? I just need your order number. 🔄',
      confidence: 91
    },
    {
      triggers: ['thank', 'thanks', 'great', 'awesome', 'perfect', 'amazing'],
      response: "You're very welcome! 😊 Is there anything else I can help you with today? I'm here 24/7 whenever you need me.",
      confidence: 98
    }
  ];

  const defaultResponse = {
    response: "I'm here to help with orders, pricing, appointments, and product questions. Could you tell me a bit more about what you need? You can also try one of the suggested prompts below. 😊",
    confidence: 88
  };

  function getAIResponse(message) {
    if (currentLang === 'ar') {
      return { response: 'شكرًا لرسالتك. في المنصة الفعلية يستخدم الوكيل تعليماتك وبياناتك المتاحة لمساعدة العميل.', confidence: 0 };
    }
    const msg = message.toLowerCase().trim();
    for (const item of aiResponses) {
      if (item.triggers.some(trigger => msg.includes(trigger))) {
        return item;
      }
    }
    return defaultResponse;
  }

  function appendMessage(text, type) {
    const msgEl = document.createElement('div');
    msgEl.className = `demo-msg demo-msg-${type}`;

    if (type === 'in') {
      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar-sm';
      avatar.innerHTML = '<i class="fas fa-user"></i>';
      msgEl.appendChild(avatar);
    } else {
      const avatar = document.createElement('div');
      avatar.className = 'msg-avatar-sm';
      avatar.innerHTML = '<i class="fas fa-robot"></i>';
      msgEl.appendChild(avatar);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.style.whiteSpace = 'pre-line';
    bubble.textContent = text;
    msgEl.appendChild(bubble);

    demoChatBody.appendChild(msgEl);
    demoChatBody.scrollTop = demoChatBody.scrollHeight;
  }

  function showTyping() {
    const typingEl = document.createElement('div');
    typingEl.className = 'demo-typing';
    typingEl.id = 'demoTyping';

    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar-sm';
    avatar.innerHTML = '<i class="fas fa-robot"></i>';
    typingEl.appendChild(avatar);

    const bubble = document.createElement('div');
    bubble.className = 'typing-bubble';
    bubble.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
    typingEl.appendChild(bubble);

    demoChatBody.appendChild(typingEl);
    demoChatBody.scrollTop = demoChatBody.scrollHeight;
  }

  function removeTyping() {
    const typing = document.getElementById('demoTyping');
    if (typing) typing.remove();
  }

  function updateConfidence(value) {
    if (!confidenceFill || !confidenceValue) return;
    confidenceFill.style.width = value + '%';
    confidenceValue.textContent = value + '%';
  }

  let isResponding = false;

  function handleUserMessage(message) {
    if (isResponding || !message.trim()) return;
    isResponding = true;

    appendMessage(message, 'in');

    const aiResult = getAIResponse(message);

    showTyping();
    const delay = 1000 + Math.random() * 800;

    setTimeout(() => {
      removeTyping();
      appendMessage(aiResult.response, 'out');
      updateConfidence(aiResult.confidence);
      isResponding = false;
    }, delay);
  }

  // Prompt chips
  promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      handleUserMessage(prompt);
    });
  });

  // Chat form
  demoChatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = demoChatInput.value.trim();
    if (!message) return;
    handleUserMessage(message);
    demoChatInput.value = '';
  });

  /* ===== BACK TO TOP ===== */
  const backToTop = document.getElementById('backToTop');

  function handleBackToTop() {
    if (window.scrollY > 500) {
      backToTop.classList.add('visible');
    } else {
      backToTop.classList.remove('visible');
    }
  }
  window.addEventListener('scroll', handleBackToTop, { passive: true });

  backToTop.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  });

  /* ===== BENTO TOGGLE INTERACTION ===== */
  const bentoToggle = document.querySelector('.bento-ai-toggle .toggle-switch');
  if (bentoToggle) {
    bentoToggle.addEventListener('click', () => {
      bentoToggle.classList.toggle('active');
    });
  }

  /* ===== MULTI-LANGUAGE (i18n) SYSTEM ===== */
  const langTranslations = {
    en: {
      nav_product: 'Product',
      nav_solutions: 'Solutions',
      nav_integrations: 'Integrations',
      nav_pricing: 'Pricing',
      nav_resources: 'Resources',
      nav_signin: 'Sign in',
      nav_start_free: 'Start free',
      hero_pill: '<span class="pill-dot"></span>ZainBot 2.0 is now live <i class="fas fa-arrow-right"></i>',
      hero_title: 'Your business deserves an <span class="gradient-text">AI team</span> that never sleeps.',
      hero_subtitle: 'Deploy intelligent AI agents that answer, sell, follow up, and learn from every customer conversation — across WhatsApp, Instagram, Messenger, your website, and online store. All from one beautifully simple platform.',
      hero_btn_primary: 'Build your AI agent <i class="fas fa-arrow-right"></i>',
      hero_btn_secondary: '<i class="fas fa-play"></i> Watch demo',
      hero_proof: 'Start with a workspace built around your team.',
      hero_chat_status: 'Workspace preview',
      hero_chat_customer_one: 'Do you have this in size M?',
      hero_chat_bot: 'Yes, it is available in medium. Would you like me to help you place an order?',
      hero_chat_customer_two: 'That is great. Yes, please.',
      hero_chat_input: 'Type a message...',
      hero_floating_one: 'Follow-up',
      hero_floating_one_label: 'ready to automate',
      hero_floating_two: 'Always ready',
      hero_floating_three: 'Workspace view',
      hero_floating_three_value: 'Your live data',
      bento_card2_ready: 'Ready',
      metric_value_conversations: 'Conversations',
      metric_value_channels: 'Channels',
      metric_value_orders: 'Orders',
      metric_value_quota: 'Quota',
      metric_stat_value_live: 'Live',
      metric_stat_value_ready: 'Ready',
      metric_stat_value_account: 'Account',
      bento_card2_accuracy: 'Based on your training',
      bento_card5_convs: 'Conversations',
      bento_card5_resolved: 'Useful signals',
      metric_lbl_response: 'See every customer conversation',
      metric_lbl_leads: 'Check connection status',
      metric_lbl_sat: 'Track orders and bookings',
      metric_lbl_coverage: 'Know what is available',
      metric_stat_lbl_resp: 'Conversations',
      metric_stat_lbl_res: 'Connections',
      metric_stat_lbl_sat: 'Usage',
      cta_desc: 'Build your workspace, connect the channels you use, and start with the free plan. No credit card required.',
      demo_eyebrow: 'Try it live',
      demo_title: 'Meet your new <span class="gradient-text">AI teammate</span>',
      demo_desc: 'Try a short example conversation. This preview does not use customer data.',
      demo_bot_name: 'ZainBot Assistant',
      demo_bot_status: 'Preview mode',
      demo_conf_label: 'Reply context',
      demo_welcome_msg: 'Welcome. This is a safe preview of how an agent can guide a customer conversation.',
      demo_chip1: '<i class="fas fa-box"></i> Ask about an order',
      demo_chip2: '<i class="fas fa-tag"></i> Ask about pricing',
      demo_chip3: '<i class="fas fa-calendar-check"></i> Book an appointment',
      demo_input_placeholder: 'Type your message...',
      aria_main_navigation: 'Main navigation',
      aria_toggle_language: 'Change language',
      aria_toggle_menu: 'Toggle menu',
      aria_demo_input: 'Type your message',
      aria_send_message: 'Send message',
      aria_back_to_top: 'Back to top',
      bento_eyebrow: 'Platform',
      bento_title: 'One AI brain. <span class="gradient-text">Every customer channel.</span>',
      bento_desc: 'Bring customer conversations into one workspace where your team can reply, automate, and follow up.',
      bento_card1_title: 'Unified inbox',
      bento_card1_desc: 'Keep incoming messages from your connected channels in one clear place.',
      bento_card1_msg1: 'Hi! Is the navy blazer still available?',
      bento_card1_msg2: 'Do you ship to Singapore?',
      bento_card1_msg3: 'My order arrived — thank you!',
      bento_card1_visitor: 'Website visitor',
      bento_card1_msg4: 'What are your business hours?',
      bento_card2_title: 'Smart AI replies',
      bento_card2_desc: 'Configure replies with the information and rules that matter to your business.',
      bento_card2_toggle: 'AI auto-reply',
      bento_card2_suggested: 'Suggested: “We have it in stock. Would you like help completing your order?”',
      bento_card3_title: 'Follow-up workflow',
      bento_card3_desc: 'Organize conversations so your team knows the next useful action.',
      bento_card3_new: 'New conversations',
      bento_card3_qualified: 'Needs follow-up',
      bento_card3_closed: 'Completed',
      bento_card4_title: 'Human handoff',
      bento_card4_desc: 'Pass a conversation to your team whenever a human response is needed.',
      bento_card4_ai: 'AI',
      bento_card4_agent: 'Team member',
      bento_card4_status: '<span class="handoff-indicator"></span>Handoff when your team is needed',
      bento_card5_title: 'Workspace insights',
      bento_card5_desc: 'Review the conversation and workspace signals that matter to your team.',
      bento_card5_live: 'Preview',
      workflow_eyebrow: 'How it works',
      workflow_title: 'From message to <span class="gradient-text">momentum.</span>',
      workflow_desc: 'Set up your workspace in clear steps and keep the control in your hands.',
      workflow_step1_title: 'Connect your channels',
      workflow_step1_desc: 'Link the channels you use and review their connection status from one place.',
      workflow_step2_title: 'Train your AI agent',
      workflow_step2_desc: 'Add your FAQs, product information, and guidance so the agent follows your business context.',
      workflow_step3_title: 'Review and improve',
      workflow_step3_desc: 'Test replies, monitor conversations, and hand off to your team when needed.',
      int_eyebrow: 'Channels',
      int_title: 'Meet customers where they <span class="gradient-text">already are.</span>',
      int_desc: 'Choose the channels that suit your business, then connect and monitor each one from your workspace.',
      int_connected: 'Ready to connect',
      int_available: 'Available',
      int_webchat: 'Website chat',
      metrics_eyebrow: 'Workspace',
      metrics_title: 'Less waiting. <span class="gradient-text">More clarity.</span>',
      metrics_desc: 'Keep the conversations, channels, orders, and usage that matter to your team in one clear workspace.',
      metric_panel_title: 'Workspace overview',
      metric_panel_live: 'Preview',
      pricing_eyebrow: 'Pricing',
      pricing_title: 'Flexible plans that <span class="gradient-text">scale with you.</span>',
      pricing_desc: 'Start free, upgrade when you need more power, and scale seamlessly as your business grows.',
      plan_free_title: 'Free',
      plan_free_price: '0',
      plan_free_period: 'EGP/mo',
      plan_free_desc: 'Perfect for testing, personal projects, and small stores starting out.',
      plan_free_f1: '<i class="fas fa-check"></i> 1 AI agent',
      plan_free_f2: '<i class="fas fa-check"></i> 25 messages/day (250/mo)',
      plan_free_f3: '<i class="fas fa-check"></i> Connect your own API keys (BYOK)',
      plan_free_f4: '<i class="fas fa-check"></i> Up to 3 channel connections',
      plan_free_f5: '<i class="fas fa-check"></i> Basic analytics & order tracking',
      plan_free_btn: 'Start free',
      plan_growth_popular: 'Most popular',
      plan_growth_title: 'Growth',
      plan_growth_price: '199',
      plan_growth_period: 'EGP/mo',
      plan_growth_desc: 'For growing stores and businesses wanting automated customer engagement.',
      plan_growth_f1: '<i class="fas fa-check"></i> Up to 5 AI agents',
      plan_growth_f2: '<i class="fas fa-check"></i> 1,000+ monthly cloud messages',
      plan_growth_f3: '<i class="fas fa-check"></i> Fail-safe backup API key failover',
      plan_growth_f4: '<i class="fas fa-check"></i> All channels (WhatsApp, IG, Messenger, etc.)',
      plan_growth_f5: '<i class="fas fa-check"></i> Advanced catalog & knowledge training',
      plan_growth_f6: '<i class="fas fa-check"></i> Priority customer support',
      plan_growth_btn: 'Start free trial',
      plan_scale_title: 'Enterprise / Scale',
      plan_scale_price: '999',
      plan_scale_period: 'EGP/mo',
      plan_scale_desc: 'For high-volume operations, larger teams, and established brands.',
      plan_scale_f1: '<i class="fas fa-check"></i> Unlimited AI agents',
      plan_scale_f2: '<i class="fas fa-check"></i> High-volume conversation capacity',
      plan_scale_f3: '<i class="fas fa-check"></i> Full API & Webhook integrations',
      plan_scale_f4: '<i class="fas fa-check"></i> Custom AI model fine-tuning',
      plan_scale_f5: '<i class="fas fa-check"></i> Dedicated account manager & 24/7 VIP support',
      plan_scale_f6: '<i class="fas fa-check"></i> White-label options & 99.9% uptime SLA',
      plan_scale_btn: 'Get started',
      cta_title: 'Ready to make every <span class="gradient-text">conversation count?</span>',
      cta_btn: 'Start building for free <i class="fas fa-arrow-right"></i>',
      cta_note: 'No credit card required. Start from your workspace.',
      footer_desc: 'Bring customer conversations into one workspace and give your team a clearer way to respond and follow up.',
      footer_col_product: 'Product',
      footer_link_features: 'Features',
      footer_link_integrations: 'Channels',
      footer_link_pricing: 'Plan',
      footer_link_demo: 'Preview',
      footer_link_changelog: 'Updates',
      footer_col_solutions: 'Workspace',
      footer_link_workflow: 'How it works',
      footer_link_ecommerce: 'E-commerce',
      footer_link_saas: 'Service teams',
      footer_link_healthcare: 'Appointments',
      footer_link_education: 'Education',
      footer_col_resources: 'Resources',
      footer_link_docs: 'Guides',
      footer_link_api: 'Developer tools',
      footer_link_blog: 'Product notes',
      footer_link_help: 'Help',
      footer_link_community: 'Community',
      footer_col_company: 'ZainBot',
      footer_link_about: 'About',
      footer_link_careers: 'Careers',
      footer_link_contact: 'Contact',
      footer_link_privacy: 'Privacy',
      footer_link_terms: 'Terms',
      footer_rights: '© 2026 ZainBot. All rights reserved.',
      footer_made: 'Built for teams that value clear customer conversations.'
    },
    ar: {
      nav_product: 'المنتج',
      nav_solutions: 'الحلول',
      nav_integrations: 'الربط الخارجي',
      nav_pricing: 'الأسعار',
      nav_resources: 'المصادر',
      nav_signin: 'تسجيل الدخول',
      nav_start_free: 'ابدأ مجاناً',
      hero_pill: '<span class="pill-dot"></span>زين بوت 2.0 متاح الآن <i class="fas fa-arrow-left"></i>',
      hero_title: 'عملك يستحق <span class="gradient-text">فريق عمل ذكي</span> لا ينام أبداً.',
      hero_subtitle: 'قم بنشر عملاء أذكياء يجيبون، يبيعون، يتابعون، ويتعلمون من كل محادثة مع العميل — عبر واتساب، إنستجرام، مسنجر، موقعك الإلكتروني، ومتجرك الإلكتروني. كل ذلك من منصة واحدة بسيطة وجميلة.',
      hero_btn_primary: 'ابنِ عميلك الذكي <i class="fas fa-arrow-left"></i>',
      hero_btn_secondary: '<i class="fas fa-play"></i> شاهد العرض',
      hero_proof: 'ابدأ بمساحة عمل مصممة حول احتياجات فريقك.',
      hero_chat_status: 'نموذج لمساحة العمل',
      hero_chat_customer_one: 'هل يتوفر هذا المنتج بالمقاس المتوسط؟',
      hero_chat_bot: 'نعم، المقاس المتوسط متاح. هل ترغب أن أساعدك في إتمام الطلب؟',
      hero_chat_customer_two: 'ممتاز، نعم من فضلك.',
      hero_chat_input: 'اكتب رسالة...',
      hero_floating_one: 'متابعة',
      hero_floating_one_label: 'جاهزة للأتمتة',
      hero_floating_two: 'جاهز دائمًا',
      hero_floating_three: 'عرض مساحة العمل',
      hero_floating_three_value: 'بياناتك المباشرة',
      bento_card2_ready: 'جاهز',
      metric_value_conversations: 'المحادثات',
      metric_value_channels: 'القنوات',
      metric_value_orders: 'الطلبات',
      metric_value_quota: 'الاستهلاك',
      metric_stat_value_live: 'مباشر',
      metric_stat_value_ready: 'جاهز',
      metric_stat_value_account: 'الحساب',
      bento_card2_accuracy: 'بناءً على تدريبك',
      bento_card5_convs: 'المحادثات',
      bento_card5_resolved: 'مؤشرات مفيدة',
      metric_lbl_response: 'اطّلع على كل محادثات العملاء',
      metric_lbl_leads: 'تحقق من حالة القنوات',
      metric_lbl_sat: 'تابع الطلبات والحجوزات',
      metric_lbl_coverage: 'اعرف المتاح في حسابك',
      metric_stat_lbl_resp: 'المحادثات',
      metric_stat_lbl_res: 'القنوات',
      metric_stat_lbl_sat: 'الاستهلاك',
      cta_desc: 'أنشئ مساحة عملك واربط القنوات التي تستخدمها وابدأ بالخطة المجانية دون بطاقة دفع.',
      demo_eyebrow: 'جرّب المثال',
      demo_title: 'تعرّف على <span class="gradient-text">زميلك الذكي</span>',
      demo_desc: 'جرّب محادثة قصيرة. هذا العرض لا يستخدم بيانات العملاء.',
      demo_bot_name: 'مساعد زين بوت',
      demo_bot_status: 'وضع المعاينة',
      demo_conf_label: 'سياق الرد',
      demo_welcome_msg: 'مرحبًا. هذه معاينة آمنة لكيفية إرشاد الوكيل الذكي لمحادثة العميل.',
      demo_chip1: '<i class="fas fa-box"></i> اسأل عن طلب',
      demo_chip2: '<i class="fas fa-tag"></i> اسأل عن الأسعار',
      demo_chip3: '<i class="fas fa-calendar-check"></i> احجز موعدًا',
      demo_input_placeholder: 'اكتب رسالتك...',
      aria_main_navigation: 'التنقل الرئيسي',
      aria_toggle_language: 'تغيير اللغة',
      aria_toggle_menu: 'فتح أو إغلاق القائمة',
      aria_demo_input: 'اكتب رسالتك',
      aria_send_message: 'إرسال الرسالة',
      aria_back_to_top: 'العودة إلى أعلى الصفحة',
      bento_eyebrow: 'المنصة',
      bento_title: 'عقل واحد للذكاء الاصطناعي. <span class="gradient-text">لكل قنوات عملائك.</span>',
      bento_desc: 'اجمع محادثات العملاء في مساحة عمل واحدة ليتمكن فريقك من الرد والأتمتة والمتابعة.',
      bento_card1_title: 'صندوق وارد موحد',
      bento_card1_desc: 'تابع الرسائل الواردة من قنواتك المرتبطة في مكان واضح واحد.',
      bento_card1_msg1: 'مرحبًا، هل الجاكيت الكحلي متاح؟',
      bento_card1_msg2: 'هل توفرون الشحن إلى سنغافورة؟',
      bento_card1_msg3: 'وصل طلبي، شكرًا لكم!',
      bento_card1_visitor: 'زائر الموقع',
      bento_card1_msg4: 'ما مواعيد العمل لديكم؟',
      bento_card2_title: 'ردود ذكية',
      bento_card2_desc: 'اضبط الردود بالمعلومات والقواعد التي تهم نشاطك التجاري.',
      bento_card2_toggle: 'الرد الآلي بالذكاء الاصطناعي',
      bento_card2_suggested: 'رد مقترح: «المنتج متاح. هل ترغب في المساعدة لإتمام الطلب؟»',
      bento_card3_title: 'مسار المتابعة',
      bento_card3_desc: 'نظّم المحادثات ليعرف فريقك الخطوة المفيدة التالية.',
      bento_card3_new: 'محادثات جديدة',
      bento_card3_qualified: 'تحتاج متابعة',
      bento_card3_closed: 'مكتملة',
      bento_card4_title: 'تحويل إلى فريقك',
      bento_card4_desc: 'حوّل المحادثة إلى فريقك متى احتاج العميل إلى رد بشري.',
      bento_card4_ai: 'الذكاء الاصطناعي',
      bento_card4_agent: 'عضو الفريق',
      bento_card4_status: '<span class="handoff-indicator"></span>تحويل المحادثة عند حاجة العميل إلى فريقك',
      bento_card5_title: 'رؤى مساحة العمل',
      bento_card5_desc: 'راجع إشارات المحادثات ومساحة العمل التي تهم فريقك.',
      bento_card5_live: 'معاينة',
      workflow_eyebrow: 'طريقة العمل',
      workflow_title: 'من الرسالة إلى <span class="gradient-text">خطوة واضحة.</span>',
      workflow_desc: 'جهّز مساحة عملك بخطوات واضحة واحتفظ بالتحكم بين يديك.',
      workflow_step1_title: 'اربط قنواتك',
      workflow_step1_desc: 'اربط القنوات التي تستخدمها وراجع حالة كل اتصال من مكان واحد.',
      workflow_step2_title: 'درّب وكيلك الذكي',
      workflow_step2_desc: 'أضف الأسئلة الشائعة ومعلومات المنتجات والتوجيهات ليعمل الوكيل ضمن سياق نشاطك.',
      workflow_step3_title: 'راجع وطوّر',
      workflow_step3_desc: 'اختبر الردود وتابع المحادثات وحوّلها إلى فريقك عند الحاجة.',
      int_eyebrow: 'القنوات',
      int_title: 'قابل عملاءك حيث <span class="gradient-text">يتواجدون.</span>',
      int_desc: 'اختر القنوات المناسبة لنشاطك ثم اربطها وتابع حالة كل قناة من مساحة عملك.',
      int_connected: 'جاهز للربط',
      int_available: 'متاح',
      int_webchat: 'دردشة الموقع',
      metrics_eyebrow: 'مساحة العمل',
      metrics_title: 'انتظار أقل. <span class="gradient-text">وضوح أكبر.</span>',
      metrics_desc: 'تابع المحادثات والقنوات والطلبات والاستخدام المهم لفريقك في مساحة عمل واحدة واضحة.',
      metric_panel_title: 'نظرة على مساحة العمل',
      metric_panel_live: 'معاينة',
      pricing_eyebrow: 'الأسعار والباقات',
      pricing_title: 'خطط مرنة وواضحة تناسب <span class="gradient-text">نمو أعمالك.</span>',
      pricing_desc: 'ابدأ مجانًا، وقم بالترقية عند حاجتك لمزيد من القوة والتوسع مع نمو نشاطك التجاري.',
      plan_free_title: 'المجانية',
      plan_free_price: '0',
      plan_free_period: 'ج.م/شهرياً',
      plan_free_desc: 'مثالية للتجربة والمشاريع الناشئة والمتاجر في بدايتها.',
      plan_free_f1: '<i class="fas fa-check"></i> وكيل ذكي واحد (1 AI Agent)',
      plan_free_f2: '<i class="fas fa-check"></i> 25 رسالة يومياً (250 شهرياً)',
      plan_free_f3: '<i class="fas fa-check"></i> ربط مفاتيح API الخاصة بك غير المحدودة',
      plan_free_f4: '<i class="fas fa-check"></i> ربط حتى 3 قنوات تواصل',
      plan_free_f5: '<i class="fas fa-check"></i> لوحة تحكم وتحليلات وإدارة الطلبات',
      plan_free_btn: 'ابدأ مجاناً',
      plan_growth_popular: 'الأكثر طلباً',
      plan_growth_title: 'النمو (Growth)',
      plan_growth_price: '199',
      plan_growth_period: 'ج.م/شهرياً',
      plan_growth_desc: 'للمتاجر والأنشطة المتنامية التي تبحث عن أتمتة كاملة للمحادثات.',
      plan_growth_f1: '<i class="fas fa-check"></i> حتى 5 وكلاء ذكاء اصطناعي مخصصين',
      plan_growth_f2: '<i class="fas fa-check"></i> أكثر من 1,000 محادثة سحابية شهرياً',
      plan_growth_f3: '<i class="fas fa-check"></i> مفتاح احتياطي ذكي لمنع انقطاع الخدمة',
      plan_growth_f4: '<i class="fas fa-check"></i> جميع القنوات (واتساب، إنستجرام، مسنجر وغيرها)',
      plan_growth_f5: '<i class="fas fa-check"></i> تدريب متقدم على الكتالوج وقاعدة المعرفة',
      plan_growth_f6: '<i class="fas fa-check"></i> دعم فني ذو أولوية',
      plan_growth_btn: 'ابدأ التجربة المجانية',
      plan_scale_title: 'الشركات (Enterprise)',
      plan_scale_price: '999',
      plan_scale_period: 'ج.م/شهرياً',
      plan_scale_desc: 'للشركات الكبرى والعمليات الضخمة والعلامات التجارية الرائدة.',
      plan_scale_f1: '<i class="fas fa-check"></i> عدد غير محدود من الوكلاء الذكيين',
      plan_scale_f2: '<i class="fas fa-check"></i> سعة محادثات ضخمة ومخصصة للاستخدام العالي',
      plan_scale_f3: '<i class="fas fa-check"></i> تكامل برمجي كامل عبر API و Webhooks',
      plan_scale_f4: '<i class="fas fa-check"></i> تخصيص وتدريب متقدم لنماذج الذكاء الاصطناعي',
      plan_scale_f5: '<i class="fas fa-check"></i> مدير حساب مخصص ودعم فني VIP على مدار الساعة',
      plan_scale_f6: '<i class="fas fa-check"></i> تخصيص العلامة التجارية وضمان استقرار SLA 99.9%',
      plan_scale_btn: 'ابدأ الآن',
      cta_title: 'هل أنت جاهز لجعل كل <span class="gradient-text">محادثة مهمة؟</span>',
      cta_btn: 'ابدأ مجانًا <i class="fas fa-arrow-left"></i>',
      cta_note: 'لا تحتاج إلى بطاقة دفع. ابدأ من مساحة عملك.',
      footer_desc: 'اجمع محادثات العملاء في مساحة عمل واحدة وامنح فريقك طريقة أوضح للرد والمتابعة.',
      footer_col_product: 'المنتج',
      footer_link_features: 'المزايا',
      footer_link_integrations: 'القنوات',
      footer_link_pricing: 'الخطة',
      footer_link_demo: 'المعاينة',
      footer_link_changelog: 'التحديثات',
      footer_col_solutions: 'مساحة العمل',
      footer_link_workflow: 'طريقة العمل',
      footer_link_ecommerce: 'التجارة الإلكترونية',
      footer_link_saas: 'فرق الخدمات',
      footer_link_healthcare: 'المواعيد',
      footer_link_education: 'التعليم',
      footer_col_resources: 'المصادر',
      footer_link_docs: 'الأدلة',
      footer_link_api: 'أدوات المطورين',
      footer_link_blog: 'ملاحظات المنتج',
      footer_link_help: 'المساعدة',
      footer_link_community: 'المجتمع',
      footer_col_company: 'زين بوت',
      footer_link_about: 'عن زين بوت',
      footer_link_careers: 'الوظائف',
      footer_link_contact: 'تواصل معنا',
      footer_link_privacy: 'الخصوصية',
      footer_link_terms: 'الشروط',
      footer_rights: '© 2026 زين بوت. جميع الحقوق محفوظة.',
      footer_made: 'صُممت لفرق تهتم بمحادثات عملاء أوضح.'
    }
  };

  const langToggleBtn = document.getElementById('langToggle');
  let currentLang = localStorage.getItem('zainbot_lang') || 'en';

  function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('zainbot_lang', lang);
    
    if (lang === 'ar') {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.setAttribute('lang', 'ar');
      if (langToggleBtn) langToggleBtn.textContent = 'EN';
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', 'en');
      if (langToggleBtn) langToggleBtn.textContent = 'AR';
    }

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (langTranslations[lang] && langTranslations[lang][key]) {
        el.innerHTML = langTranslations[lang][key];
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (langTranslations[lang] && langTranslations[lang][key]) el.placeholder = langTranslations[lang][key];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (langTranslations[lang] && langTranslations[lang][key]) el.setAttribute('aria-label', langTranslations[lang][key]);
    });
  }

  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const nextLang = currentLang === 'en' ? 'ar' : 'en';
      applyLanguage(nextLang);
    });
  }

  /* ===== INIT ===== */
  handleNavScroll();
  handleBackToTop();
  applyLanguage(currentLang);

})();
