import { Router } from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits } from '../middleware/credits.js';
import { safeErrorMessage } from '../utils/safeError.js';
import SocialStrategy from '../models/SocialStrategy.js';
import SocialAccount from '../models/SocialAccount.js';
import SocialPost from '../models/SocialPost.js';
import { fetchRecentPosts } from '../services/socialService.js';

const router = Router();

// ============================================================================
// AI HELPER (GPT-4o primary, Gemini fallback — same as brainstorm-studio)
// ============================================================================

async function aiCall(systemPrompt, userPrompt, options = {}) {
    const { temperature = 0.7, maxTokens = 4096, json = false } = options;

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

    const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiKey) {
        for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-preview-05-20']) {
            try {
                const resp = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: { parts: [{ text: systemPrompt }] },
                            contents: [{ parts: [{ text: userPrompt }] }],
                            generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
                        }),
                    }
                );
                const data = await resp.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text;
            } catch (e) { console.warn(`Gemini ${model} error:`, e.message); }
        }
    }
    throw new Error('All AI models failed');
}

function parseJSON(text) {
    if (!text) return {};
    try {
        let clean = text.trim();
        if (clean.startsWith('```')) {
            clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        return JSON.parse(clean);
    } catch (e) {
        console.warn('[SocialStudio] JSON Parse failed:', e.message, 'Text snippet:', text.substring(0, 100));
        // Try to extract JSON if it was wrapped in other text
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch {
                return {};
            }
        }
        return {};
    }
}

function buildBrandContext(brand) {
    if (!brand) return '';
    const dna = brand.dna || {};
    const lines = [
        `Brand: ${brand.name}`,
        dna.industry ? `Industry: ${dna.industry}` : '',
        dna.brandDescription ? `Description: ${dna.brandDescription}` : '',
        dna.targetAudience ? `Target Audience: ${dna.targetAudience}` : '',
        dna.tagline ? `Tagline: ${dna.tagline}` : '',
        dna.voice?.personality ? `Voice: ${dna.voice.personality}` : '',
        dna.voice?.description ? `Voice Description: ${dna.voice.description}` : '',
        dna.voice?.keywords?.length ? `Tone Keywords: ${dna.voice.keywords.join(', ')}` : '',
        dna.contentStyle?.dos?.length ? `Content Dos: ${dna.contentStyle.dos.join(', ')}` : '',
        dna.contentStyle?.donts?.length ? `Don'ts: ${dna.contentStyle.donts.join(', ')}` : '',
        dna.contentStyle?.writingStyle ? `Writing Style: ${dna.contentStyle.writingStyle}` : '',
        dna.contentStyle?.ctaStyle ? `CTA Style: ${dna.contentStyle.ctaStyle}` : '',
        dna.contentStyle?.emojiUsage ? `Emoji Usage: ${dna.contentStyle.emojiUsage}` : '',
        dna.contentStyle?.hashtagStyle ? `Hashtag Style: ${dna.contentStyle.hashtagStyle}` : '',
        dna.country ? `Country: ${dna.country}` : '',
        dna.region ? `Region: ${dna.region}` : '',
        dna.targetMarkets?.length ? `Target Markets: ${dna.targetMarkets.join(', ')}` : '',
        dna.defaultLanguage ? `Language: ${dna.defaultLanguage}` : '',
        dna.colors?.length ? `Brand Colors: ${dna.colors.map(c => `${c.name || ''} ${c.hex}`).join(', ')}` : '',
        dna.photographyStyle ? `Photography Style: ${dna.photographyStyle}` : '',
    ];
    // Social Voice analysis (if scraped)
    const sv = dna.socialVoice || {};
    if (sv.captionStyle || sv.toneInsight) {
        lines.push('--- Social Voice Analysis ---');
        if (sv.captionStyle) lines.push(`Caption Style: ${sv.captionStyle}`);
        if (sv.hashtagStrategy) lines.push(`Hashtag Strategy: ${sv.hashtagStrategy}`);
        if (sv.emojiUsage) lines.push(`Social Emoji Usage: ${sv.emojiUsage}`);
        if (sv.ctaStyle) lines.push(`Social CTA Style: ${sv.ctaStyle}`);
        if (sv.postingPatterns) lines.push(`Posting Patterns: ${sv.postingPatterns}`);
        if (sv.toneInsight) lines.push(`Tone Insight: ${sv.toneInsight}`);
        if (sv.sampleCaptions?.length) lines.push(`Sample Captions: ${sv.sampleCaptions.slice(0, 3).join(' | ')}`);
    }
    // Known competitors
    if (brand.competitors?.length) {
        lines.push(`Known Competitors: ${brand.competitors.map(c => c.name + (c.url ? ` (${c.url})` : '')).join(', ')}`);
    }
    // Knowledge bank summary
    if (brand.knowledge?.entries?.length) {
        lines.push(`Knowledge Bank: ${brand.knowledge.entries.length} entries (${brand.knowledge.entries.map(e => e.title || e.sourceType).join(', ')})`);
    }
    return lines.filter(Boolean).join('\n');
}


// ════════════════════════════════════════════════════════════════
//  DATA INTELLIGENCE COLLECTOR — Parallel fetch of all data sources
// ════════════════════════════════════════════════════════════════

async function collectStrategyIntelligence(userId, brand, platforms) {
    const intel = {
        connectedAccounts: [],
        recentPlatformPosts: [],
        postHistory: { published: [], scheduled: [], totalPublished: 0, totalScheduled: 0 },
        previousStrategies: [],
        brandKnowledge: [],
    };

    try {
        // Parallel data fetches from DB
        const [accounts, publishedPosts, scheduledPosts, prevStrategies] = await Promise.all([
            SocialAccount.find({ user: userId, isActive: true }).select('+accessToken').catch(() => []),
            SocialPost.find({ user: userId, status: 'published', ...(brand?._id ? { brand: brand._id } : {}) })
                .sort({ publishedAt: -1 }).limit(50).catch(() => []),
            SocialPost.find({ user: userId, status: 'scheduled', ...(brand?._id ? { brand: brand._id } : {}) })
                .sort({ scheduledFor: 1 }).limit(20).catch(() => []),
            SocialStrategy.find({ user: userId, type: 'strategy', ...(brand?._id ? { brand: brand._id } : {}) })
                .sort({ createdAt: -1 }).limit(3).select('title platforms timeframe data.overview data.contentPillars createdAt').catch(() => []),
        ]);

        // Connected accounts summary
        intel.connectedAccounts = accounts.map(a => ({
            platform: a.platform,
            name: a.accountName,
            id: a.accountId,
            hasToken: !!a.accessToken,
        }));

        // Fetch recent posts from LIVE platforms (only for connected accounts matching selected platforms)
        const relevantAccounts = accounts.filter(a => platforms.includes(a.platform) && a.accessToken);
        const livePostPromises = relevantAccounts.map(async (account) => {
            try {
                const posts = await fetchRecentPosts(account.accountId, account.accessToken, account.platform);
                return posts.map(p => ({ ...p, accountName: account.accountName }));
            } catch (e) {
                console.warn(`[STRATEGY-INTEL] Failed to fetch live posts for ${account.platform}:`, e.message);
                return [];
            }
        });
        const liveResults = await Promise.allSettled(livePostPromises);
        for (const r of liveResults) {
            if (r.status === 'fulfilled') intel.recentPlatformPosts.push(...r.value);
        }

        // Post history summary
        intel.postHistory.published = publishedPosts.map(p => ({
            platform: p.platform,
            caption: (p.caption || '').substring(0, 120),
            publishedAt: p.publishedAt || p.createdAt,
            hasImage: !!p.imageUrl,
        }));
        intel.postHistory.scheduled = scheduledPosts.map(p => ({
            platform: p.platform,
            caption: (p.caption || '').substring(0, 120),
            scheduledFor: p.scheduledFor,
        }));
        intel.postHistory.totalPublished = publishedPosts.length;
        intel.postHistory.totalScheduled = scheduledPosts.length;

        // Previous strategies (summaries only)
        intel.previousStrategies = prevStrategies.map(s => ({
            title: s.title,
            platforms: s.platforms,
            timeframe: s.timeframe,
            overview: s.data?.overview || '',
            pillars: (s.data?.contentPillars || []).map(p => p.name).join(', '),
            createdAt: s.createdAt,
        }));

        // Brand knowledge entries
        if (brand?.knowledge?.entries?.length) {
            intel.brandKnowledge = brand.knowledge.entries.slice(0, 5).map(e => ({
                title: e.title || e.sourceType,
                type: e.sourceType,
                snippet: (e.content || '').substring(0, 200),
            }));
        }

    } catch (e) {
        console.warn('[STRATEGY-INTEL] Data collection failed (non-fatal):', e.message);
    }

    return intel;
}


// ════════════════════════════════════════════════════════════════
//  VERIFIED FESTIVAL REFERENCE DATA (annually updated)
//  Source: drikpanchang.com, publicholidays.in, timeanddate.com
//  Indian festivals follow tithi/lunar calendar — dates CHANGE every year
// ════════════════════════════════════════════════════════════════

const VERIFIED_FESTIVALS_2026 = [
    { date: '2026-01-14', name: 'Makar Sankranti / Pongal', type: 'festival' },
    { date: '2026-01-26', name: 'Republic Day', type: 'national_holiday' },
    { date: '2026-02-14', name: "Valentine's Day", type: 'cultural_moment' },
    { date: '2026-02-17', name: 'Maha Shivaratri', type: 'festival' },
    { date: '2026-03-03', name: 'Holika Dahan', type: 'festival' },
    { date: '2026-03-04', name: 'Holi (Rangwali)', type: 'festival' },
    { date: '2026-03-08', name: "International Women's Day", type: 'awareness_day' },
    { date: '2026-03-19', name: 'Chaitra Navratri begins', type: 'festival' },
    { date: '2026-03-20', name: 'Eid al-Fitr (subject to moon sighting)', type: 'festival' },
    { date: '2026-03-26', name: 'Ram Navami', type: 'festival' },
    { date: '2026-03-27', name: 'Chaitra Navratri ends', type: 'festival' },
    { date: '2026-04-02', name: 'Good Friday', type: 'holiday' },
    { date: '2026-04-05', name: 'Easter Sunday', type: 'festival' },
    { date: '2026-04-14', name: 'Baisakhi / Ambedkar Jayanti', type: 'festival' },
    { date: '2026-05-01', name: 'May Day / Labour Day', type: 'national_holiday' },
    { date: '2026-05-04', name: "Mother's Day", type: 'cultural_moment' },
    { date: '2026-05-27', name: 'Eid al-Adha (Bakrid)', type: 'festival' },
    { date: '2026-06-05', name: 'World Environment Day', type: 'awareness_day' },
    { date: '2026-06-21', name: 'Father\'s Day / International Yoga Day', type: 'awareness_day' },
    { date: '2026-07-17', name: 'Muharram', type: 'festival' },
    { date: '2026-08-05', name: 'Friendship Day', type: 'cultural_moment' },
    { date: '2026-08-11', name: 'Raksha Bandhan', type: 'festival' },
    { date: '2026-08-13', name: 'Janmashtami', type: 'festival' },
    { date: '2026-08-15', name: 'Independence Day', type: 'national_holiday' },
    { date: '2026-09-05', name: 'Teacher\'s Day', type: 'awareness_day' },
    { date: '2026-09-14', name: 'Ganesh Chaturthi', type: 'festival' },
    { date: '2026-09-16', name: 'Milad-un-Nabi (Prophet\'s Birthday)', type: 'festival' },
    { date: '2026-10-02', name: 'Gandhi Jayanti', type: 'national_holiday' },
    { date: '2026-10-10', name: 'Sharad Navratri begins', type: 'festival' },
    { date: '2026-10-18', name: 'Sharad Navratri ends', type: 'festival' },
    { date: '2026-10-21', name: 'Dussehra (Vijayadashami)', type: 'festival' },
    { date: '2026-11-07', name: 'Dhanteras', type: 'festival' },
    { date: '2026-11-08', name: 'Diwali (Lakshmi Puja)', type: 'festival' },
    { date: '2026-11-10', name: 'Bhai Dooj', type: 'festival' },
    { date: '2026-11-14', name: "Children's Day", type: 'awareness_day' },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti', type: 'festival' },
    { date: '2026-12-25', name: 'Christmas Day', type: 'festival' },
    { date: '2026-12-31', name: "New Year's Eve", type: 'cultural_moment' },
];


// ════════════════════════════════════════════════════════════════
//  SMART CALENDAR — Verified dates + LLM for content ideas
//  Uses verified festival dates as ground truth, LLM enriches with
//  content ideas, relevance scoring, and seasonal context
// ════════════════════════════════════════════════════════════════

async function generateSmartCalendar(country, targetMarkets, industry, timeframe, startDate) {
    const start = startDate || new Date();
    const endDate = new Date(start);
    endDate.setMonth(endDate.getMonth() + (timeframe === 'quarterly' ? 3 : 1));

    const dateRange = `${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} to ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    const markets = [country, ...(targetMarkets || [])].filter(Boolean).join(', ');
    const isD2C = /d2c|ecommerce|e-commerce|retail|fashion|beauty|fmcg|consumer/i.test(industry || '');

    // Filter verified festivals to the target date range
    const startISO = start.toISOString().split('T')[0];
    const endISO = endDate.toISOString().split('T')[0];
    const relevantFestivals = VERIFIED_FESTIVALS_2026.filter(f => f.date >= startISO && f.date <= endISO);
    const festivalReference = relevantFestivals.map(f => `${f.date}: ${f.name} [${f.type}]`).join('\n');

    const calendarPrompt = `You are a cultural intelligence engine for social media brands. Given the VERIFIED festival dates below, enrich them with content ideas and relevance scoring. Also add any additional events specific to these markets: ${markets}.

════ VERIFIED FESTIVAL DATES (MANDATORY — use these EXACT dates, do NOT change them) ════
${festivalReference || 'No verified festivals in this date range.'}

Date range: ${dateRange}
Industry: ${industry || 'General'}

ADDITIONAL RULES:
- Keep ALL verified dates exactly as given above — DO NOT modify any date
- Add content ideas and relevance scoring for each verified event
- Add any ADDITIONAL events not in the verified list: awareness days, social media trending days, global campaigns
${isD2C ? '- For D2C brands: add sale event WINDOWS (Republic Day Sale, Summer Sale, Flipkart Big Billion Days, Amazon Great Indian Festival, Myntra EORS, etc.) with their typical timing. Mark these as "type": "sale_event" and note that exact dates are announced closer to the event.' : ''}
- Add seasonal context (wedding season, monsoon, summer, back-to-school, etc.)

Respond in strict JSON:
{
  "events": [
    {
      "date": "2026-03-04",
      "name": "Holi (Rangwali)",
      "type": "festival",
      "relevance": "high",
      "contentIdeas": ["Colorful brand reel with Holi theme", "Festival offer announcement"],
      "platformBest": ["instagram", "facebook"]
    }
  ],
  "seasons": [
    {
      "name": "Wedding Season",
      "period": "March–June",
      "contentAngle": "How to leverage this season"
    }
  ]
}`;

    try {
        const result = await aiCall(
            'You are a cultural intelligence engine. You MUST use the verified dates provided — never change or guess festival dates. Only add additional events that are not in the verified list.',
            calendarPrompt,
            { json: true, temperature: 0.3, maxTokens: 3000 }
        );
        return parseJSON(result);
    } catch (e) {
        console.warn('[SMART-CALENDAR] Calendar generation failed, using verified fallback:', e.message);
        // Fallback: return verified festivals without LLM enrichment
        return {
            events: relevantFestivals.map(f => ({
                date: f.date, name: f.name, type: f.type,
                relevance: 'medium', contentIdeas: [], platformBest: [],
            })),
            seasons: [],
        };
    }
}


// ════════════════════════════════════════════════════════════════
//  FORMAT INTELLIGENCE INTO PROMPT CONTEXT
// ════════════════════════════════════════════════════════════════

function formatIntelligenceContext(intel, calendar) {
    const sections = [];

    // 1. Connected Accounts — with explicit data availability markers
    if (intel.connectedAccounts.length) {
        sections.push(`📊 CONNECTED ACCOUNTS:\n${intel.connectedAccounts.map(a => `- ${a.platform}: ${a.name}`).join('\n')}\n⚠️ NOTE: Follower counts and engagement metrics are NOT available from the API. Do NOT guess or fabricate these numbers.`);
    } else {
        sections.push('📊 CONNECTED ACCOUNTS: None connected. Follower counts, engagement rates, and reach data are NOT AVAILABLE. Do NOT invent metrics.');
    }

    // 2. Recent Live Posts (from platform APIs)
    if (intel.recentPlatformPosts.length) {
        const postSummary = intel.recentPlatformPosts.slice(0, 10).map(p =>
            `- [${p.platform}] "${(p.content || '').substring(0, 80)}..." (${new Date(p.createdAt).toLocaleDateString()})`
        ).join('\n');
        sections.push(`📱 RECENT LIVE POSTS (from platform — real data):\n${postSummary}\n⚠️ NOTE: Like/comment/share counts for these posts are NOT available. Only captions and dates are real.`);
    } else {
        sections.push('📱 RECENT LIVE POSTS: No live post data available. Do NOT fabricate post performance numbers.');
    }

    // 3. Post History from DB
    if (intel.postHistory.totalPublished > 0) {
        const lastPosts = intel.postHistory.published.slice(0, 10).map(p =>
            `- [${p.platform}] "${p.caption}" (${new Date(p.publishedAt).toLocaleDateString()}, ${p.hasImage ? 'with image' : 'text only'})`
        ).join('\n');
        sections.push(`📈 PUBLISH HISTORY (${intel.postHistory.totalPublished} posts — real data):\n${lastPosts}`);

        // Posting frequency analysis
        const platforms = {};
        intel.postHistory.published.forEach(p => {
            platforms[p.platform] = (platforms[p.platform] || 0) + 1;
        });
        sections.push(`📊 POSTING FREQUENCY (last ${intel.postHistory.totalPublished} posts — real): ${Object.entries(platforms).map(([p, c]) => `${p}: ${c}`).join(', ')}`);
    } else {
        sections.push('📈 PUBLISH HISTORY: No posts published through this platform yet. Posting frequency is UNKNOWN.');
    }

    // 4. Scheduled Content
    if (intel.postHistory.totalScheduled > 0) {
        const scheduled = intel.postHistory.scheduled.slice(0, 5).map(p =>
            `- [${p.platform}] "${p.caption}" → scheduled for ${new Date(p.scheduledFor).toLocaleDateString()}`
        ).join('\n');
        sections.push(`📅 ALREADY SCHEDULED (${intel.postHistory.totalScheduled} posts):\n${scheduled}`);
    }

    // 5. Previous Strategies
    if (intel.previousStrategies.length) {
        const prev = intel.previousStrategies.map(s =>
            `- "${s.title}" (${new Date(s.createdAt).toLocaleDateString()}) — Pillars: ${s.pillars || 'N/A'}\n  Overview: ${s.overview || 'N/A'}`
        ).join('\n');
        sections.push(`🔄 PREVIOUS STRATEGIES (build on these, don't repeat):\n${prev}`);
    }

    // 6. Smart Calendar Events (verified dates)
    if (calendar?.events?.length) {
        const events = calendar.events.slice(0, 20).map(e =>
            `- ${e.date}: ${e.name} [${e.type}] (relevance: ${e.relevance}) — ${(e.contentIdeas || []).join(', ')}`
        ).join('\n');
        sections.push(`🗓️ UPCOMING EVENTS & MOMENTS (VERIFIED dates — use exactly as listed):\n${events}`);
    }
    if (calendar?.seasons?.length) {
        const seasons = calendar.seasons.map(s =>
            `- ${s.name} (${s.period}): ${s.contentAngle}`
        ).join('\n');
        sections.push(`🌦️ SEASONAL CONTEXT:\n${seasons}`);
    }

    // 7. Brand Knowledge
    if (intel.brandKnowledge.length) {
        const kb = intel.brandKnowledge.map(k => `- [${k.type}] ${k.title}: ${k.snippet}`).join('\n');
        sections.push(`📚 BRAND KNOWLEDGE BANK:\n${kb}`);
    }

    return sections.length > 0 ? sections.join('\n\n') : 'No additional data available — generate strategy based on brand context alone.';
}


// ════════════════════════════════════════════════════════════════
//  1. GENERATE STRATEGY — Data-Driven AI Social Media Strategy
// ════════════════════════════════════════════════════════════════

router.post('/generate-strategy', protect, requireStudio('socialMediaStudio'), requireCredits('socialMedia'), async (req, res) => {
    try {
        const { platforms, timeframe, goals, industry, currentMetrics, brand } = req.body;
        if (!platforms?.length) return res.status(400).json({ success: false, error: 'Select at least one platform' });

        // Load full brand from DB for deep DNA access
        const Brand = mongoose.model('Brand');
        const fullBrand = brand?._id ? await Brand.findById(brand._id).catch(() => null) : null;
        const brandToUse = fullBrand || brand;

        const brandCtx = buildBrandContext(brandToUse);
        const timeframeLabel = timeframe === 'quarterly' ? '3-month quarterly' : '1-month';
        const dna = brandToUse?.dna || {};
        const isD2C = /d2c|ecommerce|e-commerce|retail|fashion|beauty|fmcg|consumer|shopify/i.test(industry || dna.industry || '');

        console.log(`[STRATEGY] Collecting intelligence for ${platforms.join(', ')} — D2C: ${isD2C}`);

        // Parallel: collect live data + generate smart calendar
        const [intel, calendar] = await Promise.all([
            collectStrategyIntelligence(req.user._id, brandToUse, platforms),
            generateSmartCalendar(dna.country, dna.targetMarkets, industry || dna.industry, timeframe),
        ]);

        const intelligenceContext = formatIntelligenceContext(intel, calendar);
        console.log(`[STRATEGY] Intelligence collected: ${intel.connectedAccounts.length} accounts, ${intel.recentPlatformPosts.length} live posts, ${intel.postHistory.totalPublished} published, ${calendar?.events?.length || 0} events`);

        const systemPrompt = `You are a world-class Social Media Strategist and CMO with 15+ years experience. You think like a growth strategist — every recommendation must be backed by the DATA provided below.

═══════════════ BRAND CONTEXT ═══════════════
${brandCtx}

═══════════════ LIVE DATA & ANALYTICS ═══════════════
${intelligenceContext}

═══════════════ YOUR MISSION ═══════════════
Generate a comprehensive, DATA-DRIVEN ${timeframeLabel} social media strategy for: ${platforms.join(', ')}

Goals: ${goals || 'Brand awareness and engagement growth'}
Industry: ${industry || dna.industry || 'General'}
Current metrics: ${currentMetrics || 'See live data above'}

🚨 ANTI-HALLUCINATION RULES (MANDATORY — VIOLATION = FAILURE):
- NEVER fabricate, guess, or invent follower counts, engagement rates, impressions, reach, or any numerical metric
- If the LIVE DATA section says "NOT AVAILABLE" for any metric, you MUST say "Not available" or "Baseline to be measured" in your output — DO NOT make up a number
- Only reference numbers that appear EXPLICITLY in the LIVE DATA section above
- For growth projections: if current metrics are unknown, state "Current: To be measured" and give percentage-based targets instead of absolute numbers
- For data insights: only cite patterns from ACTUAL post history data provided. If no posts exist, say "No historical data available — recommendations based on industry benchmarks"
- Festival and event dates in the calendar section are VERIFIED — use them exactly as listed, do not change any date

CRITICAL RULES FOR A DATA-DRIVEN STRATEGY:
1. **Reference ONLY real data**: Cite specific posts, dates, and patterns from the data above. NEVER invent engagement numbers.
2. **Calendar-driven content**: Tie content pillars and specific posts to upcoming events/festivals/moments from the VERIFIED calendar data above.
3. **Build on history, don't repeat**: If previous strategies exist, evolve them — don't regenerate the same pillars.
4. **Avoid scheduled conflicts**: If content is already scheduled, factor that into your calendar.
5. **Posting frequency from data**: If we see actual posting data, reference it. If NOT available, recommend industry-standard frequency.
6. **Platform-specific insights**: Use the live post data to identify patterns. If no data, recommend based on industry best practices and say so.
${isD2C ? `7. **D2C INTELLIGENCE**: This is a D2C/retail brand. Factor in:
   - Upcoming sale events and shopping festivals from the calendar
   - Seasonal collection launches and refreshes
   - Product-led content (lookbooks, new arrivals, restocks)
   - FOMO-driven campaigns (limited editions, flash sales, early access)
   - Customer loyalty and retention content
   - UGC and review-driven social proof campaigns` : ''}

YOUR OUTPUT MUST INCLUDE:

1. **Data Insights** — What the current data tells us (top patterns, gaps, opportunities)
2. **Content Pillars** (4-5 themed pillars with % content mix) — tied to brand DNA and data patterns
3. **Platform-specific strategy** for EACH selected platform:
   - Posting frequency (realistic, based on current cadence — incremental growth)
   - Best posting times (based on industry + existing data patterns)
   - Content format mix (tied to what's working from the data)
   - Tone and style guide (aligned with brand voice DNA)
   - Hashtag strategy (branded + niche + trending mix) with 10-15 hashtags
   - Growth tactics specific to platform algorithm (2026 latest)
4. **Calendar Hooks** — Specific upcoming events/festivals/moments to leverage with content ideas
5. **Weekly content quota** — exact number of posts per platform per week
6. **Engagement strategy** — community building, reply strategy, DM approach
7. **Growth projections** — targets based on REAL current metrics, not wishful thinking
${isD2C ? '8. **D2C Strategy** — Sale event calendar, collection drop timeline, seasonal campaign plan' : ''}

Respond in STRICT JSON:
{
  "overview": "2-3 sentence executive summary referencing real data points",
  "dataInsights": [
    { "insight": "Your reels get 3x more engagement than static posts", "recommendation": "Shift to 60% reel content", "impact": "Expected 40% engagement lift", "icon": "📊" }
  ],
  "contentPillars": [
    { "name": "Pillar name", "percentage": 25, "description": "What this covers — tied to data", "icon": "emoji", "examples": ["Post idea 1 tied to upcoming event", "Post idea 2"] }
  ],
  "platformStrategies": [
    {
      "platform": "instagram",
      "frequency": "5 reels + 3 carousels + daily stories per week",
      "currentCadence": "Currently posting 2x/week",
      "bestTimes": ["9:00 AM", "12:30 PM", "7:00 PM"],
      "bestDays": ["Tuesday", "Thursday", "Saturday"],
      "formatMix": { "reels": 40, "carousels": 25, "stories": 20, "static": 10, "live": 5 },
      "toneGuide": "How to write for this platform — aligned with brand voice",
      "hashtags": { "branded": ["#BrandName"], "niche": ["#IndustryTag"], "trending": ["#Trending"] },
      "growthTactics": ["Tactic 1 — specific to 2026 algorithm", "Tactic 2", "Tactic 3"],
      "doNot": ["Thing to avoid 1", "Thing to avoid 2"]
    }
  ],
  "calendarHooks": [
    { "date": "2026-03-14", "event": "Holi", "contentIdea": "Behind-the-scenes festival celebration reel", "platforms": ["instagram", "facebook"], "type": "festival", "priority": "high" }
  ],
  "weeklyQuota": { "totalPosts": 15, "breakdown": { "instagram": 8, "linkedin": 4, "twitter": 3 } },
  "engagementStrategy": {
    "replyWindow": "Within 1 hour",
    "communityTactics": ["Tactic 1", "Tactic 2"],
    "dmStrategy": "How to handle DMs",
    "ugcStrategy": "How to encourage user content"
  },
  "growthProjections": [
    { "metric": "Instagram Followers", "current": "from real data", "target": "realistic target", "timeframe": "1 month", "assumption": "Based on current growth rate + strategy improvements" }
  ],
  "contentCalendarTemplate": {
    "monday": { "platform": "instagram", "type": "reel", "pillar": "educate", "hook": "Tie to upcoming event if applicable" },
    "tuesday": { "platform": "linkedin", "type": "text post", "pillar": "authority" }
  },
  ${isD2C ? `"d2cStrategy": {
    "saleCalendar": [{ "event": "Summer Sale", "timing": "May 15-25", "prepDays": 7, "contentPlan": "Teaser → Launch → Last chance" }],
    "collectionDrops": ["Spring/Summer launch — early March", "Festive Collection — pre-Navratri"],
    "loyaltyTactics": ["VIP early access", "UGC contests"],
    "retentionContent": ["Re-order reminders", "Styling tips", "Customer spotlight"]
  },` : ''}
  "toolsRecommended": ["Tool 1 — why", "Tool 2 — why"]
}`;

        const userPrompt = `Generate a ${timeframeLabel} social media strategy for ${platforms.join(', ')}.\nGoals: ${goals || 'Growth'}\nIndustry: ${industry || dna.industry || 'General'}\nCurrent metrics: ${currentMetrics || 'See live data in context above'}\nToday's date: ${new Date().toISOString().split('T')[0]}`;

        const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7, maxTokens: 8000 });
        const strategy = parseJSON(result);

        // Save to DB
        const saved = await SocialStrategy.create({
            user: req.user._id,
            brand: brandToUse?._id || req.body.brandId,
            type: 'strategy',
            title: `${platforms.join(' + ')} Strategy — ${timeframeLabel}`,
            platforms,
            timeframe: timeframe || 'monthly',
            data: strategy,
            inputs: { platforms, timeframe, goals, industry, currentMetrics, dataSourcesUsed: {
                connectedAccounts: intel.connectedAccounts.length,
                livePosts: intel.recentPlatformPosts.length,
                publishedPosts: intel.postHistory.totalPublished,
                scheduledPosts: intel.postHistory.totalScheduled,
                calendarEvents: calendar?.events?.length || 0,
                previousStrategies: intel.previousStrategies.length,
            }},
        });

        res.json({ success: true, strategy, strategyId: saved._id });
    } catch (error) {
        console.error('Social strategy error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  2. GENERATE CALENDAR — Monthly Content Calendar
// ════════════════════════════════════════════════════════════════

router.post('/generate-calendar', protect, requireStudio('socialMediaStudio'), requireCredits('socialMediaCalendar'), async (req, res) => {
    try {
        const { platforms, month, year, brand, themes, postsPerWeek } = req.body;
        if (!platforms?.length) return res.status(400).json({ success: false, error: 'Select at least one platform' });

        const brandCtx = buildBrandContext(brand);
        const targetMonth = month || new Date().getMonth() + 1;
        const targetYear = year || new Date().getFullYear();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthName = monthNames[targetMonth - 1];

        const systemPrompt = `You are a Social Media Content Calendar expert. Generate a detailed daily content calendar for ${monthName} ${targetYear}.

BRAND CONTEXT:
${brandCtx}

Platforms: ${platforms.join(', ')}
Posts per week: ${postsPerWeek || 'recommend optimal'}
Content themes: ${themes || 'Use brand-appropriate themes'}

Generate a FULL month calendar with specific post ideas for each day. Include:
- Platform-specific post ideas
- Content type (reel, carousel, story, post, thread, article)
- Caption theme/hook (not full caption — just the angle)
- Hashtag set (3-5 relevant hashtags per post)
- Content pillar (educate, entertain, inspire, sell, community)
- Best posting time

Include relevant festivals, trending days, awareness days for the month.

Respond in STRICT JSON:
{
  "month": "${monthName}",
  "year": ${targetYear},
  "totalPosts": 20,
  "keyDates": [
    { "date": "${targetYear}-${String(targetMonth).padStart(2,'0')}-14", "event": "Valentine's Day", "opportunity": "How to leverage" }
  ],
  "weeks": [
    {
      "weekNumber": 1,
      "theme": "Week theme",
      "posts": [
        {
          "date": "${targetYear}-${String(targetMonth).padStart(2,'0')}-01",
          "day": "Monday",
          "platform": "instagram",
          "type": "reel",
          "pillar": "educate",
          "captionAngle": "The hook or angle for this post",
          "hashtags": ["#tag1", "#tag2", "#tag3"],
          "bestTime": "9:00 AM",
          "estimatedReach": "High / Medium / Low",
          "notes": "Any special notes"
        }
      ]
    }
  ],
  "monthlyGoals": ["Goal 1", "Goal 2"],
  "contentMixSummary": { "reels": 8, "carousels": 5, "stories": 10, "posts": 4, "threads": 3 }
}`;

        const userPrompt = `Generate ${monthName} ${targetYear} content calendar for ${platforms.join(', ')}. ${themes ? `Themes: ${themes}` : ''}`;

        const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7, maxTokens: 8000 });
        const calendar = parseJSON(result);

        const saved = await SocialStrategy.create({
            user: req.user._id,
            brand: brand?._id || req.body.brandId,
            type: 'calendar',
            title: `${monthName} ${targetYear} Calendar — ${platforms.join(' + ')}`,
            platforms,
            timeframe: 'monthly',
            data: calendar,
            inputs: { platforms, month: targetMonth, year: targetYear, themes, postsPerWeek },
        });

        res.json({ success: true, calendar, calendarId: saved._id });
    } catch (error) {
        console.error('Calendar generation error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  3. ACCOUNT AUDIT — AI Health Check
// ════════════════════════════════════════════════════════════════

router.post('/account-audit', protect, requireStudio('socialMediaStudio'), requireCredits('socialMediaAudit'), async (req, res) => {
    try {
        const { platform, metrics, brand } = req.body;
        if (!platform) return res.status(400).json({ success: false, error: 'Platform is required' });

        const brandCtx = buildBrandContext(brand);
        const metricsText = metrics ? Object.entries(metrics).map(([k, v]) => `${k}: ${v}`).join('\n') : 'No metrics provided — analyze based on industry benchmarks';

        const systemPrompt = `You are a Social Media Audit specialist. Analyze the ${platform} account for this brand and provide a comprehensive health check.

BRAND CONTEXT:
${brandCtx}

ACCOUNT METRICS:
${metricsText}

Generate a detailed audit with scoring (0-100) for each dimension. Be HONEST — don't inflate scores. Compare against industry benchmarks.

Respond in STRICT JSON:
{
  "overallScore": 65,
  "grade": "B-",
  "summary": "2-3 sentence executive summary of account health",
  "dimensions": [
    {
      "name": "Engagement Rate",
      "score": 70,
      "benchmark": "Industry avg: 3.5%",
      "current": "Your rate: 2.8%",
      "verdict": "Below average — needs improvement",
      "icon": "emoji"
    },
    {
      "name": "Posting Consistency",
      "score": 45,
      "benchmark": "Optimal: 5-7 posts/week",
      "current": "Your rate: 2-3 posts/week",
      "verdict": "Inconsistent — major gaps detected",
      "icon": "emoji"
    },
    {
      "name": "Content Variety",
      "score": 60,
      "benchmark": "Mix of 4+ formats",
      "current": "Mostly static posts",
      "verdict": "Add reels and carousels",
      "icon": "emoji"
    },
    {
      "name": "Growth Velocity",
      "score": 55,
      "benchmark": "5-10% monthly growth",
      "current": "2% monthly",
      "verdict": "Slow — needs paid boost or viral hooks",
      "icon": "emoji"
    },
    {
      "name": "Profile Optimization",
      "score": 80,
      "benchmark": "Complete bio + CTA + highlights",
      "current": "Good bio, missing CTA",
      "verdict": "Almost there",
      "icon": "emoji"
    },
    {
      "name": "Hashtag Effectiveness",
      "score": 50,
      "benchmark": "Mix of volume levels",
      "current": "Using only popular tags",
      "verdict": "Add niche + branded hashtags",
      "icon": "emoji"
    }
  ],
  "topStrengths": ["Strength 1", "Strength 2"],
  "criticalIssues": ["Issue 1", "Issue 2", "Issue 3"],
  "actionPlan": [
    { "priority": "high", "action": "What to do", "impact": "Expected result", "timeline": "This week" },
    { "priority": "medium", "action": "What to do", "impact": "Expected result", "timeline": "This month" },
    { "priority": "low", "action": "What to do", "impact": "Expected result", "timeline": "Next month" }
  ],
  "competitorBenchmark": "How you compare to typical accounts in this industry"
}`;

        const userPrompt = `Audit ${platform} account for ${brand?.name || 'this brand'}. Metrics: ${metricsText}`;

        const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.6, maxTokens: 5000 });
        const audit = parseJSON(result);

        const saved = await SocialStrategy.create({
            user: req.user._id,
            brand: brand?._id || req.body.brandId,
            type: 'audit',
            title: `${platform} Audit — Score: ${audit.overallScore}/100`,
            platforms: [platform],
            data: audit,
            inputs: { platform, metrics },
        });

        res.json({ success: true, audit, auditId: saved._id });
    } catch (error) {
        console.error('Account audit error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  4. COMPETITOR ANALYSIS — AI Competitor Intelligence
// ════════════════════════════════════════════════════════════════

router.post('/competitor-analysis', protect, requireStudio('socialMediaStudio'), requireCredits('socialMediaCompetitor'), async (req, res) => {
    try {
        const { competitors, platforms, brand } = req.body;
        if (!competitors?.length) return res.status(400).json({ success: false, error: 'Add at least one competitor' });

        const brandCtx = buildBrandContext(brand);

        const systemPrompt = `You are a Competitive Intelligence analyst specializing in social media. Analyze the following competitors against the brand.

BRAND CONTEXT:
${brandCtx}

COMPETITORS TO ANALYZE: ${competitors.map(c => c.name || c).join(', ')}
PLATFORMS: ${(platforms || ['instagram', 'linkedin']).join(', ')}

Based on your knowledge of these brands/companies, analyze their likely social media strategy. Be specific and actionable.

Respond in STRICT JSON:
{
  "overview": "2-3 sentence competitive landscape summary",
  "competitors": [
    {
      "name": "Competitor name",
      "platforms": {
        "instagram": {
          "estimatedFollowers": "Range",
          "postingFrequency": "X posts/week",
          "contentStyle": "Description of their style",
          "topContentTypes": ["Reels", "Carousels"],
          "engagementLevel": "High / Medium / Low",
          "strengths": ["Strength 1"],
          "weaknesses": ["Weakness 1"]
        }
      },
      "overallStrategy": "What they're doing well",
      "vulnerabilities": ["Gap 1", "Gap 2"]
    }
  ],
  "yourAdvantages": ["What you can do better 1", "What you can do better 2"],
  "contentGaps": [
    { "gap": "Content type competitors miss", "opportunity": "How you can fill it", "platform": "Where to post it" }
  ],
  "stealablePlaybook": [
    { "tactic": "What they do that works", "adaptation": "How to make it yours", "difficulty": "Easy / Medium / Hard" }
  ],
  "differentiationStrategy": "How to stand out from all competitors",
  "weeklyBattlePlan": {
    "outpost": "Beat them here first",
    "contentWeapons": ["Weapon 1", "Weapon 2"],
    "engagementTactics": ["Tactic 1"]
  }
}`;

        const userPrompt = `Analyze competitors: ${competitors.map(c => c.name || c).join(', ')} vs ${brand?.name || 'our brand'} on ${(platforms || ['instagram']).join(', ')}`;

        const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.7, maxTokens: 6000 });
        const analysis = parseJSON(result);

        const saved = await SocialStrategy.create({
            user: req.user._id,
            brand: brand?._id || req.body.brandId,
            type: 'competitor',
            title: `vs ${competitors.map(c => c.name || c).join(', ')}`,
            platforms: platforms || ['instagram'],
            data: analysis,
            inputs: { competitors, platforms },
        });

        res.json({ success: true, analysis, analysisId: saved._id });
    } catch (error) {
        console.error('Competitor analysis error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  5. PROFILE SCORE — Platform-Specific Profile Health Score
// ════════════════════════════════════════════════════════════════

const PLATFORM_RUBRICS = {
    instagram: {
        label: 'Instagram',
        parameters: [
            { id: 'bio', name: 'Bio Quality', maxScore: 10, benchmark: 'Use all 150 chars, include 1 CTA, 2-3 keywords, line breaks for readability', impactStat: 'Optimized bios increase profile visits by 33%' },
            { id: 'profilePhoto', name: 'Profile Photo', maxScore: 10, benchmark: 'High-res (320×320px min), consistent with brand, recognizable at small sizes', impactStat: 'Profiles with professional photos get 14x more views' },
            { id: 'storyHighlights', name: 'Story Highlights', maxScore: 10, benchmark: 'Minimum 5 categorized highlights with branded covers (Services, Reviews, BTS, FAQ, Press)', impactStat: 'Highlights increase profile dwell time by 40%' },
            { id: 'linkInBio', name: 'Link in Bio', maxScore: 10, benchmark: 'Use Linktree/Beacons with 5+ trackable links, clear CTA', impactStat: 'Multi-link tools boost click-through by 25%' },
            { id: 'contactCTA', name: 'Contact / Action Button', maxScore: 10, benchmark: 'Business account with active CTA (Shop, Book, Contact)', impactStat: 'Action buttons generate 35% more inquiries' },
            { id: 'contentTheme', name: 'Feed Aesthetic & Theme', maxScore: 10, benchmark: 'Consistent color palette, visual grid pattern, branded templates', impactStat: 'Cohesive feeds convert 21% more visitors to followers' },
            { id: 'reelsCovers', name: 'Reels Cover Branding', maxScore: 10, benchmark: 'Custom covers with text overlays matching brand fonts/colors', impactStat: 'Branded reel covers increase save rate by 18%' },
            { id: 'hashtagStrategy', name: 'Hashtag Strategy', maxScore: 10, benchmark: 'Mix of 3-5 branded + 10-15 niche (10K-500K volume) + 3-5 trending per post', impactStat: 'Optimized hashtag sets boost reach by 40-50%' },
            { id: 'username', name: 'Username & Handle', maxScore: 10, benchmark: 'Matches brand name, no underscores/numbers, same across platforms', impactStat: 'Consistent handles increase cross-platform discovery by 22%' },
            { id: 'categoryTag', name: 'Category & Labels', maxScore: 10, benchmark: 'Correct business category selected, location tagged', impactStat: 'Proper categorization improves Explore page visibility by 15%' }
        ]
    },
    linkedin: {
        label: 'LinkedIn',
        parameters: [
            { id: 'headline', name: 'Headline', maxScore: 10, benchmark: '120 chars, include role + value prop + 3-5 industry keywords. Formula: [Role] | Helping [audience] achieve [outcome]', impactStat: 'Keyword-rich headlines get 40% more search appearances' },
            { id: 'profilePhoto', name: 'Profile Photo', maxScore: 10, benchmark: '400×400px min, professional headshot, face takes 60% of frame, solid/branded background', impactStat: 'Professional photos get 21x more views and 36x more messages' },
            { id: 'banner', name: 'Banner Image', maxScore: 10, benchmark: '1584×396px, shows brand value prop, clear CTA text, matches brand palette', impactStat: 'Custom banners increase profile credibility score by 25%' },
            { id: 'aboutSummary', name: 'About / Summary', maxScore: 10, benchmark: 'Use full 2600 chars, structured with hook → story → proof → CTA. Include 5+ keywords', impactStat: 'Complete About sections get 30% more connection requests' },
            { id: 'experience', name: 'Experience Section', maxScore: 10, benchmark: 'Current role + 3-5 past roles with measurable achievements (numbers, %), rich media attached', impactStat: 'Detailed experience sections boost recruiter/client trust by 45%' },
            { id: 'skills', name: 'Skills & Endorsements', maxScore: 10, benchmark: '50 skills listed, top 3 relevant to current focus, 10+ endorsements each', impactStat: 'Members with 5+ skills get 17x more profile views' },
            { id: 'recommendations', name: 'Recommendations', maxScore: 10, benchmark: '5+ received, 3+ given, diverse (clients, colleagues, partners), recency within 12 months', impactStat: 'Profiles with recommendations are 12x more likely to be contacted' },
            { id: 'customUrl', name: 'Custom URL', maxScore: 10, benchmark: 'linkedin.com/in/firstname-lastname, remove random numbers', impactStat: 'Custom URLs rank higher in Google and look professional in emails' },
            { id: 'featuredSection', name: 'Featured Section', maxScore: 10, benchmark: '3-6 items: top posts, articles, case studies, portfolio links', impactStat: 'Featured sections increase content engagement by 28%' },
            { id: 'activitySignals', name: 'Activity & Posting', maxScore: 10, benchmark: 'Post 3-5x/week, engage daily, respond to comments within 1 hour', impactStat: 'Active profiles rank 5x higher in LinkedIn search results' }
        ]
    },
    facebook: {
        label: 'Facebook',
        parameters: [
            { id: 'coverPhoto', name: 'Cover Photo / Video', maxScore: 10, benchmark: '820×312px image or 20-90sec cover video, includes brand message + CTA', impactStat: 'Cover videos increase page engagement by 26%' },
            { id: 'profilePhoto', name: 'Profile Photo', maxScore: 10, benchmark: '170×170px min, logo for business, consistent with other platforms', impactStat: 'Brand-consistent logos build 23% more trust' },
            { id: 'aboutSection', name: 'About Section', maxScore: 10, benchmark: 'Complete all fields: story, mission, founding date, products, milestones', impactStat: 'Complete pages get 30% more organic reach' },
            { id: 'contactInfo', name: 'Contact Information', maxScore: 10, benchmark: 'Phone, email, website, address, hours — all filled and current', impactStat: 'Contact-complete pages get 40% more inquiries' },
            { id: 'ctaButton', name: 'CTA Button', maxScore: 10, benchmark: 'Active CTA: Shop Now / Book Now / Send Message / Sign Up', impactStat: 'CTA buttons drive 20% of total page clicks' },
            { id: 'pageCategory', name: 'Page Category & Templates', maxScore: 10, benchmark: 'Correct primary + secondary categories, appropriate page template', impactStat: 'Accurate categorization improves local search ranking' },
            { id: 'reviews', name: 'Reviews & Ratings', maxScore: 10, benchmark: '4.5+ star rating, 20+ reviews, responses to all reviews within 24hrs', impactStat: '92% of consumers read reviews; 4.5+ stars increases conversion by 28%' },
            { id: 'pinnedPost', name: 'Pinned Post', maxScore: 10, benchmark: 'Current offer, top testimonial, or brand intro video pinned', impactStat: 'Pinned posts receive 45% more engagement than regular posts' }
        ]
    },
    twitter: {
        label: 'Twitter / X',
        parameters: [
            { id: 'headerImage', name: 'Header / Banner Image', maxScore: 10, benchmark: '1500×500px, current campaign or value prop, includes brand URL', impactStat: 'Custom headers increase follow-back rate by 18%' },
            { id: 'profilePhoto', name: 'Profile Photo', maxScore: 10, benchmark: '400×400px, consistent with other platforms, recognizable at 48px', impactStat: 'Consistent cross-platform photos increase trust by 20%' },
            { id: 'bio', name: 'Bio (160 chars)', maxScore: 10, benchmark: 'All 160 chars used, includes role, value, 2-3 relevant hashtags, clear personality', impactStat: 'Optimized bios improve follow rate by 30%' },
            { id: 'pinnedTweet', name: 'Pinned Tweet / Post', maxScore: 10, benchmark: 'High-performing post, thread, or CTA — updated monthly', impactStat: 'Pinned tweets get 10x impressions of regular tweets' },
            { id: 'location', name: 'Location', maxScore: 10, benchmark: 'Filled with city/region or "Global" for international brands', impactStat: 'Location-tagged profiles appear in 15% more local searches' },
            { id: 'websiteLink', name: 'Website Link', maxScore: 10, benchmark: 'Active, trackable link (UTM tagged) to landing page or Linktree', impactStat: 'Website links drive 25% of profile-to-site traffic' },
            { id: 'verifiedStatus', name: 'Verified / Premium Status', maxScore: 10, benchmark: 'Blue or gold checkmark active, builds immediate trust', impactStat: 'Verified accounts receive 30% more engagement and 50% more clicks' },
            { id: 'listsCommunities', name: 'Lists & Communities', maxScore: 10, benchmark: 'Active in 3+ communities, curating 2+ public lists', impactStat: 'Community participation boosts reply engagement by 35%' }
        ]
    },
    youtube: {
        label: 'YouTube',
        parameters: [
            { id: 'channelArt', name: 'Channel Banner', maxScore: 10, benchmark: '2560×1440px, includes upload schedule, brand tagline, social links', impactStat: 'Professional banners increase channel subscribe rate by 22%' },
            { id: 'profilePhoto', name: 'Channel Icon', maxScore: 10, benchmark: '800×800px, recognizable at 98px, consistent with other platforms', impactStat: 'Consistent branding increases recognition by 25%' },
            { id: 'channelDescription', name: 'Channel Description', maxScore: 10, benchmark: 'Full 1000 chars, explain what viewer gets, upload schedule, 5+ keywords, social links', impactStat: 'SEO-optimized descriptions boost channel search appearances by 35%' },
            { id: 'playlists', name: 'Playlist Organization', maxScore: 10, benchmark: '5+ themed playlists with keyword-rich titles and descriptions', impactStat: 'Organized playlists increase average session duration by 40%' },
            { id: 'channelTrailer', name: 'Channel Trailer', maxScore: 10, benchmark: '30-60 sec trailer for non-subscribers, highlights best content, clear CTA', impactStat: 'Channel trailers convert 27% more visitors to subscribers' },
            { id: 'linksSection', name: 'Links & Socials', maxScore: 10, benchmark: 'Website + all social profiles linked, primary link prominent', impactStat: 'Links drive 20% of cross-platform traffic' },
            { id: 'aboutTab', name: 'About Tab', maxScore: 10, benchmark: 'Contact email visible, location set, full description, join date proudly shown', impactStat: 'Complete About tabs increase brand inquiry rate by 30%' },
            { id: 'thumbnailBranding', name: 'Thumbnail Branding', maxScore: 10, benchmark: 'Consistent template, bold text, face close-ups, brand colors, 1280×720px', impactStat: 'Branded thumbnails increase CTR by 30-40%' }
        ]
    }
};

router.post('/profile-score', protect, requireStudio('socialMediaStudio'), requireCredits('socialMediaScore'), async (req, res) => {
    try {
        const { platform, profileData, brand } = req.body;
        if (!platform) return res.status(400).json({ success: false, error: 'Platform is required' });

        const rubric = PLATFORM_RUBRICS[platform];
        if (!rubric) return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });

        const brandCtx = buildBrandContext(brand);
        const paramList = rubric.parameters.map((p, i) => `${i + 1}. ${p.name} — Benchmark: ${p.benchmark}`).join('\n');

        const systemPrompt = `You are an expert Social Media Profile Auditor with deep knowledge of ${rubric.label} best practices and algorithm optimization.

BRAND CONTEXT:
${brandCtx}

You will grade this brand's ${rubric.label} profile on EXACTLY these ${rubric.parameters.length} parameters, each scored 0-10:

${paramList}

CRITICAL RULES:
- Score HONESTLY. Do NOT inflate scores. A profile with no data for a parameter gets 0-2.
- For each parameter, provide a SPECIFIC "current" assessment describing what you observe/infer about this brand's profile.
- The "fix" for each parameter MUST be a concrete, ready-to-use suggestion. For text fields (bio, headline, about), generate the ACTUAL improved text using the Brand DNA above.
- Every "impact" must include a SPECIFIC NUMBER (percentage improvement, follower increase, click rate change).
- "quickWins" should be the 3 parameters with the HIGHEST impact-to-effort ratio.

${profileData ? `PROFILE DATA PROVIDED:\n${JSON.stringify(profileData)}` : 'No direct profile data provided. Score based on what a typical account in this industry would look like if newly optimized, and generate ideal content.'}

Respond in STRICT JSON:
{
  "platform": "${platform}",
  "platformLabel": "${rubric.label}",
  "overallScore": 0,
  "maxScore": 100,
  "grade": "A+ / A / B+ / B / C+ / C / D / F",
  "summary": "2-3 sentence assessment of the profile",
  "parameters": [
    {
      "id": "${rubric.parameters[0].id}",
      "name": "${rubric.parameters[0].name}",
      "score": 7,
      "maxScore": 10,
      "status": "good | needs_improvement | weak | missing",
      "current": "What the profile currently has or lacks — be specific",
      "benchmark": "The specific standard to meet",
      "impact": "Specific measurable impact with numbers",
      "fix": "The exact, ready-to-use fix (write the actual headline/bio/description if applicable)"
    }
  ],
  "quickWins": [
    {
      "parameter": "Parameter name",
      "currentScore": 3,
      "potentialScore": 9,
      "effort": "5 minutes",
      "action": "Exact step-by-step action to take",
      "expectedLift": "Specific percentage or metric improvement"
    }
  ],
  "estimatedImpact": {
    "profileViews": "+X%",
    "engagement": "+X%",
    "followerGrowth": "+X%",
    "clickThrough": "+X%"
  },
  "generatedAssets": {
    "headline": "If LinkedIn — the optimized headline text",
    "bio": "If Instagram/Twitter — the optimized bio text",
    "about": "If applicable — the optimized about/summary text"
  }
}`;

        const userPrompt = `Score the ${rubric.label} profile for brand "${brand?.name || 'this brand'}" (Industry: ${brand?.dna?.industry || 'General'}). Grade each of the ${rubric.parameters.length} parameters 0-10 with measurable recommendations.`;

        const result = await aiCall(systemPrompt, userPrompt, { json: true, temperature: 0.5, maxTokens: 6000 });
        const scoreCard = parseJSON(result);

        // Compute true overall score as average of parameter scores
        if (scoreCard.parameters?.length) {
            const totalScore = scoreCard.parameters.reduce((s, p) => s + (p.score || 0), 0);
            const maxTotal = scoreCard.parameters.length * 10;
            scoreCard.overallScore = Math.round((totalScore / maxTotal) * 100);
        }

        const saved = await SocialStrategy.create({
            user: req.user._id,
            brand: brand?._id || req.body.brandId,
            type: 'profile-score',
            title: `${rubric.label} Profile Score — ${scoreCard.overallScore}/100`,
            platforms: [platform],
            data: scoreCard,
            inputs: { platform, profileData },
        });

        res.json({ success: true, scoreCard, scoreId: saved._id });
    } catch (error) {
        console.error('Profile score error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  6. LIST STRATEGIES — Get all saved strategies for a brand
// ════════════════════════════════════════════════════════════════

router.get('/strategies', protect, async (req, res) => {
    try {
        const { brandId, type } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (type) filter.type = type;

        const strategies = await SocialStrategy.find(filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .select('title type platforms timeframe status createdAt data.overallScore data.overview data.summary');

        res.json({ success: true, strategies });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  6. GET STRATEGY — Get a specific saved strategy
// ════════════════════════════════════════════════════════════════

router.get('/strategies/:id', protect, async (req, res) => {
    try {
        const strategy = await SocialStrategy.findOne({ _id: req.params.id, user: req.user._id });
        if (!strategy) return res.status(404).json({ success: false, error: 'Strategy not found' });
        res.json({ success: true, strategy });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ════════════════════════════════════════════════════════════════
//  7. DELETE STRATEGY
// ════════════════════════════════════════════════════════════════

router.delete('/strategies/:id', protect, async (req, res) => {
    try {
        await SocialStrategy.deleteOne({ _id: req.params.id, user: req.user._id });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;
