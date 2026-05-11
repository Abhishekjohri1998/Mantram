import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
// using a model that generates images. The existing code uses gemini-3.1-flash-image-preview
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;

const req = {
  contents: [{ role: 'user', parts: [{ text: 'A futuristic city skyline at sunset' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
    // testing if this is supported natively
    speechConfig: undefined 
  }
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      console.log(Object.keys(data));
      if (data.error) console.log(JSON.stringify(data.error, null, 2));
      else console.log("SUCCESS");
  })
  .catch(console.error);
