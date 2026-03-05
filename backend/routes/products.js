/**
 * Products Routes
 * General product CRUD — works with manual entries, Shopify imports, and any source.
 * Includes AI enrichment and platform-specific content knowledge.
 */

import { Router } from 'express';
import * as cheerio from 'cheerio';
import { protect } from '../middleware/auth.js';
import Product from '../models/Product.js';
import Brand from '../models/Brand.js';
import { getOrchestrator } from '../agents/orchestrator.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC PRODUCT CONTENT KNOWLEDGE
// ═══════════════════════════════════════════════════════════════════════════════

const PLATFORM_KNOWLEDGE = {
    amazon: {
        name: 'Amazon',
        rules: `AMAZON PRODUCT LISTING RULES:
- TITLE: Max 200 characters. Format: Brand + Model + Key Feature + Size/Color + Product Type
- BULLET POINTS: Exactly 5 bullets, each max 500 characters. Start each with a CAPITAL KEY BENEFIT.
- DESCRIPTION: Rich HTML supported. 2000 chars max. Use <b>, <br>, <ul> tags.
- BACKEND KEYWORDS: Include 250 characters of search terms (comma-separated, no brand names, no ASINs).
- A+ CONTENT: Use comparison charts, lifestyle images, brand story modules.
- SEO: Front-load keywords in title. Use long-tail keywords naturally.
- COMPLIANCE: No promotional language ("best seller", "guaranteed"), no time-sensitive claims, no competitor mentions.
- CONVERSION: Focus on problem→solution, include dimensions/weight, mention warranty/returns.
- FORMAT: Write in third person. Be factual and specific.`,
    },
    flipkart: {
        name: 'Flipkart',
        rules: `FLIPKART PRODUCT LISTING RULES:
- TITLE: Max 140 characters. Format: Brand + Product Type + Key Feature + Size/Color
- KEY HIGHLIGHTS: 4-6 bullet points, concise (under 100 chars each). Focus on specs and differentiators.
- DESCRIPTION: 500-1000 words. Structured with headers. Include use cases and target audience.
- SEARCH KEYWORDS: Use Flipkart-specific categories. Include regional/vernacular terms.
- SPECIFICATIONS: Fill all applicable spec fields (material, dimensions, warranty, in-the-box).
- IMAGES: Recommend 6-8 images. White background for main, lifestyle for secondary.
- CONVERSION: Mention Flipkart-specific benefits (SuperCoin value, EMI options).
- FORMAT: Write for Indian audience. Use simple, clear language.`,
    },
    myntra: {
        name: 'Myntra',
        rules: `MYNTRA FASHION LISTING RULES:
- TITLE: Brand + Product Type + Key Detail (e.g., "Nike Men Air Max 97 Running Shoes - White")
- PRODUCT DETAILS: Structured fashion-specific fields:
  * Fabric/Material, Pattern, Fit Type, Neck Type, Sleeve Length
  * Closure Type, Sole Material, Toe Shape (for footwear)
- STYLE TIP: Write a 2-3 sentence style recommendation. Reference occasions and pairings.
- SIZE & FIT: Include model measurements and size worn. Mention fit feedback (runs small/large).
- CARE INSTRUCTIONS: Specific washing/storage instructions.
- OCCASIONS: Map to Myntra occasions (casual, formal, party, sports, ethnic, etc.)
- SUSTAINABILITY: Highlight eco-friendly materials or certifications if applicable.
- FORMAT: Fashion-forward language. Reference trends. Think editorial.`,
    },
    shopify: {
        name: 'Shopify',
        rules: `SHOPIFY PRODUCT PAGE RULES:
- TITLE: SEO-optimized, include primary keyword. Max 70 characters.
- DESCRIPTION: Rich HTML. Structure with <h3> headers, <ul> lists, <p> paragraphs.
- META DESCRIPTION: 155 characters max. Include call-to-action and primary keyword.
- SEO: Use clean URL handles. Alt text for all images. Schema markup friendly.
- COLLECTIONS: Write tags that map to logical collections (e.g., "summer", "bestseller", "under-500").
- CONVERSION: Include social proof language, scarcity cues, clear CTA.
- FORMAT: Brand voice first, SEO second. Write for humans who discover via Google.`,
    },
    meesho: {
        name: 'Meesho',
        rules: `MEESHO PRODUCT LISTING RULES:
- TITLE: Simple, keyword-rich. Max 100 characters. Include price-value angle.
- DESCRIPTION: Short, benefit-focused. Target resellers — highlight margin potential.
- IMAGES: Bright, clear. Show product from multiple angles. Include size chart.
- KEYWORDS: Use colloquial/vernacular terms. Think Tier 2-3 city search patterns.
- PRICING: Highlight value-for-money. Mention "lowest price" / "factory direct" messaging.
- FORMAT: Simple Hindi-English mix works well. Keep sentences short.`,
    },
    jiomart: {
        name: 'JioMart',
        rules: `JIOMART PRODUCT LISTING RULES:
- TITLE: Brand + Product + Quantity/Size. Max 120 characters.
- DESCRIPTION: Focus on daily-use benefits. Include nutritional info for food items.
- KEYWORDS: Include both English and Hindi search terms.
- FORMAT: Family-oriented language. Emphasize convenience and value.`,
    },
    general_ecommerce: {
        name: 'General E-commerce',
        rules: `GENERAL E-COMMERCE PRODUCT CONTENT RULES:
- HEADLINE: Benefit-driven, keyword-rich. Hook the reader immediately.
- BODY: Problem→Agitation→Solution framework. Lead with customer pain points.
- BULLETS: 5-7 key features written as benefits (not just specs). "What's in it for me?"
- SOCIAL PROOF: Weave in customer review themes, ratings, awards.
- CTA: Clear next step. Create urgency without being pushy.
- SEO: Primary keyword in title, first paragraph, and at least one subheading.
- MOBILE: Short paragraphs, scannable format. 60%+ of e-commerce is mobile.`,
    },
    website: {
        name: 'Website Product Page',
        rules: `WEBSITE PRODUCT PAGE RULES:
- HERO COPY: Emotional headline + supporting subheadline. Brand voice first.
- BENEFITS SECTION: 3-4 key benefits with icons/visuals in mind.
- DETAILED DESCRIPTION: Story-driven. Why this product exists, who it's for.
- SPECS TABLE: Clean, scannable technical specifications.
- FAQ: 3-5 common questions with concise answers.
- SEO: Meta title < 60 chars, meta description < 155 chars, H1 with primary keyword.
- FORMAT: Write for the brand's website visitors, not marketplace shoppers.`,
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/products/meta/platforms — List available e-commerce platforms
// MUST be before /:id route to prevent Express matching 'meta' as an :id
router.get('/meta/platforms', protect, async (req, res) => {
    const platforms = Object.entries(PLATFORM_KNOWLEDGE).map(([id, info]) => ({
        id,
        name: info.name,
    }));
    res.json({ success: true, platforms });
});

// POST /api/products/scan-website — Agentic product sync from brand website
router.post('/scan-website', protect, async (req, res) => {
    try {
        const { brandId, websiteUrl } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        let siteUrl = websiteUrl || brand.website || brand.dna?.website;
        if (!siteUrl) {
            return res.status(400).json({ success: false, error: 'No website URL found. Add one in Brand settings or provide websiteUrl.' });
        }
        if (!/^https?:\/\//i.test(siteUrl)) siteUrl = `https://${siteUrl}`;

        console.log(`🔍 Starting product scan for: ${siteUrl}`);

        // ── Step 0: Try Shopify public JSON API (works for all Shopify stores) ──
        let shopifyDetected = false;
        const rawProducts = [];
        try {
            const shopifyUrl = `${siteUrl.replace(/\/$/, '')}/products.json?limit=250`;
            console.log(`🛒 Checking for Shopify public API: ${shopifyUrl}`);
            const shopifyData = await fetchJSON(shopifyUrl);

            if (shopifyData?.products && Array.isArray(shopifyData.products) && shopifyData.products.length > 0) {
                shopifyDetected = true;
                console.log(`✅ Shopify detected! Found ${shopifyData.products.length} products`);

                // Process all pages
                let allShopifyProducts = [...shopifyData.products];
                let page = 2;
                // Paginate if there might be more
                while (shopifyData.products.length >= 250 && page <= 10) {
                    try {
                        const nextPageUrl = `${siteUrl.replace(/\/$/, '')}/products.json?limit=250&page=${page}`;
                        const nextData = await fetchJSON(nextPageUrl);
                        if (nextData?.products?.length > 0) {
                            allShopifyProducts.push(...nextData.products);
                            if (nextData.products.length < 250) break;
                            page++;
                        } else break;
                    } catch { break; }
                }

                console.log(`📦 Total Shopify products found: ${allShopifyProducts.length}`);

                for (const sp of allShopifyProducts) {
                    const mainImage = sp.images?.[0]?.src || '';
                    const allImages = (sp.images || []).map(img => ({
                        url: img.src,
                        alt: img.alt || sp.title,
                    }));

                    // Get the best price from variants
                    const variants = sp.variants || [];
                    const prices = variants.map(v => parseFloat(v.price)).filter(p => p > 0);
                    const mrps = variants.map(v => parseFloat(v.compare_at_price)).filter(p => p > 0);
                    const amount = prices.length > 0 ? Math.min(...prices) : 0;
                    const mrp = mrps.length > 0 ? Math.min(...mrps) : 0;

                    rawProducts.push({
                        title: sp.title,
                        description: sp.body_html ? sp.body_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '',
                        shortDescription: (sp.body_html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200),
                        category: sp.product_type || '',
                        subCategory: sp.vendor || '',
                        price: amount,
                        mrp: mrp,
                        features: [],
                        tags: Array.isArray(sp.tags) ? sp.tags : (typeof sp.tags === 'string' ? sp.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
                        imageUrl: mainImage,
                        imgAlt: sp.title,
                        allImages,
                        productUrl: `${siteUrl.replace(/\/$/, '')}/products/${sp.handle}`,
                        type: 'product',
                        shopifyId: String(sp.id),
                        variants: variants.map(v => ({
                            title: v.title,
                            price: parseFloat(v.price) || 0,
                            sku: v.sku || '',
                            available: v.available !== false,
                        })),
                    });
                }
            }
        } catch (shopifyErr) {
            // Not a Shopify store or API not available — continue with HTML scraping
            console.log(`ℹ️ Not a Shopify store (${shopifyErr.message}), trying HTML scraping...`);
        }

        // If Shopify detected and products found, skip to DB save (Step 6)
        if (!shopifyDetected) {
            // ── Step 1: Fetch and parse the main page ──────────────────────────
            const html = await fetchPageHTML(siteUrl);
            const $ = cheerio.load(html);
            const baseUrl = new URL(siteUrl).origin;

            // ── Step 2: Find product links on the page ─────────────────────────
            const productLinks = new Set();
            const productPatterns = /\/(product|item|shop|store|buy|p\/|dp\/|products\/|collections\/|catalog)/i;

            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (!href || href === '#' || href.startsWith('javascript:')) return;
                try {
                    const fullUrl = new URL(href, siteUrl).href;
                    // Only follow links on same domain
                    if (fullUrl.startsWith(baseUrl) && productPatterns.test(fullUrl)) {
                        productLinks.add(fullUrl);
                    }
                } catch { }
            });

            // Also check for common product listing pages
            const listingPaths = ['/products', '/shop', '/store', '/catalog', '/collections', '/all-products', '/our-products'];
            for (const path of listingPaths) {
                try {
                    const testUrl = `${baseUrl}${path}`;
                    const testHtml = await fetchPageHTML(testUrl).catch(() => null);
                    if (testHtml) {
                        const $test = cheerio.load(testHtml);
                        $test('a[href]').each((_, el) => {
                            const href = $test(el).attr('href');
                            if (!href || href === '#') return;
                            try {
                                const fullUrl = new URL(href, testUrl).href;
                                if (fullUrl.startsWith(baseUrl) && productPatterns.test(fullUrl)) {
                                    productLinks.add(fullUrl);
                                }
                            } catch { }
                        });
                    }
                } catch { }
            }

            console.log(`📦 Found ${productLinks.size} potential product links`);

            // ── Step 3: Extract products from the main page (grid/card detection) ──

            // Try to scrape product cards from current page
            const cardSelectors = [
                '.product-card', '.product-item', '.product', '.product-tile',
                '[data-product]', '.wc-block-grid__product', '.product_item',
                '.grid-item', '.collection-item', '.product-grid-item',
                '.shopify-product', '.product-list-item', '.item-card',
                'article.product', 'li.product', '.card.product',
            ];

            for (const selector of cardSelectors) {
                $(selector).each((_, el) => {
                    const card = $(el);
                    const title = card.find('h2, h3, h4, .product-title, .product-name, .title, .name, [class*="title"], [class*="name"]').first().text().trim();
                    if (!title || title.length < 2) return;

                    const imgEl = card.find('img').first();
                    const imgSrc = imgEl.attr('data-src') || imgEl.attr('src') || imgEl.attr('data-lazy-src') || '';
                    const imgAlt = imgEl.attr('alt') || title;
                    let imageUrl = '';
                    if (imgSrc) {
                        try { imageUrl = new URL(imgSrc, siteUrl).href; } catch { imageUrl = imgSrc; }
                    }

                    const priceText = card.find('.price, .product-price, [class*="price"], .amount, .woocommerce-Price-amount').first().text().trim();
                    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                    const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

                    const link = card.find('a[href]').first().attr('href') || '';
                    let productUrl = '';
                    if (link) {
                        try { productUrl = new URL(link, siteUrl).href; } catch { }
                    }

                    const desc = card.find('.description, .product-description, p, [class*="desc"]').first().text().trim();

                    rawProducts.push({ title, imageUrl, imgAlt, price, productUrl, description: desc });
                });
                if (rawProducts.length > 0) break; // Use first selector that works
            }

            // ── Step 4: If no cards found, crawl individual product pages ──────
            if (rawProducts.length === 0 && productLinks.size > 0) {
                const linksToScrape = [...productLinks].slice(0, 20); // Cap at 20 pages
                console.log(`📄 No product cards found, scraping ${linksToScrape.length} product pages...`);

                for (const link of linksToScrape) {
                    try {
                        const pageHtml = await fetchPageHTML(link);
                        const $p = cheerio.load(pageHtml);

                        const title = $p('h1').first().text().trim()
                            || $p('.product-title, .product_title, [class*="product-name"]').first().text().trim()
                            || $p('title').text().split('|')[0].split('–')[0].split('-')[0].trim();

                        if (!title || title.length < 2) continue;

                        const imgEl = $p('.product-image img, .woocommerce-product-gallery img, [class*="product"] img, .main-image img, article img').first()
                            || $p('img[src*="product"], img[src*="upload"]').first();
                        const imgSrc = imgEl?.attr('data-src') || imgEl?.attr('src') || imgEl?.attr('data-large_image') || '';
                        let imageUrl = '';
                        if (imgSrc) {
                            try { imageUrl = new URL(imgSrc, link).href; } catch { imageUrl = imgSrc; }
                        }

                        const priceText = $p('.price, .product-price, [class*="price"], .amount').first().text().trim();
                        const priceMatch = priceText.match(/[\d,]+\.?\d*/);
                        const price = priceMatch ? parseFloat(priceMatch[0].replace(/,/g, '')) : 0;

                        const desc = $p('.product-description, .description, [class*="description"], .woocommerce-product-details__short-description, .summary p').first().text().trim()
                            || $p('meta[name="description"]').attr('content') || '';

                        rawProducts.push({ title, imageUrl, imgAlt: title, price, productUrl: link, description: desc });
                    } catch (err) {
                        console.warn(`  ⚠️ Failed to scrape ${link}: ${err.message}`);
                    }
                }
            }

            // ── Step 5: If still nothing, use AI to extract from page text ─────
            if (rawProducts.length === 0) {
                console.log('🤖 No products found via scraping, trying AI extraction...');
                // Get all meaningful text from the page
                $('script, style, nav, footer, header').remove();
                const pageText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);

                // Get all images
                const images = [];
                $('img[src]').each((_, el) => {
                    const src = $(el).attr('src') || '';
                    const alt = $(el).attr('alt') || '';
                    if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('svg')) {
                        try { images.push({ url: new URL(src, siteUrl).href, alt }); } catch { }
                    }
                });

                const orchestrator = getOrchestrator();
                const aiResult = await orchestrator.generateContent({
                    brand,
                    user: req.user,
                    type: 'social',
                    prompt: `Analyze this ACTUAL website content and extract all products or services you can identify.

WEBSITE: ${siteUrl}
BRAND: ${brand.name}

PAGE TEXT CONTENT (scraped from the website):
${pageText}

IMAGES FOUND ON PAGE (${images.length} images):
${images.slice(0, 30).map((img, i) => `${i + 1}. URL: ${img.url} | Alt: ${img.alt}`).join('\n')}

Return ONLY a valid JSON array. For each product/service found:
[{ "title": "...", "description": "...", "shortDescription": "...", "category": "...", "price": { "amount": 0, "currency": "INR" }, "features": ["..."], "tags": ["..."], "images": [{ "url": "...", "alt": "..." }], "type": "product" }]

RULES:
- Only list items that are clearly products or services being sold/offered
- Use ACTUAL image URLs from the list above for matching products
- Use REAL prices from the text if available
- Return [] if no products/services found
- Return ONLY valid JSON, no explanations`,
                    platform: '',
                    options: {},
                });

                try {
                    const content = aiResult.content || '';
                    const jsonMatch = content.match(/\[[\s\S]*\]/);
                    if (jsonMatch) {
                        const aiProducts = JSON.parse(jsonMatch[0]);
                        for (const p of aiProducts) {
                            rawProducts.push({
                                title: p.title,
                                description: p.description || '',
                                imageUrl: p.images?.[0]?.url || '',
                                imgAlt: p.images?.[0]?.alt || p.title,
                                price: p.price?.amount || 0,
                                productUrl: siteUrl,
                                shortDescription: p.shortDescription || '',
                                category: p.category || '',
                                features: p.features || [],
                                tags: p.tags || [],
                                type: p.type || 'product',
                            });
                        }
                    }
                } catch (parseErr) {
                    console.warn('AI product extraction parse error:', parseErr.message);
                }
            }

            console.log(`✅ Extracted ${rawProducts.length} products total`);

            if (rawProducts.length === 0) {
                return res.json({
                    success: true,
                    message: 'Scan completed but no products found. The website may use dynamic JavaScript rendering. Try adding products manually.',
                    productsFound: 0,
                    productsCreated: 0,
                    productsSkipped: 0,
                    products: [],
                });
            }
        } // end if (!shopifyDetected)

        // ── Step 6: Dedupe and save to DB ──────────────────────────────────
        const created = [];
        const skipped = [];
        const seenTitles = new Set();

        for (const p of rawProducts) {
            if (!p.title || seenTitles.has(p.title.toLowerCase())) continue;
            seenTitles.add(p.title.toLowerCase());

            // Check for existing product with same title for this brand
            const existing = await Product.findOne({
                brand: brandId,
                title: p.title,
                status: { $ne: 'archived' },
            });
            if (existing) {
                skipped.push(p.title);
                continue;
            }

            const images = p.allImages && p.allImages.length > 0
                ? p.allImages
                : p.imageUrl ? [{ url: p.imageUrl, alt: p.imgAlt || p.title }] : [];

            const product = await Product.create({
                user: req.user._id,
                brand: brandId,
                type: p.type || 'product',
                title: p.title,
                description: p.description || '',
                shortDescription: p.shortDescription || '',
                category: p.category || '',
                subCategory: p.subCategory || '',
                price: p.price ? { amount: p.price, currency: 'INR' } : {},
                features: p.features || [],
                tags: p.tags || [],
                images,
                source: shopifyDetected ? 'shopify_public' : 'website_scan',
                sourceUrl: p.productUrl || siteUrl,
                aiEnriched: false,
            });
            created.push(product);
        }

        const sourceLabel = shopifyDetected ? 'Shopify' : 'website';
        console.log(`💾 Created ${created.length} products from ${sourceLabel}, skipped ${skipped.length} duplicates`);

        res.json({
            success: true,
            message: `${shopifyDetected ? '🛒 Shopify store detected! ' : ''}Found ${rawProducts.length} products. Created ${created.length}, skipped ${skipped.length} duplicates.`,
            productsFound: rawProducts.length,
            productsCreated: created.length,
            productsSkipped: skipped.length,
            products: created,
            source: shopifyDetected ? 'shopify' : 'website',
        });
    } catch (error) {
        console.error('Website scan error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper: Fetch a page's HTML with proper headers
async function fetchPageHTML(url) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error(`Timeout fetching ${url}`);
        throw err;
    }
}

// Helper: Fetch JSON (for Shopify/WooCommerce APIs — uses correct Accept header)
async function fetchJSON(url) {
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, */*;q=0.1',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeout);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') throw new Error(`Timeout fetching ${url}`);
        throw err;
    }
}

// POST /api/products/smart-match — AI agent finds relevant products for a context
router.post('/smart-match', protect, async (req, res) => {
    try {
        const { brandId, context, occasion, limit = 6 } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });
        if (!context && !occasion) return res.status(400).json({ success: false, error: 'context or occasion is required' });

        const searchQuery = context || occasion;

        // Step 1: Get all active products for the brand
        const allProducts = await Product.find({
            brand: brandId,
            status: { $ne: 'archived' },
        }).limit(200).lean();

        if (allProducts.length === 0) {
            return res.json({ success: true, products: [], message: 'No products in catalog. Sync from your website first.' });
        }

        // Step 2: Try text search first for quick initial filter
        let candidates = [];
        try {
            candidates = await Product.find({
                brand: brandId,
                status: { $ne: 'archived' },
                $text: { $search: searchQuery },
            }, { score: { $meta: 'textScore' } })
                .sort({ score: { $meta: 'textScore' } })
                .limit(30)
                .lean();
        } catch {
            // Text index might not exist yet — fall through to AI
        }

        // If text search didn't find enough, use all products
        if (candidates.length < 5) {
            candidates = allProducts;
        }

        // Step 3: Use AI to rank products by relevance
        const orchestrator = getOrchestrator();
        const productSummaries = candidates.slice(0, 50).map((p, i) => (
            `[${i}] "${p.title}" — ${p.shortDescription || p.description?.slice(0, 100) || 'No description'} | Category: ${p.category || 'N/A'} | Tags: ${(p.tags || []).join(', ')} | Gender: ${p.targetGender || 'all'} | Occasions: ${(p.occasions || []).join(', ') || 'none'} | Price: ₹${p.price?.amount || 0}`
        )).join('\n');

        const aiResult = await orchestrator.generateContent({
            brand: { name: 'Product Matcher' },
            user: req.user,
            type: 'social',
            prompt: `You are a product selection agent for marketing campaigns. Given the context, select the MOST RELEVANT products.

CONTEXT: "${searchQuery}"

PRODUCTS AVAILABLE:
${productSummaries}

Return ONLY a JSON array of the indices of the most relevant products, ranked by relevance (best first).
Maximum ${limit} products. Example: [3, 0, 7, 12]

RULES:
- Match based on: product category, target audience, occasion fit, seasonal relevance
- For "Women's Day" → pick products women would like or products suitable as gifts for women
- For "Diwali Sale" → pick gift-worthy, festive, or popular products
- For "Tech Review" → pick technology/gadget products
- Be creative but relevant — even generic products can match if positioned right
- Return ONLY the JSON array, no explanations`,
            platform: '',
            options: {},
        });

        // Parse AI response
        let selectedIndices = [];
        try {
            const content = aiResult.content || '';
            const jsonMatch = content.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
                selectedIndices = JSON.parse(jsonMatch[0]).filter(i => typeof i === 'number' && i >= 0 && i < candidates.length);
            }
        } catch { }

        // If AI failed, return top text-search matches
        if (selectedIndices.length === 0) {
            selectedIndices = candidates.slice(0, limit).map((_, i) => i);
        }

        const matched = selectedIndices.slice(0, limit).map(i => candidates[i]).filter(Boolean);

        res.json({
            success: true,
            products: matched,
            context: searchQuery,
            totalInCatalog: allProducts.length,
        });
    } catch (error) {
        console.error('Smart match error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/products/enrich — AI enriches products with smart tags, keywords, occasions
router.post('/enrich', protect, async (req, res) => {
    try {
        const { brandId, productIds } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        // Get products to enrich (either specific ones or all un-enriched)
        const query = { brand: brandId, status: { $ne: 'archived' } };
        if (productIds && productIds.length > 0) {
            query._id = { $in: productIds };
        } else {
            query.aiEnriched = { $ne: true };
        }

        const products = await Product.find(query).limit(50);
        if (products.length === 0) {
            return res.json({ success: true, enriched: 0, message: 'No products to enrich' });
        }

        // Respond immediately — enrichment runs in background
        res.json({
            success: true,
            message: `Enriching ${products.length} products in background...`,
            productsQueued: products.length,
        });

        // Background enrichment
        const orchestrator = getOrchestrator();
        for (const product of products) {
            try {
                const aiResult = await orchestrator.generateContent({
                    brand: { name: 'Product Enricher' },
                    user: req.user,
                    type: 'social',
                    prompt: `Analyze this product and generate smart tags for marketing intelligence.

PRODUCT: ${product.title}
DESCRIPTION: ${product.description?.slice(0, 500) || 'N/A'}
CATEGORY: ${product.category || 'N/A'}
TAGS: ${(product.tags || []).join(', ')}
PRICE: ₹${product.price?.amount || 0}

Return ONLY a JSON object:
{
  "keywords": ["keyword1", "keyword2", "keyword3", ...],
  "occasions": ["diwali", "christmas", "valentines-day", "womens-day", "new-year", "birthday", "gifting", "back-to-school", "summer-sale", "tech-sale", ...],
  "targetGender": "all" | "male" | "female" | "unisex",
  "ageGroup": "all" | "kids" | "teens" | "adults" | "seniors",
  "shortDescription": "One-line AI summary (max 120 chars)"
}

RULES:
- keywords: 5-10 search/marketing keywords
- occasions: Only include genuinely relevant occasions (choose from common marketing occasions)
- targetGender: Who is this product primarily for?
- ageGroup: Primary age demographic
- shortDescription: Catchy one-liner for quick display
- Return ONLY valid JSON, no markdown`,
                    platform: '',
                    options: {},
                });

                const content = aiResult.content || '';
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const enrichment = JSON.parse(jsonMatch[0]);
                    await Product.findByIdAndUpdate(product._id, {
                        keywords: enrichment.keywords || [],
                        occasions: enrichment.occasions || [],
                        targetGender: enrichment.targetGender || '',
                        ageGroup: enrichment.ageGroup || '',
                        shortDescription: enrichment.shortDescription || product.shortDescription,
                        aiEnriched: true,
                    });
                }
            } catch (err) {
                console.warn(`  ⚠️ Enrich failed for "${product.title}": ${err.message}`);
            }
        }
        console.log(`✅ AI enrichment complete for ${products.length} products`);
    } catch (error) {
        console.error('Enrich error:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// POST /api/products — Add product manually
router.post('/', protect, async (req, res) => {
    try {
        const { brandId, title, description, type, images, price, features, category, subCategory, tags, specifications, platformListings } = req.body;
        if (!brandId || !title) {
            return res.status(400).json({ success: false, error: 'brandId and title are required' });
        }

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const product = await Product.create({
            user: req.user._id,
            brand: brandId,
            type: type || 'product',
            title,
            description: description || '',
            images: images || [],
            price: price || {},
            features: features || [],
            category: category || '',
            subCategory: subCategory || '',
            tags: tags || [],
            specifications: specifications || {},
            platformListings: platformListings || [],
            source: 'manual',
        });

        res.json({ success: true, product });
    } catch (error) {
        console.error('Product create error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/products — List products (paginated)
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, search, category, type, page = 1, limit = 20 } = req.query;
        const filter = { user: req.user._id, status: { $ne: 'archived' } };
        if (brandId) filter.brand = brandId;
        if (category) filter.category = category;
        if (type) filter.type = type;

        let query;
        if (search) {
            query = Product.find({ ...filter, $text: { $search: search } });
        } else {
            query = Product.find(filter);
        }

        const products = await query
            .sort('-updatedAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .lean();

        const total = await Product.countDocuments(filter);
        const categories = await Product.distinct('category', { user: req.user._id, brand: brandId, status: { $ne: 'archived' } });

        res.json({
            success: true,
            products,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            categories: categories.filter(Boolean),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/products/:id — Single product
router.get('/:id', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/products/:id — Update product
router.put('/:id', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
        if (product.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        const updates = req.body;
        delete updates.user; // Prevent changing user
        delete updates.brand; // Prevent changing brand

        Object.assign(product, updates);
        await product.save();

        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/products/:id — Delete (soft archive)
router.delete('/:id', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
        if (product.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        product.status = 'archived';
        await product.save();

        res.json({ success: true, message: 'Product archived' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// AI ENRICHMENT (on-demand, single product)
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:id/ai-enrich', protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

        const brand = await Brand.findById(product.brand);

        const orchestrator = getOrchestrator();
        const enrichResult = await orchestrator.generateContent({
            brand,
            user: req.user,
            type: 'social',
            prompt: `Analyze this product and return ONLY a JSON object (no markdown, no code fences):
{
  "shortDescription": "A compelling 1-line product description under 100 characters",
  "features": ["feature1", "feature2", "feature3", "feature4", "feature5"],
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "category": "Best fitting category like Electronics, Fashion, Food, Beauty, Home, Sports, etc.",
  "subCategory": "Specific sub-category like Earphones, Snacks, Shirts, etc.",
  "occasions": ["occasion1", "occasion2"]
}

PRODUCT DETAILS:
Title: ${product.title}
Description: ${product.description}
Type: ${product.productType || product.type}
Tags: ${product.tags?.join(', ') || 'none'}
Brand: ${brand?.name || 'Unknown'}
Industry: ${brand?.dna?.industry || 'General'}`,
            platform: '',
            options: {},
        });

        // Parse AI response
        try {
            const content = enrichResult.content || '';
            // Extract JSON from response (handle markdown code fences)
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.shortDescription) product.shortDescription = parsed.shortDescription;
                if (parsed.features?.length) product.features = parsed.features;
                if (parsed.keywords?.length) product.keywords = parsed.keywords;
                if (parsed.category) product.category = parsed.category;
                if (parsed.subCategory) product.subCategory = parsed.subCategory;
                if (parsed.occasions?.length) product.occasions = parsed.occasions;
                product.aiEnriched = true;
                await product.save();
            }
        } catch (parseErr) {
            console.warn('AI enrich parse failed:', parseErr.message);
        }

        res.json({ success: true, product });
    } catch (error) {
        console.error('AI enrich error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC PRODUCT CONTENT GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/:id/generate-listing', protect, async (req, res) => {
    try {
        const { platform } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, error: 'Product not found' });

        const brand = await Brand.findById(product.brand);
        const platformInfo = PLATFORM_KNOWLEDGE[platform] || PLATFORM_KNOWLEDGE.general_ecommerce;

        const orchestrator = getOrchestrator();
        const result = await orchestrator.generateContent({
            brand,
            user: req.user,
            type: 'product_content',
            prompt: `Write a complete ${platformInfo.name} product listing for the following product.

${platformInfo.rules}

PRODUCT INFORMATION:
- Title: ${product.title}
- Description: ${product.description}
- Short Description: ${product.shortDescription || ''}
- Features: ${product.features?.join(', ') || 'Not specified'}
- Category: ${product.category || product.productType || ''}
- Price: ${product.price?.amount ? `₹${product.price.amount}` : 'Not specified'}
- Tags: ${product.tags?.join(', ') || ''}
- Specifications: ${JSON.stringify(product.specifications || {})}

BRAND CONTEXT:
- Brand: ${brand?.name || 'Unknown'}
- Industry: ${brand?.dna?.industry || 'General'}
- Voice: ${brand?.dna?.voice?.personality || 'Professional'}
- Target Audience: ${brand?.dna?.targetAudience || 'General'}

Generate a COMPLETE, READY-TO-USE listing following all the platform rules above.
Include ALL required sections for ${platformInfo.name}.
Write in the brand's voice while following platform conventions.`,
            platform: platform,
            options: {},
        });

        res.json({ success: true, content: result.content, platform: platformInfo.name, aiMeta: result.aiMeta });
    } catch (error) {
        console.error('Product listing generation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
