import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${API_KEY}`;

const req = {
  contents: [{ role: 'user', parts: [{ text: 'A futuristic city skyline at sunset' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
  },
  // Some docs say image_config? Or maybe generationConfig has aspect_ratio?
};

// Trying image_config? No, let's try generationConfig: { aspect_ratio: "16:9" }
const req2 = { ...req, generationConfig: { responseModalities: ['IMAGE'], aspect_ratio: "16:9" } };

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req2) })
  .then(res => res.json())
  .then(data => {
      if (data.error) console.log(JSON.stringify(data.error, null, 2));
      else console.log("SUCCESS generationConfig.aspect_ratio");
  })
  .catch(console.error);
