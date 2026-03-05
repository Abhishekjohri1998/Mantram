/**
 * Performance Marketing Studio — Agent Nodes
 * 
 * Each node: (state) → updatedState
 * Uses Claude Sonnet for AI analysis and strategy.
 */

import Brand from '../../models/Brand.js';
import { getRouter } from '../../ai/router.js';
import {
    COMPETITOR_RESEARCH_PROMPT,
    STRATEGY_PROMPT,
    BUDGET_PLANNER_PROMPT,
    AD_CREATOR_PROMPT,
    AB_TEST_PROMPT,
    PERFORMANCE_ANALYST_PROMPT,
    REPORT_GENERATOR_PROMPT,
} from './prompts.js';

// ── Helper: Build brand context string ──
function buildBrandCtx(brand) {
    if (!brand) return '';
    return [
        `BRAND NAME: ${brand.name || 'Unknown'}`,
        brand.industry ? `INDUSTRY: ${brand.industry}` : '',
        brand.description ? `DESCRIPTION: ${brand.description}` : '',
        brand.targetAudience ? `TARGET AUDIENCE: ${brand.targetAudience}` : '',
        brand.brandVoice ? `BRAND VOICE: ${brand.brandVoice}` : '',
        brand.values?.length ? `VALUES: ${brand.values.join(', ')}` : '',
        brand.competitors?.length ? `KNOWN COMPETITORS: ${brand.competitors.join(', ')}` : '',
        brand.website ? `WEBSITE: ${brand.website}` : '',
    ].filter(Boolean).join('\n');
}

// ── Helper: Call Claude and parse JSON response ──
async function callAgent(systemPrompt, userPrompt, temperature = 0.7) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: 8192,
    }, { provider: 'anthropic' });

    const text = result.text || '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn('PM Agent JSON parse failed, raw:', text.substring(0, 300));
    }

    return { error: 'Failed to parse agent response', raw: text.substring(0, 500) };
}

// ── Helper: Load brand context ──
async function loadBrandContext(brandId) {
    if (!brandId) return { brandContext: '' };
    const brand = await Brand.findById(brandId).lean();
    const brandContext = buildBrandCtx(brand);
    return { brand, brandContext };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: COMPETITOR RESEARCH — Analyze competitor ads & strategies
// ══════════════════════════════════════════════════════════════════════════════
export async function competitorResearchNode(state) {
    console.log('🔍 PM Node: Competitor Research — analyzing...');

    const { brandContext } = await loadBrandContext(state.brandId);

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

    const result = await callAgent(
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
// NODE 2: STRATEGY — Generate multi-platform marketing strategy
// ══════════════════════════════════════════════════════════════════════════════
export async function strategyNode(state) {
    console.log('📋 PM Node: Strategy — building plan...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CAMPAIGN OBJECTIVE: ${state.input?.objective || 'traffic'}`,
        `TOTAL BUDGET: ${state.input?.budget || 'Not specified'} ${state.input?.currency || 'INR'}`,
        `DURATION: ${state.input?.duration || '30 days'}`,
        `TARGET PLATFORMS: ${(state.input?.platforms || ['meta', 'google']).join(', ')}`,
        '',
        '── COMPETITOR RESEARCH FINDINGS ──',
        state.researchData?.competitorProfiles ?
            `Competitors analyzed: ${state.researchData.competitorProfiles.length}` : '',
        state.aiAnalysis?.keyFindings?.length ?
            `Key findings: ${state.aiAnalysis.keyFindings.join('; ')}` : '',
        '',
        state.input?.query ? `USER'S GOAL: "${state.input.query}"` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(
        STRATEGY_PROMPT(brandContext),
        userPrompt,
        0.5
    );

    return {
        ...state,
        strategyPlan: {
            goals: result.goals || [],
            channelAllocation: (result.channelAllocation || []).map(ch => ({
                channel: ch.channel || ch.name,
                budgetPercent: ch.budgetPercent || ch.percent || 0,
                rationale: ch.rationale || '',
            })),
            timeline: (result.timeline || []).map(phase => ({
                phase: phase.phase || phase.name,
                duration: phase.duration || '',
                activities: phase.activities || [],
            })),
            kpis: (result.kpis || []).map(kpi => ({
                metric: kpi.metric || kpi.name,
                target: String(kpi.target || ''),
                current: String(kpi.current || 'N/A'),
            })),
            audiences: result.audiences || [],
            creativeStrategy: result.creativeStrategy || {},
        },
        status: 'strategy',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: BUDGET PLANNER — Allocate budget across platforms & campaigns
// ══════════════════════════════════════════════════════════════════════════════
export async function budgetPlannerNode(state) {
    console.log('💰 PM Node: Budget Planner — allocating...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `TOTAL BUDGET: ${state.input?.budget || 50000} ${state.input?.currency || 'INR'}`,
        `DURATION: ${state.input?.duration || '30 days'}`,
        `OBJECTIVE: ${state.input?.objective || 'traffic'}`,
        '',
        '── STRATEGY ──',
        `Goals: ${(state.strategyPlan?.goals || []).join('; ')}`,
        `Channel allocation: ${(state.strategyPlan?.channelAllocation || []).map(c => `${c.channel}: ${c.budgetPercent}%`).join(', ')}`,
        '',
        '── RESEARCH CONTEXT ──',
        state.aiAnalysis?.keyFindings?.length ?
            `Market insights: ${state.aiAnalysis.keyFindings.slice(0, 3).join('; ')}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(
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
            allocation: (result.allocation || []).map(a => ({
                platform: a.platform,
                campaign: a.campaign || a.campaignName || '',
                amount: a.dailyBudget || a.amount || 0,
                expectedRoas: a.expectedRoas || a.roi || 0,
            })),
            projections: result.projections || {},
            optimizationRules: result.optimizationRules || [],
            scenarioAnalysis: result.scenarioAnalysis || [],
        },
        status: 'budget',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 4: AD CREATOR — Generate ad creative variants
// ══════════════════════════════════════════════════════════════════════════════
export async function adCreatorNode(state) {
    console.log('🎨 PM Node: Ad Creator — generating creatives...');

    const { brandContext } = await loadBrandContext(state.brandId);

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

    const result = await callAgent(
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

    const { brandContext } = await loadBrandContext(state.brandId);

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

    const result = await callAgent(
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

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CAMPAIGN PERFORMANCE DATA:`,
        JSON.stringify(state.performanceData || state.performanceSnapshot || {}, null, 2).substring(0, 3000),
        '',
        `CAMPAIGN DETAILS:`,
        `Platform: ${state.platform || 'meta'}`,
        `Objective: ${state.input?.objective || 'traffic'}`,
        `Budget: ${state.budgetPlan?.totalBudget || 'unknown'} ${state.budgetPlan?.currency || 'INR'}`,
    ].join('\n');

    const result = await callAgent(
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

    const { brandContext } = await loadBrandContext(state.brandId);

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

    const result = await callAgent(
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
