#!/usr/bin/env node
/**
 * scripts/prerender.mjs — post-build static HTML generator for SEO
 *
 * Runs after `vite build` to create one index.html per public route under dist/.
 * Each copy has route-specific <title>, <meta description>, <link rel="canonical">,
 * and Open Graph tags injected — so Googlebot and AI crawlers get rich HTML on
 * first fetch without waiting for JS execution (two-wave indexing).
 *
 * Usage:  node scripts/prerender.mjs
 * Or add to package.json:  "build:seo": "vite build && node scripts/prerender.mjs"
 *
 * Strategy:
 *   1. Read dist/index.html (the SPA shell built by Vite).
 *   2. For each route, clone the HTML and inject route-specific SEO tags.
 *   3. Write the result to dist/<route>/index.html.
 *   Routes served by Nginx/Netlify/Vercel as static HTML → Googlebot gets content.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '../dist')
const SITE = 'https://mantram.ai'

// ── Route metadata ────────────────────────────────────────────────────────────
// Each entry: { route, title, description, ogTitle?, ogDescription? }
// Studio routes pull their data from the same source as data/studios.js —
// kept in sync manually here since this script runs outside the React context.

const ROUTES = [
  {
    route: '/',
    title: 'Mantram AI — Agentic AI Marketing OS for D2C Brands & Agencies',
    description: "Mantram AI is India's first agentic AI marketing operating system. 14 studios share one Brand DNA. Plan, create, distribute and optimise — powered by Claude 4.6, Gemini 3, GPT Image 2, Veo 3.1, Sora 2, NanoBanana 2.",
    ogTitle: 'Mantram AI — Agentic AI Marketing OS',
    ogDescription: '14 AI studios. One Brand DNA. Agentic pipelines that plan, create, distribute and optimise.',
  },
  {
    route: '/about',
    title: 'About Mantram AI — Built for Indian D2C Brands',
    description: 'Learn about Mantram AI — the team, mission, and technology behind India\'s first agentic AI marketing OS.',
  },
  {
    route: '/privacy-policy',
    title: 'Privacy Policy — Mantram AI',
    description: 'Mantram AI privacy policy — DPDP Act compliant, GDPR-aware. How we collect, use, and protect your data.',
  },
  {
    route: '/terms',
    title: 'Terms of Service — Mantram AI',
    description: 'Mantram AI terms of service and usage agreement.',
  },
  {
    route: '/data-deletion',
    title: 'Data Deletion Request — Mantram AI',
    description: 'Request deletion of your Mantram AI account data. DPDP Act and GDPR compliant.',
  },
  {
    route: '/ai-search-optimization',
    title: 'AI Search Optimization (AEO) — Get Cited in ChatGPT, Perplexity & Google AI',
    description: 'Answer Engine Optimization (AEO) guide for 2026. Learn how to get cited in ChatGPT Search, Google AI Overviews, Perplexity, Microsoft Copilot and Apple Intelligence.',
    ogTitle: 'AEO — Answer Engine Optimization for AI Search',
    ogDescription: 'How to get your brand cited in ChatGPT Search, AI Overviews, and Perplexity in 2026.',
  },
  {
    route: '/blog',
    title: 'Blog — AI Marketing Strategy, AEO, Brand DNA | Mantram AI',
    description: 'Practical guides on AI marketing, Answer Engine Optimisation (AEO), Brand DNA, D2C growth, and AI creative production for Indian brands.',
    ogTitle: 'Mantram AI Blog — AI Marketing Intelligence',
    ogDescription: 'Practical guides on AEO, Brand DNA, D2C growth and AI creative production.',
  },
  {
    route: '/blog/why-indian-d2c-brands-need-ai-marketing-os',
    title: 'Why Every Indian D2C Brand Needs an AI Marketing OS in 2026 | Mantram AI',
    description: "Switching between Canva, ChatGPT, Buffer, and 4 other tools every day is killing your speed. Here's why unified AI brand operating systems are the future for Indian D2C.",
  },
  {
    route: '/blog/what-is-aeo-answer-engine-optimization-2026',
    title: 'What is AEO? Answer Engine Optimization in 2026 Explained | Mantram AI',
    description: 'ChatGPT Search, Google AI Overviews, Perplexity — 40% of searches now happen in AI engines that answer, not rank. Here\'s how to get cited instead of ranked.',
  },
  {
    route: '/blog/brand-dna-ai-marketing-guide',
    title: 'Brand DNA: The AI Concept That Makes All Your Content Sound Like You | Mantram AI',
    description: 'Generic AI outputs are the #1 complaint from marketers. Brand DNA is the solution — a structured brand profile that every AI studio reads before generating anything.',
  },
  // Studio sub-pages
  { route: '/studio/research-studio',       title: 'Research Studio — Live Market Intelligence | Mantram AI',           description: 'Live competitor scraping, ad intel, audience listening and keyword research in 30 seconds. Mantram AI Research Studio.' },
  { route: '/studio/brainstorm-studio',     title: 'Brainstorm Studio — AI Creative Director | Mantram AI',            description: 'AI creative director generating campaign concepts, naming, and ad film scripts in your brand voice.' },
  { route: '/studio/monthly-strategy',      title: 'Monthly Strategy — 30-Day Content Calendar | Mantram AI',          description: '30 days of deliberate content briefs in one click, grounded in live trend data and your Brand DNA.' },
  { route: '/studio/content-studio',        title: 'Content Studio — AI Copywriter for D2C Brands | Mantram AI',       description: 'AI copywriter that sounds like your brand — blogs, captions, ad copy, emails, and multilingual content.' },
  { route: '/studio/creative-studio',       title: 'Creative Studio — Multi-Agent AI Design | Mantram AI',             description: 'Multi-agent design pipeline — art director, prompt engineer, critic, generator. Brand-locked output across NanoBanana 2, GPT Image 2, Flux.' },
  { route: '/studio/video-studio',          title: 'Video Studio — Veo 3.1, Sora 2, Seedance 2.0 | Mantram AI',       description: 'AI video generation with Veo 3.1, Sora 2, Seedance 2.0 Pro, Kling 3.0, HappyHorse 1.0 — auto-routed per brief.' },
  { route: '/studio/youtube-studio',        title: 'YouTube Studio — Long-Form Scripts & SEO | Mantram AI',            description: 'Long-form scripts, thumbnail concepts and channel SEO — built around your brand.' },
  { route: '/studio/avatar-studio',         title: 'Avatar Studio — AI Presenter Avatars | Mantram AI',               description: 'AI presenter avatars for UGC and explainer video, with HeyGen for animated avatar video.' },
  { route: '/studio/brand-studio',          title: 'Brand Studio — Decks, Listings & Landing Pages | Mantram AI',     description: 'AI-generated decks, A+ listings, email templates, moodboards and landing pages — all on-brand.' },
  { route: '/studio/social-media-studio',   title: 'Social Media Studio — AI Publishing for Instagram & LinkedIn | Mantram AI', description: 'Per-platform voice and Meta-compliant publishing for Instagram, Facebook, LinkedIn and X.' },
  { route: '/studio/performance-marketing', title: 'Performance Marketing — AI Ad Strategist | Mantram AI',            description: 'AI ad strategist for Meta and Google with live Shopify ROAS optimisation.' },
  { route: '/studio/funnel-studio',         title: 'Funnel Studio — Lead-Gen & Ecommerce Funnels | Mantram AI',       description: 'Lead-gen, launches, win-back and ecommerce funnels with built-in CRM and RFM segmentation.' },
  { route: '/studio/seo-studio',            title: 'SEO Studio — AI Search & AEO Optimisation | Mantram AI',          description: 'Live keyword research, JS-render audits, content gap, backlink intel and AEO for ChatGPT Search and AI Overviews.' },
  { route: '/studio/retention-studio',      title: 'Retention Studio — Win-Back & RFM Automation | Mantram AI',       description: 'Win-back, browse-abandonment and RFM segmentation across email, SMS and push.' },
]

// ── Helper: inject SEO tags into HTML ─────────────────────────────────────────
function injectSEO(html, { route, title, description, ogTitle, ogDescription }) {
  const canonical = `${SITE}${route}`
  const og = {
    title: ogTitle || title,
    description: ogDescription || description,
  }

  // Replace existing title
  html = html.replace(/<title>.*?<\/title>/s, `<title>${title}</title>`)

  // Replace meta description
  html = html.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${description.replace(/"/g, '&quot;')}" />`
  )

  // Inject / replace canonical
  if (html.includes('rel="canonical"')) {
    html = html.replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${canonical}" />`)
  } else {
    html = html.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n</head>`)
  }

  // OG tags
  html = html.replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${og.title.replace(/"/g, '&quot;')}" />`)
  html = html.replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${og.description.replace(/"/g, '&quot;')}" />`)
  html = html.replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${canonical}" />`)

  // Twitter
  html = html.replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${og.title.replace(/"/g, '&quot;')}" />`)
  html = html.replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${og.description.replace(/"/g, '&quot;')}" />`)

  return html
}

// ── Main ──────────────────────────────────────────────────────────────────────
function run() {
  const shellPath = path.join(DIST, 'index.html')
  if (!fs.existsSync(shellPath)) {
    console.error(`❌ dist/index.html not found. Run 'vite build' first.`)
    process.exit(1)
  }

  const shell = fs.readFileSync(shellPath, 'utf8')
  let created = 0
  let skipped = 0

  for (const meta of ROUTES) {
    const { route } = meta

    // Root is already dist/index.html — update it in place
    if (route === '/') {
      const injected = injectSEO(shell, meta)
      fs.writeFileSync(shellPath, injected)
      console.log(`✅ /  → dist/index.html (updated in place)`)
      created++
      continue
    }

    // All other routes: create dist/<route>/index.html
    const dir = path.join(DIST, route)
    const outFile = path.join(dir, 'index.html')

    fs.mkdirSync(dir, { recursive: true })
    const injected = injectSEO(shell, meta)
    fs.writeFileSync(outFile, injected)
    console.log(`✅ ${route}  → dist${route}/index.html`)
    created++
  }

  console.log(`\n🎉 Pre-render complete: ${created} routes, ${skipped} skipped.`)
  console.log('   Deploy dist/ to your server. Each route now has a static HTML file.')
  console.log('   Googlebot will get rich HTML on first fetch — no JS rendering needed.')
}

run()
