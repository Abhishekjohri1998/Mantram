import { Link, useParams } from 'react-router-dom'
import SEOHead from '../components/SEOHead'
import { BRAND, SITE_URL } from '../data/studios'

/**
 * Blog — public SEO-indexed blog at /blog and /blog/:slug.
 *
 * Posts are statically defined here until a CMS is wired up.
 * All post content is server-renderable (no async fetching) so prerender
 * captures full HTML for Googlebot and AI crawlers on first request.
 */

export const BLOG_POSTS = [
  {
    slug: 'why-indian-d2c-brands-need-ai-marketing-os',
    title: 'Why Every Indian D2C Brand Needs an AI Marketing OS in 2026',
    description: 'Switching between Canva, ChatGPT, Buffer, and 4 other tools every day is killing your speed. Here\'s why unified AI brand operating systems are the future for Indian D2C.',
    date: '2026-05-01',
    author: 'Mantram AI Team',
    category: 'Strategy',
    readTime: '7 min',
    heroLine: 'The hidden cost of your 7-tool marketing stack — and the fix.',
    content: [
      {
        type: 'p',
        text: 'The average Indian D2C brand in 2026 runs its marketing across seven tools: Canva for design, ChatGPT for copy, Buffer or SocialPilot for scheduling, SEMrush for SEO, Meta Business Suite for ads, Shopify Analytics for commerce data, and WhatsApp for customer support. Monthly cost: ₹15,000–₹40,000. Time lost to context-switching: 2–3 hours per day. Brand consistency across outputs: near zero.'
      },
      {
        type: 'h2',
        text: 'The Real Problem Isn\'t the Tools — It\'s the Context Gap'
      },
      {
        type: 'p',
        text: 'Each tool works in isolation. Canva doesn\'t know what your Shopify numbers look like. ChatGPT doesn\'t know your brand voice. Buffer doesn\'t know what\'s trending in your category. The result is content that\'s generic, inconsistent, and disconnected from your actual business performance.'
      },
      {
        type: 'h2',
        text: 'What an AI Marketing OS Actually Does'
      },
      {
        type: 'p',
        text: 'An AI Marketing OS like Mantram captures your Brand DNA once — your voice, visual identity, audience, competitors, product catalog — and injects it into every output across every studio. Your Shopify data informs your creatives. Your trending keywords inform your content briefs. Your brand colors inform every image. Everything is connected.'
      },
      {
        type: 'h2',
        text: 'The India-Specific Case'
      },
      {
        type: 'p',
        text: 'Indian D2C brands have unique needs no Western tool addresses: content in Hindi, Tamil, Marathi, and Hinglish; DLT-compliant SMS marketing; INR pricing without forex friction; festival-aware content calendars (Diwali, Navratri, Eid, Pongal); and D2C analytics that understand India\'s marketplace ecosystem (Meesho, Flipkart, Myntra alongside Shopify). Mantram is built specifically for this reality.'
      },
      {
        type: 'h2',
        text: 'The Numbers'
      },
      {
        type: 'p',
        text: 'India\'s D2C market hit $108B in 2026 and is growing at 25% CAGR. Over 800 active D2C brands are competing for the same digital shelf space. The brands that win in this environment will be the ones that can create more, create faster, and create on-brand — without proportionally growing their team. AI Marketing OS is how they do it.'
      },
    ]
  },
  {
    slug: 'what-is-aeo-answer-engine-optimization-2026',
    title: 'What is AEO? Answer Engine Optimization in 2026 Explained',
    description: 'ChatGPT Search, Google AI Overviews, Perplexity — 40% of searches now happen in AI engines that answer, not rank. Here\'s how to get cited instead of ranked.',
    date: '2026-05-02',
    author: 'Mantram AI Team',
    category: 'SEO & AEO',
    readTime: '9 min',
    heroLine: 'SEO gets you ranked. AEO gets you quoted by AI.',
    content: [
      {
        type: 'p',
        text: 'In 2026, a growing share of searches never reach a ranked list of blue links. ChatGPT Search synthesises an answer. Google AI Overviews summarises sources. Perplexity cites three pages and moves on. If your brand isn\'t in those citations, you\'re invisible — regardless of your PageRank.'
      },
      {
        type: 'h2',
        text: 'AEO vs SEO: What\'s Different'
      },
      {
        type: 'p',
        text: 'Traditional SEO optimises for ranking signals: backlinks, page speed, keyword density, E-E-A-T signals. AEO (Answer Engine Optimisation) optimises for citation signals: structured claims, attributed sources, FAQ and HowTo schema, Speakable markup, and content that directly answers specific questions with verifiable information.'
      },
      {
        type: 'h2',
        text: 'The 7 AEO Signals AI Engines Look For'
      },
      {
        type: 'p',
        text: '1. Clear factual claims with "as of [date]" attribution. 2. FAQ schema (FAQPage JSON-LD). 3. HowTo schema for step-by-step content. 4. Speakable schema for voice/AI excerpt selection. 5. llms.txt file for AI crawler discovery. 6. Structured data linking to authoritative sources. 7. Content that answers natural-language queries in the first paragraph.'
      },
      {
        type: 'h2',
        text: 'Which Engines to Optimise For'
      },
      {
        type: 'p',
        text: 'Priority targets as of May 2026: ChatGPT Search (OpenAI, GPTBot crawler), Google AI Overviews and AI Mode (Google-Extended crawler), Perplexity (PerplexityBot), Microsoft Copilot (Bingbot + OAI-SearchBot), Apple Intelligence (Applebot-Extended), Claude with web (ClaudeBot). Each engine has different citation biases — ChatGPT favours recent authoritative pages, Perplexity favours specific factual claims, Google AI Overviews favours established domains with E-E-A-T signals.'
      },
      {
        type: 'h2',
        text: 'How Mantram\'s SEO Studio Handles AEO'
      },
      {
        type: 'p',
        text: 'Mantram\'s SEO Studio natively generates AEO-optimised content with all required schema types, tracks citation share across 7 AI engines, and rewrites existing content to improve citation probability. The AI Search Optimisation module shows you which queries you\'re being cited for and which competitors are taking your citations.'
      },
    ]
  },
  {
    slug: 'brand-dna-ai-marketing-guide',
    title: 'Brand DNA: The AI Concept That Makes All Your Content Sound Like You',
    description: 'Generic AI outputs are the #1 complaint from marketers. Brand DNA is the solution — a structured brand profile that every AI studio reads before generating anything.',
    date: '2026-04-30',
    author: 'Mantram AI Team',
    category: 'Brand Strategy',
    readTime: '6 min',
    heroLine: 'Why your AI-generated content sounds generic — and how to fix it forever.',
    content: [
      {
        type: 'p',
        text: 'The most common complaint from marketers using AI tools in 2026: "It doesn\'t sound like us." Every output is grammatically correct, structurally fine, and completely devoid of any distinguishable brand personality. This is the Brand DNA problem — and it\'s solvable.'
      },
      {
        type: 'h2',
        text: 'What Brand DNA Contains'
      },
      {
        type: 'p',
        text: 'A Brand DNA profile is a structured data object extracted from a brand\'s existing presence: website copy, social media posts, customer reviews, competitor positioning, and product catalog. It captures: voice (witty, formal, warm, irreverent), tone modifiers per platform (Instagram vs LinkedIn vs email), visual identity (color palette, typography, photography style), audience personas, key messages, and content rules (what to say, what to never say).'
      },
      {
        type: 'h2',
        text: 'How It Works in Mantram'
      },
      {
        type: 'p',
        text: 'In Mantram, Brand DNA is captured in ~90 seconds by scanning a brand\'s website URL. The system scrapes public pages, analyses social posts, extracts competitor positioning, and builds a structured profile that every studio reads from automatically. When you open Creative Studio, it already knows your brand\'s visual language. When you open Content Studio, it already knows your voice. You never re-prompt your brand identity.'
      },
      {
        type: 'h2',
        text: 'The Switching Cost Advantage'
      },
      {
        type: 'p',
        text: 'Once Brand DNA is established, it becomes a competitive moat for the platform. Switching tools means re-educating a new AI system from scratch — losing months of refined brand context. This is why Brand DNA is the single most important feature in an AI marketing platform, not the generative models themselves.'
      },
    ]
  }
]

// Index view
function BlogIndex() {
  return (
    <>
      <SEOHead
        title="Blog — AI Marketing Strategy, AEO, Brand DNA | Mantram AI"
        description="Practical guides on AI marketing, Answer Engine Optimisation (AEO), Brand DNA, D2C growth, and AI creative production for Indian brands and global agencies."
        canonical="/blog"
        ogTitle="Mantram AI Blog — AI Marketing Intelligence"
        ogDescription="Practical guides on AEO, Brand DNA, AI video, D2C growth and AI creative production."
        ogImage={`${SITE_URL}/mantram-logo.png`}
      />
      <div className="min-h-screen" style={{ background: BRAND.bg }}>
        {/* Nav */}
        <nav className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-2xl" style={{ background: `${BRAND.bg}ee` }}>
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src="/mantram-logo.png" alt="Mantram AI" className="size-8 rounded-xl" width="32" height="32" />
              <span className="font-bold text-[var(--sys-text)]">Mantram <span style={{ color: BRAND.primary }}>AI</span></span>
            </Link>
            <Link to="/auth" className="text-sm font-bold py-2 px-5 rounded-full" style={{ background: BRAND.primary, color: 'white' }}>
              Get Early Access
            </Link>
          </div>
        </nav>

        <main className="max-w-5xl mx-auto px-6 py-16">
          <div className="mb-14 text-center">
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: BRAND.primary }}>Mantram AI Blog</p>
            <h1 className="text-4xl md:text-5xl font-black text-[var(--sys-text)] mb-4">AI Marketing Intelligence</h1>
            <p className="text-[var(--sys-text-muted)] text-lg max-w-xl mx-auto">
              Practical guides on Brand DNA, AEO, D2C growth, and AI creative production — for Indian brands and global agencies.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {BLOG_POSTS.map(post => (
              <Link key={post.slug} to={`/blog/${post.slug}`}
                className="rounded-2xl p-6 flex flex-col gap-4 transition-all hover:scale-[1.01] hover:shadow-xl group"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                    style={{ background: `${BRAND.primary}15`, color: BRAND.primary }}>
                    {post.category}
                  </span>
                  <span className="text-[10px] text-[var(--sys-text-muted)]">{post.readTime} read</span>
                </div>
                <h2 className="text-[var(--sys-text)] font-bold text-base leading-snug group-hover:text-white transition-colors">
                  {post.title}
                </h2>
                <p className="text-[var(--sys-text-muted)] text-sm leading-relaxed flex-1">{post.heroLine}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--sys-text-muted)]">{post.date}</span>
                  <span className="text-xs font-semibold" style={{ color: BRAND.secondary }}>Read →</span>
                </div>
              </Link>
            ))}
          </div>

          {/* Cross-link to studios */}
          <div className="mt-20 text-center p-10 rounded-3xl" style={{ background: `${BRAND.primary}08`, border: `1px solid ${BRAND.primary}20` }}>
            <h2 className="text-2xl font-black text-[var(--sys-text)] mb-3">Explore the Studios</h2>
            <p className="text-[var(--sys-text-muted)] mb-6 max-w-md mx-auto text-sm">
              14 AI studios unified by Brand DNA. Plan, create, distribute, and optimise — all from one platform.
            </p>
            <Link to="/#studios" className="inline-block font-bold py-3 px-8 rounded-full transition-all hover:scale-105"
              style={{ background: BRAND.primary, color: 'white' }}>
              See All Studios
            </Link>
          </div>
        </main>

        <footer className="border-t border-white/5 py-8 text-center">
          <p className="text-[var(--sys-text-muted)] text-xs">
            © {new Date().getFullYear()} Mantram AI.
            <Link to="/privacy-policy" className="ml-3 hover:text-[var(--sys-text)]">Privacy</Link>
            <Link to="/terms" className="ml-3 hover:text-[var(--sys-text)]">Terms</Link>
          </p>
        </footer>
      </div>
    </>
  )
}

// Single post view
function BlogPost() {
  const { slug } = useParams()
  const post = BLOG_POSTS.find(p => p.slug === slug)

  if (!post) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.bg }}>
        <SEOHead title="Post not found — Mantram AI Blog" description="This post doesn't exist." noIndex />
        <div className="text-center">
          <h1 className="text-3xl font-black text-[var(--sys-text)] mb-4">Post not found</h1>
          <Link to="/blog" style={{ color: BRAND.primary }}>← Back to Blog</Link>
        </div>
      </div>
    )
  }

  const fullUrl = `${SITE_URL}/blog/${post.slug}`
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${fullUrl}#article`,
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: 'Mantram AI', url: SITE_URL },
    publisher: { '@type': 'Organization', name: 'Mantram AI', logo: { '@type': 'ImageObject', url: `${SITE_URL}/mantram-logo.png` } },
    url: fullUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': fullUrl },
    image: `${SITE_URL}/mantram-logo.png`,
    articleSection: post.category,
    inLanguage: 'en',
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', '.post-lead'] },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title, item: fullUrl },
      ]
    }
  }

  return (
    <>
      <SEOHead
        title={`${post.title} | Mantram AI Blog`}
        description={post.description}
        canonical={`/blog/${post.slug}`}
        ogTitle={post.title}
        ogDescription={post.description}
        ogImage={`${SITE_URL}/mantram-logo.png`}
        jsonLd={jsonLd}
      />
      <div className="min-h-screen" style={{ background: BRAND.bg }}>
        {/* Nav */}
        <nav className="sticky top-0 z-50 border-b border-white/5 backdrop-blur-2xl" style={{ background: `${BRAND.bg}ee` }}>
          <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <img src="/mantram-logo.png" alt="Mantram AI" className="size-8 rounded-xl" width="32" height="32" />
              <span className="font-bold text-[var(--sys-text)]">Mantram <span style={{ color: BRAND.primary }}>AI</span></span>
            </Link>
            <Link to="/blog" className="text-sm text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]">← Blog</Link>
          </div>
        </nav>

        <main className="max-w-3xl mx-auto px-6 py-16">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                style={{ background: `${BRAND.primary}15`, color: BRAND.primary }}>{post.category}</span>
              <span className="text-[11px] text-[var(--sys-text-muted)]">{post.readTime} read · {post.date}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black text-[var(--sys-text)] leading-tight mb-4">{post.title}</h1>
            <p className="post-lead text-lg text-[var(--sys-text-muted)] leading-relaxed">{post.heroLine}</p>
          </div>

          {/* Content */}
          <article className="prose prose-invert prose-lg max-w-none space-y-6">
            {post.content.map((block, i) => {
              if (block.type === 'h2') return (
                <h2 key={i} className="text-xl font-bold text-[var(--sys-text)] mt-10 mb-3">{block.text}</h2>
              )
              return (
                <p key={i} className="text-[var(--sys-text-muted)] leading-relaxed">{block.text}</p>
              )
            })}
          </article>

          {/* CTA */}
          <div className="mt-16 rounded-2xl p-8 text-center" style={{ background: `${BRAND.primary}08`, border: `1px solid ${BRAND.primary}20` }}>
            <h2 className="text-xl font-black text-[var(--sys-text)] mb-2">Try Mantram AI</h2>
            <p className="text-[var(--sys-text-muted)] text-sm mb-5">14 AI studios unified by Brand DNA. In early access.</p>
            <Link to="/auth" className="inline-block font-bold py-3 px-8 rounded-full transition-all hover:scale-105"
              style={{ background: BRAND.primary, color: 'white' }}>
              Get Early Access
            </Link>
          </div>

          {/* Related posts */}
          <div className="mt-16">
            <h2 className="text-base font-bold text-[var(--sys-text)] mb-6">More from the blog</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {BLOG_POSTS.filter(p => p.slug !== slug).slice(0, 2).map(p => (
                <Link key={p.slug} to={`/blog/${p.slug}`}
                  className="rounded-xl p-5 flex flex-col gap-2 hover:scale-[1.01] transition-all"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.primary }}>{p.category}</span>
                  <span className="text-sm font-semibold text-[var(--sys-text)] leading-snug">{p.title}</span>
                  <span className="text-xs font-semibold mt-1" style={{ color: BRAND.secondary }}>Read →</span>
                </Link>
              ))}
            </div>
          </div>
        </main>

        <footer className="border-t border-white/5 py-8 text-center mt-10">
          <p className="text-[var(--sys-text-muted)] text-xs">
            © {new Date().getFullYear()} Mantram AI.
            <Link to="/privacy-policy" className="ml-3 hover:text-[var(--sys-text)]">Privacy</Link>
            <Link to="/terms" className="ml-3 hover:text-[var(--sys-text)]">Terms</Link>
          </p>
        </footer>
      </div>
    </>
  )
}

// Route-level export: renders index at /blog, post at /blog/:slug
export default function Blog() {
  const { slug } = useParams()
  return slug ? <BlogPost /> : <BlogIndex />
}
