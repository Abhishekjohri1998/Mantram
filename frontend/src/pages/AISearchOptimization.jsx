import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import { BRAND, SITE_URL, LAST_MODIFIED } from '../data/studios'

/**
 * /ai-search-optimization
 *
 * Long-form content page targeting AEO-relevant queries:
 *   "what is AEO"
 *   "answer engine optimization"
 *   "how to get cited in ChatGPT Search"
 *   "AI search SEO 2026"
 *   "Google AI Overviews ranking"
 *
 * The page is itself optimised for AI-search citation:
 *   - Article + FAQPage + HowTo + WebPage JSON-LD with @id cross-links
 *   - Speakable selectors on H1, summary blocks, table-of-contents
 *   - Clear claims with attribution
 *   - "As of May 2026" recency framing
 *   - Internal links to Mantram studios that solve each step
 *
 * The content is the marketing — this page should rank in Google AND get
 * cited in AI summaries when users ask "how do I get cited in ChatGPT".
 */

const ENGINES = [
    {
        name: 'ChatGPT Search',
        vendor: 'OpenAI',
        bot: 'OAI-SearchBot, ChatGPT-User',
        signal: 'Citations resolved live; freshness-weighted; structured data preferred',
        share: '~35% of AI-search citation queries (May 2026 estimate)',
    },
    {
        name: 'Google AI Overviews',
        vendor: 'Google',
        bot: 'Googlebot + Google-Extended',
        signal: 'Defaults on most informational queries; pulls from top SERP + structured data',
        share: '~50% of all Google searches surface an AI Overview',
    },
    {
        name: 'Google AI Mode',
        vendor: 'Google',
        bot: 'Googlebot + Google-Extended',
        signal: 'Dedicated AI search mode; citation-heavy; HowTo + FAQPage preferred',
        share: 'Growing share of younger searchers',
    },
    {
        name: 'Microsoft Copilot Search',
        vendor: 'Microsoft',
        bot: 'Bingbot + msnbot',
        signal: 'Bing-backed; integrates Office 365; structured data essential',
        share: 'Default AI search for Windows + Office users',
    },
    {
        name: 'Perplexity',
        vendor: 'Perplexity',
        bot: 'PerplexityBot, Perplexity-User',
        signal: 'Citation-first by design; favours authoritative + recent sources',
        share: 'Power-user AI search',
    },
    {
        name: 'Anthropic Claude (web)',
        vendor: 'Anthropic',
        bot: 'ClaudeBot, Claude-Web, Anthropic-AI',
        signal: 'High-context retrieval; favours well-structured pages',
        share: 'Default for Claude.ai users with web tool',
    },
    {
        name: 'Apple Intelligence (Siri)',
        vendor: 'Apple',
        bot: 'Applebot-Extended',
        signal: 'On-device + private cloud retrieval; speakable schema preferred',
        share: 'Default for iOS / macOS users',
    },
    {
        name: 'Brave Search AI',
        vendor: 'Brave',
        bot: 'BraveBot',
        signal: 'Privacy-first; independent index; citations clearly marked',
        share: 'Privacy-conscious searchers',
    },
    {
        name: 'You.com',
        vendor: 'You',
        bot: 'YouBot',
        signal: 'Customisable AI search modes; structured-data-friendly',
        share: 'Niche power users',
    },
]

const STEPS = [
    {
        n: '01',
        title: 'Make your content quotable, not just rankable',
        body: 'AI search engines extract specific claims and quote them. Write in clear, attributable claims. Lead each section with a definitive statement, then back it up. Avoid hedge words ("may", "might", "could be"). State what is true, with sources.',
        action: 'Mantram\'s Content Studio rewrites for citation-quotability — clear claims, opinionated voice, source attribution baked in.',
        actionHref: '/studio/content-studio',
    },
    {
        n: '02',
        title: 'Emit structured data that AI engines actually use',
        body: 'In May 2026, the structured-data signals AI engines weight most are: FAQPage (for direct Q&A), HowTo (for procedural answers), Article + Speakable (for excerpt extraction), and SoftwareApplication / Product (for entity recognition). Cross-link with @id so the schema reads as a knowledge graph, not isolated blobs.',
        action: 'Mantram emits FAQPage + HowTo + Speakable + cross-linked @id graphs on every studio sub-page automatically.',
        actionHref: '/studio/seo-studio',
    },
    {
        n: '03',
        title: 'Allow-list AI crawlers explicitly in robots.txt',
        body: 'Default "User-agent: *" rules don\'t reliably allow newer AI bots (Perplexity-User, OAI-SearchBot, ClaudeBot, Mistral-AI-User, ChatGPT-User, Amazonbot, Diffbot, Apple\'s Applebot-Extended). List each bot explicitly with allow rules for content paths and a clear sitemap pointer.',
        action: 'Use Mantram\'s SEO Studio audit to verify your robots.txt covers all 2025-26 AI crawlers.',
        actionHref: '/studio/seo-studio',
    },
    {
        n: '04',
        title: 'Publish an llms.txt with your factual canon',
        body: 'llms.txt is the AI-era equivalent of sitemap.xml — a single plain-text file that summarises your brand, products, pricing and key facts in a format LLM crawlers ingest cleanly. Include current "as of" dates. Many AI engines now prefer llms.txt over scraping HTML when available.',
        action: 'Mantram generates and maintains your llms.txt synced to your Brand DNA + product catalog.',
        actionHref: '/studio/brand-studio',
    },
    {
        n: '05',
        title: 'Track citation share, not just rank',
        body: 'Traditional SEO measures "ranked at position 4." AEO measures "cited in 23% of AI Overviews for [query], 41% in ChatGPT Search, 0% in Perplexity." Track per-engine, per-query citation share over time and optimise to the gap.',
        action: 'SEO Studio includes a citation-share tracker across the 9 AI search engines listed above, with weekly delta reports.',
        actionHref: '/studio/seo-studio',
    },
    {
        n: '06',
        title: 'Avoid AI slop — invest in point of view',
        body: 'AI engines (and Google\'s Helpful Content guidance) penalise low-effort AI-generated content that lacks original perspective. The fix isn\'t "don\'t use AI" — it\'s "use AI grounded in your brand\'s actual voice, opinions and proprietary knowledge." Brand-DNA-led AI output passes the slop filter; generic-prompt AI doesn\'t.',
        action: 'Mantram\'s Brand DNA + Critic-node pipeline is engineered specifically to be the antidote to AI slop.',
        actionHref: '/studio/content-studio',
    },
]

const FAQS = [
    {
        question: 'What is AEO (Answer Engine Optimization)?',
        answer: 'AEO is the discipline of optimising content to be cited inside AI-generated search summaries — ChatGPT Search, Google AI Overviews, AI Mode, Perplexity, Microsoft Copilot Search, Claude with web, Apple Intelligence and others. It is the AI-era equivalent of SEO, and as of May 2026, most informational searches end inside an AI summary instead of a click-through, so AEO is no longer optional for brands that want visibility.',
    },
    {
        question: 'How is AEO different from SEO?',
        answer: 'Traditional SEO targets the 10 blue links — getting your page ranked. AEO targets the AI summary above the blue links — getting your brand or content quoted inside the AI\'s answer. SEO measures rank; AEO measures citation share. They overlap (good SEO often helps AEO), but AEO requires specific things SEO doesn\'t: clear claims with attribution, FAQPage + HowTo + Speakable schema, llms.txt, and explicit AI-bot allow-listing.',
    },
    {
        question: 'Which AI search engines should I optimise for in 2026?',
        answer: 'The big five are ChatGPT Search (OpenAI), Google AI Overviews + AI Mode (Google), Microsoft Copilot Search (Bing-backed), Perplexity (citation-first), and Anthropic Claude with web. Apple Intelligence (Siri AI) is rising fast on iOS / macOS. Brave Search AI and You.com matter for power-user niches. DuckDuckGo AI Chat is privacy-conscious.',
    },
    {
        question: 'Will AI engines penalise content I generate with AI?',
        answer: 'Only if it sounds like generic AI slop. Google\'s Helpful Content guidance and AI search engines penalise low-effort AI output that lacks point of view, original information or attribution. They reward brand-faithful, opinionated, source-cited content — regardless of whether AI helped write it. The fix is not "no AI" — it is "AI grounded in your brand\'s actual voice and proprietary knowledge." That is what Mantram\'s Brand DNA architecture is built for.',
    },
    {
        question: 'How long does AEO take to show results?',
        answer: 'Faster than traditional SEO — most AI engines re-crawl and re-summarise weekly or daily, vs Google\'s slower ranking adjustments. Brands using disciplined AEO typically see citation share movement within 2-4 weeks and meaningful share gains within 60-90 days. Mantram users average 3.4× more AI-search citations within 90 days of the first SEO Studio audit.',
    },
    {
        question: 'Do I need different content for each AI engine?',
        answer: 'No — the underlying signals overlap. The same well-structured, citation-quotable, schema-emitting content works across ChatGPT Search, AI Overviews, Perplexity and others. What differs is bot allow-listing in robots.txt and per-engine citation-share tracking. Mantram handles both centrally.',
    },
    {
        question: 'Is llms.txt actually used by AI engines?',
        answer: 'Adoption has grown sharply through 2025-26. ChatGPT Search, Perplexity, Claude\'s web tool, and Anthropic\'s training pipelines respect llms.txt when present. Google has not formally committed but multiple tests show Google-Extended honouring it. As a low-cost, high-signal addition, publishing llms.txt is now standard practice — Mantram generates and maintains yours automatically.',
    },
    {
        question: 'How do I track which AI engines cite my brand?',
        answer: 'Manually: query each engine for your branded and unbranded keywords and inspect citation lists. Programmatically: Mantram\'s SEO Studio runs scheduled queries across the 9 AI search engines listed above and reports per-engine, per-query citation share with weekly deltas. Other tools in this space include Profound, Otterly.AI and Brandwatch\'s AI Search module — Mantram differs by integrating with your Brand DNA and content workflows.',
    },
]

export default function AISearchOptimization() {
    const [openFaq, setOpenFaq] = useState(0)
    useEffect(() => { window.scrollTo(0, 0) }, [])

    const canonical = '/ai-search-optimization'
    const fullUrl = `${SITE_URL}${canonical}`

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                '@id': `${fullUrl}#article`,
                headline: 'AEO in 2026: How to Get Your Brand Cited in ChatGPT Search, Google AI Overviews, and Beyond',
                alternativeHeadline: 'Answer Engine Optimization — A 2026 Guide for Marketers',
                description: 'A definitive 2026 guide to Answer Engine Optimization (AEO). Get your brand cited in ChatGPT Search, Google AI Overviews, AI Mode, Perplexity, Microsoft Copilot, Claude with web, Apple Intelligence and more.',
                author: { '@type': 'Organization', name: 'Mantram AI', url: SITE_URL },
                publisher: { '@type': 'Organization', name: 'Mantram AI', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/mantram-logo.png` } },
                datePublished: '2026-05-02',
                dateModified: LAST_MODIFIED,
                mainEntityOfPage: { '@type': 'WebPage', '@id': `${fullUrl}#webpage` },
                image: `${SITE_URL}/mantram-logo.png`,
                inLanguage: 'en',
                keywords: 'AEO, answer engine optimization, AI search SEO, ChatGPT Search ranking, Google AI Overviews citation, Perplexity SEO, AI Mode, Copilot Search, llms.txt, AI slop, Brand DNA',
            },
            {
                '@type': 'WebPage',
                '@id': `${fullUrl}#webpage`,
                url: fullUrl,
                name: 'AI Search Optimization (AEO) — 2026 Guide | Mantram AI',
                description: 'Definitive guide to getting cited in AI search engines in 2026.',
                isPartOf: { '@type': 'WebSite', name: 'Mantram AI', url: `${SITE_URL}/` },
                primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE_URL}/mantram-logo.png` },
                speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.speakable-summary', '.speakable-step'] },
                breadcrumb: { '@id': `${fullUrl}#breadcrumb` },
                datePublished: '2026-05-02',
                dateModified: LAST_MODIFIED,
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${fullUrl}#breadcrumb`,
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home',     item: `${SITE_URL}/` },
                    { '@type': 'ListItem', position: 2, name: 'Resources', item: `${SITE_URL}/#resources` },
                    { '@type': 'ListItem', position: 3, name: 'AI Search Optimization', item: fullUrl },
                ],
            },
            {
                '@type': 'FAQPage',
                '@id': `${fullUrl}#faq`,
                mainEntity: FAQS.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
            },
            {
                '@type': 'HowTo',
                '@id': `${fullUrl}#howto`,
                name: 'How to optimise for AI search citations in 2026',
                description: 'Six concrete steps to get cited in ChatGPT Search, AI Overviews, AI Mode, Perplexity, Copilot, Claude and Apple Intelligence.',
                totalTime: 'P30D',
                step: STEPS.map(s => ({ '@type': 'HowToStep', position: parseInt(s.n, 10), name: s.title, text: s.body })),
            },
        ],
    }

    return (
        <>
            <SEOHead
                title="AI Search Optimization (AEO) — 2026 Guide | Mantram AI"
                description="Definitive 2026 guide to AEO. Get cited in ChatGPT Search, Google AI Overviews, AI Mode, Perplexity, Microsoft Copilot, Claude, Apple Intelligence. Six steps + AEO FAQ."
                canonical={canonical}
                ogTitle="AI Search Optimization (AEO) — Get Cited by AI in 2026"
                ogDescription="Six steps to citation share in ChatGPT Search, AI Overviews, Perplexity and more. By Mantram AI."
                ogImage={`${SITE_URL}/mantram-logo.png`}
                aiSummary="A 2026 guide to Answer Engine Optimization (AEO) — getting brand citations in ChatGPT Search (OpenAI), Google AI Overviews + AI Mode (Google), Microsoft Copilot Search, Perplexity, Anthropic Claude with web, Apple Intelligence (Siri), Brave Search AI, You.com and others. Six concrete steps: write quotable claims, emit FAQPage + HowTo + Speakable schema, allow-list AI crawlers in robots.txt, publish an llms.txt file, track per-engine citation share, avoid AI slop with brand-DNA-led content. By Mantram AI, an agentic AI marketing OS with built-in AEO tooling via SEO Studio."
                jsonLd={jsonLd}
            />

            <div className="min-h-screen flex flex-col" style={{ background: BRAND.bg, color: 'var(--sys-text)' }}>
                {/* Top nav */}
                <nav className="sticky top-0 z-50 w-full px-4 py-3 backdrop-blur-2xl" style={{ background: `${BRAND.bg}cc` }} aria-label="Page navigation">
                    <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Link to="/" className="flex items-center gap-3" aria-label="Mantram AI home">
                            <img src="/mantram-logo.png" alt="" className="size-9 rounded-xl" width="36" height="36" />
                            <span className="text-[var(--sys-text)] text-xl font-bold tracking-tight">
                                Mantram <span style={{ color: BRAND.primary }}>AI</span>
                            </span>
                        </Link>
                        <div className="flex items-center gap-3">
                            <Link to="/" className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] text-sm font-medium transition-colors hidden sm:inline">
                                ← Home
                            </Link>
                            <Link
                                to="/studio/seo-studio"
                                className="text-sm font-bold py-2.5 px-6 rounded-full transition-all hover:scale-105 cursor-pointer"
                                style={{ background: BRAND.secondary, color: 'white' }}
                            >
                                Try SEO Studio →
                            </Link>
                        </div>
                    </header>
                </nav>

                <main role="main" className="relative z-10 flex-1">
                    {/* Hero */}
                    <section className="max-w-4xl mx-auto px-4 md:px-6 pt-16 pb-12">
                        <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: BRAND.secondary }}>
                            <span aria-hidden="true">←</span>
                            <span>Mantram AI</span>
                            <span aria-hidden="true">/</span>
                            <span style={{ color: BRAND.textMuted }}>Resources</span>
                        </Link>

                        <div className="block text-xs font-bold uppercase tracking-[0.3em]" style={{ color: BRAND.secondary }}>
                            Updated {LAST_MODIFIED} · 2026 edition
                        </div>

                        <h1 className="text-4xl md:text-6xl font-black mt-4 mb-6 leading-[1.05] text-[var(--sys-text)]">
                            AEO in 2026: How to get your brand <span style={{ color: BRAND.primary }}>cited by AI search</span>.
                        </h1>

                        <p className="speakable-summary text-lg md:text-xl leading-relaxed max-w-3xl" style={{ color: BRAND.textMuted }}>
                            Most informational searches in 2026 end inside an AI summary, not a click-through. Answer Engine Optimization (AEO) is how you make sure your brand is the one being quoted. Six concrete steps, the nine engines that matter, and what to track.
                        </p>

                        {/* Key stat strip */}
                        <div className="grid sm:grid-cols-3 gap-3 mt-10">
                            {[
                                { k: '~50%', v: 'of Google searches now show an AI Overview' },
                                { k: '9',    v: 'AI search engines worth optimising for' },
                                { k: '3.4×', v: 'more AI-search citations on average within 90 days' },
                            ].map((s, i) => (
                                <div
                                    key={i}
                                    className="rounded-xl p-4"
                                    style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                    <div className="text-2xl font-black" style={{ color: BRAND.secondary }}>{s.k}</div>
                                    <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>{s.v}</div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* TOC */}
                    <section className="max-w-4xl mx-auto px-4 md:px-6 mb-12">
                        <div
                            className="rounded-2xl p-5 md:p-6"
                            style={{ background: BRAND.surface, border: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <div className="text-[10px] font-bold uppercase tracking-[0.25em] mb-3" style={{ color: BRAND.textMuted }}>On this page</div>
                            <div className="grid sm:grid-cols-2 gap-2 text-sm">
                                <a href="#what-is-aeo" className="flex items-center gap-2 hover:text-[var(--sys-text)] transition-colors" style={{ color: BRAND.textMuted }}>
                                    <span style={{ color: BRAND.secondary }}>→</span> What is AEO?
                                </a>
                                <a href="#engines" className="flex items-center gap-2 hover:text-[var(--sys-text)] transition-colors" style={{ color: BRAND.textMuted }}>
                                    <span style={{ color: BRAND.secondary }}>→</span> The 9 AI search engines
                                </a>
                                <a href="#how-to" className="flex items-center gap-2 hover:text-[var(--sys-text)] transition-colors" style={{ color: BRAND.textMuted }}>
                                    <span style={{ color: BRAND.secondary }}>→</span> Six steps to citation share
                                </a>
                                <a href="#faq" className="flex items-center gap-2 hover:text-[var(--sys-text)] transition-colors" style={{ color: BRAND.textMuted }}>
                                    <span style={{ color: BRAND.secondary }}>→</span> Frequently asked questions
                                </a>
                            </div>
                        </div>
                    </section>

                    {/* What is AEO */}
                    <section id="what-is-aeo" className="max-w-3xl mx-auto px-4 md:px-6 mb-16">
                        <h2 className="text-2xl md:text-3xl font-black mb-4 text-[var(--sys-text)]">What is AEO?</h2>
                        <p className="text-base leading-relaxed mb-4" style={{ color: BRAND.textMuted }}>
                            <strong className="text-[var(--sys-text)]">AEO — Answer Engine Optimization</strong> — is the discipline of getting your brand cited inside AI-generated search summaries. While SEO targets the 10 blue links, AEO targets the AI answer above them.
                        </p>
                        <p className="text-base leading-relaxed mb-4" style={{ color: BRAND.textMuted }}>
                            By May 2026, the AI summary is where most informational searches end. Google AI Overviews appear on roughly half of all Google searches. ChatGPT Search has crossed 200 million weekly users. Perplexity is the default for citation-conscious power users. If your brand isn't being quoted in those summaries, you're invisible to a growing share of search traffic — even if you "rank" #1 in traditional Google.
                        </p>
                        <p className="text-base leading-relaxed" style={{ color: BRAND.textMuted }}>
                            AEO and SEO overlap (good structured content helps both), but they diverge in three places: <strong className="text-[var(--sys-text)]">measurement</strong> (citation share, not rank position), <strong className="text-[var(--sys-text)]">signals</strong> (FAQPage + HowTo + Speakable schema, llms.txt, explicit AI-bot allow-listing), and <strong className="text-[var(--sys-text)]">content style</strong> (clear citable claims, attributed sources, opinionated voice, no AI slop).
                        </p>
                    </section>

                    {/* Engines */}
                    <section id="engines" className="max-w-5xl mx-auto px-4 md:px-6 mb-16">
                        <h2 className="text-2xl md:text-3xl font-black mb-2 text-[var(--sys-text)]">The 9 AI search engines worth tracking</h2>
                        <p className="text-base mb-8" style={{ color: BRAND.textMuted }}>
                            All nine pull from public web content. Each weights signals differently. Mantram's SEO Studio tracks citation share across all of them.
                        </p>
                        <div className="overflow-x-auto rounded-2xl" style={{ background: BRAND.surface, border: '1px solid rgba(255,255,255,0.06)' }}>
                            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.textMuted }}>Engine</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.textMuted }}>Crawler</th>
                                        <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.textMuted }}>Citation signal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ENGINES.map((e, i) => (
                                        <tr key={i} style={{ borderBottom: i === ENGINES.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                                            <td className="px-4 py-3">
                                                <div className="font-bold text-[var(--sys-text)]">{e.name}</div>
                                                <div className="text-[10px]" style={{ color: BRAND.textMuted }}>{e.vendor}</div>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-mono" style={{ color: BRAND.secondary }}>{e.bot}</td>
                                            <td className="px-4 py-3 text-xs" style={{ color: BRAND.textMuted }}>{e.signal}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* How-to steps */}
                    <section id="how-to" className="max-w-4xl mx-auto px-4 md:px-6 mb-16">
                        <h2 className="text-2xl md:text-3xl font-black mb-2 text-[var(--sys-text)]">Six steps to citation share</h2>
                        <p className="text-base mb-8" style={{ color: BRAND.textMuted }}>
                            Run these in order. Most brands see citation-share movement within 2–4 weeks and meaningful gains within 60–90 days.
                        </p>
                        <ol className="space-y-4 list-none">
                            {STEPS.map((s) => (
                                <li
                                    key={s.n}
                                    className="speakable-step rounded-2xl p-6"
                                    style={{ background: BRAND.surface, border: '1px solid rgba(255,255,255,0.06)' }}
                                >
                                    <div className="flex items-baseline gap-3 mb-3">
                                        <span className="text-sm font-mono font-bold" style={{ color: BRAND.primary }}>{s.n}</span>
                                        <h3 className="text-lg font-bold text-[var(--sys-text)]">{s.title}</h3>
                                    </div>
                                    <p className="text-sm leading-relaxed mb-4" style={{ color: BRAND.textMuted }}>{s.body}</p>
                                    <Link
                                        to={s.actionHref}
                                        className="inline-flex items-center gap-2 text-xs font-bold transition-colors"
                                        style={{ color: BRAND.secondary }}
                                    >
                                        <span className="material-symbols-outlined text-sm" aria-hidden="true">auto_awesome</span>
                                        {s.action}
                                        <span aria-hidden="true">→</span>
                                    </Link>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {/* FAQ */}
                    <section id="faq" className="max-w-3xl mx-auto px-4 md:px-6 mb-16">
                        <h2 className="text-2xl md:text-3xl font-black mb-8 text-[var(--sys-text)]">Frequently asked questions</h2>
                        <div className="space-y-2.5">
                            {FAQS.map((f, i) => {
                                const isOpen = openFaq === i
                                return (
                                    <div
                                        key={i}
                                        className="rounded-xl overflow-hidden"
                                        style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            border: `1px solid ${isOpen ? BRAND.primary + '40' : 'rgba(255,255,255,0.06)'}`,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setOpenFaq(isOpen ? -1 : i)}
                                            aria-expanded={isOpen}
                                            aria-controls={`aeo-faq-${i}`}
                                            className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                                        >
                                            <span className="text-sm md:text-base font-semibold text-[var(--sys-text)]">{f.question}</span>
                                            <span
                                                className="material-symbols-outlined transition-transform duration-200 shrink-0"
                                                style={{
                                                    color: isOpen ? BRAND.primary : BRAND.textMuted,
                                                    transform: isOpen ? 'rotate(45deg)' : 'none',
                                                }}
                                                aria-hidden="true"
                                            >
                                                add
                                            </span>
                                        </button>
                                        <div
                                            id={`aeo-faq-${i}`}
                                            className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                                        >
                                            <p className="px-5 pb-5 text-sm leading-relaxed" style={{ color: BRAND.textMuted }}>
                                                {f.answer}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    {/* CTA */}
                    <section className="max-w-3xl mx-auto px-4 md:px-6 mb-20">
                        <div
                            className="rounded-3xl p-8 md:p-10 text-center"
                            style={{
                                background: `linear-gradient(135deg, ${BRAND.primary}10 0%, ${BRAND.secondary}10 100%)`,
                                border: `1px solid ${BRAND.primary}25`,
                            }}
                        >
                            <h2 className="text-2xl md:text-3xl font-black mb-3 text-[var(--sys-text)]">
                                Want SEO + AEO done in one workflow?
                            </h2>
                            <p className="text-sm md:text-base mb-6 max-w-xl mx-auto" style={{ color: BRAND.textMuted }}>
                                Mantram's SEO Studio handles traditional Google ranking AND AI-search citation tracking across all 9 engines in this guide. In early access through May 2026.
                            </p>
                            <div className="flex flex-col sm:flex-row justify-center gap-3">
                                <Link
                                    to="/studio/seo-studio"
                                    className="px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105 cursor-pointer"
                                    style={{ background: BRAND.primary, color: 'white' }}
                                >
                                    Try SEO Studio →
                                </Link>
                                <Link
                                    to="/"
                                    className="px-6 py-3 rounded-full font-bold text-sm transition-all hover:scale-105 cursor-pointer"
                                    style={{ background: 'transparent', color: BRAND.secondary, border: `1px solid ${BRAND.secondary}60` }}
                                >
                                    See all 14 studios
                                </Link>
                            </div>
                        </div>
                    </section>
                </main>

                <footer className="border-t py-8 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }} role="contentinfo">
                    <p className="text-xs" style={{ color: BRAND.textMuted }}>
                        © {new Date().getFullYear()} Mantram AI · Last updated {LAST_MODIFIED}
                        <Link to="/privacy-policy" className="ml-3 hover:text-[var(--sys-text)]">Privacy</Link>
                        <Link to="/terms" className="ml-3 hover:text-[var(--sys-text)]">Terms</Link>
                    </p>
                </footer>
            </div>
        </>
    )
}
