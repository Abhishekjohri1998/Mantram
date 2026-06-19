/**
 * Growth Content Engine — Daily Social Media Content Generator
 * 
 * Generates platform-specific marketing content for Mantram AI using Claude (writing)
 * and Grok (trending topics). Driven by a 30-day fixed itinerary to guarantee unique content daily.
 */

import GrowthContent from '../models/GrowthContent.js';
import Brand from '../models/Brand.js';
import { getAIRouter } from '../ai/router.js';

// ══════════════════════════════════════════════════════════════
// 30-DAY FIXED ITINERARY
// ══════════════════════════════════════════════════════════════
const ITINERARY = [
    {
        day: 1,
        title: "Quitting Corporate to Build for Indian D2C",
        theme: "founder_journey",
        focusTopic: "How and why the co-founders Sachin & Abhishek quit their corporate jobs 18 months ago with zero funding to build Mantram AI specifically for Indian D2C brands.",
        talkingPoints: [
            "Quitting secure jobs 18 months ago to bootstrap from a tiny apartment in Bangalore.",
            "Observing Indian D2C founders wasting ₹4.5L/month on 6 disconnected US tools (Canva, SEMrush, Buffer, Klaviyo, Jasper, and high-priced agencies).",
            "Deciding to stay bootstrapped (zero funding) to build a platform tailored specifically for India (Hinglish support, Indian festival calendars, UPI support)."
        ],
        linkedinTopic: "A reflective founder story about the transition from corporate comfort to the chaos of bootstrapping a regional-first SaaS.",
        instagramTopic: "Carousel explaining: 'Why we quit our jobs to save D2C brands money.' Reel: A quick walkthrough showing our early messy workspace vs the polished app today.",
        twitterTopic: "A raw standalone tweet and a 4-tweet thread detailing the decision process, early doubt, and first customer validation.",
        redditTopic: "A raw post in r/startups about bootstrapping a SaaS in India with zero VC money, focusing on early customer acquisition."
    },
    {
        day: 2,
        title: "The 90-Second Brand DNA Scanner",
        theme: "product_feature",
        focusTopic: "The power of Brand DNA: enter a website URL, wait 90 seconds, and the AI automatically indexes all fonts, colors, brand voice, target audience, and competitors.",
        talkingPoints: [
            "Standard AI tools (like ChatGPT) require you to copy-paste your brand description every single time.",
            "Mantram's Brand DNA scans website assets and builds a single persistent, immutable JSON profile.",
            "All 14 studios (Content, Video, Creative, etc.) read from this Brand DNA, ensuring perfect visual and tonal consistency."
        ],
        linkedinTopic: "A product teardown explaining why persistent brand context is the single biggest bottleneck in marketing automation.",
        instagramTopic: "Carousel showing before/after: 'Entering URL' -> 'AI building Brand DNA profile' (fonts, hex codes, target avatars). Reel: 30s screen recording of onboarding.",
        twitterTopic: "Standalone tweet on the death of copy-pasting prompts, and a thread explaining the technical logic of visual color extraction.",
        redditTopic: "A post in r/shopify explaining how D2C merchants can automate brand onboarding and asset creation in 90 seconds."
    },
    {
        day: 3,
        title: "Why SEO is Dying and AEO is the Future",
        theme: "industry_trend",
        focusTopic: "Answer Engine Optimization (AEO): how the rise of ChatGPT search, Perplexity, and Gemini is replacing traditional search engines, and how Mantram tracks citations.",
        talkingPoints: [
            "Over 70% of informational queries are answered directly by AI search engines without clicking links.",
            "Traditional Google SEO is becoming obsolete. The new goal is getting cited by LLMs.",
            "Mantram is the first platform to feature an AEO Probe that queries ChatGPT, Perplexity, and Gemini to track if your brand is cited."
        ],
        linkedinTopic: "A strategic overview of the shift from SEO to AEO, backed by search engine query data and organic traffic declines.",
        instagramTopic: "Visual carousel: 'The Death of Google Search: What is AEO?' Reel: Talking-head explaining why optimizing for AI citations is the new SEO.",
        twitterTopic: "A punchy standalone tweet about Perplexity/ChatGPT search growth, and a thread detailing how to optimize your site for LLM crawlers.",
        redditTopic: "An educational post in r/digital_marketing outlining a tactical roadmap for Answer Engine Optimization."
    },
    {
        day: 4,
        title: "The Economics of ₹33 ($0.40) UGC Video Ads",
        theme: "cost_reduction",
        focusTopic: "How AI video generation models (Veo, Seedance, Fal) enable D2C brands to generate high-converting video creatives at 1,200x lower cost than agencies.",
        talkingPoints: [
            "Content agencies charge ₹40,000 to ₹4,00,000 per UGC video ad, taking weeks to deliver.",
            "Mantram's Video Studio uses 7 integrated AI video models to generate high-converting short-form video ads for ₹33 ($0.40) per clip.",
            "D2C brands can generate and test 50 different video concepts for the price of one traditional agency video."
        ],
        linkedinTopic: "A numbers-driven breakdown of ad creative testing velocity: why content volume beats high-budget single creatives.",
        instagramTopic: "Carousel comparing: 'Agency Video (₹40K, 3 weeks)' vs 'Mantram AI Video (₹33, 30 seconds)'. Reel: Side-by-side clip comparison showing AI video quality.",
        twitterTopic: "Punchy standalone tweet on D2C marketing economics, and a thread breaking down model routing in video production.",
        redditTopic: "A post in r/ecommerce discussing the unit economics of generating ad creatives at scale using AI."
    },
    {
        day: 5,
        title: "The 4-Agent Creative Studio Pipeline",
        theme: "technical_deep_dive",
        focusTopic: "How Mantram's multi-agent pipeline (Art Director, Prompt Engineer, Style Critic, Generator) solves text-on-image hallucination.",
        talkingPoints: [
            "Standard image models (like Midjourney or Imagen) struggle with text-on-image and brand style rules.",
            "Mantram uses a 4-agent system: Art Director designs the layout, Prompt Engineer formats prompts, Generator creates, and Style Critic audits.",
            "The Style Critic automatically rejects off-brand or distorted text outputs before the user ever sees them."
        ],
        linkedinTopic: "A deep dive into multi-agent orchestration for creative workflows and why single-prompt generation is dead.",
        instagramTopic: "Carousel explaining: 'How our 4 AI Agents design graphics for your brand.' Reel: Visual step-by-step breakdown showing the agents interacting.",
        twitterTopic: "Tech tweet explaining prompt chains and critique loops, and a thread on solving text rendering issues in generative AI.",
        redditTopic: "A post in r/artificial sharing the architecture of a multi-agent system designed for automated graphic design."
    },
    {
        day: 6,
        title: "Native Regional Marketing Moat",
        theme: "moat_feature",
        focusTopic: "Natively generating marketing content in 9 Indian languages (Hinglish, Hindi, Tamil, Telugu, etc.) with cultural nuances, not lazy translation.",
        talkingPoints: [
            "US marketing tools localized for India use basic Google Translate, missing Hinglish slag and local context.",
            "Mantram integrates regional LLMs (like Sarvam AI) to write copy directly in Indian languages with cultural nuances.",
            "Support for 9 languages enables D2C brands to target tier-2 and tier-3 Indian cities with authentic campaigns."
        ],
        linkedinTopic: "Why the next 100M Indian e-commerce buyers require regional-first messaging, not translated English ads.",
        instagramTopic: "Carousel: 'Why copy-pasted translation fails in Indian ads.' Reel: Showing a product caption dynamically generated in perfect Hinglish vs formal Hindi.",
        twitterTopic: "A quick tweet on regional D2C demographics, and a thread on building multilingual SaaS applications for the Indian market.",
        redditTopic: "A post in r/IndianStartups discussing the tier-2/3 market opportunity and how regional language ads affect CAC."
    },
    {
        day: 7,
        title: "Building the Marketing OS",
        theme: "vision_inspiration",
        focusTopic: "The vision behind Mantram AI as a single unified Marketing OS that replaces Canva, Buffer, Klaviyo, SEMrush, and video agencies.",
        talkingPoints: [
            "Modern marketing stacks are fragmented: data is trapped in separate tool silos.",
            "Mantram is a single operating system where the content agent, video agent, and email agent all share the same Brand DNA.",
            "Replacing 6 tools saves up to $1,500/month and eliminates context switching for marketing teams."
        ],
        linkedinTopic: "A macro view of SaaS consolidation: why point solutions are dying and unified workflow systems are winning.",
        instagramTopic: "Carousel outlining the 'Franken-stack' of tools vs the unified Mantram dashboard. Reel: High-tempo interface tour of 3 key studios in 30 seconds.",
        twitterTopic: "Standalone tweet on SaaS fatigue, and a thread detailing the cost savings of consolidation.",
        redditTopic: "A post in r/SaaS discussing why unified dashboards are replacing niche APIs for non-technical users."
    },
    {
        day: 8,
        title: "Behind the Scenes: Meta Posting Delays",
        theme: "founder_journey",
        focusTopic: "The technical challenge of social media API publishing and why we had to build anti-mimicry delays to prevent accounts getting flagged.",
        talkingPoints: [
            "Direct publishing tools often publish at exact clock times, triggering bot detection on Instagram and Facebook.",
            "We built random posting windows and typing-pattern mimicry delays to simulate human activity.",
            "Debugging social APIs taught us that reliability in SaaS is built in the edge cases, not the main path."
        ],
        linkedinTopic: "A technical/operational story about building resilience into social media API integrations.",
        instagramTopic: "Carousel explaining: 'How we stop Meta from flagging your automated posts.' Reel: Showing our server queue logs during a scheduled post run.",
        twitterTopic: "Short tweet about rate limits and bot flags, and a thread on building human-like queues in Node.js.",
        redditTopic: "A technical post in r/SaaS about handling Meta Graph API limitations and account safety."
    },
    {
        day: 9,
        title: "Pricing Command Center & Competitor Monitoring",
        theme: "product_feature",
        focusTopic: "How Mantram monitors competitor pricing and dynamic margins to auto-trigger ad and retention campaigns.",
        talkingPoints: [
            "Most D2C brands check competitor prices manually or use clunky scrapers that don't talk to their ads.",
            "Mantram monitors competitor pricing daily and calculates recommended dynamic packaging options.",
            "Integrates with the automation engine: if a competitor drops their price, Mantram auto-generates a matched discount ad."
        ],
        linkedinTopic: "How automated pricing intelligence changes the game for D2C margins in competitive markets.",
        instagramTopic: "Carousel: 'Automate your pricing intelligence.' Reel: Showing the workflow of competitor price drop -> auto ad creation.",
        twitterTopic: "Tweet on margin protection, and a thread breaking down the automated trigger workflow.",
        redditTopic: "A post in r/ecommerce about setting up dynamic pricing triggers to counter competitor price drops."
    },
    {
        day: 10,
        title: "The Moat of Model-Agnosticism",
        theme: "industry_trend",
        focusTopic: "Why choosing a model-agnostic architecture keeps Mantram future-proof as Claude, Gemini, and OpenAI swap leading positions.",
        talkingPoints: [
            "SaaS startups locked into a single LLM API (like OpenAI) become obsolete when competitors ship better models.",
            "Mantram's ModelRouter selects the best LLM per task: Claude for writing, Gemini for visual scanning, xAI for trends.",
            "New models are integrated within 48 hours of release, ensuring our users always use the absolute best tech."
        ],
        linkedinTopic: "A strategic discussion on avoiding API lock-in and why model routers are the future of AI software.",
        instagramTopic: "Carousel: 'Why we don't use just one AI model.' Reel: Visual routing guide showing how different prompts go to different models.",
        twitterTopic: "Tweet on future-proofing SaaS infrastructure, and a thread on building a reliable fallback model router.",
        redditTopic: "A post in r/SaaS about the architecture of our ModelRouter and why we chose a multi-provider setup."
    },
    {
        day: 11,
        title: "Amazon-to-D2C Customer Migration",
        theme: "problem_solution",
        focusTopic: "How D2C brands use Mantram to migrate Amazon customers to their Shopify store to reclaim margin and customer data.",
        talkingPoints: [
            "Amazon keeps customer emails and data, charging high fees that eat into merchant margins.",
            "Mantram matches Amazon customer names/orders with Shopify profiles and creates personalized 'buy direct' offers.",
            "Generates targeted retention campaigns via SMS and email with dynamic coupon rewards."
        ],
        linkedinTopic: "A deep dive into customer ownership: why D2C brands must migrate off third-party marketplaces.",
        instagramTopic: "Carousel: 'Reclaim your customers from Amazon.' Reel: Screen capture showing the upload of Amazon report -> dynamic coupon generation.",
        twitterTopic: "Tweet on Amazon fee structures, and a thread on marketing funnels for customer migration.",
        redditTopic: "A post in r/shopify discussing concrete tactics for migrating marketplace buyers to a native store."
    },
    {
        day: 12,
        title: "Scaling Async Jobs with Redis and Bull Queues",
        theme: "technical_deep_dive",
        focusTopic: "How we scale heavy async tasks like 4K video rendering and crawls using Redis, Bull queues, and PM2.",
        talkingPoints: [
            "AI video rendering and webpage crawling are CPU-heavy and cannot run on the main HTTP thread.",
            "We run modular workers using Bull Queues and Redis to guarantee task execution even under high traffic.",
            "Implemented PM2 cluster mode for zero-downtime hot reloads and automated worker restarts."
        ],
        linkedinTopic: "A technical write-up on scaling background workers for resource-heavy generative AI applications.",
        instagramTopic: "Carousel: 'Under the Hood: How we render AI video at 3 AM.' Reel: Behind-the-scenes look at our Redis/Bull dashboard during high load.",
        twitterTopic: "Tech tweet on Node.js clustering, and a thread on configuring Bull queues for CPU-intensive tasks.",
        redditTopic: "A technical post in r/SaaS sharing our devops stack and lessons learned managing async video jobs."
    },
    {
        day: 13,
        title: "The Agency Deal Multiplier",
        theme: "founder_journey",
        focusTopic: "How shifting focus from single D2C brands to marketing agencies unlocked rapid customer growth.",
        talkingPoints: [
            "Acquiring individual brands was slow, with high churn and long sales cycles.",
            "We realized agencies manage 10-50 brands each and need a way to speed up creative production.",
            "By shipping agency multi-tenant dashboards, one agency deal onboarded 20 brands in a single day."
        ],
        linkedinTopic: "A B2B marketing lesson on leverage: why partner channels and agencies are the ultimate growth loops.",
        instagramTopic: "Carousel: 'How agencies use Mantram to scale their client lists.' Reel: Quick tour of the multi-brand switching feature in the header.",
        twitterTopic: "Tweet on SaaS distribution, and a thread detailing our pivot to agency-focused features.",
        redditTopic: "A post in r/Entrepreneur about B2B customer acquisition and finding high-leverage user segments."
    },
    {
        day: 14,
        title: "Practical Guide to Answer Engine Optimization",
        theme: "educational",
        focusTopic: "Actionable tactics for optimizing your website content to be cited by Perplexity, ChatGPT search, and Gemini.",
        talkingPoints: [
            "AI search engines pull from clean structured data, clear FAQ formats, and high-authority blog posts.",
            "Avoid complex Javascript rendering that blocks LLM bots. Keep content semantic and crawlable.",
            "Mantram analyzes site structure and suggests target keywords for LLM grounding."
        ],
        linkedinTopic: "An actionable step-by-step checklist to prepare your company website for the AI search revolution.",
        instagramTopic: "Carousel: '3 Steps to Optimize for AI Search.' Reel: Talking head walking through an actual Perplexity search citation.",
        twitterTopic: "Tweet on schema markup for AI, and a thread on semantic SEO best practices.",
        redditTopic: "An educational post in r/seo outlining specific code and content structures that attract AI citations."
    },
    {
        day: 15,
        title: "Building a Canvas Editor from Scratch",
        theme: "technical_deep_dive",
        focusTopic: "The engineering challenges of building a custom Canva-like editor with canvas-direct, Fabric.js, and S3 proxies.",
        talkingPoints: [
            "Using pre-built iframe editors limited our control and caused UI lag.",
            "We built a custom Fabric.js editor with custom text layers, shape overlays, and brand color locking.",
            "Faced major CORS issues with S3 media URLs, solved by routing image fetches through a Node.js proxy buffer."
        ],
        linkedinTopic: "Why custom UI engineering beats off-the-shelf components for core product features.",
        instagramTopic: "Carousel: 'Inside our Canvas Editor.' Reel: Time-lapse screen recording of a user designing an ad template.",
        twitterTopic: "Tech tweet on Fabric.js and S3 CORS, and a thread detailing canvas optimization tips.",
        redditTopic: "A post in r/SaaS about the frontend challenges of building an interactive graphics editor."
    },
    {
        day: 16,
        title: "Why US SaaS Tools Fail Indian Merchants",
        theme: "industry_trend",
        focusTopic: "How US-built SaaS products fail to address the unique logistical and financial realities of Indian D2C.",
        talkingPoints: [
            "Indian D2C is defined by high Cash-on-Delivery (COD) orders, UPI payment drop-offs, and WhatsApp-first communication.",
            "US tools focus on email (low open rates in India) and Stripe (high international fees).",
            "Mantram is built for India: integrates UPI recovery flows, WhatsApp-first alerts, and Razorpay."
        ],
        linkedinTopic: "Why localization is not enough: why Indian e-commerce requires natively designed marketing software.",
        instagramTopic: "Carousel: 'Why US tools fail Indian D2C brands.' Reel: Showcasing our Razorpay and WhatsApp integration in action.",
        twitterTopic: "Tweet on Indian e-commerce statistics, and a thread on building regional-first software.",
        redditTopic: "A post in r/IndianStartups discussing the localized moats in Indian SaaS compared to global giants."
    },
    {
        day: 17,
        title: "Automating Cart Recovery with AI Tonal Flows",
        theme: "product_feature",
        focusTopic: "Recovering lost revenue using personalized recovery copy that matches the user's demographic.",
        talkingPoints: [
            "Standard cart abandonment emails have a 2% recovery rate because they sound generic.",
            "Mantram uses customer purchase data and Brand DNA to write personalized WhatsApp recovery copy.",
            "Automatically adjusts tone: formal Hindi for tier-2 shoppers, casual Hinglish for gen-z buyers."
        ],
        linkedinTopic: "How dynamic personalization and localized copywriting affect cart recovery conversions.",
        instagramTopic: "Carousel: 'Stop sending boring cart recovery texts.' Reel: Showing the workflow of cart drop-off -> dynamic WhatsApp generation.",
        twitterTopic: "Tweet on abandoned cart statistics, and a thread on building dynamic message templates.",
        redditTopic: "A post in r/shopify sharing how to write cart recovery flows that convert without annoying customers."
    },
    {
        day: 18,
        title: "Virtual Brand Ambassadors: HeyGen & Avatar Studio",
        theme: "product_feature",
        focusTopic: "Using AI-generated talking-head avatars for scalable video ad production without spokesperson costs.",
        talkingPoints: [
            "Hiring video spokespeople is expensive and doesn't scale for daily testing.",
            "Mantram's Avatar Studio generates realistic talking-head videos with custom scripts in seconds.",
            "Integrates HeyGen and local API wrappers to generate virtual brand ambassadors in 9 Indian languages."
        ],
        linkedinTopic: "How AI avatars are democratizing video production for early-stage bootstrapped brands.",
        instagramTopic: "Carousel: 'Meet your new AI spokesperson.' Reel: A clean 15s clip of an AI avatar presenting a product.",
        twitterTopic: "Tweet on video production costs, and a thread on building AI talking-head integrations.",
        redditTopic: "A post in r/ecommerce debating the conversion rates of AI avatars vs real humans in Facebook ads."
    },
    {
        day: 19,
        title: "The Automation Moat: Trigger-based Campaigns",
        theme: "problem_solution",
        focusTopic: "Building automated marketing rules that link competitive data to ad creation and publishing.",
        talkingPoints: [
            "Most automations only cover simple email triggers. Mantram links market intelligence to creative output.",
            "Example rule: 'If a competitor drops their price, auto-generate a matching ad graphic and launch it on Meta.'",
            "Closes the loop between intelligence gathering and execution without human delay."
        ],
        linkedinTopic: "Moving from passive analytics to active execution: why automation must generate assets, not just send alerts.",
        instagramTopic: "Carousel: 'Automations that write ads for you.' Reel: Walking through the creation of a competitor price drop trigger.",
        twitterTopic: "Tweet on automated ad launching, and a thread on building event-driven marketing workflows.",
        redditTopic: "A post in r/digital_marketing about connecting scraping tools to automated ad generation."
    },
    {
        day: 20,
        title: "Bootstrapping to $10k MRR: Co-founder Realities",
        theme: "founder_journey",
        focusTopic: "The honest, raw realities of bootstrapping a complex SaaS to $10k MRR with only two people.",
        talkingPoints: [
            "No specialized departments: co-founders handle everything from system architecture to customer chat.",
            "Prioritization is the ultimate survival skill. If it doesn't acquire users or prevent churn, it doesn't get built.",
            "Staying close to the code allows us to ship fixes in minutes, creating a massive support moat."
        ],
        linkedinTopic: "A personal reflection on the trade-offs of bootstrapping vs venture capital in the SaaS space.",
        instagramTopic: "Carousel: 'A day in the life of a bootstrapped SaaS founder.' Reel: A fast-paced compilation of commits, support calls, and database fixes.",
        twitterTopic: "Tweet on co-founder relationships under stress, and a thread on bootstrapping metrics.",
        redditTopic: "A vulnerable post in r/startups about the mental toll and operational realities of building solo/duo."
    },
    {
        day: 21,
        title: "Festival-Aware Campaigns: Makar Sankranti to Diwali",
        theme: "moat_feature",
        focusTopic: "How Mantram's Indian festival calendar automatically prepares and schedules regional D2C campaigns.",
        talkingPoints: [
            "Indian retail revenue peaks during cultural festivals, but preparing graphics and copy takes massive effort.",
            "Mantram features a festival-aware calendar that automatically triggers campaign generation 10 days before any holiday.",
            "Customized creatives: regional graphics for Makar Sankranti, special discount overlays for Diwali."
        ],
        linkedinTopic: "Leveraging cultural event cycles: why automated festival calendars are essential for Indian retail SaaS.",
        instagramTopic: "Carousel: 'Diwali is coming: is your marketing automated?' Reel: Showing the calendar tab and how it auto-generates assets.",
        twitterTopic: "Tweet on festival shopping volume in India, and a thread on building time-sensitive campaign triggers.",
        redditTopic: "A post in r/IndianStartups discussing retail sales spikes during Navratri/Diwali and automation."
    },
    {
        day: 22,
        title: "Multimodal Vision AI for Product Photo Scanning",
        theme: "technical_deep_dive",
        focusTopic: "Using vision LLMs to extract item attributes (shape, texture, color) from photos to ensure ad accuracy.",
        talkingPoints: [
            "Standard AI image generators often generate generic product drawings that don't match what you actually sell.",
            "Mantram uses multimodal vision APIs to analyze your actual product photos and feed details into the prompt.",
            "Ensures generated visuals accurately represent the item's material, color, and design."
        ],
        linkedinTopic: "Why visual attribute extraction is critical for product-accurate generative marketing.",
        instagramTopic: "Carousel: 'How AI analyzes your product photos.' Reel: Showing a product photo being scanned and converted into attributes.",
        twitterTopic: "Tweet on multimodal LLMs for e-commerce, and a thread on visual prompt engineering.",
        redditTopic: "A post in r/artificial about using vision LLMs for catalog indexing and automatic ad styling."
    },
    {
        day: 23,
        title: "Why Content Agencies are Afraid of AI",
        theme: "industry_trend",
        focusTopic: "The collapsing economics of content creation as AI agent pipelines replace basic copy and visual tasks.",
        talkingPoints: [
            "Traditional agencies charge high retainers for basic image asset production and caption writing.",
            "AI agents write higher-converting copy and design balanced layouts in seconds for a fraction of the cost.",
            "The role of the marketer is shifting from manual asset production to strategic direction and curation."
        ],
        linkedinTopic: "The shifting talent landscape: why modern marketing agencies must evolve into AI-powered shops.",
        instagramTopic: "Carousel: 'Is your marketing agency obsolete?' Reel: Talking-head addressing the changing pricing models of D2C creative.",
        twitterTopic: "Tweet on agency pricing collapse, and a thread on the future of creative marketing jobs.",
        redditTopic: "A post in r/entrepreneur discussing the transition from hiring marketing agencies to using AI tools."
    },
    {
        day: 24,
        title: "Solving 'Tonal Split' across Marketing Channels",
        theme: "problem_solution",
        focusTopic: "How persistent Brand DNA keeps your voice consistent across Instagram memes, formal emails, and ad copy.",
        talkingPoints: [
            "Many brands suffer from split personalities: their emails sound stuffy but their social media is overly casual.",
            "Mantram enforces tonal guidelines derived from the central Brand DNA across all outputs.",
            "Adjusts format while maintaining core brand values, keeping messaging cohesive."
        ],
        linkedinTopic: "The cost of inconsistent branding: why customer trust depends on cohesive tonal execution.",
        instagramTopic: "Carousel: 'Does your brand have a split personality?' Reel: Tonal comparison showing a brand voice successfully translated across channels.",
        twitterTopic: "Tweet on brand voice consistency, and a thread on programming tonal parameters in LLMs.",
        redditTopic: "A post in r/digital_marketing sharing templates for maintaining brand voice consistency across channels."
    },
    {
        day: 25,
        title: "Designing for 'Ad Blindness'",
        theme: "educational",
        focusTopic: "Using micro-animations, structured templates, and color harmony to stand out in crowded social feeds.",
        talkingPoints: [
            "Users scroll past generic static ads. Modern campaigns require thumb-stopping visual patterns.",
            "Mantram's Creative Studio uses color palette engines to select high-contrast, harmonious brand colors.",
            "Generates templates optimized for high click-through rates based on historical ad performance data."
        ],
        linkedinTopic: "The psychology of visual attention: how to design digital ad layouts that bypass scroll fatigue.",
        instagramTopic: "Carousel: 'How to design thumb-stopping ads.' Reel: Showing standard templates vs high-performance contrast layouts.",
        twitterTopic: "Tweet on click-through rate statistics, and a thread on visual hierarchy in mobile ads.",
        redditTopic: "A post in r/digital_marketing sharing visual styling tips to improve CTR on Meta and TikTok ads."
    },
    {
        day: 26,
        title: "Building an AI Router with Circuit Breakers",
        theme: "technical_deep_dive",
        focusTopic: "The technical details of building a resilient ModelRouter that handles API outages and quota limits.",
        talkingPoints: [
            "Third-party AI APIs frequently experience transient outages (503 errors) or quota limits.",
            "We built a circuit breaker pattern: 3 failed requests in 2 minutes trips the circuit, routing requests to backup LLMs.",
            "Prevents users from experiencing errors during generation, keeping the dashboard reliable."
        ],
        linkedinTopic: "How to build high-availability AI features: lessons from building our ModelRouter.",
        instagramTopic: "Carousel: 'What happens when ChatGPT goes down?' Reel: Flow diagram showing request routing and automated failover in action.",
        twitterTopic: "Tech tweet on circuit breaker code snippets in Node.js, and a thread on multi-LLM hosting.",
        redditTopic: "A technical post in r/SaaS about architecture strategies for handling OpenAI/Anthropic API downtime."
    },
    {
        day: 27,
        title: "Our First 100 Users: Feature Desires vs Reality",
        theme: "founder_journey",
        focusTopic: "How user feedback forced us to simplify from 14 complex studios to a unified onboarding and generation flow.",
        talkingPoints: [
            "We launched with 14 distinct agent studios, thinking users wanted maximum options.",
            "Founders were overwhelmed. They wanted a 'do it for me' button, not 14 separate dashboards.",
            "We pivoted to focus heavily on the automated Brand DNA setup and unified daily growth suggestions."
        ],
        linkedinTopic: "Product-market fit realities: why you should build for user outcomes, not feature checklist length.",
        instagramTopic: "Carousel: 'What we learned from our first 100 users.' Reel: Side-by-side dashboard UI comparison (v1 vs the current version).",
        twitterTopic: "Tweet on feature bloat, and a thread on simplifying user onboarding flows.",
        redditTopic: "A post in r/Entrepreneur about product simplification and user retention lessons in early SaaS."
    },
    {
        day: 28,
        title: "Direct Publishing: TikTok and Pinterest",
        theme: "product_feature",
        focusTopic: "Overcoming security and CORS hurdles to support direct video publishing to social channels.",
        talkingPoints: [
            "Direct publishing APIs require complex OAuth configurations and strict video format validation.",
            "We integrated TikTok's Content Publishing API and Pinterest boards directly into our scheduler.",
            "Saves hours of manual video downloading, transferring, and uploading for social managers."
        ],
        linkedinTopic: "How direct social API integrations improve user retention and daily active usage in marketing platforms.",
        instagramTopic: "Carousel: 'Publish to all platforms with 1 click.' Reel: Screen recording showing a reel being queued and automatically posted.",
        twitterTopic: "Tweet on social media API integrations, and a thread on handling video uploads via Node.js.",
        redditTopic: "A post in r/SaaS sharing the challenges of dealing with TikTok and Pinterest developer verification."
    },
    {
        day: 29,
        title: "Dynamic Creatives for Google PMax",
        theme: "problem_solution",
        focusTopic: "Generating high-converting text and visual assets optimized for Google Performance Max campaigns.",
        talkingPoints: [
            "Google Performance Max requires a massive mix of headlines, long descriptions, and varying image ratios.",
            "Creating these assets manually is tedious and results in repetitive copy.",
            "Mantram auto-generates complete ad bundles tailored to PMax layout specs and sizes from the Brand DNA."
        ],
        linkedinTopic: "How the rise of machine-learning ad networks changes the asset requirements for modern marketers.",
        instagramTopic: "Carousel: 'How to feed Google PMax campaigns the right assets.' Reel: Showing an ad asset bundle being prepared and exported.",
        twitterTopic: "Tweet on Google Ads strategy, and a thread on scaling creative asset production for PMax.",
        redditTopic: "A post in r/ecommerce discussing how to optimize creative assets for Google Performance Max."
    },
    {
        day: 30,
        title: "The Moat of SaaS + Credits Pricing",
        theme: "vision_inspiration",
        focusTopic: "Why we chose a combined SaaS subscription and credit-based model to align user growth with our API costs.",
        talkingPoints: [
            "Heavy generative AI tasks (like video rendering) have variable API costs that break standard SaaS pricing.",
            "A subscription fee covers platform access, while credits align generation costs directly with actual usage.",
            "Allows D2C brands to pay exactly for what they use, scaling their costs as their business grows."
        ],
        linkedinTopic: "A strategic overview of pricing models for generative AI SaaS: balancing API margins with customer value.",
        instagramTopic: "Carousel: 'How SaaS pricing is changing in the AI era.' Reel: Fast tour showing our credit dashboard and budget controls.",
        twitterTopic: "Tweet on pricing strategies for AI wrappers vs deep tools, and a thread on credit consumption models.",
        redditTopic: "A post in r/SaaS about structuring credit-based subscription models for heavy resource platforms."
    }
];

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
 * Build dynamic brand description context from Brand document
 */
async function getBrandContext(brandId) {
    if (!brandId) return null;
    try {
        const brand = await Brand.findById(brandId).lean();
        if (!brand) return null;

        const dna = brand.dna || {};
        const brandName = brand.name || '';
        const website = brand.website || '';
        const brandDescription = dna.brandDescription || '';
        const tagline = dna.tagline || '';
        const uniqueSellingPoints = Array.isArray(dna.uniqueSellingPoints) ? dna.uniqueSellingPoints.join(', ') : '';
        const brandValues = Array.isArray(dna.brandValues) ? dna.brandValues.join(', ') : '';
        const voicePersonality = dna.voice?.personality || '';
        const voiceDescription = dna.voice?.description || '';
        const toneInsight = dna.socialVoice?.toneInsight || '';
        
        // Retrieve crawled/onboarded knowledge bank entries
        let knowledgeContext = '';
        if (brand.knowledge && Array.isArray(brand.knowledge.entries)) {
            const entriesText = brand.knowledge.entries
                .filter(entry => entry.content && entry.content.trim())
                .map(entry => `[Knowledge Bank Entry: ${entry.title || 'Untitled'} (${entry.sourceType || 'Text'})]\n${entry.content.substring(0, 1500)}`)
                .join('\n\n');
            if (entriesText) {
                knowledgeContext = `\nBRAND KNOWLEDGE BANK ENTRIES:\n${entriesText}`;
            }
        }

        return {
            name: brandName,
            website,
            logoUrl: dna.logo?.url || '',
            description: `Brand Name: ${brandName}
Website: ${website}
Description: ${brandDescription}
Tagline: ${tagline}
Unique Selling Points: ${uniqueSellingPoints}
Brand Values: ${brandValues}
Voice/Tone Personality: ${voicePersonality} (${voiceDescription})
Social Voice Tone Insight: ${toneInsight}
${knowledgeContext}`.trim()
        };
    } catch (err) {
        console.error('Error fetching brand context for growth engine:', err);
        return null;
    }
}

/**
 * Build the master prompt for content generation
 */
function buildGenerationPrompt(dayOfWeek, itineraryDay, trendingTopics, subreddits, brandContext = null) {
    const trendSection = trendingTopics.length > 0
        ? `\n\nTRENDING TOPICS TODAY (weave 1-2 of these into your content naturally if relevant):\n${trendingTopics.map(t => `- ${t}`).join('\n')}`
        : '';

    let brandDetails = '';
    if (brandContext) {
        brandDetails = `ABOUT THE BRAND (use this context in all content, maintaining extreme visual and tonal consistency with the brand's DNA):
${brandContext.description}`;
    } else {
        brandDetails = `ABOUT MANTRAM AI (use this context in all content):
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
- Target: D2C brands doing $36K-$600K ARR, 5-50 person teams`;
    }

    const brandName = brandContext ? brandContext.name : 'Mantram AI';

    const adaptationInstruction = brandContext ? `
IMPORTANT ADAPTATION INSTRUCTIONS:
Today's theme/focus is: "${itineraryDay.title}"
The theme's focus topic is originally written for Mantram AI: "${itineraryDay.focusTopic}"
You MUST adapt this theme and talking points completely to the selected brand "${brandName}"! 
Translate the theme's core category (e.g. founder journey, feature highlight, industry trend, cost savings, educational guide, technical deep-dive) to fit "${brandName}"'s products, services, value proposition, and brand DNA. Use the brand description and details from the brand's knowledge bank entries.
Do NOT talk about Mantram AI, Sachin, Abhishek, 14 studios, or ₹33 video ads unless the selected brand is actually Mantram AI.` : '';

    return `You are a growth marketing content writer for ${brandName}.
${adaptationInstruction}

${brandDetails}

TODAY'S ITINERARY FOCUS: ${itineraryDay.title} (${dayOfWeek})
THEME: ${itineraryDay.theme}

CORE TOPIC DESCRIPTION:
${brandContext ? `[ADAPT THIS FOCUS TOPIC CATEGORY FOR ${brandName}]: ` : ''}${itineraryDay.focusTopic}

MANTATORY TALKING POINTS TO WEAVE IN (expand creatively, but adapt to ${brandName} if different from Mantram):
${itineraryDay.talkingPoints.map(p => `- ${p}`).join('\n')}

PLATFORM-SPECIFIC TARGET TOPICS (adapt these to ${brandName}):
- LinkedIn Post 1 & Post 2: ${itineraryDay.linkedinTopic}
- Instagram Carousel, Reel & Story: ${itineraryDay.instagramTopic}
- Twitter/X stand-alone & thread: ${itineraryDay.twitterTopic}
- Reddit posts: ${itineraryDay.redditTopic}
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
9. Instagram Reel script must be a COMPLETE shooting guide — scene-by-scene with shot type, duration, action to perform, voiceover narration, and text overlay. Think like a director giving instructions to a one-person crew. The "scenes" array MUST contain exactly 4 scenes (Scene 1 to Scene 4) to form a fast-paced 15-second Reel. Scene 1's voiceover MUST start with or be identical to the "hook" field. The voiceover and actions across all 4 scenes must flow logically, keep descriptions compact, and be completely related to the daily concept, daily itinerary theme, and brand DNA. Do NOT output other numbers of scenes; you must output a complete 4-scene list spanning exactly 15 seconds. CRITICAL: Presenter actions must show a proper moving person explaining while doing something in the scene (e.g. typing on a laptop, gesturing at a screen, pointing, walking, demonstrating features, interacting with props/environments) rather than just a boring, static talking head or moving head close-up.
10. If the selected brand has specific brand voice guidelines in the context (personality, tone, rules), prioritize those rules.

REDDIT SUBREDDITS FOR TODAY:
${subreddits.map(s => `- ${s.name}: Tone = ${s.tone}`).join('\n')}

Generate content for ALL platforms. Return as a single JSON object with this EXACT structure:

{
  "linkedin": [
    {
      "type": "${itineraryDay.theme}",
      "content": "Full post text here matching TODAY'S ITINERARY FOCUS adapted to ${brandName} (500-1500 chars). One sentence per paragraph. Use → for bullets.",
      "hashtags": ["#Hashtag1", "#Hashtag2"],
      "bestTime": "8:30 AM IST"
    },
    {
      "type": "${itineraryDay.theme}_alternate",
      "content": "Full post text here. Different angle from the first, but STILL matching TODAY'S ITINERARY FOCUS adapted to ${brandName}.",
      "hashtags": ["#Hashtag3"],
      "bestTime": "12:00 PM IST"
    }
  ],
  "instagram": {
    "post": {
      "caption": "Full caption text matching TODAY'S ITINERARY FOCUS adapted to ${brandName} (max 2200 chars). Include CTA.",
      "hashtags": ["#hashtag1", "#hashtag2"],
      "slides": [
        {"slideNumber": 1, "text": "Hook text for slide 1", "visualDescription": "Describe what the visual should show based on today's focus"},
        {"slideNumber": 2, "text": "Supporting text for slide 2", "visualDescription": "Visual description"},
        {"slideNumber": 3, "text": "CTA or closing text for slide 3", "visualDescription": "Visual description"}
      ],
      "bestTime": "11:00 AM IST"
    },
    "story": {
      "slides": [
        {"slideNumber": 1, "type": "text", "text": "Story opening hook matching today's focus", "visualDescription": "Background visual", "ctaText": "", "stickerSuggestion": ""},
        {"slideNumber": 2, "type": "image", "text": "Text overlay", "visualDescription": "What to show", "ctaText": "Swipe up", "stickerSuggestion": "poll or question sticker"}
      ]
    },
    "reel": {
      "hook": "First 3 seconds — the line that stops the scroll",
      "concept": "One sentence describing what this reel is about (Must match TODAY'S ITINERARY FOCUS adapted to ${brandName})",
      "caption": "Reel caption with CTA (max 2200 chars)",
      "hashtags": ["#hashtag1", "#reels"],
      "audioSuggestion": "Trending audio name OR 'original audio — voiceover'",
      "totalDuration": "15 seconds",
      "bestTime": "12:00 PM IST",
      "scenes": [
        {"sceneNumber": 1, "duration": "0:00–0:03", "shotType": "Close-up / Talking head", "action": "Action matching the hook", "voiceover": "First 3 seconds Hook — MUST match the hook field above exactly", "textOverlay": "Hook text", "visualDescription": "Visual style"},
        {"sceneNumber": 2, "duration": "0:03–0:07", "shotType": "Medium shot", "action": "Action explaining the problem", "voiceover": "Problem narration", "textOverlay": "Problem key text", "visualDescription": "Visual style"},
        {"sceneNumber": 3, "duration": "0:07–0:11", "shotType": "Close-up / Product insert", "action": "Show the product solving it", "voiceover": "Solution explanation", "textOverlay": "Solution key text", "visualDescription": "Visual style"},
        {"sceneNumber": 4, "duration": "0:11–0:15", "shotType": "Close-up / Talking head", "action": "Call to action details", "voiceover": "Call to action narration (e.g. Link in bio)", "textOverlay": "CTA text", "visualDescription": "Visual style"}
      ]
    }
  },
  "twitter": [
    {
      "type": "standalone",
      "tweets": ["Single tweet text under 280 chars. Punchy and shareable. Matches TODAY'S ITINERARY FOCUS adapted to ${brandName}."],
      "bestTime": "8:30 AM IST"
    },
    {
      "type": "thread",
      "tweets": [
        "Thread opener — hook that makes people click 🧵👇 (Matches TODAY'S ITINERARY FOCUS adapted to ${brandName})",
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
      "title": "Post title — specific, not clickbait. Matches TODAY'S ITINERARY FOCUS adapted to ${brandName}.",
      "body": "Full post body. 500-2000 chars. Raw, authentic tone. NO LINKS if subreddit is r/startups. End with a question.",
      "tone": "${subreddits[0]?.tone || 'story-driven'}",
      "bestTime": "9:00 AM EST"
    },
    {
      "subreddit": "${subreddits[1]?.name || 'r/SaaS'}",
      "title": "Different angle post title for TODAY'S ITINERARY FOCUS adapted to ${brandName}.",
      "body": "Full post body. Different angle from the first.",
      "tone": "${subreddits[1]?.tone || 'technical'}",
      "bestTime": "10:00 AM EST"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown code fences. No explanation. Just the raw JSON.`;
}

/**
 * Helper to get date details in Asia/Kolkata timezone
 */
export function getISTDateDetails(dateInput = new Date()) {
    const d = new Date(dateInput);

    // Format to YYYY-MM-DD in IST
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    const dateKey = formatter.format(d); // "YYYY-MM-DD"

    // Day of week in IST
    const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long'
    });
    const dayOfWeek = dayOfWeekFormatter.format(d).toLowerCase();

    // Day of month in IST
    const dayOfMonthFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric'
    });
    const dayOfMonth = parseInt(dayOfMonthFormatter.format(d), 10);

    return { dateKey, dayOfWeek, dayOfMonth };
}

/**
 * Generate daily content for all platforms based on the 30-day fixed itinerary
 */
export async function generateDailyContent(forceDate = null, brandId = null) {
    const now = forceDate ? new Date(forceDate) : new Date();
    const { dateKey, dayOfWeek, dayOfMonth } = getISTDateDetails(now);

    // Calculate daily itinerary day from day of the month (1-31 -> 1-30 cycle)
    const itineraryIndex = (dayOfMonth - 1) % 30;
    const itineraryDay = ITINERARY[itineraryIndex];
    const theme = itineraryDay.theme;

    console.log(`\n🚀 [GrowthEngine] Generating daily content for ${dateKey} (${dayOfWeek}) — Itinerary Day ${itineraryDay.day}: ${itineraryDay.title}${brandId ? ` (Brand ID: ${brandId})` : ''}`);

    // Check if already generated today
    const existing = await GrowthContent.findOne({ dateKey });
    if (existing) {
        console.log(`⚠️ [GrowthEngine] Content already exists for ${dateKey}. Use regenerate to replace.`);
        return existing;
    }

    try {
        // Fetch brand context if brandId is provided
        const brandContext = brandId ? await getBrandContext(brandId) : null;
        const brandName = brandContext ? brandContext.name : 'Mantram AI';

        // 1. Get trending topics via Grok
        console.log('📊 [GrowthEngine] Fetching trending topics via Grok...');
        const trendingTopics = await fetchTrendingTopics();
        console.log(`📊 [GrowthEngine] Got ${trendingTopics.length} trending topics`);

        // 2. Pick 2 subreddits (rotate daily)
        const dayIndex = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
        const sub1 = REDDIT_SUBREDDITS[dayIndex % REDDIT_SUBREDDITS.length];
        const sub2 = REDDIT_SUBREDDITS[(dayIndex + 1) % REDDIT_SUBREDDITS.length];

        // 3. Generate content via Claude (Anthropic)
        console.log(`✍️ [GrowthEngine] Generating content via Claude using Itinerary Day ${itineraryDay.day}...`);
        const router = getAIRouter();
        const prompt = buildGenerationPrompt(dayOfWeek, itineraryDay, trendingTopics, [sub1, sub2], brandContext);
        const randomSeed = Math.random().toString(36).substring(7);

        const result = await router.generateText(
            {
                systemPrompt: prompt,
                userPrompt: `Generate today's growth marketing content for ${brandName}. Today is ${dayOfWeek}, ${dateKey}. Itinerary Day: ${itineraryDay.day} (${itineraryDay.title}). Random Seed: ${randomSeed}. Return the JSON object.`,
                temperature: 0.85,
                maxTokens: 16000,
                model: 'claude-sonnet-4-6',
            },
            { provider: 'anthropic' }
        );

        // 4. Parse the JSON response (robust multi-step sanitization)
        let content;

        /**
         * Strip markdown fences only — do NOT touch structural whitespace.
         * Real newlines between JSON keys are perfectly valid and JSON.parse handles them fine.
         */
        const stripFences = (raw) => raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        /**
         * Fix unescaped control characters ONLY inside JSON string values.
         * Walks character by character to detect string boundaries so structural
         * newlines (between keys/values) are left untouched.
         */
        const fixUnescapedInStrings = (raw) => {
            let out = '';
            let inString = false;
            let i = 0;
            while (i < raw.length) {
                const ch = raw[i];
                if (inString) {
                    if (ch === '\\') {
                        // pass through escape sequence unchanged
                        out += ch + (raw[i + 1] || '');
                        i += 2;
                        continue;
                    } else if (ch === '"') {
                        inString = false;
                        out += ch;
                    } else if (ch === '\n') {
                        out += '\\n'; // escape raw newline inside string
                    } else if (ch === '\r') {
                        // skip bare CR inside string
                    } else if (ch === '\t') {
                        out += '\\t'; // escape raw tab inside string
                    } else {
                        out += ch;
                    }
                } else {
                    if (ch === '"') inString = true;
                    out += ch;
                }
                i++;
            }
            return out;
        };

        /**
         * Fix trailing commas before } or ] (common LLM mistake)
         */
        const fixTrailingCommas = (s) => s.replace(/,\s*([\]}])/g, '$1');

        // Attempt 1: Direct parse — strip fences only (handles well-formed pretty JSON)
        try {
            content = JSON.parse(stripFences(result.text));
        } catch (parseErr1) {
            console.warn(`⚠️ [GrowthEngine] Direct parse failed (${parseErr1.message}). Trying deep sanitization...`);

            // Attempt 2: Fix unescaped chars inside string values + trailing commas
            try {
                const deepCleaned = fixTrailingCommas(fixUnescapedInStrings(stripFences(result.text)));
                content = JSON.parse(deepCleaned);
            } catch (parseErr2) {
                console.warn(`⚠️ [GrowthEngine] Deep sanitization failed (${parseErr2.message}). Trying JSON extraction...`);

                // Attempt 3: Extract outermost {...} then apply deep sanitization
                try {
                    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
                    if (!jsonMatch) throw new Error('No JSON object found in AI response');
                    const extracted = fixTrailingCommas(fixUnescapedInStrings(stripFences(jsonMatch[0])));
                    content = JSON.parse(extracted);
                } catch (parseErr3) {
                    console.error(`❌ [GrowthEngine] All parse attempts failed.`);
                    console.error(`❌ [GrowthEngine] Final error: ${parseErr3.message}`);
                    console.error(`❌ [GrowthEngine] Response length: ${result.text.length} chars`);
                    console.error(`❌ [GrowthEngine] Response (first 3000 chars):\n${result.text.substring(0, 3000)}`);
                    throw new Error(`Failed to parse AI response: ${parseErr3.message}`);
                }
            }
        }

        // 5. Save to database
        const growthContent = await GrowthContent.create({
            date: now,
            dateKey,
            dayOfWeek,
            theme: itineraryDay.title, // store the specific title as theme
            status: 'generated',
            brandId: brandId || null,

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
                reel: {
                    hook: content.instagram?.reel?.hook || '',
                    concept: content.instagram?.reel?.concept || '',
                    caption: content.instagram?.reel?.caption || '',
                    hashtags: content.instagram?.reel?.hashtags || [],
                    audioSuggestion: content.instagram?.reel?.audioSuggestion || 'original audio',
                    totalDuration: content.instagram?.reel?.totalDuration || '30–45 seconds',
                    bestTime: content.instagram?.reel?.bestTime || '12:00 PM IST',
                    scenes: (content.instagram?.reel?.scenes || []).map(s => ({
                        sceneNumber: s.sceneNumber,
                        duration: s.duration,
                        shotType: s.shotType,
                        action: s.action,
                        voiceover: s.voiceover || '',
                        textOverlay: s.textOverlay || '',
                        visualDescription: s.visualDescription || '',
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
                contentBankIndicesUsed: [itineraryDay.day], // store day number of the itinerary
            },
        });

        console.log(`✅ [GrowthEngine] Content generated and saved for ${dateKey} (Itinerary Day ${itineraryDay.day})`);
        return growthContent;

    } catch (err) {
        console.error(`❌ [GrowthEngine] Generation failed for ${dateKey}:`, err.message);
        throw err;
    }
}

/**
 * Regenerate a specific platform's content for a given day using its itinerary day
 */
export async function regeneratePlatformContent(contentId, platform, index = 0) {
    const existing = await GrowthContent.findById(contentId);
    if (!existing) throw new Error('Content not found');

    const brandId = existing.brandId;
    const brandContext = brandId ? await getBrandContext(brandId) : null;
    const brandName = brandContext ? brandContext.name : 'Mantram AI';

    const targetDate = new Date(existing.date);
    const { dayOfMonth } = getISTDateDetails(targetDate);
    const itineraryIndex = (dayOfMonth - 1) % 30;
    const itineraryDay = ITINERARY[itineraryIndex];

    const router = getAIRouter();
    const platformPrompts = {
        linkedin: `Generate ONE LinkedIn post for ${brandName}. Today's theme: ${itineraryDay.title}. Focus: ${itineraryDay.linkedinTopic}. Key details: ${itineraryDay.talkingPoints.join(' | ')}. Professional, story-driven, one sentence per paragraph. Return JSON: {"content": "...", "hashtags": [...], "bestTime": "..."}`,
        twitter: `Generate ONE ${index === 0 ? 'standalone tweet (under 280 chars)' : 'Twitter thread (4-5 tweets)'} for ${brandName}. Today's theme: ${itineraryDay.title}. Focus: ${itineraryDay.twitterTopic}. Key details: ${itineraryDay.talkingPoints.join(' | ')}. Punchy, shareable. Return JSON: {"type": "${index === 0 ? 'standalone' : 'thread'}", "tweets": [...], "bestTime": "..."}`,
        reddit: `Generate ONE Reddit post for ${existing.reddit?.[index]?.subreddit || 'r/Entrepreneur'}. Today's theme: ${itineraryDay.title}. Focus: ${itineraryDay.redditTopic}. Key details: ${itineraryDay.talkingPoints.join(' | ')}. Raw, authentic, NO marketing speak, NO links. Return JSON: {"subreddit": "...", "title": "...", "body": "...", "tone": "...", "bestTime": "..."}`,
        instagram_post: `Generate ONE Instagram carousel post for ${brandName}. Today's theme: ${itineraryDay.title}. Focus: ${itineraryDay.instagramTopic}. Key details: ${itineraryDay.talkingPoints.join(' | ')}. Include caption, hashtags, and 3-5 slide descriptions. Return JSON: {"caption": "...", "hashtags": [...], "slides": [...], "bestTime": "..."}`,
        instagram_story: `Generate ONE Instagram Story script for ${brandName} (5-6 slides). Today's theme: ${itineraryDay.title}. Focus: ${itineraryDay.instagramTopic}. Include visual descriptions, text overlays, and sticker suggestions. Return JSON: {"slides": [{"slideNumber": 1, "type": "text", "text": "...", "visualDescription": "...", "ctaText": "...", "stickerSuggestion": "..."}]}`,
        instagram_reel: `Generate ONE Instagram Reel shooting script for ${brandName} (15 seconds, exactly 4 scenes). Today's theme: ${itineraryDay.title}. Focus: ${itineraryDay.instagramTopic}. Include a scroll-stopping hook, scene-by-scene breakdown with shot type, duration, action, voiceover narration, text overlay, and visual description. Also include caption, hashtags, and audio suggestion. Scene 1's voiceover MUST match the hook exactly. Presenter actions must show a proper moving person explaining while actively doing something in the scene (e.g., typing on a laptop, gesturing dynamically at a screen, pointing, walking, demonstrating features, interacting with props/environments) rather than just a static talking head or moving head close-up. Return JSON: {"hook": "...", "concept": "...", "caption": "...", "hashtags": [...], "audioSuggestion": "...", "totalDuration": "15 seconds", "bestTime": "12:00 PM IST", "scenes": [{"sceneNumber": 1, "duration": "0:00-0:03", "shotType": "...", "action": "...", "voiceover": "First 3 seconds Hook — MUST match the hook field exactly", "textOverlay": "...", "visualDescription": "..."}, {"sceneNumber": 2, "duration": "0:03-0:07", "shotType": "...", "action": "...", "voiceover": "...", "textOverlay": "...", "visualDescription": "..."}, {"sceneNumber": 3, "duration": "0:07-0:11", "shotType": "...", "action": "...", "voiceover": "...", "textOverlay": "...", "visualDescription": "..."}, {"sceneNumber": 4, "duration": "0:11-0:15", "shotType": "...", "action": "...", "voiceover": "...", "textOverlay": "...", "visualDescription": "..."}]}`,
    };

    let systemPrompt = `You are a growth content writer for ${brandName}. Write naturally — no AI tells. Return ONLY raw JSON.`;
    if (brandContext) {
        systemPrompt += `\nABOUT THE BRAND (use this context for visual and tonal consistency):\n${brandContext.description}\nAdapt today's focus to this brand.`;
    } else {
        systemPrompt += `\nABOUT MANTRAM AI:\n- AI marketing OS replacing Canva + Jasper + SEMrush + Buffer + Klaviyo\n- UGC video ads at ₹33/clip\n- Built by Sachin & Abhishek`;
    }

    const randomSeed = Math.random().toString(36).substring(7);
    const userPrompt = `${platformPrompts[platform]} [Random Seed: ${randomSeed}]`;
    if (!platformPrompts[platform]) throw new Error(`Unknown platform: ${platform}`);

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
    } else if (platform === 'instagram_reel') {
        existing.instagram.reel = {
            hook: parsed.hook || '',
            concept: parsed.concept || '',
            caption: parsed.caption || '',
            hashtags: parsed.hashtags || [],
            audioSuggestion: parsed.audioSuggestion || 'original audio',
            totalDuration: parsed.totalDuration || '30-45 seconds',
            bestTime: parsed.bestTime || '12:00 PM IST',
            scenes: (parsed.scenes || []).map(s => ({
                sceneNumber: s.sceneNumber,
                duration: s.duration,
                shotType: s.shotType,
                action: s.action,
                voiceover: s.voiceover || '',
                textOverlay: s.textOverlay || '',
                visualDescription: s.visualDescription || '',
            })),
            posted: false,
        };
    }

    await existing.save();
    return existing;
}
