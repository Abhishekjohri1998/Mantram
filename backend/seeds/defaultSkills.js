import Skill from '../models/Skill.js';

// ============================================================================
// 10 Pre-Built D2C Marketing Skills
// ============================================================================

const DEFAULT_SKILLS = [
    // ── 1. Festival Campaign Planner ──
    {
        name: 'Festival Campaign Planner',
        description: 'Generate a complete festival marketing campaign plan with timeline, social posts, offers, and ad creatives strategy',
        category: 'content',
        tags: ['festival', 'campaign', 'D2C', 'seasonal', 'india'],
        icon: 'celebration',
        color: 'amber',
        instructions: `You are a Festival Campaign Strategist for Indian D2C brands.

Given the brand context and selected festival, create a COMPLETE campaign plan.

Your output MUST include:
1. **Campaign Theme & Hook** — A catchy campaign name and central idea that connects the festival emotion to the brand
2. **Timeline** — Pre-launch (7 days), Launch (3 days), Post-launch (3 days) with specific daily actions
3. **Social Media Posts** — 8-10 posts with captions (include Hinglish variants), hashtags, and visual direction
4. **Offer Strategy** — Recommended discount structure, bundle deals, or gift-with-purchase ideas
5. **Ad Creatives Brief** — 3-4 ad concepts with headline, body copy, CTA, and target audience
6. **Email/WhatsApp Sequences** — 3-4 message templates for different stages
7. **Budget Allocation** — Suggested percentage split across channels (Meta, Google, WhatsApp, Influencer)

Respond in JSON:
{
    "campaignName": "",
    "theme": "",
    "hook": "",
    "festival": "",
    "timeline": { "preLaunch": [], "launch": [], "postLaunch": [] },
    "socialPosts": [{ "day": 1, "platform": "", "caption": "", "hinglishCaption": "", "hashtags": [], "visualDirection": "" }],
    "offerStrategy": { "primaryOffer": "", "bundles": [], "urgencyTactics": [] },
    "adCreatives": [{ "concept": "", "headline": "", "body": "", "cta": "", "audience": "" }],
    "messaging": [{ "channel": "", "stage": "", "template": "" }],
    "budgetSplit": { "meta": 0, "google": 0, "whatsapp": 0, "influencer": 0 }
}

Be SPECIFIC to Indian festivals and D2C e-commerce patterns. Include Hinglish where it adds authenticity.`,
        systemPrompt: 'You are an expert D2C festival campaign strategist with deep knowledge of Indian consumer behavior, festival seasons, and digital marketing.',
        inputFields: [
            { name: 'festival', label: 'Which Festival?', type: 'select', required: true, placeholder: 'Select festival', options: ['Diwali', 'Holi', 'Navratri', 'Raksha Bandhan', 'Eid', 'Christmas', 'New Year', 'Pongal/Makar Sankranti', 'Independence Day', 'Republic Day', "Valentine's Day", "Mother's Day", "Father's Day", 'Custom'] },
            { name: 'budget', label: 'Total Campaign Budget', type: 'select', required: false, placeholder: 'Budget range', options: ['Under ₹25K', '₹25K - ₹1L', '₹1L - ₹5L', '₹5L - ₹25L', '₹25L+'] },
            { name: 'goal', label: 'Primary Goal', type: 'select', required: false, placeholder: 'Main objective', options: ['Sales/Revenue', 'Brand Awareness', 'App Downloads', 'Lead Generation', 'Customer Retention'] },
            { name: 'notes', label: 'Additional Notes', type: 'textarea', required: false, placeholder: 'Any specific requirements, past campaign insights, or constraints...' },
        ],
        outputFormat: 'structured',
        temperature: 0.7,
    },

    // ── 2. Hinglish Ad Copywriter ──
    {
        name: 'Hinglish Ad Copywriter',
        description: 'Write punchy Hinglish ad copy for Meta & Google Ads with multiple CTA variants and platform-specific adaptations',
        category: 'creative',
        tags: ['hinglish', 'ads', 'meta', 'google', 'copywriting'],
        icon: 'edit_note',
        color: 'rose',
        instructions: `You are a Hinglish Ad Copywriter — expert at mixing Hindi and English naturally for Indian D2C brands.

Generate MULTIPLE ad copy variants for the given brand and product/service.

For EACH variant, provide:
- Primary Text (2-3 lines, punchy, conversational Hinglish)
- Headline (under 40 chars)
- Description (under 90 chars)
- CTA text
- Platform adaptation (Meta Feed, Meta Story, Google Search, YouTube)

Rules:
- Hinglish should feel NATURAL, not forced — the way young Indians actually talk
- Use emojis strategically (2-3 per ad max)
- Include urgency triggers (limited time, few left, etc.)
- Mix emotional and rational appeals
- Vary tone across variants: witty, emotional, FOMO-driven, aspirational

Respond in JSON:
{
    "variants": [
        {
            "variantName": "",
            "tone": "witty|emotional|fomo|aspirational",
            "primaryText": "",
            "headline": "",
            "description": "",
            "cta": "",
            "platforms": {
                "metaFeed": { "text": "", "headline": "" },
                "metaStory": { "text": "" },
                "googleSearch": { "headlines": [], "descriptions": [] },
                "youtube": { "bumperText": "" }
            }
        }
    ],
    "a_b_recommendation": "Which 2 variants to A/B test first and why"
}

Generate 5 variants minimum. Be creative, punchy, and authentically Indian.`,
        systemPrompt: 'You are India\'s top Hinglish copywriter — your ads go viral because they sound like a friend talking, not a brand selling.',
        inputFields: [
            { name: 'product', label: 'Product/Service', type: 'text', required: true, placeholder: 'e.g., Premium Coffee Subscription' },
            { name: 'usp', label: 'Key USP / Offer', type: 'text', required: true, placeholder: 'e.g., 50% off first month, farm-to-cup in 48hrs' },
            { name: 'audience', label: 'Target Audience', type: 'text', required: false, placeholder: 'e.g., 25-35 year olds, urban professionals' },
            { name: 'tone', label: 'Preferred Tone', type: 'select', required: false, options: ['Mix of all', 'Witty/Funny', 'Emotional', 'Premium/Aspirational', 'FOMO/Urgency'] },
        ],
        outputFormat: 'structured',
        temperature: 0.8,
    },

    // ── 3. Product Launch Sequence ──
    {
        name: 'Product Launch Sequence',
        description: 'Create a 7-day product launch sequence: teaser → reveal → benefits → social proof → offer conversion',
        category: 'content',
        tags: ['launch', 'product', 'sequence', 'email', 'social'],
        icon: 'rocket_launch',
        color: 'blue',
        instructions: `You are a Product Launch Strategist. Create a complete 7-day launch sequence.

Structure:
- Day 1-2: TEASER (build curiosity, don't reveal product)
- Day 3: REVEAL (product announcement with key visuals)
- Day 4-5: BENEFITS & USE CASES (deep-dive content)
- Day 6: SOCIAL PROOF (testimonials, unboxing, reviews)
- Day 7: CONVERSION (offer, urgency, final CTA)

For EACH day provide:
- Social post (caption + visual direction)
- Email/WhatsApp message
- Story/Reel idea
- Key talking point

Respond in JSON:
{
    "launchName": "",
    "productHook": "One-line hook for the entire launch",
    "days": [
        {
            "day": 1,
            "phase": "teaser|reveal|benefits|proof|conversion",
            "theme": "",
            "socialPost": { "caption": "", "visualDirection": "", "hashtags": [] },
            "email": { "subject": "", "body": "" },
            "storyIdea": "",
            "keyMessage": ""
        }
    ],
    "kpis": ["Metrics to track for success"]
}`,
        systemPrompt: 'You are a product launch expert who has launched 100+ D2C products in India. You know how to build anticipation and convert.',
        inputFields: [
            { name: 'productName', label: 'Product Name', type: 'text', required: true, placeholder: 'e.g., GlowSerum Pro' },
            { name: 'productDesc', label: 'Product Description', type: 'textarea', required: true, placeholder: 'What is it, key features, price point...' },
            { name: 'launchDate', label: 'Launch Date', type: 'text', required: false, placeholder: 'e.g., March 25, 2026' },
            { name: 'launchOffer', label: 'Launch Offer', type: 'text', required: false, placeholder: 'e.g., 30% off first 100 orders' },
        ],
        outputFormat: 'structured',
        temperature: 0.7,
    },

    // ── 4. Weekly Content Calendar ──
    {
        name: 'Weekly Content Calendar',
        description: 'Generate a 7-day content calendar with platform-specific posts, themes, and caption drafts',
        category: 'social',
        tags: ['calendar', 'social', 'planning', 'weekly'],
        icon: 'calendar_month',
        color: 'emerald',
        instructions: `Create a 7-day social media content calendar. For each day, include posts for Instagram, LinkedIn, and Twitter/X.

Each post must have:
- Platform-appropriate caption (length, tone, hashtag count)
- Content pillar it belongs to (educational, entertaining, promotional, behind-scenes, UGC)
- Visual direction (what type of image/video)
- Best posting time (IST)
- Engagement hook (question, poll, CTA for comments)

Also include:
- 2 Reel/Short video concepts for the week
- 1 Carousel idea
- 1 Story series idea

Respond in JSON:
{
    "weekTheme": "",
    "days": [
        {
            "day": "Monday",
            "date": "",
            "posts": [
                { "platform": "instagram|linkedin|twitter", "pillar": "", "caption": "", "hashtags": [], "visualDirection": "", "bestTime": "", "engagementHook": "" }
            ]
        }
    ],
    "reelConcepts": [{ "title": "", "script": "", "duration": "" }],
    "carouselIdea": { "title": "", "slides": [] },
    "storySeriesIdea": { "title": "", "frames": [] }
}`,
        systemPrompt: 'You are a social media strategist who creates content calendars that balance engagement, education, and conversion.',
        inputFields: [
            { name: 'week', label: 'Week Starting', type: 'text', required: false, placeholder: 'e.g., March 17, 2026' },
            { name: 'focus', label: 'This Week\'s Focus', type: 'text', required: false, placeholder: 'e.g., New product launch, Festival prep, Brand awareness' },
            { name: 'avoidTopics', label: 'Topics to Avoid', type: 'text', required: false, placeholder: 'e.g., pricing, competitor mentions' },
        ],
        outputFormat: 'structured',
        temperature: 0.7,
    },

    // ── 5. Brand Voice Checker ──
    {
        name: 'Brand Voice Checker',
        description: 'Audit any text for consistency with your brand DNA — tone, language, values alignment, and suggestions',
        category: 'general',
        tags: ['brand', 'voice', 'audit', 'tone', 'quality'],
        icon: 'record_voice_over',
        color: 'violet',
        instructions: `You are a Brand Voice Auditor. Analyze the provided text against the brand's DNA (tone, values, personality).

Evaluate:
1. **Tone Consistency** — Does it match the brand's defined tone? (Score 0-100)
2. **Language Fit** — Vocabulary, formality level, jargon usage appropriate? (Score 0-100)
3. **Values Alignment** — Does it reflect brand values? (Score 0-100)
4. **Audience Match** — Would the target audience connect with this? (Score 0-100)
5. **Overall Score** — Weighted average (Score 0-100)

For each issue found:
- Quote the specific problematic phrase
- Explain WHY it doesn't fit
- Provide a REWRITTEN version that matches brand voice

Respond in JSON:
{
    "overallScore": 0,
    "scores": { "toneConsistency": 0, "languageFit": 0, "valuesAlignment": 0, "audienceMatch": 0 },
    "verdict": "on-brand|mostly-on-brand|needs-work|off-brand",
    "summary": "2-3 sentence assessment",
    "issues": [
        { "originalPhrase": "", "problem": "", "suggestion": "", "severity": "high|medium|low" }
    ],
    "rewrittenVersion": "The entire text rewritten in perfect brand voice"
}`,
        systemPrompt: 'You are a brand strategist with an obsessive eye for voice consistency. You catch every off-brand phrase.',
        inputFields: [
            { name: 'textToAudit', label: 'Text to Audit', type: 'textarea', required: true, placeholder: 'Paste the text you want to check against your brand voice...' },
        ],
        outputFormat: 'structured',
        temperature: 0.3,
    },

    // ── 6. Customer Testimonial Formatter ──
    {
        name: 'Customer Testimonial Formatter',
        description: 'Convert raw customer feedback into polished social-ready testimonials with multiple format variants',
        category: 'content',
        tags: ['testimonials', 'social-proof', 'UGC', 'reviews'],
        icon: 'format_quote',
        color: 'teal',
        instructions: `Transform raw customer feedback into polished, platform-ready testimonials.

For each raw testimonial, generate:
1. **Social Media Version** — Instagram-ready with emojis, formatted for visual posts
2. **Website Version** — Professional, trust-building format for product pages
3. **Video Script** — 30-second script if the customer were to speak on camera
4. **Story Highlight** — Snackable quote for Instagram/WhatsApp stories
5. **Ad Copy Version** — Testimonial formatted as ad creative text

Also provide:
- Suggested visual pairing (photo style, background, typography)
- Best platform for each version
- Hashtag suggestions

Respond in JSON:
{
    "testimonials": [
        {
            "original": "",
            "customerName": "",
            "socialMedia": { "caption": "", "hashtags": [], "suggestedVisual": "" },
            "website": { "quote": "", "attribution": "" },
            "videoScript": "",
            "storyHighlight": "",
            "adCopy": "",
            "bestPlatform": ""
        }
    ]
}`,
        systemPrompt: 'You are a content specialist who turns real customer voices into compelling social proof that converts.',
        inputFields: [
            { name: 'rawFeedback', label: 'Raw Customer Feedback', type: 'textarea', required: true, placeholder: 'Paste customer reviews, DMs, emails, WhatsApp messages...' },
            { name: 'productName', label: 'Product/Service Name', type: 'text', required: false, placeholder: 'e.g., GlowSerum, FitBox Meals' },
        ],
        outputFormat: 'structured',
        temperature: 0.6,
    },

    // ── 7. Competitor Price Monitor Brief ──
    {
        name: 'Competitor Price Intelligence',
        description: 'Analyze competitor pricing strategies and get actionable recommendations for your pricing',
        category: 'performance',
        tags: ['pricing', 'competitor', 'strategy', 'D2C'],
        icon: 'price_change',
        color: 'orange',
        instructions: `You are a Pricing Strategist for D2C brands. Analyze the competitor landscape and provide pricing intelligence.

Based on the brand context and competitor information, analyze:
1. **Market Positioning Map** — Where does the brand sit vs competitors on price-value spectrum
2. **Pricing Opportunities** — Where can the brand adjust for better competitiveness
3. **Bundle Strategies** — Product bundling ideas with pricing
4. **Psychological Pricing** — Specific pricing recommendations using anchoring, charm pricing, etc.
5. **Seasonal Pricing Calendar** — When to run offers vs full-price periods

Respond in JSON:
{
    "positioning": { "current": "", "recommended": "", "rationale": "" },
    "competitorAnalysis": [{ "name": "", "priceRange": "", "strategy": "", "weakness": "" }],
    "opportunities": [{ "action": "", "expectedImpact": "", "risk": "", "timeline": "" }],
    "bundleIdeas": [{ "name": "", "products": [], "bundlePrice": "", "savings": "", "margin": "" }],
    "psychologicalPricing": [{ "tactic": "", "example": "", "why": "" }],
    "seasonalCalendar": [{ "period": "", "strategy": "", "discountRange": "" }]
}`,
        systemPrompt: 'You are a pricing strategist who has optimized pricing for 50+ Indian D2C brands. You balance margin protection with competitive positioning.',
        inputFields: [
            { name: 'priceRange', label: 'Your Price Range', type: 'text', required: true, placeholder: 'e.g., ₹499 - ₹2,999' },
            { name: 'competitors', label: 'Key Competitors', type: 'textarea', required: false, placeholder: 'List competitor names and their approximate pricing...' },
            { name: 'margins', label: 'Current Margins', type: 'select', required: false, options: ['Under 20%', '20-40%', '40-60%', '60%+', 'Prefer not to say'] },
        ],
        outputFormat: 'structured',
        temperature: 0.5,
    },

    // ── 8. UGC Brief Generator ──
    {
        name: 'UGC & Influencer Brief Generator',
        description: 'Create detailed briefs for influencers and UGC creators with brand guidelines, dos/donts, and content requirements',
        category: 'creative',
        tags: ['UGC', 'influencer', 'brief', 'creator'],
        icon: 'person_play',
        color: 'cyan',
        instructions: `Create a comprehensive influencer/UGC creator brief that ensures on-brand content delivery.

The brief must include:
1. **Campaign Overview** — Objective, key message, target audience
2. **Content Requirements** — Deliverables, formats, duration, platforms
3. **Brand Guidelines** — Do's and Don'ts, tone guidelines, visual style
4. **Key Talking Points** — What to say about the product
5. **Disclosure Requirements** — #ad, #sponsored, #collab tags
6. **Timeline** — Draft submission → Review → Revisions → Go-live
7. **Performance Expectations** — What success looks like

Respond in JSON:
{
    "briefTitle": "",
    "campaignOverview": { "objective": "", "keyMessage": "", "targetAudience": "" },
    "deliverables": [{ "type": "reel|post|story|video", "quantity": 0, "specs": "" }],
    "talkingPoints": [""],
    "dosList": [""],
    "dontsList": [""],
    "visualGuidelines": { "style": "", "colors": "", "mood": "" },
    "disclosureRequirements": "",
    "timeline": [{ "phase": "", "date": "", "action": "" }],
    "compensation": { "type": "paid|barter|affiliate", "suggested": "" }
}`,
        systemPrompt: 'You are an influencer marketing manager who creates briefs that deliver on-brand, high-performing UGC content.',
        inputFields: [
            { name: 'campaignGoal', label: 'Campaign Goal', type: 'select', required: true, options: ['Product Launch', 'Brand Awareness', 'Sales/Conversion', 'Content Library Building', 'Event Promotion'] },
            { name: 'platforms', label: 'Target Platforms', type: 'text', required: false, placeholder: 'e.g., Instagram Reels, YouTube Shorts' },
            { name: 'creatorType', label: 'Creator Type', type: 'select', required: false, options: ['Nano (1-10K)', 'Micro (10-50K)', 'Mid (50-500K)', 'Macro (500K+)', 'Celebrity'] },
            { name: 'requirements', label: 'Specific Requirements', type: 'textarea', required: false, placeholder: 'Any must-haves, product features to highlight, etc.' },
        ],
        outputFormat: 'structured',
        temperature: 0.6,
    },

    // ── 9. ROAS Optimization Brief ──
    {
        name: 'ROAS Optimization Brief',
        description: 'Analyze campaign performance data and get actionable recommendations for improving Return on Ad Spend',
        category: 'performance',
        tags: ['ROAS', 'ads', 'optimization', 'performance', 'meta', 'google'],
        icon: 'trending_up',
        color: 'emerald',
        instructions: `You are a Performance Marketing Expert. Analyze the provided campaign data and create an optimization brief.

Analyze:
1. **ROAS Diagnosis** — Current ROAS vs target, trend direction, key bottlenecks
2. **Budget Reallocation** — Which campaigns/adsets need more/less budget
3. **Creative Recommendations** — Which ad creatives are fatiguing, what to test next
4. **Audience Optimization** — Expand, narrow, or switch audience strategies
5. **Bid Strategy** — Recommended bidding approach per campaign objective
6. **Quick Wins** — Changes you can make TODAY for immediate improvement

Respond in JSON:
{
    "currentROAS": "",
    "targetROAS": "",
    "diagnosis": "",
    "budgetRecommendations": [{ "campaign": "", "action": "increase|decrease|pause|test", "reason": "", "amount": "" }],
    "creativeRecommendations": [{ "current": "", "issue": "", "suggestion": "", "priority": "" }],
    "audienceOptimization": [{ "current": "", "recommendation": "", "expectedImpact": "" }],
    "bidStrategy": { "recommendation": "", "reason": "" },
    "quickWins": [{ "action": "", "impact": "high|medium", "effort": "5min|30min|1hr" }],
    "weeklyPlan": { "week1": [], "week2": [], "week3": [], "week4": [] }
}`,
        systemPrompt: 'You are a performance marketing expert who manages ₹10Cr+ in annual ad spend for Indian D2C brands. You optimize for profitable growth.',
        inputFields: [
            { name: 'currentROAS', label: 'Current ROAS', type: 'text', required: true, placeholder: 'e.g., 2.5x' },
            { name: 'targetROAS', label: 'Target ROAS', type: 'text', required: false, placeholder: 'e.g., 4x' },
            { name: 'monthlyBudget', label: 'Monthly Ad Budget', type: 'text', required: false, placeholder: 'e.g., ₹5L' },
            { name: 'platforms', label: 'Active Platforms', type: 'text', required: false, placeholder: 'e.g., Meta Ads, Google Ads, YouTube' },
            { name: 'challenges', label: 'Current Challenges', type: 'textarea', required: false, placeholder: 'What\'s not working? Rising CPAs, low CTR, audience saturation...' },
        ],
        outputFormat: 'structured',
        temperature: 0.5,
    },

    // ── 10. Seasonal Trend Spotter ──
    {
        name: 'Seasonal Trend Spotter',
        description: 'Discover trending topics, keywords, and content opportunities for the upcoming Indian season',
        category: 'seo',
        tags: ['trends', 'seasonal', 'keywords', 'india', 'content-ideas'],
        icon: 'local_fire_department',
        color: 'orange',
        instructions: `You are a Trends & Content Intelligence Analyst for Indian D2C brands.

Analyze the current/upcoming season and provide:
1. **Trending Topics** — What's buzzing in the brand's industry right now
2. **Seasonal Keywords** — High-volume search terms for the upcoming period
3. **Content Opportunities** — Specific content pieces the brand should create NOW
4. **Social Trends** — Trending formats, audios, challenges on Instagram/YouTube
5. **Calendar Hooks** — Upcoming dates/events to piggyback on
6. **Competitor Activity** — What competitors are likely planning

Respond in JSON:
{
    "season": "",
    "trendingTopics": [{ "topic": "", "relevance": "high|medium", "contentAngle": "", "platforms": [] }],
    "seasonalKeywords": [{ "keyword": "", "volume": "high|medium|low", "competition": "", "contentType": "" }],
    "contentOpportunities": [{ "title": "", "format": "blog|reel|carousel|video|email", "urgency": "this-week|this-month|upcoming", "expectedImpact": "" }],
    "socialTrends": [{ "trend": "", "platform": "", "howToAdopt": "", "exampleCaption": "" }],
    "calendarHooks": [{ "date": "", "event": "", "contentIdea": "" }],
    "competitorMoves": [{ "likely": "", "yourCounter": "" }],
    "topPriorities": ["Top 3 things to do THIS WEEK"]
}`,
        systemPrompt: 'You are a trends analyst who helps Indian D2C brands ride cultural waves and seasonal moments for maximum organic and paid reach.',
        inputFields: [
            { name: 'timeframe', label: 'Timeframe', type: 'select', required: false, options: ['This Week', 'Next 2 Weeks', 'This Month', 'Next Quarter'] },
            { name: 'platforms', label: 'Focus Platforms', type: 'text', required: false, placeholder: 'e.g., Instagram, YouTube, Google' },
        ],
        outputFormat: 'structured',
        temperature: 0.7,
    },
];


// ============================================================================
// SEED FUNCTION
// ============================================================================

export async function seedDefaultSkills() {
    try {
        // Use a system user ID for pre-built skills (or the first admin user)
        const User = (await import('../models/User.js')).default;
        const admin = await User.findOne({}).sort({ createdAt: 1 }).lean();
        if (!admin) {
            console.warn('⚠️ No users found — skipping skill seed');
            return;
        }

        const operations = DEFAULT_SKILLS.map(skill => ({
            updateOne: {
                filter: { name: skill.name, isPrebuilt: true },
                update: {
                    $setOnInsert: {
                        ...skill,
                        user: admin._id,
                        isPrebuilt: true,
                        status: 'active',
                        visibility: 'marketplace',
                        version: 1,
                        changelog: [{ version: 1, changes: 'Initial release', date: new Date() }],
                    }
                },
                upsert: true,
            }
        }));

        const result = await Skill.bulkWrite(operations);
        console.log(`🌱 Skills seeded: ${result.upsertedCount} new, ${result.modifiedCount} updated`);
        return result;
    } catch (error) {
        console.error('Skill seed error:', error.message);
        throw error;
    }
}
