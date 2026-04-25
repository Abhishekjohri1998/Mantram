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
import { callMcpTool, callMcpToolsParallel } from '../mcp/registry.js';
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
// ⚡ Research Studio analysis is structured/analytical — Gemini 2.5 Flash is fast and accurate.
// Claude is only needed for highly creative tasks (copywriting, long-form prose).
// Default provider: gemini — saves 12-20s per module call vs Claude Sonnet.
async function aiCall(systemPrompt, userPrompt, opts = {}) {
    const { getRouter } = await import('../ai/router.js');
    const router = getRouter();
    // ⚡ Default to Gemini for all Research Studio analytical calls. Override with opts.provider if needed.
    const routingPrefs = opts.provider ? { provider: opts.provider } : { provider: 'gemini' };
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature: opts.temperature ?? 0.3,
        maxTokens: opts.maxTokens ?? 6000,
    }, routingPrefs);
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

// ── Summarise MCP results for prompt injection + collect citations ─────────────
function summariseMcp(results) {
    const parts = [];
    const allCitations = []; // Collect real URLs from all tools

    if (results.web_search?.data) {
        parts.push(`WEB RESEARCH (source: ${results.web_search.source || 'web'}):\n${results.web_search.data.substring(0, 3000)}`);
        if (results.web_search.citations?.length) allCitations.push(...results.web_search.citations);
    }
    if (results.fetch_trending?.data) {
        const t = results.fetch_trending.data;
        if (t.trending?.length) parts.push(`TRENDING TOPICS:\n${t.trending.slice(0, 5).map(x => `• ${x.topic}: ${x.description}`).join('\n')}`);
        if (t.keywords?.length) parts.push(`TRENDING KEYWORDS: ${t.keywords.slice(0, 8).map(x => x.keyword).join(', ')}`);
        if (t.calendarHooks?.length) parts.push(`CALENDAR HOOKS: ${t.calendarHooks.slice(0, 5).join(', ')}`);
    }
    if (results.scrape_competitor?.data) {
        const c = results.scrape_competitor.data;
        if (c.analysis) parts.push(`COMPETITOR INTELLIGENCE (source: ${results.scrape_competitor.source || 'scraper'}):\n${c.analysis}`);
        if (c.competitorNames?.length) parts.push(`KNOWN COMPETITORS: ${c.competitorNames.join(', ')}`);
        if (results.scrape_competitor.citations?.length) allCitations.push(...results.scrape_competitor.citations);
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
    return { text: parts.join('\n\n'), citations: allCitations };
}

// ── Build a DNA-aware, category-specific search query ─────────────────────────
function buildResearchQuery(type, brandName, dna, query) {
    const industry    = dna.industry || 'brand';
    const category   = dna.productCategory || dna.category || industry;
    const audience   = dna.targetAudience || '';
    const pricePoint = dna.pricePoint || '';
    const markets    = (dna.targetMarkets || [dna.country || 'India']).slice(0, 2).join(', ');
    const compNames  = (dna.competitorNames || []).slice(0, 3).join(', ');

    // Detect geographic/market entry context from the user query
    const geoMatch = query?.match(/(?:enter|entering|launch|expand|market|city|udaipur|mumbai|delhi|bangalore|pune|jaipur|surat|chennai|kolkata|hyderabad|ahmedabad|\bin\b[\s\w]+(?:market|city|region))/i);
    const geoContext = geoMatch ? ` in market: ${query}` : '';

    switch (type) {
        case 'competitor':
            // Ask for BRAND OWNERS only — never retailers/distributors
            return `competing BRANDS (manufacturers/brand owners ONLY, NOT retailers or multi-brand stores) similar to "${brandName}" in the "${category}" category${pricePoint ? ` at ${pricePoint} price point` : ''}${geoContext || ` in ${markets}`}. Compare: brand positioning, pricing strategy, target audience, market share, unique selling points, marketing approach. ${compNames ? `Known competitors to analyse deeper: ${compNames}.` : ''}`;
        case 'trends':
            return `${category} market trends consumer behaviour ${markets} 2025 ${new Date().toLocaleString('en', { month: 'long' })}${geoContext}. Include: growth rates, category size, emerging sub-segments, platform shifts, consumer sentiment.`;
        case 'keywords':
            return `${category} India top purchase-intent search keywords "best" OR "buy" OR "top" OR "review" high-volume low-competition 2025. Include long-tail phrases, Amazon/Flipkart search terms, question-based queries.`;
        case 'audience':
            return `${category} India customer reviews pain points Reddit Quora community "I wish" OR "why" OR "problem" 2025${audience ? ` targeting ${audience}` : ''}${geoContext}. Mine real customer language, unmet desires, objections.`;
        case 'ads':
            return `${category} India ${compNames || industry} Meta Facebook Instagram Google ads winning creative hooks copy strategy ROAS benchmarks 2025. What ad formats and angles are working right now.`;
        case 'synthesis':
            return `${industry} India ${query || 'marketing'} strategy winning campaigns 2025${geoContext}. Full market overview, opportunity sizing, winning playbooks.`;
        default:
            return `${brandName} ${category} ${markets} market research 2025`;
    }
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
      "findings": ["Specific finding 1 with data/number and source", "Finding 2", "Finding 3", "Finding 4", "Finding 5"],
      "soWhat": "1-2 sentence brand-specific implication: what this means for [brand] and what to do about it"
    }
  ],
  "quickWins": ["Actionable quick win 1", "Quick win 2", "Quick win 3"],
  "sources": ["https://actual-url-from-research.com", "Source name if no URL"],
  "studioActions": [
    { "label": "Action label (e.g. Build Ad Brief from This)", "studio": "brainstorm|creative|content|video|social|performance|seo", "mode": "strategy-mode-id or null" }
  ]
}`;

// ══════════════════════════════════════════════════════════════════════════════
// MODULE 1: COMPETITOR INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/competitor', protect, requireStudio('researchStudio'), requireCredits('research'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const brandId = brandDoc?._id || brand?._id || brand?.id;
        const category = dna.productCategory || dna.category || dna.industry || 'brand';

        const cacheKey = resultCacheKey('competitor', brandId, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        // DNA-aware query — asks for brand owners, never retailers
        const competitorQuery = buildResearchQuery('competitor', brandName, dna, query);

        // Run in parallel: brand-level competitor scraper + Perplexity deep search
        const mcpResults = await callMcpToolsParallel([
            { tool: 'scrape_competitor', args: { brandId } },
            { tool: 'web_search', args: { query: competitorQuery, mode: 'deep', forceDeep: true } },
        ]);

        const { text: researchContext, citations } = summariseMcp(mcpResults);

        const systemPrompt = `You are a world-class competitive intelligence analyst for D2C brands in India and globally.
Your job is to analyse BRAND-LEVEL competitors of "${brandName}" — brands that manufacture and own their own products in the same category.

${brandContext}

LIVE RESEARCH DATA (from real web sources):
${researchContext || 'Use your training knowledge about this brand category.'}

CRITICAL RULES:
1. Compare ONLY with brands that manufacture/own their products (boAt, Noise, JBL, etc.) — NEVER with retailers, distributors, or multi-brand stores (Gadget Hub, Croma, etc.)
2. Every finding must name a specific brand with a real data point (price, market share %, campaign name, etc.)
3. Every "soWhat" must name "${brandName}" and give a concrete, actionable recommendation
4. Focus on: pricing gaps, messaging gaps, channel strategy, audience segments ignored, differentiators
5. Cite your sources in the sources[] array with actual URLs where available
6. Sections: Who Are the Real Competitors | Pricing & Offer Strategy | Messaging & Positioning | Channel & Content Gaps | ${brandName}'s Differentiation Opportunity
${OUTPUT_FORMAT}`;

        const userPrompt = `Run competitor intelligence for: "${brandName}" in "${category}".
${query ? `Research context: ${query}` : ''}
Identify and analyse the top 4-6 competing BRANDS (not retailers). Return specific, cited findings.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 7000, temperature: 0.15 });
        result.module = 'competitor';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        result.researchSources = {
            searchMode: 'deep (Perplexity sonar-pro)',
            citationsCount: citations.length,
            citations: citations.slice(0, 10),
        };
        // Merge real citations into sources[] if AI didn't populate from context
        if (!result.sources?.length && citations.length) {
            result.sources = citations.slice(0, 6).map(c => c.url || c);
        }
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

router.post('/trends', protect, requireStudio('researchStudio'), requireCredits('research'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const brandId = brandDoc?._id || brand?._id || brand?.id;

        const cacheKey = resultCacheKey('trends', brandId, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const trendsQuery = buildResearchQuery('trends', brandName, dna, query);
        const mcpResults = await callMcpToolsParallel([
            { tool: 'fetch_trending', args: { brandId } },
            { tool: 'web_search', args: { query: trendsQuery, mode: 'deep', forceDeep: true } },
        ]);

        const { text: researchContext, citations } = summariseMcp(mcpResults);

        const systemPrompt = `You are a consumer trends analyst specialising in D2C and e-commerce in India.
You identify trends that are ACTIONABLE right now — not 12 months from now.

${brandContext}

LIVE TREND DATA (from real web sources):
${researchContext || 'Use your training knowledge about current trends in this industry.'}

RULES:
1. Only report trends a brand can act on in the NEXT 30-90 days — cite data/numbers
2. Sections: Rising Trends (with urgency) | Declining Trends | Seasonal Opportunities | Consumer Behaviour Shifts | Platform & Format Trends
3. Each finding: trend name, why it's happening, urgency (high/medium/low), specific content angle
4. soWhat must be specific to "${brandName}"'s category and audience
5. Cite your sources in sources[] with actual URLs
${OUTPUT_FORMAT}`;

        const userPrompt = `Analyse market trends for: "${brandName}" in "${industry}".
${query ? `Research focus: ${query}` : ''}
Today: ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
Return the most actionable, cited trends right now.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 6000, temperature: 0.2 });
        result.module = 'trends';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.sources?.length && citations.length) result.sources = citations.slice(0, 5).map(c => c.url || c);
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

router.post('/keywords', protect, requireStudio('researchStudio'), requireCredits('research'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const website = dna.website || brand?.dna?.website;
        const brandId = brandDoc?._id || brand?._id || brand?.id;

        const cacheKey = resultCacheKey('keywords', brandId, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const kwQuery = buildResearchQuery('keywords', brandName, dna, query);
        const mcpResults = await callMcpToolsParallel([
            { tool: 'fetch_seo_audit', args: { brandId } },
            { tool: 'web_search', args: { query: kwQuery, mode: 'deep', forceDeep: true } },
        ]);

        const { text: researchContext, citations } = summariseMcp(mcpResults);

        const systemPrompt = `You are a keyword and SEO strategist for D2C brands in India, specialising in commercial intent and content gap analysis.

${brandContext}

SEO & SEARCH RESEARCH DATA (from real sources):
${researchContext || 'Use your training knowledge about search behaviour in this industry.'}

RULES:
1. Focus on COMMERCIAL INTENT keywords that drive purchases — cite actual search volume estimates
2. Sections: Purchase-Intent Gaps | Competitor Keyword Opportunities | Amazon/Flipkart Search Terms | Long-Tail Phrases | Quick SEO Wins
3. For each cluster: estimated volume (high/medium/low), competition (high/medium/low), recommended content format
4. soWhat must map keywords to specific content or listing actions
5. Cite sources in sources[] with actual URLs
${OUTPUT_FORMAT}`;

        const userPrompt = `Run keyword and SEO intelligence for: "${brandName}" in "${industry}".
${website ? `Website: ${website}` : ''}
${query ? `Specific focus: ${query}` : ''}
Find the most valuable keyword opportunities to capture right now.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 6000, temperature: 0.2 });
        result.module = 'keywords';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.sources?.length && citations.length) result.sources = citations.slice(0, 5).map(c => c.url || c);
        if (!result.studioActions) result.studioActions = [
            { label: 'Write SEO-Optimised Content', studio: 'content', mode: null },
            { label: 'Build Marketplace Growth Plan', studio: 'brainstorm', mode: 'marketplace-growth' },
        ];

        const response = { success: true, data: result };
        await setCachedResult(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Research: keywords error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// MODULE 4: AD INTELLIGENCE
// ══════════════════════════════════════════════════════════════════════════════

router.post('/ads', protect, requireStudio('researchStudio'), requireCredits('research'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const brandId = brandDoc?._id || brand?._id || brand?.id;

        const cacheKey = resultCacheKey('ads', brandId, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const adsQuery = buildResearchQuery('ads', brandName, dna, query);
        const mcpResults = await callMcpToolsParallel([
            { tool: 'web_search', args: { query: adsQuery, mode: 'deep', forceDeep: true } },
            { tool: 'fetch_performance_learnings', args: { brandId } },
        ]);

        const { text: researchContext, citations } = summariseMcp(mcpResults);

        const systemPrompt = `You are a performance marketing analyst specialising in Meta Ads and Google Ads for D2C brands in India.
You analyse what's WORKING in paid advertising right now — hooks, formats, copy, ROAS benchmarks.

${brandContext}

AD RESEARCH DATA (from real web sources):
${researchContext || 'Use your training knowledge about ad strategies in this category.'}

RULES:
1. Be specific about formats and hooks winning right now — not generic advice
2. Sections: Winning Hook Formulas | Top Ad Formats | Copy Patterns That Convert | Landing Page Strategies | ROAS & CPL Benchmarks India
3. For each finding, give a concrete template or example "${brandName}" can adapt immediately
4. Include real ROAS benchmarks (e.g. 3-5x for D2C electronics) with source context
5. soWhat must give a specific creative direction or copy angle for "${brandName}"
6. Cite sources in sources[] with URLs
${OUTPUT_FORMAT}`;

        const userPrompt = `Run ad intelligence for: "${brandName}" in "${industry}".
${query ? `Specific focus: ${query}` : ''}
Find winning ad strategies and hooks to adapt right now.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 6000, temperature: 0.2 });
        result.module = 'ads';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.sources?.length && citations.length) result.sources = citations.slice(0, 5).map(c => c.url || c);
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

router.post('/audience', protect, requireStudio('researchStudio'), requireCredits('research'), async (req, res) => {
    try {
        const { brand, query } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const targetAudience = dna.targetAudience || '';
        const brandId = brandDoc?._id || brand?._id || brand?.id;

        const cacheKey = resultCacheKey('audience', brandId, query);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const audienceQuery = buildResearchQuery('audience', brandName, dna, query);
        const mcpResults = await callMcpToolsParallel([
            { tool: 'web_search', args: { query: audienceQuery, mode: 'deep', forceDeep: true } },
            { tool: 'fetch_trending', args: { brandId } },
        ]);

        const { text: researchContext, citations } = summariseMcp(mcpResults);

        const systemPrompt = `You are an audience research analyst specialising in consumer psychology and social listening for D2C brands in India.
You mine real customer language, pain points, desires, and objections from Reddit, Quora, Amazon reviews, and online communities.

${brandContext}

SOCIAL LISTENING & AUDIENCE DATA (from real sources):
${researchContext || 'Use your training knowledge about consumers in this category.'}

RULES:
1. Extract EXACT verbatim language customers use — real phrases from reviews/communities, in quotes
2. Sections: Real Pain Points (verbatim quotes) | Unmet Desires | Purchase Objections | Segments Being Ignored | Emotional Purchase Triggers
3. Every section must quote real customer voice — never marketing speak
4. soWhat must give a specific messaging, content, or product angle for "${brandName}"
5. Include: platform where insights found (Reddit/Amazon/Quora), demographic signals, buying triggers
6. Cite actual URLs in sources[] where the insights came from
${OUTPUT_FORMAT}`;

        const userPrompt = `Run audience intelligence for: "${brandName}" targeting "${targetAudience || industry + ' consumers'}".
${query ? `Research context: ${query}` : ''}
Mine real customer language, pain points, desires from online communities, reviews, and forums.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 7000, temperature: 0.15 });
        result.module = 'audience';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.sources?.length && citations.length) result.sources = citations.slice(0, 5).map(c => c.url || c);
        if (!result.studioActions) result.studioActions = [
            { label: 'Build Brand Awareness Campaign', studio: 'brainstorm', mode: 'brand-awareness' },
            { label: 'Plan Influencer Campaign', studio: 'brainstorm', mode: 'influencer-campaign' },
        ];

        const response = { success: true, data: result };
        await setCachedResult(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Research: audience error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// MODULE 6: CAMPAIGN STRATEGY SYNTHESIS (All-in-One)
// ══════════════════════════════════════════════════════════════════════════════

router.post('/synthesis', protect, requireStudio('researchStudio'), requireCredits('research'), async (req, res) => {
    try {
        const { brand, query, goal } = req.body;
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';
        const brandId = brandDoc?._id || brand?._id || brand?.id;

        const cacheKey = resultCacheKey('synthesis', brandId, query || goal);
        const cached = await getCachedResult(cacheKey);
        if (cached) return res.json(cached);

        const synthQuery = buildResearchQuery('synthesis', brandName, dna, query || goal);
        // Run ALL research tools in parallel — maximum intelligence for synthesis
        const mcpResults = await callMcpToolsParallel([
            { tool: 'fetch_trending', args: { brandId } },
            { tool: 'scrape_competitor', args: { brandId } },
            { tool: 'web_search', args: { query: synthQuery, mode: 'deep', forceDeep: true } },
            { tool: 'fetch_performance_learnings', args: { brandId } },
        ]);

        const { text: researchContext, citations } = summariseMcp(mcpResults);

        const systemPrompt = `You are a CMO-level strategist synthesising real market intelligence into a specific, data-backed campaign strategy.
You synthesise competitor data, live trends, audience insights, and brand performance into a complete plan.

${brandContext}

SYNTHESISED RESEARCH DATA (from real web sources with citations):
${researchContext || 'Use your training knowledge about this brand category.'}

CRITICAL RULES:
1. Every finding must reference a real data point — no vague generalities
2. Competitor references must be brand owners only (not retailers)
3. The campaign title must be unique and memorable
4. Cite actual URLs in sources[] from the research data above

OUTPUT FORMAT — return STRICT JSON:
{
  "module": "synthesis",
  "brand": "string",
  "campaignTitle": "Memorable, specific campaign name",
  "strategicThesis": "3-4 sentence thesis: why THIS campaign at THIS moment will work for THIS brand, with data",
  "sections": [
    { "title": "Market Opportunity (with size/numbers)", "findings": ["..."], "soWhat": "..." },
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
  "sources": ["https://actual-url-from-research.com", "source name if no URL"],
  "studioActions": [
    { "label": "Build Full-Funnel Ad Brief", "studio": "performance", "mode": "new-product-launch" },
    { "label": "Generate Campaign Creative", "studio": "creative", "mode": null },
    { "label": "Create Social Media Content", "studio": "social", "mode": null },
    { "label": "Write Campaign SEO Copy", "studio": "seo", "mode": null }
  ]
}`;

        const userPrompt = `Synthesise a COMPLETE, DATA-BACKED campaign strategy for: "${brandName}" in "${industry}".
Campaign goal: ${goal || query || 'Drive growth and brand awareness'}.
${query && query !== goal ? `Research context: ${query}` : ''}
Use ALL available research data (including live citations) to produce the most specific, actionable strategy possible.
Do NOT compare with retailers — only with brand owners/manufacturers.`;

        const result = await aiCall(systemPrompt, userPrompt, { maxTokens: 9000, temperature: 0.15, provider: 'gemini' });
        result.module = 'synthesis';
        result.brand = brandName;
        result.generatedAt = new Date().toISOString();
        if (!result.sources?.length && citations.length) result.sources = citations.slice(0, 8).map(c => c.url || c);

        const response = { success: true, data: result };
        await setCachedResult(cacheKey, response);
        res.json(response);
    } catch (error) {
        console.error('Research: synthesis error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// SSE STREAMING — Universal progressive-render endpoint for all modules
// POST /api/research-studio/stream
// Emits: tool_progress, token, done — user sees content appear in real time
// ══════════════════════════════════════════════════════════════════════════════

router.post('/stream', protect, requireStudio('researchStudio'), async (req, res) => {
    const { brand, module: moduleName, query, goal } = req.body;

    // ── SSE headers ──────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    const emit = (type, data) => {
        try {
            res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
        } catch { /* client disconnected */ }
    };

    const brandId = brand?._id || brand?.id;

    try {
        const { brandDoc, brandContext } = await loadBrand(brand);
        const dna = brandDoc?.dna || brand?.dna || {};
        const brandName = brandDoc?.name || brand?.name || 'Your Brand';
        const industry = dna.industry || 'D2C brand';

        // ── Check cache first — if hit, emit instantly ─────────────────────
        const cacheKey = resultCacheKey(moduleName, brandId, query || goal);
        const cached = await getCachedResult(cacheKey);
        if (cached) {
            emit('cached', { data: cached.data });
            emit('done', { cached: true });
            res.end();
            return;
        }

        // ── Module-specific MCP tool config ───────────────────────────────
        const MODULE_TOOLS = {
            competitor: [
                { tool: 'scrape_competitor', args: { brandId }, label: '🔍 Scanning competitors...' },
                { tool: 'web_search', args: { query: buildResearchQuery('competitor', brandName, dna, query), mode: 'deep', forceDeep: true }, label: '🌐 Deep web research...' },
            ],
            trends: [
                { tool: 'fetch_trending', args: { brandId }, label: '📈 Fetching live trends...' },
                { tool: 'web_search', args: { query: buildResearchQuery('trends', brandName, dna, query), mode: 'deep', forceDeep: true }, label: '🌐 Market trend research...' },
            ],
            keywords: [
                { tool: 'fetch_seo_audit', args: { brandId }, label: '🔑 Loading SEO audit data...' },
                { tool: 'web_search', args: { query: buildResearchQuery('keywords', brandName, dna, query), mode: 'deep', forceDeep: true }, label: '🌐 Keyword research...' },
            ],
            audience: [
                { tool: 'web_search', args: { query: buildResearchQuery('audience', brandName, dna, query), mode: 'deep', forceDeep: true }, label: '👥 Audience research...' },
                { tool: 'fetch_trending', args: { brandId }, label: '📈 Trending topics...' },
            ],
            ads: [
                { tool: 'web_search', args: { query: buildResearchQuery('ads', brandName, dna, query), mode: 'deep', forceDeep: true }, label: '📣 Ad intelligence research...' },
                { tool: 'fetch_performance_learnings', args: { brandId }, label: '📊 Loading ad performance...' },
            ],
            synthesis: [
                { tool: 'fetch_trending', args: { brandId }, label: '📈 Live trends...' },
                { tool: 'scrape_competitor', args: { brandId }, label: '🔍 Competitor scan...' },
                { tool: 'web_search', args: { query: buildResearchQuery('synthesis', brandName, dna, query || goal), mode: 'deep', forceDeep: true }, label: '🌐 Deep web research...' },
                { tool: 'fetch_performance_learnings', args: { brandId }, label: '📊 Performance learnings...' },
            ],
        };

        const toolCalls = MODULE_TOOLS[moduleName] || MODULE_TOOLS.trends;

        // ── Run MCP tools and emit progress as each one completes ─────────
        emit('status', { message: '🧠 Gathering intelligence...', step: 0, total: toolCalls.length });

        const toolResults = {};
        let completedTools = 0;
        await Promise.allSettled(
            toolCalls.map(async ({ tool, args, label }) => {
                try {
                    const result = await callMcpTool(tool, args);
                    toolResults[tool] = result;
                } catch { /* non-fatal */ }
                completedTools++;
                emit('tool_progress', { label, step: completedTools, total: toolCalls.length });
            })
        );

        const { text: researchContext, citations: streamCitations } = summariseMcp(toolResults);

        // ── Build system prompt for this module (reuse existing logic) ────
        emit('status', { message: '✍️ Generating insights...', step: toolCalls.length, total: toolCalls.length + 1 });

        const MODULE_PROMPTS = {
            competitor: `You are a world-class competitive intelligence analyst for D2C brands. Every finding must be specific, data-driven, and directly useful. ${brandContext}\n\nLIVE RESEARCH DATA:\n${researchContext || 'No live research available.'}\n\nSections: What They're Doing Well | Pricing & Offer Strategy | Messaging & Positioning | Channel & Content Gaps | Your Differentiation Opportunity\n${OUTPUT_FORMAT}`,
            trends: `You are a consumer trends analyst specialising in D2C and e-commerce in India. Only report trends actionable in the NEXT 30-90 days. ${brandContext}\n\nLIVE TREND DATA:\n${researchContext || 'Use training knowledge.'}\n\nSections: Rising Trends | Declining Trends | Seasonal Opportunities | Consumer Behaviour Shifts | Format & Platform Trends\n${OUTPUT_FORMAT}`,
            keywords: `You are a keyword and SEO strategist for D2C brands in India. Focus on COMMERCIAL INTENT keywords that drive purchases. ${brandContext}\n\nSEO & SEARCH DATA:\n${researchContext || 'Use training knowledge.'}\n\nSections: Purchase-Intent Gaps | Competitor Keyword Opportunities | Content Calendar Keywords | Category Discovery Keywords | Quick SEO Wins\n${OUTPUT_FORMAT}`,
            audience: `You are a consumer insights specialist for D2C brands in India. Build deep psychographic profiles, not demographic demographics. ${brandContext}\n\nAUDIENCE RESEARCH:\n${researchContext || 'Use training knowledge.'}\n\nSections: Primary Buyer Profile | Secondary Segments | Emotional Triggers | Content Consumption Habits | Purchase Barriers to Break Down\n${OUTPUT_FORMAT}`,
            ads: `You are a paid media strategist specialising in Meta and Google Ads for D2C brands in India. ${brandContext}\n\nAD INTELLIGENCE:\n${researchContext || 'Use training knowledge.'}\n\nSections: Winning Ad Formats | Audience Targeting Opportunities | Creative Angles That Convert | Budget Allocation Strategy | Immediate Test Recommendations\n${OUTPUT_FORMAT}`,
            synthesis: `You are a CMO-level strategist synthesising all market intelligence into a campaign strategy. ${brandContext}\n\nSYNTHESISED RESEARCH:\n${researchContext || 'Use training knowledge.'}\n\nReturn JSON with: module, brand, campaignTitle, strategicThesis, sections (5 sections), executionPlan, keyMetrics, quickWins, studioActions`,
        };

        const systemPrompt = MODULE_PROMPTS[moduleName] || MODULE_PROMPTS.trends;
        const userPrompt = `Run ${moduleName} intelligence for "${brandName}" in "${industry}". ${query ? `Focus: ${query}` : ''} ${goal ? `Goal: ${goal}` : ''} Return complete structured JSON. Compare only with brand manufacturers, NOT retailers.`;

        // ── Stream token-by-token via Gemini ──────────────────────────────
        const { getRouter: getAiRouter } = await import('../ai/router.js');
        const aiRouter = getAiRouter();

        let fullText = '';
        let tokenBuffer = '';

        // Batch token emissions every ~100ms for smooth rendering without too many events
        let flushTimer = null;
        const flushBuffer = () => {
            if (tokenBuffer) {
                emit('token', { chunk: tokenBuffer });
                tokenBuffer = '';
            }
        };

        for await (const chunk of aiRouter.generateTextStream({
            systemPrompt,
            userPrompt,
            temperature: 0.3,
            maxTokens: 5000,
        })) {
            fullText += chunk;
            tokenBuffer += chunk;

            // Batch-emit: flush every ~150ms or when buffer exceeds 200 chars
            if (tokenBuffer.length >= 200) {
                clearTimeout(flushTimer);
                flushBuffer();
            } else {
                clearTimeout(flushTimer);
                flushTimer = setTimeout(flushBuffer, 150);
            }
        }

        // Flush remaining buffer
        clearTimeout(flushTimer);
        flushBuffer();

        // ── Parse final JSON and emit complete result ─────────────────────
        let parsed = null;
        try {
            let cleaned = fullText.replace(/```(?:json)?\s*\n?/gi, '').trim();
            if (cleaned.startsWith('{')) parsed = JSON.parse(cleaned);
            else {
                const m = cleaned.match(/\{[\s\S]*\}/);
                if (m) parsed = JSON.parse(m[0]);
            }
        } catch { /* if streaming gave malformed JSON, keep raw */ }

        if (parsed) {
            parsed.module = moduleName;
            parsed.brand = brandName;
            parsed.generatedAt = new Date().toISOString();
            if (!parsed.studioActions) parsed.studioActions = [];
            // Thread Perplexity/Gemini citations into sources[]
            if (!parsed.sources?.length && streamCitations?.length) {
                parsed.sources = streamCitations.slice(0, 6).map(c => c.url || c);
            }
            // Cache the result for 5 minutes
            await setCachedResult(cacheKey, { success: true, data: parsed });
            emit('done', { data: parsed });
        } else {
            // Send raw text if JSON parsing failed — better than nothing
            emit('done', { raw: fullText.substring(0, 2000), parseError: true });
        }
    } catch (error) {
        console.error('Research SSE stream error:', error);
        emit('error', { message: error.message });
    } finally {
        res.end();
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
