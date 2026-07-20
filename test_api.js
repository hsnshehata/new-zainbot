const fetch = require('node-fetch');

async function test() {
  console.log('Sending request to TokenRouter...');
  try {
    const response = await fetch('https://api.tokenrouter.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sk-ITgRhbWQgFPBPhfruOo7ipLsBNzeM7KVfAc2Jd3Ud2c0DmTE'
      },
      body: JSON.stringify({
        model: 'z-ai/glm-5.2-free',
        messages: [
          { role: 'user', content: 'Say hello' }
        ],
        stream: true
      })
    });

    console.log('Response status:', response.status);
    if (!response.ok) {
      console.log('Error body:', await response.text());
      return;
    }

    response.body.on('data', (chunk) => {
      console.log('Chunk received:', chunk.toString());
    });

    response.body.on('end', () => {
      console.log('Stream ended');
    });
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
