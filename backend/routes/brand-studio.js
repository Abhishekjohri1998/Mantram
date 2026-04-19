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
import PulseHistory from '../models/PulseHistory.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const router = express.Router();

const CREDITS = { deck: 20, email: 12, landing: 18, aplus: 25 };

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

// ── POST /api/brand-studio/deck/generate ─────────────────────
router.post('/deck/generate', protect, async (req, res) => {
    try {
        const { brandId, brief, deckType, slideCount, urlContext, referenceImage } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.deck) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.deck });

        const result = await generateCampaignDeck({
            brandId, brief,
            deckType: deckType || 'campaign',
            slideCount: parseInt(slideCount || 8),
            urlContext, referenceImage
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
        const { brandId, brief, emailType, urlContext, referenceImage } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.email) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.email });

        const result = await generateEmail({ brandId, brief, emailType: emailType || 'campaign', urlContext, referenceImage });
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
        const { brandId, brief, pageType, urlContext, referenceImage } = req.body;
        if (!brandId || !brief)
            return res.status(400).json({ success: false, error: 'brandId and brief required' });

        const balance = (req.user.credits?.total || 0) + (req.user.credits?.bonus || 0);
        if (balance < CREDITS.landing) return res.status(402).json({ success: false, error: 'Insufficient credits', required: CREDITS.landing });

        const result = await generateLandingPage({ brandId, brief, pageType, urlContext, referenceImage });
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

        // Scrape the page
        const fetchRes = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 15000
        });
        const html = await fetchRes.text();
        const $ = cheerio.load(html);

        let product = {};
        if (url.includes('amazon.')) {
            product = {
                title: $('#productTitle').text().trim() || $('h1').first().text().trim(),
                rating: $('#acrPopover').attr('title') || '',
                reviewCount: $('#acrCustomerReviewText').text().trim(),
                price: $('.a-price .a-offscreen').first().text().trim(),
                bulletPoints: $('#feature-bullets li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 5).slice(0, 8),
                description: $('#productDescription p').text().trim().substring(0, 800),
                category: $('#wayfinding-breadcrumbs_feature_div').text().replace(/\s+/g, ' ').trim().substring(0, 200),
                images: $('img[data-a-dynamic-image]').map((_, el) => {
                    try { return Object.keys(JSON.parse($(el).attr('data-a-dynamic-image') || '{}'))[0]; } catch (_) { return null; }
                }).get().filter(Boolean).slice(0, 5),
                platform: 'amazon'
            };
        } else {
            const jsonLd = $('script[type="application/ld+json"]').map((_, el) => {
                try { return JSON.parse($(el).html()); } catch (_) { return null; }
            }).get().filter(Boolean).find(d => d?.['@type'] === 'Product');
            product = {
                title: jsonLd?.name || $('h1').first().text().trim(),
                price: jsonLd?.offers?.[0]?.price || $('[class*="price"]').first().text().trim(),
                description: (jsonLd?.description || $('meta[name="description"]').attr('content') || '').substring(0, 800),
                bulletPoints: $('ul li').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 10 && t.length < 200).slice(0, 6),
                images: (jsonLd?.image ? [].concat(jsonLd.image) : [$('meta[property="og:image"]').attr('content')]).filter(Boolean).slice(0, 5),
                category: $('[class*="breadcrumb"] a').map((_, el) => $(el).text().trim()).get().join(' > '),
                platform: url.includes('myshopify') || url.includes('/products/') ? 'shopify' : 'web'
            };
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
        const { brandId, productUrl, productData, referenceImages, brief, moduleCount = 7 } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });
        if (!brief && !productUrl && !productData) return res.status(400).json({ success: false, error: 'Provide a product URL, product data, or brief' });

        const result = await generateAplusListing({ brandId, productUrl, productData, referenceImages, brief, moduleCount });

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
            thumbnailUrl: firstImg,
            creditsUsed: CREDITS.aplus,
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

        // Module type → Amazon pixel dimensions (at 2x for Retina)
        const SIZES = {
            hero_banner: '1940x1200', header_overlay: '1940x600', brand_story: '1940x1200',
            image_text_left: '600x600', image_text_right: '600x600',
            image_highlights: '600x600', three_features: '600x600',
            four_features: '440x440', comparison_chart: '300x600'
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

export default router;
