/**
 * aplusBuilder.js — Amazon A+ Content Listing Generator
 *
 * Architecture:
 *  1. Product Intelligence — MCoT multimodal analysis of product images + URL scraping
 *  2. Competitive Intel   — MCP web_search for market positioning
 *  3. A+ Strategy Agent   — Claude plans optimal module layout + content strategy
 *  4. Module Content Gen  — Claude writes benefit-first copy per module
 *  5. Image Pipeline      — NanoBanana 2 generates images at exact Amazon pixel dims
 *  6. Page Assembly       — Returns structured modules + images map
 */

import { callAgent, callMultimodalAgent, callAgentText, loadBrandContext } from '../shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../videoStudio/laozhangClient.js';
import { webSearch } from '../contentStudio/tools.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

// ── Amazon A+ Module Specifications ────────────────────────────────────────────
// Source: Amazon Seller Central A+ Content Manager (2025 verified)
export const APLUS_MODULES = {
    hero_banner: {
        id: 'hero_banner', label: 'Hero Banner',
        width: 1940, height: 1200,   // 2x of Amazon's 970×600 for Retina
        displayWidth: 970, displayHeight: 600,
        description: 'Full-width lifestyle/product hero image. The first impression. Make it emotional.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'subheadline']
    },
    image_text_left: {
        id: 'image_text_left', label: 'Image & Text (Image Left)',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Product or lifestyle image on the left, benefit-focused text on the right.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'body', 'altText']
    },
    image_text_right: {
        id: 'image_text_right', label: 'Image & Text (Image Right)',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Text on the left, image on the right — alternating with image_text_left for visual rhythm.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'body', 'altText']
    },
    three_features: {
        id: 'three_features', label: 'Three Features Grid',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Three equal columns — each with an icon/image and feature headline + descriptor.',
        maxImages: 3, hasText: true,
        textFields: ['headline', 'items[0]', 'items[1]', 'items[2]']
    },
    four_features: {
        id: 'four_features', label: 'Four Features Grid',
        width: 440, height: 440,
        displayWidth: 220, displayHeight: 220,
        description: 'Four equal columns — great for listing USPs with icon + label.',
        maxImages: 4, hasText: true,
        textFields: ['headline', 'items[0]', 'items[1]', 'items[2]', 'items[3]']
    },
    comparison_chart: {
        id: 'comparison_chart', label: 'Comparison Chart',
        width: 300, height: 600,
        displayWidth: 150, displayHeight: 300,
        description: 'Compare your product variants or models — Amazon allows this within your own brand.',
        maxImages: 4, hasText: true,
        textFields: ['headline', 'rows']
    },
    image_highlights: {
        id: 'image_highlights', label: 'Image with Highlights',
        width: 600, height: 600,
        displayWidth: 300, displayHeight: 300,
        description: 'Product display image with 4-6 bullet-point highlights beside it.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'bullets', 'altText']
    },
    header_overlay: {
        id: 'header_overlay', label: 'Header with Text Overlay',
        width: 1940, height: 600,
        displayWidth: 970, displayHeight: 300,
        description: 'Full-width banner image with text overlay — good for section dividers.',
        maxImages: 1, hasText: true,
        textFields: ['headline', 'subheadline', 'altText']
    },
    brand_story: {
        id: 'brand_story', label: 'Brand Story',
        width: 1940, height: 1200,
        displayWidth: 970, displayHeight: 600,
        description: 'Brand narrative section — mission, values, promise. Builds trust and loyalty.',
        maxImages: 1, hasText: true,
        textFields: ['brandName', 'tagline', 'story']
    }
};

// ── Product Intelligence: URL Scraper ───────────────────────────────────────────
async function scrapeProductUrl(url) {
    if (!url) return null;
    try {
        console.log(`🔍 A+: Scraping product URL: ${url}`);
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

        // ── Amazon-specific extraction ─────────────────────────────────────────
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

        // ── Shopify-specific extraction ────────────────────────────────────────
        if (url.includes('myshopify.com') || url.includes('/products/')) {
            const jsonLd = $('script[type="application/ld+json"]').map((_, el) => {
                try { return JSON.parse($(el).html()); } catch (_) { return null; }
            }).get().filter(Boolean).find(d => d['@type'] === 'Product');

            return {
                title: jsonLd?.name || $('h1').first().text().trim(),
                price: jsonLd?.offers?.[0]?.price || '',
                description: jsonLd?.description || $('[class*="description"]').first().text().trim().substring(0, 1000),
                bulletPoints: $('ul li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 10 && t.length < 200).slice(0, 8),
                images: (jsonLd?.image || []).slice(0, 5),
                category: $('[class*="breadcrumb"] a').map((_, el) => $(el).text().trim()).get().join(' > '),
                platform: 'shopify'
            };
        }

        // ── Generic extraction ─────────────────────────────────────────────────
        return {
            title: $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content'),
            description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
            images: [$('meta[property="og:image"]').attr('content')].filter(Boolean),
            bulletPoints: $('ul li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 10 && t.length < 200).slice(0, 6),
            price: $('[class*="price"]').first().text().trim(),
            platform: 'web'
        };
    } catch (err) {
        console.warn(`⚠️ A+: URL scrape failed for ${url}: ${err.message}`);
        return null;
    }
}

// ── Image Generation for A+ Modules ────────────────────────────────────────────
async function generateModuleImage(prompt, moduleSpec, productImages = [], brandColors = []) {
    const { width, height, id: moduleType } = moduleSpec;
    const size = `${width}x${height}`;

    const colorContext = brandColors.length
        ? `Brand colors: ${brandColors.map(c => `${c.hex} (${c.name || c.usage})`).join(', ')}. Apply these colors naturally.`
        : '';

    const style = `Contemporary premium product photography aesthetic. ${colorContext} Ultra-sharp, 8K quality, professional studio lighting. CRITICAL: Do NOT render any text, words, letters, numbers, or typography anywhere in the image. Pure visual only.`;

    const fullPrompt = `${prompt}. ${style}`;

    try {
        let result;
        if (productImages.length > 0) {
            // MCoT-style: ground the image in the actual product reference
            result = await laozhangMultimodalImageGenerate(fullPrompt, productImages.slice(0, 2), {
                model: 'gemini-3.1-flash-image-preview', size
            });
        } else {
            result = await laozhangImageGenerate(fullPrompt, {
                model: 'gemini-3.1-flash-image-preview', size
            });
        }
        if (result?.imageUrl) {
            console.log(`   ✅ A+: Image generated for [${moduleType}] at ${size}`);
            return result.imageUrl;
        }
    } catch (err) {
        console.warn(`   ⚠️ A+: Image gen failed for [${moduleType}]: ${err.message}`);
    }
    return null;
}

// ── Main Entry Point ────────────────────────────────────────────────────────────
export async function generateAplusListing({
    brandId,
    productUrl = null,
    productData = null,   // Pre-loaded product from brand catalog
    referenceImages = [], // User-uploaded A+ sample screenshots
    brief = '',
    moduleCount = 7,
}) {
    console.log('🏆 A+ Builder: Starting generation pipeline...');
    const t0 = Date.now();

    // ── 1. Load Brand Context ──────────────────────────────────────────────────
    const { brand, brandContext } = await loadBrandContext(brandId);
    const brandColors = brand?.dna?.colors || [];
    const brandFonts = brand?.dna?.fonts || {};

    // ── 2. Product Intelligence ────────────────────────────────────────────────
    let product = productData;

    if (!product && productUrl) {
        product = await scrapeProductUrl(productUrl);
    }

    // If we have product images, use MCoT to deeply analyze them
    const productImages = [
        ...(product?.images || []),
        ...(referenceImages || [])
    ].filter(Boolean).slice(0, 4);

    let visualIntelligence = '';
    if (productImages.length > 0) {
        console.log(`🧠 A+: MCoT visual analysis of ${productImages.length} product images...`);
        const mcotResult = await callMultimodalAgent(
            `You are an Amazon product listing expert and visual analyst. Analyze these product images deeply.
            Return a JSON object with: {
              "productCategory": "what type of product is this",
              "visualStyle": "describe the aesthetic, materials, finish, colors",
              "primaryUseCase": "who uses this and how",
              "emotionalAppeal": "what feeling/aspiration does this product evoke",
              "standoutFeatures": ["visible feature 1", "visible feature 2", ...],
              "targetAudience": "describe the typical buyer",
              "imageryStrategy": "what types of A+ images would work best for this product",
              "competitivePosition": "premium/budget/value/specialized"
            }`,
            `Product: ${product?.title || 'Unknown'}. Brief: ${brief}. Analyze the product images for A+ content creation.`,
            productImages,
            { temperature: 0.3, maxTokens: 1000 }
        );
        visualIntelligence = JSON.stringify(mcotResult);
        console.log(`   ✅ A+: MCoT visual analysis complete`);
    }

    // ── 3. Competitive Intel (MCP web_search) ──────────────────────────────────
    let competitiveIntel = '';
    if (product?.title || brief) {
        try {
            console.log(`🔍 A+: Fetching competitive intel via web_search...`);
            const searchQuery = `Amazon A+ content best examples "${product?.title || brief}" category competitor listing features`;
            const searchResult = await webSearch(searchQuery, 'quick');
            competitiveIntel = typeof searchResult === 'string'
                ? searchResult.substring(0, 800)
                : JSON.stringify(searchResult).substring(0, 800);
            console.log(`   ✅ A+: Competitive intel fetched`);
        } catch (err) {
            console.warn(`   ⚠️ A+: web_search skipped: ${err.message}`);
        }
    }

    // ── 4. A+ Strategy Agent (Claude) ─────────────────────────────────────────
    console.log('🧠 A+: Strategy Agent planning module layout...');

    const productContext = product ? `
Product Title: ${product.title || 'N/A'}
Price: ${product.price || 'N/A'}
Category: ${product.category || 'N/A'}
Description: ${(product.description || '').substring(0, 500)}
Key Features/Bullets: ${(product.bulletPoints || []).join(' | ')}
Platform: ${product.platform || 'N/A'}
Rating: ${product.rating || 'N/A'} (${product.reviewCount || 'N/A'} reviews)
` : brief;

    const strategyPrompt = `You are the world's best Amazon A+ Content strategist. Your A+ content has generated millions in incremental revenue. 

${brandContext}

PRODUCT DATA:
${productContext}

VISUAL ANALYSIS (MCoT):
${visualIntelligence || 'No visual analysis available'}

COMPETITIVE INTEL:
${competitiveIntel || 'No competitive data'}

USER BRIEF:
${brief}

AMAZON A+ RULES:
- No pricing, no promotional language ("free", "discounted", "best-seller")  
- No competitor comparisons (only own-brand comparisons in comparison charts)
- No external links, QR codes, or contact info
- All claims must be verifiable (no unverified superlatives)
- Mobile-first: 70% of traffic is mobile, keep text short

AVAILABLE MODULES (you can pick any combination):
hero_banner, image_text_left, image_text_right, three_features, four_features, comparison_chart, image_highlights, header_overlay, brand_story

Create an optimized A+ Content plan. Return a JSON object:
{
  "productName": "short, punchy product name for A+ header",
  "targetAudience": "primary buyer persona",
  "contentStrategy": "overall narrative arc (1-2 sentences)",
  "modules": [
    {
      "id": "unique_id_e.g._hero_1",
      "type": "module type from available list",
      "headline": "punchy, benefit-first headline (max 150 chars)",
      "subheadline": "supporting line (max 200 chars, optional)",
      "body": "2-3 sentence benefit-focused copy (max 300 chars, plain text only)",
      "bullets": ["bullet 1", "bullet 2", "bullet 3"] (optional, max 6),
      "items": [{"title": "feature name", "description": "short descriptor", "icon": "emoji"}, ...] (for grid modules),
      "rows": [{"feature": "feature name", "model1": "Our Product", "model1Value": "✓", "model2": "Basic", "model2Value": "✗"}] (for comparison),
      "altText": "SEO-optimized image description for accessibility (include relevant keywords)",
      "imagePrompt": "Detailed image generation prompt that is product-aware, does NOT ask for any text/words in the image, and matches the brand aesthetic",
      "imageStyle": "hero-lifestyle / product-detail / infographic / brand-ambient",
      "rationale": "Why this module here, why this content"
    }
  ]
}

Generate exactly ${moduleCount} modules. Start with hero_banner, end with a brand_story or image_highlights. Use progressive reveal: emotional hook → problem → solution → features → social proof/comparison → brand story.`;

    const aplusPlan = await callAgent(strategyPrompt, `Create A+ content for: ${product?.title || brief}`, 0.7, 6000, {
        provider: 'anthropic', model: 'claude-sonnet-4-6', timeoutMs: 120_000
    });

    if (!aplusPlan?.modules?.length) {
        throw new Error('A+ strategy agent returned invalid plan');
    }

    console.log(`   ✅ A+: Strategy complete — ${aplusPlan.modules.length} modules planned`);

    // ── 5. Parallel Image Generation (NanoBanana 2) ───────────────────────────
    console.log(`🎨 A+: Generating ${aplusPlan.modules.length} module images in parallel...`);

    const imageResults = await Promise.allSettled(
        aplusPlan.modules.map(async (module) => {
            const spec = APLUS_MODULES[module.type] || APLUS_MODULES.image_text_left;
            const imgUrl = await generateModuleImage(
                module.imagePrompt,
                spec,
                productImages,
                brandColors
            );
            return { moduleId: module.id, imageUrl: imgUrl };
        })
    );

    const images = {};
    imageResults.forEach((r) => {
        if (r.status === 'fulfilled' && r.value.imageUrl) {
            images[r.value.moduleId] = r.value.imageUrl;
        } else if (r.status === 'rejected') {
            console.warn(`   ⚠️ A+: Image gen rejected:`, r.reason?.message);
        }
    });

    const successCount = Object.keys(images).length;
    console.log(`   ✅ A+: ${successCount}/${aplusPlan.modules.length} images generated`);

    // ── 6. Derive export-ready text content ───────────────────────────────────
    // Build a clean text summary for Seller Central copy-paste
    const exportText = aplusPlan.modules.map((m, i) => {
        const lines = [`[Module ${i + 1}: ${APLUS_MODULES[m.type]?.label || m.type}]`];
        if (m.headline) lines.push(`Headline: ${m.headline}`);
        if (m.subheadline) lines.push(`Subheadline: ${m.subheadline}`);
        if (m.body) lines.push(`Body: ${m.body}`);
        if (m.bullets?.length) lines.push(`Bullets:\n${m.bullets.map(b => `  • ${b}`).join('\n')}`);
        if (m.altText) lines.push(`Alt Text: ${m.altText}`);
        return lines.join('\n');
    }).join('\n\n─────────────────────────────────\n\n');

    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(`🏆 A+ Builder: Complete in ${elapsed}s — ${aplusPlan.modules.length} modules, ${successCount} images`);

    return {
        aplusPlan,
        images,
        exportText,
        productData: product,
        visualIntelligence: visualIntelligence ? JSON.parse(visualIntelligence) : null,
        moduleCount: aplusPlan.modules.length,
        generatedAt: new Date().toISOString(),
        elapsedSeconds: elapsed
    };
}
