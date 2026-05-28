/**
 * Input Sanitization Utility — Mantram AI
 * 
 * Prevents XSS and injection attacks by sanitizing user-provided text.
 * Used in auth routes, brand creation, and any endpoint accepting user text.
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} input - Raw user input
 * @returns {string} Sanitized string safe for rendering
 */
export function escapeHtml(input) {
    if (typeof input !== 'string') return input;
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * Strip all HTML tags from input (preserves text content)
 * @param {string} input - Raw user input
 * @returns {string} Plain text without any HTML tags
 */
export function stripHtml(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Sanitize an object's string fields recursively.
 * Only processes keys in the allowList (if provided), otherwise all string fields.
 * @param {Object} obj - Object to sanitize
 * @param {string[]} [allowList] - Optional list of keys to sanitize (if omitted, all string keys are sanitized)
 * @returns {Object} Sanitized copy of the object
 */
export function sanitizeObject(obj, allowList = null) {
    if (!obj || typeof obj !== 'object') return obj;
    const result = { ...obj };
    for (const [key, value] of Object.entries(result)) {
        if (allowList && !allowList.includes(key)) continue;
        if (typeof value === 'string') {
            result[key] = stripHtml(value);
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = sanitizeObject(value, null); // Recurse into nested objects
        }
    }
    return result;
}

/**
 * Express middleware — sanitizes req.body string fields
 * Usage: router.post('/register', sanitizeBody(['name', 'company']), handler)
 * @param {string[]} fields - List of body fields to sanitize
 */
export function sanitizeBody(fields) {
    return (req, res, next) => {
        if (!req.body) return next();
        for (const field of fields) {
            if (typeof req.body[field] === 'string') {
                req.body[field] = stripHtml(req.body[field]);
            }
        }
        next();
    };
}
