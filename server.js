const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { McpManager } = require('./src/mcp_client');
const { streamCompletion } = require('./src/providers');
const sessionManager = require('./src/sessions');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;

// Initialize MCP Manager
const mcpManager = new McpManager(path.join(__dirname, 'mcp_config.json'));
mcpManager.startAll();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API to list registered MCP servers and tools
app.get('/api/tools', async (req, res) => {
  try {
    const tools = await mcpManager.getCombinedTools();
    res.json({
      success: true,
      servers: Array.from(mcpManager.clients.keys()),
      tools: tools.map(t => ({
        name: `${t._serverName}__${t.name}`,
        description: t.description,
        inputSchema: t.inputSchema,
        serverName: t._serverName,
        originalName: t.name
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sessions API
app.get('/api/sessions', (req, res) => {
  res.json({ success: true, sessions: sessionManager.listSessions() });
});

app.get('/api/sessions/:id', (req, res) => {
  const session = sessionManager.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  res.json({ success: true, session });
});

app.post('/api/sessions/:id', (req, res) => {
  try {
    const session = sessionManager.saveSession(req.params.id, req.body);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/sessions/:id', (req, res) => {
  const deleted = sessionManager.deleteSession(req.params.id);
  res.json({ success: true, deleted });
});

// Projects / CWD API
app.get('/api/projects', (req, res) => {
  res.json({
    success: true,
    activeCwd: sessionManager.getActiveCwd(),
    projects: sessionManager.listRecentProjects()
  });
});

app.post('/api/projects/switch', (req, res) => {
  try {
    const newCwd = sessionManager.setActiveCwd(req.body.path);
    res.json({ success: true, activeCwd: newCwd });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Setup WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws/chat') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  console.log('Client connected to GDA Agent Console');
  
  // Track the resolver for manual tool approval blocks
  let toolApprovalResolver = null;

  ws.on('message', async (messageData) => {
    try {
      const data = JSON.parse(messageData);

      // Handle tool approvals from the UI
      if (data.type === 'tool_approved') {
        if (toolApprovalResolver) {
          toolApprovalResolver(data);
          toolApprovalResolver = null;
        }
        return;
      }

      // Handle client-side executed tool requests
      if (data.type === 'execute_tool') {
        const { callId, serverName, toolName, arguments: args } = data;
        console.log(`Executing tool request from browser: ${serverName}__${toolName}`);
        try {
          const response = await mcpManager.executeTool(serverName, toolName, args);
          ws.send(JSON.stringify({
            type: 'tool_result',
            callId,
            content: JSON.stringify(response),
            isError: false
          }));
        } catch (execError) {
          ws.send(JSON.stringify({
            type: 'tool_result',
            callId,
            content: `Tool Execution Error: ${execError.message}`,
            isError: true
          }));
        }
        return;
      }

      if (data.type === 'prompt') {
        const {
          prompt,
          provider,
          apiKey,
          customUrl,
          model,
          autoApprove,
          sessionId,
          chatMode = 'agent',
          history = []
        } = data;

        // Fetch active MCP tools and format them for OpenAI JSON schema
        const mcpTools = chatMode === 'chat' ? [] : await mcpManager.getCombinedTools();
        const openAiTools = mcpTools.map(t => ({
          type: 'function',
          function: {
            name: `${t._serverName}__${t.name}`,
            description: t.description || '',
            parameters: t.inputSchema
          }
        }));

        let messages = [...history];
        
        // Push the user's initial prompt
        messages.push({ role: 'user', content: prompt });

        const maxTurns = 12;
        let turn = 0;
        let running = true;

        while (running && turn < maxTurns) {
          turn++;
          console.log(`Agent starting loop turn ${turn}`);

          let accumulatedText = '';
          let streamDonePromise = new Promise((resolve, reject) => {
            streamCompletion({
              provider,
              apiKey,
              customUrl,
              model,
              messages,
              tools: openAiTools.length > 0 ? openAiTools : null,
              onChunk: (chunk) => {
                if (chunk.type === 'text') {
                  accumulatedText += chunk.text;
                  ws.send(JSON.stringify({ type: 'chunk', text: chunk.text }));
                }
              },
              onDone: (result) => {
                resolve(result);
              },
              onError: (err) => {
                reject(err);
              }
            });
          });

          // Wait for stream to finish
          let completionResult;
          try {
            completionResult = await streamDonePromise;
          } catch (streamError) {
            ws.send(JSON.stringify({ type: 'error', text: `LLM Connection Error: ${streamError.message}` }));
            break;
          }

          // Add assistant message to history
          if (accumulatedText) {
            messages.push({ role: 'assistant', content: accumulatedText });
          }

          const toolCalls = completionResult.toolCalls;

          if (!toolCalls || toolCalls.length === 0) {
            // Auto-save session on turn end
            if (sessionId) {
              // Extract a short title from the prompt if it's the first message
              const title = history.length === 0 ? (prompt.slice(0, 30) + '...') : undefined;
              sessionManager.saveSession(sessionId, {
                title,
                cwd: sessionManager.getActiveCwd(),
                provider,
                model,
                messages
              });
            }

            ws.send(JSON.stringify({ type: 'done', messages }));
            running = false;
            break;
          }

          // We have tool calls to execute
          const toolResults = [];

          // Add assistant's tool calls to messages array so LLM can map response
          messages.push({
            role: 'assistant',
            content: accumulatedText || null,
            tool_calls: toolCalls
          });

          for (const tc of toolCalls) {
            const fullFunctionName = tc.function.name;
            const [serverName, toolName] = fullFunctionName.split('__');
            let args = {};
            
            try {
              args = JSON.parse(tc.function.arguments || '{}');
            } catch (e) {
              console.error('Failed to parse tool arguments JSON:', tc.function.arguments);
            }

            ws.send(JSON.stringify({
              type: 'tool_call',
              callId: tc.id,
              serverName,
              toolName,
              arguments: args
            }));

            let approved = autoApprove;
            let finalArgs = args;

            if (!autoApprove) {
              // Block and request approval from UI
              ws.send(JSON.stringify({
                type: 'approve_tool',
                callId: tc.id,
                serverName,
                toolName,
                arguments: args
              }));

              // Setup promise to wait for WebSocket response
              const approvalResponse = await new Promise((resolve) => {
                toolApprovalResolver = resolve;
              });

              approved = approvalResponse.approved;
              if (approvalResponse.modifiedArgs) {
                finalArgs = approvalResponse.modifiedArgs;
              }
            }

            let outputContent = '';
            let isError = false;

            if (approved) {
              ws.send(JSON.stringify({ type: 'tool_executing', callId: tc.id }));
              try {
                // Set the active CWD context for GDA tool executions
                const response = await mcpManager.executeTool(serverName, toolName, finalArgs);
                outputContent = JSON.stringify(response);
              } catch (execError) {
                outputContent = `Tool Execution Error: ${execError.message}`;
                isError = true;
              }
            } else {
              outputContent = 'Tool execution denied by user.';
              isError = true;
            }

            ws.send(JSON.stringify({
              type: 'tool_result',
              callId: tc.id,
              content: outputContent,
              isError
            }));

            // Push standard tool response
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: fullFunctionName,
              content: outputContent
            });
          }
        }

        if (turn >= maxTurns) {
          ws.send(JSON.stringify({ type: 'error', text: 'Loop turn limit reached.' }));
        }
      }
    } catch (err) {
      console.error('WS Error:', err);
      ws.send(JSON.stringify({ type: 'error', text: `Server loop error: ${err.message}` }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from GDA Console');
  });
});

// Clean up child processes on exit
process.on('exit', () => {
  mcpManager.stopAll();
});
process.on('SIGINT', () => {
  mcpManager.stopAll();
  process.exit();
});

server.listen(PORT, () => {
  console.log(`Gravity Developer Agent (GDA) server is running at http://localhost:${PORT}`);
});
