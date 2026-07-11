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
import CreditTransaction from '../models/CreditTransaction.js';
import { CREDITS_PER_SECOND, COST_PER_SECOND_INR } from '../constants/credits.js';
import { estimateCost } from '../agents/videoStudio/falClient.js';
import { IMAGE_MODEL_RATES } from '../utils/imageModelRates.js';
import { VIDEO_MODEL_RATES } from '../utils/videoModelRates.js';

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
    creative: 'dynamic',                   // dynamic based on model, resolution, quality
    photoshoot: 'dynamic',                 // dynamic based on model, resolution, quality
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
    canvasGenerate: 'dynamic',     // dynamic based on model, resolution, quality
    canvasBgRemove: 2,
    canvasExtend: 3,
    fidatoCanvas: 2,               // Fidato Canvas AI Director (Gemini fallback)
    fidatoCanvasClaude: 4,         // Fidato Canvas with Claude tool-use (premium)
    creativeCampaign: 15,          // ↑ from 8 — Multi-platform campaign (4–6 image gens)
    creativeCritique: 1,           // MCoT post-gen quality critique
    adCreative: 'dynamic',                 // dynamic based on model, resolution, quality
    voiceClone: 5,
    voiceTranscribe: 1,
    promptEnhance: 1,
    imageEnhance: 2,
    ugcProGenerate: 50,            // ↑ from 40 — Seedance 2.0 via Atlas Cloud ($0.50/5s ≈ ₹46.6)
    ugcProAnalyze: 1,              // Product intelligence analysis
    monthlyStrategy: 25,           // ↑ from 15 — Full Claude strategy pipeline (value-based pricing)
    monthlyBrief: 0,               // Brief execution charged at target studio's own rate
    qAdsPrompt:    4,              // Q-Ads single Claude call — brand DNA + MCP + 3 cinematic variants
    qAdsEnhance:   2,              // Q-Ads Stage 1 legacy — kept for backward compat
    qAdsDirector:  1,              // Q-Ads Stage 2 legacy — kept for backward compat
    qAdsGenerate:  50,             // ↑↑ CRITICAL FIX from 8 — Q-Ads Seedance 2.0 video (5s ≈ ₹46); 50cr × ₹5 = ₹250 → 81% margin
    avatarGenerate: 'dynamic',             // dynamic based on model, resolution, quality
    storyboardCreate: 8,           // Storyboard Director (Claude) + Gemini frame gen for all shots
    storyboardAnimate: 'dynamic',  // DYNAMIC — Seedance 2.0 I2V per shot
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
            if (req.headers['x-skip-credits'] === 'true' && req.headers['x-job-id']) {
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

                // Dynamic image credits — calculated per request based on model, resolution, quality
                if (rawCost === 'dynamic' && ['creative', 'photoshoot', 'adCreative', 'canvasGenerate', 'avatarGenerate'].includes(actionOrCost)) {
                    const model = req.body.model || req.body.imageModel;
                    
                    if (!model && ['adCreative', 'canvasGenerate'].includes(actionOrCost)) {
                        // Fallback static costs for text/general pipelines
                        const fallbacks = { adCreative: 8, canvasGenerate: 3 };
                        cost = fallbacks[actionOrCost] || 8;
                    } else {
                        const resolution = req.body.resolution || req.body._imageSize || '1K';
                        const quality = req.body.quality || req.body.agenticQuality || 'Medium';

                        let defaultCount = 1;
                        if (actionOrCost === 'photoshoot') defaultCount = 4;
                        else if (actionOrCost === 'avatarGenerate') defaultCount = 3;

                        const count = parseInt(req.body.numImages || req.body.count || req.body.quantity || defaultCount) || defaultCount;

                        const exRate = 95.56;
                        const margin = 60;
                        const creditPrice = 5;

                        cost = calculateImageCredits(model || 'nano-banana-2-t2i', resolution, quality, count, exRate, margin, creditPrice);
                    }
                    console.log(`🖼️ Dynamic image credits for ${actionOrCost}: model=${model || 'none'} → ${cost} credits`);
                } else if (rawCost === 'dynamic' && actionOrCost === 'videoGenerate') {
                    const model = req.body.model || req.body.videoModel || 'seedance-2.0-fast-i2v';
                    const resolution = req.body.resolution || req.body.aspectRatio || req.body.format || '1080p';
                    const duration = parseInt(req.body.duration) || 5;

                    const exRate = 95.56;
                    const margin = 60;
                    const creditPrice = 5;

                    cost = calculateVideoCredits(model, resolution, duration, exRate, margin, creditPrice);
                    console.log(`🎬 Dynamic video credits: ${model} (${resolution}) × ${duration}s → ${cost} credits`);
                } else if (rawCost === 'dynamic' && actionOrCost === 'storyboardAnimate') {
                    const { projectId, segmentIndex } = req.body;
                    let duration = parseInt(req.body.duration) || 5;
                    let model = req.body.model || req.body.videoModel || 'seedance-2.0-fast-i2v';
                    let resolution = req.body.resolution || req.body.aspectRatio || req.body.format || '1080p';

                    if (projectId && segmentIndex !== undefined) {
                        try {
                            const VideoProject = mongoose.models.VideoProject || (await import('../models/VideoProject.js')).default;
                            const project = await VideoProject.findById(projectId).lean();
                            const scenes = project?.storyboard?.scenes || [];
                            const idx = parseInt(segmentIndex);
                            if (scenes[idx]) {
                                if (scenes[idx].duration) duration = scenes[idx].duration;
                                if (scenes[idx].model) model = scenes[idx].model;
                                if (scenes[idx].resolution) resolution = scenes[idx].resolution;
                            }
                        } catch (e) {
                            console.warn(`[Credits Middleware] Failed to get segment details: ${e.message}`);
                        }
                    }

                    const exRate = 95.56;
                    const margin = 60;
                    const creditPrice = 5;

                    cost = calculateVideoCredits(model, resolution, duration, exRate, margin, creditPrice);
                    console.log(`🎬 Dynamic storyboardAnimate credits: ${model} (${resolution}) × ${duration}s → ${cost} credits`);
                } else if (rawCost === 'dynamic' && actionOrCost === 'storyboardAnimateLongForm') {
                    // Long-form! Calculate cost based on duration, model, and subtract skipped segments if projectId is provided!
                    const { model = 'seedance-2.0-fast', resolution = '1080p', projectId } = req.body;
                    let duration = parseInt(req.body.duration) || 30;
                    
                    const OPTIMAL_SEG = model === 'gemini-flash' ? 6 : (['veo-3.1', 'veo-3.1-fast', 'hunyuan'].includes(model) ? 8 : 10);
                    const segCount = Math.ceil(duration / OPTIMAL_SEG);
                    const perSegDuration = Math.min(OPTIMAL_SEG, duration);

                    const exRate = 95.56;
                    const margin = 60;
                    const creditPrice = 5;

                    const perSegCost = calculateVideoCredits(model, resolution, perSegDuration, exRate, margin, creditPrice);
                    let activeSegCount = segCount;
                    
                    if (projectId) {
                        try {
                            const VideoProject = mongoose.models.VideoProject || (await import('../models/VideoProject.js')).default;
                            const project = await VideoProject.findById(projectId).lean();
                            const existingUrls = project?.storyboard?.segmentUrls || {};
                            let skippedCount = 0;
                            const regenerateIndices = new Set(
                                Array.isArray(req.body.regenerateSegments)
                                    ? req.body.regenerateSegments.map(Number)
                                    : []
                            );
                            
                            if (req.body.forceRegenerate !== true && req.body.forceRegenerate !== 'true') {
                                const mapKeys = existingUrls instanceof Map ? Array.from(existingUrls.keys()) : Object.keys(existingUrls);
                                for (const key of mapKeys) {
                                    const idx = Number(key);
                                    const url = existingUrls instanceof Map ? existingUrls.get(key) : existingUrls[key];
                                    if (url && url.startsWith('http') && !regenerateIndices.has(idx)) {
                                        skippedCount++;
                                    }
                                }
                            }
                            activeSegCount = Math.max(0, segCount - skippedCount);
                            console.log(`🎬 [Credits Middleware] Longform resume: skipped ${skippedCount}/${segCount} segments. Charging for ${activeSegCount} segments.`);
                        } catch (e) {
                            console.warn(`[Credits Middleware] Failed to count skipped segments: ${e.message}`);
                        }
                    }
                    cost = perSegCost * activeSegCount;
                    console.log(`🎬 Dynamic longform video credits: ${duration}s → ${cost} credits (charging for ${activeSegCount} segments)`);
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

            const remaining = user.credits || 0;

            if (remaining < cost) {
                console.warn(`❌ [CREDITS] ${user.email} (Remaining: ${remaining}) has insufficient credits for "${actionName}" (Cost: ${cost} | Mult: ${providerMultiplier}x)`);
                return res.status(402).json({
                    success: false,
                    error: 'Insufficient credits',
                    creditsRequired: cost,
                    creditsRemaining: remaining,
                    upgradeRequired: true,
                });
            }

            // Deduct credits immediately with atomic guard
            const updated = await User.findOneAndUpdate(
                { _id: user._id, credits: { $gte: cost } },
                { $inc: { credits: -cost } },
                { returnDocument: 'after' }
            );

            if (!updated) {
                 return res.status(402).json({
                    success: false,
                    error: 'Insufficient credits',
                    creditsRequired: cost,
                    creditsRemaining: remaining,
                    upgradeRequired: true,
                });
            }

            // Log usage (fire-and-forget)
            const balanceAfter = updated.credits;
            // Detect studio from action name
            const studioMap = { content: 'content', contentRefine: 'content', creative: 'creative', photoshoot: 'creative', brainstorm: 'brainstorm', brainstormRefine: 'brainstorm', brainstormChat: 'brainstorm', brainstormScreenplay: 'brainstorm', trendRefresh: 'brainstorm', research: 'research', videoBrainstorm: 'video', videoGenerate: 'video', videoEdit: 'video', socialMedia: 'social', socialMediaCalendar: 'social', socialMediaAudit: 'social', socialMediaCompetitor: 'social', socialMediaScore: 'social', canvasGenerate: 'creative', canvasBgRemove: 'creative', canvasExtend: 'creative', fidatoCanvas: 'creative', fidatoCanvasClaude: 'creative', creativeCampaign: 'creative', creativeCritique: 'creative', adCreative: 'performance', voiceClone: 'voice', voiceTranscribe: 'voice', promptEnhance: 'creative', imageEnhance: 'video', monthlyStrategy: 'brainstorm', monthlyBrief: 'brainstorm', qAdsPrompt: 'video', qAdsEnhance: 'video', qAdsDirector: 'video', qAdsGenerate: 'video', ugcProGenerate: 'video', ugcProAnalyze: 'video', avatarGenerate: 'creative' };
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

            // Determine if it was a video generate action to calculate the margin tracking
            let costInrAtDebit = null;
            if (['videoGenerate', 'storyboardAnimate', 'storyboardAnimateLongForm'].includes(actionName)) {
                 const duration = parseInt(req.body.duration) || 5;
                 costInrAtDebit = Math.ceil(duration * COST_PER_SECOND_INR);
            }

            CreditTransaction.create({
                userId: user._id,
                type: 'debit',
                amount: -cost,
                costInrAtDebit,
                balanceAfter: Math.max(0, balanceAfter),
                relatedJobId: req.body?.idempotencyKey || null,
            }).catch(err => console.warn('Credit transaction log failed:', err.message));

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

        const updated = await User.findOneAndUpdate(
            { _id: userId, credits: { $gte: cost } },
            { $inc: { credits: -cost } },
            { returnDocument: 'after' }
        );
        if (!updated) {
            console.warn(`💰 Manual deduction failed: insufficient credits for ${userId}`);
            return null;
        }

        // Log usage
        const balanceAfter = updated.credits;

        CreditUsage.create({
            user: userId,
            action: typeof actionOrCost === 'string' ? actionOrCost : 'manual_deduction',
            cost,
            balanceAfter: Math.max(0, balanceAfter),
            description: ACTION_LABELS[actionOrCost] || actionOrCost || 'AI Operation',
            studio: (typeof actionOrCost === 'string' && actionOrCost.startsWith('seo')) ? 'seo' : 'unknown',
            metadata: { brandId },
        }).catch(err => console.warn('Manual credit usage log failed:', err.message));

        CreditTransaction.create({
            userId: userId,
            type: 'debit',
            amount: -cost,
            balanceAfter: Math.max(0, balanceAfter),
        }).catch(err => console.warn('Manual credit transaction log failed:', err.message));

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
    if (user.role === 'superadmin' || user.plan === 'enterprise') {
        return {
            total: Infinity,
            used: 0,
            remaining: Infinity,
            unlimited: true,
            plan: user.plan || 'enterprise'
        };
    }

    const remaining = user.credits || 0;

    return {
        total: remaining,
        used: 0,
        remaining,
        unlimited: false,
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
    'gemini-3.1-flash-image': { flatCost: 4.0, type: 'image' },
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
    'gemini-3-pro-image': { flatCost: 6.0, type: 'image' }, // NanoBanana Pro
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
        const updated = await User.findByIdAndUpdate(userId, { $inc: { credits: amount } }, { returnDocument: 'after' });
        if (!updated) return;

        // Log the refund
        const balanceAfter = updated.credits;

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
        
        await CreditTransaction.create({
            userId: userId,
            type: 'refund',
            amount: amount, // Positive for refund
            balanceAfter: Math.max(0, balanceAfter),
            relatedJobId: metadata?.idempotencyKey || null,
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

export function calculateImageCredits(modelId, resolution = '1K', quality = 'Medium', count = 1, exRate = 95.56, margin = 60, creditPrice = 5) {
    let resolvedModelId = modelId || 'nano-banana-2-t2i';
    const aliases = {
        'nanobanana-2': 'nano-banana-2-t2i',
        'nanobanana-lite': 'nano-banana-2-lite-t2i',
        'nanobanana-pro': 'nano-banana-pro-t2i',
        'gpt-image-2': 'openai-gpt-image-2-t2i'
    };
    if (aliases[resolvedModelId]) {
        resolvedModelId = aliases[resolvedModelId];
    }

    const model = IMAGE_MODEL_RATES.find(m => m.id === resolvedModelId || m.name === resolvedModelId) || { usdPerPic: 0.04 };
    const RESOLUTION_MULTIPLIERS = { '1K': 1.0, '2K': 1.5, '4K': 2.5 };
    const QUALITY_MULTIPLIERS = { 'Low': 0.5, 'Medium': 1.0, 'High': 1.8 };

    let res = resolution || '1K';
    if (res === '512px') res = '1K';

    let qual = quality || 'Medium';
    if (qual === 'fast' || qual === 'speed') qual = 'Low';
    if (qual === 'quality' || qual === 'pro') qual = 'High';

    res = res.toUpperCase();
    qual = qual.charAt(0).toUpperCase() + qual.slice(1).toLowerCase();

    const resMult = RESOLUTION_MULTIPLIERS[res] || 1.0;
    const qualMult = QUALITY_MULTIPLIERS[qual] || 1.0;
    const combinedMult = resMult * qualMult;

    const baseUsd = model.usdPerPic !== undefined ? model.usdPerPic : 0.04;
    const usdPerPicScaled = baseUsd * combinedMult;
    if (usdPerPicScaled === 0) return 0;

    const inrPerPic = usdPerPicScaled * exRate;
    const suggestedRetailPerPic = inrPerPic / (1 - (margin / 100));
    const estCreditsPerPic = Math.ceil(suggestedRetailPerPic / creditPrice);

    return Math.max(1, estCreditsPerPic * count);
}

export function calculateVideoCredits(modelId, resolution = '1080p', duration = 5, exRate = 95.56, margin = 60, creditPrice = 5) {
    let resolvedModelId = modelId || 'seedance-2.0-fast-i2v';
    const aliases = {
        'seedance-2.0-fast': 'seedance-2.0-fast-i2v',
        'seedance-2.0': 'seedance-2.0-i2v',
        'veo-3.1-fast': 'veo-3.1-fast-i2v',
        'veo-3.1': 'veo-3.1-i2v',
        'kling-3.0-turbo': 'kling-3.0-turbo-i2v',
        'grok-imagine': 'grok-imagine-1.5-i2v'
    };
    if (aliases[resolvedModelId]) {
        resolvedModelId = aliases[resolvedModelId];
    }

    const model = VIDEO_MODEL_RATES.find(m => m.id === resolvedModelId || m.name === resolvedModelId) || { usdPerSec: 0.072 };
    
    const RESOLUTION_MULTIPLIERS = {
        '480p': 0.5,
        '720p': 0.7,
        '1080p': 1.0,
        '4k': 2.0
    };
    
    let resKey = (resolution || '1080p').toLowerCase().trim();
    if (resKey.includes('512') || resKey.includes('480')) resKey = '480p';
    else if (resKey.includes('720')) resKey = '720p';
    else if (resKey.includes('1080')) resKey = '1080p';
    else if (resKey.includes('4k') || resKey.includes('2160') || resKey.includes('4096')) resKey = '4k';
    else resKey = '1080p';

    const resMult = RESOLUTION_MULTIPLIERS[resKey] || 1.0;
    const baseUsdPerSec = model.usdPerSec !== undefined ? model.usdPerSec : 0.072;
    const usdPerSecScaled = baseUsdPerSec * resMult;
    
    if (usdPerSecScaled === 0) return 0;

    const inrPerSec = usdPerSecScaled * exRate;
    const suggestedRetailPerSec = inrPerSec / (1 - (margin / 100));
    
    const estCreditsPerSec = Math.ceil(suggestedRetailPerSec / creditPrice);
    
    return Math.max(1, estCreditsPerSec * duration);
}

