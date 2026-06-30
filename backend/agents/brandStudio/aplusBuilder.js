/**
 * aplusBuilder.js — Amazon A+ & Premium A++ Content Generator
 *
 * Tiers:
 *   standard — Standard A+ Content (970px wide, up to 5 modules)
 *   premium  — Premium A++ Content (1464px wide, up to 7 modules, carousel/hotspot/Q&A)
 *
 * Architecture:
 *  1. Product Intelligence — MCoT multimodal analysis + URL scraping
 *  2. Competitive Intel   — MCP web_search for market positioning
 *  3. Strategy Agent      — Claude plans tier-appropriate module layout
 *  4. Module Content Gen  — Claude writes Rufus-AI-optimised copy per module
 *  5. Image Pipeline      — NanoBanana 2 generates images at exact Amazon pixel dims
 *  6. Page Assembly       — Returns structured modules + images map
 *
 * Image Dimensions Source: Amazon Seller Central A+ Content Manager (2026 verified)
 * All images generated at 2× scale for Retina / high-DPI displays.
 */

import { callAgent, callMultimodalAgent, loadBrandContext } from '../shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { webSearch } from '../contentStudio/tools.js';
import { analyzeProductDesign, buildDesignContext, injectDesignContext } from '../shared/productDesignAgent.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ── Standard A+ Module Specifications ──────────────────────────────────────────
// Amazon display widths: 970px max. Generated at 2× for Retina.
export const APLUS_MODULES = {
    hero_banner: {
        id: 'hero_banner', label: 'Hero Banner',
        width: 1940, height: 1200,          // 2× of 970×600
        displayWidth: 970, displayHeight: 600,
        description: 'Full-width lifestyle/product hero image. Emotional first impression.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'subheadline'],
        tier: 'standard',
    },
    image_text_left: {
        id: 'image_text_left', label: 'Image & Text (Image Left)',
        width: 600, height: 600,            // 2× of 300×300
        displayWidth: 300, displayHeight: 300,
        description: 'Product or lifestyle image left, benefit-focused text right.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'body', 'altText'],
        tier: 'standard',
    },
    image_text_right: {
        id: 'image_text_right', label: 'Image & Text (Image Right)',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Text left, image right — alternating with image_text_left for visual rhythm.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'body', 'altText'],
        tier: 'standard',
    },
    three_features: {
        id: 'three_features', label: 'Three Features Grid',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Three equal columns with icon/image + feature headline + descriptor.',
        maxImages: 3, hasText: true,
        textFields: ['headline', 'items[0]', 'items[1]', 'items[2]'],
        tier: 'standard',
    },
    four_features: {
        id: 'four_features', label: 'Four Features Grid',
        width: 440, height: 440,            // 2× of 220×220
        displayWidth: 220, displayHeight: 220,
        description: 'Four equal columns — great for listing USPs with icon + label.',
        maxImages: 4, hasText: true,
        textFields: ['headline', 'items[0]', 'items[1]', 'items[2]', 'items[3]'],
        tier: 'standard',
    },
    comparison_chart: {
        id: 'comparison_chart', label: 'Comparison Chart',
        width: 300, height: 600,            // 2× of 150×300
        displayWidth: 150, displayHeight: 300,
        description: 'Compare your product variants or models within your own brand.',
        maxImages: 4, hasText: true,
        textFields: ['headline', 'rows'],
        tier: 'standard',
    },
    image_highlights: {
        id: 'image_highlights', label: 'Image with Highlights',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Product display image with 4–6 bullet-point highlights beside it.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'bullets', 'altText'],
        tier: 'standard',
    },
    header_overlay: {
        id: 'header_overlay', label: 'Header with Text Overlay',
        width: 1940, height: 600,           // 2× of 970×300
        displayWidth: 970, displayHeight: 300,
        description: 'Full-width section-divider banner with text overlay.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'subheadline', 'altText'],
        tier: 'standard',
    },
    brand_story: {
        id: 'brand_story', label: 'Brand Story',
        width: 1940, height: 1200,
        displayWidth: 970, displayHeight: 600,
        description: 'Brand narrative — mission, values, promise. Builds trust and loyalty.',
        maxImages: 1, hasText: true,
        textFields: ['brandName', 'tagline', 'story'],
        tier: 'standard',
    },
    logo: {
        id: 'logo', label: 'Brand Logo',
        width: 1200, height: 360,           // 2× of 600×180
        displayWidth: 600, displayHeight: 180,
        description: 'Brand logo display — white or transparent background required.',
        maxImages: 1, hasText: false,
        textFields: ['altText'],
        tier: 'standard',
    },
};

// ── Premium A++ Module Specifications ──────────────────────────────────────────
// Amazon Premium A+ display width: 1464px. Generated at 2× for Retina.
export const APLUS_PLUS_MODULES = {
    // Full-width cinematic hero — the Premium signature module
    premium_hero: {
        id: 'premium_hero', label: 'Premium Hero Banner',
        width: 2928, height: 1200,          // 2× of 1464×600
        displayWidth: 1464, displayHeight: 600,
        description: 'Full-bleed 1464px cinematic hero — the biggest first impression on Amazon.',
        maxImages: 1, hasText: true, isVideo: false,
        textFields: ['headline', 'subheadline', 'altText'],
        tier: 'premium',
    },
    // Premium full-width section divider
    premium_banner: {
        id: 'premium_banner', label: 'Premium Full-Width Banner',
        width: 2928, height: 600,           // 2× of 1464×300
        displayWidth: 1464, displayHeight: 300,
        description: 'Full-width 1464px section divider with optional text overlay.',
        maxImages: 1, hasText: true, isVideo: false,
        textFields: ['headline', 'altText'],
        tier: 'premium',
    },
    // Premium image+text — larger than standard
    premium_image_text: {
        id: 'premium_image_text', label: 'Premium Image & Text',
        width: 1464, height: 750,           // 2× of 732×375
        displayWidth: 732, displayHeight: 375,
        description: 'Larger image+text at full Premium width — more visual real estate.',
        maxImages: 1, hasText: true, isVideo: false,
        textFields: ['headline', 'body', 'altText'],
        tier: 'premium',
    },
    // Carousel — 3 landscape images shown as swipeable slides
    carousel: {
        id: 'carousel', label: 'Image Carousel',
        width: 2928, height: 1200,          // 2× of 1464×600 per slide
        displayWidth: 1464, displayHeight: 600,
        description: 'Swipeable full-width carousel — up to 3 slides. Great for variant/use-case storytelling.',
        maxImages: 3, hasText: true, isVideo: false,
        textFields: ['headline', 'slides[0]', 'slides[1]', 'slides[2]'],
        tier: 'premium',
    },
    // Interactive hotspot — annotated hero image
    hotspot: {
        id: 'hotspot', label: 'Interactive Hotspot Image',
        width: 2928, height: 1200,          // 2× of 1464×600
        displayWidth: 1464, displayHeight: 600,
        description: 'Tap numbered dots on the image to reveal feature callouts. Best for complex products.',
        maxImages: 1, hasText: true, isVideo: false,
        textFields: ['headline', 'altText', 'hotspots[0]', 'hotspots[1]', 'hotspots[2]', 'hotspots[3]'],
        tier: 'premium',
    },
    // Video placeholder — user uploads MP4
    video_module: {
        id: 'video_module', label: 'Video Module',
        width: 2928, height: 1200,          // Thumbnail/poster frame only
        displayWidth: 1464, displayHeight: 600,
        description: 'MP4 video embed (max 200MB, 3 min). AI generates a strong poster thumbnail frame.',
        maxImages: 1, hasText: true, isVideo: true,
        textFields: ['headline', 'videoCaption', 'altText'],
        tier: 'premium',
    },
    // Q&A Panel — text-only, no image
    qa_panel: {
        id: 'qa_panel', label: 'Q&A Panel',
        width: null, height: null,
        displayWidth: 1464, displayHeight: null,
        description: 'Structured Q&A addressing top buyer questions. Amazon Rufus AI reads this heavily.',
        maxImages: 0, hasText: true, isVideo: false,
        textFields: ['headline', 'questions'],
        tier: 'premium',
    },
    // Enhanced full-width comparison chart
    enhanced_comparison: {
        id: 'enhanced_comparison', label: 'Enhanced Comparison Chart',
        width: 2928, height: 600,           // 2× of 1464×300
        displayWidth: 1464, displayHeight: 300,
        description: 'Full Premium-width scrollable comparison table. Compare your variants or product line.',
        maxImages: 1, hasText: true, isVideo: false,
        textFields: ['headline', 'rows'],
        tier: 'premium',
    },
    // Brand Story at Premium width
    premium_brand_story: {
        id: 'premium_brand_story', label: 'Premium Brand Story',
        width: 2928, height: 1200,          // 2× of 1464×600
        displayWidth: 1464, displayHeight: 600,
        description: 'Full-bleed brand narrative at 1464px — the emotional closer of an A++ listing.',
        maxImages: 1, hasText: true, isVideo: false,
        textFields: ['brandName', 'tagline', 'story', 'altText'],
        tier: 'premium',
    },
};

// Combined for easy lookup
export const ALL_MODULES = { ...APLUS_MODULES, ...APLUS_PLUS_MODULES };

// ── Product URL Scraper ─────────────────────────────────────────────────────────
async function scrapeProductUrl(url) {
    if (!url) return null;
    try {
        console.log(`A+: Scraping product URL: ${url}`);
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 15000
        });
        const html = await res.text();
        const $ = cheerio.load(html);

        if (url.includes('amazon.')) {
            return {
                title: $('#productTitle').text().trim() || $('h1').first().text().trim(),
                rating: $('#acrPopover').attr('title') || '',
                reviewCount: $('#acrCustomerReviewText').text().trim(),
                price: $('.a-price .a-offscreen').first().text().trim() || '',
                bulletPoints: $('#feature-bullets li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 5).slice(0, 8),
                description: $('#productDescription p').text().trim() || $('#aplus-content').text().trim().substring(0, 1000),
                category: $('#wayfinding-breadcrumbs_feature_div').text().replace(/\s+/g, ' ').trim().substring(0, 200),
                images: $('img[data-a-dynamic-image]').map((_, el) => {
                    try { return Object.keys(JSON.parse($(el).attr('data-a-dynamic-image') || '{}'))[0]; } catch (_) { return null; }
                }).get().filter(Boolean).slice(0, 5),
                platform: 'amazon'
            };
        }

        const extractBullets = () => {
            const bulletPoints = [];
            const descriptionContainers = [
                '[class*="product-description"]', '[class*="description"]', '[class*="product-info"]',
                '[class*="product-meta"]', '[class*="product-details"]', '#product-description',
                '#description', '[itemprop="description"]', '.productView-desc', '.productView-description',
                '.product-description', '.product-single__description', '[data-product-description]'
            ];
            const excludeRegex = /₹|\$|price|sale|% off|mrp|discount|prepaid|checkout|add to cart|subscribe|back in stock|notify|pickup|availability|shipping|returns|coupon|code:|<link|<script|inherit/i;
            
            for (const container of descriptionContainers) {
                $(container).find('p, strong, span, h2, h3, li').each((_, el) => {
                    const txt = $(el).text().trim().replace(/\s+/g, ' ');
                    if (txt.length > 20 && txt.length < 250 && !excludeRegex.test(txt) && !bulletPoints.includes(txt)) {
                        bulletPoints.push(txt);
                    }
                });
                if (bulletPoints.length >= 8) break;
            }

            if (bulletPoints.length < 4) {
                $('li').each((_, el) => {
                    const parentNav = $(el).closest('header, footer, nav, [class*="menu"], [class*="nav"], [class*="header"], [class*="footer"], [class*="sidebar"], [class*="aside"], [class*="dropdown"], [id*="menu"], [id*="nav"], [id*="header"], [id*="footer"]');
                    if (parentNav.length === 0) {
                        const txt = $(el).text().trim().replace(/\s+/g, ' ');
                        if (txt.length > 20 && txt.length < 250 && !excludeRegex.test(txt) && !bulletPoints.includes(txt)) {
                            bulletPoints.push(txt);
                        }
                    }
                });
            }
            return bulletPoints.slice(0, 8);
        };

        if (url.includes('myshopify.com') || url.includes('/products/')) {
            const jsonLd = $('script[type="application/ld+json"]').map((_, el) => {
                try { return JSON.parse($(el).html()); } catch (_) { return null; }
            }).get().filter(Boolean).find(d => d['@type'] === 'Product');
            return {
                title: jsonLd?.name || $('h1').first().text().trim(),
                price: jsonLd?.offers?.[0]?.price || '',
                description: jsonLd?.description || $('[class*="description"]').first().text().trim().substring(0, 1000),
                bulletPoints: extractBullets(),
                images: (jsonLd?.image || []).slice(0, 5),
                category: $('[class*="breadcrumb"] a').map((_, el) => $(el).text().trim()).get().join(' > '),
                platform: 'shopify'
            };
        }

        return {
            title: $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content'),
            description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
            images: [$('meta[property="og:image"]').attr('content')].filter(Boolean),
            bulletPoints: extractBullets(),
            price: $('[class*="price"]').first().text().trim(),
            platform: 'web'
        };
    } catch (err) {
        console.warn(`A+: URL scrape failed for ${url}: ${err.message}`);
        return null;
    }
}

// ── Image Generation for A+ / A++ Modules ──────────────────────────────────────
async function generateModuleImage(prompt, moduleSpec, productImages = [], brandColors = [], designContext = null, imageModel = 'gemini-3.1-flash-image') {
    // Q&A and text-only modules skip image gen
    if (!moduleSpec.width || !moduleSpec.height) return null;

    const { width, height, id: moduleType, displayWidth, tier } = moduleSpec;
    const size = `${width}x${height}`;

    const colorContext = brandColors.length
        ? `Brand colors: ${brandColors.map(c => `${c.hex} (${c.name || c.usage})`).join(', ')}. Use in backgrounds/accents only.`
        : '';

    const tierNote = tier === 'premium'
        ? `This image will display at ${displayWidth}px (Premium A++ full-bleed). It must be cinematic, immersive, and hold up across the full viewport width. No letterboxing.`
        : `This image displays at ${displayWidth}px (Standard A+).`;

    const style = `Contemporary premium product photography. ${colorContext} ${tierNote} Ultra-sharp, 8K quality, professional lighting. CRITICAL: Do NOT render any text, words, letters, numbers, or typography anywhere in the image.`;

    const basePrompt = `${prompt}. ${style}`;
    const fullPrompt = designContext ? injectDesignContext(basePrompt, designContext) : basePrompt;

    const refImages = designContext?.productRefImages?.length
        ? designContext.productRefImages
        : productImages;

    // Per-image timeout — prevents one stuck image from blocking the pipeline
    const IMAGE_TIMEOUT_MS = 60_000;

    try {
        const imagePromise = refImages.length > 0
            ? laozhangMultimodalImageGenerate(fullPrompt, refImages.slice(0, 2), {
                model: imageModel || 'gemini-3.1-flash-image', size
            })
            : laozhangImageGenerate(fullPrompt, {
                model: imageModel || 'gemini-3.1-flash-image', size
            });

        const result = await Promise.race([
            imagePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Image generation timed out after ${IMAGE_TIMEOUT_MS / 1000}s`)), IMAGE_TIMEOUT_MS))
        ]);

        if (result?.imageUrl) {
            console.log(`   A+: Image generated [${moduleType}] at ${size} (${tier})${designContext ? ' PDI-guided' : ''}`);
            return result.imageUrl;
        }
    } catch (err) {
        console.warn(`   A+: Image gen failed [${moduleType}]: ${err.message}`);
    }
    return null;
}

// ── Build strategy prompt for Standard A+ ──────────────────────────────────────
function buildStandardStrategyPrompt(productContext, visualIntelligence, competitiveIntel, brandContext, brief, moduleCount) {
    return `You are the world's best Amazon A+ Content strategist. Your A+ listings consistently drive 10–20% conversion lifts.

${brandContext}

PRODUCT DATA:
${productContext}

VISUAL ANALYSIS (MCoT):
${visualIntelligence || 'No visual analysis available'}

COMPETITIVE INTEL:
${competitiveIntel || 'No competitive data'}

USER BRIEF: ${brief}

AMAZON CONTENT RULES (2026):
- No pricing, promotional language ("free", "discounted", "best", "#1"), competitor names
- No external links, QR codes, contact info
- All claims must be verifiable (no unverified superlatives like "world's best")
- Mobile-first: 70%+ traffic is mobile — keep text short and scannable
- Alt-text: Must be descriptive and SEO-relevant (Google indexes A+ content)
- RUFUS AI: Amazon's AI shopping assistant reads your A+ content — write copy that answers "why this product?", "who is it for?", "how does it work?" in natural language

VISUAL NARRATIVE STRUCTURE (follow this arc):
1. Emotional hook (hero) → 2. Problem solved → 3. Key features → 4. Social proof/comparison → 5. Brand trust close

AVAILABLE MODULES: hero_banner, image_text_left, image_text_right, three_features, four_features, comparison_chart, image_highlights, header_overlay, brand_story

Return a JSON object:
{
  "productName": "short punchy product name",
  "targetAudience": "primary buyer persona in 1 sentence",
  "contentStrategy": "overall narrative arc (1–2 sentences)",
  "rufusOptimizations": ["question 1 this content answers", "question 2", "question 3"],
  "modules": [
    {
      "id": "unique_id_e.g._hero_1",
      "type": "module_type_from_list",
      "headline": "benefit-first headline, max 150 chars, NO promotional language",
      "subheadline": "supporting line max 200 chars (optional)",
      "body": "2–3 sentence benefit-focused copy, max 300 chars, plain text only, Rufus-friendly natural language",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"],
      "items": [{"title": "Feature Name", "description": "short descriptor", "icon": "single emoji"}],
      "rows": [{"feature": "Feature", "model1": "Our Product", "model1Value": "Yes", "model2": "Alternative", "model2Value": "No"}],
      "hotspots": [],
      "altText": "Descriptive, keyword-rich alt text for Google indexing (max 100 chars)",
      "imagePrompt": "Detailed image generation prompt, product-aware, NO text in image, matches brand mood",
      "imageStyle": "hero-lifestyle | product-detail | infographic | brand-ambient | feature-closeup",
      "rationale": "Why this module here, 1 sentence"
    }
  ]
}

Generate exactly ${moduleCount} modules. Start with hero_banner. End with brand_story or image_highlights. Follow the emotional arc.`;
}

// ── Build strategy prompt for Premium A++ ──────────────────────────────────────
function buildPremiumStrategyPrompt(productContext, visualIntelligence, competitiveIntel, brandContext, brief, moduleCount) {
    return `You are the world's best Amazon Premium A++ Content strategist. Premium A++ is the highest-tier Amazon listing enhancement — 1464px wide, interactive modules, video, carousel, hotspot. Your listings consistently drive 20–30% conversion lifts.

${brandContext}

PRODUCT DATA:
${productContext}

VISUAL ANALYSIS (MCoT):
${visualIntelligence || 'No visual analysis available'}

COMPETITIVE INTEL:
${competitiveIntel || 'No competitive data'}

USER BRIEF: ${brief}

AMAZON PREMIUM A++ RULES (2026):
- Same content rules as standard A+ (no pricing, no promotions, no competitor names)
- Mobile-optimized: full-bleed 1464px imagery must stack cleanly on mobile
- Rufus AI: heavily reads Premium A+ content — structure as natural-language Q&A and benefit narratives
- Alt-text: critical for Google indexing — use relevant keyword phrases naturally
- Video: script should demonstrate product in first 5 seconds (hook) — max 3 min, MP4 only
- Hotspot: identify 3–4 specific physical product features to annotate on the hero image
- Carousel: 3 slides that tell a use-case story (e.g., morning ritual, travel, gifting scenario)

PREMIUM A++ MODULE TYPES (you must use Premium modules, not standard):
- premium_hero: Full-bleed 1464px cinematic hero — REQUIRED first module
- premium_banner: 1464px section divider with minimal text
- premium_image_text: Large image+text at Premium width
- carousel: 3-slide swipeable story carousel (generates 3 separate images)
- hotspot: Interactive annotated hero image (generates base image + hotspot copy)
- video_module: Video with poster thumbnail (generates poster; user uploads video)
- qa_panel: Q&A panel — NO image, just structured questions/answers (Rufus gold)
- enhanced_comparison: Full-width comparison table
- premium_brand_story: Full-bleed 1464px emotional brand close — REQUIRED last module

VISUAL NARRATIVE STRUCTURE (immersive Premium arc):
1. premium_hero (cinematic emotional hook)
2. carousel (use-case story — 3 scenarios)
3. hotspot (feature deep-dive — annotated product)
4. qa_panel (Rufus-optimized Q&A — buyer questions answered)
5. premium_image_text (key differentiator)
6. enhanced_comparison (your variant / product family)
7. premium_brand_story (emotional brand close)

Return a JSON object:
{
  "productName": "short punchy product name",
  "targetAudience": "primary buyer persona in 1 sentence",
  "contentStrategy": "Premium A++ narrative arc (1–2 sentences)",
  "rufusOptimizations": ["top buyer question 1 this answers", "question 2", "question 3", "question 4"],
  "modules": [
    {
      "id": "unique_id_e.g._hero_1",
      "type": "premium_module_type_from_list",
      "headline": "benefit-first headline, max 150 chars, NO promotional language",
      "subheadline": "supporting line max 200 chars",
      "body": "2–3 sentence benefit-focused copy, max 400 chars, natural Rufus-friendly language",
      "slides": [
        {"headline": "Slide 1 Headline", "body": "Slide 1 copy", "imagePrompt": "Detailed prompt for slide 1 image", "altText": "alt text"}
      ],
      "hotspots": [
        {"number": 1, "x": 30, "y": 45, "title": "Feature Name", "description": "What this feature does in 1 sentence"}
      ],
      "questions": [
        {"question": "Customer question?", "answer": "Clear, helpful answer in 2–3 sentences using natural language"}
      ],
      "rows": [{"feature": "Feature", "model1": "Our Model A", "model1Value": "Yes", "model2": "Our Model B", "model2Value": "No"}],
      "videoCaption": "What the video demonstrates (for video_module)",
      "altText": "Keyword-rich descriptive alt text (max 100 chars)",
      "imagePrompt": "Detailed image generation prompt for this module (if applicable). Product-aware. NO text in image.",
      "imageStyle": "cinematic-lifestyle | product-hero | feature-closeup | brand-ambient",
      "rationale": "Why this module in this position"
    }
  ]
}

Generate exactly ${moduleCount} modules. MUST start with premium_hero. MUST end with premium_brand_story. Use the full Premium module set. Follow the immersive Premium arc.`;
}

// ── Main Entry Point ────────────────────────────────────────────────────────────
export async function generateAplusListing({
    brandId,
    productUrl = null,
    productData = null,
    referenceImages = [],
    brief = '',
    moduleCount = 7,
    listingTier = 'standard',   // 'standard' | 'premium'
    designContext = null,        // PDI locked design directive from frontend
    productDNA = null,
    imageModel = 'gemini-3.1-flash-image', // User-selected image model
}) {
    const isPremium = listingTier === 'premium';
    console.log(`A+ Builder: Starting ${isPremium ? 'Premium A++' : 'Standard A+'} generation pipeline...`);
    const t0 = Date.now();

    // Force correct module counts per tier
    const effectiveModuleCount = isPremium
        ? Math.min(Math.max(moduleCount, 5), 7)
        : Math.min(Math.max(moduleCount, 3), 5);

    // ── 1. Load Brand Context ──────────────────────────────────────────────────
    const { brand, brandContext } = await loadBrandContext(brandId);
    const brandColors = brand?.dna?.colors || [];

    // ── 2. Product Intelligence ────────────────────────────────────────────────
    let product = productData;
    if (!product && productUrl) {
        product = await scrapeProductUrl(productUrl);
    }

    // Keep up to 8 images for PDI — two-stage classification benefits from seeing all angles
    const allProductImages = [
        ...(product?.images || []),
        ...(referenceImages || [])
    ].filter(Boolean).slice(0, 8);

    // ── PARALLEL INTELLIGENCE — PDI + MCoT + Competitive Intel ───────────────
    // These three steps are independent of each other and only depend on
    // product data from step 2. Running them in parallel saves ~20-30s.

    let activeDesignContext = designContext;
    let activeProductDNA = productDNA;
    let visualIntelligence = '';
    let competitiveIntel = '';

    console.log(`A+: Starting parallel intelligence (PDI + MCoT + Competitive Intel)...`);
    const intelT0 = Date.now();

    const [pdiResult, mcotResult, compResult] = await Promise.allSettled([
        // ── PDI: Product Design Intelligence ────────────────────────────────
        (async () => {
            if (activeDesignContext || allProductImages.length === 0) return null;
            console.log(`   A+: [PDI] Running inline analysis on ${allProductImages.length} images...`);
            const dna = await analyzeProductDesign(allProductImages, product || {}, brief);
            const ctx = buildDesignContext(dna, dna.defaultMoodDirection || 'editorial');
            return { dna, ctx };
        })(),

        // ── MCoT Visual Intelligence ────────────────────────────────────────
        (async () => {
            if (allProductImages.length === 0) return null;
            console.log(`   A+: [MCoT] Visual analysis of ${allProductImages.length} product images...`);
            const result = await callMultimodalAgent(
                `You are an Amazon product listing expert and visual analyst. Analyze these product images deeply.
Return a JSON object with: {
  "productCategory": "type of product",
  "visualStyle": "aesthetic, materials, finish, colors",
  "primaryUseCase": "who uses this and how",
  "emotionalAppeal": "feeling/aspiration this product evokes",
  "standoutFeatures": ["visible feature 1", "visible feature 2"],
  "targetAudience": "typical buyer description",
  "imageryStrategy": "what A+ image styles work best for this product",
  "competitivePosition": "premium | budget | value | specialized",
  "rufusKeywords": ["natural-language phrase a buyer would use to find this", "phrase 2", "phrase 3"]
}`,
                `Product: ${product?.title || 'Unknown'}. Brief: ${brief}. Listing tier: ${isPremium ? 'Premium A++' : 'Standard A+'}.`,
                allProductImages.slice(0, 4),
                { temperature: 0.3, maxTokens: 1200 }
            );
            return result;
        })(),

        // ── Competitive Intel ───────────────────────────────────────────────
        (async () => {
            if (!product?.title && !brief) return null;
            try {
                console.log(`   A+: [CompIntel] Fetching competitive intel...`);
                const searchQuery = `Amazon A+ content best examples "${product?.title || brief}" category listing features 2025`;
                const searchResult = await webSearch(searchQuery, 'quick');
                return typeof searchResult === 'string'
                    ? searchResult.substring(0, 800)
                    : JSON.stringify(searchResult).substring(0, 800);
            } catch (err) {
                console.warn(`   A+: [CompIntel] web_search skipped: ${err.message}`);
                return null;
            }
        })(),
    ]);

    // ── Collect parallel results ────────────────────────────────────────────
    if (pdiResult.status === 'fulfilled' && pdiResult.value) {
        activeProductDNA = pdiResult.value.dna;
        activeDesignContext = pdiResult.value.ctx;
        console.log(`   A+: [PDI] Complete ✅`);
    } else if (pdiResult.status === 'rejected') {
        console.warn(`   A+: [PDI] Failed: ${pdiResult.reason?.message}`);
    }

    if (mcotResult.status === 'fulfilled' && mcotResult.value) {
        visualIntelligence = JSON.stringify(mcotResult.value);
        console.log(`   A+: [MCoT] Complete ✅`);
    } else if (mcotResult.status === 'rejected') {
        console.warn(`   A+: [MCoT] Failed: ${mcotResult.reason?.message}`);
    }

    if (compResult.status === 'fulfilled' && compResult.value) {
        competitiveIntel = compResult.value;
        console.log(`   A+: [CompIntel] Complete ✅`);
    } else if (compResult.status === 'rejected') {
        console.warn(`   A+: [CompIntel] Failed: ${compResult.reason?.message}`);
    }

    console.log(`A+: Parallel intelligence complete in ${Math.round((Date.now() - intelT0) / 1000)}s`);

    // For image generation: use PDI's curated roster (diversity-ranked) or first 4 images
    const productImages = activeProductDNA?.productRefImages?.slice(0, 4)
        || allProductImages.slice(0, 4);

    // ── 4. Strategy Agent (Claude) ─────────────────────────────────────────────
    console.log(`A+: Strategy Agent planning ${effectiveModuleCount} modules (${isPremium ? 'Premium A++' : 'Standard A+'})...`);

    const productContext = product ? `
Product Title: ${product.title || 'N/A'}
Price: ${product.price || 'N/A'}
Category: ${product.category || 'N/A'}
Description: ${(product.description || '').substring(0, 500)}
Key Features: ${(product.bulletPoints || []).join(' | ')}
Platform: ${product.platform || 'N/A'}
Rating: ${product.rating || 'N/A'} (${product.reviewCount || 'N/A'} reviews)
` : brief;

    const strategyPrompt = isPremium
        ? buildPremiumStrategyPrompt(productContext, visualIntelligence, competitiveIntel, brandContext, brief, effectiveModuleCount)
        : buildStandardStrategyPrompt(productContext, visualIntelligence, competitiveIntel, brandContext, brief, effectiveModuleCount);

    const aplusPlan = await callAgent(
        strategyPrompt,
        `Create ${isPremium ? 'Premium A++' : 'Standard A+'} content for: ${product?.title || brief}`,
        0.7, 8000,
        { provider: 'anthropic', model: 'claude-sonnet-4-6', timeoutMs: 150_000 }
    );

    if (!aplusPlan?.modules?.length) {
        throw new Error('A+ strategy agent returned invalid plan');
    }

    // Attach tier info to plan
    aplusPlan.listingTier = listingTier;
    aplusPlan.isPremium = isPremium;

    console.log(`   A+: Strategy complete — ${aplusPlan.modules.length} modules planned`);

    // ── 5. Parallel Image Generation ──────────────────────────────────────────
    const moduleLibrary = isPremium ? APLUS_PLUS_MODULES : APLUS_MODULES;

    console.log(`A+: Generating images for ${aplusPlan.modules.length} modules (${isPremium ? '1464px Premium' : '970px Standard'})...`);

    const imageResults = await Promise.allSettled(
        aplusPlan.modules.flatMap((module) => {
            const spec = ALL_MODULES[module.type] || (isPremium ? APLUS_PLUS_MODULES.premium_hero : APLUS_MODULES.image_text_left);

            // Skip image gen for Q&A panels and text-only modules
            if (spec.maxImages === 0 || !spec.width) return [];

            // Carousel: generate each slide's image separately
            if (module.type === 'carousel' && module.slides?.length) {
                return module.slides.map(async (slide, idx) => {
                    const imgUrl = await generateModuleImage(
                        slide.imagePrompt || module.imagePrompt || `${module.headline} — slide ${idx + 1} lifestyle scene`,
                        spec, productImages, brandColors, activeDesignContext, imageModel
                    );
                    return { moduleId: `${module.id}_slide_${idx}`, imageUrl: imgUrl };
                });
            }

            // Standard: generate single image
            return [async () => {
                const imgUrl = await generateModuleImage(
                    module.imagePrompt || module.headline,
                    spec, productImages, brandColors, activeDesignContext, imageModel
                );
                return { moduleId: module.id, imageUrl: imgUrl };
            }].map(fn => fn());
        })
    );

    const images = {};
    imageResults.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.imageUrl) {
            images[r.value.moduleId] = r.value.imageUrl;
        } else if (r.status === 'rejected') {
            console.warn(`   A+: Image rejected:`, r.reason?.message);
        }
    });

    const successCount = Object.keys(images).length;
    console.log(`   A+: ${successCount} images generated`);

    // ── 6. Export text ────────────────────────────────────────────────────────
    const exportText = aplusPlan.modules.map((m, i) => {
        const spec = ALL_MODULES[m.type];
        const lines = [`[Module ${i + 1}: ${spec?.label || m.type}${spec?.tier === 'premium' ? ' (Premium A++)' : ''}]`];
        if (m.headline) lines.push(`Headline: ${m.headline}`);
        if (m.subheadline) lines.push(`Subheadline: ${m.subheadline}`);
        if (m.body) lines.push(`Body: ${m.body}`);
        if (m.bullets?.length) lines.push(`Bullets:\n${m.bullets.map(b => `  • ${b}`).join('\n')}`);
        if (m.altText) lines.push(`Alt Text: ${m.altText}`);
        if (m.slides?.length) {
            m.slides.forEach((s, si) => {
                lines.push(`  Slide ${si + 1}: ${s.headline || ''} — ${s.body || ''}`);
            });
        }
        if (m.hotspots?.length) {
            m.hotspots.forEach(h => lines.push(`  Hotspot ${h.number}: ${h.title} — ${h.description}`));
        }
        if (m.questions?.length) {
            m.questions.forEach(q => {
                lines.push(`  Q: ${q.question}`);
                lines.push(`  A: ${q.answer}`);
            });
        }
        if (m.rows?.length) {
            lines.push(`Comparison Rows: ${m.rows.map(r => `${r.feature}: ${r.model1Value}`).join(' | ')}`);
        }
        return lines.join('\n');
    }).join('\n\n─────────────────────────────────\n\n');

    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`A+ Builder: Complete in ${elapsed}s — ${aplusPlan.modules.length} modules (${listingTier}), ${successCount} images`);

    // Resolve image URLs within modules for frontend compatibility
    const resolvedModules = (aplusPlan.modules || []).map(mod => {
        let imageUrl = images[mod.id] || null;
        let slides = mod.slides;
        if (mod.type === 'carousel' && slides?.length) {
            slides = slides.map((slide, idx) => ({
                ...slide,
                imageUrl: images[`${mod.id}_slide_${idx}`] || null
            }));
        }
        return {
            ...mod,
            imageUrl,
            slides
        };
    });

    const finalHtml = buildAplusHTML(aplusPlan, images);

    return {
        aplusPlan,
        modules: resolvedModules, // Added for frontend mapping
        images,
        html: finalHtml,         // Added for frontend mapping
        exportText,
        productData: product,
        productDNA: activeProductDNA || null,
        designContext: activeDesignContext
            ? { moodId: activeDesignContext.moodId, moodLabel: activeDesignContext.moodLabel }
            : null,
        visualIntelligence: visualIntelligence ? (() => { try { return JSON.parse(visualIntelligence); } catch { return null; } })() : null,
        moduleCount: aplusPlan.modules.length,
        listingTier,
        isPremium,
        generatedAt: new Date().toISOString(),
        elapsedSeconds: elapsed,
    };
}

/**
 * Compiles the A+ / A++ structural plan and generated image links into a single stand-alone HTML document.
 */
export function buildAplusHTML(aplusPlan, images) {
    const isPremium = aplusPlan.isPremium || aplusPlan.listingTier === 'premium';
    const width = isPremium ? 1464 : 970;
    
    let modulesHtml = '';
    
    (aplusPlan.modules || []).forEach((mod) => {
        const imgUrl = images[mod.id] || '';
        
        switch (mod.type) {
            case 'hero_banner':
            case 'premium_hero':
                modulesHtml += `
                    <div class="aplus-module hero-module" style="position: relative; margin-bottom: 20px;">
                        ${imgUrl ? `<img src="${imgUrl}" style="width: 100%; display: block; border-radius: 8px;" />` : ''}
                        <div class="hero-text" style="padding: 15px 0;">
                            <h2 style="margin: 0 0 8px 0; font-size: 24px; color: #111;">${mod.headline || ''}</h2>
                            <p style="margin: 0; font-size: 16px; color: #555; line-height: 1.5;">${mod.subheadline || ''}</p>
                            ${mod.body ? `<p style="margin: 10px 0 0 0; font-size: 14px; color: #666; line-height: 1.6;">${mod.body}</p>` : ''}
                        </div>
                    </div>
                `;
                break;
                
            case 'image_text_left':
            case 'premium_image_text':
                modulesHtml += `
                    <div class="aplus-module split-module" style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px;">
                        <div style="flex: 1;">
                            ${imgUrl ? `<img src="${imgUrl}" style="width: 100%; display: block; border-radius: 6px;" />` : ''}
                        </div>
                        <div style="flex: 1; padding: 10px;">
                            <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #111;">${mod.headline || ''}</h3>
                            <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">${mod.body || ''}</p>
                        </div>
                    </div>
                `;
                break;
                
            case 'image_text_right':
                modulesHtml += `
                    <div class="aplus-module split-module" style="display: flex; gap: 20px; align-items: center; margin-bottom: 20px; flex-direction: row-reverse;">
                        <div style="flex: 1;">
                            ${imgUrl ? `<img src="${imgUrl}" style="width: 100%; display: block; border-radius: 6px;" />` : ''}
                        </div>
                        <div style="flex: 1; padding: 10px;">
                            <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #111;">${mod.headline || ''}</h3>
                            <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">${mod.body || ''}</p>
                        </div>
                    </div>
                `;
                break;
                
            case 'three_features':
            case 'four_features':
                const cols = mod.items || [];
                let colsHtml = '';
                cols.forEach((item, idx) => {
                    const colImg = images[`${mod.id}_${idx}`] || images[mod.id] || '';
                    colsHtml += `
                        <div style="flex: 1; text-align: center; padding: 10px;">
                            ${colImg ? `<img src="${colImg}" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 10px;" />` : ''}
                            <h4 style="margin: 0 0 6px 0; font-size: 16px; color: #111;">${item.title || ''}</h4>
                            <p style="margin: 0; font-size: 13px; color: #666; line-height: 1.5;">${item.description || ''}</p>
                        </div>
                    `;
                });
                modulesHtml += `
                    <div class="aplus-module grid-module" style="margin-bottom: 20px;">
                        <h3 style="text-align: center; margin-bottom: 15px; font-size: 20px; color: #111;">${mod.headline || ''}</h3>
                        <div style="display: flex; gap: 15px;">
                            ${colsHtml}
                        </div>
                    </div>
                `;
                break;
                
            case 'carousel':
                let slidesHtml = '';
                (mod.slides || []).forEach((slide, idx) => {
                    const slideImg = images[`${mod.id}_slide_${idx}`] || '';
                    slidesHtml += `
                        <div style="margin-bottom: 15px; border-bottom: 1px dashed #eee; padding-bottom: 15px;">
                            ${slideImg ? `<img src="${slideImg}" style="width: 100%; max-height: 400px; object-fit: cover; display: block; border-radius: 6px; margin-bottom: 8px;" />` : ''}
                            <h4 style="margin: 0 0 4px 0; font-size: 16px; color: #111;">${slide.headline || ''}</h4>
                            <p style="margin: 0; font-size: 13px; color: #666; line-height: 1.5;">${slide.body || ''}</p>
                        </div>
                    `;
                });
                modulesHtml += `
                    <div class="aplus-module carousel-module" style="margin-bottom: 20px; padding: 15px; background: #fafafa; border-radius: 8px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 20px; color: #111;">${mod.headline || ''} (Carousel Slides)</h3>
                        ${slidesHtml}
                    </div>
                `;
                break;
                
            case 'hotspot':
                modulesHtml += `
                    <div class="aplus-module hotspot-module" style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #111;">${mod.headline || ''} (Interactive Hotspots)</h3>
                        <div style="position: relative;">
                            ${imgUrl ? `<img src="${imgUrl}" style="width: 100%; display: block; border-radius: 8px;" />` : ''}
                        </div>
                        <ul style="margin: 15px 0 0 0; padding-left: 20px; font-size: 13px; color: #555; line-height: 1.6;">
                            ${(mod.hotspots || []).map(h => `<li><strong>Point ${h.number}:</strong> ${h.title} - ${h.description}</li>`).join('')}
                        </ul>
                    </div>
                `;
                break;
                
            case 'qa_panel':
                let qaListHtml = '';
                (mod.questions || []).forEach(q => {
                    qaListHtml += `
                        <div style="margin-bottom: 12px;">
                            <p style="margin: 0 0 4px 0; font-weight: bold; color: #333;">Q: ${q.question}</p>
                            <p style="margin: 0; color: #666; line-height: 1.5;">A: ${q.answer}</p>
                        </div>
                    `;
                });
                modulesHtml += `
                    <div class="aplus-module qa-module" style="margin-bottom: 20px; padding: 15px; background: #fdfdfd; border: 1px solid #eee; border-radius: 8px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #111; border-bottom: 1px solid #eee; padding-bottom: 8px;">${mod.headline || 'Product Q&A'}</h3>
                        ${qaListHtml}
                    </div>
                `;
                break;
                
            case 'comparison_chart':
            case 'enhanced_comparison':
                let rowsHtml = '';
                (mod.rows || []).forEach(row => {
                    rowsHtml += `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px; font-weight: bold; color: #555;">${row.feature}</td>
                            <td style="padding: 10px; text-align: center;">${row.model1Value}</td>
                            <td style="padding: 10px; text-align: center;">${row.model2Value || 'N/A'}</td>
                        </tr>
                    `;
                });
                modulesHtml += `
                    <div class="aplus-module comparison-module" style="margin-bottom: 20px; overflow-x: auto;">
                        <h3 style="margin: 0 0 12px 0; font-size: 20px; color: #111;">${mod.headline || 'Product Comparison'}</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background: #f5f5f5; border-bottom: 2px solid #ddd;">
                                    <th style="padding: 10px; text-align: left;">Feature</th>
                                    <th style="padding: 10px; text-align: center;">This Product</th>
                                    <th style="padding: 10px; text-align: center;">Alternative</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                `;
                break;
                
            default:
                modulesHtml += `
                    <div class="aplus-module standard-module" style="margin-bottom: 20px;">
                        <h3 style="margin: 0 0 10px 0; font-size: 20px; color: #111;">${mod.headline || ''}</h3>
                        ${imgUrl ? `<img src="${imgUrl}" style="width: 100%; display: block; border-radius: 6px; margin-bottom: 10px;" />` : ''}
                        <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">${mod.body || ''}</p>
                    </div>
                `;
        }
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${aplusPlan.productName || 'Amazon A+ Content'}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 20px;
            background: #fafafa;
        }
        .aplus-container {
            max-width: ${width}px;
            margin: 0 auto;
            background: #fff;
            padding: 30px;
            border: 1px solid #e1e1e1;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.02);
        }
        .aplus-header {
            text-align: center;
            border-bottom: 2px solid #f0f0f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .aplus-header h1 {
            margin: 0;
            font-size: 28px;
            color: #111;
        }
        .aplus-header p {
            margin: 5px 0 0 0;
            font-size: 14px;
            color: #777;
        }
    </style>
</head>
<body>
    <div class="aplus-container">
        <div class="aplus-header">
            <h1>${aplusPlan.productName || 'A+ Content Layout'}</h1>
            <p>Target Audience: ${aplusPlan.targetAudience || 'General'}</p>
            <p style="font-style: italic; color: #666; margin-top: 5px;">Strategy: ${aplusPlan.contentStrategy || ''}</p>
        </div>
        
        <div class="aplus-modules-stack">
            ${modulesHtml}
        </div>
    </div>
</body>
</html>`;
}
