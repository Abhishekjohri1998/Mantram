/**
 * Performance Marketing Studio — Agent Nodes
 * 
 * Each node: (state) → updatedState
 * Uses router (auto-selects cheapest provider) for AI analysis and strategy.
 */

import Brand from '../../models/Brand.js';
import AdCampaign from '../../models/AdCampaign.js';
import AdLearning from '../../models/AdLearning.js';
import Integration from '../../models/Integration.js';
import Product from '../../models/Product.js';
import { getRouter } from '../../ai/router.js';
import { agentUtils } from '../shared/agentUtils.js';
import {
    COMPETITOR_RESEARCH_PROMPT,
    STRATEGY_PROMPT,
    BUDGET_PLANNER_PROMPT,
    AD_CREATOR_PROMPT,
    AB_TEST_PROMPT,
    PERFORMANCE_ANALYST_PROMPT,
    REPORT_GENERATOR_PROMPT,
    PM_VISUAL_GROUNDING_PROMPT,
    PM_COMPETITOR_AD_ANALYSIS_PROMPT,
} from './prompts.js';
import { INDUSTRY_BENCHMARKS, detectIndustry } from './benchmarkEngine.js';
import { getKeywordTrends, getRelatedQueries } from './webIntelligence.js';
import { runKeywordIntelligence } from '../../utils/keyword-intelligence.js';
import { getSEOKeywordsForTargeting } from './crossStudioBridge.js';

// buildBrandContext imported from '../shared/agentUtils.js' above
// (canonical version — includes DNA, knowledge bank, product catalog, market rules)

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: COMPETITOR RESEARCH — Analyze competitor ads & strategies
// ══════════════════════════════════════════════════════════════════════════════
export async function competitorResearchNode(state) {
    console.log('🔍 PM Node: Competitor Research — analyzing...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);

    // Build prompt with live intelligence if available
    const trendContext = state.marketIntelligence?.contextString || '';
    const historicalContext = state.historicalContext || '';

    const userPrompt = [
        `RESEARCH QUERY: ${state.input?.query || 'Analyze competitor performance marketing strategies'}`,
        `COMPETITORS TO ANALYZE: ${(state.input?.competitors || []).join(', ') || 'Top competitors in this industry'}`,
        `PLATFORMS: ${(state.input?.platforms || ['meta', 'google']).join(', ')}`,
        `INDUSTRY: ${state.industry || 'general'}`,
        '',
        state.input?.query ? `USER'S SPECIFIC REQUEST: "${state.input.query}"` : '',
        '',
        // Inject live Google Trends data
        trendContext ? `\n${trendContext}\n` : '',
        // Inject historical learnings
        historicalContext ? `\n── HISTORICAL LEARNINGS ──\n${historicalContext}\n` : '',
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callAgent(
        COMPETITOR_RESEARCH_PROMPT(brandContext),
        userPrompt,
        0.6
    );

    return {
        ...state,
        researchData: {
            competitorAds: state.externalAds || [],
            marketTrends: result.adPatterns ? Object.values(result.adPatterns).flat() : [],
            keyInsights: result.gaps || [],
            competitorProfiles: result.competitorProfiles || [],
            adPatterns: result.adPatterns || {},
            opportunities: result.gaps || [],
            trendData: state.marketIntelligence?.keywordTrends || [],
        },
        aiAnalysis: {
            ...(state.aiAnalysis || {}),
            keyFindings: result.recommendations?.map(r => r.title || r) || [],
            recommendations: (result.recommendations || []).map(r =>
                typeof r === 'string' ? { title: r, description: '', priority: 'medium', estimatedImpact: '' }
                    : { title: r.title || r, description: r.description || r.rationale || '', priority: r.priority || 'medium', estimatedImpact: r.estimatedImpact || '' }
            ),
        },
        status: 'analyzing',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER: Collect real data for strategy & budget nodes
// ══════════════════════════════════════════════════════════════════════════════
async function collectPMIntelligence(brandId, userId, industry, platforms, targetGeo) {
    const intel = { benchmarks: null, trends: [], learnings: [], liveCampaigns: [], relatedQueries: null, keywordIntel: null, seoKeywords: null, competitorIntel: null };

    try {
        // 1. Industry benchmarks (REAL data — hardcoded from industry reports)
        const industryKey = detectIndustry({ dna: { industry } });
        intel.benchmarks = INDUSTRY_BENCHMARKS[industryKey] || INDUSTRY_BENCHMARKS['general'];
        intel.industryLabel = intel.benchmarks.label;
        intel.industryKey = industryKey;

        // 2. Google Trends — live keyword demand signals
        const brand = brandId ? await Brand.findById(brandId).lean() : null;
        const keywords = [
            brand?.name,
            ...(brand?.dna?.keywords || []),
            ...(brand?.competitors || []).filter(c => typeof c === 'string'),
            industry,
        ].filter(Boolean).slice(0, 5);
        if (keywords.length) {
            try {
                const [trends, related] = await Promise.all([
                    getKeywordTrends(keywords, 'IN'),
                    getRelatedQueries(keywords[0], 'IN'),
                ]);
                intel.trends = trends.filter(t => !t.error);
                intel.relatedQueries = related;
            } catch (e) { console.warn('[PM-INTEL] Trends fetch failed:', e.message); }
        }

        // 3. Historical learnings from past campaigns
        if (brandId) {
            try {
                intel.learnings = await AdLearning.find({
                    brand: brandId, status: 'active',
                }).sort({ createdAt: -1 }).limit(5).lean();
            } catch (e) { console.warn('[PM-INTEL] Learnings fetch failed:', e.message); }
        }

        // 4. Live campaign data (if any exist)
        if (userId && brandId) {
            try {
                intel.liveCampaigns = await AdCampaign.find({
                    user: userId, brand: brandId,
                    'performance.spend': { $gt: 0 },
                }).sort({ updatedAt: -1 }).limit(10).lean();
            } catch (e) { console.warn('[PM-INTEL] Live campaigns fetch failed:', e.message); }
        }

        // 5. Keyword Intelligence — 12-layer engine with CPC estimates (for Google Ads strategy)
        if (brand && platforms?.includes('google')) {
            try {
                const kwResult = await runKeywordIntelligence(brand, { seedKeywords: keywords.slice(0, 5), maxKeywords: 30 });
                if (kwResult?.success) {
                    intel.keywordIntel = {
                        analyst: kwResult.analyst,         // CPC estimates, volumes, difficulty, clusters
                        strategist: kwResult.strategist,   // must-target, avoid, hidden gems
                        discoveredCount: kwResult.meta?.totalKeywordsDiscovered || 0,
                        dataLayers: kwResult.meta?.dataLayers || {},
                    };
                }
            } catch (e) { console.warn('[PM-INTEL] Keyword intelligence failed (non-fatal):', e.message); }
        }

        // 6. SEO Cross-Studio Keywords — organic keywords to target/avoid in paid
        if (brandId) {
            try {
                intel.seoKeywords = await getSEOKeywordsForTargeting(brandId);
            } catch (e) { console.warn('[PM-INTEL] SEO keywords fetch failed:', e.message); }
        }

        // 7. Competitor Intelligence — pull existing competitor research from AdReport
        if (brandId) {
            try {
                const competitorReport = await AdReport.findOne({
                    brand: brandId,
                    type: 'research',
                    'researchData.competitorProfiles': { $exists: true, $ne: [] },
                }).sort({ createdAt: -1 }).lean();
                if (competitorReport?.researchData) {
                    intel.competitorIntel = {
                        profiles: competitorReport.researchData.competitorProfiles || [],
                        adPatterns: competitorReport.researchData.adPatterns || competitorReport.aiAnalysis?.adPatterns || {},
                        gaps: competitorReport.researchData.gaps || competitorReport.aiAnalysis?.gaps || [],
                        recommendations: competitorReport.aiAnalysis?.recommendations || [],
                        researchAge: Math.floor((Date.now() - new Date(competitorReport.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
                    };
                }
            } catch (e) { console.warn('[PM-INTEL] Competitor intel fetch failed:', e.message); }
        }

    } catch (e) {
        console.warn('[PM-INTEL] Data collection failed (non-fatal):', e.message);
    }

    return intel;
}

function formatPMIntelligence(intel, platforms, targetGeo) {
    const sections = [];

    // 1. Industry benchmarks (VERIFIED data)
    if (intel.benchmarks) {
        const b = intel.benchmarks;
        sections.push(`═══ INDUSTRY BENCHMARKS (${intel.industryLabel} — verified data, use these as baseline) ═══`);
        if (platforms?.includes('meta') || !platforms?.length) {
            sections.push(`META ADS:\n  CTR: ${b.meta.ctr}%  |  CPC: ₹${b.meta.cpc}  |  CPM: ₹${b.meta.cpm}  |  ROAS: ${b.meta.roas}x  |  Conv Rate: ${b.meta.conversionRate}%`);
        }
        if (platforms?.includes('google') || !platforms?.length) {
            sections.push(`GOOGLE ADS:\n  CTR: ${b.google.ctr}%  |  CPC: ₹${b.google.cpc}  |  CPM: ₹${b.google.cpm}  |  ROAS: ${b.google.roas}x  |  Conv Rate: ${b.google.conversionRate}%`);
        }
        sections.push('⚠️ Use these EXACT benchmark numbers as baselines. Do NOT invent different numbers.');
    }

    // 2. Google Trends (LIVE data)
    if (intel.trends?.length) {
        const trendLines = intel.trends.map(t =>
            `• "${t.keyword}": interest=${t.currentInterest}/100, trend=${t.trend} (${t.trendStrength > 0 ? '+' : ''}${t.trendStrength}%), peak=${t.peakInterest}`
        ).join('\n');
        sections.push(`═══ GOOGLE TRENDS (live keyword demand — real data) ═══\n${trendLines}`);
    }
    if (intel.relatedQueries?.risingQueries?.length) {
        const rising = intel.relatedQueries.risingQueries.slice(0, 5).map(q => `• "${q.query}" — ${q.value}`).join('\n');
        sections.push(`RISING SEARCH QUERIES:\n${rising}`);
    }

    // 3. KEYWORD INTELLIGENCE — Categorized keyword table
    if (intel.keywordIntel?.analyst?.keywordAnalysis?.length) {
        const allKw = intel.keywordIntel.analyst.keywordAnalysis;

        // Categorize keywords
        const categories = {
            'BRANDED': [],
            'GENERIC (High Intent)': [],
            'LONG-TAIL (Low Competition)': [],
            'COMPETITOR': [],
            'VERNACULAR / LOCAL': [],
            'AWARENESS (Informational)': [],
        };

        for (const kw of allKw) {
            const k = (kw.keyword || '').toLowerCase();
            const intent = (kw.intent || '').toLowerCase();
            const difficulty = Number(kw.difficulty) || 50;
            const words = k.split(/\s+/).length;

            if (intent === 'navigational' || kw.entityCluster?.toLowerCase()?.includes('brand')) {
                categories['BRANDED'].push(kw);
            } else if (/\b(hindi|marathi|tamil|bengali|telugu|kannada|malayalam|gujarati|punjabi)\b/.test(k) || /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F]/.test(k)) {
                categories['VERNACULAR / LOCAL'].push(kw);
            } else if (intent === 'transactional' || intent === 'commercial') {
                if (words >= 4 && difficulty < 40) {
                    categories['LONG-TAIL (Low Competition)'].push(kw);
                } else {
                    categories['GENERIC (High Intent)'].push(kw);
                }
            } else if (intent === 'informational') {
                categories['AWARENESS (Informational)'].push(kw);
            } else if (difficulty < 35 && words >= 3) {
                categories['LONG-TAIL (Low Competition)'].push(kw);
            } else {
                categories['GENERIC (High Intent)'].push(kw);
            }
        }

        sections.push(`═══ KEYWORD RESEARCH — ${intel.keywordIntel.discoveredCount} keywords from 12 sources ═══`);
        sections.push(`GEO CONTEXT: ${targetGeo || 'Pan India'}`);

        for (const [cat, keywords] of Object.entries(categories)) {
            if (!keywords.length) continue;
            const table = keywords.slice(0, 8).map(kw =>
                `  | ${kw.keyword.padEnd(35)} | Vol: ${String(kw.estimatedMonthlyVolume || 'N/A').padEnd(8)} | CPC: ${String(kw.cpc_estimate || 'N/A').padEnd(8)} | Diff: ${String(kw.difficulty || 'N/A').padStart(3)}/100 | Intent: ${(kw.intent || 'N/A').padEnd(14)} | Stage: ${kw.buyerJourney || 'N/A'} |`
            ).join('\n');
            sections.push(`\n📂 ${cat} (${keywords.length} keywords):\n  | ${'Keyword'.padEnd(35)} | ${'Volume'.padEnd(14)} | ${'CPC'.padEnd(14)} | ${'Difficulty'.padEnd(10)} | ${'Intent'.padEnd(20)} | ${'Stage'.padEnd(12)} |\n${table}`);
        }

        // Topic clusters
        if (intel.keywordIntel.analyst.topicClusters?.length) {
            const clusters = intel.keywordIntel.analyst.topicClusters
                .slice(0, 5)
                .map(c => `• Cluster: "${c.cluster}" — Pillar: "${c.pillarKeyword}", Total Vol: ${c.totalEstimatedVolume}/mo, Gap: ${c.competitiveGap || 'N/A'}`)
                .join('\n');
            sections.push(`KEYWORD CLUSTERS:\n${clusters}`);
        }
    }

    // 4. Strategist recommendations — must-target / avoid / hidden gems
    if (intel.keywordIntel?.strategist) {
        const s = intel.keywordIntel.strategist;
        if (s.mustTarget?.length) {
            const must = s.mustTarget.slice(0, 8).map(k => `• "${k.keyword}" (${k.volume}/mo) — ${k.why}`).join('\n');
            sections.push(`═══ MUST-TARGET KEYWORDS (CMO recommendation) ═══\n${must}`);
        }
        if (s.avoid?.length) {
            const avoid = s.avoid.slice(0, 5).map(k => `• "${k.keyword}" (${k.volume}/mo) — ⛔ ${k.why}`).join('\n');
            sections.push(`KEYWORDS TO AVOID:\n${avoid}`);
        }
        if (s.hiddenGems?.length) {
            const gems = s.hiddenGems.slice(0, 5).map(k => `• "${k.keyword}" (${k.volume}/mo) — 💎 ${k.why}`).join('\n');
            sections.push(`HIDDEN GEM KEYWORDS:\n${gems}`);
        }
    }

    // 5. SEO cross-studio keywords
    if (intel.seoKeywords?.suggestedForPaid?.length) {
        const seoKws = intel.seoKeywords.suggestedForPaid.slice(0, 10).map(k => `• "${k}"`).join('\n');
        sections.push(`═══ SEO KEYWORDS FOR PAID TARGETING (from SEO Studio — organic data) ═══\n${seoKws}`);
        if (intel.seoKeywords.cannibalizationWarning) {
            sections.push(intel.seoKeywords.cannibalizationWarning);
        }
    }

    // 6. COMPETITOR INTELLIGENCE (from previous competitor research)
    if (intel.competitorIntel?.profiles?.length) {
        sections.push(`═══ COMPETITOR INTELLIGENCE (from live research — ${intel.competitorIntel.researchAge || 0} days ago) ═══`);

        for (const comp of intel.competitorIntel.profiles.slice(0, 5)) {
            sections.push(`\n🏢 ${comp.name || 'Unknown'}:\n  Platforms: ${comp.platforms || comp.primary_platforms || 'N/A'}\n  Est. Monthly Spend: ${comp.estimatedMonthlySpend || comp.estimated_monthly_ad_spend_range || 'N/A'}\n  Ad Formats: ${comp.dominantFormats || comp.dominant_ad_formats || 'N/A'}\n  Messaging: ${comp.messagingThemes || comp.messaging_themes || 'N/A'}\n  Target Audience: ${comp.targetAudience || comp.target_audience_signals || 'N/A'}`);
        }

        if (intel.competitorIntel.gaps?.length) {
            const gaps = (Array.isArray(intel.competitorIntel.gaps) ? intel.competitorIntel.gaps : [intel.competitorIntel.gaps])
                .slice(0, 5)
                .map(g => typeof g === 'string' ? `• ${g}` : `• ${g.gap || g.title || JSON.stringify(g)}`)
                .join('\n');
            sections.push(`\nCOMPETITOR GAPS (opportunities to exploit):\n${gaps}`);
        }

        if (intel.competitorIntel.adPatterns) {
            const patterns = intel.competitorIntel.adPatterns;
            if (patterns.commonFormats || patterns.most_common_ad_formats) {
                sections.push(`Ad Format Trends: ${JSON.stringify(patterns.commonFormats || patterns.most_common_ad_formats)}`);
            }
            if (patterns.messagingHooks || patterns.messaging_hooks_that_appear_repeatedly) {
                sections.push(`Winning Hooks: ${JSON.stringify(patterns.messagingHooks || patterns.messaging_hooks_that_appear_repeatedly)}`);
            }
        }

        sections.push('\n⚠️ Use this competitor data to create a strategy BETTER than theirs. Exploit their gaps.');
    }

    // 7. Historical learnings
    if (intel.learnings?.length) {
        const learnings = intel.learnings.map(l => `• ${l.insight?.summary || l.title || 'N/A'}`).join('\n');
        sections.push(`═══ HISTORICAL LEARNINGS (from past campaigns — real data) ═══\n${learnings}`);
    }

    // 8. Live campaign data
    if (intel.liveCampaigns?.length) {
        const campaigns = intel.liveCampaigns.map(c => {
            const p = c.performance || {};
            return `• [${c.platform}] "${c.title}" — Spend: ₹${p.spend || 0}, Clicks: ${p.clicks || 0}, Conv: ${p.conversions || 0}, ROAS: ${p.roas || 0}x`;
        }).join('\n');
        sections.push(`═══ LIVE CAMPAIGN DATA (actual performance — real data) ═══\n${campaigns}`);
    } else {
        sections.push('═══ LIVE CAMPAIGN DATA ═══\nNo active campaigns with spend data. Use industry benchmarks as baseline.');
    }

    return sections.join('\n\n');
}


// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: STRATEGY — Generate multi-platform marketing strategy (DATA-DRIVEN)
// ══════════════════════════════════════════════════════════════════════════════
export async function strategyNode(state) {
    console.log('📋 PM Node: Strategy — building expert data-driven plan...');

    const { brand, brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const industry = brand?.dna?.industry || brand?.industry || state.input?.query || '';
    const platforms = state.input?.platforms || ['meta', 'google'];
    const goals = Array.isArray(state.input?.goals) ? state.input.goals : [state.input?.objective || 'traffic'];
    const currency = state.input?.currency || 'INR';
    const customKeywords = Array.isArray(state.input?.customKeywords) ? state.input.customKeywords : [];

    // Collect REAL data before calling AI (benchmarks + trends + keywords + SEO + competitors + campaigns)
    const intel = await collectPMIntelligence(state.brandId, state.userId, industry, platforms, state.input?.targetGeo);
    const dataContext = formatPMIntelligence(intel, platforms, state.input?.targetGeo);
    console.log(`[PM-STRATEGY] Data collected: benchmarks=${intel.industryLabel || 'general'}, trends=${intel.trends.length}, keywords=${intel.keywordIntel?.discoveredCount || 0}, seo=${intel.seoKeywords?.suggestedForPaid?.length || 0}, competitors=${intel.competitorIntel?.profiles?.length || 0}, learnings=${intel.learnings.length}, campaigns=${intel.liveCampaigns.length}, customKeywords=${customKeywords.length}`);

    const userPrompt = [
        `CAMPAIGN GOALS: ${goals.join(', ')}`,
        `TOTAL BUDGET: ${state.input?.budget || 'Not specified'} ${currency}`,
        `CURRENCY: ${currency} — USE THIS CURRENCY for ALL monetary values (budgets, CPCs, CPMs, amounts). Do NOT use ₹ unless currency is INR.`,
        `DURATION: ${state.input?.duration || '30 days'}`,
        `TARGET PLATFORMS: ${platforms.join(', ')}`,
        state.input?.targetAudience ? `TARGET AUDIENCE: ${state.input.targetAudience}` : '',
        state.input?.targetGeo ? `TARGET LOCATION: ${state.input.targetGeo}` : '',
        '',
        customKeywords.length > 0 ? [
            '══════════════ USER-SPECIFIED KEYWORDS (MUST INCLUDE IN KEYWORD TABLE) ══════════════',
            ...customKeywords.map((kw, i) => `${i + 1}. "${kw}"`),
            'IMPORTANT: You MUST include ALL of these keywords in the keywordTable with real CPC estimates and volume data.',
            'Research each one and provide accurate data. These are the user\'s priority keywords.',
            '',
        ].join('\n') : '',
        '══════════════ REAL DATA & BENCHMARKS ══════════════',
        dataContext,
        '',
        '── COMPETITOR RESEARCH FINDINGS ──',
        state.researchData?.competitorProfiles ?
            `Competitors analyzed: ${state.researchData.competitorProfiles.length}` : '',
        state.aiAnalysis?.keyFindings?.length ?
            `Key findings: ${state.aiAnalysis.keyFindings.join('; ')}` : '',
        '',
        state.input?.query ? `USER'S GOAL: "${state.input.query}"` : '',
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callAgent(
        STRATEGY_PROMPT(brandContext, currency),
        userPrompt,
        0.5
    );

    // Normalize goals — now expect objects with confidence scores
    const normalizedGoals = (Array.isArray(result.goals) ? result.goals : (result.goals ? [result.goals] : []))
        .map(g => {
            if (typeof g === 'string') return { goal: g, metric: '', target: '', confidenceScore: 5 };
            return {
                goal: g.goal || g.name || g.title || JSON.stringify(g),
                metric: g.metric || '',
                currentBaseline: g.currentBaseline || '',
                target: g.target || '',
                timeframe: g.timeframe || '',
                confidenceScore: Number(g.confidenceScore) || 5,
                confidenceReason: g.confidenceReason || '',
                riskFactors: Array.isArray(g.riskFactors) ? g.riskFactors : [],
                planB: g.planB || '',
            };
        });

    // Normalize platform breakout
    const metaBreakout = result.platformBreakout?.meta || result.metaBreakout || null;
    const googleBreakout = result.platformBreakout?.google || result.googleBreakout || null;

    return {
        ...state,
        strategyPlan: {
            goals: normalizedGoals,
            channelAllocation: (Array.isArray(result.channelAllocation) ? result.channelAllocation : []).map(ch => ({
                channel: ch.channel || ch.name || '',
                budgetPercent: ch.budgetPercent || ch.percent || 0,
                rationale: ch.rationale || '',
                expectedMetrics: ch.expectedMetrics || {},
            })),
            platformBreakout: {
                meta: metaBreakout ? {
                    budgetPercent: metaBreakout.budgetPercent || 0,
                    budgetAmount: metaBreakout.budgetAmount || '',
                    campaigns: Array.isArray(metaBreakout.campaigns) ? metaBreakout.campaigns : [],
                    expectedMetrics: metaBreakout.expectedMetrics || {},
                    projections: metaBreakout.projections || {},
                    audienceTargeting: metaBreakout.audienceTargeting || [],
                    creativeFormats: metaBreakout.creativeFormats || [],
                    adCopyAngles: metaBreakout.adCopyAngles || [],
                    rationale: metaBreakout.rationale || '',
                } : null,
                google: googleBreakout ? {
                    budgetPercent: googleBreakout.budgetPercent || 0,
                    budgetAmount: googleBreakout.budgetAmount || '',
                    campaigns: Array.isArray(googleBreakout.campaigns) ? googleBreakout.campaigns : [],
                    expectedMetrics: googleBreakout.expectedMetrics || {},
                    projections: googleBreakout.projections || {},
                    keywordPlan: Array.isArray(googleBreakout.keywordPlan) ? googleBreakout.keywordPlan : [],
                    biddingStrategy: googleBreakout.biddingStrategy || '',
                    adExtensions: googleBreakout.adExtensions || [],
                    rationale: googleBreakout.rationale || '',
                } : null,
            },
            keywordStrategy: result.keywordStrategy || null,
            competitiveEdge: result.competitiveEdge || null,
            locationStrategy: result.locationStrategy || null,
            timeline: (Array.isArray(result.timeline) ? result.timeline : (result.timeline ? Object.values(result.timeline) : [])).map(phase => ({
                phase: phase?.phase || phase?.name || '',
                duration: phase?.duration || '',
                activities: Array.isArray(phase?.activities) ? phase.activities : [],
            })),
            kpis: (Array.isArray(result.kpis) ? result.kpis : []).map(kpi => ({
                metric: kpi.metric || kpi.name || '',
                target: String(kpi.target || ''),
                current: String(kpi.current || 'N/A'),
                source: kpi.source || 'benchmark',
                monitoringFrequency: kpi.monitoringFrequency || '',
                alertThreshold: kpi.alertThreshold || '',
            })),
            audiences: Array.isArray(result.audiences) ? result.audiences : [],
            creativeStrategy: result.creativeStrategy || {},
            achievabilityAudit: result.achievabilityAudit || null,
        },
        status: 'strategy',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: BUDGET PLANNER — Allocate budget (DATA-DRIVEN with benchmarks)
// ══════════════════════════════════════════════════════════════════════════════
export async function budgetPlannerNode(state) {
    console.log('💰 PM Node: Budget Planner — allocating with real benchmarks...');

    const { brand, brandContext } = await agentUtils.loadBrandContext(state.brandId);
    const industry = brand?.dna?.industry || brand?.industry || '';
    const platforms = state.input?.platforms || ['meta', 'google'];

    // Get industry benchmarks for realistic projections
    const industryKey = detectIndustry({ dna: { industry } });
    const benchmarks = INDUSTRY_BENCHMARKS[industryKey] || INDUSTRY_BENCHMARKS['general'];

    const benchmarkContext = [
        `═══ INDUSTRY BENCHMARKS (${benchmarks.label} — use for projections) ═══`,
        platforms.includes('meta') || !platforms.length ? `META: CPC=₹${benchmarks.meta.cpc}, CPM=₹${benchmarks.meta.cpm}, CTR=${benchmarks.meta.ctr}%, ROAS=${benchmarks.meta.roas}x, ConvRate=${benchmarks.meta.conversionRate}%` : '',
        platforms.includes('google') || !platforms.length ? `GOOGLE: CPC=₹${benchmarks.google.cpc}, CPM=₹${benchmarks.google.cpm}, CTR=${benchmarks.google.ctr}%, ROAS=${benchmarks.google.roas}x, ConvRate=${benchmarks.google.conversionRate}%` : '',
        '⚠️ Calculate projections using THESE benchmark numbers. Show your math.',
    ].filter(Boolean).join('\n');

    const userPrompt = [
        `TOTAL BUDGET: ${state.input?.budget || 50000} ${state.input?.currency || 'INR'}`,
        `DURATION: ${state.input?.duration || '30 days'}`,
        `OBJECTIVE: ${state.input?.objective || 'traffic'}`,
        '',
        benchmarkContext,
        '',
        '── STRATEGY ──',
        `Goals: ${(state.strategyPlan?.goals || []).join('; ')}`,
        `Channel allocation: ${(state.strategyPlan?.channelAllocation || []).map(c => `${c.channel}: ${c.budgetPercent}%`).join(', ')}`,
        '',
        '── RESEARCH CONTEXT ──',
        state.aiAnalysis?.keyFindings?.length ?
            `Market insights: ${state.aiAnalysis.keyFindings.slice(0, 3).join('; ')}` : '',
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callAgent(
        BUDGET_PLANNER_PROMPT(brandContext),
        userPrompt,
        0.3
    );

    return {
        ...state,
        budgetPlan: {
            totalBudget: state.input?.budget || 50000,
            currency: state.input?.currency || 'INR',
            duration: state.input?.duration || '30 days',
            allocation: (Array.isArray(result.allocation) ? result.allocation : []).map(a => ({
                platform: a.platform || '',
                campaign: a.campaign || a.campaignName || '',
                amount: a.dailyBudget || a.amount || 0,
                expectedRoas: a.expectedRoas || a.roi || 0,
            })),
            projections: result.projections || {},
            optimizationRules: Array.isArray(result.optimizationRules) ? result.optimizationRules : [],
            scenarioAnalysis: Array.isArray(result.scenarioAnalysis) ? result.scenarioAnalysis : [],
        },
        status: 'budget',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 4: AD CREATOR — Generate ad creative variants
// ══════════════════════════════════════════════════════════════════════════════
export async function adCreatorNode(state) {
    console.log('🎨 PM Node: Ad Creator — generating creatives...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);

    const userPrompt = [
        `CAMPAIGN OBJECTIVE: ${state.input?.objective || 'traffic'}`,
        `TARGET PLATFORMS: ${(state.input?.platforms || ['meta']).join(', ')}`,
        '',
        '── STRATEGY CONTEXT ──',
        `Target audiences: ${(state.strategyPlan?.audiences || []).map(a => a.name || a).join(', ')}`,
        `Creative strategy: ${JSON.stringify(state.strategyPlan?.creativeStrategy || {}).substring(0, 500)}`,
        '',
        '── BRAND VOICE ──',
        `Keep all copy aligned with the brand's tone and messaging.`,
        '',
        state.input?.query ? `SPECIFIC DIRECTION: "${state.input.query}"` : '',
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callAgent(
        AD_CREATOR_PROMPT(brandContext),
        userPrompt,
        0.8 // Higher creativity for ad copy
    );

    return {
        ...state,
        adCreatives: (result.variants || []).map(v => ({
            name: v.name || `Variant ${v.platform || 'A'}`,
            format: v.format || 'image',
            headline: v.headline || '',
            primaryText: v.primaryText || '',
            description: v.description || '',
            cta: v.cta || 'Learn More',
            visualDirection: v.visualDirection || '',
            platform: v.platform || 'meta',
            hook: v.hook || '',
            targetAudience: v.targetAudience || '',
            searchHeadlines: v.searchHeadlines || [],
            searchDescriptions: v.searchDescriptions || [],
            aiGenerated: true,
        })),
        status: 'ad-creation',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 5: A/B TEST DESIGNER — Design experiments
// ══════════════════════════════════════════════════════════════════════════════
export async function abTestDesignerNode(state) {
    console.log('🧪 PM Node: A/B Test Designer — designing experiment...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);

    const creativesSummary = (state.adCreatives || [])
        .map((c, i) => `Variant ${i + 1}: "${c.headline}" — ${c.hook}`)
        .join('\n');

    const userPrompt = [
        `AVAILABLE AD CREATIVES:`,
        creativesSummary,
        '',
        `CAMPAIGN OBJECTIVE: ${state.input?.objective || 'traffic'}`,
        `DAILY BUDGET: ${state.budgetPlan?.allocation?.[0]?.amount || 1000} ${state.budgetPlan?.currency || 'INR'}`,
    ].join('\n');

    const result = await agentUtils.callAgent(
        AB_TEST_PROMPT(brandContext),
        userPrompt,
        0.4
    );

    return {
        ...state,
        abTestPlan: result,
        status: 'review',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 6: PERFORMANCE ANALYST — Analyze campaign performance
// ══════════════════════════════════════════════════════════════════════════════
export async function performanceAnalystNode(state) {
    console.log('📊 PM Node: Performance Analyst — analyzing data...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);

    const userPrompt = [
        `CAMPAIGN PERFORMANCE DATA:`,
        JSON.stringify(state.performanceData || state.performanceSnapshot || {}, null, 2).substring(0, 3000),
        '',
        `CAMPAIGN DETAILS:`,
        `Platform: ${state.platform || 'meta'}`,
        `Objective: ${state.input?.objective || 'traffic'}`,
        `Budget: ${state.budgetPlan?.totalBudget || 'unknown'} ${state.budgetPlan?.currency || 'INR'}`,
    ].join('\n');

    const result = await agentUtils.callAgent(
        PERFORMANCE_ANALYST_PROMPT(brandContext),
        userPrompt,
        0.4
    );

    return {
        ...state,
        aiAnalysis: {
            summary: result.summaryHeadline || '',
            keyFindings: result.keyMetrics ? Object.values(result.keyMetrics).map(String) : [],
            opportunities: result.opportunities || [],
            threats: result.riskAlerts || [],
            recommendations: (result.recommendations || []).map(r =>
                typeof r === 'string' ? { title: r, description: '', priority: 'medium', estimatedImpact: '' }
                    : { title: r.title || r, description: r.description || '', priority: r.priority || 'medium', estimatedImpact: r.expectedImpact || r.estimatedImpact || '' }
            ),
            actionItems: (result.budgetRecommendations || []).map(r => ({
                action: typeof r === 'string' ? r : r.action || r.title || '',
                deadline: '',
                platform: '',
            })),
        },
        status: 'complete',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 7: REPORT GENERATOR — Create executive-ready reports
// ══════════════════════════════════════════════════════════════════════════════
export async function reportGeneratorNode(state) {
    console.log('📄 PM Node: Report Generator — creating report...');

    const { brandContext } = await agentUtils.loadBrandContext(state.brandId);

    const userPrompt = [
        `REPORT TYPE: ${state.type || 'performance'}`,
        '',
        '── PERFORMANCE DATA ──',
        JSON.stringify(state.performanceSnapshot || {}, null, 2).substring(0, 2000),
        '',
        '── AI ANALYSIS ──',
        `Summary: ${state.aiAnalysis?.summary || 'No analysis available'}`,
        `Key findings: ${(state.aiAnalysis?.keyFindings || []).join('; ')}`,
        `Recommendations: ${(state.aiAnalysis?.recommendations || []).map(r => r.title).join('; ')}`,
        '',
        '── STRATEGY CONTEXT ──',
        `Goals: ${(state.strategyPlan?.goals || []).join('; ')}`,
        `KPIs: ${(state.strategyPlan?.kpis || []).map(k => `${k.metric}: ${k.target}`).join(', ')}`,
    ].join('\n');

    const result = await agentUtils.callAgent(
        REPORT_GENERATOR_PROMPT(brandContext),
        userPrompt,
        0.5
    );

    return {
        ...state,
        report: result,
        title: result.title || state.title,
        status: 'complete',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// MCoT: PM VISUAL GROUNDING NODE (Phase 4)
// Analyzes brand/product images to produce ad-creative-specific context
// that grounds the Ad Creator Node in visually accurate product detail.
// Non-blocking — skips gracefully if no images available.
// ══════════════════════════════════════════════════════════════════════════════
export async function pmVisualGroundingNode(state) {
    if (!state.brandId) {
        console.log('🖼️ PM MCoT: No brandId — skipping visual grounding');
        return state;
    }

    console.log('🧠 PM MCoT: Visual grounding — fetching brand/product images...');
    try {
        // Use cached loadBrandContext — avoids raw Brand.findById on every MCoT call
        const { brand } = await agentUtils.loadBrandContext(state.brandId);
        if (!brand) return state;

        const imageUrls = [];
        const dna = brand.dna || {};

        // Brand logo
        if (dna.logo?.url) imageUrls.push(dna.logo.url);

        // Brand DNA visual images
        const dnaImages = dna.images || dna.brandImages || [];
        dnaImages.slice(0, 2).forEach(img => {
            const url = typeof img === 'string' ? img : img?.url;
            if (url) imageUrls.push(url);
        });

        // Product images (top 2 products)
        if (imageUrls.length < 4) {
            const products = await Product.find({ brand: state.brandId })
                .sort({ createdAt: -1 })
                .limit(3)
                .lean();
            for (const product of products) {
                const imgUrl = product.images?.[0]?.url || product.imageUrl;
                if (imgUrl) imageUrls.push(imgUrl);
                if (imageUrls.length >= 5) break;
            }
        }

        if (imageUrls.length === 0) {
            console.log('🖼️ PM MCoT: No brand images found — skipping');
            return state;
        }

        console.log(`🧠 PM MCoT: Analyzing ${imageUrls.length} brand images for ad creative grounding...`);

        const grounding = await agentUtils.callMultimodalAgent(
            PM_VISUAL_GROUNDING_PROMPT,
            `Analyze these brand/product images for ${brand.name} (${dna.industry || 'consumer brand'}). Extract ad creative guidance for performance marketing.`,
            imageUrls,
            { temperature: 0.3, maxTokens: 1024 }
        );

        if (grounding && !grounding.error && !grounding.skipped) {
            console.log(`🧠 PM MCoT: Visual grounding complete — DNA: ${grounding.brandVisualDNA || '(parsed)'}`);
            return {
                ...state,
                pmVisualGrounding: grounding,
            };
        } else {
            console.warn('🖼️ PM MCoT: Grounding returned no usable data — continuing without it');
        }
    } catch (err) {
        console.warn('🖼️ PM MCoT: Visual grounding failed (non-critical):', err.message);
    }

    return state;
}

// ══════════════════════════════════════════════════════════════════════════════
// MCoT: PM COMPETITOR AD ANALYSIS NODE (Phase 4)
// Analyzes competitor ad creative images to extract winning patterns,
// emotional triggers, CTA formulas, and exploitable gaps.
// Runs in the /research background pipeline. Non-blocking.
// ══════════════════════════════════════════════════════════════════════════════
export async function pmCompetitorAdAnalysisNode(state) {
    // Require competitor ad image URLs in state (from externalAds or scraping)
    const competitorAdImages = (state.externalAds || [])
        .flatMap(ad => [
            ad.imageUrl,
            ad.creativeUrl,
            ad.thumbnailUrl,
            ...(ad.imageUrls || []),
        ])
        .filter(url => url && typeof url === 'string' && (url.startsWith('http') || url.startsWith('data:')));

    if (competitorAdImages.length === 0) {
        console.log('🖼️ PM MCoT Competitor: No competitor ad images available — skipping visual analysis');
        return state;
    }

    console.log(`🧠 PM MCoT: Analyzing ${competitorAdImages.length} competitor ad creatives...`);
    try {
        const brandName = state.brandName || 'this brand';
        const analysis = await agentUtils.callMultimodalAgent(
            PM_COMPETITOR_AD_ANALYSIS_PROMPT,
            `Analyze these competitor ad creatives for the ${brandName} competitive landscape. Extract patterns, gaps, and differentiators.`,
            competitorAdImages.slice(0, 5), // Max 5 competitor ads
            { temperature: 0.3, maxTokens: 1024 }
        );

        if (analysis && !analysis.error && !analysis.skipped) {
            console.log(`🧠 PM MCoT Competitor: Analysis complete — differentiator: ${(analysis.recommendedDifferentiator || '').substring(0, 60)}`);
            return {
                ...state,
                pmCompetitorAdAnalysis: analysis,
            };
        } else {
            console.warn('🖼️ PM MCoT: Competitor analysis returned no usable data — continuing');
        }
    } catch (err) {
        console.warn('🖼️ PM MCoT: Competitor ad analysis failed (non-critical):', err.message);
    }

    return state;
}
