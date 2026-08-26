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
      gmail_google_hint: 'يرجى استخدام زر المتابعة بجوجل لبريد Gmail.',
      register_failed: 'فشل التسجيل، حاول مرة أخرى.',
      register_error: 'حدث خطأ أثناء التسجيل، حاول مرة أخرى.',
      register_success: 'تم إنشاء الحساب بنجاح! يرجى مراجعة بريدك الإلكتروني لتفعيل الحساب.'
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
      gmail_google_hint: 'Please use Google Sign-in for Gmail accounts.',
      register_failed: 'Registration failed. Please try again.',
      register_error: 'An error occurred during registration. Please try again.',
      register_success: 'Account created successfully! Please check your email to activate your account.'
    }
  };
  const loginText = (key) => loginCopy[localStorage.getItem('zainbot_lang') === 'en' ? 'en' : 'ar'][key];

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

  if (token && isLoginPage) {
    window.location.href = '/dashboard_new';
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
        body: JSON.stringify({ idToken }),
      }, errorDiv, loginText('google_failed'));

      if (data.success) {
        saveSession({ token: data.token, role: data.role, userId: data.userId, username: data.username });
        window.location.href = '/dashboard_new';
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
      const password = document.querySelector('#password').value.trim();

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
          window.location.href = '/dashboard_new';
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
      const password = document.querySelector('#password').value.trim();
      const confirmPassword = document.querySelector('#confirmPassword').value.trim();
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

      if (email.endsWith('@gmail.com')) {
        if (errorDiv) {
          errorDiv.style.display = 'block';
          errorDiv.textContent = loginText('gmail_google_hint');
        }
        return;
      }

      try {
        const data = await handleApiRequest('/api/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, password, botName, whatsapp, email }),
        }, errorDiv, loginText('register_failed'));

        if (data.success) {
          if (successDiv) {
            successDiv.style.display = 'block';
            successDiv.textContent = data.message || loginText('register_success');
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
          errorDiv.textContent = err.message || loginText('register_error');
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
        }, errorDiv, 'فشل تسجيل الخروج');

        clearSession();
        window.location.href = '/';
      } catch (err) {
        if (!errorDiv) {
          alert('حدث خطأ أثناء تسجيل الخروج، حاول مرة أخرى');
        } else {
          errorDiv.style.display = 'block';
          errorDiv.textContent = err.message || 'حدث خطأ أثناء تسجيل الخروج، حاول مرة أخرى';
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
