import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });

const API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${API_KEY}`;

const req = {
  instances: [{ prompt: 'A cinematic shot of a glowing neon sign that says "INNOVATION" in a dark alleyway' }],
  parameters: { sampleCount: 1, aspectRatio: '16:9' }
};

fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) })
  .then(res => res.json())
  .then(data => {
      if (data.predictions) {
          console.log("SUCCESS");
          import('fs').then(fs => {
             const b64 = data.predictions[0].bytesBase64Encoded;
             fs.writeFileSync('/Users/dasachin/.gemini/antigravity/brain/eb837a6c-00da-4178-8a03-0fbe050edf6e/scratch/test_imagen4_text.jpg', Buffer.from(b64, 'base64'));
          });
      }
  });
