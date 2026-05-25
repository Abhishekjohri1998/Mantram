import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import { openaiImageGenerate } from '../backend/routes/creatives.js';

async function runTests() {
    console.log("=== Running OpenAI Image Mapping Tests ===");

    // Test 1: gpt-image-2 generation
    try {
        console.log("\n--- Test 1: Testing gpt-image-2 ---");
        const res = await openaiImageGenerate(
            "A futuristic smart watch on a white table",
            "1:1",
            "high",
            "gpt-image-2"
        );
        console.log("Test 1 SUCCESS! Result URL length:", res?.imageUrl?.length);
        console.log("Model returned:", res?.model);
    } catch (e) {
        console.error("Test 1 FAILED:", e.message);
    }

    // Test 2: dall-e-3 block test
    try {
        console.log("\n--- Test 2: Testing dall-e-3 block ---");
        await openaiImageGenerate(
            "A futuristic smart watch on a white table",
            "1:1",
            "high",
            "dall-e-3"
        );
        console.error("Test 2 FAILED: dall-e-3 request should have been blocked!");
    } catch (e) {
        console.log("Test 2 SUCCESS! Expected error received:", e.message);
    }
}

runTests();
