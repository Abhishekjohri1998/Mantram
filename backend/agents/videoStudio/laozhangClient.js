

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
}) {
    const apiKey = getApiKey();
    const lzModel = LZ_VIDEO_MODELS[model] || model;
    const timeoutMs = MODEL_TIMEOUTS[lzModel] || MODEL_TIMEOUTS.default;

    let messageContent;
    if (imageUrl && imageUrl.startsWith('http')) {
        messageContent = [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
        ];
    } else {
        messageContent = prompt;
    }

    console.log(`🎬 [LaoZhang] Video generation: ${lzModel} | ${duration}s | ${aspectRatio} | timeout=${timeoutMs/1000}s`);
    console.log(`   📝 prompt: ${prompt?.substring(0, 120)}...`);
    if (imageUrl) console.log(`   🖼️  image: ${imageUrl.substring(0, 80)}...`);

    let response;
    try {
        response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, {
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
        });
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

export async function laozhangImageGenerate(prompt, { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();
    console.log(`🖼️  [LaoZhang] Image generation: ${model}, size=${size}`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);

    const response = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, n: 1, size, response_format: 'url' }),
        signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Image failed (${response.status}):`, errText);
        throw new Error(`LaoZhang image failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const imgData = data.data?.[0];
    const imageUrl = imgData?.url || '';
    const b64 = imgData?.b64_json || '';
    if (!imageUrl && !b64) throw new Error('LaoZhang returned empty image response');
    const finalUrl = imageUrl || `data:image/png;base64,${b64}`;
    console.log(`✅ [LaoZhang] Image generated via ${model} (${imageUrl ? 'URL' : 'base64'})`);
    return { imageUrl: finalUrl, model, provider: 'laozhang' };
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTIMODAL IMAGE GENERATION — via /v1/chat/completions
// ══════════════════════════════════════════════════════════════════════════════

export async function laozhangMultimodalImageGenerate(prompt, imageUrls = [], { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();
    if (!imageUrls || imageUrls.length === 0) return laozhangImageGenerate(prompt, { model, size });

    console.log(`🖼️  [LaoZhang-Multimodal] Image gen: ${model}, ${imageUrls.length} ref URLs, size=${size}`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);
    for (const url of imageUrls) console.log(`   🔗 ref: ${url.substring(0, 100)}...`);

    const contentParts = [];
    for (const url of imageUrls) {
        if (url && url.startsWith('http')) contentParts.push({ type: 'image_url', image_url: { url } });
    }
    const arInstruction = size !== '1024x1024' ? `Generate this image at ${size} resolution. ` : '';
    contentParts.push({ type: 'text', text: arInstruction + prompt });

    const response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: contentParts }] }),
        signal: AbortSignal.timeout(90000),
    });

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
    console.log(`✅ [LaoZhang-Multimodal] Image generated with ${imageUrls.length} refs (${isBase64 ? 'base64' : 'URL'}): ${imageUrl.substring(0, 80)}...`);
    return { imageUrl, model, provider: 'laozhang' };
}

export default {
    isLaozhangAvailable,
    submitLaozhangVideoGeneration,
    getLaozhangVideoStatus,
    laozhangImageGenerate,
    laozhangMultimodalImageGenerate,
};
