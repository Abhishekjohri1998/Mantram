/**
 * Credit Middleware — checks and deducts credits for AI operations
 * 
 * Usage: router.post('/generate', protect, requireCredits('content'), handler)
 * 
 * Credit costs are loaded from SystemSettings (managed by super admin).
 * Falls back to defaults if DB settings not found.
 */

import mongoose from 'mongoose';
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
    seoCompetitorDiscover: 'SEO Discover Competitors', seoBacklinks: 'SEO Backlink Intelligence',
    seoWarRoom: 'SEO War Room', seoLlmProbe: 'SEO LLM Probe',
    seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining',
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
    seoBacklinks: 4,
    seoWarRoom: 4,
    seoLlmProbe: 3,
    seoAutoFix: 2,
    seoPromptMining: 3,
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

            // Resolve cost
            let cost;
            const actionName = typeof actionOrCost === 'string' ? actionOrCost : null;
            if (typeof actionOrCost === 'number') {
                cost = actionOrCost;
            } else {
                const costs = await getCreditCosts();
                cost = costs[actionOrCost] || 1;
            }

            // Superadmin & enterprise bypass credit checks BUT NOT logging
            if (user.role === 'superadmin' || user.plan === 'enterprise') {
                // Log usage (fire-and-forget) – don't calculate balanceAfter for bypass users
                CreditUsage.create({
                    user: new mongoose.Types.ObjectId(user._id),
                    action: actionName || 'unknown',
                    cost,
                    balanceAfter: Infinity, // Unlimited users
                    description: ACTION_LABELS[actionName] || actionName || 'AI Operation',
                    metadata: {
                        route: req.originalUrl,
                        brandId: req.body?.brandId || req.params?.brandId,
                        brandName: req.body?.brandName,
                        subscriptionId: user.activeSubscription,
                        bypassed: true
                    },
                }).catch(err => console.warn('Credit usage log (bypass) failed:', err.message));

                req.creditsDeducted = cost;
                return next();
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
            const updateOps = [
                User.findByIdAndUpdate(user._id, { $inc: { 'credits.used': cost } }, { returnDocument: 'after' })
            ];

            // If user has an active subscription, sync deduction there too
            if (user.activeSubscription) {
                const Subscription = (await import('../models/Subscription.js')).default;
                updateOps.push(Subscription.findByIdAndUpdate(user.activeSubscription, { $inc: { 'credits.used': cost } }));
            }

            const [updated] = await Promise.all(updateOps);

            // Log usage (fire-and-forget)
            const balanceAfter = (updated.credits?.total || 0) + (updated.credits?.bonus || 0) - (updated.credits?.used || 0);
            // Detect studio from action name
            const studioMap = { content: 'content', contentRefine: 'content', creative: 'creative', photoshoot: 'creative', brainstorm: 'brainstorm', brainstormRefine: 'brainstorm', brainstormChat: 'brainstorm', brainstormScreenplay: 'brainstorm', trendRefresh: 'brainstorm', videoBrainstorm: 'video', videoGenerate: 'video', videoEdit: 'video' };
            const studio = studioMap[actionName] || (actionName?.startsWith('seo') ? 'seo' : 'unknown');

            CreditUsage.create({
                user: user._id,
                action: actionName || 'unknown',
                cost,
                balanceAfter: Math.max(0, balanceAfter),
                description: ACTION_LABELS[actionName] || actionName || 'AI Operation',
                studio,
                metadata: {
                    route: req.originalUrl,
                    brandId: req.body?.brandId || req.params?.brandId,
                    brandName: req.body?.brandName,
                    subscriptionId: user.activeSubscription,
                },
            }).catch(err => console.warn('Credit usage log failed:', err.message));

            // Store reference for downstream token usage logging
            req.creditAction = actionName;
            req.creditStudio = studio;

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
    if (user.role === 'superadmin' || user.plan === 'enterprise' || (user.credits?.total >= 999999)) {
        return { total: Infinity, used: 0, remaining: Infinity, unlimited: true, bonus: 0, bonusUsed: 0 };
    }
    const bonus = user.credits?.bonus || 0;
    const bonusUsed = user.credits?.bonusUsed || 0;
    const planCredits = user.credits?.total || 50;
    const used = user.credits?.used || 0;
    
    // Total is plan credits + bonus credits
    const total = planCredits + bonus;
    
    return { 
        total, 
        used, 
        remaining: Math.max(0, total - used), 
        unlimited: false,
        bonus,
        bonusUsed
    };
};

// Export defaults for reference
export const CREDIT_COSTS = DEFAULT_CREDIT_COSTS;

// Per-model cost estimates (USD cents per 1K tokens)
const MODEL_COSTS = {
    'gpt-4o-mini': { input: 0.015, output: 0.06 },
    'gpt-4o': { input: 0.25, output: 1.0 },
    'grok-3-mini-fast': { input: 0.03, output: 0.10 },
    'grok-3-mini': { input: 0.03, output: 0.10 },
    'gemini-2.0-flash': { input: 0.01, output: 0.04 },
    'gemini-2.5-flash': { input: 0.01, output: 0.04 },
    'claude-sonnet-4-20250514': { input: 0.3, output: 1.5 },
};

/**
 * Log AI token usage — call this after an AI response to track actual consumption
 * @param {string} userId - User ID
 * @param {Object} tokenData - { inputTokens, outputTokens, model, provider }
 * @param {Object} meta - { action, studio, route, brandId }
 */
export const logTokenUsage = async (userId, tokenData, meta = {}) => {
    if (!userId || !tokenData) return;
    const { inputTokens = 0, outputTokens = 0, model = '', provider = '' } = tokenData;
    const totalTokens = inputTokens + outputTokens;
    const modelCost = MODEL_COSTS[model] || { input: 0.05, output: 0.15 };
    const estimatedCost = Math.round(((inputTokens / 1000) * modelCost.input + (outputTokens / 1000) * modelCost.output) * 100) / 100;

    try {
        // Update the most recent CreditUsage record if it exists
        const updated = await CreditUsage.findOneAndUpdate(
            { user: userId, action: meta.action || 'unknown', 'tokenUsage.inputTokens': 0 },
            { $set: { 'tokenUsage.inputTokens': inputTokens, 'tokenUsage.outputTokens': outputTokens, 'tokenUsage.totalTokens': totalTokens, 'tokenUsage.model': model, 'tokenUsage.provider': provider, 'tokenUsage.estimatedCost': estimatedCost } },
            { sort: { createdAt: -1 } }
        );

        // If no matching unfilled record, create a new token-only log
        if (!updated) {
            await CreditUsage.create({
                user: userId,
                action: meta.action || 'ai_call',
                cost: 0, // no credit deduction, just token tracking
                description: `Token usage: ${model}`,
                studio: meta.studio || 'unknown',
                metadata: { route: meta.route || '', brandId: meta.brandId },
                tokenUsage: { inputTokens, outputTokens, totalTokens, model, provider, estimatedCost },
            });
        }
    } catch (err) {
        console.warn('Token usage log failed:', err.message);
    }
};
