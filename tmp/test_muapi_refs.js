import { submitMuApiVideoGeneration } from '../backend/agents/videoStudio/muapiClient.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock environment
process.env.MUAPI_API_KEY = 'test_key_123';

// Mock fetch to capture payload
global.fetch = async (url, options) => {
    console.log(`\n🚀 MOCK FETCH to: ${url}`);
    const body = JSON.parse(options.body);
    console.log('📦 PAYLOAD:', JSON.stringify(body, null, 2));
    return {
        ok: true,
        json: async () => ({ request_id: 'test_task_123' })
    };
};

async function runTests() {
    console.log('🧪 Starting MuAPI Reference Image Tests...');

    // Test 1: T2V + 1 Reference Image (Should use I2V endpoint and auto-tag @image1)
    console.log('\n--- Test 1: T2V + 1 Reference Image ---');
    await submitMuApiVideoGeneration({
        prompt: 'A cinematic shot of a car', // No tag in original prompt
        imageUrl: null,
        referenceImages: ['https://example.com/ref1.jpg'],
        duration: 5,
    });

    // Test 2: I2V + 2 Reference Images (Should unshift imageUrl as @image1)
    console.log('\n--- Test 2: I2V + 2 Reference Images ---');
    await submitMuApiVideoGeneration({
        prompt: 'Animate this, matching style of @image2 and colors of @image3',
        imageUrl: 'https://example.com/start_frame.jpg', // Should be @image1
        referenceImages: ['https://example.com/style_ref.jpg', 'https://example.com/color_ref.jpg'],
        duration: 5,
    });

    // Test 3: T2V No Images (Should still use T2V endpoint)
    console.log('\n--- Test 3: T2V No Images ---');
    await submitMuApiVideoGeneration({
        prompt: 'A simple text prompt',
        imageUrl: null,
        referenceImages: [],
        duration: 5,
    });

    console.log('\n✅ Tests Completed.');
}

runTests().catch(console.error);
