/**
 * Pulse Landing Page Builder v3 — Product-First Edition
 *
 * Produces a premium, interactive, parallax product landing page from ProductDNA.
 *
 * Pipeline:
 *   1. Build rich product context from productDNA + productData (NOT brand-generic)
 *   2. Gemini 2.5 Flash writes the structured JSON plan (cheap + fast, great at JSON)
 *   3. Generate 2 AI lifestyle images using product colors + mood directive
 *   4. Assemble interactive HTML: parallax hero with actual product image,
 *      GSAP scroll reveals, animated counters, sticky nav, FAQ accordion, CTA
 *   5. Upload to S3 and return hosted URL
 *
 * Design philosophy:
 *   - Hero always shows the REAL product image (from productDNA.heroImageUrl)
 *   - Generated AI images are LIFESTYLE/CONTEXT images (not product duplicates)
 *   - All colors come from productDNA.dominantColors (the actual product palette)
 *   - Typography from brandColorEngine personality detection
 */

import { v4 as uuidv4 } from 'uuid';
import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import { callMcpToolsParallel } from '../../mcp/registry.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { uploadToS3 } from '../../utils/s3.js';
import { generateBrandTokens } from '../../utils/brandColorEngine.js';
import fetch from 'node-fetch';

// ── Model routing: Gemini 2.5 Flash for copy (cheap, fast, excellent JSON), Gemini for images
const COPY_MODEL_OPTS = { preferFast: true, timeoutMs: 120_000 };

// ── Build rich product context block from PDI output ──────────────────
function buildProductContext(productDNA = {}, productData = {}, designContext = {}) {
    const lines = [];

    const name = productData?.title || productDNA?.productCategory || 'This Product';
    lines.push(`PRODUCT NAME: ${name}`);

    if (productDNA?.productCategory) lines.push(`CATEGORY: ${productDNA.productCategory}`);
    if (productData?.description)    lines.push(`DESCRIPTION: ${productData.description?.substring(0, 400)}`);

    const bullets = productData?.bulletPoints || [];
    if (bullets.length) {
        lines.push(`KEY FEATURES & BENEFITS:`);
        bullets.slice(0, 10).forEach(b => lines.push(`  • ${b}`));
    }

    const colors = (productDNA?.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .slice(0, 4);
    if (colors.length) {
        lines.push(`PRODUCT COLORS: ${colors.map(c => `${c.name} (${c.hex})`).join(', ')}`);
    }

    if (designContext?.moodLabel)      lines.push(`VISUAL MOOD: ${designContext.moodLabel}`);
    if (designContext?.shootDirective) lines.push(`SHOOT DIRECTIVE: ${designContext.shootDirective}`);

    if (productData?.price) lines.push(`PRICE: ${productData.price}`);
    if (productData?.brand) lines.push(`BRAND: ${productData.brand}`);

    const extras = productData?.additionalInfo || productDNA?.usageMoments;
    if (extras) lines.push(`USAGE CONTEXT: ${JSON.stringify(extras).substring(0, 200)}`);

    return lines.join('\n');
}

// ── Phase 1: Quick trend scan (non-blocking) ──────────────────────────
async function gatherIntelligence(productName, brandId) {
    try {
        const results = await callMcpToolsParallel([
            { tool: 'web_search', args: { query: `${productName} best product landing page trends 2026`, mode: 'quick' } },
        ]);
        const snippets = results['web_search']?.data?.results
            ?.slice(0, 2).map(r => `• ${r.title}: ${r.snippet}`).join('\n') || '';
        return snippets;
    } catch {
        return '';
    }
}

// ── Phase 2: Gemini 2.5 Flash content planner ─────────────────────────
const PAGE_SYSTEM = (productCtx, brandContext, trendSnippets) =>
`You are an elite product copywriter and conversion strategist. You write for e-commerce and D2C brands.

MISSION: Write a high-converting, benefit-led product landing page in JSON. Every word must be about THIS SPECIFIC PRODUCT — not the brand, not generic values.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT CONTEXT (use every detail):
${productCtx}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BRAND CONTEXT (style/voice reference only):
${brandContext?.substring(0, 600) || 'Use premium, professional style.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${trendSnippets ? `LIVE TRENDS:\n${trendSnippets}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━` : ''}

CRITICAL RULES:
1. ALL copy must be PRODUCT-specific — reference actual features, benefits, use cases.
2. Hero headline MUST name a concrete benefit (not the brand name).
3. Features must come from the product's actual bullet points.
4. Stats must be realistic and product-specific.
5. Testimonials must reference the product's specific use case.
6. imagePrompt: Describe a lifestyle scene showing the product in use. Be VERY specific about the product's appearance, color, and the user/scene. This is sent to an image generator.
7. Return ONLY valid JSON — no markdown, no comments.

JSON SCHEMA (fill every field with real, product-specific content):
{
  "seo": {
    "title": "Product name — 5-word benefit headline | Brand",
    "description": "120-char meta description about the product",
    "slug": "product-name-slug"
  },
  "hero": {
    "eyebrow": "Short category label (e.g. 'Premium Wireless Audio')",
    "headline": "Powerful 6-8 word benefit headline",
    "subheadline": "One compelling sentence — the #1 transformation this product delivers",
    "ctaPrimary": "Buy Now / Shop Now / Get Yours",
    "ctaSecondary": "Learn More / See How It Works",
    "socialProofLine": "e.g. '10,000+ happy customers · Free delivery · 30-day returns'"
  },
  "problemSection": {
    "headline": "The problem this product solves (6-8 words)",
    "body": "2-sentence empathy statement about the customer's pain point",
    "painPoints": ["Pain 1", "Pain 2", "Pain 3"]
  },
  "featuresSection": {
    "headline": "Why [Product] is different",
    "features": [
      { "icon": "🎯", "title": "Feature name", "body": "1-sentence benefit explanation" }
    ]
  },
  "statsSection": {
    "headline": "The numbers speak for themselves",
    "stats": [
      { "number": "10000", "suffix": "+", "label": "Happy Customers" },
      { "number": "4.9", "suffix": "★", "label": "Average Rating" },
      { "number": "30", "suffix": " Days", "label": "Money-Back Guarantee" }
    ]
  },
  "howItWorks": {
    "headline": "How [Product] works",
    "steps": [
      { "title": "Step name", "body": "What happens in this step" }
    ]
  },
  "testimonials": [
    { "quote": "Specific quote about using the product", "author": "First Name L.", "role": "Verified Buyer", "rating": 5, "highlight": "Key phrase to bold" }
  ],
  "faq": [
    { "question": "Product-specific question", "answer": "Clear, specific answer" }
  ],
  "cta": {
    "headline": "Final benefit-led CTA headline",
    "body": "1-sentence urgency or value statement",
    "button": "CTA button text",
    "guarantee": "e.g. '30-day money-back guarantee · Free shipping'"
  },
  "lifestyleImagePrompt": "Detailed scene: a [person description] using [describe the product's color, shape, material] in [specific environment]. [Lighting]. [Mood]. Editorial product photography, cinematic, 8K.",
  "contextImagePrompt": "Close-up detail shot of [product specific feature/texture/detail], [lighting], macro photography, studio quality."
}`;

// ── Phase 3: Generate only LIFESTYLE images (hero uses real product image) ──
async function generateLifestyleImages(plan, productDNA, designContext, imageModel) {
    const model = imageModel || 'gemini-3.1-flash-image-preview';
    const refImages = [
        productDNA?.heroImageUrl,
        ...(productDNA?.productRefImages || []).slice(0, 2)
    ].filter(Boolean);

    const colorGuard = (productDNA?.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .slice(0, 3)
        .map(c => `${c.name} (${c.hex})`).join(', ');

    const moodEnhancer = designContext?.moodLabel
        ? `. Visual mood: ${designContext.moodLabel}. ${designContext.shootDirective || ''}`
        : '';

    const prompts = [
        {
            key: 'lifestyle',
            prompt: `${plan.lifestyleImagePrompt || 'Person enjoying the product in a premium lifestyle setting'}${moodEnhancer}${colorGuard ? `. Product colors visible: ${colorGuard}` : ''}. Editorial photography, cinematic lighting, ultra-realistic, 8K. NO text overlays.`,
            size: '1792x1024',
        },
        {
            key: 'context',
            prompt: `${plan.contextImagePrompt || 'Premium product detail shot on elegant surface'}${moodEnhancer}${colorGuard ? `. Product colors: ${colorGuard}` : ''}. Studio lighting, macro photography, magazine quality. NO text overlays.`,
            size: '1024x1024',
        },
    ];

    console.log(`🎨 Landing Page: generating ${prompts.length} lifestyle images...`);
    const results = await Promise.allSettled(
        prompts.map(async ({ key, prompt, size }) => {
            try {
                const r = refImages.length > 0
                    ? await laozhangMultimodalImageGenerate(prompt, refImages, { model, size })
                    : await laozhangImageGenerate(prompt, { model, size });
                return { key, url: r?.imageUrl || null };
            } catch (e) {
                console.warn(`⚠️ Image gen failed for ${key}:`, e.message);
                return { key, url: null };
            }
        })
    );

    const images = {};
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value?.url) {
            images[r.value.key] = r.value.url;
        }
    }
    return images;
}

// ── Phase 4: Premium Product HTML Builder ─────────────────────────────
function buildProductHTML(plan, productDNA, productData, images, tokens, slug) {
    const { colors, fonts, radius, shadows } = tokens;
    const productName = productData?.title || productDNA?.productCategory || 'Product';
    const productHeroImage = productDNA?.heroImageUrl || null;

    // Product gallery images (all PDI-extracted images)
    const productGallery = [
        productDNA?.heroImageUrl,
        ...(productDNA?.productRefImages || []).slice(0, 4),
    ].filter(Boolean);

    const features = (plan.featuresSection?.features || []).slice(0, 6);
    const stats = plan.statsSection?.stats || [];
    const steps = plan.howItWorks?.steps || [];
    const testimonials = plan.testimonials || [];
    const faqs = plan.faq || [];
    const painPoints = plan.problemSection?.painPoints || [];

    // Pick 2-3 dominant product colors for accent gradient
    const productColors = (productDNA?.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .slice(0, 3)
        .map(c => c.hex);
    const accentGradient = productColors.length >= 2
        ? `linear-gradient(135deg, ${productColors[0]} 0%, ${productColors[1]} 100%)`
        : `linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%)`;
    const heroAccent = productColors[0] || colors.primary;
    const heroAccent2 = productColors[1] || colors.accent;
    const heroText = '#FFFFFF'; // Always white on product color hero

    return `<!DOCTYPE html>
<html lang="en">
<!-- MANTRAM-PULSE-PAGE slug:${slug} generated:${Date.now()} -->
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${plan.seo?.title || productName + ' — Official Page'}</title>
  <meta name="description" content="${plan.seo?.description || ''}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=${fonts.heading.replace(/ /g,'+')}:wght@400;600;700;800;900&family=${fonts.body.replace(/ /g,'+')}:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root {
      --accent:       ${heroAccent};
      --accent2:      ${heroAccent2};
      --accent-grad:  ${accentGradient};
      --text:         #0a0a0a;
      --text-muted:   #6b7280;
      --surface:      #f9f9fb;
      --border:       rgba(0,0,0,0.08);
      --radius-card:  ${radius.card};
      --radius-btn:   ${radius.button};
      --shadow-card:  ${shadows.card};
      --shadow-hover: ${shadows.cardHover};
    }

    html { scroll-behavior: smooth; }
    body {
      font-family: '${fonts.body}', sans-serif;
      background: #ffffff;
      color: var(--text);
      overflow-x: hidden;
      line-height: 1.7;
    }
    h1,h2,h3,h4,h5 { font-family:'${fonts.heading}',sans-serif; font-weight:${fonts.headingWeight}; line-height:1.1; letter-spacing:-0.02em; }
    h1 { font-size: clamp(44px,7vw,92px); letter-spacing:-0.04em; }
    h2 { font-size: clamp(32px,4vw,56px); }
    h3 { font-size: clamp(20px,2.5vw,32px); }
    p  { font-size: clamp(16px,1.5vw,18px); line-height:1.75; }

    .container { max-width:1200px; margin:0 auto; padding:0 24px; }
    .section    { padding: clamp(80px,10vw,140px) 24px; }

    /* ── Sticky Nav ── */
    .nav {
      position:fixed; top:0; left:0; right:0; z-index:200;
      padding:18px 32px;
      display:flex; justify-content:space-between; align-items:center;
      transition: background 0.4s, box-shadow 0.4s;
      background: transparent;
    }
    .nav.scrolled {
      background: rgba(255,255,255,0.96);
      backdrop-filter: blur(24px);
      box-shadow: 0 1px 32px rgba(0,0,0,0.08);
    }
    .nav-logo {
      font-family:'${fonts.heading}',sans-serif;
      font-size:20px; font-weight:800;
      color:#fff; transition:color 0.3s;
      text-decoration:none;
    }
    .nav.scrolled .nav-logo { color:var(--accent); }
    .nav-cta {
      background:var(--accent-grad); color:#fff;
      padding:10px 24px; border-radius:var(--radius-btn);
      font-size:14px; font-weight:700; text-decoration:none;
      transition: transform 0.2s, opacity 0.2s;
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }
    .nav-cta:hover { transform:translateY(-2px); opacity:0.92; }

    /* ── HERO ── */
    .hero {
      min-height: 100vh;
      background: linear-gradient(160deg, ${heroAccent} 0%, ${heroAccent2} 60%, #0a0a0a 100%);
      position: relative; overflow: hidden;
      display: grid; align-items: center;
      padding-top: 100px;
    }
    .hero::before {
      content:''; position:absolute; inset:0;
      background: radial-gradient(ellipse 80% 80% at 60% 50%, rgba(255,255,255,0.08) 0%, transparent 70%);
    }
    .hero-grid {
      position:relative; z-index:2;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 64px; align-items: center;
      padding: 80px 24px 100px;
      max-width: 1200px; margin: 0 auto;
    }
    .hero-eyebrow {
      display:inline-flex; align-items:center; gap:8px;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.25);
      color:#fff; font-size:13px; font-weight:700;
      letter-spacing:0.08em; text-transform:uppercase;
      padding: 6px 16px; border-radius:100px;
      margin-bottom:24px;
    }
    .hero h1 { color:#fff; margin-bottom:20px; }
    .hero-sub {
      font-size:clamp(17px,2vw,21px); color:rgba(255,255,255,0.85);
      max-width:500px; line-height:1.65; margin-bottom:32px;
    }
    .hero-proof {
      font-size:13px; color:rgba(255,255,255,0.6);
      display:flex; align-items:center; gap:6px;
      margin-top:20px;
    }
    .hero-proof-dot { width:4px; height:4px; border-radius:50%; background:rgba(255,255,255,0.4); }
    .btn-primary {
      display:inline-flex; align-items:center; justify-content:center; gap:8px;
      background:#fff; color:var(--accent);
      padding:16px 40px; border-radius:var(--radius-btn);
      font-size:16px; font-weight:800; text-decoration:none;
      box-shadow: 0 8px 32px rgba(0,0,0,0.2);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-primary:hover { transform:translateY(-3px); box-shadow:0 16px 48px rgba(0,0,0,0.25); }
    .btn-ghost {
      display:inline-flex; align-items:center; gap:6px;
      background:transparent; color:#fff;
      border:2px solid rgba(255,255,255,0.4);
      padding:14px 32px; border-radius:var(--radius-btn);
      font-size:15px; font-weight:700; text-decoration:none;
      transition:all 0.2s;
    }
    .btn-ghost:hover { border-color:rgba(255,255,255,0.8); background:rgba(255,255,255,0.1); }
    .hero-btns { display:flex; gap:14px; flex-wrap:wrap; }

    /* Product image showcase in hero */
    .hero-product-showcase {
      position:relative;
      display:flex; align-items:center; justify-content:center;
    }
    .hero-product-card {
      background:rgba(255,255,255,0.12);
      backdrop-filter:blur(20px);
      border:1px solid rgba(255,255,255,0.2);
      border-radius:24px; padding:24px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.25);
      position:relative;
    }
    .hero-product-img {
      width:100%; max-width:420px;
      border-radius:16px;
      object-fit:contain;
      display:block;
      max-height:380px;
    }
    /* Gallery thumbnails */
    .hero-thumbs {
      display:flex; gap:8px; margin-top:12px;
      justify-content:center; flex-wrap:wrap;
    }
    .hero-thumb {
      width:52px; height:52px; border-radius:10px;
      overflow:hidden; border:2px solid rgba(255,255,255,0.2);
      cursor:pointer; transition:border-color 0.2s;
    }
    .hero-thumb.active { border-color:#fff; }
    .hero-thumb img { width:100%; height:100%; object-fit:cover; }
    /* Floating badges */
    .hero-badge {
      position:absolute; background:#fff;
      border-radius:12px; padding:10px 16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.15);
      display:flex; align-items:center; gap:10px;
      font-size:12px; font-weight:700;
    }
    .hero-badge-icon { font-size:20px; }
    .hero-badge.badge-1 { top:-20px; right:-20px; }
    .hero-badge.badge-2 { bottom:-20px; left:-20px; }

    /* ── TRUST BAR ── */
    .trust-bar {
      background:#0a0a0a; padding:20px 24px;
      display:flex; align-items:center; justify-content:center;
      gap:40px; flex-wrap:wrap;
    }
    .trust-item {
      display:flex; align-items:center; gap:10px;
      color:rgba(255,255,255,0.7); font-size:14px; font-weight:600;
    }
    .trust-icon { font-size:18px; }

    /* ── PROBLEM ── */
    .problem-section { background:var(--surface); }
    .problem-grid {
      display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:center;
    }
    .problem-label {
      font-size:12px; letter-spacing:0.1em; text-transform:uppercase;
      color:var(--accent); margin-bottom:16px; font-weight:700;
    }
    .pain-list { list-style:none; display:flex; flex-direction:column; gap:14px; margin-top:24px; }
    .pain-item {
      display:flex; align-items:flex-start; gap:12px;
      background:#fff; border:1px solid var(--border);
      border-radius:12px; padding:14px 18px;
      font-size:15px; color:var(--text);
    }
    .pain-x { color:#ef4444; font-size:18px; font-weight:800; flex-shrink:0; }
    .lifestyle-img {
      width:100%; border-radius:${radius.image};
      box-shadow:${shadows.image};
      object-fit:cover; display:block;
    }

    /* ── FEATURES ── */
    .features-section { background:#fff; }
    .features-grid {
      display:grid; grid-template-columns:repeat(3,1fr); gap:24px; margin-top:64px;
    }
    .feature-card {
      background:#fff; border:1px solid var(--border);
      border-radius:var(--radius-card); padding:32px;
      box-shadow:var(--shadow-card);
      transition: transform 0.25s, box-shadow 0.25s;
    }
    .feature-card:hover { transform:translateY(-6px); box-shadow:var(--shadow-hover); }
    .feature-icon-wrap {
      width:56px; height:56px; border-radius:14px;
      background:linear-gradient(135deg, ${heroAccent}22 0%, ${heroAccent2}22 100%);
      border:1px solid ${heroAccent}33;
      display:flex; align-items:center; justify-content:center;
      font-size:26px; margin-bottom:20px;
    }
    .feature-card h4 { font-size:17px; margin-bottom:8px; }
    .feature-card p  { font-size:14px; color:var(--text-muted); line-height:1.65; }

    /* ── STATS ── */
    .stats-section {
      background: linear-gradient(135deg, #0a0a0a 0%, ${heroAccent} 200%);
      position:relative; overflow:hidden;
    }
    .stats-section::before {
      content:''; position:absolute;
      width:600px; height:600px; border-radius:50%;
      background:rgba(255,255,255,0.03);
      top:-200px; right:-200px;
    }
    .stats-grid {
      display:grid; grid-template-columns:repeat(${Math.min(stats.length || 3, 4)},1fr);
      gap:24px; position:relative; z-index:2;
    }
    .stat-item { text-align:center; padding:40px 16px; }
    .stat-number {
      font-family:'${fonts.heading}',sans-serif;
      font-size:clamp(52px,8vw,88px); font-weight:900;
      line-height:1; letter-spacing:-0.04em;
      background:${accentGradient}; -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    }
    .stat-label { font-size:14px; color:rgba(255,255,255,0.55); margin-top:8px; letter-spacing:0.05em; text-transform:uppercase; }

    /* ── HOW IT WORKS ── */
    .how-section { background:var(--surface); }
    .steps-list { max-width:760px; margin:64px auto 0; display:flex; flex-direction:column; gap:0; }
    .step-item {
      display:flex; gap:28px; align-items:flex-start;
      padding:32px 0; border-bottom:1px solid var(--border);
      position:relative;
    }
    .step-item:last-child { border-bottom:none; }
    .step-num {
      width:52px; height:52px; border-radius:50%; flex-shrink:0;
      background:var(--accent-grad); color:#fff;
      display:flex; align-items:center; justify-content:center;
      font-size:20px; font-weight:900;
      box-shadow:0 4px 20px rgba(0,0,0,0.15);
    }
    .step-content h4 { font-size:18px; margin-bottom:6px; }
    .step-content p  { font-size:15px; color:var(--text-muted); }

    /* ── CONTEXT IMAGE SECTION ── */
    .context-img-section {
      padding:0;
      overflow:hidden; position:relative;
    }
    .context-img-full {
      width:100%; height:520px; object-fit:cover; display:block;
    }
    .context-img-overlay {
      position:absolute; inset:0;
      background:linear-gradient(to right, rgba(0,0,0,0.7) 0%, transparent 60%);
      display:flex; align-items:center;
    }
    .context-overlay-text {
      padding:0 80px; max-width:600px;
    }
    .context-overlay-text h2 { color:#fff; margin-bottom:16px; }
    .context-overlay-text p  { color:rgba(255,255,255,0.8); font-size:18px; margin-bottom:28px; }

    /* ── TESTIMONIALS ── */
    .testimonials-section { background:#fff; }
    .testimonials-grid {
      display:grid; grid-template-columns:repeat(${Math.min(testimonials.length || 2, 3)},1fr);
      gap:24px; margin-top:64px;
    }
    .testimonial-card {
      background:var(--surface); border:1px solid var(--border);
      border-radius:var(--radius-card); padding:28px;
      position:relative; overflow:hidden;
    }
    .testimonial-card::before {
      content:'"'; position:absolute; top:-10px; left:16px;
      font-size:120px; font-family:Georgia,serif;
      color:${heroAccent}15; line-height:1; pointer-events:none;
    }
    .t-stars { color:#f59e0b; font-size:16px; margin-bottom:14px; }
    .t-quote { font-size:15px; line-height:1.75; color:var(--text); margin-bottom:20px; }
    .t-highlight { font-weight:700; color:var(--accent); }
    .t-author { display:flex; align-items:center; gap:12px; }
    .t-avatar {
      width:40px; height:40px; border-radius:50%;
      background:var(--accent-grad); color:#fff;
      display:flex; align-items:center; justify-content:center;
      font-size:16px; font-weight:800;
    }
    .t-name { font-size:14px; font-weight:700; }
    .t-role { font-size:12px; color:var(--text-muted); }

    /* ── FAQ ── */
    .faq-section { background:var(--surface); }
    .faq-list { max-width:800px; margin:64px auto 0; }
    details { border-bottom:1px solid var(--border); }
    summary {
      display:flex; justify-content:space-between; align-items:center;
      padding:22px 0; font-size:17px; font-weight:700;
      cursor:pointer; list-style:none; color:var(--text);
    }
    summary::-webkit-details-marker { display:none; }
    .faq-icon {
      width:28px; height:28px; border-radius:50%;
      background:${heroAccent}18; color:var(--accent);
      display:flex; align-items:center; justify-content:center;
      font-size:18px; font-weight:700; flex-shrink:0;
      transition:transform 0.3s;
    }
    details[open] .faq-icon { transform:rotate(45deg); }
    details p { font-size:15px; color:var(--text-muted); padding-bottom:22px; line-height:1.8; }

    /* ── FINAL CTA ── */
    .cta-section {
      background:var(--accent-grad);
      padding:120px 24px; text-align:center;
      position:relative; overflow:hidden;
    }
    .cta-section::before {
      content:''; position:absolute; inset:0;
      background:radial-gradient(ellipse 60% 60% at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 70%);
    }
    .cta-section .container { position:relative; z-index:2; max-width:800px; }
    .cta-section h2 { color:#fff; margin-bottom:20px; }
    .cta-section p  { color:rgba(255,255,255,0.85); font-size:19px; margin-bottom:40px; }
    .cta-guarantee { font-size:13px; color:rgba(255,255,255,0.65); margin-top:20px; }

    /* ── FOOTER ── */
    footer {
      background:#0a0a0a; padding:32px 24px;
      text-align:center; color:rgba(255,255,255,0.4); font-size:14px;
    }

    /* ── ANIMATIONS ── */
    .reveal     { opacity:0; transform:translateY(40px); }
    .reveal-l   { opacity:0; transform:translateX(-40px); }
    .reveal-r   { opacity:0; transform:translateX(40px); }
    .stagger    > * { opacity:0; transform:translateY(30px); }

    @media(max-width:768px) {
      .hero-grid, .problem-grid { grid-template-columns:1fr; }
      .features-grid { grid-template-columns:repeat(2,1fr); }
      .testimonials-grid { grid-template-columns:1fr; }
      .stats-grid { grid-template-columns:repeat(2,1fr); }
      .hero-badge.badge-1, .hero-badge.badge-2 { display:none; }
      .context-overlay-text { padding:0 32px; }
      .trust-bar { gap:20px; }
    }
  </style>
</head>
<body>

  <!-- ── STICKY NAV ── -->
  <nav class="nav" id="nav">
    <a href="#" class="nav-logo">${productName}</a>
    <a href="#cta" class="nav-cta">Get Yours →</a>
  </nav>

  <!-- ── HERO ── -->
  <section class="hero" id="hero">
    <div class="hero-grid">
      <!-- Left: Copy -->
      <div>
        <div class="hero-eyebrow">✦ ${plan.hero?.eyebrow || plan.seo?.title?.split('—')[0]?.trim() || 'New Arrival'}</div>
        <h1 id="hero-h1">${plan.hero?.headline || productName}</h1>
        <p class="hero-sub" id="hero-sub">${plan.hero?.subheadline || ''}</p>
        <div class="hero-btns" id="hero-btns">
          <a href="#cta" class="btn-primary">
            ${plan.hero?.ctaPrimary || 'Buy Now'} →
          </a>
          ${plan.hero?.ctaSecondary ? `<a href="#features" class="btn-ghost">${plan.hero.ctaSecondary}</a>` : ''}
        </div>
        ${plan.hero?.socialProofLine ? `
        <div class="hero-proof" id="hero-proof">
          <span>⭐</span>
          <span>${plan.hero.socialProofLine}</span>
        </div>` : ''}
      </div>

      <!-- Right: Product Image -->
      <div class="hero-product-showcase">
        <div class="hero-product-card">
          ${productHeroImage ? `
          <img
            src="${productHeroImage}"
            class="hero-product-img"
            id="heroMainImg"
            alt="${productName}"
            onerror="this.style.display='none'"
          />` : `
          <div style="width:380px;height:340px;border-radius:16px;background:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:80px;">📦</div>
          `}

          ${productGallery.length > 1 ? `
          <div class="hero-thumbs">
            ${productGallery.slice(0, 5).map((img, i) => `
            <div class="hero-thumb ${i === 0 ? 'active' : ''}" onclick="switchImg('${img}', this)">
              <img src="${img}" alt="view ${i+1}" onerror="this.parentElement.style.display='none'">
            </div>`).join('')}
          </div>` : ''}

          <!-- Floating social proof badges -->
          ${stats[1] ? `
          <div class="hero-badge badge-1">
            <span class="hero-badge-icon">⭐</span>
            <div>
              <div style="font-size:15px;color:var(--accent);font-weight:900">${stats[1]?.number}${stats[1]?.suffix || ''}</div>
              <div style="font-size:10px;color:#6b7280;">${stats[1]?.label}</div>
            </div>
          </div>` : ''}
          ${stats[0] ? `
          <div class="hero-badge badge-2">
            <span class="hero-badge-icon">🏆</span>
            <div>
              <div style="font-size:15px;color:var(--accent);font-weight:900">${stats[0]?.number}${stats[0]?.suffix || ''}+</div>
              <div style="font-size:10px;color:#6b7280;">${stats[0]?.label}</div>
            </div>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Scroll indicator -->
    <div style="position:absolute;bottom:32px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0.5">
      <span style="font-size:10px;letter-spacing:3px;color:#fff;text-transform:uppercase">scroll</span>
      <div id="scroll-dot" style="width:5px;height:28px;border-radius:3px;background:#fff"></div>
    </div>
  </section>

  <!-- ── TRUST BAR ── -->
  <div class="trust-bar">
    <div class="trust-item"><span class="trust-icon">🚚</span> Free Delivery</div>
    <div class="trust-item"><span class="trust-icon">🔄</span> 30-Day Returns</div>
    <div class="trust-item"><span class="trust-icon">🛡️</span> Genuine Product</div>
    <div class="trust-item"><span class="trust-icon">💳</span> Secure Payments</div>
    <div class="trust-item"><span class="trust-icon">⭐</span> Verified Reviews</div>
  </div>

  <!-- ── PROBLEM ── -->
  <section class="section problem-section" id="problem">
    <div class="container">
      <div class="problem-grid">
        <div class="reveal-l">
          <div class="problem-label">THE PROBLEM</div>
          <h2>${plan.problemSection?.headline || 'The problem we solve'}</h2>
          <p style="color:var(--text-muted);margin:16px 0 8px;">${plan.problemSection?.body || ''}</p>
          <ul class="pain-list">
            ${painPoints.map(p => `
            <li class="pain-item">
              <span class="pain-x">✗</span>
              <span>${p}</span>
            </li>`).join('')}
          </ul>
        </div>
        ${images.lifestyle ? `
        <div class="reveal-r">
          <img src="${images.lifestyle}" alt="${productName} in use" class="lifestyle-img">
        </div>` : `<div></div>`}
      </div>
    </div>
  </section>

  <!-- ── FEATURES ── -->
  <section class="section features-section" id="features">
    <div class="container">
      <div class="reveal" style="text-align:center;max-width:700px;margin:0 auto">
        <div class="problem-label">FEATURES</div>
        <h2>${plan.featuresSection?.headline || `Why ${productName} stands out`}</h2>
      </div>
      <div class="features-grid stagger">
        ${features.map(f => `
        <div class="feature-card">
          <div class="feature-icon-wrap">${f.icon || '✦'}</div>
          <h4>${f.title}</h4>
          <p>${f.body}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- ── STATS ── -->
  <section class="section stats-section" id="stats">
    <div class="container">
      <div class="reveal" style="text-align:center;margin-bottom:64px">
        <h2 style="color:#fff">${plan.statsSection?.headline || 'The numbers'}</h2>
      </div>
      <div class="stats-grid stagger">
        ${stats.map(s => `
        <div class="stat-item">
          <div class="stat-number" data-target="${parseFloat(s.number?.replace(/[^0-9.]/g,'') || 0)}" data-prefix="${s.prefix||''}" data-suffix="${s.suffix||''}">0</div>
          <div class="stat-label">${s.label}</div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- ── HOW IT WORKS ── -->
  <section class="section how-section" id="how">
    <div class="container">
      <div class="reveal" style="text-align:center;max-width:700px;margin:0 auto">
        <div class="problem-label">HOW IT WORKS</div>
        <h2>${plan.howItWorks?.headline || `Using ${productName}`}</h2>
      </div>
      <div class="steps-list">
        ${steps.map((step, i) => `
        <div class="step-item reveal">
          <div class="step-num">${i + 1}</div>
          <div class="step-content">
            <h4>${step.title}</h4>
            <p>${step.body}</p>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>

  <!-- ── CONTEXT IMAGE (full-bleed) ── -->
  ${images.context ? `
  <div class="context-img-section" data-parallax-section>
    <img src="${images.context}" class="context-img-full" data-parallax="-0.2" alt="${productName} context">
    <div class="context-img-overlay">
      <div class="context-overlay-text">
        <h2>${plan.cta?.headline || `Ready to experience ${productName}?`}</h2>
        <p>${plan.cta?.body || ''}</p>
        <a href="#cta" class="btn-primary">${plan.cta?.button || 'Shop Now'} →</a>
      </div>
    </div>
  </div>` : ''}

  <!-- ── TESTIMONIALS ── -->
  ${testimonials.length > 0 ? `
  <section class="section testimonials-section" id="reviews">
    <div class="container">
      <div class="reveal" style="text-align:center;max-width:600px;margin:0 auto">
        <div class="problem-label">WHAT CUSTOMERS SAY</div>
        <h2>Real reviews. Real results.</h2>
      </div>
      <div class="testimonials-grid stagger">
        ${testimonials.map(t => `
        <div class="testimonial-card">
          <div class="t-stars">${'★'.repeat(t.rating || 5)}</div>
          <p class="t-quote">"${t.highlight ? t.quote.replace(t.highlight, `<span class="t-highlight">${t.highlight}</span>`) : t.quote}"</p>
          <div class="t-author">
            <div class="t-avatar">${(t.author||'A').charAt(0)}</div>
            <div>
              <div class="t-name">${t.author}</div>
              <div class="t-role">${t.role}</div>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- ── FAQ ── -->
  ${faqs.length > 0 ? `
  <section class="section faq-section" id="faq">
    <div class="container">
      <div class="reveal" style="text-align:center;margin-bottom:16px">
        <div class="problem-label">FAQ</div>
        <h2>Common questions</h2>
      </div>
      <div class="faq-list">
        ${faqs.map(f => `
        <details>
          <summary>
            ${f.question}
            <span class="faq-icon">+</span>
          </summary>
          <p>${f.answer}</p>
        </details>`).join('')}
      </div>
    </div>
  </section>` : ''}

  <!-- ── FINAL CTA ── -->
  <section class="cta-section" id="cta">
    <div class="container reveal">
      <div class="problem-label" style="color:rgba(255,255,255,0.7);margin-bottom:16px">GET STARTED</div>
      <h2>${plan.cta?.headline || `Try ${productName} today`}</h2>
      <p>${plan.cta?.body || ''}</p>
      <a href="#" class="btn-primary" style="background:#fff;color:var(--accent);font-size:18px;padding:20px 56px;box-shadow:0 16px 48px rgba(0,0,0,0.2)">
        ${plan.cta?.button || 'Buy Now'} →
      </a>
      ${plan.cta?.guarantee ? `<p class="cta-guarantee">${plan.cta.guarantee}</p>` : ''}
    </div>
  </section>

  <footer>
    <p>© ${new Date().getFullYear()} ${productName} · Created with Mantram AI Pulse Studio</p>
  </footer>

  <!-- ── SCRIPTS ── -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.45/bundled/lenis.min.js"></script>

  <script>
    // ── Lenis Smooth Scroll
    const lenis = new Lenis({ lerp:0.09, wheelMultiplier:1.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    gsap.registerPlugin(ScrollTrigger);

    // ── Sticky nav
    window.addEventListener('scroll', () => {
      document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 60);
    });

    // ── Hero intro sequence
    gsap.timeline({ delay:0.15 })
      .fromTo('#hero-h1',    {opacity:0,y:50}, {opacity:1,y:0,duration:0.9,ease:'expo.out'})
      .fromTo('#hero-sub',   {opacity:0,y:30}, {opacity:1,y:0,duration:0.7},'-=0.5')
      .fromTo('#hero-btns',  {opacity:0,y:20}, {opacity:1,y:0,duration:0.6},'-=0.4')
      .fromTo('#hero-proof', {opacity:0},      {opacity:1,duration:0.5},'-=0.3');

    // ── Scroll dot bounce
    const dot = document.getElementById('scroll-dot');
    if(dot) gsap.to(dot, {y:10,repeat:-1,yoyo:true,duration:0.9,ease:'power1.inOut'});

    // ── Reveal elements
    gsap.utils.toArray('.reveal').forEach(el => {
      gsap.fromTo(el,{opacity:0,y:50},{opacity:1,y:0,duration:0.85,ease:'expo.out',
        scrollTrigger:{trigger:el,start:'top 88%',once:true}});
    });
    gsap.utils.toArray('.reveal-l').forEach(el => {
      gsap.fromTo(el,{opacity:0,x:-60},{opacity:1,x:0,duration:0.9,ease:'expo.out',
        scrollTrigger:{trigger:el,start:'top 85%',once:true}});
    });
    gsap.utils.toArray('.reveal-r').forEach(el => {
      gsap.fromTo(el,{opacity:0,x:60},{opacity:1,x:0,duration:0.9,ease:'expo.out',
        scrollTrigger:{trigger:el,start:'top 85%',once:true}});
    });

    // ── Stagger grids
    gsap.utils.toArray('.stagger').forEach(container => {
      gsap.fromTo(container.children,
        {opacity:0,y:40},
        {opacity:1,y:0,duration:0.7,stagger:0.1,ease:'expo.out',
          scrollTrigger:{trigger:container,start:'top 80%',once:true}}
      );
    });

    // ── Parallax on context image
    gsap.utils.toArray('[data-parallax]').forEach(el => {
      const speed = parseFloat(el.dataset.parallax);
      gsap.to(el,{yPercent:speed*100,ease:'none',
        scrollTrigger:{trigger:el.closest('[data-parallax-section]'),start:'top bottom',end:'bottom top',scrub:1.5}});
    });

    // ── Animated stat counters
    document.querySelectorAll('.stat-number').forEach(el => {
      const target = parseFloat(el.dataset.target);
      const prefix = el.dataset.prefix || '';
      const suffix = el.dataset.suffix || '';
      const isFloat = !Number.isInteger(target) || suffix.includes('.');
      ScrollTrigger.create({
        trigger:el, start:'top 80%', once:true,
        onEnter:() => {
          gsap.fromTo({val:0},{val:target},{
            duration:2.2,ease:'power2.out',
            onUpdate:function(){
              const v = this.targets()[0].val;
              el.textContent = prefix + (isFloat ? v.toFixed(1) : Math.round(v).toLocaleString()) + suffix;
            }
          });
        }
      });
    });

    // ── Magnetic buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
      btn.addEventListener('mousemove', e => {
        const r = btn.getBoundingClientRect();
        const x = (e.clientX - r.left - r.width/2) * 0.25;
        const y = (e.clientY - r.top  - r.height/2) * 0.25;
        gsap.to(btn,{x,y,duration:0.3,ease:'power2.out'});
      });
      btn.addEventListener('mouseleave', () => {
        gsap.to(btn,{x:0,y:0,duration:0.5,ease:'elastic.out(1,0.5)'});
      });
    });

    // ── Product gallery switcher
    function switchImg(src, thumb) {
      const mainImg = document.getElementById('heroMainImg');
      if(mainImg) {
        gsap.to(mainImg,{opacity:0,scale:0.97,duration:0.18,onComplete:()=>{
          mainImg.src = src;
          mainImg.onload = () => gsap.to(mainImg,{opacity:1,scale:1,duration:0.25});
        }});
      }
      document.querySelectorAll('.hero-thumb').forEach(t => t.classList.remove('active'));
      if(thumb) thumb.classList.add('active');
    }

    // ── Feature cards tilt on hover
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width - 0.5) * 10;
        const y = ((e.clientY - r.top) / r.height - 0.5) * -10;
        gsap.to(card,{rotateX:y,rotateY:x,duration:0.4,ease:'power2.out',transformPerspective:1000});
      });
      card.addEventListener('mouseleave', () => {
        gsap.to(card,{rotateX:0,rotateY:0,duration:0.6,ease:'elastic.out(1,0.5)'});
      });
    });
  </script>
</body>
</html>`;
}

// ── Utilities ──────────────────────────────────────────────────────────
export function generateEmbedCode(hostedUrl) {
    return `<div id="pulse-page-embed" style="width:100%;min-height:600px"></div>
<script>
(function(){var f=document.createElement('iframe');f.src='${hostedUrl}';f.style.cssText='width:100%;height:100vh;border:none;display:block';f.sandbox='allow-scripts allow-same-origin';document.getElementById('pulse-page-embed').appendChild(f);})();
</script>`;
}

export async function publishToShopify({ title, html, slug, shopDomain, accessToken }) {
    const domain = shopDomain || process.env.SHOPIFY_STORE_DOMAIN;
    const token = accessToken || process.env.SHOPIFY_ADMIN_TOKEN;
    const version = process.env.SHOPIFY_API_VERSION || '2026-01';
    if (!domain || !token) return { success: false, error: 'Shopify not configured' };
    try {
        const res = await fetch(`https://${domain}/admin/api/${version}/pages.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
            body: JSON.stringify({ page: { title, handle: slug, body_html: html, published: true } }),
        });
        if (!res.ok) return { success: false, error: `Shopify (${res.status}): ${await res.text()}` };
        const data = await res.json();
        return { success: true, pageId: data.page.id, handle: data.page.handle, shopifyUrl: `https://${domain}/pages/${data.page.handle}` };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

// ── Main Export ────────────────────────────────────────────────────────
export async function generateLandingPage({ brandId, brief, pageType = 'product', urlContext, referenceImage, designContext, imageModel, productDNA, productData }) {

    const { brandContext } = await loadBrandContext(brandId);

    // Extract primary product color for design tokens
    const productColors = (productDNA?.dominantColors || []).filter(c => c.role !== 'background_suggestion');
    const primaryHex = designContext?.colorGuardHex?.[0]
        || productColors[0]?.hex
        || '#6366F1';

    const tokens = generateBrandTokens(primaryHex, brandContext);

    // Override with actual product palette
    if (productColors.length >= 2) {
        tokens.colors.accent     = productColors[0].hex;
        tokens.colors.accentDark = productColors[1]?.hex || productColors[0].hex;
        tokens.colors.primary    = productColors[0].hex;
    }

    // Build the product context block
    const productCtx = buildProductContext(productDNA || {}, productData || {}, designContext || {});

    console.log('🌐 Landing Page: Gathering market intelligence...');
    const productName = productData?.title || productDNA?.productCategory || brief;
    const trendSnippets = await gatherIntelligence(productName, brandId);

    console.log('🧠 Landing Page: Gemini 2.5 Flash writing product copy...');
    const plan = await callAgent(
        PAGE_SYSTEM(productCtx, brandContext, trendSnippets),
        `PRODUCT: ${productName}\nBRIEF: ${brief || 'Create the best product landing page possible'}\nPAGE TYPE: ${pageType}`,
        0.8, 8000,
        COPY_MODEL_OPTS  // Gemini 2.5 Flash — cheaper + faster for structured JSON
    );

    if (!plan?.hero?.headline) {
        throw new Error('Landing page plan generation failed — no hero content returned');
    }

    console.log('🎨 Landing Page: Generating lifestyle images...');
    const images = await generateLifestyleImages(plan, productDNA || {}, designContext || {}, imageModel);

    const slug = plan.seo?.slug || `${(productName || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uuidv4().substring(0, 6)}`;

    console.log('⚡ Landing Page: Assembling HTML...');
    const html = buildProductHTML(plan, productDNA || {}, productData || {}, images, tokens, slug);

    const hostedUrl = await uploadToS3(
        Buffer.from(html, 'utf-8'),
        `pulse-studio/pages/${brandId || 'anon'}/${slug}.html`,
        'text/html'
    );

    return {
        success: true,
        plan,
        html,
        hostedUrl,
        thumbnailUrl: productDNA?.heroImageUrl || images.lifestyle || null,
        pageName: plan.seo?.title || productName,
        metaTitle: plan.seo?.title,
        metaDescription: plan.seo?.description,
        slug,
        embedCode: generateEmbedCode(hostedUrl),
        sectionCount: 7 + (plan.testimonials?.length ? 1 : 0) + (plan.faq?.length ? 1 : 0),
    };
}
