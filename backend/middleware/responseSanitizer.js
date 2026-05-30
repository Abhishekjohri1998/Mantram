/**
 * Response Sanitizer Middleware (SEC-001)
 * 
 * Intercepts res.json() to strip sensitive fields from ALL API responses.
 * Defense-in-depth — catches anything that Mongoose toJSON transforms miss
 * (e.g., .lean() queries, raw objects, new models without transforms).
 * 
 * This runs on EVERY JSON response, so the blacklist is kept small and
 * the recursion is depth-limited for performance.
 */

// Fields that should NEVER appear in any API response — security-critical
const GLOBAL_BLACKLIST = new Set([
    'password',
    'verificationToken',
    'verificationExpires',
    'resetPasswordToken',
    'resetPasswordExpires',
    'accessToken',
    'refreshToken',
    'pageAccessToken',
    'wooConsumerKey',
    'wooConsumerSecret',
    '__v',
]);

/**
 * Recursively strip blacklisted keys from an object.
 * Depth-limited to prevent performance issues on large nested responses.
 */
function deepSanitize(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 8) return obj;

    // Handle arrays
    if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
            if (obj[i] && typeof obj[i] === 'object') {
                deepSanitize(obj[i], depth + 1);
            }
        }
        return obj;
    }

    // Handle plain objects — mutate in-place for performance
    for (const key of Object.keys(obj)) {
        if (GLOBAL_BLACKLIST.has(key)) {
            delete obj[key];
            continue;
        }
        if (obj[key] && typeof obj[key] === 'object') {
            deepSanitize(obj[key], depth + 1);
        }
    }
    return obj;
}

/**
 * Express middleware that wraps res.json() to sanitize all outgoing JSON.
 */
export function responseSanitizer(req, res, next) {
    const originalJson = res.json.bind(res);

    res.json = function (body) {
        if (body && typeof body === 'object') {
            deepSanitize(body);
        }
        return originalJson(body);
    };

    next();
}
