/**
 * Lao Zhang API Client — Unified AI Gateway for cheaper image/video generation
 * 
 * OpenAI-compatible API format — uses same endpoints as OpenAI but at 50-80% lower cost.
 * Base URL: https://api.laozhang.ai/v1
 * 
 * Supported models:
 *   Image: NanoBanana 2 (gemini-3.1-flash-image), Imagen 4, GPT-4o Image, Grok Imagine
 *   Video: Seedance 2.0, Sora 2, Kling (async task-based)
 *   Text:  All major LLMs (Claude, GPT, Gemini, Grok, Deepseek)
 * 
 * Usage: Primary for video generation (50% savings), fallback for images
 */

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
    return !!(process.env.LAOZHANG_API_KEY && process.env.LAOZHANG_BASE_URL);
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — Async task-based API (Seedance 2.0, Kling, Sora)
// ══════════════════════════════════════════════════════════════════════════════

// Lao Zhang video model IDs
const LZ_VIDEO_MODELS = {
    'seedance-2.0': 'seedance-2.0',       // ByteDance Seedance 2.0 Pro
    'seedance-1.0': 'seedance-1.0',       // ByteDance Seedance 1.0 Lite
    'kling-3.0': 'kling-video',            // Kuaishou Kling 3.0
    'sora-2': 'sora_video2',               // OpenAI Sora 2
};

/**
 * Submit video generation to Lao Zhang API
 * Uses OpenAI-compatible /v1/videos/generations format
 * 
 * @returns {{ requestId: string, provider: 'laozhang' }}
 */
export async function submitLaozhangVideoGeneration({
    model = 'seedance-2.0',
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    generateAudio = true,
}) {
    const apiKey = getApiKey();
    const lzModel = LZ_VIDEO_MODELS[model] || model;

    const payload = {
        model: lzModel,
        prompt,
        duration,
        aspect_ratio: aspectRatio,
    };

    // Image-to-video support
    if (imageUrl) {
        payload.image = { url: imageUrl };
    }

    // Audio generation (Seedance 2.0 supports native audio)
    if (generateAudio && (model === 'seedance-2.0' || model === 'sora-2')) {
        payload.generate_audio = true;
    }

    console.log(`🎬 [LaoZhang] Submitting video: ${lzModel} (${duration}s, ${aspectRatio})`);
    console.log(`   📝 prompt: ${prompt?.substring(0, 120)}...`);
    console.log(`   📸 image: ${imageUrl ? imageUrl.substring(0, 80) + '...' : 'NONE (text-to-video)'}`);

    const response = await fetch(`${LAOZHANG_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Video submission failed (${response.status}):`, errText);
        throw new Error(`LaoZhang video submission failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const requestId = data.request_id || data.id || data.task_id;
    console.log(`✅ [LaoZhang] Video queued: requestId=${requestId}`);

    return {
        requestId,
        provider: 'laozhang',
    };
}

/**
 * Poll Lao Zhang video generation status
 * @returns {{ status, progress, videoUrl }}
 */
export async function getLaozhangVideoStatus(requestId) {
    const apiKey = getApiKey();

    const response = await fetch(`${LAOZHANG_BASE_URL}/videos/${requestId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        console.error(`❌ [LaoZhang] Status check failed: ${response.status}`);
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    const data = await response.json();
    console.log(`📊 [LaoZhang] Status for ${requestId}: ${data.status}`);

    // Completed
    if (data.status === 'done' || data.status === 'completed' || data.status === 'COMPLETED') {
        const videoUrl = data.video?.url || data.video_url || data.output?.url || data.url || '';
        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl,
            thumbnailUrl: data.thumbnail?.url || '',
            audioUrl: data.audio?.url || '',
            duration: data.video?.duration || data.duration || 0,
        };
    }

    // Failed
    if (data.status === 'failed' || data.status === 'error' || data.status === 'FAILED') {
        return {
            status: 'FAILED',
            progress: 0,
            error: data.error?.message || data.error || 'LaoZhang video generation failed',
        };
    }

    // In progress
    return {
        status: 'IN_PROGRESS',
        progress: data.progress || 40,
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — Fallback for when Google Direct is overloaded
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an image via Lao Zhang (OpenAI images/generations format)
 * Supports NanoBanana 2 (gemini-3.1-flash-image), Imagen 4, GPT-4o image
 * 
 * @returns {{ imageUrl: string, model: string }}
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
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Image generation failed (${response.status}):`, errText);
        throw new Error(`LaoZhang image generation failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const imageUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json || '';

    if (!imageUrl) {
        throw new Error('LaoZhang returned empty image response');
    }

    // If b64_json is returned, convert to data URI
    const finalUrl = imageUrl.startsWith('http')
        ? imageUrl
        : `data:image/png;base64,${imageUrl}`;

    console.log(`✅ [LaoZhang] Image generated via ${model}`);

    return {
        imageUrl: finalUrl,
        model,
        provider: 'laozhang',
    };
}

export default {
    isLaozhangAvailable,
    submitLaozhangVideoGeneration,
    getLaozhangVideoStatus,
    laozhangImageGenerate,
};
