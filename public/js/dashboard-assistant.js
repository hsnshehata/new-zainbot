'use strict';

// public/js/dashboard-assistant.js
// Business Assistant ("مساعد زين") dashboard chunk. Lazy-loaded via
// dashboard-assets.js on first entry to #page-assistant. Talks only to
// /api/assistant/* through the injected requestJson (auth header injection
// lives there). All user-visible strings resolve through the injected t()
// so the page stays bilingual.

(function (global) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function create(deps) {
    const requestJson = deps.requestJson;
    const t = deps.t;
    const getLanguage = deps.getLanguage;
    const feedback = deps.feedback || null;

    let wired = false;
    let sending = false;
    let activeConversationId = null;

    function el(id) {
      return global.document.getElementById(id);
    }

    function notify(level, key) {
      if (feedback && typeof feedback.notify === 'function') {
        feedback.notify({ level, key }, (k) => t(k));
      }
    }

    function formatDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      const locale = getLanguage && getLanguage() === 'ar' ? 'ar-EG' : 'en-GB';
      return date.toLocaleString(locale, { timeZone: 'Africa/Cairo', dateStyle: 'short', timeStyle: 'short' });
    }

    function statusKey(status) {
      return 'assistant_reminder_status_' + status;
    }

    // ---------- rendering ----------

    function renderMessage(role, content, opts = {}) {
      const container = el('assistantMessages');
      if (!container) return;
      const welcome = el('assistantWelcome');
      if (welcome) welcome.remove();
      const isUser = role === 'user';
      const row = global.document.createElement('div');
      row.style.cssText = 'display:flex; flex-direction:column; gap:4px; align-items:' + (isUser ? 'flex-end' : 'flex-start') + ';';
      const bubble = global.document.createElement('div');
      bubble.style.cssText =
        'max-width:85%; padding:10px 14px; border-radius:14px; font-size:14px; line-height:1.7; white-space:pre-wrap; word-break:break-word;' +
        (isUser
          ? 'background:var(--cyan,#06b6d4); color:#04121a;'
          : 'background:rgba(255,255,255,0.06); border:1px solid var(--border,rgba(255,255,255,0.08)); color:inherit;');
      bubble.textContent = content;
      const meta = global.document.createElement('span');
      meta.style.cssText = 'font-size:11px; color:var(--text-muted);';
      meta.textContent = isUser ? t('assistant_you') : t('assistant_name');
      row.appendChild(bubble);
      if (opts.fallbackBadge) {
        const badge = global.document.createElement('span');
        badge.style.cssText = 'font-size:10px; color:var(--orange,#f59e0b);';
        badge.textContent = t('assistant_fallback_badge');
        row.appendChild(badge);
      }
      row.appendChild(meta);
      container.appendChild(row);
      container.scrollTop = container.scrollHeight;
    }

    function renderWelcome() {
      const container = el('assistantMessages');
      if (!container) return;
      container.innerHTML =
        '<div id="assistantWelcome" style="margin:auto; text-align:center; color:var(--text-muted); max-width:420px;">' +
        '<i class="fas fa-wand-magic-sparkles" style="font-size:28px; color:var(--cyan); margin-bottom:12px;"></i>' +
        '<h3>' + escapeHtml(t('assistant_welcome_title')) + '</h3>' +
        '<p style="font-size:13px; line-height:1.7;">' + escapeHtml(t('assistant_welcome_hint')) + '</p>' +
        '</div>';
    }

    function renderConversations(conversations) {
      const list = el('assistantChatsList');
      if (!list) return;
      if (!conversations.length) {
        list.innerHTML = '<p style="color:var(--text-muted); font-size:12px;">' + escapeHtml(t('assistant_no_chats')) + '</p>';
        return;
      }
      list.innerHTML = '';
      for (const conversation of conversations) {
        const item = global.document.createElement('div');
        item.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:10px; cursor:pointer; font-size:13px;' +
          (conversation.id === activeConversationId ? ' background:rgba(6,182,212,0.12);' : ' background:rgba(255,255,255,0.03);');
        const title = global.document.createElement('span');
        title.style.cssText = 'flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        title.textContent = conversation.title || conversation.lastMessage || conversation.id;
        title.addEventListener('click', () => openConversation(conversation.id));
        const del = global.document.createElement('button');
        del.type = 'button';
        del.className = 'btn-icon';
        del.setAttribute('aria-label', t('assistant_delete_chat'));
        del.style.cssText = 'background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px 6px;';
        del.innerHTML = '<i class="fas fa-trash"></i>';
        del.addEventListener('click', (event) => {
          event.stopPropagation();
          deleteConversation(conversation.id);
        });
        item.appendChild(title);
        item.appendChild(del);
        list.appendChild(item);
      }
    }

    function renderReminders(reminders) {
      const list = el('assistantRemindersList');
      if (!list) return;
      if (!reminders.length) {
        list.innerHTML = '<p style="color:var(--text-muted); font-size:12px;">' + escapeHtml(t('assistant_reminder_empty')) + '</p>';
        return;
      }
      list.innerHTML = '';
      for (const reminder of reminders) {
        const item = global.document.createElement('div');
        item.style.cssText = 'padding:8px 10px; border-radius:10px; background:rgba(255,255,255,0.03); font-size:12px; display:flex; flex-direction:column; gap:6px;';
        const text = global.document.createElement('div');
        text.textContent = reminder.text;
        const meta = global.document.createElement('div');
        meta.style.cssText = 'display:flex; align-items:center; gap:8px; color:var(--text-muted);';
        const when = global.document.createElement('span');
        when.textContent = formatDate(reminder.dueAt);
        const status = global.document.createElement('span');
        status.style.cssText = 'padding:1px 8px; border-radius:8px; background:rgba(6,182,212,0.12); color:var(--cyan);';
        status.textContent = t(statusKey(reminder.status));
        meta.appendChild(when);
        meta.appendChild(status);
        const actions = global.document.createElement('span');
        actions.style.cssText = 'margin-inline-start:auto; display:flex; gap:6px;';
        if (reminder.status === 'pending' || reminder.status === 'sent') {
          const done = global.document.createElement('button');
          done.type = 'button';
          done.className = 'btn btn-secondary btn-sm';
          done.style.cssText = 'padding:2px 8px; font-size:11px;';
          done.textContent = t('assistant_reminder_done');
          done.addEventListener('click', () => completeReminder(reminder.id));
          actions.appendChild(done);
        }
        const del = global.document.createElement('button');
        del.type = 'button';
        del.className = 'btn btn-secondary btn-sm';
        del.style.cssText = 'padding:2px 8px; font-size:11px;';
        del.textContent = t('assistant_reminder_delete');
        del.addEventListener('click', () => deleteReminder(reminder.id));
        actions.appendChild(del);
        meta.appendChild(actions);
        item.appendChild(text);
        item.appendChild(meta);
        list.appendChild(item);
      }
    }

    function setTyping(on) {
      const typing = el('assistantTyping');
      if (typing) typing.hidden = !on;
      const input = el('assistantInput');
      if (input) input.disabled = on;
      const send = el('assistantSendBtn');
      if (send) send.disabled = on;
    }

    // ---------- data ----------

    async function loadConversations() {
      const data = await requestJson('/api/assistant/conversations', {}, { operation: 'read' });
      renderConversations((data && data.conversations) || []);
    }

    async function loadReminders() {
      const data = await requestJson('/api/assistant/reminders', {}, { operation: 'read' });
      renderReminders((data && data.reminders) || []);
    }

    async function openConversation(id) {
      try {
        const data = await requestJson('/api/assistant/conversations/' + encodeURIComponent(id), {}, { operation: 'read' });
        if (!data || !data.conversation) return;
        activeConversationId = data.conversation.id;
        const container = el('assistantMessages');
        if (container) container.innerHTML = '';
        for (const message of data.conversation.messages) {
          renderMessage(message.role, message.content);
        }
        loadConversations();
      } catch (_error) {
        notify('error', 'assistant_error');
      }
    }

    async function deleteConversation(id) {
      try {
        await requestJson('/api/assistant/conversations/' + encodeURIComponent(id), { method: 'DELETE' }, { operation: 'mutation' });
        if (activeConversationId === id) {
          activeConversationId = null;
          renderWelcome();
        }
        loadConversations();
      } catch (_error) {
        notify('error', 'assistant_error');
      }
    }

    async function sendMessage(text) {
      if (sending) return;
      sending = true;
      setTyping(true);
      renderMessage('user', text);
      try {
        const data = await requestJson('/api/assistant/chat', {
          method: 'POST',
          body: JSON.stringify({ message: text, conversationId: activeConversationId || undefined }),
        }, { operation: 'mutation' });
        if (data && data.reply) {
          activeConversationId = data.conversationId || activeConversationId;
          renderMessage('assistant', data.reply, { fallbackBadge: Boolean(data.fallback) });
          loadConversations();
        } else {
          notify('error', 'assistant_error');
        }
      } catch (_error) {
        notify('error', 'assistant_error');
      } finally {
        sending = false;
        setTyping(false);
      }
    }

    async function addReminder(text, dueLocal) {
      const due = new Date(dueLocal);
      if (!text || Number.isNaN(due.getTime())) {
        notify('error', 'assistant_error');
        return;
      }
      try {
        await requestJson('/api/assistant/reminders', {
          method: 'POST',
          body: JSON.stringify({ text, dueAt: due.toISOString() }),
        }, { operation: 'mutation' });
        notify('success', 'assistant_reminder_saved');
        loadReminders();
      } catch (_error) {
        notify('error', 'assistant_error');
      }
    }

    async function completeReminder(id) {
      try {
        await requestJson('/api/assistant/reminders/' + encodeURIComponent(id) + '/complete', { method: 'PATCH' }, { operation: 'mutation' });
        loadReminders();
      } catch (_error) {
        notify('error', 'assistant_error');
      }
    }

    async function deleteReminder(id) {
      try {
        await requestJson('/api/assistant/reminders/' + encodeURIComponent(id), { method: 'DELETE' }, { operation: 'mutation' });
        loadReminders();
      } catch (_error) {
        notify('error', 'assistant_error');
      }
    }

    // ---------- wiring ----------

    function init() {
      if (wired) return;
      wired = true;
      const form = el('assistantForm');
      if (form) {
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          const input = el('assistantInput');
          const text = input && input.value ? input.value.trim() : '';
          if (!text) return;
          input.value = '';
          sendMessage(text);
        });
      }
      const newChat = el('assistantNewChatBtn');
      if (newChat) {
        newChat.addEventListener('click', () => {
          activeConversationId = null;
          renderWelcome();
        });
      }
      const reminderForm = el('assistantReminderForm');
      if (reminderForm) {
        reminderForm.addEventListener('submit', (event) => {
          event.preventDefault();
          const textEl = el('assistantReminderText');
          const dueEl = el('assistantReminderDue');
          const text = textEl && textEl.value ? textEl.value.trim() : '';
          const due = dueEl ? dueEl.value : '';
          if (!text || !due) return;
          textEl.value = '';
          addReminder(text, due);
        });
      }
    }

    async function load() {
      try {
        await Promise.all([loadConversations(), loadReminders()]);
      } catch (_error) {
        notify('error', 'assistant_error');
      }
    }

    return { init, load };
  }

  global.ZainBotAssistant = { create };
})(typeof window !== 'undefined' ? window : globalThis);
