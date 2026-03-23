import * as cheerio from 'cheerio';

/**
 * Scan a website and extract comprehensive brand DNA using AI Vision + Social Intelligence
 */
export async function scanWebsite(url, aiRouter) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    console.log(`🔍 Scanning website: ${url}`);

    let html = await fetchPage(url);
    let $ = cheerio.load(html);

    // ── SPA Detection: if body text is too short, the site is a JS-rendered SPA ──
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const isSPA = bodyText.length < 200 || $('#root, #app, #__next, #__nuxt').length > 0;

    // Puppeteer browser instance — reused for sub-page crawling of SPAs
    let sharedBrowser = null;

    if (isSPA) {
        console.log(`  ⚡ SPA detected (body text: ${bodyText.length} chars) — using Puppeteer for content extraction`);
        try {
            const rendered = await puppeteerExtractContent(url);
            if (rendered) {
                sharedBrowser = rendered._browser; // reuse for sub-pages
                // Rebuild cheerio from rendered HTML
                html = rendered.html;
                $ = cheerio.load(html);
                console.log(`  ✅ Puppeteer extracted ${rendered.textContent?.length || 0} chars of content`);
            }
        } catch (err) {
            console.warn('  ⚠️ Puppeteer content extraction failed:', err.message);
        }
    }

    // Fetch external CSS stylesheets and inject as inline styles
    await fetchExternalCSS($, url);

    // ── Phase 1: Traditional HTML extraction (existing) ─────────────────
    const meta = extractMeta($, url);
    const selectorLogos = extractLogos($, url);
    const cssColors = extractColors($, url);
    const fonts = extractFonts($);
    const contentSamples = extractContentSamples($);
    const bannerImages = extractBannerImages($, url);
    const allImages = extractAllImages($, url);

    console.log(`  📸 Selector logos found: ${selectorLogos.length}`);
    console.log(`  🎨 CSS colors found: ${cssColors.length}`);
    console.log(`  🔤 Fonts found: ${fonts.length}`);
    console.log(`  📝 Content samples: ${contentSamples.length}`);
    console.log(`  🖼️  Banner images found: ${bannerImages.length}`);
    console.log(`  📷 Total homepage images found: ${allImages.length}`);

    // ── Phase 1b+2+3: PARALLEL — Vision + Social + SubPages ────────────
    // These 3 expensive operations are independent — run concurrently
    const socialLinks = extractSocialLinks($, url);
    console.log(`  🔗 Social links found: ${Object.values(socialLinks).filter(Boolean).length}`);

    const [visionResult, subPageResult, socialResult] = await Promise.allSettled([
        // Vision analysis (Puppeteer screenshot → Gemini)
        (!isSPA ? captureAndAnalyze(url, allImages, selectorLogos).catch(err => {
            console.warn('  ⚠️ Vision analysis failed:', err.message);
            return null;
        }) : Promise.resolve(null)),
        // Sub-page crawl
        crawlSubPages($, url, isSPA, sharedBrowser).catch(err => {
            console.warn('  ⚠️ Sub-page crawl failed:', err.message);
            return [];
        }),
        // Social media analysis
        (Object.values(socialLinks).some(Boolean) && aiRouter
            ? analyzeSocialMedia(socialLinks, aiRouter).catch(err => {
                console.warn('  ⚠️ Social media analysis failed:', err.message);
                return {};
            })
            : Promise.resolve({})),
    ]);

    const visionAnalysis = visionResult.status === 'fulfilled' ? visionResult.value : null;
    const subPageContent = subPageResult.status === 'fulfilled' ? subPageResult.value : [];
    const socialVoice = socialResult.status === 'fulfilled' ? socialResult.value : {};

    if (visionAnalysis) console.log(`  🧠 Vision analysis: logo=${visionAnalysis?.logo ? '✅' : '❌'}, colors=${visionAnalysis?.colors?.length || 0}`);
    if (isSPA) console.log('  ⏭️ Skipping Vision analysis (SPA — Puppeteer already used for content)');
    console.log(`  📄 Sub-pages crawled: ${subPageContent.length} content pieces`);
    if (socialVoice.captionStyle) console.log(`  📱 Social voice analysis: ✅`);

    // Close shared Puppeteer browser if we opened one
    if (sharedBrowser) {
        try { await sharedBrowser.close(); } catch {}
    }

    // ── Merge all content samples for richer voice analysis ──────────────
    const allContentSamples = [
        ...contentSamples,
        ...subPageContent,
        ...(socialVoice.sampleCaptions || []).map(c => `[Social Media] ${c}`),
    ];

    // ── Enhanced AI Voice/Tone Analysis + Brand Name — PARALLEL ───────────
    // These 2 AI calls are independent — run concurrently
    const [voiceResult, nameResult] = await Promise.allSettled([
        // Voice/tone analysis
        (aiRouter && allContentSamples.length > 0 ? (async () => {
            const colorContext = cssColors.length > 0
                ? `\nAll colors extracted from website CSS: ${cssColors.slice(0, 12).map(c => `${c.hex} (score:${c.score}, sources:${c.sources.join(',')})`).join(', ')}`
                : '';
            const bannerContext = bannerImages.length > 0
                ? `\nBanner/hero images found: ${bannerImages.map(b => b.url).join(', ')}`
                : '';
            const socialContext = socialVoice.captionStyle
                ? `\n\nSOCIAL MEDIA ANALYSIS:\nCaption style: ${socialVoice.captionStyle || 'unknown'}\nHashtag strategy: ${socialVoice.hashtagStrategy || 'unknown'}\nEmoji usage: ${socialVoice.emojiUsage || 'unknown'}\nCTA style: ${socialVoice.ctaStyle || 'unknown'}\nSample captions: ${(socialVoice.sampleCaptions || []).slice(0, 3).join(' | ')}`
                : '';

            return aiRouter.analyzeText({
                text: allContentSamples.join('\n\n') + colorContext + bannerContext + socialContext,
                task: `You are a brand strategist and visual identity expert. Analyze this website's brand identity using ALL the content provided — including sub-page content from About, Team, Products, Services, Values pages.
Return ONLY valid JSON (no markdown, no explanation) with these fields:

{
  "personality": "e.g. Professional & Innovative",
  "description": "2-3 sentences about brand voice",
  "brandDescription": "3-5 sentence comprehensive description of what this company/brand does, their core offerings, and what makes them unique. This should read like an 'About Us' summary.",
  "companyOverview": "1-2 sentence elevator pitch — who they are and what they do",
  "servicesOffered": ["list of 5-10 specific products, services, or capabilities the brand offers"],
  "uniqueSellingPoints": ["3-5 things that differentiate this brand from competitors"],
  "missionStatement": "the brand's mission statement if found, else empty string",
  "brandValues": ["3-5 core values the brand stands for"],
  "tone": 50,
  "clarity": 50,
  "warmth": 50,
  "formality": 50,
  "wit": 25,
  "keywords": ["5-10 brand keywords"],
  "sampleQuote": "best example of brand voice from the content",
  "industry": "detected industry — be specific (e.g. 'Marketing Consultancy' not just 'Business')",
  "targetAudience": "who the brand targets — be specific about demographics, profession, and needs",
  "tagline": "brand tagline or slogan if found, else empty string",
  "photographyStyle": "flat lay / lifestyle / studio / UGC / mixed — based on images",
  "contentStyle": {
    "dos": ["5-8 writing rules to follow"],
    "donts": ["5-8 things to avoid"],
    "keyPhrases": ["5-10 signature phrases or brand language found in the content"],
    "writingStyle": "1-2 sentence description of how they write",
    "ctaStyle": "How CTAs are written — e.g. Shop Now, Learn More, DM Us",
    "emojiUsage": "none/minimal/moderate/heavy",
    "hashtagStyle": "none/minimal/trend-based/branded",
    "sentenceLength": "short/mixed/long",
    "captionLengthPreference": "short (1-2 lines) / medium (3-5 lines) / long (6+ lines)"
  },
  "brandColors": [
    { "hex": "#000000", "name": "Jet Black", "usage": "primary" },
    { "hex": "#BBF00A", "name": "Electric Lime", "usage": "accent" }
  ]
}

IMPORTANT for brandColors:
- Pick ONLY 4-5 colors that are the TRUE brand identity colors
- Include the background/base color if it's intentional
- Include the primary accent color (the color that stands out most)
- Each color needs: hex (uppercase), name (descriptive), usage (primary/secondary/accent/background)
- Order: primary first, then secondary, accent, background

IMPORTANT: The content includes data from multiple pages [About], [Team], [Products], [Services], [Mission & Values], etc. Use ALL of this to build a comprehensive brand profile. The brandDescription should be detailed and specific — not generic.

${socialContext ? 'IMPORTANT: Social media data is provided — use it to deeply understand the brand voice and content style. The social captions reveal the TRUE brand personality more than website copy.' : ''}`,
            });
        })() : Promise.resolve({})),

        // Brand name extraction (independent of voice analysis)
        (aiRouter ? (async () => {
            const result = await aiRouter.generateText({
                systemPrompt: 'You are a brand naming expert. Return ONLY the brand name, nothing else. No quotes, no explanation.',
                userPrompt: `Extract the actual brand name from this website info:
Page Title: "${meta.title || ''}"
URL: ${url}
Description: "${(meta.description || '').substring(0, 200)}"
OG Image URL: "${meta.ogImage || ''}"

Rules:
- Return ONLY the brand/company name (e.g., "Nike", "ACwO", "Apple")
- Remove taglines, product descriptions, separators (|, -, –)
- If unclear, extract from the domain name
- Return just the name, nothing else`,
                temperature: 0.1,
                maxTokens: 30,
            });
            return result.text?.trim().replace(/['"]/g, '') || '';
        })() : Promise.resolve('')),
    ]);

    const voiceAnalysis = voiceResult.status === 'fulfilled' ? voiceResult.value : {};
    let brandName = nameResult.status === 'fulfilled' ? nameResult.value : '';

    if (voiceResult.status === 'rejected') console.error('Voice analysis failed:', voiceResult.reason?.message);
    if (nameResult.status === 'rejected') console.error('Brand name extraction failed:', nameResult.reason?.message);

    // ── Merge brand colors: Vision > AI-curated > CSS fallback ───────────
    let namedColors;

    // Priority 1: Vision-detected colors (most accurate — from actual visual appearance)
    if (visionAnalysis?.colors?.length >= 3) {
        namedColors = visionAnalysis.colors;
        console.log(`  🎨 Using Vision-detected colors (${namedColors.length})`);
    }
    // Priority 2: AI-curated from CSS analysis
    else if (voiceAnalysis.brandColors?.length >= 3) {
        namedColors = voiceAnalysis.brandColors.map(c => ({
            hex: (c.hex || '').toUpperCase(),
            name: c.name || 'Brand Color',
            usage: c.usage || 'accent',
        }));
        console.log(`  🎨 AI selected ${namedColors.length} brand colors`);
    }
    // Priority 3: Separate focused AI call
    else if (aiRouter && cssColors.length > 0) {
        try {
            const bn = voiceAnalysis.brandName || meta.title || '';
            const colorResult = await aiRouter.analyzeText({
                text: `Website: ${url}\nBrand: ${bn}\nIndustry: ${voiceAnalysis.industry || 'unknown'}\nCSS Colors found: ${cssColors.slice(0, 15).map(c => c.hex).join(', ')}`,
                task: `Pick EXACTLY 4-5 TRUE brand identity colors from the CSS colors list.\nReturn ONLY JSON: {"brandColors": [{"hex": "#000000", "name": "Jet Black", "usage": "primary"}]}\n\nRules:\n- Pick ONLY colors that represent the brand identity (logo, accent, background)\n- Give descriptive names ("Electric Lime" not "Green")\n- usage: primary/secondary/accent/background\n- Order: primary first\n- EXCLUDE generic UI/framework colors`,
            });
            if (colorResult.brandColors?.length >= 3) {
                namedColors = colorResult.brandColors.map(c => ({
                    hex: (c.hex || '').toUpperCase(),
                    name: c.name || 'Brand Color',
                    usage: c.usage || 'accent',
                }));
                console.log(`  🎨 Separate AI call selected ${namedColors.length} brand colors`);
            }
        } catch (err) {
            console.error('Brand color curation failed:', err.message);
        }
    }

    // Final fallback: top 5 from CSS scoring
    if (!namedColors || namedColors.length < 3) {
        namedColors = cssColors.slice(0, 5).map((c, i) => ({
            hex: c.hex,
            name: `Brand Color ${i + 1}`,
            usage: i === 0 ? 'primary' : i === 1 ? 'secondary' : 'accent',
        }));
    }

    // ── Merge logo: Vision > Selector ────────────────────────────────────
    let finalLogo;
    if (visionAnalysis?.logo?.url) {
        finalLogo = {
            url: visionAnalysis.logo.url,
            allLogos: [...(visionAnalysis.logo.allLogos || []), ...selectorLogos.slice(0, 3)],
            metadata: {
                format: visionAnalysis.logo.format || '',
                source: 'ai-vision',
                confidence: 'high',
                visionDescription: visionAnalysis.logo.description || '',
            },
        };
        console.log(`  ✅ Logo source: AI Vision — ${finalLogo.url.substring(0, 80)}...`);
    } else {
        finalLogo = {
            url: selectorLogos[0]?.url || '',
            allLogos: selectorLogos.slice(0, 5),
            metadata: {
                format: selectorLogos[0]?.format || '',
                source: selectorLogos[0]?.source || 'selector',
                confidence: selectorLogos[0] ? 'medium' : 'none',
            },
        };
        if (finalLogo.url) console.log(`  ⚠️ Logo source: CSS selector fallback — ${finalLogo.url.substring(0, 80)}...`);
        else console.log('  ❌ No logo found by any method');
    }

    // Build Content Style Guide (enhanced with social context)
    const contentStyle = voiceAnalysis.contentStyle || {
        dos: ['Use clear, concise language', 'Maintain consistent brand voice', 'Include relevant CTAs'],
        donts: ['Avoid jargon', "Don't use passive voice", 'Avoid overly promotional tone'],
        keyPhrases: voiceAnalysis.keywords || [],
        writingStyle: '',
        ctaStyle: socialVoice.ctaStyle || '',
        emojiUsage: socialVoice.emojiUsage || 'minimal',
        hashtagStyle: socialVoice.hashtagStrategy || 'minimal',
        sentenceLength: 'mixed',
        captionLengthPreference: 'medium',
    };

    // Fallback: extract from domain
    if (!brandName) {
        try {
            const hostname = new URL(url).hostname.replace(/^www\./, '');
            brandName = hostname.split('.')[0];
            brandName = brandName.charAt(0).toUpperCase() + brandName.slice(1);
        } catch {
            brandName = meta.title?.split(/[|–\-—]/)[0]?.trim() || '';
        }
    }

    return {
        name: brandName,
        website: url,
        dna: {
            logo: finalLogo,
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
            socialLinks,
            socialVoice,
            bannerImages: bannerImages.slice(0, 15),
            brandImages: allImages,
            brandDescription: voiceAnalysis.brandDescription || voiceAnalysis.companyOverview || meta.description || '',
            targetAudience: voiceAnalysis.targetAudience || '',
            industry: voiceAnalysis.industry || '',
            tagline: voiceAnalysis.tagline || '',
            photographyStyle: voiceAnalysis.photographyStyle || '',
            websiteSnapshot: visionAnalysis?.screenshot || '',
            // New deep-crawl fields
            companyOverview: voiceAnalysis.companyOverview || '',
            servicesOffered: voiceAnalysis.servicesOffered || [],
            uniqueSellingPoints: voiceAnalysis.uniqueSellingPoints || [],
            missionStatement: voiceAnalysis.missionStatement || '',
            brandValues: voiceAnalysis.brandValues || [],
        },
        rawScanData: { meta, colors: namedColors, fonts, logos: selectorLogos, bannerImages, contentSamples: contentSamples.slice(0, 3) },
    };
}

// ============================================================================
// PUPPETEER CONTENT EXTRACTION — for SPA/JS-rendered websites
// ============================================================================

/**
 * Use Puppeteer to render a JS-heavy/SPA page and extract the full rendered DOM.
 * Returns rendered HTML, text content, navigation links, and keeps browser alive for reuse.
 */
async function puppeteerExtractContent(url) {
    const puppeteer = await import('puppeteer');
    
    console.log('  🌐 Launching Puppeteer for SPA content extraction...');
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
        
        // Wait for SPA content to render (reduced from 3s)
        await new Promise(r => setTimeout(r, 1500));
        
        // Scroll down to trigger lazy-loaded content
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await new Promise(r => setTimeout(r, 800));
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
        });
        await new Promise(r => setTimeout(r, 800));
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
        
        // Extract full rendered HTML
        const html = await page.content();
        
        // Extract text content summary
        const textContent = await page.evaluate(() => {
            const elements = document.querySelectorAll('h1, h2, h3, h4, p, li, span, a, td, th, blockquote, figcaption, [class*="title"], [class*="desc"], [class*="text"], [class*="content"]');
            const texts = [];
            elements.forEach(el => {
                const text = el.innerText?.trim();
                if (text && text.length > 10 && text.length < 1000) {
                    texts.push(text);
                }
            });
            return [...new Set(texts)].join('\n');
        });
        
        console.log(`  📄 Puppeteer rendered: ${html.length} chars HTML, ${textContent.length} chars text`);
        
        return {
            html,
            textContent,
            _browser: browser, // Keep alive for sub-page crawling
        };
    } catch (err) {
        await browser.close().catch(() => {});
        throw err;
    }
}

// ============================================================================
// ROBUST JSON PARSER — handles common LLM output issues
// ============================================================================

function repairAndParseJSON(text) {
    if (!text) return null;

    // Step 1: Strip markdown code blocks
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Step 2: Try direct parse first (fast path)
    try {
        return JSON.parse(cleaned);
    } catch { /* continue to repairs */ }

    // Step 3: Extract the JSON object using brace matching
    const start = cleaned.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let end = -1;
    let inString = false;
    let escape = false;

    for (let i = start; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escape) { escape = false; continue; }
        if (ch === '\\') { escape = true; continue; }
        if (ch === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
    }

    if (end === -1) {
        // Truncated JSON — close any open structures
        cleaned = cleaned.substring(start);
        const openBrackets = (cleaned.match(/\[/g) || []).length - (cleaned.match(/\]/g) || []).length;
        const openBraces = (cleaned.match(/\{/g) || []).length - (cleaned.match(/\}/g) || []).length;
        // Remove any trailing incomplete property (after last comma)
        const lastComma = cleaned.lastIndexOf(',');
        const lastClose = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
        if (lastComma > lastClose) {
            cleaned = cleaned.substring(0, lastComma);
        }
        for (let i = 0; i < openBrackets; i++) cleaned += ']';
        for (let i = 0; i < openBraces; i++) cleaned += '}';
    } else {
        cleaned = cleaned.substring(start, end + 1);
    }

    // Step 4: Try parsing the extracted JSON
    try {
        return JSON.parse(cleaned);
    } catch { /* continue to more repairs */ }

    // Step 5: Fix trailing commas (most common LLM issue)
    let repaired = cleaned.replace(/,\s*([}\]])/g, '$1');
    try {
        return JSON.parse(repaired);
    } catch { /* continue */ }

    // Step 6: Fix control characters inside strings
    repaired = repaired.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    try {
        return JSON.parse(repaired);
    } catch { /* continue */ }

    // Step 7: Nuclear option — try to extract key fields manually
    try {
        const logoMatch = repaired.match(/"matchedUrl"\s*:\s*"([^"]+)"/);
        const descMatch = repaired.match(/"description"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        const posMatch = repaired.match(/"position"\s*:\s*"([^"]+)"/);
        const styleMatch = repaired.match(/"visualStyle"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
        const photoMatch = repaired.match(/"photographyStyle"\s*:\s*"([^"]+)"/);

        // Extract colors array
        const colorsMatch = repaired.match(/"colors"\s*:\s*\[([\s\S]*?)\]/);
        let colors = [];
        if (colorsMatch) {
            const colorEntries = colorsMatch[1].matchAll(/"hex"\s*:\s*"([^"]+)"[\s\S]*?"name"\s*:\s*"([^"]+)"[\s\S]*?"usage"\s*:\s*"([^"]+)"/g);
            for (const m of colorEntries) {
                colors.push({ hex: m[1], name: m[2], usage: m[3] });
            }
        }

        if (logoMatch || colors.length > 0) {
            console.log('  🔧 Rebuilt JSON from regex extraction');
            return {
                logo: {
                    matchedUrl: logoMatch?.[1] || '',
                    description: descMatch?.[1] || '',
                    position: posMatch?.[1] || '',
                },
                colors,
                visualStyle: styleMatch?.[1] || '',
                photographyStyle: photoMatch?.[1] || '',
            };
        }
    } catch { /* ignore */ }

    console.error('  ❌ JSON repair failed completely');
    return null;
}

// ============================================================================
// PHASE 1: PUPPETEER SCREENSHOT + GEMINI VISION ANALYSIS
// ============================================================================

/**
 * Take a headless browser screenshot → send to Gemini Vision → identify logo, colors, style
 * Cross-reference with DOM images to find the actual logo URL
 */
async function captureAndAnalyze(url, allImages, selectorLogos) {
    const puppeteer = await import('puppeteer');

    console.log('  🌐 Launching Puppeteer for screenshot...');
    const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });

        // Wait a moment for lazy-loaded images and animations
        await new Promise(r => setTimeout(r, 2000));

        // Take full-page screenshot
        const fullScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: false });
        console.log(`  📸 Screenshot captured: ${Math.round(fullScreenshot.length / 1024)}KB`);

        // Take header crop (top 200px) for focused logo detection
        const headerScreenshot = await page.screenshot({
            type: 'jpeg', quality: 85,
            clip: { x: 0, y: 0, width: 1440, height: 200 },
        });
        console.log(`  📸 Header crop captured: ${Math.round(headerScreenshot.length / 1024)}KB`);

        await browser.close();

        // ── Send to Gemini Vision ─────────────────────────────────────────
        const apiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn('  ⚠️ No Gemini API key — skipping vision analysis');
            return null;
        }

        // Build image list for cross-referencing
        const imageList = [
            ...selectorLogos.map(l => `[SELECTOR-LOGO] ${l.url} (source: ${l.source})`),
            ...allImages.slice(0, 15).map(img => `[PAGE-IMAGE] ${img.url} (alt: ${img.alt || 'none'})`),
        ].join('\n');

        const visionPrompt = `You are a brand identity expert. Analyze these screenshots of a website homepage.

IMAGE 1: Full homepage screenshot (1440x900 viewport)
IMAGE 2: Header/navigation crop (top 200px — where logos usually are)

TASK 1 — LOGO IDENTIFICATION:
Look at the HEADER/NAVIGATION area ONLY (top 100-200px). Identify the ACTUAL brand logo of the website owner. It's usually:
- In the top-left or center of the navigation bar
- The most prominent brand mark/wordmark in the header
- NOT a generic icon, social media icon, or navigation element

⚠️ CRITICAL WARNING: Many websites display CLIENT logos, PARTNER logos, or "Trusted By" logos in their body sections. These are NOT the website's own logo! Ignore ANY logos outside the header/navigation. Only pick the logo that represents the WEBSITE OWNER (the company whose website this is).

Describe the logo precisely: what it looks like, its colors, any text in it, and its approximate position.

Then, from this list of images found on the page, identify which URL is the ACTUAL logo:
${imageList}

Pick the URL that BEST matches the logo you see IN THE HEADER/NAVIGATION BAR. Prefer images tagged as [SELECTOR-LOGO] from header/nav sources. Do NOT pick images from client/partner sections.

TASK 2 — BRAND COLORS:
Look at the VISUAL appearance of the website. Identify the 4-5 TRUE brand colors:
- Primary color (headers, buttons, accents)
- Secondary color (backgrounds, sections)
- Any accent/highlight colors
- Base/background color if intentional

TASK 3 — VISUAL STYLE:
Describe the overall visual style in 2-3 sentences.

Return ONLY valid JSON:
{
  "logo": {
    "matchedUrl": "the URL from the list above that IS the logo, or empty string if none match",
    "description": "what the logo looks like",
    "position": "top-left / center / top-right"
  },
  "colors": [
    { "hex": "#RRGGBB", "name": "Descriptive Name", "usage": "primary" }
  ],
  "visualStyle": "2-3 sentence description of the visual design style",
  "photographyStyle": "flat lay / lifestyle / studio / UGC / mixed"
}`;

        // Use current, working Gemini models for text+image analysis
        const models = ['gemini-1.5-flash-latest', 'gemini-1.5-pro-latest'];
        let visionResult = null;

        for (const modelId of models) {
            try {
                console.log(`  🔍 Trying Vision model: ${modelId}...`);
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: visionPrompt },
                                    { inlineData: { mimeType: 'image/jpeg', data: fullScreenshot.toString('base64') } },
                                    { inlineData: { mimeType: 'image/jpeg', data: headerScreenshot.toString('base64') } },
                                ],
                            }],
                            generationConfig: {
                                temperature: 0.2,
                                maxOutputTokens: 4096,
                                responseMimeType: 'application/json',
                            },
                        }),
                    }
                );

                const data = await response.json();
                if (data.error) {
                    console.warn(`  ⚠️ Vision model ${modelId} failed:`, data.error.message);
                    // If quota error, skip to next model
                    if (data.error.message?.includes('quota') || data.error.message?.includes('Quota') || data.error.status === 'RESOURCE_EXHAUSTED') {
                        continue;
                    }
                    continue;
                }

                const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (!rawText) {
                    console.warn(`  ⚠️ Vision model ${modelId}: empty response`);
                    continue;
                }

                console.log(`  📝 Vision raw response (${rawText.length} chars) from ${modelId}`);

                // Robust JSON parsing with repair
                visionResult = repairAndParseJSON(rawText);
                if (visionResult) {
                    console.log(`  🧠 Vision analysis complete (model: ${modelId})`);
                    break;
                } else {
                    console.warn(`  ⚠️ Vision model ${modelId}: could not parse JSON from response`);
                    console.warn(`  📝 Raw text preview: ${rawText.substring(0, 200)}...`);
                }
            } catch (err) {
                console.warn(`  ⚠️ Vision model ${modelId} error:`, err.message);
                continue;
            }
        }

        if (!visionResult) return null;

        // ── Cross-reference: find the best logo URL ─────────────────────
        const result = { logo: null, colors: [], visualStyle: visionResult.visualStyle || '' };

        // Logo matching
        if (visionResult.logo?.matchedUrl) {
            const matchedUrl = visionResult.logo.matchedUrl;
            // Verify it's a real URL from our list
            const isFromList = [...selectorLogos, ...allImages].some(img => img.url === matchedUrl);
            if (isFromList) {
                result.logo = {
                    url: matchedUrl,
                    description: visionResult.logo.description || '',
                    format: matchedUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'image',
                    allLogos: selectorLogos.slice(0, 3).map(l => ({ url: l.url, source: l.source })),
                };
            }
        }

        // If Vision couldn't match to a URL, try fuzzy matching by description
        if (!result.logo && visionResult.logo?.description) {
            // Check if any selector logo's alt text or filename matches the vision description
            for (const logo of selectorLogos) {
                const urlLower = logo.url.toLowerCase();
                const descLower = (visionResult.logo.description || '').toLowerCase();
                // Simple heuristic: if the URL contains words from the description
                const descWords = descLower.split(/\s+/).filter(w => w.length > 3);
                const matches = descWords.filter(w => urlLower.includes(w));
                if (matches.length >= 1) {
                    result.logo = {
                        url: logo.url,
                        description: visionResult.logo.description,
                        format: logo.format || 'image',
                        allLogos: selectorLogos.slice(0, 3).map(l => ({ url: l.url, source: l.source })),
                    };
                    break;
                }
            }
        }

        // If still no match, use the first selector logo with vision metadata
        if (!result.logo && selectorLogos.length > 0) {
            result.logo = {
                url: selectorLogos[0].url,
                description: visionResult.logo?.description || '',
                format: selectorLogos[0].format || 'image',
                allLogos: selectorLogos.slice(0, 3).map(l => ({ url: l.url, source: l.source })),
            };
        }

        // Colors from vision
        if (visionResult.colors?.length > 0) {
            result.colors = visionResult.colors.map(c => ({
                hex: (c.hex || '').toUpperCase(),
                name: c.name || 'Brand Color',
                usage: c.usage || 'accent',
            }));
        }

        // Include screenshot for frontend display
        result.screenshot = `data:image/jpeg;base64,${fullScreenshot.toString('base64')}`;

        return result;
    } catch (err) {
        await browser.close().catch(() => {});
        throw err;
    }
}

// ============================================================================
// PHASE 2: SOCIAL MEDIA INTELLIGENCE
// ============================================================================

/**
 * Extract social media links from the website HTML
 */
function extractSocialLinks($, baseUrl) {
    const links = {
        instagram: '',
        facebook: '',
        twitter: '',
        linkedin: '',
        youtube: '',
        pinterest: '',
    };

    const patterns = {
        instagram: /(?:instagram\.com|instagr\.am)\/([a-zA-Z0-9._]+)/,
        facebook: /(?:facebook\.com|fb\.com)\/([a-zA-Z0-9.]+)/,
        twitter: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/,
        linkedin: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9-]+)/,
        youtube: /youtube\.com\/(?:c\/|channel\/|@)?([a-zA-Z0-9_-]+)/,
        pinterest: /pinterest\.com\/([a-zA-Z0-9_]+)/,
    };

    // Scan all <a> tags for social links
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        for (const [platform, regex] of Object.entries(patterns)) {
            if (!links[platform] && regex.test(href)) {
                links[platform] = href.startsWith('http') ? href : `https://${href}`;
            }
        }
    });

    return links;
}

/**
 * Analyze social media profiles for content patterns and voice
 */
async function analyzeSocialMedia(socialLinks, aiRouter) {
    const result = {
        captionStyle: '',
        hashtagStrategy: '',
        emojiUsage: '',
        ctaStyle: '',
        postingPatterns: '',
        sampleCaptions: [],
    };

    // Try to scrape Instagram (most informative for brand voice)
    const platformsToAnalyze = [];

    if (socialLinks.instagram) platformsToAnalyze.push({ platform: 'Instagram', url: socialLinks.instagram });
    if (socialLinks.facebook) platformsToAnalyze.push({ platform: 'Facebook', url: socialLinks.facebook });
    if (socialLinks.twitter) platformsToAnalyze.push({ platform: 'Twitter/X', url: socialLinks.twitter });
    if (socialLinks.linkedin) platformsToAnalyze.push({ platform: 'LinkedIn', url: socialLinks.linkedin });

    const socialContent = [];

    for (const { platform, url } of platformsToAnalyze.slice(0, 3)) {
        try {
            const controller = new AbortController();
            if (typeof controller.signal.setMaxListeners === 'function') {
                controller.signal.setMaxListeners(30);
            }
            const timeout = setTimeout(() => controller.abort(), 10000);
            const resp = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
                signal: controller.signal,
                redirect: 'follow',
            });
            clearTimeout(timeout);

            if (resp.ok) {
                const html = await resp.text();
                const $ = cheerio.load(html);

                // Extract text content — meta descriptions, visible text, JSON-LD
                const metaDesc = $('meta[name="description"]').attr('content') || '';
                const ogDesc = $('meta[property="og:description"]').attr('content') || '';
                const title = $('title').text() || '';

                // Look for JSON-LD structured data (common on social profiles)
                let jsonLdContent = '';
                $('script[type="application/ld+json"]').each((_, el) => {
                    try {
                        const data = JSON.parse($(el).text());
                        if (data.description) jsonLdContent += data.description + '\n';
                        if (data.articleBody) jsonLdContent += data.articleBody + '\n';
                    } catch { /* ignore */ }
                });

                // Extract any visible captions or post text
                const visibleText = [];
                $('article, [class*="caption"], [class*="post"], [class*="content"]').each((_, el) => {
                    const text = $(el).text().trim();
                    if (text.length > 20 && text.length < 500) visibleText.push(text);
                });

                const content = [
                    metaDesc && `[${platform} Bio] ${metaDesc}`,
                    ogDesc && ogDesc !== metaDesc && `[${platform} OG] ${ogDesc}`,
                    jsonLdContent && `[${platform} Content] ${jsonLdContent.substring(0, 500)}`,
                    ...visibleText.slice(0, 5).map(t => `[${platform} Post] ${t}`),
                ].filter(Boolean);

                if (content.length > 0) {
                    socialContent.push(...content);
                    console.log(`    📱 ${platform}: extracted ${content.length} content pieces`);
                }
            }
        } catch (err) {
            console.warn(`    ⚠️ ${platform} fetch failed:`, err.message);
        }
    }

    // Use AI to analyze social content patterns
    if (socialContent.length > 0 && aiRouter) {
        try {
            const analysis = await aiRouter.analyzeText({
                text: socialContent.join('\n\n'),
                task: `Analyze these social media content samples from a brand. Return ONLY valid JSON:
{
  "captionStyle": "1 sentence describing how captions are written",
  "hashtagStrategy": "how many hashtags, branded vs trending",
  "emojiUsage": "none/minimal/moderate/heavy — with examples of commonly used emojis",
  "ctaStyle": "how the brand asks for action — DM us, Shop Now, Link in bio, etc.",
  "postingPatterns": "what kind of content they post — product shots, lifestyle, UGC, behind-the-scenes",
  "sampleCaptions": ["3-5 example captions that capture their style (from the content above)"],
  "toneInsight": "1-2 sentences about how the brand sounds different on social vs website"
}`,
            });
            Object.assign(result, analysis);
        } catch (err) {
            console.warn('    ⚠️ Social voice AI analysis failed:', err.message);
        }
    }

    return result;
}

// ============================================================================
// PHASE 3: SUB-PAGE CRAWLING
// ============================================================================

/**
 * Deep multi-page crawl — extracts content from About, Team, Products, Services, Values, etc.
 * Supports SPA sites via shared Puppeteer browser instance.
 */
async function crawlSubPages($, baseUrl, isSPA = false, sharedBrowser = null) {
    const subPageContent = [];

    // ── Discover important sub-page links ────────────────────────────────
    const importantPaths = [];
    const seen = new Set();
    
    // Much broader keyword matching for page discovery
    const importantKeywords = /about|story|our-story|mission|vision|values|products|services|what-we-do|who-we-are|philosophy|team|people|founders|leadership|careers|work|portfolio|gallery|clients|partners|brands|testimonials|reviews|blog|news|contact|faq|pricing|capabilities|approach|process|expertise|solutions|industries|overview|company/i;
    
    // Category labels for content tagging
    const categoryMap = {
        about: 'About', story: 'About', 'our-story': 'About', 'who-we-are': 'About', company: 'About', overview: 'About',
        mission: 'Mission & Values', vision: 'Mission & Values', values: 'Mission & Values', philosophy: 'Mission & Values',
        team: 'Team', people: 'Team', founders: 'Team', leadership: 'Team',
        products: 'Products', services: 'Services', solutions: 'Services', capabilities: 'Services', expertise: 'Services',
        portfolio: 'Portfolio', work: 'Portfolio', gallery: 'Portfolio', 'what-we-do': 'Portfolio',
        clients: 'Clients', partners: 'Clients', brands: 'Clients', testimonials: 'Clients', reviews: 'Clients',
        blog: 'Blog', news: 'Blog',
        careers: 'Careers',
        contact: 'Contact', faq: 'FAQ', pricing: 'Pricing',
        approach: 'Approach', process: 'Approach', industries: 'Industries',
    };
    
    function getCategoryLabel(href, text) {
        const combined = `${href} ${text}`.toLowerCase();
        for (const [keyword, label] of Object.entries(categoryMap)) {
            if (combined.includes(keyword)) return label;
        }
        return 'Page';
    }

    // Scan ALL links on the page (not just nav/header/footer)
    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const text = $(el).text().trim().toLowerCase();
        
        // Check if link text or href matches important keywords
        if (!importantKeywords.test(href) && !importantKeywords.test(text)) return;
        
        let fullUrl;
        try {
            fullUrl = new URL(href, baseUrl).href;
        } catch { return; }
        
        // Only same-domain links
        try {
            if (new URL(fullUrl).hostname !== new URL(baseUrl).hostname) return;
        } catch { return; }
        
        // Skip anchors, assets, and duplicates
        if (fullUrl.includes('#') && fullUrl.split('#')[0] === baseUrl) return;
        if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js|mp4|mp3|zip)$/i.test(fullUrl)) return;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);
        
        const label = getCategoryLabel(href, text);
        importantPaths.push({ url: fullUrl, label, linkText: text || href });
    });
    
    // Prioritize: About → Team → Products → Services → Mission → Others
    const priority = ['About', 'Team', 'Products', 'Services', 'Mission & Values', 'Portfolio', 'Clients', 'Blog'];
    importantPaths.sort((a, b) => {
        const aIdx = priority.indexOf(a.label);
        const bIdx = priority.indexOf(b.label);
        return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
    });

    // SPA sites: limit to 5 pages (Puppeteer is slower), non-SPA: 8 pages
    const maxPages = isSPA ? 5 : 8;
    console.log(`    🔗 Found ${importantPaths.length} important sub-pages, crawling up to ${maxPages}`);

    // ── Crawl up to 8 sub-pages ──────────────────────────────────────────
    for (const { url: pageUrl, label, linkText } of importantPaths.slice(0, maxPages)) {
        try {
            console.log(`    📄 Crawling [${label}]: ${linkText} (${pageUrl.substring(0, 70)}...)`);
            
            let pageHtml = '';
            
            if (isSPA && sharedBrowser) {
                // Use Puppeteer for SPA sub-pages
                try {
                    const page = await sharedBrowser.newPage();
                    await page.setViewport({ width: 1440, height: 900 });
                    await page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 15000 });
                    await new Promise(r => setTimeout(r, 1000)); // wait for SPA render
                    
                    // Scroll to trigger lazy content
                    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                    await new Promise(r => setTimeout(r, 500));
                    
                    pageHtml = await page.content();
                    await page.close();
                } catch (puppErr) {
                    console.warn(`    ⚠️ Puppeteer sub-page failed, falling back to fetch: ${puppErr.message}`);
                }
            }
            
            // Fallback to fetch for non-SPA or if Puppeteer failed
            if (!pageHtml) {
                const controller = new AbortController();
                if (typeof controller.signal.setMaxListeners === 'function') {
                    controller.signal.setMaxListeners(30);
                }
                const timeout = setTimeout(() => controller.abort(), 15000);
                const resp = await fetch(pageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                        'Accept': 'text/html',
                    },
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                
                if (resp.ok) {
                    pageHtml = await resp.text();
                }
            }
            
            if (!pageHtml) continue;
            
            const sub$ = cheerio.load(pageHtml);
            
            // Extract META description
            const metaDesc = sub$('meta[name="description"]').attr('content') || '';
            if (metaDesc && metaDesc.length > 20) {
                subPageContent.push(`[${label} - Meta] ${metaDesc}`);
            }
            
            // Extract headings, paragraphs, lists, blockquotes
            sub$('h1, h2, h3, h4, p, li, blockquote, figcaption, dd, [class*="description"], [class*="bio"], [class*="intro"], [class*="summary"]').each((_, el) => {
                const text = sub$(el).text().trim();
                if (text.length > 15 && text.length < 1000) {
                    // Deduplicate
                    const entry = `[${label}] ${text}`;
                    if (!subPageContent.includes(entry)) {
                        subPageContent.push(entry);
                    }
                }
            });
            
            // Extract JSON-LD structured data
            sub$('script[type="application/ld+json"]').each((_, el) => {
                try {
                    const data = JSON.parse(sub$(el).text());
                    if (data.description) subPageContent.push(`[${label} - Schema] ${data.description}`);
                    if (data.name && data['@type']) subPageContent.push(`[${label} - Schema] ${data['@type']}: ${data.name}`);
                    // Extract team members from Person schema
                    if (data['@type'] === 'Person') {
                        subPageContent.push(`[Team Member] ${data.name}${data.jobTitle ? ' — ' + data.jobTitle : ''}`);
                    }
                    // Extract organization info
                    if (data['@type'] === 'Organization') {
                        if (data.description) subPageContent.push(`[Company] ${data.description}`);
                        if (data.slogan) subPageContent.push(`[Tagline] ${data.slogan}`);
                        if (data.foundingDate) subPageContent.push(`[Founded] ${data.foundingDate}`);
                    }
                    // Handle arrays (e.g. ItemList, FAQ)
                    if (Array.isArray(data['@graph'])) {
                        for (const item of data['@graph'].slice(0, 10)) {
                            if (item.description) subPageContent.push(`[${label} - Schema] ${item.description}`);
                        }
                    }
                } catch { /* ignore malformed JSON-LD */ }
            });
            
        } catch (err) {
            console.warn(`    ⚠️ Sub-page crawl failed for ${label}:`, err.message);
        }
    }

    return subPageContent.slice(0, 80); // Cap at 80 content pieces (was 30)
}

// ============================================================================
// FETCH PAGE
// ============================================================================

async function fetchPage(url) {
    try {
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

        const controller = new AbortController();
        if (typeof controller.signal.setMaxListeners === 'function') {
            controller.signal.setMaxListeners(30);
        }
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
            return `<!-- Error: Website returned ${response.status} -->`;
        }
        return await response.text();
    } catch (error) {
        console.warn(`[fetchPage] Failed to reach ${url}:`, error.message);
        if (error.name === 'AbortError') {
            return `<!-- Error: Website took too long to respond -->`;
        }
        return `<!-- Error: Failed to reach website ${error.message} -->`;
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
                if (typeof controller.signal.setMaxListeners === 'function') {
                    controller.signal.setMaxListeners(30);
                }
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
            // SKIP images inside client/partner/testimonial sections
            // These are NOT the brand's own logo — they're client logos
            const parentHtml = $(el).parents().map((_, p) => {
                const cls = ($(p).attr('class') || '').toLowerCase();
                const id = ($(p).attr('id') || '').toLowerCase();
                return cls + ' ' + id;
            }).get().join(' ');
            const isClientSection = /\b(client|partner|trusted|customer|testimonial|sponsor|carousel|slider|marquee|brand[s]?-logo|our-client|our-partner)\b/.test(parentHtml);
            
            const tag = el.tagName?.toLowerCase();
            if (tag === 'svg') {
                // Inline SVG → encode as data URI
                const svgHtml = $.html(el);
                if (svgHtml.length < 50000) {
                    found.push({
                        url: `data:image/svg+xml;base64,${Buffer.from(svgHtml).toString('base64')}`,
                        source: 'inline-svg', format: 'svg',
                        priority: isClientSection ? 8 : 1, // Deprioritize client section logos
                    });
                }
            } else {
                const src = resolveUrl($(el).attr('src'), baseUrl);
                const srcset = $(el).attr('srcset');
                if (src) {
                    const format = src.split('?')[0].split('.').pop()?.toLowerCase() || 'unknown';
                    found.push({
                        url: src, source: isClientSection ? 'client-logo' : 'logo-selector',
                        format, priority: isClientSection ? 8 : 1,
                    });
                }
                // Also check srcset for high-res logos
                if (srcset) {
                    const bestSrc = srcset.split(',').pop()?.trim().split(/\s+/)[0];
                    const resolved = resolveUrl(bestSrc, baseUrl);
                    if (resolved) found.push({
                        url: resolved, source: isClientSection ? 'client-logo-srcset' : 'logo-srcset',
                        format: 'image', priority: isClientSection ? 8 : 2,
                    });
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
