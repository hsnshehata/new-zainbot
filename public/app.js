// Constants
let ws = null;
let currentChatHistory = [];
let pendingApprovalResolver = null;
let currentAgentMessageElement = null;

// DOM Elements
const elPromptInput = document.getElementById('prompt-input');
const elBtnSend = document.getElementById('btn-send');
const elConsoleLogs = document.getElementById('console-logs');
const elMcpList = document.getElementById('mcp-list');
const elToolsList = document.getElementById('tools-list');
const elBtnSettings = document.getElementById('btn-settings');
const elBtnClearChat = document.getElementById('btn-clear-chat');
const elCurrentModel = document.getElementById('current-model');
const elProviderText = document.getElementById('provider-text');
const elProviderIndicator = document.getElementById('provider-indicator');
const elChkAutoApprove = document.getElementById('chk-auto-approve');

// Modal Elements
const elModalSettings = document.getElementById('modal-settings');
const elBtnSaveSettings = document.getElementById('btn-save-settings');
const elCloseSettings = document.getElementById('close-settings');
const elSelectProvider = document.getElementById('select-provider');
const elGroupCustomUrl = document.getElementById('group-custom-url');
const elInputCustomUrl = document.getElementById('input-custom-url');
const elInputApiKey = document.getElementById('input-api-key');
const elInputModel = document.getElementById('input-model');

// Approval Modal Elements
const elModalApproval = document.getElementById('modal-approval');
const elApprovalServerName = document.getElementById('approval-server-name');
const elApprovalToolName = document.getElementById('approval-tool-name');
const elApprovalArguments = document.getElementById('approval-arguments');
const elBtnApproveTool = document.getElementById('btn-approve-tool');
const elBtnDenyTool = document.getElementById('btn-deny-tool');

// Config mapping
const PROVIDER_NAMES = {
  tokenrouter: 'TokenRouter (GLM 5.2)',
  xai: 'xAI (Grok)',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  siliconflow: 'SiliconFlow',
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  custom: 'Custom URL'
};

// Initial Configuration Loading
let config = {
  provider: 'tokenrouter',
  apiKey: '',
  model: '',
  customUrl: ''
};

function loadConfig() {
  const saved = localStorage.getItem('gda_config');
  if (saved) {
    try {
      config = { ...config, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Failed to parse config:', e);
    }
  }
  updateConfigUI();
}

function saveConfig() {
  config.provider = elSelectProvider.value;
  config.customUrl = elInputCustomUrl.value;
  config.apiKey = elInputApiKey.value;
  config.model = elInputModel.value;

  localStorage.setItem('gda_config', JSON.stringify(config));
  updateConfigUI();
  elModalSettings.classList.remove('active');
  connectWebSocket();
}

function updateConfigUI() {
  elSelectProvider.value = config.provider;
  elInputCustomUrl.value = config.customUrl;
  elInputApiKey.value = config.apiKey;
  elInputModel.value = config.model;

  if (config.provider === 'custom') {
    elGroupCustomUrl.style.display = 'flex';
  } else {
    elGroupCustomUrl.style.display = 'none';
  }

  // Update Status panel
  if (config.apiKey) {
    elProviderText.innerText = PROVIDER_NAMES[config.provider] || config.provider;
    elProviderIndicator.className = 'indicator green';
    elCurrentModel.innerText = config.model || 'Default';
  } else {
    elProviderText.innerText = 'API Key Required';
    elProviderIndicator.className = 'indicator red';
    elCurrentModel.innerText = 'Not Set';
  }
}

// Check Arabic input to dynamically adjust alignment
elPromptInput.addEventListener('input', () => {
  const isArabic = /[\u0600-\u06FF]/.test(elPromptInput.value);
  if (isArabic) {
    elPromptInput.className = 'rtl';
  } else {
    elPromptInput.className = '';
  }
});

// Fetch active MCP Servers & Tools
async function fetchTools() {
  try {
    const res = await fetch('/api/tools');
    const data = await res.json();

    if (data.success) {
      // Load MCP Servers
      if (data.servers.length === 0) {
        elMcpList.innerHTML = `<li class="loading">No servers active. Update mcp_config.json</li>`;
      } else {
        elMcpList.innerHTML = data.servers
          .map(server => `<li><span class="indicator green"></span> ${server}</li>`)
          .join('');
      }

      // Load Tools
      if (data.tools.length === 0) {
        elToolsList.innerHTML = `<li class="loading">No tools found.</li>`;
      } else {
        elToolsList.innerHTML = data.tools
          .map(tool => `
            <li title="${tool.description || 'No description'}">
              <strong>${tool.originalName}</strong>
              <div style="font-size: 11px; color: var(--color-text-muted)">${tool.serverName}</div>
            </li>
          `).join('');
      }
    }
  } catch (err) {
    console.error('Error fetching tools:', err);
    elMcpList.innerHTML = `<li class="loading red">Connection failed</li>`;
    elToolsList.innerHTML = `<li class="loading red">Connection failed</li>`;
  }
}

// WebSocket Connection Setup
function connectWebSocket() {
  if (ws) {
    ws.close();
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };

  ws.onclose = () => {
    console.warn('WebSocket disconnected. Reconnecting...');
    setTimeout(connectWebSocket, 3000);
  };
}

// Handle socket events
function handleServerMessage(data) {
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
      break;

    case 'error':
      appendSystemError(data.text);
      break;
  }
}

// Message Rendering Helpers
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
    // Render markdown using Marked
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
  
  // Render live markdown parsed preview
  currentAgentMessageElement.innerHTML = marked.parse(currentAgentMessageElement.dataset.raw);
  elConsoleLogs.scrollTop = elConsoleLogs.scrollHeight;
}

function finalizeAgentMessage() {
  currentAgentMessageElement = null;
}

function renderToolCall(data) {
  // If there's an active chunk stream, close it
  finalizeAgentMessage();

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

// Tool Execution Approval Modal
function requestToolApproval(data) {
  elApprovalServerName.innerText = data.serverName;
  elApprovalToolName.innerText = data.toolName;
  elApprovalArguments.value = JSON.stringify(data.arguments, null, 2);

  elModalApproval.classList.add('active');

  pendingApprovalResolver = (approved, modifiedArgs) => {
    elModalApproval.classList.remove('active');
    ws.send(JSON.stringify({
      type: 'tool_approved',
      callId: data.callId,
      approved,
      modifiedArgs
    }));
  };
}

elBtnApproveTool.addEventListener('click', () => {
  if (pendingApprovalResolver) {
    let parsedArgs = null;
    try {
      parsedArgs = JSON.parse(elApprovalArguments.value);
    } catch (e) {
      alert('Invalid JSON in arguments editor!');
      return;
    }
    pendingApprovalResolver(true, parsedArgs);
    pendingApprovalResolver = null;
  }
});

elBtnDenyTool.addEventListener('click', () => {
  if (pendingApprovalResolver) {
    pendingApprovalResolver(false, null);
    pendingApprovalResolver = null;
  }
});

// Settings interactions
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

// Send Prompts
function sendPrompt() {
  const prompt = elPromptInput.value.trim();
  if (!prompt) return;

  if (!config.apiKey) {
    alert('Please configure your LLM Provider and API key in Settings first.');
    elModalSettings.classList.add('active');
    return;
  }

  // Display user prompt bubble
  appendMessage('user', prompt);
  elPromptInput.value = '';
  elPromptInput.className = '';

  // Submit via WebSockets
  ws.send(JSON.stringify({
    type: 'prompt',
    prompt,
    provider: config.provider,
    apiKey: config.apiKey,
    customUrl: config.customUrl,
    model: config.model,
    autoApprove: elChkAutoApprove.checked,
    history: currentChatHistory
  }));
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
setInterval(fetchTools, 10000); // Poll for tools lists updates
