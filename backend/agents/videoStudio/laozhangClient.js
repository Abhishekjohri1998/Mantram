/**
 * Lao Zhang API Client — Unified AI Gateway
 * 
 * CONFIRMED via live testing (March 2026):
 *   Video: Uses /v1/chat/completions — returns video URL in markdown format
 *   Image: Uses /v1/images/generations — returns b64_json
 *   Models endpoint: /v1/models (432 models available)
 * 
 * Available VIDEO models (confirmed working March 30, 2026):
 *   - veo-3.1, veo-3.1-fast ✅ CONFIRMED WORKING
 *   - kling-3.0 ✅ CONFIRMED WORKING
 *   - sora_video2, sora-2, sora-2-character ✅ CONFIRMED WORKING
 *   - seedance-2.0 ⚠️ INTERMITTENT — billing channel issues, may 503
 * 
 *   NOT available on LZ:
 *   - seedance-1.0 ❌ 503 "no available channel"
 * 
 * Available IMAGE models (confirmed):
 *   - gemini-3.1-flash-image-preview ✅ tested
 *   - flux-kontext-pro, flux-kontext-max
 * 
 * Response format: [download video](https://r2cdn.copilotbase.com/r2cdn2/xxx.mp4)
 * 
 * API Base: https://api.laozhang.ai/v1
 */

import fetch from 'node-fetch';

const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';

function getApiKey() {
    const key = process.env.LAOZHANG_API_KEY;
    if (!key) throw new Error('LAOZHANG_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Check if Lao Zhang is available/configured
 */
export function isLaozhangAvailable() {
    return !!process.env.LAOZHANG_API_KEY;
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — via /v1/chat/completions (synchronous, returns URL)
// 
// Key discovery: Lao Zhang video uses the chat completions endpoint.
// The model determines video generation. Response contains a markdown
// download link: [download video](https://...mp4)
// ══════════════════════════════════════════════════════════════════════════════

// Model mapping: our internal IDs → Lao Zhang model IDs
const LZ_VIDEO_MODELS = {
    // Seedance (ByteDance) — INTERMITTENT availability, billing channel needed
    'seedance-2.0':   'seedance-2.0',
    'seedance-2':     'seedance-2',
    'seedance-2-pro': 'seedance-2-pro',
    // NOTE: seedance-1.0 removed — confirmed 503 "no available channel" on LZ
    // Sora 2 variants (confirmed working)
    'sora-2':         'sora_video2',           // 10s portrait ~$0.15
    'sora-2-15s':     'sora_video2-15s',       // 15s portrait ~$0.15
    'sora-2-land':    'sora_video2-landscape',  // 10s landscape
    'sora-2-land-15': 'sora_video2-landscape-15s', // 15s landscape
    'sora-2-pro':     'sora-2',                // Pro quality
    // Veo 3.1 variants (confirmed working)
    'veo-3.1':        'veo-3.1',               // Standard
    'veo-3.1-fast':   'veo-3.1-fast',          // Faster, cheaper
    'veo-3.1-4k':     'veo-3.1-4k',           // 4K resolution
    'veo-3.1-relaxed': 'veo-3.1-relaxed',      // Cheapest, queue-based
    // Kling (Kuaishou) — confirmed working
    'kling-3.0':      'kling-3.0',             // Kling 3.0 Standard
};

/**
 * Submit video generation to Lao Zhang API
 * Uses /v1/chat/completions — video models return download URLs in content
 * 
 * @returns {{ videoUrl: string, provider: 'laozhang', model: string }}
 */
export async function submitLaozhangVideoGeneration({
    model = 'sora-2',
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    generateAudio = true,
}) {
    const apiKey = getApiKey();
    const lzModel = LZ_VIDEO_MODELS[model] || model;

    // Build user message content — use multimodal format for image-to-video
    let messageContent;
    if (imageUrl && imageUrl.startsWith('http')) {
        // Multimodal: send image URL + text prompt
        messageContent = [
            { type: 'image_url', image_url: { url: imageUrl } },
            { type: 'text', text: prompt },
        ];
    } else {
        // Text-only
        messageContent = prompt;
    }

    console.log(`🎬 [LaoZhang] Video generation: ${lzModel} | ${duration}s | ${aspectRatio}`);
    console.log(`   📝 prompt: ${prompt?.substring(0, 120)}...`);
    if (imageUrl) console.log(`   🖼️  image: ${imageUrl.substring(0, 80)}...`);

    const response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: lzModel,
            messages: [
                { role: 'user', content: messageContent },
            ],
        }),
        signal: AbortSignal.timeout(300000), // 5 min timeout — video gen can be slow
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Video generation failed (${response.status}):`, errText);

        // Parse structured error
        try {
            const errData = JSON.parse(errText);
            const errMsg = errData.error?.message || '';

            // Quota insufficient
            if (errData.error?.code === 'insufficient_user_quota') {
                throw new Error(`LaoZhang quota insufficient — need more credits. ${errMsg}`);
            }

            // No available channel (billing channel not activated for this model)
            if (errMsg.includes('无可用渠道') || response.status === 503) {
                throw new Error(`LaoZhang: Model ${lzModel} not available (no billing channel). ${errMsg}`);
            }
        } catch (parseErr) {
            if (parseErr.message.includes('LaoZhang')) throw parseErr; // Re-throw our errors
        }

        throw new Error(`LaoZhang video failed (${response.status}): ${errText.substring(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract video URL from markdown — handles multiple formats:
    // [download video](https://...mp4)
    // [download file](https://...)  
    // [下载视频](https://...)
    // Also handle direct URLs
    let videoUrl = '';

    // Method 1: Markdown link [any text](url)
    const mdMatch = content.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    if (mdMatch) {
        videoUrl = mdMatch[1];
    }

    // Method 2: Direct URL ending in video extension
    if (!videoUrl) {
        const directMatch = content.match(/(https?:\/\/[^\s"']+\.(mp4|webm|mov))/i);
        if (directMatch) videoUrl = directMatch[1];
    }

    // Method 3: Any HTTPS URL in the response
    if (!videoUrl) {
        const anyUrl = content.match(/(https?:\/\/[^\s"'<>]+)/);
        if (anyUrl) videoUrl = anyUrl[1];
    }

    if (!videoUrl) {
        console.error(`❌ [LaoZhang] No video URL found in response:`, content.substring(0, 500));
        throw new Error('LaoZhang returned response but no video URL found');
    }

    console.log(`✅ [LaoZhang] Video generated: ${videoUrl.substring(0, 100)}`);
    console.log(`   📊 Tokens: ${data.usage?.total_tokens || '?'} | Model: ${lzModel}`);

    return {
        videoUrl,
        provider: 'laozhang',
        model: lzModel,
        tokensUsed: data.usage,
    };
}

/**
 * Poll Lao Zhang video generation status
 * NOTE: Lao Zhang video gen is SYNCHRONOUS via chat/completions.
 * This function is kept for compatibility but should rarely be called.
 * The video URL is returned directly from submitLaozhangVideoGeneration.
 */
export async function getLaozhangVideoStatus(requestId) {
    return {
        status: 'COMPLETED',
        progress: 100,
        videoUrl: '', // URL was already extracted during submission
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — via /v1/images/generations (OpenAI compatible)
// Confirmed: returns b64_json format
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an image via Lao Zhang
 * Confirmed models: gemini-3.1-flash-image-preview, gpt-image-1, seedream-5-0-260128
 * 
 * @returns {{ imageUrl: string, model: string, provider: string }}
 */
export async function laozhangImageGenerate(prompt, { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();

    console.log(`🖼️  [LaoZhang] Image generation: ${model}, size=${size}`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);

    const response = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            prompt,
            n: 1,
            size,
            response_format: 'url', // Prefer URL over base64 for efficiency
        }),
        signal: AbortSignal.timeout(90000), // 90s — Gemini image models via LZ can be slow
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

    if (!imageUrl && !b64) {
        throw new Error('LaoZhang returned empty image response');
    }

    // b64_json is returned (confirmed via testing) — convert to data URI
    const finalUrl = imageUrl || `data:image/png;base64,${b64}`;

    console.log(`✅ [LaoZhang] Image generated via ${model} (${imageUrl ? 'URL' : 'base64'})`);

    return {
        imageUrl: finalUrl,
        model,
        provider: 'laozhang',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// MULTIMODAL IMAGE GENERATION — via /v1/chat/completions (supports ref images)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an image via Lao Zhang with reference images (S3 URLs)
 * Uses /v1/chat/completions with Gemini image models
 */
export async function laozhangMultimodalImageGenerate(prompt, imageUrls = [], { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();

    // If no reference images, delegate to simpler /images/generations endpoint
    if (!imageUrls || imageUrls.length === 0) {
        return laozhangImageGenerate(prompt, { model, size });
    }

    console.log(`🖼️  [LaoZhang-Multimodal] Image gen: ${model}, ${imageUrls.length} ref URLs, size=${size}`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);
    for (const url of imageUrls) {
        console.log(`   🔗 ref: ${url.substring(0, 100)}...`);
    }

    // Build multimodal content parts: S3 image URLs + text prompt
    const contentParts = [];

    for (const url of imageUrls) {
        if (url && url.startsWith('http')) {
            contentParts.push({
                type: 'image_url',
                image_url: { url },
            });
        }
    }

    // Add size/AR instruction to prompt
    const arInstruction = size !== '1024x1024' ? `Generate this image at ${size} resolution. ` : '';
    contentParts.push({
        type: 'text',
        text: arInstruction + prompt,
    });

    const response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'user',
                    content: contentParts,
                },
            ],
        }),
        signal: AbortSignal.timeout(90000),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang-Multimodal] Image failed (${response.status}):`, errText);
        throw new Error(`LaoZhang multimodal image failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    
    let imageUrl = '';
    
    // Method 1: Check for inline_data parts (Gemini structured response)
    const parts = data.choices?.[0]?.message?.parts || [];
    for (const part of parts) {
        if (part.inline_data?.data && part.inline_data?.mime_type) {
            imageUrl = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
            break;
        }
    }
    
    // Method 2: Parse content string
    if (!imageUrl) {
        const content = data.choices?.[0]?.message?.content || '';
        
        // 2a: Markdown with data URI: ![...](data:image/...)
        const dataUriMatch = content.match(/!\[.*?\]\((data:image\/[^)]+)\)/);
        if (dataUriMatch) {
            imageUrl = dataUriMatch[1];
        }
        
        // 2b: Markdown with https URL: ![...](https://...)
        if (!imageUrl) {
            const httpsMatch = content.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
            if (httpsMatch) imageUrl = httpsMatch[1];
        }
        
        // 2c: Direct URL in text
        if (!imageUrl) {
            const directMatch = content.match(/(https?:\/\/[^\s"']+\.(png|jpg|jpeg|webp))/i);
            if (directMatch) imageUrl = directMatch[1];
        }
        
        // 2d: Raw base64 data URI in text (not in markdown)
        if (!imageUrl) {
            const rawDataUri = content.match(/(data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+)/);
            if (rawDataUri) imageUrl = rawDataUri[1];
        }
    }

    if (!imageUrl) {
        const content = data.choices?.[0]?.message?.content || '';
        console.error(`❌ [LaoZhang-Multimodal] No image in response:`, content.substring(0, 500));
        throw new Error('LaoZhang multimodal returned response but no image found');
    }

    const isBase64 = imageUrl.startsWith('data:');
    console.log(`✅ [LaoZhang-Multimodal] Image generated with ${imageUrls.length} refs (${isBase64 ? 'base64' : 'URL'}): ${imageUrl.substring(0, 80)}...`);

    return {
        imageUrl,
        model,
        provider: 'laozhang',
    };
}

export default {
    isLaozhangAvailable,
    submitLaozhangVideoGeneration,
    getLaozhangVideoStatus,
    laozhangImageGenerate,
    laozhangMultimodalImageGenerate,
};
