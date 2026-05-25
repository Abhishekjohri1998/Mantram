import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import { generateStoryboardPoster } from '../backend/agents/videoStudio/storyboardFrames.js';

async function test() {
    console.log("Starting NanoBanana credentials error test...");
    // Force invalid credentials path
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/non-existent-path/key.json";
    
    try {
        await generateStoryboardPoster(
            "Create a premium 2x2 storyboard poster",
            "hyperrealistic",
            "16:9",
            [],
            null,
            "nanobanana"
        );
        console.log("❌ FAILED: Expected generateStoryboardPoster to throw an error, but it returned.");
    } catch (e) {
        console.log("✅ SUCCESS: Caught expected error:", e.message);
    }
}
test();
