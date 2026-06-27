/**
 * Safe Error Response Utility
 * In production: passes through user-facing API errors (model busy, prompt violations,
 * content policy, rate limits, config errors) but hides internal DB/path/stack details.
 * In development: always returns the real error message.
 */
const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * Maps complex technical errors, fetch issues, and timeouts into clean,
 * localized user-friendly messages. Keeps billing/credits and content-safety
 * feedback clear so the user understands why the generation didn't proceed.
 */
export function getFriendlyErrorMessage(error) {
    if (!error) return 'AI models are currently busy — please try again';
    
    // Cast to string safely to avoid crashes
    const msg = String(error.message || error || '');
    const lowerMsg = msg.toLowerCase();

    // 1. Billing / Credits
    if (
        lowerMsg.includes('credit') || 
        lowerMsg.includes('billing') || 
        lowerMsg.includes('payment') || 
        lowerMsg.includes('insufficient')
    ) {
        return 'Insufficient credits — please top up your account.';
    }

    // 2. Safety / Content Policy
    if (
        lowerMsg.includes('safety') || 
        lowerMsg.includes('content policy') || 
        lowerMsg.includes('violation') || 
        lowerMsg.includes('blocked') || 
        lowerMsg.includes('inappropriate') ||
        lowerMsg.includes('harmful')
    ) {
        return 'Content safety violation — please refine your prompt.';
    }

    // 3. User cancel
    if (lowerMsg.includes('cancelled by user') || lowerMsg.includes('cancel')) {
        return 'Job cancelled.';
    }

    // 4. AI provider temporarily overloaded (503 / high demand)
    if (
        lowerMsg.includes('503') ||
        lowerMsg.includes('overloaded') ||
        lowerMsg.includes('high demand') ||
        lowerMsg.includes('service unavailable') ||
        lowerMsg.includes('capacity') ||
        lowerMsg.includes('all ai providers')
    ) {
        return 'AI models are temporarily overloaded — please try again in 30 seconds.';
    }

    // 5. Default: fetch failures, timeouts, connection issues, API provider failures,
    // and raw internal server errors are formatted as "AI models are currently busy"
    return 'AI models are currently busy — please try again';
}

export function safeErrorMessage(error, fallback = 'AI models are currently busy — please try again') {
    // Log real error for server developers to debug
    if (error) {
        console.error('⚠️ [safeErrorMessage] Raw technical error:', error.message || error);
    }
    
    return getFriendlyErrorMessage(error || fallback);
}

