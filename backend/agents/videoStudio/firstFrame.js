/**
 * First Frame Generator — Generates a reference image for video consistency
 * 
 * Uses Gemini's NanoBanana 2 (gemini-3.1-flash-image-preview) to create
 * product-consistent images based on shot descriptions + user reference images.
 * 
 * KEY DESIGN DECISIONS:
 * 1. Reference images are RESIZED to 512px max via sharp before base64 encoding
 *    to keep the REST payload under 200KB (prevents timeout on large payloads)
 * 2. Timeout is 45s — Gemini image gen typically takes 15-30s
 * 3. Single attempt — if Gemini fails, fall back to Flux Pro immediately
 * 4. Flux Pro fallback passes reference as image_prompt for basic style guidance
 */

const GEMINI_MODELS = ['gemini-3.1-flash-image-preview'];
import { ensureS3Url } from '../../utils/s3.js';
import { falGenerateImage } from '../youtubeStudio/nodes.js';
import sharp from 'sharp';

// ── Connection pooling removed due to Node.js 22 Undici fetch hanging issues ──

/**
 * Fetch a remote image URL, RESIZE it to max 512px, and return as { mimeType, data } (base64)
 * This is critical — raw product photos can be 2-5MB which bloats the Gemini REST payload.
 * Resizing to 512px + JPEG 70% quality keeps each image under 50-80KB.
 * Returns null on failure (non-blocking)
 */
async function fetchAndResizeImage(imageUrl, maxDimension = 512) {
    try {
        if (imageUrl.startsWith('data:')) {
            // Already a data URI — parse and resize
            const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
            if (!match) return null;
            const inputBuffer = Buffer.from(match[2], 'base64');
            const resized = await sharp(inputBuffer)
                .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 70 })
                .toBuffer();
            console.log(`🖼️ Resized data-URI ref: ${inputBuffer.length} → ${resized.length} bytes`);
            return { mimeType: 'image/jpeg', data: resized.toString('base64') };
        }

        const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(12000) });
        if (!resp.ok) {
            console.warn(`⚠️ Ref image fetch failed: HTTP ${resp.status} for ${imageUrl.substring(0, 80)}`);
            return null;
        }
        const rawBuffer = Buffer.from(await resp.arrayBuffer());
        
        // Resize with sharp — keeps payload small
        const resized = await sharp(rawBuffer)
            .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();
        
        console.log(`🖼️ Resized ref image: ${rawBuffer.length} → ${resized.length} bytes (${imageUrl.substring(0, 60)}...)`);
        return { mimeType: 'image/jpeg', data: resized.toString('base64') };
    } catch (e) {
        console.warn(`⚠️ Failed to fetch/resize reference image: ${e.message}`);
        return null;
    }
}

/**
 * Generate an image using Gemini's native NanoBanana 2 image generation
 * 
 * @param {string} prompt - The text prompt for image generation
 * @param {Array} imageParts - Pre-encoded image parts [{mimeType, data}]
 * @param {number} temperature - Generation temperature (0-1)
 * @param {object} options - Additional options
 * @param {string} options.aspectRatio - Target aspect ratio ('16:9', '9:16', '1:1', '4:3')
 * @param {Array<string>} options.referenceImageUrls - URLs of user-uploaded reference images to inject
 * 
 * Returns { imageUrl } with either an HTTP URL (via S3) or base64 data URI
 */
export async function geminiImageGenerate(prompt, imageParts = [], temperature = 0.5, options = {}) {
    const imageKey = process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('GEMINI_API_KEY not configured in .env');

    const { aspectRatio, referenceImageUrls = [] } = options;

    console.log(`🖼️ Gemini image gen: starting (refs=${referenceImageUrls.length}, ratio=${aspectRatio || 'default'})`);

    // ── Fetch + RESIZE reference images to keep payload small ──
    const fetchedRefParts = [];
    if (referenceImageUrls.length > 0) {
        console.log(`🖼️ Fetching & resizing ${referenceImageUrls.length} reference images...`);
        // Process sequentially to avoid overwhelming network
        for (const url of referenceImageUrls.slice(0, 2)) {
            const resized = await fetchAndResizeImage(url);
            if (resized) {
                fetchedRefParts.push({ inlineData: { mimeType: resized.mimeType, data: resized.data } });
            }
        }
        console.log(`🖼️ Ready: ${fetchedRefParts.length}/${referenceImageUrls.length} reference images (resized to 512px)`);
    }

    // Build parts: reference images first (so the model "sees" them before the prompt)
    const parts = [
        ...fetchedRefParts,
        ...imageParts.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: prompt },
    ];

    // Log approximate payload size
    const payloadSizeKB = Math.round(JSON.stringify(parts).length / 1024);
    console.log(`🖼️ Payload size: ~${payloadSizeKB}KB (${fetchedRefParts.length} refs + prompt)`);

    let imageBase64 = null;
    let mimeType = 'image/png';

    for (const modelId of GEMINI_MODELS) {
        try {
            console.log(`🖼️ Trying Gemini model: ${modelId} (90s timeout)`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);

            // Build generation config — include imageConfig so aspect ratio is actually applied
            const generationConfig = {
                responseModalities: ['TEXT', 'IMAGE'],
                temperature,
            };
            if (aspectRatio) {
                const safeARs = ["1:1","9:16","16:9","4:3","3:4","4:5","5:4","2:3","3:2"];
                const nativeAR = safeARs.includes(aspectRatio) ? aspectRatio : '1:1';
                generationConfig.imageConfig = { aspectRatio: nativeAR };
                console.log(`🖼️ Aspect ratio applied: ${nativeAR}`);
            }

            // systemInstruction forces photographic rendering mode.
            // Without this, Gemini defaults to illustrated/3D-rendered human portraits.
            const systemInstruction = options.isAvatar
                ? { parts: [{ text: 'You are a photorealistic portrait photography AI. Always output real-looking photographs of people — never illustrations, paintings, 3D renders, cartoons, or digital art. Every image must look like it was captured by a professional DSLR camera.' }] }
                : undefined;

            const reqBody = {
                contents: [{ parts }],
                generationConfig,
            };
            if (systemInstruction) reqBody.systemInstruction = systemInstruction;

            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await resp.json();
            if (data.error) {
                console.error(`❌ Gemini ${modelId} error:`, data.error.message);
                break; // Don't retry, fall through to Flux Pro
            }

            const resParts = data.candidates?.[0]?.content?.parts || [];
            for (const part of resParts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    imageBase64 = part.inlineData.data;
                    mimeType = part.inlineData.mimeType;
                }
            }
            
            if (imageBase64) {
                console.log(`✅ NanoBanana 2 image generated via ${modelId} (${imageBase64.length} bytes base64)`);
                break;
            } else {
                console.warn(`⚠️ ${modelId} returned no image in response`);
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.error(`⏱️ Gemini ${modelId} timed out after 90s`);
            } else {
                console.error(`❌ Gemini ${modelId} error:`, e.message);
            }
        }
    }

    // ── Fallback to Flux Pro if Gemini failed ──
    if (!imageBase64) {
        console.warn('⚠️ NanoBanana 2 failed — falling back to fal-ai Flux Pro...');
        try {
            const fallbackImageUrl = await falGenerateImage({
                prompt: prompt || 'cinematic default scene',
                imageUrl: referenceImageUrls?.[0] || null, // Pass first ref as style guide
                model: 'fal-ai/flux-pro/v1.1'
            });
            console.log(`✅ Flux Pro fallback image: ${fallbackImageUrl}`);
            return { imageUrl: fallbackImageUrl };
        } catch (falErr) {
            console.error('❌ Flux Pro fallback also failed:', falErr.message);
            throw new Error('All image generators (Gemini NanoBanana 2 + Flux Pro) failed.');
        }
    }

    // Upload to S3 for an HTTP URL
    const httpUrl = await uploadToFalStorage(imageBase64, mimeType);
    if (httpUrl) {
        console.log(`📤 Image uploaded to S3: ${httpUrl.substring(0, 80)}...`);
        return { imageUrl: httpUrl };
    }

    // Fallback: return data URI
    console.log('⚠️ S3 upload failed, using data URI fallback');
    return { imageUrl: `data:${mimeType};base64,${imageBase64}` };
}

/**
 * Upload base64 image to S3 storage
 * Returns HTTP URL or null on failure
 */
async function uploadToFalStorage(base64Data, mimeType) {
    const dataUri = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    return await ensureS3Url(dataUri, 'video-studio/first-frames');
}
