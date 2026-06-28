import { setMaxListeners } from 'events';
/**
 * Mantram AI — GEO Probe Service (v3 — production-grade)
 * Real LLM Probing for Generative Engine Optimization
 * 
 * Queries 5 AI models (Gemini, ChatGPT, Claude, Grok, Perplexity) with industry prompts.
 * 
 * v3 IMPROVEMENTS (result quality at par with $499/mo competitors):
 *  - Multi-sample probing: 3 runs per prompt per model for statistical reliability
 *  - Confidence intervals: reports score ± margin of error
 *  - LLM-based sentiment: uses Gemini Flash for accurate sentiment classification
 *  - Citation drift detection: compares current vs previous probe citations
 *  - Prompt intent weighting: purchase > comparison > informational prompts
 *  - All v2 bug fixes retained
 */

const PROBE_TIMEOUT = 15000;
const TOTAL_SUPPORTED_MODELS = 5;
const SAMPLES_PER_PROMPT = 2; // Reduced from 3 to ensure we stay within the 180s total budget

// ============================================================================
// PROMPT GENERATION (with intent tagging)
// ============================================================================

function generateIndustryPrompts(brandName, industry, location, website, customPrompts = [], serviceAreas = [], languages = []) {
    let domain = '';
    try { domain = website ? new URL(website).hostname.replace(/^www\./, '') : ''; } catch (_) { /* ignore */ }

    const effectiveIndustry = industry || domain?.split('.')[0] || brandName;
    const primaryLocation = location || '';

    const seen = new Set();
    const prompts = [];
    const add = (p, intent = 'informational') => {
        const k = p.toLowerCase().trim();
        if (!seen.has(k)) { seen.add(k); prompts.push({ text: p.trim(), intent }); }
    };

    // Custom prompts (purchase intent assumed)
    for (const cp of customPrompts) {
        if (cp && cp.trim()) add(cp.trim(), 'purchase');
    }

    // ── Purchase intent (weight: 3x) ──
    add(`What are the best ${effectiveIndustry} companies or services?`, 'purchase');
    add(`Recommend a good ${effectiveIndustry} provider. What are my options?`, 'purchase');
    add(`I need help with ${effectiveIndustry}. What companies do you recommend and why?`, 'purchase');
    add(`Where can I find reliable ${effectiveIndustry} services online?`, 'purchase');

    // ── Comparison intent (weight: 2x) ──
    add(`Who are the top ${effectiveIndustry} brands${primaryLocation ? ` in ${primaryLocation}` : ''}?`, 'comparison');
    add(`Is ${brandName} a good choice for ${effectiveIndustry}? What are the alternatives?`, 'comparison');
    add(`Compare the best ${effectiveIndustry} solutions available right now.`, 'comparison');
    add(`${brandName} vs competitors — which ${effectiveIndustry} brand is better?`, 'comparison');

    // ── Informational intent (weight: 1x) ──
    add(`Tell me about ${brandName}. What do they do and are they any good?`, 'informational');
    add(`What should I look for when choosing a ${effectiveIndustry} provider?`, 'informational');
    add(`What are people saying about ${brandName}? Is it trustworthy?`, 'informational');

    // ── Location-specific prompts (high-intent for local/regional brands) ──
    if (primaryLocation) {
        add(`Best ${effectiveIndustry} in ${primaryLocation}?`, 'purchase');
        add(`Top-rated ${effectiveIndustry} services near ${primaryLocation}`, 'purchase');
        add(`Which ${effectiveIndustry} brand is most popular in ${primaryLocation}?`, 'comparison');
    }
    // Additional service areas (first 2 to avoid prompt explosion)
    for (const area of serviceAreas.slice(0, 2)) {
        add(`Best ${effectiveIndustry} in ${area}?`, 'purchase');
    }

    // ── Voice / conversational queries (AI Overviews & Copilot weight these) ──
    add(`Hey, what's a good ${effectiveIndustry} company I should try?`, 'purchase');
    add(`I'm looking for ${effectiveIndustry} help — any recommendations?`, 'informational');
    add(`Can you suggest a trusted ${effectiveIndustry} brand?`, 'purchase');

    // ── Shopping / transactional intent ──
    add(`Where can I buy or use ${effectiveIndustry} services online?`, 'purchase');
    add(`Best ${effectiveIndustry} deals and services right now`, 'purchase');

    // ── Review / trust signals ──
    add(`${brandName} reviews — is it legit and worth it?`, 'comparison');

    return prompts.slice(0, 14); // Increased cap from 10 → 14 for better coverage
}

// Intent weights for score calculation
const INTENT_WEIGHTS = { purchase: 3, comparison: 2, informational: 1 };

// ============================================================================
// CITATION EXTRACTION
// ============================================================================

function extractCitations(text) {
    if (!text) return [];
    const citations = new Set();
    const mdLinks = text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi);
    for (const m of mdLinks) citations.add(m[2]);
    const bareUrls = text.matchAll(/(?:^|\s)(https?:\/\/[^\s<>"']+)/gi);
    for (const m of bareUrls) citations.add(m[1].replace(/[.,;)]+$/, ''));
    const domainMentions = text.matchAll(/(?:according to|source:|via|from)\s+([a-z0-9][-a-z0-9]*\.(?:com|org|io|ai|co|net))/gi);
    for (const m of domainMentions) citations.add(`https://${m[1]}`);
    return [...citations].slice(0, 20);
}

// ============================================================================
// LLM PROBING FUNCTIONS
// ============================================================================

async function probeGemini(prompt, signal = null) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    const controller = new AbortController();
    try { setMaxListeners(30, controller.signal); } catch (e) {}
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    
    // Listen for parent abort
    if (signal) {
        if (signal.aborted) { clearTimeout(timer); controller.abort(); }
        else signal.addEventListener('abort', () => { clearTimeout(timer); controller.abort(); });
    }

    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
                }),
                signal: controller.signal,
            }
        );
        clearTimeout(timer);
        if (!resp.ok) return null;
        const data = await resp.json();
        return { model: 'Gemini', response: data?.candidates?.[0]?.content?.parts?.[0]?.text || '', success: true };
    } catch (e) { clearTimeout(timer); return null; }
}

async function probeOpenAI(prompt, signal = null) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;
    const controller = new AbortController();
    try { setMaxListeners(30, controller.signal); } catch (e) {}
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    if (signal) {
        if (signal.aborted) { clearTimeout(timer); controller.abort(); }
        else signal.addEventListener('abort', () => { clearTimeout(timer); controller.abort(); });
    }

    try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant providing honest recommendations.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.4, max_tokens: 1024,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const data = await resp.json();
        return { model: 'ChatGPT', response: data?.choices?.[0]?.message?.content || '', success: true };
    } catch (e) { clearTimeout(timer); return null; }
}

async function probeClaude(prompt, signal = null) {
    const atlasKey = process.env.ATLASCLOUD_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!atlasKey && !anthropicKey) return null;
    const controller = new AbortController();
    try { setMaxListeners(30, controller.signal); } catch (e) {}
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    if (signal) {
        if (signal.aborted) { clearTimeout(timer); controller.abort(); }
        else signal.addEventListener('abort', () => { clearTimeout(timer); controller.abort(); });
    }

    try {
        const resp = await fetch(
            'https://api.anthropic.com/v1/messages',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: 'claude-3-5-haiku-20241022',
                    max_tokens: 1024,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.4,
                }),
                signal: controller.signal,
            }
        );
        clearTimeout(timer);
        if (!resp.ok) return null;
        const data = await resp.json();
        return { model: 'Claude', response: data?.content?.[0]?.text || '', success: true };
    } catch (e) { clearTimeout(timer); return null; }
}

async function probeGrok(prompt, signal = null) {
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) return null;
    const controller = new AbortController();
    try { setMaxListeners(30, controller.signal); } catch (e) {}
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    if (signal) {
        if (signal.aborted) { clearTimeout(timer); controller.abort(); }
        else signal.addEventListener('abort', () => { clearTimeout(timer); controller.abort(); });
    }

    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant providing honest recommendations.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.4, max_tokens: 1024,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const data = await resp.json();
        return { model: 'Grok', response: data?.choices?.[0]?.message?.content || '', success: true };
    } catch (e) { clearTimeout(timer); return null; }
}

async function probePerplexity(prompt, signal = null) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) return null;
    const controller = new AbortController();
    try { setMaxListeners(30, controller.signal); } catch (e) {}
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);

    if (signal) {
        if (signal.aborted) { clearTimeout(timer); controller.abort(); }
        else signal.addEventListener('abort', () => { clearTimeout(timer); controller.abort(); });
    }

    try {
        const resp = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant providing honest recommendations based on current information.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.4, max_tokens: 1024,
            }),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const data = await resp.json();
        return { model: 'Perplexity', response: data?.choices?.[0]?.message?.content || '', success: true };
    } catch (e) { clearTimeout(timer); return null; }
}

// ============================================================================
// LLM-BASED SENTIMENT ANALYSIS (multi-model fallback chain)
// Priority: Perplexity (grounded) → OpenAI (fast) → Gemini (fallback)
// ============================================================================

async function analyzeSentimentViaLLM(text, brandName) {
    if (!text || text.length < 20) return 'neutral';
    const sentimentPrompt = `Analyze the sentiment about "${brandName}" in this text. Respond with ONLY one word: positive, neutral, or negative.\n\nText: "${text.substring(0, 500)}"`;

    // Try Perplexity first (grounded, web-aware sentiment)
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (perplexityKey) {
        try {
            const resp = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                body: JSON.stringify({
                    model: 'sonar', max_tokens: 10, temperature: 0,
                    messages: [{ role: 'user', content: sentimentPrompt }],
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
                const data = await resp.json();
                const result = (data?.choices?.[0]?.message?.content || '').toLowerCase().trim();
                if (result.includes('positive')) return 'positive';
                if (result.includes('negative')) return 'negative';
                if (result.includes('neutral')) return 'neutral';
            }
        } catch (_) { /* fallthrough */ }
    }

    // Try OpenAI (fast, reliable classification)
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', max_tokens: 10, temperature: 0,
                    messages: [{ role: 'user', content: sentimentPrompt }],
                }),
                signal: AbortSignal.timeout(5000),
            });
            if (resp.ok) {
                const data = await resp.json();
                const result = (data?.choices?.[0]?.message?.content || '').toLowerCase().trim();
                if (result.includes('positive')) return 'positive';
                if (result.includes('negative')) return 'negative';
                if (result.includes('neutral')) return 'neutral';
            }
        } catch (_) { /* fallthrough */ }
    }

    // Fallback: Gemini Flash
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        try {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: sentimentPrompt }] }],
                        generationConfig: { temperature: 0, maxOutputTokens: 10 },
                    }),
                    signal: AbortSignal.timeout(5000),
                }
            );
            if (resp.ok) {
                const data = await resp.json();
                const result = (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').toLowerCase().trim();
                if (result.includes('positive')) return 'positive';
                if (result.includes('negative')) return 'negative';
                return 'neutral';
            }
        } catch (_) { /* fallthrough */ }
    }

    return 'neutral';
}

// ============================================================================
// RESPONSE ANALYSIS
// ============================================================================

async function analyzeResponse(response, brandName, competitors = []) {
    if (!response || !response.response) {
        return { mentioned: false, sentiment: 'none', position: 0, competitors: [], snippets: [], citations: [] };
    }

    const text = response.response;
    const brandLower = brandName.toLowerCase().trim();

    // Brand variants for matching
    const brandVariants = new Set();
    brandVariants.add(brandLower);
    if (brandLower.endsWith(' ai')) brandVariants.add(brandLower.replace(/ ai$/, ''));
    if (brandLower.endsWith(' inc')) brandVariants.add(brandLower.replace(/ inc$/, ''));
    if (brandLower.endsWith('.com')) brandVariants.add(brandLower.replace(/\.com$/, ''));
    if (brandLower.includes(' ')) brandVariants.add(brandLower.replace(/\s+/g, ''));

    // Word boundary brand detection
    let mentioned = false;
    for (const v of brandVariants) {
        if (v.length <= 2) continue;
        const escapedV = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|[\\s,.;:!?("'\\-/])${escapedV}(?:[\\s,.;:!?)"'\\-/]|$)`, 'i');
        if (regex.test(text)) { mentioned = true; break; }
    }

    // Position ranking
    let mentionRank = 0;
    if (mentioned) {
        const textLower = text.toLowerCase();
        let charPosition = -1;
        for (const v of brandVariants) {
            if (v.length <= 2) continue;
            const idx = textLower.indexOf(v);
            if (idx >= 0 && (charPosition === -1 || idx < charPosition)) charPosition = idx;
        }
        if (charPosition >= 0) {
            const beforeBrand = text.substring(0, charPosition);
            mentionRank = (beforeBrand.match(/^\d+\.|^[-•*]/gm) || []).length + 1;
        }
    }

    // LLM-based sentiment (P1 fix — replaces keyword counting)
    let sentiment = 'neutral';
    if (mentioned) {
        // Extract brand-adjacent sentences for sentiment
        const sentences = text.split(/(?<=[.!?])\s+/);
        const brandSentences = sentences.filter(s => {
            const sLower = s.toLowerCase();
            return [...brandVariants].some(v => v.length > 2 && sLower.includes(v));
        });
        if (brandSentences.length > 0) {
            sentiment = await analyzeSentimentViaLLM(brandSentences.join(' '), brandName);
        }
    }

    // Extract snippets
    const snippets = [];
    if (mentioned) {
        const sentences = text.split(/(?<=[.!?])\s+/);
        for (const s of sentences) {
            const sLower = s.toLowerCase();
            if ([...brandVariants].some(v => v.length > 2 && sLower.includes(v))) {
                snippets.push(s.trim().substring(0, 250));
                if (snippets.length >= 3) break;
            }
        }
    }

    // Competitor mentions
    const competitorMentions = [];
    for (const comp of competitors) {
        if (!comp || comp.length <= 2) continue;
        const escapedComp = comp.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const compRegex = new RegExp(`(?:^|[\\s,.;:!?("'\\-/])${escapedComp}(?:[\\s,.;:!?)"'\\-/]|$)`, 'i');
        if (compRegex.test(text)) competitorMentions.push(comp);
    }

    return {
        model: response.model,
        mentioned,
        sentiment,
        position: mentionRank || (mentioned ? 1 : 0),
        snippets,
        competitorMentions,
        citations: extractCitations(text),
        responseLength: text.length,
    };
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

function computeConfidence(samples) {
    if (samples.length <= 1) return { mean: samples[0] || 0, margin: 0, confidence: 'low', sampleCount: samples.length };
    const n = samples.length;
    const mean = samples.reduce((s, v) => s + v, 0) / n;
    const variance = samples.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (n - 1);
    const stdDev = Math.sqrt(variance);
    // 95% CI: mean ± 1.96 * (stdDev / sqrt(n))
    const margin = Math.round(1.96 * (stdDev / Math.sqrt(n)));
    let confidence = 'low';
    if (n >= 3 && margin <= 15) confidence = 'high';
    else if (n >= 2 && margin <= 25) confidence = 'medium';
    return { mean: Math.round(mean), margin, confidence, sampleCount: n };
}

// ============================================================================
// MAIN PROBE FUNCTION
// ============================================================================

async function probeAIVisibility(brandName, industry, location, website, competitors = [], customPrompts = [], previousProbe = null, signal = null, serviceAreas = []) {
    console.log(`🔮 GEO Probe v3: Starting multi-sample probing for "${brandName}" (${SAMPLES_PER_PROMPT}x per prompt)...`);

    const prompts = generateIndustryPrompts(brandName, industry, location, website, customPrompts, serviceAreas);

    
    // Increase listener limit for the shared signal to avoid MaxListenersExceededWarning
    if (signal) {
        try { setMaxListeners(30, signal); } catch (e) {}
    }
    console.log(`🔮 GEO Probe: ${prompts.length} prompts × ${SAMPLES_PER_PROMPT} samples × N models`);

    const MODEL_MAP = {
        gemini:     { key: 'GEMINI_API_KEY',     fn: probeGemini,     name: 'Gemini' },
        openai:     { key: 'OPENAI_API_KEY',     fn: probeOpenAI,     name: 'ChatGPT' },
        claude:     { key: 'ANTHROPIC_API_KEY',  fn: probeClaude,     name: 'Claude' },
        grok:       { key: 'GROK_API_KEY',       fn: probeGrok,       name: 'Grok' },
        perplexity: { key: 'PERPLEXITY_API_KEY', fn: probePerplexity, name: 'Perplexity' },
    };

    const availableModels = Object.entries(MODEL_MAP)
        .filter(([, cfg]) => !!process.env[cfg.key])
        .map(([id, cfg]) => ({ id, ...cfg }));

    console.log(`🔮 Models: ${availableModels.map(m => m.name).join(', ')} (${availableModels.length}/${TOTAL_SUPPORTED_MODELS})`);

    if (availableModels.length === 0) {
        return { score: 0, mentionRate: 0, totalProbes: 0, totalMentions: 0, error: 'No API keys' };
    }

    // ── Multi-sample probing ──
    const allProbeResults = [];
    const perSampleScores = []; // For confidence interval computation

    for (let sampleRun = 0; sampleRun < SAMPLES_PER_PROMPT; sampleRun++) {
        const sampleResults = [];

        for (const promptObj of prompts) {
            if (signal && signal.aborted) break;

            // CONCURRENT probing across models for THIS prompt
            const probePromises = availableModels.map(m => m.fn(promptObj.text, signal).catch(err => {
                console.warn(`🔮 GEO Probe: ${m.name} failed for prompt:`, err.message);
                return null;
            }));
            
            const results = await Promise.all(probePromises);

            for (const result of results) {
                if (result && result.success) {
                    const analysis = await analyzeResponse(result, brandName, competitors);
                    const entry = { prompt: promptObj.text, intent: promptObj.intent, sampleRun, ...analysis };
                    allProbeResults.push(entry);
                    sampleResults.push(entry);
                }
            }

            // Small jitter delay between prompt batches instead of large static wait
            if (!signal?.aborted) await new Promise(r => setTimeout(r, Math.random() * 200 + 100));
        }

        // Compute per-sample mention rate for CI
        const sampleMentions = sampleResults.filter(r => r.mentioned);
        const sampleMentionRate = sampleResults.length > 0
            ? Math.round((sampleMentions.length / sampleResults.length) * 100) : 0;
        perSampleScores.push(sampleMentionRate);

        console.log(`🔮 Sample ${sampleRun + 1}/${SAMPLES_PER_PROMPT} complete: ${sampleResults.length} probes, ${sampleMentionRate}% mention rate`);

        // Delay between sample runs
        if (sampleRun < SAMPLES_PER_PROMPT - 1) await new Promise(r => setTimeout(r, 500));
    }

    console.log(`🔮 Total probes across all samples: ${allProbeResults.length}`);

    // ── Aggregate across all samples ──
    const totalProbes = allProbeResults.length;
    const mentions = allProbeResults.filter(r => r.mentioned);
    const mentionRate = totalProbes > 0 ? Math.round((mentions.length / totalProbes) * 100) : 0;

    // Sentiment distribution
    const sentimentDist = { positive: 0, neutral: 0, negative: 0 };
    for (const m of mentions) {
        sentimentDist[m.sentiment] = (sentimentDist[m.sentiment] || 0) + 1;
    }

    // ── Share of Voice (prompt-level, deduplicated across samples) ──
    const promptGroups = {};
    for (const r of allProbeResults) {
        const key = r.prompt;
        if (!promptGroups[key]) promptGroups[key] = { brand: 0, brandTotal: 0, competitors: {} };
        promptGroups[key].brandTotal++;
        if (r.mentioned) promptGroups[key].brand++;
        for (const comp of (r.competitorMentions || [])) {
            promptGroups[key].competitors[comp] = (promptGroups[key].competitors[comp] || 0) + 1;
        }
    }

    const sovRaw = {};
    // Use percentage of samples where brand was mentioned per prompt
    sovRaw[brandName] = Object.values(promptGroups).filter(g => g.brand > 0).length;
    for (const g of Object.values(promptGroups)) {
        for (const [comp, count] of Object.entries(g.competitors)) {
            if (count > 0) sovRaw[comp] = (sovRaw[comp] || 0) + 1;
        }
    }
    const totalSoV = Object.values(sovRaw).reduce((s, v) => s + v, 0) || 1;
    const shareOfVoice = {};
    for (const [name, count] of Object.entries(sovRaw)) {
        shareOfVoice[name] = Math.round((count / totalSoV) * 100);
    }

    // ── Weighted Score (purchase prompts count 3x, comparison 2x, informational 1x) ──
    let weightedMentions = 0, weightedTotal = 0;
    for (const r of allProbeResults) {
        const w = INTENT_WEIGHTS[r.intent] || 1;
        weightedTotal += w;
        if (r.mentioned) weightedMentions += w;
    }
    const weightedMentionRate = weightedTotal > 0 ? Math.round((weightedMentions / weightedTotal) * 100) : 0;

    // ── Scoring ──
    const sentimentScore = Math.min(100, mentions.length > 0
        ? Math.round(((sentimentDist.positive * 100 + sentimentDist.neutral * 50) / mentions.length))
        : 0);
    const avgPosition = mentions.length > 0
        ? mentions.reduce((s, m) => s + (m.position <= 3 ? 100 : m.position <= 5 ? 70 : 40), 0) / mentions.length
        : 0;
    const modelCoverage = Math.round((availableModels.length / TOTAL_SUPPORTED_MODELS) * 100);

    const rawScore = Math.min(100, Math.max(0, Math.round(
        weightedMentionRate * 0.4 +
        sentimentScore * 0.3 +
        avgPosition * 0.2 +
        modelCoverage * 0.1
    )));

    // ── Confidence Interval ──
    const mentionCI = computeConfidence(perSampleScores);
    const scoreCI = {
        score: rawScore,
        margin: mentionCI.margin,
        range: [Math.max(0, rawScore - mentionCI.margin), Math.min(100, rawScore + mentionCI.margin)],
        confidence: mentionCI.confidence,
        samplesPerPrompt: SAMPLES_PER_PROMPT,
        totalSamples: allProbeResults.length,
    };

    // ── Per-model breakdown ──
    const modelBreakdown = {};
    for (const m of availableModels) {
        const mp = allProbeResults.filter(r => r.model === m.name);
        const mm = mp.filter(r => r.mentioned);
        modelBreakdown[m.name] = {
            probed: mp.length,
            mentioned: mm.length,
            mentionRate: mp.length > 0 ? Math.round((mm.length / mp.length) * 100) : 0,
            sentiment: {
                positive: mm.filter(r => r.sentiment === 'positive').length,
                neutral: mm.filter(r => r.sentiment === 'neutral').length,
                negative: mm.filter(r => r.sentiment === 'negative').length,
            },
        };
    }

    // ── Competitive positioning ──
    const brandSoV = shareOfVoice[brandName] || 0;
    let competitivePosition = 'Niche';
    if (brandSoV >= 40) competitivePosition = 'Leader';
    else if (brandSoV >= 20) competitivePosition = 'Challenger';

    // ── Content gaps ──
    const contentGaps = [];
    const seenGapPrompts = new Set();
    for (const r of allProbeResults) {
        if (!r.mentioned && r.competitorMentions?.length > 0 && !seenGapPrompts.has(r.prompt)) {
            seenGapPrompts.add(r.prompt);
            const modelsForPrompt = [...new Set(allProbeResults.filter(p => p.prompt === r.prompt && !p.mentioned && p.competitorMentions?.length > 0).map(p => p.model))];
            contentGaps.push({
                prompt: r.prompt,
                models: modelsForPrompt,
                competitorsFound: [...new Set(allProbeResults.filter(p => p.prompt === r.prompt).flatMap(p => p.competitorMentions || []))],
                opportunity: 'Create content targeting this query to appear alongside competitors',
            });
        }
    }

    // ── Entity confidence ──
    const brandLower = brandName.toLowerCase();
    const brandProbes = allProbeResults.filter(r => r.prompt.toLowerCase().includes(brandLower));
    const entityConfidence = {
        probed: brandProbes.length,
        recognized: brandProbes.filter(r => r.mentioned).length,
        recognitionRate: brandProbes.length > 0 ? Math.round((brandProbes.filter(r => r.mentioned).length / brandProbes.length) * 100) : 0,
    };

    // ── Citations + drift detection ──
    const allCitations = [...new Set(allProbeResults.flatMap(r => r.citations || []))];

    let citationDrift = null;
    if (previousProbe?.citations?.length > 0) {
        const prevSet = new Set(previousProbe.citations);
        const currSet = new Set(allCitations);
        const newCitations = allCitations.filter(c => !prevSet.has(c));
        const lostCitations = previousProbe.citations.filter(c => !currSet.has(c));
        const retained = allCitations.filter(c => prevSet.has(c));
        citationDrift = {
            newCitations,
            lostCitations,
            retained: retained.length,
            driftRate: previousProbe.citations.length > 0
                ? Math.round((lostCitations.length / previousProbe.citations.length) * 100) : 0,
            summary: `${newCitations.length} new, ${lostCitations.length} lost, ${retained.length} retained`,
        };
    }

    // ── Top snippets ──
    const topSnippets = allProbeResults
        .filter(r => r.mentioned && r.snippets?.length > 0)
        .flatMap(r => r.snippets.map(s => ({ model: r.model, prompt: r.prompt, snippet: s })));
    // Deduplicate snippets by content
    const seenSnippets = new Set();
    const uniqueSnippets = [];
    for (const s of topSnippets) {
        const key = s.snippet.substring(0, 100);
        if (!seenSnippets.has(key)) { seenSnippets.add(key); uniqueSnippets.push(s); }
        if (uniqueSnippets.length >= 8) break;
    }

    return {
        score: rawScore,
        scoreCI,
        mentionRate,
        weightedMentionRate,
        totalProbes,
        totalMentions: mentions.length,
        samplesPerPrompt: SAMPLES_PER_PROMPT,
        sentimentDistribution: sentimentDist,
        sentimentMethod: 'llm', // Flag: LLM-based, not keyword
        shareOfVoice,
        competitivePosition,
        modelBreakdown,
        topSnippets: uniqueSnippets,
        contentGaps,
        entityConfidence,
        citations: allCitations,
        citationDrift,
        modelsUsed: availableModels.map(m => m.name),
        modelCoverage: `${availableModels.length}/${TOTAL_SUPPORTED_MODELS}`,
        promptsUsed: prompts.map(p => p.text),
        probeDetails: allProbeResults.map(r => ({
            prompt: r.prompt,
            intent: r.intent,
            sampleRun: r.sampleRun,
            model: r.model,
            mentioned: r.mentioned,
            sentiment: r.sentiment,
            position: r.position,
            snippets: r.snippets,
            citations: r.citations || [],
            competitorMentions: r.competitorMentions || [],
        })),
    };
}

export { probeAIVisibility, generateIndustryPrompts };

