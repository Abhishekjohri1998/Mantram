/**
 * Video Generation Client — Multi-provider SDK wrapper + cost calculator
 * 
 * Supported models (verified endpoints as of March 2026):
 *   - Kling 3.0 (v3) — 3-15s, multi-prompt, native audio, voice IDs       [fal.ai]
 *   - Google Veo 3 / 3.1 — 5-8s, extend-video, native audio              [fal.ai]
 *   - Google Veo 3.1 Fast — 5-8s, faster + cheaper variant                [kie.ai]
 *   - Seedance 1.0 Lite — 5-10s, fast & affordable                        [fal.ai]
 *   - Seedance 2.0 Pro — 5-15s, native audio, camera control, cinematic   [kie.ai]
 * 
 * Provider routing:
 *   - fal.ai: Kling 3.0, Veo 3.1, Seedance 1.0 (queue-based async)
 *   - kie.ai: Veo 3.1 Fast (taskId-based async)
 *   - PiAPI:  Seedance 2.0 (task-based async)
 *   - xAI:   Grok Imagine (native REST)
 */

import config from '../../config/env.js';
import { submitKieVideoGeneration } from './kieClient.js';
import { submitPiApiVideoGeneration } from './piApiClient.js';

const FAL_BASE_URL = 'https://queue.fal.run';
const GROK_BASE_URL = 'https://api.x.ai/v1';

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
    // Google Veo 3.1 Fast — cheaper, faster variant
    'veo-3.1-fast': {
        textToVideo: 'fal-ai/veo3/fast',
        imageToVideo: 'fal-ai/veo3/fast/image-to-video',
        extendVideo: 'fal-ai/veo3.1/fast/extend-video',
    },
    // Seedance 1.0 Lite
    'seedance-1.0': {
        textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video',
        imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video',
    },
    // Seedance 2.0 Pro — native audio, camera control, cinematic
    'seedance-2.0': {
        textToVideo: 'fal-ai/bytedance/seedance/v2/pro/text-to-video',
        imageToVideo: 'fal-ai/bytedance/seedance/v2/pro/image-to-video',
    },
};

// ── Model availability ──
const MODEL_AVAILABLE = {
    'kling-3.0': true,
    'veo-3.1': true,
    'veo-3.1-fast': true,
    'seedance-1.0': true,
    'seedance-2.0': true,
    'grok-imagine': true,
};

// ── Cost table (USD per second of video) ──
const COST_PER_SECOND = {
    'kling-3.0': { fast: 0.07, quality: 0.12 },
    'veo-3.1': { fast: 0.15, quality: 0.40 },
    'veo-3.1-fast': { fast: 0.08, quality: 0.15 },
    'seedance-1.0': { fast: 0.05, quality: 0.08 },
    'seedance-2.0': { fast: 0.08, quality: 0.15 },
    'grok-imagine': { fast: 0.08, quality: 0.08 },
};

// ── Duration limits per model ──
const DURATION_LIMITS = {
    'kling-3.0': { min: 3, max: 15, supported: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    'veo-3.1': { min: 5, max: 8, supported: [5, 6, 7, 8] },
    'veo-3.1-fast': { min: 5, max: 8, supported: [5, 6, 7, 8] },
    'seedance-1.0': { min: 5, max: 10, supported: [5, 10] },
    'seedance-2.0': { min: 5, max: 15, supported: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
    'grok-imagine': { min: 1, max: 15, supported: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
};

// ── Resolution config ──
const RESOLUTION_MAP = {
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
};

// ── Full Model Capabilities Matrix (exported for frontend) ──
export const MODEL_CAPABILITIES = {
    'kling-3.0': {
        id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', provider: 'fal',
        description: 'Best motion & physics — multi-shot, native audio, voice IDs',
        bestFor: 'Product demos, action shots, storyboard videos',
        duration: { min: 3, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'],
        aspectRatios: ['16:9', '9:16', '1:1'],
        features: {
            firstFrame: true, lastFrame: true, referenceImages: false,
            extendVideo: false, multiShot: true, nativeAudio: true,
            voiceIds: true, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['kling-3.0'],
        recommended: true,
    },
    'veo-3.1': {
        id: 'veo-3.1', name: 'Google Veo 3.1', icon: '🎬', provider: 'fal',
        description: 'Cinematic quality with native audio + extend-video',
        bestFor: 'Premium brand films, cinematic ads',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 148 },
        resolutions: ['720p', '1080p', '4k'],
        aspectRatios: ['16:9', '9:16'],
        features: {
            firstFrame: true, lastFrame: true, referenceImages: true,
            extendVideo: true, multiShot: false, nativeAudio: true,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 3,
        costPerSecond: COST_PER_SECOND['veo-3.1'],
        recommended: false,
    },
    'veo-3.1-fast': {
        id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', provider: 'kie',
        description: 'Faster & cheaper Veo 3.1 — great for prototyping',
        bestFor: 'Quick iterations, content series, social video',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 60 },
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: true,
            extendVideo: true, multiShot: false, nativeAudio: true,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 3,
        costPerSecond: COST_PER_SECOND['veo-3.1-fast'],
        recommended: false,
    },
    'seedance-1.0': {
        id: 'seedance-1.0', name: 'Seedance 1.0 Lite', icon: '🌱', provider: 'fal',
        description: 'Fast & affordable video generation',
        bestFor: 'Quick prototypes, social content, UGC',
        duration: { min: 5, max: 10, native: 10, step: 5 },
        resolutions: ['480p', '720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
        features: {
            firstFrame: true, lastFrame: true, referenceImages: false,
            extendVideo: true, multiShot: false, nativeAudio: false,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['seedance-1.0'],
        recommended: false,
    },
    'seedance-2.0': {
        id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', provider: 'kie',
        description: 'Cinematic video with native audio, camera control & physics',
        bestFor: 'Premium ads, product showcases, brand films',
        duration: { min: 4, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p'],
        aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: true,
            extendVideo: true, multiShot: true, nativeAudio: true,
            voiceIds: false, cameraControl: true,
        },
        maxReferenceImages: 3,
        costPerSecond: COST_PER_SECOND['seedance-2.0'],
        recommended: false,
    },
    'grok-imagine': {
        id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', provider: 'grok',
        description: 'xAI native video — fast, affordable, 1-15s',
        bestFor: 'Social reels, creative experiments, quick turnaround',
        duration: { min: 1, max: 15, native: 15, step: 1 },
        resolutions: ['480p', '720p'],
        aspectRatios: ['16:9', '9:16', '1:1'],
        features: {
            firstFrame: true, lastFrame: false, referenceImages: false,
            extendVideo: false, multiShot: false, nativeAudio: false,
            voiceIds: false, cameraControl: false,
        },
        maxReferenceImages: 0,
        costPerSecond: COST_PER_SECOND['grok-imagine'],
        recommended: false,
    },
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

    if (model === 'veo-3.1' || model === 'veo-3.1-fast') {
        return {
            prompt,
            aspect_ratio: '16:9',
            resolution: resolution === '720p' ? '720p' : '1080p',
            generate_audio: generateAudio !== false,
            auto_fix: true,
        };
    }

    if (model === 'seedance-1.0') {
        // Seedance 1.0 only supports 5 or 10
        const seedDur = dur >= 8 ? '10' : '5';
        return {
            prompt,
            duration: seedDur,
            aspect_ratio: '16:9',
            seed: Math.floor(Math.random() * 999999),
        };
    }

    if (model === 'seedance-2.0') {
        return {
            prompt,
            duration: String(dur),
            aspect_ratio: '16:9',
            generate_audio: generateAudio !== false,
            seed: Math.floor(Math.random() * 999999),
        };
    }

    throw new Error(`Unknown fal.ai model: ${model}`);
}

// ── Grok API key helper ──
function getGrokApiKey() {
    const key = config.grok?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) throw new Error('GROK_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Submit video generation to Grok Imagine API (xAI native, not fal.ai)
 * Returns { requestId, provider: 'grok' }
 */
async function submitGrokVideoGeneration({ prompt, imageUrl, duration, resolution, aspectRatio }) {
    const apiKey = getGrokApiKey();
    const dur = Math.min(Math.max(duration || 5, 1), 15);
    const res = resolution === '480p' ? '480p' : '720p'; // Grok only supports 480p/720p

    const payload = {
        model: 'grok-imagine-video',
        prompt,
        duration: dur,
        aspect_ratio: aspectRatio || '16:9',
        resolution: res,
    };

    // Image-to-video
    if (imageUrl) {
        payload.image_url = imageUrl;
    }

    console.log(`🎬 Submitting to Grok Imagine: grok-imagine-video (${dur}s, ${res})`);

    const response = await fetch(`${GROK_BASE_URL}/videos/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ Grok Imagine error (${response.status}):`, errText);
        throw new Error(`Grok video submission failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    console.log(`✅ Grok Imagine queued: requestId=${data.request_id}`);

    return {
        requestId: data.request_id,
        provider: 'grok',
    };
}

/**
 * Poll Grok Imagine video generation status
 * Returns { status, progress, videoUrl }
 */
export async function getGrokGenerationStatus(requestId) {
    const apiKey = getGrokApiKey();

    const response = await fetch(`${GROK_BASE_URL}/videos/${requestId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!response.ok) {
        console.error(`❌ Grok status check failed: ${response.status}`);
        return { status: 'FAILED', progress: 0, error: `Status check failed: ${response.status}` };
    }

    const data = await response.json();
    console.log(`📊 Grok Imagine status for ${requestId}: ${data.status}`);

    if (data.status === 'done') {
        return {
            status: 'COMPLETED',
            progress: 100,
            videoUrl: data.video?.url || '',
            thumbnailUrl: '',
            audioUrl: '',
            duration: data.video?.duration || 0,
        };
    }

    if (data.status === 'expired') {
        return {
            status: 'FAILED',
            progress: 0,
            error: 'Grok video generation request expired. Try again.',
        };
    }

    // pending
    return {
        status: 'IN_PROGRESS',
        progress: 40,
    };
}

/**
 * Submit video generation — routes to the correct provider
 * Returns { requestId, endpoint, statusUrl, resultUrl, provider }
 */
export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio, aspectRatio, referenceImages }) {
    if (!MODEL_AVAILABLE[model]) {
        throw new Error(`Model '${model}' is not available. Use kling-3.0, veo-3.1, veo-3.1-fast, seedance-1.0, seedance-2.0, or grok-imagine.`);
    }

    // ── Grok Imagine: use native xAI API instead of fal.ai ──
    if (model === 'grok-imagine') {
        const result = await submitGrokVideoGeneration({ prompt, imageUrl, duration, resolution });
        return {
            requestId: result.requestId,
            endpoint: 'grok-imagine-video',
            statusUrl: null,
            resultUrl: null,
            provider: 'grok',
        };
    }

    // ── kie.ai models: Veo 3.1 Fast ──
    if (model === 'veo-3.1-fast') {
        const result = await submitKieVideoGeneration({ model, prompt, imageUrl, duration, aspectRatio: '16:9' });
        return {
            requestId: result.taskId,
            endpoint: `kie-${model}`,
            statusUrl: null,
            resultUrl: null,
            provider: 'kie',
        };
    }

    // ── PiAPI: Seedance 2.0 ──
    if (model === 'seedance-2.0') {
        const result = await submitPiApiVideoGeneration({ prompt, imageUrl, duration, aspectRatio: aspectRatio || '16:9', generateAudio, referenceImages: referenceImages || [], qualityMode: mode || 'fast' });
        return {
            requestId: result.taskId,
            endpoint: `piapi-seedance-2.0`,
            statusUrl: null,
            resultUrl: null,
            provider: 'piapi',
        };
    }

    // ── fal.ai models (Kling, Veo 3.1 standard, Seedance 1.0) ──
    const apiKey = getApiKey();

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
        // Don't immediately fail — could be a transient error
        return { status: 'IN_PROGRESS', progress: 30 };
    }

    const data = await response.json();
    console.log(`📊 fal.ai status for ${requestId}: ${data.status}`);

    // ── COMPLETED ──
    if (data.status === 'COMPLETED') {
        return await fetchFalResult(apiKey, resultUrl);
    }

    // ── FAILED ──
    if (data.status === 'FAILED') {
        // Sometimes fal says FAILED but video is still accessible — try fetching
        try {
            const tryResult = await fetchFalResult(apiKey, resultUrl);
            if (tryResult.videoUrl) {
                console.log(`⚠️ fal.ai said FAILED but video URL exists — treating as COMPLETED`);
                return tryResult;
            }
        } catch (e) { /* ignore */ }

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

        return { status: 'FAILED', progress: 0, error: errorMsg };
    }

    return {
        status: data.status || 'IN_PROGRESS',
        progress: data.status === 'IN_QUEUE' ? 10 : 50,
    };
}

/**
 * Fetch fal.ai result and extract video URL from various response formats
 */
async function fetchFalResult(apiKey, resultUrl) {
    const resultRes = await fetch(resultUrl, {
        headers: { 'Authorization': `Key ${apiKey}` },
    });
    const result = await resultRes.json();

    console.log(`📦 fal.ai result keys:`, Object.keys(result));
    console.log(`📦 fal.ai result snippet:`, JSON.stringify(result).substring(0, 800));

    // Comprehensive video URL extraction — covers ALL known fal.ai response formats
    const videoUrl =
        // Standard: { video: { url: "..." } }
        result.video?.url
        // Kling/Veo: { video: { file_url: "..." } }
        || result.video?.file_url
        // Direct URL field
        || result.video_url
        // Nested data: { data: { video_url: "..." } }
        || result.data?.video_url
        || result.data?.video?.url
        // Output pattern: { output: { url: "..." } }
        || result.output?.url
        || result.output?.video_url
        || result.output?.video?.url
        // Array of videos: { videos: [{ url: "..." }] }
        || result.videos?.[0]?.url
        || result.videos?.[0]?.file_url
        // Result array: { result: [{ url: "..." }] }
        || result.result?.[0]?.url
        || result.result?.url
        || result.result?.video_url
        // URL directly on root
        || result.url
        || '';

    const thumbnailUrl = result.thumbnail?.url || result.thumbnailUrl || result.thumbnail_url || '';
    const audioUrl = result.audio?.url || result.audioUrl || result.audio_url || '';

    console.log(`✅ Video URL extracted: ${videoUrl ? videoUrl.substring(0, 100) + '...' : 'NONE FOUND'}`);

    return {
        status: 'COMPLETED',
        progress: 100,
        videoUrl,
        thumbnailUrl,
        audioUrl,
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
            id: 'grok-imagine',
            name: 'Grok Imagine',
            description: 'xAI native video — fast, affordable, 1-15s, text & image-to-video',
            bestFor: 'Social reels, creative experiments, quick turnaround',
            costPerSecond: COST_PER_SECOND['grok-imagine'],
            duration: DURATION_LIMITS['grok-imagine'],
            features: ['text-to-video', 'image-to-video', 'native-audio', '1-15s', 'fast'],
            available: !!(config.grok?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY),
            recommended: false,
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
            id: 'veo-3.1-fast',
            name: 'Google Veo 3.1 Fast',
            description: 'Faster & cheaper Veo 3.1 — great for prototyping & high-volume',
            bestFor: 'Quick iterations, content series, social video',
            costPerSecond: COST_PER_SECOND['veo-3.1-fast'],
            duration: DURATION_LIMITS['veo-3.1-fast'],
            features: ['native-audio', 'fast', '5-8s', 'cost-efficient'],
            available: !!(config.kie?.apiKey || process.env.KIE_API_KEY),
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
        {
            id: 'seedance-2.0',
            name: 'Seedance 2.0 Pro',
            description: 'Cinematic video with native audio, camera control & real-world physics',
            bestFor: 'Premium ads, product showcases, brand films',
            costPerSecond: COST_PER_SECOND['seedance-2.0'],
            duration: DURATION_LIMITS['seedance-2.0'],
            features: ['native-audio', 'camera-control', 'cinematic', 'image-to-video', '4-15s'],
            available: !!(config.kie?.apiKey || process.env.KIE_API_KEY),
            recommended: false,
        },
    ];
}
