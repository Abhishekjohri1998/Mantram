/**
 * Safe Error Response Utility
 * In production: passes through user-facing API errors (model busy, prompt violations,
 * content policy, rate limits, config errors) but hides internal DB/path/stack details.
 * In development: always returns the real error message.
 */
const nodeEnv = process.env.NODE_ENV || 'development';

// Patterns that indicate an API/provider error the user should see
const USER_FACING_PATTERNS = [
    'busy', 'overloaded', 'high demand', 'rate limit', 'rate_limit',
    'quota', 'exceeded', 'too long', 'too large', 'content policy',
    'safety', 'blocked', 'violation', 'harmful', 'inappropriate',
    'not configured', 'api key', 'api_key', 'invalid key',
    'model not found', 'model not available', 'no longer available',
    'failed to generate', 'generation failed', 'all models failed',
    'all models unavailable', 'timeout', 'timed out', 'connection refused',
    'image generation failed', 'fal.ai', 'piapi', 'laozhang',
    'prompt', 'token limit', 'context length', 'max_tokens',
    'billing', 'payment', 'credits', 'insufficient',
    'aspect ratio', 'invalid format', 'unsupported',
    'try a different', 'switch to', 'currently busy',
    'no image', 'returned no image',
];

export function safeErrorMessage(error, fallback = 'Internal server error') {
<<<<<<< Updated upstream
    // ALWAYS allow provider-categorized errors to pass through (disclaimers)
    if (error?.isProviderError || error?.provider) {
        return error.message;
    }

    const msg = error?.message || '';

    // Always show real error in development
    if (nodeEnv === 'development') {
        return msg || fallback;
    }


=======
    const msg = error?.message || '';

    // Always show real error in development
    if (nodeEnv === 'development') {
        return msg || fallback;
    }

>>>>>>> Stashed changes
    // In production: check if the error is user-facing (API/provider issue)
    const lowerMsg = msg.toLowerCase();
    const isUserFacing = USER_FACING_PATTERNS.some(pattern => lowerMsg.includes(pattern));

    if (isUserFacing) {
        // Strip any file paths or stack-trace-like content but keep the message
        return msg.replace(/file:\/\/[^\s]+/g, '').replace(/at\s+[\w.]+\s+\([^)]+\)/g, '').trim();
    }

    // Truly internal error — hide details
    return fallback;
}

