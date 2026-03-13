/**
 * Mantram AI — Keyword Intelligence Engine (Orchestrator)
 * 
 * The brain of the keyword research system. Collects signals from
 * 12 data layers and uses a multi-agent LLM system to produce
 * verified keyword intelligence with confidence scores.
 * 
 * Architecture:
 *   Layer 1: Google Autocomplete (already built)
 *   Layer 2: Google Trends API
 *   Layer 3: SERP Sampling
 *   Layers 4-6: YouTube, Amazon, Bing suggest
 *   Layer 7: Grok (Scout - real-time/trends)
 *   Layer 8: Gemini (Analyst - search graph)
 *   Layer 9: GPT (Judge - synthesis)
 *   Layer 10: Claude (Strategist - optional, activates with API key)
 */

import { getAutocompleteSuggestions, batchAutocompleteSuggestions } from './autocomplete.js';
import { batchTrends, estimateVolumeFromTrends, formatTrendsForPrompt } from './google-trends.js';
import { batchSERPSample, formatSERPForPrompt } from './serp-sampling.js';
import { batchMultiSuggest, formatMultiSuggestForPrompt } from './multi-suggest.js';


// ============================================================================
// AGENT CALLS — Each LLM has a specialized role
// ============================================================================

const AGENT_TIMEOUT = 20000;

/**
 * SCOUT Agent (Grok) — Real-time web + social intelligence.
 * Best at: trending topics, emerging queries, social buzz.
 */
async function scoutAgent(brandContext, industry, country) {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!key) return { agent: 'scout', success: false, error: 'No Grok API key' };

  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'grok-3-mini-fast',
        messages: [{
          role: 'user',
          content: `You are a KEYWORD SCOUT. Your job is to find TRENDING and EMERGING search queries.

${brandContext}
Industry: ${industry || 'General'}
Country: ${country || 'Global'}

Find the keywords people are searching for RIGHT NOW related to this industry. Focus on:
1. Trending topics in this industry this week/month
2. Emerging long-tail queries gaining traction
3. Social media buzz topics (from X/Twitter) relevant to this industry
4. Seasonal/timely keywords for ${new Date().toLocaleString('en', { month: 'long', year: 'numeric' })}
5. Questions people are asking in forums/social about this industry

Respond in JSON:
{
  "trending": [
    { "keyword": "trending query", "volume": "estimated monthly searches (number)", "trend": "rising|breakout|seasonal", "source": "social|search|news", "why": "Why trending now" }
  ],
  "emerging": [
    { "keyword": "newer query", "volume": "estimated monthly searches (number)", "potential": "high|medium", "timeframe": "When this keyword will peak" }
  ],
  "seasonal": [
    { "keyword": "seasonal keyword", "volume": "number", "peakMonth": "Month", "industry": "sub-category" }
  ]
}

Be SPECIFIC to this industry. Think about what's happening RIGHT NOW — new products, regulations, trends, cultural moments. Provide 10-15 trending, 5-8 emerging, 3-5 seasonal.`
        }],
        temperature: 0.5,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(AGENT_TIMEOUT),
    });
    const data = await resp.json();
    let text = data.choices?.[0]?.message?.content || '';
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return {
      agent: 'scout',
      model: 'grok',
      success: true,
      data: JSON.parse(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')),
      tokens: data.usage?.total_tokens || 0,
    };
  } catch (e) {
    return { agent: 'scout', success: false, error: e.message };
  }
}


/**
 * ANALYST Agent (Gemini) — Google's search graph intelligence.
 * Best at: intent classification, entity relationships, volume estimation.
 */
async function analystAgent(brandContext, industry, country, existingSignals) {
  const key = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return { agent: 'analyst', success: false, error: 'No Gemini API key' };

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are a KEYWORD ANALYST with deep search engine knowledge. You understand how Google categorizes and ranks search queries.

${brandContext}
Industry: ${industry || 'General'}
Country: ${country || 'Global'}

${existingSignals}

Based on the real signals above AND your knowledge of search patterns, provide:

1. For each keyword category, estimate MONTHLY SEARCH VOLUMES (specific numbers, not ranges)
2. Classify search INTENT for each keyword
3. Identify ENTITY RELATIONSHIPS (what entities Google associates with these terms)
4. Group keywords into TOPIC CLUSTERS that Google would consider topically related

Respond in JSON:
{
  "keywordAnalysis": [
    {
      "keyword": "the keyword",
      "estimatedMonthlyVolume": 5000,
      "intent": "informational|commercial|transactional|navigational",
      "difficulty": 1-100,
      "cpc_estimate": "$X.XX",
      "entityCluster": "What topical entity this belongs to",
      "seasonality": "evergreen|seasonal|trending",
      "buyerJourney": "awareness|consideration|decision"
    }
  ],
  "topicClusters": [
    {
      "cluster": "Cluster name",
      "pillarKeyword": "main keyword",
      "supportingKeywords": ["kw1", "kw2"],
      "totalEstimatedVolume": 15000,
      "competitiveGap": "What content is missing in this cluster"
    }
  ],
  "volumeCalibration": "Explain your volume estimation methodology and confidence level"
}

Analyze 25-35 keywords total. Be precise with volume estimates — use your knowledge of search patterns for this industry in ${country || 'global markets'}.`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 6144,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(AGENT_TIMEOUT),
      }
    );
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      agent: 'analyst',
      model: 'gemini',
      success: true,
      data: JSON.parse(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')),
      tokens: data.usageMetadata?.totalTokenCount || 0,
    };
  } catch (e) {
    return { agent: 'analyst', success: false, error: e.message };
  }
}


/**
 * STRATEGIST Agent (Claude OR GPT fallback) — Strategic reasoning.
 * Best at: "Should this brand target this keyword?" decisions.
 */
async function strategistAgent(brandContext, industry, allSignals) {
  // Try Claude first
  const claudeKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (claudeKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: `You are a STRATEGIC CMO ADVISOR. You don't just find keywords — you decide which ones THIS brand should actually invest in.

${brandContext}

Here is verified keyword intelligence from multiple data sources:
${allSignals}

Your job:
1. CHALLENGE the data — which keywords look good on paper but are wrong for THIS brand?
2. Find STRATEGIC GEMS — low-volume keywords with high intent that competitors ignore
3. Identify CROSS-LANGUAGE opportunities (especially vernacular — Hindi, Tamil, regional queries)
4. Build a 30-day CONTENT PRIORITY based on impact vs effort
5. Estimate BUSINESS ROI — which keywords will drive revenue, not just traffic?

Respond in JSON:
{
  "strategicVerdict": "2-3 paragraph strategic analysis — act like a CMO billing $500/hour",
  "mustTarget": [
    { "keyword": "kw", "volume": 1000, "why": "Strategic reason specific to THIS brand", "roi": "Expected business outcome", "priority": 1 }
  ],
  "avoid": [
    { "keyword": "kw", "volume": 5000, "why": "Why this keyword is a trap for THIS brand despite looking good" }
  ],
  "hiddenGems": [
    { "keyword": "kw", "volume": 200, "why": "Why low volume but high value", "competitorBlindSpot": true }
  ],
  "vernacularOpportunities": [
    { "keyword": "kw in local language", "language": "Hindi/Tamil/etc", "volume": 500, "competition": "none|low", "opportunity": "Why this is untapped" }
  ],
  "thirtyDayPlan": [
    { "week": 1, "focus": "Theme", "keywords": ["kw1", "kw2"], "content": "What to create", "expectedImpact": "Impact" }
  ]
}`
          }],
        }),
        signal: AbortSignal.timeout(AGENT_TIMEOUT),
      });
      const data = await resp.json();
      const text = data.content?.[0]?.text || '';
      return {
        agent: 'strategist',
        model: 'claude',
        success: true,
        data: JSON.parse(text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')),
        tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      };
    } catch (e) {
      console.warn('Claude strategist failed, falling back to GPT:', e.message);
    }
  }

  // Fallback to GPT for strategy
  const gptKey = process.env.OPENAI_API_KEY;
  if (!gptKey) return { agent: 'strategist', success: false, error: 'No Claude or GPT API key' };

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gptKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `You are a STRATEGIC CMO ADVISOR. Think like a senior marketing strategist. Challenge keyword data and provide brand-specific strategic recommendations. Focus on ROI, not just volume.`
        }, {
          role: 'user',
          content: `${brandContext}\n\nKeyword Intelligence Data:\n${allSignals}\n\nProvide strategic analysis in JSON: { "strategicVerdict": "CMO-level analysis", "mustTarget": [{"keyword":"kw","volume":N,"why":"reason","roi":"outcome","priority":N}], "avoid": [{"keyword":"kw","volume":N,"why":"reason"}], "hiddenGems": [{"keyword":"kw","volume":N,"why":"reason","competitorBlindSpot":true}], "vernacularOpportunities": [{"keyword":"kw","language":"lang","volume":N,"competition":"none|low","opportunity":"reason"}], "thirtyDayPlan": [{"week":1,"focus":"theme","keywords":["kw"],"content":"what","expectedImpact":"impact"}] }`
        }],
        temperature: 0.5,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(AGENT_TIMEOUT),
    });
    const data = await resp.json();
    return {
      agent: 'strategist',
      model: 'gpt-fallback',
      success: true,
      data: JSON.parse(data.choices?.[0]?.message?.content || '{}'),
      tokens: data.usage?.total_tokens || 0,
    };
  } catch (e) {
    return { agent: 'strategist', success: false, error: e.message };
  }
}


// ============================================================================
// CONFIDENCE SCORING
// ============================================================================

/**
 * Calculate confidence stars (1-5) for a keyword based on how many signals validate it.
 */
export function calculateConfidence(keyword, signals) {
  let score = 0;
  const reasons = [];

  // Signal 1: Appears in Google Autocomplete
  if (signals.autocomplete) { score++; reasons.push('in Google Autocomplete'); }
  // Signal 2: Has Google Trends data
  if (signals.trends?.success && signals.trends.avgInterest > 5) { score++; reasons.push(`Trends: ${signals.trends.avgInterest}/100`); }
  // Signal 3: SERP data confirms real results
  if (signals.serp?.success && signals.serp.totalResults > 0) { score++; reasons.push('SERP confirmed'); }
  // Signal 4: Appears in multi-engine suggest (YouTube/Amazon/Bing)
  if (signals.multiEngine) { score++; reasons.push('multi-engine confirmed'); }
  // Signal 5: 2+ LLMs agree on volume range
  if (signals.llmConsensus) { score++; reasons.push('LLM consensus'); }

  return {
    stars: Math.max(1, score),
    confidence: score >= 5 ? 'verified' : score >= 4 ? 'high' : score >= 3 ? 'good' : score >= 2 ? 'directional' : 'ai-estimate',
    reasons,
  };
}


// ============================================================================
// MAIN ORCHESTRATOR — Run the full intelligence pipeline
// ============================================================================

/**
 * Run the full Keyword Intelligence Engine for a brand.
 * This is the main entry point that orchestrates all 12 data layers.
 */
export async function runKeywordIntelligence(brand, options = {}) {
  const startTime = Date.now();
  const {
    seedKeywords = [],
    maxKeywords = 50,
  } = options;

  const dna = brand?.dna || {};
  const brandName = brand?.name || '';
  const industry = dna.industry || '';
  const country = dna.country || '';
  const countryCode = mapCountryCode(country);
  const website = brand?.website || '';

  const brandContext = [
    brandName ? `Brand: ${brandName}` : '',
    website ? `Website: ${website}` : '',
    industry ? `Industry: ${industry}` : '',
    dna.brandDescription ? `Description: ${dna.brandDescription}` : '',
    dna.targetAudience ? `Target Audience: ${dna.targetAudience}` : '',
    country ? `Country: ${country}` : '',
  ].filter(Boolean).join('\n');

  console.log(`\n🧠 === KEYWORD INTELLIGENCE ENGINE ===`);
  console.log(`🧠 Brand: ${brandName}, Industry: ${industry}, Country: ${country}`);

  // Generate seed keywords if not provided
  const seeds = seedKeywords.length > 0 ? seedKeywords : generateSeeds(brandName, industry, dna.targetAudience);
  console.log(`🧠 Seeds: ${seeds.join(', ')}`);

  // ── PHASE 1: Collect all signals in parallel ──
  console.log(`🧠 Phase 1: Collecting signals from all data layers...`);

  const [autocompleteData, trendsData, serpData, multiSuggestData, scoutData] = await Promise.all([
    // Layer 1: Google Autocomplete
    batchAutocompleteSuggestions(seeds.slice(0, 10), countryCode).catch(e => ({})),
    // Layer 2: Google Trends
    batchTrends(seeds.slice(0, 5), countryCode.toUpperCase()).catch(e => []),
    // Layer 3: SERP Sampling (small batch to avoid rate limits)
    batchSERPSample(seeds.slice(0, 3), countryCode.toUpperCase()).catch(e => []),
    // Layers 4-6: YouTube, Amazon, Bing
    batchMultiSuggest(seeds.slice(0, 5), { country: countryCode }).catch(e => ({})),
    // Layer 7: Grok Scout
    scoutAgent(brandContext, industry, country).catch(e => ({ agent: 'scout', success: false, error: e.message })),
  ]);

  // Compile all discovered keywords
  const allKeywords = new Set();
  // From autocomplete
  for (const suggs of Object.values(autocompleteData)) {
    if (Array.isArray(suggs)) suggs.forEach(s => allKeywords.add(s));
  }
  // From multi-suggest
  for (const data of Object.values(multiSuggestData)) {
    if (data?.allSuggestions) data.allSuggestions.forEach(s => allKeywords.add(s));
  }
  // From Grok scout
  if (scoutData?.success && scoutData.data) {
    (scoutData.data.trending || []).forEach(t => allKeywords.add(t.keyword));
    (scoutData.data.emerging || []).forEach(t => allKeywords.add(t.keyword));
    (scoutData.data.seasonal || []).forEach(t => allKeywords.add(t.keyword));
  }
  // From SERP PAA
  for (const serp of serpData) {
    if (serp?.peopleAlsoAsk) serp.peopleAlsoAsk.forEach(q => allKeywords.add(q));
  }
  // From Trends related
  for (const t of trendsData) {
    if (t?.relatedQueries) t.relatedQueries.forEach(q => allKeywords.add(q.query));
    if (t?.risingQueries) t.risingQueries.forEach(q => allKeywords.add(q.query));
  }

  console.log(`🧠 Discovered ${allKeywords.size} unique keywords from public data`);

  // ── PHASE 2: Build signal summary for LLM agents ──
  const signalSummary = buildSignalSummary(autocompleteData, trendsData, serpData, multiSuggestData, scoutData);

  // ── PHASE 3: Run Analyst (Gemini) + Strategist (Claude/GPT) in parallel ──
  console.log(`🧠 Phase 2: Running Analyst + Strategist agents...`);

  const [analystData, strategistData] = await Promise.all([
    analystAgent(brandContext, industry, country, signalSummary),
    strategistAgent(brandContext, industry, signalSummary),
  ]);

  console.log(`🧠 Scout: ${scoutData.success ? '✅' : '❌'} | Analyst: ${analystData.success ? '✅' : '❌'} | Strategist: ${strategistData.success ? '✅' : '❌'}`);

  // ── PHASE 4: Build consensus results ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`🧠 Intelligence complete in ${elapsed}s — ${allKeywords.size} keywords discovered\n`);

  return {
    success: true,
    meta: {
      elapsedSeconds: parseFloat(elapsed),
      totalKeywordsDiscovered: allKeywords.size,
      dataLayers: {
        autocomplete: Object.keys(autocompleteData).length > 0,
        googleTrends: trendsData.some(t => t?.success),
        serpSampling: serpData.some(s => s?.success),
        youtubeSuggest: Object.values(multiSuggestData).some(d => d?.byPlatform?.youtube?.suggestions?.length > 0),
        amazonSuggest: Object.values(multiSuggestData).some(d => d?.byPlatform?.amazon?.suggestions?.length > 0),
        bingSuggest: Object.values(multiSuggestData).some(d => d?.byPlatform?.bing?.suggestions?.length > 0),
        grokScout: scoutData.success,
        geminiAnalyst: analystData.success,
        strategist: strategistData.success,
        strategistModel: strategistData.model || 'none',
      },
      tokensUsed: (scoutData.tokens || 0) + (analystData.tokens || 0) + (strategistData.tokens || 0),
    },
    // Raw signal data
    signals: {
      trendsData: trendsData.filter(t => t?.success),
      serpData: serpData.filter(s => s?.success),
      scoutInsights: scoutData.success ? scoutData.data : null,
      allDiscoveredKeywords: [...allKeywords].slice(0, 100),
    },
    // Analyst output (volume estimates, clusters)
    analyst: analystData.success ? analystData.data : null,
    // Strategist output (must-target, avoid, hidden gems)
    strategist: strategistData.success ? strategistData.data : null,
    // Format for existing AI prompt in /traffic route
    signalPrompt: signalSummary,
  };
}


// ============================================================================
// HELPERS
// ============================================================================

function generateSeeds(brandName, industry, targetAudience) {
  const seeds = [];
  if (industry) {
    seeds.push(industry);
    seeds.push(`best ${industry}`);
    seeds.push(`${industry} tools`);
    seeds.push(`${industry} strategy`);
    seeds.push(`${industry} for small business`);
    seeds.push(`how to ${industry}`);
  }
  if (brandName) {
    seeds.push(brandName);
    seeds.push(`${brandName} alternative`);
  }
  if (targetAudience && industry) {
    seeds.push(`${industry} for ${targetAudience}`);
  }
  return seeds.filter(Boolean).slice(0, 12);
}


function buildSignalSummary(autoData, trendsData, serpData, multiData, scoutData) {
  let summary = '';

  // Autocomplete
  const autoKeywords = new Set();
  for (const suggs of Object.values(autoData)) {
    if (Array.isArray(suggs)) suggs.forEach(s => autoKeywords.add(s));
  }
  if (autoKeywords.size > 0) {
    summary += `\n=== GOOGLE AUTOCOMPLETE (${autoKeywords.size} real queries) ===\n`;
    summary += [...autoKeywords].slice(0, 30).join(' | ') + '\n';
  }

  // Trends
  summary += formatTrendsForPrompt(trendsData);

  // SERP
  summary += formatSERPForPrompt(serpData);

  // Multi-suggest
  summary += formatMultiSuggestForPrompt(multiData);

  // Scout
  if (scoutData?.success && scoutData.data) {
    summary += '\n=== GROK SCOUT: REAL-TIME TRENDS ===\n';
    const td = scoutData.data;
    if (td.trending?.length) {
      summary += 'Trending NOW:\n';
      for (const t of td.trending.slice(0, 8)) {
        summary += `  - "${t.keyword}" (est. ${t.volume}/mo, ${t.trend}) — ${t.why}\n`;
      }
    }
    if (td.emerging?.length) {
      summary += 'Emerging:\n';
      for (const t of td.emerging.slice(0, 5)) {
        summary += `  - "${t.keyword}" (est. ${t.volume}/mo, ${t.potential} potential)\n`;
      }
    }
  }

  return summary;
}


function mapCountryCode(country) {
  if (!country) return '';
  const map = {
    'india': 'in', 'united states': 'us', 'usa': 'us', 'uk': 'gb',
    'canada': 'ca', 'australia': 'au', 'germany': 'de', 'france': 'fr',
    'japan': 'jp', 'brazil': 'br', 'singapore': 'sg', 'uae': 'ae',
  };
  return map[country.toLowerCase()] || country.substring(0, 2).toLowerCase();
}
