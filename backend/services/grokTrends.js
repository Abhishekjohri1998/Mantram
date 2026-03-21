/**
 * Grok Trends Service — Real-time Trending Intelligence via xAI Grok
 * 
 * Uses Grok's real-time knowledge to fetch:
 * 1. Trending topics for any industry/niche
 * 2. Trending keywords for SEO/SEM
 * 3. Social media content suggestions based on what's viral
 * 4. Competitor trending analysis
 * 
 * Grok is especially good at real-time data since it has access to X (Twitter) data.
 */

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
const GROK_BASE_URL = 'https://api.x.ai/v1';

// ── In-memory cache ─────────────────────────────────────────────────────
const grokCache = {
    trends: new Map(),     // key → { data, time }
    TTL: 20 * 60 * 1000,   // 20 minutes (Grok data is very fresh)
};

function getCached(key) {
    const entry = grokCache.trends.get(key);
    if (entry && (Date.now() - entry.time) < grokCache.TTL) return entry.data;
    return null;
}
function setCache(key, data) {
    grokCache.trends.set(key, { data, time: Date.now() });
}

// ── Core Grok API Call ──────────────────────────────────────────────────
async function grokCall(systemPrompt, userPrompt, options = {}) {
    if (!GROK_API_KEY) {
        console.warn('⚠️ Grok API key not configured');
        return null;
    }

    const { temperature = 0.5, maxTokens = 4096, json = true } = options;

    try {
        const resp = await fetch(`${GROK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROK_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'grok-3-mini-fast',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature,
                max_tokens: maxTokens,
                ...(json ? { response_format: { type: 'json_object' } } : {}),
            }),
        });

        const data = await resp.json();
        if (data.error) {
            const msg = data.error.message || data.error;
            if (typeof msg === 'string' && (msg.includes('credits') || msg.includes('spending limit'))) {
                // Silently return null for billing errors to avoid log spam, fallbacks handle it
                return null;
            }
            console.warn('Grok API error:', msg);
            return null;
        }

        const text = data.choices?.[0]?.message?.content || '';
        if (json) {
            try {
                let clean = text.trim();
                if (clean.startsWith('```')) {
                    clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
                }
                return JSON.parse(clean);
            } catch (e) {
                const jsonMatch = text.match(/\{[\s\S]*\}/);
                if (jsonMatch) return JSON.parse(jsonMatch[0]);
                console.warn('Grok JSON parse failed:', e.message);
                return null;
            }
        }
        return text;
    } catch (error) {
        console.error('Grok API call failed:', error.message);
        return null;
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 1. TRENDING TOPICS — What's viral right now
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get real-time trending topics for a given industry/niche
 * Used by: Content suggestions, Social media calendar, PM Studio
 */
export async function getTrendingTopics(industry, country = 'India', options = {}) {
    const cacheKey = `topics:${industry}:${country}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await grokCall(
        `You are a real-time trend intelligence agent with access to the latest social media, news, and search data. Today is ${new Date().toISOString().split('T')[0]}.

Return trending topics that are HAPPENING RIGHT NOW and relevant for marketing in the ${industry} industry in ${country}.

SELECTION CRITERIA:
- Topics must be CURRENT (last 24-48 hours)
- Must be MARKETABLE — brands can create content around them
- SKIP: political controversies, disasters, crime, deaths
- PREFER: viral moments, pop culture, tech launches, memes, seasonal events, sports, entertainment, lifestyle trends
- Include hashtags and social media angles

Respond in JSON:
{
  "trends": [
    {
      "topic": "Trending topic name",
      "description": "What's happening and why it's trending",
      "category": "entertainment|tech|lifestyle|sports|culture|seasonal|viral|business",
      "viralScore": 0-100,
      "platforms": ["twitter", "instagram", "youtube"],
      "hashtags": ["#trending", "#relevant"],
      "marketingAngle": "How brands in ${industry} can leverage this",
      "contentIdea": "Ready-to-post content idea",
      "format": "reel|carousel|meme|post|story|thread",
      "urgency": "now|today|this-week",
      "source": "Where it's trending (X/Twitter, Instagram, YouTube, Google Search)"
    }
  ],
  "overallTrend": "Brief summary of what's dominating social media right now",
  "industryMoment": "Any industry-specific moment or event happening"
}

Return 8-12 trending topics. Be SPECIFIC with real names, events, and moments.`,
        `What's trending right now in ${country} that's relevant for ${industry} brands? Include both viral social media trends and Google Search trends. Focus on what happened in the last 24-48 hours.`,
        { temperature: 0.6, maxTokens: 4096 }
    );

    if (result?.trends) {
        setCache(cacheKey, result);
        console.log(`🔥 Grok: Fetched ${result.trends.length} trending topics for ${industry}`);
    }
    return result || { trends: [], overallTrend: '', industryMoment: '' };
}

// ══════════════════════════════════════════════════════════════════════════
// 2. SEO/SEM TRENDING KEYWORDS — What people are searching for NOW
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get trending SEO keywords and search queries for an industry
 * Used by: SEO Studio (traffic, keyword research), SEM campaigns
 */
export async function getTrendingSEOKeywords(industry, website, country = 'India') {
    const cacheKey = `seo:${industry}:${country}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await grokCall(
        `You are an SEO/SEM trend analyst with real-time access to search data. Today is ${new Date().toISOString().split('T')[0]}.

Identify keywords and search queries that are TRENDING RIGHT NOW or RISING FAST in the ${industry} industry in ${country}.

FOCUS ON:
- Search queries with rising volume (breakout or 200%+ growth)
- Seasonal keywords approaching their peak
- New product/service related queries
- Long-tail keywords with commercial intent
- Questions people are asking (for FAQ content)
- Comparison queries (vs, alternatives, reviews)

Respond in JSON:
{
  "risingKeywords": [
    {
      "keyword": "search query",
      "volume": "high|medium|low",
      "trend": "breakout|rising|seasonal|new",
      "growthRate": "+300%",
      "intent": "buy|learn|compare|navigate|local",
      "difficulty": "easy|medium|hard",
      "whyTrending": "Why this is trending now",
      "actionDeadline": "When to publish content by",
      "contentAngle": "Best content approach for this keyword",
      "semOpportunity": "Should this be a paid ad keyword? Why?"
    }
  ],
  "seasonalUpcoming": [
    {
      "keyword": "seasonal keyword",
      "peakMonth": "Month",
      "prepareBy": "When to start",
      "event": "Festival/event driving the search",
      "contentSuggestion": "What to create"
    }
  ],
  "questionQueries": [
    {
      "question": "What/How/Why question people are asking",
      "searchVolume": "high|medium|low",
      "answerAngle": "How to answer this for SEO",
      "faqSchema": true
    }
  ],
  "competitorKeywords": [
    {
      "keyword": "Competitor-related search query",
      "competitor": "Which competitor",
      "opportunity": "How to intercept this traffic"
    }
  ]
}

Return 8-12 rising keywords, 4-6 seasonal, 5-8 questions, and 3-5 competitor keywords.`,
        `Find trending SEO keywords for ${industry} in ${country}${website ? ` (brand website: ${website})` : ''}. Focus on what's rising in search volume RIGHT NOW.`,
        { temperature: 0.5, maxTokens: 4096 }
    );

    if (result?.risingKeywords) {
        setCache(cacheKey, result);
        console.log(`🔍 Grok: Fetched ${result.risingKeywords.length} trending SEO keywords for ${industry}`);
    }
    return result || { risingKeywords: [], seasonalUpcoming: [], questionQueries: [], competitorKeywords: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// 3. COMPETITOR TREND INTELLIGENCE — What competitors are doing NOW
// ══════════════════════════════════════════════════════════════════════════

/**
 * Analyze competitor trending activities
 * Used by: PM Studio competitor research, SEO competitor analysis
 */
export async function getCompetitorTrendIntel(competitors, industry, country = 'India') {
    const cacheKey = `comp:${competitors.join(',')}:${industry}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await grokCall(
        `You are a competitive intelligence analyst with real-time access to social media, ad platforms, and search data. Today is ${new Date().toISOString().split('T')[0]}.

Analyze what these competitors in the ${industry} industry are doing RIGHT NOW:
${competitors.map(c => `- ${c}`).join('\n')}

ANALYZE:
- Their recent social media activity and engagement
- Any ad campaigns they're running
- Keywords they're targeting
- Content they're publishing
- Any new product launches or offers
- Their current marketing strategy

Respond in JSON:
{
  "competitors": [
    {
      "name": "Competitor name",
      "recentActivity": "What they've been doing in the last 7 days",
      "adActivity": "Any ads or promotions spotted",
      "contentStrategy": "What content they're pushing",
      "trendingKeywords": ["keywords they're targeting"],
      "socialBuzz": "Social media presence and engagement",
      "threatLevel": "high|medium|low",
      "counterStrategy": "How to respond to their moves"
    }
  ],
  "industryShifts": "Any industry-wide shifts or emerging trends",
  "opportunities": ["Gaps or opportunities competitors are missing"]
}`,
        `Competitive intelligence for ${industry} industry in ${country}. Analyze: ${competitors.join(', ')}`,
        { temperature: 0.5, maxTokens: 3072 }
    );

    if (result?.competitors) {
        setCache(cacheKey, result);
        console.log(`🕵️ Grok: Fetched competitor intel for ${competitors.length} competitors`);
    }
    return result || { competitors: [], industryShifts: '', opportunities: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// 4. SOCIAL CONTENT SUGGESTIONS — What to post RIGHT NOW
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get AI-powered content suggestions based on what's trending
 * Used by: Content Studio, Social media calendar
 */
export async function getContentSuggestions(brand, platforms = ['instagram', 'twitter']) {
    const brandName = brand?.name || 'the brand';
    const industry = brand?.dna?.industry || 'general';
    const cacheKey = `content:${brandName}:${platforms.join(',')}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await grokCall(
        `You are a viral social media strategist with real-time access to what's trending on social media. Today is ${new Date().toISOString().split('T')[0]}.

Create READY-TO-POST content suggestions for ${brandName} (${industry} industry) based on what's TRENDING RIGHT NOW.

Brand Context:
- Name: ${brandName}
- Industry: ${industry}
${brand?.dna?.targetAudience ? `- Target Audience: ${brand.dna.targetAudience}` : ''}
${brand?.dna?.voice?.personality ? `- Brand Voice: ${brand.dna.voice.personality}` : ''}
- Platforms: ${platforms.join(', ')}

RULES:
- Suggest content that ties to CURRENT trending topics
- Include trend-hijack ideas (riding viral moments)
- Keep brand voice consistent
- Each suggestion must be READY to create
- Include specific hooks/hooks that will stop scrolling

Respond in JSON:
{
  "suggestions": [
    {
      "title": "Content title/hook",
      "platform": "instagram|twitter|linkedin|youtube",
      "format": "reel|carousel|post|story|thread|short",
      "trendConnection": "Which trend this ties to",
      "caption": "Ready-to-post caption (include emojis, hashtags)",
      "hook": "First line / scroll-stopping hook",
      "visualDirection": "What the visual should look like",
      "bestPostTime": "When to post for max engagement",
      "viralPotential": "high|medium|low",
      "hashtags": ["#trend", "#brand"]
    }
  ],
  "weeklyTheme": "Suggested content theme for this week based on trends",
  "avoidTopics": ["Topics to avoid this week"]
}

Return 6-10 content suggestions. Make them SPECIFIC and ACTIONABLE.`,
        `What should ${brandName} post today on ${platforms.join(' and ')}? What's trending that they can leverage?`,
        { temperature: 0.7, maxTokens: 4096 }
    );

    if (result?.suggestions) {
        setCache(cacheKey, result);
        console.log(`📝 Grok: Generated ${result.suggestions.length} content suggestions for ${brandName}`);
    }
    return result || { suggestions: [], weeklyTheme: '', avoidTopics: [] };
}

// ══════════════════════════════════════════════════════════════════════════
// 5. PRODUCT-AWARE TRENDING FEATURES — What's trending for THIS brand's products
// ══════════════════════════════════════════════════════════════════════════

/**
 * Analyze brand's actual product catalog and return trending features/keywords.
 * Unlike getTrendingTopics (generic industry), this is hyper-specific to products.
 *
 * @param {object} brand - Brand document (name, dna, industry, etc.)
 * @param {Array} products - Array of product summaries [{_id, title, features, category, subCategory, tags, keywords}]
 * @param {string} country
 */
export async function getProductTrendingFeatures(brand, products = [], country = 'India') {
    const brandName = brand?.name || 'Brand';
    const industry = brand?.dna?.industry || 'general';

    // Build product digest for the prompt
    const productDigest = products.slice(0, 30).map(p => {
        const feats = (p.features || []).slice(0, 6).join(', ');
        const tags = (p.tags || []).concat(p.keywords || []).slice(0, 8).join(', ');
        return `• ${p.title} [${p.category || p.subCategory || p.productType || 'general'}]${feats ? ` — Features: ${feats}` : ''}${tags ? ` — Tags: ${tags}` : ''}`;
    }).join('\n');

    const categories = [...new Set(products.map(p => p.category || p.subCategory || p.productType).filter(Boolean))];
    const allFeatures = [...new Set(products.flatMap(p => p.features || []))];
    const allTags = [...new Set(products.flatMap(p => (p.tags || []).concat(p.keywords || [])))];

    const cacheKey = `prodtrend:${brand?._id || brandName}:${country}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const result = await grokCall(
        `You are a product market intelligence agent with real-time access to social media, search trends, Amazon/Flipkart bestseller data, YouTube reviews, Reddit discussions, and X (Twitter) conversations. Today is ${new Date().toISOString().split('T')[0]}.

BRAND: ${brandName}
INDUSTRY: ${industry}
COUNTRY: ${country}
PRODUCT CATEGORIES: ${categories.join(', ') || industry}

PRODUCT CATALOG:
${productDigest || 'No products loaded yet — analyze the category/industry instead.'}

EXISTING FEATURES IN CATALOG: ${allFeatures.slice(0, 30).join(', ') || 'N/A'}
EXISTING TAGS: ${allTags.slice(0, 20).join(', ') || 'N/A'}

YOUR TASK: Research what's TRENDING RIGHT NOW for these specific product categories. Think like a product marketing expert:

1. TRENDING PRODUCT FEATURES — What features are people talking about, searching for, reviewing, and comparing? (e.g., for earphones: ANC, spatial audio, 40hr battery, fast charge, LDAC codec, app EQ control)
2. TRENDING KEYWORDS — What are people searching for when shopping in this category? (e.g., "best ANC earphones under 2000", "earphone for gym")
3. COMPETITOR BUZZWORDS — What features are competitors highlighting in their ads and social posts?
4. VIRAL PRODUCT ANGLES — What product-related content is going viral? (unboxings, comparisons, hacks, fails)

For each trending feature, tell me WHICH products from the catalog match it (by product title).

Respond in JSON:
{
  "trendingFeatures": [
    {
      "feature": "Feature name (e.g., Active Noise Cancellation)",
      "category": "Which product category this belongs to",
      "trendScore": 0-100,
      "whyTrending": "1-line reason why this is trending right now",
      "searchVolume": "high|medium|low",
      "contentAngle": "How to showcase this feature in a creative post",
      "hashtags": ["#relevant", "#hashtags"],
      "matchingProducts": ["Exact product titles from catalog that have this feature"],
      "competitorContext": "What competitors are doing with this feature"
    }
  ],
  "trendingKeywords": [
    {
      "keyword": "Search query / keyword",
      "intent": "buy|compare|learn|review",
      "trendScore": 0-100,
      "matchingProducts": ["Product titles that match this keyword"]
    }
  ],
  "viralAngles": [
    {
      "angle": "Viral content angle",
      "format": "reel|carousel|comparison|unboxing|hack|before-after",
      "whyViral": "Why this type of content is performing well",
      "suggestedProduct": "Best product from catalog for this angle"
    }
  ],
  "categoryInsight": "Overall category trend summary — what's hot, what's cooling down",
  "topRecommendation": "The single best product + feature combo to promote RIGHT NOW and why"
}

Return 10-15 trending features, 8-12 keywords, and 4-6 viral angles. Be SPECIFIC and REAL — use actual trending data, not generic advice.`,
        `What product features, keywords and content angles are trending RIGHT NOW for ${categories.join(', ') || industry} products in ${country}? The brand "${brandName}" sells: ${products.slice(0, 5).map(p => p.title).join(', ') || 'products in ' + industry}. Give me hyper-specific, actionable intelligence.`,
        { temperature: 0.6, maxTokens: 4096 }
    );

    if (result?.trendingFeatures) {
        // Map matching product titles back to IDs
        const titleToId = {};
        products.forEach(p => { titleToId[p.title?.toLowerCase()] = p._id?.toString() });

        result.trendingFeatures.forEach(f => {
            f.matchingProductIds = (f.matchingProducts || [])
                .map(title => {
                    const lower = title.toLowerCase();
                    // Exact match or partial match
                    return titleToId[lower] || Object.entries(titleToId).find(([t]) => t.includes(lower) || lower.includes(t))?.[1];
                })
                .filter(Boolean);
        });

        result.trendingKeywords?.forEach(k => {
            k.matchingProductIds = (k.matchingProducts || [])
                .map(title => {
                    const lower = title.toLowerCase();
                    return titleToId[lower] || Object.entries(titleToId).find(([t]) => t.includes(lower) || lower.includes(t))?.[1];
                })
                .filter(Boolean);
        });

        setCache(cacheKey, result);
        console.log(`🧠 Grok: Product intelligence — ${result.trendingFeatures.length} trending features for ${brandName}`);
    }

    return result || { trendingFeatures: [], trendingKeywords: [], viralAngles: [], categoryInsight: '', topRecommendation: '' };
}

// ══════════════════════════════════════════════════════════════════════════
// UTILITY — Check if Grok is available
// ══════════════════════════════════════════════════════════════════════════

export function isGrokAvailable() {
    return !!(process.env.GROK_API_KEY || process.env.XAI_API_KEY);
}

export function clearGrokCache() {
    grokCache.trends.clear();
}
