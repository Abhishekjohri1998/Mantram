/**
 * Safe Error Response Utility
 * Returns a generic error message in production and the actual error in development.
 * Prevents leaking internal error details (DB schema, file paths, stack traces) to API consumers.
 */
const nodeEnv = process.env.NODE_ENV || 'development';

export function safeErrorMessage(error, fallback = 'Internal server error') {
    if (nodeEnv === 'development') {
        return error?.message || fallback;
    }
    return fallback;
}
