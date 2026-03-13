import mongoose from 'mongoose';
import { Router } from 'express';
import Creative from '../models/Creative.js';
import Feedback from '../models/Feedback.js';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';
import { requireStudio } from '../middleware/studioAccess.js';
import { requireCredits } from '../middleware/credits.js';
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

// Convert brand colors to a direct, enforceable color directive for the AI
// Weak hints like "green tones" are ignored by Gemini — use hex codes + mandatory language
function getColorPhrase(brand) {
    const colors = brand.dna?.colors || [];
    if (!colors.length) return '';
    // Include hex codes so the AI has exact targets, plus descriptive names
    const colorDescs = colors.slice(0, 4).map(c => {
        const name = c.name || 'brand color';
        return `${name} (${c.hex})`;
    });
    return `MANDATORY COLOR PALETTE — use these exact brand colors throughout the design: ${colorDescs.join(', ')}. The primary color ${colors[0]?.hex || ''} must be the dominant color`;
}

// ── Helper: extract base64 from data URI ────────────────────────────────
function extractBase64(dataUri) {
    const commaIdx = dataUri.indexOf(',');
    const header = dataUri.substring(0, commaIdx);
    const mimeType = header.split(':')[1].split(';')[0];
    const data = dataUri.substring(commaIdx + 1);
    return { mimeType, data };
}

// ── Gemini image generation via @google/genai SDK ───────────────────────
async function geminiImageGenerate(promptText, imageParts = [], temperature = 0.4, aspectRatio = '1:1', imageSize = '1K') {
    const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('Gemini API key not configured');

    const ai = new GoogleGenAI({ apiKey: imageKey });

    // Model fallback chain — Nano Banana 2 first
    const models = [
        'gemini-3.1-flash-image-preview',        // Nano Banana 2 — best, latest
        'gemini-3-pro-image-preview',             // Pro fallback
        'gemini-2.5-flash-image',                 // Stable fallback
        'gemini-2.0-flash-exp-image-generation',  // Legacy fallback
    ];

    // Build content parts — OFFICIAL GEMINI FORMAT:
    // Text prompt FIRST, then reference images as direct inlineData parts.
    // Do NOT interleave text labels between images — that confuses the model.
    // Ref: https://ai.google.dev/gemini-api/docs/image-generation#use-up-to-14-reference-images
    const contents = [
        { text: promptText },
        ...imageParts.filter(p => p.inlineData),  // Only include actual image parts, strip text labels
    ];

    let imageUrl = null;
    let usedModel = '';
    let textResponse = '';

    const imageCount = contents.filter(p => p.inlineData).length;
    console.log(`\n══════ CREATIVE STUDIO IMAGE GENERATION (SDK) ══════`);
    console.log(`🎨 Models to try: ${models.length}`);
    console.log(`🖼️  Reference images: ${imageCount}`);
    // Diagnostic: log each content part's type and size
    contents.forEach((part, i) => {
        if (part.text) {
            console.log(`  📄 Part ${i}: TEXT (${part.text.length} chars)`);
        } else if (part.inlineData) {
            const dataLen = part.inlineData.data?.length || 0;
            console.log(`  🖼️  Part ${i}: IMAGE mime=${part.inlineData.mimeType}, base64Size=${Math.round(dataLen / 1024)}KB`);
        }
    });
    console.log(`📐 Aspect ratio: ${aspectRatio} | Resolution: ${imageSize}`);
    console.log(`📝 Prompt (first 200 chars): ${promptText.substring(0, 200)}...`);

    for (const modelId of models) {
        try {
            console.log(`\n🔄 Trying model: ${modelId}...`);

            const response = await ai.models.generateContent({
                model: modelId,
                contents,
                config: {
                    responseModalities: ['TEXT', 'IMAGE'],
                    temperature,
                    imageConfig: {
                        aspectRatio,
                        ...(imageSize ? { imageSize } : {}),
                    },
                },
            });

            const resParts = response.candidates?.[0]?.content?.parts || [];
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
                        let ct = (imgResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                        let imgData = Buffer.from(buf);

                        // Convert webp/gif to JPEG — Gemini docs only show jpeg/png examples
                        // webp may silently fail as a reference image
                        if (ct === 'image/webp' || ct === 'image/gif') {
                            try {
                                const sharp = (await import('sharp')).default;
                                imgData = await sharp(imgData).jpeg({ quality: 90 }).toBuffer();
                                ct = 'image/jpeg';
                                console.log(`🔄 Ref image (${label}): converted from webp/gif to JPEG (${Math.round(imgData.length / 1024)}KB)`);
                            } catch (convErr) {
                                console.warn(`⚠️ Ref image (${label}): webp→jpeg conversion failed, using original:`, convErr.message);
                            }
                        }

                        console.log(`✅ Ref image (${label}) fetched: ${Math.round(imgData.length / 1024)}KB, ${ct}`);
                        return { part: { mimeType: ct, data: imgData.toString('base64') }, label };
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
        // Add reference images as pure inlineData (NO text labels — Gemini API
        // treats extra text parts as separate prompts, not labels)
        if (styleRef) {
            imageParts.push({ inlineData: { mimeType: styleRef.part.mimeType, data: styleRef.part.data } });
            referenceInstructions.push('Match the visual style, colors, and mood of the provided style reference image.');
        }

        // Character references — NATURAL LANGUAGE referencing per official Gemini API docs
        // Gemini uses deictic references: "this person", "the person in the provided photo"
        // NOT @tags or Character1 markers (those are ignored by the model)
        for (let i = 0; i < characterRefs.length; i++) {
            const charRef = characterRefs[i];
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
        // When templateInpainting is true, the reference image is THE BASE to edit.
        // Gemini will keep layout/colors/logo/text placement and only swap the product.
        let isInpainting = false;
        if (options?.templateInpainting && options?.templateRefImageUrl) {
            isInpainting = true;
            console.log('🎨 TEMPLATE INPAINTING MODE — keeping layout, swapping product');

            // Resolve the template reference image (always first — it's the base)
            const templateRef = await resolveRefImage(options.templateRefImageUrl, 'template-base');
            if (templateRef) {
                imageParts.push({ inlineData: { mimeType: templateRef.part.mimeType, data: templateRef.part.data } });
            }

            // If a new product image is provided, add it as the replacement
            if (options?.baseImage && options.baseImage.startsWith('data:image/')) {
                imageParts.push({ inlineData: extractBase64(options.baseImage) });
                referenceInstructions.push('INPAINTING: Replace ONLY the product in the template with the new product image. Keep everything else pixel-perfect: same layout, colors, typography, logo placement, background, and content positions.');
            } else if (options?.productImageUrl) {
                try {
                    console.log(`📦 Fetching product image for inpainting: ${options.productImageUrl.substring(0, 80)}...`);
                    const prodResp = await fetch(options.productImageUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' },
                        redirect: 'follow',
                    });
                    if (prodResp.ok) {
                        const prodBuf = await prodResp.arrayBuffer();
                        const prodCt = (prodResp.headers.get('content-type') || 'image/jpeg').split(';')[0];
                        imageParts.push({ inlineData: { mimeType: prodCt, data: Buffer.from(prodBuf).toString('base64') } });
                        referenceInstructions.push('INPAINTING: Replace ONLY the product in the template with the new product image. Keep everything else pixel-perfect: same layout, colors, typography, logo placement, background, and content positions.');
                        console.log(`✅ Product image for inpainting loaded (${Math.round(prodBuf.byteLength / 1024)}KB)`);
                    }
                } catch (e) { console.warn('⚠️ Could not fetch product for inpainting:', e.message); }
            } else {
                // No product image — just regenerate with same layout but different content
                referenceInstructions.push('INPAINTING: Recreate this exact design with the same layout, colors, typography, logo, and content placement. Replace the placeholder text ({{HEADLINE}}, {{SUBTEXT}}, {{CTA}}) with the content specified in the prompt.');
            }
        }

        // Base image from AI Photoshoot (skip if inpainting mode already handled it)
        if (!isInpainting && options?.baseImage && options.baseImage.startsWith('data:image/')) {
            imageParts.push({ inlineData: extractBase64(options.baseImage) });
            referenceInstructions.push('PRODUCT IMAGE: Keep this product exactly as-is — same colors, labels, text, shape. Only change background and styling.');
        }

        // Product image from catalog (remote URL — fetch and convert to base64)
        if (!isInpainting && options?.productImageUrl && !options?.baseImage) {
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
                    imageParts.push({ inlineData: { mimeType, data: base64 } });
                    referenceInstructions.push('PRODUCT IMAGE: This is the ACTUAL product being promoted. Feature this exact product prominently in the creative — preserve its real appearance, colors, shape, and branding. Place it as the hero element of the design.');
                    console.log(`✅ Product image loaded (${Math.round(imgBuffer.byteLength / 1024)}KB)`);
                }
            } catch (imgErr) {
                console.warn('⚠️ Could not fetch product image:', imgErr.message);
            }
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
        const colorPart = colorPhrase ? ` ${colorPhrase}.` : '';
        const refPart = referenceInstructions.length > 0 ? '\n' + referenceInstructions.join('\n') : '';

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
            fullPrompt = `Edit this template image for ${brand.name}. ${cleanedPrompt}
${refPart}
Keep the exact same layout, composition, and content placement. Replace only what is described above. Output must fill the entire canvas edge-to-edge.`;
        } else if (characterRefs.length > 0) {
            // Character reference mode — use official "this person" pattern
            // Per Gemini docs: "A studio portrait of this man..." / "these people making funny faces"
            fullPrompt = `Using the provided reference photo of this person: ${cleanedPrompt}
${platformSize} ${styleWord} image for ${brand.name}.${colorPart}${textOverlayPart}
${refPart}
The output must fill the entire canvas edge-to-edge. No frames, borders, or mockups.`;
        } else {
            fullPrompt = `${cleanedPrompt}${textOverlayPart}
${platformSize} ${styleWord} image for ${brand.name}.${colorPart}${refPart}
The output must fill the entire canvas edge-to-edge. No frames, borders, or mockups.`;
        }

        console.log('📸 Full prompt (first 300 chars):', fullPrompt.substring(0, 300) + '...');

        if (hasImages) {
            // Multi-image Gemini call — lower temperature (0.2) for higher quality
            console.log(`🎨 Creative Studio: generating with ${imageParts.filter(p => p.inlineData).length} reference image(s) + ${imageParts.filter(p => p.text).length} labels, aspect: ${geminiAspectRatio}`);
            const genResult = await geminiImageGenerate(fullPrompt, imageParts, 0.2, geminiAspectRatio, geminiImageSize);
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
            const genResult = await geminiImageGenerate(fullPrompt, [], 0.3, geminiAspectRatio, geminiImageSize);
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

        // NEW: Upload to S3 for public access (required by Meta/IG)
        if (imageUrl && imageUrl.startsWith('data:image/')) {
            try {
                const s3Url = await uploadToS3(imageUrl, `creatives/${brandId}/${Date.now()}.png`);
                imageUrl = s3Url;
                console.log(`[S3] Creative uploaded to S3: ${imageUrl}`);
            } catch (s3Err) {
                console.error('[S3] Failed to upload generated creative to S3:', s3Err.message);
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
                        // Re-upload composited image to S3
                        const compositedBase64 = `data:image/png;base64,${compositedBuffer.toString('base64')}`;
                        const compositedS3 = await uploadToS3(compositedBase64, `creatives/${brandId}/${Date.now()}-logo.png`);
                        imageUrl = compositedS3;
                        console.log(`✅ Logo composited & re-uploaded: ${imageUrl}`);
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
        res.json({ success: true, creative });
    } catch (error) {
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
        const { imageUrl, source, prompt, keywords, brandId, aiMeta, scene } = req.body;
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
            title: prompt?.substring(0, 80) || 'AI Generated Image',
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
            match.type = { $in: ['ai-photoshoot', 'instagram-post', 'instagram-story', 'facebook-ad', 'linkedin-post', 'youtube-thumb', 'banner', 'twitter-post', 'pinterest', 'photoshoot', 'other'] };
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

export default router;
