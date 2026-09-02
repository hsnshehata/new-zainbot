// public/js/chat.js
console.log('📢 chat.js script started loading at', new Date().toISOString());

try {
  document.addEventListener('DOMContentLoaded', async () => {
    console.log('📢 DOMContentLoaded event triggered at', new Date().toISOString());

    const pathParts = window.location.pathname.split('/').filter(Boolean);
    const lastSegment = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
    const urlParams = new URLSearchParams(window.location.search);
    const linkId = (lastSegment && lastSegment !== 'chat' && lastSegment !== 'chat.html')
      ? lastSegment
      : (urlParams.get('linkId') || urlParams.get('slug') || urlParams.get('botId') || urlParams.get('id') || '');
    const chatMessages = document.getElementById('chatMessages');
    const messageInput = document.getElementById('messageInput');
    const imageInput = document.getElementById('imageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const chatHeader = document.getElementById('chatHeader');
    const chatLogo = document.getElementById('chatLogo');
    const chatTitle = document.getElementById('chatTitle');
    const suggestedQuestions = document.getElementById('suggestedQuestions');
    const customStyles = document.getElementById('customStyles');

    let botId = '';
    let settings = {};
    let messageCounter = 0;
    let lastFeedbackButtons = null;

    // دالة لتوليد UUID
    function generateUUID() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    // جلب أو توليد userId
    let userId = null;
    try {
      userId = localStorage.getItem('webUserId');
      console.log('📋 Attempting to retrieve userId from localStorage:', userId);
      if (!userId || !userId.startsWith('web_')) {
        userId = `web_${generateUUID()}`;
        localStorage.setItem('webUserId', userId);
        console.log(`📋 Generated and stored new userId in localStorage: ${userId}`);
      } else {
        console.log(`📋 Retrieved existing userId from localStorage: ${userId}`);
      }
      // تأكيد التخزين
      const storedUserId = localStorage.getItem('webUserId');
      console.log(`📋 Confirmed userId in localStorage: ${storedUserId}`);
    } catch (err) {
      console.error('❌ Error accessing localStorage:', err);
      userId = `web_${generateUUID()}`;
      console.log(`📋 Fallback: Generated temporary userId due to localStorage error: ${userId}`);
    }

    const applySettings = (data) => {
      if (!data) {
        throw new Error('فشل في جلب إعدادات الصفحة');
      }

      settings = data;
      botId = settings.botId;

      console.log('🔍 Settings loaded:', settings);

      const resolvedTitleColor = settings.titleColor || settings.colors?.titleColor || '#ffffff';
      const resolvedHeaderBg = settings?.colors?.header || '#0F172A';
      const resolvedChatAreaBg = settings?.colors?.chatAreaBackground || '#0A0F1D';
      const resolvedContainerBg = settings?.colors?.containerBackgroundColor || '#0F172A';
      const resolvedOuterBg = settings?.colors?.outerBackgroundColor || '#0A0F1D';
      const resolvedButtonBg = settings?.colors?.sendButtonColor || settings?.colors?.button || '#06B6D4';
      const resolvedUserBg = settings?.colors?.userMessageBackground || '#06B6D4';
      const resolvedUserText = settings?.colors?.userMessageTextColor || '#ffffff';
      const resolvedBotBg = settings?.colors?.botMessageBackground || '#1E293B';
      const resolvedBotText = settings?.colors?.botMessageTextColor || '#ffffff';
      const resolvedInputText = settings?.colors?.inputTextColor || '#ffffff';

      chatTitle.textContent = settings.title || 'ZainBot AI Sales Agent';
      chatTitle.style.color = resolvedTitleColor;

      const chatDefaultIcon = document.getElementById('chatDefaultIcon');
      if (settings.logoUrl) {
        chatLogo.src = settings.logoUrl;
        chatLogo.style.display = 'block';
        if (chatDefaultIcon) chatDefaultIcon.style.display = 'none';
      } else {
        chatLogo.style.display = 'none';
        if (chatDefaultIcon) chatDefaultIcon.style.display = 'block';
      }

      if (settings.headerHidden) {
        chatHeader.style.display = 'none';
      } else {
        chatHeader.style.display = 'flex';
      }

      customStyles.textContent = `
        body {
          background-color: ${resolvedOuterBg};
        }
        .chat-container {
          background-color: ${resolvedContainerBg};
        }
        #chatHeader {
          background-color: ${resolvedHeaderBg};
        }
        #chatTitle {
          color: ${resolvedTitleColor};
        }
        #chatMessages {
          background-color: ${resolvedChatAreaBg};
        }
        #sendMessageBtn {
          background-color: ${resolvedButtonBg};
        }
        .suggested-question {
          border-color: ${resolvedButtonBg};
        }
        .suggested-question:hover {
          background-color: ${resolvedButtonBg}33;
        }
        .user-message {
          background-color: ${resolvedUserBg};
          color: ${resolvedUserText};
        }
        .bot-message {
          background-color: ${resolvedBotBg};
          color: ${resolvedBotText};
        }
        .chat-input-wrapper {
          background-color: ${resolvedContainerBg};
        }
        #messageInput {
          color: ${resolvedInputText};
        }
        .image-input-btn:hover {
          color: ${resolvedButtonBg};
        }
      `;

      const questionsList = Array.isArray(settings.suggestedQuestions)
        ? settings.suggestedQuestions.map(q => typeof q === 'string' ? q.trim() : '').filter(Boolean)
        : [];

      if (settings.suggestedQuestionsEnabled && questionsList.length > 0) {
        suggestedQuestions.innerHTML = '';
        suggestedQuestions.style.display = 'flex';

        // Render questions sequentially with staggered animation
        questionsList.forEach((q, idx) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'suggested-question';
          btn.textContent = q;
          btn.style.animationDelay = `${(idx * 0.12).toFixed(2)}s`;
          btn.addEventListener('click', () => {
            messageInput.value = q;
            sendMessage(q);
            messageInput.value = '';
          });
          suggestedQuestions.appendChild(btn);
        });
      } else {
        suggestedQuestions.style.display = 'none';
      }

      const imageInputBtn = document.getElementById('imageInputBtn');
      if (imageInputBtn) {
        imageInputBtn.style.display = settings.imageUploadEnabled ? 'flex' : 'none';
      }
    };

    try {
      const cachePageKey = 'publicChatPage';
      const cachedSettings = window.readPageCache ? window.readPageCache(cachePageKey, linkId, 5 * 60 * 1000) : null;
      const fetchSettings = () => window.handleApiRequest(`/api/chat-page/${linkId}`);

      if (cachedSettings) {
        console.log('⚡ استخدام الكاش لإعدادات صفحة الدردشة');
        applySettings(cachedSettings);
        fetchSettings()
          .then((fresh) => {
            if (fresh && window.writePageCache) {
              window.writePageCache(cachePageKey, linkId, fresh);
            }
          })
          .catch((err) => {
            console.warn('⚠️ فشل تحديث إعدادات صفحة الدردشة في الخلفية، الاستمرار بالكاش', err);
          });
      } else {
        console.log('📢 Fetching chat page settings for linkId:', linkId);
        const response = await fetchSettings();
        applySettings(response);
        if (window.writePageCache) {
          window.writePageCache(cachePageKey, linkId, response);
        }
      }
    } catch (err) {
      console.error('❌ خطأ في جلب إعدادات الصفحة:', err);
      chatMessages.innerHTML = '<p style="color: red;">تعذر تحميل الصفحة، حاول مرة أخرى لاحقًا.</p>';
      return;
    }

    async function uploadImage(file) {
      const formData = new FormData();
      formData.append('image', file);

      try {
        const response = await window.handleApiRequest('/api/upload', {
          method: 'POST',
          body: formData,
        });
        console.log('📤 Image uploaded successfully:', response);
        return response; // توقع إن الـ response فيه { imageUrl, thumbUrl }
      } catch (err) {
        console.error('❌ خطأ في رفع الصورة:', err);
        throw err;
      }
    }

    async function submitFeedback(messageId, messageContent, feedback) {
      try {
        const type = feedback === 'positive' ? 'like' : 'dislike';

        await window.handleApiRequest('/api/feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            botId,
            userId,
            messageId,
            type,
            messageContent,
          }),
        });

        console.log(`✅ Feedback submitted: ${type} for message ID: ${messageId}`);
        alert(`تم تسجيل التقييم بنجاح: ${type === 'like' ? 'لايك' : 'ديسلايك'}`);
      } catch (err) {
        console.error('❌ خطأ في إرسال التقييم:', err);
        alert('فشل في تسجيل التقييم، حاول مرة أخرى.');
      }
    }

    function hidePreviousFeedbackButtons() {
      if (lastFeedbackButtons) {
        lastFeedbackButtons.style.display = 'none';
        lastFeedbackButtons = null;
      }
    }

    function convertLinksToButtons(text) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      return text.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" class="link-button">اضغط هنا <i class="fas fa-external-link-alt"></i></a>`;
      });
    }

    async function sendMessage(message, isImage = false, imageData = null) {
      if (!message && !isImage) {
        console.warn('⚠️ No message or image provided, skipping send');
        return;
      }

      hidePreviousFeedbackButtons();

      const userMessageDiv = document.createElement('div');
      userMessageDiv.className = 'message user-message';
      if (isImage && imageData) {
        const img = document.createElement('img');
        img.src = imageData.thumbUrl;
        img.style.maxWidth = '100px';
        img.style.borderRadius = '8px';
        userMessageDiv.appendChild(img);
      } else {
        userMessageDiv.appendChild(document.createTextNode(message));
      }
      chatMessages.appendChild(userMessageDiv);

      const typingIndicator = document.createElement('div');
      typingIndicator.id = 'typingIndicator';
      typingIndicator.className = 'message bot-message typing-indicator';
      typingIndicator.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
      chatMessages.appendChild(typingIndicator);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      try {
        console.log(`📤 Preparing to send message with userId: ${userId}, botId: ${botId}, message: ${message}`);
        const requestBody = {
          botId,
          userId,
          message: isImage ? null : message, // لو صورة، خلّي message null
          isImage,
          channel: 'web',
          mediaUrl: isImage ? imageData.imageUrl : null // ضيف mediaUrl لو صورة
        };
        console.log('📤 Request body:', requestBody);

        const response = await window.handleApiRequest('/api/bot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        typingIndicator.remove();

        console.log('📥 Received response:', response);

        const messageId = `msg_${messageCounter++}`;
        const botMessageDiv = document.createElement('div');
        botMessageDiv.className = 'message bot-message';
        botMessageDiv.setAttribute('data-message-id', messageId);

        const replyHtml = convertLinksToButtons(response.reply || 'رد البوت');
        botMessageDiv.innerHTML = replyHtml;

        const feedbackButtons = document.createElement('div');
        feedbackButtons.className = 'feedback-buttons';

        const goodBtn = document.createElement('button');
        goodBtn.className = 'feedback-btn good';
        goodBtn.setAttribute('data-message-id', messageId);
        goodBtn.setAttribute('data-message-content', response.reply || 'رد البوت');
        goodBtn.appendChild(document.createTextNode('👍'));

        const badBtn = document.createElement('button');
        badBtn.className = 'feedback-btn bad';
        badBtn.setAttribute('data-message-id', messageId);
        badBtn.setAttribute('data-message-content', response.reply || 'رد البوت');
        badBtn.appendChild(document.createTextNode('👎'));

        feedbackButtons.appendChild(goodBtn);
        feedbackButtons.appendChild(badBtn);
        botMessageDiv.appendChild(feedbackButtons);

        chatMessages.appendChild(botMessageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        lastFeedbackButtons = feedbackButtons;

        feedbackButtons.querySelectorAll('.feedback-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const messageId = e.target.getAttribute('data-message-id');
            const messageContent = e.target.getAttribute('data-message-content');
            const feedback = e.target.classList.contains('good') ? 'positive' : 'negative';
            await submitFeedback(messageId, messageContent, feedback);
            feedbackButtons.style.display = 'none';
            lastFeedbackButtons = null;
          });
        });
      } catch (err) {
        typingIndicator.remove();
        console.error('❌ خطأ في إرسال الرسالة:', err);
        const errorMessageDiv = document.createElement('div');
        errorMessageDiv.className = 'message bot-message';
        errorMessageDiv.appendChild(document.createTextNode('عذرًا، حدث خطأ أثناء معالجة رسالتك.'));
        chatMessages.appendChild(errorMessageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }

    sendMessageBtn.addEventListener('click', () => {
      const message = messageInput.value.trim();
      if (message) {
        sendMessage(message);
        messageInput.value = '';
      }
    });

    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessageBtn.click();
      }
    });

    imageInput.addEventListener('change', async () => {
      const file = imageInput.files[0];
      if (file) {
        try {
          const imageData = await uploadImage(file);
          sendMessage(null, true, imageData);
          imageInput.value = '';
        } catch (err) {
          console.error('❌ خطأ في معالجة الصورة:', err);
          const errorMessageDiv = document.createElement('div');
          errorMessageDiv.className = 'message bot-message';
          errorMessageDiv.appendChild(document.createTextNode('عذرًا، حدث خطأ أثناء معالجة الصورة.'));
          chatMessages.appendChild(errorMessageDiv);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    });

    console.log('📢 chat.js finished loading at', new Date().toISOString());
  });
} catch (err) {
  console.error('❌ Error in chat.js:', err);
}
