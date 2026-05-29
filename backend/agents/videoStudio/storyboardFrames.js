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
    hyperrealistic: 'Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout. Cinematic, ultra-detailed photorealistic photography, professional lighting, clean design, beige/creme background canvas.',
    '3d': 'Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout. 3D animated commercial style, Pixar and Unreal Engine 5 rendering, ray-traced cinematic lighting, clean design, beige/creme background canvas.',
    '2d': 'Create a highly detailed, professional pre-production storyboard pitch deck sheet in a structured billboard layout. 2D animated commercial style, clean flat vector illustration, bold black outlines, vibrant colors, clean design, beige/creme background canvas.',
};

const STYLE_SUFFIX = `CRITICAL CANVAS LAYOUT REQUIREMENT: This MUST be a single, large consolidated infographic image structured into 4 distinct horizontal sections:
1. TOP META HEADER: Displaying 'Cut Count: X', 'Color Palette: ...', 'Environment Fingerprint: ...' in clean black typography.
2. SECTION 1 (CHARACTER & HERO PRODUCT REFERENCE):
   - 'CHARACTER REFERENCE' showing 6 small panels of the presenter/model from different angles (front, side, back, face close-up, side close-up, wardrobe detail).
   - 'HERO PRODUCT REFERENCE' showing 5 small panels of the product from different angles (front view, three-quarter view, side view, macro detail, in-context lifestyle).
   - Bottom row: Color palette circular swatches and text material notes.
3. SECTION 2 (ENVIRONMENT / SET DESIGN):
   - A large 16:9 set design render of the environment on the left.
   - A clean top-down floor plan schematic diagram on the right, showing counter/furniture layout and camera paths/arrows labeled with cut numbers (e.g. Cut 1, Cut 2).
4. SECTION 3 (STORYBOARD CUTS):
   - A clean horizontal row of 5 main storyboard panels (Cut 1, Cut 2, Cut 3, Cut 4, Cut 5).
   - Below each panel, include clear black typography: 'Lens | Duration | Move | Shot Type — short action description'.
5. SECTION 4 (LIGHTING / MOOD / STYLE NOTES):
   - 4 small lighting panels showing soft backlight, warm glow, rim light, and bokeh details with descriptions.
   - On the right: 'MOOD KEYWORDS' list and bulleted 'CINEMATOGRAPHY NOTES'.

This must look exactly like a real professional advertising agency presentation deck or director's pre-production storyboard template. All panels, text labels, schemas, and diagrams must be crisp, clean, and perfectly organized on a single cohesive canvas page.`;

// ── Aspect ratio → GPT Image 2 size ──────────────────────────────────────────
const AR_TO_SIZE = {
    '9:16':  '1024x1792',
    '16:9':  '1792x1024',
    '1:1':   '1024x1024',
    '4:3':   '1536x1024',
    '3:4':   '1024x1536',
};

function sanitizeMimeType(mimeType) {
    if (!mimeType) return 'image/jpeg';
    const clean = mimeType.split(';')[0].trim().toLowerCase();
    if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp'].includes(clean)) {
        return clean;
    }
    return 'image/jpeg';
}

// ── Download a URL to a Buffer ────────────────────────────────────────────────
async function downloadBuffer(url) {
    let targetUrl = url;
    try {
        const { getSignedUrlIfNeeded } = await import('../../utils/s3.js');
        targetUrl = await getSignedUrlIfNeeded(url);
    } catch (e) {
        console.warn(`[storyboardFrames] Could not sign S3 URL inside downloadBuffer: ${e.message}`);
    }
    const resp = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Mantram AI Backend)' },
        signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status} — ${url}`);
    const rawMime = resp.headers.get('content-type') || 'image/jpeg';
    return { buffer: Buffer.from(await resp.arrayBuffer()), mimeType: sanitizeMimeType(rawMime) };
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
        finalPrompt += ` IMPORTANT: Do NOT confuse the human character with the product! Keep them entirely separate.`;
        if (hasProductRefs) {
            finalPrompt += ` The PRODUCT to feature in the scene MUST perfectly match the attached product reference (its exact shape, design details, color shades, labels, and branding). Do NOT change the product's colors, materials, or structure. The product must look exactly as in the original reference. The brand colors/color palette must ONLY be used for the background, set environment, or UI elements, and must NEVER be applied to recolor or color-shift the product itself.`;
        }
        if (hasAvatarRef) {
            finalPrompt += ` The HUMAN CHARACTER/PRESENTER in the scene MUST perfectly match the attached human face/avatar reference. Do NOT mix product features onto the human face, and keep facial features, skin tone, hair, and look completely original.`;
        }
        if (hasLogoRef) {
            finalPrompt += ` The brand logo MUST perfectly match the attached logo reference (colors, font, and shape must be identical).`;
        }
        finalPrompt += ` Do NOT hallucinate new products, generic faces, or custom logos. Do NOT stylize, modify, or simplify any of the reference details. Keep all shapes and colors completely true to the references.`;
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

    const refBuffers = [];
    
    // 1. Collect Product Images (Only the first one to avoid slot/reference confusion in LaoZhang edits)
    if (rawProductBuffers.length > 0) {
        const rb = rawProductBuffers[0];
        if (rb?.buffer) refBuffers.push({ buffer: rb.buffer, mimeType: rb.mimeType || 'image/jpeg', label: 'product' });
    } else if (productImageUrls.length > 0) {
        const url = productImageUrls.find(u => u?.startsWith('http'));
        if (url) {
            try {
                const { buffer, mimeType } = await downloadBuffer(url);
                refBuffers.push({ buffer, mimeType, label: 'product' });
                console.log(`[SB Poster][GPT-Image-2] Downloaded product ref: ${url.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download product ref: ${dlErr.message}`);
            }
        }
    }

    // 2. Collect Avatar Image
    if (rawAvatarBuffer?.buffer) {
        refBuffers.push({ buffer: rawAvatarBuffer.buffer, mimeType: rawAvatarBuffer.mimeType || 'image/jpeg', label: 'character' });
    } else if (avatarUrl?.startsWith('http')) {
        try {
            const { buffer, mimeType } = await downloadBuffer(avatarUrl);
            refBuffers.push({ buffer, mimeType, label: 'character' });
            console.log(`[SB Poster][GPT-Image-2] Downloaded avatar ref: ${avatarUrl.substring(0, 80)}`);
        } catch (dlErr) {
            console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download avatar ref: ${dlErr.message}`);
        }
    }

    // 3. Collect Logo Image
    if (rawLogoBuffer?.buffer) {
        refBuffers.push({ buffer: rawLogoBuffer.buffer, mimeType: rawLogoBuffer.mimeType || 'image/jpeg', label: 'logo' });
    } else if (logoUrl?.startsWith('http')) {
        try {
            const { buffer, mimeType } = await downloadBuffer(logoUrl);
            refBuffers.push({ buffer, mimeType, label: 'logo' });
            console.log(`[SB Poster][GPT-Image-2] Downloaded logo ref: ${logoUrl.substring(0, 80)}`);
        } catch (dlErr) {
            console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download logo ref: ${dlErr.message}`);
        }
    }

    const useEditsEndpoint = refBuffers.length > 0;

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
            
            // LaoZhang proxy supports multiple 'image[]' parameters for character/style/logo injection
            refBuffers.forEach(({ buffer, mimeType, label }, idx) => {
                const ext = mimeType?.includes('png') ? 'png' : mimeType?.includes('webp') ? 'webp' : 'jpg';
                const fName = label ? `${label}_${idx}.${ext}` : `ref_${idx}.${ext}`;
                fd.append('image[]', buffer, { filename: fName, contentType: mimeType });
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
            let addedLabel = false;
            for (const rb of rawProductBuffers) {
                if (rb?.buffer) {
                    if (!addedLabel) { parts.push({ text: "PRODUCT REFERENCE IMAGE (Feature this exact item):" }); addedLabel = true; }
                    parts.push({ inlineData: { mimeType: sanitizeMimeType(rb.mimeType), data: rb.buffer.toString('base64') } });
                }
            }
        } else if (productImageUrls.length > 0) {
            const urlsToFetch = productImageUrls.filter(u => u?.startsWith('http'));
            let addedLabel = false;
            for (const url of urlsToFetch) {
                try {
                    const { buffer, mimeType } = await downloadBuffer(url);
                    if (!addedLabel) { parts.push({ text: "PRODUCT REFERENCE IMAGE (Feature this exact item):" }); addedLabel = true; }
                    parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                    console.log(`[SB Poster][NanoBanana] Downloaded product ref: ${url.substring(0, 80)}`);
                } catch (dlErr) {
                    console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download product ref: ${dlErr.message}`);
                }
            }
        }

        // 2. Collect Avatar Image
        if (rawAvatarBuffer?.buffer) {
            parts.push({ text: "CHARACTER REFERENCE IMAGE (The human presenter must look exactly like this):" });
            parts.push({ inlineData: { mimeType: sanitizeMimeType(rawAvatarBuffer.mimeType), data: rawAvatarBuffer.buffer.toString('base64') } });
        } else if (avatarUrl?.startsWith('http')) {
            try {
                const { buffer, mimeType } = await downloadBuffer(avatarUrl);
                parts.push({ text: "CHARACTER REFERENCE IMAGE (The human presenter must look exactly like this):" });
                parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                console.log(`[SB Poster][NanoBanana] Downloaded avatar ref: ${avatarUrl.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download avatar ref: ${dlErr.message}`);
            }
        }

        // 3. Collect Logo Image
        if (rawLogoBuffer?.buffer) {
            parts.push({ text: "LOGO REFERENCE IMAGE:" });
            parts.push({ inlineData: { mimeType: sanitizeMimeType(rawLogoBuffer.mimeType), data: rawLogoBuffer.buffer.toString('base64') } });
        } else if (logoUrl?.startsWith('http')) {
            try {
                const { buffer, mimeType } = await downloadBuffer(logoUrl);
                parts.push({ text: "LOGO REFERENCE IMAGE:" });
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
