import { useEffect } from 'react'

/**
 * SEO Head Manager — dynamically updates document.title, meta tags,
 * Open Graph/Twitter Cards, canonical URL, and injects JSON-LD structured data.
 * 
 * Works without react-helmet — uses native DOM manipulation.
 * AI SEO friendly: supports ai.summary meta tag for LLM discovery.
 *
 * Usage:
 *   <SEOHead
 *     title="Content Studio — Mantram AI"
 *     description="AI-powered writing for blogs, captions & ad copy"
 *     canonical="/studio/content-studio"
 *     ogTitle="Content Studio — Mantram AI"
 *     ogDescription="AI-powered writing..."
 *     ogImage="https://mantram.ai/mantram-logo.png"
 *     twitterTitle="Content Studio — Mantram AI"
 *     twitterDescription="AI-powered writing..."
 *     aiSummary="Content Studio generates brand-aligned blog posts, social captions..."
 *     jsonLd={{ "@context": "https://schema.org", ... }}
 *   />
 */
export default function SEOHead({
    title,
    description,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    ogType = 'website',
    twitterTitle,
    twitterDescription,
    twitterImage,
    aiSummary,
    jsonLd,
    noIndex = false,
}) {
    useEffect(() => {
        /* ── Title ── */
        if (title) document.title = title

        /* ── Helper: upsert a meta tag ── */
        const setMeta = (attr, key, content) => {
            if (!content) return
            let el = document.querySelector(`meta[${attr}="${key}"]`)
            if (!el) {
                el = document.createElement('meta')
                el.setAttribute(attr, key)
                document.head.appendChild(el)
            }
            el.setAttribute('content', content)
        }

        /* ── Primary meta ── */
        setMeta('name', 'description', description)
        if (noIndex) setMeta('name', 'robots', 'noindex, nofollow')

        /* ── Open Graph ── */
        setMeta('property', 'og:title', ogTitle || title)
        setMeta('property', 'og:description', ogDescription || description)
        setMeta('property', 'og:type', ogType)
        if (ogImage) setMeta('property', 'og:image', ogImage)
        if (canonical) setMeta('property', 'og:url', `https://mantram.ai${canonical}`)

        /* ── Twitter ── */
        setMeta('name', 'twitter:title', twitterTitle || ogTitle || title)
        setMeta('name', 'twitter:description', twitterDescription || ogDescription || description)
        if (twitterImage || ogImage) setMeta('name', 'twitter:image', twitterImage || ogImage)

        /* ── AI SEO ── */
        if (aiSummary) setMeta('name', 'ai.summary', aiSummary)

        /* ── Canonical ── */
        if (canonical) {
            let link = document.querySelector('link[rel="canonical"]')
            if (!link) {
                link = document.createElement('link')
                link.setAttribute('rel', 'canonical')
                document.head.appendChild(link)
            }
            link.setAttribute('href', `https://mantram.ai${canonical}`)
        }

        /* ── JSON-LD ── */
        let scriptId = 'seo-head-jsonld'
        let script = document.getElementById(scriptId)
        if (jsonLd) {
            if (!script) {
                script = document.createElement('script')
                script.id = scriptId
                script.type = 'application/ld+json'
                document.head.appendChild(script)
            }
            script.textContent = JSON.stringify(jsonLd)
        }

        /* ── Cleanup ── */
        return () => {
            const s = document.getElementById(scriptId)
            if (s) s.remove()
        }
    }, [title, description, canonical, ogTitle, ogDescription, ogImage, ogType, twitterTitle, twitterDescription, twitterImage, aiSummary, jsonLd, noIndex])

    return null
}
