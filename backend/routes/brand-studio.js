import express from 'express';
import { protect } from '../middleware/auth.js';
import { deductCredits } from '../middleware/credits.js';
import { generateCampaignDeck } from '../agents/brandStudio/deckBuilder.js';
import { generateEmail } from '../agents/brandStudio/emailBuilder.js';
import { generateLandingPage, publishToShopify, generateEmbedCode } from '../agents/brandStudio/landingPageBuilder.js';
import { generateAplusListing } from '../agents/brandStudio/aplusBuilder.js';
import { exportEmailToPlatform } from '../utils/emailIntegrations.js';
import { callAgentText } from '../agents/shared/agentUtils.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../agents/videoStudio/laozhangClient.js';
import { analyzeProductDesign, generateMoodBoardImages, generateProductMoodDirections, buildDesignContext, generateQuickPost } from '../agents/shared/productDesignAgent.js';
import PulseHistory from '../models/PulseHistory.js';
import ProductContext from '../models/ProductContext.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

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
        const { productImages = [], productData = {}, brief = '', brandId } = req.body;

        if (!productImages.length && !productData?.title && !brief) {
            return res.status(400).json({ success: false, error: 'Provide productImages, productData, or brief' });
        }

        console.log(`🎨 PDI: Running product intelligence for "${productData?.title || 'untitled'}" — ${productImages.length} images`);
        const productDNA = await analyzeProductDesign(productImages, productData, brief);

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
//   Step 2 → NanoBanana generates background world image (canvas composites text)
// Cost: 8 credits
router.post('/quick-post', protect, async (req, res) => {
    try {
        const { productDNA, productData, selectedMoodId, productMoodDirections, postType, aspectRatio, brandId } = req.body;
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        const QUICK_POST_CREDITS = 8;
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < QUICK_POST_CREDITS) return res.status(402).json({ success: false, error: 'Insufficient credits', required: QUICK_POST_CREDITS });

        let brandContext = '';
        if (brandId) {
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const ctx = await loadBrandContext(brandId);
            brandContext = ctx.brandContext || '';
        }

        // Resolve selected mood direction object
        const moodMap = productMoodDirections || {};
        const selectedMoodDir = moodMap[selectedMoodId] || Object.values(moodMap)[0] || {
            label: 'Professional',
            description: 'Professional product photography',
            shootDirective: 'Studio quality, clean, well-lit',
            moodBoardDirective: 'Professional commercial photography with clean backdrop',
        };

        console.log(`🎯 [QuickPost] type=${postType} ratio=${aspectRatio} mood="${selectedMoodDir.label}" product="${productData?.title?.substring(0,40)}"`);

        const result = await generateQuickPost(
            productDNA,
            productData,
            selectedMoodDir,
            postType || 'promo',
            aspectRatio || '1:1',
            brandContext,
        );

        await req.user.deductCredits(QUICK_POST_CREDITS, 'quick_post');
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('❌ [QuickPost]:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/brand-studio/mood-board ─────────────────────────
// Generate 4 mood direction images using ProductDNA as creative anchor
// Cost: 5 credits (1 for mood generation + 4 for mood images)
router.post('/mood-board', protect, async (req, res) => {
    try {
        const { productDNA, productData, brandId } = req.body;
        if (!productDNA) return res.status(400).json({ success: false, error: 'productDNA required' });

        // Credit check (5 credits: 1 for custom mood generation + 4 for images)
        const MOOD_CREDITS = 5;
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < MOOD_CREDITS) return res.status(402).json({ success: false, error: 'Insufficient credits', required: MOOD_CREDITS });

        let brandContext = '';
        if (brandId) {
            const { loadBrandContext } = await import('../agents/shared/agentUtils.js');
            const ctx = await loadBrandContext(brandId);
            brandContext = ctx.brandContext || '';
        }

        // Step 1: Generate product-specific mood directions via Claude
        // This replaces the hardcoded 4 generic moods with AI-curated creative territories
        const customMoodDirections = await generateProductMoodDirections(productDNA, productData || {}, brandContext);

        // Step 2: Generate mood board images using the custom directions
        const result = await generateMoodBoardImages(productDNA, brandContext, customMoodDirections);
        await deductCredits(req.user._id, MOOD_CREDITS, 'pulse-mood-board');

        res.json({
            success: true,
            moods: result.moods,
            moodDirections: customMoodDirections,  // ← send to frontend to replace MOOD_STATIC
        });
    } catch (err) {
        console.error('❌ PDI mood-board:', err.message);
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
        const { brandId, brief, deckType, slideCount, urlContext, referenceImage, designContext } = req.body;
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
        const { imagePrompt, slideType, referenceImage } = req.body;
        if (!imagePrompt) return res.status(400).json({ success: false, error: 'imagePrompt required' });
        const { laozhangImageGenerate, laozhangMultimodalImageGenerate } = await import('../agents/videoStudio/laozhangClient.js');
        const model = 'gemini-3.1-flash-image-preview';
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
        const { brandId, brief, emailType, urlContext, referenceImage, designContext } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.email) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.email });

        const result = await generateEmail({ brandId, brief, emailType: emailType || 'campaign', urlContext, referenceImage, designContext: designContext || null });
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
        const { brandId, brief, pageType, urlContext, referenceImage, designContext } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.landing) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.landing });

        const result = await generateLandingPage({ brandId, brief, pageType, urlContext, referenceImage, designContext: designContext || null });
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

// ── POST /api/brand-studio/aplus/analyze-product ─────────────
// Step 1: Analyze a product URL and return structured product data
router.post('/aplus/analyze-product', protect, async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'url required' });

        console.log(`\ud83d\udd0d A+ Scraper: Fetching ${url}`);

        const fetchRes = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 20000
        });
        const html = await fetchRes.text();
        const $ = cheerio.load(html);

        let product = {};

        if (url.includes('amazon.')) {
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

            // Image source 2: alt image thumbnails → upscale to full-size
            const altImgUrls = $('#altImages img, #imageBlock img')
                .map((_, el) => {
                    const src = $(el).attr('src') || '';
                    return src.replace(/\._[A-Z0-9_,]+_\./g, '._SL1500_.');
                }).get()
                .filter(u => u && u.startsWith('http') && !u.includes('transparent') && !u.includes('grey-pixel'));

            // Image source 3: og:image fallback
            const ogImage = $('meta[property="og:image"]').attr('content');

            const allImages = [...new Set([...sortedDynamic, ...altImgUrls, ...(ogImage ? [ogImage] : [])])]
                .filter(u => u && u.startsWith('http'))
                .slice(0, 8);

            product = {
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
                platform: 'amazon'
            };

        } else {
            // Generic / Shopify scraper
            const jsonLd = $('script[type="application/ld+json"]').map((_, el) => {
                try { return JSON.parse($(el).html()); } catch (_) { return null; }
            }).get().filter(Boolean).find(d => d?.['@type'] === 'Product');

            const jsonLdImages = jsonLd?.image ? [].concat(jsonLd.image).map(i => typeof i === 'string' ? i : i?.url).filter(Boolean) : [];
            const ogImages = $('meta[property="og:image"]').map((_, el) => $(el).attr('content')).get().filter(Boolean);
            const shopifyImages = $('img[src*="cdn.shopify"]').map((_, el) => {
                return ($(el).attr('src') || '').replace(/_\d+x(\d+)?\./, '_2048x2048.');
            }).get().filter(Boolean);

            product = {
                title: jsonLd?.name || $('h1').first().text().trim(),
                brand: jsonLd?.brand?.name || '',
                price: jsonLd?.offers?.[0]?.price || $('[class*="price"]').first().text().trim(),
                description: (jsonLd?.description || $('meta[name="description"]').attr('content') || '').substring(0, 1000),
                bulletPoints: $('ul li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 10 && t.length < 300).slice(0, 8),
                images: [...new Set([...jsonLdImages, ...ogImages, ...shopifyImages])].slice(0, 8),
                category: $('[class*="breadcrumb"] a').map((_, el) => $(el).text().trim()).get().join(' > '),
                platform: url.includes('myshopify') || url.includes('/products/') ? 'shopify' : 'web'
            };
        }

        console.log(`\u2705 Scraped: "${product.title}" \u2014 ${product.images?.length || 0} images, ${product.bulletPoints?.length || 0} bullets`);
        if (product.images?.length) {
            console.log(`   First images: ${product.images.slice(0, 2).map(u => u.substring(0, 70)).join(' | ')}`);
        } else {
            console.warn(`   \u26a0\ufe0f  No images found \u2014 PDI will run text-only. URL may require login or bot protection.`);
        }

        res.json({ success: true, product });
    } catch (err) {
        console.error('\u274c A+ analyze-product:', err.message);
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
        } = req.body;

        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });
        if (!brief && !productUrl && !productData) return res.status(400).json({ success: false, error: 'Provide a product URL, product data, or brief' });

        const isPremium = listingTier === 'premium';
        const creditCost = isPremium ? CREDITS.aplusPlus : CREDITS.aplus;

        // ── Credit balance pre-flight check ───────────────────────────────────────
        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < creditCost) return res.status(402).json({ success: false, error: 'Insufficient credits', required: creditCost });

        const result = await generateAplusListing({
            brandId, productUrl, productData, referenceImages, brief, moduleCount,
            listingTier,
            designContext: designContext || null,
            productDNA: productDNA || null,
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
        } = req.body;

        if (!productName || !brandId) {
            return res.status(400).json({ success: false, error: 'productName and brandId required' });
        }

        // Use first mood board image as the thumbnail for gallery preview
        const thumbnail = moodImages?.[selectedMoodId] || Object.values(moodImages || {})[0] || '';

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
        });

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
