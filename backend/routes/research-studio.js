/**
 * Research Studio — 6 Module Research Engine
 *
 * POST /api/research-studio/competitor     — Competitor Intelligence
 * POST /api/research-studio/trends         — Market Trends
 * POST /api/research-studio/keywords       — Keyword & SEO Intelligence
 * POST /api/research-studio/ads            — Ad Intelligence (Meta + Google)
 * POST /api/research-studio/audience       — Audience Intelligence (social listening)
 * POST /api/research-studio/synthesis      — Campaign Strategy Generator (all-in-one)
 * POST /api/research-studio/save           — Save research report to Brand Strategy library
 * GET  /api/research-studio/reports        — List saved research reports for a brand
 */

import { Router } from 'express';
import crypto from 'crypto';
import { protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { loadBrandContext } from '../agents/shared/agentUtils.js';
import { callMcpToolsParallel } from '../mcp/registry.js';
import BrandStrategy from '../models/BrandStrategy.js';
import redis from '../utils/redisClient.js';

const router = Router();

// ── 5-minute result cache per module+brand+query ─────────────────────────────
const RESULT_CACHE_TTL = 300;
async function getCachedResult(key) {
    try { const v = await redis.get(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function setCachedResult(key, value) {
    try { await redis.setex(key, RESULT_CACHE_TTL, JSON.stringify(value)); } catch { /* non-fatal */ }
}
function resultCacheKey(module, brandId, query) {
    const qHash = crypto.createHash('md5').update((query || '').trim().toLowerCase()).digest('hex').slice(0, 8);
    return `rs:${module}:${brandId || 'nobrand'}:${qHash}`;
}

// ── Shared AI call helper ─────────────────────────────────────────────────────
async function aiCall(systemPrompt, userPrompt, opts = {}) {
    const { getRouter } = await import('../ai/router.js');
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature: opts.temperature ?? 0.3,
        maxTokens: opts.maxTokens ?? 6000,
    });
    const text = result.text || '';
    // Strip think tags
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const lastThink = cleaned.lastIndexOf('<think>');
    if (lastThink !== -1) {
        const before = cleaned.substring(0, lastThink).trim();
        cleaned = before.length > 0 ? before : cleaned.substring(lastThink).replace(/<think>[\s\S]*/gi, '');
    }
    cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '').trim();
    try {
        if (cleaned.startsWith('{')) return JSON.parse(cleaned);
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (m) return JSON.parse(m[0]);
    } catch (_) {}
    return { raw: text.substring(0, 500) };
}

// ── Load brand with graceful fallback ─────────────────────────────────────────
async function loadBrand(brand) {
    try {
        const brandId = brand?._id || brand?.id;
        if (brandId) {
            const { brand: brandDoc, brandContext } = await loadBrandContext(brandId);
            return { brandDoc, brandContext };
        }
    } catch (_) {}
    const dna = brand?.dna || {};
    const brandContext = brand?.name
        ? `Brand: ${brand.name}. Industry: ${dna.industry || 'N/A'}. Target Audience: ${dna.targetAudience || 'N/A'}. Country: ${dna.country || 'India'}.`
        : '<brand_bible>No brand data. Use professional style.</brand_bible>';
    return { brandDoc: brand || null, brandContext };
}

// ── Summarise MCP results for prompt injection ────────────────────────────────
function summariseMcp(results) {
    const parts = [];
    if (results.web_search?.data) parts.push(`WEB RESEARCH:\n${results.web_search.data.substring(0, 2000)}`);
    if (results.fetch_trending?.data) {
        const t = results.fetch_trending.data;
        if (t.trending?.length) parts.push(`TRENDING TOPICS:\n${t.trending.slice(0, 5).map(x => `• ${x.topic}: ${x.description}`).join('\n')}`);
        if (t.keywords?.length) parts.push(`TRENDING KEYWORDS: ${t.keywords.slice(0, 8).map(x => x.keyword).join(', ')}`);
        if (t.calendarHooks?.length) parts.push(`CALENDAR HOOKS: ${t.calendarHooks.slice(0, 5).join(', ')}`);
    }
    if (results.scrape_competitor?.data) {
        const c = results.scrape_competitor.data;
        if (c.analysis) parts.push(`COMPETITOR ANALYSIS:\n${c.analysis}`);
    }
    if (results.fetch_seo_audit?.data) {
        const s = results.fetch_seo_audit.data;
        if (s.topKeywords?.length) parts.push(`SEO KEYWORDS: ${s.topKeywords.slice(0, 10).join(', ')}`);
        if (s.contentGaps?.length) parts.push(`SEO CONTENT GAPS: ${s.contentGaps.slice(0, 5).join(', ')}`);
    }
    if (results.fetch_performance_learnings?.data) {
        const p = results.fetch_performance_learnings.data;
        if (p.topRated?.length) parts.push(`TOP CONTENT: ${p.topRated.map(x => x.title).join(', ')}`);
        if (p.feedbackPatterns) parts.push(`ACCEPT RATE: ${p.feedbackPatterns.acceptRate}%, REGEN RATE: ${p.feedbackPatterns.regenerateRate}%`);
    }
    return parts.join('\n\n');
}

// ── Structured output prompt template ─────────────────────────────────────────
const OUTPUT_FORMAT = `
Return STRICT JSON:
{
  "module": "string",
  "brand": "string",
  "sections": [
    {
      "title": "string — specific, insight-driven title (not generic)",
      "findings": ["Specific finding 1 with data/number", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
      "soWhat": "1-2 sentence brand-specific implication: what this means for [brand] and what to do about it"
    }
  ],
  "quickWins": ["Actionable quick win 1", "Quick win 2", "Quick win 3"],
  "sources": ["Source 1 (tool/URL)", "Source 2"],
  "studioActions": [
    { "label": "Action label (e.g. Build Ad Brief from This)", "studio": "brainstorm|creative|content|video", "mode": "strategy-mode-id or null" }
  ]
}`;

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 1: COMPETITOR INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/competitor', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';

        const cacheKey = resultCacheKey('competitor', brandDoc?._id || brand?._id || brand?.id, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        // Run MCP tools in parallel
        const mcpResults = await callMcpToolsParallel([
            { tool: 'scrape_competitor', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
            { tool: 'web_search', args: { query: `${brandName} competitors ${industry} India pricing strategy messaging 2024 2025`, mode: 'quick' } },
        ]);

        const researchContext = summariseMcp(mcpResults);

        const systemPrompt = `You are a world-class competitive intelligence analyst for D2C brands in India and globally.
Your job is to analyse competitors of a brand and extract actionable intelligence — NOT generic advice.
Every finding must be specific, data-driven, and directly useful.

${brandContext}

LIVE RESEARCH DATA:
${researchContext || 'No live research available — use your training knowledge about the brand industry.'}

RULES:
1. Be hyper-specific — name actual competitors, quote actual numbers, cite real strategies
2. Every "soWhat" must name the brand and give a concrete recommendation
3. Do NOT write generic marketing advice — write competitive intelligence
4. Focus on: pricing gaps, messaging gaps, channel gaps, audience segments competitors ignore
5. 4-5 sections total: What They're Doing Well | Pricing & Offer Strategy | Messaging & Positioning | Channel & Content Gaps | Your Differentiation Opportunity
${OUTPUT_FORMAT}`;

        const userPrompt = `Run competitor intelligence for: "${brandName}" in "${industry}".
${query ? `Specific focus: ${query}` : ''}
Analyse all available competitor data and return structured insights.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 5000 });
        result.module = 'competitor';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.studioActions) result.studioActions = [
            { label: 'Build Positioning Brief', studio: 'brainstorm', mode: 'brand-awareness' },
            { label: 'Create Competitor-Beating Ad', studio: 'brainstorm', mode: 'meta-google-ads' },
        ];

        const response = { success: true, data: result };
        await setCachedResult(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Research: competitor error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 2: MARKET TRENDS
// ══════════════════════════════════════════════════════════════════════════════

router.post('/trends', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';

        const cacheKey = resultCacheKey('trends', brandDoc?._id || brand?._id || brand?.id, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const mcpResults = await callMcpToolsParallel([
            { tool: 'fetch_trending', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
            { tool: 'web_search', args: { query: `${industry} market trends consumer behaviour India 2025 ${new Date().toLocaleString('en', { month: 'long', year: 'numeric' })}`, mode: 'quick' } },
        ]);

        const researchContext = summariseMcp(mcpResults);

        const systemPrompt = `You are a consumer trends analyst specialising in D2C and e-commerce in India.
You identify trends that are ACTIONABLE right now — not 12 months from now.

${brandContext}

LIVE TREND DATA:
${researchContext || 'Use your training knowledge about current trends in this industry.'}

RULES:
1. Only report trends that a brand can act on in the NEXT 30-90 days
2. Categorise by: Rising Trends | Declining Trends | Seasonal Opportunities | Consumer Behaviour Shifts | Format & Platform Trends
3. Each finding must include: trend name, why it's happening, urgency (high/medium/low), and a specific content or campaign angle
4. soWhat must be specific to the brand's category and audience
${OUTPUT_FORMAT}`;

        const userPrompt = `Analyse market trends for: "${brandName}" in "${industry}".
${query ? `Specific focus: ${query}` : ''}
Today: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
Return the most actionable trends right now.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 5000 });
        result.module = 'trends';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.studioActions) result.studioActions = [
            { label: 'Plan Trend-Led Campaign', studio: 'brainstorm', mode: 'new-product-launch' },
            { label: 'Build Festive Campaign', studio: 'brainstorm', mode: 'festive-seasonal' },
        ];

        const response = { success: true, data: result };
        await setCachedResult(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Research: trends error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 3: KEYWORD & SEO INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/keywords', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const website = dna.website || brand?.dna?.website;

        const mcpResults = await callMcpToolsParallel([
            { tool: 'fetch_seo_audit', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
            { tool: 'web_search', args: { query: `${industry} India top search keywords "best" OR "buy" OR "top" OR "review" site:amazon.in OR site:myntra.com OR site:nykaa.com 2025`, mode: 'deep' } },
        ]);

        const researchContext = summariseMcp(mcpResults);

        const systemPrompt = `You are a keyword and SEO strategist for D2C brands in India, specialising in commercial intent and content gap analysis.

${brandContext}

SEO & SEARCH RESEARCH DATA:
${researchContext || 'Use your training knowledge about search behaviour in this industry.'}

RULES:
1. Focus on COMMERCIAL INTENT keywords that drive purchases, not just traffic
2. Identify: High-intent keywords brand is missing | Competitor keywords to steal | Content gaps vs competitors | Category keywords with low competition | Long-tail purchase-intent phrases
3. For each keyword cluster, estimate: search volume (high/medium/low), competition level, and recommended content format
4. soWhat must map keywords to specific content actions the brand should take
5. Sections: Purchase-Intent Gaps | Competitor Keyword Opportunities | Content Calendar Keywords | Category Discovery Keywords | Quick SEO Wins
${OUTPUT_FORMAT}`;

        const userPrompt = `Run keyword and SEO intelligence for: "${brandName}" in "${industry}".
${website ? `Website: ${website}` : ''}
${query ? `Specific focus: ${query}` : ''}
Find the most valuable keyword opportunities to capture right now.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 5000 });
        result.module = 'keywords';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.studioActions) result.studioActions = [
            { label: 'Write SEO-Optimised Content', studio: 'content', mode: null },
            { label: 'Build Marketplace Growth Plan', studio: 'brainstorm', mode: 'marketplace-growth' },
        ];

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Research: keywords error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 4: AD INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/ads', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const competitorNames = (dna.competitorNames || []).slice(0, 3).join(', ') || '';

        const cacheKey = resultCacheKey('ads', brandDoc?._id || brand?._id || brand?.id, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const mcpResults = await callMcpToolsParallel([
            { tool: 'web_search', args: { query: `${industry} India Facebook Instagram Meta ads winning creative hooks copy 2025 D2C`, mode: 'quick' } },
            { tool: 'web_search', args: { query: `${competitorNames || industry} Google ads PPC strategy keywords ${new Date().getFullYear()}`, mode: 'quick' } },
        ]);

        const researchContext = summariseMcp(mcpResults);

        const systemPrompt = `You are a performance marketing analyst specialising in Meta Ads and Google Ads for D2C brands in India.
You analyse what's WORKING in paid advertising right now — hooks, formats, copy patterns, landing page strategies.

${brandContext}

AD RESEARCH DATA:
${researchContext || 'Use your training knowledge about ad strategies in this category.'}

RULES:
1. Be specific about what ad formats and hooks are winning — not generic "use video ads"
2. Cover: Winning Hook Formulas | Top-Performing Ad Formats | Copy Patterns That Convert | Landing Page Strategies | Budget Allocation Benchmarks
3. For each finding, give a concrete example or template the brand can adapt immediately
4. Include CPL and ROAS benchmarks for this category in India
5. soWhat must give a specific creative direction or copy angle for the brand
${OUTPUT_FORMAT}`;

        const userPrompt = `Run ad intelligence for: "${brandName}" in "${industry}".
Competitors to analyse: ${competitorNames || 'infer from industry'}.
${query ? `Specific focus: ${query}` : ''}
Find winning ad strategies and hooks we can adapt right now.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 5000 });
        result.module = 'ads';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.studioActions) result.studioActions = [
            { label: 'Build Meta & Google Ads Brief', studio: 'brainstorm', mode: 'meta-google-ads' },
            { label: 'Generate Ad Creative', studio: 'creative', mode: null },
        ];

        const response = { success: true, data: result };
        await setCachedResult(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Research: ads error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 5: AUDIENCE INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/audience', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const targetAudience = dna.targetAudience || brand?.dna?.targetAudience || '';

        const mcpResults = await callMcpToolsParallel([
            { tool: 'web_search', args: { query: `${industry} India customer reviews pain points Reddit quora community "I wish" OR "why does" OR "problem with" 2025`, mode: 'deep' } },
            { tool: 'fetch_trending', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
        ]);

        const researchContext = summariseMcp(mcpResults);

        const systemPrompt = `You are an audience research analyst specialising in consumer psychology and social listening for D2C brands in India.
You mine real customer language, pain points, desires, and objections from online communities.

${brandContext}

SOCIAL LISTENING & AUDIENCE DATA:
${researchContext || 'Use your training knowledge about consumers in this category.'}

RULES:
1. Extract EXACT language customers use — real phrases, words, metaphors from reviews/communities
2. Cover: Biggest Pain Points (with verbatim language) | Unmet Desires | Objections to Purchase | Audience Segments Brand Is Missing | Emotional Triggers That Drive Purchase
3. Every section must quote or paraphrase real customer voice, not marketing speak
4. soWhat must give a specific content, messaging, or product direction based on the audience insight
5. Include: demographics breakdown, platform preferences, purchase decision triggers
${OUTPUT_FORMAT}`;

        const userPrompt = `Run audience intelligence for: "${brandName}" targeting "${targetAudience || industry + ' consumers'}".
${query ? `Specific focus: ${query}` : ''}
Mine real customer language, pain points, desires, and objections from online communities and reviews.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 5000 });
        result.module = 'audience';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.studioActions) result.studioActions = [
            { label: 'Build Brand Awareness Campaign', studio: 'brainstorm', mode: 'brand-awareness' },
            { label: 'Plan Influencer Campaign', studio: 'brainstorm', mode: 'influencer-campaign' },
        ];

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Research: audience error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 6: CAMPAIGN STRATEGY SYNTHESIS (All-in-One)
// ══════════════════════════════════════════════════════════════════════════════

router.post('/synthesis', protect, requireStudio('brainstormStudio'), requireCredits('brainstorm'), async (req, res) => {
    try {
        const { brand, query, goal } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';

        // Run all research tools in parallel for maximum intel
        const mcpResults = await callMcpToolsParallel([
            { tool: 'fetch_trending', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
            { tool: 'scrape_competitor', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
            { tool: 'web_search', args: { query: `${industry} India ${goal || 'marketing'} strategy winning campaigns 2025`, mode: 'deep' } },
            { tool: 'fetch_performance_learnings', args: { brandId: brandDoc?._id || brand?._id || brand?.id } },
        ]);

        const researchContext = summariseMcp(mcpResults);

        const systemPrompt = `You are a CMO-level strategist synthesising all available market intelligence into a campaign strategy.
You read across competitor data, trends, audience insights, and performance learnings to produce a complete, actionable campaign plan.

${brandContext}

SYNTHESISED RESEARCH DATA:
${researchContext || 'Use your training knowledge about this brand category.'}

OUTPUT FORMAT — return STRICT JSON:
{
  "module": "synthesis",
  "brand": "string",
  "campaignTitle": "Memorable, specific campaign name",
  "strategicThesis": "3-4 sentence thesis: why THIS campaign at THIS moment will work for THIS brand",
  "sections": [
    { "title": "Market Opportunity", "findings": ["..."], "soWhat": "..." },
    { "title": "Target Audience Sweet Spot", "findings": ["..."], "soWhat": "..." },
    { "title": "Competitive Edge to Exploit", "findings": ["..."], "soWhat": "..." },
    { "title": "Core Messaging Architecture", "findings": ["..."], "soWhat": "..." },
    { "title": "Channel & Budget Allocation", "findings": ["..."], "soWhat": "..." }
  ],
  "executionPlan": [
    { "phase": "Phase 1 name", "duration": "e.g. Week 1-2", "actions": ["Action 1", "Action 2"] }
  ],
  "keyMetrics": ["Metric 1 with target", "Metric 2 with target", "Metric 3"],
  "quickWins": ["Actionable quick win 1 (do this week)", "Quick win 2", "Quick win 3"],
  "sources": ["Source 1", "Source 2"],
  "studioActions": [
    { "label": "Build Full Strategy in Brainstorm", "studio": "brainstorm", "mode": "new-product-launch" },
    { "label": "Generate Campaign Creative", "studio": "creative", "mode": null },
    { "label": "Write Campaign Copy", "studio": "content", "mode": null }
  ]
}`;

        const userPrompt = `Synthesise a complete campaign strategy for: "${brandName}" in "${industry}".
Campaign goal: ${goal || query || 'Drive growth and brand awareness'}.
${query && query !== goal ? `Additional context: ${query}` : ''}
Use ALL available research data and produce the most actionable, specific strategy possible.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 6000 });
        result.module = 'synthesis';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Research: synthesis error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// SAVE RESEARCH — Persist to BrandStrategy collection (type: 'research')
// ══════════════════════════════════════════════════════════════════════════════

router.post('/save', protect, async (req, res) => {
    try {
        const { brand, module: modName, data, title } = req.body;
        if (!data || !modName) return res.status(400).json({ success: false, error: 'data and module are required' });

        const brandId = brand?._id || brand?.id;
        const brandName = brand?.name || data?.brand || 'Unknown Brand';
        const reportTitle = title || `${modName.charAt(0).toUpperCase() + modName.slice(1)} Research — ${brandName}`;

        const doc = await BrandStrategy.create({
            user: req.user._id,
            brand: brandId || undefined,
            title: reportTitle,
            type: 'research',
            status: 'active',
            researchModule: modName,
            researchData: data,
            generatedAt: data.generatedAt || new Date().toISOString(),
            aiMeta: { source: 'research-studio', module: modName },
        });

        res.json({ success: true, id: doc._id, title: doc.title });
    } catch (error) {
        console.error('Research: save error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// LIST SAVED RESEARCH REPORTS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/reports', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const filter = { user: req.user._id, type: 'research' };
        if (brandId) filter.brand = brandId;

        const reports = await BrandStrategy.find(filter)
            .select('title researchModule generatedAt createdAt brand status')
            .sort('-createdAt')
            .limit(50)
            .lean();

        res.json({ success: true, reports });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET SINGLE REPORT
// ══════════════════════════════════════════════════════════════════════════════

router.get('/reports/:id', protect, async (req, res) => {
    try {
        const report = await BrandStrategy.findOne({ _id: req.params.id, user: req.user._id }).lean();
        if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
        res.json({ success: true, report });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;
