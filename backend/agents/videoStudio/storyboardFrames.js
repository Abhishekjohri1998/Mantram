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

/**
 * Build a dynamic STYLE_SUFFIX for the storyboard poster prompt.
 * @param {number} panelCount — how many storyboard panels to render (default 5, max 8)
 * @param {string[]} avatarNames — character names for the CHARACTER REFERENCE section
 * @returns {string}
 */
function buildStyleSuffix(panelCount = 5, avatarNames = []) {
    const visiblePanels = Math.min(Math.max(panelCount, 5), 8);
    const panelRow = visiblePanels <= 5
        ? `A clean horizontal row of ${visiblePanels} main storyboard panels (Cut 1${visiblePanels > 1 ? ' through Cut ' + visiblePanels : ''}).`
        : `ROW 1: panels Cut 1–5 horizontal. ROW 2: panels Cut 6–${visiblePanels} horizontal.`;

    const charRefDesc = avatarNames.length === 0
        ? `'CHARACTER REFERENCE' showing 6 small panels of the presenter/model from different angles (front, side, back, face close-up, side close-up, wardrobe detail).`
        : avatarNames.length === 1
        ? `'CHARACTER REFERENCE' showing 6 small panels of Character "${avatarNames[0]}" from different angles (front, side, back, face close-up, side close-up, wardrobe detail).`
        : `'CHARACTER REFERENCE' showing one panel per character, labelled with their name: ${avatarNames.map(n => `"${n}"`).join(', ')} — front view + face close-up for each.`;

    return `CRITICAL CANVAS LAYOUT REQUIREMENT: This MUST be a single, large consolidated infographic image structured into 4 distinct horizontal sections:
1. TOP META HEADER: Displaying 'Cut Count: ${visiblePanels}', 'Color Palette: ...', 'Environment Fingerprint: ...' in clean black typography.
2. SECTION 1 (CHARACTER & HERO PRODUCT REFERENCE):
   - ${charRefDesc}
   - 'HERO PRODUCT REFERENCE' showing 5 small panels of the product from different angles (front view, three-quarter view, side view, macro detail, in-context lifestyle).
   - Bottom row: Color palette circular swatches and text material notes.
3. SECTION 2 (ENVIRONMENT / SET DESIGN):
   - A large 16:9 set design render of the environment on the left.
   - A clean top-down floor plan schematic diagram on the right, showing counter/furniture layout and camera paths/arrows labeled with cut numbers (e.g. Cut 1, Cut 2).
4. SECTION 3 (STORYBOARD CUTS):
   - ${panelRow}
   - Below each panel, include clear black typography: 'Lens | Duration | Move | Shot Type — short action description'.
5. SECTION 4 (LIGHTING / MOOD / STYLE NOTES):
   - 4 small lighting panels showing soft backlight, warm glow, rim light, and bokeh details with descriptions.
   - On the right: 'MOOD KEYWORDS' list and bulleted 'CINEMATOGRAPHY NOTES'.

This must look exactly like a real professional advertising agency presentation deck or director's pre-production storyboard template. All panels, text labels, schemas, and diagrams must be crisp, clean, and perfectly organized on a single cohesive canvas page.`;
}

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
 * @param {string}   imagePrompt           — prompt from storyboardDirector
 * @param {string}   style                 — 'hyperrealistic' | '3d' | '2d'
 * @param {string}   format                — '9:16' | '16:9' | '1:1' | '4:3'
 * @param {string[]} productImageUrls      — S3/CDN URLs (fallback if no raw buffers)
 * @param {string|null} avatarUrl          — single legacy avatar URL (or null)
 * @param {string}   imageModel            — 'gpt-image-2' | 'nanobanana'
 * @param {Array<{buffer: Buffer, mimeType: string}>} rawProductBuffers — direct multer buffers
 * @param {{buffer: Buffer, mimeType: string}|null}   rawAvatarBuffer   — single legacy avatar buffer
 * @param {string}   imageSize             — NanoBanana resolution: '1K' | '2K' | '4K'
 * @param {string|null} logoUrl            — brand logo URL
 * @param {{buffer: Buffer, mimeType: string}|null}   rawLogoBuffer     — brand logo buffer
 * @param {string[]} avatarUrls            — multi-avatar S3/CDN URLs (NEW)
 * @param {string[]} avatarNames           — names matching avatarUrls (NEW)
 * @param {Array<{buffer: Buffer, mimeType: string}>} rawAvatarBuffers  — multi-avatar buffers (NEW)
 * @param {string[]} refImageUrls          — location/element reference URLs (NEW)
 * @param {Array<{buffer: Buffer, mimeType: string}>} rawRefBuffers     — ref image buffers (NEW)
 * @param {number}   panelCount            — number of storyboard panels to render in STYLE_SUFFIX
 * @returns {string|null}                  — data URI or null on failure
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
    imageSize = '2K',
    logoUrl = null,
    rawLogoBuffer = null,
    // ─── NEW multi-character + ref image params ───
    avatarUrls = [],
    avatarNames = [],
    rawAvatarBuffers = [],
    refImageUrls = [],
    rawRefBuffers = [],
    panelCount = 5,
) {
    // Merge legacy single-avatar with multi-avatar arrays
    const allAvatarUrls = avatarUrls.length > 0 ? avatarUrls : (avatarUrl ? [avatarUrl] : []);
    const allRawAvatarBuffers = rawAvatarBuffers.length > 0 ? rawAvatarBuffers : (rawAvatarBuffer ? [rawAvatarBuffer] : []);

    const stylePrefix = STYLE_PREFIXES[style] || STYLE_PREFIXES.hyperrealistic;
    const ar = format || '16:9';
    const styleSuffix = buildStyleSuffix(panelCount, avatarNames);
    let finalPrompt = `${stylePrefix} ${imagePrompt} ${styleSuffix}`;

    const hasProductRefs = rawProductBuffers.length > 0 || productImageUrls.length > 0;
    const hasAvatarRef = allRawAvatarBuffers.length > 0 || allAvatarUrls.length > 0;
    const hasLogoRef = !!rawLogoBuffer || !!logoUrl;
    const hasRefImages = rawRefBuffers.length > 0 || refImageUrls.length > 0;
    
    if (hasProductRefs || hasAvatarRef || hasLogoRef || hasRefImages) {
        finalPrompt += `\n\nCRITICAL INSTRUCTION: You have been provided with reference images. You MUST use them exactly as they appear.`;
        finalPrompt += ` IMPORTANT: Do NOT confuse the human character with the product! Keep them entirely separate.`;
        if (hasProductRefs) {
            finalPrompt += ` The PRODUCT to feature in the scene MUST perfectly match the attached product reference (its exact shape, design details, color shades, labels, and branding). Do NOT change the product's colors, materials, or structure. The product must look exactly as in the original reference. The brand colors/color palette must ONLY be used for the background, set environment, or UI elements, and must NEVER be applied to recolor or color-shift the product itself.`;
        }
        if (hasAvatarRef) {
            const charDesc = avatarNames.length > 1
                ? `Each CHARACTER REFERENCE image corresponds to a specific named character: ${avatarNames.map((n, i) => `Image ${i + 1} = "${n}"`).join(', ')}. Each character must match their specific reference ONLY — never mix faces between characters.`
                : `The HUMAN CHARACTER/PRESENTER in the scene MUST perfectly match the attached human face/avatar reference. Do NOT mix product features onto the human face, and keep facial features, skin tone, hair, and look completely original.`;
            finalPrompt += ` ${charDesc}`;
        }
        if (hasLogoRef) {
            finalPrompt += ` The brand logo MUST perfectly match the attached logo reference (colors, font, and shape must be identical).`;
        }
        if (hasRefImages) {
            finalPrompt += ` The LOCATION/ELEMENT REFERENCE images are provided for set design inspiration, background visual language, or prop reference — absorb their style, lighting, and spatial composition into the environment without copying any faces, logos, or text from them.`;
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

        const devKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!credsExist && !devKey) {
            throw new Error(`GOOGLE_APPLICATION_CREDENTIALS file not found or invalid: "${credsVar}". Cannot generate image with NanoBanana (Gemini Vertex AI).`);
        }
    }

    console.log(`\n[SB Poster] ══ GENERATING STORYBOARD POSTER ══`);
    console.log(`  selected model: ${imageModel}`);
    console.log(`  format=${ar}, style=${style}, panels=${panelCount}`);
    console.log(`  raw buffers: product=${rawProductBuffers.length}, avatars=${allRawAvatarBuffers.length}, logo=${!!rawLogoBuffer}, refs=${rawRefBuffers.length}`);
    console.log(`  Prompt (first 120): ${finalPrompt.substring(0, 120)}...`);

    const TIMEOUT_MS = 240000;

    if (useNanoBanana) {
        try {
            const result = await generateWithNanoBanana(
                finalPrompt, ar,
                rawProductBuffers, null, productImageUrls, null,
                TIMEOUT_MS, imageSize, logoUrl, rawLogoBuffer,
                allRawAvatarBuffers, allAvatarUrls, avatarNames,
                rawRefBuffers, refImageUrls,
            );
            if (result) return result;
            throw new Error(`NanoBanana returned null or empty result.`);
        } catch (bananaErr) {
            console.error(`[SB Poster] ❌ NanoBanana execution failed: ${bananaErr.message}`);
            throw new Error(`NanoBanana image generation failed: ${bananaErr.message}`);
        }
    }

    let result = null;
    let gptImage2Err = null;
    try {
        result = await generateWithGptImage2(
            finalPrompt, ar,
            rawProductBuffers, null, productImageUrls, null,
            TIMEOUT_MS, logoUrl, rawLogoBuffer,
            allRawAvatarBuffers, allAvatarUrls, avatarNames,
            rawRefBuffers, refImageUrls,
        );
    } catch (err) {
        gptImage2Err = err;
    }

    if (!result) {
        console.warn(`[SB Poster] ⚠️ GPT Image 2 generation failed ${gptImage2Err ? `(${gptImage2Err.message})` : ''}. Trying fallback to NanoBanana (Gemini Vertex)...`);
        
        // Ensure credentials/key check before fallback
        const credsVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        let credsExist = false;
        try {
            if (credsVar && fs.existsSync(credsVar)) {
                credsExist = true;
            }
        } catch (e) {}
        const devKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;

        if (credsExist || devKey) {
            try {
                result = await generateWithNanoBanana(
                    finalPrompt, ar,
                    rawProductBuffers, null, productImageUrls, null,
                    TIMEOUT_MS, imageSize, logoUrl, rawLogoBuffer,
                    allRawAvatarBuffers, allAvatarUrls, avatarNames,
                    rawRefBuffers, refImageUrls,
                );
            } catch (bananaErr) {
                console.error(`[SB Poster] ❌ Fallback to NanoBanana failed: ${bananaErr.message}`);
                throw new Error(`GPT Image 2 failed ${gptImage2Err ? `(${gptImage2Err.message})` : ''}, and fallback to NanoBanana also failed: ${bananaErr.message}`);
            }
        } else {
            throw new Error(`GPT Image 2 failed ${gptImage2Err ? `(${gptImage2Err.message})` : ''}, and no fallback credentials (GEMINI_API_KEY or GOOGLE_APPLICATION_CREDENTIALS) are configured.`);
        }
    }

    return result;
}

// ── GPT Image 2 via LaoZhang ─────────────────────────────────────────────────
async function generateWithGptImage2(
    finalPrompt, ar,
    rawProductBuffers, _legacyAvatarBuffer, productImageUrls, _legacyAvatarUrl,
    TIMEOUT_MS,
    logoUrl = null, rawLogoBuffer = null,
    // Multi-character + ref image params
    allRawAvatarBuffers = [], allAvatarUrls = [], avatarNames = [],
    rawRefBuffers = [], refImageUrls = [],
) {
    const size = AR_TO_SIZE[ar] || '1792x1024';
    const modelId = 'gpt-image-2';

    const refBuffers = [];

    // 1. Collect Product Image (first only to avoid slot confusion)
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

    // 2. Collect All Avatar Images (multi-character support)
    for (let i = 0; i < allRawAvatarBuffers.length; i++) {
        const rb = allRawAvatarBuffers[i];
        if (rb?.buffer) {
            const name = avatarNames[i] || `character_${i + 1}`;
            refBuffers.push({ buffer: rb.buffer, mimeType: rb.mimeType || 'image/jpeg', label: `character_${name.replace(/\s+/g, '_')}` });
        }
    }
    // Fallback: download from URLs if no buffers
    if (allRawAvatarBuffers.length === 0 && allAvatarUrls.length > 0) {
        for (let i = 0; i < allAvatarUrls.length; i++) {
            const url = allAvatarUrls[i];
            if (!url?.startsWith('http')) continue;
            try {
                const { buffer, mimeType } = await downloadBuffer(url);
                const name = avatarNames[i] || `character_${i + 1}`;
                refBuffers.push({ buffer, mimeType, label: `character_${name.replace(/\s+/g, '_')}` });
                console.log(`[SB Poster][GPT-Image-2] Downloaded avatar ref (${name}): ${url.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download avatar ref: ${dlErr.message}`);
            }
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

    // 4. Collect Location/Element Reference Images
    for (let i = 0; i < rawRefBuffers.length; i++) {
        const rb = rawRefBuffers[i];
        if (rb?.buffer) refBuffers.push({ buffer: rb.buffer, mimeType: rb.mimeType || 'image/jpeg', label: `ref_location_${i + 1}` });
    }
    if (rawRefBuffers.length === 0 && refImageUrls.length > 0) {
        for (let i = 0; i < refImageUrls.length; i++) {
            const url = refImageUrls[i];
            if (!url?.startsWith('http')) continue;
            try {
                const { buffer, mimeType } = await downloadBuffer(url);
                refBuffers.push({ buffer, mimeType, label: `ref_location_${i + 1}` });
                console.log(`[SB Poster][GPT-Image-2] Downloaded ref image ${i + 1}: ${url.substring(0, 80)}`);
            } catch (dlErr) {
                console.warn(`[SB Poster][GPT-Image-2] ⚠️ Could not download ref image: ${dlErr.message}`);
            }
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
async function generateWithNanoBanana(
    finalPrompt, ar,
    rawProductBuffers, _legacyAvatarBuffer, productImageUrls, _legacyAvatarUrl,
    TIMEOUT_MS, imageSize = '2K',
    logoUrl = null, rawLogoBuffer = null,
    // Multi-character + ref image params
    allRawAvatarBuffers = [], allAvatarUrls = [], avatarNames = [],
    rawRefBuffers = [], refImageUrls = [],
) {
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

        // 2. Collect All Avatar Images (multi-character support)
        for (let i = 0; i < allRawAvatarBuffers.length; i++) {
            const rb = allRawAvatarBuffers[i];
            if (rb?.buffer) {
                const name = avatarNames[i] || `Character ${i + 1}`;
                parts.push({ text: `CHARACTER REFERENCE IMAGE — Character "${name}" (use this face ONLY for "${name}", do not mix with other characters):` });
                parts.push({ inlineData: { mimeType: sanitizeMimeType(rb.mimeType), data: rb.buffer.toString('base64') } });
            }
        }
        // Fallback: download from URLs
        if (allRawAvatarBuffers.length === 0 && allAvatarUrls.length > 0) {
            for (let i = 0; i < allAvatarUrls.length; i++) {
                const url = allAvatarUrls[i];
                if (!url?.startsWith('http')) continue;
                try {
                    const { buffer, mimeType } = await downloadBuffer(url);
                    const name = avatarNames[i] || `Character ${i + 1}`;
                    parts.push({ text: `CHARACTER REFERENCE IMAGE — Character "${name}" (use this face ONLY for "${name}", do not mix with other characters):` });
                    parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                    console.log(`[SB Poster][NanoBanana] Downloaded avatar ref (${name}): ${url.substring(0, 80)}`);
                } catch (dlErr) {
                    console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download avatar ref: ${dlErr.message}`);
                }
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

        // 4. Collect Location/Element Reference Images
        for (let i = 0; i < rawRefBuffers.length; i++) {
            const rb = rawRefBuffers[i];
            if (rb?.buffer) {
                parts.push({ text: `LOCATION/ELEMENT REFERENCE IMAGE ${i + 1} (use for set design, background, or prop inspiration — do not copy faces or logos):` });
                parts.push({ inlineData: { mimeType: sanitizeMimeType(rb.mimeType), data: rb.buffer.toString('base64') } });
            }
        }
        if (rawRefBuffers.length === 0 && refImageUrls.length > 0) {
            for (let i = 0; i < refImageUrls.length; i++) {
                const url = refImageUrls[i];
                if (!url?.startsWith('http')) continue;
                try {
                    const { buffer, mimeType } = await downloadBuffer(url);
                    parts.push({ text: `LOCATION/ELEMENT REFERENCE IMAGE ${i + 1} (use for set design, background, or prop inspiration):` });
                    parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                    console.log(`[SB Poster][NanoBanana] Downloaded ref image ${i + 1}: ${url.substring(0, 80)}`);
                } catch (dlErr) {
                    console.warn(`[SB Poster][NanoBanana] ⚠️ Could not download ref image: ${dlErr.message}`);
                }
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

// ─────────────────────────────────────────────────────────────────────────────
// CHARACTER REFERENCE SHEET GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a consolidated Character Reference Sheet image.
 *
 * Produces a single clean image showing every character in labelled panels
 * (frontal face close-up, full-body, profile). This sheet is stored once per
 * storyboard project and injected as a stable face anchor for EVERY video
 * segment during animation — eliminating the per-segment atlas asset re-registration
 * problem and ensuring character identity is consistent across all cuts.
 *
 * @param {Array<{buffer: Buffer, mimeType: string}>} avatarBuffers — raw buffers per character
 * @param {string[]} avatarNames — display names matching avatarBuffers order
 * @param {string}   style       — 'hyperrealistic' | '3d' | '2d'
 * @returns {string|null}        — data URI (base64) or null on failure
 */
export async function generateCharacterReferenceSheet(avatarBuffers = [], avatarNames = [], style = 'hyperrealistic') {
    if (avatarBuffers.length === 0) {
        console.log('[Char Ref Sheet] No avatar buffers — skipping');
        return null;
    }

    const apiKey = config.ai?.laozhangApiKey || process.env.LAOZHANG_API_KEY || process.env.OPENAI_API_KEY;
    const baseUrl = config.ai?.laozhangBaseUrl || 'https://api.laozhang.ai/v1';
    const endpoint = `${baseUrl}/images/edits`;

    const charList = avatarNames.length > 0
        ? avatarNames.map((n, i) => `Character ${i + 1}: "${n || `Character ${i + 1}`}"`).join(', ')
        : avatarBuffers.map((_, i) => `Character ${i + 1}`).join(', ');

    const styleDesc = style === '3d'
        ? 'Pixar/Unreal Engine 3D animated style'
        : style === '2d'
        ? 'clean 2D flat illustrated style'
        : 'hyperrealistic cinematic photographic style';

    const prompt = `Create a professional CHARACTER IDENTITY REFERENCE SHEET on a plain white background.
PURPOSE: This sheet is a FACE and IDENTITY reference ONLY — not a wardrobe reference.
Layout: A clean labelled grid showing each character in their own column.
For each character, show 3 panels stacked vertically:
  1. Face close-up (frontal, neutral expression) — the most important panel
  2. Three-quarter face view
  3. Side profile
Characters: ${charList}
Style: ${styleDesc}
CRITICAL IDENTITY RULES:
- Use the attached reference images as the EXACT source for each character's face shape, facial features, hair colour/style, skin tone, and eye colour ONLY.
- Show characters in plain neutral clothing (simple white or grey top) — the purpose is a FACE REFERENCE SHEET, not a wardrobe sheet. Actual costumes will be described per scene.
- DO NOT replicate or preserve the clothing/outfit from the reference images.
- Label each column with the character's name in clean black typography below their panels.
White background, clinical reference sheet format, no extra people or props, no background scenes.
IMPORTANT: The model/director will use this ONLY to maintain facial identity consistency across different scenes where characters wear different costumes.`;

    console.log(`[Char Ref Sheet] Generating for ${avatarBuffers.length} character(s): ${charList}`);

    try {
        const fd = new FormData();
        fd.append('model', 'gpt-image-2');
        fd.append('prompt', prompt);
        fd.append('size', '1792x1024');
        fd.append('quality', 'high');
        fd.append('n', '1');
        fd.append('response_format', 'b64_json');

        avatarBuffers.forEach(({ buffer, mimeType }, i) => {
            const ext = mimeType?.includes('png') ? 'png' : mimeType?.includes('webp') ? 'webp' : 'jpg';
            const name = avatarNames[i] ? avatarNames[i].replace(/\s+/g, '_') : `character_${i + 1}`;
            fd.append('image[]', buffer, { filename: `char_ref_${name}_${i}.${ext}`, contentType: mimeType || 'image/jpeg' });
        });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, ...fd.getHeaders() },
            body: fd,
            signal: AbortSignal.timeout(120000),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`LaoZhang ${response.status}: ${errText.substring(0, 300)}`);
        }

        const json = await response.json();
        const b64 = json?.data?.[0]?.b64_json;
        if (!b64) throw new Error('No b64_json in char ref sheet response');

        const dataUri = `data:image/png;base64,${b64}`;
        console.log(`[Char Ref Sheet] ✅ Generated — ${Math.round(b64.length * 0.75 / 1024)}KB`);
        return dataUri;

    } catch (err) {
        console.error(`[Char Ref Sheet] ❌ Failed: ${err.message}`);
        return null;
    }
}
