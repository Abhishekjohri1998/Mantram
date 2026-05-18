import { generateStoryboardPoster } from './agents/videoStudio/storyboardFrames.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    try {
        console.log("Running generator...");
        const url = await generateStoryboardPoster("A cinematic test image", "hyperrealistic", "16:9", [], null, "nanobanana");
        console.log("SUCCESS URL:", url);
    } catch(e) {
        console.error("ERROR:", e);
    }
}
run();
