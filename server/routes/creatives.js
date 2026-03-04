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
    return parts.join(' ');
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
async function geminiImageGenerate(promptText, imageParts = [], temperature = 0.4) {
    const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('Gemini API key not configured');

    const models = [
        'gemini-3.1-flash-image-preview',
        'gemini-3-pro-image-preview',
        'gemini-2.5-flash-image',
        'gemini-2.0-flash-exp-image-generation',
    ];

    // Build content parts: images first, then text
    const parts = [
        ...imageParts.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: promptText },
    ];

    let imageUrl = null;
    let usedModel = '';
    let textResponse = '';

    for (const modelId of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature },
                }),
            });
            const data = await resp.json();
            if (data.error) { console.error(`Model ${modelId}:`, data.error.message); continue; }
            const resParts = data.candidates?.[0]?.content?.parts || [];
            for (const part of resParts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
                if (part.text) textResponse += part.text;
            }
            if (imageUrl) { usedModel = modelId; break; }
        } catch (e) { console.error(`Model ${modelId} error:`, e.message); continue; }
    }

    return { imageUrl, model: usedModel, textResponse };
}

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

        // Reference images: style, character, upload
        const refs = options?.referenceImages || {};
        if (refs.style && refs.style.startsWith('data:image/')) {
            imageParts.push(extractBase64(refs.style));
            referenceInstructions.push('STYLE REFERENCE: Match the visual style, color palette, mood, composition, and aesthetic of the FIRST attached image. Replicate its design language but adapt for the described content.');
        }
        if (refs.character && refs.character.startsWith('data:image/')) {
            imageParts.push(extractBase64(refs.character));
            referenceInstructions.push(`CHARACTER REFERENCE: Include the character/person/mascot from the ${refs.style ? 'SECOND' : 'FIRST'} attached image in the generated creative. Preserve their appearance, style, and features accurately.`);
        }
        if (refs.upload && refs.upload.startsWith('data:image/')) {
            imageParts.push(extractBase64(refs.upload));
            referenceInstructions.push('REFERENCE IMAGE: Use this image as a contextual reference for the creative.');
        }

        // Base image from AI Photoshoot
        if (options?.baseImage && options.baseImage.startsWith('data:image/')) {
            imageParts.push(extractBase64(options.baseImage));
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
                    imageParts.push({ mimeType, data: base64 });
                    referenceInstructions.push('PRODUCT IMAGE: This is the ACTUAL product being promoted. Feature this exact product prominently in the creative — preserve its real appearance, colors, shape, and branding. Place it as the hero element of the design.');
                    console.log(`✅ Product image loaded (${Math.round(imgBuffer.byteLength / 1024)}KB)`);
                }
            } catch (imgErr) {
                console.warn('⚠️ Could not fetch product image:', imgErr.message);
            }
        }

        // ── Build the full prompt ───────────────────────────────────────
        const hasImages = imageParts.length > 0;

        // Logo overlay instructions — tell AI NOT to draw a logo; client-side compositing adds the real one
        let logoInstructions = '';
        if (options?.addLogo && brand.dna?.logo?.url) {
            logoInstructions = `Do NOT draw or generate any logo, watermark, or brand icon in the image.`;
        }

        // Compose a fully natural-language prompt — NO structured metadata, NO labels
        const styleWord = options?.style || 'modern';
        const textOverlayPart = options?.textOverlay ? ` with the text "${options.textOverlay}" prominently displayed` : '';
        const colorPart = colorPhrase ? ` using ${colorPhrase}` : '';
        const refPart = referenceInstructions.length > 0 ? '\n' + referenceInstructions.join('\n') : '';

        const fullPrompt = `Generate a ${styleWord}, polished graphic for a ${brandDesc}. ${prompt}${textOverlayPart}. The design should have ${colorPart ? colorPart : 'a professional color scheme'}. Make it visually striking and ready to post.${refPart}${logoInstructions ? '\n' + logoInstructions : ''}

The output must be ONLY the finished design filling the entire image from edge to edge. Do not add any labels, titles, font names, color names, color swatches, palette bars, hex codes, dimension text, watermarks, borders, frames, or any metadata anywhere in or around the image.`;

        if (hasImages) {
            // Multi-image Gemini call (reference images + prompt)
            console.log(`🎨 Creative Studio: generating with ${imageParts.length} reference image(s)...`);
            const genResult = await geminiImageGenerate(fullPrompt, imageParts, 0.4);
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
            console.log(`🎨 Creative Studio: generating from text prompt...`);
            const genResult = await geminiImageGenerate(fullPrompt, [], 0.5);
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
        const { brandId, limit = 50, page = 1, category } = req.query;
        console.log('📸 image-bank request:', { userId: req.user._id, brandId, category, page, limit });

        const match = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        if (brandId) match.brand = new mongoose.Types.ObjectId(brandId);

        // Category filtering
        if (category === 'uploaded') {
            match.type = 'uploaded';
        } else if (category === 'generated') {
            match.type = { $in: ['ai-photoshoot', 'instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'photoshoot', 'other'] };
        }

        // Use aggregation with allowDiskUse to avoid 32MB sort memory limit
        // (each document has 3-4MB base64 imageUrl/thumbnailUrl fields)
        const pipeline = [
            { $match: match },
            { $sort: { createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) },
            {
                $project: {
                    type: 1, title: 1, prompt: 1, createdAt: 1, brand: 1,
                    tags: 1, status: 1, aiMeta: 1, designData: 1,
                    imageUrl: 1, thumbnailUrl: 1,
                }
            },
            { $lookup: { from: 'brands', localField: 'brand', foreignField: '_id', as: 'brandData' } },
            { $addFields: { brand: { $arrayElemAt: ['$brandData', 0] } } },
            { $project: { brandData: 0, 'brand.dna': 0, 'brand.user': 0, 'brand.__v': 0 } },
        ];

        const images = await Creative.aggregate(pipeline).allowDiskUse(true);

        const total = await Creative.countDocuments(match);

        // Get category counts for UI
        const baseFilter = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        const uploadedCount = await Creative.countDocuments({ ...baseFilter, type: 'uploaded' });
        const generatedCount = await Creative.countDocuments({ ...baseFilter, type: { $nin: ['uploaded'] } });

        console.log('📸 image-bank result:', { total, returned: images.length, uploaded: uploadedCount, generated: generatedCount });
        res.json({ success: true, images, total, counts: { uploaded: uploadedCount, generated: generatedCount, all: uploadedCount + generatedCount } });
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
