/**
 * Video Generation Client — Multi-provider SDK wrapper + cost calculator
 *
 * seedance-2.0 cascade order:
 *   1. LaoZhang seedance-2.0  (cheapest, synchronous)
 *   2. LaoZhang veo-3.1-fast  (reliable fallback, synchronous)
 *   3. kie.ai   seedance-2.0  (async/polling, returns taskId, always works)
 *   4. PiAPI    seedance-2.0  (last resort, requires credits)
 */

import config from '../../config/env.js';
import { submitKieVideoGeneration } from './kieClient.js';
import { submitPiApiVideoGeneration } from './piApiClient.js';
import { submitMuApiVideoGeneration } from './muapiClient.js';
import { ensureS3Url } from '../../utils/s3.js';
import { isLaozhangAvailable, submitLaozhangVideoGeneration } from './laozhangClient.js';
import { getSetting } from '../../models/SystemSettings.js';

const FAL_BASE_URL = 'https://queue.fal.run';
const GROK_BASE_URL = 'https://api.x.ai/v1';

const MODEL_ENDPOINTS = {
    'kling-3.0':   { textToVideo: 'fal-ai/kling-video/v3/standard/text-to-video', imageToVideo: 'fal-ai/kling-video/v3/standard/image-to-video' },
    'veo-3.1':     { textToVideo: 'fal-ai/veo3', imageToVideo: 'fal-ai/veo3/image-to-video', extendVideo: 'fal-ai/veo3.1/extend-video' },
    'veo-3.1-fast':{ textToVideo: 'fal-ai/veo3/fast', imageToVideo: 'fal-ai/veo3/fast/image-to-video', extendVideo: 'fal-ai/veo3.1/fast/extend-video' },
    'seedance-1.0':{ textToVideo: 'fal-ai/bytedance/seedance/v1/lite/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v1/lite/image-to-video' },
    'seedance-2.0':{ textToVideo: 'fal-ai/bytedance/seedance/v2/pro/text-to-video', imageToVideo: 'fal-ai/bytedance/seedance/v2/pro/image-to-video' },
    'hunyuan':     { textToVideo: 'fal-ai/hunyuan-video/video-to-video', imageToVideo: 'fal-ai/hunyuan-video/image-to-video' },
};

const MODEL_AVAILABLE = {
    'kling-3.0': true, 'veo-3.1': true, 'veo-3.1-fast': true,
    'seedance-1.0': true, 'seedance-2.0': true, 'grok-imagine': true,
    'hunyuan': true, 'sora-2': true,
};

export const COST_PER_SECOND = {
    'kling-3.0':   { fast: 0.07, quality: 0.12 },
    'veo-3.1':     { fast: 0.10, quality: 0.25 },
    'veo-3.1-fast':{ fast: 0.06, quality: 0.10 },
    'seedance-1.0':{ fast: 0.05, quality: 0.08 },
    'seedance-2.0':{ fast: 0.05, quality: 0.10 },
    'grok-imagine':{ fast: 0.08, quality: 0.08 },
    'hunyuan':     { fast: 0.03, quality: 0.05 },
    'sora-2':      { fast: 0.10, quality: 0.15 },
};

const DURATION_LIMITS = {
    'kling-3.0':   { min: 3, max: 15 },
    'veo-3.1':     { min: 5, max: 8  },
    'veo-3.1-fast':{ min: 5, max: 8  },
    'seedance-1.0':{ min: 5, max: 10 },
    'seedance-2.0':{ min: 5, max: 15 },
    'grok-imagine':{ min: 1, max: 15 },
    'hunyuan':     { min: 3, max: 10 },
    'sora-2':      { min: 5, max: 15 },
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
        id: 'seedance-2.0', name: 'Seedance 2.0 Pro', icon: '🎞️', provider: 'dynamic',
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

let LIVE_COST_PER_SECOND = {};

/**
 * Periodically pulls live pricing baselines from DB so estimateCost() remains synchronous
 * but uses live scraped data. Handled automatically via pricingMonitor or server init.
 */
export async function syncLiveVideoPricing() {
    const baselines = await getSetting('pricing_baselines', null);
    if (!baselines) return;
    
    for (const [key, model] of Object.entries(baselines)) {
        if (model.type === 'video' || model.type === 'image') { // Some providers mix them
            const id = model.modelId;
            LIVE_COST_PER_SECOND[id] = {
                fast: model.costPerSecFast || model.costPerSecond || 0.08,
                quality: model.costPerSecQuality || model.costPerSecond || 0.15
            };
        }
    }
}

// Ensure it attempts to load once on boot
syncLiveVideoPricing().catch(() => {});

export function estimateCost(model = 'kling-3.0', durationSeconds = 5, resolution = '1080p', mode = 'fast') {
    const liveCost = LIVE_COST_PER_SECOND[model]?.[mode];
    const costPerSec = liveCost || (COST_PER_SECOND[model]?.[mode]) || 0.07;
    const resMult = resolution === '720p' ? 0.7 : 1.0;
    const usd = Number((costPerSec * durationSeconds * resMult).toFixed(2));
    const inr = Number((usd * 93.21).toFixed(0));
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

// ── Full cascade for seedance-2.0 ───────────────────────────────────────
// Order: LZ seedance-2.0 → LZ veo-3.1-fast → kie.ai seedance-2.0 → PiAPI
async function trySeedanceCascade({ prompt, imageUrl, duration, aspectRatio, generateAudio, mode }) {
    // ─ Step 1: LaoZhang seedance-2.0 (synchronous, cheapest) ─
    if (isLaozhangAvailable()) {
        try {
            const r = await submitLaozhangVideoGeneration({
                model: 'seedance-2.0', prompt, imageUrl,
                duration: duration || 5, aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
            });
            if (r?.videoUrl) {
                console.log(`✅ [Cascade] Step 1 done: LaoZhang seedance-2.0`);
                return { videoUrl: r.videoUrl, provider: 'laozhang' };
            }
        } catch (e) {
            console.warn(`⚠️ [Cascade] Step 1 LZ seedance-2.0 failed: ${e.message?.substring(0, 100)}`);
        }

        // ─ Step 2: LaoZhang veo-3.1-fast (synchronous, reliable) ─
        console.log(`🔁 [Cascade] Step 2: LaoZhang veo-3.1-fast...`);
        try {
            const r = await submitLaozhangVideoGeneration({
                model: 'veo-3.1-fast', prompt, imageUrl: null,
                duration: Math.min(duration || 5, 8), aspectRatio: aspectRatio || '16:9',
                generateAudio: generateAudio !== false,
            });
            if (r?.videoUrl) {
                console.log(`✅ [Cascade] Step 2 done: LaoZhang veo-3.1-fast`);
                return { videoUrl: r.videoUrl, provider: 'laozhang' };
            }
        } catch (e) {
            console.warn(`⚠️ [Cascade] Step 2 LZ veo-3.1-fast failed: ${e.message?.substring(0, 100)}`);
        }
    }

    // ─ Step 3: kie.ai seedance-2.0 (async/polling — always reliable) ─
    console.log(`🔁 [Cascade] Step 3: kie.ai seedance-2.0 (async)...`);
    try {
        const kieResult = await submitKieVideoGeneration({
            model: 'seedance-2.0', prompt,
            imageUrl: imageUrl || null,
            duration: duration || 5,
            aspectRatio: aspectRatio || '16:9',
        });
        if (kieResult?.taskId) {
            console.log(`✅ [Cascade] Step 3 done: kie.ai taskId=${kieResult.taskId}`);
            // Return as kie async job — status polling will handle completion
            return { taskId: kieResult.taskId, provider: 'kie', async: true };
        }
    } catch (e) {
        console.warn(`⚠️ [Cascade] Step 3 kie.ai failed: ${e.message?.substring(0, 100)}`);
    }

    // ─ Step 4: PiAPI (last resort) ─
    console.log(`🎮 [Cascade] Step 4: PiAPI last resort...`);
    try {
        const piResult = await submitPiApiVideoGeneration({
            prompt, imageUrl: null, duration,
            aspectRatio: aspectRatio || '16:9',
            generateAudio, referenceImages: [], qualityMode: mode || 'fast',
        });
        if (piResult?.taskId) {
            console.log(`✅ [Cascade] Step 4 done: PiAPI taskId=${piResult.taskId}`);
            return { taskId: piResult.taskId, provider: 'piapi', async: true, _piApiPayload: piResult._payload };
        }
    } catch (piErr) {
        if (piErr.message.startsWith('PiAPI_INSUFFICIENT_CREDITS')) {
            console.error(`🚫 [Cascade] Step 4 PiAPI: insufficient credits`);
            throw new Error('All video providers failed: LaoZhang channels are temporarily down and PiAPI has insufficient credits. Please try again in a few minutes.');
        }
        throw piErr;
    }

    throw new Error('All video providers exhausted without a result.');
}

export async function submitVideoGeneration({ model, prompt, imageUrl, duration, resolution, mode, shots, generateAudio, aspectRatio, referenceImages }) {
    if (!MODEL_AVAILABLE[model]) throw new Error(`Model '${model}' is not available.`);

    const [s3ImageUrl, ...s3ReferenceImages] = await Promise.all([
        ensureS3Url(imageUrl, 'video-studio/generations'),
        ...(referenceImages || []).map(img => ensureS3Url(img, 'video-studio/references'))
    ]);

    // ══════════════════════════════════════════════════════════════════
    // DYNAMIC PROVIDER ROUTING — SuperAdmin-controlled via SystemSettings
    // Reads 'video_provider_routes' from DB for each model.
    // Default providers (no DB entry): defined in comments below.
    // Falls through to direct provider on failure.
    // ══════════════════════════════════════════════════════════════════
    let activeProvider = null;
    try {
        const providerRoutes = await getSetting('video_provider_routes', {});
        activeProvider = providerRoutes[model]?.active || null;
    } catch (e) {
        console.warn('⚠️ Could not read video_provider_routes from DB:', e.message);
    }

    // ── Provider routing map: model → activeProvider → handler ──
    // If no activeProvider in DB, use the default provider for each model

    // ── Sora 2: LaoZhang ONLY ──
    if (model === 'sora-2') {
        const provider = activeProvider || 'laozhang';
        if (provider === 'laozhang' && isLaozhangAvailable()) {
            console.log(`🎬 [Sora 2] Using LaoZhang (${activeProvider ? 'SuperAdmin' : 'default'})...`);
            const lzResult = await submitLaozhangVideoGeneration({
                model, prompt, imageUrl: s3ImageUrl, duration: duration || 5,
                aspectRatio: aspectRatio || '16:9', generateAudio: generateAudio !== false,
            });
            if (lzResult?.videoUrl) {
                return {
                    requestId: `lz-${Date.now()}`, endpoint: `laozhang-sora-2`,
                    statusUrl: null, resultUrl: null, provider: 'laozhang',
                    _laozhangVideoUrl: lzResult.videoUrl,
                };
            }
        }
        throw new Error('Sora 2 generation failed — LaoZhang is the only provider.');
    }

    // ── Veo 3.1: LaoZhang (default) or fal.ai ──
    if (model === 'veo-3.1') {
        const provider = activeProvider || 'laozhang';
        // Try LaoZhang first if selected
        if (provider === 'laozhang' && isLaozhangAvailable()) {
            try {
                console.log(`🎬 [Veo 3.1] Using LaoZhang (${activeProvider ? 'SuperAdmin' : 'default'})...`);
                const lzResult = await submitLaozhangVideoGeneration({
                    model, prompt, imageUrl: s3ImageUrl, duration: duration || 5,
                    aspectRatio: aspectRatio || '16:9', generateAudio: generateAudio !== false,
                });
                if (lzResult?.videoUrl) {
                    return {
                        requestId: `lz-${Date.now()}`, endpoint: `laozhang-veo-3.1`,
                        statusUrl: null, resultUrl: null, provider: 'laozhang',
                        _laozhangVideoUrl: lzResult.videoUrl,
                    };
                }
            } catch (lzErr) {
                if (provider === 'laozhang' && activeProvider) throw lzErr; // Admin explicitly chose LZ, don't fallback
                console.warn(`⚠️ [LaoZhang] Veo 3.1 failed, falling through to fal.ai...`);
            }
        }
        // Fall through to fal.ai (handled at the bottom)
    }

    // ── Veo 3.1 Fast: LaoZhang (default) or kie.ai ──
    if (model === 'veo-3.1-fast') {
        const provider = activeProvider || 'laozhang';
        // Try LaoZhang first if selected
        if (provider === 'laozhang' && isLaozhangAvailable()) {
            try {
                console.log(`🎬 [Veo 3.1 Fast] Using LaoZhang (${activeProvider ? 'SuperAdmin' : 'default'})...`);
                const lzResult = await submitLaozhangVideoGeneration({
                    model, prompt, imageUrl: s3ImageUrl, duration: duration || 5,
                    aspectRatio: aspectRatio || '16:9', generateAudio: generateAudio !== false,
                });
                if (lzResult?.videoUrl) {
                    return {
                        requestId: `lz-${Date.now()}`, endpoint: `laozhang-veo-3.1-fast`,
                        statusUrl: null, resultUrl: null, provider: 'laozhang',
                        _laozhangVideoUrl: lzResult.videoUrl,
                    };
                }
            } catch (lzErr) {
                if (provider === 'laozhang' && activeProvider) throw lzErr;
                console.warn(`⚠️ [LaoZhang] Veo 3.1 Fast failed, falling through to kie.ai...`);
            }
        }
        // Use kie.ai
        if (provider === 'kie' || !activeProvider) {
            console.log(`🎬 [Veo 3.1 Fast] Using kie.ai...`);
            const result = await submitKieVideoGeneration({
                model, prompt, imageUrl: s3ImageUrl, duration,
                aspectRatio: aspectRatio || '16:9',
            });
            return {
                requestId: result.taskId, endpoint: `kie-${model}`,
                statusUrl: null, resultUrl: null, provider: 'kie',
            };
        }
    }

    // ── Grok Imagine: xAI native ──
    if (model === 'grok-imagine') {
        console.log(`🎬 [Grok Imagine] Using xAI native API...`);
        const result = await submitGrokVideoGeneration({
            prompt, imageUrl: s3ImageUrl, duration, resolution, aspectRatio,
        });
        return {
            requestId: result.requestId, endpoint: 'grok-imagine-video',
            statusUrl: null, resultUrl: null, provider: 'grok',
        };
    }

    // ── Kling 3.0: fal.ai (default) or LaoZhang ──
    if (model === 'kling-3.0') {
        const provider = activeProvider || 'fal';
        if (provider === 'laozhang' && isLaozhangAvailable()) {
            try {
                console.log(`🎬 [Kling 3.0] Using LaoZhang (SuperAdmin)...`);
                const lzResult = await submitLaozhangVideoGeneration({
                    model, prompt, imageUrl: s3ImageUrl, duration: duration || 5,
                    aspectRatio: aspectRatio || '16:9', generateAudio: generateAudio !== false,
                });
                if (lzResult?.videoUrl) {
                    return {
                        requestId: `lz-${Date.now()}`, endpoint: `laozhang-kling-3.0`,
                        statusUrl: null, resultUrl: null, provider: 'laozhang',
                        _laozhangVideoUrl: lzResult.videoUrl,
                    };
                }
            } catch (lzErr) {
                if (activeProvider) throw lzErr;
                console.warn(`⚠️ [LaoZhang] Kling 3.0 failed, falling through to fal.ai...`);
            }
        }
        // Fall through to fal.ai (handled at the bottom)
    }

    // ── Seedance 2.0: Dynamic (MuAPI default, PiAPI fallback) ──
    if (model === 'seedance-2.0') {
        const provider = activeProvider || 'muapi';
        console.log(`🎬 [Seedance 2.0] Routing to ${provider} (${activeProvider ? 'SuperAdmin' : 'default'})...`);

        if (provider === 'muapi') {
            const muApiKey = process.env.MUAPI_API_KEY;
            if (!muApiKey) {
                throw new Error('Seedance 2.0 (MuAPI) requires MUAPI_API_KEY. Add it to .env or switch provider in SuperAdmin.');
            }
            const result = await submitMuApiVideoGeneration({
                prompt, imageUrl: s3ImageUrl, duration,
                aspectRatio: aspectRatio || '16:9', qualityMode: mode || 'fast',
                generateAudio, referenceImages: s3ReferenceImages,
            });
            return {
                requestId: result.taskId, endpoint: `muapi-seedance-2.0`,
                statusUrl: null, resultUrl: null, provider: 'muapi',
                _muApiPayload: result._muApiPayload,
            };
        } else if (provider === 'piapi') {
            const piApiKey = process.env.PIAPI_API_KEY;
            if (!piApiKey) {
                throw new Error('Seedance 2.0 (PiAPI) requires PIAPI_API_KEY. Add it to .env or switch provider in SuperAdmin.');
            }
            const result = await submitPiApiVideoGeneration({
                prompt, imageUrl: s3ImageUrl, duration,
                aspectRatio: aspectRatio || '16:9', generateAudio,
                referenceImages: s3ReferenceImages, qualityMode: mode || 'fast',
            });
            return {
                requestId: result.taskId, endpoint: `piapi-seedance-2.0`,
                statusUrl: null, resultUrl: null, provider: 'piapi',
                _piApiPayload: result._payload,
            };
        }
        throw new Error(`Unknown provider '${provider}' for Seedance 2.0. Configure in SuperAdmin.`);
    }

    // ── fal.ai models (Kling, Veo 3.1 standard, Seedance 1.0) ──
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
