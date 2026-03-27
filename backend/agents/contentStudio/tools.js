/**
 * Content Studio — Agent Tools
 * 
 * Real data-gathering tools that agents can use:
 *   - webSearch: Dual-tier search (Grok cheap / Perplexity premium)
 *   - fetchSEOAudit: Pull latest SEO health check data for a brand
 *   - fetchContentHistory: Past generated content for learning
 *   - fetchTrending: Real-time trending topics via Grok + Google Autocomplete
 *   - gatherIntelligence: Master function that runs all tools in parallel
 */

import SeoAudit from '../../models/SeoAudit.js';
import Content from '../../models/Content.js';
import Brand from '../../models/Brand.js';
import { mineAutocomplete } from '../../utils/autocomplete.js';

// ══════════════════════════════════════════════════════════════════════════════
// TOOL 1: WEB SEARCH — Dual-tier (Quick = Grok, Deep = Perplexity + Gemini)
// ══════════════════════════════════════════════════════════════════════════════
export async function webSearch(query, mode = 'quick') {
    console.log(`🌐 Content Tool: webSearch (${mode}) — "${query.substring(0, 60)}..."`);

    if (mode === 'deep') {
        // Premium: Perplexity Sonar (grounded web search with citations)
        return await deepSearch(query);
    }
    // Default: Grok (fast, cheap, real-time from X/Twitter + web)
    return await quickSearch(query);
}

async function quickSearch(query) {
    const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!grokKey) return { success: false, data: '', source: 'none', error: 'No Grok API key' };

    try {
        const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [{
                    role: 'user',
                    content: `Research this topic for content creation. Return concise, factual findings.

TOPIC: ${query}

Provide:
1. KEY FACTS — 3-5 most important data points, statistics, or recent developments
2. TRENDING ANGLE — what's the current conversation around this topic
3. CONTENT HOOKS — 3 compelling hooks/angles a brand could use
4. COMPETITOR EXAMPLES — how top brands/creators are covering this topic right now
5. AUDIENCE SENTIMENT — what do people think/feel about this topic

Format as structured text. Be factual and specific — no generic advice.`
                }],
                search_mode: 'auto',
                max_tokens: 1500,
                temperature: 0.3,
            }),
            signal: AbortSignal.timeout(12000),
        });
        const data = await resp.json();
        let text = data.choices?.[0]?.message?.content || '';
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        return { success: true, data: text, source: 'grok', mode: 'quick' };
    } catch (err) {
        console.warn('Quick search failed:', err.message);
        return { success: false, data: '', source: 'grok', error: err.message };
    }
}

async function deepSearch(query) {
    // Try Perplexity first (grounded + citations), fallback to Gemini with Google Search
    const perplexityKey = process.env.PERPLEXITY_API_KEY;
    if (perplexityKey) {
        try {
            const resp = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${perplexityKey}` },
                body: JSON.stringify({
                    model: 'sonar-pro',
                    messages: [{
                        role: 'system',
                        content: 'You are a professional content researcher. Provide thorough, well-sourced research for content creation. Include data, statistics, competitor examples, and audience insights. Always cite sources.'
                    }, {
                        role: 'user',
                        content: `Deep research for content creation on: ${query}

Provide comprehensive findings:
1. KEY FACTS & STATISTICS — Recent data points with sources
2. INDUSTRY TRENDS — What's trending in this space right now
3. COMPETITOR CONTENT ANALYSIS — How top brands/creators cover this topic, what works, what doesn't
4. AUDIENCE INSIGHTS — What people are searching, asking, and discussing
5. CONTENT GAPS — What's NOT being covered that should be
6. SEO KEYWORDS — Real search terms people use for this topic
7. EXPERT OPINIONS — Notable quotes or perspectives
8. CONTENT ANGLE RECOMMENDATIONS — 3 unique angles based on your research`
                    }],
                    max_tokens: 3000,
                    temperature: 0.2,
                    return_citations: true,
                }),
                signal: AbortSignal.timeout(20000),
            });
            const data = await resp.json();
            const text = data.choices?.[0]?.message?.content || '';
            const citations = data.citations || [];
            if (text.length > 100) {
                return { success: true, data: text, citations, source: 'perplexity', mode: 'deep' };
            }
        } catch (err) {
            console.warn('Perplexity deep search failed:', err.message);
        }
    }

    // Fallback: Gemini with Google Search grounding
    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            const resp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Research this topic thoroughly for content creation: "${query}". Include real data, statistics, competitor examples, trending angles, and SEO keywords.` }] }],
                        tools: [{ googleSearch: {} }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 2000 },
                    }),
                }
            );
            const data = await resp.json();
            const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
            if (text.length > 100) {
                return { success: true, data: text, source: 'gemini-grounded', mode: 'deep' };
            }
        }
    } catch (err) {
        console.warn('Gemini grounded search failed:', err.message);
    }

    // Last resort: try quick search  
    return await quickSearch(query);
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL 2: SEO AUDIT — Pull latest SEO health check data for brand context
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchSEOAudit(brandId) {
    if (!brandId) return { success: false, data: null };
    console.log(`📊 Content Tool: fetchSEOAudit — pulling latest audit data`);

    try {
        // Find the brand to get the website URL
        const brand = await Brand.findById(brandId).lean();
        if (!brand?.dna?.website) return { success: false, data: null, reason: 'No website in Brand DNA' };

        // Find the latest SEO audit for this brand's website
        const audit = await SeoAudit.findOne({
            $or: [
                { brand: brandId },
                { url: { $regex: brand.dna.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), $options: 'i' } }
            ]
        }).sort('-createdAt').lean();

        if (!audit) return { success: false, data: null, reason: 'No SEO audit found' };

        // Extract useful content signals from the audit
        const si = audit.results?.siteIntelligence || {};
        const summary = audit.results?.summary || {};

        return {
            success: true,
            data: {
                siteHealthScore: summary.overallScore || audit.score || 0,
                totalPages: si.totalPages || 0,
                topKeywords: (si.topKeywords || []).slice(0, 15),
                contentGaps: si.contentGaps || [],
                thinContentPages: si.thinContentPages || 0,
                averageWordCount: si.averageWordCount || 0,
                missingMetaDescriptions: si.missingMetaDescriptions?.length || 0,
                missingH1Tags: si.missingH1Tags?.length || 0,
                averagePageSpeed: si.averageResponseTime || 0,
                topPerformingPages: (audit.results?.pageReports || [])
                    .filter(p => p.wordCount > 500)
                    .sort((a, b) => b.wordCount - a.wordCount)
                    .slice(0, 5)
                    .map(p => ({ url: p.url, title: p.title, wordCount: p.wordCount })),
                // Algorithm risk areas
                algorithmRisks: (audit.results?.algorithmRisks || []).slice(0, 3).map(r => r.algorithm + ': ' + r.risk),
                auditDate: audit.createdAt,
            },
            source: 'SeoAudit'
        };
    } catch (err) {
        console.warn('fetchSEOAudit error:', err.message);
        return { success: false, data: null, error: err.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL 3: CONTENT HISTORY — Past generated content for learning
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchContentHistory(brandId, platform = '', limit = 15) {
    if (!brandId) return { success: false, data: [] };
    console.log(`📝 Content Tool: fetchContentHistory — last ${limit} pieces`);

    try {
        const filter = { brand: brandId };
        if (platform) filter.platform = platform;

        const history = await Content.find(filter)
            .sort('-createdAt')
            .limit(limit)
            .select('title content type platform rating engagement status createdAt aiMeta.brandAlignmentScore')
            .lean();

        if (!history.length) return { success: false, data: [], reason: 'No content history' };

        // Analyze patterns
        const topRated = history.filter(h => h.rating >= 4).map(h => ({
            title: h.title,
            type: h.type,
            platform: h.platform,
            engagement: h.engagement,
        }));

        const contentTypes = {};
        history.forEach(h => { contentTypes[h.type] = (contentTypes[h.type] || 0) + 1; });

        const platforms = {};
        history.forEach(h => { if (h.platform) platforms[h.platform] = (platforms[h.platform] || 0) + 1; });

        return {
            success: true,
            data: {
                totalPieces: history.length,
                recentTitles: history.slice(0, 8).map(h => h.title).filter(Boolean),
                topRatedContent: topRated.slice(0, 3),
                contentTypeBreakdown: contentTypes,
                platformBreakdown: platforms,
                averageBrandScore: Math.round(
                    history.reduce((sum, h) => sum + (h.aiMeta?.brandAlignmentScore || 0), 0) / history.length
                ),
                // Content that was published (successful) vs just drafted
                publishedCount: history.filter(h => h.status === 'published').length,
                draftCount: history.filter(h => h.status === 'draft').length,
            },
            source: 'ContentHistory'
        };
    } catch (err) {
        console.warn('fetchContentHistory error:', err.message);
        return { success: false, data: [], error: err.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL 4: TRENDING — Real-time trending topics via Grok + Google Autocomplete
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchTrending(brandId) {
    console.log(`📈 Content Tool: fetchTrending — real-time trend scan`);

    try {
        const brand = brandId ? await Brand.findById(brandId).lean() : null;
        if (!brand) return { success: false, data: null, reason: 'No brand found' };

        const dna = brand.dna || {};
        const industry = dna.industry || '';
        const country = dna.country || 'India';

        // Parallel: Grok trend scout + Google Autocomplete
        const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        const [scoutResult, autocompleteResult] = await Promise.allSettled([
            grokKey ? (async () => {
                const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
                    body: JSON.stringify({
                        model: 'grok-3-mini-fast',
                        messages: [{
                            role: 'user',
                            content: `Content ideation scout for "${brand.name}" (${industry}, ${country}).

Find what's TRENDING RIGHT NOW for content. Today is ${new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

Return JSON:
{
  "trending": [{ "topic": "...", "description": "why trending + content angle", "type": "trending|emerging|seasonal", "urgency": "high|medium|low" }],
  "keywords": [{ "keyword": "...", "intent": "informational|commercial|transactional", "volume": "high|medium|low" }],
  "calendarHooks": ["Upcoming dates/events relevant for content"],
  "viralFormats": ["Content formats that are going viral right now in ${industry}"]
}`
                        }],
                        search_mode: 'auto',
                        temperature: 0.5,
                        max_tokens: 2000,
                        response_format: { type: 'json_object' },
                    }),
                    signal: AbortSignal.timeout(12000),
                });
                const data = await resp.json();
                let text = data.choices?.[0]?.message?.content || '{}';
                text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                return JSON.parse(jsonMatch ? jsonMatch[0] : text);
            })() : Promise.resolve({}),
            mineAutocomplete(brand.name, industry, dna.targetAudience || '', country).catch(() => ({})),
        ]);

        const scoutData = scoutResult.status === 'fulfilled' ? scoutResult.value : {};
        const autoData = autocompleteResult.status === 'fulfilled' ? autocompleteResult.value : {};

        // Merge keywords
        const allKeywords = [...(scoutData.keywords || [])];
        if (autoData.allSuggestions) {
            autoData.allSuggestions.slice(0, 8).forEach(kw => {
                if (!allKeywords.find(k => k.keyword?.toLowerCase() === kw.toLowerCase())) {
                    allKeywords.push({ keyword: kw, intent: 'informational', volume: 'medium' });
                }
            });
        }

        return {
            success: true,
            data: {
                trending: (scoutData.trending || []).slice(0, 8),
                keywords: allKeywords.slice(0, 15),
                calendarHooks: scoutData.calendarHooks || [],
                viralFormats: scoutData.viralFormats || [],
            },
            source: 'GrokScout+Autocomplete'
        };
    } catch (err) {
        console.warn('fetchTrending error:', err.message);
        return { success: false, data: null, error: err.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MASTER: GATHER INTELLIGENCE — Runs all relevant tools in parallel
// ══════════════════════════════════════════════════════════════════════════════
export async function gatherIntelligence(state) {
    console.log(`\n🧠 ═══ Content Intelligence Gatherer ═══`);
    console.log(`   Brief: "${(state.brief || '').substring(0, 80)}..."`);
    console.log(`   Brand: ${state.brandId || 'none'}, Platform: ${state.platform || 'general'}`);
    console.log(`   Research Depth: ${state.researchDepth || 'quick'}`);

    const searchMode = state.researchDepth || 'quick';

    // Build search query from brief + brand context
    const searchQuery = state.brief;

    // Run tools in parallel for speed
    const [webData, seoData, historyData, trendingData] = await Promise.allSettled([
        webSearch(searchQuery, searchMode),
        fetchSEOAudit(state.brandId),
        fetchContentHistory(state.brandId, state.platform),
        fetchTrending(state.brandId),
    ]);

    const intelligence = {
        web: webData.status === 'fulfilled' ? webData.value : { success: false },
        seo: seoData.status === 'fulfilled' ? seoData.value : { success: false },
        contentHistory: historyData.status === 'fulfilled' ? historyData.value : { success: false },
        trending: trendingData.status === 'fulfilled' ? trendingData.value : { success: false },
        researchDepth: searchMode,
        gatheredAt: new Date().toISOString(),
    };

    // Log what was gathered
    const sources = [];
    if (intelligence.web.success) sources.push(`Web(${intelligence.web.source})`);
    if (intelligence.seo.success) sources.push('SEO');
    if (intelligence.contentHistory.success) sources.push(`History(${intelligence.contentHistory.data?.totalPieces || 0})`);
    if (intelligence.trending.success) sources.push('Trending');
    console.log(`   ✅ Intelligence gathered from: ${sources.join(', ') || 'none'}`);
    console.log(`═══════════════════════════════════════\n`);

    return intelligence;
}
