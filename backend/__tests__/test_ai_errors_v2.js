import { getRouter } from './ai/router.js';
import { AIProviderBusyError, AIProviderQuotaError } from './ai/errors.js';

async function verifyAIErrorHandling() {
    console.log('🧪 Starting AI Error Handling Verification (v2)');
    const router = getRouter();

    // 1. Manually trigger error categorization
    console.log('\n--- 1. Testing Error Categorization ---');
    try {
        const fakeError = new Error('API Error [429]: Too Many Requests');
        const categorized = router._categorizeError(fakeError, 'text', 'gemini');
        console.log('Categorized type:', categorized.name);
        console.log('User message:', categorized.message);
        
        if (categorized instanceof AIProviderBusyError) {
            console.log('✅ Correctly identified 429 as AIProviderBusyError');
        } else {
            console.error('❌ Failed to identify AIProviderBusyError');
        }
    } catch (e) { console.error('Error in test 1:', e); }

    // 2. Testing Quota categorization
    console.log('\n--- 2. Testing Quota Categorization ---');
    try {
        const fakeError = new Error('Gemini API Error: quota exceeded for this project');
        const categorized = router._categorizeError(fakeError, 'text', 'gemini');
        console.log('Categorized type:', categorized.name);
        
        if (categorized instanceof AIProviderQuotaError) {
            console.log('✅ Correctly identified Quota mismatch');
        } else {
            console.error('❌ Failed to identify AIProviderQuotaError');
        }
    } catch (e) { console.error('Error in test 2:', e); }

    // 3. Testing Busy/Quota message content
    console.log('\n--- 3. Testing Message Content Consistency ---');
    const busy = new AIProviderBusyError('any');
    const expected = "This model is experiencing too many requests right now. Please wait for some time or try after 5-10 mins.";
    if (busy.message === expected) {
        console.log('✅ Busy message matches user request exactly');
    } else {
        console.error('❌ Busy message mismatch!');
        console.log('Got:', busy.message);
    }
}

verifyAIErrorHandling().catch(console.error);
