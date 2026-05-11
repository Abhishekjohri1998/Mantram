import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;

const req = {
  contents: [{ role: 'user', parts: [{ text: 'A futuristic city skyline at sunset' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
  },
  image_config: {
    aspect_ratio: "16:9"
  }
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      if (data.error) console.log(JSON.stringify(data.error, null, 2));
      else console.log("SUCCESS top level image_config");
  })
  .catch(console.error);
