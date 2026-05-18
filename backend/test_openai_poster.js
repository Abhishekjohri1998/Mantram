import { getRouter } from './ai/router.js';
import { geminiImageGenerate } from './agents/videoStudio/firstFrame.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        console.log("Running generator with NanoBanana & reference URL...");
        const result = await geminiImageGenerate(
            "A cinematic test image", 
            [], 
            0.5, 
            {
                aspectRatio: "16:9",
                model: "nanobanana", // it maps nanobanana -> gpt-image-2 for openai provider in our modified logic
                referenceImageUrls: [
                    "https://d138p2zntq2uob.cloudfront.net/d2c/products/1739502621183-sofa.jpg",
                    "https://d138p2zntq2uob.cloudfront.net/d2c/products/1739502621183-sofa.jpg"
                ]
            },
            'openai'
        );
        console.log("SUCCESS URL:", result.imageUrl?.substring(0, 100));
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
