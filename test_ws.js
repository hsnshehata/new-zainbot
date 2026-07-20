const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws/chat');

ws.on('open', () => {
  console.log('Test client: WebSocket opened successfully!');
  setTimeout(() => {
    console.log('Test client: Closing WebSocket after 2 seconds.');
    ws.close();
  }, 2000);
});

ws.on('message', (data) => {
  console.log('Test client: Received message:', data.toString());
});

ws.on('close', (code, reason) => {
  console.log('Test client: WebSocket closed. Code:', code, 'Reason:', reason.toString());
});

ws.on('error', (err) => {
  console.error('Test client: WebSocket error:', err.message);
});
