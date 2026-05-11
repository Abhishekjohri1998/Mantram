import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config({ path: 'backend/.env' });
const API_KEY = process.env.GEMINI_API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" });

const req = {
  contents: [{ role: 'user', parts: [{ text: 'A futuristic city skyline at sunset' }] }],
  generationConfig: {
    responseModalities: ['IMAGE'],
  }
};

// The SDK typing might have imageGenerationConfig, let's inject it directly into the request
req.generationConfig.aspectRatio = "16:9";

async function run() {
    try {
        const result = await model.generateContent(req);
        console.log("SUCCESS");
    } catch(e) {
        console.error("SDK Error:", e.message);
    }
}
run();
