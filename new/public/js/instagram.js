// public/js/instagram.js

async function loadInstagramPage(rootEl = document.getElementById("content")) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/css/facebook.css";
  document.head.appendChild(link);
  const content = rootEl || document.getElementById("content");
  const token = localStorage.getItem("token");
  const selectedBotId = localStorage.getItem("selectedBotId");

  if (!selectedBotId) {
    content.innerHTML = `
      <div class="placeholder error">
        <h2><i class="fas fa-exclamation-triangle"></i> لم يتم اختيار بوت</h2>
        <p>يرجى اختيار بوت من القائمة العلوية أولاً لعرض إعدادات إنستجرام.</p>
      </div>
    `;
    return;
  }

  if (!token) {
    content.innerHTML = `
      <div class="placeholder error">
        <h2><i class="fas fa-exclamation-triangle"></i> تسجيل الدخول مطلوب</h2>
        <p>يرجى تسجيل الدخول لعرض إعدادات إنستجرام.</p>
      </div>
    `;
    return;
  }

  // Main structure for the Instagram settings page
  content.innerHTML = `
    <div class="page-header">
      <h2><i class="fab fa-instagram"></i> إعدادات ربط إنستجرام</h2>
      <div id="instructionsContainer" class="instructions-container" style="display: none;">
        <h3>📋 خطوات بسيطة لربط حسابك على إنستجرام</h3>
        <p>عشان تقدر تربط حسابك بالبوت بنجاح، اتأكد من الخطوات دي:</p>
        <ul>
          <li>
            <strong>إنشاء حساب مهني:</strong> لازم يكون عندك حساب إنستجرام مهني (Business Account) مرتبط بحساب فيسبوك يمتلك صفحة.
            <br>
            <span style="display: block; margin-top: 5px;">
              <strong>إزاي تعمل حساب مهني؟</strong><br>
              1. افتح تطبيق إنستجرام وادخل على إعدادات الحساب.<br>
              2. اختار "Switch to Professional Account".<br>
              3. اختار نوع الحساب (Business) وكمّل الخطوات.<br>
              4. اربط حسابك بصفحة فيسبوك تديرها.
            </span>
          </li>
          <li>
            <strong>تواصل معانا:</strong> بعد ما تعمل حساب مهني، ابعتلنا رسالة على واتساب على الرقم 
            <a href="https://wa.me/01279425543" target="_blank">01279425543</a>، وهنبعتلك دعوة لتطبيقنا عشان تقدر تستخدمه.
          </li>
          <li>
            <strong>ربط الحساب:</strong> بعد ما تقبل الدعوة، تقدر تختار الحساب المهني اللي بتديره من الزر اللي تحت عشان البوت يشتغل عليه.
          </li>
        </ul>
      </div>
      <div class="header-actions">
        <button id="connectInstagramBtn" class="btn btn-primary"><i class="fab fa-instagram"></i> ربط حسابك على إنستجرام</button>
        <div id="accountStatus" class="page-status" style="margin-left: 20px;"></div>
      </div>
    </div>

    <div id="loadingSpinner" class="spinner"><div class="loader"></div></div>
    <div id="errorMessage" class="error-message" style="display: none;"></div>

    <div id="instagramSettingsContainer" class="settings-container instagram-settings-grid" style="display: none;">
      <div class="card settings-card">
        <div class="card-header"><h3><i class="fas fa-toggle-on"></i> تفعيل ميزات Webhook</h3></div>
        <div class="card-body toggles-grid">
          <div class="setting-item toggle-item">
            <div class="setting-info">
              <h4>رسائل الترحيب (Opt-ins)</h4>
              <p>إرسال رسالة ترحيب من البوت بمجرد فتح دردشة مع الحساب لأول مرة قبل بدء المحادثة.</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="instagramMessagingOptinsToggle" data-setting-key="instagramMessagingOptinsEnabled">
              <span class="slider"></span>
            </label>
          </div>
          <div class="setting-item toggle-item">
            <div class="setting-info">
              <h4>ردود الفعل (Reactions)</h4>
              <p>تسمح للبوت بالردود على عمليات التفاعل مع الرسالة مثل اعجاب أو قلب.</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="instagramMessageReactionsToggle" data-setting-key="instagramMessageReactionsEnabled">
              <span class="slider"></span>
            </label>
          </div>
          <div class="setting-item toggle-item">
            <div class="setting-info">
              <h4>تتبع المصدر (Referrals)</h4>
              <p>معرفة كيف وصل المستخدم إلى حسابك (مثل الإعلانات).</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="instagramMessagingReferralsToggle" data-setting-key="instagramMessagingReferralsEnabled">
              <span class="slider"></span>
            </label>
          </div>
          <div class="setting-item toggle-item">
            <div class="setting-info">
              <h4>تعديلات الرسائل (Edits)</h4>
              <p>استقبال إشعارات عندما يقوم المستخدم بتعديل رسالة وتوليد رد جديد بناء على التعديل.</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="instagramMessageEditsToggle" data-setting-key="instagramMessageEditsEnabled">
              <span class="slider"></span>
            </label>
          </div>
          <div class="setting-item toggle-item">
            <div class="setting-info">
              <h4>الرد على التعليقات (Comments)</h4>
              <p>تسمح للبوت بالرد على تعليقات المستخدمين على بوستات الحساب بنفس طريقة الرد على الرسايل.</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="instagramCommentsRepliesToggle" data-setting-key="instagramCommentsRepliesEnabled">
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <p id="togglesError" class="error-message small-error" style="display: none;"></p>
      </div>
    </div>
  `;

  const loadingSpinner = document.getElementById("loadingSpinner");
  const errorMessage = document.getElementById("errorMessage");
  const settingsContainer = document.getElementById("instagramSettingsContainer");
  const instructionsContainer = document.getElementById("instructionsContainer");
  const connectInstagramBtn = document.getElementById("connectInstagramBtn");
  const accountStatus = document.getElementById("accountStatus");

  // Toggle elements
  const toggles = settingsContainer.querySelectorAll(".switch input[type=\"checkbox\"]");
  const togglesError = document.getElementById("togglesError");

  const cacheKey = 'instagram-settings';

  function applyCachedSettings(snapshot) {
    try {
      if (snapshot?.settings) {
        toggles.forEach(toggle => {
          const key = toggle.dataset.settingKey;
          if (key && snapshot.settings.hasOwnProperty(key)) {
            toggle.checked = !!snapshot.settings[key];
          }
        });
        settingsContainer.style.display = "grid";
        loadingSpinner.style.display = "none";
      }
      if (typeof snapshot?.statusHtml === 'string') {
        accountStatus.innerHTML = snapshot.statusHtml;
        instructionsContainer.style.display = snapshot.showInstructions ? "block" : "none";
      }
      if (snapshot?.errorMessage) {
        errorMessage.textContent = snapshot.errorMessage;
        errorMessage.style.display = 'block';
      }
      console.log('Applied cached Instagram settings snapshot');
    } catch (err) {
      console.warn('Failed to apply Instagram cache:', err);
    }
  }

  const cached = window.readPageCache ? window.readPageCache(cacheKey, selectedBotId, 5 * 60 * 1000) : null;
  if (cached) {
    applyCachedSettings(cached);
  }

  // --- Functions ---

  async function handleApiRequest(url, options, errorElement, defaultErrorMessage) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("الرد غير متوقع (مش JSON). يمكن إن الـ endpoint مش موجود.");
        }
        const errorData = await response.json();
        throw new Error(errorData.message || defaultErrorMessage);
      }
      return await response.json();
    } catch (err) {
      if (errorElement) {
        errorElement.textContent = err.message;
        errorElement.style.display = "block";
      }
      throw err;
    }
  }

  async function loadBotSettings(botId) {
    loadingSpinner.style.display = "flex";
    settingsContainer.style.display = "none";
    errorMessage.style.display = "none";

    try {
      const response = await handleApiRequest(`/api/bots/${botId}/instagram-settings`, {
        headers: { Authorization: `Bearer ${token}` },
      }, errorMessage, "حدث خطأ أثناء تحميل الإعدادات");

      if (response.success && response.data) {
        const settings = response.data;
        console.log('تم جلب إعدادات إنستجرام بنجاح:', settings);

        // Populate Toggles
        toggles.forEach(toggle => {
          const key = toggle.dataset.settingKey;
          if (key && settings.hasOwnProperty(key)) {
            toggle.checked = settings[key];
            console.log(`Toggle ${key} set to: ${settings[key]}`);
          } else {
            console.warn(`Key ${key} not found in settings or undefined`);
          }
        });

        settingsContainer.style.display = "grid";

        window.writePageCache && window.writePageCache(cacheKey, botId, {
          settings,
          statusHtml: accountStatus.innerHTML,
          showInstructions: instructionsContainer.style.display !== 'none'
        });
      } else {
        throw new Error("فشل في جلب الإعدادات: البيانات غير متاحة");
      }
    } catch (err) {
      console.error('خطأ في تحميل الإعدادات:', err);
      errorMessage.textContent = "خطأ في تحميل الإعدادات: " + (err.message || "غير معروف");
      errorMessage.style.display = "block";
    } finally {
      loadingSpinner.style.display = "none";
    }
  }

  // لا يوجد إعداد إيقاف بالكلمة في إنستجرام

  async function loadAccountStatus(botId) {
    console.log(`جاري جلب بيانات البوت بالـ ID: ${botId}`);
    try {
      const bot = await handleApiRequest(`/api/bots/${botId}`, {
        headers: { Authorization: `Bearer ${token}` },
      }, accountStatus, "فشل في جلب بيانات البوت");

      if (!bot) {
        console.log(`البوت بالـ ID ${botId} مش موجود`);
        accountStatus.innerHTML = `
          <div style="display: inline-block; color: red;">
            <strong>حالة الربط:</strong> غير مربوط ❌<br>
            <strong>السبب:</strong> البوت غير موجود أو تم حذفه
          </div>
        `;
        instructionsContainer.style.display = "block";
        return;
      }

      console.log(`بيانات البوت:`, bot);

      // Check if bot is linked to an Instagram account
      if (bot.instagramPageId && bot.instagramApiKey) {
        console.log(`جاري جلب بيانات الحساب بالـ ID: ${bot.instagramPageId}`);
        // The Instagram API now uses /me for the authenticated user, or the graph API endpoint
        let accountData = {};
        try {
          // Because bot.instagramPageId is the Global ID, we cannot fetch it directly via Graph API v20.0 
          // We must use /me to get the authenticated user's profile
          const response = await fetch(`https://graph.instagram.com/v20.0/me?fields=id,username,name&access_token=${bot.instagramApiKey}`);
          accountData = await response.json();

          // Fallback for older api versions if the first fails
          if (accountData.error) {
            const fallback = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${bot.instagramApiKey}`);
            accountData = await fallback.json();
          }
        } catch (err) {
          console.error('Error fetching Instagram account info:', err);
        }

        if (accountData.username) {
          console.log(`تم جلب بيانات الحساب بنجاح:`, accountData);

          // Create status container
          const statusDiv = document.createElement("div");
          statusDiv.style.display = "inline-block";
          statusDiv.style.color = "green";
          statusDiv.innerHTML = `
            <strong>حالة الربط:</strong> مربوط ✅<br>
            <strong>اسم الحساب:</strong> ${accountData.username}<br>
            <strong>معرف الحساب:</strong> ${bot.instagramPageId}<br>
            <strong>تاريخ الربط:</strong> ${new Date(bot.lastInstagramTokenRefresh).toLocaleString('ar-EG')}
          `;

          // Create unlink button
          const unlinkInstagramBtn = document.createElement("button");
          unlinkInstagramBtn.id = "unlinkInstagramBtn";
          unlinkInstagramBtn.className = "btn btn-danger";
          unlinkInstagramBtn.style.marginLeft = "10px";
          unlinkInstagramBtn.style.backgroundColor = "#dc3545";
          unlinkInstagramBtn.style.borderColor = "#dc3545";
          unlinkInstagramBtn.textContent = "إلغاء الربط";

          // Add event listener for unlink button
          unlinkInstagramBtn.addEventListener("click", async () => {
            if (confirm("هل أنت متأكد أنك تريد إلغاء ربط هذا الحساب؟")) {
              try {
                await handleApiRequest(`/api/bots/${botId}/unlink-instagram`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                }, errorMessage, "فشل في إلغاء ربط الحساب");

                errorMessage.textContent = "تم إلغاء ربط الحساب بنجاح!";
                errorMessage.style.color = "green";
                errorMessage.style.display = "block";
                await loadAccountStatus(botId);
              } catch (err) {
                console.error('❌ خطأ في إلغاء الربط:', err);
                errorMessage.textContent = 'خطأ في إلغاء الربط: ' + (err.message || 'غير معروف');
                errorMessage.style.color = "red";
                errorMessage.style.display = "block";
              }
            }
          });

          // Append status and button to accountStatus
          accountStatus.innerHTML = "";
          accountStatus.appendChild(statusDiv);
          accountStatus.appendChild(unlinkInstagramBtn);

          instructionsContainer.style.display = "none";
        } else {
          console.log(`فشل في جلب بيانات الحساب:`, accountData);
          accountStatus.innerHTML = `
            <div style="display: inline-block; color: red;">
              <strong>حالة الربط:</strong> غير مربوط ❌<br>
              <strong>السبب:</strong> فشل في جلب بيانات الحساب (التوكن قد يكون غير صالح أو منتهي)
            </div>
          `;
          instructionsContainer.style.display = "block";
        }
      } else {
        console.log(`البوت مش مرتبط بحساب إنستجرام`);
        accountStatus.innerHTML = `
          <div style="display: inline-block; color: red;">
            <strong>حالة الربط:</strong> غير مربوط ❌
          </div>
        `;
        instructionsContainer.style.display = "block";
      }

      window.writePageCache && window.writePageCache(cacheKey, botId, {
        settings: null,
        statusHtml: accountStatus.innerHTML,
        showInstructions: instructionsContainer.style.display !== 'none'
      });
    } catch (err) {
      console.error('Error loading account status:', err);
      accountStatus.innerHTML = `
        <div style="display: inline-block; color: red;">
          <strong>حالة الربط:</strong> غير مربوط ❌<br>
          <strong>السبب:</strong> خطأ في جلب بيانات البوت: ${err.message || 'غير معروف'}
        </div>
      `;
      instructionsContainer.style.display = "block";
      window.writePageCache && window.writePageCache(cacheKey, botId, {
        settings: null,
        statusHtml: accountStatus.innerHTML,
        showInstructions: instructionsContainer.style.display !== 'none',
        errorMessage: err.message || 'غير معروف'
      });
    }
  }

  async function updateWebhookSetting(botId, key, value) {
    togglesError.style.display = "none";

    try {
      const response = await handleApiRequest(`/api/bots/${botId}/instagram-settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: value }),
      }, togglesError, `فشل تحديث إعداد ${key}`);

      if (response.success) {
        console.log(`✅ Updated ${key} to ${value} for bot ${botId}`);
      } else {
        throw new Error("فشل في تحديث الإعداد");
      }
    } catch (err) {
      console.error('خطأ في تحديث الإعداد:', err);
      const toggleInput = document.querySelector(`input[data-setting-key="${key}"]`);
      if (toggleInput) toggleInput.checked = !value;
    }
  }

  // Instagram login redirect
  function loginWithInstagram() {
    errorMessage.style.display = 'none';

    const appId = '2288330081539329';
    // The exact redirect URI the user configured in the Instagram Developer Portal
    const redirectUri = window.location.origin + '/api/instagram/callback';

    // Scopes provided by the user
    const scope = 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights';

    // We pass the botId, auth token, and a popup flag via state so the backend callback knows how to respond
    const stateObj = { botId: selectedBotId, token: token, popup: true };
    const stateStr = btoa(JSON.stringify(stateObj)); // base64 encode

    const authUrl = `https://www.instagram.com/oauth/authorize?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${stateStr}`;

    console.log('Opening Instagram OAuth Popup...', authUrl);

    // Open in popup window
    const width = 600;
    const height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    // Open a popup for the OAuth flow
    const popup = window.open(authUrl, 'Instagram OAuth', `width=${width},height=${height},top=${top},left=${left}`);

    // Listen for messages from the popup once it reaches the callback route
    const messageListener = async (event) => {
      // Ensure message is from our own origin
      if (event.origin !== window.location.origin) return;

      if (event.data === 'instagram_auth_success') {
        console.log('Instagram Auth Success received from popup');
        window.removeEventListener('message', messageListener);
        if (popup) popup.close();

        errorMessage.textContent = 'تم ربط حساب إنستجرام بنجاح!';
        errorMessage.style.color = "green";
        errorMessage.style.display = "block";

        // Reload status to reflect changes
        await loadAccountStatus(selectedBotId);
      } else if (typeof event.data === 'string' && event.data.startsWith('instagram_auth_error:')) {
        const errorReason = event.data.split(':')[1];
        console.error('Instagram Auth Error received from popup:', errorReason);
        window.removeEventListener('message', messageListener);
        if (popup) popup.close();

        errorMessage.textContent = `حدث خطأ أثناء الربط: ${decodeURIComponent(errorReason)}`;
        errorMessage.style.color = "red";
        errorMessage.style.display = "block";
      }
    };

    window.addEventListener('message', messageListener);
  }

  // have been removed, as the flow is now handled via backend callback.

  // Account Selection modal is no longer necessary as Instagram handles the selection itself.

  async function saveApiKeys(botId, instagramApiKey, instagramPageId) {
    errorMessage.style.display = "none";
    loadingSpinner.style.display = "flex";

    if (!instagramApiKey || !instagramPageId) {
      loadingSpinner.style.display = "none";
      errorMessage.textContent = "فشل حفظ معلومات الربط: مفتاح API أو معرف الحساب غير موجود";
      errorMessage.style.display = "block";
      return;
    }

    console.log('البيانات المرسلة:', { instagramApiKey, instagramPageId });

    try {
      const saveResponse = await handleApiRequest(`/api/bots/${botId}/link-social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instagramApiKey, instagramPageId }),
      }, errorMessage, "فشل حفظ معلومات الربط");

      console.log('✅ التوكن تم حفظه بنجاح:', instagramApiKey.slice(0, 10) + '...');
      errorMessage.textContent = "تم ربط الحساب بنجاح!";
      errorMessage.style.color = "green";
      errorMessage.style.display = "block";
      await loadAccountStatus(botId);
    } catch (err) {
      console.error('❌ خطأ في حفظ التوكن:', err);
    } finally {
      loadingSpinner.style.display = "none";
    }
  }

  // --- Event Listeners ---
  if (connectInstagramBtn) {
    connectInstagramBtn.addEventListener("click", loginWithInstagram);
  } else {
    console.error("❌ connectInstagramBtn is not found in the DOM");
  }

  toggles.forEach(toggle => {
    if (toggle) {
      toggle.addEventListener("change", (e) => {
        const key = e.target.dataset.settingKey;
        const value = e.target.checked;
        if (key) {
          updateWebhookSetting(selectedBotId, key, value);
        }
      });
    } else {
      console.error("❌ A toggle element is not found in the DOM");
    }
  });

  // Check URL parameters for success/error messages after redirect
  const urlParams = new URLSearchParams(window.location.search);
  const successParam = urlParams.get('success');
  const errorParam = urlParams.get('error');
  const errorReason = urlParams.get('reason');

  if (successParam === 'instagram_linked') {
    errorMessage.textContent = 'تم ربط حساب إنستجرام بنجاح!';
    errorMessage.style.color = "green";
    errorMessage.style.display = "block";
    // Clear the parameters from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (errorParam) {
    errorMessage.textContent = `حدث خطأ أثناء الربط: ${errorReason || errorParam}`;
    errorMessage.style.color = "red";
    errorMessage.style.display = "block";
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // --- Initial Load ---
  await loadAccountStatus(selectedBotId);
  await loadBotSettings(selectedBotId);
}

// Make loadInstagramPage globally accessible
window.loadInstagramPage = loadInstagramPage;

// Ensure the function is available even if called early
if (window.loadInstagramPage) {
  console.log('✅ loadInstagramPage is defined and ready');
} else {
  console.error('❌ loadInstagramPage is not defined');
}
