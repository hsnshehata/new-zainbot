const { spawn } = require('child_process');

class McpClient {
  constructor(name, config) {
    this.name = name;
    this.command = config.command;
    this.args = config.args || [];
    this.env = config.env || {};
    this.child = null;
    this.idCounter = 1;
    this.pendingRequests = new Map();
    this.stdoutBuffer = '';
  }

  /**
   * Spawns the MCP server child process and hooks up stdio listeners
   */
  start() {
    console.log(`Starting MCP Server [${this.name}]: ${this.command} ${this.args.join(' ')}`);
    
    // Combine host env with configured server env (e.g. GITHUB_TOKEN)
    const combinedEnv = {
      ...process.env,
      ...this.env
    };

    this.child = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      shell: process.platform === 'win32', // Windows requires shell to run npx/cmd wrappers
      env: combinedEnv
    });

    this.child.stdout.on('data', (chunk) => {
      this.stdoutBuffer += chunk.toString();
      const lines = this.stdoutBuffer.split('\n');
      this.stdoutBuffer = lines.pop(); // Retain incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        try {
          const message = JSON.parse(trimmed);
          this.handleIncomingMessage(message);
        } catch (err) {
          // Log parsing errors (could be non-JSON debug logs printed to stdout by mistake)
          console.warn(`[MCP ${this.name} stdout-parse-error]:`, trimmed);
        }
      }
    });

    this.child.on('close', (code) => {
      console.log(`MCP Server [${this.name}] exited with code ${code}`);
      // Reject all pending requests
      for (const [id, req] of this.pendingRequests.entries()) {
        req.reject(new Error(`MCP Server [${this.name}] exited unexpectedly with code ${code}`));
        this.pendingRequests.delete(id);
      }
      this.child = null;
    });

    this.child.on('error', (err) => {
      console.error(`MCP Server [${this.name}] process error:`, err);
    });
  }

  /**
   * Handles JSON-RPC responses and notifications
   */
  handleIncomingMessage(message) {
    if (message.id !== undefined && message.id !== null) {
      const req = this.pendingRequests.get(message.id);
      if (req) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          req.reject(new Error(`MCP Error [${message.error.code}]: ${message.error.message}`));
        } else {
          req.resolve(message.result);
        }
      }
    } else {
      // It is a notification (e.g. log message)
      console.log(`[MCP Notification ${this.name}]:`, JSON.stringify(message));
    }
  }

  /**
   * Sends a JSON-RPC request to the MCP server
   */
  async request(method, params = {}) {
    if (!this.child) {
      throw new Error(`MCP Server [${this.name}] is not running.`);
    }

    const id = this.idCounter++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  /**
   * Queries the tools list supported by this MCP server
   */
  async listTools() {
    try {
      const response = await this.request('tools/list');
      return response.tools || [];
    } catch (err) {
      console.error(`Failed to list tools for MCP [${this.name}]:`, err.message);
      return [];
    }
  }

  /**
   * Calls a tool with specific arguments
   */
  async callTool(toolName, args = {}) {
    return this.request('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  /**
   * Stops the MCP server process
   */
  stop() {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
  }
}

class McpManager {
  constructor(configPath) {
    this.configPath = configPath;
    this.clients = new Map();
  }

  /**
   * Loads config and starts all registered MCP servers
   */
  startAll() {
    try {
      const fs = require('fs');
      if (!fs.existsSync(this.configPath)) {
        console.warn(`MCP config not found at: ${this.configPath}`);
        return;
      }

      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      const servers = config.mcpServers || {};

      for (const [name, serverConfig] of Object.entries(servers)) {
        const client = new McpClient(name, serverConfig);
        client.start();
        this.clients.set(name, client);
      }
    } catch (err) {
      console.error('Error starting MCP Manager:', err.message);
    }
  }

  /**
   * Gets a list of all tools from all active MCP servers
   */
  async getCombinedTools() {
    const combined = [];
    for (const [serverName, client] of this.clients.entries()) {
      const tools = await client.listTools();
      for (const tool of tools) {
        // Embed the server name so we know where to route the tool call
        combined.push({
          ...tool,
          _serverName: serverName
        });
      }
    }
    return combined;
  }

  /**
   * Routes a tool execution to the appropriate MCP server
   */
  async executeTool(serverName, toolName, args) {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`MCP server [${serverName}] is not running or registered.`);
    }
    return client.callTool(toolName, args);
  }

  /**
   * Stops all MCP servers
   */
  stopAll() {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
  }
}

module.exports = {
  McpClient,
  McpManager
};
