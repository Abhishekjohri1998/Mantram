/**
 * Safe Error Response Utility
 * Returns a generic error message in production and the actual error in development.
 * Prevents leaking internal error details (DB schema, file paths, stack traces) to API consumers.
 */
const nodeEnv = process.env.NODE_ENV || 'development';

export function safeErrorMessage(error, fallback = 'Internal server error') {
    // ALWAYS allow provider-categorized errors to pass through (disclaimers)
    if (error?.isProviderError || error?.provider) {
        return error.message;
    }

    if (nodeEnv === 'development') {
        return error?.message || fallback;
    }
    return fallback;
}
