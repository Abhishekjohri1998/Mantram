/**
 * Credit Middleware — checks and deducts credits for AI operations
 * 
 * Usage: router.post('/generate', protect, requireCredits('content'), handler)
 * 
 * Credit costs are loaded from SystemSettings (managed by super admin).
 * Falls back to defaults if DB settings not found.
 * 
 * Video credits are DYNAMIC — calculated per request based on model, duration,
 * resolution, and quality mode using: credits = ceil(USD_cost × 70)
 * This ensures ≥50% margin at the ₹5/credit floor price.
 * 
 * Dynamic actions: videoGenerate, ugcProGenerate, qAdsGenerate
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
    seoWarRoom: 'SEO War Room', seoLlmProbe: 'SEO LLM Probe',
    seoAutoFix: 'SEO Auto-Fix', seoPromptMining: 'SEO Prompt Mining',
    seoGenerateFix: 'SEO Content Fix (AI)',
    brainstorm: 'Brainstorm Generate', brainstormRefine: 'Brainstorm Refine',
    brainstormChat: 'Brainstorm Chat', brainstormScreenplay: 'Screenplay Generation',
    research: 'Research Intelligence',  // ← Research Studio — separate from Brainstorm
    trendRefresh: 'Trend Refresh',
    videoBrainstorm: 'Video Brainstorm', videoGenerate: 'Video Generation', videoEdit: 'Video Edit',
    socialMedia: 'Social Media Strategy', socialMediaCalendar: 'Social Calendar', socialMediaAudit: 'Social Account Audit',
    socialMediaCompetitor: 'Social Competitor Analysis', socialMediaScore: 'Social Profile Score',
    canvasGenerate: 'Canvas AI Generate', canvasBgRemove: 'Canvas BG Remove', canvasExtend: 'Canvas Extend/Fill',
    fidatoCanvas: 'Fidato Canvas (AI Director)', fidatoCanvasClaude: 'Fidato Canvas (Claude Premium)',
    creativeCampaign: 'Multi-Platform Campaign', creativeCritique: 'AI Quality Critique',
    adCreative: 'Ad Creative Image', voiceClone: 'Voice Clone', voiceTranscribe: 'Voice Transcribe',
    promptEnhance: 'AI Prompt Enhancement', imageEnhance: 'AI Image Enhancement',
    ugcProGenerate: 'UGC Pro Video Generation', ugcProAnalyze: 'UGC Pro Product Analysis',
    monthlyStrategy: 'Monthly Strategy Generation',
    monthlyBrief: 'Monthly Strategy Brief Execution',
    qAdsPrompt:    'Q-Ads Prompt Generator (3 variants)',
    qAdsEnhance:   'Q-Ads Brief Enhancer (Stage 1 — legacy)',
    qAdsDirector:  'Q-Ads Prompt Director (Stage 2 — legacy)',
    qAdsGenerate:  'Q-Ads Video Generation',
    avatarGenerate: 'Avatar Generation (3 Variants)',
    viralityPredict: 'Virality Prediction (3-Model AI Pipeline)',
    storyboardCreate: 'Storyboard Director + Frames (AI Ad Film)',
    storyboardAnimate: 'Storyboard Animation (I2V per shot)',
    storyboardAnimateLongForm: 'Storyboard Long-Form Animation (multi-segment I2V + FFmpeg stitch)',
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
// ⚡ Updated May 2026 — recalibrated for 80% gross margin target
// Formula: credits_required = API_cost_INR × 5  (so 80% of revenue is gross profit)
// Exchange rate: ₹93.21/USD (update quarterly)
const DEFAULT_CREDIT_COSTS = {
    content: 3,
    contentRefine: 2,
    creative: 8,                   // ↑ from 5 — Gemini Flash image ≈ ₹6.24; 8cr × ₹5 = ₹40 → 84% margin
    photoshoot: 25,               // ↑ from 10 — 4×Gemini images ≈ ₹25; 25cr × ₹5 = ₹125 → 80% margin
    seoHealthCheck: 5,             // Crawls 600+ pages, heavy compute
    seoTraffic: 3,
    seoCompetitors: 3,
    seoAiVisibility: 3,
    seoAsk: 1,
    seoAuditPage: 1,
    seoCompetitorDiscover: 1,
    seoBacklinks: 5,
    seoWarRoom: 5,
    seoLlmProbe: 3,
    seoAutoFix: 2,
    seoPromptMining: 3,
    seoGenerateFix: 1,
    brainstorm: 3,
    brainstormRefine: 1,
    brainstormChat: 1,
    brainstormScreenplay: 5,
    research: 3,                   // Research Studio — web search + AI synthesis
    trendRefresh: 1,
    videoBrainstorm: 2,
    videoGenerate: 'dynamic',      // DYNAMIC — ceil(USD_cost × 170) ensures 89% gross margin
    videoEdit: 20,

    socialMedia: 3,
    socialMediaCalendar: 3,
    socialMediaAudit: 4,
    socialMediaCompetitor: 4,
    socialMediaScore: 2,
    canvasGenerate: 3,
    canvasBgRemove: 2,
    canvasExtend: 3,
    fidatoCanvas: 2,               // Fidato Canvas AI Director (Gemini fallback)
    fidatoCanvasClaude: 4,         // Fidato Canvas with Claude tool-use (premium)
    creativeCampaign: 15,          // ↑ from 8 — Multi-platform campaign (4–6 image gens)
    creativeCritique: 1,           // MCoT post-gen quality critique
    adCreative: 8,                 // ↑ from 5 — aligns with creative image cost
    voiceClone: 5,
    voiceTranscribe: 1,
    promptEnhance: 1,
    imageEnhance: 2,
    ugcProGenerate: 'dynamic',     // DYNAMIC — Seedance 2.0 via Atlas Cloud; ceil(USD × 170) → 89% margin

    ugcProAnalyze: 1,              // Product intelligence analysis
    monthlyStrategy: 25,           // ↑ from 15 — Full Claude strategy pipeline (value-based pricing)
    monthlyBrief: 0,               // Brief execution charged at target studio's own rate
    qAdsPrompt:    4,              // Q-Ads single Claude call — brand DNA + MCP + 3 cinematic variants
    qAdsEnhance:   2,              // Q-Ads Stage 1 legacy — kept for backward compat
    qAdsDirector:  1,              // Q-Ads Stage 2 legacy — kept for backward compat
    qAdsGenerate:  'dynamic',      // DYNAMIC — Q-Ads Seedance 2.0 video; ceil(USD × 170) → 81%+ margin
    avatarGenerate: 6,             // ↑ from 4 — Avatar Studio: 3 variants via LaoZhang NanoBanana 2
    viralityPredict: 3,            // Virality Predictor: Gemini vision + Grok research + Claude synthesis
    storyboardCreate: 8,           // Storyboard Director (Claude) + Gemini frame gen for all shots
    storyboardAnimate: 'dynamic',  // DYNAMIC — Seedance 2.0 I2V per shot
    // Long-form (>15s) storyboard: per-segment dynamic charge.
    // 30s → 3 segs (~45cr) | 60s → 6 segs (~90cr) | 90s → 9 segs (~135cr) | 120s → 12 segs (~180cr)
    storyboardAnimateLongForm: 'dynamic',
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

            // ── Background Job Bypass ──
            // When runCreativeJobAsync calls /generate internally, credits are
            // already deducted at POST /jobs time. Skip re-deduction.
            // SECURITY: Requires a server-only secret to prevent client-side forgery.
            const internalJobSecret = process.env.INTERNAL_JOB_SECRET;
            if (internalJobSecret && req.headers['x-internal-secret'] === internalJobSecret && req.headers['x-job-id']) {
                console.log(`⚡ [CREDITS] Skipping deduction for internal job call ${req.headers['x-job-id']}`);
                req.creditsDeducted = 0; // Signal to handler: already deducted
                return next();
            }

            // Resolve cost
            let cost;
            const actionName = typeof actionOrCost === 'string' ? actionOrCost : null;
            if (typeof actionOrCost === 'number') {
                cost = actionOrCost;
            } else {
                const costs = await getCreditCosts();
                const rawCost = costs[actionOrCost];

                // Dynamic video credits — calculated per request
                // Applies to: videoGenerate, ugcProGenerate, qAdsGenerate, storyboardAnimate, storyboardAnimateLongForm
                const DYNAMIC_VIDEO_ACTIONS = ['videoGenerate', 'ugcProGenerate', 'qAdsGenerate', 'storyboardAnimate', 'storyboardAnimateLongForm'];
                if (rawCost === 'dynamic' && DYNAMIC_VIDEO_ACTIONS.includes(actionOrCost)) {

                    // ── Long-Form Storyboard: per-segment dynamic pricing ──
                    if (actionOrCost === 'storyboardAnimateLongForm') {
                        const totalDuration = parseInt(req.body.duration || req.body.totalDuration) || 30;
                        const segModel     = req.body.model || 'seedance-2.0-fast';
                        const OPTIMAL_SEG  = segModel === 'gemini-flash' ? 6 : (['veo-3.1', 'veo-3.1-fast', 'hunyuan'].includes(segModel) ? 8 : 10);
                        const segCount     = Math.ceil(totalDuration / OPTIMAL_SEG);
                        const segResolution = req.body.resolution || '720p';
                        const segQuality   = segModel.includes('quality') || segModel === 'seedance-2.0' ? 'quality' : 'fast';
                        const segEstimate  = estimateCost(segModel, Math.min(OPTIMAL_SEG, totalDuration), segResolution, segQuality);
                        const perSeg       = Math.max(Math.ceil(segEstimate.usd * 70), 5);
                        cost = perSeg * segCount;
                        console.log(`🎬 Dynamic storyboard long-form credits: ${totalDuration}s → ${segCount} segs × ${perSeg}cr = ${cost} credits`);

                    // ── Single-shot Storyboard Animate ──
                    } else if (actionOrCost === 'storyboardAnimate') {
                        const dur          = parseInt(req.body.duration) || 10;
                        const sbModel      = req.body.model || 'seedance-2.0-fast';
                        const sbResolution = req.body.resolution || '720p';
                        const sbQuality    = sbModel === 'seedance-2.0' ? 'quality' : 'fast';
                        const sbEstimate   = estimateCost(sbModel, Math.min(dur, 15), sbResolution, sbQuality);
                        cost = Math.max(Math.ceil(sbEstimate.usd * 70), 5);
                        console.log(`🎬 Dynamic storyboard animate credits: ${dur}s ${sbModel} → $${sbEstimate.usd} → ${cost} credits`);

                    } else {
                        // UGC Pro and Q-Ads always use seedance-2.0 via Atlas Cloud
                        const defaultModel = (actionOrCost === 'ugcProGenerate' || actionOrCost === 'qAdsGenerate')
                            ? 'seedance-2.0' : 'kling-3.0';
                        const defaultDuration = (actionOrCost === 'qAdsGenerate') ? 8 : 5;
                        const { model = defaultModel, duration = defaultDuration,
                            resolution = '720p', qualityMode = 'fast' } = req.body;
                        // Parse duration from settings for UGC Pro / Q-Ads
                        let parsedDuration = parseInt(duration) || defaultDuration;
                        if (req.body.settings) {
                            const s = typeof req.body.settings === 'string' ? JSON.parse(req.body.settings) : req.body.settings;
                            if (s.duration) parsedDuration = parseInt(s.duration) || parsedDuration;
                        }
                        const estimate = estimateCost(model || defaultModel, parsedDuration, resolution, qualityMode);
                        // ceil(USD × 70) ensures ~75% margin at ₹5/credit floor
                        cost = Math.max(Math.ceil(estimate.usd * 70), 5);
                        console.log(`🎬 Dynamic video credits [${actionOrCost}]: ${model || defaultModel} ${parsedDuration}s ${resolution} ${qualityMode} → $${estimate.usd} → ${cost} credits`);
                    }
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

            // Bypass credit checks for Superadmins and Enterprise plans
            // NOTE: 'admin' role is intentionally excluded — admins follow normal credit rules.
            const isCreditExempt = user.role === 'superadmin' || user.plan === 'enterprise';
            if (isCreditExempt) {
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
            const studioMap = { content: 'content', contentRefine: 'content', creative: 'creative', photoshoot: 'creative', brainstorm: 'brainstorm', brainstormRefine: 'brainstorm', brainstormChat: 'brainstorm', brainstormScreenplay: 'brainstorm', trendRefresh: 'brainstorm', research: 'research', videoBrainstorm: 'video', videoGenerate: 'video', videoEdit: 'video', socialMedia: 'social', socialMediaCalendar: 'social', socialMediaAudit: 'social', socialMediaCompetitor: 'social', socialMediaScore: 'social', canvasGenerate: 'creative', canvasBgRemove: 'creative', canvasExtend: 'creative', fidatoCanvas: 'creative', fidatoCanvasClaude: 'creative', creativeCampaign: 'creative', creativeCritique: 'creative', adCreative: 'performance', voiceClone: 'voice', voiceTranscribe: 'voice', promptEnhance: 'creative', imageEnhance: 'video', monthlyStrategy: 'brainstorm', monthlyBrief: 'brainstorm', qAdsPrompt: 'video', qAdsEnhance: 'video', qAdsDirector: 'video', qAdsGenerate: 'video', ugcProGenerate: 'video', ugcProAnalyze: 'video', avatarGenerate: 'creative', viralityPredict: 'virality', storyboardCreate: 'video', storyboardAnimate: 'video', storyboardAnimateLongForm: 'video' };
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
let MODEL_COSTS = {
    // 💬 Text models (per 1K tokens) 💬
    'gpt-4o-mini': { input: 0.015, output: 0.06 },
    'gpt-4o': { input: 0.25, output: 1.0 },
    'grok-3-mini-fast': { input: 0.03, output: 0.10 },
    'grok-3-mini': { input: 0.03, output: 0.10 },
    'gemini-1.5-flash-latest': { input: 0.01, output: 0.04 },
    'gemini-1.5-pro-latest': { input: 0.125, output: 0.50 },
    'gemini-2.5-flash': { input: 0.015, output: 0.06 },
    'gemini-2.5-pro': { input: 0.125, output: 0.50 },
    'claude-3-opus-20240229': { input: 0.3, output: 1.5 },
    'claude-3-7-sonnet-20250219': { input: 0.1, output: 0.5 },
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
export async function syncLiveModelPricing() {
    const baselines = await getSetting('pricing_baselines', null);
    if (!baselines) return;

    for (const [key, model] of Object.entries(baselines)) {
        if (model.type === 'text') {
            const id = model.modelId;
            // baseline is per 1M. MODEL_COSTS is per 1K. So divide by 1000.
            MODEL_COSTS[id] = {
                input: (model.inputPer1M || 0) / 1000,
                output: (model.outputPer1M || 0) / 1000,
                ...(MODEL_COSTS[id] || {}) // merge base
            };
            MODEL_COSTS[id].input = (model.inputPer1M || 0) / 1000;
            MODEL_COSTS[id].output = (model.outputPer1M || 0) / 1000;
        } else if (model.type === 'image') {
            MODEL_COSTS[model.modelId] = { flatCost: model.flatCostUSD || 0.04 };
        }
    }
}

// Try initializing once at boot
syncLiveModelPricing().catch(() => { });

// ⚡ PERF: In-memory accumulator for provider budget tracking.
// Instead of reading+writing DB on every AI call (getSetting+setSetting ~2 round-trips each),
// we accumulate costs in memory and flush to DB every 60 seconds.
// This trades sub-minute budget accuracy for a massive reduction in DB write load.
const _providerBudgetAccumulator = {};
let _budgetFlushTimer = null;
async function _flushProviderBudgets() {
    const snapshot = { ..._providerBudgetAccumulator };
    // Clear accumulator BEFORE async write to avoid double-counting on concurrent flushes
    for (const p of Object.keys(_providerBudgetAccumulator)) delete _providerBudgetAccumulator[p];
    if (Object.keys(snapshot).length === 0) return;
    try {
        const budgets = await getSetting('provider_budgets', {});
        for (const [p, cost] of Object.entries(snapshot)) {
            if (budgets[p]) {
                budgets[p].consumed = (budgets[p].consumed || 0) + cost;
                budgets[p].lastUpdate = new Date();
            } else {
                const knownProviders = ['gemini', 'openai', 'anthropic', 'grok', 'piapi', 'fal', 'heygen', 'sarvam', 'laozhang'];
                if (knownProviders.includes(p)) {
                    budgets[p] = { budget: 1000, consumed: cost, lastUpdate: new Date() };
                }
            }
        }
        await setSetting('provider_budgets', budgets);
    } catch (err) {
        console.warn('[Budget Flush] DB write failed:', err.message);
    }
}
function _scheduleBudgetFlush() {
    if (_budgetFlushTimer) return; // Already scheduled
    _budgetFlushTimer = setTimeout(async () => {
        _budgetFlushTimer = null;
        await _flushProviderBudgets();
    }, 60_000); // Flush every 60s
}

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

        // 3. Increment Platform Provider Budget (Admin Monitoring) — batched, not per-call
        if (estimatedCost > 0) {
            const p = (provider || '').toLowerCase();
            const knownProviders = ['gemini', 'openai', 'anthropic', 'grok', 'piapi', 'fal', 'heygen', 'sarvam', 'laozhang'];
            if (p && knownProviders.includes(p)) {
                // ⚡ Accumulate in memory — flushed to DB every 60s (not on every AI call)
                _providerBudgetAccumulator[p] = (_providerBudgetAccumulator[p] || 0) + estimatedCost;
                _scheduleBudgetFlush();
            }
        }
    } catch (err) {
        console.warn('Token usage log failed:', err.message);
    }
};

