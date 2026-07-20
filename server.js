const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { McpManager } = require('./src/mcp_client');
const { streamCompletion } = require('./src/providers');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const PORT = process.env.PORT || 3000;

// Initialize MCP Manager with the config file path
const mcpManager = new McpManager(path.join(__dirname, 'mcp_config.json'));
mcpManager.startAll();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API to list registered MCP servers and their active tools
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

      if (data.type === 'prompt') {
        const {
          prompt,
          provider,
          apiKey,
          customUrl,
          model,
          autoApprove,
          history = []
        } = data;

        // Fetch active MCP tools and format them for OpenAI JSON schema
        const mcpTools = await mcpManager.getCombinedTools();
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
            // No tools to execute: agent finished this turn
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
