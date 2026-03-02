/**
 * fal.ai Client — Video generation SDK wrapper + cost calculator
 * 
 * Supported models (verified endpoints as of March 2026):
 *   - Kling 3.0 (v3) — 3-15s, multi-prompt, native audio, voice IDs
 *   - Google Veo 3 / 3.1 — 5-8s, extend-video, native audio
 *   - Seedance 1.0 Lite — 5-10s, fast & affordable
 * 
 * Uses fal.ai REST API via fetch (queue-based async).
 */

import config from '../../config/env.js';

const FAL_BASE_URL = 'https://queue.fal.run';

// ── Model Endpoint Map (verified from fal.ai docs) ──
const MODEL_ENDPOINTS = {
    // Kling 3.0 — Standard tier
    'kling-3.0': {
        textToVideo: 'fal-ai/kling-video/v3/standard/text-to-video',
        imageToVideo: 'fal-ai/kling-video/v3/standard/image-to-video',
    },
    // Google Veo 3 / 3.1
    'veo-3.1': {
        textToVideo: 'fal-ai/veo3',
        imageToVideo: 'fal-ai/veo3/image-to-video',
        extendVideo: 'fal-ai/veo3.1/extend-video',
    },
    // Seedance 1.0 Lite (Seedance 2.0 endpoint not yet stable)
    'seedance-1.0': {
        textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
        imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    },
};

// ── Model availability ──
const MODEL_AVAILABLE = {
    'kling-3.0': true,
    'veo-3.1': true,
    'seedance-1.0': true,
};

// ── Cost table (USD per second of video) ──
const COST_PER_SECOND = {
    'kling-3.0': { fast: 0.07, quality: 0.12 },
    'veo-3.1': { fast: 0.15, quality: 0.40 },
    'seedance-1.0': { fast: 0.05, quality: 0.08 },
};

// ── Duration limits per model ──
const DURATION_LIMITS = {
    'kling-3.0': { min: 3, max: 15, supported: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    'veo-3.1': { min: 5, max: 8, supported: [5, 6, 7, 8] },
    'seedance-1.0': { min: 5, max: 10, supported: [5, 10] },
};

// ── Resolution config ──
const RESOLUTION_MAP = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
};

/**
 * Estimate cost before generation
 */
export function estimateCost(model = 'kling-3.0', durationSeconds = 5, resolution = '1080p', mode = 'fast') {
    const costPerSec = COST_PER_SECOND[model]?.[mode] || 0.07;
    const resMult = resolution === '720p' ? 0.7 : 1.0;
    const usd = Number((costPerSec * durationSeconds * resMult).toFixed(2));
    const inr = Number((usd * 85).toFixed(0));
    const credits = Math.ceil(usd * 30); // 1 credit ≈ $0.033

    return {
        usd, inr, credits,
        model, resolution, mode, durationSeconds,
        maxDuration: DURATION_LIMITS[model]?.max || 15,
    };
}

/**
 * Get the fal.ai API key
 */
function getApiKey() {
    const key = config.fal?.apiKey || process.env.FAL_API_KEY;
    if (!key) throw new Error('FAL_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Build model-specific payload
 */
function buildPayload(model, { prompt, imageUrl, duration, resolution, mode, shots, generateAudio }) {
    const dur = Math.min(
        Math.max(duration || 5, DURATION_LIMITS[model]?.min || 3),
        DURATION_LIMITS[model]?.max || 15
    );

    if (model === 'kling-3.0') {
        // Kling 3.0 — supports multi_prompt for shot-by-shot
        const payload = {
            aspect_ratio: '16:9',
            negative_prompt: 'blur, distort, and low quality',
            cfg_scale: 0.5,
            generate_audio: generateAudio !== false, // Default true
        };

        // Multi-prompt: if we have shots, use per-shot prompts
        if (shots && shots.length > 1) {
            // IMPORTANT: When using multi_prompt, do NOT set top-level duration or prompt
            payload.multi_prompt = shots.map(shot => ({
                prompt: shot.visual || shot.prompt || prompt,
                duration: String(Math.min(Math.max(shot.duration || 5, 3), 15)),
            }));
            payload.shot_type = 'customize';
        } else {
            // Single prompt mode
            payload.prompt = prompt;
            payload.duration = String(dur);
        }

        return payload;
    }

    if (model === 'veo-3.1') {
        return {
            prompt,
            aspect_ratio: '16:9',
            resolution: resolution === '720p' ? '720p' : '1080p',
            generate_audio: generateAudio !== false,
            auto_fix: true,
        };
    }

    if (model === 'seedance-1.0') {
        // Seedance only supports 5 or 10
        const seedDur = dur >= 8 ? '10' : '5';
        return {
            prompt,
            duration: seedDur,
            aspect_ratio: '16:9',
            seed: Math.floor(Math.random() * 999999),
        };
    }

    throw new Error(`Unknown model: ${model}`);
}

/**
 * Submit video generation to fal.ai queue
 * Returns { requestId, endpoint } for polling
 */
export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio }) {
    const apiKey = getApiKey();

    if (!MODEL_AVAILABLE[model]) {
        throw new Error(`Model '${model}' is not available. Use kling-3.0, veo-3.1, or seedance-1.0.`);
    }

    const endpoints = MODEL_ENDPOINTS[model];
    if (!endpoints) throw new Error(`Unknown video model: ${model}`);

    // Choose text-to-video vs image-to-video
    const endpoint = imageUrl ? endpoints.imageToVideo : endpoints.textToVideo;

    // Build payload
    const payload = buildPayload(model, { prompt, imageUrl, duration, resolution, mode, shots, generateAudio });

    // Add image URL for image-to-video
    if (imageUrl) {
        payload.image_url = imageUrl;
    }

    console.log(`🎬 Submitting to fal.ai: ${endpoint} (model: ${model})`);
    console.log(`   Payload:`, JSON.stringify(payload, null, 2).substring(0, 500));

    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ fal.ai error (${response.status}):`, errText);
        throw new Error(`fal.ai submission failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    console.log(`✅ fal.ai queued: requestId=${data.request_id}`);
    console.log(`   status_url: ${data.status_url}`);
    console.log(`   response_url: ${data.response_url}`);

    return {
        requestId: data.request_id,
        endpoint, // Store for reference
        statusUrl: data.status_url,   // Use fal.ai's EXACT status URL
        resultUrl: data.response_url, // Use fal.ai's EXACT result URL
    };
}

/**
 * Extend a video (Veo 3.1 only)
 * Takes an existing video URL and extends it with a new prompt
 */
export async function extendVideo({ videoUrl, prompt, duration = 7 }) {
    const apiKey = getApiKey();
    const endpoint = MODEL_ENDPOINTS['veo-3.1'].extendVideo;

    console.log(`🎬 Extending video via: ${endpoint}`);

    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Key ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            video_url: videoUrl,
            prompt,
            duration: String(duration),
            generate_audio: true,
            auto_fix: true,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`fal.ai extend-video failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
        requestId: data.request_id,
        endpoint,
    };
}

/**
 * Check generation status
 * Returns { status: 'IN_QUEUE'|'IN_PROGRESS'|'COMPLETED'|'FAILED', progress, videoUrl }
 */
export async function getGenerationStatus(requestId, statusUrl, resultUrl) {
    const apiKey = getApiKey();

    // Use the exact URLs from fal.ai submission response
    if (!statusUrl) {
        console.warn(`⚠️ No statusUrl provided, constructing fallback`);
        statusUrl = `${FAL_BASE_URL}/fal-ai/kling-video/requests/${requestId}/status`;
    }
    if (!resultUrl) {
        resultUrl = statusUrl.replace('/status', '');
    }

    const response = await fetch(statusUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
    });

    if (!response.ok) {
        console.error(`❌ fal.ai status check failed: ${response.status}`);
        return { status: 'FAILED', progress: 0, error: `Status check failed: ${response.status}` };
    }

    const data = await response.json();
    console.log(`📊 fal.ai status for ${requestId}: ${data.status}`);

    // Map fal.ai status to our format
    if (data.status === 'COMPLETED') {
        // Fetch the actual result using fal.ai's response URL
        const resultRes = await fetch(resultUrl, {
            headers: { 'Authorization': `Key ${apiKey}` },
        });
        const result = await resultRes.json();

        // Extract video URL from result (format varies by model)
        const videoUrl = result.video?.url
            || result.data?.video_url
            || result.output?.url
            || result.video?.file_url
            || '';

        console.log(`✅ Video generation complete: ${videoUrl ? 'URL received' : 'No URL found'}`);

        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl,
            thumbnailUrl: result.thumbnail?.url || '',
            audioUrl: result.audio?.url || '',
        };
    }

    if (data.status === 'FAILED') {
        // Try to get the error details
        let errorMsg = 'Video generation failed on fal.ai';
        try {
            const resultRes = await fetch(resultUrl, {
                headers: { 'Authorization': `Key ${apiKey}` },
            });
            const result = await resultRes.json();
            errorMsg = result.error || result.detail || result.message || errorMsg;
            console.error(`❌ fal.ai generation failed:`, JSON.stringify(result).substring(0, 500));
        } catch (e) {
            console.error(`❌ Could not fetch error details:`, e.message);
        }

        return {
            status: 'FAILED',
            progress: 0,
            error: errorMsg,
        };
    }

    return {
        status: data.status || 'IN_PROGRESS',
        progress: data.status === 'IN_QUEUE' ? 10 : 50,
    };
}

/**
 * Get supported models info (for frontend)
 */
export function getModelsInfo() {
    return [
        {
            id: 'kling-3.0',
            name: 'Kling 3.0',
            description: 'Best motion & physics — multi-shot, native audio, voice IDs',
            bestFor: 'Product demos, action shots, storyboard videos',
            costPerSecond: COST_PER_SECOND['kling-3.0'],
            duration: DURATION_LIMITS['kling-3.0'],
            features: ['multi-shot', 'native-audio', 'voice-ids', 'image-to-video', '3-15s'],
            available: true,
            recommended: true,
        },
        {
            id: 'veo-3.1',
            name: 'Google Veo 3.1',
            description: 'Cinematic quality with native audio + extend-video',
            bestFor: 'Premium brand films, cinematic ads',
            costPerSecond: COST_PER_SECOND['veo-3.1'],
            duration: DURATION_LIMITS['veo-3.1'],
            features: ['native-audio', 'cinematic', 'extend-video', '5-8s'],
            available: true,
            recommended: false,
        },
        {
            id: 'seedance-1.0',
            name: 'Seedance 1.0 Lite',
            description: 'Fast & affordable video generation',
            bestFor: 'Quick prototypes, social content, UGC',
            costPerSecond: COST_PER_SECOND['seedance-1.0'],
            duration: DURATION_LIMITS['seedance-1.0'],
            features: ['fast', 'affordable', 'image-to-video', '5-10s'],
            available: true,
            recommended: false,
        },
    ];
}
