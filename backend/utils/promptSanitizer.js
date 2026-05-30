/**
 * Prompt Injection Sanitizer — SEC-002 (FIX-10)
 * 
 * Detects and filters known prompt injection patterns in user-controlled text
 * fields (brand descriptions, creative briefs, content prompts) before they
 * are interpolated into AI system prompts.
 * 
 * Defense layers:
 * 1. Pattern detection — flags known jailbreak/extraction phrases
 * 2. Sanitization — replaces detected patterns with [FILTERED]
 * 3. Logging — records injection attempts for security monitoring
 * 
 * This is NOT a silver bullet — prompt injection is fundamentally unsolvable
 * with regex alone. This catches the low-hanging fruit (script kiddies, 
 * automated tools). The real defense is system prompt architecture 
 * (never trust user content, always wrap in delimiters).
 */

// Known prompt injection patterns — ordered by severity
const INJECTION_PATTERNS = [
    // Direct instruction override
    /ignore\s+(all\s+)?(previous|above|prior|earlier|preceding)\s+(instructions|prompts|rules|guidelines|context)/i,
    /disregard\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions|prompts|rules)/i,
    /forget\s+(all\s+)?(previous|above|prior|earlier)\s+(instructions|prompts|rules)/i,
    /override\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i,

    // System prompt extraction
    /output\s+(the\s+)?(entire\s+)?(system|original|full|complete)\s+prompt/i,
    /reveal\s+(your|the)\s+(instructions|system\s+prompt|rules|guidelines)/i,
    /what\s+(are|were)\s+your\s+(instructions|system\s+prompt|rules|initial\s+prompt)/i,
    /show\s+(me\s+)?(your|the)\s+(system|original)\s+prompt/i,
    /repeat\s+(the\s+)?(text|instructions|prompt)\s+(above|before)/i,
    /print\s+(the\s+)?(system|initial)\s+(prompt|instructions|message)/i,

    // Role hijacking
    /you\s+are\s+now\s+(a|an|the)\s/i,
    /act\s+as\s+(a\s+different|another|an?\s)/i,
    /pretend\s+(you\s+are|to\s+be)\s/i,
    /roleplay\s+as\s/i,
    /switch\s+to\s+(a\s+)?(new|different)\s+(role|persona|character)/i,

    // Known jailbreak names
    /\bDAN\b(?:\s+mode)?/,
    /\bjailbreak\b/i,
    /\bdevmode\b/i,
    /\bdev\s+mode\b/i,
    /\bdeveloper\s+mode\b/i,
    /\bunlocked\s+mode\b/i,

    // Delimiter attacks
    /\[SYSTEM\]/i,
    /\[\/INST\]/i,
    /<\|im_start\|>/i,
    /<<SYS>>/i,
    /\[INST\]/i,
    /###\s*(System|Human|Assistant)\s*:/i,
];

/**
 * Detect if text contains prompt injection patterns.
 * @param {string} text - The user-provided text to check
 * @returns {{ detected: boolean, patterns: string[] }} - Detection result
 */
export function detectInjection(text) {
    if (!text || typeof text !== 'string') return { detected: false, patterns: [] };
    
    const matched = [];
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(text)) {
            matched.push(pattern.source.substring(0, 50)); // Log pattern, not full user input
        }
    }
    
    return { detected: matched.length > 0, patterns: matched };
}

/**
 * Sanitize text by replacing detected injection patterns with [FILTERED].
 * @param {string} text - The user-provided text to sanitize
 * @returns {string} - Sanitized text
 */
export function sanitizePromptInput(text) {
    if (!text || typeof text !== 'string') return text;
    
    let sanitized = text;
    for (const pattern of INJECTION_PATTERNS) {
        sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes('g') ? '' : 'g')), '[FILTERED]');
    }
    return sanitized;
}

/**
 * Deep-sanitize an object's string values recursively.
 * Used to sanitize brand DNA objects, knowledge entries, etc.
 * @param {*} obj - Object to sanitize
 * @param {number} depth - Current recursion depth (max 5)
 * @returns {*} - Sanitized copy
 */
export function deepSanitize(obj, depth = 0) {
    if (depth > 5) return obj;
    if (typeof obj === 'string') return sanitizePromptInput(obj);
    if (Array.isArray(obj)) return obj.map(item => deepSanitize(item, depth + 1));
    if (obj && typeof obj === 'object') {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = deepSanitize(value, depth + 1);
        }
        return result;
    }
    return obj;
}

/**
 * Express middleware: Check request body fields for prompt injection.
 * Logs attempts but does NOT block — just sanitizes the input.
 * This is a defense-in-depth measure, not a hard block.
 * 
 * @param {string[]} fields - Body fields to check (e.g., ['prompt', 'brief', 'description'])
 */
export function checkPromptInjection(fields = ['prompt', 'brief', 'description', 'content', 'text']) {
    return (req, res, next) => {
        if (!req.body) return next();
        
        let injectionDetected = false;
        for (const field of fields) {
            const value = req.body[field];
            if (value && typeof value === 'string') {
                const result = detectInjection(value);
                if (result.detected) {
                    injectionDetected = true;
                    console.warn(`🚨 [SEC-002] Prompt injection detected in field "${field}" from user ${req.user?._id || 'unknown'}: [${result.patterns.join(', ')}]`);
                    req.body[field] = sanitizePromptInput(value);
                }
            }
        }
        
        if (injectionDetected) {
            // Flag the request for downstream logging
            req.promptInjectionDetected = true;
        }
        
        next();
    };
}

export default { detectInjection, sanitizePromptInput, deepSanitize, checkPromptInjection };
