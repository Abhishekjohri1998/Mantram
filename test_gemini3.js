import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;

const req = {
  contents: [{ role: 'user', parts: [{ text: 'A futuristic city skyline at sunset' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
  },
  // Testing other places for aspect ratio
  // imageGenerationConfig ? outputOptions ? 
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      console.log(data);
  })
  .catch(console.error);
