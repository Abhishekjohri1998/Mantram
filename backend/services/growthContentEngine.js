/**
 * Growth Content Engine — Daily Social Media Content Generator
 * 
 * Generates platform-specific marketing content for Mantram AI using Claude (writing)
 * and Grok (trending topics). Runs via cron at 5:30 AM IST or manually from SuperAdmin.
 */

import GrowthContent from '../models/GrowthContent.js';
import { getAIRouter } from '../ai/router.js';

// ══════════════════════════════════════════════════════════════
// CONTENT BANK — 50+ Mantram AI talking points, stats, angles
// These rotate to prevent repetition. Each entry has an ID for tracking.
// ══════════════════════════════════════════════════════════════

const CONTENT_BANK = [
    // FOUNDER STORY angles
    { id: 0, category: 'founder', angle: 'The D2C founder spending ₹4.5L/month on 6 disconnected tools — the conversation that sparked Mantram AI.' },
    { id: 1, category: 'founder', angle: 'We quit our jobs 18 months ago with zero funding. Two people. One thesis: Indian D2C brands deserve marketing tools built FOR India.' },
    { id: 2, category: 'founder', angle: 'The first 3 months were just the AI text-on-image problem. Every model fills the canvas with giant warped letters. Our 4-agent pipeline solution.' },
    { id: 3, category: 'founder', angle: 'Why we chose to stay model-agnostic from month 3 — starting as "GPT-powered" nearly killed us when Claude and Gemini overtook GPT for specific tasks.' },
    { id: 4, category: 'founder', angle: 'Meta flagging social accounts as bot-like taught us the hard way about anti-mimicry delays and randomized posting windows.' },
    { id: 5, category: 'founder', angle: 'The sleepless night debugging TikTok\'s Content Publishing API — domain ownership verification doesn\'t work with S3 URLs.' },
    { id: 6, category: 'founder', angle: '75 API routes. 71 database models. 66+ frontend pages. 20+ AI models. Built by 2 people. Zero funding. Here\'s what that actually looks like day-to-day.' },
    { id: 7, category: 'founder', angle: 'We over-built massively. 14 studios on day one when 3 would have proven the concept. The lesson: get 10 users at month 6, not month 16.' },
    { id: 8, category: 'founder', angle: 'Building from India, for India. Not localizing a US product — building natively with 9 Indian languages, festival calendar, UPI payments, ₹33 UGC videos.' },
    { id: 9, category: 'founder', angle: 'The moment we realized agencies are the real multiplier — one agency deal = 20 brands onboarded overnight.' },

    // PRODUCT FEATURE angles
    { id: 10, category: 'product', angle: 'Brand DNA: Enter your URL → 90 seconds → AI builds complete brand intelligence (voice, colors, audience, competitors, products). You set it up ONCE. Powers everything forever.' },
    { id: 11, category: 'product', angle: '14 specialized AI studios. Not one chatbot wearing 14 hats — 14 expert "employees" each with their own agent pipeline.' },
    { id: 12, category: 'product', angle: 'Creative Studio: 4-agent pipeline (Art Director → Prompt Engineer → Style Critic → Generator). The Style Critic rejects off-brand output BEFORE you see it.' },
    { id: 13, category: 'product', angle: 'Video Studio: 7 AI models. Veo 3.1 for cinematic. Sora 2 for narrative. Seedance 2.0 for ₹33 UGC clips. Platform auto-picks the best model.' },
    { id: 14, category: 'product', angle: 'AEO (Answer Engine Optimization): We track if ChatGPT, Perplexity, and Google AI Overview CITE your brand. Nobody else does this.' },
    { id: 15, category: 'product', angle: 'Model-agnostic routing: Claude for strategy writing, Gemini for multimodal analysis, GPT Image 2 for visuals. When a better model ships, we integrate that week.' },
    { id: 16, category: 'product', angle: 'Social Media Studio: Direct publishing to IG, FB, TikTok, LinkedIn, X, Pinterest — with anti-mimicry delays so Meta doesn\'t flag your account.' },
    { id: 17, category: 'product', angle: 'Product Intelligence: We don\'t just read product titles. Multimodal vision AI classifies your actual product photos — shape, material, color — so ads never show the wrong product.' },
    { id: 18, category: 'product', angle: 'Amazon→D2C Migration: Import Amazon order data, match products to Shopify, auto-generate "buy direct and save" campaigns with AI visuals.' },
    { id: 19, category: 'product', angle: 'The Canvas Editor: Full Canva-like editor built from scratch. Layers, text, AI generation, export — and every element reads from Brand DNA.' },

    // INDUSTRY INSIGHT angles
    { id: 20, category: 'industry', angle: 'SEO is dying. 70%+ of informational queries are now answered by AI summaries. The question isn\'t "page 1 ranking" — it\'s "is the AI citing your brand?"' },
    { id: 21, category: 'industry', angle: 'The average D2C brand spends $800–$6,000/month on marketing tools. None of them share context. Every tool starts from scratch. This is the real problem.' },
    { id: 22, category: 'industry', angle: 'India has 800,000+ D2C brands on Shopify alone. Growing 40%+ YoY. Every single one needs marketing tools. But tools built FOR India, not localized FROM the US.' },
    { id: 23, category: 'industry', angle: 'The AI wrapper era is over. Users can tell when your product is just a thin layer over ChatGPT. The future is specialized, multi-agent, context-aware systems.' },
    { id: 24, category: 'industry', angle: 'Content agencies charging $500–$5,000 per video ad in a world where AI generates $0.40 UGC clips. The economics are about to collapse.' },
    { id: 25, category: 'industry', angle: 'Brand consistency is a myth for 90% of companies. Instagram sounds different from emails, blogs don\'t match ads. The missing piece: persistent brand intelligence.' },
    { id: 26, category: 'industry', angle: 'Festival-aware marketing in India isn\'t optional — it\'s existential. Diwali, Navratri, Holi, Eid. No US tool knows what Makar Sankranti is. That\'s our moat.' },
    { id: 27, category: 'industry', angle: 'The SaaS + credits business model is beautiful: more content generated = more revenue. Built-in expansion. No seat-based pricing limiting growth.' },
    { id: 28, category: 'industry', angle: 'Multi-language marketing is not Google Translate on top. It\'s Hinglish for Instagram, formal Hindi for blogs, Marathi for customer emails. Same brand, different languages.' },
    { id: 29, category: 'industry', angle: 'Why model-agnosticism is non-negotiable in 2026: the best model changes every 3 months. Lock into one provider and you\'re obsolete by Q3.' },

    // PROBLEM→SOLUTION angles
    { id: 30, category: 'problem', angle: 'Problem: "Every time I open ChatGPT, I re-explain my brand." Solution: Brand DNA. One-time 90-second scan. Every output is on-brand forever.' },
    { id: 31, category: 'problem', angle: 'Problem: "My Instagram sounds nothing like my emails." Solution: Unified Brand DNA that every studio reads from. 500th caption is as on-brand as the 1st.' },
    { id: 32, category: 'problem', angle: 'Problem: "Video ads cost ₹40K–₹4L per video." Solution: 7 AI video models. ₹33/clip for UGC. 50 test creatives for the price of one agency video.' },
    { id: 33, category: 'problem', angle: 'Problem: "I can\'t afford a marketing team." Solution: 14 AI studios = 14 specialized employees. Content, creative, video, SEO, social — one platform.' },
    { id: 34, category: 'problem', angle: 'Problem: "My competitors are getting cited by ChatGPT but I\'m not." Solution: AEO tracking. We probe AI search engines and tell you exactly where you stand.' },
    { id: 35, category: 'problem', angle: 'Problem: "AI-generated images have terrible text placement." Solution: 4-agent creative pipeline with a Style Critic that rejects bad output before you see it.' },

    // STATS & NUMBERS
    { id: 36, category: 'stats', angle: '75 API routes. 71 database models. 66+ frontend pages. 20+ AI models. 14 studios. 2 founders. 0 funding. 18 months.' },
    { id: 37, category: 'stats', angle: '$250/mo replaces $800–$6,000 of disconnected tools. 70%+ cost reduction on day one.' },
    { id: 38, category: 'stats', angle: '9 Indian languages natively (not Google Translate). Hindi, Marathi, Tamil, Telugu, Bengali, Kannada, Malayalam, Gujarati, Punjabi.' },
    { id: 39, category: 'stats', angle: '₹33 per UGC video clip vs ₹40,000–₹4,00,000 from agencies. That\'s 1,200x cheaper.' },
    { id: 40, category: 'stats', angle: '90 seconds to onboard. 14 studios. 20+ AI models. One Brand DNA. Infinite on-brand content.' },

    // VISION & FUTURE
    { id: 41, category: 'vision', angle: 'We\'re building the marketing OS — not another tool. One platform that replaces your entire marketing stack, not adds to it.' },
    { id: 42, category: 'vision', angle: 'The future of search is AI-first. We\'re building for a world where being cited by ChatGPT matters more than Google page 1.' },
    { id: 43, category: 'vision', angle: 'India → Southeast Asia → GCC → Global. Regional first, then expand. Not the other way around.' },
    { id: 44, category: 'vision', angle: 'Every D2C brand will have an AI marketing team within 3 years. The only question is whether they build it themselves or use a platform. We\'re building that platform.' },

    // TECHNICAL DEEP-DIVE
    { id: 45, category: 'technical', angle: 'Our AI router has a circuit breaker: 3 x 503 errors in 2 minutes = trip. Auto-failover to next provider. Users never see "AI unavailable."' },
    { id: 46, category: 'technical', angle: 'Bull queues + Redis for async video generation. PM2 cluster mode for zero-downtime deploys. Not sexy, but it keeps the platform up at 3 AM.' },
    { id: 47, category: 'technical', angle: 'The Brand DNA model is read-only for studios. They consume it, never write back. Immutability prevents context drift. This architectural decision saved us.' },
    { id: 48, category: 'technical', angle: 'Creative Studio prompt chain: 80KB of system prompts powering the multi-agent pipeline. The Art Director alone has a 15KB instruction set.' },
    { id: 49, category: 'technical', angle: 'Video Studio: 6 different API clients (Atlas, Fal, HeyGen, LaoZhang, Muapi, Kie) routing across 7 video models. Each model has strengths — UGC, cinematic, motion, talking head.' },
];

// Day-of-week themes
const DAY_THEMES = {
    monday:    'founder_journey',
    tuesday:   'product_feature',
    wednesday: 'industry_trend',
    thursday:  'problem_solution',
    friday:    'week_recap',
    saturday:  'educational',
    sunday:    'vision_inspiration',
};

// Reddit subreddit rotation
const REDDIT_SUBREDDITS = [
    { name: 'r/Entrepreneur', tone: 'story-driven, value-first, lessons learned' },
    { name: 'r/SaaS', tone: 'technical, product-focused, show your work' },
    { name: 'r/shopify', tone: 'practical, problem-solving, merchant-focused' },
    { name: 'r/digital_marketing', tone: 'educational, tactical, data-driven' },
    { name: 'r/startups', tone: 'vulnerable, honest, raw founder story (NO LINKS allowed)' },
    { name: 'r/IndianStartups', tone: 'community-driven, India-specific, relatable' },
    { name: 'r/artificial', tone: 'technical, forward-looking, AI architecture' },
    { name: 'r/indiebusiness', tone: 'bootstrapped pride, authentic, revenue-focused' },
    { name: 'r/smallbusiness', tone: 'practical, cost-saving, tools-focused' },
    { name: 'r/ecommerce', tone: 'D2C focused, ROI-driven, marketing tools' },
];

/**
 * Get recently used content bank indices (last 14 days) to avoid repetition
 */
async function getRecentlyUsedIndices() {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const recent = await GrowthContent.find(
        { date: { $gte: twoWeeksAgo } },
        { 'metadata.contentBankIndicesUsed': 1 }
    ).lean();

    const used = new Set();
    for (const doc of recent) {
        for (const idx of (doc.metadata?.contentBankIndicesUsed || [])) {
            used.add(idx);
        }
    }
    return used;
}

/**
 * Pick content bank entries, avoiding recently used ones
 */
function pickContentBankEntries(category, count, recentlyUsed) {
    const available = CONTENT_BANK.filter(
        e => e.category === category && !recentlyUsed.has(e.id)
    );
    // If all used recently, reset and pick from full pool
    const pool = available.length >= count ? available : CONTENT_BANK.filter(e => e.category === category);
    // Shuffle and pick
    const shuffled = pool.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

/**
 * Fetch trending topics using Grok (xAI) for real-time awareness
 */
async function fetchTrendingTopics() {
    try {
        const router = getAIRouter();
        const xai = router.providers.xai;
        if (!xai || !xai.isAvailable()) {
            console.log('📊 Grok not available, skipping trend fetch');
            return [];
        }

        const result = await xai.generateText({
            systemPrompt: `You are a trend analyst. Return ONLY a JSON array of 5-8 currently trending topics relevant to: D2C brands, AI marketing, Indian startups, social media marketing, content creation, e-commerce. Focus on what's trending TODAY on Twitter/X, LinkedIn, and Reddit. Each entry should be a short phrase (3-7 words). Return raw JSON array, no markdown.`,
            userPrompt: `What are today's trending topics in AI, marketing, D2C, startups, and social media? Return as JSON array of strings.`,
            temperature: 0.7,
            maxTokens: 500,
        });

        try {
            const cleaned = result.text.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            // Try to extract array from text
            const match = result.text.match(/\[[\s\S]*?\]/);
            return match ? JSON.parse(match[0]) : [];
        }
    } catch (err) {
        console.warn('⚠️ Trend fetch failed:', err.message);
        return [];
    }
}

/**
 * Build the master prompt for content generation
 */
function buildGenerationPrompt(dayOfWeek, theme, contentAngles, trendingTopics, subreddits) {
    const trendSection = trendingTopics.length > 0
        ? `\n\nTRENDING TOPICS TODAY (weave 1-2 of these into your content naturally if relevant):\n${trendingTopics.map(t => `- ${t}`).join('\n')}`
        : '';

    return `You are a growth marketing content writer for Mantram AI — an AI marketing operating system for D2C brands.

ABOUT MANTRAM AI (use this context in all content):
- AI marketing OS that replaces Canva + Jasper + SEMrush + Buffer + Klaviyo + video agencies
- Core concept: "Brand DNA" — enter website URL, 90 seconds, AI builds living brand intelligence
- 14 specialized AI studios (Content, Creative, Video, SEO/AEO, Social, Performance Marketing, Retention, Funnels, Brainstorm, YouTube, Avatar, Virality Predictor, Research, Brand)
- Model-agnostic: Claude for writing, Gemini for analysis, GPT Image 2 for visuals, Veo 3.1/Sora 2/Seedance for video
- UGC video ads at ₹33/clip ($0.40) vs ₹40K-₹4L from agencies
- AEO tracking: monitors if ChatGPT, Perplexity, Google AI cite your brand
- 9 Indian languages natively, festival-aware content calendar
- Built by 2 co-founders (Abhishek & Sachin), zero funding, 18 months
- 75 API routes, 71 database models, 66+ frontend pages, 20+ AI models
- Pricing: $250/$599/$1,499 per month (SaaS + credits)
- Target: D2C brands doing $36K-$600K ARR, 5-50 person teams

TODAY'S THEME: ${theme} (${dayOfWeek})

CONTENT ANGLES TO USE (pick from these, expand creatively):
${contentAngles.map(a => `- ${a.angle}`).join('\n')}
${trendSection}

CRITICAL WRITING RULES:
1. NEVER sound like AI. Use contractions, varied sentence lengths, occasional incomplete thoughts.
2. Be specific with numbers, names, and examples. Vague = AI-sounding.
3. Each platform has a DIFFERENT voice:
   - LinkedIn: Professional but personal. Story-driven. One sentence per paragraph. Use → arrows.
   - Instagram: Visual-first. Emoji-rich but not overdone. Punchy captions.
   - Twitter: Sharp. Punchy. Under 280 chars per tweet. Thread tweets should build momentum.
   - Reddit: RAW and authentic. No marketing speak. Lead with problem 70%, product 30%. NO LINKS in body for r/startups.
4. Include specific prices in INR (₹) and USD ($) where relevant.
5. Never say "game-changer", "revolutionary", "cutting-edge", or "leverage". These are AI tells.
6. End LinkedIn posts with a question to drive comments.
7. Reddit posts should sound like a founder talking to peers, not a press release.
8. Instagram story scripts must be actionable — describe exact visuals, text overlays, and stickers.

REDDIT SUBREDDITS FOR TODAY:
${subreddits.map(s => `- ${s.name}: Tone = ${s.tone}`).join('\n')}

Generate content for ALL platforms. Return as a single JSON object with this EXACT structure:

{
  "linkedin": [
    {
      "type": "founder_story",
      "content": "Full post text here (500-1500 chars). One sentence per paragraph. Use → for bullets.",
      "hashtags": ["#D2C", "#AIMarketing", "#BuildingInPublic"],
      "bestTime": "8:30 AM IST"
    },
    {
      "type": "product_insight",
      "content": "Full post text here. Different angle from the first.",
      "hashtags": ["#SaaS", "#MarketingTools"],
      "bestTime": "12:00 PM IST"
    }
  ],
  "instagram": {
    "post": {
      "caption": "Full caption text (max 2200 chars). Include CTA.",
      "hashtags": ["#mantram", "#aimarketing", "#d2c"],
      "slides": [
        {"slideNumber": 1, "text": "Hook text for slide 1", "visualDescription": "Describe what the visual should show"},
        {"slideNumber": 2, "text": "Text for slide 2", "visualDescription": "Visual description"}
      ],
      "bestTime": "11:00 AM IST"
    },
    "story": {
      "slides": [
        {"slideNumber": 1, "type": "text", "text": "Story opening hook", "visualDescription": "Background visual", "ctaText": "", "stickerSuggestion": ""},
        {"slideNumber": 2, "type": "image", "text": "Text overlay", "visualDescription": "What to show", "ctaText": "Swipe up", "stickerSuggestion": "poll or question sticker"}
      ]
    }
  },
  "twitter": [
    {
      "type": "standalone",
      "tweets": ["Single tweet text under 280 chars. Punchy and shareable."],
      "bestTime": "8:30 AM IST"
    },
    {
      "type": "thread",
      "tweets": [
        "Thread opener — hook that makes people click 🧵👇",
        "Tweet 2 — expand on the hook with specifics",
        "Tweet 3 — the insight or data point",
        "Tweet 4 — CTA or question"
      ],
      "bestTime": "6:00 PM IST"
    }
  ],
  "reddit": [
    {
      "subreddit": "${subreddits[0]?.name || 'r/Entrepreneur'}",
      "title": "Post title — specific, not clickbait",
      "body": "Full post body. 500-2000 chars. Raw, authentic tone. NO LINKS if subreddit is r/startups. End with a question.",
      "tone": "${subreddits[0]?.tone || 'story-driven'}",
      "bestTime": "9:00 AM EST"
    },
    {
      "subreddit": "${subreddits[1]?.name || 'r/SaaS'}",
      "title": "Different angle post title",
      "body": "Full post body. Different angle from the first.",
      "tone": "${subreddits[1]?.tone || 'technical'}",
      "bestTime": "10:00 AM EST"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown code fences. No explanation. Just the raw JSON.`;
}


/**
 * Generate daily content for all platforms
 */
export async function generateDailyContent(forceDate = null) {
    const now = forceDate ? new Date(forceDate) : new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[now.getDay()];
    const theme = DAY_THEMES[dayOfWeek] || 'founder_journey';

    console.log(`\n🚀 [GrowthEngine] Generating daily content for ${dateKey} (${dayOfWeek}) — Theme: ${theme}`);

    // Check if already generated today
    const existing = await GrowthContent.findOne({ dateKey });
    if (existing) {
        console.log(`⚠️ [GrowthEngine] Content already exists for ${dateKey}. Use regenerate to replace.`);
        return existing;
    }

    try {
        // 1. Get trending topics via Grok
        console.log('📊 [GrowthEngine] Fetching trending topics via Grok...');
        const trendingTopics = await fetchTrendingTopics();
        console.log(`📊 [GrowthEngine] Got ${trendingTopics.length} trending topics`);

        // 2. Pick content angles from bank (avoid recently used)
        const recentlyUsed = await getRecentlyUsedIndices();
        const themeToCategory = {
            founder_journey: 'founder',
            product_feature: 'product',
            industry_trend: 'industry',
            problem_solution: 'problem',
            week_recap: 'stats',
            educational: 'technical',
            vision_inspiration: 'vision',
        };
        const primaryCategory = themeToCategory[theme] || 'founder';
        const primaryAngles = pickContentBankEntries(primaryCategory, 3, recentlyUsed);
        const secondaryAngles = pickContentBankEntries(
            primaryCategory === 'product' ? 'founder' : 'product', 2, recentlyUsed
        );
        const allAngles = [...primaryAngles, ...secondaryAngles];

        // 3. Pick 2 subreddits (rotate daily)
        const dayIndex = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
        const sub1 = REDDIT_SUBREDDITS[dayIndex % REDDIT_SUBREDDITS.length];
        const sub2 = REDDIT_SUBREDDITS[(dayIndex + 1) % REDDIT_SUBREDDITS.length];

        // 4. Generate content via Claude (Anthropic)
        console.log('✍️ [GrowthEngine] Generating content via Claude...');
        const router = getAIRouter();
        const prompt = buildGenerationPrompt(dayOfWeek, theme, allAngles, trendingTopics, [sub1, sub2]);

        const result = await router.generateText(
            {
                systemPrompt: prompt,
                userPrompt: `Generate today's growth marketing content for Mantram AI. Today is ${dayOfWeek}, ${dateKey}. Theme: ${theme}. Return the JSON object.`,
                temperature: 0.85,
                maxTokens: 8000,
                model: 'claude-sonnet-4-6',
            },
            { provider: 'anthropic' }
        );

        // 5. Parse the JSON response
        let content;
        try {
            const cleaned = result.text
                .replace(/```json\n?|\n?```/g, '')
                .replace(/```\n?/g, '')
                .trim();
            content = JSON.parse(cleaned);
        } catch (parseErr) {
            // Try to extract JSON from the response
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                content = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error(`Failed to parse AI response: ${parseErr.message}`);
            }
        }

        // 6. Save to database
        const growthContent = await GrowthContent.create({
            date: now,
            dateKey,
            dayOfWeek,
            theme,
            status: 'generated',

            linkedin: (content.linkedin || []).map(p => ({
                type: p.type || 'general',
                content: p.content,
                hashtags: p.hashtags || [],
                bestTime: p.bestTime || '8:30 AM IST',
                posted: false,
            })),

            instagram: {
                post: {
                    caption: content.instagram?.post?.caption || '',
                    hashtags: content.instagram?.post?.hashtags || [],
                    slides: (content.instagram?.post?.slides || []).map(s => ({
                        slideNumber: s.slideNumber,
                        text: s.text,
                        visualDescription: s.visualDescription,
                    })),
                    bestTime: content.instagram?.post?.bestTime || '11:00 AM IST',
                    posted: false,
                },
                story: {
                    slides: (content.instagram?.story?.slides || []).map(s => ({
                        slideNumber: s.slideNumber,
                        type: s.type || 'text',
                        text: s.text,
                        visualDescription: s.visualDescription,
                        ctaText: s.ctaText || '',
                        stickerSuggestion: s.stickerSuggestion || '',
                    })),
                    posted: false,
                },
            },

            twitter: (content.twitter || []).map(t => ({
                type: t.type || 'standalone',
                tweets: t.tweets || [],
                bestTime: t.bestTime || '8:30 AM IST',
                posted: false,
            })),

            reddit: (content.reddit || []).map(r => ({
                subreddit: r.subreddit,
                title: r.title,
                body: r.body,
                tone: r.tone || 'authentic',
                bestTime: r.bestTime || '9:00 AM EST',
                posted: false,
            })),

            metadata: {
                generatedAt: new Date(),
                model: 'claude-sonnet-4-6 + grok-3',
                tokensUsed: result.tokensUsed || 0,
                trendingTopics,
                contentBankIndicesUsed: allAngles.map(a => a.id),
            },
        });

        console.log(`✅ [GrowthEngine] Content generated and saved for ${dateKey}`);
        return growthContent;

    } catch (err) {
        console.error(`❌ [GrowthEngine] Generation failed for ${dateKey}:`, err.message);
        throw err;
    }
}


/**
 * Regenerate a specific platform's content for a given day
 */
export async function regeneratePlatformContent(contentId, platform, index = 0) {
    const existing = await GrowthContent.findById(contentId);
    if (!existing) throw new Error('Content not found');

    const router = getAIRouter();
    const platformPrompts = {
        linkedin: `Generate ONE LinkedIn post for Mantram AI. Theme: ${existing.theme}. Type: ${index === 0 ? 'founder story' : 'product insight'}. Professional, story-driven, one sentence per paragraph. Return JSON: {"content": "...", "hashtags": [...], "bestTime": "..."}`,
        twitter: `Generate ONE ${index === 0 ? 'standalone tweet (under 280 chars)' : 'Twitter thread (4-5 tweets)'} for Mantram AI. Theme: ${existing.theme}. Punchy, shareable. Return JSON: {"type": "${index === 0 ? 'standalone' : 'thread'}", "tweets": [...], "bestTime": "..."}`,
        reddit: `Generate ONE Reddit post for ${existing.reddit?.[index]?.subreddit || 'r/Entrepreneur'}. Theme: ${existing.theme}. Raw, authentic, NO marketing speak, NO links. Return JSON: {"subreddit": "...", "title": "...", "body": "...", "tone": "...", "bestTime": "..."}`,
        instagram_post: `Generate ONE Instagram carousel post for Mantram AI. Theme: ${existing.theme}. Include caption, hashtags, and 5-7 slide descriptions. Return JSON: {"caption": "...", "hashtags": [...], "slides": [...], "bestTime": "..."}`,
        instagram_story: `Generate ONE Instagram Story script for Mantram AI (5-6 slides). Theme: ${existing.theme}. Include visual descriptions, text overlays, and sticker suggestions. Return JSON: {"slides": [{"slideNumber": 1, "type": "text", "text": "...", "visualDescription": "...", "ctaText": "...", "stickerSuggestion": "..."}]}`,
    };

    const systemPrompt = `You are a growth content writer for Mantram AI (AI marketing OS, 14 studios, Brand DNA, 20+ AI models, built by 2 people). Write naturally — no AI tells. Return ONLY raw JSON.`;
    const userPrompt = platformPrompts[platform];
    if (!userPrompt) throw new Error(`Unknown platform: ${platform}`);

    const result = await router.generateText(
        { systemPrompt, userPrompt, temperature: 0.85, maxTokens: 3000, model: 'claude-sonnet-4-6' },
        { provider: 'anthropic' }
    );

    let parsed;
    try {
        const cleaned = result.text.replace(/```json\n?|\n?```/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleaned);
    } catch {
        const match = result.text.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : null;
    }
    if (!parsed) throw new Error('Failed to parse regenerated content');

    // Update the specific post
    if (platform === 'linkedin' && existing.linkedin[index]) {
        existing.linkedin[index].content = parsed.content;
        existing.linkedin[index].hashtags = parsed.hashtags || [];
        existing.linkedin[index].bestTime = parsed.bestTime || '8:30 AM IST';
        existing.linkedin[index].posted = false;
    } else if (platform === 'twitter' && existing.twitter[index]) {
        existing.twitter[index].tweets = parsed.tweets || [];
        existing.twitter[index].bestTime = parsed.bestTime || '8:30 AM IST';
        existing.twitter[index].posted = false;
    } else if (platform === 'reddit' && existing.reddit[index]) {
        existing.reddit[index].title = parsed.title;
        existing.reddit[index].body = parsed.body;
        existing.reddit[index].tone = parsed.tone;
        existing.reddit[index].posted = false;
    } else if (platform === 'instagram_post') {
        existing.instagram.post.caption = parsed.caption;
        existing.instagram.post.hashtags = parsed.hashtags || [];
        existing.instagram.post.slides = parsed.slides || [];
        existing.instagram.post.posted = false;
    } else if (platform === 'instagram_story') {
        existing.instagram.story.slides = parsed.slides || [];
        existing.instagram.story.posted = false;
    }

    await existing.save();
    return existing;
}
