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
  const loginText = (key) => loginCopy[localStorage.getItem('zainbot_lang') === 'en' ? 'en' : 'ar'][key];
  const params = new URLSearchParams(window.location.search);
  const recoveryParams = new URLSearchParams(window.location.hash.slice(1));
  const resetToken = /^[a-f0-9]{64}$/.test(recoveryParams.get('reset') || '') ? recoveryParams.get('reset') : null;
  const verifyToken = /^[a-f0-9]{64}$/.test(recoveryParams.get('verify') || '') ? recoveryParams.get('verify') : null;
  if (recoveryParams.has('reset') || recoveryParams.has('verify')) window.history.replaceState(null, '', window.location.pathname);
  const showMessage = (element, text) => {
    if (element) { element.textContent = text; element.style.display = 'block'; }
  };
  if (params.has('verification')) showMessage(params.get('verification') === 'success' ? successDiv : errorDiv,
    loginText(params.get('verification') === 'success' ? 'verification_success' : 'verification_invalid'));
  if (recoveryParams.has('reset') && !resetToken) showMessage(errorDiv, loginText('reset_invalid'));
  if (recoveryParams.has('verify') && !verifyToken) showMessage(errorDiv, loginText('verification_invalid'));
  if (verifyToken) {
    fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: verifyToken }) })
      .then((response) => showMessage(response.ok ? successDiv : errorDiv, loginText(response.ok ? 'verification_success' : 'verification_invalid')))
      .catch(() => showMessage(errorDiv, loginText('verification_invalid')));
  }
  if (resetToken) document.querySelector('#resetForm')?.removeAttribute('hidden');

  async function recoveryRequest(url, body, form, successKey) {
    try {
      const data = await handleApiRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, null, loginText('recovery_error'));
      showMessage(successDiv, loginText(successKey) || data.message);
      if (errorDiv) errorDiv.style.display = 'none';
      form.reset();
      return true;
    } catch (err) {
      showMessage(errorDiv, err.message || loginText('recovery_error'));
      return false;
    }
  }

  const resendToggle = document.querySelector('#resendToggle');
  resendToggle?.addEventListener('click', () => {
    const form = document.querySelector('#resendForm');
    form.hidden = !form.hidden;
    resendToggle.setAttribute('aria-expanded', String(!form.hidden));
  });
  document.querySelector('#resendForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.querySelector('#resendEmail').value.trim();
    if (!document.querySelector('#resendEmail').checkValidity()) return showMessage(errorDiv, loginText('recovery_required'));
    await recoveryRequest('/api/auth/resend-verification', { email }, e.target, 'resend_sent');
  });
  document.querySelector('#forgotToggle')?.addEventListener('click', (e) => {
    const form = document.querySelector('#forgotForm');
    form.hidden = !form.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!form.hidden));
  });
  document.querySelector('#forgotForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const field = document.querySelector('#recoveryEmail');
    if (!field.checkValidity()) return showMessage(errorDiv, loginText('recovery_required'));
    await recoveryRequest('/api/auth/forgot-password', { email: field.value.trim() }, e.target, 'forgot_sent');
  });
  document.querySelector('#resetForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.querySelector('#newPassword').value;
    if (!isStrongPassword(password)) return showMessage(errorDiv, loginText('password_strength_error'));
    if (password !== document.querySelector('#resetConfirm').value) return showMessage(errorDiv, loginText('passwords_dont_match'));
    if (await recoveryRequest('/api/auth/reset-password', { token: resetToken, password, confirmPassword: password }, e.target, 'reset_success')) {
      e.target.hidden = true;
      showMessage(successDiv, loginText('reset_success'));
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
      const data = await handleApiRequest('/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken, ...(registerForm && window.zainbotSignupIntendedTier ? { intendedTier: window.zainbotSignupIntendedTier } : {}) }),
      }, errorDiv, loginText('google_failed'));

      if (data.success) {
        saveSession({ token: data.token, role: data.role, userId: data.userId, username: data.username });
              window.location.href = '/dashboard';
      } else {
        errorDiv.style.display = 'block';
        errorDiv.textContent = data.message || loginText('google_failed');
      }
    } catch (err) {
      errorDiv.style.display = 'block';
      errorDiv.textContent = err.message || loginText('google_error');
    }
  };

  // Handle login form submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.querySelector('#username').value.trim();
      const password = document.querySelector('#password').value;

      if (!username || !password) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = loginText('credentials_required');
        return;
      }

      try {
        const data = await handleApiRequest('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password }),
        }, errorDiv, loginText('login_failed'));

        if (data.success) {
          saveSession({ token: data.token, role: data.role, userId: data.userId, username: data.username });
                window.location.href = '/dashboard';
        } else {
          errorDiv.style.display = 'block';
          errorDiv.textContent = data.message || loginText('login_failed');
        }
      } catch (err) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = err.message || loginText('login_error');
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

      // Validate inputs
      if (!username || !password || !confirmPassword || !botName || !email) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = loginText('all_fields_required');
        }
        return;
      }

      if (password !== confirmPassword) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = loginText('passwords_dont_match');
        }
        return;
      }

      if (!isStrongPassword(password)) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = loginText('password_strength_error');
        }
        return;
      }

      if (!/^[a-z0-9_-]+$/.test(username)) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = loginText('username_format_error');
        }
        return;
      }

      try {
        const data = await handleApiRequest('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password, confirmPassword, botName, whatsapp, email,
            ...(window.zainbotSignupIntendedTier ? { intendedTier: window.zainbotSignupIntendedTier } : {}) }),
        }, errorDiv, loginText('register_failed'));

        if (data.success) {
          if (successDiv) {
            successDiv.style.display = 'block';
            successDiv.textContent = loginText('register_success');
          }
          if (errorDiv) {
            errorDiv.style.display = 'none';
          }
          registerForm.reset();
        } else {
          if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = data.message || loginText('register_failed');
          }
        }
      } catch (err) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = err.status === 503 ? loginText('registration_delivery_failed') : (err.message || loginText('register_error'));
        }
        if (err.status === 503 && resendToggle) {
          document.querySelector('#resendEmail').value = email;
          document.querySelector('#resendForm').hidden = false;
          resendToggle.setAttribute('aria-expanded', 'true');
        }
      }
    });
  }

  // Handle logout buttons
  logoutButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const username = localStorage.getItem('username');

      try {
        await handleApiRequest('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username }),
        }, errorDiv, loginText('logout_error'));

        clearSession();
        window.location.href = '/';
      } catch (err) {
        if (!errorDiv) {
          alert(loginText('logout_error'));
        } else {
          errorDiv.style.display = 'block';
          errorDiv.textContent = err.message || loginText('logout_error');
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
