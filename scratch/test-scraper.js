import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

async function scrapeWithPuppeteer(siteUrl) {
    let browser;
    try {
        console.log(`[test] 🌐 Launching Puppeteer for: ${siteUrl}`);
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(siteUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const html = await page.content();
        await page.close();
        await browser.close();
        return html;
    } catch (err) {
        console.error('[test] ❌ Puppeteer failed:', err);
        if (browser) {
            await browser.close().catch(() => {});
        }
        throw err;
    }
}

async function test() {
    const urls = [
        'https://fellowproducts.com/products/stagg-ekg-electric-pour-over-kettle'
    ];

    for (const testUrl of urls) {
        console.log(`\n======================================================`);
        console.log(`Testing URL: ${testUrl}`);
        console.log(`======================================================`);
        
        console.log(`--- Forcing Puppeteer Fallback to test headless browser... ---`);
        const html = await scrapeWithPuppeteer(testUrl);

        const extractDetails = (rawHtml) => {
            const $ = cheerio.load(rawHtml);
            const title = $('meta[property="og:title"]').attr('content') || $('title').text();
            const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');
            let imageUrl = $('meta[property="og:image"]').attr('content') || $('meta[name="twitter:image"]').attr('content') || '';
            let allImages = [];

            $('img[src*="cdn.shopify"], .product__media img, .product-image img, .product-gallery img').each((_, el) => {
                const src = $(el).attr('src') || $(el).attr('data-src') || '';
                if (src && src.includes('cdn.shopify') && !src.includes('icon') && !src.includes('logo')) {
                    const cleanSrc = src.replace(/_\d+x\d*\./g, '.').split('?')[0];
                    const fullUrl = cleanSrc.startsWith('http') ? cleanSrc : `https:${cleanSrc}`;
                    if (!allImages.includes(fullUrl)) allImages.push(fullUrl);
                }
            });
            if (allImages.length > 0) imageUrl = allImages[0];

            if (!imageUrl) {
                const firstImg = $('img').first().attr('src');
                if (firstImg) {
                    imageUrl = firstImg.startsWith('http') ? firstImg : new URL(firstImg, testUrl).toString();
                }
            }

            if (allImages.length === 0 && imageUrl) allImages = [imageUrl];

            return { title, description, imageUrl, allImages };
        };

        const tryShopifyApi = async () => {
            try {
                const parsed = new URL(testUrl);
                const pathParts = parsed.pathname.split('/');
                const productsIdx = pathParts.indexOf('products');
                if (productsIdx !== -1 && pathParts[productsIdx + 1]) {
                    const handle = pathParts[productsIdx + 1].split('?')[0];
                    const shopifyJsonUrl = `${parsed.origin}/products/${handle}.json`;
                    console.log(`[test] Trying Shopify product API: ${shopifyJsonUrl}`);
                    const shopifyResp = await fetch(shopifyJsonUrl, {
                        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
                        timeout: 8000,
                    });
                    if (shopifyResp.ok) {
                        const shopifyData = await shopifyResp.json();
                        if (shopifyData?.product) {
                            const images = shopifyData.product.images?.map(img => img.src) || [];
                            console.log(`[test] ✅ Shopify API success: found ${images.length} images for "${shopifyData.product.title}"`);
                            return {
                                title: shopifyData.product.title,
                                description: shopifyData.product.body_html,
                                imageUrl: images[0] || '',
                                allImages: images
                            };
                        }
                    }
                }
            } catch (shopifyErr) {
                console.log(`[test] Shopify API skipped (${shopifyErr.message})`);
            }
            return null;
        };

        let details = null;
        if (html) {
            // Try Shopify API first
            details = await tryShopifyApi();
            if (!details) {
                details = extractDetails(html);
            }
        }

        if (!html || !details || (!details.imageUrl && details.allImages.length === 0)) {
            console.log('\n--- Fetch failed or yielded no images. Triggering Puppeteer Fallback... ---');
            html = await scrapeWithPuppeteer(testUrl);
            details = await tryShopifyApi();
            if (!details) {
                details = extractDetails(html);
            }
        }

        console.log('\n--- Scraped Results ---');
        console.log(`Title: ${details.title}`);
        console.log(`Description: ${details.description ? details.description.substring(0, 100) + '...' : 'None'}`);
        console.log(`Total Images found: ${details.allImages.length}`);
        if (details.allImages.length > 0) {
            console.log('Sample images:', details.allImages.slice(0, 3));
        }
    }
}

test().catch(console.error);
