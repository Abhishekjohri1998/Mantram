/**
 * Performance Marketing Studio — API Routes
 * 
 * Full agentic pipeline for competitor research, strategy, budget planning,
 * ad creation, A/B testing, and performance reporting across Meta & Google Ads.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
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
import { syncAllCampaigns } from '../agents/performanceMarketing/liveSync.js';
import { detectAnomalies, generateAnomalyActions, autoRespond } from '../agents/performanceMarketing/anomalyDetector.js';
import { calculateBlendedMER, getAttributionByUTM } from '../agents/performanceMarketing/shopifyBridge.js';
import { forecastROAS } from '../agents/performanceMarketing/roasForecaster.js';
import { runOptimizationCycle } from '../agents/performanceMarketing/autoOptimizer.js';
import { getSEOKeywordsForTargeting, getCrossStudioOpportunities } from '../agents/performanceMarketing/crossStudioBridge.js';
import { runAttribution, runAIAttribution } from '../agents/performanceMarketing/attributionEngine.js';
import { generatePixelScript, getPixelClientScript, processPixelEvent } from '../agents/performanceMarketing/pixelTracking.js';
import { sendAlert, sendAnomalyAlert } from '../agents/performanceMarketing/alertEngine.js';
import { getBenchmarkComparison, getAIBenchmarkInsights } from '../agents/performanceMarketing/benchmarkEngine.js';
import { safeErrorMessage } from '../utils/safeError.js';

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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// STRATEGY GENERATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/strategy
 * Generate or refine a marketing strategy
 */
router.post('/strategy', protect, requireCredits('adCreative'), async (req, res) => {
    try {
        const { reportId, query, objective, goals, budget, currency, duration, platforms, brandId, targetAudience, targetGeo, customKeywords } = req.body;

        // Support both single objective (backward compat) and multi-goals
        const campaignGoals = Array.isArray(goals) && goals.length > 0 ? goals : (objective ? [objective] : ['traffic']);

        let report;
        if (reportId) {
            report = await AdReport.findById(reportId);
            if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
        } else {
            report = await AdReport.create({
                user: req.user._id,
                brand: brandId || req.user.activeBrand,
                title: `Strategy: ${campaignGoals.join(' + ') || 'Performance Marketing'}`,
                type: 'strategy',
                status: 'analyzing',
                input: { query, platforms: platforms || ['meta', 'google'] },
            });
        }

        const state = await runStep(report._id, 'strategy', strategyNode, {
            input: { query, objective, goals: campaignGoals, budget, currency: currency || 'INR', duration, platforms, targetAudience, targetGeo, customKeywords: Array.isArray(customKeywords) ? customKeywords : [] },
            brandId: report.brand || req.user.activeBrand,
            userId: req.user._id,
            researchData: report.researchData || {},
            aiAnalysis: report.aiAnalysis || {},
        });

        const updatedReport = await AdReport.findById(report._id).lean();
        res.json({ success: true, report: updatedReport, pipeline: getPipelineInfo(updatedReport.status) });
    } catch (error) {
        console.error('PM Strategy error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// BUDGET PLANNING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/budget
 * Generate a budget plan
 */
router.post('/budget', protect, requireCredits('brainstorm'), async (req, res) => {
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
            { returnDocument: 'after' }
        );

        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE ANALYSIS & REPORTING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/analyze
 * Run AI performance analysis on campaign data
 */
router.post('/analyze', protect, requireCredits('adCreative'), async (req, res) => {
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * POST /api/pm-studio/report
 * Generate an executive report
 */
router.post('/report', protect, requireCredits('adCreative'), async (req, res) => {
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AD CREATIVE GENERATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/generate-creatives
 * AI-generate ad creatives for a campaign
 */
router.post('/generate-creatives', protect, requireCredits('adCreative'), async (req, res) => {
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
            { returnDocument: 'after' }
        );
        if (!learning) return res.status(404).json({ success: false, error: 'Learning not found' });
        res.json({ success: true, learning });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AD IMAGE GENERATION (Enhancement 3 — Creative Studio Integration)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/generate-ad-image
 * Generate an ad visual using the Creative Studio's Gemini pipeline
 */
router.post('/generate-ad-image', protect, requireCredits('adCreative'), async (req, res) => {
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

        const models = ['gemini-3.1-flash-image-preview', 'gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];

        let imageUrl = null;
        let usedModel = null;
        let lastError = null;
        
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
                if (data.error) {
                    lastError = data.error.message;
                    continue; // try next model
                }
                const resParts = data.candidates?.[0]?.content?.parts || [];
                for (const part of resParts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                        usedModel = modelId;
                        break;
                    }
                }
                if (imageUrl) break;
            } catch (e) { 
                console.error(`Model ${modelId} error:`, e.message);
                lastError = e.message;
            }
        }

        if (!imageUrl) return res.status(500).json({ success: false, error: `Image generation failed. Last error: ${lastError}` });

        res.json({ success: true, imageUrl, model: usedModel, platform: platform || 'meta-feed' });
    } catch (error) {
        console.error('PM Ad image generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// LIVE CAMPAIGN SYNC (Phase 1)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/sync-campaigns
 * Trigger live campaign data sync from Meta/Google APIs
 */
router.post('/sync-campaigns', protect, async (req, res) => {
    try {
        const brandId = req.body.brandId || req.user.activeBrand;
        const result = await syncAllCampaigns(req.user._id, brandId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Campaign sync error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// ANOMALY DETECTION (Phase 1)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/anomalies
 * Get detected anomalies for active campaigns
 */
router.get('/anomalies', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const result = await detectAnomalies(req.user._id, brandId);

        // Generate actions if anomalies found
        let actions = [];
        if (result.anomalies?.length > 0) {
            const actionResult = await generateAnomalyActions(result.anomalies, brandId);
            actions = actionResult.actions || [];
        }

        res.json({ success: true, ...result, recommendedActions: actions });
    } catch (error) {
        console.error('PM Anomaly detection error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * POST /api/pm-studio/anomalies/auto-fix
 * Execute AI-recommended fixes for anomalies
 */
router.post('/anomalies/auto-fix', protect, async (req, res) => {
    try {
        const { actions } = req.body;
        if (!actions?.length) return res.status(400).json({ success: false, error: 'No actions provided' });

        const result = await autoRespond(actions, req.user._id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Auto-fix error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// BLENDED ROAS / MER (Phase 1)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/blended-roas
 * Get blended ROAS (MER) from Shopify revenue / ad spend
 */
router.get('/blended-roas', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const result = await calculateBlendedMER(req.user._id, brandId);

        // Also get UTM attribution breakdown
        let attribution = { attributions: [] };
        try {
            attribution = await getAttributionByUTM(req.user._id, brandId);
        } catch (e) { /* Shopify may not be connected */ }

        res.json({ success: true, ...result, utmAttribution: attribution });
    } catch (error) {
        console.error('PM Blended ROAS error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// ROAS FORECASTING (Phase 2)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/roas-forecast
 * Predict ROAS for a campaign configuration before launch
 */
router.post('/roas-forecast', protect, async (req, res) => {
    try {
        const brandId = req.body.brandId || req.user.activeBrand;
        const { platform, objective, budget, targeting } = req.body;

        const forecast = await forecastROAS({ platform, objective, budget, targeting }, brandId);
        res.json({ success: true, forecast });
    } catch (error) {
        console.error('PM ROAS Forecast error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTO-OPTIMIZATION (Phase 2)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/optimize
 * Run one optimization cycle on-demand
 */
router.post('/optimize', protect, async (req, res) => {
    try {
        const brandId = req.body.brandId || req.user.activeBrand;
        const result = await runOptimizationCycle(req.user._id, brandId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Optimization error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * GET /api/pm-studio/strategy-health
 * Check if current strategy KPIs are being met by actual campaigns
 */
router.get('/strategy-health', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const { checkStrategyHealth } = await import('../agents/performanceMarketing/autoOptimizer.js');
        const result = await checkStrategyHealth(req.user._id, brandId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Strategy health error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


/**
 * GET /api/pm-studio/optimization-log
 * Get historical optimization actions/decisions
 */
router.get('/optimization-log', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const learnings = await AdLearning.find({
            user: req.user._id,
            brand: brandId,
            title: { $regex: /Optimization Cycle|Auto-action/i },
        }).sort({ createdAt: -1 }).limit(20).lean();

        res.json({ success: true, log: learnings });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * PUT /api/pm-studio/campaigns/:id/autopilot
 * Enable/configure autopilot settings for a campaign
 */
router.put('/campaigns/:id/autopilot', protect, async (req, res) => {
    try {
        const { enabled, pauseOnRoasDrop, maxDailySpend, autoSwapCreatives } = req.body;
        const campaign = await AdCampaign.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { autopilot: { enabled, pauseOnRoasDrop, maxDailySpend, autoSwapCreatives } },
            { returnDocument: 'after' }
        );

        if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
        res.json({ success: true, campaign });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// CROSS-STUDIO INTELLIGENCE (Phase 3)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/cross-studio/opportunities
 * Get aggregated cross-studio data and AI-identified opportunities
 */
router.get('/cross-studio/opportunities', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const result = await getCrossStudioOpportunities(req.user._id, brandId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Cross-studio error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * POST /api/pm-studio/cross-studio/create-from-seo
 * Create a campaign draft pre-populated with SEO keyword data
 */
router.post('/cross-studio/create-from-seo', protect, async (req, res) => {
    try {
        const brandId = req.body.brandId || req.user.activeBrand;
        const seoData = await getSEOKeywordsForTargeting(brandId);

        if (!seoData.suggestedForPaid?.length) {
            return res.status(400).json({ success: false, error: 'No SEO keywords available for targeting' });
        }

        // Create a draft campaign with SEO-sourced keywords
        const campaign = await AdCampaign.create({
            user: req.user._id,
            brand: brandId,
            title: `SEO-Powered Campaign — ${new Date().toLocaleDateString('en-IN')}`,
            platform: req.body.platform || 'google',
            status: 'draft',
            objective: 'traffic',
            targeting: {
                interests: seoData.suggestedForPaid.slice(0, 15),
                locations: ['IN'],
            },
        });

        res.json({
            success: true,
            campaign,
            seoKeywords: seoData.suggestedForPaid,
            cannibalizationWarning: seoData.cannibalizationWarning,
        });
    } catch (error) {
        console.error('PM Create from SEO error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// MULTI-TOUCH ATTRIBUTION (Phase 4)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/attribution
 * Run multi-touch attribution analysis
 */
router.get('/attribution', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const model = req.query.model || 'position-based';
        const dateRange = { start: req.query.start, end: req.query.end };

        const result = model === 'ai-driven'
            ? await runAIAttribution(req.user._id, brandId, dateRange)
            : await runAttribution(req.user._id, brandId, model, dateRange);

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Attribution error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// FIRST-PARTY PIXEL & TRACKING (Phase 4)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/pixel/setup
 * Generate pixel script for a brand
 */
router.get('/pixel/setup', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const serverUrl = `${req.protocol}://${req.get('host')}`;
        const pixelData = generatePixelScript(brandId, serverUrl);
        res.json({ success: true, ...pixelData });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * GET /pixel.js
 * Serve the pixel client-side JavaScript
 * NOTE: This route is WITHOUT /api/pm-studio prefix — served at root
 */
router.get('/pixel.js', (req, res) => {
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    res.set('Content-Type', 'application/javascript');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(getPixelClientScript(serverUrl));
});

/**
 * POST /api/pm-studio/pixel/event
 * Receive pixel events from client websites
 */
router.post('/pixel/event', async (req, res) => {
    try {
        // No auth required — pixel events come from external websites
        const result = await processPixelEvent(req.body);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Pixel event error:', error);
        res.status(200).json({ received: true }); // Always 200 for pixels
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION ALERTS (Phase 4)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/pm-studio/alerts/send
 * Manually trigger an alert
 */
router.post('/alerts/send', protect, async (req, res) => {
    try {
        const brandId = req.body.brandId || req.user.activeBrand;
        const { alertType, alertData } = req.body;

        if (!alertType || !alertData) {
            return res.status(400).json({ success: false, error: 'alertType and alertData required' });
        }

        const result = await sendAlert(req.user._id, brandId, alertType, alertData);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Alert error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * POST /api/pm-studio/alerts/test
 * Send a test alert to verify channel configuration
 */
router.post('/alerts/test', protect, async (req, res) => {
    try {
        const brandId = req.body.brandId || req.user.activeBrand;
        const result = await sendAlert(req.user._id, brandId, 'daily-digest', {
            title: 'Test Alert',
            summary: 'This is a test alert from Mantram AI to verify your notification setup.',
            metrics: { 'Status': 'Connected ✅' },
        });
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// INDUSTRY BENCHMARKING (Phase 4)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/pm-studio/benchmarks
 * Compare performance against industry benchmarks
 */
router.get('/benchmarks', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const result = await getBenchmarkComparison(req.user._id, brandId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM Benchmark error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

/**
 * GET /api/pm-studio/benchmarks/ai
 * AI-enhanced benchmark analysis with SWOT + quarterly goals
 */
router.get('/benchmarks/ai', protect, async (req, res) => {
    try {
        const brandId = req.query.brandId || req.user.activeBrand;
        const result = await getAIBenchmarkInsights(req.user._id, brandId);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('PM AI Benchmark error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});
// ═══════════════════════════════════════════════════════════════════════════
// TEMPORARY: POST /api/pm-studio/seed-demo — Seed ACwO Performance Marketing data
// DELETE /api/pm-studio/seed-demo — Remove seeded data
// ═══════════════════════════════════════════════════════════════════════════

const PM_SEED_TAG = 'acwo-pm-demo';

const DEMO_CAMPAIGNS = [
    {
        title: 'ACwO DwOTS 2.0 — Diwali Mega Sale',
        platform: 'meta',
        status: 'active',
        objective: 'conversions',
        budget: { daily: 2500, total: 75000, currency: 'INR', strategy: 'cost-cap' },
        targeting: {
            audiences: ['Earbuds Enthusiasts', 'Tech Gadget Buyers'],
            locations: ['IN-MH', 'IN-DL', 'IN-KA'],
            ageRange: { min: 18, max: 35 },
            gender: 'all',
            interests: ['Audio Equipment', 'Wireless Earbuds', 'Tech Deals'],
            placements: ['feed', 'stories', 'reels'],
        },
        performance: { impressions: 845000, reach: 412000, clicks: 28450, ctr: 3.37, cpc: 2.63, cpm: 88.5, conversions: 1420, conversionRate: 4.99, roas: 4.8, spend: 74800, leads: 0, revenue: 359160, blendedRoas: 4.8, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Campaign exceeding ROAS targets by 20%. Reel placements driving 60% of conversions. Recommend increasing daily budget to ₹3,500.', recommendations: ['Scale budget by 40%', 'Duplicate winning reel ad set', 'Add lookalike audiences'], riskLevel: 'low', predictedRoas: 5.2, optimizationScore: 87 },
        creatives: [
            { name: 'Diwali Hero — Reel', format: 'video', headline: '🎧 Sound That Dazzles This Diwali', primaryText: 'ACwO DwOTS 2.0 at just ₹1,299. 40hr battery, deep bass, ANC. Make this Diwali LOUD. 🎉', cta: 'Shop Now', aiGenerated: true },
            { name: 'Festive Offer — Image', format: 'image', headline: 'Flat 30% Off — ACwO DwOTS 2.0', primaryText: 'Premium TWS at an unbeatable price. Free shipping + 1-year warranty.', cta: 'Buy Now', aiGenerated: true },
        ],
    },
    {
        title: 'ACwO Brand Awareness — YouTube + Display',
        platform: 'google',
        status: 'active',
        objective: 'awareness',
        budget: { daily: 3000, total: 90000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: {
            audiences: ['In-market: Headphones', 'Affinity: Tech Savvy'],
            locations: ['IN'],
            ageRange: { min: 18, max: 44 },
            gender: 'all',
            interests: ['Consumer Electronics', 'Mobile Accessories'],
            placements: ['youtube', 'display'],
        },
        performance: { impressions: 2130000, reach: 980000, clicks: 42600, ctr: 2.0, cpc: 1.89, cpm: 37.6, conversions: 640, conversionRate: 1.5, roas: 2.1, spend: 80100, leads: 0, revenue: 168210, blendedRoas: 2.1, lastSyncAt: new Date() },
        anomalies: [{ type: 'ctr-drop', severity: 'warning', detected: new Date(Date.now() - 2 * 86400000), metric: 'ctr', expected: 2.5, actual: 2.0, action: 'alert-sent', resolved: false }],
        aiInsights: { summary: 'CTR dropped 20% after week 2. Display placements underperforming YouTube. Consider pausing display and reallocating to YouTube shorts.', recommendations: ['Pause Display placements', 'Test YouTube Shorts format', 'Add frequency capping'], riskLevel: 'medium', predictedRoas: 2.4, optimizationScore: 62 },
        creatives: [
            { name: 'YouTube Pre-roll — 15s', format: 'video', headline: 'ACwO — Sound Redefined', primaryText: 'India\'s fastest-growing audio brand. Premium sound, accessible prices.', cta: 'Learn More', aiGenerated: true },
        ],
    },
    {
        title: 'ACwO Neckband X1 Pro — Performance Max',
        platform: 'google',
        status: 'active',
        objective: 'sales',
        budget: { daily: 1800, total: 54000, currency: 'INR', strategy: 'target-roas' },
        targeting: {
            audiences: ['Past Purchasers', 'boAt Customers'],
            locations: ['IN-MH', 'IN-DL', 'IN-TN', 'IN-KA', 'IN-GJ'],
            ageRange: { min: 20, max: 40 },
            gender: 'all',
            interests: ['Bluetooth Audio', 'Gym & Fitness', 'Running'],
            placements: ['search', 'shopping', 'display', 'youtube'],
        },
        performance: { impressions: 560000, reach: 340000, clicks: 19600, ctr: 3.5, cpc: 2.3, cpm: 80.4, conversions: 980, conversionRate: 5.0, roas: 5.6, spend: 45080, leads: 0, revenue: 252448, blendedRoas: 5.6, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Top-performing campaign. Shopping ads are driving 70% of sales. Search ads converting at 6.2%. This campaign is a clear winner.', recommendations: ['Increase budget 50%', 'Expand to new states', 'Test higher bids on Shopping'], riskLevel: 'low', predictedRoas: 6.0, optimizationScore: 94 },
        creatives: [
            { name: 'Shopping — Neckband X1 Pro', format: 'image', headline: 'ACwO Neckband X1 Pro — ₹899', primaryText: '28hr battery • Deep Bass • IPX5', cta: 'Shop Now', aiGenerated: false },
        ],
    },
    {
        title: 'ACwO SmartWatch Ultra S1 — Launch Campaign',
        platform: 'meta',
        status: 'paused',
        objective: 'conversions',
        budget: { daily: 2000, total: 60000, currency: 'INR', strategy: 'cost-cap' },
        targeting: {
            audiences: ['Tech Early Adopters', 'Fitness Enthusiasts'],
            locations: ['IN-MH', 'IN-DL', 'IN-KA'],
            ageRange: { min: 22, max: 40 },
            gender: 'all',
            interests: ['Smartwatches', 'Fitness Tracking', 'Wearable Tech'],
            placements: ['feed', 'stories'],
        },
        performance: { impressions: 320000, reach: 185000, clicks: 8960, ctr: 2.8, cpc: 4.02, cpm: 112.5, conversions: 268, conversionRate: 2.99, roas: 1.6, spend: 36000, leads: 0, revenue: 57600, blendedRoas: 1.6, lastSyncAt: new Date(Date.now() - 3 * 86400000) },
        anomalies: [
            { type: 'roas-drop', severity: 'high', detected: new Date(Date.now() - 3 * 86400000), metric: 'roas', expected: 3.0, actual: 1.6, action: 'paused', resolved: true },
        ],
        aiInsights: { summary: 'ROAS below target — paused to avoid budget waste. CPC is too high (₹4.02). Creatives may need refresh. Consider retargeting warm audiences.', recommendations: ['Refresh creatives', 'Test lower CPC with broad targeting', 'Enable retargeting pixel'], riskLevel: 'high', predictedRoas: 2.0, optimizationScore: 38 },
        creatives: [
            { name: 'SmartWatch Launch — Image', format: 'image', headline: 'The ₹2,499 Smartwatch That Does It All', primaryText: 'ACwO SmartWatch Ultra S1 — Heart rate, SpO2, GPS, 7-day battery. Your wrist, upgraded.', cta: 'Order Now', aiGenerated: true },
        ],
    },
    {
        title: 'ACwO ANC Earbuds Pro Max — Instagram Reels',
        platform: 'meta',
        status: 'active',
        objective: 'conversions',
        budget: { daily: 1500, total: 45000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: {
            audiences: ['Premium Audio Buyers', 'Apple/Samsung Users'],
            locations: ['IN'],
            ageRange: { min: 22, max: 38 },
            gender: 'all',
            interests: ['ANC Earbuds', 'Premium Audio', 'Music Production'],
            placements: ['reels', 'stories'],
        },
        performance: { impressions: 480000, reach: 295000, clicks: 16320, ctr: 3.4, cpc: 2.51, cpm: 85.4, conversions: 490, conversionRate: 3.0, roas: 3.6, spend: 40960, leads: 0, revenue: 147456, blendedRoas: 3.6, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Strong Reels performance. 3.4% CTR is above industry benchmark. UGC-style creatives outperforming polished ads by 2x. Scale to Explore placements.', recommendations: ['Add Explore placement', 'Create more UGC creatives', 'Test carousel format'], riskLevel: 'low', predictedRoas: 4.0, optimizationScore: 78 },
        creatives: [
            { name: 'UGC Reel — Noise Cancel Test', format: 'video', headline: 'You Won\'t Believe These Cost ₹2,999', primaryText: 'ACwO ANC Earbuds Pro Max — 45dB ANC, Hi-Res Audio, 36hr battery. Real noise cancellation at an unreal price.', cta: 'Shop Now', aiGenerated: true },
        ],
    },
    {
        title: 'ACwO Lead Gen — New Product Survey',
        platform: 'meta',
        status: 'completed',
        objective: 'leads',
        budget: { daily: 800, total: 12000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: {
            audiences: ['ACwO Website Visitors', 'Past Purchasers'],
            locations: ['IN'],
            ageRange: { min: 18, max: 45 },
            gender: 'all',
            interests: ['Tech Reviews', 'Gadgets'],
            placements: ['feed'],
        },
        performance: { impressions: 95000, reach: 68000, clicks: 3800, ctr: 4.0, cpc: 3.16, cpm: 126.3, conversions: 0, conversionRate: 0, roas: 0, spend: 12000, leads: 1240, revenue: 0, lastSyncAt: new Date(Date.now() - 15 * 86400000) },
        anomalies: [],
        aiInsights: { summary: 'Lead gen campaign completed. 1,240 leads captured at ₹9.68 CPL. Database enriched with product preferences for upcoming launches.', recommendations: ['Create lookalike from leads', 'Follow up with email sequence', 'Use leads for remarketing'], riskLevel: 'low', predictedRoas: 0, optimizationScore: 72 },
        creatives: [
            { name: 'Survey — What Should We Build Next?', format: 'image', headline: 'Help ACwO Build Your Dream Product', primaryText: 'Take a 2-min survey and stand a chance to win our latest TWS earbuds! Your feedback shapes what we make next.', cta: 'Sign Up', aiGenerated: false },
        ],
    },
    {
        title: 'ACwO SoundBar 60W — Google Search',
        platform: 'google',
        status: 'active',
        objective: 'traffic',
        budget: { daily: 1200, total: 36000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: {
            audiences: ['Home Audio Shoppers'],
            locations: ['IN'],
            ageRange: { min: 25, max: 50 },
            gender: 'all',
            interests: ['Home Theater', 'Smart Home', 'Bluetooth Speakers'],
            placements: ['search'],
        },
        performance: { impressions: 210000, reach: 195000, clicks: 12600, ctr: 6.0, cpc: 1.90, cpm: 114, conversions: 315, conversionRate: 2.5, roas: 4.2, spend: 23940, leads: 0, revenue: 100548, blendedRoas: 4.2, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Search campaign performing well with 6% CTR. Brand keywords driving 40% of clicks at very low CPC. Expand to competitor keywords for incremental reach.', recommendations: ['Add competitor keywords', 'Test responsive search ads', 'Increase bid on high-intent queries'], riskLevel: 'low', predictedRoas: 4.5, optimizationScore: 81 },
        creatives: [
            { name: 'Search Ad — SoundBar', format: 'text', headline: 'ACwO 60W SoundBar — ₹3,499 | Free Shipping', primaryText: 'Cinematic sound at home. Bluetooth 5.3, HDMI ARC, dual subwoofers. 4.5★ rated.', cta: 'Buy Now', aiGenerated: true },
        ],
    },
    {
        title: 'ACwO Retargeting — Cart Abandoners',
        platform: 'meta',
        status: 'active',
        objective: 'conversions',
        budget: { daily: 600, total: 18000, currency: 'INR', strategy: 'lowest-cost' },
        targeting: {
            audiences: ['Cart Abandoners — 7 days', 'Product Viewers — 14 days'],
            locations: ['IN'],
            ageRange: { min: 18, max: 45 },
            gender: 'all',
            interests: [],
            placements: ['feed', 'stories', 'reels'],
        },
        performance: { impressions: 145000, reach: 42000, clicks: 8700, ctr: 6.0, cpc: 1.72, cpm: 103.4, conversions: 870, conversionRate: 10.0, roas: 8.2, spend: 14964, leads: 0, revenue: 122705, blendedRoas: 8.2, lastSyncAt: new Date() },
        anomalies: [],
        aiInsights: { summary: 'Best ROAS campaign (8.2x). Retargeting cart abandoners is extremely effective. Conversion rate 10% — well above benchmarks. This is the highest efficiency campaign.', recommendations: ['Extend window to 30 days', 'Add dynamic product ads', 'Test email + ad combo'], riskLevel: 'low', predictedRoas: 8.5, optimizationScore: 96 },
        creatives: [
            { name: 'Dynamic Retarget — Carousel', format: 'carousel', headline: 'You Left Something Behind! 👀', primaryText: 'Your ACwO favorites are still in your cart. Complete your order now and get free express shipping!', cta: 'Complete Purchase', aiGenerated: true },
        ],
    },
];

router.post('/seed-demo', protect, async (req, res) => {
    try {
        const userId = req.user._id;

        // Find ACwO brand for this user
        let brand = await Brand.findOne({ user: userId, name: /acwo/i });
        if (!brand) {
            brand = await Brand.create({
                user: userId,
                name: 'ACwO',
                description: 'ACwO — Next-gen audio & gadget brand.',
                status: 'active',
            });
        }
        const brandId = brand._id;

        // Clean existing demo data
        await AdCampaign.deleteMany({ user: userId, brand: brandId, 'aiInsights.summary': { $regex: /\[DEMO\]/ } });
        await AdCampaign.deleteMany({ user: userId, brand: brandId, _seedTag: PM_SEED_TAG });

        // Seed ad platform integrations
        for (const plat of ['meta-ads', 'google-ads']) {
            await Integration.findOneAndUpdate(
                { user: userId, brand: brandId, platform: plat },
                {
                    user: userId, brand: brandId, platform: plat, status: 'connected',
                    displayName: plat === 'meta-ads' ? 'ACwO Meta Business' : 'ACwO Google Ads',
                    accessToken: `demo_token_${plat}`,
                    platformData: {
                        accountId: plat === 'meta-ads' ? 'act_123456789' : '987-654-3210',
                        accountName: plat === 'meta-ads' ? 'ACwO Meta Business' : 'ACwO Google Ads Account',
                    },
                    lastSyncAt: new Date(),
                    metadata: { _seedTag: PM_SEED_TAG },
                },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // Create campaigns
        const created = [];
        for (const c of DEMO_CAMPAIGNS) {
            const startDate = new Date(Date.now() - Math.floor(Math.random() * 30 + 10) * 86400000);
            const endDate = c.status === 'completed' ? new Date(Date.now() - 5 * 86400000) : new Date(Date.now() + 30 * 86400000);

            const campaign = await AdCampaign.create({
                user: userId,
                brand: brandId,
                title: c.title,
                platform: c.platform,
                status: c.status,
                objective: c.objective,
                budget: { ...c.budget, startDate, endDate },
                targeting: c.targeting,
                creatives: c.creatives,
                performance: c.performance,
                anomalies: c.anomalies || [],
                aiInsights: c.aiInsights,
                _seedTag: PM_SEED_TAG,
            });
            created.push({ id: campaign._id, title: c.title, platform: c.platform, status: c.status, roas: c.performance.roas });
        }

        // Create a sample report
        await AdReport.create({
            user: userId,
            brand: brandId,
            title: 'ACwO Weekly Performance Report — Demo',
            type: 'weekly',
            summary: 'Cross-platform campaign performance showing 4.2x blended ROAS across 8 campaigns. Meta driving conversions, Google driving awareness. Retargeting is the star performer at 8.2x ROAS.',
            metrics: {
                totalSpend: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.spend || 0), 0),
                totalRevenue: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.revenue || 0), 0),
                totalImpressions: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.impressions || 0), 0),
                totalClicks: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.clicks || 0), 0),
                totalConversions: DEMO_CAMPAIGNS.reduce((s, c) => s + (c.performance.conversions || 0), 0),
                avgCtr: 3.76,
                avgRoas: 4.26,
            },
            campaignIds: created.map(c => c.id),
            status: 'completed',
            metadata: { _seedTag: PM_SEED_TAG },
        });

        console.log(`🎯 PM seed: ${created.length} campaigns + integrations + report created for ACwO`);
        res.json({ success: true, message: `Seeded ${created.length} demo campaigns`, campaigns: created });
    } catch (error) {
        console.error('PM seed error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/seed-demo', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const brand = await Brand.findOne({ user: userId, name: /acwo/i });
        if (!brand) return res.json({ success: true, message: 'No ACwO brand found' });
        const brandId = brand._id;

        const campDel = await AdCampaign.deleteMany({ user: userId, brand: brandId, _seedTag: PM_SEED_TAG });
        const repDel = await AdReport.deleteMany({ user: userId, brand: brandId, 'metadata._seedTag': PM_SEED_TAG });
        const intDel = await Integration.deleteMany({ user: userId, brand: brandId, 'metadata._seedTag': PM_SEED_TAG });

        console.log(`🧹 PM seed cleanup: ${campDel.deletedCount} campaigns, ${repDel.deletedCount} reports, ${intDel.deletedCount} integrations`);
        res.json({ success: true, message: `Removed ${campDel.deletedCount} campaigns, ${repDel.deletedCount} reports, ${intDel.deletedCount} integrations` });
    } catch (error) {
        console.error('PM seed delete error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
