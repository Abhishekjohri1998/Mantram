import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import SEOHead from '../components/SEOHead'
import {
    STUDIOS,
    STUDIOS_BY_SLUG,
    STUDIO_ICONS,
    BRAND,
    SITE_URL,
    LAST_MODIFIED,
} from '../data/studios'

/**
 * StudioPreview — public, SEO-indexed sub-page for each studio at /studio/:slug.
 *
 * Drives organic and AI-search discovery. All content is data-driven from
 * `data/studios.js` so updates flow to the page, sitemap, llms.txt and JSON-LD
 * from one place.
 *
 * Schema emitted (JSON-LD): WebPage + SoftwareApplication + BreadcrumbList +
 * FAQPage + HowTo + ItemList of capabilities. Speakable selectors target the
 * H1 and the first paragraph for voice/AI excerpts.
 */
export default function StudioPreview() {
    const { slug } = useParams()
    const studio = STUDIOS_BY_SLUG[slug]

    const [email, setEmail] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [openFaq, setOpenFaq] = useState(0)

    useEffect(() => { window.scrollTo(0, 0) }, [slug])

    if (!studio) {
        return <StudioNotFound />
    }

    const icon = STUDIO_ICONS[studio.slug] || 'auto_awesome'
    const canonical = `/studio/${studio.slug}`
    const fullUrl = `${SITE_URL}${canonical}`

    /* ── JSON-LD: combined graph (WebPage + SoftwareApplication + Breadcrumb + FAQ + HowTo) ── */
    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebPage',
                '@id': `${fullUrl}#webpage`,
                name: `${studio.name} — Mantram AI`,
                url: fullUrl,
                description: studio.metaDesc,
                inLanguage: 'en',
                datePublished: '2025-01-01',
                dateModified: LAST_MODIFIED,
                isPartOf: { '@type': 'WebSite', name: 'Mantram AI', url: `${SITE_URL}/` },
                primaryImageOfPage: { '@type': 'ImageObject', url: `${SITE_URL}/mantram-logo.png` },
                speakable: {
                    '@type': 'SpeakableSpecification',
                    cssSelector: ['h1', '.speakable-summary', '.speakable-stat'],
                },
                breadcrumb: { '@id': `${fullUrl}#breadcrumb` },
            },
            {
                '@type': 'SoftwareApplication',
                '@id': `${fullUrl}#software`,
                name: `Mantram AI ${studio.name}`,
                applicationCategory: 'BusinessApplication',
                applicationSubCategory: 'Marketing Automation',
                operatingSystem: 'Web',
                description: studio.aiSummary,
                featureList: studio.capabilities.map(c => c.label),
                softwareVersion: '2.0',
                url: fullUrl,
                offers: { '@type': 'Offer', priceCurrency: 'INR', price: '149', description: 'Credit-pack pricing — early access via waitlist.' },
            },
            {
                '@type': 'BreadcrumbList',
                '@id': `${fullUrl}#breadcrumb`,
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
                    { '@type': 'ListItem', position: 2, name: 'Studios', item: `${SITE_URL}/#studios` },
                    { '@type': 'ListItem', position: 3, name: studio.name, item: fullUrl },
                ],
            },
            {
                '@type': 'FAQPage',
                '@id': `${fullUrl}#faq`,
                mainEntity: studio.faqs.map(f => ({
                    '@type': 'Question',
                    name: f.question,
                    acceptedAnswer: { '@type': 'Answer', text: f.answer },
                })),
            },
            {
                '@type': 'HowTo',
                '@id': `${fullUrl}#howto`,
                name: `How to use ${studio.name}`,
                description: `Three steps to get value from ${studio.name} on Mantram AI.`,
                step: [
                    { '@type': 'HowToStep', position: 1, name: 'Capture your Brand DNA', text: 'Mantram scans your website, social, competitors and reviews to build a structured Brand DNA profile.' },
                    { '@type': 'HowToStep', position: 2, name: `Open ${studio.name}`, text: studio.teaser },
                    { '@type': 'HowToStep', position: 3, name: 'Run, refine, ship', text: `Generate output in ${studio.name}. The AI reads your Brand DNA, so output stays on-brand. Edit and ship.` },
                ],
            },
        ],
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!email.trim()) return
        try {
            const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
            await fetch(`${apiBaseUrl}/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name: '', type: 'individual', source: `studio-${slug}` }),
            })
            setSubmitted(true)
        } catch { setSubmitted(true) }
    }

    return (
        <>
            <SEOHead
                title={`${studio.metaTitle}`}
                description={studio.metaDesc}
                canonical={canonical}
                ogTitle={`${studio.name} — ${studio.tagline}`}
                ogDescription={studio.teaser}
                ogImage={`${SITE_URL}/mantram-logo.png`}
                twitterTitle={`${studio.name} — Mantram AI`}
                twitterDescription={studio.tagline}
                aiSummary={studio.aiSummary}
                jsonLd={jsonLd}
            />

            <div className="min-h-screen flex flex-col" style={{ background: BRAND.bg }}>
                {/* Ambient brand glow — orange primary + cyan secondary */}
                <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                    <div className="absolute top-[8%] left-[15%] w-[55%] h-[55%] rounded-full blur-[160px]" style={{ background: `${BRAND.primary}10` }} />
                    <div className="absolute bottom-[15%] right-[10%] w-[45%] h-[45%] rounded-full blur-[140px]" style={{ background: `${BRAND.secondary}0c` }} />
                </div>

                {/* Top nav */}
                <nav className="sticky top-0 z-50 w-full px-4 py-3 backdrop-blur-2xl" style={{ background: `${BRAND.bg}cc` }} aria-label="Studio navigation">
                    <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-2.5 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <Link to="/" className="flex items-center gap-3" aria-label="Mantram AI home">
                            <img src="/mantram-logo.png" alt="Mantram AI" className="size-9 rounded-xl" width="36" height="36" />
                            <span className="text-[var(--sys-text)] text-xl font-bold tracking-tight">
                                Mantram <span style={{ color: BRAND.primary }}>AI</span>
                            </span>
                        </Link>
                        <div className="flex items-center gap-3">
                            <Link to="/" className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] text-sm font-medium transition-colors hidden sm:inline">
                                ← All Studios
                            </Link>
                            <button
                                onClick={() => document.getElementById('studio-cta')?.scrollIntoView({ behavior: 'smooth' })}
                                className="text-sm font-bold py-2.5 px-6 rounded-full transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                                style={{ background: BRAND.primary, color: 'white' }}
                                aria-label="Get early access to Mantram AI"
                            >
                                Get Early Access
                            </button>
                        </div>
                    </header>
                </nav>

                <main className="relative z-10 flex-1" role="main">
                    {/* ── Hero ── */}
                    <section className="max-w-5xl mx-auto px-6 pt-20 pb-12 text-center" aria-labelledby="studio-title">
                        <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-6" style={{ color: BRAND.secondary }}>
                            <span aria-hidden="true">←</span>
                            <span>Mantram AI Studios</span>
                            <span aria-hidden="true">/</span>
                            <span style={{ color: BRAND.textMuted }}>{studio.group}</span>
                        </Link>

                        <div
                            className="size-20 rounded-3xl flex items-center justify-center mx-auto mb-8"
                            style={{
                                background: `linear-gradient(135deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%)`,
                                boxShadow: `0 20px 60px ${BRAND.primary}30`,
                            }}
                            role="img"
                            aria-label={`${studio.name} icon`}
                        >
                            <span className="material-symbols-outlined text-white text-4xl" aria-hidden="true">{icon}</span>
                        </div>

                        <p className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: BRAND.primary }}>
                            {studio.tagline}
                        </p>

                        <h1 id="studio-title" className="text-5xl md:text-6xl font-black text-[var(--sys-text)] mb-6 leading-[1.05] max-w-3xl mx-auto">
                            {studio.name}
                        </h1>

                        <p className="speakable-summary text-xl md:text-2xl text-[var(--sys-text-muted)] max-w-2xl mx-auto leading-relaxed font-light">
                            {studio.heroLine}
                        </p>

                        {/* Models used — small chip row, cyan-coded for "AI / live" */}
                        {studio.models?.length > 0 && (
                            <div className="mt-8 flex flex-wrap justify-center gap-2 max-w-2xl mx-auto" aria-label="AI models used">
                                <span className="text-[10px] font-bold uppercase tracking-widest mr-2 self-center" style={{ color: BRAND.textMuted }}>
                                    Powered by
                                </span>
                                {studio.models.map((m, i) => (
                                    <span
                                        key={i}
                                        className="text-xs px-3 py-1.5 rounded-full"
                                        style={{
                                            background: `${BRAND.secondary}12`,
                                            border: `1px solid ${BRAND.secondary}30`,
                                            color: BRAND.secondary,
                                        }}
                                    >
                                        {m}
                                    </span>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ── Capabilities ── */}
                    <section className="max-w-5xl mx-auto px-6 py-12" aria-labelledby="capabilities-title">
                        <h2 id="capabilities-title" className="text-center text-2xl font-bold text-[var(--sys-text)] mb-10">
                            What's inside
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4" role="list" aria-label={`${studio.name} capabilities`}>
                            {studio.capabilities.map((c, i) => (
                                <div
                                    key={i}
                                    className="rounded-2xl p-5 transition-all"
                                    role="listitem"
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: `1px solid rgba(255,255,255,0.06)`,
                                    }}
                                >
                                    <span className="material-symbols-outlined text-2xl mb-3 block" style={{ color: BRAND.secondary }} aria-hidden="true">
                                        {c.icon}
                                    </span>
                                    <p className="text-[var(--sys-text)] font-semibold text-sm">{c.label}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ── Teaser + stat ── */}
                    <section className="max-w-3xl mx-auto px-6 py-12 text-center" aria-label="Studio overview">
                        <div
                            className="rounded-3xl p-8 md:p-12 relative overflow-hidden"
                            style={{
                                background: 'rgba(255,255,255,0.02)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <p className="text-lg md:text-xl text-[var(--sys-text-muted)] leading-relaxed">
                                {studio.teaser}
                            </p>
                            <div className="mt-8 inline-flex items-center gap-3 px-5 py-3 rounded-full speakable-stat" style={{ background: `${BRAND.primary}12`, border: `1px solid ${BRAND.primary}30` }}>
                                <span className="text-2xl font-black" style={{ color: BRAND.primary }}>{studio.stat.value}</span>
                                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.textMuted }}>
                                    {studio.stat.label}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* ── Use cases (AIEO content depth) ── */}
                    {studio.useCases?.length > 0 && (
                        <section className="max-w-4xl mx-auto px-6 py-12" aria-labelledby="usecases-title">
                            <h2 id="usecases-title" className="text-center text-2xl font-bold text-[var(--sys-text)] mb-3">
                                Real things people do with {studio.name}
                            </h2>
                            <p className="text-center text-sm text-[var(--sys-text-muted)] mb-10 max-w-xl mx-auto">
                                {studio.problemSolved}
                            </p>
                            <ul className="grid sm:grid-cols-2 gap-3" role="list">
                                {studio.useCases.map((u, i) => (
                                    <li
                                        key={i}
                                        className="flex items-start gap-3 rounded-xl p-4"
                                        style={{
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <span className="material-symbols-outlined text-base mt-0.5" style={{ color: BRAND.secondary }} aria-hidden="true">check_circle</span>
                                        <span className="text-sm text-[var(--sys-text)]">{u}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* ── FAQ (AIEO/GEO depth + FAQPage schema) ── */}
                    {studio.faqs?.length > 0 && (
                        <section className="max-w-3xl mx-auto px-6 py-16" aria-labelledby="faq-title">
                            <h2 id="faq-title" className="text-center text-2xl font-bold text-[var(--sys-text)] mb-10">
                                Frequently asked about {studio.name}
                            </h2>
                            <div className="space-y-3">
                                {studio.faqs.map((f, i) => {
                                    const open = openFaq === i
                                    return (
                                        <div
                                            key={i}
                                            className="rounded-xl overflow-hidden"
                                            style={{
                                                background: 'rgba(255,255,255,0.02)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => setOpenFaq(open ? -1 : i)}
                                                className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer"
                                                aria-expanded={open}
                                                aria-controls={`faq-answer-${i}`}
                                            >
                                                <span className="text-sm font-semibold text-[var(--sys-text)]">{f.question}</span>
                                                <span
                                                    className="material-symbols-outlined transition-transform duration-200"
                                                    style={{ color: BRAND.secondary, transform: open ? 'rotate(180deg)' : 'none' }}
                                                    aria-hidden="true"
                                                >
                                                    expand_more
                                                </span>
                                            </button>
                                            <div
                                                id={`faq-answer-${i}`}
                                                className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}`}
                                            >
                                                <p className="px-5 pb-5 text-sm leading-relaxed text-[var(--sys-text-muted)]">
                                                    {f.answer}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </section>
                    )}

                    {/* ── CTA ── */}
                    <section id="studio-cta" className="max-w-2xl mx-auto px-6 py-16 text-center" aria-labelledby="cta-title">
                        <div
                            className="rounded-3xl p-8 md:p-10"
                            style={{
                                background: `linear-gradient(135deg, ${BRAND.primary}10 0%, ${BRAND.secondary}08 100%)`,
                                border: `1px solid ${BRAND.primary}25`,
                            }}
                        >
                            <h2 id="cta-title" className="text-3xl md:text-4xl font-black text-[var(--sys-text)] mb-3">
                                Ready to try {studio.name}?
                            </h2>
                            <p className="text-[var(--sys-text-muted)] mb-8 max-w-md mx-auto">
                                Mantram AI is in early access. Drop your email and we'll let you in.
                            </p>

                            {!submitted ? (
                                <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto" aria-label="Early access waitlist signup">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="you@brand.com"
                                        required
                                        aria-label="Email address for early access"
                                        className="flex-1 px-5 py-3.5 rounded-xl text-[var(--sys-text)] text-sm focus:outline-none placeholder:text-[var(--sys-text-muted)]"
                                        style={{
                                            background: BRAND.surface,
                                            border: '1px solid rgba(255,255,255,0.08)',
                                        }}
                                    />
                                    <button
                                        type="submit"
                                        className="font-bold py-3.5 px-7 rounded-xl transition-all transform hover:scale-105 active:scale-95 cursor-pointer text-sm whitespace-nowrap"
                                        style={{ background: BRAND.primary, color: 'white' }}
                                    >
                                        Get Early Access
                                    </button>
                                </form>
                            ) : (
                                <div className="rounded-xl p-5 flex items-center justify-center gap-3" role="alert" style={{ background: `${BRAND.secondary}10`, border: `1px solid ${BRAND.secondary}30` }}>
                                    <span className="material-symbols-outlined" style={{ color: BRAND.secondary }} aria-hidden="true">check_circle</span>
                                    <p className="font-semibold text-sm" style={{ color: BRAND.secondary }}>
                                        You're on the list. We'll let you in soon.
                                    </p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── Other studios ── */}
                    <section className="max-w-5xl mx-auto px-6 pb-20" aria-labelledby="other-studios-title">
                        <h2 id="other-studios-title" className="text-center text-lg font-bold text-[var(--sys-text-muted)] mb-8">
                            Explore other studios
                        </h2>
                        <nav className="flex flex-wrap justify-center gap-3" aria-label="Other Mantram AI studios">
                            {STUDIOS.filter(s => s.slug !== slug).map(s => (
                                <Link
                                    key={s.slug}
                                    to={`/studio/${s.slug}`}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:scale-105"
                                    style={{
                                        background: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.05)',
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base" style={{ color: BRAND.secondary }} aria-hidden="true">
                                        {STUDIO_ICONS[s.slug] || 'auto_awesome'}
                                    </span>
                                    <span className="text-[var(--sys-text)] text-xs font-semibold">{s.name}</span>
                                </Link>
                            ))}
                        </nav>
                    </section>
                </main>

                <footer className="border-t border-[var(--sys-border)] py-8 text-center relative z-10" role="contentinfo">
                    <p className="text-[var(--sys-text-muted)] text-xs">
                        © {new Date().getFullYear()} Mantram AI. All rights reserved.
                        <Link to="/privacy-policy" className="ml-3 hover:text-[var(--sys-text)]">Privacy</Link>
                        <Link to="/terms" className="ml-3 hover:text-[var(--sys-text)]">Terms</Link>
                    </p>
                </footer>
            </div>
        </>
    )
}

function StudioNotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.bg }}>
            <SEOHead
                title="Studio not found — Mantram AI"
                description="The studio you're looking for doesn't exist. Browse all Mantram AI studios."
                noIndex
            />
            <div className="text-center">
                <h1 className="text-4xl font-black text-[var(--sys-text)] mb-4">Studio not found</h1>
                <Link to="/" className="hover:underline" style={{ color: BRAND.primary }}>← Back to Mantram AI</Link>
            </div>
        </div>
    )
}
