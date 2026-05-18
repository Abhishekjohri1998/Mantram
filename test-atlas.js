import { submitAtlasCloudVideoGeneration } from './backend/agents/videoStudio/atlasClient.js';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function run() {
    try {
        const result = await submitAtlasCloudVideoGeneration({
            prompt: "Motion graphics animation, vibrant logo",
            imageUrl: "https://via.placeholder.com/1024x1024.png",
            duration: 5,
            aspectRatio: "16:9",
            imageRole: "product",
            qualityMode: "fast"
        });
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
