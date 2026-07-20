const fetch = require('node-fetch');

// Helper to determine the standard base URL for different LLM providers
function getProviderBaseUrl(provider) {
  switch (provider) {
    case 'xai':
      return 'https://api.x.ai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'deepseek':
      return 'https://api.deepseek.com/v1';
    case 'siliconflow':
      return 'https://api.siliconflow.cn/v1';
    case 'tokenrouter':
      return 'https://api.tokenrouter.com/v1';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta/openai';
    case 'openai':
      return 'https://api.openai.com/v1';
    default:
      return '';
  }
}

// Helper to determine the default model for different LLM providers
function getProviderDefaultModel(provider) {
  switch (provider) {
    case 'xai':
      return 'grok-2-1212';
    case 'openrouter':
      return 'google/gemini-2.5-flash';
    case 'deepseek':
      return 'deepseek-chat';
    case 'siliconflow':
      return 'deepseek-ai/DeepSeek-V3';
    case 'tokenrouter':
      return 'z-ai/glm-5.2-free';
    case 'gemini':
      return 'gemini-2.5-flash';
    case 'openai':
      return 'gpt-4o-mini';
    default:
      return '';
  }
}

/**
 * Streams chat completions from any OpenAI-compatible provider
 * Yields parsed events (text or tool calls)
 */
async function streamCompletion({ provider, apiKey, customUrl, model, messages, tools, onChunk, onDone, onError }) {
  try {
    const baseUrl = (provider === 'custom' ? customUrl : getProviderBaseUrl(provider)) || 'https://api.openai.com/v1';
    const activeModel = model || getProviderDefaultModel(provider);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    // OpenRouter requires specific headers for identification
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://github.com/hsnsh/gravity-developer-agent';
      headers['X-Title'] = 'Gravity Developer Agent';
    }

    const body = {
      model: activeModel,
      messages,
      stream: true
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    console.log(`Calling LLM API [${baseUrl}/chat/completions] for model [${activeModel}]`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`LLM Provider returned error ${response.status}: ${errText}`);
    }

    const reader = response.body;
    let buffer = '';
    const accumulatedToolCalls = [];

    reader.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the incomplete line in the buffer

      for (const line of lines) {
        const cleaned = line.trim();
        if (!cleaned) continue;
        if (cleaned === 'data: [DONE]') continue;

        if (cleaned.startsWith('data: ')) {
          try {
            const data = JSON.parse(cleaned.slice(6));
            const choice = data.choices?.[0];
            if (!choice) continue;

            // Handle text streaming
            const text = choice.delta?.content;
            if (text) {
              onChunk({ type: 'text', text });
            }

            // Handle tool calls streaming
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
                if (tc.function?.arguments) {
                  accumulatedToolCalls[idx].function.arguments += tc.function.arguments;
                }
              }
            }
          } catch (e) {
            // Ignore JSON parse errors for incomplete lines
          }
        }
      }
    });

    reader.on('end', () => {
      // Clean up the tool calls array from any empty/null slots
      const finalToolCalls = accumulatedToolCalls.filter(Boolean);
      onDone({ toolCalls: finalToolCalls.length > 0 ? finalToolCalls : null });
    });

    reader.on('error', (err) => {
      onError(err);
    });

  } catch (err) {
    onError(err);
  }
}

module.exports = {
  streamCompletion,
  getProviderBaseUrl,
  getProviderDefaultModel
};
