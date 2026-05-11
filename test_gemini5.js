import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;

const req = {
  instances: [
    { prompt: 'A futuristic city skyline at sunset' }
  ],
  parameters: {
    sampleCount: 1,
    aspectRatio: '16:9'
  }
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      if (data.error) console.log(JSON.stringify(data.error, null, 2));
      else console.log("SUCCESS");
  })
  .catch(console.error);
