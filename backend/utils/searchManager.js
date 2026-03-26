import axios from 'axios';

/**
 * Perform a web search — Grok first, then Perplexity, then Gemini.
 * @param {string} query - The search query
 * @returns {Promise<string>} - Research results text
 */
async function searchWeb(query, brandContext = '') {
    // Extract the core product/brand name from the query (before "product details...")
    const coreName = query.replace(/\b(product|details|features|specifications|pricing|India|INR|₹|USD|\$|GBP|£|AED|CAD)\b/gi, '').replace(/\s+/g, ' ').trim();
    
    const enhancedPrompt = `Research the EXACT product/brand: "${coreName}"

CRITICAL: "${coreName}" is the EXACT brand/product name the user specified. Do NOT confuse it with other brands or products with similar names. Search for this SPECIFIC product.
${brandContext ? `\nBrand context: ${brandContext}` : ''}

Return ONLY factual information you find via web search:
- Full official product name
- Brand/manufacturer
- Product category (earbuds, phone, speaker, etc.)
- Key features and specifications  
- Pricing in local currency
- Target audience
- Design and color options
- Where to buy (official site, Amazon, Flipkart, etc.)

If you cannot find this exact product, say so clearly. Do NOT return information about a different product.`;

    // ── Strategy 1: Gemini with Google Search grounding — PRIMARY — real web search ──
    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            console.log(`[SearchManager] 🔍 Gemini + Google Search for: "${coreName}"`);
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    contents: [{
                        parts: [{ text: enhancedPrompt }]
                    }],
                    tools: [{ googleSearch: {} }],
                    generationConfig: { temperature: 0.0, maxOutputTokens: 1000 }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            const text = response.data?.candidates?.[0]?.content?.parts
                ?.map(p => p.text).filter(Boolean).join('\n') || '';
            if (text.length > 50) {
                console.log(`[SearchManager] ✅ Gemini search success (${text.length} chars)`);
                return text;
            }
        }
    } catch (error) {
        console.warn('[SearchManager] Gemini search failed:', error.response?.data?.error?.message || error.message);
    }

    // ── Strategy 2: Perplexity (fallback) ──
    try {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (apiKey) {
            console.log('[SearchManager] 🔄 Perplexity fallback');
            const response = await axios.post('https://api.perplexity.ai/chat/completions', {
                model: 'sonar',
                messages: [
                    { role: 'system', content: 'You are a precise product research agent. Search for the EXACT product name given. Do not confuse with similarly named products.' },
                    { role: 'user', content: enhancedPrompt }
                ],
                max_tokens: 600,
                temperature: 0.0
            }, {
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
            });

            const content = response.data?.choices?.[0]?.message?.content || '';
            if (content.length > 50) {
                console.log('[SearchManager] ✅ Perplexity search success');
                return content;
            }
        }
    } catch (error) {
        console.warn('[SearchManager] Perplexity failed:', error.response?.data?.error?.message || error.message);
    }

    // ── Strategy 3: Grok (last fallback — limited to X/Twitter data) ──
    try {
        const grokKey = process.env.GROK_API_KEY;
        if (grokKey) {
            console.log(`[SearchManager] 🔄 Grok fallback for: "${coreName}"`);
            const response = await axios.post('https://api.x.ai/v1/chat/completions', {
                model: 'grok-3-mini',
                messages: [
                    { role: 'system', content: 'You are a product research agent with real-time web access. You MUST search the web for the EXACT product name given. Never guess or return information about a different product.' },
                    { role: 'user', content: enhancedPrompt }
                ],
                search_mode: 'auto',
                max_tokens: 1000,
                temperature: 0.0
            }, {
                headers: {
                    'Authorization': `Bearer ${grokKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data?.choices?.[0]?.message?.content || '';
            if (content.length > 50) {
                console.log(`[SearchManager] ✅ Grok search success (${content.length} chars)`);
                return content;
            }
        }
    } catch (error) {
        console.warn('[SearchManager] Grok search failed:', error.response?.data?.error?.message || error.message);
    }

    return `Could not search for: "${query}". All search providers unavailable.`;
}

/**
 * Search for real product/brand images from the web.
 * Strategy: Grok → Perplexity → Unsplash → Pixabay
 * 
 * @param {string} query - e.g. "ACWO DwOTS Sense earbuds"
 * @param {number} maxImages - Maximum number of image URLs to return
 * @returns {Promise<{images: Array<{url: string, alt: string, source: string}>, query: string}>}
 */
async function searchBrandImages(query, maxImages = 6) {
    const images = [];

    // ── Strategy 1: Gemini with Google Search — extract REAL URLs from grounding metadata ──
    try {
        const geminiKey = process.env.GEMINI_API_KEY;
        if (geminiKey) {
            console.log(`[SearchManager] 🖼️ Gemini image search: "${query}"`);
            const response = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    contents: [{
                        parts: [{ text: `Find product images for: "${query}"

Search Amazon India, Flipkart, and the brand's official website for this exact product.
Return the direct image URLs you find (CDN URLs from m.media-amazon.com, rukminim2.flixcart.com, etc).
List each image URL on a separate line. Only return URLs of this EXACT product.` }]
                    }],
                    tools: [{ googleSearch: {} }],
                    generationConfig: { temperature: 0.0, maxOutputTokens: 600 }
                },
                { headers: { 'Content-Type': 'application/json' } }
            );

            // Extract image URLs from TEXT response
            const text = response.data?.candidates?.[0]?.content?.parts
                ?.map(p => p.text).filter(Boolean).join('\n') || '';
            
            // Try JSON array first
            try {
                const jsonMatch = text.match(/\[[\s\S]*?\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    for (const img of parsed) {
                        if (img.url && img.url.startsWith('http')) {
                            images.push({ url: img.url, alt: img.alt || query, source: 'gemini-text' });
                        }
                    }
                }
            } catch { /* not JSON, try raw URLs */ }

            // Extract direct image URLs from text
            if (images.length === 0) {
                const urlMatches = text.match(/https?:\/\/[^\s"'\]>)]+\.(?:jpg|jpeg|png|webp|gif)[^\s"'\]>)]*/gi) || [];
                for (const url of urlMatches.slice(0, maxImages)) {
                    images.push({ url: url.replace(/[)\]}]+$/, ''), alt: query, source: 'gemini-text-url' });
                }
            }

            // ALSO extract from grounding metadata — these are REAL web source URLs
            const groundingMeta = response.data?.candidates?.[0]?.groundingMetadata;
            if (groundingMeta?.groundingChunks) {
                for (const chunk of groundingMeta.groundingChunks) {
                    // Direct image URL from grounding
                    if (chunk.web?.image_url) {
                        images.push({ url: chunk.web.image_url, alt: chunk.web.title || query, source: 'grounding-image' });
                    }
                    // Web page URL — check if it's an e-commerce product page with images
                    if (chunk.web?.uri) {
                        const uri = chunk.web.uri;
                        // Extract Amazon/Flipkart product image CDN URLs from the URI patterns
                        if (uri.includes('m.media-amazon.com') || uri.includes('images-eu.ssl-images-amazon.com')) {
                            images.push({ url: uri, alt: chunk.web.title || query, source: 'grounding-amazon' });
                        }
                        if (uri.includes('rukminim2.flixcart.com') || uri.includes('rukminim1.flixcart.com')) {
                            images.push({ url: uri, alt: chunk.web.title || query, source: 'grounding-flipkart' });
                        }
                    }
                }
            }

            console.log(`[SearchManager] ↳ Gemini returned ${images.length} image URLs (text: ${images.filter(i => i.source.includes('text')).length}, grounding: ${images.filter(i => i.source.includes('grounding')).length})`);
        }
    } catch (err) {
        console.warn('[SearchManager] Gemini image search failed:', err.response?.data?.error?.message || err.message);
    }

    // ── Strategy 1.5: Product page scraper — fetch actual page HTML and extract <img> tags ──
    if (images.length < maxImages) {
        try {
            const geminiKey = process.env.GEMINI_API_KEY;
            if (geminiKey) {
                console.log(`[SearchManager] 🔗 Finding product page URL for: "${query}"`);
                const pageResp = await axios.post(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                    {
                        contents: [{
                            parts: [{ text: `Find the official product page URL for: "${query}". Search on the brand's official website, Amazon India, or Flipkart. Return ONLY the single most relevant product page URL, nothing else. Just the URL.` }]
                        }],
                        tools: [{ googleSearch: {} }],
                        generationConfig: { temperature: 0.0, maxOutputTokens: 200 }
                    },
                    { headers: { 'Content-Type': 'application/json' } }
                );

                // Extract product page URLs from grounding metadata AND text
                const productPageUrls = [];
                const gm = pageResp.data?.candidates?.[0]?.groundingMetadata;
                if (gm?.groundingChunks) {
                    for (const chunk of gm.groundingChunks) {
                        if (chunk.web?.uri && (
                            chunk.web.uri.includes('amazon.') || chunk.web.uri.includes('flipkart.') ||
                            chunk.web.uri.includes('/products/') || chunk.web.uri.includes('/dp/')
                        )) {
                            productPageUrls.push(chunk.web.uri);
                        }
                    }
                }
                const textUrl = (pageResp.data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '').match(/https?:\/\/[^\s"'<>]+/);
                if (textUrl) productPageUrls.push(textUrl[0]);

                // Scrape each product page for images
                for (const pageUrl of productPageUrls.slice(0, 2)) {
                    if (images.length >= maxImages) break;
                    try {
                        console.log(`   🌐 Scraping product page: ${pageUrl.substring(0, 80)}...`);
                        const htmlResp = await fetch(pageUrl, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'text/html,application/xhtml+xml',
                            },
                            redirect: 'follow',
                        });
                        if (!htmlResp.ok) continue;
                        const html = await htmlResp.text();

                        // Extract product image URLs from HTML
                        const imgUrls = new Set();
                        // Shopify CDN images
                        const shopifyMatches = html.match(/https?:\/\/[^"'\s]+\.(?:shopify\.com|shopifycdn\.com)\/[^"'\s]+\.(?:jpg|jpeg|png|webp)[^"'\s]*/gi) || [];
                        shopifyMatches.forEach(u => imgUrls.add(u.split('?')[0]));
                        // Amazon CDN images
                        const amazonMatches = html.match(/https?:\/\/m\.media-amazon\.com\/images\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi) || [];
                        amazonMatches.forEach(u => imgUrls.add(u));
                        // Flipkart CDN images
                        const flipkartMatches = html.match(/https?:\/\/rukminim[12]\.flixcart\.com\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi) || [];
                        flipkartMatches.forEach(u => imgUrls.add(u));
                        // Generic product images (from og:image, product JSON-LD, etc)
                        const ogImage = html.match(/property="og:image"\s+content="([^"]+)"/i);
                        if (ogImage) imgUrls.add(ogImage[1]);
                        // Shopify CDN from the brand's own domain
                        const brandCdnMatches = html.match(/https?:\/\/[^"'\s]+\/cdn\/shop\/(?:files|products)\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi) || [];
                        brandCdnMatches.forEach(u => imgUrls.add(u.split('?')[0]));

                        const filtered = [...imgUrls]
                            .filter(u => !u.includes('logo') && !u.includes('icon') && !u.includes('favicon') && u.length > 30)
                            .slice(0, maxImages - images.length);

                        console.log(`   📸 Scraped ${filtered.length} product images from page`);
                        for (const url of filtered) {
                            images.push({ url, alt: query, source: `scraped-${new URL(pageUrl).hostname}` });
                        }
                    } catch (e) {
                        console.warn(`   ⚠️ Page scrape failed: ${e.message}`);
                    }
                }
            }
        } catch (err) {
            console.warn('[SearchManager] Product page scraper failed:', err.message);
        }
    }

    // ── Strategy 2: Grok fallback ──
    if (images.length < maxImages) {
        try {
            const grokKey = process.env.GROK_API_KEY;
            if (grokKey) {
                console.log(`[SearchManager] 🖼️ Grok image fallback: "${query}"`);
                const response = await axios.post('https://api.x.ai/v1/chat/completions', {
                    model: 'grok-3-mini',
                    messages: [
                        { role: 'system', content: 'Find DIRECT image URLs for the exact product given. Return ONLY a JSON array: [{"url": "https://...", "alt": "..."}]. Search Amazon India, Flipkart. Return empty array if not found.' },
                        { role: 'user', content: `Find real product photos for: "${query}"` }
                    ],
                    search_mode: 'auto',
                    max_tokens: 600,
                    temperature: 0.0
                }, {
                    headers: { 'Authorization': `Bearer ${grokKey}`, 'Content-Type': 'application/json' }
                });

                const text = response.data?.choices?.[0]?.message?.content || '';
                try {
                    const jsonMatch = text.match(/\[[\s\S]*?\]/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        for (const img of parsed) {
                            if (img.url && img.url.startsWith('http')) {
                                images.push({ url: img.url, alt: img.alt || query, source: 'grok' });
                            }
                        }
                    }
                } catch {
                    const urlMatches = text.match(/https?:\/\/[^\s"'\]>]+\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
                    for (const url of urlMatches.slice(0, maxImages)) {
                        images.push({ url, alt: query, source: 'grok-raw' });
                    }
                }
                console.log(`[SearchManager] ↳ Grok added ${images.length} images`);
            }
        } catch (err) {
            console.warn('[SearchManager] Grok image search failed:', err.response?.data?.error?.message || err.message);
        }
    }

    // ── Strategy 3: Perplexity fallback ──
    if (images.length < maxImages) {
        try {
            const apiKey = process.env.PERPLEXITY_API_KEY;
            if (apiKey) {
                console.log(`[SearchManager] 🖼️ Perplexity image fallback: "${query}"`);
                const response = await axios.post('https://api.perplexity.ai/chat/completions', {
                    model: 'sonar',
                    messages: [
                        { role: 'system', content: 'Find and return DIRECT image URLs (ending in .jpg, .png, .webp) for the product. Return ONLY a JSON array: [{"url": "https://...", "alt": "description"}]. Prefer official brand images.' },
                        { role: 'user', content: `Find real product images for: ${query}` }
                    ],
                    max_tokens: 600,
                    temperature: 0.1
                }, {
                    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
                });

                const text = response.data?.choices?.[0]?.message?.content || '';
                try {
                    const jsonMatch = text.match(/\[[\s\S]*?\]/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        for (const img of parsed) {
                            if (img.url && img.url.startsWith('http')) {
                                images.push({ url: img.url, alt: img.alt || query, source: 'perplexity' });
                            }
                        }
                    }
                } catch {
                    const urlMatches = text.match(/https?:\/\/[^\s"'\]>]+\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
                    for (const url of urlMatches.slice(0, maxImages)) {
                        images.push({ url, alt: query, source: 'perplexity-raw' });
                    }
                }
                console.log(`[SearchManager] ↳ Perplexity added ${images.length} images`);
            }
        } catch (err) {
            console.warn('[SearchManager] Perplexity image search failed:', err.message);
        }
    }

    // ── Strategy 3: Unsplash ──
    if (images.length < maxImages) {
        try {
            const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
            if (unsplashKey) {
                console.log(`[SearchManager] 🖼️ Unsplash fallback: "${query}"`);
                const resp = await axios.get('https://api.unsplash.com/search/photos', {
                    params: { query, per_page: maxImages - images.length, orientation: 'squarish' },
                    headers: { 'Authorization': `Client-ID ${unsplashKey}` }
                });
                for (const photo of (resp.data?.results || [])) {
                    images.push({
                        url: photo.urls?.regular || photo.urls?.small,
                        alt: photo.alt_description || query,
                        source: 'unsplash'
                    });
                }
                console.log(`[SearchManager] ↳ Unsplash added ${resp.data?.results?.length || 0} images`);
            }
        } catch (err) {
            console.warn('[SearchManager] Unsplash failed:', err.message);
        }
    }

    // ── Strategy 4: Pixabay ──
    if (images.length < maxImages) {
        try {
            const pixabayKey = process.env.PIXABAY_API_KEY;
            if (pixabayKey) {
                console.log(`[SearchManager] 🖼️ Pixabay fallback: "${query}"`);
                const resp = await axios.get('https://pixabay.com/api/', {
                    params: { key: pixabayKey, q: query, per_page: maxImages - images.length, image_type: 'photo' }
                });
                for (const hit of (resp.data?.hits || [])) {
                    images.push({
                        url: hit.webformatURL || hit.largeImageURL,
                        alt: hit.tags || query,
                        source: 'pixabay'
                    });
                }
                console.log(`[SearchManager] ↳ Pixabay added ${resp.data?.hits?.length || 0} images`);
            }
        } catch (err) {
            console.warn('[SearchManager] Pixabay failed:', err.message);
        }
    }

    return { images: images.slice(0, maxImages), query };
}

export {
    searchWeb,
    searchBrandImages
};
