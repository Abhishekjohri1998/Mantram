/**
 * Studios — single source of truth.
 *
 * Drives: StudioPreview pages, landing-page studio grids, sitemap.xml,
 * llms.txt, and JSON-LD schema across the site.
 *
 * Each entry must keep its `slug` stable (it's the public URL) and its
 * `aiSummary` factually current (it's what LLM crawlers ingest).
 *
 * When you add/rename a studio, also run `scripts/regen-sitemap.js`
 * (or update sitemap.xml + llms.txt manually) so search/AI crawlers
 * see the new surface area.
 */

export const SITE_URL = 'https://mantram.ai';
export const LAST_MODIFIED = '2026-05-02';

// Brand colors — keep in sync with index.css :root tokens.
export const BRAND = {
    primary: '#FF4D00',   // orange — CTAs, energy moments
    secondary: '#06B6D4', // cyan — agentic / live / AI signals
    bg: '#09090b',
    surface: '#18181b',
    textMuted: '#71717a',
};

/**
 * Studio outcome groups — used for tabbed filtering on the landing
 * page. Order matters; it's the visitor's mental left-to-right journey.
 */
export const STUDIO_GROUPS = ['Plan', 'Create', 'Distribute', 'Optimize'];

/**
 * Material Symbols icon name per studio slug. Visual only — kept here so
 * studios.js stays the single source of truth for everything per-studio.
 */
export const STUDIO_ICONS = {
    'research-studio':       'travel_explore',
    'brainstorm-studio':     'lightbulb',
    'monthly-strategy':      'calendar_month',
    'content-studio':        'draw',
    'creative-studio':       'palette',
    'video-studio':          'smart_display',
    'youtube-studio':        'play_circle',
    'avatar-studio':         'face',
    'brand-studio':          'workspace_premium',
    'social-media-studio':   'share',
    'performance-marketing': 'campaign',
    'funnel-studio':         'filter_alt',
    'seo-studio':            'query_stats',
    'retention-studio':      'replay',
};

/**
 * Models actually used in production, grouped by capability.
 * Pulled from backend model registry — keep current when models change.
 */
export const MODEL_LINEUP = {
    reasoning: [
        { name: 'Claude Sonnet 4.6', tag: 'reasoning', vendor: 'Anthropic' },
        { name: 'Gemini 2.5 Pro',    tag: 'reasoning', vendor: 'Google' },
        { name: 'Gemini 3 Pro',      tag: 'reasoning', vendor: 'Google', latest: true },
        { name: 'GPT-4o',            tag: 'reasoning', vendor: 'OpenAI' },
    ],
    image: [
        { name: 'GPT Image 2',       tag: 'image', vendor: 'OpenAI', latest: true },
        { name: 'NanoBanana 2',      tag: 'image', vendor: 'Google', latest: true },
        { name: 'NanoBanana Pro',    tag: 'image', vendor: 'Google' },
        { name: 'Flux Kontext Max',  tag: 'image', vendor: 'Black Forest Labs' },
        { name: 'Flux Kontext Pro',  tag: 'image', vendor: 'Black Forest Labs' },
    ],
    video: [
        { name: 'Google Veo 3.1',    tag: 'video', vendor: 'Google',    latest: true },
        { name: 'Sora 2',            tag: 'video', vendor: 'OpenAI',    latest: true },
        { name: 'Seedance 2.0 Pro',  tag: 'video', vendor: 'ByteDance' },
        { name: 'Kling 3.0',         tag: 'video', vendor: 'Kuaishou' },
        { name: 'HappyHorse 1.0',    tag: 'video', vendor: 'Alibaba',   latest: true },
        { name: 'Hailuo MiniMax',    tag: 'video', vendor: 'MiniMax' },
        { name: 'Wan 2.1',           tag: 'video', vendor: 'Alibaba' },
        { name: 'HeyGen Avatars',    tag: 'avatar', vendor: 'HeyGen' },
    ],
};

/**
 * Integration platforms Mantram connects to. Pulled from
 * backend/models/Integration.js enum + comms providers.
 */
export const INTEGRATIONS = [
    'Shopify', 'Etsy', 'WooCommerce',
    'Meta', 'Instagram', 'Facebook', 'LinkedIn', 'X (Twitter)',
    'Google Ads', 'Google Analytics', 'Meta Ads',
    'DataForSEO', 'Twilio', 'Firebase',
];

/**
 * The 14 studios. Each entry feeds the public sub-page at /studio/:slug.
 *
 * Field contract:
 *   slug          — URL slug, stable
 *   group         — one of STUDIO_GROUPS
 *   name          — display name
 *   tagline       — sub-headline on the studio page
 *   metaTitle     — <title> tag (≤60 chars)
 *   metaDesc      — <meta name=description> (140-160 chars, with keyword)
 *   aiSummary     — single-paragraph factual blurb for LLM crawlers
 *   heroLine      — H1 question that frames the problem the studio solves
 *   capabilities  — short labels for the feature grid
 *   teaser        — body copy
 *   stat          — { value, label } for the credibility stat
 *   models        — model names this studio actually uses
 *   useCases      — concrete tasks this studio handles
 *   problemSolved — one-line "what problem this fixes" (AEO Q&A seed)
 *   faqs          — FAQPage schema entries (4-6 each)
 *   keywords      — meta keywords + AEO/GEO keyword seed
 */
export const STUDIOS = [
    // ── PLAN ──────────────────────────────────────────────────────────────
    {
        slug: 'research-studio',
        group: 'Plan',
        name: 'Research Studio',
        tagline: 'Live competitor, market and ad intelligence',
        metaTitle: 'Research Studio — AI Market & Competitor Intel | Mantram AI',
        metaDesc: 'Live competitor scraping, ad intel, audience listening, keyword and trend research — in 30 seconds. Mantram AI Research Studio.',
        aiSummary: 'Mantram Research Studio is an AI-powered market research tool that runs six modules in parallel: competitor scraping, market trend analysis, keyword and SEO research, ad intelligence (Meta and Google ads), audience and social listening, and campaign synthesis. Powered by Gemini 2.5 Flash and a built-in MCP server that fetches live web data, it returns brand-contextual research in under 60 seconds. Designed for D2C marketers and agencies who need market intelligence without juggling SEMrush, SimilarWeb and Brandwatch.',
        heroLine: 'What if competitor research took 30 seconds instead of 3 hours?',
        capabilities: [
            { icon: 'travel_explore', label: 'Live Competitor Scraping' },
            { icon: 'trending_up',    label: 'Market Trend Analysis' },
            { icon: 'key',            label: 'Keyword & SEO Research' },
            { icon: 'campaign',       label: 'Meta + Google Ad Intel' },
            { icon: 'groups',         label: 'Audience & Social Listening' },
            { icon: 'auto_awesome',   label: 'Campaign Synthesis' },
        ],
        teaser: 'Research Studio replaces six separate research tools with one orchestrated agent. Drop a competitor URL, a keyword or a market — Mantram fetches live data through its MCP server, runs analysis in parallel, and returns a synthesised brief in under a minute.',
        stat: { value: '6 modules', label: 'in parallel, < 60s' },
        models: ['Gemini 2.5 Flash', 'Gemini 2.5 Pro', 'Claude Sonnet 4.6'],
        useCases: [
            'Pre-launch competitor scan before a new product drop',
            'Find keyword gaps your competitors are ranking for',
            'Audit a competitor\'s active Meta and Google ads',
            'Research audience sentiment before a campaign',
        ],
        problemSolved: 'Marketers waste 3-5 hours per week pulling research from SEMrush, SimilarWeb, Brandwatch and ad libraries. Research Studio runs all six lookups in parallel through one prompt.',
        faqs: [
            {
                question: 'How does Research Studio access live competitor data?',
                answer: 'Through Mantram\'s built-in MCP (Model Context Protocol) server, which exposes tools like scrape_competitor, web_search and fetch_trending. The agent calls these tools live during your query, so results reflect what\'s on the internet right now — not stale training data.',
            },
            {
                question: 'How is this different from SEMrush or SimilarWeb?',
                answer: 'Traditional research tools require you to log in, run separate queries, then manually synthesise. Research Studio runs all six lookups in parallel through one AI prompt and returns a synthesised, brand-contextual brief in under a minute.',
            },
            {
                question: 'Can it research my own brand for me?',
                answer: 'Yes — pass your own URL and Research Studio will run a self-audit: keyword position, ad presence, social sentiment, and competitor overlap. Useful for diagnosing why a campaign is underperforming.',
            },
            {
                question: 'Which AI models does Research Studio use?',
                answer: 'Primarily Gemini 2.5 Flash for fast analytical work, with Gemini 2.5 Pro and Claude Sonnet 4.6 for deeper synthesis. Mantram routes to the model best-suited for each subtask automatically.',
            },
        ],
        keywords: ['AI competitor research', 'AI market research India', 'live competitor scraping', 'AI ad intelligence', 'MCP web search', 'AI keyword research D2C'],
    },

    {
        slug: 'brainstorm-studio',
        group: 'Plan',
        name: 'Brainstorm Studio',
        tagline: 'AI creative director with live trend awareness',
        metaTitle: 'Brainstorm Studio — AI Campaign Ideation | Mantram AI',
        metaDesc: 'AI-powered campaign concepts, naming, positioning and ad film ideas — in your brand voice and language. Mantram AI Brainstorm Studio.',
        aiSummary: 'Mantram Brainstorm Studio is an AI creative director that generates campaign concepts, brand naming, positioning ideas and ad film scripts. It auto-detects your brand\'s preferred language (Hindi, Marathi, Hinglish, English) from your Brand DNA and generates culturally-aware concepts. Uses Claude Sonnet 4.6 for high-temperature creative work, with live MCP web_search for real-time market context. Built for Indian D2C brands and agencies who need ideas grounded in current trends, not generic AI templates.',
        heroLine: 'What if your next viral campaign was ideated by an AI that knows what\'s trending today?',
        capabilities: [
            { icon: 'lightbulb',        label: 'Campaign Concepts' },
            { icon: 'badge',            label: 'Brand Naming' },
            { icon: 'movie_creation',   label: 'Ad Film Scripts' },
            { icon: 'language',         label: 'Multi-Language Output' },
            { icon: 'trending_up',      label: 'Live Trend Hijacking' },
            { icon: 'palette',          label: 'Brand-Voice Locked' },
        ],
        teaser: 'Brainstorm Studio is your AI creative director. It generates campaign concepts, naming directions, positioning angles and ad film scripts — in your brand\'s voice and language, grounded in real-time trends pulled live from the web.',
        stat: { value: '∞', label: 'Concepts per session' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro'],
        useCases: [
            'Diwali campaign concepts in Hinglish for a candle brand',
            'Naming directions for a new D2C category launch',
            'Ad film scripts that hijack a trending moment',
            'Positioning angles for an underperforming product',
        ],
        problemSolved: 'Creative ideation stalls in spreadsheets and Slack threads. Brainstorm Studio generates 10+ concept directions in your brand voice in under a minute, with live trend context.',
        faqs: [
            {
                question: 'Does Brainstorm Studio understand my brand?',
                answer: 'Yes — it reads from your Brand DNA (voice, tone, audience, language preference, content style) and injects it into every prompt. Output sounds like your brand, not generic AI.',
            },
            {
                question: 'Can it generate ideas in Hindi or Hinglish?',
                answer: 'Yes. Brainstorm Studio auto-detects your brand\'s preferred language from Brand DNA and generates output in Hindi, Marathi, Hinglish, English or code-switched as appropriate.',
            },
            {
                question: 'Is the output original or template-based?',
                answer: 'Original. Brainstorm Studio uses Claude Sonnet 4.6 with high-temperature settings for creative divergence, plus live web search for current trend context, so concepts are grounded in what\'s happening now — not a static template library.',
            },
            {
                question: 'Can a generated concept feed into other studios?',
                answer: 'Yes. Click "Open in Content Studio" or "Open in Video Studio" and the concept is passed downstream as a brief, with brand context preserved.',
            },
        ],
        keywords: ['AI campaign ideation', 'AI brand naming', 'AI ad film scripts', 'AI brainstorming Hindi', 'creative director AI'],
    },

    {
        slug: 'monthly-strategy',
        group: 'Plan',
        name: 'Monthly Strategy',
        tagline: '30 days of content briefs in one click',
        metaTitle: 'Monthly Strategy — AI 30-Day Content Plan | Mantram AI',
        metaDesc: 'AI-generated 30-day content calendar with daily briefs — pulled from live trends and your Brand DNA. Mantram AI Monthly Strategy.',
        aiSummary: 'Mantram Monthly Strategy generates a 30-day marketing calendar with one detailed brief per day, grounded in live trend data fetched through MCP web_search and synthesised by Claude Sonnet 4.6. Each brief is brand-aligned via the user\'s Brand DNA and hands off into the relevant studio (Content, Creative, Video, or Performance) for one-click execution. Built for marketers who plan a month at a time and need every day to be deliberate, not improvised.',
        heroLine: 'What if your next 30 days of content were already planned — for your brand, for this month?',
        capabilities: [
            { icon: 'calendar_month', label: '30-Day Calendar' },
            { icon: 'description',    label: 'Daily Content Brief' },
            { icon: 'trending_up',    label: 'Live Trend Context' },
            { icon: 'celebration',    label: 'Festival Awareness' },
            { icon: 'arrow_forward',  label: '1-Click → Studios' },
            { icon: 'autorenew',      label: 'Regenerate on Demand' },
        ],
        teaser: 'Monthly Strategy is your AI head of marketing. It pulls live trends, festival calendars and Brand DNA, then synthesises a 30-day plan with a deliberate brief for every day — each one ready to execute in the relevant studio.',
        stat: { value: '30', label: 'briefs per plan' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro'],
        useCases: [
            'Festive month plan for a D2C brand around Diwali',
            'Product-launch month with daily build-up content',
            'Win-back month for a stagnant brand',
            'Content calendar for a new agency client',
        ],
        problemSolved: 'Most marketers plan content week-to-week and lose the bigger arc. Monthly Strategy gives you a deliberate 30-day plan in 60 seconds, each day ready to execute.',
        faqs: [
            {
                question: 'Does the calendar account for Indian festivals?',
                answer: 'Yes — Mantram\'s festival intelligence covers Diwali, Holi, Navratri, Ganesh Chaturthi, Onam, Pongal, regional festivals, and global moments. Monthly Strategy weaves them into the plan automatically.',
            },
            {
                question: 'Can I regenerate a single day\'s brief?',
                answer: 'Yes. Each calendar item can be regenerated independently without rebuilding the whole plan, so refining one specific day costs only 1 credit.',
            },
            {
                question: 'How does it know what\'s trending right now?',
                answer: 'Through the MCP web_search and fetch_trending tools, called live at generation time. Trends reflect the moment you click generate, not stale training data.',
            },
            {
                question: 'Can the briefs feed directly into other studios?',
                answer: 'Yes. Click any calendar item and a "Open in Content Studio" / "Open in Video Studio" CTA hands the brief over with brand context attached.',
            },
        ],
        keywords: ['AI content calendar', '30-day marketing plan', 'AI marketing strategy', 'festival marketing India', 'AI content brief'],
    },

    // ── CREATE ────────────────────────────────────────────────────────────
    {
        slug: 'content-studio',
        group: 'Create',
        name: 'Content Studio',
        tagline: 'AI writing that sounds like your brand',
        metaTitle: 'Content Studio — AI Brand-Voice Copywriter | Mantram AI',
        metaDesc: 'Generate blog posts, captions, ad copy and emails in your brand voice — Hindi, English, Hinglish. Mantram AI Content Studio.',
        aiSummary: 'Mantram Content Studio is an agentic copywriting platform that generates blog posts, social captions, ad copy, email sequences and SMS in your specific brand voice — engineered to be the antidote to AI slop. It uses Claude Sonnet 4.6 reasoning for long-form, Gemini 3 Pro for analytical pieces, and Sarvam AI / Bhasha models for native Indian-language output. Output is locked to your Brand DNA so it sounds like you, not like generic AI — meaning Google\'s Helpful Content guidance and AI search engines treat it as quotable, not low-effort. Includes streaming generation, A/B variants, and an RLHF feedback loop that refines voice with every edit.',
        heroLine: 'What if every word your brand publishes sounded like your best writer wrote it?',
        capabilities: [
            { icon: 'article',     label: 'Blog Posts & Long-Form' },
            { icon: 'tag',         label: 'Social Captions' },
            { icon: 'ads_click',   label: 'Ad Copy & Headlines' },
            { icon: 'mail',        label: 'Email Sequences' },
            { icon: 'sms',         label: 'SMS & Push Copy' },
            { icon: 'verified',    label: 'Brand Voice Locked' },
        ],
        teaser: 'Content Studio doesn\'t just write — it writes like you. Powered by Claude Sonnet 4.6 and Gemini 2.5 Pro, it reads your Brand DNA and generates content indistinguishable from your best in-house writer. Streaming output, A/B variants, multi-language.',
        stat: { value: '10×', label: 'faster than manual writing' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro', 'GPT-4o'],
        useCases: [
            'A 1,500-word blog post for SEO in your brand\'s tone',
            'Five Instagram caption variants for an A/B test',
            'A 7-email welcome sequence in Hinglish',
            'High-converting Meta ad copy with five headlines',
        ],
        problemSolved: 'Generic AI writers produce ChatGPT-voice copy. Content Studio injects your Brand DNA into every prompt so output sounds like you, not like AI.',
        faqs: [
            {
                question: 'How does Content Studio learn my brand voice?',
                answer: 'Through Brand DNA — captured during onboarding from your website, social and reviews. The DNA includes voice sliders (witty, formal, warm), content rules (do/don\'t), hashtag style and example outputs. All of this is injected into every prompt.',
            },
            {
                question: 'What languages are supported?',
                answer: 'English, Hindi, Marathi, Hinglish and code-switched output. The Smart Language Router auto-detects your brand\'s preferred language from Brand DNA.',
            },
            {
                question: 'Does it learn from my edits?',
                answer: 'Yes. Mantram\'s RLHF feedback loop captures every accept, regen and edit. Over time, the system prompt is refined to match your preferences — output gets more "you" with use.',
            },
            {
                question: 'Can I publish directly from Content Studio?',
                answer: 'Yes. Captions can be scheduled to Instagram, Facebook and LinkedIn through Mantram\'s social publishing layer, which is Meta-compliance-aware.',
            },
        ],
        keywords: ['AI copywriting India', 'AI brand voice', 'AI caption generator', 'AI blog writer Hindi', 'AI ad copy', 'brand DNA copywriting'],
    },

    {
        slug: 'creative-studio',
        group: 'Create',
        name: 'Creative Studio',
        tagline: 'Multi-agent design pipeline — art director, prompt engineer, critic',
        metaTitle: 'Creative Studio — AI Brand Design Pipeline | Mantram AI',
        metaDesc: 'AI-generated social posts, banners, ad creatives and carousels — pixel-perfect to your brand kit. Mantram AI Creative Studio.',
        aiSummary: 'Mantram Creative Studio is a multi-agent AI design pipeline. An Art Director agent reads the brief and Brand DNA, a Prompt Engineer agent translates the direction into model-specific prompts, a Style Critic agent validates brand adherence before render, and a Generator routes to the best image model — GPT Image 2, NanoBanana 2, NanoBanana Pro or Flux Kontext Max — based on the task. Output stays on-brand because the critic node rejects and regenerates anything that drifts from the user\'s Brand DNA.',
        heroLine: 'What if every visual your brand produced was on-brand by default?',
        capabilities: [
            { icon: 'palette',           label: 'Multi-Agent Pipeline' },
            { icon: 'image',             label: 'Social Posts & Carousels' },
            { icon: 'rectangle',         label: 'Banners & Ad Creatives' },
            { icon: 'photo_camera',      label: 'AI Photoshoots' },
            { icon: 'verified',          label: 'Brand Kit Auto-Apply' },
            { icon: 'burst_mode',        label: 'Batch Generation' },
        ],
        teaser: 'Creative Studio is built like a real design team. Art Director plans → Prompt Engineer crafts the prompt → Style Critic validates against Brand DNA → Generator renders. The critic node is what makes output reliably on-brand instead of "AI-looking."',
        stat: { value: '4 agents', label: 'per render, brand-locked' },
        models: ['GPT Image 2', 'NanoBanana 2', 'NanoBanana Pro', 'Flux Kontext Max', 'Flux Kontext Pro'],
        useCases: [
            'Instagram carousel for a product launch — on-brand colours, fonts, voice',
            'Meta ad creatives with 5 variants for A/B testing',
            'AI product photoshoot for a Shopify catalog',
            'Festival creatives in your exact brand kit',
        ],
        problemSolved: 'Most AI image tools produce generic AI-looking output. Creative Studio\'s critic-node architecture rejects and regenerates anything that drifts from your brand kit.',
        faqs: [
            {
                question: 'Why use four agents instead of one?',
                answer: 'Single-prompt image generation drifts off-brand often. Splitting into Art Director, Prompt Engineer, Critic and Generator means each step has a specialised job — and the critic specifically validates Brand DNA adherence before render, dramatically reducing off-brand output.',
            },
            {
                question: 'Which image model does it use?',
                answer: 'Mantram routes per task — GPT Image 2 for photoreal, NanoBanana 2 / Pro for brand-faithful edits, Flux Kontext Max for high-fidelity ad creatives, Flux Kontext Pro for cheaper iterations. You can also lock a model if you prefer.',
            },
            {
                question: 'How does it apply my brand kit?',
                answer: 'Brand DNA stores your colour palette, typography, photography style and design rules. The Prompt Engineer agent injects these into every render prompt, so output naturally matches your kit.',
            },
            {
                question: 'Can it produce carousels and product photoshoots?',
                answer: 'Yes — multi-image carousels with consistent style across slides, plus AI photoshoots that place your product into branded scenes for catalog, ads or social.',
            },
        ],
        keywords: ['AI design tool', 'AI ad creative generator', 'brand-consistent design AI', 'GPT Image 2', 'NanoBanana 2 creative', 'AI carousel generator'],
    },

    {
        slug: 'video-studio',
        group: 'Create',
        name: 'Video Studio',
        tagline: 'Frontier video models, picked per brief',
        metaTitle: 'Video Studio — Veo 3.1, Sora 2, Kling 3.0 | Mantram AI',
        metaDesc: 'Cinematic AI video — Google Veo 3.1, Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0. Brief to final cut. Mantram AI Video Studio.',
        aiSummary: 'Mantram Video Studio is a multi-model AI video generation platform that routes briefs to the best frontier model — Google Veo 3.1, OpenAI Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0, Hailuo MiniMax or Wan 2.1. The pipeline runs brainstorm → script direction → reference selection → model routing → generation → optional editing. Supports text-to-video, image-to-video, video extend, and HeyGen avatar-driven UGC. Routes by quality, cost and duration constraints automatically.',
        heroLine: 'What if you had every frontier video model on tap — and the system picked the right one for you?',
        capabilities: [
            { icon: 'movie',                label: 'Text-to-Video' },
            { icon: 'add_photo_alternate',  label: 'Image-to-Video' },
            { icon: 'fast_forward',         label: 'Video Extend' },
            { icon: 'tune',                 label: 'Smart Model Routing' },
            { icon: 'high_quality',         label: 'Up to 4K Output' },
            { icon: 'face',                 label: 'HeyGen Avatar UGC' },
        ],
        teaser: 'Video Studio gives you Google Veo 3.1, Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0, Hailuo MiniMax and Wan 2.1 — eight frontier models in one studio. The pipeline picks the right one for your brief based on quality, cost and duration.',
        stat: { value: '8 models', label: 'auto-routed per brief' },
        models: ['Google Veo 3.1', 'Sora 2', 'Seedance 2.0 Pro', 'Kling 3.0', 'HappyHorse 1.0', 'Hailuo MiniMax', 'Wan 2.1', 'HeyGen Avatars'],
        useCases: [
            'Cinematic product hero video using Veo 3.1',
            'Fast UGC-style ad with Seedance 2.0 Pro',
            'Avatar-driven explainer with HeyGen + Claude script',
            'Multi-shot narrative video with native audio (HappyHorse 1.0)',
        ],
        problemSolved: 'Single-model video tools force you into one trade-off. Video Studio routes to the model that fits your brief\'s quality, cost and duration needs.',
        faqs: [
            {
                question: 'Which video model is the best?',
                answer: 'It depends on the brief. Veo 3.1 is best for cinematic 1080p with native audio. Sora 2 excels at narrative coherence. Seedance 2.0 Pro is fastest and cheapest for UGC-style ads. Kling 3.0 handles motion well. HappyHorse 1.0 is strong on cinematic motion with reference images. Mantram routes automatically — but you can override.',
            },
            {
                question: 'Can I use my product image as input?',
                answer: 'Yes. Image-to-video is supported across most models. Drop a product shot and the studio animates it into a video with your script-directed motion.',
            },
            {
                question: 'How long can the videos be?',
                answer: 'Most models support 5–15 second clips natively. Use Video Extend to chain segments into 30–60s edits, or send to a final cut step that stitches and adds audio.',
            },
            {
                question: 'Are HeyGen avatars supported?',
                answer: 'Yes — full HeyGen integration including audio avatars, photo avatars, avatar IV and product placement. Pair with a Claude-written script for instant UGC-style content.',
            },
        ],
        keywords: ['AI video generation', 'Veo 3.1', 'Sora 2', 'Seedance video', 'Kling 3.0', 'AI ad video', 'HeyGen avatar', 'AI product video'],
    },

    {
        slug: 'youtube-studio',
        group: 'Create',
        name: 'YouTube Studio',
        tagline: 'Scripts, thumbnails, SEO — built around your channel',
        metaTitle: 'YouTube Studio — AI Scripts & Thumbnails | Mantram AI',
        metaDesc: 'AI-generated long-form scripts, thumbnails and SEO for your YouTube channel — built on your Brand DNA. Mantram AI YouTube Studio.',
        aiSummary: 'Mantram YouTube Studio generates long-form scripts, thumbnail concepts and channel SEO strategies for YouTube creators. It uses Claude Sonnet 4.6 for script writing and Gemini 2.5 Flash for rapid title and thumbnail variant generation. Includes keyword research that feeds thumbnail click-through rate optimisation. Built for creators and brands who want consistent, on-brand YouTube growth without burning out.',
        heroLine: 'What if your YouTube scripts, thumbnails and SEO were all built around the same brand?',
        capabilities: [
            { icon: 'description',  label: 'Long-Form Scripts' },
            { icon: 'image',        label: 'Thumbnail Concepts' },
            { icon: 'search',       label: 'Channel SEO' },
            { icon: 'title',        label: 'Title A/B Variants' },
            { icon: 'list_alt',     label: 'Description & Tags' },
            { icon: 'auto_graph',   label: 'CTR Optimisation' },
        ],
        teaser: 'YouTube Studio is your channel\'s AI producer. Long-form scripts in your voice, thumbnail concepts that earn the click, SEO that ranks. All informed by Brand DNA and live keyword data.',
        stat: { value: '10+', label: 'title variants per video' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Flash', 'GPT Image 2'],
        useCases: [
            'Long-form scripts for educational content series',
            'High-CTR thumbnail concepts with text overlay',
            'Channel SEO audit and keyword strategy',
            'Title A/B variants for an existing video',
        ],
        problemSolved: 'YouTube growth requires consistency across script, thumbnail and SEO — but most creators do these in different tools. YouTube Studio unifies them around your Brand DNA.',
        faqs: [
            {
                question: 'Does it write the full script or just an outline?',
                answer: 'Full script — long-form, in your brand voice. You can request outline-only mode if you prefer to write yourself.',
            },
            {
                question: 'Will the thumbnails match my channel\'s style?',
                answer: 'Yes — thumbnail prompts are seeded with your Brand DNA (palette, typography, photography style) so they feel consistent with your channel\'s look.',
            },
            {
                question: 'Does it do keyword research too?',
                answer: 'Yes — built-in keyword research feeds the SEO step (titles, descriptions, tags) and informs thumbnail copy for click-through.',
            },
        ],
        keywords: ['AI YouTube script', 'AI thumbnail generator', 'YouTube SEO AI', 'AI video script writer'],
    },

    {
        slug: 'avatar-studio',
        group: 'Create',
        name: 'Avatar Studio',
        tagline: 'AI presenters for UGC and explainer video',
        metaTitle: 'Avatar Studio — AI UGC Presenters | Mantram AI',
        metaDesc: 'Generate AI avatars for UGC, explainers and product video — without expensive photoshoots. Mantram AI Avatar Studio.',
        aiSummary: 'Mantram Avatar Studio generates AI presenter avatars for UGC-style content and explainer videos using GPT Image 2 and NanoBanana 2 for stills, and HeyGen for animated avatar video. Produces three variants in parallel for A/B selection. Used by brands that need recurring on-camera content but cannot justify the cost of regular human shoots.',
        heroLine: 'What if you could ship UGC without booking a single human shoot?',
        capabilities: [
            { icon: 'face',          label: 'Avatar Generation' },
            { icon: 'burst_mode',    label: '3 Variants in Parallel' },
            { icon: 'cloud_upload',  label: 'Direct S3 Storage' },
            { icon: 'play_circle',   label: 'HeyGen Video Avatars' },
            { icon: 'tune',          label: 'Style Customisation' },
            { icon: 'verified',      label: 'On-Brand Output' },
        ],
        teaser: 'Avatar Studio replaces the casting and shooting cost of UGC. Generate three avatar variants in parallel, pick the one that fits your campaign, and animate them through HeyGen for full presenter videos.',
        stat: { value: '3 variants', label: 'in parallel, < 60s' },
        models: ['GPT Image 2', 'NanoBanana 2', 'HeyGen Avatars'],
        useCases: [
            'UGC-style product testimonial avatars',
            'Explainer video presenters in your brand colours',
            'Recurring social content without re-booking talent',
            'Multi-language avatar video for regional campaigns',
        ],
        problemSolved: 'UGC is expensive to shoot and slow to source. Avatar Studio replaces that cost with on-brand AI presenters that ship in minutes.',
        faqs: [
            {
                question: 'How realistic are the avatars?',
                answer: 'GPT Image 2 and NanoBanana 2 produce photoreal stills. For animated video, HeyGen integration delivers production-grade lip-sync and natural motion.',
            },
            {
                question: 'Can the avatars speak in Indian languages?',
                answer: 'Yes — HeyGen supports multilingual TTS including Hindi and other Indian languages, paired with Claude-written scripts.',
            },
            {
                question: 'Do I need a real person\'s consent or likeness?',
                answer: 'No. Avatars are generated from prompt — they are not based on a real individual\'s likeness, which avoids consent and rights issues common with stock UGC.',
            },
        ],
        keywords: ['AI avatar generator', 'UGC avatar AI', 'HeyGen avatar', 'AI presenter video', 'AI talking avatar'],
    },

    {
        slug: 'brand-studio',
        group: 'Create',
        name: 'Brand Studio',
        tagline: 'Decks, listings, moodboards, landing pages — all on-brand',
        metaTitle: 'Brand Studio — AI Decks, Listings, Moodboards | Mantram AI',
        metaDesc: 'AI-generated campaign decks, A+ listings, email templates and moodboards — all aligned to your Brand DNA. Mantram AI Brand Studio.',
        aiSummary: 'Mantram Brand Studio generates campaign decks, Amazon A+ listings, email templates, product moodboards and landing pages, all aligned to your Brand DNA. Combines Claude Sonnet 4.6 for narrative and copy with Flux Kontext Max for visual generation. Includes direct Shopify publishing for product pages and listings. Used by brand managers and agencies for asset creation that would otherwise require a designer plus copywriter.',
        heroLine: 'What if every brand asset shipped already on-brand — no designer round-trip?',
        capabilities: [
            { icon: 'slideshow',  label: 'Campaign Decks' },
            { icon: 'storefront', label: 'A+ Listings (Amazon)' },
            { icon: 'mail',       label: 'Email Templates' },
            { icon: 'palette',    label: 'Product Moodboards' },
            { icon: 'web',        label: 'Landing Pages' },
            { icon: 'integration_instructions', label: 'Shopify Direct Publish' },
        ],
        teaser: 'Brand Studio is the asset layer for marketing operations. Decks for stakeholders, listings for marketplaces, moodboards for direction, landing pages for campaigns — all generated from one Brand DNA, all consistent.',
        stat: { value: '6 asset types', label: 'one Brand DNA' },
        models: ['Claude Sonnet 4.6', 'Flux Kontext Max', 'GPT Image 2'],
        useCases: [
            'Campaign deck for a quarterly review',
            'Amazon A+ listing for a new product launch',
            'Email template for a Black Friday push',
            'Product moodboard before a photoshoot',
        ],
        problemSolved: 'Brand asset creation bottlenecks on designer + copywriter availability. Brand Studio gives the team a head-start that already matches the brand kit.',
        faqs: [
            {
                question: 'Can it publish a product listing directly to Shopify?',
                answer: 'Yes — Shopify integration is built in. Generate a listing in Brand Studio, hit publish, and the product page goes live with copy, images and structured data.',
            },
            {
                question: 'Are the decks editable after generation?',
                answer: 'Yes — they export as editable presentation files. The AI gives you a strong starting point, not a locked PDF.',
            },
        ],
        keywords: ['AI brand deck', 'AI A+ listing', 'AI email template', 'AI moodboard', 'AI landing page'],
    },

    // ── DISTRIBUTE ────────────────────────────────────────────────────────
    {
        slug: 'social-media-studio',
        group: 'Distribute',
        name: 'Social Media Studio',
        tagline: 'Per-platform voice — your IG isn\'t your LinkedIn',
        metaTitle: 'Social Media Studio — AI Multi-Platform Publisher | Mantram AI',
        metaDesc: 'Per-platform voice for Instagram, LinkedIn, Facebook, X. AI-driven calendar, scheduling and Meta-compliant publishing. Mantram AI.',
        aiSummary: 'Mantram Social Media Studio is a multi-platform social management tool that captures per-platform voice — Instagram captions, LinkedIn articles and X posts each have their own tone profile in Brand DNA. Includes AI-driven content calendar, audit of existing voice across platforms, and Meta-compliance-aware publishing for Instagram, Facebook, LinkedIn and X. Reads live recent posts to keep voice alignment fresh.',
        heroLine: 'What if your Instagram, LinkedIn and X all sounded right — for each platform?',
        capabilities: [
            { icon: 'language',     label: 'Per-Platform Voice' },
            { icon: 'calendar_month', label: 'Content Calendar' },
            { icon: 'analytics',    label: 'Voice Audit' },
            { icon: 'schedule_send', label: 'Scheduled Publishing' },
            { icon: 'verified',     label: 'Meta-Compliance Aware' },
            { icon: 'autorenew',    label: 'Live Voice Refresh' },
        ],
        teaser: 'Social Media Studio knows your Instagram is not your LinkedIn. It captures a separate voice profile per platform during onboarding, audits existing posts to stay current, and publishes through Mantram\'s Meta-compliant scheduling layer.',
        stat: { value: '4 platforms', label: '4 voice profiles' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro'],
        useCases: [
            'Schedule a week of Instagram posts in your Insta voice',
            'Generate a LinkedIn long-form thought-leadership piece',
            'Audit existing voice consistency across platforms',
            'Multi-account team workflow for an agency',
        ],
        problemSolved: 'Most AI tools generate one caption and copy-paste it across platforms. Social Media Studio writes platform-native — because Brand DNA tracks each platform\'s voice separately.',
        faqs: [
            {
                question: 'How does per-platform voice work?',
                answer: 'During Brand DNA onboarding, Mantram analyses your existing Instagram, LinkedIn, X and Facebook posts separately and infers a unique voice profile per platform — tone, caption length, hashtag style, emoji usage. Every generation reads from the right one.',
            },
            {
                question: 'Is publishing Meta-compliant?',
                answer: 'Yes — built-in anti-mimicry delays, rate limits per conversation, and X-Hub-Signature webhook validation. We comply with Meta\'s automation policies so your account stays in good standing.',
            },
            {
                question: 'Can multiple team members manage the same brand?',
                answer: 'Yes — role-based access (creator, reviewer, admin) with brand-scoped permissions for agencies managing multiple clients.',
            },
        ],
        keywords: ['AI social media manager', 'multi-platform AI publisher', 'AI Instagram scheduler', 'AI LinkedIn posts', 'Meta compliant AI'],
    },

    {
        slug: 'performance-marketing',
        group: 'Distribute',
        name: 'Performance Marketing',
        tagline: 'AI ad strategist — Meta + Google, ROAS-aware',
        metaTitle: 'Performance Marketing — AI Ad Strategist | Mantram AI',
        metaDesc: 'AI ad strategy for Meta and Google — competitor research, budget planning, ROAS optimisation, live Shopify sync. Mantram AI.',
        aiSummary: 'Mantram Performance Marketing Studio is an AI ad strategist for Meta and Google Ads. It plans campaigns, allocates budgets, generates ad copy, sets up audience targeting and optimises for ROAS using live Shopify revenue data. Powered by Claude Sonnet 4.6 for strategy and a routing engine that adjusts bid strategy based on real-time performance. Built for D2C founders who waste budget on untargeted campaigns.',
        heroLine: 'What if your Meta and Google ads were planned by an AI that reads your Shopify in real time?',
        capabilities: [
            { icon: 'campaign',      label: 'Campaign Planning' },
            { icon: 'account_balance', label: 'Budget Allocation' },
            { icon: 'edit_note',     label: 'Ad Copy Generation' },
            { icon: 'groups',        label: 'Audience Targeting' },
            { icon: 'trending_up',   label: 'ROAS Optimisation' },
            { icon: 'sync',          label: 'Live Shopify Sync' },
        ],
        teaser: 'Performance Marketing Studio is your AI ad CMO. It researches competitors, plans budgets, generates targeting and ad copy, and optimises ROAS using live Shopify and ad-account data — not training-data heuristics.',
        stat: { value: '4.2×', label: 'average ROAS uplift' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro'],
        useCases: [
            'Launch a Meta ads campaign for a new D2C product',
            'Reallocate Google Ads budget across underperforming campaigns',
            'Generate 10 ad copy variants for A/B testing',
            'Diagnose a campaign with declining ROAS',
        ],
        problemSolved: 'Most ad-AI tools work in a vacuum, blind to actual revenue. Performance Marketing reads live Shopify revenue and adjusts bid strategy accordingly.',
        faqs: [
            {
                question: 'Does it execute the campaign or just plan it?',
                answer: 'Both. You can preview and approve the AI plan, or let it execute via Meta and Google Ads API once authorised.',
            },
            {
                question: 'How does ROAS optimisation work?',
                answer: 'Live Shopify sync pulls actual revenue per campaign. The routing engine reallocates budget toward higher-ROAS campaigns and pauses underperforming ones.',
            },
            {
                question: 'Is competitor ad research included?',
                answer: 'Yes — pulled live from Meta Ad Library and Google Ads Transparency through the Research Studio MCP integration.',
            },
        ],
        keywords: ['AI ad strategist', 'AI Meta ads', 'AI Google ads', 'ROAS optimisation AI', 'D2C ad AI'],
    },

    {
        slug: 'funnel-studio',
        group: 'Distribute',
        name: 'Funnel Studio',
        tagline: 'Lead-gen, launches, win-back — multi-stage with built-in CRM',
        metaTitle: 'Funnel Studio — AI Multi-Stage Funnels | Mantram AI',
        metaDesc: 'AI-built lead-gen, launch, win-back and ecommerce funnels with stage templates, contact tracking and automation rules. Mantram AI.',
        aiSummary: 'Mantram Funnel Studio builds multi-stage marketing funnels — lead-gen, product launch, win-back and ecommerce flows — with stage templates, integrated contact CRM, RFM segmentation, and automation rules. Generates stage-specific copy via Claude Sonnet 4.6 and uses a routing engine for audience segmentation. Built for marketers who need funnel visibility without an extra tool.',
        heroLine: 'What if your funnels built themselves, with copy, stages and segmentation already done?',
        capabilities: [
            { icon: 'flag_circle',   label: 'Stage Templates' },
            { icon: 'people',        label: 'Contact CRM' },
            { icon: 'category',      label: 'RFM Segmentation' },
            { icon: 'rule',          label: 'Automation Rules' },
            { icon: 'edit_note',     label: 'Stage-Aware Copy' },
            { icon: 'analytics',     label: 'Funnel Analytics' },
        ],
        teaser: 'Funnel Studio replaces ClickFunnels + Mailchimp + a CRM. Pick a funnel template (lead-gen, launch, win-back), Mantram generates stage copy and rules in your brand voice, then tracks contacts through every step.',
        stat: { value: '4 funnel types', label: 'with built-in CRM' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro'],
        useCases: [
            'Lead-gen funnel for a webinar or lead magnet',
            'Product-launch funnel with daily email sequence',
            'Win-back funnel for lapsed customers',
            'Ecommerce abandoned-cart funnel',
        ],
        problemSolved: 'Funnels live in 5+ disconnected tools. Funnel Studio gives you stages, copy, segmentation and CRM in one place, all on-brand.',
        faqs: [
            {
                question: 'What kinds of funnels are supported?',
                answer: 'Lead-gen, product launch, win-back, and ecommerce abandoned-cart by default — plus a custom builder for bespoke flows.',
            },
            {
                question: 'Does it integrate with my email tool?',
                answer: 'Funnel Studio includes built-in email and SMS sending. It can also export contacts to Mailchimp, Klaviyo or your CRM via webhook.',
            },
            {
                question: 'How does RFM segmentation work?',
                answer: 'RFM (Recency, Frequency, Monetary) auto-segments contacts based on their behaviour. The funnel can route different segments to different stages — e.g. high-value contacts get VIP messaging.',
            },
        ],
        keywords: ['AI funnel builder', 'AI lead generation', 'AI win-back funnel', 'AI ecommerce funnel', 'AI CRM marketing'],
    },

    // ── OPTIMIZE ──────────────────────────────────────────────────────────
    {
        slug: 'seo-studio',
        group: 'Optimize',
        name: 'SEO Studio',
        tagline: 'SEO + AEO — rank in Google, get cited in ChatGPT Search and AI Overviews',
        metaTitle: 'SEO Studio — Rank + Get Cited by AI Search | Mantram AI',
        metaDesc: 'Traditional SEO + Answer Engine Optimization. Rank in Google, get cited in ChatGPT Search, Perplexity, AI Overviews, Copilot. Mantram AI SEO Studio.',
        aiSummary: 'Mantram SEO Studio handles both traditional SEO and AEO (Answer Engine Optimization). It runs keyword research, JS-render site audits, competitive analysis, content gap detection, Core Web Vitals and backlink intelligence — plus AI-search-citation tracking across ChatGPT Search, Perplexity, Google AI Overviews, Google AI Mode, Microsoft Copilot Search, Claude with web, and Apple Intelligence. Integrates DataForSEO, Moz, OnPage, PageSpeed and Google Search Console live. Uses Claude Sonnet 4.6 reasoning to turn raw audit data into a prioritised action plan, with content rewritten to be quotable by AI engines (clear claims, source-cited, structured data emitted).',
        heroLine: 'What if your SEO worked for Google AND ChatGPT Search?',
        capabilities: [
            { icon: 'search',         label: 'Live Keyword Research' },
            { icon: 'bug_report',     label: 'JS-Render Site Audit' },
            { icon: 'auto_awesome',   label: 'AEO — Cite-by-AI Optimisation' },
            { icon: 'compare_arrows', label: 'Competitive Analysis' },
            { icon: 'find_in_page',   label: 'Content Gap Detection' },
            { icon: 'monitoring',     label: 'AI-Search Citation Tracker' },
        ],
        teaser: 'In May 2026, ranking in Google is half the game — getting cited in ChatGPT Search, AI Overviews, AI Mode, Perplexity and Copilot is the other half. SEO Studio handles both. Live data from DataForSEO, Moz and Search Console + AEO content rewrites that AI engines actually quote.',
        stat: { value: 'SEO + AEO', label: 'one studio, two channels' },
        models: ['Claude Sonnet 4.6', 'Gemini 3 Pro'],
        useCases: [
            'Pre-launch SEO + AEO audit before a product page goes live',
            'Track which AI engines cite your brand and on which queries',
            'Rewrite content to be quotable in AI Overviews and ChatGPT Search',
            'Find content gaps competitors are winning in both Google and AI search',
        ],
        problemSolved: 'Google rankings alone no longer drive traffic — most queries get answered inside AI search. SEO Studio optimises for both Google and AI search citation in one workflow.',
        faqs: [
            {
                question: 'What is AEO and why does it matter in 2026?',
                answer: 'AEO is Answer Engine Optimization — making your content quotable by AI search engines (ChatGPT Search, Google AI Overviews, AI Mode, Perplexity, Copilot, Claude, Apple Intelligence). By 2026, most informational queries are answered inside an AI summary instead of clicking through. If your brand isn\'t cited in those summaries, you\'re invisible. SEO Studio rewrites your content so it gets quoted, with clear claims, source attribution, structured data and speakable selectors.',
            },
            {
                question: 'Which AI search engines does Mantram optimise for?',
                answer: 'ChatGPT Search, Google AI Overviews + AI Mode, Microsoft Copilot Search, Perplexity, Anthropic Claude with web, You.com, Brave Search AI, DuckDuckGo AI, and Apple Intelligence (Siri AI). We track citation share across all of them.',
            },
            {
                question: 'Does it work for single-page apps (React, Vue, SPAs)?',
                answer: 'Yes — Mantram\'s site audit uses JS-render crawling, so dynamic content shows up. Most SEO tools only crawl static HTML and miss everything.',
            },
            {
                question: 'Which data sources are integrated?',
                answer: 'DataForSEO (keyword + SERP), Moz (domain authority, backlinks), OnPage (technical SEO), PageSpeed (Core Web Vitals), Google Search Console (impressions, rankings, AI Overview clicks). Plus Mantram\'s own MCP-driven scrapers for AI search citation tracking.',
            },
            {
                question: 'Is the SEO advice generic or specific to my site?',
                answer: 'Specific. Claude Sonnet 4.6 reasoning reads your site\'s actual audit data, your competitors\' rankings, your AI-search citation profile, and your Brand DNA — then recommends prioritised actions in your voice.',
            },
        ],
        keywords: ['AEO', 'answer engine optimization', 'AI SEO 2026', 'ChatGPT Search SEO', 'AI Overviews SEO', 'Perplexity SEO', 'AI Mode SEO', 'Copilot Search SEO', 'JS render SEO audit', 'AI keyword research India'],
    },

    {
        slug: 'retention-studio',
        group: 'Optimize',
        name: 'Retention Studio',
        tagline: 'Win-back, browse-abandonment, RFM — email + SMS + push',
        metaTitle: 'Retention Studio — AI Win-Back & Abandonment | Mantram AI',
        metaDesc: 'AI-driven win-back campaigns, browse abandonment tracking, RFM segmentation. Email, SMS, push — Twilio + Firebase. Mantram AI.',
        aiSummary: 'Mantram Retention Studio runs win-back campaigns, browse-abandonment recovery and RFM-based segmentation across email, SMS and push notifications. Includes a JavaScript browse-tracker widget for on-site abandonment signals, Twilio for SMS and Firebase for push. Generates retention copy via Claude Sonnet 4.6, all aligned to Brand DNA. Built for ecommerce brands that want retention automation without a Klaviyo + Yotpo + custom-tracker stack.',
        heroLine: 'What if your churn knowledge was in the platform — not in spreadsheets?',
        capabilities: [
            { icon: 'replay',          label: 'Win-Back Campaigns' },
            { icon: 'shopping_cart',   label: 'Browse Abandonment' },
            { icon: 'category',        label: 'RFM Segmentation' },
            { icon: 'mail',            label: 'Email Automation' },
            { icon: 'sms',             label: 'SMS (Twilio)' },
            { icon: 'notifications',   label: 'Push (Firebase)' },
        ],
        teaser: 'Retention Studio captures abandonment signals (browse + cart) via a JS widget, segments contacts by RFM behaviour, and runs multi-channel recovery campaigns through email, SMS and push — all on-brand, all automated.',
        stat: { value: '3 channels', label: 'one orchestrator' },
        models: ['Claude Sonnet 4.6', 'Gemini 2.5 Pro'],
        useCases: [
            'Win-back campaign for customers lapsed > 90 days',
            'Browse-abandonment SMS within 1 hour of exit',
            'RFM segmentation to identify high-value at-risk customers',
            'Multi-channel recovery sequence (email → SMS → push)',
        ],
        problemSolved: 'Retention sits across Klaviyo, Yotpo, custom trackers and SMS providers. Retention Studio unifies it with one Brand DNA-aware orchestrator.',
        faqs: [
            {
                question: 'How does the browse-tracker widget work?',
                answer: 'A small JS embed on your site captures pageviews, time on page and exit signals. Data flows into Retention Studio for abandonment trigger evaluation. GDPR-aware with consent gating.',
            },
            {
                question: 'What RFM segments are auto-built?',
                answer: 'Champions, loyal, at-risk, lapsed and new — auto-computed from purchase recency, frequency and monetary value. You can also define custom segments.',
            },
            {
                question: 'Are SMS deliveries Indian DLT-compliant?',
                answer: 'Yes — Twilio integration supports DLT registration for Indian SMS deliveries. Templates can be approved and registered.',
            },
        ],
        keywords: ['AI retention marketing', 'AI win back campaign', 'browse abandonment tracker', 'AI RFM segmentation', 'AI SMS marketing India'],
    },
];

/**
 * Convenience lookups
 */
export const STUDIOS_BY_SLUG = STUDIOS.reduce((m, s) => { m[s.slug] = s; return m; }, {});

export function studiosForGroup(group) {
    return STUDIOS.filter(s => s.group === group);
}

/**
 * Global landing-page FAQs (different from per-studio FAQs).
 * Kept current — references real models, real integrations, real pricing.
 */
export const LANDING_FAQS = [
    {
        question: 'What is Mantram AI?',
        answer: 'Mantram AI is an agentic AI marketing operating system with 14 specialised studios. It captures your Brand DNA once — voice, visuals, audience, competitors — then runs an agent fleet (research, ideation, content, creative, video, social, performance ads, SEO + AEO, retention) that all share the same brand brain. Built for D2C brands and marketing agencies in India and globally. Live since early 2026, in early access through May 2026.',
    },
    {
        question: 'In 2026 every tool has AI. What makes Mantram different?',
        answer: 'Three things. First, Brand DNA — every studio reads from one structured profile of your brand, so output sounds like you, not like generic AI slop. Second, model-agnostic agent fleet — we route across Claude, Gemini, GPT, Veo, Sora, NanoBanana, Flux, HappyHorse and more, picking the best model per task. We\'re loyal to none. Third, Indian-first — Hindi/Marathi/Hinglish, Sarvam-Bhasha integrations, DLT-compliant SMS, INR pricing, DPDP-compliant data handling.',
    },
    {
        question: 'Won\'t my AI-generated content get penalised as AI slop?',
        answer: 'Only if it sounds like generic AI. Google\'s Helpful Content guidance and AI search engines (ChatGPT Search, AI Overviews, Perplexity) penalise low-effort AI output that lacks point of view. Mantram\'s Brand DNA + Critic-node pipelines force every piece to be brand-faithful, opinionated and source-cited — the opposite of slop. SEO Studio also rewrites output for AEO so AI search engines actually quote you.',
    },
    {
        question: 'How do I get cited in ChatGPT Search, AI Overviews and Perplexity?',
        answer: 'That\'s what AEO (Answer Engine Optimization) is for, and SEO Studio does it natively. We rewrite your content with clear claims, source attribution, structured data, FAQPage + HowTo + Speakable schema, and citation-worthy phrasing. Then we track your citation share across ChatGPT Search, Google AI Overviews, Google AI Mode, Microsoft Copilot Search, Perplexity, Claude with web, and Apple Intelligence — so you can see which engines quote you and on which queries.',
    },
    {
        question: 'What does "Brand DNA" mean?',
        answer: 'Brand DNA is Mantram\'s onboarding artefact: a structured profile of your brand built from a website scan, social audit, competitor research and review-sentiment analysis in about 90 seconds. It captures voice (witty, formal, warm), visual identity (palette, typography), platform-specific tone, content rules and a knowledge bank. Every studio reads from this single source so output stays on-brand without re-prompting.',
    },
    {
        question: 'Which AI models does Mantram use?',
        answer: 'Mantram is model-agnostic and routes per task. Reasoning: Claude Sonnet 4.6, Gemini 3 Pro, Gemini 2.5 Pro, GPT-4o. Image: GPT Image 2, NanoBanana 2, NanoBanana Pro, Flux Kontext Max/Pro. Video: Google Veo 3.1, OpenAI Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0, Hailuo MiniMax, Wan 2.1. Avatars: HeyGen. Indian-language: Sarvam AI / Bhasha models. We pick the best one for each job — quality, latency and cost-optimised — and you\'re never locked to one vendor.',
    },
    {
        question: 'Is there a free tier?',
        answer: 'Not currently. Mantram is in early access through May 2026 — request access via the waitlist. Pricing is credit-pack based starting from ₹149 (Micro, 20 credits) up to ₹17,999 (Enterprise, 5,000 + 2,000 bonus credits). No subscription, no monthly fee. Credits stay valid 6–12 months. UPI auto-pay supported for Indian customers.',
    },
    {
        question: 'Who is Fidato?',
        answer: 'Fidato (Italian for "trusted") is Mantram\'s always-on AI branding expert — a conversational agent that knows your Brand DNA cold and answers strategy, copy, campaign and brand-health questions in your language. Available across the platform via the floating chat panel. Powered by Claude Sonnet 4.6 reasoning + your full brand context.',
    },
    {
        question: 'What is "agentic" about Mantram in 2026 terms?',
        answer: 'Agentic means an agent fleet, not single AI calls. Creative Studio runs Art Director → Prompt Engineer → Style Critic → Generator as separate agents. Master Orchestrator routes user intent across 14 studios. The MCP server exposes live tools (web_search, scrape_competitor, fetch_trending, fetch_seo_audit) that agents call during reasoning. By 2026, single-prompt AI is table stakes — agentic orchestration with shared brand context is the difference.',
    },
    {
        question: 'How does Mantram comply with India\'s DPDP Act?',
        answer: 'Mantram is built DPDP-compliant from day one — explicit consent flows, purpose-bound processing, user-initiated data deletion (mantram.ai/data-deletion), data residency options for India, and no third-party model training on your data. Your brand content stays yours; we don\'t use it to train shared models. Same applies for GDPR (EU) and California CCPA — global compliance baked in.',
    },
    {
        question: 'Does Mantram support Indian languages?',
        answer: 'Yes — Hindi, Marathi, Hinglish, English, code-switched output, plus expanding regional support via Sarvam AI / Bhasha-1 models. The Smart Language Router auto-detects your brand\'s preferred language from Brand DNA and picks the optimal model per task. SMS deliveries via Twilio are TRAI DLT-registered.',
    },
    {
        question: 'What does Mantram integrate with?',
        answer: 'Commerce: Shopify, Etsy, WooCommerce. Social and ads: Meta (Facebook + Instagram), LinkedIn, X, Google Ads, Meta Ads, Google Analytics 4. SEO + AEO data: DataForSEO, Moz. Comms: Twilio (DLT-compliant SMS), Firebase (push). All integrations are Meta-compliance-aware with anti-mimicry delays and signed webhooks.',
    },
];

export default STUDIOS;
