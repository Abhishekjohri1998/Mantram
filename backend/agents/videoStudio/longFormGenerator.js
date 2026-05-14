/**
 * Long-Form Video Generator — Orchestrates multi-segment video generation
 *
 * Pipeline: Scene Plan → Per-Scene TTS → Sequential Gen (with refAudio lip-sync)
 *           → Frame Chain → FFmpeg Stitch (crossfade) → Audio Concat + BGM → Final Mux
 * Supports 30–120s videos across all AI video models.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { planScenes } from './scenePlanner.js';
import { submitVideoGeneration, estimateCost } from './falClient.js';
import { submitAtlasCloudVideoGeneration } from './atlasClient.js';
import { uploadToS3 } from '../../utils/s3.js';
import {
    extractLastFrameToS3,
    muxAudioOntoVideo,
    concatSceneAudios,
    mixAudioAndMux,
} from '../../utils/ffmpegUtils.js';

const execFileAsync = promisify(execFile);

// ── TTS Engine (Sarvam for Indian languages, OpenAI for global) ──────────────
const LANG_TO_CODE = {
    'Hindi': 'hi-IN', 'Tamil': 'ta-IN', 'Telugu': 'te-IN', 'Bengali': 'bn-IN',
    'Marathi': 'mr-IN', 'Gujarati': 'gu-IN', 'Kannada': 'kn-IN', 'Malayalam': 'ml-IN',
    'Punjabi': 'pa-IN', 'English': 'en-IN', 'Arabic': 'ar-SA', 'Urdu': 'ur-PK',
    'French': 'fr-FR', 'Spanish': 'es-ES', 'Portuguese': 'pt-BR', 'Japanese': 'ja-JP',
    'Korean': 'ko-KR', 'Chinese': 'zh-CN', 'German': 'de-DE', 'Italian': 'it-IT',
    'Turkish': 'tr-TR', 'Thai': 'th-TH',
};
const SARVAM_SUPPORTED = new Set(['hi-IN', 'ta-IN', 'te-IN', 'bn-IN', 'mr-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'en-IN']);
const SARVAM_VOICES = {
    'hi-IN': 'anushka', 'ta-IN': 'meera', 'te-IN': 'meera', 'bn-IN': 'meera',
    'mr-IN': 'meera', 'gu-IN': 'meera', 'kn-IN': 'meera', 'ml-IN': 'meera',
    'pa-IN': 'meera', 'en-IN': 'anushka',
};
const OPENAI_VOICES = {
    'ar-SA': 'coral', 'ur-PK': 'coral', 'fr-FR': 'sage', 'es-ES': 'nova',
    'pt-BR': 'nova', 'ja-JP': 'shimmer', 'ko-KR': 'shimmer', 'zh-CN': 'alloy',
    'de-DE': 'onyx', 'it-IT': 'sage', 'tr-TR': 'echo', 'th-TH': 'nova', 'en-IN': 'nova',
};

// Models that support refAudio for native lip-sync
const MODELS_WITH_REF_AUDIO = new Set(['seedance-2.0', 'seedance-2.0-fast', 'kling-3.0', 'kling-3.0-o']);

// ── Background Music Presets ─────────────────────────────────────────────────
// Royalty-free ambient music URLs (stored in S3 or public CDN)
// Volume is ducked to -18dB when voiceover is present, -8dB during silent scenes
const BGM_PRESETS = {
    upbeat:     { name: 'Upbeat Corporate',   volumeWithVO: 0.08, volumeNoVO: 0.20 },
    cinematic:  { name: 'Cinematic Ambient',   volumeWithVO: 0.06, volumeNoVO: 0.18 },
    emotional:  { name: 'Emotional Piano',     volumeWithVO: 0.07, volumeNoVO: 0.20 },
    energetic:  { name: 'Energetic Pop',       volumeWithVO: 0.10, volumeNoVO: 0.25 },
    minimal:    { name: 'Minimal Electronic',  volumeWithVO: 0.05, volumeNoVO: 0.15 },
};

// ── Progress Phases ──────────────────────────────────────────────────────────
const PHASES = {
    PLANNING:     { label: 'Planning scenes...', range: [0, 5] },
    GENERATING:   { label: 'Generating scenes', range: [5, 75] },
    DOWNLOADING:  { label: 'Downloading segments...', range: [75, 80] },
    STITCHING:    { label: 'Stitching video...', range: [80, 88] },
    TTS:          { label: 'Generating voiceover...', range: [88, 93] },
    MUXING:       { label: 'Final mixing...', range: [93, 100] },
};

// ── In-memory job tracker ────────────────────────────────────────────────────
const activeJobs = new Map();

export function getLongFormJobStatus(jobId) {
    return activeJobs.get(jobId) || null;
}

export function cancelLongFormJob(jobId) {
    const job = activeJobs.get(jobId);
    if (job) {
        job.cancelled = true;
        job.status = 'CANCELLED';
        return true;
    }
    return false;
}

// ── Credit Estimation ────────────────────────────────────────────────────────
export function estimateLongFormCost(model, targetDuration, resolution = '1080p', mode = 'fast') {
    const maxPerSegment = { 'veo-3.1': 8, 'veo-3.1-fast': 8, 'hunyuan': 10 }[model] || 15;
    const optimalPerSegment = Math.min(maxPerSegment, 10);
    const segments = Math.ceil(targetDuration / optimalPerSegment);
    const perSegment = estimateCost(model, optimalPerSegment, resolution, mode);
    const planningCredits = 5;
    const stitchingCredits = 3;
    return {
        segments,
        perSegmentCredits: perSegment.credits,
        totalCredits: (perSegment.credits * segments) + planningCredits + stitchingCredits,
        estimatedTimeMinutes: Math.ceil(segments * 2.5),
        targetDuration,
        model,
    };
}

// ── Helper: Update job progress ──────────────────────────────────────────────
function updateProgress(jobId, phase, detail = '', subProgress = 0) {
    const job = activeJobs.get(jobId);
    if (!job) return;
    const [min, max] = PHASES[phase]?.range || [0, 100];
    const progress = Math.round(min + (subProgress / 100) * (max - min));
    job.phase = phase;
    job.phaseLabel = PHASES[phase]?.label || phase;
    job.detail = detail;
    job.progress = Math.min(progress, 99);
    console.log(`[LongForm ${jobId}] ${job.phaseLabel} ${detail} (${job.progress}%)`);
}

// ── Main Generator ───────────────────────────────────────────────────────────
/**
 * Generate a long-form video (30–120s)
 *
 * @returns {string} jobId — poll with getLongFormJobStatus(jobId)
 */
export function startLongFormGeneration({
    targetDuration,
    model = 'seedance-2.0',
    prompt = '',
    referenceImages = [],
    imageRole = 'product',
    language = 'English',
    aspectRatio = '9:16',
    settings = {},
    userId,
    brandId,
    brandContext = '',
    productData = {},
    bgmPreset = 'cinematic',
}) {
    const jobId = `lf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const job = {
        jobId,
        status: 'GENERATING',
        phase: 'PLANNING',
        phaseLabel: 'Planning scenes...',
        detail: '',
        progress: 0,
        cancelled: false,
        scenes: [],
        sceneStatuses: [],
        videoUrl: null,
        error: null,
        startedAt: new Date(),
        targetDuration,
        model,
        language,
    };
    activeJobs.set(jobId, job);

    // Run pipeline in background
    runPipeline(jobId, {
        targetDuration, model, prompt, referenceImages, imageRole,
        language, aspectRatio, settings, userId, brandId, brandContext,
        productData, bgmPreset,
    }).catch(err => {
        const j = activeJobs.get(jobId);
        if (j) { j.status = 'FAILED'; j.error = err.message; j.progress = 0; }
        console.error(`[LongForm ${jobId}] Pipeline failed:`, err.message);
    });

    return jobId;
}

// ── Pipeline Execution ───────────────────────────────────────────────────────
async function runPipeline(jobId, params) {
    const job = activeJobs.get(jobId);
    const tmpDir = path.join(os.tmpdir(), `longform-${jobId}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        // ═══ Phase 1: Scene Planning ═══
        updateProgress(jobId, 'PLANNING', 'LLM decomposing scenes...', 0);

        const scenes = await planScenes({
            targetDuration: params.targetDuration,
            model: params.model,
            language: params.language,
            prompt: params.prompt,
            productData: params.productData,
            brandContext: params.brandContext,
            settings: params.settings,
            referenceImages: params.referenceImages,
        });

        job.scenes = scenes;
        job.sceneStatuses = scenes.map(() => ({ status: 'pending', progress: 0 }));
        updateProgress(jobId, 'PLANNING', `${scenes.length} scenes planned`, 100);

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 2: Sequential Video Generation with Per-Scene TTS ═══
        const sceneVideos = new Array(scenes.length).fill(null);
        const sceneAudioUrls = new Array(scenes.length).fill(null); // Per-scene TTS URLs
        let completedScenes = 0;
        let lastFrameUrl = null;
        const supportsRefAudio = MODELS_WITH_REF_AUDIO.has(params.model);

        for (let i = 0; i < scenes.length; i++) {
            if (job.cancelled) throw new Error('Cancelled by user');

            const scene = scenes[i];
            job.sceneStatuses[i] = { status: 'generating', progress: 0 };

            updateProgress(jobId, 'GENERATING',
                `Scene ${i + 1}/${scenes.length} — TTS + Video (${scene.role})`,
                (completedScenes / scenes.length) * 100);

            try {
                // ── Step 2a: Generate per-scene TTS audio ──
                let sceneTtsUrl = null;
                if (scene.dialogue && scene.dialogue.length > 0) {
                    try {
                        const dialogueText = scene.dialogue.map(d => d.text || d).join('. ');
                        const emotion = scene.dialogue[0]?.emotion || 'neutral';
                        sceneTtsUrl = await generateSceneTTS(dialogueText, params.language, emotion);
                        if (sceneTtsUrl) {
                            console.log(`[LongForm ${jobId}] 🎤 Scene ${i + 1} TTS ready: ${sceneTtsUrl.substring(0, 60)}...`);
                        }
                    } catch (ttsErr) {
                        console.warn(`[LongForm ${jobId}] ⚠️ Scene ${i + 1} TTS failed: ${ttsErr.message}`);
                    }
                }
                sceneAudioUrls[i] = sceneTtsUrl;

                // ── Step 2b: Build scene prompt ──
                let scenePrompt = scene.visualPrompt || scene.prompt || params.prompt;
                if (scene.camerawork) scenePrompt += `\n${scene.camerawork}`;
                scenePrompt += '\nMaintain visual consistency throughout. Ensure natural smooth movements. Generate video without subtitles.';

                // ── Step 2c: Generate scene video ──
                const isSeedance = params.model.startsWith('seedance');
                let genResult;

                if (isSeedance) {
                    genResult = await submitAtlasCloudVideoGeneration({
                        prompt: scenePrompt,
                        imageUrl: lastFrameUrl,
                        duration: scene.duration,
                        aspectRatio: params.aspectRatio,
                        generateAudio: !sceneTtsUrl, // Disable native audio when TTS provided
                        referenceImages: params.referenceImages.slice(0, 9),
                        qualityMode: params.settings?.quality || 'fast',
                        imageRole: params.imageRole,
                        refAudio: supportsRefAudio ? sceneTtsUrl : null,
                    });
                } else {
                    genResult = await submitVideoGeneration({
                        model: params.model,
                        prompt: scenePrompt,
                        imageUrl: lastFrameUrl,
                        duration: scene.duration,
                        aspectRatio: params.aspectRatio,
                        generateAudio: !sceneTtsUrl,
                        referenceImages: params.referenceImages.slice(0, 9),
                        refAudio: supportsRefAudio ? sceneTtsUrl : null,
                    });
                }

                // Poll until complete
                let videoUrl = await pollUntilComplete(genResult, jobId, i, scenes.length);

                // ── Step 2d: Post-mux TTS for models WITHOUT refAudio ──
                if (sceneTtsUrl && !supportsRefAudio) {
                    try {
                        console.log(`[LongForm ${jobId}] 🔊 Post-muxing TTS onto scene ${i + 1} (model lacks refAudio)...`);
                        videoUrl = await muxAudioOntoVideo(videoUrl, sceneTtsUrl);
                    } catch (muxErr) {
                        console.warn(`[LongForm ${jobId}] ⚠️ Post-mux failed for scene ${i + 1}: ${muxErr.message}`);
                    }
                }

                sceneVideos[i] = videoUrl;
                job.sceneStatuses[i] = { status: 'completed', progress: 100, videoUrl };
                completedScenes++;

                // ── Step 2e: Extract last frame for next scene ──
                if (i < scenes.length - 1) {
                    try {
                        lastFrameUrl = await extractLastFrameToS3(videoUrl);
                        console.log(`[LongForm ${jobId}] 🖼️ Last frame for scene ${i + 1}: ${lastFrameUrl}`);
                    } catch (frameErr) {
                        console.error(`[LongForm ${jobId}] Failed to extract last frame: ${frameErr.message}`);
                        lastFrameUrl = null;
                    }
                }

                updateProgress(jobId, 'GENERATING',
                    `${completedScenes}/${scenes.length} scenes done`,
                    (completedScenes / scenes.length) * 100);

            } catch (err) {
                console.error(`[LongForm ${jobId}] Scene ${i + 1} failed: ${err.message}`);
                job.sceneStatuses[i] = { status: 'failed', error: err.message };

                // Retry once (without TTS to maximize success chance)
                try {
                    console.log(`[LongForm ${jobId}] Retrying scene ${i + 1}...`);
                    const isSeedance = params.model.startsWith('seedance');
                    let retryResult;

                    if (isSeedance) {
                        retryResult = await submitAtlasCloudVideoGeneration({
                            prompt: scene.visualPrompt || params.prompt,
                            imageUrl: lastFrameUrl,
                            duration: scene.duration,
                            aspectRatio: params.aspectRatio,
                            generateAudio: true,
                            referenceImages: params.referenceImages.slice(0, 9),
                            qualityMode: params.settings?.quality || 'fast',
                            imageRole: params.imageRole,
                        });
                    } else {
                        retryResult = await submitVideoGeneration({
                            model: params.model,
                            prompt: scene.visualPrompt || params.prompt,
                            imageUrl: lastFrameUrl,
                            duration: scene.duration,
                            aspectRatio: params.aspectRatio,
                            generateAudio: true,
                            referenceImages: params.referenceImages.slice(0, 9),
                        });
                    }

                    let retryUrl = await pollUntilComplete(retryResult, jobId, i, scenes.length);

                    // Post-mux TTS on retry if available
                    if (sceneAudioUrls[i] && !supportsRefAudio) {
                        try { retryUrl = await muxAudioOntoVideo(retryUrl, sceneAudioUrls[i]); } catch {}
                    }

                    sceneVideos[i] = retryUrl;
                    job.sceneStatuses[i] = { status: 'completed', progress: 100, videoUrl: retryUrl };
                    completedScenes++;

                    if (i < scenes.length - 1) {
                        try { lastFrameUrl = await extractLastFrameToS3(retryUrl); } catch { lastFrameUrl = null; }
                    }
                } catch (retryErr) {
                    console.error(`[LongForm ${jobId}] Scene ${i + 1} retry failed: ${retryErr.message}`);
                    throw new Error(`Scene ${i + 1} failed after retry: ${retryErr.message}`);
                }
            }
        }

        // Verify all scenes generated
        const validVideos = sceneVideos.filter(Boolean);
        if (validVideos.length < scenes.length) {
            throw new Error(`Only ${validVideos.length}/${scenes.length} scenes generated successfully`);
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 3: Download all segment videos ═══
        updateProgress(jobId, 'DOWNLOADING', 'Downloading segments...', 0);
        const segmentPaths = [];
        for (let i = 0; i < sceneVideos.length; i++) {
            const segPath = path.join(tmpDir, `scene-${i + 1}.mp4`);
            const resp = await fetch(sceneVideos[i]);
            if (!resp.ok) throw new Error(`Failed to download scene ${i + 1}`);
            const buffer = Buffer.from(await resp.arrayBuffer());
            fs.writeFileSync(segPath, buffer);
            segmentPaths.push(segPath);
            updateProgress(jobId, 'DOWNLOADING', `${i + 1}/${sceneVideos.length}`, ((i + 1) / sceneVideos.length) * 100);
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 4: FFmpeg Normalize + Crossfade Concat (video-only) ═══
        updateProgress(jobId, 'STITCHING', 'Normalizing and stitching...', 0);
        const finalVideoPath = await stitchWithCrossfade(tmpDir, segmentPaths, params.aspectRatio, jobId);
        updateProgress(jobId, 'STITCHING', 'Stitch complete', 100);

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 5: Audio Pipeline — Concat per-scene TTS + BGM Mix ═══
        updateProgress(jobId, 'TTS', 'Building voiceover track...', 0);

        // Build per-scene audio data with matching durations
        const sceneAudioData = scenes.map((scene, i) => ({
            audioUrl: sceneAudioUrls[i],
            sceneDuration: scene.duration,
        }));

        const voiceoverPath = await concatSceneAudios(sceneAudioData, tmpDir);
        updateProgress(jobId, 'TTS', voiceoverPath ? 'Voiceover ready' : 'No voiceover', 100);

        // BGM URLs
        const BGM_URLS = {
            upbeat: 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3',
            cinematic: 'https://cdn.pixabay.com/audio/2022/02/07/audio_0319dd632e.mp3',
            emotional: 'https://cdn.pixabay.com/audio/2022/10/25/audio_27ab966bc7.mp3',
            energetic: 'https://cdn.pixabay.com/audio/2023/04/27/audio_f5353ee5c0.mp3',
            minimal: 'https://cdn.pixabay.com/audio/2022/03/15/audio_0710609b5a.mp3',
        };
        const bgmUrl = params.bgmPreset ? BGM_URLS[params.bgmPreset] : null;

        // ═══ Phase 6: Final Mux (Video + Voiceover + BGM) → Upload ═══
        updateProgress(jobId, 'MUXING', 'Mixing audio and uploading...', 0);
        const finalMuxedPath = await mixAudioAndMux(finalVideoPath, voiceoverPath, bgmUrl, tmpDir);
        updateProgress(jobId, 'MUXING', 'Uploading...', 50);

        const finalBuffer = fs.readFileSync(finalMuxedPath);
        const s3Key = `video-studio/longform/${jobId}/final-${Date.now()}.mp4`;
        const videoUrl = await uploadToS3(finalBuffer, s3Key, 'video/mp4');

        updateProgress(jobId, 'MUXING', 'Complete!', 100);
        job.status = 'COMPLETED';
        job.progress = 100;
        job.videoUrl = videoUrl;
        job.completedAt = new Date();

        console.log(`[LongForm ${jobId}] ✅ Complete: ${videoUrl.substring(0, 80)}...`);
        return videoUrl;

    } finally {
        // Cleanup temp files
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

// ── Poll until a video generation is complete ────────────────────────────────
async function pollUntilComplete(genResult, jobId, sceneIdx, totalScenes) {
    const { getAtlasCloudGenerationStatus } = await import('./atlasClient.js');
    const { getGenerationStatus, getGrokGenerationStatus } = await import('./falClient.js');

    const taskId = genResult.taskId || genResult.requestId;
    const provider = genResult.provider || 'atlascloud';
    const maxPollTime = 10 * 60 * 1000; // 10 minutes max per scene
    const pollInterval = 5000;
    const start = Date.now();

    // Handle synchronous results (e.g., LaoZhang returns videoUrl directly)
    if (genResult._laozhangVideoUrl) return genResult._laozhangVideoUrl;

    while (Date.now() - start < maxPollTime) {
        const job = activeJobs.get(jobId);
        if (job?.cancelled) throw new Error('Cancelled');

        await new Promise(r => setTimeout(r, pollInterval));

        try {
            let status;
            if (provider === 'atlascloud') {
                status = await getAtlasCloudGenerationStatus(taskId);
            } else if (provider === 'grok') {
                status = await getGrokGenerationStatus(taskId);
            } else {
                status = await getGenerationStatus(taskId, genResult.statusUrl, genResult.resultUrl);
            }

            if (status.status === 'COMPLETED' && status.videoUrl) {
                return status.videoUrl;
            }
            if (status.status === 'FAILED') {
                throw new Error(status.error || `Scene generation failed (${provider})`);
            }

            // Update scene progress
            if (job) {
                job.sceneStatuses[sceneIdx] = {
                    status: 'generating',
                    progress: status.progress || 30,
                };
            }
        } catch (pollErr) {
            if (pollErr.message === 'Cancelled') throw pollErr;
            console.warn(`[LongForm ${jobId}] Poll error for scene ${sceneIdx + 1}: ${pollErr.message}`);
        }
    }

    throw new Error(`Scene ${sceneIdx + 1} timed out after ${maxPollTime / 60000} minutes`);
}

// ── FFmpeg: Normalize + Crossfade Stitch ─────────────────────────────────────
async function stitchWithCrossfade(tmpDir, segmentPaths, aspectRatio = '9:16', jobId = '') {
    const [w, h] = aspectRatio === '16:9' ? [1920, 1080]
        : aspectRatio === '1:1' ? [1080, 1080]
        : [1080, 1920]; // 9:16 default

    const CROSSFADE_DURATION = 1; // 1 second crossfade between scenes

    if (segmentPaths.length === 1) {
        // Single segment — just normalize
        const outPath = path.join(tmpDir, 'final.mp4');
        await execFileAsync('ffmpeg', [
            '-y', '-i', segmentPaths[0],
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-an', // Strip audio — voiceover is built from per-scene TTS and muxed in Phase 6
            '-movflags', '+faststart',
            outPath,
        ], { timeout: 120000 });
        return outPath;
    }

    // Step 1: Normalize all segments
    console.log(`[LongForm ${jobId}] Normalizing ${segmentPaths.length} segments to ${w}x${h}@24fps...`);
    const normPaths = [];
    for (let i = 0; i < segmentPaths.length; i++) {
        const normPath = path.join(tmpDir, `norm-${i}.mp4`);
        await execFileAsync('ffmpeg', [
            '-y', '-i', segmentPaths[i],
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-an',
            '-movflags', '+faststart',
            normPath,
        ], { timeout: 120000 });
        normPaths.push(normPath);
    }

    // Step 2: Build crossfade filter chain
    // For N clips, we need N-1 xfade filters chained together
    console.log(`[LongForm ${jobId}] Building crossfade filter (${CROSSFADE_DURATION}s transitions)...`);

    const inputs = normPaths.flatMap(p => ['-i', p]);
    const filterParts = [];
    let lastLabel = '[0:v]';
    let accumulatedOffset = 0;

    // Get durations of normalized clips
    const durations = [];
    for (const np of normPaths) {
        try {
            const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'csv=p=0', np,
            ], { timeout: 15000 });
            durations.push(parseFloat(stdout.trim()) || 10);
        } catch {
            durations.push(10);
        }
    }

    for (let i = 1; i < normPaths.length; i++) {
        accumulatedOffset += durations[i - 1] - CROSSFADE_DURATION;
        const outLabel = i === normPaths.length - 1 ? '[vout]' : `[v${i}]`;
        filterParts.push(
            `${lastLabel}[${i}:v]xfade=transition=fade:duration=${CROSSFADE_DURATION}:offset=${accumulatedOffset.toFixed(2)}${outLabel}`
        );
        lastLabel = outLabel;
    }

    const filterComplex = filterParts.join(';');
    const outputPath = path.join(tmpDir, 'final.mp4');

    await execFileAsync('ffmpeg', [
        '-y', ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[vout]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
        '-movflags', '+faststart',
        outputPath,
    ], { timeout: 300000 }); // 5 min timeout for stitching

    console.log(`[LongForm ${jobId}] ✅ Stitched ${normPaths.length} segments with crossfade → ${outputPath}`);
    return outputPath;
}

// ── Per-Scene TTS Engine ─────────────────────────────────────────────────────
// Generates voiceover audio for a single scene's dialogue.
// Sarvam Bulbul v2 for Indian languages, OpenAI gpt-4o-mini-tts for global.

const EMOTION_INSTRUCTIONS = {
    excited:    'Speak with genuine excitement and high energy. Fast-paced and infectious.',
    warm:       'Speak warmly and conversationally, like talking to a close friend.',
    urgent:     'Speak with urgency and conviction. Direct, persuasive, slightly faster pace.',
    calm:       'Speak calmly and authoritatively. Measured pace, confident tone.',
    playful:    'Speak playfully with a smile in your voice. Light, teasing energy.',
    dramatic:   'Speak dramatically with emotional weight. Slow, deliberate pauses.',
    curious:    'Speak with genuine curiosity and wonder. Rising intonation on key phrases.',
    confident:  'Speak with strong confidence and authority. Steady, unwavering.',
    mysterious: 'Speak in a low, intriguing tone. Slight whisper quality on key phrases.',
    empathetic: 'Speak with deep empathy and understanding. Soft, caring.',
    neutral:    'Speak naturally and clearly with an engaging, professional tone.',
};

const SARVAM_EMOTION_MAP = {
    excited:   { pitch: 2, pace: 1.2, loudness: 1.8 },
    warm:      { pitch: 0, pace: 0.9, loudness: 1.3 },
    urgent:    { pitch: 1, pace: 1.3, loudness: 1.8 },
    calm:      { pitch: -1, pace: 0.85, loudness: 1.2 },
    playful:   { pitch: 2, pace: 1.1, loudness: 1.5 },
    dramatic:  { pitch: -2, pace: 0.75, loudness: 1.6 },
    curious:   { pitch: 1, pace: 1.0, loudness: 1.4 },
    confident: { pitch: 0, pace: 0.95, loudness: 1.7 },
    neutral:   { pitch: 0, pace: 1.0, loudness: 1.5 },
};

/**
 * Generate TTS audio for a single scene's dialogue.
 * @param {string} text - The dialogue text to speak
 * @param {string} language - Language name (e.g. 'Hindi', 'English', 'French')
 * @param {string} emotion - Emotion tag (e.g. 'excited', 'calm', 'urgent')
 * @returns {Promise<string|null>} - S3 URL of the audio file, or null
 */
async function generateSceneTTS(text, language, emotion = 'neutral') {
    if (!text || text.length < 5) return null;

    const langCode = LANG_TO_CODE[language] || 'en-IN';
    const isSarvam = SARVAM_SUPPORTED.has(langCode);

    try {
        if (isSarvam) {
            return await _sarvamTTS(text, langCode, emotion);
        } else {
            return await _openaiTTS(text, emotion, language, langCode);
        }
    } catch (err) {
        console.warn(`⚠️ [SceneTTS] Primary TTS failed (${isSarvam ? 'Sarvam' : 'OpenAI'}): ${err.message}`);
        // Fallback: if Sarvam failed, try OpenAI
        if (isSarvam) {
            try { return await _openaiTTS(text, emotion, language, langCode); } catch {}
        }
        return null;
    }
}

async function _sarvamTTS(text, langCode, emotion) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) { console.warn('🎤 [SceneTTS] SARVAM_API_KEY not set'); return null; }

    const emo = SARVAM_EMOTION_MAP[emotion] || SARVAM_EMOTION_MAP.neutral;
    const speaker = SARVAM_VOICES[langCode] || 'anushka';

    const resp = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': apiKey },
        body: JSON.stringify({
            inputs: [text.substring(0, 2000)],
            target_language_code: langCode,
            speaker,
            model: 'bulbul:v2',
            pitch: emo.pitch,
            pace: emo.pace,
            loudness: emo.loudness,
            enable_preprocessing: true,
        }),
    });

    if (!resp.ok) throw new Error(`Sarvam TTS ${resp.status}`);
    const data = await resp.json();
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) throw new Error('No audio from Sarvam');

    const buffer = Buffer.from(audioBase64, 'base64');
    const s3Key = `video-studio/longform/tts/${Date.now()}-${Math.random().toString(36).substring(7)}.wav`;
    return await uploadToS3(buffer, s3Key, 'audio/wav');
}

async function _openaiTTS(text, emotion, language, langCode) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) { console.warn('🎤 [SceneTTS] OPENAI_API_KEY not set'); return null; }

    const instruction = EMOTION_INSTRUCTIONS[emotion] || EMOTION_INSTRUCTIONS.neutral;
    const voice = OPENAI_VOICES[langCode] || 'nova';
    const langNote = language !== 'English' ? ` Speak fluently in ${language} with an authentic native accent.` : '';

    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice,
            input: text.substring(0, 4000),
            instructions: `${instruction}${langNote} This is a voiceover for a cinematic video advertisement.`,
            response_format: 'mp3',
        }),
    });

    if (!resp.ok) throw new Error(`OpenAI TTS ${resp.status}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    const s3Key = `video-studio/longform/tts/${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
    return await uploadToS3(buffer, s3Key, 'audio/mpeg');
}
