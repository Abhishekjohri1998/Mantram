import http from 'http';

const data = JSON.stringify({
  email: 'user@mantram.ai',
  password: 'Mantram@2024'
});

const loginOptions = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(loginOptions, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    try {
        const token = JSON.parse(body).token;
        if (!token) return console.log("Login failed");

        const enhanceData = JSON.stringify({
          prompt: "a cozy cabin in winter",
          format: "instagram-post"
        });

        const enhanceOptions = {
          hostname: 'localhost',
          port: 3001,
          path: '/api/creatives/enhance-prompt',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'Content-Length': Buffer.byteLength(enhanceData)
          }
        };

        const enhanceReq = http.request(enhanceOptions, res2 => {
          let body2 = '';
          res2.on('data', d => body2 += d);
          res2.on('end', () => {
            console.log("Enhance Data:", body2.substring(0, 500));
          });
        });
        enhanceReq.write(enhanceData);
        enhanceReq.end();
    } catch(e) {
        console.error(e);
    }
  });
});

req.write(data);
req.end();
