import rateLimit from 'express-rate-limit';

// REL-016: AI Route Rate Limiter
// Prevents abuse of expensive AI generation endpoints (e.g. video generation, large LLM queries).
// Limits to 10 generation requests per minute per IP.
export const aiGenerationLimiter = process.env.NODE_ENV === 'test'
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10,             // Limit each IP to 10 generation requests per `window`
        standardHeaders: true, 
        legacyHeaders: false, 
        message: { 
            success: false, 
            error: 'Too many generation requests from this IP. Please wait a moment and try again.' 
        },
    });
