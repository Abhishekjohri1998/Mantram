import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import config from "../../config/env.js";
import { ensureS3Url } from '../../utils/s3.js';
import { fetchOptions } from '../../utils/network.js';

const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';

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

export async function laozhangImageGenerate(prompt, { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();
    const timeoutMs = getImageTimeout(model);
    console.log(`🖼️  [LaoZhang] Image generation: ${model}, size=${size}, timeout=${timeoutMs/1000}s`);

    // LaoZhang's OpenAI-compatible /generations endpoint silently drops non-square sizes that standard OpenAI image models wouldn't accept.
    // To ensure NanoBanana 2 (Gemini-3.1) respects custom boundaries like 1080x1350 or 100x900, we must force it in prompt.
    const arInstruction = size !== '1024x1024' ? `\n\n[CRITICAL REQUIREMENT: Generate this exact aspect ratio/size: ${size}]` : '';
    const finalPrompt = prompt + arInstruction;

    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);

    let response;
    let tryB64 = true;
    
    try {
        response = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, fetchOptions({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            // Use b64_json (not url) — LaoZhang CDN URLs expire within seconds.
            // ensureS3Url can't reliably mirror them. b64_json gives raw data → direct S3 upload.
            body: JSON.stringify({ model, prompt: finalPrompt, n: 1, size, response_format: 'b64_json' }),
            signal: AbortSignal.timeout(timeoutMs),
        }));
        if (!response.ok) {
            tryB64 = false;
        }
    } catch (err) {
        tryB64 = false;
    }

    if (!tryB64) {
        console.log(`⚠️  [LaoZhang] b64_json image generation failed or unsupported, retrying with response_format='url'...`);
        response = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, fetchOptions({
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({ model, prompt: finalPrompt, n: 1, size, response_format: 'url' }),
            signal: AbortSignal.timeout(timeoutMs),
        }));
    }

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Image failed (${response.status}):`, errText);
        throw new Error(`LaoZhang image failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const imgData = data.data?.[0];
    const b64 = imgData?.b64_json || '';
    const imageUrl = imgData?.url || ''; // fallback if API ignores b64_json request
    if (!b64 && !imageUrl) throw new Error('LaoZhang returned empty image response');
    // Prefer base64 (stable) over URL (ephemeral CDN)
    const rawData = b64 ? `data:image/png;base64,${b64}` : imageUrl;
    
    // Upload to S3 — base64 → direct upload (no CDN expiry risk)
    const finalUrl = await ensureS3Url(rawData, 'studio/laozhang');
    
    if (finalUrl.includes('laozhang.ai/fileSystem/')) {
        throw new Error('LaoZhang image hosting system returned an error. File upload and download system is not enabled.');
    }

    console.log(`✅ [LaoZhang] Image generated via ${model} (b64_json → S3): ${(finalUrl || '').substring(0, 80)}`);
    return { imageUrl: finalUrl, model, provider: 'laozhang' };
}

// ══════════════════════════════════════════════════════════════════════════════
// GPT IMAGE 2 WITH REFERENCE IMAGES — via /v1/images/edits (multipart)
// gpt-image-2 uses /images/edits to accept a product image + prompt.
// Falls back to text-only laozhangImageGenerate if the ref image can't be fetched.
// ══════════════════════════════════════════════════════════════════════════════

export async function laozhangGptImageWithRefs(prompt, imageUrls = [], { model = 'gpt-image-2', size = '1344x768' } = {}) {
    const apiKey = getApiKey();
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

    let editResponse;
    try {
        editResponse = await fetch(`${LAOZHANG_BASE_URL}/images/edits`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}` },
            body: form,
            signal: AbortSignal.timeout(timeoutMs),
        });
    } catch (e) {
        console.warn(`   ⚠️ /images/edits failed: ${e.message} — falling back to text-only`);
        return laozhangImageGenerate(prompt, { model, size });
    }

    if (!editResponse.ok) {
        const errText = await editResponse.text();
        console.warn(`   ⚠️ /images/edits HTTP ${editResponse.status}: ${errText.substring(0, 200)} — falling back to Gemini multimodal with same ref images`);
        return laozhangMultimodalImageGenerate(prompt, imageUrls, { model: 'gemini-3.1-flash-image-preview', size });
    }

    const editData = await editResponse.json();
    const editImgData = editData.data?.[0];
    const editB64 = editImgData?.b64_json || '';
    const editRawUrl = editImgData?.url || '';
    if (!editB64 && !editRawUrl) {
        console.warn(`   ⚠️ /images/edits returned no image — falling back to text-only`);
        return laozhangImageGenerate(prompt, { model, size });
    }

    const editRaw = editB64 ? `data:image/png;base64,${editB64}` : editRawUrl;
    const editFinalUrl = await ensureS3Url(editRaw, 'studio/laozhang-edit');
    console.log(`✅ [GPT-Image-2+Refs] Image with product ref → S3: ${editFinalUrl.substring(0, 80)}...`);
    return { imageUrl: editFinalUrl, model, provider: 'laozhang' };
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTIMODAL IMAGE GENERATION — via /v1/chat/completions
// ══════════════════════════════════════════════════════════════════════════════

export async function laozhangMultimodalImageGenerate(prompt, imageUrls = [], { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();
    const timeoutMs = getImageTimeout(model);
    if (!imageUrls || imageUrls.length === 0) return laozhangImageGenerate(prompt, { model, size });

    console.log(`🖼️  [LaoZhang-Multimodal] Image gen: ${model}, ${imageUrls.length} ref URLs, size=${size}, timeout=${timeoutMs/1000}s`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);
    for (const url of imageUrls) console.log(`   🔗 ref: ${url.substring(0, 100)}...`);

    const contentParts = [];
    for (const url of imageUrls) {
        if (!url) continue;
        
        let finalUrl = url;
        // If it's an external URL, fetch it server-side to bypass CDN 403 blocks that hit LaoZhang's servers directly
        if (url.startsWith('http')) {
            try {
                console.log(`📥 [LaoZhang] Pre-fetching image URL to avoid CDN blocks: ${url.substring(0, 80)}...`);
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
                    console.warn(`⚠️ [LaoZhang] Pre-fetch failed (HTTP ${r.status}) for: ${url.substring(0,60)}`);
                }
            } catch (e) {
                console.warn(`⚠️ [LaoZhang] Pre-fetch error: ${e.message}`);
            }
        }
        
        if (finalUrl.startsWith('http') || finalUrl.startsWith('data:')) {
            contentParts.push({ type: 'image_url', image_url: { url: finalUrl } });
        }
    }
    const arInstruction = size !== '1024x1024' ? `\n\n[CRITICAL REQUIREMENT: Generate this exact aspect ratio/size: ${size}]` : '';
    contentParts.push({ type: 'text', text: prompt + arInstruction });

    const response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, fetchOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: contentParts }], size }),
        signal: AbortSignal.timeout(timeoutMs),
        }));

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang-Multimodal] Image failed (${response.status}):`, errText);
        throw new Error(`LaoZhang multimodal image failed (${response.status}): ${errText}`);
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
        console.error(`❌ [LaoZhang-Multimodal] No image in response:`, content.substring(0, 500));
        throw new Error('LaoZhang multimodal returned response but no image found');
    }

    const isBase64 = imageUrl.startsWith('data:');
    
    // Auto-upload base64 to S3
    const finalUrl = await ensureS3Url(imageUrl, 'studio/laozhang-multimodal');
    
    if (finalUrl.includes('laozhang.ai/fileSystem/')) {
        throw new Error('LaoZhang image hosting system returned an error. File upload and download system is not enabled.');
    }

    console.log(`✅ [LaoZhang-Multimodal] Image generated with ${imageUrls.length} refs (${isBase64 ? 'base64' : 'URL'})${finalUrl !== imageUrl ? ' -> Uploaded to S3' : ''}: ${finalUrl.substring(0, 80)}...`);
    return { imageUrl: finalUrl, model, provider: 'laozhang' };
}

export default {
    isLaozhangAvailable,
    submitLaozhangVideoGeneration,
    getLaozhangVideoStatus,
    laozhangImageGenerate,
    laozhangGptImageWithRefs,
    laozhangMultimodalImageGenerate,
};
