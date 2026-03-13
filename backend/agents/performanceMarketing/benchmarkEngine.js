/**
 * Industry Benchmarking Engine
 * 
 * Compares campaign performance against industry averages and competitor patterns.
 * Uses AI + historical data to generate contextual benchmarks.
 * 
 * Data sources:
 * 1. Internal AdLearning aggregate patterns
 * 2. AI-generated industry benchmarks (by vertical)
 * 3. Competitor ad intelligence from research data
 */

import AdCampaign from '../../models/AdCampaign.js';
import AdReport from '../../models/AdReport.js';
import AdLearning from '../../models/AdLearning.js';
import Brand from '../../models/Brand.js';
import { getRouter } from '../../ai/router.js';

// ══════════════════════════════════════════════════════════════════════════════
// INDUSTRY BENCHMARK DATA (2024-2025 Averages)
// ══════════════════════════════════════════════════════════════════════════════

const INDUSTRY_BENCHMARKS = {
    'ecommerce': {
        meta: { ctr: 1.20, cpc: 8.50, cpm: 75, roas: 2.5, conversionRate: 1.8 },
        google: { ctr: 2.80, cpc: 12.0, cpm: 45, roas: 3.2, conversionRate: 2.4 },
        label: 'E-commerce / D2C',
    },
    'fashion': {
        meta: { ctr: 1.40, cpc: 7.20, cpm: 70, roas: 2.8, conversionRate: 1.5 },
        google: { ctr: 3.10, cpc: 10.5, cpm: 40, roas: 2.9, conversionRate: 2.0 },
        label: 'Fashion & Apparel',
    },
    'beauty': {
        meta: { ctr: 1.35, cpc: 6.50, cpm: 65, roas: 3.0, conversionRate: 2.1 },
        google: { ctr: 2.90, cpc: 9.80, cpm: 42, roas: 3.5, conversionRate: 2.5 },
        label: 'Beauty & Personal Care',
    },
    'food': {
        meta: { ctr: 1.60, cpc: 5.80, cpm: 55, roas: 3.5, conversionRate: 2.8 },
        google: { ctr: 3.50, cpc: 8.20, cpm: 38, roas: 4.0, conversionRate: 3.2 },
        label: 'Food & Beverage',
    },
    'electronics': {
        meta: { ctr: 0.95, cpc: 12.0, cpm: 85, roas: 2.2, conversionRate: 1.2 },
        google: { ctr: 2.40, cpc: 15.0, cpm: 50, roas: 2.8, conversionRate: 1.8 },
        label: 'Electronics & Tech',
    },
    'health': {
        meta: { ctr: 1.25, cpc: 9.00, cpm: 80, roas: 2.6, conversionRate: 1.6 },
        google: { ctr: 3.20, cpc: 11.0, cpm: 44, roas: 3.0, conversionRate: 2.2 },
        label: 'Health & Wellness',
    },
    'education': {
        meta: { ctr: 1.10, cpc: 6.00, cpm: 50, roas: 4.0, conversionRate: 3.5 },
        google: { ctr: 3.80, cpc: 7.50, cpm: 35, roas: 5.0, conversionRate: 4.0 },
        label: 'Education & EdTech',
    },
    'saas': {
        meta: { ctr: 0.80, cpc: 15.0, cpm: 95, roas: 1.8, conversionRate: 0.9 },
        google: { ctr: 2.10, cpc: 18.0, cpm: 55, roas: 2.5, conversionRate: 1.5 },
        label: 'SaaS & Software',
    },
    'entertainment': {
        meta: { ctr: 1.80, cpc: 4.50, cpm: 45, roas: 2.0, conversionRate: 1.0 },
        google: { ctr: 3.60, cpc: 6.00, cpm: 30, roas: 2.5, conversionRate: 1.5 },
        label: 'Entertainment & Media',
    },
    'general': {
        meta: { ctr: 1.20, cpc: 8.00, cpm: 70, roas: 2.5, conversionRate: 1.8 },
        google: { ctr: 2.80, cpc: 10.0, cpm: 42, roas: 3.0, conversionRate: 2.2 },
        label: 'General / Cross-Industry Average',
    },
};


// ══════════════════════════════════════════════════════════════════════════════
// BENCHMARK COMPARISON
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Compare brand's campaign performance against industry benchmarks.
 */
export async function getBenchmarkComparison(userId, brandId) {
    // Get brand industry
    const brand = await Brand.findById(brandId).lean();
    const industry = detectIndustry(brand);
    const benchmarks = INDUSTRY_BENCHMARKS[industry] || INDUSTRY_BENCHMARKS['general'];

    // Get brand's aggregate performance
    const campaigns = await AdCampaign.find({
        user: userId,
        brand: brandId,
        status: { $in: ['active', 'completed'] },
        'performance.spend': { $gt: 0 },
    }).lean();

    if (campaigns.length === 0) {
        return {
            industry: benchmarks.label,
            benchmarks,
            message: 'No campaign data available yet. Launch campaigns to see your benchmark comparison.',
        };
    }

    // Separate by platform
    const metaCampaigns = campaigns.filter(c => c.platform === 'meta');
    const googleCampaigns = campaigns.filter(c => c.platform === 'google');

    const brandMetrics = {
        meta: aggregateMetrics(metaCampaigns),
        google: aggregateMetrics(googleCampaigns),
        all: aggregateMetrics(campaigns),
    };

    // Build comparison
    const comparison = {
        meta: buildComparison(brandMetrics.meta, benchmarks.meta, 'Meta Ads'),
        google: buildComparison(brandMetrics.google, benchmarks.google, 'Google Ads'),
    };

    // Overall score (0-100): how well you perform vs industry
    const overallScore = calculateBenchmarkScore(brandMetrics.all, {
        ...benchmarks.meta,
        ...benchmarks.google,
        ctr: (benchmarks.meta.ctr + benchmarks.google.ctr) / 2,
        roas: (benchmarks.meta.roas + benchmarks.google.roas) / 2,
    });

    return {
        industry: benchmarks.label,
        industryKey: industry,
        overallScore,
        grade: overallScore >= 85 ? 'A+' : overallScore >= 70 ? 'A' : overallScore >= 55 ? 'B' : overallScore >= 40 ? 'C' : 'D',
        brandMetrics,
        comparison,
        campaignsAnalyzed: campaigns.length,
        availableIndustries: Object.entries(INDUSTRY_BENCHMARKS).map(([k, v]) => ({ key: k, label: v.label })),
    };
}


/**
 * AI-enhanced benchmark analysis with contextual recommendations.
 */
export async function getAIBenchmarkInsights(userId, brandId) {
    const benchmarkData = await getBenchmarkComparison(userId, brandId);
    if (benchmarkData.message) return benchmarkData;

    // Get competitor intelligence
    const competitorReports = await AdReport.find({
        user: userId,
        brand: brandId,
        type: 'competitor-research',
    }).sort({ createdAt: -1 }).limit(3).lean();

    const competitorContext = competitorReports.map(r =>
        `Competitors: ${r.input?.competitors?.join(', ') || 'N/A'}. Key findings: ${r.aiAnalysis?.keyFindings?.join('; ') || 'N/A'}`
    ).join('\n');

    // Get historical learnings
    const learnings = await AdLearning.find({
        brand: brandId,
        status: 'active',
        type: { $in: ['campaign-result', 'competitor-pattern'] },
    }).limit(5).lean();

    const ai = getRouter();
    const systemPrompt = `You are a Performance Marketing Benchmark Analyst specializing in D2C brands in India.

Given:
- Brand's actual performance metrics vs industry benchmarks
- Competitor intelligence
- Historical AI learnings

Analyze gaps and provide STRATEGIC, MEASURABLE recommendations grounded in the data.

Return STRICT JSON:
{
  "analysis": {
    "strengths": ["Specific metric where brand outperforms industry — include exact numbers (e.g., 'CTR 3.4% vs industry 1.2% — 2.8x above benchmark')"],
    "weaknesses": ["Specific metric where brand underperforms — include gap size (e.g., 'ROAS 1.6x vs industry 2.5x — 36% below benchmark')"],
    "opportunities": ["Specific improvement with expected impact and timeline (e.g., 'Increase Meta Reels budget by 30% — expected to improve ROAS from 2.1x to 3.0x within 14 days based on current Reels CTR of 3.4%')"],
    "threats": ["Specific competitive or market risk with data backing (e.g., 'Competitor X spending 2x more on branded keywords — could erode search ROAS')"]
  },
  "competitiveGaps": [
    { "area": "Specific area", "currentPosition": "Exact current metric", "targetPosition": "Measurable target", "actionPlan": "Specific steps with timeline", "kpi": "What to measure", "proofMethod": "How to verify improvement" }
  ],
  "quarterlyGoals": [
    { "metric": "Specific metric name", "current": "Exact current value from data", "target": "Measurable target with reasoning", "strategy": "Specific tactics to achieve this — NOT generic", "proofMethod": "How to verify at quarter end" }
  ],
  "insights": "2-3 sentence executive summary referencing specific numbers from the data"
}

STRATEGIC RULE: Every item MUST reference specific numbers from the data. If an insight could apply to ANY brand, it's too generic — DELETE IT.`;

    try {
        const response = await ai.chat({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Industry: ${benchmarkData.industry}\nOverall Score: ${benchmarkData.overallScore}/100\n\nMeta comparison:\n${JSON.stringify(benchmarkData.comparison.meta, null, 2)}\n\nGoogle comparison:\n${JSON.stringify(benchmarkData.comparison.google, null, 2)}\n\nCompetitor context:\n${competitorContext || 'None'}\n\nLearnings:\n${learnings.map(l => l.insight.summary).join('; ') || 'None'}` },
            ],
            temperature: 0.5,
            response_format: { type: 'json_object' },
        });

        const text = response.choices?.[0]?.message?.content || '{}';
        const aiInsights = JSON.parse(text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());

        return { ...benchmarkData, aiInsights };
    } catch (e) {
        console.error('AI Benchmark insights failed:', e.message);
        return benchmarkData;
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function detectIndustry(brand) {
    const industry = (brand?.dna?.industry || brand?.industry || '').toLowerCase();
    const map = {
        'fashion': 'fashion', 'apparel': 'fashion', 'clothing': 'fashion',
        'beauty': 'beauty', 'cosmetics': 'beauty', 'skincare': 'beauty', 'personal care': 'beauty',
        'food': 'food', 'beverage': 'food', 'f&b': 'food', 'fmcg': 'food',
        'electronics': 'electronics', 'tech': 'electronics', 'gadgets': 'electronics',
        'health': 'health', 'wellness': 'health', 'fitness': 'health', 'pharma': 'health',
        'education': 'education', 'edtech': 'education',
        'saas': 'saas', 'software': 'saas', 'b2b': 'saas',
        'entertainment': 'entertainment', 'media': 'entertainment', 'ott': 'entertainment',
        'ecommerce': 'ecommerce', 'e-commerce': 'ecommerce', 'd2c': 'ecommerce', 'retail': 'ecommerce',
    };

    for (const [keyword, category] of Object.entries(map)) {
        if (industry.includes(keyword)) return category;
    }
    return 'general';
}

function aggregateMetrics(campaigns) {
    if (campaigns.length === 0) return null;

    const totals = campaigns.reduce((acc, c) => {
        const p = c.performance || {};
        acc.impressions += p.impressions || 0;
        acc.clicks += p.clicks || 0;
        acc.conversions += p.conversions || 0;
        acc.spend += p.spend || 0;
        acc.revenue += p.revenue || 0;
        return acc;
    }, { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0 });

    return {
        ctr: totals.impressions > 0 ? Math.round((totals.clicks / totals.impressions) * 10000) / 100 : 0,
        cpc: totals.clicks > 0 ? Math.round((totals.spend / totals.clicks) * 100) / 100 : 0,
        cpm: totals.impressions > 0 ? Math.round((totals.spend / totals.impressions) * 100000) / 100 : 0,
        roas: totals.spend > 0 ? Math.round((totals.revenue / totals.spend) * 100) / 100 : 0,
        conversionRate: totals.clicks > 0 ? Math.round((totals.conversions / totals.clicks) * 10000) / 100 : 0,
        totalSpend: totals.spend,
        totalRevenue: totals.revenue,
        campaigns: campaigns.length,
    };
}

function buildComparison(brandMetrics, industryBenchmark, platformLabel) {
    if (!brandMetrics) return { platform: platformLabel, message: 'No data for this platform yet.' };

    const metrics = ['ctr', 'cpc', 'cpm', 'roas', 'conversionRate'];
    const comparison = { platform: platformLabel, metrics: {} };

    for (const metric of metrics) {
        const yours = brandMetrics[metric] || 0;
        const industry = industryBenchmark[metric] || 0;
        const higherIsBetter = ['ctr', 'roas', 'conversionRate'].includes(metric);
        const diff = industry > 0 ? ((yours - industry) / industry * 100) : 0;

        comparison.metrics[metric] = {
            yours: Math.round(yours * 100) / 100,
            industry: industry,
            diff: `${diff > 0 ? '+' : ''}${Math.round(diff)}%`,
            verdict: higherIsBetter
                ? (diff > 10 ? '🟢 Above average' : diff > -10 ? '🟡 At average' : '🔴 Below average')
                : (diff < -10 ? '🟢 Below average (good)' : diff < 10 ? '🟡 At average' : '🔴 Above average (bad)'),
        };
    }

    return comparison;
}

function calculateBenchmarkScore(brandMetrics, industryBenchmark) {
    if (!brandMetrics) return 0;

    let score = 50;
    const compareUp = (yours, industry) => industry > 0 ? (yours / industry) : 1;
    const compareDown = (yours, industry) => industry > 0 ? (industry / yours) : 1;

    // ROAS (40% weight)
    const roasRatio = compareUp(brandMetrics.roas || 0, industryBenchmark.roas || 1);
    score += Math.min(20, Math.max(-20, (roasRatio - 1) * 40));

    // CTR (20% weight)
    const ctrRatio = compareUp(brandMetrics.ctr || 0, industryBenchmark.ctr || 1);
    score += Math.min(10, Math.max(-10, (ctrRatio - 1) * 20));

    // CPC (20% weight - lower is better)
    const cpcRatio = compareDown(brandMetrics.cpc || 999, industryBenchmark.cpc || 1);
    score += Math.min(10, Math.max(-10, (cpcRatio - 1) * 20));

    // Conversion rate (20% weight)
    const crRatio = compareUp(brandMetrics.conversionRate || 0, industryBenchmark.conversionRate || 1);
    score += Math.min(10, Math.max(-10, (crRatio - 1) * 20));

    return Math.max(0, Math.min(100, Math.round(score)));
}
