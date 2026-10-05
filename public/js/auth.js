document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.querySelector('#loginForm');
  const registerForm = document.querySelector('#registerForm');
  const logoutButtons = document.querySelectorAll('.logout-btn');
  const errorDiv = document.querySelector('#error');
  const successDiv = document.querySelector('#success');
  const loginCopy = {
    ar: {
      google_failed: 'فشل تسجيل الدخول بجوجل. حاول مرة أخرى.',
      google_error: 'حدث خطأ أثناء تسجيل الدخول بجوجل.',
      credentials_required: 'أدخل اسم المستخدم وكلمة المرور.',
      login_failed: 'فشل تسجيل الدخول. تأكد من اسم المستخدم وكلمة المرور.',
      login_error: 'حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.',
      all_fields_required: 'جميع الحقول مطلوبة ما عدا رقم الواتساب.',
      passwords_dont_match: 'كلمات المرور غير متطابقة.',
      password_strength_error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف كبير وصغير ورقم ورمز وبدون مسافات.',
      username_format_error: 'اسم المستخدم يجب أن يحتوي على حروف إنجليزية، أرقام، _ أو - فقط.',
      register_failed: 'فشل التسجيل، حاول مرة أخرى.',
      register_error: 'حدث خطأ أثناء التسجيل، حاول مرة أخرى.',
      registration_delivery_failed: 'اتحفظ حسابك، لكن تعذر إرسال بريد التفعيل. استخدم إعادة إرسال الرابط بالأسفل.',
      register_success: 'تم إنشاء الحساب بنجاح! يرجى مراجعة بريدك الإلكتروني لتفعيل الحساب.',
      verification_success: 'تم تفعيل حسابك. سجّل الدخول الآن.', verification_invalid: 'رابط التفعيل غير صالح أو مستخدم. اطلب رابطًا جديدًا.',
      resend_sent: 'إذا كان الحساب ينتظر التفعيل، سنرسل رابطًا جديدًا.', forgot_sent: 'إذا كان البريد مسجلاً، سنرسل رابط استعادة.',
      recovery_error: 'تعذر إرسال الطلب. حاول مرة أخرى.', recovery_required: 'أدخل بريدًا إلكترونيًا صالحًا.',
      reset_invalid: 'رابط الاستعادة غير صالح أو منتهي.', reset_success: 'تم تغيير كلمة المرور. سجّل الدخول الآن.',
      logout_error: 'حدث خطأ أثناء تسجيل الخروج، حاول مرة أخرى.'
    },
    en: {
      google_failed: 'Google sign-in failed. Please try again.',
      google_error: 'An error occurred during Google sign-in.',
      credentials_required: 'Enter your username and password.',
      login_failed: 'Sign-in failed. Check your username and password.',
      login_error: 'An error occurred during sign-in. Please try again.',
      all_fields_required: 'All fields are required except WhatsApp number.',
      passwords_dont_match: 'Passwords do not match.',
      password_strength_error: 'Password must be at least 8 characters with uppercase, lowercase, number, symbol, and no spaces.',
      username_format_error: 'Username can only contain English letters, numbers, _ or -.',
      register_failed: 'Registration failed. Please try again.',
      register_error: 'An error occurred during registration. Please try again.',
      registration_delivery_failed: 'Your account was saved, but the verification email could not be sent. Use the resend option below.',
      register_success: 'Account created successfully! Please check your email to activate your account.',
      verification_success: 'Your account is verified. Sign in now.', verification_invalid: 'Verification link is invalid or used. Request another link.',
      resend_sent: 'If the account awaits verification, we will send a new link.', forgot_sent: 'If the email is registered, we will send a recovery link.',
      recovery_error: 'Could not send the request. Please try again.', recovery_required: 'Enter a valid email address.',
      reset_invalid: 'Recovery link is invalid or expired.', reset_success: 'Password changed. Sign in now.',
      logout_error: 'Could not sign out. Please try again.'
    }
  };
  // <zainbot-login-language>
  const loginLanguage = () => {
    try {
      const storage = window.localStorage;
      if (!storage) return 'ar';
      const stored = storage.getItem('zainbot_lang');
      if (stored === 'ar' || stored === 'en') return stored;
    } catch (err) { /* storage blocked: fall through to default */ }
    return 'ar';
  };
  const loginText = (key) => loginCopy[loginLanguage()][key];
  // </zainbot-login-language>
  const params = new URLSearchParams(window.location.search);
  const recoveryParams = new URLSearchParams(window.location.hash.slice(1));
  const resetToken = /^[a-f0-9]{64}$/.test(recoveryParams.get('reset') || '') ? recoveryParams.get('reset') : null;
  const verifyToken = /^[a-f0-9]{64}$/.test(recoveryParams.get('verify') || '') ? recoveryParams.get('verify') : null;
  if (recoveryParams.has('reset') || recoveryParams.has('verify')) window.history.replaceState(null, '', window.location.pathname);
  // Live keyed messages: a visible LOCAL message keeps its key and re-renders
  // on zainbot:languagechange without form reset or new requests. Server
  // free-text is shown raw and never re-rendered (known codes map only —
  // never guessed from text).
  let liveMessage = null;
  const showKeyed = (element, key) => {
    const text = loginText(key);
    if (element && text) {
      element.textContent = text;
      element.style.display = 'block';
      liveMessage = { element, key };
    }
  };
  const showRaw = (element, text) => {
    if (element) { element.textContent = text; element.style.display = 'block'; }
    liveMessage = null;
  };
  const showFailure = (element, err, key) => {
    if (!element) return;
    if (err && err.message) showRaw(element, err.message);
    else showKeyed(element, key);
  };
  // E07: field-level error association + focus management. Server/general
  // outcomes keep flowing to the shared #error region untouched (C07 owns
  // that path); only LOCAL validation flags fields, and every submit clears
  // stale flags first so a server message is never misattributed.
  const safeFocus = (element) => {
    if (!element || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      try {
        element.focus();
      } catch (ignored) { /* non-focusable stub: leave focus alone */ }
    }
  };
  const isVisibleField = (element) => {
    if (!element) return false;
    try {
      if (element.hidden === true) return false;
      if (element.style && element.style.display === 'none') return false;
    } catch (err) { return false; }
    return true;
  };
  const isInside = (root, node) => {
    try {
      return !!(root && node && typeof root.contains === 'function' && root.contains(node));
    } catch (err) { return false; }
  };
  const activeInside = (root) => {
    try {
      const active = document.activeElement;
      return !!(active && isInside(root, active));
    } catch (err) { return false; }
  };
  const flaggedFields = new Set();
  const linkFieldError = (field) => {
    if (!field || typeof field.setAttribute !== 'function') return;
    try {
      field.setAttribute('aria-invalid', 'true');
      if (!errorDiv || typeof field.getAttribute !== 'function') return;
      const described = String(field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!described.includes('error')) described.push('error');
      field.setAttribute('aria-describedby', described.join(' '));
    } catch (err) { /* attribute storage unavailable: invalid flag is best-effort */ }
    flaggedFields.add(field);
  };
  const unlinkFieldError = (field) => {
    if (!field) return;
    try {
      if (typeof field.removeAttribute === 'function') {
        field.removeAttribute('aria-invalid');
        if (typeof field.getAttribute === 'function') {
          const kept = String(field.getAttribute('aria-describedby') || '').split(/\s+/).filter((t) => t && t !== 'error');
          if (kept.length) field.setAttribute('aria-describedby', kept.join(' '));
          else field.removeAttribute('aria-describedby');
        }
      }
    } catch (err) { /* best-effort */ }
    flaggedFields.delete(field);
  };
  const clearAllFieldFlags = () => {
    Array.from(flaggedFields).forEach(unlinkFieldError);
    flaggedFields.clear();
  };
  const flagInvalid = (field, key) => {
    showKeyed(errorDiv, key);
    linkFieldError(field);
    if (isVisibleField(field)) safeFocus(field);
  };
  // When a form is hidden (toggle-hide, reset success), focus inside it
  // would strand on a hidden element: move it to the first visible fallback.
  const moveFocusOutOf = (hiddenRoot, fallbacks) => {
    if (!activeInside(hiddenRoot)) return;
    const options = Array.isArray(fallbacks) ? fallbacks : [];
    for (const candidate of options) {
      let element = null;
      try {
        element = typeof candidate === 'string' ? document.querySelector(candidate) : candidate;
      } catch (err) { element = null; }
      if (isVisibleField(element)) {
        safeFocus(element);
        return;
      }
    }
    try {
      const body = document.body;
      if (isVisibleField(body)) safeFocus(body);
    } catch (err) { /* no body to fall back to: leave focus alone */ }
  };
  const FOCUS_MANAGED_IDS = ['#username', '#password', '#confirmPassword', '#botName', '#email', '#recoveryEmail', '#resendEmail', '#newPassword', '#resetConfirm'];
  FOCUS_MANAGED_IDS.forEach((selector) => {
    try {
      document.querySelector(selector)?.addEventListener('input', (event) => {
        const field = event && event.target ? event.target : document.querySelector(selector);
        if (field && flaggedFields.has(field)) unlinkFieldError(field);
      });
    } catch (err) { /* wiring is best-effort */ }
  });
  async function authRequest(url, options, errorKey) {
    const fallback = loginText(errorKey);
    try {
      return await handleApiRequest(url, options, null, fallback);
    } catch (err) {
      if (err && typeof err.message === 'string' && fallback && err.message.startsWith(fallback + ':')) {
        err.message = '';
      }
      throw err;
    }
  }
  document.addEventListener('zainbot:languagechange', () => {
    if (!liveMessage) return;
    const { element, key } = liveMessage;
    if (!element || !element.isConnected || element.style.display === 'none') return;
    const text = loginText(key);
    if (text) element.textContent = text;
  });
  if (params.has('verification')) showKeyed(params.get('verification') === 'success' ? successDiv : errorDiv,
    params.get('verification') === 'success' ? 'verification_success' : 'verification_invalid');
  if (recoveryParams.has('reset') && !resetToken) showKeyed(errorDiv, 'reset_invalid');
  if (recoveryParams.has('verify') && !verifyToken) showKeyed(errorDiv, 'verification_invalid');
  if (verifyToken) {
    fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: verifyToken }) })
      .then((response) => showKeyed(response.ok ? successDiv : errorDiv, response.ok ? 'verification_success' : 'verification_invalid'))
      .catch(() => showKeyed(errorDiv, 'verification_invalid'));
  }
  if (resetToken) {
    document.querySelector('#resetForm')?.removeAttribute('hidden');
    const newPasswordField = document.querySelector('#newPassword');
    if (isVisibleField(newPasswordField)) safeFocus(newPasswordField);
  }

  async function recoveryRequest(url, body, form, successKey) {
    try {
      const data = await authRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'recovery_error');
      showKeyed(successDiv, successKey);
      if (errorDiv) errorDiv.style.display = 'none';
      form.reset();
      return true;
    } catch (err) {
      showFailure(errorDiv, err, 'recovery_error');
      return false;
    }
  }

  const resendToggle = document.querySelector('#resendToggle');
  resendToggle?.addEventListener('click', () => {
    const form = document.querySelector('#resendForm');
    form.hidden = !form.hidden;
    resendToggle.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) {
      const field = document.querySelector('#resendEmail');
      if (isVisibleField(field)) safeFocus(field);
    } else {
      moveFocusOutOf(form, [resendToggle]);
    }
  });
  document.querySelector('#resendForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllFieldFlags();
    const emailField = document.querySelector('#resendEmail');
    if (!emailField || !emailField.checkValidity()) {
      if (emailField) flagInvalid(emailField, 'recovery_required');
      else showKeyed(errorDiv, 'recovery_required');
      return;
    }
    await recoveryRequest('/api/auth/resend-verification', { email: emailField.value.trim() }, e.target, 'resend_sent');
  });
  document.querySelector('#forgotToggle')?.addEventListener('click', (e) => {
    const form = document.querySelector('#forgotForm');
    form.hidden = !form.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!form.hidden));
    if (!form.hidden) {
      const field = document.querySelector('#recoveryEmail');
      if (isVisibleField(field)) safeFocus(field);
    } else {
      moveFocusOutOf(form, [e.currentTarget]);
    }
  });
  document.querySelector('#forgotForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllFieldFlags();
    const field = document.querySelector('#recoveryEmail');
    if (!field || !field.checkValidity()) {
      if (field) flagInvalid(field, 'recovery_required');
      else showKeyed(errorDiv, 'recovery_required');
      return;
    }
    await recoveryRequest('/api/auth/forgot-password', { email: field.value.trim() }, e.target, 'forgot_sent');
  });
  document.querySelector('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllFieldFlags();
    const newPasswordField = document.querySelector('#newPassword');
    const resetConfirmField = document.querySelector('#resetConfirm');
    if (!isStrongPassword(newPasswordField && newPasswordField.value)) {
      if (newPasswordField) flagInvalid(newPasswordField, 'password_strength_error');
      else showKeyed(errorDiv, 'password_strength_error');
      return;
    }
    if (newPasswordField && resetConfirmField && newPasswordField.value !== resetConfirmField.value) {
      flagInvalid(resetConfirmField, 'passwords_dont_match');
      return;
    }
    if (await recoveryRequest('/api/auth/reset-password', { token: resetToken, password: newPasswordField.value, confirmPassword: newPasswordField.value }, e.target, 'reset_success')) {
      e.target.hidden = true;
      moveFocusOutOf(e.target, ['#username', '#forgotToggle']);
    }
  });

  const saveSession = (payload) => {
    const expiryMs = getTokenExpiryFromJwt(payload.token) || undefined;
    if (window.saveAuthSession) {
      window.saveAuthSession({ ...payload, expiryMs });
    } else {
      localStorage.setItem('token', payload.token);
      if (expiryMs) localStorage.setItem('tokenExpiry', `${expiryMs}`);
      if (payload.role) localStorage.setItem('role', payload.role);
      if (payload.userId) localStorage.setItem('userId', payload.userId);
      if (payload.username) localStorage.setItem('username', payload.username);
    }
  };

  const clearSession = () => {
    if (window.clearAuthSession) {
      window.clearAuthSession();
    } else {
      ['token', 'tokenExpiry', 'role', 'userId', 'username', 'selectedBotId', 'theme'].forEach((k) => localStorage.removeItem(k));
    }
  };

  const token = window.getAuthToken ? window.getAuthToken() : null;
  const isLoginPage = window.location.pathname === '/login' || window.location.pathname === '/login.html' || window.location.pathname === '/';

  if (token && isLoginPage && !resetToken && !verifyToken && !params.has('verification')) {
          window.location.href = '/dashboard';
    return;
  }

  if (!token && !isLoginPage && localStorage.getItem('token')) {
    clearSession();
    window.location.href = '/login';
    return;
  }

  // Handle Google Sign-In
  window.handleGoogleSignIn = async (response) => {
    const idToken = response.credential;
    try {
      const data = await authRequest('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken, ...(registerForm && window.zainbotSignupIntendedTier ? { intendedTier: window.zainbotSignupIntendedTier } : {}) }),
      }, 'google_failed');

      if (data.success) {
        saveSession({ token: data.token, role: data.role, userId: data.userId, username: data.username });
              window.location.href = '/dashboard';
      } else if (data.message) {
        showRaw(errorDiv, data.message);
      } else {
        showKeyed(errorDiv, 'google_failed');
      }
    } catch (err) {
      showFailure(errorDiv, err, 'google_failed');
    }
  };

  // Handle login form submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAllFieldFlags();

      const usernameField = document.querySelector('#username');
      const passwordField = document.querySelector('#password');
      const username = usernameField ? usernameField.value.trim() : '';
      const password = passwordField ? passwordField.value : '';

      if (!username || !password) {
        showKeyed(errorDiv, 'credentials_required');
        const firstEmpty = !username ? usernameField : passwordField;
        if (firstEmpty) {
          if (usernameField && !username) linkFieldError(usernameField);
          if (passwordField && !password) linkFieldError(passwordField);
          if (isVisibleField(firstEmpty)) safeFocus(firstEmpty);
        }
        return;
      }

      try {
        const data = await authRequest('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        }, 'login_failed');

        if (data.success) {
          saveSession({ token: data.token, role: data.role, userId: data.userId, username: data.username });
                window.location.href = '/dashboard';
        } else if (data.message) {
          showRaw(errorDiv, data.message);
        } else {
          showKeyed(errorDiv, 'login_failed');
        }
      } catch (err) {
        showFailure(errorDiv, err, 'login_failed');
      }
    });
  }

  // Handle register form submission
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.querySelector('#username').value.trim();
      const password = document.querySelector('#password').value;
      const confirmPassword = document.querySelector('#confirmPassword').value;
      const botName = document.querySelector('#botName').value.trim();
      const whatsapp = document.querySelector('#whatsapp').value.trim();
      const email = document.querySelector('#email').value.trim();

      // Reset error and success messages
      if (errorDiv) {
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
      }
      if (successDiv) {
        successDiv.style.display = 'none';
        successDiv.textContent = '';
      }
      liveMessage = null;

      // Validate inputs
      clearAllFieldFlags();
      const usernameField = document.querySelector('#username');
      const passwordField = document.querySelector('#password');
      const confirmField = document.querySelector('#confirmPassword');
      if (!username || !password || !confirmPassword || !botName || !email) {
        showKeyed(errorDiv, 'all_fields_required');
        const emptyFields = [usernameField, passwordField, confirmField,
          document.querySelector('#botName'), document.querySelector('#email')]
          .filter((field) => field && !field.value.trim());
        emptyFields.forEach(linkFieldError);
        const firstEmpty = emptyFields.length > 0 ? emptyFields[0] : null;
        if (firstEmpty && isVisibleField(firstEmpty)) safeFocus(firstEmpty);
        return;
      }

      if (password !== confirmPassword) {
        showKeyed(errorDiv, 'passwords_dont_match');
        if (confirmField) {
          linkFieldError(confirmField);
          if (isVisibleField(confirmField)) safeFocus(confirmField);
        }
        return;
      }

      if (!isStrongPassword(password)) {
        showKeyed(errorDiv, 'password_strength_error');
        if (passwordField) {
          linkFieldError(passwordField);
          if (isVisibleField(passwordField)) safeFocus(passwordField);
        }
        return;
      }

      if (!/^[a-z0-9_-]+$/.test(username)) {
        showKeyed(errorDiv, 'username_format_error');
        if (usernameField) {
          linkFieldError(usernameField);
          if (isVisibleField(usernameField)) safeFocus(usernameField);
        }
        return;
      }

      try {
        const data = await authRequest('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password, confirmPassword, botName, whatsapp, email,
            ...(window.zainbotSignupIntendedTier ? { intendedTier: window.zainbotSignupIntendedTier } : {}) }),
        }, 'register_failed');

        if (data.success) {
          showKeyed(successDiv, 'register_success');
          if (errorDiv) {
            errorDiv.style.display = 'none';
          }
          registerForm.reset();
        } else if (data.message) {
          showRaw(errorDiv, data.message);
        } else {
          showKeyed(errorDiv, 'register_failed');
        }
      } catch (err) {
        if (err.status === 503) showKeyed(errorDiv, 'registration_delivery_failed');
        else showFailure(errorDiv, err, 'register_error');
        if (err.status === 503 && resendToggle) {
          document.querySelector('#resendEmail').value = email;
          document.querySelector('#resendForm').hidden = false;
          resendToggle.setAttribute('aria-expanded', 'true');
          const resendField = document.querySelector('#resendEmail');
          if (isVisibleField(resendField)) safeFocus(resendField);
        }
      }
    });
  }

  // Handle logout buttons
  logoutButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const username = localStorage.getItem('username');

      try {
        await authRequest('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username }),
        }, 'logout_error');

        clearSession();
        window.location.href = '/';
      } catch (err) {
        if (!errorDiv) {
          alert(loginText('logout_error'));
        } else {
          showFailure(errorDiv, err, 'logout_error');
        }
      }
    });
  });
});

function isStrongPassword(password) {
  if (!password || password.length < 8) return false;
  if (/\s/.test(password)) return false; // spaces not allowed
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[!@#$%^&*()_+\-={}\[\]|;:"'<>.,?/]/.test(password);
}

function getTokenExpiryFromJwt(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (decoded && decoded.exp) {
      return decoded.exp * 1000;
    }
    return null;
  } catch (err) {
    return null;
  }
}
