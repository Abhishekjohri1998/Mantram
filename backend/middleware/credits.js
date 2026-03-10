/**
 * Credit Middleware — checks and deducts credits for AI operations
 * 
 * Usage: router.post('/generate', protect, requireCredits('content'), handler)
 * 
 * Credit costs are loaded from SystemSettings (managed by super admin).
 * Falls back to defaults if DB settings not found.
 */

import User from '../models/User.js';
import SystemSettings from '../models/SystemSettings.js';
import CreditUsage from '../models/CreditUsage.js';

// Human-readable labels for actions
const ACTION_LABELS = {
    content: 'Content Generation', contentRefine: 'Content Refine/Regen',
    creative: 'Creative Image', photoshoot: 'AI Photoshoot',
    seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic Analysis',
    seoCompetitors: 'SEO Competitors', seoAiVisibility: 'SEO AI Visibility',
    seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit',
    seoCompetitorDiscover: 'SEO Discover Competitors',
    brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine',
    brainstormChat: 'Brainstorm Chat', brainstormScreenplay: 'Screenplay Generation',
    trendRefresh: 'Trend Refresh',
    videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generation', videoEdit: 'Video Edit',
};

// Default credit costs (used when SystemSettings has no override)
const DEFAULT_CREDIT_COSTS = {
    content: 3,
    contentRefine: 2,
    creative: 5,
    photoshoot: 8,
    seoHealthCheck: 3,
    seoTraffic: 3,
    seoCompetitors: 3,
    seoAiVisibility: 3,
    seoAsk: 1,
    seoAuditPage: 1,
    seoCompetitorDiscover: 1,
    brainstorm: 4,
    brainstormRefine: 2,
    brainstormChat: 2,
    brainstormScreenplay: 5,
    trendRefresh: 1,
    videoBrainstorm: 2,
    videoGenerate: 15,
    videoEdit: 5,
};

// Cache for credit costs (refresh every 5 minutes)
let cachedCosts = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get credit costs — reads from SystemSettings with DB caching
 */
export const getCreditCosts = async () => {
    const now = Date.now();
    if (cachedCosts && (now - cacheTimestamp) < CACHE_TTL) return cachedCosts;

    try {
        const settings = await SystemSettings.findOne({ key: 'creditCosts' });
        if (settings?.value) {
            cachedCosts = { ...DEFAULT_CREDIT_COSTS, ...settings.value };
            cacheTimestamp = now;
            return cachedCosts;
        }
    } catch (e) {
        console.warn('Could not load credit costs from DB:', e.message);
    }

    cachedCosts = { ...DEFAULT_CREDIT_COSTS };
    cacheTimestamp = now;
    return cachedCosts;
};

/**
 * Invalidate cache (called when super admin updates costs)
 */
export const invalidateCreditCostCache = () => {
    cachedCosts = null;
    cacheTimestamp = 0;
};

/**
 * Middleware: check if user has enough credits, deduct on pass
 * @param {string|number} actionOrCost - action name (e.g. 'content') or fixed cost number
 */
export const requireCredits = (actionOrCost = 1) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            // Superadmin & enterprise bypass credit checks
            if (user.role === 'superadmin' || user.plan === 'enterprise') {
                return next();
            }

            // Resolve cost
            let cost;
            const actionName = typeof actionOrCost === 'string' ? actionOrCost : null;
            if (typeof actionOrCost === 'number') {
                cost = actionOrCost;
            } else {
                const costs = await getCreditCosts();
                cost = costs[actionOrCost] || 1;
            }

            const remaining = (user.credits?.total || 0) + (user.credits?.bonus || 0) - (user.credits?.used || 0);

            if (remaining < cost) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient credits',
                    creditsRequired: cost,
                    creditsRemaining: Math.max(0, remaining),
                    upgradeRequired: true,
                });
            }

            // Deduct credits immediately
            const updated = await User.findByIdAndUpdate(user._id, {
                $inc: { 'credits.used': cost },
            }, { new: true });

            // Log usage (fire-and-forget)
            const balanceAfter = (updated.credits?.total || 0) + (updated.credits?.bonus || 0) - (updated.credits?.used || 0);
            CreditUsage.create({
                user: user._id,
                action: actionName || 'unknown',
                cost,
                balanceAfter: Math.max(0, balanceAfter),
                description: ACTION_LABELS[actionName] || actionName || 'AI Operation',
                metadata: {
                    route: req.originalUrl,
                    brandId: req.body?.brandId || req.params?.brandId,
                    brandName: req.body?.brandName,
                },
            }).catch(err => console.warn('Credit usage log failed:', err.message));

            // Attach info for downstream use
            req.creditsDeducted = cost;

            next();
        } catch (error) {
            console.error('Credit check error:', error);
            return res.status(500).json({ success: false, error: 'Credit system error. Please try again.' });
        }
    };
};

/**
 * Get user's credit balance
 */
export const getCreditBalance = (user) => {
    if (user.role === 'superadmin' || user.plan === 'enterprise') {
        return { total: Infinity, used: 0, remaining: Infinity, unlimited: true };
    }
    const total = (user.credits?.total || 50) + (user.credits?.bonus || 0);
    const used = user.credits?.used || 0;
    return { total, used, remaining: Math.max(0, total - used), unlimited: false };
};

// Export defaults for reference
export const CREDIT_COSTS = DEFAULT_CREDIT_COSTS;
