const test = require('node:test');
const assert = require('node:assert');
const { McpClient } = require('../src/mcp_client');

test('McpClient - JSON-RPC Message Handling', async (t) => {
  const client = new McpClient('test-server', { command: 'node', args: [] });
  
  // Mock child process and standard input/output mapping
  client.child = {
    stdin: {
      write: (data) => {
        client.lastWrittenData = data;
      }
    }
  };

  await t.test('should parse individual JSON-RPC response messages', () => {
    let resolved = false;
    let resultData = null;

    client.pendingRequests.set(1, {
      resolve: (res) => {
        resolved = true;
        resultData = res;
      },
      reject: () => {}
    });

    // Simulate stdout output chunk
    client.handleIncomingMessage({
      jsonrpc: '2.0',
      id: 1,
      result: { status: 'ok', value: 42 }
    });

    assert.strictEqual(resolved, true);
    assert.deepStrictEqual(resultData, { status: 'ok', value: 42 });
    assert.strictEqual(client.pendingRequests.has(1), false);
  });

  await t.test('should reject on JSON-RPC error responses', () => {
    let rejected = false;
    let errorObj = null;

    client.pendingRequests.set(2, {
      resolve: () => {},
      reject: (err) => {
        rejected = true;
        errorObj = err;
      }
    });

    client.handleIncomingMessage({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32602, message: 'Invalid params' }
    });

    assert.strictEqual(rejected, true);
    assert.match(errorObj.message, /Invalid params/);
  });
});
