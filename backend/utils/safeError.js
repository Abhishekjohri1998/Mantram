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
    
    // Preserve explicitly user-facing errors
    if (error.isUserFacing || error.isOperational) {
        return error.message || String(error);
    }

    // Cast to string safely to avoid crashes
    const msg = String(error.message || error || '');
    const lowerMsg = msg.toLowerCase();

    // 1. System Provider Billing / Exhaustion (Developer/API issues, NOT user credits)
    if (
        lowerMsg.includes('muapi balance') ||
        lowerMsg.includes('provider billing') ||
        lowerMsg.includes('all video providers exhausted') ||
        lowerMsg.includes('providers exhausted') ||
        lowerMsg.includes('laozhang unconfigured') ||
        lowerMsg.includes('atlas cloud unconfigured') ||
        (lowerMsg.includes('out of credits') && (lowerMsg.includes('muapi') || lowerMsg.includes('atlas') || lowerMsg.includes('laozhang') || lowerMsg.includes('kie')))
    ) {
        return 'Video generation service is temporarily offline due to provider service limits. Our team has been notified. Please try again later.';
    }

    // 2. Billing / Credits (User-facing)
    if (
        lowerMsg.includes('credit') || 
        lowerMsg.includes('billing') || 
        lowerMsg.includes('payment') || 
        lowerMsg.includes('insufficient')
    ) {
        // If it specifies the required/have numbers, preserve it
        if (msg.includes('Need') && msg.includes('have')) {
            return msg;
        }
        return 'Insufficient credits — please top up your account.';
    }

    // 3. Safety / Content Policy
    if (
        lowerMsg.includes('safety') || 
        lowerMsg.includes('content policy') || 
        lowerMsg.includes('violation') || 
        lowerMsg.includes('blocked') || 
        lowerMsg.includes('inappropriate') ||
        lowerMsg.includes('harmful') ||
        lowerMsg.includes('moderation') ||
        lowerMsg.includes('safety block')
    ) {
        return 'Content safety violation — please refine your prompt or reference images.';
    }

    // 4. User cancel
    if (lowerMsg.includes('cancelled by user') || lowerMsg.includes('cancel')) {
        return 'Job cancelled.';
    }

    // 5. Rate limits
    if (
        lowerMsg.includes('429') ||
        lowerMsg.includes('rate limit') ||
        lowerMsg.includes('too many requests')
    ) {
        return 'Too many requests. Please wait a moment and try again.';
    }

    // 6. Network / Timeout
    if (
        lowerMsg.includes('timeout') ||
        lowerMsg.includes('timed out') ||
        lowerMsg.includes('etimedout') ||
        lowerMsg.includes('gateway') ||
        lowerMsg.includes('504')
    ) {
        return 'AI generation request timed out. The provider servers are currently overloaded. Please try again.';
    }

    // 7. AI provider temporarily overloaded (503 / high demand)
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

    // 8. Media Format / File Upload Issues
    if (
        lowerMsg.includes('format') ||
        lowerMsg.includes('file type') ||
        lowerMsg.includes('supported') ||
        lowerMsg.includes('mime')
    ) {
        return 'Unsupported media format. Please upload JPG, PNG, or MP4 files.';
    }

    // 9. Internal Database / Code Syntax Stack Errors (Hide Stack details, return clean internal error)
    if (
        lowerMsg.includes('referenceerror') ||
        lowerMsg.includes('typeerror') ||
        lowerMsg.includes('syntaxerror') ||
        lowerMsg.includes('database error') ||
        lowerMsg.includes('mongodb') ||
        lowerMsg.includes('mongoose') ||
        lowerMsg.includes('connection refused')
    ) {
        return 'An internal server error occurred while processing your request. Please try again.';
    }

    // 10. Default: fetch failures, timeouts, connection issues, API provider failures,
    // and raw internal server errors are formatted as "AI models are currently busy"
    return 'AI models are currently busy — please try again';
}

export function safeErrorMessage(error, fallback = 'AI models are currently busy — please try again') {
    // Log real error for server developers to debug
    if (error) {
        console.error('⚠️ [safeErrorMessage] Raw technical error:', error.message || error);
    }
    
    // In development mode (but not during unit tests), return the real error message so developers can debug.
    if (nodeEnv === 'development' && process.env.NODE_ENV !== 'test') {
        const rawMsg = error ? (error.message || String(error)) : String(fallback);
        return `[Dev Error] ${rawMsg}`;
    }
    
    return getFriendlyErrorMessage(error || fallback);
}

