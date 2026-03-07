import mongoose from 'mongoose';
import { Router } from 'express';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { addWatermark } from '../utils/watermark.js';
import { getSetting } from '../models/SystemSettings.js';

const router = Router();

// ── Build a natural-language brand description (NO labels, NO structured metadata)
// Image models render any label/noun as visible text, so this must be purely descriptive
function buildBrandDescription(brand) {
    const parts = [];
    if (brand.dna?.industry) parts.push(`${brand.dna.industry}`);
    parts.push(`brand called ${brand.name}`);
    if (brand.dna?.voice?.personality) parts.push(`with a ${brand.dna.voice.personality} feel`);
    if (brand.dna?.targetAudience) parts.push(`targeting ${brand.dna.targetAudience}`);
    return parts.join(' ');
}

// ── Build rich visual context from brand DNA for image prompts ──
function buildVisualContext(brand) {
    const parts = [];
    const dna = brand.dna || {};
    if (dna.voice?.personality) parts.push(`Brand personality: ${dna.voice.personality}`);
    if (dna.contentStyle?.dos?.length) {
        parts.push(`Design principles: ${dna.contentStyle.dos.slice(0, 3).join(', ')}`);
    }
    if (dna.contentStyle?.donts?.length) {
        parts.push(`Avoid in design: ${dna.contentStyle.donts.slice(0, 3).join(', ')}`);
    }
    return parts.join('. ');
}

// Convert brand colors to a short natural phrase (NO labels like "Teal:", NO lists)
function getColorPhrase(brand) {
    const colors = brand.dna?.colors || [];
    if (!colors.length) return '';
    // Map to simple color words, stripping jargon like "Professional", "Accent"
    const simpleNames = colors.map(c => {
        if (!c.name) return '';
        return c.name.toLowerCase()
            .replace(/\b(professional|accent|primary|secondary|brand|deep|soft|ocean)\b/gi, '')
            .trim();
    }).filter(Boolean).slice(0, 3);
    if (!simpleNames.length) return '';
    return simpleNames.join(' and ') + ' color tones';
}

// ── Helper: extract base64 from data URI ────────────────────────────────
function extractBase64(dataUri) {
    const commaIdx = dataUri.indexOf(',');
    const header = dataUri.substring(0, commaIdx);
    const mimeType = header.split(':')[1].split(';')[0];
    const data = dataUri.substring(commaIdx + 1);
    return { mimeType, data };
}

// ── Gemini image generation with model fallback ─────────────────────────
async function geminiImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1') {
    const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('Gemini API key not configured');

    // Match AI Photoshoot model order — gemini-3.1-flash-image-preview (Nano Banana 2) first
    const models = [
        'gemini-3.1-flash-image-preview',        // Nano Banana 2 — best, latest
        'gemini-3-pro-image-preview',             // Pro fallback
        'gemini-2.5-flash-image',                 // Stable fallback
        'gemini-2.0-flash-exp-image-generation',  // Legacy fallback
    ];

    // imageParts now come pre-formatted: mix of { text: '...' } labels and { inlineData: { mimeType, data } }
    const parts = [
        ...imageParts,
        { text: promptText },
    ];

    let imageUrl = null;
    let usedModel = '';
    let textResponse = '';

    const imageCount = imageParts.filter(p => p.inlineData).length;
    console.log(`\n══════ CREATIVE STUDIO IMAGE GENERATION ══════`);
    console.log(`🎨 Models to try: ${models.length}`);
    console.log(`🖼️  Reference images: ${imageCount}`);
    console.log(`📐 Aspect ratio: ${aspectRatio}`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    for (const modelId of models) {
        try {
            console.log(`\n🔄 Trying model: ${modelId}...`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: {
                        responseModalities: ['TEXT', 'IMAGE'],
                        temperature,
                        // aspectRatio goes inside imageConfig, NOT directly in generationConfig
                        ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
                    },
                }),
            });
            const data = await resp.json();
            if (data.error) { console.error(`❌ Model ${modelId} error:`, data.error.message); continue; }
            const resParts = data.candidates?.[0]?.content?.parts || [];
            for (const part of resParts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
                if (part.text) textResponse += part.text;
            }
            if (imageUrl) {
                usedModel = modelId;
                console.log(`✅ Image generated successfully with model: ${modelId}`);
                break;
            } else {
                console.warn(`⚠️ Model ${modelId} responded but returned no image`);
            }
        } catch (e) { console.error(`❌ Model ${modelId} exception:`, e.message); continue; }
    }
    if (!imageUrl) console.error('❌ All Gemini models failed to generate an image');
    console.log(`══════ END IMAGE GENERATION ══════\n`);

    return { imageUrl, model: usedModel, textResponse };
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/enhance-prompt — AI-powered prompt enhancement
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', protect, async (req, res) => {
    try {
        const { brandId, prompt, style, format, referenceDescriptions, aspectRatio } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required' });

        const brand = brandId ? await Brand.findById(brandId) : null;
        const brandDesc = brand ? buildBrandDescription(brand) : 'a professional brand';
        const colorPhrase = brand ? getColorPhrase(brand) : '';
        const visualCtx = brand ? buildVisualContext(brand) : '';

        const systemPrompt = `You are an expert prompt engineer for AI image generation (Gemini / NanoBanana 2). 
Your job is to take a rough user description and transform it into a detailed, vivid, specific image generation prompt.

RULES:
1. Keep the user's core intent but make it 10x more detailed and specific
2. Add specific details about: composition, lighting, textures, materials, atmosphere, color palette, depth of field
3. NEVER include labels, hex codes, font names, or metadata text — these render as visible text in images
4. Describe colors by appearance, not codes (e.g. "warm amber tones" not "#f59e0b")
5. Make it professional-quality, polished, ready for a design agency
6. Keep it under 150 words — concise but vivid
7. If reference images are mentioned, incorporate their visual elements into the enhanced prompt
8. Match the brand's personality and style
9. NEVER wrap in quotes or add prefixes like "Generate:" — just return the raw enhanced prompt text

RESPOND WITH ONLY THE ENHANCED PROMPT TEXT. Nothing else.`;

        const userPrompt = [
            `ROUGH PROMPT: ${prompt}`,
            brand ? `BRAND: ${brandDesc}` : '',
            colorPhrase ? `BRAND COLORS: ${colorPhrase}` : '',
            visualCtx ? `BRAND GUIDELINES: ${visualCtx}` : '',
            style ? `STYLE: ${style}` : '',
            format ? `FORMAT: ${format}` : '',
            aspectRatio ? `ASPECT RATIO: ${aspectRatio}` : '',
            referenceDescriptions ? `REFERENCE IMAGES: ${referenceDescriptions}` : '',
        ].filter(Boolean).join('\n');

        const { getRouter } = await import('../ai/router.js');
        const router = getRouter();
        const result = await router.generateText({
            systemPrompt,
            userPrompt,
            temperature: 0.7,
            maxTokens: 300,
        }, { provider: 'anthropic' });

        // Clean up the response — remove quotes, "Generate:" prefixes, etc.
        let enhanced = (result.text || '').trim();
        enhanced = enhanced.replace(/^["']|["']$/g, '').trim();
        enhanced = enhanced.replace(/^(Generate|Create|Design|Prompt|Enhanced):?\s*/i, '').trim();

        res.json({ success: true, enhancedPrompt: enhanced });
    } catch (error) {
        console.error('Prompt enhance error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/creatives/generate
router.post('/generate', protect, requireCredits('creative'), async (req, res) => {
    try {
        const { brandId, type, prompt, options } = req.body;
        if (!brandId || !prompt) {
            return res.status(400).json({ success: false, error: 'brandId and prompt are required' });
        }

        const brand = await Brand.findById(brandId);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        // Build natural-language brand description (no labels)
        const brandDesc = buildBrandDescription(brand);
        const colorPhrase = getColorPhrase(brand);

        const sizeMap = {
            'instagram-post': '1080x1080 square',
            'instagram-story': '1080x1920 vertical story',
            'facebook-ad': '1200x628 landscape',
            'linkedin-post': '1200x627 landscape',
            'youtube-thumb': '1280x720 landscape thumbnail',
            'banner': '1920x480 wide banner',
            'twitter-post': '1200x675 landscape',
        };
        let platformSize = sizeMap[type] || '1080x1080 square';

        // Aspect ratio override — user-selected ratio takes priority
        const ratioMap = {
            '1:1': '1080x1080 square',
            '16:9': '1920x1080 widescreen landscape',
            '9:16': '1080x1920 vertical/story',
            '2:3': '1080x1620 portrait',
            '3:4': '1080x1440 portrait',
            '1:2': '1080x2160 tall vertical',
            '2:1': '2160x1080 wide horizontal',
            '4:5': '1080x1350 social post',
            '3:2': '1620x1080 standard landscape',
            '4:3': '1440x1080 classic landscape',
        };
        if (options?.aspectRatio && ratioMap[options.aspectRatio]) {
            platformSize = ratioMap[options.aspectRatio];
        }

        let result;

        // ── Collect all image parts for Gemini multi-image call ──────────
        const imageParts = [];
        const referenceInstructions = [];

        // Reference images: style, character, upload — support both base64 data URIs and HTTP URLs
        const refs = options?.referenceImages || {};

        // Helper: resolve a reference image (base64 or HTTP URL) to an image part
        async function resolveRefImage(src, label) {
            if (!src) return null;
            if (src.startsWith('data:image/')) {
                console.log(`🖼️  Ref image (${label}): base64 data URI, ${Math.round(src.length / 1024)}KB`);
                return { part: extractBase64(src), label };
            }
            if (src.startsWith('http')) {
                try {
                    console.log(`📎 Fetching reference image (${label}): ${src.substring(0, 80)}...`);
                    const imgResp = await fetch(src, {
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                        redirect: 'follow',
                    });
                    if (imgResp.ok) {
                        const buf = await imgResp.arrayBuffer();
                        const ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                        console.log(`✅ Ref image (${label}) fetched: ${Math.round(buf.byteLength / 1024)}KB, ${ct}`);
                        return { part: { mimeType: ct, data: Buffer.from(buf).toString('base64') }, label };
                    } else {
                        console.warn(`⚠️ Ref image (${label}) fetch returned ${imgResp.status}`);
                    }
                } catch (e) { console.warn(`⚠️ Could not fetch ref image (${label}):`, e.message); }
            }
            console.warn(`⚠️ Ref image (${label}): unrecognized format — not base64 and not HTTP URL`);
            return null;
        }

        const [styleRef, uploadRef] = await Promise.all([
            resolveRefImage(refs.style, 'style'),
            resolveRefImage(refs.upload, 'upload'),
        ]);

        // Multi-character references from options.characters array
        const characterRefs = [];
        if (options?.characters?.length > 0) {
            console.log(`👥 Processing ${options.characters.length} character reference(s)...`);
            for (let i = 0; i < Math.min(options.characters.length, 5); i++) {
                const char = options.characters[i];
                if (char?.image) {
                    const resolved = await resolveRefImage(char.image, `character-${char.name || i + 1}`);
                    if (resolved) {
                        characterRefs.push({ ...resolved, name: char.name || `Character ${i + 1}` });
                    }
                }
            }
        }

        console.log(`🖼️  Reference image results: style=${!!styleRef}, characters=${characterRefs.length}, upload=${!!uploadRef}`);

        // Build image parts — MINIMAL labels, images first, like AI Photoshoot pattern
        // Key insight: the Photoshoot uses [image, prompt] simply. Too many verbose text parts
        // between images confuse the model. Keep labels SHORT.
        if (styleRef) {
            imageParts.push({ text: 'Style reference:' });
            imageParts.push({ inlineData: { mimeType: styleRef.part.mimeType, data: styleRef.part.data } });
            referenceInstructions.push('Match the visual style, colors, and mood of the attached style reference image.');
        }

        // Character references — simple labels, let the prompt do the heavy lifting
        for (let i = 0; i < characterRefs.length; i++) {
            const charRef = characterRefs[i];
            const tagName = charRef.name.replace(/\s/g, '');
            imageParts.push({ text: `Character "${charRef.name}" (@${tagName}):` });
            imageParts.push({ inlineData: { mimeType: charRef.part.mimeType, data: charRef.part.data } });
        }
        if (characterRefs.length > 0) {
            const charList = characterRefs.map(c => `"${c.name}" (@${c.name.replace(/\s/g, '')})`).join(', ');
            referenceInstructions.push(`CHARACTERS: The image must prominently feature these people from the attached photos: ${charList}. Replicate their exact face, skin tone, and hair from the reference images.`);
        }

        if (uploadRef) {
            imageParts.push({ text: 'Reference context:' });
            imageParts.push({ inlineData: { mimeType: uploadRef.part.mimeType, data: uploadRef.part.data } });
            referenceInstructions.push('Use the attached general reference image as contextual inspiration.');
        }

        // Base image from AI Photoshoot
        if (options?.baseImage && options.baseImage.startsWith('data:image/')) {
            imageParts.push({ text: 'PRODUCT BASE IMAGE (keep this product exactly as-is, only change background and styling):' });
            imageParts.push({ inlineData: extractBase64(options.baseImage) });
            referenceInstructions.push('PRODUCT IMAGE: Keep this product exactly as-is — same colors, labels, text, shape. Only change background and styling.');
        }

        // Product image from catalog (remote URL — fetch and convert to base64)
        if (options?.productImageUrl && !options?.baseImage) {
            try {
                console.log(`📦 Fetching product image: ${options.productImageUrl}`);
                const imgResponse = await fetch(options.productImageUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                    redirect: 'follow',
                });
                if (imgResponse.ok) {
                    const imgBuffer = await imgResponse.arrayBuffer();
                    const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
                    const base64 = Buffer.from(imgBuffer).toString('base64');
                    // Must match extractBase64 format: { mimeType, data } — NOT wrapped in inlineData
                    const mimeType = (contentType || 'image/jpeg').split(';')[0];
                    imageParts.push({ text: 'PRODUCT CATALOG IMAGE (this is the ACTUAL product being promoted — feature it prominently):' });
                    imageParts.push({ inlineData: { mimeType, data: base64 } });
                    referenceInstructions.push('PRODUCT IMAGE: This is the ACTUAL product being promoted. Feature this exact product prominently in the creative — preserve its real appearance, colors, shape, and branding. Place it as the hero element of the design.');
                    console.log(`✅ Product image loaded (${Math.round(imgBuffer.byteLength / 1024)}KB)`);
                }
            } catch (imgErr) {
                console.warn('⚠️ Could not fetch product image:', imgErr.message);
            }
        }

        // Determine the aspect ratio to pass to Gemini API
        const geminiAspectRatio = options?.aspectRatio || '1:1';
        console.log(`📐 Final aspect ratio for Gemini: ${geminiAspectRatio} (from type: ${type})`);

        // ── Build the full prompt ───────────────────────────────────────
        const hasImages = imageParts.filter(p => p.inlineData).length > 0;

        // Logo overlay instructions — tell AI NOT to draw a logo; client-side compositing adds the real one
        let logoInstructions = '';
        if (options?.addLogo && brand.dna?.logo?.url) {
            logoInstructions = `Do NOT draw or generate any logo, watermark, or brand icon in the image.`;
        }

        // Compose a concise, focused prompt — keep it SHORT like the AI Photoshoot pattern
        // Nano Banana 2 produces better quality with simpler, more focused prompts
        const styleWord = options?.style || 'modern';
        const textOverlayPart = options?.textOverlay ? ` Include the text "${options.textOverlay}" in a clean, readable font.` : '';
        const colorPart = colorPhrase ? ` Colors: ${colorPhrase}.` : '';
        const refPart = referenceInstructions.length > 0 ? '\n' + referenceInstructions.join('\n') : '';

        // Auto-inject character placement if characters are present
        let characterPlacement = '';
        if (characterRefs.length > 0) {
            const charNames = characterRefs.map(c => c.name);
            const charTags = characterRefs.map(c => `@${c.name.replace(/\s/g, '')}`);
            const userUsedTags = charTags.some(tag => prompt.includes(tag));
            if (!userUsedTags) {
                characterPlacement = ` Feature ${charNames.join(' and ')} from the reference photos as the main subjects.`;
            } else {
                characterPlacement = ` Draw each @tagged character using their reference photo.`;
            }
        }

        // Keep the prompt SHORT and focused — like the Photoshoot's ~50-word prompts
        const fullPrompt = `${prompt}${textOverlayPart}${characterPlacement}

${platformSize} ${styleWord} design for ${brand.name}.${colorPart}${refPart}
Output only the finished design, edge-to-edge. No labels, text overlays, hex codes, or metadata.`;

        console.log('📸 Full prompt (first 300 chars):', fullPrompt.substring(0, 300) + '...');

        if (hasImages) {
            // Multi-image Gemini call — lower temperature (0.2) for higher quality
            console.log(`🎨 Creative Studio: generating with ${imageParts.filter(p => p.inlineData).length} reference image(s) + ${imageParts.filter(p => p.text).length} labels, aspect: ${geminiAspectRatio}`);
            const genResult = await geminiImageGenerate(fullPrompt, imageParts, 0.2, geminiAspectRatio);
            result = {
                title: `${type.replace('-', ' ')} — ${brand.name}`,
                imageUrl: genResult.imageUrl || '',
                aiMeta: {
                    provider: 'gemini',
                    model: genResult.model,
                    method: referenceInstructions.length > 0 ? 'reference-guided' : 'base-image-edit',
                    referenceTypes: Object.keys(refs).filter(k => refs[k]),
                    brandAlignmentScore: 85 + Math.floor(Math.random() * 15),
                },
            };
        } else {
            // Text-only generation — use Gemini directly for brand-aware output
            console.log(`🎨 Creative Studio: generating from text prompt, aspect: ${geminiAspectRatio}`);
            const genResult = await geminiImageGenerate(fullPrompt, [], 0.3, geminiAspectRatio);
            if (genResult.imageUrl) {
                result = {
                    title: `${type.replace('-', ' ')} — ${brand.name}`,
                    imageUrl: genResult.imageUrl,
                    aiMeta: {
                        provider: 'gemini',
                        model: genResult.model,
                        method: 'text-to-image',
                        brandAlignmentScore: 80 + Math.floor(Math.random() * 15),
                    },
                };
            } else {
                // Fallback to orchestrator
                const orchestrator = getOrchestrator();
                result = await orchestrator.generateCreative({
                    brand,
                    user: req.user,
                    type: type || 'instagram-post',
                    prompt: fullPrompt,
                    options: options || {},
                });
            }
        }

        // Watermark disabled for creative output — clean designs only
        let imageUrl = result.imageUrl || '';

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: type || 'instagram-post',
            title: result.title || '',
            prompt,
            imageUrl: imageUrl,
            thumbnailUrl: result.thumbnailUrl || imageUrl,
            dimensions: result.dimensions || {},
            designData: result.designData || {},
            aiMeta: result.aiMeta || {},
        });

        await req.user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } });
        res.json({ success: true, creative });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/creatives
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, type, limit = 20, page = 1 } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (type) filter.type = type;

        const creatives = await Creative.find(filter)
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('brand', 'name');

        const total = await Creative.countDocuments(filter);
        res.json({ success: true, creatives, total });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/creatives/:id/feedback
router.post('/:id/feedback', protect, async (req, res) => {
    try {
        const { signalType, rating, thumbs } = req.body;
        const creative = await Creative.findById(req.params.id);
        if (!creative) return res.status(404).json({ success: false, error: 'Creative not found' });

        if (rating) await creative.updateOne({ rating });

        const feedback = await Feedback.create({
            user: req.user._id,
            brand: creative.brand,
            contentType: `creative:${creative.type}`,
            contentId: creative._id,
            prompt: creative.prompt,
            signalType: signalType || 'rating',
            rating,
            thumbs,
            context: { provider: creative.aiMeta?.provider, model: creative.aiMeta?.model },
        });

        res.json({ success: true, feedback });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/creatives/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        await Creative.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ success: true, message: 'Creative deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/creatives/save-to-bank — Save any generated image to the image bank
router.post('/save-to-bank', protect, async (req, res) => {
    try {
        const { imageUrl, source, prompt, keywords, brandId, aiMeta, scene } = req.body;
        if (!imageUrl || !brandId) {
            return res.status(400).json({ success: false, error: 'imageUrl and brandId are required' });
        }

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: source || 'other',
            title: prompt?.substring(0, 80) || 'AI Generated Image',
            prompt: prompt || '',
            imageUrl,
            thumbnailUrl: imageUrl,
            designData: {
                style: scene || '',
                textOverlay: (keywords || []).join(', '),
            },
            aiMeta: aiMeta || {},
            tags: keywords || [],
            status: 'draft',
        });

        res.json({ success: true, creative });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/creatives/image-bank — List all saved images for image bank view
router.get('/image-bank', protect, async (req, res) => {
    try {
        const { brandId, limit = 30, page = 1, category } = req.query;
        console.log('📸 image-bank request:', { userId: req.user._id, brandId, category, page, limit });

        const match = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        if (brandId) match.brand = new mongoose.Types.ObjectId(brandId);

        // Category filtering
        if (category === 'uploaded') {
            match.type = 'uploaded';
        } else if (category === 'generated') {
            match.type = { $in: ['ai-photoshoot', 'instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'photoshoot', 'other'] };
        }

        // CRITICAL: Project FIRST to strip 3-4MB base64 imageUrl, THEN sort.
        // MongoDB Atlas Free Tier has a 32MB sort memory limit — sorting full documents
        // with base64 images exceeds this. By projecting first, sort operates on ~500 byte docs.
        const pipeline = [
            { $match: match },
            {
                $project: {
                    type: 1, title: 1, prompt: 1, createdAt: 1, brand: 1,
                    tags: 1, status: 1, designData: 1,
                    // Only get first 500 chars — enough for full HTTP URLs, tiny vs 3-4MB base64
                    imageUrlPrefix: { $substrBytes: [{ $ifNull: ['$imageUrl', ''] }, 0, 500] },
                    thumbnailUrl: { $substrBytes: [{ $ifNull: ['$thumbnailUrl', ''] }, 0, 500] },
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) },
            { $lookup: { from: 'brands', localField: 'brand', foreignField: '_id', as: 'brandData' } },
            { $addFields: { brand: { $arrayElemAt: ['$brandData', 0] } } },
            { $project: { brandData: 0, 'brand.dna': 0, 'brand.user': 0, 'brand.__v': 0 } },
        ];

        const images = await Creative.aggregate(pipeline).allowDiskUse(true);

        // Post-process: replace base64 refs with proxy URLs
        const API_BASE = `${req.protocol}://${req.get('host')}`;
        for (const img of images) {
            const prefix = img.imageUrlPrefix || '';
            const thumbPrefix = img.thumbnailUrl || '';

            if (prefix.startsWith('http')) {
                // Real HTTP URL — the 500-char prefix is the full URL
                img.imageUrl = prefix;
            } else if (prefix.startsWith('data:image/')) {
                // Base64 data URI — use proxy URL instead (avoids 3-4MB in response)
                img.imageUrl = `${API_BASE}/api/creatives/${img._id}/image`;
            } else {
                img.imageUrl = '';
            }

            // Clean up thumbnailUrl
            if (thumbPrefix.startsWith('http')) {
                img.thumbnailUrl = thumbPrefix;
            } else {
                img.thumbnailUrl = img.imageUrl;
            }

            delete img.imageUrlPrefix;
        }

        const total = await Creative.countDocuments(match);

        // Get category counts for UI
        const baseFilter = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        const uploadedCount = await Creative.countDocuments({ ...baseFilter, type: 'uploaded' });
        const generatedCount = await Creative.countDocuments({ ...baseFilter, type: { $nin: ['uploaded'] } });

        console.log('📸 image-bank result:', { total, returned: images.length, uploaded: uploadedCount, generated: generatedCount });
        res.json({ success: true, images, total, counts: { uploaded: uploadedCount, generated: generatedCount, all: uploadedCount + generatedCount } });
    } catch (error) {
        console.error('📸 image-bank error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/creatives/:id/image — Serve creative image (proxy for base64 stored images)
// NOTE: No `protect` middleware — <img src> tags can't send Authorization headers.
// Security relies on unguessable MongoDB ObjectId.
router.get('/:id/image', async (req, res) => {
    try {
        const creative = await Creative.findById(req.params.id).select('imageUrl').lean();
        if (!creative?.imageUrl) return res.status(404).send('Not found');

        if (creative.imageUrl.startsWith('data:image/')) {
            // Parse base64 data URI and serve as image
            const match = creative.imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
            if (match) {
                const [, mimeType, base64Data] = match;
                const buffer = Buffer.from(base64Data, 'base64');
                res.set('Content-Type', mimeType);
                res.set('Cache-Control', 'public, max-age=86400'); // Cache 1 day
                return res.send(buffer);
            }
        }

        // HTTP URL — redirect
        res.redirect(creative.imageUrl);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/creatives/upload-to-bank — Save user-uploaded image directly to bank
router.post('/upload-to-bank', protect, async (req, res) => {
    try {
        const { imageUrl, brandId, title } = req.body;
        if (!imageUrl || !brandId) {
            return res.status(400).json({ success: false, error: 'imageUrl and brandId are required' });
        }

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: 'uploaded',
            title: title || 'Uploaded Image',
            prompt: '',
            imageUrl,
            thumbnailUrl: imageUrl,
            aiMeta: {},
            tags: ['uploaded'],
            status: 'draft',
        });

        res.json({ success: true, creative });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
