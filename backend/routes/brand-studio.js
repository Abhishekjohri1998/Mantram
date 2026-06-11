import express from 'express';
import { protect } from '../middleware/auth.js';
import { deductCredits } from '../middleware/credits.js';
import { generateCampaignDeck } from '../agents/brandStudio/deckBuilder.js';
import { generateEmail } from '../agents/brandStudio/emailBuilder.js';
import { generateLandingPage, publishToShopify, generateEmbedCode } from '../agents/brandStudio/landingPageBuilder.js';
import { generateAplusListing } from '../agents/brandStudio/aplusBuilder.js';
import { exportEmailToPlatform } from '../utils/emailIntegrations.js';
import { callAgentText, callAgent } from '../agents/shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../agents/videoStudio/laozhangClient.js';
import { analyzeProductDesign, generateMoodBoardImages, generateProductMoodDirections, buildDesignContext, generateQuickPost } from '../agents/shared/productDesignAgent.js';
import PulseHistory from '../models/PulseHistory.js';
import ProductContext from '../models/ProductContext.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { mirrorUrlToS3 } from '../utils/s3.js';

const router = express.Router();

const CREDITS = { deck: 20, email: 12, landing: 18, aplus: 15, aplusPlus: 25 };

// ── POST /api/brand-studio/fetch-url ─────────────────────────
// Scrapes a product/brand URL and returns structured content
// for use as enriched context in generation requests.
router.post('/fetch-url', protect, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'url required' });

        // Validate URL
        let parsed;
        try { parsed = new URL(url); } catch { return res.status(400).json({ success: false, error: 'Invalid URL' }); }

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            redirect: 'follow',
            timeout: 15000,
        });

        if (!response.ok) return res.status(502).json({ success: false, error: `Page returned ${response.status}` });

        const html = await response.text();
        const $ = cheerio.load(html);
        const base = `${parsed.protocol}//${parsed.host}`;

        // ── Meta / OG ──
        const ogImage    = $('meta[property="og:image"]').attr('content')     || $('meta[name="twitter:image"]').attr('content') || '';
        const ogTitle    = $('meta[property="og:title"]').attr('content')     || '';
        const ogDesc     = $('meta[property="og:description"]').attr('content') || '';
        const metaDesc   = $('meta[name="description"]').attr('content')      || '';
        const pageTitle  = $('title').text().trim() || ogTitle;

        // ── Main heading & subheading ──
        const h1 = $('h1').first().text().trim();
        const h2 = $('h2').first().text().trim();

        // ── Price (common patterns) ──
        let price = '';
        const priceSelectors = [
            '[class*="price"]', '[id*="price"]', '[data-testid*="price"]',
            '.amount', '.product-price', '[class*="Price"]', 'span[itemprop="price"]',
        ];
        for (const sel of priceSelectors) {
            const txt = $(sel).first().text().trim();
            if (txt && /[₹$€£¥]|[0-9]{2,}/.test(txt)) { price = txt.replace(/\s+/g, ' ').substring(0, 50); break; }
        }

        // ── Product description / body copy ──
        const descSelectors = [
            '[class*="description"]', '[class*="product-detail"]', '[class*="product-info"]',
            '[itemprop="description"]', '.summary', '.product-summary', 'article p',
        ];
        let productDesc = '';
        for (const sel of descSelectors) {
            const txt = $(sel).first().text().trim().replace(/\s+/g, ' ');
            if (txt.length > 30) { productDesc = txt.substring(0, 800); break; }
        }

        // ── Full text dump (limited, for AI context) ──
        // Remove scripts, styles, nav, footer to get actual content
        $('script, style, nav, footer, header, [role="navigation"], [role="banner"]').remove();
        const bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 2000);

        // ── Images — collect all meaningful product images ──
        const images = [];
        const seen = new Set();

        // OG image first (highest quality)
        if (ogImage) {
            const abs = ogImage.startsWith('http') ? ogImage : `${base}${ogImage}`;
            if (!seen.has(abs)) { seen.add(abs); images.push({ url: abs, type: 'og', alt: pageTitle }); }
        }

        // Structured data images (JSON-LD)
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).html());
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    const imgs = [item.image, item.logo, item.thumbnail].flat().filter(Boolean);
                    for (const img of imgs) {
                        const u = typeof img === 'string' ? img : img?.url;
                        if (u && !seen.has(u)) { seen.add(u); images.push({ url: u, type: 'jsonld', alt: item.name || pageTitle }); }
                    }
                }
            } catch {}
        });

        // All <img> tags with meaningful size/src
        $('img').each((_, el) => {
            let src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy-src') || '';
            if (!src || src.startsWith('data:') || src.length < 5) return;
            if (!src.startsWith('http')) src = src.startsWith('//') ? `https:${src}` : `${base}${src}`;
            const w = parseInt($(el).attr('width') || '0');
            const h = parseInt($(el).attr('height') || '0');
            // Skip tiny icons (< 60px)
            if ((w > 0 && w < 60) || (h > 0 && h < 60)) return;
            // Skip common icons/logos in path
            if (/icon|logo|spinner|loader|arrow|badge|star|rating/i.test(src)) return;
            if (!seen.has(src) && images.length < 12) {
                seen.add(src);
                images.push({ url: src, type: 'img', alt: $(el).attr('alt') || '' });
            }
        });

        // ── Features / bullet points ──
        const features = [];
        $('ul li, ol li').each((_, el) => {
            const txt = $(el).text().trim().replace(/\s+/g, ' ');
            if (txt.length > 10 && txt.length < 200 && features.length < 10) features.push(txt);
        });

        res.json({
            success: true,
            url,
            title:       pageTitle,
            h1:          h1 || pageTitle,
            h2,
            ogTitle,
            description: ogDesc || metaDesc || productDesc,
            price,
            productDesc,
            bodyText,
            features:    features.slice(0, 6),
            images:      images.slice(0, 8),
            domain:      parsed.hostname,
        });
    } catch (err) {
        console.error('❌ fetch-url:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/product-intelligence ────────────────
// Step 0 of Pulse generation: MCoT product image analysis → ProductDNA
// Free (no credit cost) — this is context building, not content generation
router.post('/product-intelligence', protect, async (req, res) => {
    try {
        const { productImages = [], productData = {}, brief = '', brandId, productUrl = '' } = req.body;

        if (!productImages.length && !productData?.title && !brief) {
            return res.status(400).json({ success: false, error: 'Provide productImages, productData, or brief' });
        }

        console.log(`🎨 PDI: Running product intelligence for "${productData?.title || 'untitled'}" — ${productImages.length} images`);
        const productDNA = await analyzeProductDesign(productImages, productData, brief);

        // Store the original product URL in DNA for downstream use
        if (productUrl) productDNA.sourceUrl = productUrl;

        // Diagnostic log — shows exactly what was classified
        console.log(`✅ PDI Complete: category="${productDNA.productCategory}" | colors=${productDNA.dominantColors?.length || 0} | mood=${productDNA.defaultMoodDirection} | fallback=${productDNA.isFallback || false}`);
        if (productDNA.dominantColors?.length) {
            console.log(`   Colors: ${productDNA.dominantColors.slice(0, 3).map(c => `${c.name} ${c.hex}`).join(', ')}`);
        }

        res.json({ success: true, productDNA });
    } catch (err) {
        console.error('❌ PDI product-intelligence:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/quick-post ─────────────────────────────────────────
// 2-step Quick Post generator:
//   Step 1 → Claude extracts structured copy (headline, heroSpec, features, CTA)
//   Step 2 → NanoBanana generates background world image for each requested ratio
// Cost: 8 credits (single) / 12 credits (multi-size batch)
router.post('/quick-post', protect, async (req, res) => {
    try {
        const { productDNA, productData, selectedMoodId, productMoodDirections, postType, aspectRatio, aspectRatios, brandId, imageModel } = req.body;
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        // Support both single ratio (aspectRatio) and multi-ratio batch (aspectRatios[])
        const ratioList = aspectRatios?.length ? aspectRatios : [aspectRatio || '1:1'];
        const isMulti   = ratioList.length > 1;
        const QUICK_POST_CREDITS = isMulti ? 12 : 8;  // Batch discount vs. individual

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < QUICK_POST_CREDITS) return res.status(402).json({ success: false, error: 'Insufficient credits', required: QUICK_POST_CREDITS });

        let brandContext = '';
        if (brandId) {
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const ctx = await loadBrandContext(brandId);
            brandContext = ctx.brandContext || '';
        }

        // Resolve mood direction
        const moodMap = productMoodDirections || {};
        const selectedMoodDir = moodMap[selectedMoodId] || Object.values(moodMap)[0] || {
            label: 'Professional',
            description: 'Professional product photography',
            shootDirective: 'Studio quality, clean, well-lit',
            moodBoardDirective: 'Professional commercial photography with clean backdrop',
        };

        console.log(`🎯 [QuickPost] type=${postType} ratios=${ratioList.join(',')} mood="${selectedMoodDir.label}"`);

        // Import the agent — each ratio generates a COMPLETE designed graphic in parallel
        const { generateQuickPost } = await import('../agents/shared/productDesignAgent.js');

        // Run all ratios in parallel — each call does copy extraction + full image generation
        const results = await Promise.all(
            ratioList.map(ratio =>
                generateQuickPost(
                    productDNA,
                    productData,
                    selectedMoodDir,
                    postType || 'promo',
                    ratio,
                    brandContext,
                    imageModel,
                )
            )
        );

        // Use copy/palette from first result (all ratios share the same product)
        const firstResult = results[0];

        // Collect all generated graphic images keyed by ratio
        const backgrounds = {};
        ratioList.forEach((ratio, i) => {
            backgrounds[ratio] = results[i]?.postImageUrl || results[i]?.backgroundUrl || null;
        });

        await deductCredits(req.user._id, QUICK_POST_CREDITS, 'quick_post');
        res.json({
            success:       true,
            copy:          firstResult.copy,
            palette:       firstResult.palette,
            moodLabel:     firstResult.moodLabel,
            postType:      postType || 'promo',
            backgrounds,                                     // { '1:1': url, '9:16': url, … }
            backgroundUrl: backgrounds[ratioList[0]] || null,  // compat alias
        });
    } catch (err) {
        console.error('❌ [QuickPost]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ── POST /api/brand-studio/mood-board ─────────────────────────
// Generate 4 mood direction images using ProductDNA as creative anchor
// GPT Image 2 is default — best product understanding + text rendering
// Cost: 5 credits (1 for mood generation + 4 for images)
router.post('/mood-board', protect, async (req, res) => {
    try {
        const { productDNA, productData, brandId } = req.body;
        // MUST use gemini-3.1-flash-image-preview — it's the only model that supports multimodal
        // reference images. gpt-image-2 ignores productRefImages entirely (useMultimodal=false).
        const imageModel = req.body.imageModel || 'gpt-image-2';
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        const MOOD_CREDITS = 5;
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < MOOD_CREDITS) return res.status(402).json({ success: false, error: 'Insufficient credits', required: MOOD_CREDITS });

        let brandContext = '';
        if (brandId) {
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const ctx = await loadBrandContext(brandId);
            brandContext = ctx.brandContext || '';
        }

        const customMoodDirections = await generateProductMoodDirections(productDNA, productData || {}, brandContext);

        // ── Inject S3-persisted reference images ──────────────────────────────────
        // CDN URLs (Amazon, Flipkart, etc.) get 403-blocked when LaoZhang fetches them.
        // persistedImages are S3 copies, but the bucket has ACLs disabled (owner-enforced)
        // so plain S3 URLs ALSO return 403. We must use pre-signed URLs.
        const { getSignedUrlIfNeeded } = await import('../utils/s3.js');
        const s3Refs = (productData?.persistedImages || []).filter(u => u?.includes('amazonaws'));
        const fallbackRefs = s3Refs.length > 0
            ? s3Refs
            : (productData?.images || []).filter(u => u?.includes('amazonaws'));

        if (fallbackRefs.length > 0) {
            // Pre-sign each S3 URL so the AI model can actually fetch them (ACLs disabled on bucket)
            const signedRefs = await Promise.all(fallbackRefs.slice(0, 4).map(u => getSignedUrlIfNeeded(u)));
            productDNA.productRefImages = signedRefs.filter(Boolean);
            if (!productDNA.heroImageUrl || productDNA.heroImageUrl.includes('amazonaws')) {
                productDNA.heroImageUrl = signedRefs[0] || productDNA.heroImageUrl;
            }
            if ((!productDNA.lifestyleImageUrl || productDNA.lifestyleImageUrl.includes('amazonaws')) && signedRefs[1]) {
                productDNA.lifestyleImageUrl = signedRefs[1];
            }
            console.log(`📸 Mood board: using ${signedRefs.length} pre-signed S3 ref images`);
        }

        const result = await generateMoodBoardImages(productDNA, brandContext, customMoodDirections, imageModel);
        await deductCredits(req.user._id, MOOD_CREDITS, 'pulse-mood-board');

        res.json({
            success: true,
            moods: result.moods,
            moodDirections: customMoodDirections,
        });
    } catch (err) {
        console.error('❌ PDI mood-board:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/social-kit/generate ────────────────────────────────
// Generates multi-platform social media images + AI captions in one shot
// Platforms: Instagram Feed, Instagram Story, Facebook/LinkedIn, Twitter/X, Pinterest
// Each platform gets: generated image (S3 URL) + tailored caption + hashtags
// Cost: 15 credits
router.post('/social-kit/generate', protect, async (req, res) => {
    try {
        const { productDNA, productData, selectedMoodId, productMoodDirections, kitType = 'promo', platforms, brandId, imageModel } = req.body;
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        const SOCIAL_KIT_CREDITS = 15;
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < SOCIAL_KIT_CREDITS) return res.status(402).json({ success: false, error: 'Insufficient credits', required: SOCIAL_KIT_CREDITS });

        const model = imageModel || 'gpt-image-2';

        let brandContext = '';
        if (brandId) {
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const ctx = await loadBrandContext(brandId);
            brandContext = ctx.brandContext || '';
        }

        // Resolve mood direction
        const moodMap = productMoodDirections || {};
        const selectedMoodDir = moodMap[selectedMoodId] || Object.values(moodMap)[0] || {
            label: 'Professional', description: 'Clean professional aesthetic',
            shootDirective: 'Studio quality, clean, well-lit',
        };

        const productTitle = productData?.title || productDNA?.productCategory || 'Product';
        const bullets = productData?.bulletPoints || [];
        const colorHex = (productDNA?.dominantColors || []).slice(0, 3).map(c => c.hex).filter(Boolean).join(', ');
        const refImages = [
            productDNA?.heroImageUrl,
            ...(productDNA?.productRefImages || []).slice(0, 2),
        ].filter(Boolean);

        // Step 1: Claude generates copy for all platforms simultaneously
        const copyPrompt = `You are a senior social media strategist.
Product: "${productTitle}" | Category: ${productDNA?.productCategory || 'consumer product'} | Mood: ${selectedMoodDir.label}
Key USPs: ${bullets.slice(0, 5).join(' | ')}
Post type: ${kitType}

Generate platform-optimized captions. Return ONLY valid JSON:
{
  "instagram_feed": { "caption": "2-3 line engaging caption (no hashtags here)", "hashtags": "20 relevant hashtags as a single string" },
  "instagram_story": { "caption": "Short punchy text overlay suggestion (max 15 words)", "sticker_text": "CTA for story sticker e.g. Swipe Up | Shop Now" },
  "facebook": { "caption": "Conversational 2-3 line post (no hashtag spam), include link placeholder" },
  "twitter_x": { "caption": "Under 250 chars. Punchy. Include 2-3 relevant hashtags." },
  "linkedin": { "caption": "Professional 3-4 line post. Business benefit angle. Max 1300 chars." },
  "pinterest": { "caption": "Keyword-rich descriptive caption for pin. 2-3 sentences with relevant keywords.", "board_suggestion": "Suggested board name" }
}`;

        let captions = {};
        try {
            captions = await callAgentText(
                'You are a senior social media strategist. Return ONLY valid JSON, no markdown.',
                copyPrompt, 0.6, 1200
            );
            if (typeof captions === 'string') captions = JSON.parse(captions);
        } catch(e) { console.warn('Caption generation failed:', e.message); }

        // Step 2: Generate images for requested platforms in parallel
        // Platform specs (latest 2024/25 sizes for best quality)
        const PLATFORM_CONFIGS = {
            instagram_feed:   { size: '1024x1024',  label: 'Instagram Feed',   ratio: '1:1',  hint: 'Square social post — vibrant, bold, Instagram-native design' },
            instagram_story:  { size: '832x1216',   label: 'Instagram Story',  ratio: '9:16', hint: 'Vertical story format — bold headline zone at top, product center, CTA bottom' },
            facebook:         { size: '1344x768',   label: 'Facebook Post',    ratio: '16:9', hint: 'Landscape Facebook post — wide, engaging, feature-forward' },
            twitter_x:        { size: '1344x768',   label: 'Twitter/X Post',   ratio: '16:9', hint: 'Twitter/X card format — punchy, high contrast, concise' },
            linkedin:         { size: '1344x768',   label: 'LinkedIn Post',    ratio: '16:9', hint: 'Professional LinkedIn post — clean, credibility-focused, business aesthetic' },
            pinterest:        { size: '896x1120',   label: 'Pinterest Pin',    ratio: '4:5',  hint: 'Pinterest vertical pin — lifestyle-rich, aspirational, high visual quality' },
        };

        const targetPlatforms = (platforms && platforms.length) ? platforms : Object.keys(PLATFORM_CONFIGS);

        const colorGuard = (productDNA?.dominantColors || [])
            .filter(c => c.role !== 'background_suggestion')
            .map(c => `${c.name} (${c.hex})`).join(', ');

        const postTypePrompts = {
            promo:   'promotional, aspirational, "shop now" energy',
            feature:  'feature spotlight, educational, premium product detail',
            launch:  'product launch announcement, exciting, bold',
        };

        const { laozhangImageGenerate, laozhangMultimodalImageGenerate } = await import('../agents/videoStudio/laozhangClient.js');

        const imageJobs = targetPlatforms.map(async (platform) => {
            const cfg = PLATFORM_CONFIGS[platform];
            if (!cfg) return { platform, success: false };

            const imagePrompt = `SOCIAL MEDIA ${cfg.label.toUpperCase()} — COMPLETE DESIGNED GRAPHIC

PLATFORM: ${cfg.label} | Size: ${cfg.size} | Type: ${postTypePrompts[kitType] || postTypePrompts.promo}
${cfg.hint}

PRODUCT: ${productTitle}
CATEGORY: ${productDNA?.productCategory || 'consumer product'}
MOOD DIRECTION: ${selectedMoodDir.label} — ${selectedMoodDir.description || ''}
SHOOT STYLE: ${selectedMoodDir.shootDirective || 'Professional, premium, brand-consistent'}
${colorGuard ? `PRODUCT COLORS (DO NOT CHANGE THESE): ${colorGuard}` : ''}
BACKGROUND/ACCENT PALETTE (mood-inspired): ${colorHex || 'dark premium tones'}

DESIGN REQUIREMENTS:
- This is a COMPLETE ready-to-post social graphic
- Product must be the visual hero — prominently placed, properly lit
- Include brand-consistent graphic design elements (geometric shapes, color blocks)
- Typography zone: Leave clean space for ${captions[platform]?.caption ? 'the headline text' : 'CTA text'}
- Visual quality: editorial photography meets graphic design — not a simple product shot
- The product colors MUST be preserved exactly as specified

CRITICAL: Render NO readable text in the image. Design only.`;

            try {
                let result;
                const useMultimodal = refImages.length > 0;
                if (useMultimodal && model.includes('gpt-image') && laozhangGptImageWithRefs) {
                    result = await laozhangGptImageWithRefs(imagePrompt, refImages, { model, size: cfg.size });
                } else if (useMultimodal && laozhangMultimodalImageGenerate) {
                    result = await laozhangMultimodalImageGenerate(imagePrompt, refImages, { model, size: cfg.size });
                } else {
                    result = await laozhangImageGenerate(imagePrompt, { model, size: cfg.size });
                }
                return { platform, label: cfg.label, ratio: cfg.ratio, size: cfg.size, imageUrl: result?.imageUrl, success: !!result?.imageUrl };
            } catch(e) {
                console.warn(`Social kit image failed for ${platform}:`, e.message);
                return { platform, label: cfg.label, ratio: cfg.ratio, size: cfg.size, imageUrl: null, success: false };
            }
        });

        const imageResults = await Promise.allSettled(imageJobs);
        const kitImages = imageResults.map(r => r.status === 'fulfilled' ? r.value : { success: false });

        await deductCredits(req.user._id, SOCIAL_KIT_CREDITS, 'pulse-social-kit');

        res.json({
            success: true,
            kitImages,
            captions,
            productName: productTitle,
            moodLabel: selectedMoodDir.label,
            creditsUsed: SOCIAL_KIT_CREDITS,
        });
    } catch (err) {
        console.error('❌ Social Kit generate:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/brochure/generate ──────────────────────────────────
// Generates a single-page 2-sided product brochure (A4 HTML + PDF-ready)
// Front: hero image + headline + USPs | Back: features + specs + CTA
// Hosted on S3. Cost: 12 credits
router.post('/brochure/generate', protect, async (req, res) => {
    try {
        const { productDNA, productData, designContext, brandId, imageModel, brief = '' } = req.body;
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        const BROCHURE_CREDITS = 12;
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < BROCHURE_CREDITS) return res.status(402).json({ success: false, error: 'Insufficient credits', required: BROCHURE_CREDITS });

        const model = imageModel || 'gpt-image-2';

        let brandContext = '';
        if (brandId) {
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const ctx = await loadBrandContext(brandId);
            brandContext = ctx.brandContext || '';
        }

        const productTitle = productData?.title || productDNA?.productCategory || 'Product';
        const bullets = productData?.bulletPoints || [];
        const dominantColors = (productDNA?.dominantColors || []).filter(c => c.role !== 'background_suggestion');
        const primaryColor = dominantColors[0]?.hex || '#1a1a2e';
        const accentColor = dominantColors[1]?.hex || '#7c3aed';
        const refImages = [productDNA?.heroImageUrl, ...(productDNA?.productRefImages || []).slice(0, 2)].filter(Boolean);
        const moodDir = designContext ? { label: designContext.moodLabel, shootDirective: designContext.shootDirective } : { label: 'Premium Minimal', shootDirective: 'Clean studio, elegant' };

        // Step 1: Claude generates structured brochure content
        const contentPrompt = `You are a senior copywriter creating a premium product brochure.
Product: "${productTitle}" | Category: ${productDNA?.productCategory} | Brief: ${brief || 'Premium marketing brochure'}
Key features: ${bullets.slice(0, 8).join(' | ')}
Design mood: ${moodDir.label}
Brand context: ${brandContext ? brandContext.substring(0, 200) : 'none'}

Return ONLY valid JSON:
{
  "front": {
    "headline": "Bold 3-8 word product headline (not the product name)",
    "subheadline": "One compelling sentence — what transformation does this product deliver?",
    "badge_text": "Optional short badge text e.g. 'New Launch' or 'Award Winning' — or null"
  },
  "back": {
    "intro": "2 sentence product intro paragraph. Premium, benefit-led.",
    "features": [{ "title": "Feature name (2-3 words)", "desc": "One line benefit explanation" }],
    "specs": [{ "label": "Spec label", "value": "Spec value" }],
    "cta_headline": "CTA headline e.g. 'Experience the Difference'",
    "cta_text": "Body CTA text (1 sentence)",
    "cta_button": "Button label e.g. 'Shop Now' or 'Order Today'"
  }
}`;

        let content = {};
        try {
            content = await callAgentText(
                'You are a senior product copywriter. Return ONLY valid JSON, no markdown.',
                contentPrompt, 0.65, 1500
            );
            if (typeof content === 'string') content = JSON.parse(content);
        } catch(e) {
            console.warn('Brochure content generation failed:', e.message);
            content = {
                front: { headline: productTitle, subheadline: bullets[0] || 'Premium quality, exceptional performance.', badge_text: null },
                back: {
                    intro: `${productTitle} delivers ${bullets[0] || 'premium performance'} with unmatched quality.`,
                    features: bullets.slice(0, 6).map(b => ({ title: b.split(' ').slice(0, 3).join(' '), desc: b })),
                    specs: [],
                    cta_headline: 'Experience the Difference',
                    cta_text: 'Get yours today and discover why thousands choose us.',
                    cta_button: 'Shop Now',
                }
            };
        }

        // Step 2: Generate front hero image + back lifestyle image in parallel
        const { laozhangImageGenerate, laozhangMultimodalImageGenerate } = await import('../agents/videoStudio/laozhangClient.js');
        const colorGuard = dominantColors.slice(0, 3).map(c => `${c.name} (${c.hex})`).join(', ');

        const frontPrompt = `PREMIUM PRODUCT BROCHURE — FRONT COVER HERO IMAGE

Product: ${productTitle} | Mood: ${moodDir.label}
Shoot directive: ${moodDir.shootDirective || 'Studio clean, premium, editorial'}
${colorGuard ? `Product colors (PRESERVE EXACTLY): ${colorGuard}` : ''}

Image requirements:
- This is the HERO image for a premium A4 brochure front cover
- Full bleed, no white borders
- Product as the clear visual hero — centered or slightly offset composition
- Professional studio lighting matching the mood direction
- Background: clean, premium, complementary to product colors
- Quality: editorial product photography, magazine-grade
- NO text, NO typography rendered in the image
- Aspect ratio: portrait A4 (roughly 3:4)`;

        const backPrompt = `PREMIUM PRODUCT BROCHURE — BACK PANEL LIFESTYLE IMAGE

Product: ${productTitle} | Mood: ${moodDir.label}
This is a supporting lifestyle/usage image for the brochure back panel.
- Show the product in a real-world usage context
- Environment matches the "${moodDir.label}" mood direction
${colorGuard ? `Product colors (PRESERVE EXACTLY): ${colorGuard}` : ''}
- Warm, aspirational, human-relatable scene
- Wide composition — the product is present but the scene tells a story
- NO text, NO typography rendered in the image`;

        const [frontResult, backResult] = await Promise.allSettled([
            refImages.length > 0
                ? laozhangMultimodalImageGenerate(frontPrompt, refImages, { model, size: '896x1120' })
                : laozhangImageGenerate(frontPrompt, { model, size: '896x1120' }),
            refImages.length > 0
                ? laozhangMultimodalImageGenerate(backPrompt, refImages, { model, size: '1344x768' })
                : laozhangImageGenerate(backPrompt, { model, size: '1344x768' }),
        ]);

        const frontImageUrl = frontResult.status === 'fulfilled' ? frontResult.value?.imageUrl : null;
        const backImageUrl = backResult.status === 'fulfilled' ? backResult.value?.imageUrl : null;

        // Step 3: Build the HTML brochure
        const featuresHtml = (content.back?.features || []).slice(0, 6).map(f => `
            <div class="feature-item">
                <div class="feature-dot" style="background:${accentColor}"></div>
                <div>
                    <div class="feature-title">${f.title || ''}</div>
                    <div class="feature-desc">${f.desc || ''}</div>
                </div>
            </div>`).join('');

        const specsHtml = (content.back?.specs || []).slice(0, 6).map(s => `
            <div class="spec-row">
                <span class="spec-label">${s.label || ''}</span>
                <span class="spec-value">${s.value || ''}</span>
            </div>`).join('');

        const brochureHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${productTitle} — Brochure</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;900&family=Playfair+Display:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-family: 'Inter', sans-serif; }
  body { width: 210mm; background: white; }
  @media print {
    body { width: 210mm; }
    .page { page-break-after: always; }
  }
  .page { width: 210mm; min-height: 297mm; position: relative; overflow: hidden; }

  /* ── FRONT PAGE ── */
  .front { background: #0a0a0a; color: white; display: flex; flex-direction: column; }
  .front-image { width: 100%; height: 200mm; object-fit: cover; display: block; }
  .front-content { flex: 1; padding: 12mm 14mm 14mm; display: flex; flex-direction: column; justify-content: flex-end; background: linear-gradient(to bottom, transparent, #0a0a0a 40%); margin-top: -40mm; position: relative; z-index: 2; }
  .front-badge { display: inline-block; background: ${accentColor}; color: white; font-size: 9pt; font-weight: 700; padding: 3px 10px; border-radius: 3px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8mm; }
  .front-headline { font-family: 'Playfair Display', serif; font-size: 28pt; font-weight: 700; line-height: 1.15; margin-bottom: 5mm; color: white; }
  .front-subheadline { font-size: 11pt; line-height: 1.6; color: rgba(255,255,255,0.7); font-weight: 300; max-width: 80%; }
  .front-product-name { margin-top: 8mm; padding-top: 6mm; border-top: 1px solid rgba(255,255,255,0.15); font-size: 9pt; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: ${accentColor}; }

  /* ── BACK PAGE ── */
  .back { background: white; display: grid; grid-template-columns: 1fr 1fr; }
  .back-left { padding: 14mm 10mm 14mm 14mm; display: flex; flex-direction: column; }
  .back-right { display: flex; flex-direction: column; }
  .back-image { width: 100%; height: 100%; object-fit: cover; }
  .back-logo { font-size: 9pt; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: ${primaryColor}; margin-bottom: 8mm; }
  .back-intro { font-size: 10.5pt; line-height: 1.7; color: #333; margin-bottom: 8mm; }
  .features-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 5mm; }
  .feature-item { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 5mm; }
  .feature-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 5px; }
  .feature-title { font-size: 9.5pt; font-weight: 700; color: #111; }
  .feature-desc { font-size: 8.5pt; color: #666; line-height: 1.5; margin-top: 1px; }
  .specs-section { margin-top: 6mm; padding-top: 6mm; border-top: 1px solid #eee; }
  .spec-row { display: flex; justify-content: space-between; font-size: 8.5pt; padding: 3px 0; border-bottom: 1px solid #f0f0f0; }
  .spec-label { color: #888; }
  .spec-value { font-weight: 600; color: #111; }
  .cta-section { margin-top: auto; padding: 6mm 8mm; background: ${primaryColor}; color: white; border-radius: 4px; }
  .cta-headline { font-family: 'Playfair Display', serif; font-size: 14pt; font-weight: 700; margin-bottom: 3mm; }
  .cta-text { font-size: 9pt; line-height: 1.5; opacity: 0.85; margin-bottom: 5mm; }
  .cta-button { display: inline-block; background: white; color: ${primaryColor}; padding: 4px 12px; border-radius: 2px; font-weight: 700; font-size: 9pt; letter-spacing: 0.05em; text-transform: uppercase; }
</style>
</head>
<body>

<!-- FRONT PAGE -->
<div class="page front">
  ${frontImageUrl ? `<img class="front-image" src="${frontImageUrl}" alt="${productTitle}" crossorigin="anonymous">` : `<div class="front-image" style="background:linear-gradient(135deg,${primaryColor},${accentColor})"></div>`}
  <div class="front-content">
    ${content.front?.badge_text ? `<span class="front-badge">${content.front.badge_text}</span>` : ''}
    <div class="front-headline">${content.front?.headline || productTitle}</div>
    <div class="front-subheadline">${content.front?.subheadline || ''}</div>
    <div class="front-product-name">${productTitle}</div>
  </div>
</div>

<!-- BACK PAGE -->
<div class="page back">
  <div class="back-left">
    <div class="back-logo">${productData?.brand || productTitle}</div>
    <div class="back-intro">${content.back?.intro || ''}</div>
    <div class="features-title">Key Features</div>
    ${featuresHtml}
    ${specsHtml ? `<div class="specs-section">${specsHtml}</div>` : ''}
    <div class="cta-section">
      <div class="cta-headline">${content.back?.cta_headline || 'Experience the Difference'}</div>
      <div class="cta-text">${content.back?.cta_text || ''}</div>
      <div class="cta-button">${content.back?.cta_button || 'Shop Now'}</div>
    </div>
  </div>
  <div class="back-right">
    ${backImageUrl ? `<img class="back-image" src="${backImageUrl}" alt="${productTitle} lifestyle" crossorigin="anonymous">` : `<div class="back-image" style="background:linear-gradient(135deg,${accentColor},${primaryColor})"></div>`}
  </div>
</div>

</body>
</html>`;

        // Step 4: Upload HTML to S3 for hosting
        const { uploadToS3 } = await import('../utils/s3.js');
        const slug = `brochure-${Date.now()}`;
        const s3Key = `brochures/${slug}.html`;
        const htmlBuffer = Buffer.from(brochureHtml, 'utf-8');
        let hostedUrl = null;
        try {
            const s3Url = await uploadToS3(htmlBuffer, s3Key, 'text/html');
            hostedUrl = s3Url;
        } catch(e) { console.warn('Brochure S3 upload failed:', e.message); }

        await deductCredits(req.user._id, BROCHURE_CREDITS, 'pulse-brochure');

        res.json({
            success: true,
            html: brochureHtml,
            hostedUrl,
            frontImageUrl,
            backImageUrl,
            content,
            productName: productTitle,
            creditsUsed: BROCHURE_CREDITS,
        });
    } catch (err) {
        console.error('❌ Brochure generate:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/design-context ─────────────────────
// Build the locked design directive from ProductDNA + selected mood + brand colors
// Free (pure computation, no LLM call)
router.post('/design-context', protect, async (req, res) => {
    try {
        const { productDNA, selectedMoodId, brandColors = [], customMoodDirections = null } = req.body;
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        const designContext = buildDesignContext(productDNA, selectedMoodId, brandColors, customMoodDirections);
        res.json({ success: true, designContext });
    } catch (err) {
        console.error('❌ PDI design-context:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/deck/generate ─────────────────────
router.post('/deck/generate', protect, async (req, res) => {
    try {
        const { brandId, brief, deckType, slideCount, urlContext, referenceImage, designContext, imageModel } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.deck) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.deck });

        const result = await generateCampaignDeck({
            brandId, brief,
            deckType: deckType || 'campaign',
            slideCount: parseInt(slideCount || 8),
            urlContext, referenceImage,
            designContext: designContext || null,   // PDI design context
            imageModel: imageModel || undefined,     // User-selected image model
        });

        if (!result.success) throw new Error('Deck generation failed');
        await deductCredits(req.user._id, CREDITS.deck, 'pulse-deck');

        // Store in history
        await PulseHistory.create({
            user: req.user._id,
            brand: brandId,
            tool: 'deck',
            brief,
            subType: deckType || 'campaign',
            hostedUrl: result.hostedUrl,
            slideCount: result.slideCount,
            deckPlan: result.deckPlan,
            thumbnailUrl: result.thumbnailUrl,
            creditsUsed: CREDITS.deck,
        });

        res.json({
            success: true,
            hostedUrl: result.hostedUrl,
            slideCount: result.slideCount,
            deckPlan: result.deckPlan,
            images: result.images || {},
            tokens: result.tokens || {},
            thumbnailUrl: result.thumbnailUrl,
            creditsUsed: CREDITS.deck,
        });
    } catch (err) {
        console.error('❌ Pulse Deck generate:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/deck/rephrase ─────────────────────
router.post('/deck/rephrase', protect, async (req, res) => {
    try {
        const { text, instruction } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'text required' });
        const { callAgentText } = await import('../agents/shared/agentUtils.js');
        const result = await callAgentText(
            `You are an expert copywriter. Rewrite the given text based on the instruction. Return ONLY the rewritten text, nothing else. No quotes, no explanation, no preamble.`,
            `TEXT: "${text}"\nINSTRUCTION: ${instruction || 'Make it more compelling, punchy, and professional.'}`,
            0.7, 500
        );
        res.json({ success: true, text: (result || '').trim().replace(/^["']|["']$/g, '') });
    } catch (err) {
        console.error('❌ Pulse Deck rephrase:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/deck/regenerate-image ─────────────
router.post('/deck/regenerate-image', protect, async (req, res) => {
    try {
        const { imagePrompt, slideType, referenceImage, imageModel } = req.body;
        if (!imagePrompt) return res.status(400).json({ success: false, error: 'imagePrompt required' });
        const { laozhangImageGenerate, laozhangMultimodalImageGenerate } = await import('../agents/videoStudio/laozhangClient.js');
        const model = imageModel || 'gemini-3.1-flash-image-preview';
        const size = (slideType === 'hero' || slideType === 'cta') ? '1792x1024' : '1024x768';
        const style = 'contemporary premium aesthetic, photorealistic, 8k, cinematic lighting. Do NOT render any text, words, or typography.';
        let imageUrl;
        if (referenceImage) {
            const r = await laozhangMultimodalImageGenerate(`${imagePrompt}. ${style}`, [referenceImage], { model, size });
            imageUrl = r?.imageUrl;
        } else {
            const r = await laozhangImageGenerate(`${imagePrompt}. ${style}`, { model, size });
            imageUrl = r?.imageUrl;
        }
        if (!imageUrl) throw new Error('Image generation returned empty');
        res.json({ success: true, imageUrl });
    } catch (err) {
        console.error('❌ Pulse Deck image regen:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/email/generate ────────────────────
router.post('/email/generate', protect, async (req, res) => {
    try {
        const { brandId, brief, emailType, urlContext, referenceImage, designContext, imageModel } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.email) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.email });

        const result = await generateEmail({ brandId, brief, emailType: emailType || 'campaign', urlContext, referenceImage, designContext: designContext || null, imageModel: imageModel || undefined });
        if (!result.success) throw new Error('Email generation failed');
        await deductCredits(req.user._id, CREDITS.email, 'pulse-mail');

        // Store in history
        await PulseHistory.create({
            user: req.user._id,
            brand: brandId,
            tool: 'email',
            brief,
            subType: emailType || 'campaign',
            emailHtml: result.html,
            emailPlainText: result.plainText,
            emailSubject: result.subject,
            emailName: result.emailName,
            emailHostedUrl: result.hostedUrl,
            thumbnailUrl: result.thumbnailUrl,
            creditsUsed: CREDITS.email,
        });

        res.json({
            success: true,
            html: result.html,
            plainText: result.plainText,
            subject: result.subject,
            previewText: result.previewText,
            emailName: result.emailName,
            hostedUrl: result.hostedUrl,
            thumbnailUrl: result.thumbnailUrl,
            creditsUsed: CREDITS.email,
        });
    } catch (err) {
        console.error('❌ Pulse Mail generate:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/email/export ──────────────────────
router.post('/email/export', protect, async (req, res) => {
    try {
        const { platform, html, plainText, subject, emailName, apiKey, serverPrefix } = req.body;
        if (!html) return res.status(400).json({ success: false, error: 'html required' });
        const result = await exportEmailToPlatform({
            platform: platform || 'download',
            templateName: emailName || `Pulse Mail ${Date.now()}`,
            htmlContent: html, plainText, subject, apiKey, serverPrefix,
        });
        res.json(result);
    } catch (err) {
        console.error('❌ Pulse Mail export:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/landing-page/generate ─────────────
router.post('/landing-page/generate', protect, async (req, res) => {
    try {
        const { brandId, brief, pageType, urlContext, referenceImage, designContext, imageModel } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.landing) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.landing });

        const result = await generateLandingPage({ brandId, brief, pageType, urlContext, referenceImage, designContext: designContext || null, imageModel: imageModel || undefined });
        if (!result.success) throw new Error('Page generation failed');
        await deductCredits(req.user._id, CREDITS.landing, 'pulse-page');

        // Store in history (don't save full HTML to DB — too large; save hosted URL)
        await PulseHistory.create({
            user: req.user._id,
            brand: brandId,
            tool: 'page',
            brief,
            subType: pageType || 'campaign',
            pageHostedUrl: result.hostedUrl,
            pageName: result.pageName,
            pageSlug: result.slug,
            pageMetaTitle: result.metaTitle,
            pageMetaDesc: result.metaDescription,
            pageEmbedCode: result.embedCode,
            pageSectionCount: result.sectionCount,
            pageAnimationStyle: result.animationStyle,
            pageStrategy: result.pageStrategy,
            thumbnailUrl: result.thumbnailUrl,
            creditsUsed: CREDITS.landing,
        });

        res.json({
            success: true,
            html: result.html,
            hostedUrl: result.hostedUrl,
            pageName: result.pageName,
            metaTitle: result.metaTitle,
            metaDescription: result.metaDescription,
            slug: result.slug,
            embedCode: result.embedCode,
            sectionCount: result.sectionCount,
            hasCharts: result.hasCharts,
            animationStyle: result.animationStyle,
            pageStrategy: result.pageStrategy,
            thumbnailUrl: result.thumbnailUrl,
            creditsUsed: CREDITS.landing,
        });
    } catch (err) {
        console.error('❌ Pulse Page generate:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/landing-page/publish ──────────────
router.post('/landing-page/publish', protect, async (req, res) => {
    try {
        const { platform, html, title, slug, shopDomain, shopToken, embedUrl, historyId } = req.body;
        if (!html && !embedUrl) return res.status(400).json({ success: false, error: 'html or embedUrl required' });

        if (platform === 'shopify') {
            const result = await publishToShopify({ title, html, slug, shopDomain, accessToken: shopToken });

            // Update history with publish record
            if (historyId && result.success) {
                await PulseHistory.findByIdAndUpdate(historyId, {
                    $push: { pagePublished: { platform: 'shopify', url: result.shopifyUrl } }
                });
            }

            return res.json(result);
        }

        if (platform === 'embed') {
            return res.json({ success: true, platform: 'embed', embedCode: generateEmbedCode(embedUrl) });
        }

        res.json({ success: true, platform: 'download', html });
    } catch (err) {
        console.error('❌ Pulse Page publish:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/brand-studio/history ────────────────────────────
router.get('/history', protect, async (req, res) => {
    try {
        const { tool, brandId, limit = 20, page = 1 } = req.query;
        const query = { user: req.user._id };
        if (tool) query.tool = tool;
        if (brandId) query.brand = brandId;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [items, total] = await Promise.all([
            PulseHistory.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('-emailHtml -pageHtml') // Don't send full HTML in list view
                .lean(),
            PulseHistory.countDocuments(query),
        ]);

        res.json({ success: true, items, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/brand-studio/history/:id ────────────────────────
router.get('/history/:id', protect, async (req, res) => {
    try {
        const item = await PulseHistory.findOne({ _id: req.params.id, user: req.user._id }).lean();
        if (!item) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /api/brand-studio/history/:id ─────────────────────
router.delete('/history/:id', protect, async (req, res) => {
    try {
        await PulseHistory.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── POST /api/brand-studio/aplus/analyze-product ─────────────────────────────
// Step 1: Analyze a product URL and return structured product data
// Enhanced: multi-platform scrapers + AI fallback + blocking S3 mirroring
// ══════════════════════════════════════════════════════════════════════════════

// ── User-Agent Configs ─────────────────────────────────────────────────────
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MOBILE_UA  = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const FETCH_HEADERS = (ua = DESKTOP_UA) => ({
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
});

// ── Helper: filter out garbage images ──────────────────────────────────────
function isProductImage(src) {
    if (!src || !src.startsWith('http')) return false;
    if (src.length < 10) return false;
    const lower = src.toLowerCase();

    // ── URL keyword blocklist ──────────────────────────────────────────────────
    // Non-product UI images — these words are unambiguous enough to match as substrings
    if (/(?:^|[\/_-])(icon|logo|favicon|spinner|loader|arrow|badge|star|rating|payment|trust|sprite|pixel|spacer|captcha|watermark|placeholder|thumbnail|avatar|profile|banner|header|footer|background)(?:[\/_.-]|$)/i.test(lower)) return false;
    // Additional branding/UI patterns
    if (/(?:^|[\/_-])(branding|newsletter|popup|overlay|ribbon|stamp|seal|shield|checkmark|check[-_]mark)(?:[\/_.-]|$)/i.test(lower)) return false;

    // ── Trust/Policy/Shipping image patterns (common in Indian D2C) ────────────
    if (/\b(free[-_]?ship|shipping|delivery|dispatch|return|replacement|warranty|guarantee|refund|exchange|certified|authentic|genuine|original|policy|secure|safety|safe[-_]?payment|cod|cash[-_]?on|billing|gst|tax|invoice|receipt|certificate|trademark|registered|iso|bis|fda|fssai|quality[-_]check)\b/i.test(lower)) return false;

    // ── Trust badge patterns from filenames (NOT brand domains) ──────────────
    if (/\b(trust[-_]?badge|fast[-_]?delivery|easy[-_]?return|24hr[-_]|48hr[-_]|72hr[-_]|hrs[-_]replacement|days[-_]return|assured[-_]|verified[-_]|razorpay|paytm|upi[-_]logo|visa[-_]logo|mastercard[-_]logo|rupay[-_]logo)\b/i.test(lower)) return false;

    // ── Size-based icon detection in URLs ────────────────────────────────────
    // Skip tiny icon dimensions (e.g. 32x32, 16x16, 64x64, 100x100)
    if (/[_-](\d{1,3})x\1[_.-]/i.test(lower)) return false;

    // ── Site-icon patterns (WordPress, Squarespace, Apple touch icons) ───────
    if (/site[-_]?icon|apple[-_]?touch|touch[-_]?icon|mstile|browserconfig|manifest/i.test(lower)) return false;

    // ── Skip SVG, GIF and data URIs ──────────────────────────────────────────
    if (/\.svg(\?|$)/i.test(lower)) return false;
    if (/data:image/i.test(lower)) return false;
    if (/\.gif(\?|$)/i.test(lower)) return false;

    return true;
}

// ── Amazon Scraper ─────────────────────────────────────────────────────────
function scrapeAmazon($, html) {
    // Image source 1: data-a-dynamic-image — extract all resolutions, pick highest
    const dynamicImages = [];
    $('img[data-a-dynamic-image]').each((_, el) => {
        try {
            const parsed = JSON.parse($(el).attr('data-a-dynamic-image') || '{}');
            Object.entries(parsed).forEach(([imgUrl, dims]) => {
                dynamicImages.push({ url: imgUrl, area: (dims[0] || 0) * (dims[1] || 0) });
            });
        } catch (_) {}
    });
    const sortedDynamic = dynamicImages
        .sort((a, b) => b.area - a.area)
        .map(i => i.url)
        .filter((u, i, arr) => arr.indexOf(u) === i);

    // Image source 2: colorImages JS variable (Amazon embeds full gallery JSON in script)
    const colorImagesUrls = [];
    try {
        const colorMatch = html.match(/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/m)
            || html.match(/"colorImages"\s*:\s*\{\s*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/m);
        if (colorMatch) {
            const imgArr = JSON.parse(colorMatch[1]);
            for (const item of imgArr) {
                const hiRes = item.hiRes || item.large || item.main?.['1500'] || '';
                if (hiRes && hiRes.startsWith('http')) colorImagesUrls.push(hiRes);
            }
            console.log(`   📸 Amazon colorImages: ${colorImagesUrls.length} hi-res images found`);
        }
    } catch (_) {}

    // Image source 3: alt image thumbnails → upscale to full-size
    const altImgUrls = $('#altImages img, #imageBlock img')
        .map((_, el) => {
            const src = $(el).attr('src') || '';
            return src.replace(/\._[A-Z0-9_,]+_\./g, '._SL1500_.');
        }).get()
        .filter(u => u && u.startsWith('http') && !u.includes('transparent') && !u.includes('grey-pixel'));

    // Image source 4: og:image fallback
    const ogImage = $('meta[property="og:image"]').attr('content');

    const allImages = [...new Set([...colorImagesUrls, ...sortedDynamic, ...altImgUrls, ...(ogImage ? [ogImage] : [])])]
        .filter(isProductImage)
        .slice(0, 8);

    return {
        title: $('#productTitle').text().trim() || $('h1').first().text().trim(),
        brand: $('#bylineInfo').text().trim().replace(/^Brand:|^Visit the |Store$/g, '').trim() || '',
        rating: $('#acrPopover').attr('title') || '',
        reviewCount: $('#acrCustomerReviewText').text().trim(),
        price: $('.a-price .a-offscreen').first().text().trim(),
        bulletPoints: $('#feature-bullets li span.a-list-item')
            .map((_, el) => $(el).text().trim())
            .get()
            .filter(t => t.length > 5 && !t.includes('Make sure'))
            .slice(0, 10),
        description: $('#productDescription p').text().trim().substring(0, 1000),
        category: $('#wayfinding-breadcrumbs_feature_div').text().replace(/\s+/g, ' ').trim().substring(0, 200),
        images: allImages,
        platform: 'amazon',
    };
}

// ── Flipkart Scraper ──────────────────────────────────────────────────────
function scrapeFlipkart($, html) {
    // Flipkart stores product data in JSON embedded in script tags
    let jsonLdProduct = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            if (data['@type'] === 'Product' || data?.['@graph']?.find(g => g['@type'] === 'Product')) {
                jsonLdProduct = data['@type'] === 'Product' ? data : data['@graph'].find(g => g['@type'] === 'Product');
            }
        } catch (_) {}
    });

    // Images: Flipkart uses _128.jpg suffix thumbnails — upscale to _832.jpg
    const imgUrls = [];
    $('img').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src.includes('rukminim') || src.includes('img1a.flixcart') || src.includes('img.fkcdn')) {
            src = src.replace(/\/(\d+)\/(\d+)\//g, '/832/832/');
            src = src.replace(/_\d+\./, '_832.');
            if (isProductImage(src) && !imgUrls.includes(src)) imgUrls.push(src);
        }
    });

    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && !imgUrls.includes(ogImage)) imgUrls.unshift(ogImage);

    // Extract JSON-LD images
    if (jsonLdProduct?.image) {
        const ldImages = [].concat(jsonLdProduct.image).map(i => typeof i === 'string' ? i : i?.url).filter(Boolean);
        for (const u of ldImages) { if (!imgUrls.includes(u)) imgUrls.push(u); }
    }

    // Title: Flipkart uses dynamic class names; try JSON-LD first, then h1, then og:title
    const title = jsonLdProduct?.name
        || $('h1 span').first().text().trim()
        || $('h1').first().text().trim()
        || $('meta[property="og:title"]').attr('content') || '';

    // Price
    const price = jsonLdProduct?.offers?.price
        || $('div[class*="_30jeq3"]').first().text().trim()
        || $('div[class*="CEmiEU"]').first().text().trim()
        || $('[class*="price"]').first().text().trim();

    // Features / bullet points
    const bullets = [];
    $('li[class*="_21Ahn-"], li[class*="column"], div[class*="_2418kt"] li, table[class*="_14cfVK"] tr').each((_, el) => {
        const txt = $(el).text().trim().replace(/\s+/g, ' ');
        if (txt.length > 8 && txt.length < 300 && bullets.length < 12) bullets.push(txt);
    });

    // Description
    const description = jsonLdProduct?.description
        || $('meta[name="description"]').attr('content')
        || $('div[class*="_1mXcCf"]').text().trim()
        || '';

    // Category from breadcrumbs
    const category = $('div[class*="_1MR4o5"] a, div[class*="_2whKao"] a').map((_, el) => $(el).text().trim()).get().join(' > ');

    console.log(`   📦 Flipkart scraper: "${title}" — ${imgUrls.length} images`);

    return {
        title,
        brand: jsonLdProduct?.brand?.name || '',
        rating: jsonLdProduct?.aggregateRating?.ratingValue || '',
        reviewCount: jsonLdProduct?.aggregateRating?.reviewCount || '',
        price: typeof price === 'number' ? `₹${price}` : (price || ''),
        bulletPoints: bullets,
        description: (description || '').substring(0, 1000),
        category,
        images: imgUrls.filter(isProductImage).slice(0, 8),
        platform: 'flipkart',
    };
}

// ── Myntra Scraper ────────────────────────────────────────────────────────
function scrapeMyntra($, html) {
    // Myntra embeds product data in window.__myx = { pdpData: ... }
    let pdpData = null;
    try {
        const pdpMatch = html.match(/window\.__myx\s*=\s*(\{[\s\S]*?\});\s*<\/script>/m)
            || html.match(/"pdpData"\s*:\s*(\{[\s\S]*?\})\s*[,}]/m);
        if (pdpMatch) {
            const parsed = JSON.parse(pdpMatch[1]);
            pdpData = parsed.pdpData || parsed;
        }
    } catch (_) {}

    // Fallback: JSON-LD
    let jsonLdProduct = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            if (data['@type'] === 'Product') jsonLdProduct = data;
        } catch (_) {}
    });

    const product = pdpData?.product || pdpData || {};

    // Images: Myntra uses h_($height), w_($width) in URLs
    const imgUrls = [];
    if (product.media?.albums?.default?.images) {
        for (const img of product.media.albums.default.images) {
            let src = img.imageURL || img.secureSrc || '';
            src = src.replace(/h_\d+,w_\d+/g, 'h_1080,w_1080');
            if (isProductImage(src)) imgUrls.push(src);
        }
    }
    // Fallback images from page
    if (!imgUrls.length) {
        $('img[class*="image-grid"], img[class*="pdp-image"]').each((_, el) => {
            let src = $(el).attr('src') || '';
            src = src.replace(/h_\d+,w_\d+/g, 'h_1080,w_1080');
            if (isProductImage(src) && !imgUrls.includes(src)) imgUrls.push(src);
        });
    }
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && !imgUrls.includes(ogImage)) imgUrls.unshift(ogImage);
    if (jsonLdProduct?.image) {
        const ldImgs = [].concat(jsonLdProduct.image).filter(Boolean);
        for (const u of ldImgs) { if (!imgUrls.includes(u)) imgUrls.push(u); }
    }

    const title = product.name || jsonLdProduct?.name || $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || '';
    const price = product.price?.discounted || product.mrp || jsonLdProduct?.offers?.price || $('[class*="price"]').first().text().trim();

    const bullets = [];
    // Myntra product descriptors
    if (product.descriptors) {
        for (const desc of product.descriptors) {
            if (desc.description && bullets.length < 8) bullets.push(desc.description);
        }
    }
    if (!bullets.length) {
        $('div[class*="index-tableContainer"] tr, div[class*="pdp-productDescriptors"] li').each((_, el) => {
            const txt = $(el).text().trim().replace(/\s+/g, ' ');
            if (txt.length > 5 && txt.length < 300 && bullets.length < 8) bullets.push(txt);
        });
    }

    console.log(`   👗 Myntra scraper: "${title}" — ${imgUrls.length} images`);

    return {
        title,
        brand: product.brand?.name || jsonLdProduct?.brand?.name || '',
        rating: product.ratings?.averageRating || '',
        reviewCount: product.ratings?.totalCount || '',
        price: typeof price === 'number' ? `₹${price}` : (price || ''),
        bulletPoints: bullets,
        description: (product.description || jsonLdProduct?.description || $('meta[name="description"]').attr('content') || '').substring(0, 1000),
        category: product.masterCategory?.typeName || '',
        images: imgUrls.filter(isProductImage).slice(0, 8),
        platform: 'myntra',
    };
}

// ── Nykaa Scraper ─────────────────────────────────────────────────────────
function scrapeNykaa($, html) {
    // Nykaa uses __PRELOADED_STATE__ or window.__INITIAL_STATE__
    let productState = null;
    try {
        const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/m)
            || html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/m);
        if (stateMatch) productState = JSON.parse(stateMatch[1]);
    } catch (_) {}

    // JSON-LD fallback
    let jsonLdProduct = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            if (data['@type'] === 'Product') jsonLdProduct = data;
        } catch (_) {}
    });

    // Try to find product in preloaded state
    const pp = productState?.productPage?.product || productState?.product || {};

    const imgUrls = [];
    if (pp.imageUrls?.length) {
        for (const u of pp.imageUrls) if (isProductImage(u)) imgUrls.push(u);
    }
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage && !imgUrls.includes(ogImage)) imgUrls.unshift(ogImage);
    if (jsonLdProduct?.image) {
        const ldImgs = [].concat(jsonLdProduct.image).filter(Boolean);
        for (const u of ldImgs) { if (!imgUrls.includes(u)) imgUrls.push(u); }
    }
    // Fallback: all nykaa CDN images
    if (!imgUrls.length) {
        $('img[src*="nykaa"]').each((_, el) => {
            const src = $(el).attr('src') || '';
            if (isProductImage(src) && !imgUrls.includes(src)) imgUrls.push(src);
        });
    }

    const nykaaTitle = pp.name || jsonLdProduct?.name || $('h1').first().text().trim() || '';
    const nykaaPrice = pp.offerPrice || pp.mrp || jsonLdProduct?.offers?.price || '';

    const nykaaBullets = [];
    if (pp.description) nykaaBullets.push(pp.description);
    $('div[class*="product-description"] li, div[class*="product-keyFeature"] div').each((_, el) => {
        const txt = $(el).text().trim().replace(/\s+/g, ' ');
        if (txt.length > 5 && txt.length < 300 && nykaaBullets.length < 8) nykaaBullets.push(txt);
    });

    console.log(`   💄 Nykaa scraper: "${nykaaTitle}" — ${imgUrls.length} images`);

    return {
        title: nykaaTitle,
        brand: pp.brandName || jsonLdProduct?.brand?.name || '',
        rating: pp.rating || '',
        reviewCount: pp.reviewCount || '',
        price: typeof nykaaPrice === 'number' ? `₹${nykaaPrice}` : (nykaaPrice || ''),
        bulletPoints: nykaaBullets,
        description: (pp.description || jsonLdProduct?.description || $('meta[name="description"]').attr('content') || '').substring(0, 1000),
        category: pp.categoryName || '',
        images: imgUrls.filter(isProductImage).slice(0, 8),
        platform: 'nykaa',
    };
}

// ── Generic / Shopify Scraper ─────────────────────────────────────────────
function scrapeGeneric($, url) {
    const jsonLd = $('script[type="application/ld+json"]').map((_, el) => {
        try { return JSON.parse($(el).html()); } catch (_) { return null; }
    }).get().filter(Boolean).find(d => d?.['@type'] === 'Product');

    // JSON-LD images are the highest-quality signal — explicit product images from site metadata
    const jsonLdImages = jsonLd?.image
        ? [].concat(jsonLd.image).map(i => typeof i === 'string' ? i : i?.url).filter(Boolean)
        : [];

    // ── Shopify-specific: only grab images from PRODUCT GALLERY elements ──────
    // Do NOT grab all 'img[src*="cdn.shopify"]' — that picks up trust badges, shipping icons etc.
    // Shopify 2.0 Dawn + common themes product gallery selectors:
    const shopifyGallerySelectors = [
        // Dawn / Spotlight / Refresh (Shopify 2.0)
        '.product__media img',
        '.product-single__media img',
        '.product-gallery__image img',
        '.product__media-item img',
        // Debut / Brooklyn / Minimal (legacy free themes)
        '.product-single__photo img',
        '.product__photo img',
        '.product-images img',
        // Empire / Prestige / Pipeline (premium themes)
        '.product-thumbnails img',
        '.product-slides img',
        '.gallery__image img',
        // Custom Shopify themes / acwo.com / Halo themes
        '.productView-thumbnail-link img',
        '.productView-thumbnail img',
        '.productView-image img',
        '.productView-img-container img',
        '.product-image-container img',
        '.product-gallery img',
        // Generic reliable product image containers
        '[data-product-media-type="image"] img',
        '[data-media-type="image"] img',
        '.product-image-main img',
        'figure.product__media img',
    ];

    const shopifyGalleryImages = [];
    for (const selector of shopifyGallerySelectors) {
        $(selector).each((_, el) => {
            const src = $(el).attr('data-src') || $(el).attr('data-zoom-image') ||
                        $(el).attr('data-large_image') || $(el).attr('src') || '';
            if (src) {
                // Upscale Shopify thumbnails to full resolution
                const fullRes = src
                    .replace(/_\d+x(\d+)?\./g, '_2048x2048.')
                    .replace(/\?width=\d+/, '?width=2048');
                shopifyGalleryImages.push(fullRes.startsWith('//') ? `https:${fullRes}` : fullRes);
            }
        });
        if (shopifyGalleryImages.length >= 4) break; // enough product images found
    }

    // ── If no gallery found, cautiously use CDN URLs but only from product-related alt text ──
    if (shopifyGalleryImages.length === 0) {
        $('img[src*="cdn.shopify"], img[data-src*="cdn.shopify"]').each((_, el) => {
            if (shopifyGalleryImages.length >= 8) return;
            const alt = ($(el).attr('alt') || '').toLowerCase();
            const src = $(el).attr('data-src') || $(el).attr('src') || '';
            // Only include if the alt text suggests it's a product image (not a badge/icon)
            const isTrustBadge = /ship|deliver|return|replace|warrant|free|secure|cod|gst|certif|badge|policy|payment|visa|rupay|upi|paytm/i.test(alt);
            const isTrustBadgeUrl = /ship|deliver|return|replace|warrant|badge|policy|gst|free[-_]|secure|cod[-_]|certif/i.test(src);
            if (!isTrustBadge && !isTrustBadgeUrl && isProductImage(src)) {
                const fullRes = src.replace(/_\d+x(\d+)?\./g, '_2048x2048.');
                shopifyGalleryImages.push(fullRes.startsWith('//') ? `https:${fullRes}` : fullRes);
            }
        });
    }

    // WooCommerce / generic product image containers
    const wcImages = $('img.wp-post-image, img.attachment-woocommerce_single, .product-image img, .product__image img, .product-hero img').map((_, el) => {
        return $(el).attr('data-src') || $(el).attr('data-large_image') || $(el).attr('src') || '';
    }).get().filter(Boolean);

    // og:image is LAST RESORT — often a brand logo/icon, not a product photo
    const ogImages = $('meta[property="og:image"]').map((_, el) => $(el).attr('content')).get().filter(Boolean);

    // Priority: JSON-LD > Shopify gallery > WooCommerce > og:image (only if nothing else)
    const structured = [...new Set([...jsonLdImages, ...shopifyGalleryImages, ...wcImages])].filter(isProductImage);
    const images = structured.length > 0 ? structured.slice(0, 8) : ogImages.filter(isProductImage).slice(0, 3);

    console.log(`   🌐 Generic scraper: "${(jsonLd?.name || $('h1').first().text().trim()).substring(0, 50)}" — jsonLd:${jsonLdImages.length} shopifyGallery:${shopifyGalleryImages.length} wc:${wcImages.length} og:${ogImages.length} → ${images.length} kept`);

    return {
        title: jsonLd?.name || $('h1').first().text().trim(),
        brand: jsonLd?.brand?.name || '',
        price: jsonLd?.offers?.[0]?.price || jsonLd?.offers?.price || $('[class*="price"]').first().text().trim(),
        description: (jsonLd?.description || $('meta[name="description"]').attr('content') || '').substring(0, 1000),
        bulletPoints: $('ul li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 10 && t.length < 300).slice(0, 8),
        images,
        category: $('[class*="breadcrumb"] a').map((_, el) => $(el).text().trim()).get().join(' > '),
        platform: url.includes('myshopify') || url.includes('/products/') ? 'shopify' : 'web',
    };
}

// ── AI-Powered Universal Fallback Scraper ─────────────────────────────────
// Uses Gemini to analyze the URL and extract product data when HTML fails
async function aiProductScraper(url, partialProduct = {}) {
    console.log(`   🤖 AI Fallback Scraper: Analyzing ${url} via Gemini...`);
    try {
        const result = await callAgent(
            `You are an expert product analyst. The user will give you a product URL.
Your task: analyze the URL and extract structured product information.
You MUST return ONLY valid JSON. No markdown fences, no explanation.

IMPORTANT: Focus on extracting the EXACT product shown at this URL. Do NOT fabricate data.
If you cannot determine a field, use an empty string.`,
            `Product URL: ${url}

Partial data already scraped (may be incomplete or empty):
Title: "${partialProduct.title || ''}"
Brand: "${partialProduct.brand || ''}"
Price: "${partialProduct.price || ''}"
Images found: ${partialProduct.images?.length || 0}

Analyze this product URL and extract:
{
  "title": "Exact product name as shown on the page",
  "brand": "Brand name",
  "price": "Price with currency symbol",
  "description": "Product description (max 500 chars)",
  "bulletPoints": ["key feature 1", "key feature 2", ...up to 6],
  "category": "Product category (e.g. 'Wireless Earbuds', 'Face Moisturiser')",
  "images": ["direct image URL 1", "direct image URL 2", ...up to 6 — these MUST be real URLs, not guesses]
}

CRITICAL: Only include image URLs you are CERTAIN exist. If unsure, return an empty images array.
For Amazon products, image URLs follow: https://m.media-amazon.com/images/I/<id>._SL1500_.jpg
For Flipkart, they follow: https://rukminim2.flixcart.com/image/<size>/<path>`,
            0.2, 1500,
            { provider: 'gemini', model: 'gemini-2.5-flash', timeoutMs: 25000 }
        );

        if (result?.title) {
            console.log(`   ✅ AI Scraper: "${result.title}" — ${result.images?.length || 0} images extracted`);
            return {
                ...result,
                images: (result.images || []).filter(isProductImage).slice(0, 8),
                platform: partialProduct.platform || 'ai_extracted',
                aiExtracted: true,
            };
        }
    } catch (err) {
        console.warn(`   ⚠️ AI Scraper failed: ${err.message}`);
    }
    return null;
}

// ── Determine if scrape result is valid ────────────────────────────────────
function isScrapeValid(product) {
    if (!product) return false;
    // Must have a title that doesn't look like an error page
    if (!product.title || product.title.length < 3) return false;
    if (/oops|something went wrong|access denied|captcha|page not found|robot|verify|blocked/i.test(product.title)) return false;
    return true;
}

// ── Main Route ────────────────────────────────────────────────────────────
router.post('/aplus/analyze-product', protect, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'url required' });

        console.log(`🔍 Product Scraper: Fetching ${url}`);

        // ── Step 1: Detect platform and fetch HTML ────────────────────────────
        let html = '';
        let $;
        let product = null;

        const platform = url.includes('amazon.') ? 'amazon'
            : url.includes('flipkart.com') ? 'flipkart'
            : url.includes('myntra.com') ? 'myntra'
            : (url.includes('nykaa.com') || url.includes('nykaaman.com') || url.includes('nykaafashion.com')) ? 'nykaa'
            : 'generic';

        console.log(`   🏷️  Platform detected: ${platform}`);

        // Fetch with desktop UA first
        try {
            const fetchRes = await fetch(url, { headers: FETCH_HEADERS(DESKTOP_UA), redirect: 'follow', timeout: 20000 });
            html = await fetchRes.text();
            $ = cheerio.load(html);
        } catch (fetchErr) {
            console.warn(`   ⚠️ Desktop fetch failed: ${fetchErr.message}`);
        }

        // ── Step 2: Run platform-specific scraper ─────────────────────────────
        if (html && $) {
            switch (platform) {
                case 'amazon':   product = scrapeAmazon($, html); break;
                case 'flipkart': product = scrapeFlipkart($, html); break;
                case 'myntra':   product = scrapeMyntra($, html); break;
                case 'nykaa':    product = scrapeNykaa($, html); break;
                default:         product = scrapeGeneric($, url); break;
            }
        }

        // ── Step 3: Retry with mobile UA if scrape looks empty ─────────────────
        if (!isScrapeValid(product) || (product && (!product.images?.length || !product.title))) {
            console.log(`   🔄 Retrying with mobile User-Agent...`);
            try {
                const mobileRes = await fetch(url, { headers: FETCH_HEADERS(MOBILE_UA), redirect: 'follow', timeout: 20000 });
                const mobileHtml = await mobileRes.text();
                const $m = cheerio.load(mobileHtml);

                let mobileProduct;
                switch (platform) {
                    case 'amazon':   mobileProduct = scrapeAmazon($m, mobileHtml); break;
                    case 'flipkart': mobileProduct = scrapeFlipkart($m, mobileHtml); break;
                    case 'myntra':   mobileProduct = scrapeMyntra($m, mobileHtml); break;
                    case 'nykaa':    mobileProduct = scrapeNykaa($m, mobileHtml); break;
                    default:         mobileProduct = scrapeGeneric($m, url); break;
                }

                // Use mobile result if it's better
                if (isScrapeValid(mobileProduct)) {
                    const mobileImages = mobileProduct.images?.length || 0;
                    const desktopImages = product?.images?.length || 0;
                    if (mobileImages > desktopImages || !isScrapeValid(product)) {
                        product = mobileProduct;
                        console.log(`   ✅ Mobile scrape succeeded: "${product.title}" — ${product.images?.length || 0} images`);
                    }
                }
            } catch (mobileErr) {
                console.warn(`   ⚠️ Mobile fetch also failed: ${mobileErr.message}`);
            }
        }

        // ── Step 4: AI Fallback — Gemini web-grounded analysis ────────────────
        if (!isScrapeValid(product) || (product && !product.images?.length)) {
            console.log(`   🤖 HTML scrape insufficient (title="${product?.title || ''}", images=${product?.images?.length || 0}) — invoking AI fallback...`);
            const aiResult = await aiProductScraper(url, product || {});
            if (aiResult && isScrapeValid(aiResult)) {
                // Merge: AI result fills gaps, HTML result keeps what it found
                if (product && isScrapeValid(product)) {
                    // Prefer HTML title if valid, AI images if more
                    product.title = product.title || aiResult.title;
                    product.brand = product.brand || aiResult.brand;
                    product.price = product.price || aiResult.price;
                    product.description = product.description || aiResult.description;
                    if (!product.bulletPoints?.length) product.bulletPoints = aiResult.bulletPoints || [];
                    if (!product.images?.length) product.images = aiResult.images || [];
                    if (!product.category) product.category = aiResult.category || '';
                    product.aiEnriched = true;
                } else {
                    product = aiResult;
                }
                console.log(`   ✅ AI fallback merged: "${product.title}" — ${product.images?.length || 0} images`);
            }
        }

        // Final fallback: if still nothing, return what we have
        if (!product) {
            product = { title: '', brand: '', images: [], bulletPoints: [], description: '', platform: 'failed' };
        }

        console.log(`✅ Scraped: "${product.title}" — ${product.images?.length || 0} images, ${product.bulletPoints?.length || 0} bullets [${product.platform}${product.aiExtracted ? ' +AI' : ''}${product.aiEnriched ? ' +AI-enriched' : ''}]`);
        if (product.images?.length) {
            console.log(`   First images: ${product.images.slice(0, 2).map(u => u.substring(0, 70)).join(' | ')}`);
        } else {
            console.warn(`   ⚠️  No images found — PDI will run text-only. URL may require login or bot protection.`);
        }

        // ── Step 5: Mirror top 4 product images to S3 (BLOCKING) ──────────────
        // Scraped URLs (Amazon CDN, etc.) can expire — S3 copies persist forever
        // BLOCKING: wait for persisted images so PDI always gets permanent URLs
        if (product.images?.length > 0) {
            const userId = req.user._id;
            try {
                const persistedImages = await Promise.all(
                    product.images.slice(0, 4).map(async (imgUrl, i) => {
                        try {
                            const s3Key = `product-library/${userId}/${Date.now()}-${i}-product.jpg`;
                            return await mirrorUrlToS3(imgUrl, s3Key) || imgUrl;
                        } catch (e) { return imgUrl; }
                    })
                );
                product.persistedImages = persistedImages;
                const s3Count = persistedImages.filter(u => u.includes('amazonaws')).length;
                console.log(`📦 Mirrored ${s3Count}/${persistedImages.length} images to S3`);
                // Replace original images with persisted S3 URLs where available
                product.images = product.images.map((origUrl, i) => {
                    if (i < persistedImages.length && persistedImages[i].includes('amazonaws')) {
                        return persistedImages[i];
                    }
                    return origUrl;
                });
            } catch (e) {
                console.warn('⚠️ S3 mirroring failed (non-critical):', e.message);
            }
        }

        res.json({ success: true, product });
    } catch (err) {
        console.error('❌ A+ analyze-product:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/aplus/generate ────────────────────
router.post('/aplus/generate', protect, async (req, res) => {
    try {
        const {
            brandId, productUrl, productData, referenceImages,
            brief, moduleCount = 7, designContext, productDNA,
            listingTier = 'standard',  // 'standard' | 'premium'
            imageModel,
        } = req.body;

        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });
        if (!brief && !productUrl && !productData) return res.status(400).json({ success: false, error: 'Provide a product URL, product data, or brief' });

        const isPremium = listingTier === 'premium';
        const creditCost = isPremium ? CREDITS.aplusPlus : CREDITS.aplus;
        console.log(`🔷 A+ Generate: listingTier=${listingTier}, isPremium=${isPremium}, creditCost=${creditCost}, modules=${moduleCount}`);

        // ── Credit balance pre-flight check ───────────────────────────────────────
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < creditCost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: creditCost });

        const result = await generateAplusListing({
            brandId, productUrl, productData, referenceImages, brief, moduleCount,
            listingTier,
            designContext: designContext || null,
            productDNA: productDNA || null,
            imageModel: imageModel || undefined,
        });

        // ── Deduct credits ──────────────────────────────────────────────────
        await deductCredits(req.user._id, creditCost, isPremium ? 'pulse-aplus-premium' : 'pulse-aplus');

        // Thumbnail = first module's hero image
        const firstImg = Object.values(result.images || {})[0] || null;

        // Save to history
        await PulseHistory.create({
            user: req.user._id,
            brand: brandId || null,
            tool: 'aplus',
            brief: brief || productData?.title || productUrl || 'A+ Listing',
            subType: result.aplusPlan?.productName || '',
            aplusModules: result.aplusPlan?.modules || [],
            aplusImages: result.images,
            aplusProductData: result.productData,
            aplusExportText: result.exportText,
            aplusModuleCount: result.moduleCount,
            aplusPlan: result.aplusPlan || null,
            aplusProductDNA: productDNA || null,        // PDI: extracted product DNA
            aplusDesignContext: designContext || null,  // PDI: locked design directive
            aplusTier: listingTier,
            thumbnailUrl: firstImg,
            creditsUsed: creditCost,
            status: 'completed'
        });

        res.json({
            success: true,
            aplusPlan: result.aplusPlan,
            images: result.images,
            exportText: result.exportText,
            productData: result.productData,
            visualIntelligence: result.visualIntelligence,
            moduleCount: result.moduleCount,
            listingTier: result.listingTier,
            isPremium: result.isPremium,
            elapsedSeconds: result.elapsedSeconds
        });
    } catch (err) {
        console.error('❌ A+ generate:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/aplus/rephrase ────────────────────
router.post('/aplus/rephrase', protect, async (req, res) => {
    try {
        const { text, instruction, context } = req.body;
        if (!text) return res.status(400).json({ success: false, error: 'text required' });
        const result = await callAgentText(
            `You are an expert Amazon copywriter. Follow Amazon A+ content rules: no pricing, no competitor mentions, no unverified superlatives. Return ONLY the rewritten text, nothing else.`,
            `TEXT: "${text}"\nINSTRUCTION: ${instruction || 'Make it more compelling, benefit-focused, and Amazon-compliant.'}${context ? `\nCONTEXT: ${context}` : ''}`,
            0.7, 400
        );
        res.json({ success: true, text: (result || '').trim().replace(/^["']|["']$/g, '') });
    } catch (err) {
        console.error('❌ A+ rephrase:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/aplus/regenerate-image ────────────
router.post('/aplus/regenerate-image', protect, async (req, res) => {
    try {
        const { imagePrompt, moduleType, productImages, brandColors } = req.body;
        if (!imagePrompt) return res.status(400).json({ success: false, error: 'imagePrompt required' });

        // Module type → Amazon pixel dimensions (at 2× for Retina)
        // Standard A+ (970px base) and Premium A++ (1464px base)
        const SIZES = {
            // Standard A+ modules
            hero_banner: '1940x1200', header_overlay: '1940x600', brand_story: '1940x1200',
            image_text_left: '600x600', image_text_right: '600x600',
            image_highlights: '600x600', three_features: '600x600',
            four_features: '440x440', comparison_chart: '300x600',
            // Premium A++ modules (1464px base, 2×)
            premium_hero: '2928x1200', premium_banner: '2928x600',
            premium_image_text: '1464x750', carousel: '2928x1200',
            hotspot: '2928x1200', video_module: '2928x1200',
            enhanced_comparison: '2928x600', premium_brand_story: '2928x1200',
        };
        const size = SIZES[moduleType] || '600x600';
        const colorHints = (brandColors || []).map(c => `${c.hex} (${c.name || c.usage})`).join(', ');
        const style = `Contemporary premium aesthetic, photorealistic, 8K. ${colorHints ? `Brand palette: ${colorHints}.` : ''} Do NOT include any text, words, letters, or numbers in the image.`;

        let result;
        if (productImages?.length) {
            result = await laozhangMultimodalImageGenerate(`${imagePrompt}. ${style}`, productImages.slice(0, 2), {
                model: 'gemini-3.1-flash-image-preview', size
            });
        } else {
            result = await laozhangImageGenerate(`${imagePrompt}. ${style}`, {
                model: 'gemini-3.1-flash-image-preview', size
            });
        }

        if (!result?.imageUrl) throw new Error('Image generation returned empty');
        res.json({ success: true, imageUrl: result.imageUrl });
    } catch (err) {
        console.error('❌ A+ regenerate-image:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══ POST /api/brand-studio/product-context ─ Save a Product Creative Context ───────────
// Saves the full PDI result (palette + mood boards + DNA) as a reusable design session.
// Called after user picks their mood and clicks "Save Context".
router.post('/product-context', protect, async (req, res) => {
    try {
        const {
            productName, productCategory, productBrand, productUrl,
            productImages, palette, productDNA, selectedMoodId,
            moodDirections, moodImages, designContext, tags, notes, brandId,
            autoSaved,
        } = req.body;

        if (!productName || !brandId) {
            return res.status(400).json({ success: false, error: 'productName and brandId required' });
        }

        // Use first mood board image as the thumbnail for gallery preview
        const thumbnail = moodImages?.[selectedMoodId] || Object.values(moodImages || {})[0] || '';

        // ── Deduplication: upsert by productUrl or productName within same brand + user ──
        const dedupeQuery = productUrl
            ? { brandId, userId: req.user._id, productUrl: productUrl.trim() }
            : { brandId, userId: req.user._id, productName: productName.trim() };

        const existing = await ProductContext.findOne(dedupeQuery);

        if (existing) {
            // Update existing entry with fresh scan data
            existing.productName     = productName.trim();
            existing.productCategory = productCategory || existing.productCategory;
            existing.productBrand    = productBrand || existing.productBrand;
            existing.productUrl      = productUrl || existing.productUrl;
            existing.productImages   = productImages?.length ? productImages : existing.productImages;
            existing.palette         = palette?.length ? palette : existing.palette;
            existing.productDNA      = productDNA || existing.productDNA;
            existing.selectedMoodId  = selectedMoodId || existing.selectedMoodId;
            if (moodDirections && Object.keys(moodDirections).length > 0) existing.moodDirections = moodDirections;
            if (moodImages && Object.keys(moodImages).length > 0) existing.moodImages = moodImages;
            if (designContext) existing.designContext = designContext;
            if (thumbnail) existing.thumbnail = thumbnail;
            if (autoSaved !== undefined) existing.autoSaved = autoSaved;
            await existing.save();
            console.log(`✅ [ProductContext] Updated existing: "${existing.productName}"`);
            return res.json({ success: true, context: existing, updated: true });
        }

        // Create new entry
        const ctx = await ProductContext.create({
            brandId,
            userId: req.user._id,
            productName: productName.trim(),
            productCategory: productCategory || '',
            productBrand:    productBrand || '',
            productUrl:      productUrl || '',
            productImages:   productImages || [],
            palette:         palette || [],
            productDNA:      productDNA || {},
            selectedMoodId:  selectedMoodId || '',
            moodDirections:  moodDirections || {},
            moodImages:      moodImages || {},
            designContext:   designContext || null,
            tags:            tags || [],
            thumbnail,
            notes:           notes || '',
            autoSaved:       autoSaved || false,
        });

        console.log(`✅ [ProductContext] Created new: "${ctx.productName}"`);
        res.json({ success: true, context: ctx });
    } catch (err) {
        console.error('❌ [ProductContext save]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══ GET /api/brand-studio/product-context ─ List all saved contexts for a brand ──────
router.get('/product-context', protect, async (req, res) => {
    try {
        const { brandId, search, limit = 50 } = req.query;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

        const query = { brandId };
        if (search) query.productName = { $regex: search, $options: 'i' };

        const contexts = await ProductContext
            .find(query)
            .sort({ updatedAt: -1 })
            .limit(parseInt(limit))
            // Only return fields needed for the gallery — not the full DNA blob
            .select('productName productCategory productBrand productUrl palette selectedMoodId thumbnail usedIn tags createdAt updatedAt');

        res.json({ success: true, contexts });
    } catch (err) {
        console.error('❌ [ProductContext list]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══ GET /api/brand-studio/product-context/:id ─ Get full context (to activate) ──────
router.get('/product-context/:id', protect, async (req, res) => {
    try {
        const ctx = await ProductContext.findById(req.params.id);
        if (!ctx) return res.status(404).json({ success: false, error: 'Context not found' });
        res.json({ success: true, context: ctx });
    } catch (err) {
        console.error('❌ [ProductContext get]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══ PATCH /api/brand-studio/product-context/:id/used-in ─ Mark a tool as having used it
router.patch('/product-context/:id/used-in', protect, async (req, res) => {
    try {
        const { tool } = req.body;
        const ctx = await ProductContext.findById(req.params.id);
        if (!ctx) return res.status(404).json({ success: false, error: 'Not found' });
        await ctx.markUsedIn(tool);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══ DELETE /api/brand-studio/product-context/:id ─ Delete a saved context ────────
router.delete('/product-context/:id', protect, async (req, res) => {
    try {
        await ProductContext.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ [ProductContext delete]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
