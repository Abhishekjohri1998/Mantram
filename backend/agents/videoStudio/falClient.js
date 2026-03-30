/**
 * Video Generation Client — Multi-provider SDK wrapper + cost calculator
 */

import config from '../../config/env.js';
import { submitKieVideoGeneration } from './kieClient.js';
import { submitPiApiVideoGeneration } from './piApiClient.js';
import { ensureS3Url } from '../../utils/s3.js';
import { isLaozhangAvailable, submitLaozhangVideoGeneration } from './laozhangClient.js';

const FAL_BASE_URL = 'https://queue.fal.run';
const GROK_BASE_URL = 'https://api.x.ai/v1';

const MODEL_ENDPOINTS = {
    'kling-3.0': { textToVideo: 'fal-ai/kling-video/v3/standard/text-to-video', imageToVideo: 'fal-ai/kling-video/v3/standard/image-to-video' },
    'veo-3.1': { textToVideo: 'fal-ai/veo3', imageToVideo: 'fal-ai/veo3/image-to-video', extendVideo: 'fal-ai/veo3.1/extend-video' },
    'veo-3.1-fast': { textToVideo: 'fal-ai/veo3/fast', imageToVideo: 'fal-ai/veo3/fast/image-to-video', extendVideo: 'fal-ai/veo3.1/fast/extend-video' },
    'seedance-1.0': { textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video' },
    'seedance-2.0': { textToVideo: 'fal-ai/bytedance/seedance/v2/pro/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v2/pro/image-to-video' },
    'hunyuan': { textToVideo: 'fal-ai/hunyuan-video/video-to-video', imageToVideo: 'fal-ai/hunyuan-video/image-to-video' },
};

const MODEL_AVAILABLE = {
    'kling-3.0': true, 'veo-3.1': true, 'veo-3.1-fast': true,
    'seedance-1.0': true, 'seedance-2.0': true, 'grok-imagine': true,
    'hunyuan': true, 'sora-2': true,
};

export const COST_PER_SECOND = {
    'kling-3.0': { fast: 0.07, quality: 0.12 },
    'veo-3.1': { fast: 0.10, quality: 0.25 },
    'veo-3.1-fast': { fast: 0.06, quality: 0.10 },
    'seedance-1.0': { fast: 0.05, quality: 0.08 },
    'seedance-2.0': { fast: 0.05, quality: 0.10 },
    'grok-imagine': { fast: 0.08, quality: 0.08 },
    'hunyuan': { fast: 0.03, quality: 0.05 },
    'sora-2': { fast: 0.10, quality: 0.15 },
};

const DURATION_LIMITS = {
    'kling-3.0': { min: 3, max: 15 },
    'veo-3.1': { min: 5, max: 8 },
    'veo-3.1-fast': { min: 5, max: 8 },
    'seedance-1.0': { min: 5, max: 10 },
    'seedance-2.0': { min: 5, max: 15 },
    'grok-imagine': { min: 1, max: 15 },
    'hunyuan': { min: 3, max: 10 },
    'sora-2': { min: 5, max: 15 },
};

export const MODEL_CAPABILITIES = {
    'kling-3.0': {
        id: 'kling-3.0', name: 'Kling 3.0', icon: '🎥', provider: 'laozhang',
        description: 'Best motion & physics — multi-shot, native audio, voice IDs',
        bestFor: 'Product demos, action shots, storyboard videos',
        duration: { min: 3, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: true, referenceImages: false, extendVideo: false, multiShot: true, nativeAudio: true, voiceIds: true, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['kling-3.0'], recommended: true,
    },
    'veo-3.1': {
        id: 'veo-3.1', name: 'Google Veo 3.1', icon: '🎬', provider: 'fal',
        description: 'Cinematic quality with native audio + extend-video',
        bestFor: 'Premium brand films, cinematic ads',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 148 },
        resolutions: ['720p', '1080p', '4k'], aspectRatios: ['16:9', '9:16'],
        features: { firstFrame: true, lastFrame: true, referenceImages: true, extendVideo: true, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['veo-3.1'], recommended: false,
    },
    'veo-3.1-fast': {
        id: 'veo-3.1-fast', name: 'Veo 3.1 Fast', icon: '⚡', provider: 'kie',
        description: 'Faster & cheaper Veo 3.1 — great for prototyping',
        bestFor: 'Quick iterations, content series, social video',
        duration: { min: 4, max: 8, native: 8, step: 2, extendChunk: 7, maxExtended: 60 },
        resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['veo-3.1-fast'], recommended: false,
    },
    'seedance-2.0': {
        id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', provider: 'laozhang',
        description: 'Cinematic video with native audio, camera control & physics',
        bestFor: 'Premium ads, product showcases, brand films',
        duration: { min: 4, max: 15, native: 15, step: 1 },
        resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
        features: { firstFrame: true, lastFrame: false, referenceImages: true, extendVideo: true, multiShot: true, nativeAudio: true, voiceIds: false, cameraControl: true },
        maxReferenceImages: 3, costPerSecond: COST_PER_SECOND['seedance-2.0'], recommended: false,
    },
    'grok-imagine': {
        id: 'grok-imagine', name: 'Grok Imagine', icon: '🤖', provider: 'grok',
        description: 'xAI native video — fast, affordable, 1-15s, image-to-video',
        bestFor: 'Social reels, creative experiments, quick turnaround',
        duration: { min: 1, max: 15, native: 15, step: 1 },
        resolutions: ['480p', '720p'], aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
        features: { firstFrame: true, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['grok-imagine'], recommended: false,
    },
    'hunyuan': {
        id: 'hunyuan', name: 'HunyuanVideo', icon: '🎨', provider: 'fal',
        description: 'Tencent draft-tier — cheapest model, great for fast iterations',
        bestFor: 'Quick drafts, prototyping, budget-friendly iterations',
        duration: { min: 3, max: 10, native: 10, step: 1 },
        resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: true, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: false, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['hunyuan'], recommended: false,
    },
    'sora-2': {
        id: 'sora-2', name: 'Sora 2', icon: '🎞️', provider: 'laozhang',
        description: 'OpenAI Sora 2 — cinematic storytelling, world-model understanding',
        bestFor: 'Cinematic ads, narrative storytelling, creative experiments',
        duration: { min: 5, max: 15, native: 15, step: 5 },
        resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1'],
        features: { firstFrame: false, lastFrame: false, referenceImages: false, extendVideo: false, multiShot: false, nativeAudio: true, voiceIds: false, cameraControl: false },
        maxReferenceImages: 0, costPerSecond: COST_PER_SECOND['sora-2'], recommended: false,
    },
};

export function estimateCost(model = 'kling-3.0', durationSeconds = 5, resolution = '1080p', mode = 'fast') {
    const costPerSec = COST_PER_SECOND[model]?.[mode] || 0.07;
    const resMult = resolution === '720p' ? 0.7 : 1.0;
    const usd = Number((costPerSec * durationSeconds * resMult).toFixed(2));
    const inr = Number((usd * 85).toFixed(0));
    const credits = Math.max(Math.ceil(usd * 70), 5);
    return { usd, inr, credits, model, resolution, mode, durationSeconds, maxDuration: DURATION_LIMITS[model]?.max || 15 };
}

function getApiKey() {
    const key = config.fal?.apiKey || process.env.FAL_API_KEY;
    if (!key) throw new Error('FAL_API_KEY not configured.');
    return key;
}

function getGrokApiKey() {
    const key = config.grok?.apiKey || process.env.GROK_API_KEY || process.env.XAI_API_KEY;
    if (!key) throw new Error('GROK_API_KEY not configured.');
    return key;
}

function buildPayload(model, { prompt, imageUrl, duration, resolution, mode, shots, generateAudio }) {
    const dur = Math.min(Math.max(duration || 5, DURATION_LIMITS[model]?.min || 3), DURATION_LIMITS[model]?.max || 15);
    if (model === 'kling-3.0') {
        const payload = { aspect_ratio: '16:9', negative_prompt: 'blur, distort, and low quality', cfg_scale: 0.5, generate_audio: generateAudio !== false };
        if (shots && shots.length > 1) {
            payload.multi_prompt = shots.map(s => ({ prompt: s.visual || s.prompt || prompt, duration: String(Math.min(Math.max(s.duration || 5, 3), 15)) }));
            payload.shot_type = 'customize';
        } else { payload.prompt = prompt; payload.duration = String(dur); }
        return payload;
    }
    if (model === 'veo-3.1' || model === 'veo-3.1-fast') return { prompt, aspect_ratio: '16:9', resolution: resolution === '720p' ? '720p' : '1080p', generate_audio: generateAudio !== false, auto_fix: true };
    if (model === 'seedance-1.0') return { prompt, duration: dur >= 8 ? '10' : '5', aspect_ratio: '16:9', seed: Math.floor(Math.random() * 999999) };
    if (model === 'seedance-2.0') return { prompt, duration: String(dur), aspect_ratio: '16:9', generate_audio: generateAudio !== false, seed: Math.floor(Math.random() * 999999) };
    if (model === 'hunyuan') return { prompt, video_length: dur, seed: Math.floor(Math.random() * 999999), resolution: resolution === '1080p' ? '1080p' : '720p' };
    throw new Error(`Unknown fal.ai model: ${model}`);
}

// ── Cascade for seedance-2.0 on LaoZhang ──────────────────────────────────
// Priority: seedance-2.0 → veo-3.1-fast (fast & reliable)
// NOTE: sora_video2 removed from cascade — confirmed hangs >5min in production
async function tryLaozhangSeedance({ prompt, imageUrl, duration, aspectRatio, generateAudio }) {
    // Attempt 1: seedance-2.0 on LaoZhang
    try {
        const result = await submitLaozhangVideoGeneration({
            model: 'seedance-2.0', prompt, imageUrl,
            duration: duration || 5, aspectRatio: aspectRatio || '16:9',
            generateAudio: generateAudio !== false,
        });
        if (result?.videoUrl) {
            console.log(`✅ [LaoZhang] seedance-2.0 done`);
            return result.videoUrl;
        }
    } catch (e) {
        console.warn(`⚠️ [LaoZhang] seedance-2.0 failed (${e.message?.substring(0, 120)}) — cascading to veo-3.1-fast`);
    }

    // Attempt 2: veo-3.1-fast as fallback (confirmed reliable on LZ, ~30-60s)
    console.log(`🔁 [LaoZhang] Cascade seedance-2.0 → veo-3.1-fast...`);
    try {
        const result = await submitLaozhangVideoGeneration({
            model: 'veo-3.1-fast', prompt, imageUrl: null, // veo doesn't support imageUrl same way
            duration: Math.min(duration || 5, 8), aspectRatio: aspectRatio || '16:9',
            generateAudio: generateAudio !== false,
        });
        if (result?.videoUrl) {
            console.log(`✅ [LaoZhang] veo-3.1-fast cascade done`);
            return result.videoUrl;
        }
    } catch (e) {
        console.warn(`⚠️ [LaoZhang] veo-3.1-fast cascade failed: ${e.message?.substring(0, 120)}`);
    }

    return null;
}

export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio, aspectRatio, referenceImages }) {
    if (!MODEL_AVAILABLE[model]) throw new Error(`Model '${model}' is not available.`);

    const [s3ImageUrl, ...s3ReferenceImages] = await Promise.all([
        ensureS3Url(imageUrl, 'video-studio/generations'),
        ...(referenceImages || []).map(img => ensureS3Url(img, 'video-studio/references'))
    ]);

    // ── Seedance 2.0: LaoZhang cascade first, PiAPI text-only last resort ──
    if (model === 'seedance-2.0') {
        const lzImageUrl = s3ImageUrl || s3ReferenceImages[0] || null;

        if (isLaozhangAvailable()) {
            const videoUrl = await tryLaozhangSeedance({
                prompt, imageUrl: lzImageUrl, duration, aspectRatio, generateAudio,
            });
            if (videoUrl) {
                return { requestId: `lz-${Date.now()}`, endpoint: 'laozhang-seedance-2.0', provider: 'laozhang', _laozhangVideoUrl: videoUrl };
            }
        }

        // Last resort: PiAPI — throws immediately on insufficient_credits
        console.log(`🎮 [PiAPI] Last resort: seedance-2.0 text-to-video (no images)...`);
        try {
            const result = await submitPiApiVideoGeneration({
                prompt, imageUrl: null, duration,
                aspectRatio: aspectRatio || '16:9',
                generateAudio, referenceImages: [], qualityMode: mode || 'fast',
            });
            return { requestId: result.taskId, endpoint: 'piapi-seedance-2.0', provider: 'piapi', _piApiPayload: result._payload };
        } catch (piErr) {
            if (piErr.message.startsWith('PiAPI_INSUFFICIENT_CREDITS')) {
                throw new Error('Video generation failed: All providers unavailable. LaoZhang seedance channel is down and PiAPI has insufficient credits. Please try again in a few minutes or top up PiAPI at piapi.ai.');
            }
            throw piErr;
        }
    }

    // ── LaoZhang-First Routing (other LZ-native models) ──
    const LZ_VIDEO_MODELS = ['sora-2', 'veo-3.1', 'kling-3.0'];
    if (LZ_VIDEO_MODELS.includes(model) && isLaozhangAvailable()) {
        try {
            console.log(`🏷️ [LaoZhang] Attempting ${model}...`);
            const lzResult = await submitLaozhangVideoGeneration({
                model, prompt, imageUrl: s3ImageUrl,
                duration: duration || 5, aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
            });
            if (lzResult?.videoUrl) {
                console.log(`✅ [LaoZhang] ${model} done.`);
                return { requestId: `lz-${Date.now()}`, endpoint: `laozhang-${model}`, provider: 'laozhang', _laozhangVideoUrl: lzResult.videoUrl };
            }
        } catch (lzErr) {
            if (model === 'sora-2') throw new Error(`Sora 2 failed: ${lzErr.message}`);
            console.warn(`⚠️ [LaoZhang] ${model} failed, falling through...`);
        }
    }

    // ── Grok Imagine ──
    if (model === 'grok-imagine') {
        const apiKey = getGrokApiKey();
        const payload = { model: 'grok-imagine-video', prompt, duration: Math.min(Math.max(duration || 5, 1), 15), aspect_ratio: aspectRatio || '16:9', resolution: resolution === '480p' ? '480p' : '720p' };
        if (s3ImageUrl) payload.image = { url: s3ImageUrl };
        const response = await fetch(`${GROK_BASE_URL}/videos/generations`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`Grok failed (${response.status}): ${await response.text()}`);
        const data = await response.json();
        return { requestId: data.request_id, endpoint: 'grok-imagine-video', provider: 'grok' };
    }

    // ── Veo 3.1 Fast: kie.ai ──
    if (model === 'veo-3.1-fast') {
        const result = await submitKieVideoGeneration({ model, prompt, imageUrl: s3ImageUrl, duration, aspectRatio: aspectRatio || '16:9' });
        return { requestId: result.taskId, endpoint: `kie-${model}`, provider: 'kie' };
    }

    // ── fal.ai ──
    const apiKey = getApiKey();
    const endpoints = MODEL_ENDPOINTS[model];
    if (!endpoints) throw new Error(`Unknown video model: ${model}`);
    const endpoint = s3ImageUrl ? endpoints.imageToVideo : endpoints.textToVideo;
    const payload = buildPayload(model, { prompt, imageUrl: s3ImageUrl, duration, resolution, mode, shots, generateAudio });
    if (s3ImageUrl) payload.image_url = s3ImageUrl;
    const response = await fetch(`${FAL_BASE_URL}/${endpoint}`, { method: 'POST', headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(35000) });
    if (!response.ok) throw new Error(`fal.ai failed (${response.status}): ${await response.text()}`);
    const data = await response.json();
    console.log(`✅ fal.ai queued: ${data.request_id}`);
    return { requestId: data.request_id, endpoint, statusUrl: data.status_url, resultUrl: data.response_url, provider: 'fal' };
}

export async function extendVideo({ videoUrl, prompt, duration = 7 }) {
    const apiKey = getApiKey();
    const response = await fetch(`${FAL_BASE_URL}/${MODEL_ENDPOINTS['veo-3.1'].extendVideo}`, { method: 'POST', headers: { 'Authorization': `Key ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ video_url: videoUrl, prompt, duration: String(duration), generate_audio: true, auto_fix: true }) });
    if (!response.ok) throw new Error(`fal.ai extend failed: ${await response.text()}`);
    const data = await response.json();
    return { requestId: data.request_id, provider: 'fal' };
}

export async function getGenerationStatus(requestId, statusUrl, resultUrl) {
    const apiKey = getApiKey();
    if (!statusUrl) statusUrl = `${FAL_BASE_URL}/fal-ai/kling-video/requests/${requestId}/status`;
    if (!resultUrl) resultUrl = statusUrl.replace('/status', '');
    const response = await fetch(statusUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
    if (!response.ok) return { status: 'IN_PROGRESS', progress: 30 };
    const data = await response.json();
    if (data.status === 'COMPLETED') return await fetchFalResult(apiKey, resultUrl);
    if (data.status === 'FAILED') {
        try { const r = await fetchFalResult(apiKey, resultUrl); if (r.videoUrl) return r; } catch (_) {}
        return { status: 'FAILED', progress: 0, error: 'fal.ai generation failed' };
    }
    return { status: data.status || 'IN_PROGRESS', progress: data.status === 'IN_QUEUE' ? 10 : 50 };
}

export async function getGrokGenerationStatus(requestId) {
    const apiKey = getGrokApiKey();
    const response = await fetch(`${GROK_BASE_URL}/videos/${requestId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (!response.ok) return { status: 'FAILED', progress: 0, error: `Grok status check failed: ${response.status}` };
    const data = await response.json();
    if (data.status === 'done') return { status: 'COMPLETED', progress: 100, videoUrl: data.video?.url || '', thumbnailUrl: '', audioUrl: '', duration: data.video?.duration || 0 };
    if (data.status === 'expired') return { status: 'FAILED', progress: 0, error: 'Grok request expired.' };
    return { status: 'IN_PROGRESS', progress: 40 };
}

async function fetchFalResult(apiKey, resultUrl) {
    const res = await fetch(resultUrl, { headers: { 'Authorization': `Key ${apiKey}` } });
    const data = await res.json();
    const videoUrl = data.video?.url || data.video?.file_url || data.video_url || data.data?.video_url || data.data?.video?.url || data.output?.url || data.output?.video_url || data.output?.video?.url || data.videos?.[0]?.url || data.videos?.[0]?.file_url || data.result?.[0]?.url || data.result?.url || data.url || '';
    return { status: 'COMPLETED', progress: 100, videoUrl, thumbnailUrl: data.thumbnail?.url || data.thumbnail_url || '', audioUrl: data.audio?.url || data.audio_url || '' };
}

export function getModelsInfo() {
    return Object.keys(MODEL_CAPABILITIES).map(id => ({ ...MODEL_CAPABILITIES[id], available: true }));
}
