const http = require('http');

const data = JSON.stringify({
  message: "let's make an ad film",
  history: [],
  sessionState: {},
  brand: null,
  sessionId: null
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/brainstorm-studio/fidato-chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding('utf8');
  res.on('data', (chunk) => {
    console.log(`BODY CHUNK: ${chunk}`);
  });
  res.on('end', () => {
    console.log('No more data in response.');
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
