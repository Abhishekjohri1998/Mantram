import { getAIRouter } from '../ai/router.js';
import dotenv from 'dotenv';
dotenv.config();

/**
 * Verification script for AI fallback logic.
 * Tests if the router correctly strips the 'model' parameter when falling back.
 */
async function runTest() {
    console.log('🧪 Starting AI Fallback Verification...');
    const router = getAIRouter();

    // 1. Test Image Fallback
    console.log('\n📸 Testing Image Fallback (Gemini -> OpenAI)...');
    try {
        // We pass a model ID that Gemini might fail on, or just rely on the fact that if it fails,
        // it should NOT pass this ID to OpenAI.
        // For testing, we can simulate an error by temporarily breaking the Gemini provider
        const gemini = router.providers.gemini;
        const originalGen = gemini.generateImage;
        
        // Mock Gemini failure
        gemini.generateImage = async () => { throw new Error('Simulated Gemini Failure'); };

        const result = await router.generateImage({
            prompt: 'A futuristic city with flying cars',
            model: 'gemini-3.1-flash-image' // This is the ID we want to see stripped
        });

        console.log('✅ Fallback succeeded!');
        console.log('✅ Used Provider:', result.provider);
        console.log('✅ Used Model:', result.model);
        
        if (result.provider === 'openai' && result.model !== 'gemini-3.1-flash-image') {
            console.log('🎉 SUCCESS: Model ID was correctly stripped for fallback.');
        } else {
            console.log('❌ FAILURE: Model ID was NOT stripped or fallback failed to use correct provider.');
        }

        // Restore
        gemini.generateImage = originalGen;
    } catch (err) {
        console.error('❌ Test failed unexpectedly:', err.message);
    }

    // 2. Test Text Fallback
    console.log('\n💬 Testing Text Fallback (Gemini -> OpenAI)...');
    try {
        const gemini = router.providers.gemini;
        const originalGen = gemini.generateText;
        
        gemini.generateText = async () => { throw new Error('Simulated Gemini Failure'); };

        const result = await router.generateText({
            userPrompt: 'Tell me a joke',
            systemPrompt: 'Be funny',
            model: 'gemini-2.5-flash'
        });

        console.log('✅ Fallback succeeded!');
        console.log('✅ Used Provider:', result.provider);
        console.log('✅ Used Model:', result.model);
        
        if (result.provider === 'openai' && result.model !== 'gemini-2.5-flash') {
            console.log('🎉 SUCCESS: Model ID was correctly stripped for fallback.');
        } else {
            console.log('❌ FAILURE: Model ID was NOT stripped or fallback failed to use correct provider.');
        }

        gemini.generateText = originalGen;
    } catch (err) {
        console.error('❌ Test failed unexpectedly:', err.message);
    }
}

runTest().catch(console.error);
