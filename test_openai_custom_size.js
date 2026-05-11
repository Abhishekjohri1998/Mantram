import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.LAOZHANG_API_KEY;
const url = `https://api.laozhang.ai/v1/images/generations`;

const req = {
  model: 'gpt-image-2',
  prompt: 'A cinematic wide angle shot of a neon sign that says "TEST" in the desert',
  width: 1536,
  height: 512, // 3:1 ratio
  response_format: 'url'
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      console.log(JSON.stringify(data, null, 2));
  })
  .catch(console.error);
