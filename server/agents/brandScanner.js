/**
 * Brand Scanner Agent
 * Scans a website and extracts comprehensive brand DNA:
 * - Logo (multiple detection strategies + fallbacks)
 * - Color palette (from CSS, inline styles, meta, SVG, buttons, links, backgrounds)
 * - Typography (Google Fonts, @font-face, CSS font-family)
 * - Content samples (for AI voice/tone analysis)
 * - Meta info (title, description, keywords, OG data)
 */

import * as cheerio from 'cheerio';

/**
 * Scan a website and extract brand DNA
 */
export async function scanWebsite(url, aiRouter) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    console.log(`🔍 Scanning website: ${url}`);

    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    // Fetch external CSS stylesheets and inject as inline styles
    // (many modern sites, especially SPAs, use external CSS only)
    await fetchExternalCSS($, url);

    // Extract all elements
    const meta = extractMeta($, url);
    const logos = extractLogos($, url);
    const colors = extractColors($, url);
    const fonts = extractFonts($);
    const contentSamples = extractContentSamples($);

    console.log(`  📸 Logos found: ${logos.length}`);
    console.log(`  🎨 Colors found: ${colors.length}`);
    console.log(`  🔤 Fonts found: ${fonts.length}`);
    console.log(`  📝 Content samples: ${contentSamples.length}`);

    // Extract banner/hero images for visual style guide
    const bannerImages = extractBannerImages($, url);
    console.log(`  🖼️  Banner images found: ${bannerImages.length}`);

    // Extract ALL images from the homepage
    const allImages = extractAllImages($, url);
    console.log(`  📷 Total homepage images found: ${allImages.length}`);

    // Use AI to analyze voice, tone, Content Style Guide, and name colors
    let voiceAnalysis = {};
    try {
        if (aiRouter && contentSamples.length > 0) {
            const colorContext = colors.length > 0
                ? `\nAll colors extracted from website CSS: ${colors.slice(0, 12).map(c => `${c.hex} (score:${c.score}, sources:${c.sources.join(',')})`).join(', ')}`
                : '';
            const bannerContext = bannerImages.length > 0
                ? `\nBanner/hero images found: ${bannerImages.map(b => b.url).join(', ')}`
                : '';

            voiceAnalysis = await aiRouter.analyzeText({
                text: contentSamples.join('\n\n') + colorContext + bannerContext,
                task: `You are a brand strategist and visual identity expert. Analyze this website's brand identity.
Return ONLY valid JSON (no markdown, no explanation) with these fields:

{
  "personality": "e.g. Professional & Innovative",
  "description": "2-3 sentences about brand voice",
  "tone": 50,
  "clarity": 50,
  "warmth": 50,
  "formality": 50,
  "wit": 25,
  "keywords": ["5-10 brand keywords"],
  "sampleQuote": "best example of brand voice from the content",
  "industry": "detected industry",
  "targetAudience": "who the brand targets",
  "contentStyle": {
    "dos": ["5-8 writing rules to follow"],
    "donts": ["5-8 things to avoid"],
    "keyPhrases": ["5-10 signature phrases"],
    "writingStyle": "1-2 sentence description",
    "ctaStyle": "How CTAs are written",
    "emojiUsage": "none/minimal/moderate/heavy",
    "hashtagStyle": "none/minimal/trend-based/branded",
    "sentenceLength": "short/mixed/long"
  },
  "brandColors": [
    { "hex": "#000000", "name": "Jet Black", "usage": "primary" },
    { "hex": "#BBF00A", "name": "Electric Lime", "usage": "accent" }
  ]
}

IMPORTANT for brandColors:
- Pick ONLY 4-5 colors that are the TRUE brand identity colors
- Include the background/base color if it's intentional (e.g. black for dark-themed brands like Apple, ACwO)
- Include the primary accent color (the color that stands out most — CTAs, highlights, links)
- Include white ONLY if it's a deliberate brand color (not just default text)
- Include any secondary/supporting brand colors  
- DO NOT include generic CSS framework colors, utility grays, or Tailwind defaults
- Each color needs: hex (uppercase), name (descriptive like "Royal Blue" not "Brand Color 1"), usage (primary/secondary/accent/background)
- Order: primary first, then secondary, accent, background`,
            });
        }
    } catch (err) {
        console.error('Voice analysis failed:', err.message);
    }

    // Use AI-curated brand colors if available, otherwise run a separate focused AI call
    let namedColors;
    if (voiceAnalysis.brandColors?.length >= 3) {
        namedColors = voiceAnalysis.brandColors.map(c => ({
            hex: (c.hex || '').toUpperCase(),
            name: c.name || 'Brand Color',
            usage: c.usage || 'accent',
        }));
        console.log(`  \u{1F3A8} AI selected ${namedColors.length} brand colors`);
    } else if (aiRouter && colors.length > 0) {
        // Separate focused AI call for brand color curation
        try {
            const colorResult = await aiRouter.analyzeText({
                text: `Website: ${url}\nBrand: ${brandName || meta.title}\nIndustry: ${voiceAnalysis.industry || 'unknown'}\nCSS Colors found: ${colors.slice(0, 15).map(c => c.hex).join(', ')}`,
                task: `Pick EXACTLY 4-5 TRUE brand identity colors from the CSS colors list.\nReturn ONLY JSON: {"brandColors": [{"hex": "#000000", "name": "Jet Black", "usage": "primary"}]}\n\nRules:\n- Pick ONLY colors that represent the brand identity (logo, accent, background)\n- Black (#000000) and white (#FFFFFF) ARE valid if used intentionally as brand colors\n- Give descriptive names ("Electric Lime" not "Green")\n- usage: primary/secondary/accent/background\n- Order: primary first\n- EXCLUDE generic UI/framework colors that aren't part of brand identity`,
            });
            if (colorResult.brandColors?.length >= 3) {
                namedColors = colorResult.brandColors.map(c => ({
                    hex: (c.hex || '').toUpperCase(),
                    name: c.name || 'Brand Color',
                    usage: c.usage || 'accent',
                }));
                console.log(`  \u{1F3A8} Separate AI call selected ${namedColors.length} brand colors`);
            }
        } catch (err) {
            console.error('Brand color curation failed:', err.message);
        }
    }

    // Final fallback: use top 5 from CSS scoring
    if (!namedColors || namedColors.length < 3) {
        namedColors = colors.slice(0, 5).map((c, i) => ({
            hex: c.hex,
            name: `Brand Color ${i + 1}`,
            usage: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'accent',
        }));
    }

    // Build Content Style Guide
    const contentStyle = voiceAnalysis.contentStyle || {
        dos: ['Use clear, concise language', 'Maintain consistent brand voice', 'Include relevant CTAs'],
        donts: ['Avoid jargon', 'Don\'t use passive voice', 'Avoid overly promotional tone'],
        keyPhrases: voiceAnalysis.keywords || [],
        writingStyle: '',
        ctaStyle: '',
        emojiUsage: 'minimal',
        hashtagStyle: 'minimal',
        sentenceLength: 'mixed',
    };

    // Use AI to extract the actual brand name from page title & URL
    let brandName = '';
    try {
        if (aiRouter) {
            const nameResult = await aiRouter.generateText({
                systemPrompt: 'You are a brand naming expert. Return ONLY the brand name, nothing else. No quotes, no explanation.',
                userPrompt: `Extract the actual brand name from this website info:
Page Title: "${meta.title || ''}"
URL: ${url}
Description: "${(meta.description || '').substring(0, 200)}"
OG Image URL: "${meta.ogImage || ''}"

Rules:
- Return ONLY the brand/company name (e.g., "Nike", "ACwO", "Apple")
- Remove taglines, product descriptions, separators (|, -, –)
- If title is "Buy Best Earbuds | ACwO", return "ACwO"
- If title is "Nike - Just Do It", return "Nike"
- If unclear, extract from the domain name
- Return just the name, nothing else`,
                temperature: 0.1,
                maxTokens: 30,
            });
            brandName = nameResult.text?.trim().replace(/['"]/g, '') || '';
        }
    } catch (err) {
        console.error('Brand name extraction failed:', err.message);
    }

    // Fallback: extract from domain if AI didn't work
    if (!brandName) {
        try {
            const hostname = new URL(url).hostname.replace(/^www\./, '');
            brandName = hostname.split('.')[0];
            // Capitalize first letter
            brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
        } catch {
            brandName = meta.title?.split(/[|–\-—]/)[0]?.trim() || '';
        }
    }

    return {
        name: brandName,
        website: url,
        dna: {
            logo: {
                url: logos[0]?.url || '',
                allLogos: logos.slice(0, 5),
                metadata: {
                    format: logos[0]?.format || '',
                    source: logos[0]?.source || '',
                },
            },
            colors: namedColors,
            fonts: {
                heading: { family: fonts[0] || 'Inter', weight: '700', style: 'normal' },
                body: { family: fonts[1] || fonts[0] || 'Inter', weight: '400', style: 'normal' },
            },
            voice: {
                personality: voiceAnalysis.personality || 'Professional',
                description: voiceAnalysis.description || '',
                tone: voiceAnalysis.tone || 50,
                clarity: voiceAnalysis.clarity || 50,
                warmth: voiceAnalysis.warmth || 50,
                formality: voiceAnalysis.formality || 50,
                wit: voiceAnalysis.wit || 25,
                sampleQuote: voiceAnalysis.sampleQuote || '',
                keywords: voiceAnalysis.keywords || [],
            },
            contentStyle,
            bannerImages: bannerImages.slice(0, 15),
            brandImages: allImages,
            brandDescription: meta.description || '',
            targetAudience: voiceAnalysis.targetAudience || '',
            industry: voiceAnalysis.industry || '',
        },
        rawScanData: { meta, colors: namedColors, fonts, logos, bannerImages, contentSamples: contentSamples.slice(0, 3) },
    };
}

// ============================================================================
// FETCH PAGE
// ============================================================================

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

        if (!response.ok) {
            throw new Error(`Website returned ${response.status}: ${response.statusText}`);
        }
        return await response.text();
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Website took too long to respond. Please check the URL and try again.`);
        }
        throw new Error(`Failed to reach ${url}. ${error.message}`);
    }
}

/**
 * Fetch external CSS stylesheets and inject as inline <style> tags
 */
async function fetchExternalCSS($, baseUrl) {
    const cssLinks = [];
    $('link[rel="stylesheet"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) cssLinks.push(href);
    });

    if (cssLinks.length === 0) return;
    console.log(`  📄 Fetching ${cssLinks.length} external stylesheet(s)...`);

    // Fetch up to 5 CSS files in parallel (with timeout)
    const results = await Promise.allSettled(
        cssLinks.slice(0, 5).map(async (href) => {
            try {
                let cssUrl = href;
                if (!cssUrl.startsWith('http')) {
                    cssUrl = new URL(href, baseUrl).href;
                }
                // Skip Google Fonts CSS (we handle those separately via link tags)
                if (cssUrl.includes('fonts.googleapis.com')) return '';

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                const res = await fetch(cssUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (!res.ok) return '';
                return await res.text();
            } catch { return ''; }
        })
    );

    // Inject fetched CSS as style tags
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
            $('head').append(`<style>${result.value}</style>`);
        }
    }
}

// ============================================================================
// EXTRACT META
// ============================================================================

function extractMeta($, url) {
    return {
        title: $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '',
        description: $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '',
        keywords: $('meta[name="keywords"]').attr('content') || '',
        ogImage: $('meta[property="og:image"]').attr('content') || '',
        themeColor: $('meta[name="theme-color"]').attr('content') || '',
        msColor: $('meta[name="msapplication-TileColor"]').attr('content') || '',
        favicon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href') || '',
        appleTouchIcon: $('link[rel="apple-touch-icon"]').attr('href') || '',
        url,
    };
}

// ============================================================================
// EXTRACT LOGOS — Comprehensive logo detection
// ============================================================================

function resolveUrl(src, baseUrl) {
    if (!src || src.startsWith('data:')) return null;
    try {
        // Handle Shopify template URLs: replace {width} with 600
        src = src.replace(/\{width\}/g, '600');
        // Handle protocol-relative URLs
        if (src.startsWith('//')) src = 'https:' + src;
        if (src.startsWith('http')) return src;
        return new URL(src, baseUrl).href;
    } catch { return null; }
}

function extractLogos($, baseUrl) {
    const found = [];   // { url, source, format, priority }

    // ── 1. Explicit logo selectors (highest priority) ──
    const logoSelectors = [
        // Class/id-based
        'img[class*="logo"]', 'img[id*="logo"]',
        'img[class*="Logo"]', 'img[id*="Logo"]',
        // Alt-based
        'img[alt*="logo"]', 'img[alt*="Logo"]',
        // Parent-based  
        '.logo img', '#logo img',
        '.site-logo img', '.navbar-brand img', '.brand-logo img',
        '[class*="logo"] img', '[id*="logo"] img',
        'a[class*="logo"] img', 'a[id*="logo"] img',
        '[class*="brand"] img', '[class*="Brand"] img',
        // SVG logos
        '.logo svg', '#logo svg', '[class*="logo"] svg',
        'a[class*="logo"] svg', 'header svg:first-of-type',
    ];

    for (const sel of logoSelectors) {
        $(sel).each((_, el) => {
            const tag = el.tagName?.toLowerCase();
            if (tag === 'svg') {
                // Inline SVG → encode as data URI
                const svgHtml = $.html(el);
                if (svgHtml.length < 50000) {
                    found.push({
                        url: `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString('base64')}`,
                        source: 'inline-svg', format: 'svg', priority: 1,
                    });
                }
            } else {
                const src = resolveUrl($(el).attr('src'), baseUrl);
                const srcset = $(el).attr('srcset');
                if (src) {
                    const format = src.split('?')[0].split('.').pop()?.toLowerCase() || 'unknown';
                    found.push({ url: src, source: 'logo-selector', format, priority: 1 });
                }
                // Also check srcset for high-res logos
                if (srcset) {
                    const bestSrc = srcset.split(',').pop()?.trim().split(/\s+/)[0];
                    const resolved = resolveUrl(bestSrc, baseUrl);
                    if (resolved) found.push({ url: resolved, source: 'logo-srcset', format: 'image', priority: 2 });
                }
            }
        });
    }

    // ── 2. Header first image (likely logo) ──
    $('header img').each((i, el) => {
        if (i > 2) return; // only first few
        const src = resolveUrl($(el).attr('src'), baseUrl);
        if (src) {
            found.push({ url: src, source: 'header-img', format: src.split('?')[0].split('.').pop() || 'image', priority: 3 });
        }
    });

    // ── 3. Nav first image ──
    $('nav img').each((i, el) => {
        if (i > 1) return;
        const src = resolveUrl($(el).attr('src'), baseUrl);
        if (src) {
            found.push({ url: src, source: 'nav-img', format: src.split('?')[0].split('.').pop() || 'image', priority: 4 });
        }
    });

    // ── 4. Apple Touch Icon (usually high-quality brand icon) ──
    const appleTouchIcon = $('link[rel="apple-touch-icon"]').attr('href')
        || $('link[rel="apple-touch-icon-precomposed"]').attr('href');
    if (appleTouchIcon) {
        const resolved = resolveUrl(appleTouchIcon, baseUrl);
        if (resolved) found.push({ url: resolved, source: 'apple-touch-icon', format: 'png', priority: 2 });
    }

    // ── 5. Favicon (various sizes) ──
    $('link[rel="icon"], link[rel="shortcut icon"]').each((_, el) => {
        const href = $(el).attr('href');
        const sizes = $(el).attr('sizes') || '';
        const resolved = resolveUrl(href, baseUrl);
        if (resolved) {
            // Prefer larger favicons
            const sizePriority = sizes.includes('192') || sizes.includes('180') ? 3 : sizes.includes('32') ? 5 : 6;
            found.push({ url: resolved, source: 'favicon', format: resolved.split('?')[0].split('.').pop() || 'ico', priority: sizePriority });
        }
    });

    // ── 6. OG Image (fallback) ──
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
        const resolved = resolveUrl(ogImage, baseUrl);
        if (resolved) found.push({ url: resolved, source: 'og-image', format: 'image', priority: 5 });
    }

    // ── 7. Fallback: construct standard favicon paths ──
    if (found.length === 0) {
        try {
            const origin = new URL(baseUrl).origin;
            found.push({ url: `${origin}/favicon.ico`, source: 'default-favicon', format: 'ico', priority: 7 });
            found.push({ url: `${origin}/logo.png`, source: 'default-logo', format: 'png', priority: 7 });
        } catch { /* ignore */ }
    }

    // De-duplicate by URL and sort by priority
    const unique = [];
    const seen = new Set();
    for (const logo of found.sort((a, b) => a.priority - b.priority)) {
        if (!seen.has(logo.url)) {
            seen.add(logo.url);
            unique.push(logo);
        }
    }

    return unique.slice(0, 5);
}

// ============================================================================
// EXTRACT COLORS — Deep extraction from multiple sources
// ============================================================================

function normalizeHex(hex) {
    hex = hex.toUpperCase().trim();
    // Expand 3-char hex to 6-char
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    // Strip alpha from 8-char or 5-char hex
    if (hex.length === 9) hex = hex.slice(0, 7);
    if (hex.length === 5) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    return hex;
}

function isGenericColor(hex) {
    // Only block truly non-brand values — NOT black/white/grays
    // Black, white, and near-black CAN be legitimate brand colors (e.g., ACwO, Apple, Nike)
    const normalized = hex.toUpperCase();
    const blocked = new Set([
        '#F5F5F5', '#F0F0F0', '#E0E0E0', '#D0D0D0',
        '#F8F8F8', '#FAFAFA', '#FCFCFC',
        // Only block obvious Tailwind/framework utility grays  
        '#9CA3AF', '#D1D5DB', '#E5E7EB', '#F3F4F6', '#F9FAFB',
        '#6B7280', '#4B5563', '#374151',
    ]);
    return blocked.has(normalized);
}

function rgbToHex(r, g, b) {
    return `#${[r, g, b].map(x => Math.max(0, Math.min(255, parseInt(x))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function hslToHex(h, s, l) {
    h = parseFloat(h); s = parseFloat(s) / 100; l = parseFloat(l) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    };
    return rgbToHex(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255));
}

function extractColors($, baseUrl) {
    const colorMap = new Map(); // hex → { count, sources Set }

    function addColor(hex, source) {
        if (!hex || hex.length < 4) return;
        hex = normalizeHex(hex);
        if (isGenericColor(hex)) return;
        if (!colorMap.has(hex)) colorMap.set(hex, { count: 0, sources: new Set() });
        const entry = colorMap.get(hex);
        entry.count++;
        entry.sources.add(source);
    }

    const hexPattern = /#([0-9A-Fa-f]{3,8})\b/g;
    const rgbPattern = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g;
    const hslPattern = /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/g;

    // ── 1. Meta theme-color (highest priority — intentional brand color) ──
    const themeColor = $('meta[name="theme-color"]').attr('content');
    if (themeColor) addColor(themeColor, 'theme-color');

    const msColor = $('meta[name="msapplication-TileColor"]').attr('content');
    if (msColor) addColor(msColor, 'ms-tile-color');

    // ── 2. CSS custom properties (--primary, --brand, etc.) ──
    $('style').each((_, el) => {
        const css = $(el).text();

        // CSS variables that look like brand colors
        const varPattern = /--(primary|brand|accent|main|theme|highlight|cta)[^:]*:\s*(#[0-9A-Fa-f]{3,8}|rgb[a]?\([^)]+\))/gi;
        let varMatch;
        while ((varMatch = varPattern.exec(css)) !== null) {
            const val = varMatch[2];
            if (val.startsWith('#')) addColor(val, 'css-variable');
            else {
                const rgbM = val.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
                if (rgbM) addColor(rgbToHex(rgbM[1], rgbM[2], rgbM[3]), 'css-variable');
            }
        }

        // All hex colors in CSS
        let match;
        while ((match = hexPattern.exec(css)) !== null) {
            if (match[1].length === 3 || match[1].length === 6) addColor(`#${match[1]}`, 'css');
        }

        // RGB colors
        while ((match = rgbPattern.exec(css)) !== null) {
            addColor(rgbToHex(match[1], match[2], match[3]), 'css-rgb');
        }

        // HSL colors
        while ((match = hslPattern.exec(css)) !== null) {
            addColor(hslToHex(match[1], match[2], match[3]), 'css-hsl');
        }
    });

    // ── 3. Inline styles — buttons, links, headers, CTAs ──
    const importantSelectors = [
        'button', 'a.btn', '.btn', '[class*="cta"]', '[class*="CTA"]',
        'a[class*="button"]', '[class*="primary"]',
        'h1', 'h2', 'h3',
        '[class*="hero"]', '[class*="banner"]', '[class*="accent"]',
        'nav', 'header', 'footer',
    ];

    for (const sel of importantSelectors) {
        $(sel).each((_, el) => {
            const style = $(el).attr('style') || '';
            if (!style) return;

            // Background color
            const bgMatch = style.match(/background(?:-color)?:\s*(#[0-9A-Fa-f]{3,8})/i);
            if (bgMatch) addColor(bgMatch[1], `inline-${sel}`);

            // Color
            const colorMatch = style.match(/(?:^|;)\s*color:\s*(#[0-9A-Fa-f]{3,8})/i);
            if (colorMatch) addColor(colorMatch[1], `inline-${sel}`);

            // Border color
            const borderMatch = style.match(/border(?:-color)?:[^;]*(#[0-9A-Fa-f]{3,8})/i);
            if (borderMatch) addColor(borderMatch[1], `inline-${sel}`);

            // RGB in inline styles
            const rgbInline = style.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            if (rgbInline) addColor(rgbToHex(rgbInline[1], rgbInline[2], rgbInline[3]), `inline-${sel}`);
        });
    }

    // ── 4. All inline styles (lower priority) ──
    $('[style]').each((_, el) => {
        const style = $(el).attr('style') || '';
        let match;
        while ((match = hexPattern.exec(style)) !== null) {
            if (match[1].length === 3 || match[1].length === 6) addColor(`#${match[1]}`, 'inline');
        }
    });

    // ── 5. SVG fill/stroke colors (often brand colors) ──
    $('svg [fill], svg [stroke]').each((_, el) => {
        const fill = $(el).attr('fill') || '';
        const stroke = $(el).attr('stroke') || '';
        if (fill.startsWith('#')) addColor(fill, 'svg');
        if (stroke.startsWith('#')) addColor(stroke, 'svg');
    });

    // ── 6. Link colors from CSS ──
    $('style').each((_, el) => {
        const css = $(el).text();
        const linkColorPattern = /a\s*{[^}]*color:\s*(#[0-9A-Fa-f]{3,8})/gi;
        let match;
        while ((match = linkColorPattern.exec(css)) !== null) {
            addColor(match[1], 'link-color');
        }
    });

    // ── Score and rank colors ──
    const scored = [];
    for (const [hex, data] of colorMap) {
        let score = data.count;
        // Boost colors from intentional sources
        if (data.sources.has('theme-color')) score += 50;
        if (data.sources.has('ms-tile-color')) score += 40;
        if (data.sources.has('css-variable')) score += 30;
        if (data.sources.has('svg')) score += 15;
        if (data.sources.has('link-color')) score += 10;
        for (const s of data.sources) {
            if (s.startsWith('inline-button') || s.startsWith('inline-.btn') || s.includes('cta')) score += 20;
            if (s.startsWith('inline-h')) score += 10;
        }
        scored.push({ hex, score, sources: [...data.sources] });
    }

    scored.sort((a, b) => b.score - a.score);

    // Take top 6, ensure color variety (skip colors too similar to already selected)
    const selected = [];
    for (const c of scored) {
        if (selected.length >= 6) break;
        // Simple similarity check — skip if hex is too close to already selected
        const isDuplicate = selected.some(s => colorDistance(s.hex, c.hex) < 30);
        if (!isDuplicate) {
            selected.push(c);
        }
    }

    return selected.map((c, i) => ({
        hex: c.hex,
        name: `Brand Color ${i + 1}`,
        usage: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'accent',
        score: c.score,
        sources: c.sources,
    }));
}

/**
 * Simple color distance (euclidean in RGB space)
 */
function colorDistance(hex1, hex2) {
    const r1 = parseInt(hex1.slice(1, 3), 16), g1 = parseInt(hex1.slice(3, 5), 16), b1 = parseInt(hex1.slice(5, 7), 16);
    const r2 = parseInt(hex2.slice(1, 3), 16), g2 = parseInt(hex2.slice(3, 5), 16), b2 = parseInt(hex2.slice(5, 7), 16);
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// ============================================================================
// EXTRACT FONTS
// ============================================================================

function extractFonts($) {
    const fonts = new Set();
    const systemFonts = new Set([
        'inherit', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
        'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui',
        'helvetica neue', 'arial', 'helvetica', 'verdana', 'georgia', 'times new roman',
    ]);

    // From Google Fonts link
    $('link[href*="fonts.googleapis.com"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const familyMatches = href.matchAll(/family=([^&:;]+)/g);
        for (const m of familyMatches) {
            m[1].split('|').forEach(f => {
                const name = f.replace(/\+/g, ' ').replace(/@.*/, '').trim();
                if (name) fonts.add(name);
            });
        }
    });

    // From @font-face
    $('style').each((_, el) => {
        const css = $(el).text();
        const fontFacePattern = /@font-face\s*{[^}]*font-family:\s*['"]?([^'";}\n]+)/gi;
        let match;
        while ((match = fontFacePattern.exec(css)) !== null) {
            const name = match[1].trim().replace(/['\"]/g, '');
            if (!systemFonts.has(name.toLowerCase())) fonts.add(name);
        }
    });

    // From CSS font-family declarations
    $('style').each((_, el) => {
        const css = $(el).text();
        const fontFamilyPattern = /font-family:\s*['"]?([^'";}\n]+)/g;
        let match;
        while ((match = fontFamilyPattern.exec(css)) !== null) {
            const family = match[1].split(',')[0].trim().replace(/['"]/g, '');
            if (!systemFonts.has(family.toLowerCase()) && family.length > 1) {
                fonts.add(family);
            }
        }
    });

    return [...fonts].slice(0, 5);
}

// ============================================================================
// EXTRACT CONTENT SAMPLES
// ============================================================================

function extractContentSamples($) {
    const samples = [];

    // Meta description first
    const desc = $('meta[name="description"]').attr('content') || '';
    if (desc) samples.push(desc);

    // OG description
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    if (ogDesc && ogDesc !== desc) samples.push(ogDesc);

    // Headlines
    $('h1, h2, h3').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 10 && text.length < 200) samples.push(text);
    });

    // Paragraphs
    $('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30 && text.length < 500) samples.push(text);
    });

    // Tagline / slogan (often in specific elements)
    $('[class*="tagline"], [class*="slogan"], [class*="hero-text"], [class*="subtitle"]').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 5 && text.length < 200) samples.push(text);
    });

    return [...new Set(samples)].slice(0, 15);
}

// ============================================================================
// EXTRACT BANNER / HERO IMAGES
// ============================================================================

function extractBannerImages($, baseUrl) {
    const banners = [];

    // OG Image (usually the hero/banner)
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
        const resolved = resolveUrl(ogImage, baseUrl);
        if (resolved) banners.push({ url: resolved, source: 'og-image', type: 'banner' });
    }

    // Twitter Image
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    if (twitterImage) {
        const resolved = resolveUrl(twitterImage, baseUrl);
        if (resolved) banners.push({ url: resolved, source: 'twitter-image', type: 'banner' });
    }

    // Hero section images
    const heroSelectors = [
        '[class*="hero"] img', '[class*="Hero"] img',
        '[class*="banner"] img', '[class*="Banner"] img',
        '[class*="jumbotron"] img',
        '[class*="splash"] img',
        '.hero img', '#hero img',
        'section:first-of-type img',
    ];

    for (const sel of heroSelectors) {
        $(sel).each((i, el) => {
            if (i > 1) return;
            const src = resolveUrl($(el).attr('src'), baseUrl);
            if (src) banners.push({ url: src, source: 'hero-section', type: 'hero' });
        });
    }

    // Background images from hero/banner sections (CSS)
    $('[class*="hero"], [class*="banner"], [class*="jumbotron"], section:first-of-type, header').each((_, el) => {
        const style = $(el).attr('style') || '';
        const bgMatch = style.match(/background(?:-image)?:\s*url\(['"]?([^'")\s]+)/i);
        if (bgMatch) {
            const resolved = resolveUrl(bgMatch[1], baseUrl);
            if (resolved) banners.push({ url: resolved, source: 'css-background', type: 'background' });
        }
    });

    // Large front-page images (likely brand imagery)  
    $('img').each((i, el) => {
        if (i > 10) return; // only first 10 images
        const src = $(el).attr('src') || '';
        const width = parseInt($(el).attr('width') || '0');
        const height = parseInt($(el).attr('height') || '0');
        // If image is large (likely a banner/product shot)
        if ((width >= 600 || height >= 300) && src) {
            const resolved = resolveUrl(src, baseUrl);
            if (resolved) banners.push({ url: resolved, source: 'large-image', type: 'content' });
        }
    });

    // De-duplicate
    const unique = [];
    const seen = new Set();
    for (const b of banners) {
        if (!seen.has(b.url)) { seen.add(b.url); unique.push(b); }
    }
    return unique.slice(0, 15);
}

// ============================================================================
// EXTRACT ALL IMAGES — Comprehensive image scraping from homepage
// ============================================================================

function extractAllImages($, baseUrl) {
    const images = [];
    const seen = new Set();

    // Skip patterns — tiny icons, tracking pixels, SVGs, base64 data URIs
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
        images.push({ url: resolved, alt: (alt || '').slice(0, 200), source: source || 'page' });
    }

    // ── 1. All <img> tags with lazy-loading support ──
    $('img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || $(el).attr('data-lazy-src') || '';
        const srcset = $(el).attr('srcset') || $(el).attr('data-srcset') || '';
        const alt = $(el).attr('alt') || '';
        const width = parseInt($(el).attr('width') || '0');
        const height = parseInt($(el).attr('height') || '0');

        // Skip tiny images
        if ((width > 0 && width < 40) || (height > 0 && height < 40)) return;

        // Pick best source: prefer srcset largest, then src
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

        // Determine context
        const parent = $(el).closest('[class*="hero"], [class*="banner"], [class*="slider"], [class*="product"], [class*="carousel"], section, article');
        const pc = (parent.attr('class') || '').toLowerCase();
        let source = 'page';
        if (pc.match(/hero|banner|slider|carousel/)) source = 'hero';
        else if (pc.match(/product|catalog|item/)) source = 'product';

        addImage(bestSrc, alt, source);
    });

    // ── 2. <source> elements in <picture> tags ──
    $('picture source, source[srcset]').each((_, el) => {
        const srcset = $(el).attr('srcset') || '';
        if (!srcset) return;
        // Get the first (often desktop) URL from srcset
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

    // ── 3. CSS background images ──
    $('[style*="background"]').each((_, el) => {
        const style = $(el).attr('style') || '';
        const bgMatch = style.match(/background(?:-image)?:\s*url\(['"]?([^'")]+)/i);
        if (bgMatch) addImage(bgMatch[1], '', 'background');
    });

    // ── 4. JSON-LD structured data images ──
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).text());
            const items = Array.isArray(data) ? data : [data];
            for (const item of items) {
                if (item.image) {
                    const imgs = Array.isArray(item.image) ? item.image : [item.image];
                    imgs.forEach(img => {
                        const url = typeof img === 'string' ? img : img?.url;
                        if (url) addImage(url, item.name || '', 'structured-data');
                    });
                }
                // Product images
                if (item['@type'] === 'Product' && item.offers?.image) {
                    addImage(item.offers.image, item.name || '', 'product');
                }
            }
        } catch { /* ignore invalid JSON-LD */ }
    });

    // ── 5. Shopify product JSON in script tags ──
    $('script').each((_, el) => {
        const text = $(el).text();
        // Look for Shopify product image patterns
        const imgMatches = text.matchAll(/"(?:featured_image|src|url)":\s*"(https?:\/\/cdn\.shopify\.com\/[^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/gi);
        for (const match of imgMatches) {
            if (match[1] && !match[1].includes('icon') && !match[1].includes('badge')) {
                addImage(match[1], '', 'product');
            }
        }
    });

    console.log(`  📷 extractAllImages: found ${images.length} images total`);
    return images.slice(0, 30);
}
