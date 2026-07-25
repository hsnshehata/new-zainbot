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

  function closeMobileMenu() {
    if (!hamburger || !navLinks) return;
    navLinks.classList.remove('mobile-open');
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }

  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('mobile-open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', String(isOpen));
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeMobileMenu);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navLinks.classList.contains('mobile-open')) {
        closeMobileMenu();
        hamburger.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) closeMobileMenu();
    }, { passive: true });
  }

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
    const target = parseFloat(el.dataset.target);
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

  /* ===== PRICING TOGGLE ===== */
  // Pricing toggle removed in favor of EGP flat rates with Growth volume options.

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

  const aiResponses = {
    en: [
      {
        triggers: ['where is my order', 'track', 'order status', 'delivery', 'my order', 'shipped', 'package', 'أين طلبي'],
        response: 'Your order #NX-2847 is on its way! 📦 It left our warehouse this morning and is currently at the local distribution center. Expected delivery: Thursday by 3 PM. Would you like me to share live tracking?',
        confidence: 97
      },
      {
        triggers: ['pricing', 'price', 'cost', 'plan', 'how much', 'subscription', 'billing', 'الأسعار', 'خطط'],
        response: "Great question! Here's a quick overview:\n\n• Starter — $29/mo: Perfect for small teams\n• Growth — $79/mo: Most popular, includes all channels\n• Scale — $199/mo: Unlimited everything\n\nAll plans come with a 14-day free trial. Want me to help you pick the right one?",
        confidence: 95
      },
      {
        triggers: ['book', 'appointment', 'schedule', 'meeting', 'demo', 'call', 'حجز'],
        response: "I'd be happy to help you book an appointment! 📅 Here are some available slots:\n\n• Tuesday at 2:00 PM\n• Wednesday at 11:00 AM\n• Thursday at 4:00 PM\n\nWhich time works best for you?",
        confidence: 93
      },
      {
        triggers: ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'مرحبا', 'أهلا'],
        response: "Hello! 👋 I'm ZainBot AI, your virtual assistant. I can help with orders, pricing, appointments, product questions, and more. What can I do for you today?",
        confidence: 99
      },
      {
        triggers: ['refund', 'return', 'cancel', 'money back', 'exchange', 'استرجاع', 'استرداد'],
        response: 'I understand you need help with a return or refund. No worries — items can be returned within 30 days of delivery. Would you like me to start a return request for you? I just need your order number. 🔄',
        confidence: 91
      },
      {
        triggers: ['thank', 'thanks', 'great', 'awesome', 'perfect', 'amazing', 'شكرا'],
        response: "You're very welcome! 😊 Is there anything else I can help you with today? I'm here 24/7 whenever you need me.",
        confidence: 98
      }
    ],
    ar: [
      {
        triggers: ['أين طلبي', 'شحن', 'طلب', 'تتبع', 'delivery', 'order', 'track'],
        response: 'طلبك رقم NX-2847 في الطريق إليك! 📦 لقد غادر مستودعنا هذا الصباح وهو حاليًا في مركز التوزيع المحلي. التوصيل المتوقع: الخميس بحلول الساعة 3 مساءً. هل ترغب في أن أشارك معك رابط التتبع المباشر؟',
        confidence: 97
      },
      {
        triggers: ['الأسعار', 'سعر', 'تكلفة', 'خطة', 'اشتراك', 'باقة', 'pricing', 'price', 'plan'],
        response: 'سؤال رائع! إليك نظرة عامة سريعة على خططنا:\n\n• المجانية — 0 جنيه: لتجربة الخدمة وإضافة مفاتيحك الخاصة\n• النمو — 150 جنيه/شهر: الباقة الأكثر شعبية، تشمل 1,000 محادثة وكل القنوات\n• اللامحدود — 5,000 جنيه/شهر: باقة غير محدودة لكافة الاستخدامات والشركات الكبرى\n\nهل تود أن أساعدك في اختيار الباقة المناسبة لعملك؟',
        confidence: 95
      },
      {
        triggers: ['حجز', 'موعد', 'اجتماع', 'اتصال', 'مكالمة', 'book', 'appointment', 'meeting'],
        response: 'يسعدني جدًا مساعدتك في حجز موعد! 📅 إليك بعض الأوقات المتاحة:\n\n• الثلاثاء الساعة 2:00 مساءً\n• الأربعاء الساعة 11:00 صباحًا\n• الخميس الساعة 4:00 مساءً\n\nما هو الوقت المناسب لك؟',
        confidence: 93
      },
      {
        triggers: ['مرحبا', 'أهلاً', 'السلام عليكم', 'hello', 'hi', 'hey'],
        response: 'مرحباً بك! 👋 أنا مساعد زين بوت الذكي. يمكنني مساعدتك في تتبع الطلبات، معرفة الأسعار، حجز المواعيد، والإجابة عن استفساراتك. كيف يمكنني مساعدتك اليوم؟',
        confidence: 99
      },
      {
        triggers: ['استرجاع', 'استرداد', 'إلغاء', 'refund', 'return', 'cancel'],
        response: 'أفهم أنك بحاجة إلى مساعدة بشأن إرجاع منتج أو استرداد الأموال. لا تقلق — يمكن إرجاع المنتجات في غضون 30 يومًا من تاريخ التوصيل. هل تود أن أبدأ لك طلب إرجاع؟ أحتاج فقط إلى رقم الطلب الخاص بك. 🔄',
        confidence: 91
      },
      {
        triggers: ['شكرا', 'جميل', 'رائع', 'ممتاز', 'thank', 'thanks', 'great'],
        response: 'على الرحب والسعة دائماً! 😊 هل هناك أي شيء آخر يمكنني مساعدتك به اليوم؟ أنا هنا لخدمتك على مدار الساعة 24/7.',
        confidence: 98
      }
    ]
  };

  const defaultResponse = {
    en: {
      response: "I'm here to help with orders, pricing, appointments, and product questions. Could you tell me a bit more about what you need? You can also try one of the suggested prompts below. 😊",
      confidence: 88
    },
    ar: {
      response: 'أنا هنا لمساعدتك في تتبع الطلبات، الأسعار، حجز المواعيد، والاستفسارات العامة. هل يمكنك إخباري بمزيد من التفاصيل عما تحتاجه؟ يمكنك أيضًا تجربة أحد الأسئلة المقترحة بالأسفل. 😊',
      confidence: 88
    }
  };

  function getAIResponse(message) {
    const msg = message.toLowerCase().trim();
    const responsesList = aiResponses[currentLang] || aiResponses.en;
    for (const item of responsesList) {
      if (item.triggers.some(trigger => msg.includes(trigger))) {
        return item;
      }
    }
    return defaultResponse[currentLang] || defaultResponse.en;
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
      const prompt = chip.textContent.trim();
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
      hero_proof: 'Trusted by <strong>2,400+</strong> growing teams',
      
      logo_strip_label: 'Built for teams that move fast',
      bento_eyebrow: 'Platform',
      bento_title: 'One AI brain. <span class="gradient-text">Every customer channel.</span>',
      bento_desc: 'ZainBot unifies your customer conversations into a single intelligent system that learns, adapts, and converts — automatically.',
      bento_card1_title: 'Omnichannel Inbox',
      bento_card1_desc: 'Every message from every channel lands in one unified, intelligent inbox.',
      bento_card1_msg1: 'Hi! Is the navy blazer still available?',
      bento_card1_msg2: 'Do you ship to Singapore?',
      bento_card1_msg3: 'My order arrived — thank you! ❤️',
      bento_card1_visitor: 'Website Visitor',
      bento_card1_msg4: 'What are your business hours?',
      bento_card2_title: 'Smart AI Replies',
      bento_card2_desc: 'Context-aware responses that sound human and convert better.',
      bento_card2_toggle: 'AI Auto-Reply',
      bento_card2_accuracy: 'Accuracy',
      bento_card2_suggested: 'Suggested: "Absolutely! We have it in stock and can ship today. Would you like me to place the order?"',
      bento_card3_title: 'Sales Automation',
      bento_card3_desc: 'Turn conversations into pipeline with automated follow-ups.',
      bento_card3_new: 'New Leads',
      bento_card3_qualified: 'Qualified',
      bento_card3_closed: 'Closed Won',
      bento_card4_title: 'Human Handoff',
      bento_card4_desc: 'Seamless escalation when a human touch is needed.',
      bento_card4_ai: 'AI',
      bento_card4_agent: 'Agent',
      bento_card4_status: '<span class="handoff-indicator"></span>Seamless handoff in &lt;2s',
      bento_card5_title: 'Live Analytics',
      bento_card5_desc: 'Real-time dashboards that surface what matters most.',
      bento_card5_live: 'Live',
      bento_card5_convs: 'convos',
      bento_card5_resolved: 'resolved',
      
      workflow_eyebrow: 'How it works',
      workflow_title: 'From message to <span class="gradient-text">momentum.</span>',
      workflow_desc: 'Get from zero to fully automated in three simple steps — no code required.',
      workflow_step1_title: 'Connect your channels',
      workflow_step1_desc: 'Link WhatsApp, Instagram, Messenger, Shopify, and your website in minutes. ZainBot syncs conversations instantly across every platform.',
      workflow_step2_title: 'Train your AI agent',
      workflow_step2_desc: 'Upload your FAQs, product catalog, and brand guidelines. ZainBot learns your voice, your products, and your customers in minutes.',
      workflow_step3_title: 'Let it convert conversations',
      workflow_step3_desc: 'Your AI agent goes live — answering questions, closing sales, booking appointments, and following up automatically, 24/7.',
      
      demo_eyebrow: 'Try it live',
      demo_title: 'Meet your new <span class="gradient-text">AI teammate</span>',
      demo_desc: 'Experience ZainBot in real time. Click a suggestion or type your own message — it actually responds.',
      demo_bot_name: 'ZainBot Assistant',
      demo_bot_status: 'Online now',
      demo_conf_label: 'AI Confidence',
      demo_welcome_msg: 'Hi! I\'m ZainBot. 👋 I can help with orders, pricing, appointments, and more. What can I do for you today?',
      demo_chip1: '<i class="fas fa-box"></i> Where is my order?',
      demo_chip2: '<i class="fas fa-tag"></i> Show me your pricing',
      demo_chip3: '<i class="fas fa-calendar-check"></i> Book an appointment',
      
      int_eyebrow: 'Integrations',
      int_title: 'Works where your customers <span class="gradient-text">already are.</span>',
      int_desc: 'Connect ZainBot to the platforms your customers use every day — no developer required.',
      int_connected: 'Connected',
      int_available: 'Available',
      int_webchat: 'Website Chat',
      
      metrics_eyebrow: 'Results',
      metrics_title: 'Less waiting. <span class="gradient-text">More selling.</span>',
      metrics_desc: 'Businesses powered by ZainBot see measurable impact within the first 30 days. Here\'s what that looks like.',
      metric_lbl_response: 'faster response time',
      metric_lbl_leads: 'more qualified leads',
      metric_lbl_sat: 'customer satisfaction',
      metric_lbl_coverage: 'customer coverage',
      metric_panel_title: 'Performance Overview',
      metric_panel_live: 'Live',
      metric_stat_lbl_resp: 'Avg Response',
      metric_stat_lbl_res: 'Resolved',
      metric_stat_lbl_sat: 'Satisfaction',
      
      test_eyebrow: 'Testimonials',
      test_title: 'Teams love <span class="gradient-text">talking to ZainBot.</span>',
      test1_text: 'Switching to ZainBot was the single best decision for our support team this year. Our response time dropped from hours to seconds, and our CSAT score jumped from 4.2 to 4.9. The AI handles 80% of tickets on its own.',
      test1_role: 'Head of CX, Lumio',
      test2_text: 'I was skeptical about AI handling sales conversations. Three months in, ZainBot has closed over $40K in additional revenue through automated follow-ups alone. It\'s like having a top sales rep who never takes a break.',
      test2_role: 'Founder, Brewlab',
      test3_text: 'We connected ZainBot to our Shopify store in under ten minutes. Within the first week, it was answering product questions, recovering abandoned carts, and booking restock alerts. The ROI was almost immediate.',
      test3_role: 'COO, Verde Commerce',

      pricing_eyebrow: 'Pricing',
      pricing_title: 'Simple pricing that <span class="gradient-text">scales with you.</span>',
      pricing_desc: 'Start free. Upgrade when you\'re ready. Cancel anytime.',
      plan_free_title: 'FREE',
      plan_free_period: 'EGP/mo',
      plan_free_desc: 'Free forever. You can add your own AI API keys. Includes a free trial key from us to reply to 25 messages/day (250/month).',
      plan_free_f1: '<i class="fas fa-check"></i> 1 AI agent',
      plan_free_f2: '<i class="fas fa-check"></i> 3 channels',
      plan_free_f3: '<i class="fas fa-check"></i> Basic analytics',
      plan_free_btn: 'Get started',
      plan_growth_popular: 'Most popular',
      plan_growth_title: 'Growth',
      plan_growth_period: 'EGP/mo',
      plan_growth_desc: 'For growing businesses that need power.',
      plan_growth_f1: '<i class="fas fa-check"></i> 5 AI agents',
      plan_growth_f2: '<i class="fas fa-check"></i> All channels',
      plan_growth_f3: '<i class="fas fa-check"></i> Priority support',
      plan_growth_f4: '<i class="fas fa-check"></i> Advanced analytics',
      plan_growth_f5: '<i class="fas fa-check"></i> more Custom AI training',
      plan_growth_f6: '<i class="fas fa-check"></i> Fail-safe backup API key failover',
      plan_growth_btn: 'Start free trial',
      plan_scale_title: 'Scale / Unlimited',
      plan_scale_period: 'EGP/mo',
      plan_scale_desc: 'For high-volume teams that need everything.',
      plan_scale_f1: '<i class="fas fa-check"></i> Unlimited AI agents',
      plan_scale_f2: '<i class="fas fa-check"></i> Unlimited conversations / mo',
      plan_scale_f3: '<i class="fas fa-check"></i> All channels + API access',
      plan_scale_f4: '<i class="fas fa-check"></i> Dedicated support',
      plan_scale_f5: '<i class="fas fa-check"></i> Full GPT-5.6 model support',
      plan_scale_f6: '<i class="fas fa-check"></i> Custom integrations & white-label',
      plan_scale_btn: 'Get started',

      cta_title: 'Ready to make every <span class="gradient-text">conversation count?</span>',
      cta_desc: 'Join 2,400+ teams using ZainBot to turn conversations into revenue. No credit card required. Launch in minutes.',
      cta_btn: 'Start building for free <i class="fas fa-arrow-right"></i>',
      cta_note: 'No credit card required. Launch in minutes.',
      
      footer_desc: 'Turn every conversation into growth. Build intelligent AI agents that answer, sell, and learn — across every channel your customers use.',
      footer_col_product: 'Product',
      footer_col_solutions: 'Solutions',
      footer_col_resources: 'Resources',
      footer_col_company: 'Company',
      footer_link_features: 'Features',
      footer_link_integrations: 'Integrations',
      footer_link_pricing: 'Pricing',
      footer_link_demo: 'Live Demo',
      footer_link_changelog: 'Changelog',
      footer_link_workflow: 'How it works',
      footer_link_ecommerce: 'E-commerce',
      footer_link_saas: 'SaaS',
      footer_link_healthcare: 'Healthcare',
      footer_link_education: 'Education',
      footer_link_docs: 'Documentation',
      footer_link_api: 'API Reference',
      footer_link_blog: 'Blog',
      footer_link_help: 'Help Center',
      footer_link_community: 'Community',
      footer_link_about: 'About',
      footer_link_careers: 'Careers',
      footer_link_contact: 'Contact',
      footer_link_privacy: 'Privacy',
      footer_link_terms: 'Terms',
      footer_rights: '© 2026 ZainBot. All rights reserved.',
      footer_made: 'Crafted with precision for the AI era.'
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
      hero_proof: 'موضع ثقة أكثر من <strong>2,400</strong> فريق عمل متنامي',
      
      logo_strip_label: 'مصمم خصيصاً لفرق العمل التي تتحرك بسرعة',
      bento_eyebrow: 'المنصة',
      bento_title: 'عقل ذكاء اصطناعي واحد. <span class="gradient-text">لكافة قنوات العملاء.</span>',
      bento_desc: 'يوحد زين بوت محادثات عملائك في نظام ذكي واحد يتعلم، يتكيف، ويحقق مبيعات — تلقائياً.',
      bento_card1_title: 'صندوق وارد موحد لكافة القنوات',
      bento_card1_desc: 'تصل كل رسالة من أي قناة تواصل إلى صندوق وارد ذكي وموحد.',
      bento_card1_msg1: 'مرحباً! هل السترة الزرقاء لا تزال متوفرة؟',
      bento_card1_msg2: 'هل تقومون بالشحن إلى سنغافورة؟',
      bento_card1_msg3: 'لقد وصل طلبي — شكراً لكم! ❤️',
      bento_card1_visitor: 'زائر الموقع الإلكتروني',
      bento_card1_msg4: 'ما هي ساعات العمل لديكم؟',
      bento_card2_title: 'ردود ذكاء اصطناعي ذكية',
      bento_card2_desc: 'ردود تفاعلية تفهم السياق، تبدو بشرية تماماً، وتحقق مبيعات أفضل.',
      bento_card2_toggle: 'الرد التلقائي للبوت',
      bento_card2_accuracy: 'الدقة والفاعلية',
      bento_card2_suggested: 'المقترح: "بالتأكيد! المنتج متوفر لدينا حالياً ويمكننا الشحن اليوم. هل تود أن أقوم بتأكيد الطلب لك؟"',
      bento_card3_title: 'أتمتة المبيعات الكاملة',
      bento_card3_desc: 'حوّل المحادثات إلى تدفق مستمر من الأرباح مع المتابعات التلقائية.',
      bento_card3_new: 'عملاء محتملون جدد',
      bento_card3_qualified: 'مؤهلون للشراء',
      bento_card3_closed: 'صفقات مكتملة',
      bento_card4_title: 'التحويل للموظف البشري',
      bento_card4_desc: 'تصعيد سلس وفوري للمحادثة عندما يتطلب الأمر تدخلاً بشرياً.',
      bento_card4_ai: 'البوت',
      bento_card4_agent: 'الموظف',
      bento_card4_status: '<span class="handoff-indicator"></span>تحويل سلس في أقل من ثانيتين',
      bento_card5_title: 'تحليلات وتقارير حية',
      bento_card5_desc: 'لوحات معلومات فورية تعرض لك البيانات الأكثر أهمية لنشاطك.',
      bento_card5_live: 'مباشر',
      bento_card5_convs: 'محادثة',
      bento_card5_resolved: 'تم حلها',
      
      workflow_eyebrow: 'خطوات العمل',
      workflow_title: 'من الرسالة الأولى إلى <span class="gradient-text">أعلى معدل أرباح.</span>',
      workflow_desc: 'انتقل من الصفر إلى الأتمتة الكاملة في ثلاث خطوات بسيطة — بدون أي أكواد برمجية.',
      workflow_step1_title: 'ربط وتوصيل القنوات',
      workflow_step1_desc: 'اربط قنوات واتساب، إنستجرام، مسنجر، شوبيفاي، وموقعك الإلكتروني في دقائق. يزامن زين بوت محادثاتك فورياً عبر جميع المنصات.',
      workflow_step2_title: 'تدريب عميلك الذكي',
      workflow_step2_desc: 'ارفع ملف الأسئلة الشائعة، كتالوج منتجاتك، وإرشادات هويتك. يتعلم زين بوت صوت علامتك التجارية، منتجاتك، وعملائك خلال دقائق.',
      workflow_step3_title: 'دعه يقوم بتحويل المحادثات',
      workflow_step3_desc: 'ينطلق عميلك الذكي للعمل مباشرة — يجيب الأسئلة، ينهي المبيعات، يؤكد الحجوزات، ويتابع العملاء تلقائياً على مدار الساعة 24/7.',
      
      demo_eyebrow: 'تجربة حية',
      demo_title: 'تعرف على <span class="gradient-text">زميلك الذكي الجديد</span>',
      demo_desc: 'اختبر زين بوت بنفسك في الوقت الفعلي. انقر على أحد الاقتراحات أو اكتب رسالتك الخاصة ودعه يجيبك.',
      demo_bot_name: 'مساعد زين بوت الذكي',
      demo_bot_status: 'نشط الآن',
      demo_conf_label: 'ثقة الذكاء الاصطناعي',
      demo_welcome_msg: 'مرحباً! أنا زين بوت. 👋 يمكنني مساعدتك في الطلبات، مراجعة الأسعار، حجز المواعيد، والمزيد. كيف يمكنني خدمتك اليوم؟',
      demo_chip1: '<i class="fas fa-box"></i> أين طلبي؟',
      demo_chip2: '<i class="fas fa-tag"></i> أرني الأسعار والخطط',
      demo_chip3: '<i class="fas fa-calendar-check"></i> حجز موعد جديد',
      
      int_eyebrow: 'منصات الربط',
      int_title: 'يعمل بكفاءة حيث <span class="gradient-text">يتواجد عملاؤك بالفعل.</span>',
      int_desc: 'اربط زين بوت بالمنصات التي يستخدمها عملائك يومياً — دون الحاجة لأي مطور برمجيات.',
      int_connected: 'متصل حالياً',
      int_available: 'متاح للربط',
      int_webchat: 'دردشة الموقع الإلكتروني',
      
      metrics_eyebrow: 'النتائج المحققة',
      metrics_title: 'وقت انتظار أقل. <span class="gradient-text">حجم مبيعات أكبر.</span>',
      metrics_desc: 'الشركات التي تعتمد على زين بوت تلمس نتائج قابلة للقياس خلال أول 30 يوماً. وإليك الأرقام.',
      metric_lbl_response: 'استجابة أسرع للعملاء',
      metric_lbl_leads: 'عملاء مؤهلين للشراء',
      metric_lbl_sat: 'معدل رضا العملاء الفعلي',
      metric_lbl_coverage: 'تغطية خدمة العملاء',
      metric_panel_title: 'نظرة عامة على الأداء',
      metric_panel_live: 'مباشر',
      metric_stat_lbl_resp: 'متوسط الاستجابة',
      metric_stat_lbl_res: 'نسبة الحل',
      metric_stat_lbl_sat: 'رضا العملاء',
      
      test_eyebrow: 'آراء عملائنا',
      test_title: 'شركات تثق بـ <span class="gradient-text">محادثات زين بوت الذكية.</span>',
      test1_text: 'كان الانتقال إلى زين بوت القرار الأفضل لفريق الدعم لدينا هذا العام. انخفض وقت الاستجابة من ساعات إلى ثوانٍ معدودة، وارتفع تقييم رضا العملاء بشكل ملحوظ. يتعامل الذكاء الاصطناعي مع 80% من الاستفسارات بمفرده.',
      test1_role: 'مديرة تجربة العملاء، Lumio',
      test2_text: 'كنت متشككاً في قدرة الذكاء الاصطناعي على التعامل مع محادثات المبيعات. بعد ثلاثة أشهر، نجح زين بوت في تحقيق أكثر من 40 ألف دولار كأرباح إضافية عبر المتابعات التلقائية وحدها. إنه كأفضل مندوب مبيعات يعمل بلا إجازة.',
      test2_role: 'المؤسس، Brewlab',
      test3_text: 'قمنا بربط زين بوت بمتجرنا على شوبيفاي في أقل من عشر دقائق. وخلال الأسبوع الأول، بدأ بالإجابة عن استفسارات المنتجات واستعادة السلات المتروكة وتأكيد الحجوزات. العائد على الاستثمار كان فورياً وسريعاً جداً.',
      test3_role: 'المديرة التشغيلية، Verde Commerce',

      pricing_eyebrow: 'الأسعار',
      pricing_title: 'باقات مرنة <span class="gradient-text">تنمو مع أعمالك.</span>',
      pricing_desc: 'ابدأ مجاناً. قم بالترقية عندما تحتاج. إلغاء الاشتراك في أي وقت.',
      plan_free_title: 'المجانية',
      plan_free_period: 'جنيه/شهرياً',
      plan_free_desc: 'مجاني للأبد. يمكنك إضافة مفاتيح الذكاء الاصطناعي الخاصة بك، مع توفير مفتاح تجريبي مجاني من عندنا للرد على 25 رسالة يومياً (بإجمالي 250 شهرياً).',
      plan_free_f1: '<i class="fas fa-check"></i> عميل ذكاء اصطناعي واحد (1)',
      plan_free_f2: '<i class="fas fa-check"></i> 3 قنوات تواصل',
      plan_free_f3: '<i class="fas fa-check"></i> إحصائيات أساسية',
      plan_free_btn: 'ابدأ الآن',
      plan_growth_popular: 'الأكثر شعبية',
      plan_growth_title: 'باقة النمو (Growth)',
      plan_growth_period: 'جنيه/شهرياً',
      plan_growth_desc: 'للشركات النامية التي تحتاج إلى قوة وميزات متقدمة.',
      plan_growth_f1: '<i class="fas fa-check"></i> 5 عملاء ذكاء اصطناعي',
      plan_growth_f2: '<i class="fas fa-check"></i> جميع قنوات التواصل',
      plan_growth_f3: '<i class="fas fa-check"></i> دعم ذو أولوية',
      plan_growth_f4: '<i class="fas fa-check"></i> تحليلات متقدمة',
      plan_growth_f5: '<i class="fas fa-check"></i> تدريب مخصص إضافي للبوت',
      plan_growth_f6: '<i class="fas fa-check"></i> إضافة مفتاح API احتياطي في حال نفاذ الباقة',
      plan_growth_btn: 'ابدأ الفترة التجريبية',
      plan_scale_title: 'باقة اللامحدود (Scale)',
      plan_scale_period: 'جنيه/شهرياً',
      plan_scale_desc: 'للشركات الكبرى ذات الاحتياجات الحجمية العالية.',
      plan_scale_f1: '<i class="fas fa-check"></i> عدد غير محدود من العملاء',
      plan_scale_f2: '<i class="fas fa-check"></i> محادثات شهرية غير محدودة',
      plan_scale_f3: '<i class="fas fa-check"></i> كافة القنوات + صلاحية API',
      plan_scale_f4: '<i class="fas fa-check"></i> دعم فني مخصص',
      plan_scale_f5: '<i class="fas fa-check"></i> دعم كامل لنموذج GPT-5.6 الجديد',
      plan_scale_f6: '<i class="fas fa-check"></i> ربط مخصص وبوابة White-label',
      plan_scale_btn: 'ابدأ الآن',

      cta_title: 'هل أنت مستعد لتجعل كل <span class="gradient-text">محادثة ذات قيمة حقيقية؟</span>',
      cta_desc: 'انضم إلى أكثر من 2,400 فريق عمل يعتمدون على زين بوت لتحويل المحادثات إلى أرباح حقيقية. ابدأ في دقائق دون الحاجة لبطاقة ائتمان.',
      cta_btn: 'ابدأ البناء والتجربة مجاناً <i class="fas fa-arrow-left"></i>',
      cta_note: 'لا تحتاج لبطاقة ائتمانية للبدء. الإعداد في دقائق.',
      
      footer_desc: 'حوّل كل محادثة إلى نمو حقيقي. ابنِ عملاء أذكياء يجيبون، يبيعون، ويتعلمون — عبر كافة قنوات التواصل التي يفضلها عملاؤك.',
      footer_col_product: 'المنتج',
      footer_col_solutions: 'الحلول',
      footer_col_resources: 'المصادر',
      footer_col_company: 'الشركة',
      footer_link_features: 'الميزات الرئيسية',
      footer_link_integrations: 'الربط البرمجي',
      footer_link_pricing: 'الخطط والأسعار',
      footer_link_demo: 'تجربة حية للبوت',
      footer_link_changelog: 'تحديثات النظام',
      footer_link_workflow: 'كيف يعمل زين بوت',
      footer_link_ecommerce: 'التجارة الإلكترونية',
      footer_link_saas: 'الشركات الناشئة SaaS',
      footer_link_healthcare: 'الرعاية الصحية',
      footer_link_education: 'التعليم الأكاديمي',
      footer_link_docs: 'المستندات الفنية',
      footer_link_api: 'مرجع واجهة الـ API',
      footer_link_blog: 'المدونة البرمجية',
      footer_link_help: 'مركز المساعدة الدعم',
      footer_link_community: 'المجتمع والمنتدى',
      footer_link_about: 'من نحن',
      footer_link_careers: 'الوظائف المتاحة',
      footer_link_contact: 'اتصل بنا',
      footer_link_privacy: 'سياسة الخصوصية',
      footer_link_terms: 'شروط الاستخدام',
      footer_rights: '© 2026 جميع الحقوق محفوظة لشركة زين بوت.',
      footer_made: 'صنع بدقة وعناية لعصر الذكاء الاصطناعي الجديد.'
    }
  };

  const langToggleBtn = document.getElementById('langToggle');
  let currentLang = localStorage.getItem('zainbot_lang') || 'en';

  const growthPlanSelector = document.getElementById('growthPlanSelector');
  const growthDisplayPrice = document.getElementById('growthDisplayPrice');
  const growthConvsLimitText = document.getElementById('growthConvsLimitText');

  function updateGrowthUI() {
    if (!growthPlanSelector) return;
    const value = growthPlanSelector.value;
    const selectedOption = growthPlanSelector.options[growthPlanSelector.selectedIndex];
    if (!selectedOption) return;
    const convs = selectedOption.getAttribute('data-convs');
    
    if (growthDisplayPrice) {
      growthDisplayPrice.textContent = value;
    }
    
    if (growthConvsLimitText) {
      if (currentLang === 'ar') {
        growthConvsLimitText.innerHTML = `<i class="fas fa-check"></i> ${convs} محادثة / شهرياً`;
      } else {
        growthConvsLimitText.innerHTML = `<i class="fas fa-check"></i> ${convs} conversations / mo`;
      }
    }
  }

  function updateGrowthSelectorOptions(lang) {
    if (!growthPlanSelector) return;
    const optionsData = [
      { value: '150', convs: '1,000', en: '150 EGP/mo (1k convs/mo)', ar: '150 جنيه/شهرياً (1,000 محادثة)' },
      { value: '500', convs: '10,000', en: '500 EGP/mo (10k convs/mo)', ar: '500 جنيه/شهرياً (10,000 محادثة)' },
      { value: '1200', convs: '50,000', en: '1200 EGP/mo (50k convs/mo)', ar: '1200 جنيه/شهرياً (50,000 محادثة)' }
    ];
    
    const currentVal = growthPlanSelector.value;
    growthPlanSelector.innerHTML = '';
    
    optionsData.forEach(opt => {
      const optionEl = document.createElement('option');
      optionEl.value = opt.value;
      optionEl.setAttribute('data-convs', opt.convs);
      optionEl.textContent = lang === 'ar' ? opt.ar : opt.en;
      optionEl.style.background = '#0b0c16';
      optionEl.style.color = '#ffffff';
      if (opt.value === currentVal) {
        optionEl.selected = true;
      }
      growthPlanSelector.appendChild(optionEl);
    });
  }

  if (growthPlanSelector) {
    growthPlanSelector.addEventListener('change', updateGrowthUI);
  }

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

    const demoChatInput = document.getElementById('demoChatInput');
    if (demoChatInput) {
      demoChatInput.placeholder = lang === 'ar' ? 'اكتب رسالتك هنا...' : 'Type your message...';
    }

    updateGrowthSelectorOptions(lang);
    updateGrowthUI();
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
