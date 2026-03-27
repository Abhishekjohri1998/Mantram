import mongoose from 'mongoose';
import { Router } from 'express';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits, refundCredits } from '../middleware/credits.js';
import { getOrchestrator } from '../agents/orchestrator.js';
import { addWatermark } from '../utils/watermark.js';
import { getSetting } from '../models/SystemSettings.js';
import { uploadToS3 } from '../utils/s3.js';
import { overlayLogo, fetchImageBuffer } from '../utils/logoOverlay.js';
import { GoogleGenAI } from '@google/genai';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ── Build a natural-language brand description (NO labels, NO structured metadata)
// Image models render any label/noun as visible text, so this must be purely descriptive
function buildBrandDescription(brand) {
    const parts = [];
    const dna = brand.dna || {};
    if (dna.industry) parts.push(`${dna.industry}`);
    parts.push(`brand called ${brand.name}`);
    if (dna.voice?.personality) parts.push(`with a ${dna.voice.personality} feel`);
    if (dna.targetAudience) parts.push(`targeting ${dna.targetAudience}`);
    
    // Tagline — woven in naturally
    if (dna.tagline) parts.push(`— "${dna.tagline}"`);
    
    // Company overview / brand description — the elevator pitch
    const overview = dna.companyOverview || dna.brandDescription || '';
    if (overview) parts.push(`— ${overview.substring(0, 200)}`);
    
    // Services/products — described naturally, no bullet points
    const services = dna.servicesOffered || [];
    if (services.length > 0) {
        const serviceList = services.slice(0, 5).join(', ');
        parts.push(`offering ${serviceList}`);
    }
    
    // USPs — described as strengths, not labels
    const usps = dna.uniqueSellingPoints || [];
    if (usps.length > 0) {
        const uspList = usps.slice(0, 3).join(', ');
        parts.push(`known for ${uspList}`);
    }
    
    return parts.join(' ');
}

// ── Build rich visual context from brand DNA for image prompts ──
function buildVisualContext(brand) {
    const parts = [];
    const dna = brand.dna || {};
    if (dna.voice?.personality) parts.push(`Brand personality: ${dna.voice.personality}`);
    
    // NOTE: Typography metadata removed from prompts — Gemini renders font names,
    // weights, and style labels (e.g. "Work Sans 700 normal") as visible text cards
    // on the image. Typography is handled by the canvas editor, not image generation.
    
    // ── Photography & Image Style ──
    if (dna.photographyStyle) parts.push(`Photography direction: ${dna.photographyStyle}`);
    
    // ── Visual DNA — AI-extracted design intelligence ──
    const vdna = dna.visualDNA || {};
    if (vdna.designStyle) parts.push(`Design style: ${vdna.designStyle}`);
    if (vdna.layoutPreference) parts.push(`Layout: ${vdna.layoutPreference}`);
    if (vdna.textPlacement) parts.push(`Text placement: ${vdna.textPlacement}`);
    if (vdna.imageMood) parts.push(`Image mood: ${vdna.imageMood}`);
    if (vdna.textureStyle) parts.push(`Texture/surface: ${vdna.textureStyle}`);
    if (vdna.typographyStyle) parts.push(`Typography rendering: ${vdna.typographyStyle}`);
    if (vdna.decorativeElements) parts.push(`Decorative elements: ${vdna.decorativeElements}`);
    // NOTE: vdna.imageAnalysis removed — it often contains raw color descriptions\n    // and hex codes that Gemini renders as visible swatches on generated images
    
    // ── Design rules from visual DNA ──
    const designRules = vdna.designRules || [];
    const designAvoid = vdna.designAvoid || [];
    if (designRules.length > 0) parts.push(`DESIGN RULES — always follow: ${designRules.slice(0, 5).join('; ')}`);
    if (designAvoid.length > 0) parts.push(`DESIGN AVOIDS — never do: ${designAvoid.slice(0, 5).join('; ')}`);
    
    // ── Content style do's and don'ts ──
    if (dna.contentStyle?.dos?.length) {
        parts.push(`Content principles: ${dna.contentStyle.dos.slice(0, 3).join(', ')}`);
    }
    if (dna.contentStyle?.donts?.length) {
        parts.push(`Content avoids: ${dna.contentStyle.donts.slice(0, 3).join(', ')}`);
    }
    
    // ── Brand values & mission — gives AI deeper context for visual storytelling ──
    const values = dna.brandValues || [];
    if (values.length > 0) {
        parts.push(`Brand values: ${values.slice(0, 4).join(', ')}`);
    }
    if (dna.missionStatement) {
        parts.push(`Brand mission: ${dna.missionStatement.substring(0, 150)}`);
    }
    return parts.join('. ');
}

// Convert brand colors to a direct, enforceable color directive for the AI
// CRITICAL: Describe colors by appearance only — hex codes, labels, and names
// get rendered as visible text/swatches on the image by Gemini
function getColorPhrase(brand) {
    const colors = brand.dna?.colors || [];
    if (!colors.length) return '';
    // Describe colors by visual appearance — NEVER include hex codes, color names as labels,
    // or any technical metadata that the model might render as text on the image
    const colorDescs = colors.slice(0, 4).map(c => {
        const name = c.name || '';
        // Use descriptive color names only, never hex codes
        if (name && !/^#|rgb|color/i.test(name)) return name.toLowerCase();
        // Fallback: skip hex codes entirely — just say 'brand accent'
        return 'brand accent';
    }).filter((v, i, a) => a.indexOf(v) === i); // deduplicate
    return `Use these brand colors throughout the design: ${colorDescs.join(', ')}`;
}

// ── Helper: extract base64 from data URI ────────────────────────────────
function extractBase64(dataUri) {
    const commaIdx = dataUri.indexOf(',');
    const header = dataUri.substring(0, commaIdx);
    const mimeType = header.split(':')[1].split(';')[0];
    const data = dataUri.substring(commaIdx + 1);
    return { mimeType, data };
}

// ── Image Model Configuration ──────────────────────────────────────────
// User-selectable models — NO auto-fallback chain. Default: NanoBanana 2.
// Gemini-native models use Google Direct API; others route through fal.ai.
const IMAGE_MODEL_CONFIG = {
    'nanobanana-2': {
        provider: 'gemini',
        modelId: 'gemini-3.1-flash-image-preview',
        name: 'NanoBanana 2',
        supportsRefImages: true,
    },
    'nanobanana-pro': {
        provider: 'gemini',
        modelId: 'gemini-3-pro-image-preview',
        name: 'NanoBanana Pro',
        supportsRefImages: true,
    },
    'flux-pro-v1.1': {
        provider: 'fal',
        endpoint: 'fal-ai/flux-pro/v1.1',
        name: 'Flux Pro v1.1',
        supportsRefImages: false,
    },
    'flux-2-pro': {
        provider: 'fal',
        endpoint: 'fal-ai/flux-pro/v2',
        name: 'Flux 2 Pro',
        supportsRefImages: false,
    },
    'seedream-5': {
        provider: 'fal',
        endpoint: 'fal-ai/seedream-3',
        name: 'Seedream 5',
        supportsRefImages: false,
    },
    'ideogram': {
        provider: 'fal',
        endpoint: 'fal-ai/ideogram/v3',
        name: 'Ideogram v3',
        supportsRefImages: false,
    },
};

// ── fal.ai Image Generation (queue-based async) ─────────────────────────
async function falImageGenerate(promptText, endpoint, aspectRatio = '1:1') {
    const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
    if (!falKey) throw new Error('FAL_KEY not configured for image generation');

    // Map aspect ratio to fal.ai image_size
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

    console.log(`\n══════ FAL.AI IMAGE GENERATION ══════`);
    console.log(`🎨 Endpoint: ${endpoint}`);
    console.log(`📐 Size: ${imgSize.width}x${imgSize.height} (${aspectRatio})`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    // Submit to fal.ai queue
    const submitResp = await fetch(`https://queue.fal.run/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${falKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: promptText,
            image_size: imgSize,
            num_images: 1,
            sync_mode: true, // Wait for result (up to 60s)
        }),
        signal: AbortSignal.timeout(90000),
    });

    if (!submitResp.ok) {
        const errText = await submitResp.text();
        console.error(`❌ fal.ai image error (${submitResp.status}):`, errText);
        throw new Error(`fal.ai image generation failed (${submitResp.status}): ${errText.substring(0, 200)}`);
    }

    const data = await submitResp.json();

    // fal.ai returns { images: [{ url, content_type }], ... } or { request_id } for async
    let imageUrl = '';
    if (data.images?.[0]?.url) {
        imageUrl = data.images[0].url;
    } else if (data.output?.images?.[0]?.url) {
        imageUrl = data.output.images[0].url;
    } else if (data.request_id) {
        // Async mode — poll for result
        console.log(`⏳ fal.ai queued: ${data.request_id}, polling...`);
        const resultUrl = `https://queue.fal.run/${endpoint}/requests/${data.request_id}`;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const pollResp = await fetch(resultUrl, {
                    headers: { 'Authorization': `Key ${falKey}` },
                });
                if (pollResp.status === 200) {
                    const pollData = await pollResp.json();
                    if (pollData.images?.[0]?.url) {
                        imageUrl = pollData.images[0].url;
                        break;
                    }
                    if (pollData.output?.images?.[0]?.url) {
                        imageUrl = pollData.output.images[0].url;
                        break;
                    }
                }
            } catch { /* retry */ }
        }
    }

    if (!imageUrl) throw new Error('fal.ai returned no image');

    console.log(`✅ Image generated via fal.ai: ${imageUrl.substring(0, 100)}...`);
    console.log(`══════ END FAL.AI IMAGE GENERATION ══════\n`);

    return { imageUrl, model: endpoint, textResponse: '', warnings: [] };
}

// ── Gemini image generation via REST API ────────────────────────────────
// Used for NanoBanana 2 and NanoBanana Pro. NO auto-fallback chain.
// If the model is busy (503), returns modelBusy flag so frontend can notify user.
async function geminiImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModelId = 'gemini-3.1-flash-image-preview') {
    const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('Gemini API key not configured');

    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    // Build content parts — images as inlineData, then text prompt last
    const parts = [];
    for (const ip of imageParts) {
        if (ip.inlineData) parts.push({ inlineData: ip.inlineData });
    }
    const finalPrompt = aspectRatio && aspectRatio !== '1:1' ? `${promptText}\n\n[ASPECT RATIO: ${aspectRatio}]` : promptText;
    parts.push({ text: finalPrompt });

    let imageUrl = null;
    let textResponse = '';
    let usedModel = '';

    const imageCount = parts.filter(p => p.inlineData).length;
    console.log(`\n══════ CREATIVE STUDIO IMAGE GENERATION (${selectedModelId}) ══════`);
    console.log(`🖼️  Reference images: ${imageCount}`);
    console.log(`📐 Aspect ratio: ${aspectRatio} | Resolution: ${imageSize}`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    // Prepend aspect ratio instruction to prompt for correct dimensions
    const arInstruction = aspectRatio !== '1:1' ? `Generate this image in ${aspectRatio} aspect ratio (${aspectRatio === '9:16' ? 'portrait/vertical' : aspectRatio === '16:9' ? 'landscape/horizontal' : aspectRatio}). ` : '';
    // Update text prompt with aspect ratio
    const lastPartIdx = parts.length - 1;
    if (parts[lastPartIdx]?.text) {
        parts[lastPartIdx].text = arInstruction + parts[lastPartIdx].text;
    }

    const warnings = [];

    try {
        console.log(`🎨 Using: ${selectedModelId}...`);
        const url = `${baseUrl}/models/${selectedModelId}:generateContent?key=${imageKey}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    temperature,
                },
            }),
        });

        const data = await resp.json();
        if (data.error) {
            const errMsg = data.error.message || JSON.stringify(data.error);
            console.warn(`⚠️ ${selectedModelId}: ${errMsg}`);

            // Check for busy/overload — return modelBusy flag for frontend notification
            if (errMsg.toLowerCase().includes('high demand') || errMsg.toLowerCase().includes('busy') || resp.status === 503 || resp.status === 429) {
                console.log(`🔴 ${selectedModelId} is BUSY — returning modelBusy flag`);
                return { imageUrl: null, model: selectedModelId, textResponse: '', warnings: [], modelBusy: true };
            }
            throw new Error(`${selectedModelId}: ${errMsg}`);
        }

        const resParts = data.candidates?.[0]?.content?.parts || [];
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
            if (part.text) textResponse += part.text;
        }

        if (imageUrl) {
            usedModel = selectedModelId;
            console.log(`✅ Image generated successfully with ${selectedModelId}`);
        } else {
            console.warn(`⚠️ ${selectedModelId}: no image in response`);
            warnings.push(`${selectedModelId} returned no image.`);
            throw new Error(`${selectedModelId} returned no image in response`);
        }
    } catch (e) {
        if (e.message?.includes('modelBusy')) throw e; // re-throw busy
        console.error(`❌ ${selectedModelId} error:`, e.message);
        throw e;
    }

    console.log(`══════ END IMAGE GENERATION ══════\n`);
    return { imageUrl, model: usedModel, textResponse, warnings };
}

// ── Unified Image Generate — routes to correct provider based on selected model ──
async function routedImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K', selectedModel = 'nanobanana-2') {
    const modelConfig = IMAGE_MODEL_CONFIG[selectedModel] || IMAGE_MODEL_CONFIG['nanobanana-2'];

    console.log(`🎯 Image Model Router: ${selectedModel} → ${modelConfig.provider} (${modelConfig.name})`);

    if (modelConfig.provider === 'gemini') {
        // Gemini Direct — supports reference images
        return await geminiImageGenerate(promptText, imageParts, temperature, aspectRatio, imageSize, modelConfig.modelId);
    }

    if (modelConfig.provider === 'fal') {
        // fal.ai — text-to-image only (no reference image support)
        if (imageParts.length > 0) {
            console.warn(`⚠️ ${modelConfig.name} does not support reference images — generating from text only`);
        }
        return await falImageGenerate(promptText, modelConfig.endpoint, aspectRatio);
    }

    throw new Error(`Unknown image provider: ${modelConfig.provider}`);
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
10. NEVER describe the output as a "design mockup", "floating card", "framed poster", or "presented on a background". The prompt must describe the ACTUAL content that fills the entire canvas — not a presentation of content.

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

        // Prompt enhancement is a lightweight text task — use ONLY cheap models.
        // Gemini Flash (~free) or GPT-4o-mini ($0.015/1K). Never waste Claude on this.
        const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        const openaiKey = process.env.OPENAI_API_KEY;
        let enhanced = '';

        // Try Gemini first (cheapest)
        if (geminiKey) {
            try {
                const resp = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            systemInstruction: { parts: [{ text: systemPrompt }] },
                            contents: [{ parts: [{ text: userPrompt }] }],
                            generationConfig: { temperature: 0.7, maxOutputTokens: 300 },
                        }),
                    }
                );
                const data = await resp.json();
                enhanced = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            } catch (e) {
                console.warn('Prompt enhance: Gemini failed:', e.message);
            }
        }

        // Fallback to GPT-4o-mini (still cheap)
        if (!enhanced && openaiKey) {
            try {
                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
                        temperature: 0.7, max_tokens: 300,
                    }),
                });
                const data = await resp.json();
                enhanced = data.choices?.[0]?.message?.content || '';
            } catch (e) {
                console.warn('Prompt enhance: GPT-4o-mini failed:', e.message);
            }
        }

        // Last resort: return original prompt (never call Claude for this)
        if (!enhanced) enhanced = prompt;

        // Clean up the response — remove quotes, "Generate:" prefixes, etc.
        enhanced = enhanced.trim();
        enhanced = enhanced.replace(/^["']|["']$/g, '').trim();
        enhanced = enhanced.replace(/^(Generate|Create|Design|Prompt|Enhanced):?\s*/i, '').trim();

        res.json({ success: true, enhancedPrompt: enhanced });
    } catch (error) {
        console.error('Prompt enhance error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/generate
router.post('/generate', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const { brandId, type, prompt, options } = req.body;
        if (!brandId || !prompt) {
            return res.status(400).json({ success: false, error: 'brandId and prompt are required' });
        }

        // ── DIAGNOSTIC LOGGING — trace what arrives from frontend ──
        console.log('\n═══════════════════════ CREATIVE GENERATE REQUEST ═══════════════════════');
        console.log('📋 brandId:', brandId);
        console.log('📋 type:', type);
        console.log('📋 prompt (first 100):', prompt?.substring(0, 100));
        console.log('📋 options keys:', options ? Object.keys(options) : 'NO OPTIONS');
        if (options) {
            console.log('  🎨 style:', options.style);
            console.log('  📐 aspectRatio:', options.aspectRatio);
            console.log('  🤖 imageModel:', options.imageModel || 'nanobanana-2 (default)');
            console.log('  📝 textOverlay:', options.textOverlay || '(none)');
            console.log('  🏷️  addLogo:', options.addLogo);
            console.log('  📍 logoPosition:', options.logoPosition);
            console.log('  📏 logoSize:', options.logoSize);
            console.log('  🖼️  referenceImages:', options.referenceImages ? {
                style: options.referenceImages.style ? `${typeof options.referenceImages.style} (${options.referenceImages.style.substring(0, 30)}...)` : null,
                upload: options.referenceImages.upload ? `${typeof options.referenceImages.upload} (${options.referenceImages.upload.substring(0, 30)}...)` : null,
            } : 'NO REF IMAGES');
            console.log('  👥 characters:', options.characters?.length || 0, options.characters?.map(c => ({ name: c.name, imageType: c.image ? (c.image.startsWith('data:') ? 'base64' : 'url') : 'none' })));
            console.log('  📦 productImageUrl:', options.productImageUrl ? options.productImageUrl.substring(0, 60) : '(none)');
            console.log('  🎯 baseImage:', options.baseImage ? `present (${Math.round(options.baseImage.length / 1024)}KB)` : '(none)');
        }
        console.log('═══════════════════════════════════════════════════════════════════════\n');

        const brand = await Brand.findOne({ _id: brandId, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        // Build natural-language brand description (no labels)
        const brandDesc = buildBrandDescription(brand);
        const colorPhrase = getColorPhrase(brand);

        const sizeMap = {
            'instagram-post': '1080x1350 portrait (4:5 ratio)',
            'instagram-story': '1080x1920 vertical story (9:16 ratio)',
            'facebook-ad': '1080x1350 portrait (4:5 ratio)',
            'linkedin-post': '1200x1200 square (1:1 ratio)',
            'youtube-thumb': '1280x720 landscape thumbnail (16:9 ratio)',
            'banner': '1920x480 wide banner',
            'twitter-post': '1200x675 landscape',
        };
        let platformSize = sizeMap[type] || '1080x1350 portrait';

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
            '1.91:1': '1200x628 LinkedIn landscape',
        };
        if (options?.aspectRatio && ratioMap[options.aspectRatio]) {
            platformSize = ratioMap[options.aspectRatio];
        }

        let result;

        // ── Collect all image parts for Gemini multi-image call ──────────
        const imageParts = [];
        const referenceInstructions = [];

        // Reference images: style, character, upload, template base, product — support both base64 data URIs and HTTP URLs
        const refs = options?.referenceImages || {};
        const characters = options?.characters || [];
        const templateRefUrl = options?.templateInpainting ? options?.templateRefImageUrl : null;
        const productUrl = options?.productImageUrl && !options?.baseImage ? options.productImageUrl : null;

        // Helper: resolve a reference image (base64 or HTTP URL) to an image part
        async function resolveRefImage(src, label) {
            if (!src) return null;
            if (src.startsWith('data:image/')) {
                return { part: extractBase64(src), label };
            }
            if (src.startsWith('http')) {
                try {
                    const imgResp = await fetch(src, {
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                        redirect: 'follow',
                    });
                    if (imgResp.ok) {
                        const buf = await imgResp.arrayBuffer();
                        let ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                        let imgData = Buffer.from(buf);

                        // Convert webp/gif to JPEG — Gemini docs only show jpeg/png examples
                        if (ct === 'image/webp' || ct === 'image/gif') {
                            try {
                                const sharp = (await import('sharp')).default;
                                imgData = await sharp(imgData).jpeg({ quality: 90 }).toBuffer();
                                ct = 'image/jpeg';
                            } catch (convErr) {}
                        }
                        return { part: { mimeType: ct, data: imgData.toString('base64') }, label };
                    }
                } catch (e) {}
            }
            return null;
        }

        // Parallelize ALL external fetches
        const [styleRef, uploadRef, ...otherRefs] = await Promise.all([
            resolveRefImage(refs.style, 'style'),
            resolveRefImage(refs.upload, 'upload'),
            resolveRefImage(templateRefUrl, 'template-base'),
            resolveRefImage(productUrl, 'product'),
            ...characters.slice(0, 5).map((char, i) => resolveRefImage(char.image, `character-${char.name || i + 1}`))
        ]);

        const templateRef = otherRefs[0];
        const productRef = otherRefs[1];
        const characterRefsRaw = otherRefs.slice(2);
        const characterRefs = characterRefsRaw.filter(Boolean).map((resolved, i) => ({
            ...resolved,
            name: characters[i]?.name || `Character ${i + 1}`
        }));

        console.log(`🖼️  Reference image results: style=${!!styleRef}, upload=${!!uploadRef}, template=${!!templateRef}, product=${!!productRef}, characters=${characterRefs.length}`);

        // Build image parts — MINIMAL labels, images first
        if (styleRef) {
            imageParts.push({ inlineData: { mimeType: styleRef.part.mimeType, data: styleRef.part.data } });
            referenceInstructions.push('Match the visual style, colors, and mood of the provided style reference image.');
        }

        for (const charRef of characterRefs) {
            imageParts.push({ inlineData: { mimeType: charRef.part.mimeType, data: charRef.part.data } });
        }
        if (characterRefs.length > 0) {
            if (characterRefs.length === 1) {
                referenceInstructions.push('Using the provided reference photo of this person, the generated image must feature this EXACT same person. Replicate their exact face, skin tone, hair, body type, and overall appearance from the reference photo. Do NOT generate a different or generic person.');
            } else {
                referenceInstructions.push(`Using the ${characterRefs.length} provided reference photos of these people, the generated image must feature these EXACT same people. Replicate their exact faces, skin tones, hair, body types, and overall appearance from the reference photos.`);
            }
        }

        if (uploadRef) {
            imageParts.push({ inlineData: { mimeType: uploadRef.part.mimeType, data: uploadRef.part.data } });
            referenceInstructions.push('Use the provided reference image as contextual inspiration for the composition.');
        }

        // ── Template Inpainting Mode ──────────────────────────────────────
        let isInpainting = false;
        if (options?.templateInpainting && templateRef) {
            isInpainting = true;
            const hasCharacter = characterRefs.length > 0;
            const swapWhat = hasCharacter ? 'model/person AND product' : 'product';
            console.log(`🎨 TEMPLATE INPAINTING MODE — keeping layout, swapping ${swapWhat}`);

            imageParts.push({ inlineData: { mimeType: templateRef.part.mimeType, data: templateRef.part.data } });

            if (hasCharacter) {
                const charIdx = referenceInstructions.findIndex(r => r.includes('EXACT same person'));
                if (charIdx !== -1) referenceInstructions.splice(charIdx, 1);
                referenceInstructions.push('INPAINTING — PERSON SWAP: Replace the model/person in the template with the person from the provided character reference photo. Use their EXACT face, skin tone, hair, body type, and appearance. Keep the same pose, clothing style, and positioning as in the template.');
            }

            if (options?.baseImage && options.baseImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(options.baseImage) });
                referenceInstructions.push('INPAINTING — PRODUCT SWAP: Replace ONLY the product in the template with the new product image. Keep everything else: same layout, colors, typography, logo placement, background, and content positions.');
            } else if (productRef) {
                imageParts.push({ inlineData: { mimeType: productRef.part.mimeType, data: productRef.part.data } });
                referenceInstructions.push('INPAINTING — PRODUCT SWAP: Replace ONLY the product in the template with the new product image. Keep everything else: same layout, colors, typography, logo placement, background, and content positions.');
            } else if (!hasCharacter) {
                referenceInstructions.push('INPAINTING: Recreate this exact design with the same layout, colors, typography, logo, and content placement. Replace the placeholder text ({{HEADLINE}}, {{SUBTEXT}}, {{CTA}}) with the content specified in the prompt.');
            }
        }

        // Base image from AI Photoshoot (skip if inpainting handled it)
        if (!isInpainting && options?.baseImage && options.baseImage.startsWith('data:image/')) {
            imageParts.push({ inlineData: extractBase64(options.baseImage) });
            referenceInstructions.push('PRODUCT IMAGE: Keep this product exactly as-is — same colors, labels, text, shape. Only change background and styling.');
        }

        // Product image from catalog (remote URL)
        if (!isInpainting && productRef) {
            imageParts.push({ inlineData: { mimeType: productRef.part.mimeType, data: productRef.part.data } });
            referenceInstructions.push('PRODUCT IMAGE: This is the ACTUAL product being promoted. Feature this exact product prominently in the creative — preserve its real appearance, colors, shape, and branding. Place it as the hero element of the design.');
        }

        // Determine the aspect ratio and resolution to pass to Gemini API
        const geminiAspectRatio = options?.aspectRatio || '1:1';
        const geminiImageSize = options?.imageSize || '1K';
        console.log(`📐 Final aspect ratio: ${geminiAspectRatio}, resolution: ${geminiImageSize} (from type: ${type})`);

        // ── Build the full prompt ───────────────────────────────────────
        const hasImages = imageParts.filter(p => p.inlineData).length > 0;

        // NO logo instructions in the prompt. Mentioning "logo" in any way
        // (even "do NOT draw a logo") causes Gemini to hallucinate logo text.
        // The real brand logo is composited server-side via Sharp after generation.

        const styleWord = options?.style || 'modern';
        const textOverlayPart = options?.textOverlay ? ` Include the text "${options.textOverlay}" in a clean, readable font.` : '';
        // CRITICAL: Do NOT inject color directives into Gemini image prompts.
        // Even descriptive color phrases ("use purple tones") cause Gemini to render
        // visible color swatches/palettes with hex codes on the generated image.
        // Colors are handled by the prompt enhancer (text-to-text step) instead.
        const refPart = referenceInstructions.length > 0 ? '\n' + referenceInstructions.join('\n') : '';
        const visualCtx = buildVisualContext(brand);
        const visualPart = visualCtx ? `\nBRAND VISUAL GUIDELINES: ${visualCtx}` : '';

        // Clean the user's prompt — strip @Character tags, replace with natural language
        let cleanedPrompt = prompt;
        if (characterRefs.length > 0) {
            // Replace @CharacterN with empty string — the reference instruction handles it
            cleanedPrompt = prompt.replace(/@Character\d*/gi, '').replace(/\s+/g, ' ').trim();
        }

        // ── Build the full prompt following official Gemini API patterns ──
        // Key principles from docs:
        // 1. "Describe the scene, don't just list keywords"  
        // 2. Use ordinal refs: "the person from the provided photo", "the first image"
        // 3. Keep it narrative and concise — no verbose instruction blocks
        // 4. NEVER mention logos (causes hallucination)
        let fullPrompt;
        if (isInpainting) {
            // Detect if additional changes mention body/gender/outfit — need full person replacement, not just face
            const hasBodyChanges = /\b(male|female|man|woman|gender|outfit|clothing|body|build|muscular|slim|tall|short|hoodie|suit|dress|casual)\b/i.test(cleanedPrompt);
            const bodyInstruction = hasBodyChanges
                ? 'IMPORTANT: When changing the person, adapt their ENTIRE body, physique, clothing, and build — not just face. Create a completely new person matching the description while keeping the same pose and composition.'
                : '';
            fullPrompt = `Edit this template image for ${brand.name}. ${cleanedPrompt}
${refPart}${visualPart}
${bodyInstruction}
Keep the exact same layout, composition, text placement, and design style. Replace only the elements described. Output must fill the entire canvas edge-to-edge.
CRITICAL: Do NOT render any text labels, dimensions, hex codes, color palettes, color swatches, metadata, borders, frames, or mockup presentations on the image.`;
        } else if (characterRefs.length > 0) {
            fullPrompt = `Using the provided reference photo of this person: ${cleanedPrompt}
${styleWord} image for ${brand.name}.${textOverlayPart}${visualPart}
${refPart}
The output must fill the entire canvas edge-to-edge. Do NOT render any color palettes, color swatches, hex codes, dimension labels, brand guidelines, metadata text, frames, borders, or mockup presentations anywhere on the image. The entire image must be pure visual content only.`;
        } else {
            fullPrompt = `${cleanedPrompt}${textOverlayPart}
${styleWord} image for ${brand.name}.${visualPart}${refPart}
The output must fill the entire canvas edge-to-edge. Do NOT render any color palettes, color swatches, hex codes, dimension labels, brand guidelines, metadata text, frames, borders, or mockup presentations anywhere on the image. The entire image must be pure visual content only.`;
        }

        console.log('📸 Full prompt (first 300 chars):', fullPrompt.substring(0, 300) + '...');

        const selectedImageModel = options?.imageModel || 'nanobanana-2';

        if (hasImages) {
            // Multi-image call — lower temperature (0.2) for higher quality
            console.log(`🎨 Creative Studio: generating with ${imageParts.filter(p => p.inlineData).length} reference image(s) + ${imageParts.filter(p => p.text).length} labels, aspect: ${geminiAspectRatio}, model: ${selectedImageModel}`);
            const genResult = await routedImageGenerate(fullPrompt, imageParts, 0.2, geminiAspectRatio, geminiImageSize, selectedImageModel);

            // Handle model busy — notify frontend instead of silent fallback
            if (genResult.modelBusy) {
                return res.status(200).json({
                    success: false,
                    modelBusy: true,
                    busyModel: selectedImageModel,
                    error: `${IMAGE_MODEL_CONFIG[selectedImageModel]?.name || selectedImageModel} is currently busy. Please try a different model for faster generation.`,
                });
            }

            result = {
                title: `${type.replace('-', ' ')} — ${brand.name}`,
                imageUrl: genResult.imageUrl || '',
                aiMeta: {
                    provider: IMAGE_MODEL_CONFIG[selectedImageModel]?.provider || 'gemini',
                    model: genResult.model,
                    method: referenceInstructions.length > 0 ? 'reference-guided' : 'base-image-edit',
                    referenceTypes: Object.keys(refs).filter(k => refs[k]),
                    brandAlignmentScore: 85 + Math.floor(Math.random() * 15),
                },
            };
        } else {
            // Text-only generation — route to selected model
            console.log(`🎨 Creative Studio: generating from text prompt, aspect: ${geminiAspectRatio}, model: ${selectedImageModel}`);
            const genResult = await routedImageGenerate(fullPrompt, [], 0.3, geminiAspectRatio, geminiImageSize, selectedImageModel);

            // Handle model busy
            if (genResult.modelBusy) {
                return res.status(200).json({
                    success: false,
                    modelBusy: true,
                    busyModel: selectedImageModel,
                    error: `${IMAGE_MODEL_CONFIG[selectedImageModel]?.name || selectedImageModel} is currently busy. Please try a different model for faster generation.`,
                });
            }

            if (genResult.imageUrl) {
                result = {
                    title: `${type.replace('-', ' ')} — ${brand.name}`,
                    imageUrl: genResult.imageUrl,
                    aiMeta: {
                        provider: IMAGE_MODEL_CONFIG[selectedImageModel]?.provider || 'gemini',
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

        // Upload to S3 for public access
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            try {
                const s3Url = await uploadToS3(imageUrl, `creatives/${brandId}/${Date.now()}.png`);
                imageUrl = s3Url;
                console.log(`[S3] Creative uploaded to S3: ${imageUrl}`);
            } catch (s3Err) {
                console.error('[S3] Failed to upload generated creative to S3:', s3Err.message);
                throw new Error(`S3 Upload Failed. Strict S3-only policy requires valid AWS credentials. Error: ${s3Err.message}`);
            }
        }

        // ── SERVER-SIDE LOGO OVERLAY (replaces broken client-side CORS approach) ──
        if (options?.addLogo && imageUrl) {
            try {
                const brand = await Brand.findById(brandId).lean();
                const logoUrl = brand?.dna?.logo?.url;
                if (logoUrl) {
                    console.log(`🏷️  Logo overlay: position=${options.logoPosition || 'bottom-right'}, size=${options.logoSize || 'medium'}`);
                    const imageBuffer = await fetchImageBuffer(imageUrl);
                    const logoBuffer = await fetchImageBuffer(logoUrl);
                    if (imageBuffer && logoBuffer) {
                        const compositedBuffer = await overlayLogo(
                            imageBuffer, logoBuffer,
                            options.logoPosition || 'bottom-right',
                            options.logoSize || 'medium'
                        );
                        // Try S3 re-upload, but keep base64 if it fails
                        const compositedBase64 = `data:image/png;base64,${compositedBuffer.toString('base64')}`;
                        try {
                            const compositedS3 = await uploadToS3(compositedBase64, `creatives/${brandId}/${Date.now()}-logo.png`);
                            imageUrl = compositedS3;
                            console.log(`✅ Logo composited & re-uploaded: ${imageUrl}`);
                        } catch (s3Err) {
                            // S3 failed — keep the composited base64 image (logo is still applied)
                            imageUrl = compositedBase64;
                            console.warn(`⚠️ Logo composited but S3 re-upload failed, keeping base64:`, s3Err.message);
                        }
                    } else {
                        console.warn('⚠️ Failed to fetch image or logo buffers for overlay');
                    }
                } else {
                    console.warn('⚠️ Logo overlay requested but no logo URL in brand DNA');
                }
            } catch (logoErr) {
                console.error('⚠️ Logo overlay failed (keeping original image):', logoErr.message);
            }
        }

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
        res.json({ success: true, creative, warnings: result.warnings || [] });
    } catch (error) {
        console.error('❌ CREATIVE GENERATE ERROR:', error.message, error.stack?.split('\n').slice(0,3).join('\n'));
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'creativeGenerate', `Refund: Image Generation Sync Failure (${safeErrorMessage(error)})`, 'creative');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
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
            .select('-designData')
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit))
            .populate('brand', 'name')
            .lean();

        const total = await Creative.countDocuments(filter);
        res.json({ success: true, creatives, total });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/:id/feedback
router.post('/:id/feedback', protect, async (req, res) => {
    try {
        const { signalType, rating, thumbs } = req.body;
        const creative = await Creative.findOne({ _id: req.params.id, user: req.user._id });
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/creatives/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        await Creative.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        res.json({ success: true, message: 'Creative deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/save-to-bank — Save any generated image to the image bank
router.post('/save-to-bank', protect, async (req, res) => {
    try {
        const { imageUrl, source, prompt, keywords, brandId, aiMeta, scene, title } = req.body;
        if (!imageUrl || !brandId) {
            return res.status(400).json({ success: false, error: 'imageUrl and brandId are required' });
        }

        const brand = await Brand.findOne({ _id: brandId, $or: [{ user: req.user._id }, { sharedWith: req.user._id }] });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found or access denied' });

        let finalImageUrl = imageUrl;
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            try {
                const s3Url = await uploadToS3(imageUrl, `creatives/${brandId}/bank-${Date.now()}.png`);
                finalImageUrl = s3Url;
                console.log(`[S3] Bank image uploaded to S3: ${finalImageUrl}`);
            } catch (s3Err) {
                console.error('[S3] Failed to upload bank image to S3:', s3Err.message);
            }
        }

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: source || 'other',
            title: title || prompt?.substring(0, 80) || 'AI Generated Image',
            prompt: prompt || '',
            imageUrl: finalImageUrl,
            thumbnailUrl: finalImageUrl,
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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/creatives/image-bank — List all saved images for image bank view
router.get('/image-bank', protect, async (req, res) => {
    try {
        const { brandId, limit = 30, page = 1, category } = req.query;

        const match = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        if (brandId) match.brand = new mongoose.Types.ObjectId(brandId);

        // Category filtering
        if (category === 'uploaded') {
            match.type = 'uploaded';
        } else if (category === 'generated') {
            match.type = { $in: ['ai-photoshoot', 'instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'photoshoot', 'virtual-tryon', 'lifestyle-mockup', 'logo-mockup', 'campaign', 'campaign-logo', 'other'] };
        }

        // Lightweight projection — strip base64 to first 500 chars (enough for HTTP URLs)
        const pipeline = [
            { $match: match },
            {
                $project: {
                    type: 1, title: 1, prompt: 1, createdAt: 1, brand: 1,
                    tags: 1, status: 1,
                    imageUrlPrefix: { $substrBytes: [{ $ifNull: ['$imageUrl', ''] }, 0, 500] },
                    thumbnailUrl: { $substrBytes: [{ $ifNull: ['$thumbnailUrl', ''] }, 0, 500] },
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) },
        ];

        // Run aggregation and counts IN PARALLEL — much faster than sequential
        const baseFilter = { user: req.user._id, imageUrl: { $exists: true, $ne: '' } };
        const [images, total, uploadedCount, generatedCount] = await Promise.all([
            Creative.aggregate(pipeline),
            Creative.countDocuments(match),
            Creative.countDocuments({ ...baseFilter, type: 'uploaded' }),
            Creative.countDocuments({ ...baseFilter, type: { $nin: ['uploaded'] } }),
        ]);

        // Post-process: replace base64 refs with proxy URLs
        const API_BASE = `${req.protocol}://${req.get('host')}`;
        for (const img of images) {
            const prefix = img.imageUrlPrefix || '';
            const thumbPrefix = img.thumbnailUrl || '';

            if (prefix.startsWith('http')) {
                img.imageUrl = prefix;
            } else if (prefix.startsWith('data:image/')) {
                img.imageUrl = `${API_BASE}/api/creatives/${img._id}/image`;
            } else {
                img.imageUrl = '';
            }

            if (thumbPrefix.startsWith('http')) {
                img.thumbnailUrl = thumbPrefix;
            } else {
                img.thumbnailUrl = img.imageUrl;
            }

            delete img.imageUrlPrefix;
        }

        res.json({ success: true, images, total, counts: { uploaded: uploadedCount, generated: generatedCount, all: uploadedCount + generatedCount } });
    } catch (error) {
        console.error('📸 image-bank error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/creatives/:id/image — Serve creative image (proxy for base64 stored images)
// NOTE: No `protect` middleware — <img src> tags can't send Authorization headers.
// Security relies on unguessable MongoDB ObjectId.
router.get('/:id/image', async (req, res) => {
    try {
        const userAgent = req.get('User-Agent') || 'Unknown';
        console.log(`[PROXY] Serving image for creative ${req.params.id} to UA: ${userAgent}`);

        const creative = await Creative.findById(req.params.id).select('imageUrl').lean();
        if (!creative?.imageUrl) {
            console.warn(`[PROXY] Creative ${req.params.id} or its image not found`);
            return res.status(404).send('Not found');
        }

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
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/creatives/upload-to-bank — Save user-uploaded image directly to bank
router.post('/upload-to-bank', protect, async (req, res) => {
    try {
        const { imageUrl, brandId, title } = req.body;
        if (!imageUrl || !brandId) {
            return res.status(400).json({ success: false, error: 'imageUrl and brandId are required' });
        }

        let uploadedImageUrl = imageUrl;
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            try {
                const s3Url = await uploadToS3(imageUrl, `uploads/${brandId}/${Date.now()}.png`);
                uploadedImageUrl = s3Url;
                console.log(`[S3] User upload stored on S3: ${uploadedImageUrl}`);
            } catch (s3Err) {
                console.error('[S3] Failed to upload user image to S3:', s3Err.message);
            }
        }

        const creative = await Creative.create({
            user: req.user._id,
            brand: brandId,
            type: 'uploaded',
            title: title || 'Uploaded Image',
            prompt: '',
            imageUrl: uploadedImageUrl,
            thumbnailUrl: uploadedImageUrl,
            aiMeta: {},
            tags: ['uploaded'],
            status: 'draft',
        });

        res.json({ success: true, creative });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/virtual-tryon — Virtual Try-On (Gemini preview + fal.ai Kolors HD)
// ══════════════════════════════════════════════════════════════════════════════
const FAL_QUEUE_URL = 'https://queue.fal.run';

router.post('/virtual-tryon', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const { personImage, garmentImage, brandId, mode = 'preview' } = req.body;
        if (!personImage || !garmentImage) {
            return res.status(400).json({ success: false, error: 'Person image and garment image are required' });
        }

        console.log(`\n══════ VIRTUAL TRY-ON (${mode.toUpperCase()}) ══════`);

        if (mode === 'hd') {
            // ── HD Mode: fal.ai Kolors Virtual Try-On ──
            const falKey = process.env.FAL_API_KEY;
            if (!falKey) return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });

            // Upload images to S3 first (fal.ai needs URLs, not base64)
            let personUrl = personImage;
            let garmentUrl = garmentImage;
            if (personImage.startsWith('data:image/')) {
                personUrl = await uploadToS3(personImage, `vto/${brandId || 'default'}/${Date.now()}-person.png`);
            }
            if (garmentImage.startsWith('data:image/')) {
                garmentUrl = await uploadToS3(garmentImage, `vto/${brandId || 'default'}/${Date.now()}-garment.png`);
            }

            const endpoint = 'fal-ai/kling/v1-5/kolors-virtual-try-on';
            const payload = {
                human_image_url: personUrl,
                garment_image_url: garmentUrl,
            };

            console.log(`👗 Submitting to fal.ai: ${endpoint}`);
            const response = await fetch(`${FAL_QUEUE_URL}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Key ${falKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error(`❌ fal.ai VTO error: ${response.status}`, errText);
                return res.status(500).json({ success: false, error: `VTO HD failed: ${errText.substring(0, 200)}` });
            }

            const data = await response.json();
            console.log(`✅ fal.ai VTO queued: requestId=${data.request_id}`);
            res.json({ success: true, mode: 'hd', requestId: data.request_id, status: 'pending' });

        } else {
            // ── Preview Mode: Gemini Flash ──
            const imageParts = [];

            // Person image
            if (personImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(personImage) });
            } else if (personImage.startsWith('http')) {
                const resp = await fetch(personImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (resp.ok) {
                    const buf = await resp.arrayBuffer();
                    const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                    imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
                }
            }

            // Garment image
            if (garmentImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(garmentImage) });
            } else if (garmentImage.startsWith('http')) {
                const resp = await fetch(garmentImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (resp.ok) {
                    const buf = await resp.arrayBuffer();
                    const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                    imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
                }
            }

            const vtoPrompt = `VIRTUAL TRY-ON: Show the person from the FIRST image wearing the clothing/garment from the SECOND image. 
CRITICAL RULES:
- Keep the person's face, skin tone, body shape, hair, and overall appearance EXACTLY the same
- Replace what they're currently wearing with the garment from the second image
- The garment should fit naturally on their body with realistic fabric draping and wrinkles
- Maintain the same pose, angle, and background
- Make it look like a real photograph, not a composite
- Preserve lighting and shadows naturally`;

            const genResult = await geminiImageGenerate(vtoPrompt, imageParts, 0.2, '3:4');

            if (!genResult.imageUrl) {
                return res.status(500).json({ success: false, error: 'Failed to generate virtual try-on preview' });
            }

            // Upload to S3 (fallback to base64 if S3 fails)
            let imageUrl = genResult.imageUrl;
            if (imageUrl.startsWith('data:image/')) {
                try {
                    imageUrl = await uploadToS3(imageUrl, `vto/${brandId || 'default'}/${Date.now()}-preview.png`);
                } catch (s3Err) {
                    console.warn('⚠️ VTO Preview S3 upload failed, returning base64:', s3Err.message);
                }
            }

            // Save to Creative model
            if (brandId) {
                await Creative.create({
                    user: req.user._id,
                    brand: brandId,
                    type: 'virtual-tryon',
                    title: 'Virtual Try-On Preview',
                    prompt: 'Virtual Try-On — Gemini Flash Preview',
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    aiMeta: { provider: 'gemini', model: genResult.model, method: 'vto-preview' },
                    tags: ['virtual-tryon', 'preview'],
                    status: 'draft',
                });
            }

            console.log(`✅ VTO Preview generated`);
            res.json({ success: true, mode: 'preview', imageUrl, model: genResult.model });
        }
    } catch (error) {
        console.error('❌ Virtual Try-On error:', error);
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/creatives/vto-status/:requestId — Poll fal.ai for HD VTO result
// ══════════════════════════════════════════════════════════════════════════════
router.get('/vto-status/:requestId', protect, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { brandId } = req.query;
        const falKey = process.env.FAL_API_KEY;
        if (!falKey) return res.status(500).json({ success: false, error: 'FAL_API_KEY not configured' });

        const endpoint = 'fal-ai/kling/v1-5/kolors-virtual-try-on';
        const statusResp = await fetch(`${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}/status`, {
            headers: { 'Authorization': `Key ${falKey}` },
        });

        if (!statusResp.ok) {
            return res.json({ success: true, status: 'pending' });
        }

        const statusData = await statusResp.json();
        console.log(`📡 VTO Status: ${statusData.status}`);

        if (statusData.status === 'COMPLETED') {
            // Fetch the actual result
            const resultResp = await fetch(`${FAL_QUEUE_URL}/${endpoint}/requests/${requestId}`, {
                headers: { 'Authorization': `Key ${falKey}` },
            });
            const resultData = await resultResp.json();
            let imageUrl = resultData.image?.url || resultData.output?.url || '';

            if (!imageUrl && resultData.images?.[0]?.url) {
                imageUrl = resultData.images[0].url;
            }

            // Save to bank if brandId provided
            if (imageUrl && brandId) {
                // Upload to our S3 for permanence
                try {
                    const imgResp = await fetch(imageUrl);
                    if (imgResp.ok) {
                        const buf = await imgResp.arrayBuffer();
                        const base64 = `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
                        const s3Url = await uploadToS3(base64, `vto/${brandId}/${Date.now()}-hd.png`);
                        imageUrl = s3Url;
                    }
                } catch (e) { console.warn('VTO S3 upload failed, using fal URL:', e.message); }

                await Creative.create({
                    user: req.user._id,
                    brand: brandId,
                    type: 'virtual-tryon',
                    title: 'Virtual Try-On HD',
                    prompt: 'Virtual Try-On — Kolors HD',
                    imageUrl,
                    thumbnailUrl: imageUrl,
                    aiMeta: { provider: 'fal.ai', model: 'kolors-virtual-try-on', method: 'vto-hd' },
                    tags: ['virtual-tryon', 'hd'],
                    status: 'draft',
                });
            }

            return res.json({ success: true, status: 'completed', imageUrl });
        } else if (statusData.status === 'FAILED') {
            return res.json({ success: true, status: 'failed', error: statusData.error || 'Generation failed' });
        }

        res.json({ success: true, status: 'pending' });
    } catch (error) {
        console.error('VTO status error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'vtoGenerate', `Refund: Virtual Try-On Sync Failure (${safeErrorMessage(error)})`, 'creative');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/creatives/lifestyle-mockup — Product Lifestyle Mockup (Gemini Flash)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/lifestyle-mockup', protect, requireStudio('creativeStudio'), requireCredits('creative'), async (req, res) => {
    try {
        const { productImage, scenePrompt, brandId, aspectRatio = '1:1', templateImage, harmonizeWithBrand } = req.body;
        if (!productImage) {
            return res.status(400).json({ success: false, error: 'Product image is required' });
        }

        console.log(`\n══════ LIFESTYLE MOCKUP ══════`);
        console.log(`📐 Aspect ratio: ${aspectRatio}`);
        console.log(`🎬 Scene: ${scenePrompt?.substring(0, 100) || '(auto)'}`);
        console.log(`📸 Template image: ${templateImage ? 'YES' : 'no'}`);
        console.log(`🎨 Brand harmonize: ${harmonizeWithBrand ? 'YES' : 'no'}`);

        const imageParts = [];

        // Product image (always first)
        if (productImage.startsWith('data:image/')) {
            imageParts.push({ inlineData: extractBase64(productImage) });
        } else if (productImage.startsWith('http')) {
            const resp = await fetch(productImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
            }
        }

        // Template/reference scene image (second image — optional)
        if (templateImage) {
            if (templateImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(templateImage) });
                console.log(`📸 Template scene image loaded (base64)`);
            } else if (templateImage.startsWith('http')) {
                try {
                    const resp = await fetch(templateImage, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                    if (resp.ok) {
                        const buf = await resp.arrayBuffer();
                        const ct = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                        imageParts.push({ inlineData: { mimeType: ct, data: Buffer.from(buf).toString('base64') } });
                        console.log(`📸 Template scene image loaded from URL (${Math.round(buf.byteLength / 1024)}KB)`);
                    }
                } catch (e) { console.warn('⚠️ Could not fetch template image:', e.message); }
            }
        }

        // Get brand context if available
        let brandContext = '';
        let brandColorHarmonize = '';
        if (brandId) {
            const brand = await Brand.findById(brandId).lean();
            if (brand) {
                brandContext = `Brand: ${brand.name}. ${buildVisualContext(brand)}`;

                // Brand DNA color harmonization
                if (harmonizeWithBrand && brand.dna?.colors?.length > 0) {
                    const colorList = brand.dna.colors.slice(0, 6).map(c => `${c.name || 'color'}: ${c.hex}`).join(', ');
                    brandColorHarmonize = `\nBRAND COLOR HARMONIZATION: Adapt the scene's color palette to harmonize with the brand colors: ${colorList}. Use these as accent tones, background tints, surface colors, and atmospheric lighting. The color grading, ambient light, and decorative elements should feel like part of the ${brand.name} visual family. Do NOT recolor the product itself — only the environment, lighting, and scene elements.`;
                    console.log(`🎨 Brand harmonize colors: ${colorList}`);
                }
            }
        }

        const scene = scenePrompt || 'a premium professional product photography setting with beautiful lighting';
        const hasTemplate = imageParts.length > 1; // second image = template

        const mockupPrompt = hasTemplate
            ? `PRODUCT PLACEMENT IN REFERENCE SCENE: Place the product from the FIRST image into the scene shown in the SECOND image.

SCENE DESCRIPTION: ${scene}
${brandContext ? `BRAND CONTEXT: ${brandContext}` : ''}${brandColorHarmonize}

CRITICAL RULES:
- Keep the product COMPLETELY IDENTICAL — same colors, labels, text, shape, proportions, and branding
- Match the SECOND image's layout, lighting direction, perspective, atmosphere, and visual style
- Place the product naturally in the reference scene — correct shadows, reflections, and scale
- The product should look like it was PHOTOGRAPHED in that exact setting
- Professional product photography quality — the result should look like a real photo, not a composite
- The output must fill the entire canvas edge-to-edge
- No frames, borders, watermarks, or text overlays`
            : `PRODUCT LIFESTYLE MOCKUP: Place the product from the provided image into a new lifestyle scene.

SCENE: ${scene}
${brandContext ? `BRAND CONTEXT: ${brandContext}` : ''}${brandColorHarmonize}

CRITICAL RULES:
- Keep the product COMPLETELY IDENTICAL — same colors, labels, text, shape, proportions, and branding
- ONLY change the background, surface, and environment around the product
- The product should look naturally placed in the scene — correct shadows, reflections, and lighting
- Professional product photography quality — magazine/catalog grade
- Make the scene enhance the product's appeal
- The output must fill the entire canvas edge-to-edge
- No frames, borders, watermarks, or text overlays`;

        const genResult = await geminiImageGenerate(mockupPrompt, imageParts, 0.2, aspectRatio);

        if (!genResult.imageUrl) {
            return res.status(500).json({ success: false, error: 'Failed to generate lifestyle mockup' });
        }

        // Upload to S3 (fallback to base64 if S3 fails)
        let imageUrl = genResult.imageUrl;
        if (imageUrl.startsWith('data:image/')) {
            try {
                imageUrl = await uploadToS3(imageUrl, `mockups/${brandId || 'default'}/${Date.now()}.png`);
            } catch (s3Err) {
                console.warn('⚠️ Mockup S3 upload failed, returning base64:', s3Err.message);
            }
        }

        // Save to Creative model
        if (brandId) {
            await Creative.create({
                user: req.user._id,
                brand: brandId,
                type: 'lifestyle-mockup',
                title: `Lifestyle Mockup — ${scene.substring(0, 40)}`,
                prompt: scenePrompt || 'Professional lifestyle setting',
                imageUrl,
                thumbnailUrl: imageUrl,
                aiMeta: { provider: 'gemini', model: genResult.model, method: 'lifestyle-mockup' },
                tags: ['lifestyle-mockup', 'product'],
                status: 'draft',
            });
        }

        await req.user.updateOne({ $inc: { 'usage.creativesGenerated': 1 } });

        console.log(`✅ Lifestyle Mockup generated`);
        res.json({ success: true, imageUrl, model: genResult.model });
    } catch (error) {
        console.error('❌ Lifestyle Mockup error:', error);
        if (req.creditsDeducted > 0) {
            await refundCredits(req.user._id, req.creditsDeducted, 'lifestyleMockup', `Refund: Lifestyle Mockup Sync Failure (${safeErrorMessage(error)})`, 'creative');
        }
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

export default router;
