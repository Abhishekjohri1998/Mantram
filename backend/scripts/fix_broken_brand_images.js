/**
 * fix_broken_brand_images.js
 * ──────────────────────────
 * Fixes all broken brand images (logo + brandImages) by re-scraping
 * from the original brand websites.
 *
 * The old S3 bucket (mantram-assets) was suspended. This script:
 *   1. Finds brands with broken S3 URLs
 *   2. Re-fetches their website HTML
 *   3. Re-extracts logos and images using the same logic as brandScanner
 *   4. Updates the DB with fresh website URLs (direct links, no S3 copy)
 *
 * Usage:
 *   node backend/scripts/fix_broken_brand_images.js
 *   node backend/scripts/fix_broken_brand_images.js --dry-run   (preview only)
 */

import mongoose from 'mongoose';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) { console.error('❌ MONGODB_URI not set'); process.exit(1); }

// ── Broken URL detection ──
const BROKEN_PATTERNS = [
    'mantram-assets.s3',
    's3.ap-south-1.amazonaws.com/mantram-assets',
];
function isBroken(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return BROKEN_PATTERNS.some(p => lower.includes(p));
}

// ── URL Resolver (same as brandScanner) ──
function resolveUrl(src, baseUrl) {
    if (!src || src.startsWith('data:')) return null;
    try {
        src = src.replace(/\{width\}/g, '600');
        if (src.startsWith('//')) src = 'https:' + src;
        if (src.startsWith('http')) return src;
        return new URL(src, baseUrl).href;
    } catch { return null; }
}

// ── Fetch page HTML ──
async function fetchPage(url) {
    try {
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
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
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        console.warn(`    ⚠️ Failed to fetch ${url}: ${error.message}`);
        return null;
    }
}

// ── Extract logo URL (simplified from brandScanner) ──
function extractLogo($, baseUrl) {
    const candidates = [];

    // Priority 1: Logo selectors
    const logoSelectors = [
        'img[class*="logo"]', 'img[id*="logo"]',
        'img[class*="Logo"]', 'img[id*="Logo"]',
        'img[alt*="logo"]', 'img[alt*="Logo"]',
        '.logo img', '#logo img',
        '.site-logo img', '.navbar-brand img', '.brand-logo img',
        '[class*="logo"] img', '[id*="logo"] img',
        'a[class*="logo"] img', 'a[id*="logo"] img',
    ];

    for (const sel of logoSelectors) {
        $(sel).each((_, el) => {
            // Skip client/partner logos
            const parentHtml = $(el).parents().map((_, p) => {
                const cls = ($(p).attr('class') || '').toLowerCase();
                const id = ($(p).attr('id') || '').toLowerCase();
                return cls + ' ' + id;
            }).get().join(' ');
            if (/\b(client|partner|trusted|customer|testimonial|sponsor)\b/.test(parentHtml)) return;

            const src = resolveUrl($(el).attr('src'), baseUrl);
            if (src && !src.startsWith('data:')) {
                candidates.push({ url: src, priority: 1 });
            }
        });
    }

    // Priority 2: Header first img
    $('header img').each((i, el) => {
        if (i > 2) return;
        const src = resolveUrl($(el).attr('src'), baseUrl);
        if (src && !src.startsWith('data:')) {
            candidates.push({ url: src, priority: 3 });
        }
    });

    // Priority 3: Nav first img
    $('nav img').each((i, el) => {
        if (i > 1) return;
        const src = resolveUrl($(el).attr('src'), baseUrl);
        if (src && !src.startsWith('data:')) {
            candidates.push({ url: src, priority: 4 });
        }
    });

    // Priority 4: Apple touch icon
    const touchIcon = $('link[rel="apple-touch-icon"]').attr('href')
        || $('link[rel="apple-touch-icon-precomposed"]').attr('href');
    if (touchIcon) {
        const r = resolveUrl(touchIcon, baseUrl);
        if (r) candidates.push({ url: r, priority: 2 });
    }

    // Priority 5: OG Image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
        const r = resolveUrl(ogImage, baseUrl);
        if (r) candidates.push({ url: r, priority: 5 });
    }

    // Priority 6: Favicon
    $('link[rel="icon"], link[rel="shortcut icon"]').each((_, el) => {
        const href = $(el).attr('href');
        const sizes = $(el).attr('sizes') || '';
        const r = resolveUrl(href, baseUrl);
        if (r) {
            const p = sizes.includes('192') || sizes.includes('180') ? 3 : 6;
            candidates.push({ url: r, priority: p });
        }
    });

    // De-dup and sort by priority
    const seen = new Set();
    const unique = [];
    for (const c of candidates.sort((a, b) => a.priority - b.priority)) {
        if (!seen.has(c.url)) { seen.add(c.url); unique.push(c); }
    }

    return unique[0]?.url || null;
}

// ── Extract all page images (simplified from brandScanner) ──
function extractAllImages($, baseUrl) {
    const images = [];
    const seen = new Set();

    const skipPatterns = [
        /1x1/, /pixel/, /tracking/, /spacer/, /blank/,
        /\.gif$/i, /\.svg/i, /gravatar/i, /googleusercontent/i,
        /facebook\.com\/tr/, /analytics/, /beacon/,
        /icon/i, /badge/i, /logo.*small/i,
    ];

    function addImage(url, alt, source) {
        if (!url || url.startsWith('data:')) return;
        const resolved = resolveUrl(url, baseUrl);
        if (!resolved || seen.has(resolved)) return;
        if (skipPatterns.some(p => p.test(resolved))) return;
        seen.add(resolved);
        images.push({ url: resolved, alt: (alt || '').slice(0, 200), source: source || 'website' });
    }

    // All <img> tags
    $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('data-lazy-src') || '';
        const srcset = $(el).attr('srcset') || $(el).attr('data-srcset') || '';
        const alt = $(el).attr('alt') || '';
        const width = parseInt($(el).attr('width') || '0');
        const height = parseInt($(el).attr('height') || '0');

        if ((width > 0 && width < 40) || (height > 0 && height < 40)) return;

        let bestSrc = src;
        if (srcset) {
            const parts = srcset.split(',').map(s => s.trim());
            let maxW = 0;
            for (const part of parts) {
                const [url, desc] = part.split(/\s+/);
                const w = parseInt(desc) || 0;
                if (w > maxW && url) { maxW = w; bestSrc = url; }
            }
        }

        addImage(bestSrc, alt, 'page');
    });

    // <picture> <source> elements
    $('picture source, source[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset') || '';
        if (!srcset) return;
        const parts = srcset.split(',').map(s => s.trim());
        let bestUrl = '';
        let maxW = 0;
        for (const part of parts) {
            const [url, desc] = part.split(/\s+/);
            const w = parseInt(desc) || 0;
            if (w > maxW && url) { maxW = w; bestUrl = url; }
            else if (!bestUrl && url) bestUrl = url;
        }
        if (bestUrl) addImage(bestUrl, '', 'hero');
    });

    // CSS background images
    $('[style*="background"]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const bgMatch = style.match(/background(?:-image)?:\s*url\(['"]?([^'")]+)/i);
        if (bgMatch) addImage(bgMatch[1], '', 'background');
    });

    return images.slice(0, 30);
}

// ── MAIN ──
async function main() {
    console.log(`🔧 Fix Broken Brand Images${DRY_RUN ? ' (DRY RUN)' : ''}`);
    console.log('═══════════════════════════════════════════════════\n');

    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected\n');

    const Brand = mongoose.model('Brand', new mongoose.Schema({}, { strict: false, collection: 'brands' }));
    const brands = await Brand.find({}).lean();
    console.log(`📊 Total brands: ${brands.length}\n`);

    let fixedLogos = 0, fixedImages = 0, skippedNoWebsite = 0, skippedOk = 0, failedFetch = 0;
    let clearedLogos = 0, clearedImages = 0;

    for (const brand of brands) {
        const name = brand.name || '(unnamed)';
        const website = brand.website || '';
        const logoUrl = brand.dna?.logo?.url || '';
        const brandImgs = brand.dna?.brandImages || [];

        const hasBrokenLogo = isBroken(logoUrl);
        const brokenImgCount = brandImgs.filter(img => isBroken(img.url)).length;

        if (!hasBrokenLogo && brokenImgCount === 0) {
            skippedOk++;
            continue;
        }

        console.log(`\n🔍 ${name}`);
        console.log(`   Website: ${website || '(none)'}`);
        console.log(`   Broken logo: ${hasBrokenLogo ? 'YES' : 'NO'} | Broken images: ${brokenImgCount}/${brandImgs.length}`);

        // No website → can't re-scrape, clear broken URLs
        if (!website) {
            skippedNoWebsite++;
            console.log(`   ⚠️ No website — clearing broken URLs`);

            if (!DRY_RUN) {
                const update = {};
                if (hasBrokenLogo) {
                    update['dna.logo.url'] = '';
                    clearedLogos++;
                }
                if (brokenImgCount > 0) {
                    // Keep non-broken images, remove broken ones
                    const goodImgs = brandImgs.filter(img => !isBroken(img.url));
                    update['dna.brandImages'] = goodImgs;
                    clearedImages += brokenImgCount;
                }
                if (Object.keys(update).length > 0) {
                    await Brand.updateOne({ _id: brand._id }, { $set: update });
                }
            }
            continue;
        }

        // Fetch website and extract fresh images
        console.log(`   🌐 Fetching ${website}...`);
        const html = await fetchPage(website);
        if (!html) {
            failedFetch++;
            console.log(`   ❌ Failed to fetch website — clearing broken URLs`);

            if (!DRY_RUN) {
                const update = {};
                if (hasBrokenLogo) { update['dna.logo.url'] = ''; clearedLogos++; }
                if (brokenImgCount > 0) {
                    update['dna.brandImages'] = brandImgs.filter(img => !isBroken(img.url));
                    clearedImages += brokenImgCount;
                }
                if (Object.keys(update).length > 0) {
                    await Brand.updateOne({ _id: brand._id }, { $set: update });
                }
            }
            continue;
        }

        const $ = cheerio.load(html);

        // Extract fresh logo
        const update = {};
        if (hasBrokenLogo) {
            const newLogoUrl = extractLogo($, website);
            if (newLogoUrl) {
                console.log(`   ✅ Logo: ${newLogoUrl.substring(0, 80)}...`);
                update['dna.logo.url'] = newLogoUrl;
                update['dna.logo.metadata.source'] = 'website-rescrape';
                update['dna.logo.metadata.confidence'] = 'medium';
                fixedLogos++;
            } else {
                console.log(`   ⚠️ No logo found on website — clearing broken URL`);
                update['dna.logo.url'] = '';
                clearedLogos++;
            }
        }

        // Extract fresh brand images
        if (brokenImgCount > 0) {
            const freshImages = extractAllImages($, website);
            console.log(`   📷 Scraped ${freshImages.length} images from website`);

            // Keep non-broken existing images, replace broken ones with fresh scrape
            const goodExisting = brandImgs.filter(img => !isBroken(img.url));
            const merged = [...goodExisting, ...freshImages];

            // De-duplicate by URL
            const seenUrls = new Set();
            const deduped = [];
            for (const img of merged) {
                if (!seenUrls.has(img.url)) {
                    seenUrls.add(img.url);
                    deduped.push(img);
                }
            }

            update['dna.brandImages'] = deduped.slice(0, 30);
            fixedImages += Math.min(freshImages.length, brokenImgCount);
            console.log(`   ✅ Updated: ${deduped.length} total images (${goodExisting.length} kept + ${freshImages.length} fresh)`);
        }

        if (!DRY_RUN && Object.keys(update).length > 0) {
            await Brand.updateOne({ _id: brand._id }, { $set: update });
            console.log(`   💾 Saved to DB`);
        }

        // Small delay to be nice to websites
        await new Promise(r => setTimeout(r, 500));
    }

    // ── Summary ──
    console.log('\n\n═══════════════════════════════════════════════════');
    console.log('  FIX SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Brands processed:      ${brands.length}`);
    console.log(`  Already OK (skipped):  ${skippedOk}`);
    console.log(`  No website (cleared):  ${skippedNoWebsite}`);
    console.log(`  Fetch failed:          ${failedFetch}`);
    console.log(`  ── Results ──`);
    console.log(`  Logos fixed:           ${fixedLogos}`);
    console.log(`  Logos cleared:         ${clearedLogos}`);
    console.log(`  Images fixed:          ${fixedImages}`);
    console.log(`  Images cleared:        ${clearedImages}`);
    console.log('═══════════════════════════════════════════════════');
    if (DRY_RUN) console.log('\n⚠️ DRY RUN — no changes were made. Run without --dry-run to apply.');

    await mongoose.disconnect();
    console.log('\n✅ Done.');
}

main().catch(err => { console.error('❌ Fatal:', err.message); process.exit(1); });
