import { submitVideoGeneration } from './backend/agents/videoStudio/falClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function run() {
    try {
        const result = await submitVideoGeneration({
            prompt: "Motion graphics animation, vibrant logo",
            model: "seedance-2.0",
            duration: 8,
            aspectRatio: "16:9",
            resolution: "1080p",
            qualityMode: "high",
            generateAudio: false,
            imageUrl: "https://via.placeholder.com/1024x1024.png",
            referenceImages: [],
            imageRole: "product"
        });
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
