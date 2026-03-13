/**
 * Mantram AI — Real LLM Probe
 * Actually queries ChatGPT, Gemini, and Grok with probe prompts
 * to check if a brand is mentioned in their responses.
 */

const PROBE_TIMEOUT = 12000; // 12s per model (shorter to ensure overall completion)

// ============================================================================
// QUERY INDIVIDUAL MODELS
// ============================================================================

async function queryOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { model: 'ChatGPT', success: false, error: 'No API key' };
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT),
    });
    const data = await resp.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { model: 'ChatGPT', modelId: 'gpt-4o-mini', success: true, response: text, tokens: data.usage?.total_tokens || 0 };
  } catch (e) {
    return { model: 'ChatGPT', success: false, error: e.message };
  }
}

async function queryGemini(prompt) {
  const key = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) return { model: 'Gemini', success: false, error: 'No API key' };
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT),
      }
    );
    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return { model: 'Gemini', modelId: 'gemini-2.0-flash', success: true, response: text, tokens: data.usageMetadata?.totalTokenCount || 0 };
  } catch (e) {
    return { model: 'Gemini', success: false, error: e.message };
  }
}

async function queryGrok(prompt) {
  const key = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (!key) return { model: 'Grok', success: false, error: 'No API key' };
  try {
    const resp = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model: 'grok-3-mini-fast',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT),
    });
    const data = await resp.json();
    let text = data.choices?.[0]?.message?.content || '';
    // Strip <think> tags from Grok
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    return { model: 'Grok', modelId: 'grok-3-mini-fast', success: true, response: text, tokens: data.usage?.total_tokens || 0 };
  } catch (e) {
    return { model: 'Grok', success: false, error: e.message };
  }
}


// ============================================================================
// BRAND MENTION DETECTION
// ============================================================================

function detectMention(response, brandName, website) {
  if (!response || !brandName) return { mentioned: false, mentionType: 'not-mentioned', confidence: 'low' };

  const lower = response.toLowerCase();
  const brandLower = brandName.toLowerCase();

  // Extract domain name without TLD for matching
  let domainName = '';
  try {
    domainName = new URL(website?.startsWith('http') ? website : `https://${website}`).hostname
      .replace(/^www\./, '').split('.')[0].toLowerCase();
  } catch { }

  // Check for brand name mentions
  const brandMentioned = lower.includes(brandLower);
  const domainMentioned = domainName && lower.includes(domainName);
  const urlMentioned = website && lower.includes(website.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''));

  const isMentioned = brandMentioned || domainMentioned || urlMentioned;

  if (!isMentioned) {
    return { mentioned: false, mentionType: 'not-mentioned', confidence: 'high' };
  }

  // Determine mention type by position — earlier mentions = stronger recommendation
  const firstIdx = Math.min(
    brandMentioned ? lower.indexOf(brandLower) : Infinity,
    domainMentioned ? lower.indexOf(domainName) : Infinity,
    urlMentioned ? lower.indexOf(website.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '')) : Infinity,
  );

  const relativePosition = firstIdx / lower.length;

  if (relativePosition < 0.15) {
    return { mentioned: true, mentionType: 'primary-recommendation', confidence: 'high' };
  } else if (relativePosition < 0.4) {
    return { mentioned: true, mentionType: 'secondary-mention', confidence: 'high' };
  } else {
    return { mentioned: true, mentionType: 'passing-mention', confidence: 'medium' };
  }
}

// Find competitor names mentioned in response
function extractCompetitorMentions(response, knownCompetitors = []) {
  if (!response) return [];
  const lower = response.toLowerCase();
  return knownCompetitors.filter(c => {
    const compName = (c.name || c.url || '').toLowerCase().replace(/^www\./, '').split('.')[0];
    return compName && compName.length > 2 && lower.includes(compName);
  }).map(c => c.name || c.url);
}


// ============================================================================
// RUN FULL PROBE — Query all models with all prompts
// ============================================================================

/**
 * Run real LLM probe: generates prompts, queries each model, and detects brand mentions.
 * @param {string[]} prompts - Array of probe prompt strings
 * @param {string} brandName - Brand name to look for
 * @param {string} website - Brand website
 * @param {Array} competitors - Known competitor list
 * @returns {Object} probeResults with real data per prompt per model
 */
export async function runRealLLMProbe(prompts, brandName, website, competitors = []) {
  console.log(`🔬 Running REAL LLM Probe: ${prompts.length} prompts × 3 models...`);
  const results = [];
  let totalTokens = 0;

  // Query all prompts across all models in parallel
  const probeTasks = prompts.flatMap(prompt => [
    queryOpenAI(prompt).then(res => ({ prompt, ...res })),
    queryGemini(prompt).then(res => ({ prompt, ...res })),
    queryGrok(prompt).then(res => ({ prompt, ...res }))
  ]);

  const allResults = await Promise.all(probeTasks);

  for (const result of allResults) {
    const prompt = result.prompt;
      if (!result.success) {
        results.push({
          prompt,
          model: result.model,
          success: false,
          error: result.error,
          mentioned: false,
          mentionType: 'error',
          responseSnippet: '',
          competitorsMentioned: [],
        });
        continue;
      }

      totalTokens += result.tokens || 0;
      const mention = detectMention(result.response, brandName, website);
      const competitorsMentioned = extractCompetitorMentions(result.response, competitors);

      // Get first 300 chars as snippet
      const snippet = result.response.substring(0, 300).replace(/\n+/g, ' ').trim();

      results.push({
        prompt,
        model: result.model,
        modelId: result.modelId,
        success: true,
        mentioned: mention.mentioned,
        mentionType: mention.mentionType,
        confidence: mention.confidence,
        responseSnippet: snippet + (result.response.length > 300 ? '...' : ''),
        fullResponse: result.response,
        competitorsMentioned,
      });
    }
  }

  // Calculate aggregate stats
  const successResults = results.filter(r => r.success);
  const totalProbes = successResults.length;
  const mentionCount = successResults.filter(r => r.mentioned).length;
  const mentionRate = totalProbes > 0 ? Math.round((mentionCount / totalProbes) * 100) : 0;

  const byModel = {};
  for (const r of successResults) {
    if (!byModel[r.model]) byModel[r.model] = { total: 0, mentioned: 0 };
    byModel[r.model].total++;
    if (r.mentioned) byModel[r.model].mentioned++;
  }

  const modelScores = {};
  for (const [model, data] of Object.entries(byModel)) {
    const score = Math.round((data.mentioned / data.total) * 100);
    modelScores[model] = {
      score,
      mentioned: data.mentioned,
      total: data.total,
      status: score >= 60 ? 'visible' : score >= 30 ? 'partially-visible' : 'invisible',
    };
  }

  console.log(`🔬 Probe complete: ${mentionCount}/${totalProbes} mentions (${mentionRate}%), ${totalTokens} tokens used`);

  return {
    results,
    aggregate: {
      totalProbes,
      mentionCount,
      mentionRate,
      overallVisibilityScore: mentionRate,
      totalTokensUsed: totalTokens,
    },
    byModel: modelScores,
  };
}


// ============================================================================
// GENERATE PROBE PROMPTS — AI generates industry-relevant prompts
// ============================================================================

/**
 * Generate probe prompts using AI based on brand context.
 * Returns an array of prompt strings.
 */
export function generateProbePrompts(brandName, industry, targetAudience, website) {
  const prompts = [];

  // Direct brand queries
  prompts.push(`What is ${brandName}? Tell me about this company.`);
  prompts.push(`Is ${brandName} a good choice? What are its pros and cons?`);

  // Industry recommendation queries
  if (industry) {
    prompts.push(`What are the best ${industry} companies or tools available today?`);
    prompts.push(`Recommend the top 5 ${industry} solutions for a small business.`);
    prompts.push(`Which ${industry} platform is best for beginners?`);
    prompts.push(`Compare the leading ${industry} tools. Which one should I choose?`);
  }

  // Problem-solving queries
  if (industry) {
    prompts.push(`How can I improve my ${industry} strategy?`);
    prompts.push(`What tools do experts recommend for ${industry}?`);
  }

  // Best-of / comparison queries
  if (industry && targetAudience) {
    prompts.push(`Best ${industry} solutions for ${targetAudience}?`);
  }

  // Local/specific queries
  if (industry) {
    prompts.push(`Best ${industry} platforms in India for growing businesses?`);
    prompts.push(`What ${industry} software is trending in 2026?`);
  }

  return prompts.slice(0, 6); // Cap at 6 prompts (6 × 3 models = 18 API calls) to ensure completion within 30s
}
