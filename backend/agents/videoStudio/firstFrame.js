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
 *
 * KEY FIX: For our own S3 URLs, we use the SDK directly via getObjectStream()
 * to bypass signed URL expiration / HTTP 403 issues.
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

        // ── Our own S3 bucket? Use SDK directly (bypasses signed URL expiration) ──
        const isOurS3 = imageUrl.includes('mantram-assets') || 
                        (imageUrl.includes('.amazonaws.com') && imageUrl.includes('s3.ap-south-1'));
        
        // ── Our CloudFront CDN URL? Fetch with auth headers ──
        const isOurCloudFront = imageUrl.includes('d138p2zntq2uob.cloudfront.net') ||
                                imageUrl.includes('cloudfront.net/d2c/') ||
                                imageUrl.includes('cloudfront.net/storyboard/') ||
                                imageUrl.includes('cloudfront.net/video-studio/');
        
        if (isOurS3) {
            try {
                const { getObjectStream } = await import('../../utils/s3.js');
                // Strip query params (signed URL tokens) before extracting key
                const cleanUrl = imageUrl.split('?')[0];
                console.log(`🔑 Using S3 SDK direct download for: ${cleanUrl.substring(0, 80)}...`);
                
                const { stream, contentType } = await getObjectStream(cleanUrl);
                const chunks = [];
                for await (const chunk of stream) {
                    chunks.push(chunk);
                }
                const rawBuffer = Buffer.concat(chunks);
                
                const resized = await sharp(rawBuffer)
                    .resize(maxDimension, maxDimension, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 70 })
                    .toBuffer();
                
                console.log(`🖼️ S3 SDK ref image: ${rawBuffer.length} → ${resized.length} bytes`);
                return { mimeType: 'image/jpeg', data: resized.toString('base64') };
            } catch (s3Err) {
                console.warn(`⚠️ S3 SDK download failed, falling back to HTTP: ${s3Err.message}`);
                // Fall through to normal HTTP fetch
            }
        }

        // ── Standard HTTP fetch (with browser-like headers to prevent 403 blocks) ──
        const fetchHeaders = {
            'User-Agent': 'Mozilla/5.0 (compatible; Mantram-AI/1.0; image-reference-fetcher)',
            'Accept': 'image/webp,image/jpeg,image/png,image/*',
        };

        // ⚡ HEAD-check before full download — skip dead URLs instantly
        try {
            const headResp = await fetch(imageUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000), headers: fetchHeaders });
            if (headResp && !headResp.ok) {
                console.warn(`⚡ Skipping dead ref URL (HTTP ${headResp.status}): ${imageUrl.substring(0, 60)}`);
                return null;
            }
        } catch (_) { /* HEAD failed — try full download anyway */ }

        const resp = await fetch(imageUrl, { signal: AbortSignal.timeout(15000), headers: fetchHeaders });
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
    const { aspectRatio, referenceImageUrls = [] } = options;

    console.log(`🖼️ Gemini image gen: starting (refs=${referenceImageUrls.length}, ratio=${aspectRatio || 'default'})`);

    // ── Fetch + RESIZE reference images to keep payload small ──
    const fetchedRefParts = [];
    const modelId = options.model || 'gpt-image-2';
    
    // Determine provider based on model, avoiding Gemini as requested
    let provider = 'openai';
    if (modelId.includes('gemini') || modelId.includes('imagen')) {
        provider = 'gemini';
    }

    let finalPrompt = prompt;

    if (referenceImageUrls.length > 0) {
        console.log(`🖼️ Fetching & resizing ${referenceImageUrls.length} reference images for fallback...`);
        for (const url of referenceImageUrls.slice(0, 2)) {
            const resized = await fetchAndResizeImage(url);
            if (resized) {
                fetchedRefParts.push({ inlineData: { mimeType: resized.mimeType, data: resized.data } });
            }
        }
        console.log(`🖼️ Ready: ${fetchedRefParts.length}/${referenceImageUrls.length} reference images (resized to 512px)`);
    }

    // Build parts: reference images first
    const parts = [
        ...fetchedRefParts,
        ...imageParts.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
    ];

    try {
        const { getRouter } = await import('../../ai/router.js');
        const router = getRouter();
        
        const modelId = options.model || 'gpt-image-2';
        
        // Determine provider based on model, avoiding Gemini as requested
        let provider = 'openai';
        if (modelId.includes('gemini') || modelId.includes('imagen')) {
            provider = 'gemini';
        }

        console.log(`🖼️ Calling router.generateImage with ${provider} (model: ${modelId})...`);
        
        const result = await router.generateImage({
            prompt: finalPrompt,
            aspectRatio: options.aspectRatio || '16:9',
            model: modelId,
            imageParts: parts,
            temperature: temperature
        }, {
            provider: provider
        });

        if (!result || !result.imageUrl) {
            throw new Error('No image URL returned from Gemini router');
        }

        console.log(`✅ Gemini image generated successfully!`);

        // Upload to S3 for an HTTP URL
        const httpUrl = await uploadToFalStorage(result.imageUrl.split('base64,')[1] || result.imageUrl, result.imageUrl.split(';')[0].replace('data:', '') || 'image/png');
        if (httpUrl) {
            console.log(`📤 Image uploaded to S3: ${httpUrl.substring(0, 80)}...`);
            return { imageUrl: httpUrl };
        }

        // Fallback: return data URI
        console.log('⚠️ S3 upload failed, using data URI fallback');
        return { imageUrl: result.imageUrl };
    } catch (e) {
        console.error(`❌ Gemini image generation error:`, e.message);
        throw new Error(`Gemini Image Generation failed: ${e.message}`);
    }
}

/**
 * Upload base64 image to S3 storage
 * Returns HTTP URL or null on failure
 */
async function uploadToFalStorage(base64Data, mimeType) {
    const dataUri = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    return await ensureS3Url(dataUri, 'video-studio/first-frames');
}
