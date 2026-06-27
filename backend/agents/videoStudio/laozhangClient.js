import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import config from "../../config/env.js";
import { ensureS3Url } from '../../utils/s3.js';
import { fetchOptions } from '../../utils/network.js';
import { sanitizePromptForProvider } from './promptSanitizer.js';

const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';

// Atlas Cloud — primary provider for GPT Image 2 (cheaper, confirmed compatible)
const ATLAS_IMAGE_BASE_URL = 'https://api.atlascloud.ai/v1';

function getAtlasImageApiKey() {
    return process.env.ATLASCLOUD_API_KEY || '';
}

function isAtlasImageAvailable() {
    return !!process.env.ATLASCLOUD_API_KEY;
}

// Per-model timeout (ms). Heavy models can be slow but sora_video2 hangs indefinitely.
const MODEL_TIMEOUTS = {
    'seedance-2.0':   90_000,
    'seedance-2':     90_000,
    'seedance-2-pro': 120_000,
    'sora_video2':    90_000,   // Was 300s — hangs, cut to 90s
    'sora-2':         90_000,
    'veo-3.1':        90_000,
    'veo-3.1-fast':   90_000,
    'kling-3.0':      120_000,
    default:          90_000,
};

function getApiKey() {
    const key = process.env.LAOZHANG_API_KEY;
    if (!key) throw new Error('LAOZHANG_API_KEY not configured. Add it to .env');
    return key;
}

export function isLaozhangAvailable() {
    return !!process.env.LAOZHANG_API_KEY;
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — via /v1/chat/completions (synchronous, returns URL)
// ══════════════════════════════════════════════════════════════════════════════

const LZ_VIDEO_MODELS = {
    // Seedance (ByteDance) — INTERMITTENT
    'seedance-2.0':   'seedance-2.0',
    'seedance-2':     'seedance-2',
    'seedance-2-pro': 'seedance-2-pro',
    // Sora 2 variants — WARNING: hang >5min in practice, use only with 90s timeout
    'sora-2':         'sora_video2',
    'sora-2-15s':     'sora_video2-15s',
    'sora-2-land':    'sora_video2-landscape',
    'sora-2-land-15': 'sora_video2-landscape-15s',
    'sora-2-pro':     'sora-2',
    // Veo 3.1 — fast & reliable ✅
    'veo-3.1':        'veo-3.1',
    'veo-3.1-fast':   'veo-3.1-fast',
    'veo-3.1-4k':     'veo-3.1-4k',
    'veo-3.1-relaxed':'veo-3.1-relaxed',
    // Kling — reliable ✅
    'kling-3.0':      'kling-3.0',
    'kling-3.0-o':    'kling-3.0',
};

/**
 * Submit video generation to Lao Zhang API.
 * Uses /v1/chat/completions — video models return download URLs in content.
 *
 * @returns {{ videoUrl: string, provider: 'laozhang', model: string }}
 */
export async function submitLaozhangVideoGeneration({
    model = 'veo-3.1-fast',
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    generateAudio = true,
    referenceImages = [],
}) {
    const apiKey = getApiKey();
    const lzModel = LZ_VIDEO_MODELS[model] || model;
    const timeoutMs = MODEL_TIMEOUTS[lzModel] || MODEL_TIMEOUTS.default;

    console.log(`🎬 [LaoZhang] Video generation: ${lzModel} | ${duration}s | ${aspectRatio} | timeout=${timeoutMs/1000}s | refs=${(referenceImages || []).length}`);
    console.log(`   📝 prompt: ${prompt?.substring(0, 120)}...`);
    if (imageUrl) console.log(`   🖼️  image: ${imageUrl.substring(0, 80)}...`);
    if (referenceImages?.length > 0) console.log(`   📸 referenceImages: ${referenceImages.length} attached`);

    // Extract native language if prompt is a Universal Director bilingual JSON
    let finalPromptText = prompt;
    try {
        if (prompt.trim().startsWith('[') && prompt.trim().endsWith(']')) {
            const parsed = JSON.parse(prompt);
            if (Array.isArray(parsed) && parsed.some(p => p.lang === 'zh')) {
                finalPromptText = parsed.find(p => p.lang === 'zh')?.prompt || prompt;
                console.log(`   🈯 Extracted native ZH prompt for Seedance (${finalPromptText.length} chars)`);
            }
        }
    } catch { /* normal string */ }

    // Sanitize prompt — context-aware + safety deity/character name bypass
    const imageCountInPayload = (imageUrl ? 1 : 0) + (referenceImages?.length || 0);
    const { prompt: sanitizedPrompt, warnings: sanitizerWarnings } = sanitizePromptForProvider(
        finalPromptText,
        'laozhang',
        imageCountInPayload
    );
    if (sanitizerWarnings.length > 0) {
        console.warn(`⚠️ [LaoZhang Sanitizer] ${sanitizerWarnings.join(' | ')}`);
    }
    finalPromptText = sanitizedPrompt;

    // Build message content for multimodal models
    // Seedance 2.0 and Veo often support multiple image inputs
    let messageContent;
    if ((imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) || referenceImages?.length > 0) {
        messageContent = [];
        if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('data:'))) {
            messageContent.push({ type: 'image_url', image_url: { url: imageUrl } });
        }
        if (referenceImages?.length > 0) {
            referenceImages.forEach(url => {
                if (url && (url.startsWith('http') || url.startsWith('data:'))) {
                    messageContent.push({ type: 'image_url', image_url: { url } });
                }
            });
        }
        messageContent.push({ type: 'text', text: finalPromptText });
    } else {
        messageContent = finalPromptText;
    }

    let response;
    try {
        response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, fetchOptions({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: lzModel,
                messages: [{ role: 'user', content: messageContent }],
            }),
            signal: AbortSignal.timeout(timeoutMs),
        }));
    } catch (fetchErr) {
        // AbortError = timeout
        if (fetchErr.name === 'AbortError' || fetchErr.name === 'TimeoutError') {
            throw new Error(`LaoZhang: ${lzModel} timed out after ${timeoutMs/1000}s — model may be overloaded`);
        }
        throw fetchErr;
    }

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Video failed (${response.status}): ${errText.substring(0, 400)}`);
        try {
            const errData = JSON.parse(errText);
            const errMsg = errData.error?.message || '';
            if (errData.error?.code === 'insufficient_user_quota') {
                throw new Error(`LaoZhang quota insufficient: ${errMsg}`);
            }
            if (errMsg.includes('无可用渠道') || response.status === 503) {
                throw new Error(`LaoZhang: ${lzModel} no billing channel (503). ${errMsg}`);
            }
            if (errMsg) throw new Error(`LaoZhang video failed (${response.status}): ${errMsg}`);
        } catch (parseErr) {
            if (parseErr.message.startsWith('LaoZhang')) throw parseErr;
        }
        throw new Error(`LaoZhang video failed (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract video URL — handles markdown links, direct URLs
    let videoUrl = '';

    // Method 1: Markdown [any text](url)
    const mdMatch = content.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) videoUrl = mdMatch[1];

    // Method 2: Direct URL with video extension
    if (!videoUrl) {
        const directMatch = content.match(/(https?:\/\/[^\s"']+\.(mp4|webm|mov))/i);
        if (directMatch) videoUrl = directMatch[1];
    }

    // Method 3: Any HTTPS URL
    if (!videoUrl) {
        const anyUrl = content.match(/(https?:\/\/[^\s"'<>]+)/);
        if (anyUrl) videoUrl = anyUrl[1];
    }

    if (!videoUrl) {
        // Log full raw response to help diagnose what the model returned
        console.error(`❌ [LaoZhang] No video URL in response for ${lzModel}`);
        console.error(`   Raw content (500 chars): ${content.substring(0, 500)}`);
        console.error(`   Full data: ${JSON.stringify(data).substring(0, 800)}`);
        throw new Error(`LaoZhang ${lzModel}: response received but no video URL found. Content: "${content.substring(0, 150)}"`);
    }

    console.log(`✅ [LaoZhang] Video generated via ${lzModel}: ${videoUrl.substring(0, 100)}`);
    console.log(`   📊 Tokens: ${data.usage?.total_tokens || '?'}`);

    return { videoUrl, provider: 'laozhang', model: lzModel, tokensUsed: data.usage };
}

export async function getLaozhangVideoStatus(requestId) {
    return { status: 'COMPLETED', progress: 100, videoUrl: '' };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — via /v1/images/generations (OpenAI compatible)
// ══════════════════════════════════════════════════════════════════════════════

// Per-model image generation timeouts (ms) — GPT Image 2 is significantly slower than Gemini Flash
const IMAGE_MODEL_TIMEOUTS = {
    'gpt-image-2':    180_000,   // OpenAI: ~60-120s typical, allow 180s
    'gpt-image-1':    120_000,
    default:           90_000,   // Gemini Flash / NanoBanana 2
};

function getImageTimeout(model) {
    return IMAGE_MODEL_TIMEOUTS[model] || IMAGE_MODEL_TIMEOUTS.default;
}

// ── Atlas Cloud Image Generation ─────────────────────────────────────────────
// For OpenAI models (gpt-image-2): uses /v1/images/generations with b64_json
// For Gemini models (gemini-3.1-flash-image-preview, nanobanana-2, etc.):
//   uses /v1/chat/completions which returns inline image data

const GEMINI_IMAGE_MODELS = new Set([
    'gemini-3.1-flash-image-preview', 'gemini-3-pro-image-preview',
    'gemini-2.5-flash-preview-05-20', 'gemini-flash', 'nanobanana-2', 'nanobanana-pro',
]);

async function _atlasImageGenerate(prompt, { model = 'gpt-image-2', size = '1024x1024' } = {}) {
    const atlasKey = getAtlasImageApiKey();
    if (!atlasKey) throw new Error('ATLASCLOUD_API_KEY not set');
    const timeoutMs = getImageTimeout(model);
    
    const arInstruction = size !== '1024x1024' ? `\n\n[CRITICAL REQUIREMENT: Generate this exact aspect ratio/size: ${size}]` : '';
    const finalPrompt = prompt + arInstruction;

    console.log(`🖼️  [Atlas] Image generation: ${model}, size=${size}, timeout=${timeoutMs/1000}s`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);

    // ── Gemini models: use /chat/completions (image output via chat) ──
    const isGeminiModel = GEMINI_IMAGE_MODELS.has(model) || model.startsWith('gemini-');
    
    if (isGeminiModel) {
        console.log(`🔄 [Atlas] Routing Gemini image model through /chat/completions`);
        const response = await fetch(`${ATLAS_IMAGE_BASE_URL}/chat/completions`, fetchOptions({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${atlasKey}` },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: [{ type: 'text', text: finalPrompt }] }],
                size,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        }));

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Atlas Gemini image failed (${response.status}): ${errText.substring(0, 300)}`);
        }

        const data = await response.json();
        let imageUrl = '';

        // Check for inline image parts (Gemini-style response)
        const parts = data.choices?.[0]?.message?.parts || [];
        for (const part of parts) {
            if (part.inline_data?.data && part.inline_data?.mime_type) {
                imageUrl = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
                break;
            }
        }

        // Fallback: check message content for image URLs or data URIs
        if (!imageUrl) {
            const content = data.choices?.[0]?.message?.content || '';
            const dataUriMatch = content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
            if (dataUriMatch) imageUrl = dataUriMatch[1];
            if (!imageUrl) { const httpsMatch = content.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp))/i); if (httpsMatch) imageUrl = httpsMatch[1]; }
            if (!imageUrl) { const rawDataUri = content.match(/(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)/); if (rawDataUri) imageUrl = rawDataUri[1]; }
        }

        if (!imageUrl) {
            const content = data.choices?.[0]?.message?.content || '';
            console.error(`❌ [Atlas Gemini] No image in response:`, content.substring(0, 500));
            throw new Error('Atlas Gemini chat/completions returned no image');
        }

        const finalUrl = await ensureS3Url(imageUrl, 'studio/atlas-gemini');
        console.log(`✅ [Atlas] Gemini image generated via ${model} → S3: ${(finalUrl || '').substring(0, 80)}`);
        return { imageUrl: finalUrl, model, provider: 'atlascloud' };
    }

    // ── OpenAI models (gpt-image-2, etc.): use /images/generations ──
    const response = await fetch(`${ATLAS_IMAGE_BASE_URL}/images/generations`, fetchOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${atlasKey}` },
        body: JSON.stringify({ model, prompt: finalPrompt, n: 1, size, response_format: 'b64_json' }),
        signal: AbortSignal.timeout(timeoutMs),
    }));

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Atlas image failed (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const imgData = data.data?.[0];
    const b64 = imgData?.b64_json || '';
    const imageUrl = imgData?.url || '';
    if (!b64 && !imageUrl) throw new Error('Atlas returned empty image response');

    const rawData = b64 ? `data:image/png;base64,${b64}` : imageUrl;
    const finalUrl = await ensureS3Url(rawData, 'studio/atlas-image');

    console.log(`✅ [Atlas] Image generated via ${model} (b64_json → S3): ${(finalUrl || '').substring(0, 80)}`);
    return { imageUrl: finalUrl, model, provider: 'atlascloud' };
}

// ── Atlas Cloud Image Generation for ALL models ──────────────────────────────
// Atlas Cloud is the primary and only proxy. No LaoZhang.
// Falls back to native Gemini/Vertex if Atlas fails.

export async function laozhangImageGenerate(prompt, { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const timeoutMs = getImageTimeout(model);
    console.log(`🖼️  [ImageGen] model=${model}, size=${size}, timeout=${timeoutMs/1000}s`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);

    // ── Strategy: Atlas Cloud is the ONLY proxy — no LaoZhang ──
    if (isAtlasImageAvailable()) {
        try {
            return await _atlasImageGenerate(prompt, { model, size });
        } catch (atlasErr) {
            console.warn(`⚠️ [Atlas Image] Failed: ${atlasErr.message}. Falling back to native Gemini/Vertex...`);
        }
    }

    // ── Native Gemini / Vertex fallback ──
    try {
        const { generateImageWithVertex } = await import('../../services/vertexImage.js');
        const credsVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        let credsExist = false;
        try {
            const { existsSync } = await import('fs');
            if (credsVar && existsSync(credsVar)) credsExist = true;
        } catch (e) {}
        const devKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
        if (!credsExist && !devKey) {
            throw new Error("No Gemini API key or GCP credentials configured.");
        }

        const arMap = {
            '1024x1024': '1:1', '1344x768': '16:9', '768x1344': '9:16',
            '896x1120': '4:5', '896x1184': '3:4', '1184x896': '4:3',
            '1248x832': '3:2', '832x1248': '2:3'
        };
        const aspectRatio = arMap[size] || '1:1';
        const activeModel = 'imagen-3.0-generate-002';
        const parts = [{ text: prompt }];

        const data = await generateImageWithVertex(parts, activeModel, 0.4, { aspectRatio, imageSize: '1K' });
        const resParts = data.candidates?.[0]?.content?.parts || [];
        let fallbackImageUrl = null;
        for (const part of resParts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                fallbackImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                break;
            }
        }
        if (!fallbackImageUrl) throw new Error('Vertex Imagen returned no image');

        const finalUrl = await ensureS3Url(fallbackImageUrl, 'studio/vertex-image');
        console.log(`✅ [Vertex-Fallback] Image generated via Imagen 3: ${finalUrl.substring(0, 80)}...`);
        return { imageUrl: finalUrl, model: activeModel, provider: 'vertex' };
    } catch (vxErr) {
        console.error(`❌ [ImageGen] All providers failed. Vertex: ${vxErr.message}`);
        throw new Error(`Image generation failed: All providers exhausted. ${vxErr.message}`);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GPT IMAGE 2 WITH REFERENCE IMAGES — via /v1/images/edits (multipart)
// gpt-image-2 uses /images/edits to accept a product image + prompt.
// Falls back to text-only laozhangImageGenerate if the ref image can't be fetched.
// ══════════════════════════════════════════════════════════════════════════════

export async function laozhangGptImageWithRefs(prompt, imageUrls = [], { model = 'gpt-image-2', size = '1344x768' } = {}) {
    const timeoutMs = getImageTimeout(model);

    if (!imageUrls || imageUrls.length === 0) {
        return laozhangImageGenerate(prompt, { model, size });
    }

    console.log(`🖼️  [GPT-Image-2+Refs] Fetching product ref images (${imageUrls.length} URLs)...`);

    // Fetch the best available reference image as a buffer
    let refBuffer = null;
    let refMimeType = 'image/png';
    for (const url of imageUrls) {
        if (!url) continue;
        if (url.startsWith('data:')) {
            try {
                const match = url.match(/^data:([^;]+);base64,(.+)$/);
                if (match) {
                    refMimeType = match[1];
                    refBuffer = Buffer.from(match[2], 'base64');
                    console.log(`   ✅ Parsed base64 data URI directly (${Math.round(refBuffer.length / 1024)}KB)`);
                    break;
                }
            } catch (e) {
                console.warn(`   ⚠️ Base64 parse error: ${e.message}`);
            }
            continue;
        }

        try {
            const r = await fetch(url, fetchOptions({
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
            }));
            if (r.ok) {
                const ct = r.headers.get('content-type') || 'image/jpeg';
                if (!ct.includes('text/html')) {
                    refBuffer = Buffer.from(await r.arrayBuffer());
                    refMimeType = ct.split(';')[0].trim();
                    console.log(`   ✅ Got ref image: ${url.substring(0, 80)} (${Math.round(refBuffer.length / 1024)}KB)`);
                    break;
                }
            } else {
                console.warn(`   ⚠️ Ref image fetch failed (${r.status}): ${url.substring(0, 80)}`);
            }
        } catch (e) {
            console.warn(`   ⚠️ Ref image error: ${e.message}`);
        }
    }

    if (!refBuffer) {
        console.warn(`   ⚠️ [GPT-Image-2+Refs] All ref fetches failed — falling back to Gemini multimodal with same ref URLs`);
        return laozhangMultimodalImageGenerate(prompt, imageUrls, { model: 'gemini-3.1-flash-image-preview', size });
    }

    // Build multipart/form-data for /images/edits
    const FormData = (await import('formdata-node')).FormData;
    const { Blob } = await import('node:buffer');
    const form = new FormData();
    const ext = refMimeType.includes('png') ? 'png' : refMimeType.includes('webp') ? 'webp' : 'jpg';
    form.set('image', new Blob([refBuffer], { type: refMimeType }), `product_ref.${ext}`);
    form.set('prompt', prompt);
    form.set('model', model);
    form.set('n', '1');
    form.set('size', size);
    form.set('response_format', 'b64_json');

    console.log(`🎨 [GPT-Image-2+Refs] Calling /images/edits — model=${model}, size=${size}, ref=${Math.round(refBuffer.length/1024)}KB`);

    // Use Atlas Cloud only for /images/edits (no LaoZhang)
    const providers = [];
    if (isAtlasImageAvailable()) providers.push({ name: 'Atlas', baseUrl: ATLAS_IMAGE_BASE_URL, key: getAtlasImageApiKey() });

    for (const prov of providers) {
        try {
            // Clone form for each attempt (form can only be consumed once)
            const attemptForm = new FormData();
            attemptForm.set('image', new Blob([refBuffer], { type: refMimeType }), `product_ref.${ext}`);
            attemptForm.set('prompt', prompt);
            attemptForm.set('model', model);
            attemptForm.set('n', '1');
            attemptForm.set('size', size);
            attemptForm.set('response_format', 'b64_json');

            console.log(`   🔄 [${prov.name}] Trying /images/edits...`);
            const editResponse = await fetch(`${prov.baseUrl}/images/edits`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${prov.key}` },
                body: attemptForm,
                signal: AbortSignal.timeout(timeoutMs),
            });

            if (!editResponse.ok) {
                const errText = await editResponse.text();
                console.warn(`   ⚠️ [${prov.name}] /images/edits HTTP ${editResponse.status}: ${errText.substring(0, 200)}`);
                continue; // Try next provider
            }

            const editData = await editResponse.json();
            const editImgData = editData.data?.[0];
            const editB64 = editImgData?.b64_json || '';
            const editRawUrl = editImgData?.url || '';
            if (!editB64 && !editRawUrl) {
                console.warn(`   ⚠️ [${prov.name}] /images/edits returned no image`);
                continue; // Try next provider
            }

            const editRaw = editB64 ? `data:image/png;base64,${editB64}` : editRawUrl;
            const editFinalUrl = await ensureS3Url(editRaw, `studio/${prov.name.toLowerCase()}-edit`);
            console.log(`✅ [${prov.name}] Image with product ref → S3: ${editFinalUrl.substring(0, 80)}...`);
            return { imageUrl: editFinalUrl, model, provider: prov.name.toLowerCase() === 'atlas' ? 'atlascloud' : 'laozhang' };
        } catch (e) {
            console.warn(`   ⚠️ [${prov.name}] /images/edits failed: ${e.message}`);
            continue; // Try next provider
        }
    }

    // All providers failed — fall back to Gemini multimodal
    console.warn(`   ⚠️ [GPT-Image-2+Refs] All /images/edits providers failed — falling back to Gemini multimodal`);
    return laozhangMultimodalImageGenerate(prompt, imageUrls, { model: 'gemini-3.1-flash-image-preview', size });
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTIMODAL IMAGE GENERATION — via /v1/chat/completions
// ══════════════════════════════════════════════════════════════════════════════

export async function laozhangMultimodalImageGenerate(prompt, imageUrls = [], { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    try {
        const timeoutMs = getImageTimeout(model);
        if (!imageUrls || imageUrls.length === 0) return laozhangImageGenerate(prompt, { model, size });

        // Use Atlas Cloud as the primary provider
        const atlasKey = getAtlasImageApiKey();
        const useAtlas = !!atlasKey;
        const baseUrl = useAtlas ? ATLAS_IMAGE_BASE_URL : LAOZHANG_BASE_URL;
        const apiKey = useAtlas ? atlasKey : getApiKey();
        const providerName = useAtlas ? 'Atlas' : 'LaoZhang';

        console.log(`🖼️  [${providerName}-Multimodal] Image gen: ${model}, ${imageUrls.length} ref URLs, size=${size}, timeout=${timeoutMs/1000}s`);
        console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);
        for (const url of imageUrls) console.log(`   🔗 ref: ${url.substring(0, 100)}...`);

        const contentParts = [];
        for (const url of imageUrls) {
            if (!url) continue;
            
            let finalUrl = url;
            // If it's an external URL, fetch it server-side to bypass CDN 403 blocks
            if (url.startsWith('http')) {
                try {
                    console.log(`📥 [${providerName}] Pre-fetching image URL: ${url.substring(0, 80)}...`);
                    const r = await fetch(url, fetchOptions({
                        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
                    }));
                    if (r.ok) {
                        const mimeType = r.headers.get('content-type') || 'image/jpeg';
                        if (!mimeType.includes('text/html')) {
                            const arr = await r.arrayBuffer();
                            finalUrl = `data:${mimeType};base64,${Buffer.from(arr).toString('base64')}`;
                        }
                    } else {
                        console.warn(`⚠️ [${providerName}] Pre-fetch failed (HTTP ${r.status}) for: ${url.substring(0,60)}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ [${providerName}] Pre-fetch error: ${e.message}`);
                }
            }
            
            if (finalUrl.startsWith('http') || finalUrl.startsWith('data:')) {
                contentParts.push({ type: 'image_url', image_url: { url: finalUrl } });
            }
        }
        const arInstruction = size !== '1024x1024' ? `\n\n[CRITICAL REQUIREMENT: Generate this exact aspect ratio/size: ${size}]` : '';
        contentParts.push({ type: 'text', text: prompt + arInstruction });

        const response = await fetch(`${baseUrl}/chat/completions`, fetchOptions({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: contentParts }], size }),
            signal: AbortSignal.timeout(timeoutMs),
            }));

        if (!response.ok) {
            const errText = await response.text();
            console.error(`❌ [${providerName}-Multimodal] Image failed (${response.status}):`, errText);
            throw new Error(`${providerName} multimodal image failed (${response.status}): ${errText}`);
        }

        const data = await response.json();
        let imageUrl = '';

        const parts = data.choices?.[0]?.message?.parts || [];
        for (const part of parts) {
            if (part.inline_data?.data && part.inline_data?.mime_type) {
                imageUrl = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
                break;
            }
        }

        if (!imageUrl) {
            const content = data.choices?.[0]?.message?.content || '';
            const dataUriMatch = content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
            if (dataUriMatch) imageUrl = dataUriMatch[1];
            if (!imageUrl) { const httpsMatch = content.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/); if (httpsMatch) imageUrl = httpsMatch[1]; }
            if (!imageUrl) { const directMatch = content.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp))/i); if (directMatch) imageUrl = directMatch[1]; }
            if (!imageUrl) { const rawDataUri = content.match(/(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)/); if (rawDataUri) imageUrl = rawDataUri[1]; }
        }

        if (!imageUrl) {
            const content = data.choices?.[0]?.message?.content || '';
            console.error(`❌ [${providerName}-Multimodal] No image in response:`, content.substring(0, 500));
            throw new Error(`${providerName} multimodal returned response but no image found`);
        }

        const isBase64 = imageUrl.startsWith('data:');
        
        // Auto-upload base64 to S3
        const finalUrl = await ensureS3Url(imageUrl, `studio/${providerName.toLowerCase()}-multimodal`);

        console.log(`✅ [${providerName}-Multimodal] Image generated with ${imageUrls.length} refs (${isBase64 ? 'base64' : 'URL'})${finalUrl !== imageUrl ? ' -> Uploaded to S3' : ''}: ${finalUrl.substring(0, 80)}...`);
        return { imageUrl: finalUrl, model, provider: useAtlas ? 'atlascloud' : 'laozhang' };
    } catch (err) {
        console.warn(`[LaoZhang-Multimodal] ⚠️ Generation failed: ${err.message}. Trying direct Gemini/Vertex fallback...`);
        try {
            const { generateImageWithVertex } = await import('../../services/vertexImage.js');
            // Check if key is available
            const credsVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            let credsExist = false;
            try {
                const { existsSync } = await import('fs');
                if (credsVar && existsSync(credsVar)) credsExist = true;
            } catch (e) {}
            const devKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
            if (!credsExist && !devKey) {
                throw new Error("No direct Gemini API key or GCP credentials configured.");
            }

            // Map size string (e.g. "1024x1024") to closest aspect ratio
            const arMap = {
                '1024x1024': '1:1', '1344x768': '16:9', '768x1344': '9:16', '896x1120': '4:5', '896x1184': '3:4', '1184x896': '4:3', '1248x832': '3:2', '832x1248': '2:3'
            };
            const aspectRatio = arMap[size] || '1:1';

            // Build content parts with reference images
            const parts = [];
            const { downloadBuffer } = await import('./storyboardFrames.js');
            for (const url of imageUrls) {
                if (!url) continue;
                if (url.startsWith('data:')) {
                    const match = url.match(/^data:([^;]+);base64,(.+)$/);
                    if (match) {
                        parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
                    }
                } else if (url.startsWith('http')) {
                    try {
                        const { buffer, mimeType } = await downloadBuffer(url);
                        parts.push({ inlineData: { mimeType, data: buffer.toString('base64') } });
                    } catch (e) {
                        console.warn(`[LaoZhang-Multimodal Fallback] Failed to pre-download image: ${e.message}`);
                    }
                }
            }

            // Text prompt last (Gemini requirement)
            parts.push({ text: prompt });

            const activeModel = 'gemini-3.1-flash-image-preview'; // flash preview supports reference images
            const data = await generateImageWithVertex(parts, activeModel, 0.4, { aspectRatio });
            
            const resParts = data.candidates?.[0]?.content?.parts || [];
            let fallbackImageUrl = null;
            for (const part of resParts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    fallbackImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    break;
                }
            }

            if (!fallbackImageUrl) throw new Error('Gemini fallback returned no image in response');
            
            const finalUrl = await ensureS3Url(fallbackImageUrl, 'studio/gemini-fallback');
            console.log(`✅ [LaoZhang-Multimodal] Fallback succeeded (S3): ${finalUrl.substring(0, 80)}...`);
            return { imageUrl: finalUrl, model: activeModel, provider: 'gemini' };
        } catch (fallbackErr) {
            console.error(`[LaoZhang-Multimodal] ❌ Direct Gemini fallback failed: ${fallbackErr.message}`);
            throw err; // throw original LaoZhang error
        }
    }
}

export default {
    isLaozhangAvailable,
    submitLaozhangVideoGeneration,
    getLaozhangVideoStatus,
    laozhangImageGenerate,
    laozhangGptImageWithRefs,
    laozhangMultimodalImageGenerate,
};
