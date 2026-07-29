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
  const pricingToggle = document.getElementById('pricingToggle');
  const monthlyLabel = document.getElementById('monthlyLabel');
  const yearlyLabel = document.getElementById('yearlyLabel');
  const prices = {
    starter: { monthly: 29, yearly: 23 },
    growth: { monthly: 79, yearly: 63 },
    scale: { monthly: 199, yearly: 159 }
  };

  pricingToggle.addEventListener('change', () => {
    const isYearly = pricingToggle.checked;
    monthlyLabel.classList.toggle('active', !isYearly);
    yearlyLabel.classList.toggle('active', isYearly);

    document.querySelectorAll('.price').forEach(el => {
      const plan = el.dataset.plan;
      const newPrice = prices[plan][isYearly ? 'yearly' : 'monthly'];
      el.style.opacity = '0';
      setTimeout(() => {
        el.textContent = newPrice;
        el.style.opacity = '1';
      }, 150);
    });
  });

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
      response: 'Your order #NX-2847 is on its way! 📦 It left our warehouse this morning and is currently at the local distribution center. Expected delivery: Thursday by 3 PM. Would you like me to share live tracking?',
      confidence: 97
    },
    {
      triggers: ['pricing', 'price', 'cost', 'plan', 'how much', 'subscription', 'billing'],
      response: "Great question! Here's a quick overview:\n\n• Starter — $29/mo: Perfect for small teams\n• Growth — $79/mo: Most popular, includes all channels\n• Scale — $199/mo: Unlimited everything\n\nAll plans come with a 14-day free trial. Want me to help you pick the right one?",
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
      demo_input_placeholder: 'Type your message...'
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
      demo_input_placeholder: 'اكتب رسالتك...'
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
