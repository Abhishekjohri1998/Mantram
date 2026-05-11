import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;

const req = {
  instances: [{ prompt: 'A red ball' }],
  parameters: { sampleCount: 1 }
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      if (data.predictions) {
          console.log(Object.keys(data.predictions[0]));
      } else {
          console.log(data);
      }
  });
