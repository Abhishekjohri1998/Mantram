import { useState } from 'react'

/**
 * LandingSEOBlock
 * 
 * Public-facing SEO content block for the Landing page (/).
 * Contains rich text content about each studio, platform FAQs,
 * and JSON-LD structured data for search engines and AI crawlers.
 * Designed for the dark-themed Landing page aesthetic.
 */

const STUDIO_CONTENT = [
    {
        icon: 'draw',
        title: 'AI Content Studio',
        color: '#8b5cf6',
        content: 'Mantram AI Content Studio is an intelligent writing engine that crafts blog posts, social media captions, ad copy, email campaigns, press releases, and product descriptions — all perfectly aligned to your brand voice. Powered by multi-model AI (Gemini, Claude, GPT-4o), the studio analyzes your Brand DNA to ensure every piece of content carries your unique tone, terminology, and messaging framework. With built-in SEO optimization, readability scoring, and multilingual support across 20+ languages, Content Studio replaces entire content teams. Features include YouTube Wizard for optimized video scripts and metadata, AI press release generation, and intelligent product catalog matching for e-commerce content.'
    },
    {
        icon: 'auto_fix_high',
        title: 'AI Creative Studio',
        color: '#ec4899',
        content: 'Creative Studio is a full-spectrum visual design engine for social media posts, stories, banners, YouTube thumbnails, and professional AI photoshoots. Using Imagen, Flux, and NanoBanana models, it generates brand-consistent visuals with automatic logo placement, color palette adherence, and typography matching. The AI Photoshoot feature transforms product images with professional lighting, backgrounds, and compositions. Campaign Wizard enables bulk creative generation across multiple sizes and platforms simultaneously. Template categories cover sales, product showcases, testimonials, announcements, events, and infographics — each with smart brand-aware prompt engineering.'
    },
    {
        icon: 'smart_display',
        title: 'AI Video Studio',
        color: '#f59e0b',
        content: 'Video Studio provides multi-model video generation using Seedance 2.0, Kling 3.0, Veo 3.1, and Grok Imagine — each optimized for different use cases from quick social clips to cinematic ad films. The studio supports text-to-video, image-to-video animation, and advanced features like camera control, reference images, and native audio generation. Projects progress through generation, critique, and final delivery stages. AI automatically analyzes generated content for brand alignment, visual quality, and engagement potential. Built for D2C brands creating product videos, social reels, and brand story content at scale.'
    },
    {
        icon: 'campaign',
        title: 'AI Performance Marketing Studio',
        color: '#10b981',
        content: 'Performance Marketing Studio is an AI ad strategist that handles competitive research, audience analysis, budget planning, and campaign generation for Meta Ads and Google Ads. The research engine analyzes competitor ad strategies, identifies market gaps, and recommends budget allocation. AI generates complete ad campaigns with headlines, descriptions, creative briefs, and targeting recommendations. Real-time anomaly detection monitors campaign performance and alerts on ROAS drops, CPA spikes, and budget pacing issues. Integrates with Google Analytics and ad platform APIs for data-driven optimization.'
    },
    {
        icon: 'query_stats',
        title: 'AI SEO Studio',
        color: '#3b82f6',
        content: 'SEO Studio delivers Semrush-level site audits, keyword research, content gap analysis, and GEO (Generative Engine Optimization). The Crawl Engine scans 800+ pages with JS rendering, detecting H1 issues, duplicate content, missing alt text, slow pages, and technical SEO problems. Each issue includes AI-generated auto-fix code — ready-to-use HTML, JSON-LD, and meta tag snippets. The GEO module measures AI Visibility, Schema & Data quality, Content optimization, and Authority scores, ensuring your brand appears in ChatGPT, Perplexity, Gemini, and Claude responses. LLM Brand Probe and Prompt Mining tools identify citation opportunities across AI search engines.'
    },
    {
        icon: 'storefront',
        title: 'AI D2C Analytics Studio',
        color: '#06b6d4',
        content: 'D2C Analytics Studio is a Shopify Intelligence Hub providing product velocity tracking, abandonment signal analysis, and AI-powered e-commerce insights. It connects directly to your Shopify store to surface real-time metrics including revenue, orders, average order value, and customer lifetime value. AI agents analyze product performance trends, identify slow-moving inventory, and recommend pricing and promotion strategies. The studio supports multi-store management with secure OAuth connectivity and GDPR-compliant data handling.'
    },
]

const PLATFORM_FAQS = [
    {
        question: 'What is Mantram AI and how does it work?',
        answer: 'Mantram AI is an AI-powered marketing operating system with 8 specialized studios — Content, Creative, Video, Performance, SEO, D2C, Conversation, and Brainstorm. It works by first extracting your Brand DNA from your website (logo, colors, fonts, voice, and visual identity), then using specialized AI agent teams across each studio to produce brand-aligned content, visuals, videos, ad campaigns, and analytics. Every output is informed by your unique brand identity.'
    },
    {
        question: 'How does the Brand DNA Engine work?',
        answer: 'The Brand DNA Engine scans any website URL in 60 seconds and extracts comprehensive brand identity — including logo, color palette, typography, brand voice and tone, visual style, and messaging framework. This extracted DNA is then used across all 8 studios to ensure every piece of content, design, and video maintains consistent brand identity. You can also manually refine any extracted elements.'
    },
    {
        question: 'What AI models does Mantram AI use?',
        answer: 'Mantram AI uses a multi-model architecture for maximum quality. For text: Gemini 2.5, Claude 3.5, GPT-4o, and Grok. For images: Google Imagen 3, Flux, and NanoBanana. For video: Seedance 2.0, Kling 3.0, Veo 3.1, and Grok Imagine. For voice: Sarvam AI (Indian languages), MiniMax Speech-02 HD. Each task is automatically routed to the best-performing model. The platform supports 20+ languages with culturally localized content.'
    },
    {
        question: 'What is GEO (Generative Engine Optimization)?',
        answer: 'GEO is the future of search visibility. While traditional SEO optimizes for Google, GEO ensures your brand appears in AI-generated answers from ChatGPT, Perplexity, Gemini, and Claude. Mantram\'s GEO module measures AI Visibility, Schema & Data quality, Content optimization, and Authority — then provides actionable recommendations and auto-generated code snippets (JSON-LD, structured data) to improve your brand\'s presence in AI search results.'
    },
    {
        question: 'Can I generate content in multiple languages?',
        answer: 'Yes. Mantram AI supports 20+ languages including Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Spanish, French, Arabic, Japanese, German, Portuguese, and more. Content is not just translated — it\'s culturally localized with market-aware messaging that resonates with local audiences. The platform uses Sarvam AI for Indian vernacular languages and smart language routing across models.'
    },
    {
        question: 'What is the Skill Hub?',
        answer: 'Skill Hub is Mantram AI\'s custom AI workflow builder. You can create reusable marketing "skills" — for example, a "Diwali Campaign" skill that generates 10 social posts, 5 reels, ad copy, an email sequence, and a content calendar in 60 seconds. Skills are repeatable, shareable across teams, and can be triggered from the Fidato AI command bar. Think of it as building your own AI marketing team member.'
    },
    {
        question: 'How does the AI Video Studio work?',
        answer: 'The Video Studio supports multiple generation modes: text-to-video (describe what you want), image-to-video (animate a still image), and advanced production with camera control, reference images, and native audio generation. It uses Seedance 2.0 for cinematic camera control, Kling 3.0 for best motion physics, and Veo 3.1 for premium quality. Videos are automatically critique-reviewed by AI for brand alignment before delivery.'
    },
    {
        question: 'Is Mantram AI suitable for agencies managing multiple brands?',
        answer: 'Absolutely. Mantram AI supports multi-brand management with separate Brand DNA profiles, team collaboration with role-based permissions, and white-label quality output. Agencies can manage unlimited brands, each with unique identity settings, from a single dashboard. Team members can be invited with granular studio-level and brand-level access controls.'
    },
    {
        question: 'What integrations does Mantram AI support?',
        answer: 'Mantram AI integrates with Shopify (multi-store OAuth), Google Analytics, Meta Ads, Google Ads, and social media platforms (Instagram, Facebook, LinkedIn, Twitter/X, YouTube, TikTok, Pinterest, WhatsApp). The Integration Hub provides centralized connectivity management with secure OAuth flows. Additional integrations for email marketing and CRM platforms are on the roadmap.'
    },
    {
        question: 'How much does Mantram AI cost?',
        answer: 'Mantram AI offers flexible credit-based pricing with plans for solopreneurs, SMBs, agencies, and enterprises. Each AI generation (text, image, video, SEO audit) costs a specific number of credits. Plans include a free tier for exploration, professional plans for growing businesses, and custom enterprise plans with dedicated support, SSO, and white-labeling. Sign up for early access to get founding member pricing.'
    },
]

export default function LandingSEOBlock() {
    const [expandedContent, setExpandedContent] = useState({})
    const [expandedFaqs, setExpandedFaqs] = useState({})

    // JSON-LD: FAQPage
    const faqSchema = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": PLATFORM_FAQS.map(faq => ({
            "@type": "Question",
            "name": faq.question,
            "acceptedAnswer": {
                "@type": "Answer",
                "text": faq.answer
            }
        }))
    }

    // JSON-LD: SoftwareApplication
    const softwareSchema = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "Mantram AI",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Marketing Automation",
        "operatingSystem": "Web",
        "description": "Mantram AI is an AI-powered marketing operating system with 8 specialized studios for content, creative, video, performance marketing, SEO, D2C analytics, conversations, and brainstorming. Features include Brand DNA Engine, Skill Hub, GEO (Generative Engine Optimization), Fidato AI Assistant, and multi-model AI routing across 20+ languages.",
        "url": "https://mantram.ai",
        "featureList": [
            "AI Content Studio — blog posts, social captions, ad copy, emails",
            "AI Creative Studio — social media design, AI photoshoots, campaign creatives",
            "AI Video Studio — Seedance, Kling, Veo multi-model video generation",
            "AI Performance Studio — Meta Ads, Google Ads strategy and campaign generation",
            "AI SEO Studio — site audits, keyword research, GEO optimization",
            "AI D2C Analytics — Shopify intelligence, product velocity tracking",
            "AI Conversation Studio — Instagram and Facebook DM auto-responder",
            "AI Brainstorm Studio — strategy, campaigns, mood boards, ad films",
            "Brand DNA Engine — 60-second website brand extraction",
            "Skill Hub — custom AI marketing workflow builder",
            "GEO — Generative Engine Optimization for AI search visibility",
            "Fidato AI Assistant — unified command bar for all studios",
            "20+ language support with cultural localization",
            "Multi-model AI: Gemini, Claude, GPT-4o, Grok, Imagen, Seedance, Kling, Veo"
        ],
        "offers": {
            "@type": "AggregateOffer",
            "lowPrice": "0",
            "highPrice": "9999",
            "priceCurrency": "INR",
            "offerCount": 4
        }
    }

    // JSON-LD: Organization
    const orgSchema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": "Mantram AI",
        "url": "https://mantram.ai",
        "logo": "https://mantram.ai/mantram-logo.png",
        "description": "AI-Powered Marketing Operating System — 8 Studios, One Platform. From brand intelligence to content creation, video production, ad optimization, SEO, and e-commerce analytics.",
        "sameAs": [
            "https://twitter.com/mantram_ai",
            "https://linkedin.com/company/mantram-ai",
            "https://instagram.com/mantram.ai"
        ],
        "founder": [
            { "@type": "Person", "name": "Sachin Das" },
            { "@type": "Person", "name": "Abhishek Johri" }
        ],
        "contactPoint": {
            "@type": "ContactPoint",
            "email": "support@mantram.ai",
            "contactType": "customer support"
        }
    }

    return (
        <section className="relative py-24 border-t border-white/[0.04]" style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(139,92,246,0.02) 50%, transparent 100%)' }}>
            {/* JSON-LD Structured Data */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />

            <div className="max-w-6xl mx-auto px-6">
                {/* Section Header */}
                <div className="text-center mb-16">
                    <p className="text-primary text-xs font-bold uppercase tracking-[0.3em] mb-3">Deep Dive</p>
                    <h2 className="text-3xl md:text-4xl font-black text-white mb-4">
                        Explore the <span className="bg-gradient-to-r from-violet-400 via-primary to-cyan-400 bg-clip-text text-transparent">Mantram AI Platform</span>
                    </h2>
                    <p className="text-slate-400 max-w-2xl mx-auto text-sm leading-relaxed">
                        Learn how each AI-powered studio works together to form a complete marketing operating system — from brand intelligence extraction to published, optimized content across every channel.
                    </p>
                </div>

                {/* Studio Deep-Dive Content Grid */}
                <div className="grid md:grid-cols-2 gap-5 mb-20">
                    {STUDIO_CONTENT.map((studio, i) => (
                        <div key={i} className="rounded-2xl p-6 transition-all group" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-3">
                                <span className="size-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${studio.color}15`, border: `1px solid ${studio.color}30` }}>
                                    <span className="material-symbols-outlined text-base" style={{ color: studio.color }}>{studio.icon}</span>
                                </span>
                                {studio.title}
                            </h3>
                            <div className={`text-sm text-slate-400 leading-relaxed overflow-hidden transition-all duration-300 ${expandedContent[i] ? 'max-h-[600px]' : 'max-h-20'} relative`}>
                                {studio.content}
                                {!expandedContent[i] && (
                                    <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#07070f] to-transparent" />
                                )}
                            </div>
                            <button
                                onClick={() => setExpandedContent(prev => ({ ...prev, [i]: !prev[i] }))}
                                className="mt-2 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors hover:text-white"
                                style={{ color: studio.color }}
                            >
                                {expandedContent[i] ? 'Read less' : 'Read more'}
                                <span className="material-symbols-outlined text-[14px]">
                                    {expandedContent[i] ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>
                        </div>
                    ))}
                </div>

                {/* Platform FAQ */}
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-10">
                        <h2 className="text-2xl md:text-3xl font-black text-white mb-3">Frequently Asked Questions</h2>
                        <p className="text-slate-500 text-sm">Everything you need to know about the Mantram AI platform.</p>
                    </div>
                    <div className="space-y-3">
                        {PLATFORM_FAQS.map((faq, i) => (
                            <div key={i} className="rounded-xl overflow-hidden transition-all" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <button
                                    onClick={() => setExpandedFaqs(prev => ({ ...prev, [i]: !prev[i] }))}
                                    className="w-full text-left p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
                                >
                                    <span className="text-sm font-bold text-slate-200 pr-4">{faq.question}</span>
                                    <span className={`material-symbols-outlined text-slate-500 transition-transform duration-300 flex-shrink-0 ${expandedFaqs[i] ? 'rotate-180' : ''}`}>
                                        keyboard_arrow_down
                                    </span>
                                </button>
                                <div className={`overflow-hidden transition-all duration-300 ${expandedFaqs[i] ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="px-5 pb-5 text-sm text-slate-400 leading-relaxed border-t border-white/[0.03] pt-4">
                                        {faq.answer}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    )
}
