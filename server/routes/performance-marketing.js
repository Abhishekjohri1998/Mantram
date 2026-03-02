/**
 * Performance Marketing Studio — API Routes
 * 
 * Full agentic pipeline for competitor research, strategy, budget planning,
 * ad creation, A/B testing, and performance reporting across Meta & Google Ads.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import AdReport from '../models/AdReport.js';
import AdCampaign from '../models/AdCampaign.js';
import AdLearning from '../models/AdLearning.js';
import Integration from '../models/Integration.js';
import Brand from '../models/Brand.js';
import config from '../config/env.js';
import { runStep, getPipelineInfo } from '../agents/performanceMarketing/engine.js';
import {
    competitorResearchNode,
    strategyNode,
    budgetPlannerNode,
    adCreatorNode,
    abTestDesignerNode,
    performanceAnalystNode,
    reportGeneratorNode,
} from '../agents/performanceMarketing/nodes.js';
import { runCompetitorResearch } from '../agents/performanceMarketing/competitorResearch.js';
import { getHistoricalContext, extractLearningsFromReport } from '../agents/performanceMarketing/historicalLearning.js';
import { getKeywordTrends, getRelatedQueries, getBrandTrends } from '../agents/performanceMarketing/webIntelligence.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// COMPETITOR RESEARCH
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/research
 * Start a new competitor research analysis
 */
router.post('/research', protect, async (req, res) => {
    try {
        const { query, competitors, platforms, brandId, country } = req.body;

        // Create a new report
        const report = await AdReport.create({
            user: req.user._id,
            brand: brandId || req.user.activeBrand,
            title: `Competitor Research: ${query || competitors?.[0] || 'Market Analysis'}`,
            type: 'competitor-research',
            status: 'researching',
            input: {
                query: query || '',
                competitors: competitors || [],
                platforms: platforms || ['meta', 'google'],
            },
        });

        const effectiveBrandId = brandId || req.user.activeBrand;

        // 1. Run competitor research (Meta Ad Library + Google Trends)
        let externalData = { ads: [], sources: [], marketIntelligence: {} };
        try {
            externalData = await runCompetitorResearch({
                competitors: competitors || [query],
                platforms: platforms || ['meta', 'google'],
                country: country || 'IN',
                brandId: effectiveBrandId,
                industry: query,
                keywords: competitors,
            });
        } catch (err) {
            console.warn('External research failed, using AI-only mode:', err.message);
        }

        // 2. Get historical learnings for this brand
        let historicalContext = '';
        try {
            historicalContext = await getHistoricalContext(effectiveBrandId);
        } catch (err) {
            console.warn('Historical context fetch failed:', err.message);
        }

        // 3. Run the AI research agent with trends + history injected
        const state = await runStep(report._id, 'researching', competitorResearchNode, {
            input: { query, competitors, platforms },
            brandId: effectiveBrandId,
            externalAds: externalData.ads,
            marketIntelligence: externalData.marketIntelligence,
            historicalContext,
        });

        // Auto-advance to strategy generation
        const strategyState = await runStep(report._id, 'analyzing', strategyNode, state);

        // Auto-advance to budget planning
        const finalState = await runStep(report._id, 'strategy', budgetPlannerNode, strategyState);

        const updatedReport = await AdReport.findById(report._id).lean();

        // 4. Auto-extract learnings from the research
        try {
            await extractLearningsFromReport(report._id);
        } catch (err) {
            console.warn('Learning extraction failed:', err.message);
        }

        res.json({
            success: true,
            report: updatedReport,
            pipeline: getPipelineInfo(updatedReport.status),
            trendData: externalData.marketIntelligence?.keywordTrends || [],
        });
    } catch (error) {
        console.error('PM Research error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/pm-studio/reports
 * List all reports for the user
 */
router.get('/reports', protect, async (req, res) => {
    try {
        const { type, brandId, limit = 20 } = req.query;
        const filter = { user: req.user._id };
        if (type) filter.type = type;
        if (brandId) filter.brand = brandId;

        const reports = await AdReport.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .lean();

        res.json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/pm-studio/reports/:id
 * Get a single report by ID
 */
router.get('/reports/:id', protect, async (req, res) => {
    try {
        const report = await AdReport.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();

        if (!report) return res.status(404).json({ success: false, error: 'Report not found' });

        res.json({
            success: true,
            report,
            pipeline: getPipelineInfo(report.status),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY GENERATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/strategy
 * Generate or refine a marketing strategy
 */
router.post('/strategy', protect, async (req, res) => {
    try {
        const { reportId, query, objective, budget, duration, platforms, brandId } = req.body;

        let report;
        if (reportId) {
            report = await AdReport.findById(reportId);
            if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
        } else {
            report = await AdReport.create({
                user: req.user._id,
                brand: brandId || req.user.activeBrand,
                title: `Strategy: ${objective || 'Performance Marketing'}`,
                type: 'strategy',
                status: 'researching',
                input: { query, platforms: platforms || ['meta', 'google'] },
            });
        }

        const state = await runStep(report._id, 'strategy', strategyNode, {
            input: { query, objective, budget, duration, platforms },
            brandId: report.brand || req.user.activeBrand,
            researchData: report.researchData || {},
            aiAnalysis: report.aiAnalysis || {},
        });

        const updatedReport = await AdReport.findById(report._id).lean();
        res.json({ success: true, report: updatedReport, pipeline: getPipelineInfo(updatedReport.status) });
    } catch (error) {
        console.error('PM Strategy error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// BUDGET PLANNING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/budget
 * Generate a budget plan
 */
router.post('/budget', protect, async (req, res) => {
    try {
        const { reportId, budget, currency, duration, objective, brandId } = req.body;

        let report;
        if (reportId) {
            report = await AdReport.findById(reportId);
            if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
        } else {
            report = await AdReport.create({
                user: req.user._id,
                brand: brandId || req.user.activeBrand,
                title: `Budget Plan: ${budget || 50000} ${currency || 'INR'}`,
                type: 'budget-plan',
                status: 'researching',
                input: { budget, query: `Budget allocation for ${objective || 'marketing'}`, platforms: ['meta', 'google'] },
            });
        }

        const state = await runStep(report._id, 'budget', budgetPlannerNode, {
            input: { budget, currency, duration, objective },
            brandId: report.brand || req.user.activeBrand,
            strategyPlan: report.strategyPlan || {},
            aiAnalysis: report.aiAnalysis || {},
        });

        const updatedReport = await AdReport.findById(report._id).lean();
        res.json({ success: true, report: updatedReport, pipeline: getPipelineInfo(updatedReport.status) });
    } catch (error) {
        console.error('PM Budget error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AD CAMPAIGN MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/campaigns
 * Create a new ad campaign (draft mode)
 */
router.post('/campaigns', protect, async (req, res) => {
    try {
        const { title, platform, objective, budget, targeting, reportId, brandId } = req.body;

        // Optionally generate AI creatives
        let aiCreatives = [];
        if (reportId) {
            const report = await AdReport.findById(reportId).lean();
            if (report) {
                const state = await adCreatorNode({
                    input: { objective, platforms: [platform], query: title },
                    brandId: brandId || req.user.activeBrand,
                    strategyPlan: report.strategyPlan || {},
                });
                aiCreatives = state.adCreatives || [];
            }
        }

        const campaign = await AdCampaign.create({
            user: req.user._id,
            brand: brandId || req.user.activeBrand,
            title: title || 'New Campaign',
            platform: platform || 'meta',
            objective: objective || 'traffic',
            budget: budget || {},
            targeting: targeting || {},
            creatives: aiCreatives.map(c => ({
                name: c.name,
                format: c.format,
                headline: c.headline,
                primaryText: c.primaryText,
                description: c.description,
                cta: c.cta,
                aiGenerated: true,
                aiPrompt: c.hook,
            })),
            strategyId: reportId || null,
        });

        res.json({ success: true, campaign });
    } catch (error) {
        console.error('PM Campaign create error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/pm-studio/campaigns
 * List campaigns
 */
router.get('/campaigns', protect, async (req, res) => {
    try {
        const { status, platform, brandId, limit = 20 } = req.query;
        const filter = { user: req.user._id };
        if (status) filter.status = status;
        if (platform) filter.platform = platform;
        if (brandId) filter.brand = brandId;

        const campaigns = await AdCampaign.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .lean();

        res.json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/pm-studio/campaigns/:id
 * Get a single campaign
 */
router.get('/campaigns/:id', protect, async (req, res) => {
    try {
        const campaign = await AdCampaign.findOne({
            _id: req.params.id,
            user: req.user._id,
        }).lean();

        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/pm-studio/campaigns/:id
 * Update a campaign
 */
router.put('/campaigns/:id', protect, async (req, res) => {
    try {
        const campaign = await AdCampaign.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            req.body,
            { new: true }
        );

        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// A/B TESTING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/campaigns/:id/ab-test
 * Create an A/B test design for a campaign
 */
router.post('/campaigns/:id/ab-test', protect, async (req, res) => {
    try {
        const campaign = await AdCampaign.findOne({ _id: req.params.id, user: req.user._id });
        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });

        const state = await abTestDesignerNode({
            adCreatives: campaign.creatives || [],
            input: { objective: campaign.objective },
            brandId: campaign.brand,
            budgetPlan: { currency: campaign.budget?.currency || 'INR', allocation: [{ amount: campaign.budget?.daily || 500 }] },
        });

        campaign.abTest = {
            enabled: true,
            metric: state.abTestPlan?.primaryMetric || 'ctr',
            variants: (state.abTestPlan?.variants || []).map((v, i) => ({
                name: v.name || `Variant ${String.fromCharCode(65 + i)}`,
                creativeIndex: i,
                performance: {},
            })),
        };
        await campaign.save();

        res.json({ success: true, campaign, abTestPlan: state.abTestPlan });
    } catch (error) {
        console.error('PM A/B Test error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE ANALYSIS & REPORTING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/analyze
 * Run AI performance analysis on campaign data
 */
router.post('/analyze', protect, async (req, res) => {
    try {
        const { campaignIds, brandId, dateRange } = req.body;

        // Gather performance data from campaigns
        const campaigns = await AdCampaign.find({
            _id: { $in: campaignIds || [] },
            user: req.user._id,
        }).lean();

        const report = await AdReport.create({
            user: req.user._id,
            brand: brandId || req.user.activeBrand,
            title: `Performance Analysis — ${new Date().toLocaleDateString()}`,
            type: 'performance',
            status: 'analyzing',
            input: {
                campaignIds,
                dateRange,
            },
            performanceSnapshot: {
                period: dateRange ? `${dateRange.start} to ${dateRange.end}` : 'All time',
                campaigns: campaigns.map(c => ({
                    campaignId: c._id,
                    name: c.title,
                    platform: c.platform,
                    spend: c.performance?.spend || 0,
                    impressions: c.performance?.impressions || 0,
                    clicks: c.performance?.clicks || 0,
                    conversions: c.performance?.conversions || 0,
                    roas: c.performance?.roas || 0,
                })),
                totalSpend: campaigns.reduce((sum, c) => sum + (c.performance?.spend || 0), 0),
                totalConversions: campaigns.reduce((sum, c) => sum + (c.performance?.conversions || 0), 0),
            },
        });

        const state = await runStep(report._id, 'analyzing', performanceAnalystNode, {
            performanceData: campaigns.map(c => c.performance),
            brandId: brandId || req.user.activeBrand,
        });

        const updatedReport = await AdReport.findById(report._id).lean();
        res.json({ success: true, report: updatedReport });
    } catch (error) {
        console.error('PM Analysis error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/pm-studio/report
 * Generate an executive report
 */
router.post('/report', protect, async (req, res) => {
    try {
        const { reportId, brandId } = req.body;

        const sourceReport = reportId ? await AdReport.findById(reportId).lean() : null;

        const report = await AdReport.create({
            user: req.user._id,
            brand: brandId || req.user.activeBrand,
            title: `Executive Report — ${new Date().toLocaleDateString()}`,
            type: 'weekly-digest',
            status: 'generating',
            performanceSnapshot: sourceReport?.performanceSnapshot || {},
            aiAnalysis: sourceReport?.aiAnalysis || {},
            strategyPlan: sourceReport?.strategyPlan || {},
        });

        const state = await runStep(report._id, 'complete', reportGeneratorNode, {
            brandId: brandId || req.user.activeBrand,
            performanceSnapshot: report.performanceSnapshot,
            aiAnalysis: report.aiAnalysis,
            strategyPlan: report.strategyPlan,
            type: 'weekly-digest',
        });

        const updatedReport = await AdReport.findById(report._id).lean();
        res.json({ success: true, report: { ...updatedReport, generatedReport: state.report } });
    } catch (error) {
        console.error('PM Report error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AD CREATIVE GENERATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/generate-creatives
 * AI-generate ad creatives for a campaign
 */
router.post('/generate-creatives', protect, async (req, res) => {
    try {
        const { objective, platforms, reportId, brandId, direction } = req.body;

        let context = {};
        if (reportId) {
            const report = await AdReport.findById(reportId).lean();
            if (report) {
                context.strategyPlan = report.strategyPlan;
                context.aiAnalysis = report.aiAnalysis;
            }
        }

        const state = await adCreatorNode({
            input: { objective, platforms, query: direction || '' },
            brandId: brandId || req.user.activeBrand,
            ...context,
        });

        res.json({ success: true, creatives: state.adCreatives || [] });
    } catch (error) {
        console.error('PM Creative generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD STATS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/dashboard
 * Get performance marketing dashboard stats
 */
router.get('/dashboard', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const { brandId } = req.query;
        const filter = { user: userId };
        if (brandId) filter.brand = brandId;

        const [campaigns, reports, integrations] = await Promise.all([
            AdCampaign.find(filter).lean(),
            AdReport.find(filter).sort({ createdAt: -1 }).limit(5).lean(),
            Integration.find({
                user: userId,
                platform: { $in: ['meta-ads', 'google-ads'] },
            }).select('platform status displayName').lean(),
        ]);

        // Calculate aggregate stats
        const activeCampaigns = campaigns.filter(c => c.status === 'active');
        const totalSpend = campaigns.reduce((sum, c) => sum + (c.performance?.spend || 0), 0);
        const totalImpressions = campaigns.reduce((sum, c) => sum + (c.performance?.impressions || 0), 0);
        const totalClicks = campaigns.reduce((sum, c) => sum + (c.performance?.clicks || 0), 0);
        const totalConversions = campaigns.reduce((sum, c) => sum + (c.performance?.conversions || 0), 0);
        const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0;
        const avgRoas = totalSpend > 0 ?
            campaigns.reduce((sum, c) => sum + (c.performance?.roas || 0), 0) / Math.max(campaigns.length, 1) : 0;

        res.json({
            success: true,
            dashboard: {
                stats: {
                    totalCampaigns: campaigns.length,
                    activeCampaigns: activeCampaigns.length,
                    totalSpend: Math.round(totalSpend),
                    totalImpressions,
                    totalClicks,
                    totalConversions,
                    avgCtr: avgCtr.toFixed(2),
                    avgRoas: avgRoas.toFixed(2),
                },
                recentReports: reports,
                connectedPlatforms: integrations,
                campaigns: campaigns.slice(0, 10).map(c => ({
                    _id: c._id,
                    title: c.title,
                    platform: c.platform,
                    status: c.status,
                    objective: c.objective,
                    spend: c.performance?.spend || 0,
                    roas: c.performance?.roas || 0,
                    createdAt: c.createdAt,
                })),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// PLATFORM CONNECTIONS (OAuth)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/connections
 * Get connection status for Meta Ads and Google Ads
 */
router.get('/connections', protect, async (req, res) => {
    try {
        const integrations = await Integration.find({
            user: req.user._id,
            platform: { $in: ['meta-ads', 'google-ads'] },
        }).select('platform status displayName platformData lastSyncAt').lean();

        const connections = {
            meta: integrations.find(i => i.platform === 'meta-ads') || { platform: 'meta-ads', status: 'disconnected' },
            google: integrations.find(i => i.platform === 'google-ads') || { platform: 'google-ads', status: 'disconnected' },
        };

        res.json({ success: true, connections });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// LIVE TRENDS (Enhancement 1)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/trends
 * Get live keyword trends and market intelligence
 */
router.get('/trends', protect, async (req, res) => {
    try {
        const { keywords, brandId, geo } = req.query;
        const keywordList = keywords ? keywords.split(',').map(k => k.trim()) : [];

        const [keywordTrends, brandTrends] = await Promise.all([
            keywordList.length > 0 ? getKeywordTrends(keywordList, geo || 'IN') : [],
            brandId ? getBrandTrends(brandId, geo || 'IN') : { trends: [] },
        ]);

        let relatedQueries = { topQueries: [], risingQueries: [] };
        if (keywordList[0]) {
            relatedQueries = await getRelatedQueries(keywordList[0], geo || 'IN');
        }

        res.json({
            success: true,
            keywordTrends,
            brandTrends,
            relatedQueries,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// HISTORICAL LEARNINGS (Enhancement 4)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/learnings
 * Get stored AI insights for a brand
 */
router.get('/learnings', protect, async (req, res) => {
    try {
        const { brandId, type, limit = 20 } = req.query;
        const filter = { user: req.user._id, status: 'active' };
        if (brandId) filter.brand = brandId;
        if (type) filter.type = type;

        const learnings = await AdLearning.find(filter)
            .sort({ createdAt: -1 })
            .limit(Number(limit))
            .lean();

        res.json({ success: true, learnings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * PUT /api/pm-studio/learnings/:id/status
 * Approve or reject an AI-generated learning
 */
router.put('/learnings/:id/status', protect, async (req, res) => {
    try {
        const { status } = req.body;
        const learning = await AdLearning.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { status },
            { new: true }
        );
        if (!learning) return res.status(404).json({ success: false, error: 'Learning not found' });
        res.json({ success: true, learning });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AD IMAGE GENERATION (Enhancement 3 — Creative Studio Integration)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/generate-ad-image
 * Generate an ad visual using the Creative Studio's Gemini pipeline
 */
router.post('/generate-ad-image', protect, async (req, res) => {
    try {
        const { prompt, brandId, platform, format } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

        const brand = brandId ? await Brand.findById(brandId).lean() : null;

        // Build a performance-marketing-optimized image prompt
        const brandDesc = brand ? `${brand.dna?.industry || ''} brand called ${brand.name}` : 'a modern brand';
        const sizeMap = {
            'meta-feed': '1080x1080 square',
            'meta-story': '1080x1920 vertical story',
            'google-display': '1200x628 landscape banner',
            'google-search': '1200x628 landscape',
            'meta-reel': '1080x1920 vertical',
            'youtube': '1280x720 landscape thumbnail',
        };
        const size = sizeMap[platform] || '1080x1080 square';

        const fullPrompt = `Generate a high-converting ad creative for a ${brandDesc}. ${prompt}. The design must be ${size}, visually striking, scroll-stopping, and ready to use as a paid ad on ${platform || 'social media'}. Do NOT add any text labels, hex codes, color swatches, or metadata. Fill the entire image edge to edge.`;

        // Use Gemini image generation (same as Creative Studio)
        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) return res.status(400).json({ success: false, error: 'Gemini API key not configured' });

        const models = [
            'gemini-3.1-flash-image-preview',
            'gemini-3-pro-image-preview',
            'gemini-2.5-flash-image',
            'gemini-2.0-flash-exp-image-generation',
        ];

        let imageUrl = null;
        let usedModel = '';
        for (const modelId of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: fullPrompt }] }],
                        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.5 },
                    }),
                });
                const data = await resp.json();
                if (data.error) continue;
                const resParts = data.candidates?.[0]?.content?.parts || [];
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                }
                if (imageUrl) { usedModel = modelId; break; }
            } catch (e) { continue; }
        }

        if (!imageUrl) return res.status(500).json({ success: false, error: 'Image generation failed across all models' });

        res.json({ success: true, imageUrl, model: usedModel, platform: platform || 'meta-feed' });
    } catch (error) {
        console.error('PM Ad image generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
