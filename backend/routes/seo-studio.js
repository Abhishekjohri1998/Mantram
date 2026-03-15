import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits, logTokenUsage } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import SeoAudit from '../models/SeoAudit.js';
import GscSnapshot from '../models/GscSnapshot.js';
import { safeErrorMessage } from '../utils/safeError.js';
import {
  researchDomain, researchCompetitors,
  formatSiteResearch, formatCompetitorResearch,
  discoverBacklinks, analyzeCompetitorLinkProfile,
} from '../utils/web-research.js';
import { runRealLLMProbe, generateProbePrompts } from '../utils/llm-probe.js';
import { getPageSpeed, formatPageSpeedForPrompt } from '../utils/pagespeed.js';
import { mineAutocomplete, formatAutocompleteForPrompt } from '../utils/autocomplete.js';
import { runKeywordIntelligence } from '../utils/keyword-intelligence.js';
import { batchPAA, formatPAAForPrompt } from '../utils/paa-scraper.js';
import {
  getKeywordIntelligence, getDomainBacklinks,
  formatKeywordDataForPrompt, formatBacklinkDataForPrompt,
  isDataForSEOConfigured,
} from '../utils/dataforseo.js';
import { jsRenderCrawl, formatJSCrawlForPrompt } from '../utils/js-crawler.js';
import { scoreSiteContent, formatContentScoresForPrompt } from '../utils/content-scorer.js';
import { crawlCompetitor, compareSnapshots, analyzeKeywordOverlap, formatCompetitorMonitorForPrompt } from '../utils/competitor-monitor.js';
import CompetitorSnapshot from '../models/CompetitorSnapshot.js';

const router = Router();

// ============================================================================
// AI CALL HELPER
// ============================================================================

// Track last AI call's token usage for downstream logging
let lastTokenUsage = null;
export function getLastTokenUsage() { return lastTokenUsage; }

async function aiCall(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 8192, json = false, timeout = 30000 } = options;
  lastTokenUsage = null;

  const overallController = new AbortController();
  const overallTimer = setTimeout(() => overallController.abort(), timeout);

  // Helper to check if model failed due to quota
  const isQuotaError = (status, data) => {
    if (status === 429) return true;
    const errText = JSON.stringify(data || {}).toLowerCase();
    return errText.includes('quota') || errText.includes('rate limit') || errText.includes('limit exceeded');
  };

  try {
    // 1. Try OpenAI (Fastest, but sometimes throttles)
    if (process.env.OPENAI_API_KEY) {
      try {
        const providerController = new AbortController();
        const pTimer = setTimeout(() => providerController.abort(), 20000); // 20s for OpenAI

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature, max_tokens: maxTokens,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: providerController.signal,
        });

        clearTimeout(pTimer);
        const data = await resp.json();

        if (resp.ok && data.choices?.[0]?.message?.content) {
          lastTokenUsage = { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0, model: 'gpt-4o-mini', provider: 'openai' };
          return data.choices[0].message.content;
        } else if (isQuotaError(resp.status, data)) {
          console.warn('⚠️ OpenAI quota hit, trying fallback...');
        } else {
          console.warn(`OpenAI error (${resp.status}):`, data.error?.message || 'Unknown error');
        }
      } catch (e) {
        console.warn(`OpenAI failed/timed out: ${e.message}`);
        if (overallController.signal.aborted) throw e;
      }
    }

    // 2. Try Grok (Alternative)
    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (grokKey && !overallController.signal.aborted) {
      try {
        const providerController = new AbortController();
        const pTimer = setTimeout(() => providerController.abort(), 20000);

        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
          body: JSON.stringify({
            model: 'grok-3-mini-fast',
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            temperature, max_tokens: maxTokens,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
          }),
          signal: providerController.signal,
        });

        clearTimeout(pTimer);
        const data = await resp.json();

        if (resp.ok && data.choices?.[0]?.message?.content) {
          lastTokenUsage = { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0, model: 'grok-3-mini-fast', provider: 'xai' };
          return data.choices[0].message.content;
        } else if (isQuotaError(resp.status, data)) {
          console.warn('⚠️ Grok quota hit, trying fallback...');
        }
      } catch (e) {
        console.warn(`Grok failed/timed out: ${e.message}`);
        if (overallController.signal.aborted) throw e;
      }
    }

    // 3. Fallback to Gemini (Most reliable, but slower)
    const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey && !overallController.signal.aborted) {
      const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
      for (const model of models) {
        if (overallController.signal.aborted) break;
        try {
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: userPrompt }] }],
                generationConfig: {
                  temperature, maxOutputTokens: maxTokens,
                  ...(json ? { responseMimeType: 'application/json' } : {}),
                },
              }),
              signal: overallController.signal,
            }
          );

          const data = await resp.json();
          if (resp.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
            const text = data.candidates[0].content.parts[0].text;
            lastTokenUsage = { inputTokens: data.usageMetadata?.promptTokenCount || 0, outputTokens: data.usageMetadata?.candidatesTokenCount || 0, model, provider: 'gemini' };
            return text;
          } else if (isQuotaError(resp.status, data)) {
            console.warn(`⚠️ Gemini ${model} quota hit, trying fallback...`);
          } else {
            console.warn(`Gemini ${model} error:`, JSON.stringify(data.error || data));
          }
        } catch (e) {
          if (overallController.signal.aborted) throw e;
          console.warn(`Gemini ${model} request failed: ${e.message}`);
        }
      }
    }

    throw new Error('All AI models failed, or quotas exceeded, or timeout reached');
  } finally {
    clearTimeout(overallTimer);
  }
}

function parseJSON(text) {
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  return JSON.parse(clean);
}

// Build brand context
function buildBrandContext(brand) {
  if (!brand) return '';
  const dna = brand.dna || {};
  return [
    `Brand: ${brand.name}`,
    brand.website ? `Website: ${brand.website}` : '',
    dna.industry ? `Industry: ${dna.industry}` : '',
    dna.brandDescription ? `Description: ${dna.brandDescription}` : '',
    dna.targetAudience ? `Target Audience: ${dna.targetAudience}` : '',
    dna.voice?.personality ? `Voice: ${dna.voice.personality}` : '',
    dna.country ? `Country: ${dna.country}` : '',
    dna.region ? `Region: ${dna.region}` : '',
    dna.defaultLanguage ? `Language: ${dna.defaultLanguage}` : '',
  ].filter(Boolean).join('\n');
}

// Load brand with fallback
async function loadBrand(brandId, userId) {
  if (!brandId) return null;
  try {
    const brand = await Brand.findById(brandId);
    if (brand && (brand.user.toString() === userId?.toString() || !userId)) return brand;
  } catch { }
  return null;
}


// ============================================================================
// HEALTH CHECK — Real crawl + AI analysis
// ============================================================================

router.post('/health-check', protect, requireStudio('seoStudio'), requireCredits('seoHealthCheck'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId } = req.body;

    // Load brand from DB or use payload
    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available. Please add a website to your brand.' });

    const brandContext = buildBrandContext(brand || brandPayload);

    // STEP 1: Real website research + Real PageSpeed (in parallel)
    console.log(`🔍 SEO Health Check: crawling ${website} + fetching PageSpeed...`);
    const [siteResearch, pageSpeedData] = await Promise.all([
      researchDomain(website),
      getPageSpeed(website, 'mobile').catch(e => ({ success: false, error: e.message })),
    ]);
    const siteData = formatSiteResearch(siteResearch);
    const pageSpeedText = formatPageSpeedForPrompt(pageSpeedData);

    // Timing Safeguard: Check if we have enough time left for AI
    const elapsed = Date.now() - (req.startTime || Date.now());
    const budget = 28000; // 28s budget for Gateway
    const remainingBudget = Math.max(5000, budget - elapsed);
    console.log(`⏱️ Health Check research took ${elapsed}ms. Remaining budget for AI: ${remainingBudget}ms`);

    const systemPrompt = `You are a SENIOR SEO STRATEGIST (not just an auditor). You think like a CMO + technical SEO expert combined. You have REAL CRAWL DATA — use it as ground truth. Never guess or contradict the crawl.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

${siteData}

${pageSpeedText}

Respond in STRICT JSON:
{
  "seoHealthScore": 0-100,
  "aiVisibilityScore": 0-100,
  "technicalScore": 0-100,
  "contentScore": 0-100,
  "authorityScore": 0-100,
  "summary": "3-4 sentence strategic executive summary — not just what's wrong, but what it means for the brand's growth. Reference specific findings and their business impact.",
  "strategicBrief": "A 2-3 paragraph strategic analysis written for a CMO. Explain the brand's current SEO position, biggest risks, and the single most impactful strategy to pursue. Reference industry trends and algorithm signals.",
  "algorithmRisks": [
    { "algorithm": "Helpful Content|E-E-A-T|Core Web Vitals|AI Overviews|Spam|Link Quality", "riskLevel": "high|medium|low", "why": "Why this algorithm specifically threatens or benefits this site based on crawl data", "action": "What to do about it" }
  ],
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "technical|content|ai-seo|authority|performance",
      "title": "Issue title",
      "description": "What's wrong — reference actual crawl data",
      "whyItMatters": "Connect this to a specific ranking signal or business outcome. Example: 'Missing H1 tags mean Google cannot determine page topic, reducing ranking potential for primary keywords'",
      "impact": "Estimated traffic/visibility impact (e.g., '15-30% reduced click-through from search results')",
      "fix": "Step-by-step fix with code snippets where applicable",
      "effort": "quick-fix|moderate|major",
      "algorithmConnection": "Which Google algorithm/signal this relates to"
    }
  ],
  "fixNow": [
    { "title": "Action", "description": "Specific steps", "impact": "high|medium", "effort": "quick-fix|moderate", "whyFirst": "Why this should be prioritized over other fixes" }
  ],
  "createNext": [
    { "title": "Content to create", "keyword": "target keyword", "type": "blog|landing|faq|guide", "reason": "Why this content fills a strategic gap", "expectedOutcome": "What ranking/traffic improvement to expect" }
  ],
  "monitor": [
    { "title": "Metric", "metric": "How to measure", "frequency": "daily|weekly|monthly", "threshold": "Alert threshold" }
  ],
  "aiSeoInsights": {
    "schemaReadiness": { "score": 0-100, "issues": ["issue"], "recommendations": ["rec"] },
    "qnaPresence": { "score": 0-100, "suggestions": ["Add FAQ about X"] },
    "entityCoverage": { "score": 0-100, "missingEntities": ["entity"], "recommendations": ["rec"] },
    "snippetStructure": { "score": 0-100, "recommendations": ["rec"] },
    "trustSignals": { "score": 0-100, "recommendations": ["rec"] }
  },
  "topOpportunity": "The single biggest growth opportunity — explain WHY it's the biggest and what business outcome to expect",
  "competitorHints": ["What top competitors in this industry likely do better, based on industry standards"],
  "industryBenchmark": "How this site compares to typical sites in the same industry — above/below average and why",
  "crawlSummary": "What the live crawl revealed"
}

Generate 8-15 issues. Be STRATEGIC — every issue must have a 'whyItMatters' that connects to business outcomes. Think like a consultant, not a checklist tool.`;

    const userPrompt = `Analyze site: ${website}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192, timeout: remainingBudget });
    // Log token usage from this AI call
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: req.creditAction || 'seoHealthCheck', studio: 'seo', route: req.originalUrl, brandId: brand?._id });
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];
    // Attach real PageSpeed data to response
    if (pageSpeedData?.success) {
      parsed.realPageSpeed = {
        scores: pageSpeedData.scores,
        coreWebVitals: pageSpeedData.coreWebVitals,
        overallFieldAssessment: pageSpeedData.overallFieldAssessment,
        failedAudits: pageSpeedData.failedAudits,
        dataSource: pageSpeedData.dataSource,
      };
    }

    // Save audit
    if (req.user) {
      try {
        await SeoAudit.create({
          user: req.user._id,
          brand: brand?._id || brandPayload?._id,
          type: 'health-check',
          url: website,
          scores: {
            seoHealth: parsed.seoHealthScore || 0,
            aiVisibility: parsed.aiVisibilityScore || 0,
            technicalScore: parsed.technicalScore || 0,
            contentScore: parsed.contentScore || 0,
            authorityScore: parsed.authorityScore || 0,
          },
          results: parsed,
          status: 'completed',
        });
      } catch (dbErr) { console.warn('Could not save audit:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('SEO Health Check error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// GET ME TRAFFIC — Real crawl + keyword research
// ============================================================================

router.post('/traffic', protect, requireStudio('seoStudio'), requireCredits('seoTraffic'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId, industry, country } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    const brandContext = buildBrandContext(brand || brandPayload);
    const brandObj = brand || brandPayload || {};
    const dna = brandObj.dna || {};

    // Derive PAA seed queries from brand context
    const brandName = brand?.name || brandPayload?.name || '';
    const industryFocus = industry || dna.industry || 'General';
    const paaSeeds = [
        brandName && industryFocus !== 'General' ? `${brandName} ${industryFocus}` : '',
        industryFocus !== 'General' ? `best ${industryFocus}` : '',
        industryFocus !== 'General' ? `${industryFocus} tips` : '',
    ].filter(Boolean).slice(0, 3);

    // Map country to Google gl parameter
    const countryGlMap = { 'India': 'in', 'United States': 'us', 'UAE': 'ae', 'Dubai': 'ae', 'UK': 'gb', 'Singapore': 'sg', 'Australia': 'au', 'Saudi Arabia': 'sa' };
    const countryFocus = country || dna.country || 'India';
    const gl = countryGlMap[countryFocus] || 'in';

    // Run site crawl + Keyword Intelligence Engine + PAA scraping in parallel
    console.log(`\n🧠 SEO Traffic: Running Intelligence Engine + deep crawl + PAA for ${website}...`);
    const [siteResearch, keywordIntel, paaData] = await Promise.all([
      researchDomain(website),
      runKeywordIntelligence(brandObj, { seedKeywords: [] }).catch(e => {
        console.warn('Keyword Intelligence Engine error:', e.message);
        return { success: false, error: e.message };
      }),
      paaSeeds.length > 0 ? batchPAA(paaSeeds, gl).catch(e => {
        console.warn('PAA scraper error:', e.message);
        return { allQuestions: [], allRelated: [] };
      }) : Promise.resolve({ allQuestions: [], allRelated: [] }),
    ]);
    const siteData = formatSiteResearch(siteResearch);
    const paaText = formatPAAForPrompt(paaData);
    console.log(`🔍 PAA: ${paaData.allQuestions?.length || 0} questions, ${paaData.allRelated?.length || 0} related searches`);

    // ── Wave 2: Enrich discovered keywords with DataForSEO (if configured) ──
    let realKeywordData = null;
    let backlinkData = null;
    if (isDataForSEOConfigured()) {
      // Collect discovered keywords from keyword intelligence
      const discoveredKws = [];
      if (keywordIntel?.strategist?.mustTarget) {
        for (const kw of keywordIntel.strategist.mustTarget) discoveredKws.push(kw.keyword);
      }
      if (keywordIntel?.strategist?.hiddenGems) {
        for (const kw of keywordIntel.strategist.hiddenGems) discoveredKws.push(kw.keyword);
      }
      if (keywordIntel?.signals?.allDiscoveredKeywords) {
        for (const kw of keywordIntel.signals.allDiscoveredKeywords.slice(0, 30)) {
          discoveredKws.push(typeof kw === 'string' ? kw : kw.keyword || kw.term);
        }
      }
      const uniqueKws = [...new Set(discoveredKws.filter(Boolean))].slice(0, 50);

      if (uniqueKws.length > 0) {
        const domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
        console.log(`📊 DataForSEO: Enriching ${uniqueKws.length} keywords + backlinks for ${domain}...`);
        [realKeywordData, backlinkData] = await Promise.all([
          getKeywordIntelligence(uniqueKws, { country: countryFocus }).catch(e => {
            console.warn('DataForSEO keyword error:', e.message);
            return null;
          }),
          getDomainBacklinks(domain).catch(e => {
            console.warn('DataForSEO backlinks error:', e.message);
            return null;
          }),
        ]);
      }
    }

    // Timing Safeguard: Check if we have enough time left for AI
    const elapsed = Date.now() - (req.startTime || Date.now());
    const budget = 28000; // 28s budget for Gateway
    const remainingBudget = Math.max(5000, budget - elapsed);
    console.log(`⏱️ Traffic research took ${elapsed}ms. Remaining budget for AI: ${remainingBudget}ms`);

    // Build enriched signal data for AI prompt
    let intelligenceData = '';
    if (keywordIntel && keywordIntel.success) {
      intelligenceData = keywordIntel.signalPrompt || '';
      const strat = keywordIntel.strategist;
      if (strat) {
        if (strat.strategicVerdict) {
          intelligenceData += '\n=== CMO STRATEGIC ANALYSIS ===\n' + strat.strategicVerdict + '\n';
        }
        if (strat.mustTarget && strat.mustTarget.length) {
          intelligenceData += '\nMust-Target Keywords:\n';
          for (const kw of strat.mustTarget.slice(0, 10)) {
            intelligenceData += '  - "' + kw.keyword + '" (est. ' + kw.volume + '/mo) — ' + kw.why + '\n';
          }
        }
        if (strat.hiddenGems && strat.hiddenGems.length) {
          intelligenceData += '\nHidden Gems (low volume, high value):\n';
          for (const kw of strat.hiddenGems.slice(0, 5)) {
            intelligenceData += '  - "' + kw.keyword + '" (est. ' + kw.volume + '/mo) — ' + kw.why + '\n';
          }
        }
        if (strat.vernacularOpportunities && strat.vernacularOpportunities.length) {
          intelligenceData += '\nVernacular Language Opportunities:\n';
          for (const kw of strat.vernacularOpportunities.slice(0, 5)) {
            intelligenceData += '  - "' + kw.keyword + '" [' + kw.language + '] (est. ' + kw.volume + '/mo, competition: ' + kw.competition + ')\n';
          }
        }
        if (strat.avoid && strat.avoid.length) {
          intelligenceData += '\nKeywords to AVOID:\n';
          for (const kw of strat.avoid.slice(0, 5)) {
            intelligenceData += '  - "' + kw.keyword + '" (' + kw.volume + '/mo) — ' + kw.why + '\n';
          }
        }
      }
    }

    // Append PAA data to intelligence
    if (paaText) {
      intelligenceData += paaText;
    }

    // Append DataForSEO real data (when available)
    const realKwText = formatKeywordDataForPrompt(realKeywordData);
    const backlinkText = formatBacklinkDataForPrompt(backlinkData);
    if (realKwText) intelligenceData += realKwText;
    if (backlinkText) intelligenceData += backlinkText;

    const hasRealData = !!(realKeywordData?.available);
    const systemPrompt = 'You are a STRATEGIC SEO GROWTH ADVISOR. You have REAL DATA from multiple intelligence sources.\n\n'
      + 'You have:\n'
      + '1. REAL CRAWL DATA from the brand\'s website (deep crawl — 20+ pages with sitemap/robots.txt analysis)\n'
      + '2. REAL Google Trends data with verified interest scores\n'
      + '3. REAL Google SERP sampling with difficulty scores\n'
      + '4. REAL suggestions from Google, YouTube, Amazon, and Bing\n'
      + '5. REAL People Also Ask (PAA) questions from Google\n'
      + '6. Multi-agent AI analysis (Scout, Analyst, Strategist)\n'
      + (hasRealData ? '7. VERIFIED keyword volumes, CPC, and difficulty from DataForSEO\n8. VERIFIED backlink data from DataForSEO\n' : '')
      + '\nCRITICAL: Use the VERIFIED signals. Do NOT override real data with guesses. When volume estimates come from Google Trends or multi-agent consensus, use those numbers.'
      + (hasRealData ? ' The DataForSEO data is the MOST ACCURATE — always prefer it over AI estimates.' : '')
      + '\n\n'
      + (brandContext ? 'BRAND CONTEXT:\n' + brandContext + '\n\n' : '')
      + 'Country: ' + countryFocus + '\nIndustry: ' + industryFocus + '\n\n'
      + siteData + '\n\n'
      + intelligenceData + '\n\n'
      + 'Respond in JSON:\n'
      + '{\n'
      + '  "summary": "3-4 sentence strategic analysis grounded in REAL data",\n'
      + '  "strategicInsight": "2-3 paragraph brief referencing verified data",\n'
      + '  "dataConfidence": "How much is based on verified data vs AI estimation",\n'
      + '  "keywordClusters": [\n'
      + '    {\n'
      + '      "clusterName": "Topic cluster",\n'
      + '      "whyThisCluster": "Strategic reason with data backing",\n'
      + '      "funnelStage": "awareness|consideration|decision|retention",\n'
      + '      "intent": "buy|learn|compare|local|navigate",\n'
      + '      "opportunityScore": "0-100",\n'
      + '      "difficulty": "easy|medium|hard",\n'
      + '      "difficultyScore": "0-100",\n'
      + '      "estimatedMonthlySearches": "Use verified numbers",\n'
      + '      "confidenceStars": "1-5",\n'
      + '      "keywords": [\n'
      + '        { "keyword": "kw", "volume": 5000, "intent": "type", "difficulty": "level", "difficultyScore": 50, "source": "trends|autocomplete|serp|agent", "whyItMatters": "reason" }\n'
      + '      ],\n'
      + '      "recommendedPageType": "blog|landing|faq|guide|case-study",\n'
      + '      "suggestedTitle": "SEO-optimized title",\n'
      + '      "suggestedOutline": ["H2 1", "H2 2", "H2 3"],\n'
      + '      "contentAngle": "Unique angle"\n'
      + '    }\n'
      + '  ],\n'
      + '  "existingContentStrengths": [\n'
      + '    { "page": "Page from crawl", "strength": "What it does well", "improvement": "How to rank higher", "whyImprove": "ROI reason" }\n'
      + '  ],\n'
      + '  "risingKeywords": [\n'
      + '    { "keyword": "kw", "volume": 1000, "trend": "rising|breakout|seasonal", "reason": "Why", "source": "trends|scout", "actionDeadline": "When" }\n'
      + '  ],\n'
      + '  "contentGaps": [\n'
      + '    { "topic": "Missing topic", "competitorsCovering": 3, "priority": "high|medium", "suggestedFormat": "format", "revenueImpact": "Impact" }\n'
      + '  ],\n'
      + '  "quickWins": [\n'
      + '    { "action": "What to do", "keyword": "kw", "expectedImpact": "Impact", "effort": "quick-fix|moderate", "whyQuick": "Reason" }\n'
      + '  ],\n'
      + '  "thirtyDayPlan": [\n'
      + '    { "week": 1, "theme": "Focus", "actions": ["Action 1"], "expectedOutcome": "Outcome" },\n'
      + '    { "week": 2, "theme": "Focus", "actions": ["Action 1"], "expectedOutcome": "Outcome" },\n'
      + '    { "week": 3, "theme": "Focus", "actions": ["Action 1"], "expectedOutcome": "Outcome" },\n'
      + '    { "week": 4, "theme": "Focus", "actions": ["Action 1"], "expectedOutcome": "Outcome" }\n'
      + '  ]\n'
      + '}\n\n'
      + 'Generate 5-8 keyword clusters. Use VERIFIED volumes where available. Add confidenceStars (1-5) based on how many data layers support each cluster.';

    const userPrompt = 'Find traffic opportunities for: ' + website;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192, timeout: remainingBudget });
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: 'seoTraffic', studio: 'seo', route: req.originalUrl, brandId: brand?._id });
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];

    // Attach real intelligence metadata
    if (keywordIntel && keywordIntel.success) {
      parsed.intelligenceEngine = {
        dataLayers: keywordIntel.meta.dataLayers,
        totalKeywordsDiscovered: keywordIntel.meta.totalKeywordsDiscovered,
        elapsedSeconds: keywordIntel.meta.elapsedSeconds,
        tokensUsed: keywordIntel.meta.tokensUsed,
        strategistModel: keywordIntel.meta.dataLayers.strategistModel,
      };
      parsed.realSignals = {
        trendsData: keywordIntel.signals.trendsData,
        serpData: keywordIntel.signals.serpData,
        scoutInsights: keywordIntel.signals.scoutInsights,
        discoveredKeywords: (keywordIntel.signals.allDiscoveredKeywords || []).slice(0, 50),
      };
      parsed.agentAnalysis = {
        analyst: keywordIntel.analyst,
        strategist: keywordIntel.strategist,
      };
      parsed.dataSource = realKeywordData?.available ? 'dataforseo+intelligence' : 'keyword-intelligence-engine';
    } else {
      parsed.dataSource = 'ai-only';
    }

    // Attach DataForSEO real keyword data (when available)
    if (realKeywordData?.available && realKeywordData.keywords?.length > 0) {
      parsed.verifiedKeywords = realKeywordData.keywords.map(kw => ({
        keyword: kw.keyword,
        searchVolume: kw.searchVolume,
        cpc: kw.cpc,
        difficulty: kw.difficulty,
        competition: kw.competitionLevel,
      }));
      parsed.dataForSEOEnabled = true;
    }

    // Attach backlink data (when available)
    if (backlinkData?.available && backlinkData.summary) {
      parsed.backlinkProfile = {
        ...backlinkData.summary,
        topReferringDomains: (backlinkData.topReferringDomains || []).slice(0, 10),
      };
    }

    // Attach PAA data
    if (paaData?.allQuestions?.length > 0) {
      parsed.peopleAlsoAsk = paaData.allQuestions;
      parsed.relatedSearches = paaData.allRelated;
    }

    // Attach deep crawl intelligence
    if (siteResearch.siteIntelligence) {
      parsed.crawlIntelligence = {
        totalPages: siteResearch.siteIntelligence.totalPages,
        hasSitemap: siteResearch.siteIntelligence.hasSitemap,
        hasRobotsTxt: siteResearch.siteIntelligence.hasRobotsTxt,
        thinPageCount: siteResearch.siteIntelligence.thinPageCount,
        duplicateContentCount: siteResearch.siteIntelligence.duplicateContentCount,
        redirectChainCount: siteResearch.siteIntelligence.redirectChainCount,
        missingMetaCount: siteResearch.siteIntelligence.missingMetaDescriptions?.length || 0,
        missingH1Count: siteResearch.siteIntelligence.missingH1Tags?.length || 0,
      };
    }

    // Save to SeoAudit for persistence
    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'traffic' },
          { results: parsed, url: website, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save traffic audit:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('SEO Traffic error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// BEAT COMPETITORS — Real competitor research
// ============================================================================

router.post('/competitors', protect, requireStudio('seoStudio'), requireCredits('seoCompetitors'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId, competitorUrls } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    const brandContext = buildBrandContext(brand || brandPayload);

    // Gather competitor URLs (stored + user-provided)
    const storedCompetitors = (brand?.competitors || []).map(c => c.url).filter(Boolean);
    const providedCompetitors = (competitorUrls || []).filter(u => u.trim());
    const allCompetitorUrls = [...new Set([...storedCompetitors, ...providedCompetitors])].slice(0, 5);

    // STEP 1 & 2: Crawl brand and competitors in PARALLEL
    console.log(`🔍 SEO Competitors: parallel crawl for ${website} and ${allCompetitorUrls.length} competitors...`);
    const [siteResearch, competitorResults] = await Promise.all([
      researchDomain(website),
      allCompetitorUrls.length > 0 ? researchCompetitors(allCompetitorUrls) : Promise.resolve([])
    ]);

    const siteData = formatSiteResearch(siteResearch);
    let competitorData = '';
    
    if (competitorResults.length > 0) {
      competitorData = formatCompetitorResearch(competitorResults);
    } else {
      competitorData = 'No competitor URLs provided. Identify the top 3-5 most likely competitors based on brand industry and location, and provide their real URLs.';
    }

    // Timing Safeguard: Check if we have enough time left for AI
    const elapsed = Date.now() - (req.startTime || Date.now());
    const budget = 28000; // 28s budget
    const remainingBudget = Math.max(5000, budget - elapsed);
    console.log(`⏱️ Competitor research took ${elapsed}ms. Remaining budget for AI: ${remainingBudget}ms`);

    const systemPrompt = `You are a COMPETITIVE INTELLIGENCE STRATEGIST — you think like a war-room strategist, not a data reporter. You have REAL CRAWL DATA from both the brand and competitor websites. Your job is to explain WHY competitors win, WHAT their strategy is, and HOW to beat them.

CRITICAL: Don't just say "competitor has more content" — explain WHY that matters, WHAT it means strategically, and WHAT specific actions will change the outcome. Every insight must be actionable.

STRATEGIC FRAMEWORK (2026):
- Topical authority: Sites that own a topic cluster dominate search. A competitor with 20 articles on "cloud security" will outrank one with 2.
- Content velocity matters: Google's freshness signals favor sites that publish consistently. Estimate competitor publishing frequency.
- Technical SEO parity: If a competitor has schema markup and you don't, you're losing rich results. This is a concrete, fixable disadvantage.
- Backlink authority: Mention domain authority comparisons briefly — but focus on what's controllable (content, structure, schema).
- AI Overviews: Structured, authoritative content gets cited by AI. If competitors have FAQ schemas and you don't, they will be cited and you won't.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

=== BRAND SITE DATA ===
${siteData}

${competitorData}

Respond in JSON:
{
  "summary": "3-4 sentence competitive intelligence brief — who is winning and WHY, strategic positioning",
  "strategicBrief": "A 2-3 paragraph strategic analysis. Explain the competitive landscape, the brand's position, specific defensive and offensive strategies. Think like a CMO's advisor.",
  "competitivePosition": "winning|competitive|behind|far-behind",
  "biggestThreat": "The single most dangerous competitive disadvantage and WHY it matters",
  "biggestOpportunity": "The single biggest competitive gap the brand can exploit and WHY it will work",
  "competitors": [
    {
      "name": "Competitor name",
      "url": "Real website URL",
      "threatLevel": "high|medium|low",
      "whyTheyWin": "Specific reason from crawl data — what strategic advantage do they have",
      "theirStrategy": "What content/SEO strategy are they executing based on the crawl data",
      "strengths": ["Specific strength from crawl data"],
      "weaknesses": ["Exploitable weakness from crawl data"],
      "topTopics": ["Topics they own based on headings"],
      "estimatedAuthority": "high|medium|low",
      "contentVelocity": "Estimated posting frequency",
      "schemaAdvantage": "What schema/structured data they have that the brand doesn't",
      "howToBeat": "Specific actionable plan to outperform this competitor"
    }
  ],
  "whyTheyWin": [
    { "reason": "Strategic reason from crawl data", "evidence": "Specific observation", "whyItMatters": "How this translates to higher rankings/traffic", "fix": "Specific counterstrategy", "priority": "high|medium", "timeline": "1 week|2 weeks|1 month|3 months" }
  ],
  "keywordBattles": [
    { "keyword": "Keyword topic", "yourPosition": "weak|absent|moderate|strong", "competitorPosition": "dominant|strong|moderate", "whyTheyRank": "Specific reason they rank higher", "howToWin": "Content strategy to outrank them", "difficulty": "easy|medium|hard" }
  ],
  "gapOpportunities": [
    { "topic": "Underserved topic ALL competitors miss", "difficulty": "easy|medium", "strategy": "How to own it fast", "suggestedContent": "Specific content piece", "whyNoOneCoversThis": "Why this gap exists and why it's valuable" }
  ],
  "outrankPlan": [
    { "priority": 1, "action": "Specific action", "target": "Which competitor/keyword", "timeline": "This week|2 weeks|1 month", "effort": "quick-fix|moderate|major", "whyThisFirst": "Strategic reasoning for this priority order", "expectedOutcome": "What will change" }
  ],
  "contentToBeat": [
    { "competitorPage": "Their winning content topic", "whyItWins": "What makes it rank based on crawl", "yourBetterVersion": "How to create 10x content that beats it", "uniqueAngle": "What unique perspective or data the brand can bring" }
  ],
  "defensiveStrategy": "What to do to protect current rankings from competitor encroachment",
  "offensiveStrategy": "How to aggressively capture competitor traffic in the next 90 days",
  "discoveredCompetitors": [
    { "name": "Competitor name", "url": "Real website URL" }
  ]
}

Be STRATEGIC and SPECIFIC. Every insight must have a WHY and an actionable HOW. Think like a competitive intelligence firm, not a scraping tool.`;

    const userPrompt = `Competitive analysis for: ${website}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 8192, timeout: remainingBudget });
    const parsed = parseJSON(result);
    parsed.researchSources = [
      ...(siteResearch.pages?.map(p => p.url) || [website]),
      ...allCompetitorUrls,
    ];

    // Save to SeoAudit for persistence
    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'competitors' },
          { results: parsed, url: website, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save competitors audit:', dbErr.message); }
    }

    // Auto-save discovered competitors to brand if authenticated
    if (brand && parsed.discoveredCompetitors?.length && !storedCompetitors.length) {
      try {
        const toSave = parsed.discoveredCompetitors
          .filter(c => c.url && c.name)
          .slice(0, 5)
          .map(c => ({ name: c.name, url: c.url, addedBy: 'ai' }));

        // Also include from competitors array
        const fromAnalysis = (parsed.competitors || [])
          .filter(c => c.url && c.name && !toSave.some(s => s.url === c.url))
          .slice(0, 3)
          .map(c => ({ name: c.name, url: c.url, addedBy: 'ai' }));

        const allNew = [...toSave, ...fromAnalysis].slice(0, 5);
        if (allNew.length) {
          brand.competitors = allNew;
          await brand.save();
          console.log(`💾 Saved ${allNew.length} competitors to brand ${brand.name}`);
        }
      } catch (e) { console.warn('Could not save competitors:', e.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('SEO Competitors error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// AI VISIBILITY — Real structured data audit
// ============================================================================

router.post('/ai-visibility', protect, requireStudio('seoStudio'), requireCredits('seoAiVisibility'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    const brandContext = buildBrandContext(brand || brandPayload);

    // Real crawl
    console.log(`🔍 AI Visibility: crawling ${website}...`);
    const siteResearch = await researchDomain(website);
    const siteData = formatSiteResearch(siteResearch);

    // Timing Safeguard: Check if we have enough time left for AI
    const elapsed = Date.now() - (req.startTime || Date.now());
    const budget = 28000; // 28s budget
    const remainingBudget = Math.max(5000, budget - elapsed);
    console.log(`⏱️ AI Visibility research took ${elapsed}ms. Remaining budget for AI: ${remainingBudget}ms`);

    const systemPrompt = `You are an AI SEARCH STRATEGIST — the world's foremost expert on making brands visible in AI-powered search (Google AI Overviews, ChatGPT + Bing, Perplexity, Gemini, Claude, etc.) in 2026.

You have REAL CRAWL DATA. Use it as ground truth. Don't guess — analyze what's actually there.

CRITICAL: Explain WHY each recommendation matters for AI visibility. Connect every finding to how LLMs discover, evaluate, and cite content. Don't just list what's missing — explain the strategic consequence of each gap.

AI SEARCH LANDSCAPE (2026):
- Google AI Overviews appear in 45%+ of informational queries. Sites cited in AI Overviews get 2-3x more brand visibility.
- LLMs prioritize: Structured data (JSON-LD), FAQ markup, clear heading hierarchy, authoritative entity mentions, and answer-first content
- ChatGPT/Perplexity cite pages with: strong entity presence, FAQ schemas, unique data/statistics, well-structured headings (H1→H2→H3 hierarchy)
- "Entity establishment" — LLMs need to understand WHAT an entity (brand/product) IS before they can recommend it. This requires schema markup, consistent NAP data, and authoritative mentions.
- "Citability" — AI models prefer content that is well-organized, answer-first, factual, and shows expertise. Opinion pieces without data rarely get cited.
- Rich results (FAQ, How-to, Review) increase click-through AND AI citation rates simultaneously.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

${siteData}

Respond in JSON:
{
  "aiVisibilityScore": 0-100,
  "summary": "3-4 sentence strategic summary — is this brand visible to AI? WHY or WHY NOT? What's the single biggest thing blocking AI citation?",
  "strategicBrief": "2-3 paragraph strategic analysis for the brand owner. Explain the AI search landscape, where this brand stands, and the specific strategy to become the go-to AI-recommended brand in their industry. Be specific to their industry and crawl findings.",
  "aiSearchReadiness": "ready|partially-ready|not-ready",
  "whyItMatters": "Explain in plain language why AI visibility matters for THIS brand's revenue and growth. Use industry-specific examples.",
  "breakdown": {
    "schemaReadiness": {
      "score": 0-100,
      "currentState": "What schema was found or MISSING",
      "whyItMatters": "How schema markup directly affects whether AI cites this site. Reference specific AI models.",
      "issues": ["Specific schema issue"],
      "recommendations": [
        { "title": "Schema to add", "description": "How and why", "priority": "high|medium|low", "codeSnippet": "Ready-to-use JSON-LD code snippet", "aiImpact": "How this specific schema helps with AI citation" }
      ]
    },
    "qnaPresence": {
      "score": 0-100,
      "currentState": "FAQ/Q&A assessment",
      "whyItMatters": "Why FAQ content is the #1 driver of AI Overviews citations",
      "suggestions": [
        { "question": "FAQ question to add", "answerGuidance": "What to cover", "targetPage": "Where to add", "whyThisQuestion": "Why AI models frequently encounter this question" }
      ]
    },
    "entityCoverage": {
      "score": 0-100,
      "currentEntities": ["Entities found"],
      "missingEntities": ["Entities needed"],
      "whyItMatters": "Why entity establishment is critical for LLMs to understand and recommend THIS brand",
      "recommendations": ["How to strengthen entity presence"]
    },
    "snippetStructure": {
      "score": 0-100,
      "whyItMatters": "How content structure affects AI model parsing and citation selection",
      "issues": ["Structure issues from headings"],
      "templates": [
        { "type": "Answer-first|List|Table|How-to", "template": "Template text", "useCase": "When to use", "aiAdvantage": "Why AI prefers this format" }
      ]
    },
    "trustSignals": {
      "score": 0-100,
      "whyItMatters": "How trust signals (reviews, certifications, author info) influence AI model confidence in citing this source",
      "currentSignals": ["Found"],
      "missing": ["Missing"],
      "recommendations": ["How to add"]
    }
  },
  "aiReadyTemplates": [
    {
      "name": "Template name",
      "description": "Purpose",
      "template": "Ready-to-use template with [BRAND] placeholders",
      "example": "Filled example for this brand",
      "whyItWorks": "Why AI models prefer this format"
    }
  ],
  "priorityActions": [
    { "priority": 1, "action": "What to do", "impact": "high|medium", "effort": "quick-fix|moderate|major", "details": "Step by step", "whyThisOrder": "Why this should be done first", "expectedOutcome": "What will change in AI visibility" }
  ],
  "optimizations": [
    {
      "title": "Specific, actionable optimization — NOT generic advice like 'Improve content'",
      "description": "Exact steps to implement this optimization with tool/code references",
      "priority": "critical|high|medium",
      "kpi": "The exact metric to measure (e.g., 'FAQ schema count', 'AI Overview citation rate', 'Schema validation score')",
      "baseline": "Current measured value from crawl data (e.g., '0 FAQ schemas found', '2 of 10 pages have JSON-LD')",
      "target": "Specific measurable target (e.g., 'FAQ schema on top 5 landing pages', '100% pages with Organization schema')",
      "timeline": "Realistic timeline to implement (e.g., '3 days', '1 week', '2 weeks')",
      "proofMethod": "How to verify this worked (e.g., 'Re-run AI Visibility scan — schemaReadiness score should increase by 15-25 points', 'Check Google Rich Results Test for FAQ snippets')",
      "expectedROI": "Business outcome (e.g., '10-20% increase in AI Overview citations within 30 days', 'Rich snippet appearance for 5 target queries')"
    }
  ],
  "contentPatterns": [
    { "pattern": "Content pattern name", "description": "How to implement", "example": "Brief example", "aiAdvantage": "Why AI models prefer content formatted this way" }
  ],
  "llmSpecificInsights": {
    "googleAIOverviews": "Specific advice for being cited in Google AI Overviews based on crawl findings",
    "chatGPT": "Specific advice for ChatGPT/Bing citations",
    "perplexity": "Specific advice for Perplexity citations"
  },
  "crawlFindings": "Summary of what the crawl revealed about AI readiness"
}

STRATEGIC RULES (MANDATORY):
1. NEVER give generic advice like 'Enhance User Engagement' or 'Leverage Influencer Marketing' — these are worthless
2. Every optimization MUST reference specific crawl data findings
3. Every optimization MUST have a measurable KPI with a baseline (from crawl) and a target
4. Every optimization MUST explain HOW TO PROVE it worked after implementation
5. Think like a consultant billing $500/hour — every recommendation must justify its existence with data`;

    const userPrompt = `AI Visibility audit for: ${website}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192, timeout: remainingBudget });
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];

    // Save to SeoAudit for persistence
    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'ai-visibility' },
          { results: parsed, url: website, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save AI visibility audit:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('AI Visibility error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// ON-PAGE AUDIT
// ============================================================================

router.post('/audit-page', protect, requireStudio('seoStudio'), requireCredits('seoAuditPage'), async (req, res) => {
  try {
    const { pageUrl, brand: brandPayload, brandId, keyword } = req.body;
    if (!pageUrl) return res.status(400).json({ success: false, error: 'Page URL is required' });

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const brandContext = buildBrandContext(brand || brandPayload);

    // Crawl the specific page
    const { crawlPage } = await import('../utils/web-research.js');
    const pageData = await crawlPage(pageUrl);

    let pageInfo = '';
    if (pageData.success) {
      pageInfo = `=== REAL PAGE DATA (crawled live) ===
Title: ${pageData.title || 'MISSING'}
Meta Description: ${pageData.metaDescription || 'MISSING'}
H1: ${pageData.h1?.join(', ') || 'MISSING'}
H2: ${pageData.h2?.join(', ') || 'None'}
H3: ${pageData.h3?.join(', ') || 'None'}
Word count: ${pageData.wordCount}
Images: ${pageData.images?.total} (${pageData.images?.withoutAlt} missing alt)
Schema: ${pageData.hasSchemaOrg ? pageData.schemaTypes.join(', ') : 'NONE'}
Canonical: ${pageData.canonical || 'MISSING'}
Content preview: ${pageData.contentSnippet}`;
    }

    const systemPrompt = `You are an on-page SEO expert. ${pageInfo ? 'You have REAL crawl data for this page. Use it as your primary source.' : 'Analyze based on URL pattern and brand context.'}

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}
${pageInfo}
${keyword ? `Target keyword: ${keyword}` : ''}

Respond in JSON:
{
  "pageScore": 0-100,
  "currentTitle": "${pageData.title || 'Unknown'}",
  "suggestedTitle": "Optimized title",
  "currentMeta": "${pageData.metaDescription || 'MISSING'}",
  "suggestedMeta": "Optimized meta description",
  "h1Suggestion": "Optimized H1",
  "h2Suggestions": ["H2 1", "H2 2", "H2 3"],
  "faqBlocks": [{ "question": "FAQ Q", "answer": "FAQ A" }],
  "internalLinkSuggestions": [{ "anchorText": "Link text", "targetPage": "Page to link to", "reason": "Why" }],
  "contentImprovements": [{ "section": "Which section", "issue": "What's wrong", "suggestion": "How to improve" }],
  "schemaRecommendations": ["Schema to add"],
  "snippetParagraph": "Answer-first paragraph for featured snippets"
}`;

    const userPrompt = `On-page SEO audit for: ${pageUrl}${keyword ? ` (targeting: ${keyword})` : ''}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 6000 });
    const parsed = parseJSON(result);

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('Page audit error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// COMPETITOR MANAGEMENT
// ============================================================================

// POST /api/seo-studio/competitors/manage — Add/remove competitors
router.post('/competitors/manage', protect, async (req, res) => {
  try {
    const { brandId, action, competitor } = req.body;
    if (!brandId) return res.status(400).json({ success: false, error: 'Brand ID required' });

    const brand = await Brand.findById(brandId);
    if (!brand || brand.user.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, error: 'Brand not found' });
    }

    if (action === 'add' && competitor?.url) {
      // Normalize URL
      let compUrl = competitor.url.trim();
      if (!/^https?:\/\//i.test(compUrl)) compUrl = `https://${compUrl}`;

      // Don't add duplicates
      const exists = brand.competitors.some(c => c.url === compUrl);
      if (!exists) {
        brand.competitors.push({
          name: competitor.name || new URL(compUrl).hostname.replace(/^www\./, ''),
          url: compUrl,
          addedBy: 'user',
        });
        await brand.save();
      }
    } else if (action === 'remove' && competitor?.url) {
      brand.competitors = brand.competitors.filter(c => c.url !== competitor.url);
      await brand.save();
    }

    res.json({ success: true, competitors: brand.competitors });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// POST /api/seo-studio/competitors/discover — AI auto-discover competitors
router.post('/competitors/discover', protect, requireCredits('seoCompetitorDiscover'), async (req, res) => {
  try {
    const { brandId } = req.body;
    if (!brandId) return res.status(400).json({ success: false, error: 'Brand ID required' });

    const brand = await loadBrand(brandId, req.user._id);
    if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

    const brandContext = buildBrandContext(brand);

    const systemPrompt = `You are a competitive intelligence expert. Given this brand, identify the 5 most likely real competitors. These must be REAL existing companies with REAL websites.

${brandContext}

Respond in JSON:
{
  "competitors": [
    { "name": "Company Name", "url": "https://real-website.com", "reason": "Why they compete" }
  ]
}

CRITICAL: Only include REAL existing companies. Do not make up fictional companies or URLs.`;

    const result = await aiCall(systemPrompt, `Find competitors for: ${brand.name} (${brand.website || brand.dna?.industry || 'general'})`, { json: true, temperature: 0.5 });
    const parsed = parseJSON(result);

    // Save to brand
    if (parsed.competitors?.length) {
      const toSave = parsed.competitors
        .filter(c => c.url && c.name)
        .slice(0, 5)
        .map(c => ({ name: c.name, url: c.url, addedBy: 'ai' }));

      // Merge with existing (don't overwrite user-added)
      const userAdded = brand.competitors.filter(c => c.addedBy === 'user');
      brand.competitors = [...userAdded, ...toSave.filter(n => !userAdded.some(u => u.url === n.url))].slice(0, 8);
      await brand.save();
    }

    res.json({ success: true, competitors: brand.competitors });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// BACKLINK INTELLIGENCE — Agentic multi-phase backlink crawler
// ============================================================================

router.post('/backlinks', protect, requireStudio('seoStudio'), requireCredits('seoBacklinks'), async (req, res) => {
  let brandDomain;
  try {
    const { url, brand: brandPayload, brandId } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available. Please add a website to your brand.' });

    const brandContext = buildBrandContext(brand || brandPayload);
    let normalizedUrl = website.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    brandDomain = website;
    try { brandDomain = new URL(normalizedUrl).hostname.replace(/^www\./, ''); } catch (e) { /* ignore */ }

    console.log(`\n🔗 === BACKLINK INTELLIGENCE: ${brandDomain} ===`);

    // ── PHASE 1 & 2: Parallel Research (Brand Site + Competitors) ──
    const storedCompetitors = (brand?.competitors || []).map(c => c.url).filter(Boolean);
    console.log(`🔗 Phase 1 & 2: Start parallel research for ${brandDomain} and ${storedCompetitors.length} competitors...`);
    
    const [siteResearch, competitorLinkProfiles] = await Promise.all([
      researchDomain(normalizedUrl),
      storedCompetitors.length > 0 ? analyzeCompetitorLinkProfile(storedCompetitors, brandDomain) : Promise.resolve([])
    ]);

    const siteData = formatSiteResearch(siteResearch);
    const si = siteResearch.siteIntelligence || {};
    const outboundDomains = si.externalDomains || [];
    const internalLinkCount = si.internalLinkCount || 0;

    // Build competitor link data for prompt
    let competitorLinkData = '';
    if (competitorLinkProfiles.length > 0) {
      competitorLinkData = '\n=== COMPETITOR LINK PROFILES (crawled live) ===\n';
      for (const cp of competitorLinkProfiles) {
        if (!cp.success) { competitorLinkData += `${cp.url}: CRAWL FAILED\n`; continue; }
        competitorLinkData += `\n--- ${cp.domain} ---\n`;
        competitorLinkData += `Title: ${cp.title}\n`;
        competitorLinkData += `External domains they link to (${cp.externalDomains.length}): ${cp.externalDomains.slice(0, 20).join(', ')}\n`;
        competitorLinkData += `Internal links: ${cp.internalLinkCount}\n`;
        competitorLinkData += `Links to our brand: ${cp.linksToUs ? 'YES' : 'No'}\n`;
        competitorLinkData += `Content topics: ${cp.h2Topics.join(', ') || 'None found'}\n`;
      }
    }

    // ── PHASE 3: AI-Powered backlink discovery + analysis ──
    console.log(`🔗 Phase 3: AI backlink discovery and analysis...`);

    const systemPrompt = `You are an expert backlink analyst. Use the provided crawl data to:
1. DISCOVER real pages linking to or mentioning ${brandDomain}.
2. ANALYZE the crawled link profile for quality.
3. FIND the link gap vs competitors.
4. GENERATE actionable link-building strategies with REAL target URLs.

CRITICAL: Provide REAL, plausible URLs (not fabricated). opportunities must have specific domains and strategies.

BACKLINK INTELLIGENCE (2026):
- Quality > Quantity: One link from a DR50+ site > 100 links from spam sites
- Topical relevance: Links from same-industry sites carry 3x more weight
- Editorial links (naturally placed in content) > sidebar/footer links
- Broken link building: Finding competitors' broken backlinks and offering replacements
- Resource page strategy: Getting listed on industry resource/tools pages
- Digital PR: Newsworthy content that earns links naturally
- HARO/expert quotes: Being cited as an expert source
- Competitor replication: Analyzing WHERE competitors get links and replicating

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

=== BRAND SITE CRAWL DATA ===
${siteData}

Brand outbound links (external domains the brand links TO): ${outboundDomains.slice(0, 25).join(', ') || 'None found'}
Brand internal link count: ${internalLinkCount}

${competitorLinkData || 'No competitor data available — identify likely competitors and analyze their link strategies.'}

Respond in STRICT JSON:
{
  "backlinkHealthScore": 0-100,
  "estimatedReferringDomains": "Estimate based on industry, site age, and content volume (be realistic)",
  "estimatedTotalBacklinks": "Realistic estimate",
  "dofollowRatio": "Estimated dofollow percentage",
  "anchorTextHealth": "natural|over-optimized|under-optimized",
  "summary": "3-4 sentence strategic backlink analysis. What's strong, what's weak, what's the #1 priority.",
  "strategicBrief": "2-3 paragraph analysis for the brand owner. Explain their backlink situation, competitive position, and the single most impactful link-building strategy to pursue.",

  "discoveredBacklinks": [
    {
      "sourceUrl": "Real URL of the page that links to or mentions the brand",
      "sourceDomain": "domain.com",
      "anchorText": "Estimated or known anchor text",
      "linkType": "dofollow|nofollow|mention",
      "estimatedAuthority": "high|medium|low",
      "context": "How/why this page links to the brand (e.g., 'Listed in agency directory', 'Mentioned in industry roundup')",
      "status": "likely-live|unverified",
      "category": "directory|editorial|resource|social|press|citation|forum"
    }
  ],

  "competitorLinkGap": [
    {
      "domain": "Domain that links to competitors but NOT to brand",
      "competitorLinkedFrom": "Which competitor benefits",
      "pageType": "blog|resource|directory|press|review",
      "estimatedAuthority": "high|medium|low",
      "howToGetLink": "Specific action plan to get a link from this domain",
      "difficulty": "easy|medium|hard",
      "impactScore": 1-10
    }
  ],

  "linkOpportunities": [
    {
      "targetUrl": "Real URL or domain to target",
      "type": "guest-post|resource-page|broken-link|digital-pr|haro|directory|partnership|testimonial|podcast|interview",
      "title": "Opportunity name",
      "description": "Why this is a good opportunity and how to approach it",
      "estimatedAuthority": "high|medium|low",
      "difficulty": "easy|medium|hard",
      "impactScore": 1-10,
      "strategy": "Step-by-step approach to secure this link",
      "estimatedTimeline": "1 week|2 weeks|1 month|3 months",
      "suggestedAnchors": ["Anchor text 1", "Anchor text 2"]
    }
  ],

  "toxicRisks": [
    {
      "concern": "Description of potential toxic link risk",
      "severity": "high|medium|low",
      "action": "What to do about it"
    }
  ],

  "outreachTemplates": [
    {
      "type": "guest-post|broken-link|resource-page|partnership|expert-quote",
      "subject": "Email subject line",
      "body": "Complete email template with [BRAND], [SITE], [NAME] placeholders",
      "whenToUse": "Which opportunities this template targets",
      "successRate": "Expected response rate (e.g., '5-10%')"
    }
  ],

  "internalLinkingIssues": [
    {
      "issue": "Internal linking problem found from crawl data",
      "fix": "How to fix it",
      "impact": "Why it matters for PageRank distribution"
    }
  ],

  "anchorTextStrategy": {
    "currentState": "Assessment of anchor text diversity from crawl",
    "recommendations": ["Anchor text diversification recommendations"],
    "idealDistribution": { "branded": "40-50%", "topical": "20-30%", "naked-url": "10-15%", "generic": "10-15%", "exact-match": "5-10%" }
  },

  "thirtyDayPlan": [
    { "week": 1, "focus": "Week theme", "actions": ["Action 1", "Action 2"], "expectedLinks": "How many links to target" },
    { "week": 2, "focus": "Week theme", "actions": ["Action 1", "Action 2"], "expectedLinks": "Target" },
    { "week": 3, "focus": "Week theme", "actions": ["Action 1", "Action 2"], "expectedLinks": "Target" },
    { "week": 4, "focus": "Week theme", "actions": ["Action 1", "Action 2"], "expectedLinks": "Target" }
  ],

  "quickWins": [
    { "action": "Quick link-building win", "estimatedTime": "1-2 hours|1 day|1 week", "expectedImpact": "high|medium", "whyQuick": "Why this can be done fast" }
  ]
}

Generate 5-15 discovered backlinks, 5-10 competitor link gaps, 8-15 link opportunities (with domains), and outreach templates. Be SPECIFIC.`;

    const userPrompt = `Brand Site Research: ${JSON.stringify(siteResearch).substring(0, 4000)}\n\nCompetitor Backlink Profiles: ${JSON.stringify(competitorLinkProfiles).substring(0, 4000)}\n\nComplete backlink intelligence analysis for: ${brandDomain} (${normalizedUrl})`;
    const elapsedBeforeAI = Date.now() - (req.startTime || Date.now());
    console.log(`⏱️ Backlink research took ${elapsedBeforeAI}ms. Starting AI analysis...`);
    // Give AI a dedicated 60s timeout — backlink analysis needs significant generation time
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 4096, timeout: 60000 });
    if (!result) throw new Error('AI analysis returned empty result');
    let parsed;
    try {
      parsed = parseJSON(result);
    } catch (e) {
      console.error('Failed to parse AI response for backlinks:', e.message, result.substring(0, 200));
      throw new Error('AI analysis returned invalid data format');
    }
    
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('AI analysis returned malformed object');
    }

    // ── PHASE 4: Try to verify top discovered backlinks (with timing safeguard) ──
    const totalElapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(0, 85000 - totalElapsed); // Aim for 85s total
    
    let discoveredUrls = (parsed.discoveredBacklinks || [])
      .filter(b => b.sourceUrl && b.sourceUrl.startsWith('http'))
      .map(b => b.sourceUrl);

    // If we're low on time (less than 8s left), verify fewer or skip
    if (remainingBudget < 5000) {
      console.log(`⚠️ Low on time (${remainingBudget}ms left), skipping backlink verification.`);
      discoveredUrls = [];
    } else if (remainingBudget < 12000) {
      console.log(`⚠️ Moderate time (${remainingBudget}ms left), verifying only top 2 backlinks.`);
      discoveredUrls = discoveredUrls.slice(0, 2);
    } else {
      discoveredUrls = discoveredUrls.slice(0, 5);
    }

    let verificationResults = null;
    if (discoveredUrls.length > 0) {
      console.log(`🔗 Phase 4: Verifying ${discoveredUrls.length} discovered backlinks...`);
      try {
        // Wrap verification in a race with the remaining budget - 3s buffer
        const verificationPromise = discoverBacklinks(discoveredUrls, brandDomain);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Verification Timeout')), Math.max(remainingBudget - 3000, 3000)));
        
        verificationResults = await Promise.race([verificationPromise, timeoutPromise]);
        
        if (!verificationResults || !Array.isArray(verificationResults.verified)) {
          throw new Error('Verification returned invalid result format');
        }
        
        // Update discovered backlinks with verification status
        for (const vb of verificationResults.verified) {
          const match = parsed.discoveredBacklinks.find(b => 
            b.sourceUrl === vb.sourceUrl || b.sourceDomain === new URL(vb.sourceUrl).hostname.replace(/^www\./, '')
          );
          if (match) {
            match.status = 'verified-live';
            match.verifiedAnchorText = vb.anchorText;
            match.verifiedLinkType = vb.linkType;
          }
        }
      } catch (e) {
        console.warn('Backlink verification failed:', e.message);
      }
    }

    // Add crawl metadata
    parsed.crawlMetadata = {
      brandDomain,
      pagesCrawled: (siteResearch.pages?.length || 0) + competitorLinkProfiles.length + (verificationResults?.crawled || 0),
      competitorsAnalyzed: competitorLinkProfiles.filter(c => c.success).length,
      backlinksVerified: verificationResults?.verified?.length || 0,
      outboundDomains: outboundDomains.length,
      timestamp: new Date().toISOString(),
    };
    parsed.researchSources = [
      ...(siteResearch.pages?.map(p => p.url) || [normalizedUrl]),
      ...competitorLinkProfiles.filter(c => c.success).map(c => c.url),
    ];
    // Log token usage from the AI call
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: req.creditAction || 'seoBacklinks', studio: 'seo', route: req.originalUrl, brandId: brand?._id });

    // Save to SeoAudit for persistence
    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'backlinks' },
          { url: website, scores: { authorityScore: parsed.backlinkHealthScore || 0 }, results: parsed, status: 'completed', creditsUsed: req.creditsDeducted || 4 },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save backlink audit:', dbErr.message); }
    }

    console.log(`🔗 === BACKLINK INTELLIGENCE COMPLETE: ${brandDomain} ===\n`);
    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error(`Backlink Intelligence error [${brandDomain || 'unknown'}]:`, error.stack || error);
    
    // Specific handling for AbortError/Timeout
    const isTimeout = error.name === 'AbortError' || 
                      error.message.toLowerCase().includes('timeout') || 
                      error.message.toLowerCase().includes('aborted') ||
                      error.message.toLowerCase().includes('budget exceeded');

    if (isTimeout) {
      return res.status(504).json({
        success: false,
        error: 'Analysis timed out. The website might be too complex or the AI provider is slow. Please try again in 1 minute.',
        code: 'TIMEOUT_ERROR'
      });
    }

    res.status(500).json({ 
      success: false, 
      error: safeErrorMessage(error),
      debug: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
});


// ============================================================================
// COMPETITOR WAR ROOM — 90-day battle plan
// ============================================================================

router.post('/competitor-warroom', protect, requireStudio('seoStudio'), requireCredits('seoWarRoom'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId, competitorUrls } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    const brandContext = buildBrandContext(brand || brandPayload);

    // Gather competitors
    const storedCompetitors = (brand?.competitors || []).map(c => c.url).filter(Boolean);
    const providedCompetitors = (competitorUrls || []).filter(u => u.trim());
    const allCompetitorUrls = [...new Set([...storedCompetitors, ...providedCompetitors])].slice(0, 5);

    // STEP 1 & 2: Crawl brand and competitors in PARALLEL
    console.log(`⚔️ War Room: parallel crawl for ${website} and ${allCompetitorUrls.length} competitors...`);
    const [siteResearch, competitorResults] = await Promise.all([
      researchDomain(website),
      allCompetitorUrls.length > 0 ? researchCompetitors(allCompetitorUrls) : Promise.resolve([])
    ]);

    const siteData = formatSiteResearch(siteResearch);
    let competitorData = '';
    if (competitorResults.length > 0) {
      competitorData = formatCompetitorResearch(competitorResults);
    }

    // Timing Safeguard: Check if we have enough time left for AI
    const elapsed = Date.now() - (req.startTime || Date.now());
    const budget = 28000; // 28s budget
    const remainingBudget = Math.max(5000, budget - elapsed);
    console.log(`⏱️ War Room research took ${elapsed}ms. Remaining budget for AI: ${remainingBudget}ms`);

    const systemPrompt = `You are a COMPETITIVE WAR ROOM STRATEGIST — create a 90-day battle plan to systematically outrank competitors. You have REAL CRAWL DATA.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

=== BRAND SITE ===
${siteData}

${competitorData || 'No competitors provided — identify top 3 competitors.'}

Respond in STRICT JSON:
{
  "summary": "3-4 sentence strategic war room brief",
  "competitivePosition": "winning|competitive|behind|far-behind",
  "threatAssessment": "Top strategic threat to the brand's SEO position",
  "scoringMatrix": [
    { "category": "Technical SEO|Content|Authority|AI Visibility|Speed", "yourScore": 0-100, "avgCompetitorScore": 0-100, "verdict": "ahead|tied|behind", "actions": ["Action to maintain/improve"] }
  ],
  "keywordBattles": [
    { "keyword": "keyword", "yourStatus": "ranking|attempting|absent", "competitorStatus": "dominant|present|absent", "battlePlan": "How to win this keyword", "difficulty": "easy|medium|hard", "priority": "critical|high|medium" }
  ],
  "ninetyDayPlan": [
    { "month": 1, "theme": "Foundation", "goals": ["Goal 1"], "weeklyActions": [
      { "week": 1, "actions": ["Action"], "deliverables": ["Deliverable"] },
      { "week": 2, "actions": ["Action"], "deliverables": ["Deliverable"] },
      { "week": 3, "actions": ["Action"], "deliverables": ["Deliverable"] },
      { "week": 4, "actions": ["Action"], "deliverables": ["Deliverable"] }
    ], "expectedOutcome": "What to measure" },
    { "month": 2, "theme": "Expansion", "goals": ["Goal"], "weeklyActions": [{ "week": 5, "actions": ["Action"], "deliverables": ["Deliverable"] }, { "week": 6, "actions": ["Action"], "deliverables": ["Deliverable"] }, { "week": 7, "actions": ["Action"], "deliverables": ["Deliverable"] }, { "week": 8, "actions": ["Action"], "deliverables": ["Deliverable"] }], "expectedOutcome": "What to measure" },
    { "month": 3, "theme": "Domination", "goals": ["Goal"], "weeklyActions": [{ "week": 9, "actions": ["Action"], "deliverables": ["Deliverable"] }, { "week": 10, "actions": ["Action"], "deliverables": ["Deliverable"] }, { "week": 11, "actions": ["Action"], "deliverables": ["Deliverable"] }, { "week": 12, "actions": ["Action"], "deliverables": ["Deliverable"] }], "expectedOutcome": "What to measure" }
  ],
  "quickWins": [{ "action": "Immediate action", "impact": "high|medium", "timeline": "This week" }],
  "competitors": [{ "name": "Name", "url": "URL", "threatLevel": "high|medium|low", "strengths": ["Strength"], "weaknesses": ["Weakness"], "howToBeat": "Strategy" }],
  "researchSources": ["URLs crawled"]
}`;

    const userPrompt = `Build 90-day war room plan for: ${website}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 8192, timeout: remainingBudget });
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: 'seoWarRoom', studio: 'seo', route: req.originalUrl, brandId: brand?._id });
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];

    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'competitor-warroom' },
          { url: website, results: parsed, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save war room audit:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('War Room error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// LLM PROBE — Multi-model brand mention check
// ============================================================================

router.post('/llm-probe', protect, requireStudio('seoStudio'), requireCredits('seoLlmProbe'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    const brandContext = buildBrandContext(brand || brandPayload);
    const brandName = brand?.name || brandPayload?.name || website;
    const dna = brand?.dna || brandPayload?.dna || {};
    const competitors = brand?.competitors || [];

    // STEP 1: Generate probe prompts
    const probePrompts = generateProbePrompts(
      brandName,
      dna.industry || '',
      dna.targetAudience || '',
      website
    );

    // Timing Safeguard: LLM Probe involves real external calls, so we must budget strictly
    const startElapsed = Date.now() - (req.startTime || Date.now());
    const probeBudget = 28000 - startElapsed;
    
    // STEP 2: Run REAL probe — actually query ChatGPT, Gemini, Grok
    console.log(`\n🔬 === REAL LLM PROBE: ${brandName} (${probePrompts.length} prompts × 3 models). Budget: ${probeBudget}ms ===`);
    const probeData = await runRealLLMProbe(probePrompts, brandName, website, competitors);

    // Final Timing Check for Analysis AI
    const finalElapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(5000, 28000 - finalElapsed);
    console.log(`⏱️ LLM Probe real queries took ${finalElapsed}ms. Remaining budget for AI analysis: ${remainingBudget}ms`);

    // STEP 3: Feed real probe results to AI for strategic analysis
    let probeResultsText = `\n=== REAL LLM PROBE RESULTS (verified by actually querying each model) ===\n`;
    probeResultsText += `Total probes: ${probeData.aggregate.totalProbes}\n`;
    probeResultsText += `Brand mentioned: ${probeData.aggregate.mentionCount}/${probeData.aggregate.totalProbes} (${probeData.aggregate.mentionRate}%)\n\n`;

    for (const [model, data] of Object.entries(probeData.byModel)) {
      probeResultsText += `${model}: ${data.mentioned}/${data.total} mentions (${data.score}%) — ${data.status}\n`;
    }

    probeResultsText += `\nDetailed Results:\n`;
    for (const r of probeData.results) {
      if (!r.success) { probeResultsText += `- [${r.model}] "${r.prompt}" → ERROR: ${r.error}\n`; continue; }
      probeResultsText += `- [${r.model}] "${r.prompt}" → ${r.mentioned ? `MENTIONED (${r.mentionType})` : 'NOT MENTIONED'}`;
      if (r.competitorsMentioned.length > 0) probeResultsText += ` | Competitors: ${r.competitorsMentioned.join(', ')}`;
      probeResultsText += `\n  Snippet: ${r.responseSnippet.substring(0, 150)}\n`;
    }

    const systemPrompt = `You are an AI VISIBILITY STRATEGIST. You have REAL probe data — we ACTUALLY queried ChatGPT, Gemini, and Grok with real prompts and checked if they mention this brand. This is NOT simulated — this is ground truth.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

${probeResultsText}

Analyze the REAL probe results above and provide strategic recommendations.

Respond in STRICT JSON:
{
  "summary": "3-4 sentence strategic summary based on REAL probe data — mention actual mention rate and which models mention/don't mention the brand",
  "overallVisibilityScore": ${probeData.aggregate.mentionRate},
  "visibilityByModel": {
    "ChatGPT": { "score": 0-100, "status": "visible|partially-visible|invisible", "topIssue": "Based on actual probe responses" },
    "Gemini": { "score": 0-100, "status": "visible|partially-visible|invisible", "topIssue": "Based on actual probe responses" },
    "Grok": { "score": 0-100, "status": "visible|partially-visible|invisible", "topIssue": "Based on actual probe responses" }
  },
  "brandPerception": {
    "sentiment": "positive|neutral|negative|unknown",
    "authorityLevel": "high|medium|low|unknown",
    "primaryAssociations": ["What models associate with this brand — from REAL responses"],
    "missingAssociations": ["What SHOULD be associated but isn't"]
  },
  "optimizations": [
    {
      "title": "Specific action tied to REAL probe results",
      "description": "Reference specific prompts where brand was NOT mentioned",
      "priority": "critical|high|medium",
      "kpi": "Brand mention rate in re-probe",
      "baseline": "Current state from real data (e.g., 'Mentioned in X of Y probes')",
      "target": "Specific target",
      "timeline": "Implementation timeline",
      "proofMethod": "Re-run LLM Probe",
      "expectedROI": "Business impact"
    }
  ],
  "contentToCreate": [
    { "title": "Content piece", "purpose": "Why this helps", "format": "blog|faq|guide|case-study", "targetPrompts": ["Which prompts this content targets"], "measurableGoal": "Expected re-probe result" }
  ]
}

CRITICAL: Use the REAL mention rate (${probeData.aggregate.mentionRate}%) as the overall visibility score. Reference ACTUAL probe results. Every recommendation must tie back to specific prompts where the brand was NOT mentioned.`;

    const userPrompt = `Analyze real LLM probe results for: ${brandName} (${website})`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 6144, timeout: remainingBudget });
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: 'seoLlmProbe', studio: 'seo', route: req.originalUrl, brandId: brand?._id });
    const parsed = parseJSON(result);

    // Merge real probe data into response
    parsed.realProbeData = {
      probeResults: probeData.results.map(r => ({
        prompt: r.prompt,
        model: r.model,
        mentioned: r.mentioned,
        mentionType: r.mentionType,
        confidence: r.confidence,
        responseSnippet: r.responseSnippet,
        competitorsMentioned: r.competitorsMentioned,
        success: r.success,
      })),
      aggregate: probeData.aggregate,
      byModel: probeData.byModel,
    };
    parsed.overallVisibilityScore = probeData.aggregate.mentionRate;
    parsed.dataSource = 'real-queries';
    parsed.researchSources = [website];

    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'llm-probe' },
          { url: website, results: parsed, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save LLM probe:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('LLM Probe error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// AUTO-FIX — Generate copy-paste code fixes
// ============================================================================

router.post('/auto-fix', protect, requireStudio('seoStudio'), requireCredits('seoAutoFix'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId, issues } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    if (!issues || issues.length === 0) {
      return res.status(400).json({ success: false, error: 'Run a Health Check first to find issues, then use Auto-Fix.' });
    }

    const brandContext = buildBrandContext(brand || brandPayload);
    const issueList = issues.map((iss, i) => `${i + 1}. [${iss.severity || 'medium'}] ${iss.title || iss.issue}: ${iss.description || iss.fix || ''}`).join('\n');

    const systemPrompt = `You are a TECHNICAL SEO CODE FIXER. Given a list of SEO issues found from a real crawl, generate READY-TO-USE code fixes that developers can copy-paste.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

ISSUES FOUND:
${issueList}

Respond in STRICT JSON:
{
  "summary": "Brief summary of fixes generated",
  "totalIssuesAddressed": ${issues.length},
  "fixes": [
    {
      "issueTitle": "Which issue this fixes",
      "severity": "critical|high|medium|low",
      "description": "What this fix does",
      "code": "Complete ready-to-use code snippet (HTML, JSON-LD, meta tags, .htaccess rules, etc.)",
      "language": "html|json|javascript|htaccess|nginx|robots",
      "whereToAdd": "Exact location where to add this code (e.g., '<head> section of every page')",
      "instructions": "Step-by-step implementation instructions"
    }
  ],
  "schemaFixes": [
    {
      "type": "Organization|LocalBusiness|Product|FAQ|BreadcrumbList|WebSite|Article",
      "description": "What this schema does",
      "code": "Complete JSON-LD code ready to paste into <head>",
      "impact": "How this improves SEO/AI visibility"
    }
  ],
  "metaTagFixes": {
    "title": "Optimized title tag",
    "description": "Optimized meta description",
    "ogTags": "Complete Open Graph meta tags",
    "twitterTags": "Complete Twitter Card meta tags"
  },
  "robotsTxt": "Suggested robots.txt content (if issues found)",
  "quickWins": [
    { "fix": "Quick fix description", "code": "Code snippet", "effort": "5 min|15 min|30 min|1 hour" }
  ]
}

Generate production-ready code. Every fix must be copy-paste ready. Use the brand's actual information in the code.`;

    const userPrompt = `Generate auto-fix code for: ${website}`;
    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(5000, 28000 - elapsed);
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.4, maxTokens: 8192, timeout: remainingBudget });
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: 'seoAutoFix', studio: 'seo', route: req.originalUrl, brandId: brand?._id });
    const parsed = parseJSON(result);

    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'auto-fix' },
          { url: website, results: parsed, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save auto-fix audit:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('Auto-Fix error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// PROMPT MINING — Discover AI prompts for citation
// ============================================================================

router.post('/prompt-mining', protect, requireStudio('seoStudio'), requireCredits('seoPromptMining'), async (req, res) => {
  try {
    const { url, brand: brandPayload, brandId } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available.' });

    const brandContext = buildBrandContext(brand || brandPayload);
    const brandName = brand?.name || brandPayload?.name || website;

    const systemPrompt = `You are a PROMPT MINING SPECIALIST — you find the exact AI prompts and queries where a brand SHOULD be cited but currently ISN'T. Your goal: create a content calendar that systematically captures AI citation traffic.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

Respond in STRICT JSON:
{
  "summary": "3-4 sentence analysis of the brand's AI citation landscape — where they're missing and what to do",
  "totalPromptsAnalyzed": 30,
  "citationScore": 0-100,
  "promptCategories": [
    {
      "category": "Product Recommendations|How-To Guides|Industry Best Practices|Comparison Queries|Problem-Solving|Educational|Local Queries",
      "totalPrompts": 5,
      "currentCitationRate": "0%|10%|25%|50%|75%",
      "opportunity": "high|medium|low"
    }
  ],
  "minedPrompts": [
    {
      "prompt": "The exact question users ask AI that should cite this brand",
      "category": "recommendation|how-to|comparison|best-of|problem-solving",
      "searchVolume": "high|medium|low",
      "currentlyCited": false,
      "competitorsCited": ["Competitors who ARE cited for this prompt"],
      "whyNotCited": "Why the brand isn't currently cited",
      "contentNeeded": "What content to create to get cited",
      "contentFormat": "blog|faq|guide|comparison|case-study|data-report|tool",
      "priority": "critical|high|medium",
      "estimatedImpact": "How many AI-generated responses this could appear in"
    }
  ],
  "contentCalendar": [
    {
      "week": 1,
      "theme": "Week theme",
      "contentPieces": [
        { "title": "Content title", "format": "blog|faq|guide", "targetPrompts": ["Prompts this content targets"], "publishBy": "Date" }
      ]
    },
    { "week": 2, "theme": "Theme", "contentPieces": [{ "title": "Title", "format": "format", "targetPrompts": ["prompt"], "publishBy": "Date" }] },
    { "week": 3, "theme": "Theme", "contentPieces": [{ "title": "Title", "format": "format", "targetPrompts": ["prompt"], "publishBy": "Date" }] },
    { "week": 4, "theme": "Theme", "contentPieces": [{ "title": "Title", "format": "format", "targetPrompts": ["prompt"], "publishBy": "Date" }] }
  ],
  "quickWins": [
    { "action": "Quick win to get cited faster", "targetPrompt": "Which prompt this addresses", "effort": "1 hour|1 day|1 week", "expectedImpact": "high|medium", "proofMethod": "How to verify it worked (e.g., 'Re-probe this prompt in 14 days')" }
  ],
  "optimizations": [
    {
      "title": "Specific optimization tied to mined prompts above — NOT generic",
      "description": "Exact steps referencing specific mined prompts and content calendar items",
      "priority": "critical|high|medium",
      "kpi": "Measurable metric (e.g., 'Citation rate for product-recommendation prompts', 'Number of prompts where brand appears')",
      "baseline": "Current state from mined data (e.g., 'Brand cited in 0 of 15 mined prompts', 'No FAQ content covering problem-solving queries')",
      "target": "Specific target (e.g., 'Cited in 8 of 15 prompts within 90 days', 'FAQ page ranking for 5 problem-solving queries')",
      "timeline": "Realistic timeline (e.g., 'Week 1-2: content creation, Week 3-6: indexing, Week 6-12: re-probe and measure')",
      "proofMethod": "How to verify (e.g., 'Re-run Prompt Mining after 60 days — citation score should increase from 15 to 55+')",
      "expectedROI": "Business outcome (e.g., 'Capture 200-400 monthly AI-referred visits from how-to prompts')"
    }
  ]
}

STRATEGIC RULES (MANDATORY):
1. NEVER give generic advice like 'Create quality content' or 'Build brand awareness' — be SPECIFIC to mined prompts
2. Every optimization MUST reference specific mined prompts and categories from above
3. Every optimization MUST have measurable KPI with baseline and target values
4. Every optimization MUST explain how to PROVE it worked after implementation
5. Think like a consultant billing $500/hour — if a recommendation could apply to ANY brand, it's too generic. DELETE IT.

Generate 15-20 mined prompts. Be specific to this brand's industry. Think about what real users ask ChatGPT/Gemini/Perplexity about topics this brand should own.`;

    const userPrompt = `Mine AI prompts for: ${brandName} (${website})`;

    // STEP 2: Get real Google Autocomplete data first, then enrich AI call
    const dna = brand?.dna || brandPayload?.dna || {};
    console.log(`🔎 Prompt Mining: fetching real autocomplete data for ${brandName}...`);
    let autocompleteData = null;
    let autocompleteContext = '';
    try {
      autocompleteData = await mineAutocomplete(
        brandName,
        dna.industry || '',
        dna.targetAudience || '',
        dna.country || '',
        dna.defaultLanguage ? dna.defaultLanguage.substring(0, 2) : 'en'
      );
      if (autocompleteData?.totalSuggestions > 0) {
        const autocompleteText = formatAutocompleteForPrompt(autocompleteData);
        autocompleteContext = `\n\nIMPORTANT — use the following REAL Google Autocomplete data to inform your prompt mining. These are verified queries people actually search for:\n${autocompleteText}`;
      }
    } catch (e) {
      console.warn('Autocomplete mining failed:', e.message);
    }

    // STEP 3: AI call enriched with real autocomplete data
    const elapsed = Date.now() - (req.startTime || Date.now());
    const remainingBudget = Math.max(5000, 28000 - elapsed);
    const aiResult = await aiCall(systemPrompt, userPrompt + autocompleteContext, { json: true, temperature: 0.6, maxTokens: 8192, timeout: remainingBudget });
    if (req.user && lastTokenUsage) logTokenUsage(req.user._id, lastTokenUsage, { action: 'seoPromptMining', studio: 'seo', route: req.originalUrl, brandId: brand?._id });
    const parsed = parseJSON(aiResult);
    parsed.researchSources = [website];

    // Attach real autocomplete data to response
    if (autocompleteData?.totalSuggestions > 0) {
      parsed.realAutocompleteData = {
        totalSeeds: autocompleteData.totalSeeds,
        totalSuggestions: autocompleteData.totalSuggestions,
        categorized: autocompleteData.categorized,
        allSuggestions: autocompleteData.allSuggestions?.slice(0, 50),
      };
      parsed.dataSource = 'ai+autocomplete';
    } else {
      parsed.dataSource = 'ai-only';
    }

    if (req.user && brand?._id) {
      try {
        await SeoAudit.findOneAndUpdate(
          { user: req.user._id, brand: brand._id, type: 'prompt-mining' },
          { url: website, results: parsed, status: 'completed' },
          { upsert: true, new: true }
        );
      } catch (dbErr) { console.warn('Could not save prompt mining:', dbErr.message); }
    }

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('Prompt Mining error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// HISTORY — List past audits & get individual audit
// ============================================================================

router.get('/history', protect, async (req, res) => {
  try {
    const { brandId, type, limit = 20 } = req.query;
    const filter = { user: req.user._id };
    if (brandId) filter.brand = brandId;
    if (type) filter.type = type;

    const audits = await SeoAudit.find(filter)
      .sort('-updatedAt')
      .limit(Number(limit))
      .select('type url scores status createdAt updatedAt')
      .lean();

    res.json({ success: true, audits });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

router.get('/history/:id', protect, async (req, res) => {
  try {
    const audit = await SeoAudit.findOne({ _id: req.params.id, user: req.user._id }).lean();
    if (!audit) return res.status(404).json({ success: false, error: 'Audit not found' });
    res.json({ success: true, audit });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// SAVED REPORTS — Fetch last generated report per type
// ============================================================================

router.get('/reports/:type', protect, async (req, res) => {
  try {
    const { type } = req.params;
    const { brandId } = req.query;
    if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

    const audit = await SeoAudit.findOne(
      { user: req.user._id, brand: brandId, type, status: 'completed' }
    ).sort('-updatedAt').lean();

    if (!audit) return res.json({ success: true, found: false });

    res.json({
      success: true,
      found: true,
      report: audit.results,
      generatedAt: audit.updatedAt || audit.createdAt,
      scores: audit.scores,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// ============================================================================
// HISTORY COMPARISON — Score trends over time
// ============================================================================

router.get('/history/compare', protect, async (req, res) => {
  try {
    const { brandId, type } = req.query;
    if (!brandId || !type) return res.status(400).json({ success: false, error: 'brandId and type required' });

    const audits = await SeoAudit.find({
      user: req.user._id,
      brand: brandId,
      type,
      status: 'completed',
    })
      .sort('-createdAt')
      .limit(10)
      .select('scores results.seoHealthScore results.aiVisibilityScore results.technicalScore results.contentScore results.authorityScore createdAt')
      .lean();

    if (audits.length < 1) return res.json({ success: true, hasHistory: false, trend: [] });

    const trend = audits.map(a => ({
      date: a.createdAt,
      scores: {
        seoHealth: a.scores?.seoHealth || a.results?.seoHealthScore || 0,
        aiVisibility: a.scores?.aiVisibility || a.results?.aiVisibilityScore || 0,
        technical: a.scores?.technicalScore || a.results?.technicalScore || 0,
        content: a.scores?.contentScore || a.results?.contentScore || 0,
        authority: a.scores?.authorityScore || a.results?.authorityScore || 0,
      },
    })).reverse();

    const latest = trend[trend.length - 1]?.scores || {};
    const previous = trend.length >= 2 ? trend[trend.length - 2]?.scores : null;
    const changes = previous ? {
      seoHealth: latest.seoHealth - previous.seoHealth,
      aiVisibility: latest.aiVisibility - previous.aiVisibility,
      technical: latest.technical - previous.technical,
      content: latest.content - previous.content,
      authority: latest.authority - previous.authority,
    } : null;

    res.json({
      success: true,
      hasHistory: audits.length > 1,
      totalAudits: audits.length,
      trend,
      changes,
      latestDate: audits[0]?.createdAt,
      previousDate: audits[1]?.createdAt,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// ============================================================================
// JS RENDERING CRAWL — Puppeteer-based SPA crawling
// ============================================================================

router.post('/js-crawl', protect, requireCredits('seoHealthCheck'), async (req, res) => {
  try {
    const { brand, url, maxPages = 20, mobile = false } = req.body;
    const website = url || brand?.website;
    if (!website) return res.status(400).json({ success: false, error: 'Website URL required' });

    console.log(`🖥️ JS Render Crawl requested for ${website} (max ${maxPages} pages)`);
    const crawlData = await jsRenderCrawl(website, { maxPages: Math.min(maxPages, 30), mobile });

    res.json({ success: true, ...crawlData });
  } catch (error) {
    console.error('JS Crawl error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// CONTENT SCORING — Grade existing pages for SEO quality
// ============================================================================

router.post('/content-score', protect, requireCredits('seoHealthCheck'), async (req, res) => {
  try {
    const { brand, url, targetKeywords = [] } = req.body;
    const website = url || brand?.website;
    if (!website) return res.status(400).json({ success: false, error: 'Website URL required' });

    console.log(`📊 Content Scoring: Crawling ${website}...`);
    const crawlResult = await researchDomain(website);
    if (!crawlResult?.pages?.length) {
      return res.status(400).json({ success: false, error: 'Could not crawl website' });
    }

    const pagesForScoring = crawlResult.pages.map(p => ({
      url: p.url || '', title: p.title || '', metaDesc: p.meta?.description || '',
      h1s: p.h1 ? [p.h1] : [], h2s: p.h2s || [],
      bodyText: p.bodyText || p.content || '', wordCount: p.wordCount || 0,
      internalLinks: p.internalLinks || [], externalLinks: p.externalLinks || [],
      images: p.images || [], schemas: p.schemas || [],
    }));

    const siteScores = scoreSiteContent(pagesForScoring, targetKeywords);
    res.json({ success: true, ...siteScores });
  } catch (error) {
    console.error('Content scoring error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// COMPETITOR MONITORING — Track competitor content changes
// ============================================================================

router.post('/competitor-monitor', protect, requireCredits('seoCompetitors'), async (req, res) => {
  try {
    const { brand, competitors = [], brandKeywords = [] } = req.body;
    if (!brand?._id) return res.status(400).json({ success: false, error: 'Brand required' });
    if (!competitors.length) return res.status(400).json({ success: false, error: 'At least one competitor URL required' });

    const brandId = brand._id;
    const results = [];

    for (const comp of competitors.slice(0, 5)) {
      const compUrl = typeof comp === 'string' ? comp : comp.url || comp.website;
      const compName = typeof comp === 'string' ? compUrl : comp.name || compUrl;
      if (!compUrl) continue;

      console.log(`🕵️ Competitor Monitor: Analyzing ${compName}...`);
      const crawlData = await crawlCompetitor(compUrl);

      const prevSnapshot = await CompetitorSnapshot.findOne({
        user: req.user._id, brand: brandId, competitorUrl: compUrl,
      }).sort('-createdAt').lean();

      const changes = compareSnapshots(crawlData, prevSnapshot);
      const overlap = brandKeywords.length > 0
        ? analyzeKeywordOverlap(brandKeywords, crawlData.titleKeywords || [])
        : null;

      await CompetitorSnapshot.create({
        user: req.user._id, brand: brandId,
        competitorUrl: compUrl, competitorName: compName,
        pages: crawlData.pages, totalPages: crawlData.totalPages,
        avgWordCount: crawlData.avgWordCount,
        titleKeywords: crawlData.titleKeywords, metaKeywords: crawlData.metaKeywords,
        schemaTypes: crawlData.schemaTypes,
        newPages: changes.newPages, changedPages: changes.changedPages, removedPages: changes.removedPages,
      });

      results.push({
        url: compUrl, name: compName, totalPages: crawlData.totalPages,
        avgWordCount: crawlData.avgWordCount, schemaTypes: crawlData.schemaTypes,
        changes, overlap, hasSitemap: crawlData.hasSitemap, hasRobotsTxt: crawlData.hasRobotsTxt,
      });
    }

    res.json({
      success: true,
      competitors: results,
      summary: `Monitored ${results.length} competitors. ` +
        results.map(r => `${r.name}: ${r.changes?.summary || 'analyzed'}`).join('. '),
    });
  } catch (error) {
    console.error('Competitor monitor error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// GSC POSITION TRACKING — Snapshot & Trend Endpoints
// ============================================================================

// POST /api/seo-studio/gsc/snapshot — Take a position snapshot from GSC
router.post('/gsc/snapshot', protect, async (req, res) => {
  try {
    const { brandId, siteUrl } = req.body;
    if (!brandId || !siteUrl) return res.status(400).json({ success: false, error: 'brandId and siteUrl required' });

    // Get valid GSC token
    const Integration = (await import('../models/Integration.js')).default;
    const integration = await Integration.findOne({
      user: req.user._id, platform: 'google-analytics', status: 'connected',
      ...(brandId ? { brand: brandId } : {}),
    });
    if (!integration?.accessToken) {
      return res.status(401).json({ success: false, error: 'Google Search Console not connected' });
    }

    const accessToken = integration.accessToken;
    const endDate = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 28 * 86400000).toISOString().split('T')[0];

    // Fetch queries and pages from GSC
    const fetchGSC = async (dimensions, rowLimit = 100) => {
      const resp = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate, dimensions, rowLimit }),
        }
      );
      return resp.json();
    };

    const [queriesData, pagesData] = await Promise.all([
      fetchGSC(['query'], 100),
      fetchGSC(['page'], 50),
    ]);

    const queries = (queriesData.rows || []).map(r => ({
      query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    }));
    const pages = (pagesData.rows || []).map(r => ({
      page: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position,
    }));

    const totalClicks = queries.reduce((s, q) => s + q.clicks, 0);
    const totalImpressions = queries.reduce((s, q) => s + q.impressions, 0);
    const averagePosition = queries.length ? queries.reduce((s, q) => s + q.position, 0) / queries.length : 0;
    const averageCtr = queries.length ? queries.reduce((s, q) => s + q.ctr, 0) / queries.length : 0;

    const snapshot = await GscSnapshot.create({
      user: req.user._id, brand: brandId, siteUrl,
      queries, pages,
      totalClicks, totalImpressions, averagePosition, averageCtr,
      dateFrom: new Date(startDate), dateTo: new Date(endDate),
    });

    res.json({ success: true, snapshot: { _id: snapshot._id, totalClicks, totalImpressions, averagePosition, averageCtr, queriesCount: queries.length } });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// GET /api/seo-studio/gsc/snapshots — Get snapshot history
router.get('/gsc/snapshots', protect, async (req, res) => {
  try {
    const { brandId, siteUrl } = req.query;
    if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

    const query = { user: req.user._id, brand: brandId };
    if (siteUrl) query.siteUrl = siteUrl;

    const snapshots = await GscSnapshot.find(query)
      .sort('-createdAt')
      .limit(20)
      .select('totalClicks totalImpressions averagePosition averageCtr siteUrl dateFrom dateTo createdAt')
      .lean();

    res.json({ success: true, snapshots });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

// GET /api/seo-studio/gsc/rank-changes — Compare latest vs previous snapshot
router.get('/gsc/rank-changes', protect, async (req, res) => {
  try {
    const { brandId, siteUrl } = req.query;
    if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

    const query = { user: req.user._id, brand: brandId };
    if (siteUrl) query.siteUrl = siteUrl;

    const [latest, previous] = await GscSnapshot.find(query)
      .sort('-createdAt')
      .limit(2)
      .lean();

    if (!latest) return res.json({ success: true, hasData: false });

    // Build query position map from previous snapshot
    const prevMap = {};
    if (previous) {
      for (const q of previous.queries || []) prevMap[q.query] = q;
    }

    // Compare
    const changes = (latest.queries || []).map(q => {
      const prev = prevMap[q.query];
      return {
        query: q.query,
        clicks: q.clicks,
        impressions: q.impressions,
        position: Math.round(q.position * 10) / 10,
        prevPosition: prev ? Math.round(prev.position * 10) / 10 : null,
        positionChange: prev ? Math.round((prev.position - q.position) * 10) / 10 : null, // Positive = improved
        clicksChange: prev ? q.clicks - prev.clicks : null,
        isNew: !prev,
      };
    }).sort((a, b) => (b.positionChange || 0) - (a.positionChange || 0));

    // Summary
    const improved = changes.filter(c => c.positionChange > 0).length;
    const declined = changes.filter(c => c.positionChange < 0).length;
    const unchanged = changes.filter(c => c.positionChange === 0).length;
    const newKeywords = changes.filter(c => c.isNew).length;

    res.json({
      success: true,
      hasData: true,
      hasPrevious: !!previous,
      latestDate: latest.createdAt,
      previousDate: previous?.createdAt,
      summary: { improved, declined, unchanged, newKeywords, total: changes.length },
      overallChange: {
        clicks: previous ? latest.totalClicks - previous.totalClicks : null,
        impressions: previous ? latest.totalImpressions - previous.totalImpressions : null,
        position: previous ? Math.round((previous.averagePosition - latest.averagePosition) * 10) / 10 : null,
      },
      changes: changes.slice(0, 50),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});


// ============================================================================
// ASK BAR — Universal intent router
// ============================================================================

router.post('/ask', protect, requireCredits('seoAsk'), async (req, res) => {
  try {
    const { question, brand, url } = req.body;
    if (!question) return res.status(400).json({ success: false, error: 'Question is required' });

    const brandContext = buildBrandContext(brand);
    const website = brand?.website || url;

    const systemPrompt = `You are an AI SEO assistant inside Mantram AI's SEO Studio. The user asks natural language questions and you provide expert, actionable SEO answers.

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}
${website ? `Website: ${website}` : ''}

RULES:
1. Be specific, actionable, and practical
2. Reference the brand/industry when possible
3. Use layman language but be thorough
4. Suggest which workflow to run if appropriate (health-check, traffic, competitors, ai-visibility)
5. Include 3 follow-up suggestions

Respond in JSON:
{
  "answer": "Detailed answer (use markdown formatting)",
  "suggestedWorkflow": "health-check|traffic|competitors|ai-visibility|null",
  "actionItems": [{ "title": "Action", "description": "Details" }],
  "followUpQuestions": ["Follow-up 1", "Follow-up 2", "Follow-up 3"]
}`;

    const result = await aiCall(systemPrompt, question, { json: true, temperature: 0.7, maxTokens: 4096, timeout: 15000 });
    const parsed = parseJSON(result);

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('SEO Ask error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

export default router;
