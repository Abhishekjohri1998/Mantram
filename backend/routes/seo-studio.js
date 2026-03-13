import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits, logTokenUsage } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import SeoAudit from '../models/SeoAudit.js';
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

const router = Router();

// ============================================================================
// AI CALL HELPER
// ============================================================================

// Track last AI call's token usage for downstream logging
let lastTokenUsage = null;
export function getLastTokenUsage() { return lastTokenUsage; }

async function aiCall(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 8192, json = false } = options;
  lastTokenUsage = null;

  // Try OpenAI first
  if (process.env.OPENAI_API_KEY) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature, max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const data = await resp.json();
      if (data.choices?.[0]?.message?.content) {
        lastTokenUsage = { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0, model: 'gpt-4o-mini', provider: 'openai' };
        return data.choices[0].message.content;
      }
      if (data.error) console.warn('GPT-4o-mini failed:', data.error.message);
    } catch (e) { console.warn('GPT-4o-mini error:', e.message); }
  }

  // Try Grok (xAI) — excellent for real-time trend/keyword data
  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (grokKey) {
    try {
      const resp = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
        body: JSON.stringify({
          model: 'grok-3-mini-fast',
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature, max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      const data = await resp.json();
      if (data.choices?.[0]?.message?.content) {
        lastTokenUsage = { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0, model: 'grok-3-mini-fast', provider: 'xai' };
        return data.choices[0].message.content;
      }
      if (data.error) console.warn('Grok failed:', data.error.message);
    } catch (e) { console.warn('Grok error:', e.message); }
  }

  // Fallback to Gemini
  const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const models = ['gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20'];
    for (const model of models) {
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
          }
        );
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          lastTokenUsage = { inputTokens: data.usageMetadata?.promptTokenCount || 0, outputTokens: data.usageMetadata?.candidatesTokenCount || 0, model, provider: 'gemini' };
          return text;
        }
        if (data.error) console.warn(`Gemini ${model}:`, data.error.message);
      } catch (e) { console.warn(`Gemini ${model} error:`, e.message); }
    }
  }

  throw new Error('All AI models failed');
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

    const systemPrompt = `You are a SENIOR SEO STRATEGIST (not just an auditor). You think like a CMO + technical SEO expert combined. You have REAL CRAWL DATA — use it as ground truth. Never guess or contradict the crawl.

IMPORTANT: For every finding, explain WHY it matters — connect it to a specific Google algorithm signal, ranking factor, or business outcome. Don't just list problems — explain the strategic impact and provide the business reasoning.

ALGORITHM CONTEXT (2026):
- Google's Helpful Content System penalizes thin/unhelpful pages; rewards genuine expertise
- E-E-A-T (Experience, Expertise, Authoritativeness, Trust) is a core ranking signal
- AI Overviews (SGE) now appear in 40%+ of searches — sites need structured, authoritative content to be cited
- Core Web Vitals remain a ranking factor (LCP < 2.5s, CLS < 0.1, INP < 200ms)
- Google rewards topical authority — sites that deeply cover a topic cluster outrank those with scattered content
- Schema markup and structured data directly influence rich results and AI citation rates

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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192 });
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

    // Run site crawl + Keyword Intelligence Engine in parallel
    console.log(`\n🧠 SEO Traffic: Running Intelligence Engine + crawl for ${website}...`);
    const [siteResearch, keywordIntel] = await Promise.all([
      researchDomain(website),
      runKeywordIntelligence(brandObj, { seedKeywords: [] }).catch(e => {
        console.warn('Keyword Intelligence Engine error:', e.message);
        return { success: false, error: e.message };
      }),
    ]);
    const siteData = formatSiteResearch(siteResearch);

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

    const countryFocus = country || dna.country || 'India';
    const industryFocus = industry || dna.industry || 'General';

    const systemPrompt = 'You are a STRATEGIC SEO GROWTH ADVISOR. You have REAL DATA from multiple intelligence sources.\n\n'
      + 'You have:\n'
      + '1. REAL CRAWL DATA from the brand\'s website\n'
      + '2. REAL Google Trends data with verified interest scores\n'
      + '3. REAL Google SERP sampling with difficulty scores\n'
      + '4. REAL suggestions from Google, YouTube, Amazon, and Bing\n'
      + '5. Multi-agent AI analysis (Scout, Analyst, Strategist)\n\n'
      + 'CRITICAL: Use the VERIFIED signals. Do NOT override real data with guesses. When volume estimates come from Google Trends or multi-agent consensus, use those numbers.\n\n'
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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192 });
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
      parsed.dataSource = 'keyword-intelligence-engine';
    } else {
      parsed.dataSource = 'ai-only';
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

    // STEP 1: Crawl brand's own site
    console.log(`🔍 SEO Competitors: crawling ${website}...`);
    const siteResearch = await researchDomain(website);
    const siteData = formatSiteResearch(siteResearch);

    // STEP 2: Gather competitor URLs (stored + user-provided)
    const storedCompetitors = (brand?.competitors || []).map(c => c.url).filter(Boolean);
    const providedCompetitors = (competitorUrls || []).filter(u => u.trim());
    const allCompetitorUrls = [...new Set([...storedCompetitors, ...providedCompetitors])].slice(0, 5);

    let competitorData = '';
    let competitorResearch = [];

    if (allCompetitorUrls.length > 0) {
      // STEP 3a: Crawl known competitors
      console.log(`🔍 Crawling ${allCompetitorUrls.length} competitors...`);
      competitorResearch = await researchCompetitors(allCompetitorUrls);
      competitorData = formatCompetitorResearch(competitorResearch);
    } else {
      // STEP 3b: Ask AI to identify competitors first, then we'll note them
      competitorData = 'No competitor URLs provided. Identify the top 3-5 most likely competitors based on brand industry and location, and provide their real URLs. Be sure to provide REAL existing company websites, not made-up ones.';
    }

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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 8192 });
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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192 });
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
  try {
    const { url, brand: brandPayload, brandId } = req.body;

    const brand = brandId ? await loadBrand(brandId, req.user?._id) : null;
    const website = brand?.website || url || brandPayload?.website;
    if (!website) return res.status(400).json({ success: false, error: 'No website URL available. Please add a website to your brand.' });

    const brandContext = buildBrandContext(brand || brandPayload);
    let normalizedUrl = website.trim();
    if (!/^https?:\/\//i.test(normalizedUrl)) normalizedUrl = `https://${normalizedUrl}`;
    let brandDomain;
    try { brandDomain = new URL(normalizedUrl).hostname.replace(/^www\./, ''); } catch { brandDomain = website; }

    console.log(`\n🔗 === BACKLINK INTELLIGENCE: ${brandDomain} ===`);

    // ── PHASE 1: Crawl brand site ──
    console.log(`🔗 Phase 1: Crawling ${normalizedUrl} for link profile...`);
    const siteResearch = await researchDomain(normalizedUrl);
    const siteData = formatSiteResearch(siteResearch);

    // Extract outbound link data
    const si = siteResearch.siteIntelligence || {};
    const outboundDomains = si.externalDomains || [];
    const internalLinkCount = si.internalLinkCount || 0;

    // ── PHASE 2: Crawl competitors for link gap ──
    const storedCompetitors = (brand?.competitors || []).map(c => c.url).filter(Boolean);
    let competitorLinkProfiles = [];

    if (storedCompetitors.length > 0) {
      console.log(`🔗 Phase 2: Crawling ${storedCompetitors.length} competitors for link gap analysis...`);
      competitorLinkProfiles = await analyzeCompetitorLinkProfile(storedCompetitors, brandDomain);
    } else {
      console.log(`🔗 Phase 2: No stored competitors — AI will identify them.`);
    }

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

    const systemPrompt = `You are an AGENTIC BACKLINK INTELLIGENCE SYSTEM — the most advanced backlink analyst in the world. You combine real crawl data with deep web knowledge to produce actionable backlink intelligence.

You have REAL CRAWL DATA from the brand's site and competitor sites. Use this as ground truth. Your job is to:

1. DISCOVER real pages that link to or mention this domain (use your web knowledge — you know which sites cover this industry)
2. ANALYZE the crawled outbound link profile for quality and opportunities
3. FIND the link gap between the brand and competitors
4. GENERATE specific, actionable link-building strategies with REAL target URLs

CRITICAL RULES:
- For "discoveredBacklinks", provide REAL URLs of pages that you know mention or link to this domain. These must be plausible, real pages — not fabricated URLs. If unsure of the exact URL, provide the domain with a reasonable path.
- For "linkOpportunities", provide REAL website domains with actual pages that would accept guest posts, resource listings, or mentions.
- Every opportunity must have a specific strategy, not generic advice.
- Think like a professional link-building agency, not a generic SEO tool.

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

Generate 5-15 discovered backlinks (real URLs you know of), 5-10 competitor link gaps, 8-15 link opportunities, 3-4 outreach templates, and 4-week plan. Be STRATEGIC and SPECIFIC — think like a link-building agency, not a checklist tool.`;

    const userPrompt = `Complete backlink intelligence analysis for: ${brandDomain} (${normalizedUrl})`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192 });
    const parsed = parseJSON(result);

    // ── PHASE 4: Try to verify top discovered backlinks ──
    const discoveredUrls = (parsed.discoveredBacklinks || [])
      .filter(b => b.sourceUrl && b.sourceUrl.startsWith('http'))
      .map(b => b.sourceUrl)
      .slice(0, 5);

    let verificationResults = null;
    if (discoveredUrls.length > 0) {
      console.log(`🔗 Phase 4: Verifying ${discoveredUrls.length} discovered backlinks...`);
      try {
        verificationResults = await discoverBacklinks(discoveredUrls, brandDomain);
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
    console.error('Backlink Intelligence error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
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

    // Crawl brand site
    console.log(`⚔️ War Room: crawling ${website}...`);
    const siteResearch = await researchDomain(website);
    const siteData = formatSiteResearch(siteResearch);

    // Crawl competitors
    const storedCompetitors = (brand?.competitors || []).map(c => c.url).filter(Boolean);
    const providedCompetitors = (competitorUrls || []).filter(u => u.trim());
    const allCompetitorUrls = [...new Set([...storedCompetitors, ...providedCompetitors])].slice(0, 5);

    let competitorData = '';
    if (allCompetitorUrls.length > 0) {
      console.log(`⚔️ Crawling ${allCompetitorUrls.length} competitors...`);
      const competitorResearch = await researchCompetitors(allCompetitorUrls);
      competitorData = formatCompetitorResearch(competitorResearch);
    }

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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 8192 });
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

    // STEP 2: Run REAL probe — actually query ChatGPT, Gemini, Grok
    console.log(`\n🔬 === REAL LLM PROBE: ${brandName} (${probePrompts.length} prompts × 3 models) ===`);
    const probeData = await runRealLLMProbe(probePrompts, brandName, website, competitors);

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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 6144 });
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
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.4, maxTokens: 8192 });
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
    const aiResult = await aiCall(systemPrompt, userPrompt + autocompleteContext, { json: true, temperature: 0.6, maxTokens: 8192 });
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

    const result = await aiCall(systemPrompt, question, { json: true, temperature: 0.7, maxTokens: 4096 });
    const parsed = parseJSON(result);

    res.json({ success: true, ...parsed });
  } catch (error) {
    console.error('SEO Ask error:', error);
    res.status(500).json({ success: false, error: safeErrorMessage(error) });
  }
});

export default router;
