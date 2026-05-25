/**
 * Storyboard Frame Generator
 *
 * Routes image generation based on user-selected model:
 *   - gpt-image-2  → LaoZhang proxy (/images/edits with ref images, or /images/generations)
 *   - nanobanana   → Gemini Vertex AI (gemini-3.1-flash-image-preview)
 *
 * Raw multer buffers are preferred for GPT Image 2 (no S3 roundtrip).
 * NanoBanana uses inline base64 parts for Vertex AI.
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import config from '../../config/env.js';

// ── Style prompt prefixes ─────────────────────────────────────────────────────
const STYLE_PREFIXES = {
    hyperrealistic: 'Create a professional production storyboard pitch deck in a cohesive multi-frame grid layout (e.g. 3x4 or 4x4 frames). Cinematic, ultra-detailed photorealistic photography, professional 3-point lighting.',
    '3d': 'Create a professional production storyboard pitch deck in a cohesive multi-frame grid layout (e.g. 3x4 or 4x4 frames). 3D animated commercial style, Pixar and Unreal Engine 5 rendering, ray-traced cinematic lighting.',
    '2d': 'Create a professional production storyboard pitch deck in a cohesive multi-frame grid layout (e.g. 3x4 or 4x4 frames). 2D animated commercial style, clean flat vector illustration, bold black outlines, vibrant colors.',
};

const STYLE_SUFFIX = `CRITICAL REQUIREMENT: This MUST be a single image containing a dense grid of multiple distinct storyboard frames. Below EACH individual frame, include clear typography with a frame number and a short caption describing the action or camera angle (e.g. "1. WIDE SHOT", "2. CLOSE UP"). It should look exactly like a real advertising agency presentation deck or film production storyboard template.`;

// ── Aspect ratio → GPT Image 2 size ──────────────────────────────────────────
const AR_TO_SIZE = {
    '9:16':  '1024x1792',
    '16:9':  '1792x1024',
    '1:1':   '1024x1024',
    '4:3':   '1536x1024',
    '3:4':   '1024x1536',
};

// ── Download a URL to a Buffer ────────────────────────────────────────────────
async function downloadBuffer(url) {
    const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Mantram AI Backend)' },
        signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status} — ${url}`);
    return { buffer: Buffer.from(await resp.arrayBuffer()), mimeType: resp.headers.get('content-type') || 'image/jpeg' };
}

/**
 * Generate a single storyboard poster with visual reference grounding.
 *
 * @param {string}   imagePrompt        — prompt from storyboardDirector
 * @param {string}   style              — 'hyperrealistic' | '3d' | '2d'
 * @param {string}   format             — '9:16' | '16:9' | '1:1' | '4:3'
 * @param {string[]} productImageUrls   — S3/CDN URLs (fallback if no raw buffers)
 * @param {string|null} avatarUrl       — S3/CDN URL (fallback if no raw avatar buffer)
 * @param {string}   imageModel         — 'gpt-image-2' | 'nanobanana'
 * @param {Array<{buffer: Buffer, mimeType: string}>} rawProductBuffers — direct multer buffers
 * @param {{buffer: Buffer, mimeType: string}|null}   rawAvatarBuffer   — direct multer buffer
 * @returns {string|null}              — data URI or null on failure
 */
export async function generateStoryboardPoster(
    imagePrompt,
    style,
    format,
    productImageUrls = [],
    avatarUrl = null,
    imageModel = 'gpt-image-2',
    rawProductBuffers = [],
    rawAvatarBuffer = null,
    imageSize = '2K',  // ✅ NanoBanana resolution: '1K' | '2K' | '4K'
    logoUrl = null,
    rawLogoBuffer = null,
) {
    const stylePrefix = STYLE_PREFIXES[style] || STYLE_PREFIXES.hyperrealistic;
    const ar = format || '16:9';
    let finalPrompt = `${stylePrefix} ${imagePrompt} ${STYLE_SUFFIX}`;
    
    const hasProductRefs = rawProductBuffers.length > 0 || productImageUrls.length > 0;
    const hasAvatarRef = !!rawAvatarBuffer || !!avatarUrl;
    const hasLogoRef = !!rawLogoBuffer || !!logoUrl;
    
    if (hasProductRefs || hasAvatarRef || hasLogoRef) {
        finalPrompt += `\n\nCRITICAL INSTRUCTION: You have been provided with reference images. You MUST use them exactly as they appear.`;
        if (hasProductRefs) finalPrompt += ` The product in the storyboard MUST perfectly match the attached product reference image (exact shape, color, branding).`;
        if (hasAvatarRef) finalPrompt += ` The presenter in the storyboard MUST perfectly match the attached face/avatar reference image.`;
        if (hasLogoRef) finalPrompt += ` The brand logo in the storyboard MUST perfectly match the attached logo reference image.`;
        finalPrompt += ` Do NOT hallucinate new products, generic faces, or custom logos.`;
    }

    let useNanoBanana = imageModel === 'nanobanana' || imageModel === 'nanobanana-2' || imageModel === 'nanobanana-pro';
    // Verify GCP credentials for NanoBanana
    if (useNanoBanana) {
        const credsVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        let credsExist = false;
        try {
            if (credsVar && fs.existsSync(credsVar)) {
                credsExist = true;
            }
        } catch (e) {
            console.warn(`[SB Poster] Credentials check failed: ${e.message}`);
        }
        
        if (!credsExist) {
            throw new Error(`GOOGLE_APPLICATION_CREDENTIALS file not found or invalid: "${credsVar}". Cannot generate image with NanoBanana (Gemini Vertex AI).`);
        }
    }

    console.log(`\n[SB Poster] ══ GENERATING STORYBOARD POSTER ══`);
    console.log(`  selected model: ${imageModel}`);
    console.log(`  format=${ar}, style=${style}`);
    console.log(`  raw buffers: product=${rawProductBuffers.length}, avatar=${!!rawAvatarBuffer}, logo=${!!rawLogoBuffer}`);
    console.log(`  Prompt (first 120): ${finalPrompt.substring(0, 120)}...`);

    const TIMEOUT_MS = 240000;

    if (useNanoBanana) {
        try {
            const result = await generateWithNanoBanana(finalPrompt, ar, rawProductBuffers, rawAvatarBuffer, productImageUrls, avatarUrl, TIMEOUT_MS, imageSize, logoUrl, rawLogoBuffer);
            if (result) return result;
            throw new Error(`NanoBanana returned null or empty result.`);
        } catch (bananaErr) {
            console.error(`[SB Poster] ❌ NanoBanana execution failed: ${bananaErr.message}`);
            throw new Error(`NanoBanana image generation failed: ${bananaErr.message}`);
        }
    }
    
    const result = await generateWithGptImage2(finalPrompt, ar, rawProductBuffers, rawAvatarBuffer, productImageUrls, avatarUrl, TIMEOUT_MS, logoUrl, rawLogoBuffer);
    if (!result) {
        throw new Error(`GPT Image 2 generation failed.`);
    }
    return result;
}

// ── GPT Image 2 via LaoZhang ─────────────────────────────────────────────────
async function generateWithGptImage2(finalPrompt, ar, rawProductBuffers, rawAvatarBuffer, productImageUrls, avatarUrl, TIMEOUT_MS, logoUrl = null, rawLogoBuffer = null) {
    const size = AR_TO_SIZE[ar] || '1792x1024';
    const modelId = 'gpt-image-2';

    // DALL-E 3 (gpt-image-2) does not support image-to-image reference edits.
    // Forcing /images/edits on the proxy falls back to slow, low-quality DALL-E 2 edits.
    // Instead, we always use standard generations (text-to-image) to keep DALL-E 3 quality and speed.
    const useEditsEndpoint = false;
    const refBuffers = [];
    
    if (useEditsEndpoint) {
        // 1. Collect Product Images
        if (rawProductBuffers.length > 0) {
            for (const rb of rawProductBuffers) {
                if (rb?.buffer) refBuffers.push({ buffer: rb.buffer, mimeType: rb.mimeType || 'image/jpeg' });
            }
        } else if (productImageUrls.length > 0) {
            const urlsToFetch = productImageUrls.filter(u => u?.startsWith('http'));
            for (const url of urlsToFetch) {
                try {
                    const { buffer, mimeType } = await downloadBuffer(url);
                    refBuffers.push({ buffer, mimeType });
                    console.log(`[SB Poster][GPT-Image-2] Downloaded product ref: ${url.substring(0, 80)}`);
                } catch (dlErr) {
                    console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download product ref: ${dlErr.message}`);
                }
            }
        }

        // 2. Collect Avatar Image
        if (rawAvatarBuffer?.buffer) {
            refBuffers.push({ buffer: rawAvatarBuffer.buffer, mimeType: rawAvatarBuffer.mimeType || 'image/jpeg' });
        } else if (avatarUrl?.startsWith('http')) {
            try {
                const { buffer, mimeType } = await downloadBuffer(avatarUrl);
                refBuffers.push({ buffer, mimeType });
                console.log(`[SB Poster][GPT-Image-2] Downloaded avatar ref: ${avatarUrl.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download avatar ref: ${dlErr.message}`);
            }
        }

        // 3. Collect Logo Image
        if (rawLogoBuffer?.buffer) {
            refBuffers.push({ buffer: rawLogoBuffer.buffer, mimeType: rawLogoBuffer.mimeType || 'image/jpeg' });
        } else if (logoUrl?.startsWith('http')) {
            try {
                const { buffer, mimeType } = await downloadBuffer(logoUrl);
                refBuffers.push({ buffer, mimeType });
                console.log(`[SB Poster][GPT-Image-2] Downloaded logo ref: ${logoUrl.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download logo ref: ${dlErr.message}`);
            }
        }
    }

    const apiKey = config.ai?.laozhangApiKey || process.env.LAOZHANG_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = config.ai?.laozhangBaseUrl || 'https://api.laozhang.ai/v1';
    const endpoint = useEditsEndpoint ? `${baseUrl}/images/edits` : `${baseUrl}/images/generations`;

    console.log(`[SB Poster][GPT-Image-2] ${endpoint} | refs=${refBuffers.length} | size=${size}`);

    try {
        let response;
        if (useEditsEndpoint) {
            const fd = new FormData();
            fd.append('model', modelId);
            fd.append('prompt', finalPrompt);
            fd.append('size', size);
            fd.append('quality', 'high');
            fd.append('n', '1');
            fd.append('response_format', 'b64_json');
            // ✅ FIX: GPT Image 2 /images/edits uses 'image' (singular) not 'image[]'
            // Multiple images require separate 'image' entries (some proxies support array)
            refBuffers.forEach(({ buffer, mimeType }, idx) => {
                const ext = mimeType?.includes('png') ? 'png' : mimeType?.includes('webp') ? 'webp' : 'jpg';
                fd.append('image', buffer, { filename: `ref_${idx}.${ext}`, contentType: mimeType });
            });
            response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, ...fd.getHeaders() },
                body: fd,
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } else {
            response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelId, prompt: finalPrompt, size, quality: 'high', n: 1, response_format: 'b64_json' }),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LaoZhang ${response.status}: ${errText.substring(0, 300)}`);
        }

        const data = await response.json();
        let b64 = data.data?.[0]?.b64_json || '';
        if (!b64) throw new Error('No b64_json in response');
        if (b64.startsWith('data:')) b64 = b64.substring(b64.indexOf(',') + 1);

        const rawBuf = Buffer.from(b64, 'base64');
        let mime = 'image/png';
        if (rawBuf[0] === 0xFF && rawBuf[1] === 0xD8) mime = 'image/jpeg';
        else if (rawBuf.length > 12 && rawBuf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';

        console.log(`[SB Poster][GPT-Image-2] ✅ Done — ${Math.round(rawBuf.length/1024)}KB, ${mime}, refs_used=${refBuffers.length}`);
        return `data:${mime};base64,${rawBuf.toString('base64')}`;

    } catch (err) {
        console.error(`[SB Poster][GPT-Image-2] ❌ FAILED: ${err.message}`);
        return null;
    }
}

// ── NanoBanana (Gemini Vertex AI) ────────────────────────────────────────────
async function generateWithNanoBanana(finalPrompt, ar, rawProductBuffers, rawAvatarBuffer, productImageUrls, avatarUrl, TIMEOUT_MS, imageSize = '2K', logoUrl = null, rawLogoBuffer = null) {
    // ✅ FIX: gemini-3.1-flash-image-preview is IMAGE OUTPUT ONLY — it cannot read input images.
    // gemini-3.1-flash-image-preview supports both image INPUT (reference) and image OUTPUT (generation).
    const GEMINI_MODEL = 'gemini-3.1-flash-image-preview';

    try {
        const { generateImageWithVertex } = await import('../../services/vertexImage.js');

        // Build content parts — reference images as inlineData, text last
        const parts = [];

        // 1. Collect Product Images
        if (rawProductBuffers.length > 0) {
            for (const rb of rawProductBuffers) {
                if (rb?.buffer) {
                    parts.push({ inlineData: { mimeType: rb.mimeType || 'image/jpeg', data: rb.buffer.toString('base64') } });
                }
            }
        } else if (productImageUrls.length > 0) {
            const urlsToFetch = productImageUrls.filter(u => u?.startsWith('http'));
            for (const url of urlsToFetch) {
                try {
                    const { buffer, mimeType } = await downloadBuffer(url);
                    parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                    console.log(`[SB Poster][NanoBanana] Downloaded product ref: ${url.substring(0, 80)}`);
                } catch (dlErr) {
                    console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download product ref: ${dlErr.message}`);
                }
            }
        }

        // 2. Collect Avatar Image
        if (rawAvatarBuffer?.buffer) {
            parts.push({ inlineData: { mimeType: rawAvatarBuffer.mimeType || 'image/jpeg', data: rawAvatarBuffer.buffer.toString('base64') } });
        } else if (avatarUrl?.startsWith('http')) {
            try {
                const { buffer, mimeType } = await downloadBuffer(avatarUrl);
                parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                console.log(`[SB Poster][NanoBanana] Downloaded avatar ref: ${avatarUrl.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download avatar ref: ${dlErr.message}`);
            }
        }

        // 3. Collect Logo Image
        if (rawLogoBuffer?.buffer) {
            parts.push({ inlineData: { mimeType: rawLogoBuffer.mimeType || 'image/jpeg', data: rawLogoBuffer.buffer.toString('base64') } });
        } else if (logoUrl?.startsWith('http')) {
            try {
                const { buffer, mimeType } = await downloadBuffer(logoUrl);
                parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                console.log(`[SB Poster][NanoBanana] Downloaded logo ref: ${logoUrl.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download logo ref: ${dlErr.message}`);
            }
        }

        // Text prompt last (Gemini requirement)
        parts.push({ text: finalPrompt });

        const hasReferenceImages = parts.filter(p => p.inlineData).length > 0;
        // gemini-3.1-flash-image-preview reads reference images but doesn't support imageSize token ('1K'/'2K')
        // When we have references, use gemini-3.1-flash-image-preview. When no references, use imagen-3.0-generate-002 for quality.
        const activeModel = hasReferenceImages ? 'gemini-3.1-flash-image-preview' : 'imagen-3.0-generate-002';
        const imageConfigObj = hasReferenceImages
            ? { aspectRatio: ar }               // 2.0 only supports aspectRatio
            : { aspectRatio: ar, imageSize };    // imagen-3 supports imageSize too

        console.log(`[SB Poster][NanoBanana] ${activeModel} | refs=${parts.filter(p => p.inlineData).length} | ar=${ar} | size=${hasReferenceImages ? 'model-default' : imageSize}`);

        const data = await Promise.race([
            generateImageWithVertex(parts, activeModel, 0.4, imageConfigObj),
            new Promise((_, reject) => setTimeout(() => reject(new Error('NanoBanana timeout')), TIMEOUT_MS)),
        ]);

        const resParts = data.candidates?.[0]?.content?.parts || [];
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                const dataUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                console.log(`[SB Poster][NanoBanana] ✅ Done — ${Math.round(part.inlineData.data.length * 0.75 / 1024)}KB`);
                return dataUrl;
            }
        }
        throw new Error('NanoBanana returned no image in response');

    } catch (err) {
        console.error(`[SB Poster][NanoBanana] ❌ FAILED: ${err.message}`);
        return null;
    }
}
