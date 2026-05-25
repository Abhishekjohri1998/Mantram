import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import { generateStoryboardPoster } from '../backend/agents/videoStudio/storyboardFrames.js';

async function test() {
    console.log("Starting storyboard poster generation test...");
    console.time('Generation Time');
    try {
        const res = await generateStoryboardPoster(
            "Create a premium 2x2 storyboard poster for a smartwatch. Panel 1: The watch is displayed on a charging stand, glowing green. Panel 2: A close-up of the screen showing heart rate data.",
            "hyperrealistic",
            "16:9",
            ["https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&w=300&h=300"], // Public Unsplash watch image
            null,
            "gpt-image-2"
        );
        console.timeEnd('Generation Time');
        console.log("Result received. Length:", res ? res.length : 0);
        if (res) {
            console.log("Success! Data URL returned.");
        } else {
            console.log("Failed: returned null");
        }
    } catch (e) {
        console.error("Test error:", e);
    }
}
test();
