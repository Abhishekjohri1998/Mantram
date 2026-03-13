import { Router } from 'express';
import { protect, optionalAuth } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits } from '../middleware/credits.js';
import Brand from '../models/Brand.js';
import { safeErrorMessage } from '../utils/safeError.js';
import {
  researchDomain, researchCompetitors,
  formatSiteResearch, formatCompetitorResearch,
} from '../utils/web-research.js';

const router = Router();

// ============================================================================
// AI CALL HELPER
// ============================================================================

async function aiCall(systemPrompt, userPrompt, options = {}) {
  const { temperature = 0.7, maxTokens = 8192, json = false } = options;

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
      if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
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
      if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
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
        if (text) return text;
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

    // STEP 1: Real website research
    console.log(`🔍 SEO Health Check: crawling ${website}...`);
    const siteResearch = await researchDomain(website);
    const siteData = formatSiteResearch(siteResearch);

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
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];

    // Save audit
    if (req.user) {
      try {
        const SeoAudit = (await import('../models/SeoAudit.js')).default;
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

    // Real crawl to understand existing content
    console.log(`🔍 SEO Traffic: crawling ${website}...`);
    const siteResearch = await researchDomain(website);
    const siteData = formatSiteResearch(siteResearch);

    const systemPrompt = `You are a STRATEGIC SEO GROWTH ADVISOR — not just a keyword tool. You combine keyword research with business strategy to create a growth playbook. You have REAL CRAWL DATA showing actual content on the site.

CRITICAL: For every recommendation, explain WHY — connect keywords to business outcomes, search intent to buyer journey stages, and content gaps to revenue opportunities.

STRATEGIC FRAMEWORK (2026):
- Google rewards "topical authority" — sites must build depth in topic clusters, not just target isolated keywords
- "Information Gain Score" — Google now measures whether content adds unique value beyond what already exists
- AI Overviews pull from authoritative, well-structured content — FAQ schemas, how-to markup, and entity establishment increase citation rates 3x
- E-E-A-T: First-hand experience signals (case studies, original data, reviews) outperform generic content
- Zero-click searches are 60%+ — content must be optimized for both clicks AND brand visibility in search results

${brandContext ? `BRAND CONTEXT:\n${brandContext}\n` : ''}

Country focus: ${country || brand?.dna?.country || brandPayload?.dna?.country || 'India'}
Industry: ${industry || brand?.dna?.industry || brandPayload?.dna?.industry || 'General'}

${siteData}

Respond in JSON:
{
  "summary": "Strategic 3-4 sentence analysis of the brand's content position, biggest growth lever, and what competitors likely dominate",
  "strategicInsight": "A 2-3 paragraph strategic brief for the brand owner. Explain their content market position, where the biggest untapped audience is, and what content strategy will move the needle most. Be specific to their industry.",
  "keywordClusters": [
    {
      "clusterName": "Topic cluster theme",
      "whyThisCluster": "Strategic reason — why this cluster matters for THIS brand. Connect to business goals, audience needs, or competitive gaps.",
      "funnelStage": "awareness|consideration|decision|retention",
      "intent": "buy|learn|compare|local|navigate",
      "opportunityScore": 0-100,
      "difficulty": "easy|medium|hard",
      "estimatedMonthlySearches": "total estimated monthly search volume across all keywords in this cluster",
      "keywords": [
        { "keyword": "keyword phrase", "volume": "high|medium|low", "intent": "buy|learn|compare", "difficulty": "easy|medium|hard", "whyItMatters": "Why this keyword connects to business outcomes" }
      ],
      "recommendedPageType": "blog|landing|category|faq|guide|tool|comparison|case-study",
      "suggestedTitle": "SEO-optimized page title",
      "suggestedOutline": ["H2 point 1", "H2 point 2", "H2 point 3"],
      "contentAngle": "What unique angle should this content take to outperform existing results (original data, case studies, expert interviews, etc.)"
    }
  ],
  "existingContentStrengths": [
    { "page": "Page found in crawl", "strength": "What it does well", "improvement": "How to rank higher", "whyImprove": "Why improving this specific page has the highest ROI" }
  ],
  "risingKeywords": [
    { "keyword": "trending keyword", "trend": "rising|breakout|seasonal", "reason": "Why trending in this industry", "actionDeadline": "When to publish by" }
  ],
  "seasonalPeaks": [
    { "keyword": "keyword", "peakMonth": "Month", "prepareBy": "Date", "reason": "Festival/event", "contentSuggestion": "What content to prepare" }
  ],
  "contentGaps": [
    { "topic": "Missing content topic", "competitorsCovering": 3, "priority": "high|medium", "suggestedFormat": "blog|video|guide", "whyMissing": "What this gap costs the brand in terms of lost visibility or leads", "revenueImpact": "How filling this gap can drive conversions" }
  ],
  "quickWins": [
    { "action": "What to do", "keyword": "Target keyword", "expectedImpact": "Expected traffic gain", "effort": "quick-fix|moderate", "whyQuick": "Why this will show results fastest" }
  ],
  "thirtyDayPlan": [
    { "week": 1, "theme": "Focus area", "actions": ["Action 1", "Action 2"], "expectedOutcome": "What to expect" },
    { "week": 2, "theme": "Focus area", "actions": ["Action 1", "Action 2"], "expectedOutcome": "What to expect" },
    { "week": 3, "theme": "Focus area", "actions": ["Action 1", "Action 2"], "expectedOutcome": "What to expect" },
    { "week": 4, "theme": "Focus area", "actions": ["Action 1", "Action 2"], "expectedOutcome": "What to expect" }
  ],
  "competitorContentAnalysis": "Brief analysis of what competitors likely rank for and where the brand can differentiate"
}

Generate 5-8 keyword clusters. For each, explain WHY it matters strategically. Think like a growth consultant, not a keyword database.`;

    const userPrompt = `Find traffic opportunities for: ${website}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 8192 });
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];

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

Be STRATEGIC. Every recommendation must explain WHY it matters for AI visibility specifically, not just general SEO.`;

    const userPrompt = `AI Visibility audit for: ${website}`;
    const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 8192 });
    const parsed = parseJSON(result);
    parsed.researchSources = siteResearch.pages?.map(p => p.url) || [website];

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
