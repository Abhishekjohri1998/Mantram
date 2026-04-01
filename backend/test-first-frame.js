import { geminiImageGenerate } from './agents/videoStudio/firstFrame.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function testFirstFrame() {
  console.log('Testing geminiImageGenerate (with Keep-Alive and 8s AbortSignal)...');
  try {
    const start = Date.now();
    const result = await geminiImageGenerate('A cinematic wide shot of a futuristic city at sunset, highly detailed, photorealistic 8k rtx');
    const elapsed = Date.now() - start;
    console.log(`\n✅ TEST SUCCESS: Image generated in ${elapsed}ms`);
    console.log('Output URL:', result.imageUrl.substring(0, 100) + '...');
  } catch(e) {
    console.error(`\n❌ TEST FAILED:`, e.message);
  }
}

testFirstFrame().then(() => process.exit(0));
