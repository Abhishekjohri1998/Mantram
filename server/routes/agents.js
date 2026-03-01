import { Router } from 'express';
import Brand from '../models/Brand.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { addWatermark } from '../utils/watermark.js';
import { getSetting } from '../models/SystemSettings.js';

const router = Router();

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
            brand = await Brand.create({
                user: req.user._id,
                name: scanResult.name || parsedUrl.hostname.replace(/^www\./, ''),
                website: url,
                onboardingMethod: 'website',
                dna: scanResult.dna,
                rawScanData: scanResult.rawScanData,
            });
            await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/agents/brainstorm/save — Save brainstormed brand
router.post('/brainstorm/save', protect, async (req, res) => {
    try {
        const { brandData } = req.body;

        const brand = await Brand.create({
            user: req.user._id,
            name: brandData.name || 'New Brand',
            onboardingMethod: 'brainstorm',
            dna: {
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
            },
        });

        await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });
        res.status(201).json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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

        res.json({ success: true, logoUrl: result.imageUrl });
    } catch (error) {
        console.error('Logo generation error:', error.message);
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/agents/analyze-image — AI Image Analysis for Content Brief
router.post('/analyze-image', optionalAuth, async (req, res) => {
    try {
        const { image, goal, platform } = req.body; // image = base64 data URL
        if (!image) return res.status(400).json({ success: false, error: 'Image is required' });

        // Use image API key first (has separate quota), fall back to general key
        const apiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }

        // Extract base64 data from data URL using string ops (regex fails on large strings)
        const commaIdx = image.indexOf(',');
        if (commaIdx === -1 || !image.startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: 'Invalid image format. Send as base64 data URL.' });
        }
        const header = image.substring(0, commaIdx);
        const mimeType = header.split(':')[1].split(';')[0];
        const base64Data = image.substring(commaIdx + 1);

        const analysisPrompt = `Analyze this image thoroughly for marketing content creation. Provide a detailed analysis in the following format:

**WHAT I SEE:**
Describe everything visible — products, people, setting, objects, text on image, branding elements.

**PRODUCT/SUBJECT:**
What is the main product or subject? Its features, quality indicators, unique selling points visible.

**VISUAL MOOD:**
Colors, lighting, aesthetic style, emotional feel, energy level.

**TEXT ON IMAGE:**
Any text, logos, taglines, or branding visible in the image. Transcribe them exactly.

**TARGET AUDIENCE:**
Who would this appeal to? Demographics, psychographics.

**MARKETING ANGLES:**
3-5 content angles or hooks that could be used for ${platform || 'social media'} posts about this image.
${goal ? `\nThe content goal is: ${goal}` : ''}

**SUGGESTED HASHTAGS:**
5-8 relevant hashtags for this image.

Be specific and detailed. This analysis will be used as a brief for AI content generation.`;

        // Model fallback chain — try multiple Gemini models, then fall back to GPT
        const models = ['gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-1.5-flash'];
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
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/agents/ai-photoshoot — Generate styled product photoshoot
router.post('/ai-photoshoot', optionalAuth, async (req, res) => {
    try {
        const { image, scene, keywords, brief, brandName, brandColors, fidelity: rawFidelity } = req.body;
        if (!image) return res.status(400).json({ success: false, error: 'Product image is required' });

        // Fidelity: 0 = max creative, 100 = exact copy. Default 80.
        const fidelity = Math.max(0, Math.min(100, rawFidelity ?? 80));
        // Map fidelity to temperature: high fidelity = low temperature
        const temperature = Math.round((1.0 - (fidelity / 100) * 0.9) * 100) / 100; // 100→0.1, 0→1.0

        const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!imageKey) {
            return res.status(500).json({ success: false, error: 'Gemini API key not configured' });
        }

        // Extract base64 from data URL using string ops (regex fails on large strings)
        const commaIdx = image.indexOf(',');
        if (commaIdx === -1 || !image.startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: 'Invalid image format' });
        }
        const header = image.substring(0, commaIdx);
        const mimeType = header.split(':')[1].split(';')[0];
        const base64Data = image.substring(commaIdx + 1);

        // Build prompt based on fidelity level
        const sceneDesc = scene || 'professional studio';
        const keywordList = (keywords || []).join(', ');

        let photoshootPrompt;

        if (fidelity >= 75) {
            // HIGH FIDELITY — strict editing, preserve product exactly
            photoshootPrompt = `Edit this product photo. Do NOT change the product at all — keep every color, label, text, logo, shape, and texture on the product exactly as it is. Only replace the background and surroundings.

New background: ${sceneDesc}.${keywordList ? ` Style: ${keywordList}.` : ''}${brief ? ` ${brief}.` : ''}
${brandColors ? `Background colors: ${brandColors}.` : ''}
Professional lighting, product sharp, background soft bokeh.`;
        } else if (fidelity >= 50) {
            // BALANCED — preserve product largely but allow some artistic styling
            photoshootPrompt = `Create a professional product photoshoot. Keep the product's key details, colors, text and branding accurate, but you may enhance the presentation with artistic lighting and styled composition.

Scene: ${sceneDesc}.${keywordList ? ` Style: ${keywordList}.` : ''}${brief ? ` ${brief}.` : ''}
${brandColors ? `Accent colors: ${brandColors}.` : ''}
Commercial-grade, photorealistic, magazine-quality product photography.`;
        } else {
            // CREATIVE — allow significant artistic interpretation
            photoshootPrompt = `Create an artistic, creative product image inspired by this product. You have creative freedom to reimagine the presentation, but keep the product recognizable.

Scene: ${sceneDesc}.${keywordList ? ` Style: ${keywordList}.` : ''}${brief ? ` ${brief}.` : ''}
${brandColors ? `Color palette: ${brandColors}.` : ''}
Bold, creative, eye-catching visual suitable for advertising and social media.`;
        }

        console.log(`AI Photoshoot: fidelity=${fidelity}, temperature=${temperature}`);

        // Models — Nano Banana 2 is the latest/best for image editing
        const models = [
            'gemini-3.1-flash-image-preview',    // Nano Banana 2 (best, latest)
            'gemini-3-pro-image-preview',          // Nano Banana Pro
            'gemini-2.5-flash-image',              // Nano Banana (stable)
            'gemini-2.0-flash-exp-image-generation', // Fallback (older)
        ];

        let resultImage = null;
        let resultText = '';
        let usedModel = '';

        for (const modelId of models) {
            try {
                console.log(`AI Photoshoot: trying model ${modelId}...`);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;

                const requestBody = {
                    contents: [{
                        parts: [
                            // IMAGE FIRST — model treats it as primary input to edit
                            { inlineData: { mimeType: mimeType, data: base64Data } },
                            { text: photoshootPrompt }
                        ]
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
                    console.error(`Model ${modelId} error:`, data.error.message);
                    continue; // try next model
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

                if (resultImage) {
                    usedModel = modelId;
                    break; // success
                }

                console.warn(`Model ${modelId}: no image in response, trying next...`);
            } catch (modelErr) {
                console.error(`Model ${modelId} exception:`, modelErr.message);
                continue; // try next model
            }
        }

        if (!resultImage) {
            throw new Error('No image generated. All models failed. Try different keywords or a smaller image.');
        }

        // Apply watermark if enabled
        const watermarkEnabled = await getSetting('watermark_enabled', true);
        if (watermarkEnabled) {
            resultImage = await addWatermark(resultImage, { enabled: true });
        }

        res.json({
            success: true,
            imageUrl: resultImage,
            description: resultText,
            model: usedModel,
        });

    } catch (error) {
        console.error('AI Photoshoot error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
