import { Router } from 'express';
import Brand from '../models/Brand.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { addWatermark } from '../utils/watermark.js';
import { getSetting } from '../models/SystemSettings.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { mirrorUrlToS3 } from '../utils/s3.js';

const router = Router();

import { mirrorBrandAssets, mirrorSingleAsset } from '../services/assetMirror.js';
import crypto from 'crypto';

// POST /api/agents/scan-website — Brand Scanner Agent
router.post('/scan-website', optionalAuth, async (req, res) => {
    try {
        let { url } = req.body;
        if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

        // Normalize URL — ensure it has a protocol
        url = url.trim();
        if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

        // Validate URL format
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
        } catch {
            return res.status(400).json({ success: false, error: 'Invalid URL format. Please enter a valid website address.' });
        }

        const orchestrator = getOrchestrator();
        const scanResult = await orchestrator.scanWebsite(url);

        // If user is authenticated, save brand to DB
        let brand = null;
        if (req.user) {
            // Placeholder ID for keying assets before creation
            const tempBrandId = crypto.randomUUID();
            
            // Mirror assets to S3 before DB save
            await mirrorBrandAssets(scanResult.dna, tempBrandId);

            brand = await Brand.create({
                user: req.user._id,
                name: scanResult.name || parsedUrl.hostname.replace(/^www\./, ''),
                website: url,
                onboardingMethod: 'website',
                dna: scanResult.dna,
                rawScanData: scanResult.rawScanData,
            });
            await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });

            // Auto-trigger Visual DNA analysis in background (fire-and-forget)
            import('../services/visualDNA.js').then(async ({ analyzeVisualDNA }) => {
                try {
                    const visualDNA = await analyzeVisualDNA(brand);
                    if (visualDNA) {
                        await Brand.findOneAndUpdate(
                            { _id: brand._id },
                            { $set: { 'dna.visualDNA': visualDNA } }
                        );
                        console.log(`✅ Visual DNA auto-analyzed for ${brand.name}: style=${visualDNA.designStyle}`);
                    }
                } catch (e) { console.warn('⚠️ Background Visual DNA analysis failed:', e.message); }
            });

            // Auto-trigger SEO Baseline Audit in background (fire-and-forget)
            import('../services/seoBaseline.js').then(async ({ runSEOBaseline }) => {
                try {
                    const seoResults = await runSEOBaseline(brand);
                    console.log(`✅ SEO Baseline complete for ${brand.name}: score=${seoResults.overallScore} (${seoResults.grading.overall})`);
                } catch (e) { console.warn('⚠️ Background SEO Baseline failed:', e.message); }
            });
        } else {
            // Return scan result as if it's a brand (for preview before signup)
            brand = {
                _id: 'preview',
                name: scanResult.name || parsedUrl.hostname.replace(/^www\./, ''),
                website: url,
                onboardingMethod: 'website',
                dna: scanResult.dna,
                status: 'preview',
            };
        }

        res.json({ success: true, brand, scanResult });
    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/agents/brainstorm — AI Brand Brainstorming Agent
router.post('/brainstorm', optionalAuth, async (req, res) => {
    try {
        const { industry, keywords, description } = req.body;
        if (!industry) return res.status(400).json({ success: false, error: 'Industry is required' });

        const orchestrator = getOrchestrator();
        const result = await orchestrator.brainstormBrand({ industry, keywords, description });

        res.json({ success: true, brandSuggestion: result });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/agents/brainstorm/save — Save brainstormed brand
router.post('/brainstorm/save', protect, async (req, res) => {
    try {
        const { brandData } = req.body;

        // Mirror assets to S3 before DB save
        const tempBrandId = crypto.randomUUID();
        const dna = {
            logo: {
                url: brandData.logoUrl || '',
                metadata: { source: brandData.logoUrl ? 'ai-generated' : '' },
            },
            voice: {
                personality: brandData.personality || '',
                description: brandData.voiceDescription || '',
                tone: brandData.tone || 50,
                clarity: brandData.clarity || 50,
                formality: brandData.formality || 50,
                warmth: brandData.warmth || 50,
                keywords: brandData.keyPhrases || [],
            },
            contentStyle: {
                dos: brandData.dos || [],
                donts: brandData.donts || [],
                keyPhrases: brandData.keyPhrases || [],
            },
            colors: (brandData.colorSuggestions || []).map(c => ({
                name: c.name, hex: c.hex, usage: c.usage || 'accent',
            })),
            fonts: {
                heading: { family: brandData.fontSuggestions?.heading || 'Inter', weight: '700' },
                body: { family: brandData.fontSuggestions?.body || 'Inter', weight: '400' },
            },
            industry: brandData.industry || '',
            targetAudience: brandData.targetAudience || '',
            brandDescription: brandData.description || '',
            country: brandData.country || 'India',
        };

        await mirrorBrandAssets(dna, tempBrandId);

        const brand = await Brand.create({
            user: req.user._id,
            name: brandData.name || 'New Brand',
            onboardingMethod: 'brainstorm',
            dna
        });

        await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });
        res.status(201).json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/agents/generate-logo — AI Logo Generation
router.post('/generate-logo', optionalAuth, async (req, res) => {
    try {
        const { brandName, industry, keywords, personality } = req.body;
        if (!brandName) return res.status(400).json({ success: false, error: 'Brand name is required' });

        const { getRouter } = await import('../ai/router.js');
        const router = getRouter();

        const personalityStyles = {
            bold: 'bold, dynamic, high-contrast',
            elegant: 'elegant, luxurious, sophisticated, minimalist',
            friendly: 'warm, approachable, rounded, friendly',
            professional: 'clean, corporate, professional, geometric',
            playful: 'fun, colorful, playful, energetic',
            minimal: 'ultra-minimal, clean lines, simple, modern',
            innovative: 'futuristic, tech-inspired, sleek, modern',
            earthy: 'natural, organic, earthy tones, botanical',
        };

        const style = personalityStyles[personality] || 'modern, professional';
        const prompt = `Create a professional logo for a brand called "${brandName}" in the ${industry || 'business'} industry. Style: ${style}. ${keywords ? `Keywords: ${keywords}.` : ''} The logo should be clean, scalable, and work on both light and dark backgrounds. White background, centered composition, no text other than the brand name. High quality vector-style design.`;

        const result = await router.generateImage({ prompt, size: '1024x1024' });

        // Mirror generated logo to S3 immediately
        const logoUrl = await mirrorSingleAsset(result.imageUrl, `temp/generated_logos/${Date.now()}.png`);

        res.json({ success: true, logoUrl: logoUrl || result.imageUrl });
    } catch (error) {
        console.error('Logo generation error:', error.message);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/agents/health — AI Agent health check
router.get('/health', async (req, res) => {
    const orchestrator = getOrchestrator();
    const aiRouter = orchestrator.router;

    res.json({
        success: true,
        agents: {
            orchestrator: 'operational',
            brandScanner: 'operational',
            contentGenerator: 'operational',
            creativeGenerator: 'operational',
            productMatcher: 'operational',
        },
        providers: Object.entries(aiRouter.providers).map(([name, p]) => ({
            name,
            available: p.isAvailable(),
        })),
        usage: aiRouter.getUsageStats(),
    });
});

// POST /api/agents/product-ideas — AI-driven product-occasion matching
router.post('/product-ideas', protect, async (req, res) => {
    try {
        const { brandId, occasion, intent } = req.body;
        if (!brandId || !occasion) {
            return res.status(400).json({ success: false, error: 'brandId and occasion are required' });
        }

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const { generateProductIdeas } = await import('../agents/productMatcher.js');
        const orchestrator = getOrchestrator();

        const ideas = await generateProductIdeas({
            brand,
            occasion,
            intent,
            aiRouter: orchestrator.router,
        });

        res.json({ success: true, ideas, occasion });
    } catch (error) {
        console.error('Product ideas error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/agents/analyze-image — AI Image Analysis for Content Brief
router.post('/analyze-image', optionalAuth, async (req, res) => {
    try {
        const { image, goal, platform, brandId, brief } = req.body; // image = base64 data URL or URL
        if (!image) return res.status(400).json({ success: false, error: 'Image is required' });

        // Use image API key first (has separate quota), fall back to general key
        const apiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }

        // Load brand for voice/style context
        let brandContext = '';
        if (brandId) {
            try {
                const brand = await Brand.findById(brandId);
                if (brand) {
                    const dna = brand.dna || {};
                    brandContext = `\nBRAND: ${brand.name}
Industry: ${dna.industry || 'General'}
Voice: ${dna.voice?.personality || 'Professional, friendly'}
Target Audience: ${dna.targetAudience || 'General audience'}
Tone: ${dna.voice?.tone || 'Engaging'}`;
                }
            } catch (e) { /* ignore */ }
        }

        // Support both base64 data URLs and regular image URLs
        let mimeType, base64Data;

        if (image.startsWith('data:image/')) {
            // Already base64 data URL
            const commaIdx = image.indexOf(',');
            if (commaIdx === -1) {
                return res.status(400).json({ success: false, error: 'Invalid image format.' });
            }
            const header = image.substring(0, commaIdx);
            mimeType = header.split(':')[1].split(';')[0];
            base64Data = image.substring(commaIdx + 1);
        } else if (image.startsWith('http://') || image.startsWith('https://')) {
            // URL — fetch and convert to base64 server-side
            try {
                const imgResp = await fetch(image, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                    redirect: 'follow',
                });
                if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
                const arrayBuffer = await imgResp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                mimeType = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                base64Data = buffer.toString('base64');
                console.log(`[ANALYZE] Fetched image from URL (${Math.round(buffer.byteLength / 1024)}KB)`);
            } catch (fetchErr) {
                console.error('[ANALYZE] Failed to fetch image URL:', fetchErr.message);
                return res.status(400).json({ success: false, error: 'Could not download image from URL. Try uploading directly.' });
            }
        } else {
            return res.status(400).json({ success: false, error: 'Invalid image format. Send as base64 data URL or image URL.' });
        }

        // Build the creative context — use brief if available, else goal
        const creativeContext = brief
            ? `This image was created for: ${brief}`
            : goal
                ? `Content goal: ${goal}`
                : '';

        const analysisPrompt = `You are a social media copywriter for ${brandContext ? 'the brand described below' : 'a brand'}.
${brandContext}
${creativeContext ? `\n${creativeContext}` : ''}

Look at this image and write 3 ready-to-post social media captions that are IN SYNC with the image theme and creative intent.

RULES:
- DO NOT use any markdown formatting. No ** for bold, no ## for headers, no * for bullets.
- Write PLAIN TEXT only — exactly as it would appear when pasted into a social media platform.
- Use emojis, line breaks, and hashtags naturally as needed per platform.
- The captions must reflect what the image is about and the creative intent behind it.

📸 INSTAGRAM CAPTION:
Write an engaging, scroll-stopping Instagram caption. Start with a hook. Use emojis naturally. Add line breaks for readability. End with 5-8 relevant hashtags.

📘 FACEBOOK POST:
Write a warm, conversational Facebook post. Keep it shareable. Include a call-to-action. 1-2 emojis max.

💼 LINKEDIN POST:
Write a professional, value-driven LinkedIn post. Include a thought-provoking question at the end. Add 3-5 hashtags at the very end.

Each caption should be complete, polished, and ready to copy-paste. Do not include any analysis, metadata, or explanations — only the captions.`;

        // Model fallback chain — try multiple Gemini models, then fall back to GPT
        const models = ['gemini-2.5-flash', 'gemini-2.5-pro'];
        let analysis = null;
        let lastError = null;

        for (const modelId of models) {
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: [
                                    { text: analysisPrompt },
                                    { inlineData: { mimeType, data: base64Data } }
                                ]
                            }],
                            generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
                        }),
                    }
                );

                const data = await response.json();

                if (data.error) {
                    console.warn(`Image analysis model ${modelId} failed:`, data.error.message);
                    lastError = data.error.message;
                    if (data.error.message?.includes('quota') || data.error.message?.includes('Quota') || data.error.message?.includes('no longer available') || data.error.status === 'RESOURCE_EXHAUSTED') {
                        continue;
                    }
                    throw new Error(data.error.message);
                }

                analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (analysis) break;
            } catch (e) {
                console.warn(`Image analysis model ${modelId} error:`, e.message);
                lastError = e.message;
                continue;
            }
        }

        // Fallback to GPT-4o vision if all Gemini models failed
        if (!analysis && process.env.OPENAI_API_KEY) {
            try {
                console.log('📸 Falling back to GPT-4o-mini for image analysis');
                const gptResp = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{
                            role: 'user',
                            content: [
                                { type: 'text', text: analysisPrompt },
                                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: 'high' } },
                            ],
                        }],
                        max_tokens: 2048,
                        temperature: 0.4,
                    }),
                });
                const gptData = await gptResp.json();
                if (gptData.error) {
                    lastError = gptData.error.message;
                } else {
                    analysis = gptData.choices?.[0]?.message?.content;
                }
            } catch (e) {
                console.warn('GPT-4o-mini image analysis failed:', e.message);
                lastError = e.message;
            }
        }

        if (!analysis) {
            throw new Error(lastError || 'All models failed for image analysis');
        }

        res.json({ success: true, analysis });

    } catch (error) {
        console.error('Image analysis error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/agents/ai-photoshoot — Generate styled product photoshoot
router.post('/ai-photoshoot', optionalAuth, async (req, res) => {
    try {
    const { image, brief, brandName, brandColors, fidelity: rawFidelity, aspectRatio,
            styleRef, characterRef,
            cameraAngle, lens, lightingStyle, lightDirection, surface, modelPresence, mood,
            imageModel,
            cameraShot,  // Dynamic camera shot preset injection from UI
            // Legacy params (backward compat)
            scene, keywords } = req.body;
        if (!image) return res.status(400).json({ success: false, error: 'Product image is required' });

        // Fidelity: 0 = max creative, 100 = exact copy. Default 80.
        const fidelity = Math.max(0, Math.min(100, rawFidelity ?? 80));
        // Map fidelity to temperature: high fidelity = low temperature
        const temperature = Math.round((1.0 - (fidelity / 100) * 0.9) * 100) / 100; // 100→0.1, 0→1.0

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }

        // Support both base64 data URLs and regular image URLs
        let mimeType, base64Data;

        if (image.startsWith('data:image/')) {
            // Already base64 data URL
            const commaIdx = image.indexOf(',');
            if (commaIdx === -1) {
                return res.status(400).json({ success: false, error: 'Invalid image format' });
            }
            const header = image.substring(0, commaIdx);
            mimeType = header.split(':')[1].split(';')[0];
            base64Data = image.substring(commaIdx + 1);
        } else if (image.startsWith('http://') || image.startsWith('https://')) {
            // URL — fetch and convert to base64 server-side
            try {
                const imgResp = await fetch(image);
                if (!imgResp.ok) throw new Error(`Failed to fetch image: ${imgResp.status}`);
                const arrayBuffer = await imgResp.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                mimeType = imgResp.headers.get('content-type') || 'image/jpeg';
                base64Data = buffer.toString('base64');
            } catch (fetchErr) {
                console.error('Failed to fetch image URL:', fetchErr.message);
                return res.status(400).json({ success: false, error: 'Could not download image from URL. Try uploading directly.' });
            }
        } else {
            return res.status(400).json({ success: false, error: 'Invalid image format. Send base64 data URL or image URL.' });
        }

        // ═══════════════════════════════════════════════════════════
        // PROFESSIONAL PHOTOGRAPHY PROMPT BUILDER
        // Maps UI selections to specific photographic terminology
        // that Gemini Nano Banana 2 understands and renders well.
        // ═══════════════════════════════════════════════════════════

        const ANGLE_MAP = {
            'eye-level': 'straight-on eye-level shot',
            'hero': 'low-angle hero shot, looking up at the product dramatically',
            '45deg': '45-degree three-quarter angle, showing front and top',
            'overhead': 'directly overhead top-down flat-lay shot',
            'macro': 'extreme close-up macro shot, tack-sharp detail',
            'dutch': 'dynamic dutch-angle tilted composition',
            'tilt-down': 'high-angle tilted down shot, camera looking down at the product from above at 30 degrees',
            'worms-eye': 'ultra-low worms-eye-view shot, camera on the ground looking straight up at the product',
            'birds-eye': 'dramatic birds-eye aerial view, high above looking straight down',
            'profile': 'side-profile silhouette shot, product seen from the exact side at 90 degrees',
        };
        const LENS_MAP = {
            'fisheye': '8mm fish-eye lens, extreme barrel distortion, 180-degree field of view, ultra-wide surreal perspective',
            'ultra-wide': '14mm ultra-wide-angle lens, dramatic exaggerated perspective, expansive scene',
            '24mm': '24mm wide-angle lens, expansive environmental scene',
            '35mm': '35mm street photography lens, documentary natural feel',
            '50mm': '50mm f/1.8 prime lens, natural perspective, slight background blur',
            '85mm': '85mm portrait lens, shallow depth of field, beautiful soft bokeh',
            '105mm': '105mm macro lens, extreme detail, razor-sharp focus on product textures',
            '200mm': '200mm telephoto lens, heavily compressed perspective, strong background blur',
            'tilt-shift': 'tilt-shift lens, selective focus plane, miniature effect, architectural precision',
        };
        const LIGHT_MAP = {
            'softbox': 'soft diffused studio lighting from a large softbox, even illumination',
            'natural': 'soft natural window light with gentle directional shadows',
            'golden': 'warm golden hour sunlight with long dramatic shadows and amber tones',
            'dramatic': 'dramatic chiaroscuro lighting, deep shadows, single hard key light',
            'neon': 'colorful neon lighting with vivid pink/blue/purple ambient glow',
            'rim': 'edge-lit rim lighting highlighting product silhouette against dark background',
            'highkey': 'bright high-key lighting, pure white luminous background, minimal shadows',
        };
        const DIR_MAP = {
            'front-left': 'from the front-left at 45 degrees',
            'front': 'from directly in front',
            'front-right': 'from the front-right at 45 degrees',
            'left': 'from the left side',
            'right': 'from the right side',
            'top': 'from directly above, top-down',
            'back': 'from behind the product, creating a backlit silhouette effect',
        };
        const SURFACE_MAP = {
            'white': 'floating on a pure white infinity-curve studio background',
            'marble': 'resting on a polished white Carrara marble surface with subtle grey veins',
            'stone': 'placed on a rough natural stone slab with organic texture',
            'wood': 'on a warm rustic reclaimed wooden surface with visible grain',
            'concrete': 'on a raw industrial concrete surface with subtle texture',
            'fabric': 'draped over soft flowing silk fabric',
            'podium': 'elevated on a clean geometric cylindrical pedestal podium',
            'glass': 'on a reflective black glass surface creating a mirror effect',
            'sand': 'nestled in fine natural sand with shells and botanical elements',
            'foliage': 'surrounded by fresh green leaves, eucalyptus sprigs and botanical elements',
        };
        const MODEL_MAP = {
            'none': '',
            'hands': 'The product is being elegantly held by well-manicured hands.',
            'model-woman': 'A stylish woman model is holding/wearing the product in a lifestyle setting.',
            'model-man': 'A stylish man model is holding/using the product in a lifestyle setting.',
        };
        const MOOD_MAP = {
            'editorial': 'editorial magazine-quality',
            'commercial': 'clean commercial e-commerce',
            'lifestyle': 'lifestyle in-context',
            'luxury': 'luxury premium high-end',
            'minimal': 'minimalist clean sparse',
            'moody': 'moody atmospheric dark-toned',
            'vibrant': 'vibrant saturated energetic',
            'vintage': 'film-grain vintage retro',
        };

        const anglePhrase = ANGLE_MAP[cameraAngle] || ANGLE_MAP['eye-level'];
        const lensPhrase = LENS_MAP[lens] || LENS_MAP['50mm'];
        const lightPhrase = LIGHT_MAP[lightingStyle] || LIGHT_MAP['softbox'];
        const dirPhrase = DIR_MAP[lightDirection] || DIR_MAP['front-left'];
        const surfPhrase = SURFACE_MAP[surface] || SURFACE_MAP['white'];
        const modelPhrase = MODEL_MAP[modelPresence] || '';
        const moodPhrase = (mood || ['commercial']).map(m => MOOD_MAP[m] || m).join(', ');
        const ratioPhrase = aspectRatio ? `Output image aspect ratio: ${aspectRatio}.` : '';

        // Build the prompt based on fidelity
        let photoshootPrompt;

        if (fidelity >= 75) {
            // HIGH FIDELITY — strict editing, preserve product exactly
            photoshootPrompt = `Edit this product photo. Do NOT change the product at all — keep every color, label, text, shape, and texture on the product pixel-perfect.

A ${anglePhrase}, captured with a ${lensPhrase}. The product is ${surfPhrase}. ${lightPhrase} ${dirPhrase}. ${modelPhrase}
${brief ? brief + '.' : ''}${brandColors ? ` Brand accent colors: ${brandColors}.` : ''}
${moodPhrase} product photography. Photorealistic, magazine-quality, sharp detail. ${ratioPhrase}`;
        } else if (fidelity >= 50) {
            // BALANCED — preserve product largely but allow artistic styling
            photoshootPrompt = `Create a professional product photoshoot. Keep the product's key details, colors, and branding accurate but enhance the presentation artistically.

A ${anglePhrase}, captured with a ${lensPhrase}. The product is ${surfPhrase}. ${lightPhrase} ${dirPhrase}. ${modelPhrase}
${brief ? brief + '.' : ''}${brandColors ? ` Accent colors: ${brandColors}.` : ''}
${moodPhrase} product photography. Photorealistic, magazine-quality. ${ratioPhrase}`;
        } else {
            // CREATIVE — allow significant artistic interpretation
            photoshootPrompt = `Create an artistic, creative product image inspired by this product. You have creative freedom to reimagine the presentation but keep the product recognizable.

A ${anglePhrase}, captured with a ${lensPhrase}. The product is ${surfPhrase}. ${lightPhrase} ${dirPhrase}. ${modelPhrase}
${brief ? brief + '.' : ''}${brandColors ? ` Color palette: ${brandColors}.` : ''}
Bold, ${moodPhrase} visual suitable for advertising and social media. ${ratioPhrase}`;
        }

        // If a dynamic camera shot preset was selected, override/append camera direction
        if (cameraShot) {
            photoshootPrompt += `\n\nCAMERA OVERRIDE — HIGHEST PRIORITY: ${cameraShot}. This supersedes any other angle instructions. Execute this camera technique precisely.`;
        }

        console.log(`📸 AI Photo Studio: angle=${cameraAngle} lens=${lens} light=${lightingStyle}/${lightDirection} surface=${surface} model=${modelPresence} mood=${mood?.join(',')} fidelity=${fidelity} ratio=${aspectRatio} shot=${cameraShot ? 'PRESET' : 'manual'}`);

        // ── Model selection & routing ─────────────────────────────────────
        const PHOTOSHOOT_MODELS = {
            'nanobanana-2':   { provider: 'gemini', modelId: 'gemini-3.1-flash-image-preview', name: 'NanoBanana 2' },
            'nanobanana-pro': { provider: 'gemini', modelId: 'gemini-3-pro-image-preview', name: 'NanoBanana Pro' },
            'flux-pro-v1.1':  { provider: 'fal', endpoint: 'fal-ai/flux-pro/v1.1', name: 'Flux Pro v1.1' },
            'flux-2-pro':     { provider: 'fal', endpoint: 'fal-ai/flux-pro/v2', name: 'Flux 2 Pro' },
            'seedream-5':     { provider: 'fal', endpoint: 'fal-ai/bytedance/seedream/v3/text-to-image', name: 'Seedream 5' },
            'ideogram':       { provider: 'fal', endpoint: 'fal-ai/ideogram/v3', name: 'Ideogram v3' },
            'grok-imagen':    { provider: 'grok', name: 'Grok Imagen' },
        };

        const modelCfg = PHOTOSHOOT_MODELS[imageModel] || PHOTOSHOOT_MODELS['nanobanana-2'];
        console.log(`📸 Photoshoot model: ${modelCfg.name} (${modelCfg.provider})`);

        let resultImage = null;
        let resultText = '';
        let usedModel = modelCfg.name;

        // ── fal.ai path (Flux, Seedream, Ideogram) — text-to-image only ──
        if (modelCfg.provider === 'fal') {
            const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
            if (!falKey) {
                return res.status(200).json({ success: false, error: `${modelCfg.name} requires FAL_KEY to be configured. Please try NanoBanana 2 or NanoBanana Pro instead.` });
            }

            // Warn user: fal.ai models don't support reference images
            const falWarnings = [];
            if (styleRef || characterRef) {
                falWarnings.push('Note: Reference images are not supported by this model and were ignored.');
            }

            // Map aspect ratio to pixel size
            const sizeMap = {
                '1:1': { width: 1024, height: 1024 },
                '16:9': { width: 1344, height: 768 },
                '9:16': { width: 768, height: 1344 },
                '4:5': { width: 896, height: 1120 },
                '2:3': { width: 832, height: 1248 },
                '3:4': { width: 896, height: 1184 },
                '3:2': { width: 1248, height: 832 },
                '4:3': { width: 1184, height: 896 },
            };
            const imgSize = sizeMap[aspectRatio] || sizeMap['1:1'];

            try {
                console.log(`🎨 Photoshoot via fal.ai: ${modelCfg.endpoint}`);
                const submitResp = await fetch(`https://queue.fal.run/${modelCfg.endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Key ${falKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: photoshootPrompt,
                        image_size: imgSize,
                        num_images: 1,
                        sync_mode: true,
                    }),
                    signal: AbortSignal.timeout(90000),
                });

                if (!submitResp.ok) {
                    const errText = await submitResp.text();
                    console.error(`❌ fal.ai photoshoot error (${submitResp.status}):`, errText);
                    if (submitResp.status === 429 || submitResp.status === 503) {
                        return res.status(200).json({ success: false, modelBusy: true, error: `${modelCfg.name} is currently busy. Please try again or switch to a different model.` });
                    }
                    if (errText.toLowerCase().includes('safety') || errText.toLowerCase().includes('blocked') || errText.toLowerCase().includes('content')) {
                        return res.status(200).json({ success: false, error: `Content policy violation: ${errText.substring(0, 200)}. Try adjusting your photoshoot description.` });
                    }
                    return res.status(200).json({ success: false, error: `${modelCfg.name} generation failed: ${errText.substring(0, 200)}` });
                }

                const data = await submitResp.json();
                resultImage = data.images?.[0]?.url || data.output?.images?.[0]?.url || '';

                if (!resultImage) {
                    // Async mode — poll
                    if (data.request_id) {
                        console.log(`⏳ fal.ai queued: ${data.request_id}, polling...`);
                        const resultUrl = `https://queue.fal.run/${modelCfg.endpoint}/requests/${data.request_id}`;
                        for (let i = 0; i < 30; i++) {
                            await new Promise(r => setTimeout(r, 3000));
                            try {
                                const pollResp = await fetch(resultUrl, { headers: { 'Authorization': `Key ${falKey}` } });
                                if (pollResp.status === 200) {
                                    const pollData = await pollResp.json();
                                    resultImage = pollData.images?.[0]?.url || pollData.output?.images?.[0]?.url || '';
                                    if (resultImage) break;
                                }
                            } catch { /* retry */ }
                        }
                    }
                }

                if (!resultImage) {
                    return res.status(200).json({ success: false, error: `${modelCfg.name} returned no image. Try a different prompt or model.` });
                }

                resultText = falWarnings.join(' ');
            } catch (falErr) {
                console.error(`fal.ai photoshoot exception:`, falErr.message);
                if (falErr.name === 'TimeoutError' || falErr.message?.includes('timed out')) {
                    return res.status(200).json({ success: false, error: `${modelCfg.name} took too long to respond. Try again or switch to NanoBanana 2 for faster results.` });
                }
                throw falErr;
            }
        }

        // ── Grok Imagen path (xAI) — text-to-image only ──
        if (modelCfg.provider === 'grok') {
            const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
            if (!grokKey) {
                return res.status(200).json({ success: false, error: `Grok Imagen requires GROK_API_KEY to be configured.` });
            }

            const grokWarnings = [];
            if (styleRef || characterRef) {
                grokWarnings.push('Note: Reference images are not supported by Grok Imagen and were ignored.');
            }

            try {
                console.log(`🎨 Photoshoot via Grok Imagen (xAI)`);
                const grokResp = await fetch('https://api.x.ai/v1/images/generations', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${grokKey}`,
                    },
                    body: JSON.stringify({
                        model: 'grok-imagine-image',
                        prompt: photoshootPrompt,
                        response_format: 'b64_json',
                        n: 1,
                    }),
                    signal: AbortSignal.timeout(90000),
                });

                if (!grokResp.ok) {
                    const errText = await grokResp.text();
                    console.error(`❌ Grok Imagen photoshoot error (${grokResp.status}):`, errText);
                    if (grokResp.status === 429 || grokResp.status === 503) {
                        return res.status(200).json({ success: false, modelBusy: true, error: `Grok Imagen is currently busy. Please try again or switch to a different model.` });
                    }
                    return res.status(200).json({ success: false, error: `Grok Imagen generation failed: ${errText.substring(0, 200)}` });
                }

                const grokData = await grokResp.json();
                const grokImgData = grokData.data?.[0];
                if (grokImgData?.b64_json) {
                    resultImage = `data:image/png;base64,${grokImgData.b64_json}`;
                } else if (grokImgData?.url) {
                    resultImage = grokImgData.url;
                }

                if (!resultImage) {
                    return res.status(200).json({ success: false, error: `Grok Imagen returned no image. Try a different prompt or model.` });
                }
                usedModel = 'Grok Imagen';
                resultText = grokWarnings.join(' ');
            } catch (grokErr) {
                console.error(`Grok Imagen photoshoot exception:`, grokErr.message);
                if (grokErr.name === 'TimeoutError' || grokErr.message?.includes('timed out')) {
                    return res.status(200).json({ success: false, error: `Grok Imagen took too long to respond. Try again or switch model.` });
                }
                throw grokErr;
            }
        }

        // ── Gemini path (NanoBanana 2, NanoBanana Pro) — supports reference images ──
        if (modelCfg.provider === 'gemini') {
            try {
                const selectedModelId = modelCfg.modelId;
                console.log(`AI Photoshoot: using model ${selectedModelId}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModelId}:generateContent?key=${imageKey}`;

                const requestBody = {
                    contents: [{
                        parts: await (async () => {
                            const parts = [
                                // IMAGE FIRST — model treats it as primary input to edit
                                { inlineData: { mimeType: mimeType, data: base64Data } },
                            ];
                            // Helper: fetch URL image and convert to base64 inline data
                            const fetchImagePart = async (url, label) => {
                                try {
                                    if (url.startsWith('data:')) {
                                        const commaIdx = url.indexOf(',');
                                        const header = url.substring(0, commaIdx);
                                        return { inlineData: { mimeType: header.split(':')[1].split(';')[0], data: url.substring(commaIdx + 1) } };
                                    }
                                    const resp = await fetch(url);
                                    if (!resp.ok) return null;
                                    const buf = Buffer.from(await resp.arrayBuffer());
                                    return { inlineData: { mimeType: resp.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') } };
                                } catch (e) {
                                    console.warn(`📸 Could not fetch ${label} ref:`, e.message);
                                    return null;
                                }
                            };
                            // Add style reference image
                            if (styleRef) {
                                const stylePart = await fetchImagePart(styleRef, 'style');
                                if (stylePart) {
                                    parts.push(stylePart);
                                    parts.push({ text: 'STYLE REFERENCE IMAGE — replicate ALL of the following from this reference: (1) color palette, color grading and tone, (2) composition layout and spatial arrangement, (3) pose and body position of any person/model, (4) product placement and positioning, (5) camera angle and framing, (6) lighting style and mood. The output must feel like it belongs in the same series as this reference.' });
                                }
                            }
                            // Add character reference image
                            if (characterRef) {
                                const charPart = await fetchImagePart(characterRef, 'character');
                                if (charPart) {
                                    parts.push(charPart);
                                    parts.push({ text: 'This is a character/person reference. Include this person or character in the photoshoot scene.' });
                                }
                            }
                            // Prompt text last
                            parts.push({ text: photoshootPrompt });
                            return parts;
                        })()
                    }],
                    generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                        temperature: temperature,
                    },
                };

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                });

                const data = await response.json();

                if (data.error) {
                    const errMsg = data.error.message || JSON.stringify(data.error);
                    console.error(`Model ${selectedModelId} error:`, errMsg);
                    // Return descriptive error instead of generic 500
                    if (errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('busy') || response.status === 503 || response.status === 429) {
                        return res.status(200).json({ success: false, modelBusy: true, error: `${modelCfg.name} is currently busy with high demand. Please try again or switch to a different model.` });
                    }
                    if (errMsg.toLowerCase().includes('safety') || errMsg.toLowerCase().includes('blocked') || errMsg.toLowerCase().includes('harmful')) {
                        return res.status(200).json({ success: false, error: `Content policy: ${errMsg.substring(0, 200)}. Try adjusting your photoshoot description.` });
                    }
                    if (errMsg.toLowerCase().includes('too long') || errMsg.toLowerCase().includes('token')) {
                        return res.status(200).json({ success: false, error: `Prompt too long. Please shorten your description and try again.` });
                    }
                    if (errMsg.toLowerCase().includes('no longer available') || errMsg.toLowerCase().includes('not found')) {
                        return res.status(200).json({ success: false, error: `${modelCfg.name} model is temporarily unavailable. Please switch to a different model.` });
                    }
                    throw new Error(errMsg);
                }

                // Extract the generated image
                const parts = data.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                    if (part.inlineData?.mimeType?.startsWith('image/')) {
                        resultImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                    if (part.text) {
                        resultText = part.text;
                    }
                }

                if (!resultImage) {
                    return res.status(200).json({ success: false, error: `${modelCfg.name} returned no image. Try different keywords or a simpler prompt.` });
                }

                usedModel = selectedModelId;
            } catch (modelErr) {
                console.error(`Gemini photoshoot exception:`, modelErr.message);
                throw modelErr;
            }
        }

        // Apply watermark if enabled
        const watermarkEnabled = await getSetting('watermark_enabled', true);
        if (watermarkEnabled) {
            resultImage = await addWatermark(resultImage, { enabled: true });
        }

        // Mirror photoshoot result to S3 immediately
        const s3ImageUrl = await mirrorSingleAsset(resultImage, `temp/photoshoots/${Date.now()}.png`);

        res.json({
            success: true,
            imageUrl: s3ImageUrl || resultImage,
            description: resultText,
            model: usedModel,
        });

    } catch (error) {
        console.error('AI Photoshoot error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;
