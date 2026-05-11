import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:predict?key=${API_KEY}`;

const req = {
  instances: [{ prompt: 'A cinematic city skyline at sunset' }],
  parameters: {
      sampleCount: 1,
      aspectRatio: '16:9'
  }
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      console.log(JSON.stringify(data, null, 2));
  })
  .catch(console.error);
