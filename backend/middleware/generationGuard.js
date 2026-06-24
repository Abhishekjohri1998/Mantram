/**
 * Generation Rate Limiter & Concurrency Guard — SEC-002 (FIX-18, FIX-19)
 * 
 * Two separate middleware functions:
 * 
 * 1. generationRateLimiter — Per-user rate limit on generation endpoints.
 *    Prevents a single user from flooding the AI pipeline with requests,
 *    which would drain provider API budgets and starve other users.
 * 
 * 2. requireConcurrencySlot — Per-user concurrent job limit.
 *    Prevents a user from filling the entire Bull queue, denying service
 *    to other users waiting for their generations.
 * 
 * Usage:
 *   import { generationRateLimiter, requireConcurrencySlot } from '../middleware/generationGuard.js';
 *   router.post('/generate', protect, generationRateLimiter, requireCredits('content'), handler);
 *   router.post('/jobs', protect, requireConcurrencySlot, requireCredits('creative'), handler);
 */

import rateLimit from 'express-rate-limit';

// ── FIX-18: Per-User Generation Rate Limiter ────────────────────────────────
// Limits generation API calls per user to prevent provider cost explosion.
// Key by user._id (not IP) — one user on a shared IP shouldn't block others.
export const generationRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1-minute window
    max: 15,              // max 15 generation requests per minute per user
    keyGenerator: (req) => {
        // Key by authenticated user ID, fall back to IP for unauthenticated
        return req.user?._id?.toString() || req.ip;
    },
    handler: (req, res) => {
        console.warn(`🚫 [SEC-002] Generation rate limit hit: user=${req.user?._id}, IP=${req.ip}`);
        return res.status(429).json({
            success: false,
            error: 'Too many generation requests. Please wait a moment before trying again.',
            retryAfterMs: 60000,
        });
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Skip rate limiting for superadmins
    skip: (req) => req.user?.role === 'superadmin',
    validate: { keyGenerator: false },
});

// ── FIX-19: Per-User Concurrent Job Limit ───────────────────────────────────
// Prevents a single user from monopolizing all Bull queue worker slots.
// Plan-based limits ensure fair resource allocation.

const CONCURRENT_LIMITS = {
    enterprise: 25,
    professional: 10,
    creator: 5,
    starter: 3,
    free: 3,
};

/**
 * Middleware factory: Check concurrent active jobs before allowing a new one.
 * @param {string} [jobModel='GenerationJob'] - Mongoose model name for jobs
 */
export function requireConcurrencySlot(jobModel = 'GenerationJob') {
    return async (req, res, next) => {
        try {
            // Superadmins bypass concurrency limits
            if (req.user?.role === 'superadmin') return next();

            const mongoose = (await import('mongoose')).default;
            const JobModel = mongoose.model(jobModel);
            
            const activeJobs = await JobModel.countDocuments({
                user: req.user._id,
                status: { $in: ['pending', 'processing', 'queued'] },
            });

            const plan = req.user?.plan || 'free';
            const limit = CONCURRENT_LIMITS[plan] || CONCURRENT_LIMITS.free;

            if (activeJobs >= limit) {
                console.warn(`🚫 [SEC-002] Concurrent job limit hit: user=${req.user._id}, active=${activeJobs}, limit=${limit}, plan=${plan}`);
                return res.status(429).json({
                    success: false,
                    error: `You have ${activeJobs} jobs in progress. Please wait for some to complete before starting new ones.`,
                    activeJobs,
                    limit,
                    plan,
                });
            }

            next();
        } catch (error) {
            console.error('Concurrency check error:', error);
            // Don't block the request on error — fail open for UX
            next();
        }
    };
}

export default { generationRateLimiter, requireConcurrencySlot };
