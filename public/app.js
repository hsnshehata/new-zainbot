// UI Translations Map
const TRANSLATIONS = {
  en: {
    app_title: "GDA Console",
    app_subtitle: "Gravity Developer Agent",
    btn_new_session: "+ New Session",
    recent_sessions: "Recent Sessions",
    active_mcp_servers: "Active MCP Servers",
    available_tools: "Available Tools",
    btn_settings: "Settings",
    llm_status: "LLM Status",
    provider_not_configured: "Not Configured",
    provider_key_required: "API Key Required",
    auto_approve: "Auto-Approve Tools",
    btn_clear: "Clear Console",
    input_placeholder: "Write your programming task here...",
    welcome_text: "Welcome to Gravity Developer Agent (GDA). Write your programming task below. GDA can read files, write code, run commands, and browse web pages using local MCP tools.",
    settings_title: "GDA Settings",
    form_provider: "LLM Provider",
    form_custom_url: "Custom Base URL",
    form_api_key: "API Key",
    form_model: "Model Name",
    form_project: "Workspace Project Path",
    btn_save: "Save Changes",
    no_conversations: "No conversations yet",
    loading_explorer: "Loading sessions explorer...",
    idle: "Idle",
    thinking: "Thinking...",
    waiting_approval: "Waiting for approval...",
    executing: "Running tool...",
    server_connected: "Server: Connected",
    server_offline: "Server: Offline",
    server_reconnecting: "Server: Connecting..."
  },
  ar: {
    app_title: "منصة GDA",
    app_subtitle: "وكيل الجاذبية المطور",
    btn_new_session: "+ جلسة جديدة",
    recent_sessions: "جلسات العمل السابقة",
    active_mcp_servers: "خوادم MCP النشطة",
    available_tools: "الأدوات المتاحة",
    btn_settings: "الإعدادات",
    llm_status: "حالة الذكاء الاصطناعي",
    provider_not_configured: "غير مهيأ",
    provider_key_required: "مفتاح API مطلوب",
    auto_approve: "الموافقة التلقائية",
    btn_clear: "مسح الشاشة",
    input_placeholder: "اكتب المهمة البرمجية هنا أو باللغة الإنجليزية...",
    welcome_text: "مرحباً بك في وكيل الجاذبية المطور (GDA). اكتب مهمتك البرمجية أدناه. يمكن للوكيل قراءة الملفات، كتابة الكود، تشغيل الأوامر، وتصفح الويب باستخدام أدوات MCP المحلية.",
    settings_title: "إعدادات منصة GDA",
    form_provider: "مزود الخدمة (LLM)",
    form_custom_url: "عنوان خادم مخصص",
    form_api_key: "مفتاح الاتصال (API Key)",
    form_model: "اسم النموذج البرمجي",
    form_project: "مسار مجلد المشروع الحالي",
    btn_save: "حفظ الإعدادات",
    no_conversations: "لا توجد محادثات بعد",
    loading_explorer: "جاري تحميل مستعرض الملفات...",
    idle: "جاهز للعمل",
    thinking: "جاري التفكير...",
    waiting_approval: "في انتظار الموافقة...",
    executing: "جاري تشغيل الأداة...",
    server_connected: "الخادم: متصل",
    server_offline: "الخادم: غير متصل",
    server_reconnecting: "الخادم: جاري الاتصال..."
  }
};

let currentLang = 'ar'; // Default language

// Constants
let ws = null;
let currentChatHistory = [];
let pendingApprovalResolver = null;
let currentAgentMessageElement = null;
let currentSessionId = null;
let activeCwd = '';
let abortAgentLoop = false;
const pendingToolResolvers = new Map();

// DOM Elements
const elPromptInput = document.getElementById('prompt-input');
const elBtnSend = document.getElementById('btn-send');
const elBtnStop = document.getElementById('btn-stop');
const elConsoleLogs = document.getElementById('console-logs');
const elMcpList = document.getElementById('mcp-list');
const elToolsList = document.getElementById('tools-list');
const elBtnSettings = document.getElementById('btn-settings');
const elBtnClearChat = document.getElementById('btn-clear-chat');
const elCurrentModel = document.getElementById('current-model');
const elProviderText = document.getElementById('provider-text');
const elProviderIndicator = document.getElementById('provider-indicator');
const elChkAutoApprove = document.getElementById('chk-auto-approve');
const elBtnNewSession = document.getElementById('btn-new-session');
const elCurrentProject = document.getElementById('current-project');
const elAgentStatus = document.getElementById('agent-status');
const elAgentStatusText = document.getElementById('agent-status-text');
const elProjectExplorer = document.getElementById('project-explorer');
const elBtnLangToggle = document.getElementById('btn-lang-toggle');

// Server status indicators
const elServerIndicator = document.getElementById('server-indicator');
const elServerStatusText = document.getElementById('server-status-text');

// Modal Elements
const elModalSettings = document.getElementById('modal-settings');
const elBtnSaveSettings = document.getElementById('btn-save-settings');
const elCloseSettings = document.getElementById('close-settings');
const elSelectProvider = document.getElementById('select-provider');
const elGroupCustomUrl = document.getElementById('group-custom-url');
const elInputCustomUrl = document.getElementById('input-custom-url');
const elInputApiKey = document.getElementById('input-api-key');
const elInputModel = document.getElementById('input-model');
const elInputProjectPath = document.getElementById('input-project-path');

// Approval Modal Elements
const elModalApproval = document.getElementById('modal-approval');
const elApprovalServerName = document.getElementById('approval-server-name');
const elApprovalToolName = document.getElementById('approval-tool-name');
const elApprovalArguments = document.getElementById('approval-arguments');
const elBtnApproveTool = document.getElementById('btn-approve-tool');
const elBtnDenyTool = document.getElementById('btn-deny-tool');

// Config mapping
const PROVIDER_NAMES = {
  tokenrouter: 'TokenRouter',
  xai: 'xAI (Grok)',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  siliconflow: 'SiliconFlow',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  custom: 'Custom URL'
};

const PROVIDER_URLS = {
  tokenrouter: 'https://api.tokenrouter.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  deepseek: 'https://api.deepseek.com/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1'
};

let config = {
  provider: 'tokenrouter',
  apiKey: '',
  model: '',
  customUrl: '',
  projectPath: ''
};

// Toggle UI Language
function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ar' : 'en';
  localStorage.setItem('gda_lang', currentLang);
  applyTranslations();
  updateServerStatusIndicator();
}

function applyTranslations() {
  const trans = TRANSLATIONS[currentLang];
  
  // Set html document layout direction
  document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.className = currentLang === 'ar' ? 'rtl' : 'ltr';

  // Translate DOM nodes with data-i18n attributes
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (trans[key]) el.innerText = trans[key];
  });

  // Translate Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (trans[key]) el.setAttribute('placeholder', trans[key]);
  });

  // Translate status text if idle
  if (elAgentStatus.classList.contains('idle')) {
    setAgentStatus('idle', trans.idle);
  }
}

// Initial Configuration Loading
function loadConfig() {
  const saved = localStorage.getItem('gda_config');
  if (saved) {
    try {
      config = { ...config, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
  }
  
  // Load Lang settings
  const savedLang = localStorage.getItem('gda_lang');
  if (savedLang) currentLang = savedLang;
  
  updateConfigUI();
  applyTranslations();
}

function saveConfig() {
  config.provider = elSelectProvider.value;
  config.customUrl = elInputCustomUrl.value;
  config.apiKey = elInputApiKey.value;
  config.model = elInputModel.value;
  config.projectPath = elInputProjectPath.value;

  localStorage.setItem('gda_config', JSON.stringify(config));
  updateConfigUI();
  
  // Update CWD on the server
  if (config.projectPath) {
    switchProjectFolder(config.projectPath);
  }

  elModalSettings.classList.remove('active');
  connectWebSocket();
}

async function switchProjectFolder(projectPath) {
  try {
    const res = await fetch('/api/projects/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectPath })
    });
    const data = await res.json();
    if (data.success) {
      activeCwd = data.activeCwd;
      config.projectPath = data.activeCwd;
      elInputProjectPath.value = data.activeCwd;
      elCurrentProject.innerText = data.activeCwd.split(/[\\/]/).pop() || data.activeCwd;
      fetchExplorer();
      fetchTools();
    } else {
      alert('Failed to switch project: ' + data.error);
    }
  } catch (err) {
    console.error(err);
  }
}

function updateConfigUI() {
  elSelectProvider.value = config.provider;
  elInputCustomUrl.value = config.customUrl;
  elInputApiKey.value = config.apiKey;
  elInputModel.value = config.model;
  elInputProjectPath.value = config.projectPath;

  if (config.provider === 'custom') {
    elGroupCustomUrl.style.display = 'flex';
  } else {
    elGroupCustomUrl.style.display = 'none';
  }

  const trans = TRANSLATIONS[currentLang];

  if (config.apiKey) {
    elProviderText.innerText = PROVIDER_NAMES[config.provider] || config.provider;
    elProviderIndicator.className = 'indicator green';
    elCurrentModel.innerText = config.model || 'Default';
  } else {
    elProviderText.innerText = trans.provider_key_required;
    elProviderIndicator.className = 'indicator red';
    elCurrentModel.innerText = 'Not Set';
  }
}

// Update server status indicator based on WebSocket connection
function updateServerStatusIndicator() {
  const trans = TRANSLATIONS[currentLang];
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    elServerIndicator.className = 'indicator red';
    elServerStatusText.innerText = ws ? trans.server_reconnecting : trans.server_offline;
  } else {
    elServerIndicator.className = 'indicator green';
    elServerStatusText.innerText = trans.server_connected;
  }
}

// Set Agent Status in UI
function setAgentStatus(status, text) {
  elAgentStatus.className = `agent-status ${status}`;
  elAgentStatusText.innerText = text;
}

// Calculate relative date time
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (currentLang === 'ar') {
    if (diffMins < 5) return 'الآن';
    if (diffMins < 60) return `${diffMins} د`;
    if (diffHours < 24) return `${diffHours} س`;
    if (diffDays < 30) return `${diffDays} ي`;
    return `${Math.floor(diffDays / 30)} ش`;
  } else {
    if (diffMins < 5) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 30) return `${diffDays}d`;
    return `${Math.floor(diffDays / 30)}mo`;
  }
}

// Fetch and build the Project / Chat Session Explorer tree
async function fetchExplorer() {
  try {
    const projRes = await fetch('/api/projects');
    const projData = await projRes.json();
    
    const sessRes = await fetch('/api/sessions');
    const sessData = await sessRes.json();

    if (projData.success && sessData.success) {
      activeCwd = projData.activeCwd;
      elCurrentProject.innerText = activeCwd.split(/[\\/]/).pop() || activeCwd;
      
      const projects = projData.projects;
      const sessions = sessData.sessions;
      const trans = TRANSLATIONS[currentLang];

      // Group sessions by CWD
      const sessionsByCwd = {};
      for (const s of sessions) {
        if (!sessionsByCwd[s.cwd]) sessionsByCwd[s.cwd] = [];
        sessionsByCwd[s.cwd].push(s);
      }

      // Add active CWD if not in list
      if (!projects.includes(activeCwd)) {
        projects.unshift(activeCwd);
      }

      elProjectExplorer.innerHTML = projects.map(projectCwd => {
        const folderName = projectCwd.split(/[\\/]/).pop() || projectCwd;
        const projectSessions = sessionsByCwd[projectCwd] || [];
        const isActiveFolder = projectCwd === activeCwd;

        const sessionsHtml = projectSessions.length === 0
          ? `<div class="no-sessions-text">${trans.no_conversations}</div>`
          : projectSessions.map(s => `
              <li class="${s.id === currentSessionId ? 'active' : ''}" onclick="loadSession('${s.id}')">
                <span>💬 ${s.title}</span>
                <div style="display:flex; align-items:center;">
                  <span class="chat-time">${formatRelativeTime(s.updated)}</span>
                  <span class="delete-session" onclick="event.stopPropagation(); deleteSession('${s.id}')">&times;</span>
                </div>
              </li>
            `).join('');

        return `
          <div class="project-folder ${isActiveFolder ? 'active' : ''}">
            <div class="project-folder-header" onclick="switchProjectFolder('${projectCwd.replace(/\\/g, '\\\\')}')">
              📁 ${folderName}
            </div>
            <ul class="project-folder-contents">
              ${sessionsHtml}
            </ul>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load explorer:', err);
    elProjectExplorer.innerHTML = `<div class="loading red">Failed to load explorer</div>`;
  }
}

// Fetch active MCP Tools
async function fetchTools() {
  try {
    const res = await fetch('/api/tools');
    const data = await res.json();

    if (data.success) {
      elMcpList.innerHTML = data.servers.length === 0
        ? `<li class="loading">No servers active.</li>`
        : data.servers.map(server => `<li><span class="indicator green"></span> ${server}</li>`).join('');

      elToolsList.innerHTML = data.tools.length === 0
        ? `<li class="loading">No tools found.</li>`
        : data.tools.map(tool => `
            <li title="${tool.description || 'No description'}">
              <strong>${tool.originalName}</strong>
              <div style="font-size: 11px; color: var(--color-text-muted)">${tool.serverName}</div>
            </li>
          `).join('');
    }
  } catch (err) {
    elMcpList.innerHTML = `<li class="loading red">Connection failed</li>`;
  }
}

// Create a New Chat Session
function createNewSession() {
  currentSessionId = 'session-' + Math.random().toString(36).substring(2, 15);
  currentChatHistory = [];
  
  const trans = TRANSLATIONS[currentLang];
  elConsoleLogs.innerHTML = `
    <div class="system-message">
      <div class="icon">🤖</div>
      <div class="content">
        <p>${trans.welcome_text}</p>
      </div>
    </div>
  `;
  fetchExplorer();
}

// Load a saved Chat Session
async function loadSession(id) {
  try {
    const res = await fetch(`/api/sessions/${id}`);
    const data = await res.json();
    if (data.success) {
      currentSessionId = id;
      currentChatHistory = data.session.messages || [];
      
      // Clear and render logs
      elConsoleLogs.innerHTML = '';
      
      for (const msg of currentChatHistory) {
        if (msg.role === 'user') {
          appendMessage('user', msg.content);
        } else if (msg.role === 'assistant' && msg.content) {
          appendMessage('agent', msg.content);
        }
      }
      
      // Auto switch to session CWD if different
      if (data.session.cwd && data.session.cwd !== activeCwd) {
        switchProjectFolder(data.session.cwd);
      } else {
        fetchExplorer();
      }
    }
  } catch (err) {
    alert('Failed to load session: ' + err.message);
  }
}

// Delete a session
async function deleteSession(id) {
  if (!confirm('Are you sure you want to delete this session?')) return;
  try {
    const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      if (currentSessionId === id) {
        createNewSession();
      } else {
        fetchExplorer();
      }
    }
  } catch (e) {}
}

// WebSocket Connection Setup
function connectWebSocket() {
  if (ws) ws.close();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);

  ws.onopen = () => {
    console.log('WebSocket connected');
    updateServerStatusIndicator();
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Route execution outputs to pending client-side resolvers
    if (data.type === 'tool_result' && pendingToolResolvers.has(data.callId)) {
      const resolver = pendingToolResolvers.get(data.callId);
      pendingToolResolvers.delete(data.callId);
      resolver(data);
      return;
    }

    handleServerMessage(data);
  };

  ws.onclose = (event) => {
    console.warn('WebSocket disconnected. Code:', event.code, 'Reason:', event.reason, 'Reconnecting...');
    updateServerStatusIndicator();
    setTimeout(connectWebSocket, 3000);
  };
}

// Handle server notifications
function handleServerMessage(data) {
  const trans = TRANSLATIONS[currentLang];
  switch (data.type) {
    case 'chunk':
      appendAgentChunk(data.text);
      break;
    case 'tool_call':
      renderToolCall(data);
      break;
    case 'approve_tool':
      requestToolApproval(data);
      break;
    case 'tool_executing':
      updateToolStatus(data.callId, 'executing');
      break;
    case 'tool_result':
      updateToolResult(data);
      break;
    case 'done':
      currentChatHistory = data.messages;
      finalizeAgentMessage();
      setAgentStatus('idle', trans.idle);
      toggleSendControls(false);
      saveCurrentSession();
      break;
    case 'error':
      appendSystemError(data.text);
      setAgentStatus('idle', trans.idle);
      toggleSendControls(false);
      saveCurrentSession();
      break;
  }
}

// Helper to switch active buttons during agent loop
function toggleSendControls(isRunning) {
  if (isRunning) {
    elBtnSend.style.display = 'none';
    elBtnStop.style.display = 'inline-flex';
  } else {
    elBtnSend.style.display = 'inline-flex';
    elBtnStop.style.display = 'none';
  }
}

// Auto-persistence database saver
async function saveCurrentSession() {
  if (!currentSessionId || currentChatHistory.length === 0) return;
  try {
    const firstUserMsg = currentChatHistory.find(m => m.role === 'user');
    const title = firstUserMsg ? (firstUserMsg.content.slice(0, 30) + '...') : 'New Session';

    await fetch(`/api/sessions/${currentSessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        cwd: activeCwd,
        provider: config.provider,
        model: config.model,
        messages: currentChatHistory
      })
    });
    fetchExplorer();
  } catch (e) {
    console.error('Auto-save failed:', e);
  }
}

// Robust Network fetch with Exponential Backoff Retries
async function fetchWithRetry(url, options, maxRetries = 3, initialDelay = 1500) {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`Server returned status ${response.status}`);
      }
      return response;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries || abortAgentLoop) {
        throw err;
      }
      const delay = initialDelay * Math.pow(2, attempt);
      console.warn(`Fetch failed. Retrying in ${delay}ms... Error: ${err.message}`);
      appendSystemWarning(currentLang === 'ar' 
        ? `⚠️ فشل الاتصال بالشبكة. جاري إعادة المحاولة خلال ${delay / 1000} ثانية...` 
        : `⚠️ Network call failed. Retrying in ${delay / 1000} seconds...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Browser-driven Agentic loop connecting directly to APIs
async function startBrowserAgentLoop(prompt) {
  const trans = TRANSLATIONS[currentLang];
  setAgentStatus('thinking', trans.thinking);
  toggleSendControls(true);
  abortAgentLoop = false;
  
  if (!currentSessionId) {
    currentSessionId = 'session-' + Math.random().toString(36).substring(2, 15);
  }

  // Display user bubble
  appendMessage('user', prompt);
  currentChatHistory.push({ role: 'user', content: prompt });
  
  // Persist user prompt immediately
  saveCurrentSession();

  const maxTurns = 12;
  let turn = 0;
  let running = true;

  // Retrieve active MCP tools
  const toolsRes = await fetch('/api/tools');
  const toolsData = await toolsRes.json();
  const openAiTools = (toolsData.tools || []).map(t => ({
    type: 'function',
    function: {
      name: `${t.serverName}__${t.originalName}`,
      description: t.description || '',
      parameters: t.inputSchema
    }
  }));

  const url = (config.provider === 'custom' ? config.customUrl : PROVIDER_URLS[config.provider]) + '/chat/completions';

  while (running && turn < maxTurns) {
    if (abortAgentLoop) {
      appendSystemWarning(currentLang === 'ar' ? '⏹️ تم إيقاف التشغيل بواسطة المستخدم.' : '⏹️ Execution stopped by user.');
      saveCurrentSession();
      break;
    }

    turn++;
    console.log(`Browser agent turn ${turn}`);

    let accumulatedText = '';
    const body = {
      model: config.model || 'z-ai/glm-5.2-free',
      messages: currentChatHistory,
      stream: true
    };

    if (openAiTools.length > 0) {
      body.tools = openAiTools;
      body.tool_choice = 'auto';
    }

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API returned status ${response.status}: ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      const accumulatedToolCalls = [];

      while (true) {
        if (abortAgentLoop) break;
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const cleaned = line.trim();
          if (!cleaned || cleaned === 'data: [DONE]') continue;

          if (cleaned.startsWith('data: ')) {
            try {
              const data = JSON.parse(cleaned.slice(6));
              const choice = data.choices?.[0];
              if (!choice) continue;

              const text = choice.delta?.content;
              if (text) {
                accumulatedText += text;
                appendAgentChunk(text);
              }

              const toolCalls = choice.delta?.tool_calls;
              if (toolCalls) {
                for (const tc of toolCalls) {
                  const idx = tc.index ?? 0;
                  if (!accumulatedToolCalls[idx]) {
                    accumulatedToolCalls[idx] = {
                      id: tc.id || '',
                      type: 'function',
                      function: { name: tc.function?.name || '', arguments: '' }
                    };
                  }
                  if (tc.id) accumulatedToolCalls[idx].id = tc.id;
                  if (tc.function?.name) accumulatedToolCalls[idx].function.name = tc.function.name;
                  if (tc.function?.arguments) accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            } catch (e) {}
          }
        }
      }

      if (abortAgentLoop) {
        appendSystemWarning(currentLang === 'ar' ? '⏹️ تم إيقاف التشغيل بواسطة المستخدم.' : '⏹️ Execution stopped by user.');
        saveCurrentSession();
        break;
      }

      // Add assistant response to history
      if (accumulatedText) {
        currentChatHistory.push({ role: 'assistant', content: accumulatedText });
        saveCurrentSession();
      }

      const finalToolCalls = accumulatedToolCalls.filter(Boolean);

      if (finalToolCalls.length === 0) {
        finalizeAgentMessage();
        setAgentStatus('idle', trans.idle);
        toggleSendControls(false);
        saveCurrentSession();
        running = false;
        break;
      }

      // We have tool calls: add them to history
      currentChatHistory.push({
        role: 'assistant',
        content: accumulatedText || null,
        tool_calls: finalToolCalls
      });
      saveCurrentSession();

      for (const tc of finalToolCalls) {
        if (abortAgentLoop) break;

        const fullFunctionName = tc.function.name;
        const [serverName, toolName] = fullFunctionName.split('__');
        let args = {};
        try {
          args = JSON.parse(tc.function.arguments || '{}');
        } catch (e) {}

        // Render tool call start banner
        finalizeAgentMessage();
        renderToolCall({ callId: tc.id, serverName, toolName, arguments: args });

        // Tool approval block
        let approved = elChkAutoApprove.checked;
        let finalArgs = args;

        if (!approved) {
          setAgentStatus('thinking', trans.waiting_approval);
          
          elApprovalServerName.innerText = serverName;
          elApprovalToolName.innerText = toolName;
          elApprovalArguments.value = JSON.stringify(args, null, 2);
          elModalApproval.classList.add('active');

          const approvalResult = await new Promise((resolve) => {
            pendingApprovalResolver = resolve;
          });

          approved = approvalResult.approved;
          if (approvalResult.modifiedArgs) finalArgs = approvalResult.modifiedArgs;
        }

        let outputContent = '';
        let isError = false;

        if (abortAgentLoop) {
          outputContent = 'Tool execution cancelled by user.';
          isError = true;
        } else if (approved) {
          setAgentStatus('executing', trans.executing);
          updateToolStatus(tc.id, 'executing');

          // Send execute request to local backend via WebSocket
          const toolExecPromise = new Promise((resolve) => {
            pendingToolResolvers.set(tc.id, resolve);
          });

          ws.send(JSON.stringify({
            type: 'execute_tool',
            callId: tc.id,
            serverName,
            toolName,
            arguments: finalArgs
          }));

          const execResult = await toolExecPromise;
          outputContent = execResult.content;
          isError = execResult.isError;
        } else {
          outputContent = 'Tool execution denied by user.';
          isError = true;
        }

        // Render tool result
        updateToolResult({ callId: tc.id, content: outputContent, isError });

        // Add to history
        currentChatHistory.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: fullFunctionName,
          content: outputContent
        });
        
        // Persist tool outcome immediately
        saveCurrentSession();
      }

      setAgentStatus('thinking', trans.thinking);

    } catch (err) {
      appendSystemError(err.message);
      setAgentStatus('idle', trans.idle);
      toggleSendControls(false);
      saveCurrentSession();
      break;
    }
  }

  toggleSendControls(false);
}

// Message UI Renderers
function appendMessage(role, content = '') {
  const isArabic = /[\u0600-\u06FF]/.test(content);
  const alignClass = isArabic ? 'rtl' : 'ltr';

  const div = document.createElement('div');
  div.className = `message ${role}`;

  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.innerText = role === 'user' ? 'U' : 'A';

  const contentDiv = document.createElement('div');
  contentDiv.className = `msg-content ${alignClass}`;
  
  if (role === 'user') {
    contentDiv.innerText = content;
  } else {
    contentDiv.innerHTML = marked.parse(content);
  }

  div.appendChild(avatar);
  div.appendChild(contentDiv);
  elConsoleLogs.appendChild(div);
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;

  return contentDiv;
}

function appendAgentChunk(text) {
  if (!currentAgentMessageElement) {
    currentAgentMessageElement = appendMessage('agent', '');
    currentAgentMessageElement.dataset.raw = '';
  }
  currentAgentMessageElement.dataset.raw += text;
  currentAgentMessageElement.innerHTML = marked.parse(currentAgentMessageElement.dataset.raw);
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
}

function finalizeAgentMessage() {
  currentAgentMessageElement = null;
}

// Render tool calling banner
function renderToolCall(data) {
  const isAr = /[\u0600-\u06FF]/.test(elPromptInput.value);
  const prefix = isAr ? 'الوكيل يستدعي أداة:' : 'Agent is calling tool:';

  const div = document.createElement('div');
  div.className = 'tool-call-banner';
  div.id = `tool-call-${data.callId}`;
  div.innerHTML = `
    <span class="status-indicator">⚙️</span>
    <div>
      <strong>${prefix} ${data.serverName} &rarr; ${data.toolName}</strong>
      <div style="font-size: 12px; font-family: monospace; margin-top: 4px;">Args: ${JSON.stringify(data.arguments)}</div>
      <div class="tool-output-container"></div>
    </div>
  `;
  elConsoleLogs.appendChild(div);
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
}

function updateToolStatus(callId, status) {
  const el = document.getElementById(`tool-call-${callId}`);
  if (el) {
    el.className = `tool-call-banner ${status}`;
    const indicator = el.querySelector('.status-indicator');
    if (status === 'executing') indicator.innerText = '⏳';
    if (status === 'success') indicator.innerText = '✅';
    if (status === 'error') indicator.innerText = '❌';
  }
}

function updateToolResult(data) {
  updateToolStatus(data.callId, data.isError ? 'error' : 'success');
  const el = document.getElementById(`tool-call-${data.callId}`);
  if (el) {
    const container = el.querySelector('.tool-output-container');
    container.innerHTML = `
      <div class="tool-output-log">${data.content}</div>
    `;
    elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
  }
}

function appendSystemError(text) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.style.borderColor = 'var(--color-red)';
  div.style.background = 'rgba(255, 23, 68, 0.05)';
  div.innerHTML = `
    <span class="icon">❌</span>
    <div class="content rtl">
      <p>حدث خطأ: ${text}</p>
    </div>
  `;
  elConsoleLogs.appendChild(div);
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
}

function appendSystemWarning(text) {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.style.borderColor = 'var(--color-amber)';
  div.style.background = 'rgba(255, 170, 0, 0.05)';
  div.innerHTML = `
    <span class="icon">⚠️</span>
    <div class="content rtl">
      <p>${text}</p>
    </div>
  `;
  elConsoleLogs.appendChild(div);
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
}

// User Actions
elBtnApproveTool.addEventListener('click', () => {
  if (pendingApprovalResolver) {
    let parsedArgs = null;
    try {
      parsedArgs = JSON.parse(elApprovalArguments.value);
    } catch (e) {
      alert('Invalid JSON in arguments editor!');
      return;
    }
    elModalApproval.classList.remove('active');
    pendingApprovalResolver({ approved: true, modifiedArgs: parsedArgs });
    pendingApprovalResolver = null;
  }
});

elBtnDenyTool.addEventListener('click', () => {
  if (pendingApprovalResolver) {
    elModalApproval.classList.remove('active');
    pendingApprovalResolver({ approved: false, modifiedArgs: null });
    pendingApprovalResolver = null;
  }
});

elBtnSettings.addEventListener('click', () => {
  elModalSettings.classList.add('active');
});

elCloseSettings.addEventListener('click', () => {
  elModalSettings.classList.remove('active');
});

elSelectProvider.addEventListener('change', () => {
  if (elSelectProvider.value === 'custom') {
    elGroupCustomUrl.style.display = 'flex';
  } else {
    elGroupCustomUrl.style.display = 'none';
  }
});

elBtnSaveSettings.addEventListener('click', saveConfig);

elBtnNewSession.addEventListener('click', createNewSession);

elBtnLangToggle.addEventListener('click', toggleLanguage);

elBtnStop.addEventListener('click', () => {
  abortAgentLoop = true;
  toggleSendControls(false);
  setAgentStatus('idle', TRANSLATIONS[currentLang].idle);
});

function sendPrompt() {
  const prompt = elPromptInput.value.trim();
  if (!prompt) return;

  if (!config.apiKey) {
    alert('Please configure your LLM Provider and API key in Settings first.');
    elModalSettings.classList.add('active');
    return;
  }

  elPromptInput.value = '';
  elPromptInput.className = '';

  // Trigger client-side direct API agent loop
  startBrowserAgentLoop(prompt);
}

elBtnSend.addEventListener('click', sendPrompt);
elPromptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});

elBtnClearChat.addEventListener('click', () => {
  elConsoleLogs.innerHTML = `
    <div class="system-message">
      <div class="icon">🤖</div>
      <div class="content">
        <p>Console cleared. You can start a fresh session.</p>
      </div>
    </div>
  `;
  currentChatHistory = [];
});

// App Initialization
loadConfig();
connectWebSocket();
fetchTools();
createNewSession();

// Startup workspace sync
if (config.projectPath) {
  switchProjectFolder(config.projectPath);
} else {
  // If no path saved, get default from server
  fetch('/api/projects')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        activeCwd = data.activeCwd;
        elCurrentProject.innerText = activeCwd.split(/[\\/]/).pop() || activeCwd;
        config.projectPath = activeCwd;
        elInputProjectPath.value = activeCwd;
        localStorage.setItem('gda_config', JSON.stringify(config));
        fetchExplorer();
      }
    });
}

setInterval(fetchTools, 15000);
