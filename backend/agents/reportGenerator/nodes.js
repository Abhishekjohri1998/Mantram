/**
 * Report Generator — Agent Nodes
 * 
 * Each node gathers studio-specific data and generates report sections via AI.
 * Pattern mirrors performanceMarketing/nodes.js: (state) → updatedState
 */

import SeoAudit from '../../models/SeoAudit.js';
import AdReport from '../../models/AdReport.js';
import AdCampaign from '../../models/AdCampaign.js';
import Funnel from '../../models/Funnel.js';
import FunnelEntry from '../../models/FunnelEntry.js';
import { getRouter } from '../../ai/router.js';
import { buildBrandContext, loadBrandContext } from '../shared/agentUtils.js';
import {
    REPORT_SECTIONS_PROMPT,
    SEO_REPORT_CONTEXT,
    PM_REPORT_CONTEXT,
    FUNNEL_REPORT_CONTEXT,
    D2C_REPORT_CONTEXT,
} from './prompts.js';

// buildBrandContext imported from agents/shared/agentUtils.js above


// ── Helper: Extract branding snapshot from brand DNA ──
function extractBranding(brand) {
    if (!brand) return {};
    const dna = brand.dna || {};
    const colors = dna.colors || [];
    const primaryColor = colors.find(c => c.usage === 'primary')?.hex ||
                         colors[0]?.hex || '#6366f1';
    const secondaryColor = colors.find(c => c.usage === 'secondary')?.hex ||
                           colors[1]?.hex || '#8b5cf6';
    const accentColor = colors.find(c => c.usage === 'accent')?.hex ||
                        colors[2]?.hex || '#ec4899';
    return {
        logo: dna.logo?.url || '',
        primaryColor,
        secondaryColor,
        accentColor,
        fontFamily: dna.fonts?.heading?.family || dna.fonts?.body?.family || 'Inter',
        brandName: brand.name || '',
        voiceStyle: dna.voice?.personality || '',
    };
}

// ── Helper: Call AI and parse JSON ──
async function callReportAgent(systemPrompt, userPrompt, temperature = 0.6) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: 12000,
    }); // Router auto-selects cheapest provider

    const text = result.text || '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn('Report Agent JSON parse failed, raw:', text.substring(0, 300));
    }
    return { error: 'Failed to parse report response', raw: text.substring(0, 500) };
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA GATHERERS — Pull studio-specific data
// ══════════════════════════════════════════════════════════════════════════════

async function gatherSEOData(userId, brandId, reportType) {
    try {
        const audits = await SeoAudit.find({
            user: userId,
            brand: brandId,
            status: 'completed',
        }).sort({ createdAt: -1 }).limit(5).lean();

        const latestHealthCheck = audits.find(a => a.type === 'health-check');
        const latestTraffic = audits.find(a => a.type === 'traffic');
        const latestCompetitors = audits.find(a => a.type === 'competitors');
        const latestAiVisibility = audits.find(a => a.type === 'ai-visibility');

        return {
            healthCheck: latestHealthCheck?.results || {},
            scores: latestHealthCheck?.scores || {},
            traffic: latestTraffic?.results || {},
            competitors: latestCompetitors?.results || {},
            aiVisibility: latestAiVisibility?.results || {},
            auditCount: audits.length,
            reportType,
        };
    } catch (err) {
        console.warn('SEO data gather failed:', err.message);
        return { reportType, note: 'Using AI-generated sample data' };
    }
}

async function gatherPMData(userId, brandId, reportType) {
    try {
        const [reports, campaigns] = await Promise.all([
            AdReport.find({ user: userId, brand: brandId })
                .sort({ createdAt: -1 }).limit(5).lean(),
            AdCampaign.find({ user: userId, brand: brandId })
                .sort({ createdAt: -1 }).limit(10).lean(),
        ]);

        const latestResearch = reports.find(r => r.type === 'competitor-research');
        const latestPerformance = reports.find(r => r.type === 'performance');

        return {
            research: latestResearch?.aiAnalysis || {},
            performance: latestPerformance?.performanceSnapshot || {},
            strategy: latestResearch?.strategyPlan || {},
            campaigns: campaigns.map(c => ({
                title: c.title,
                platform: c.platform,
                status: c.status,
                objective: c.objective,
                spend: c.performance?.spend || 0,
                impressions: c.performance?.impressions || 0,
                clicks: c.performance?.clicks || 0,
                conversions: c.performance?.conversions || 0,
                roas: c.performance?.roas || 0,
            })),
            reportType,
        };
    } catch (err) {
        console.warn('PM data gather failed:', err.message);
        return { reportType, note: 'Using AI-generated sample data' };
    }
}

async function gatherFunnelData(userId, brandId, reportType) {
    try {
        const funnels = await Funnel.find({
            user: userId,
            brand: brandId,
        }).sort({ createdAt: -1 }).limit(5).lean();

        let entries = [];
        if (funnels.length > 0) {
            entries = await FunnelEntry.find({
                funnel: { $in: funnels.map(f => f._id) },
            }).sort({ createdAt: -1 }).limit(50).lean();
        }

        // Aggregate stage counts
        const stageMap = {};
        entries.forEach(e => {
            const stage = e.stage || 'unknown';
            if (!stageMap[stage]) stageMap[stage] = { count: 0, value: 0 };
            stageMap[stage].count++;
            stageMap[stage].value += e.value || 0;
        });

        return {
            funnelCount: funnels.length,
            totalEntries: entries.length,
            funnels: funnels.map(f => ({
                name: f.name || f.title,
                stages: f.stages?.length || 0,
                template: f.template,
            })),
            stageBreakdown: stageMap,
            recentEntries: entries.slice(0, 10).map(e => ({
                name: e.name || e.email,
                stage: e.stage,
                value: e.value,
                score: e.score,
            })),
            reportType,
        };
    } catch (err) {
        console.warn('Funnel data gather failed:', err.message);
        return { reportType, note: 'Using AI-generated sample data' };
    }
}

async function gatherD2CData(userId, brandId, reportType) {
    // D2C data comes from Shopify analytics API calls
    // We construct a summary prompt since the data is fetched live
    try {
        const { getShopifyAnalytics } = await import('../../services/shopifyAnalytics.js');
        const analytics = await getShopifyAnalytics(userId, brandId);
        return {
            reportType,
            revenue: analytics.revenue || {},
            orders: analytics.orders || {},
            products: analytics.topProducts || [],
            customers: analytics.customerSegments || {},
        };
    } catch (err) {
        console.warn('D2C data gather failed:', err.message);
        return { reportType, note: 'Using AI-generated sample data' };
    }

}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN REPORT GENERATION NODE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a full branded report for any studio
 */
export async function generateReportNode(state) {
    const { studio, reportType, userId, brandId } = state;
    console.log(`📊 Report Generator: Generating ${studio}/${reportType} report...`);

    // 1. Load brand context (Redis-cached, 5-min TTL)
    const { brand } = brandId ? await loadBrandContext(brandId) : { brand: null };
    const brandContext = buildBrandContext(brand);
    const branding = extractBranding(brand);

    // 2. Gather studio-specific data
    let studioData = {};
    let studioContext = '';
    
    switch (studio) {
        case 'seo':
            studioData = await gatherSEOData(userId, brandId, reportType);
            
            // ── Fix 4: Compute summary stats deterministically before AI ──
            const pages = studioData.healthCheck?.pages || studioData.healthCheck?.pageReports || [];
            const si = studioData.healthCheck?.siteStats || {};
            
            studioData.computedSummary = {
                totalPages: si.pagesCrawled || pages.length,
                thinPages: si.thinPageCount || pages.filter(p => (p.wordCount || 0) < 300).length,
                noMetaPages: si.missingMetaDescCount || pages.filter(p => !p.metaDescription?.trim()).length,
                noH1Pages: si.missingH1Count || pages.filter(p => !p.hasH1).length,
                slowPages: si.slowPageCount || pages.filter(p => (p.responseTimeMs || p.responseTime) > 3000).length,
                headingSkipPages: si.headingSkippedCount || pages.filter(p => p.hasHeadingSkip || !p.headingHierarchyValid).length,
                duplicates: si.duplicateContentCount || 0,
                brokenInternal: si.brokenInternalCount || 0,
                technicalScore: studioData.scores?.technicalScore || 0,
                healthScore: studioData.scores?.seoHealth || 0,
            };

            studioContext = SEO_REPORT_CONTEXT(studioData, reportType);
            break;

        case 'pm':
            studioData = await gatherPMData(userId, brandId, reportType);
            studioContext = PM_REPORT_CONTEXT(studioData, reportType);
            break;
        case 'funnel':
            studioData = await gatherFunnelData(userId, brandId, reportType);
            studioContext = FUNNEL_REPORT_CONTEXT(studioData, reportType);
            break;
        case 'd2c':
            studioData = await gatherD2CData(userId, brandId, reportType);
            studioContext = D2C_REPORT_CONTEXT(studioData, reportType);
            break;
        default:
            studioContext = `STUDIO: ${studio}\nREPORT TYPE: ${reportType}\nGenerate a general marketing analytics report.`;
    }

    // 3. Generate report via AI
    const result = await callReportAgent(
        REPORT_SECTIONS_PROMPT(brandContext, studioContext),
        `Generate a comprehensive ${reportType} report for the ${studio.toUpperCase()} studio. Make it data-rich, visually engaging, and actionable.`,
        0.6
    );

    if (result.error) {
        return {
            ...state,
            status: 'failed',
            error: result.error,
        };
    }

    // 4. Assign order to sections
    const sections = (result.sections || []).map((s, i) => ({
        ...s,
        id: s.id || `section-${i}`,
        order: s.order || i,
        editable: s.type === 'text' || s.type === 'recommendations',
    }));

    return {
        ...state,
        title: result.title || `${studio.toUpperCase()} ${reportType} Report`,
        sections,
        narrative: result.narrative || {},
        slides: result.slides || [],
        branding,
        sourceData: studioData,
        status: 'complete',
    };
}
