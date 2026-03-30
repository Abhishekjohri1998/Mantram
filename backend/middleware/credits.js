/**
 * Credit Middleware — checks and deducts credits for AI operations
 * 
 * Usage: router.post('/generate', protect, requireCredits('content'), handler)
 * 
 * Credit costs are loaded from SystemSettings (managed by super admin).
 * Falls back to defaults if DB settings not found.
 * 
 * Video credits are DYNAMIC — calculated per request based on model, duration,
 * resolution, and quality mode using: credits = ceil(USD_cost × 34)
 * This ensures ≥50% margin at the ₹5/credit floor price.
 */

import mongoose from 'mongoose';
import User from '../models/User.js';
import SystemSettings, { getSetting, setSetting } from '../models/SystemSettings.js';
import CreditUsage from '../models/CreditUsage.js';
import { estimateCost } from '../agents/videoStudio/falClient.js';

// Human-readable labels for actions
const ACTION_LABELS = {
    content: 'Content Generation', contentRefine: 'Content Refine/Regen',
    creative: 'Creative Image', photoshoot: 'AI Photoshoot',
    seoHealthCheck: 'SEO Health Check', seoTraffic: 'SEO Traffic Analysis',
    seoCompetitors: 'SEO Competitors', seoAiVisibility: 'SEO AI Visibility',
    seoAsk: 'SEO Ask', seoAuditPage: 'SEO Page Audit',
    seoCompetitorDiscover: 'SEO Discover Competitors', seoBacklinks: 'SEO Backlink Intelligence',
    seoWarRoom: 'SEO War Room',    seoLlmProbe: 'SEO LLM Probe',
    seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining',
    seoGenerateFix: 'SEO Content Fix (AI)',
    brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine',
    brainstormChat: 'Brainstorm Chat', brainstormScreenplay: 'Screenplay Generation',
    trendRefresh: 'Trend Refresh',
    videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generation', videoEdit: 'Video Edit',
    socialMedia: 'Social Media Strategy', socialMediaCalendar: 'Social Calendar', socialMediaAudit: 'Social Account Audit',
    socialMediaCompetitor: 'Social Competitor Analysis', socialMediaScore: 'Social Profile Score',
    canvasGenerate: 'Canvas AI Generate', canvasBgRemove: 'Canvas BG Remove', canvasExtend: 'Canvas Extend/Fill',
    fidatoCanvas: 'Fidato Canvas (AI Director)', fidatoCanvasClaude: 'Fidato Canvas (Claude Premium)',
    adCreative: 'Ad Creative Image', voiceClone: 'Voice Clone', voiceTranscribe: 'Voice Transcribe',
    promptEnhance: 'AI Prompt Enhancement', imageEnhance: 'AI Image Enhancement',
};

// Provider credit multipliers — Claude is premium (higher API cost to us)
// Users choosing Claude explicitly will be charged more credits
export const PROVIDER_MULTIPLIERS = {
    gemini: 1.0,      // Base cost — cheapest
    openai: 1.0,      // Same tier as Gemini for credit purposes
    grok: 1.0,        // Same tier
    sarvam: 1.0,      // Regional — same tier
    anthropic: 2.0,   // Premium — Claude is ~10-30x more expensive per token
};

// Default credit costs (used when SystemSettings has no override)
const DEFAULT_CREDIT_COSTS = {
    content: 3,
    contentRefine: 2,
    creative: 5,
    photoshoot: 10,               // ↑ from 8 (multi-image + AI calls)
    seoHealthCheck: 5,             // ↑ from 3 (crawls 600+ pages, heavy)
    seoTraffic: 3,
    seoCompetitors: 3,
    seoAiVisibility: 3,
    seoAsk: 1,
    seoAuditPage: 1,
    seoCompetitorDiscover: 1,
    seoBacklinks: 5,               // ↑ from 4 (heavy analysis)
    seoWarRoom: 5,                 // ↑ from 4 (heavy analysis)
    seoLlmProbe: 3,
    seoAutoFix: 2,
    seoPromptMining: 3,
    seoGenerateFix: 1,
    brainstorm: 3,                 // ↓ from 4 (1 text call — lower cost)
    brainstormRefine: 1,           // ↓ from 2 (lightweight)
    brainstormChat: 1,             // ↓ from 2 (single short response)
    brainstormScreenplay: 5,
    trendRefresh: 1,
    videoBrainstorm: 2,
    videoGenerate: 'dynamic',      // DYNAMIC — calculated per request
    videoEdit: 20,                 // ↑ from 10 (re-renders video via PiAPI)
    socialMedia: 3,
    socialMediaCalendar: 3,
    socialMediaAudit: 4,
    socialMediaCompetitor: 4,
    socialMediaScore: 2,
    canvasGenerate: 3,             // ↑ from 2 (same image model cost)
    canvasBgRemove: 2,
    canvasExtend: 3,               // ↑ from 2
    fidatoCanvas: 2,               // Fidato Canvas AI Director (Gemini fallback)
    fidatoCanvasClaude: 4,         // Fidato Canvas with Claude tool-use (premium)
    adCreative: 5,
    voiceClone: 5,                 // ↑ from 3 (Minimax cost + storage)
    voiceTranscribe: 1,
    promptEnhance: 1,
    imageEnhance: 2,
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
                const rawCost = costs[actionOrCost];

                // Dynamic video credits — calculated per request
                if (rawCost === 'dynamic' && actionOrCost === 'videoGenerate') {
                    const { model = 'kling-3.0', duration = 5,
                            resolution = '1080p', qualityMode = 'fast' } = req.body;
                    const estimate = estimateCost(model, duration, resolution, qualityMode);
                    // ceil(USD × 70) ensures ~75% margin at ₹5/credit floor
                    cost = Math.max(Math.ceil(estimate.usd * 70), 5);
                    console.log(`🎬 Dynamic video credits: ${model} ${duration}s ${resolution} ${qualityMode} → $${estimate.usd} → ${cost} credits`);
                } else {
                    cost = (typeof rawCost === 'number' ? rawCost : null) || 1;
                }
            }

            // Provider-based credit multiplier — Claude usage costs more
            const requestedProvider = (req.body?.provider || req.body?.model || '').toLowerCase();
            let providerMultiplier = 1.0;
            if (requestedProvider.includes('anthropic') || requestedProvider.includes('claude')) {
                providerMultiplier = PROVIDER_MULTIPLIERS.anthropic || 2.0;
                cost = Math.ceil(cost * providerMultiplier);
                console.log(`💎 Claude premium: ${actionName} cost multiplied by ${providerMultiplier}x → ${cost} credits`);
            }
            req.providerMultiplier = providerMultiplier;

            // Bypass credit checks for Superadmins and Enterprise early
            const isSuperAdmin = user.role === 'superadmin' || user.role === 'admin' || user.plan === 'enterprise';
            if (isSuperAdmin) {
                console.log(`🛡️ [CREDITS] ${user.email} (Role: ${user.role}, Plan: ${user.plan}) is bypassing credits for "${actionName}" (Cost: ${cost})`);
                CreditUsage.create({
                    user: new mongoose.Types.ObjectId(user._id),
                    action: actionName || 'unknown',
                    cost,
                    balanceAfter: Infinity,
                    description: (ACTION_LABELS[actionName] || actionName || 'AI Operation') + ' (Admin Bypass)',
                    metadata: {
                        route: req.originalUrl,
                        brandId: req.body?.brandId || req.params?.brandId,
                        subscriptionId: user.activeSubscription,
                        bypassed: true
                    },
                }).catch(err => console.warn('Credit usage log (bypass) failed:', err.message));

                req.creditsDeducted = cost;
                return next();
            }

            // Include topUp credits if not expired
            const topUp = (user.credits?.topUp > 0 && user.credits?.topUpExpiry && new Date(user.credits.topUpExpiry) > new Date())
                ? user.credits.topUp : 0;
            const remaining = (user.credits?.total || 0) + (user.credits?.bonus || 0) + topUp - (user.credits?.used || 0);

            if (remaining < cost) {
                console.warn(`❌ [CREDITS] ${user.email} (Remaining: ${remaining}) has insufficient credits for "${actionName}" (Cost: ${cost} | Mult: ${providerMultiplier}x)`);
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
            const updTopUp = (updated.credits?.topUp > 0 && updated.credits?.topUpExpiry && new Date(updated.credits.topUpExpiry) > new Date()) ? updated.credits.topUp : 0;
            const balanceAfter = (updated.credits?.total || 0) + (updated.credits?.bonus || 0) + updTopUp - (updated.credits?.used || 0);
            // Detect studio from action name
            const studioMap = { content: 'content', contentRefine: 'content', creative: 'creative', photoshoot: 'creative', brainstorm: 'brainstorm', brainstormRefine: 'brainstorm', brainstormChat: 'brainstorm', brainstormScreenplay: 'brainstorm', trendRefresh: 'brainstorm', videoBrainstorm: 'video', videoGenerate: 'video', videoEdit: 'video', socialMedia: 'social', socialMediaCalendar: 'social', socialMediaAudit: 'social', socialMediaCompetitor: 'social', socialMediaScore: 'social', canvasGenerate: 'creative', canvasBgRemove: 'creative', canvasExtend: 'creative', fidatoCanvas: 'creative', fidatoCanvasClaude: 'creative', adCreative: 'performance', voiceClone: 'voice', voiceTranscribe: 'voice', promptEnhance: 'creative', imageEnhance: 'video' };
            const studio = studioMap[actionName] || (actionName?.startsWith('seo') ? 'seo' : 'unknown');

            CreditUsage.create({
                user: user._id,
                action: actionName || 'unknown',
                cost,
                balanceAfter: Math.max(0, balanceAfter),
                description: (ACTION_LABELS[actionName] || actionName || 'AI Operation') + (providerMultiplier > 1 ? ` (Claude Premium ${providerMultiplier}x)` : ''),
                studio,
                metadata: {
                    route: req.originalUrl,
                    brandId: req.body?.brandId || req.params?.brandId,
                    brandName: req.body?.brandName,
                    subscriptionId: user.activeSubscription,
                    provider: requestedProvider || undefined,
                    providerMultiplier: providerMultiplier > 1 ? providerMultiplier : undefined,
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
 * Deduct credits manually — for use inside handlers where credit deduction 
 * depends on logic (e.g. only deduct if AI call succeeds)
 */
export const deductCredits = async (userId, actionOrCost, amount = 1, brandId = null) => {
    if (!userId) return;
    try {
        const user = await User.findById(userId);
        if (!user) return;

        // Bypass for superadmin
        if (user.role === 'superadmin' || user.plan === 'enterprise') {
            console.log(`🛡️ Superadmin bypass: Deducting 0 credits for ${actionOrCost}`);
            return user;
        }

        let cost = typeof actionOrCost === 'number' ? actionOrCost : amount;
        if (typeof actionOrCost === 'string') {
            const costs = await getCreditCosts();
            cost = costs[actionOrCost] || amount;
        }

        const updateOps = [
            User.findByIdAndUpdate(userId, { $inc: { 'credits.used': cost } }, { returnDocument: 'after' })
        ];

        // If user has an active subscription, sync deduction there too
        if (user.activeSubscription) {
            const Subscription = (await import('../models/Subscription.js')).default;
            updateOps.push(Subscription.findByIdAndUpdate(user.activeSubscription, { $inc: { 'credits.used': cost } }));
        }

        const [updated] = await Promise.all(updateOps);

        // Log usage
        const updTopUp = (updated.credits?.topUp > 0 && updated.credits?.topUpExpiry && new Date(updated.credits.topUpExpiry) > new Date()) ? updated.credits.topUp : 0;
        const balanceAfter = (updated.credits?.total || 0) + (updated.credits?.bonus || 0) + updTopUp - (updated.credits?.used || 0);

        CreditUsage.create({
            user: userId,
            action: typeof actionOrCost === 'string' ? actionOrCost : 'manual_deduction',
            cost,
            balanceAfter: Math.max(0, balanceAfter),
            description: ACTION_LABELS[actionOrCost] || actionOrCost || 'AI Operation',
            studio: (typeof actionOrCost === 'string' && actionOrCost.startsWith('seo')) ? 'seo' : 'unknown',
            metadata: { brandId },
        }).catch(err => console.warn('Manual credit usage log failed:', err.message));

        console.log(`💰 Manually deducted ${cost} credits from user ${userId} for ${actionOrCost}`);
        return updated;
    } catch (e) {
        console.error('Manual credit deduction failed:', e.message);
    }
};

/**
 * Get user's credit balance
 */
export const getCreditBalance = (user) => {
    // Superadmin and Enterprise plans have unlimited credits
    if (user.role === 'superadmin' || user.plan === 'enterprise' || (user.credits?.total >= 999999)) {
        return { 
            total: Infinity, 
            used: user.credits?.used || 0, 
            remaining: Infinity, 
            unlimited: true, 
            bonus: user.credits?.bonus || 0,
            topUp: user.credits?.topUp || 0,
            plan: user.plan || 'enterprise'
        };
    }

    const total = user.credits?.total || 0;
    const bonus = user.credits?.bonus || 0;
    const used = user.credits?.used || 0;
    // Include topUp only if not expired
    const topUp = (user.credits?.topUp > 0 && user.credits?.topUpExpiry && new Date(user.credits.topUpExpiry) > new Date())
        ? user.credits.topUp : 0;
    const remaining = Math.max(0, (total + bonus + topUp) - used);

    return { 
        total, 
        used, 
        remaining, 
        unlimited: false, 
        bonus,
        topUp,
        topUpExpiry: user.credits?.topUpExpiry || null,
        plan: user.plan || 'starter'
    };
};


// Export defaults for reference
export const CREDIT_COSTS = DEFAULT_CREDIT_COSTS;

// Per-model cost estimates (USD cents per 1K tokens for text; flat USD cents per call for image/video/voice)
const MODEL_COSTS = {
    // ── Text models (per 1K tokens) ──
    'gpt-4o-mini': { input: 0.015, output: 0.06 },
    'gpt-4o': { input: 0.25, output: 1.0 },
    'grok-3-mini-fast': { input: 0.03, output: 0.10 },
    'grok-3-mini': { input: 0.03, output: 0.10 },
    'gemini-1.5-flash-latest': { input: 0.01, output: 0.04 },
    'gemini-1.5-pro-latest': { input: 0.125, output: 0.50 },
    'gemini-2.5-flash': { input: 0.015, output: 0.06 },
    'gemini-2.5-pro': { input: 0.125, output: 0.50 },
    'claude-sonnet-4-20250514': { input: 0.3, output: 1.5 },
    'sarvam-m': { input: 0.02, output: 0.08 },
    // ── Image models (flat cost per image in USD cents) ──
    'gemini-3.1-flash-image-preview': { flatCost: 4.0, type: 'image' },
    'gemini-1.5-flash-latest': { flatCost: 4.0, type: 'image' },
    'gemini-2.5-flash-image': { flatCost: 4.0, type: 'image' },
    'imagen-3.0-generate-001': { flatCost: 4.0, type: 'image' },
    // ── Video models (flat cost per generation in USD cents) ──
    'seedance-1.0': { flatCost: 10.0, type: 'video' },
    'piapi-seedance': { flatCost: 10.0, type: 'video' },
    'laozhang-veo': { flatCost: 5.0, type: 'video' },         // Lao Zhang Veo 3.1
    'laozhang-veo-fast': { flatCost: 3.0, type: 'video' },    // Lao Zhang Veo 3.1 Fast
    'laozhang-seedance': { flatCost: 4.0, type: 'video' },    // Lao Zhang Seedance 2.0
    'laozhang-sora-2': { flatCost: 8.0, type: 'video' },      // Lao Zhang Sora 2
    'piapi-wan': { flatCost: 8.0, type: 'video' },
    'laozhang-nanobanana2': { flatCost: 1.0, type: 'image' }, // Lao Zhang NanoBanana 2
    'laozhang-nanobanana-pro': { flatCost: 3.0, type: 'image' }, // Lao Zhang NanoBanana Pro
    'laozhang-ideogram': { flatCost: 2.0, type: 'image' },    // Lao Zhang Ideogram v3
    'laozhang-flux': { flatCost: 2.0, type: 'image' },        // Lao Zhang Flux Kontext Pro
    'laozhang-seedream': { flatCost: 2.0, type: 'image' },    // Lao Zhang Seedream 5
    // ── New selectable image models (fal.ai) ──
    'fal-ai/flux-pro/v1.1': { flatCost: 5.0, type: 'image' },    // Flux Pro v1.1
    'fal-ai/flux-pro/v2': { flatCost: 8.0, type: 'image' },      // Flux 2 Pro (premium)
    'fal-ai/bytedance/seedream/v3/text-to-image': { flatCost: 5.0, type: 'image' },        // Seedream 5
    'fal-ai/ideogram/v3': { flatCost: 6.0, type: 'image' },       // Ideogram v3
    'gemini-3-pro-image-preview': { flatCost: 6.0, type: 'image' }, // NanoBanana Pro
    'grok-imagine-image': { flatCost: 7.0, type: 'image' },        // Grok Imagen (xAI)
    // ── Voice models (flat cost per call in USD cents) ──
    'sarvam-stt-saaras-v3': { flatCost: 0.5, type: 'voice' },
    'sarvam-tts-bulbul-v2': { flatCost: 1.0, type: 'voice' },
    'minimax-speech-02-hd': { flatCost: 2.0, type: 'voice' },
};

// Exported for pricing calculator
export { MODEL_COSTS };

/**
 * Refund credits to a user — used when async generation jobs fail
 * @param {string} userId - User ID
 * @param {number} amount - Amount of credits to refund
 * @param {string} actionName - Name of the action that failed (e.g. 'videoGenerate')
 * @param {string} description - Description for the logs
 * @param {string} studio - Studio name for the logs
 * @param {Object} metadata - Additional info (e.g. { projectId, route })
 */
export const refundCredits = async (userId, amount, actionName, description, studio = 'unknown', metadata = {}) => {
    if (!userId || !amount || amount <= 0) return;
    try {
        const updateOps = [
            User.findByIdAndUpdate(userId, { $inc: { 'credits.used': -amount } }, { returnDocument: 'after' })
        ];

        // We need the user to check activeSubscription
        const user = await User.findById(userId).select('activeSubscription credits');
        if (user?.activeSubscription) {
            const Subscription = (await import('../models/Subscription.js')).default;
            updateOps.push(Subscription.findByIdAndUpdate(user.activeSubscription, { $inc: { 'credits.used': -amount } }));
        }

        const [updated] = await Promise.all(updateOps);
        
        // Log the refund
        const updTopUp = (updated?.credits?.topUp > 0 && updated?.credits?.topUpExpiry && new Date(updated.credits.topUpExpiry) > new Date()) ? updated.credits.topUp : 0;
        const balanceAfter = (updated?.credits?.total || 0) + (updated?.credits?.bonus || 0) + updTopUp - (updated?.credits?.used || 0);

        await CreditUsage.create({
            user: userId,
            action: actionName || 'refund',
            cost: -amount, // Negative cost for refund
            balanceAfter: Math.max(0, balanceAfter),
            description: description || 'Refund for failed generation',
            studio,
            metadata: {
                ...metadata,
                isRefund: true
            },
        });
        console.log(`💰 Refunded ${amount} credits to user ${userId} for ${actionName}`);
    } catch (err) {
        console.error('❌ Failed to process credit refund:', err);
    }
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
        // 1. Update the most recent CreditUsage record if it exists
        const updated = await CreditUsage.findOneAndUpdate(
            { user: userId, action: meta.action || 'unknown', 'tokenUsage.inputTokens': 0 },
            { $set: { 'tokenUsage.inputTokens': inputTokens, 'tokenUsage.outputTokens': outputTokens, 'tokenUsage.totalTokens': totalTokens, 'tokenUsage.model': model, 'tokenUsage.provider': provider, 'tokenUsage.estimatedCost': estimatedCost } },
            { sort: { createdAt: -1 } }
        );

        // 2. If no matching unfilled record, create a new token-only log
        if (!updated) {
            await CreditUsage.create({
                user: userId,
                action: meta.action || 'ai_call',
                cost: 0, 
                description: `Token usage: ${model}`,
                studio: meta.studio || 'unknown',
                metadata: { route: meta.route || '', brandId: meta.brandId },
                tokenUsage: { inputTokens, outputTokens, totalTokens, model, provider, estimatedCost },
            });
        }

        // 3. Increment Platform Provider Budget (Admin Monitoring)
        if (estimatedCost > 0) {
            const budgets = await getSetting('provider_budgets', {});
            const p = (provider || '').toLowerCase();
            if (p && budgets[p]) {
                budgets[p].consumed = (budgets[p].consumed || 0) + estimatedCost;
                budgets[p].lastUpdate = new Date();
                await setSetting('provider_budgets', budgets);
            } else if (p) {
                // Initialize if missing but provider is known
                const knownProviders = ['gemini', 'openai', 'anthropic', 'grok', 'piapi', 'fal', 'heygen', 'sarvam', 'laozhang'];
                if (knownProviders.includes(p)) {
                    budgets[p] = { budget: 1000, consumed: estimatedCost, lastUpdate: new Date() }; // Default $10 budget
                    await setSetting('provider_budgets', budgets);
                }
            }
        }
    } catch (err) {
        console.warn('Token usage log failed:', err.message);
    }
};
