/**
 * Content Studio — Agent Tools (v3)
 * 
 * Real data-gathering tools that agents can use:
 *   - webSearch: Dual-tier search (Grok cheap / Perplexity premium)
 *   - fetchSEOAudit: Pull latest SEO health check data for a brand
 *   - fetchContentHistory: Past generated content for learning
 *   - fetchTrending: Real-time trending topics via Grok + Google Autocomplete
 *   - scrapeCompetitor: Crawl competitor sites + AI analysis
 *   - fetchPerformanceLearnings: Content playbook from past performance + RLHF
 *   - fetchGA4ContentPerformance: Real GA4 page analytics for published content
 *   - gatherIntelligence: Master function that runs all tools in parallel
 */

import SeoAudit from '../../models/SeoAudit.js';
import Content from '../../models/Content.js';
import Brand from '../../models/Brand.js';
import Feedback from '../../models/Feedback.js';
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
// TOOL 5: COMPETITOR SCRAPING — Analyze competitor content strategy
// ══════════════════════════════════════════════════════════════════════════════
export async function scrapeCompetitor(brandId) {
    console.log(`🏢 Content Tool: scrapeCompetitor — analyzing competitor content`);

    try {
        const brand = brandId ? await Brand.findById(brandId).lean() : null;
        if (!brand) return { success: false, data: null, reason: 'No brand found' };

        // Get competitor URLs from Brand DNA
        const dna = brand.dna || {};
        const competitors = dna.competitors || dna.competitorUrls || [];
        const competitorNames = dna.competitorNames || [];

        if (!competitors.length && !competitorNames.length) {
            return { success: false, data: null, reason: 'No competitors in Brand DNA' };
        }

        // Dynamically import crawlPage from web-research.js
        const { crawlPage } = await import('../../utils/web-research.js');

        // Crawl up to 3 competitor homepages (with timeout)
        const urlsToCrawl = competitors.slice(0, 3).map(url => {
            if (!url.startsWith('http')) url = 'https://' + url;
            return url;
        });

        if (!urlsToCrawl.length) {
            return { success: false, data: null, reason: 'No valid competitor URLs' };
        }

        const crawlResults = await Promise.allSettled(
            urlsToCrawl.map(url =>
                Promise.race([
                    crawlPage(url),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
                ])
            )
        );

        const competitorData = crawlResults
            .filter(r => r.status === 'fulfilled' && r.value?.success)
            .map(r => {
                const page = r.value;
                return {
                    url: page.url,
                    title: page.title || '',
                    headings: (page.h1 || []).concat(page.h2 || []).slice(0, 8),
                    wordCount: page.wordCount || 0,
                    contentSnippet: (page.contentSnippet || '').substring(0, 300),
                    hasSchema: page.hasSchemaOrg || false,
                    tech: (page.tech || []).slice(0, 5),
                    internalLinks: page.internalLinkCount || 0,
                };
            });

        if (!competitorData.length) {
            return { success: false, data: null, reason: 'All competitor crawls failed' };
        }

        // Quick AI analysis of competitor content strategy
        const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
        let analysis = '';
        if (grokKey) {
            try {
                const resp = await fetch('https://api.x.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${grokKey}` },
                    body: JSON.stringify({
                        model: 'grok-3-mini-fast',
                        messages: [{
                            role: 'user',
                            content: `Analyze these competitors' content strategy for "${brand.name}" (${dna.industry || ''}).

COMPETITOR DATA:
${competitorData.map(c => `
URL: ${c.url}
Title: ${c.title}
Headings: ${c.headings.join(', ')}
Word count: ${c.wordCount}
Content preview: ${c.contentSnippet}
`).join('\n---\n')}

In 3-4 sentences, summarize:
1. What content strategies competitors are using
2. What topics/angles they're covering
3. Content gaps ${brand.name} could exploit
4. Tone and style patterns you notice`
                        }],
                        max_tokens: 500,
                        temperature: 0.3,
                    }),
                    signal: AbortSignal.timeout(8000),
                });
                const data = await resp.json();
                analysis = (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            } catch (err) {
                console.warn('Competitor AI analysis failed:', err.message);
            }
        }

        return {
            success: true,
            data: {
                competitorsAnalyzed: competitorData.length,
                competitors: competitorData,
                analysis,
                competitorNames: competitorNames.slice(0, 5),
            },
            source: 'CompetitorScraper'
        };
    } catch (err) {
        console.warn('scrapeCompetitor error:', err.message);
        return { success: false, data: null, error: err.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// MASTER: GATHER INTELLIGENCE — Runs all relevant tools in parallel
// ══════════════════════════════════════════════════════════════════════════════
// TOOL 6: PERFORMANCE LEARNER — Build content playbook from past performance + RLHF
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchPerformanceLearnings(brandId) {
    console.log(`📊 Content Tool: fetchPerformanceLearnings — building content playbook`);

    try {
        if (!brandId) return { success: false, data: null, reason: 'No brandId' };

        // 1. Fetch all content with engagement/rating data (last 90 days)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
        const contents = await Content.find({
            brand: brandId,
            createdAt: { $gte: ninetyDaysAgo },
        })
            .select('type platform title rating engagement status aiMeta.agenticPipeline aiMeta.brandAlignmentScore aiMeta.pipelineStep prompt createdAt')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        // 2. Fetch RLHF feedback signals (last 90 days)
        const feedbacks = await Feedback.find({
            brand: brandId,
            createdAt: { $gte: ninetyDaysAgo },
        })
            .select('signalType rating thumbs sentimentScore contentType context.model createdAt')
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        if (!contents.length && !feedbacks.length) {
            return { success: false, data: null, reason: 'No past content or feedback data' };
        }

        // 3. Build performance playbook
        const playbook = {
            totalPieces: contents.length,
            totalFeedback: feedbacks.length,

            // Best performing by type
            byType: {},
            // Best performing by platform
            byPlatform: {},
            // Top rated content (examples for the Writer to learn from)
            topRated: [],
            // Most engaged content
            topEngaged: [],
            // RLHF patterns
            feedbackPatterns: {
                avgSentiment: 0,
                positiveSignals: 0,
                negativeSignals: 0,
                regenerateRate: 0,
                editRate: 0,
                acceptRate: 0,
                publishRate: 0,
            },
            // What to avoid (patterns from low-rated content)
            avoidPatterns: [],
        };

        // Aggregate by type
        for (const c of contents) {
            const type = c.type || 'social';
            if (!playbook.byType[type]) playbook.byType[type] = { count: 0, avgRating: 0, totalEngagement: 0, ratings: [] };
            playbook.byType[type].count++;
            if (c.rating) playbook.byType[type].ratings.push(c.rating);
            const eng = (c.engagement?.likes || 0) + (c.engagement?.comments || 0) * 2 + (c.engagement?.shares || 0) * 3;
            playbook.byType[type].totalEngagement += eng;
        }
        for (const [type, data] of Object.entries(playbook.byType)) {
            data.avgRating = data.ratings.length ? +(data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : 0;
            delete data.ratings;
        }

        // Aggregate by platform
        for (const c of contents) {
            const plat = c.platform || 'general';
            if (!playbook.byPlatform[plat]) playbook.byPlatform[plat] = { count: 0, avgRating: 0, totalEngagement: 0, ratings: [] };
            playbook.byPlatform[plat].count++;
            if (c.rating) playbook.byPlatform[plat].ratings.push(c.rating);
            const eng = (c.engagement?.likes || 0) + (c.engagement?.comments || 0) * 2 + (c.engagement?.shares || 0) * 3;
            playbook.byPlatform[plat].totalEngagement += eng;
        }
        for (const [plat, data] of Object.entries(playbook.byPlatform)) {
            data.avgRating = data.ratings.length ? +(data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : 0;
            delete data.ratings;
        }

        // Top rated content (what the Writer should emulate)
        playbook.topRated = contents
            .filter(c => c.rating && c.rating >= 4)
            .sort((a, b) => b.rating - a.rating)
            .slice(0, 5)
            .map(c => ({
                title: c.title,
                type: c.type,
                platform: c.platform,
                rating: c.rating,
                prompt: (c.prompt || '').substring(0, 100),
            }));

        // Top engaged content
        playbook.topEngaged = contents
            .filter(c => c.engagement && (c.engagement.likes > 0 || c.engagement.comments > 0))
            .sort((a, b) => {
                const engA = (a.engagement?.likes || 0) + (a.engagement?.comments || 0) * 2 + (a.engagement?.shares || 0) * 3;
                const engB = (b.engagement?.likes || 0) + (b.engagement?.comments || 0) * 2 + (b.engagement?.shares || 0) * 3;
                return engB - engA;
            })
            .slice(0, 5)
            .map(c => ({
                title: c.title,
                type: c.type,
                platform: c.platform,
                likes: c.engagement?.likes || 0,
                comments: c.engagement?.comments || 0,
                shares: c.engagement?.shares || 0,
            }));

        // RLHF feedback patterns
        if (feedbacks.length) {
            const sentiments = feedbacks.map(f => f.sentimentScore || 0);
            playbook.feedbackPatterns.avgSentiment = +(sentiments.reduce((a, b) => a + b, 0) / sentiments.length).toFixed(2);
            playbook.feedbackPatterns.positiveSignals = feedbacks.filter(f => f.sentimentScore > 0).length;
            playbook.feedbackPatterns.negativeSignals = feedbacks.filter(f => f.sentimentScore < 0).length;
            playbook.feedbackPatterns.regenerateRate = +(feedbacks.filter(f => f.signalType === 'regenerate').length / feedbacks.length * 100).toFixed(1);
            playbook.feedbackPatterns.editRate = +(feedbacks.filter(f => f.signalType === 'edit').length / feedbacks.length * 100).toFixed(1);
            playbook.feedbackPatterns.acceptRate = +(feedbacks.filter(f => f.signalType === 'accept').length / feedbacks.length * 100).toFixed(1);
            playbook.feedbackPatterns.publishRate = +(feedbacks.filter(f => f.signalType === 'publish').length / feedbacks.length * 100).toFixed(1);
        }

        // What to avoid (low-rated content patterns)
        const lowRated = contents.filter(c => c.rating && c.rating <= 2);
        if (lowRated.length) {
            playbook.avoidPatterns = lowRated.slice(0, 3).map(c => ({
                title: c.title,
                type: c.type,
                platform: c.platform,
                rating: c.rating,
                prompt: (c.prompt || '').substring(0, 80),
            }));
        }

        return { success: true, data: playbook, source: 'PerformanceLearner' };
    } catch (err) {
        console.warn('fetchPerformanceLearnings error:', err.message);
        return { success: false, data: null, error: err.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// TOOL 7: GA4 CONTENT PERFORMANCE — Pull real page analytics for published content
// ══════════════════════════════════════════════════════════════════════════════
export async function fetchGA4ContentPerformance(userId, brandId) {
    console.log(`📈 Content Tool: fetchGA4ContentPerformance — pulling GA4 page analytics`);

    try {
        if (!userId || !brandId) return { success: false, data: null, reason: 'Missing userId or brandId' };

        // Check if GA4 is connected (reuse existing integration check)
        const Integration = (await import('../../models/Integration.js')).default;
        const integration = await Integration.findOne({
            user: userId,
            platform: 'google-analytics',
            status: 'connected',
        }).lean();

        if (!integration?.accessToken) {
            return { success: false, data: null, reason: 'GA4 not connected' };
        }

        // Get published content URLs for this brand
        const publishedContent = await Content.find({
            brand: brandId,
            status: { $in: ['published', 'approved'] },
            'publishedTo.0': { $exists: true },
        })
            .select('title publishedTo platform type')
            .limit(20)
            .lean();

        if (!publishedContent.length) {
            return { success: false, data: null, reason: 'No published content with tracked URLs' };
        }

        // Collect page paths from publishedTo
        const pagePaths = [];
        for (const c of publishedContent) {
            for (const pub of (c.publishedTo || [])) {
                if (pub.url) {
                    try {
                        const u = new URL(pub.url);
                        pagePaths.push({ path: u.pathname, contentTitle: c.title, platform: pub.platform });
                    } catch { /* skip invalid URLs */ }
                }
            }
        }

        if (!pagePaths.length) {
            return { success: false, data: null, reason: 'No trackable URLs in published content' };
        }

        // Get GA4 property ID from integration metadata
        const propertyId = integration.metadata?.selectedPropertyId || integration.metadata?.propertyId;
        if (!propertyId) {
            return { success: false, data: null, reason: 'No GA4 property selected' };
        }

        // Refresh token if needed
        let accessToken = integration.accessToken;
        if (integration.tokenExpiry && new Date(integration.tokenExpiry) < new Date(Date.now() + 5 * 60 * 1000)) {
            if (integration.refreshToken) {
                try {
                    const resp = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            refresh_token: integration.refreshToken,
                            client_id: process.env.GOOGLE_CLIENT_ID,
                            client_secret: process.env.GOOGLE_CLIENT_SECRET,
                            grant_type: 'refresh_token',
                        }),
                    });
                    const tokens = await resp.json();
                    if (tokens.access_token) accessToken = tokens.access_token;
                } catch { /* use existing token */ }
            }
        }

        // Pull page-level report from GA4 Data API
        const reportResp = await fetch(
            `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
                    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
                    metrics: [
                        { name: 'screenPageViews' },
                        { name: 'activeUsers' },
                        { name: 'bounceRate' },
                        { name: 'averageSessionDuration' },
                    ],
                    dimensionFilter: {
                        orGroup: {
                            expressions: pagePaths.slice(0, 10).map(p => ({
                                filter: {
                                    fieldName: 'pagePath',
                                    stringFilter: { value: p.path, matchType: 'EXACT' },
                                },
                            })),
                        },
                    },
                    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                    limit: 20,
                }),
                signal: AbortSignal.timeout(10000),
            }
        );

        const report = await reportResp.json();

        if (report.error) {
            return { success: false, data: null, reason: `GA4 API error: ${report.error.message}` };
        }

        // Parse GA4 response
        const pagePerformance = (report.rows || []).map(row => {
            const path = row.dimensionValues?.[0]?.value || '';
            const matchedContent = pagePaths.find(p => p.path === path);
            return {
                path,
                pageTitle: row.dimensionValues?.[1]?.value || '',
                contentTitle: matchedContent?.contentTitle || '',
                platform: matchedContent?.platform || '',
                pageViews: parseInt(row.metricValues?.[0]?.value || 0),
                users: parseInt(row.metricValues?.[1]?.value || 0),
                bounceRate: parseFloat(row.metricValues?.[2]?.value || 0),
                avgDuration: parseFloat(row.metricValues?.[3]?.value || 0),
            };
        });

        // Compute summary
        const totalViews = pagePerformance.reduce((s, p) => s + p.pageViews, 0);
        const avgBounce = pagePerformance.length
            ? +(pagePerformance.reduce((s, p) => s + p.bounceRate, 0) / pagePerformance.length).toFixed(2)
            : 0;

        return {
            success: true,
            data: {
                pagesTracked: pagePerformance.length,
                totalViews,
                avgBounceRate: avgBounce,
                pages: pagePerformance,
            },
            source: 'GA4',
        };
    } catch (err) {
        console.warn('fetchGA4ContentPerformance error:', err.message);
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

    // Run ALL tools in parallel for speed (7 tools now)
    const [webData, seoData, historyData, trendingData, competitorData, performanceData, ga4Data] = await Promise.allSettled([
        webSearch(searchQuery, searchMode),
        fetchSEOAudit(state.brandId),
        fetchContentHistory(state.brandId, state.platform),
        fetchTrending(state.brandId),
        scrapeCompetitor(state.brandId),
        fetchPerformanceLearnings(state.brandId),
        fetchGA4ContentPerformance(state.userId, state.brandId),
    ]);

    const intelligence = {
        web: webData.status === 'fulfilled' ? webData.value : { success: false },
        seo: seoData.status === 'fulfilled' ? seoData.value : { success: false },
        contentHistory: historyData.status === 'fulfilled' ? historyData.value : { success: false },
        trending: trendingData.status === 'fulfilled' ? trendingData.value : { success: false },
        competitors: competitorData.status === 'fulfilled' ? competitorData.value : { success: false },
        performanceLearnings: performanceData.status === 'fulfilled' ? performanceData.value : { success: false },
        ga4: ga4Data.status === 'fulfilled' ? ga4Data.value : { success: false },
        researchDepth: searchMode,
        gatheredAt: new Date().toISOString(),
    };

    // Log what was gathered
    const sources = [];
    if (intelligence.web.success) sources.push(`Web(${intelligence.web.source})`);
    if (intelligence.seo.success) sources.push('SEO');
    if (intelligence.contentHistory.success) sources.push(`History(${intelligence.contentHistory.data?.totalPieces || 0})`);
    if (intelligence.trending.success) sources.push('Trending');
    if (intelligence.competitors.success) sources.push(`Competitors(${intelligence.competitors.data?.competitorsAnalyzed || 0})`);
    if (intelligence.performanceLearnings.success) sources.push(`Playbook(${intelligence.performanceLearnings.data?.totalPieces || 0})`);
    if (intelligence.ga4.success) sources.push(`GA4(${intelligence.ga4.data?.pagesTracked || 0} pages)`);
    console.log(`   ✅ Intelligence gathered from: ${sources.join(', ') || 'none'}`);
    console.log(`═══════════════════════════════════════\n`);

    return intelligence;
}

