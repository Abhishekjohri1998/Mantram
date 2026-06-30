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
import ffmpegPath from 'ffmpeg-static';
import {
    extractLastFrameToS3,
} from '../../utils/ffmpegUtils.js';

const execFileAsync = promisify(execFile);

// ── TTS Engine (removed) ──────────────

// ── Background Music Presets (removed) ─────────────────────────────────────────────────

// ── Progress Phases ──────────────────────────────────────────────────────────
const PHASES = {
    PLANNING:     { label: 'Planning scenes...', range: [0, 5] },
    GENERATING:   { label: 'Generating scenes', range: [5, 75] },
    DOWNLOADING:  { label: 'Downloading segments...', range: [75, 80] },
    STITCHING:    { label: 'Stitching video...', range: [80, 100] },
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
    const maxPerSegment = { 'veo-3.1': 8, 'veo-3.1-fast': 8, 'veo-3.1-lite': 8, 'hunyuan': 10 }[model] || 15;
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
        let completedScenes = 0;
        let lastFrameUrl = null;

        for (let i = 0; i < scenes.length; i++) {
            if (job.cancelled) throw new Error('Cancelled by user');

            const scene = scenes[i];
            job.sceneStatuses[i] = { status: 'generating', progress: 0 };

            updateProgress(jobId, 'GENERATING',
                `Scene ${i + 1}/${scenes.length} — TTS + Video (${scene.role})`,
                (completedScenes / scenes.length) * 100);

            try {
                // ── Step 2b: Build scene prompt ──
                let scenePrompt = scene.visualPrompt || scene.prompt || params.prompt;
                if (scene.camerawork) scenePrompt += `\n${scene.camerawork}`;
                scenePrompt += '\nMaintain visual consistency throughout. Ensure natural smooth movements. Generate video without subtitles.';

                // ── Step 2c: Generate scene video ──
                const isSeedance = params.model.startsWith('seedance');
                let genResult;

                if (isSeedance) {
                    genResult = await submitAtlasCloudVideoGeneration({
                        model: params.model,
                        prompt: scenePrompt,
                        imageUrl: lastFrameUrl,
                        duration: scene.duration,
                        aspectRatio: params.aspectRatio,
                        generateAudio: false, // Native audio disabled — long-form uses FFmpeg audio pipeline
                        referenceImages: params.referenceImages.slice(0, 9),
                        qualityMode: params.settings?.quality || 'fast',
                        imageRole: params.imageRole,
                    });
                } else {
                    genResult = await submitVideoGeneration({
                        model: params.model,
                        prompt: scenePrompt,
                        imageUrl: lastFrameUrl,
                        duration: scene.duration,
                        aspectRatio: params.aspectRatio,
                        generateAudio: false, // Native audio disabled — long-form uses FFmpeg audio pipeline
                        referenceImages: params.referenceImages.slice(0, 9),
                    });
                }

                // Poll until complete
                let videoUrl = await pollUntilComplete(genResult, jobId, i, scenes.length);

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
                            model: params.model,
                            prompt: scene.visualPrompt || params.prompt,
                            imageUrl: lastFrameUrl,
                            duration: scene.duration,
                            aspectRatio: params.aspectRatio,
                            generateAudio: false, // Native audio disabled — see primary generation
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
                            generateAudio: false, // Native audio disabled — see primary generation
                            referenceImages: params.referenceImages.slice(0, 9),
                        });
                    }

                    let retryUrl = await pollUntilComplete(retryResult, jobId, i, scenes.length);

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

        // ═══ Phase 5: Final Upload ═══
        updateProgress(jobId, 'STITCHING', 'Uploading to S3...', 50);

        const finalBuffer = fs.readFileSync(finalVideoPath);
        const s3Key = `video-studio/longform/${jobId}/final-${Date.now()}.mp4`;
        const videoUrl = await uploadToS3(finalBuffer, s3Key, 'video/mp4');

        updateProgress(jobId, 'STITCHING', 'Complete!', 100);
        job.status = 'COMPLETED';
        job.progress = 100;
        job.videoUrl = videoUrl;
        job.completedAt = new Date();

        console.log(`[LongForm ${jobId}] ✅ Complete: ${videoUrl.substring(0, 80)}...`);

        // ═══ Auto-Persist to MongoDB ═══
        // This ensures the VideoProject is updated even if the frontend never polls
        // the /long-form/status endpoint (e.g., user closed the tab).
        try {
            const mongoose = (await import('mongoose')).default;
            const VideoProject = mongoose.model('VideoProject');
            const persisted = await VideoProject.findOneAndUpdate(
                { 'generation.longFormJobId': jobId },
                {
                    status: 'done',
                    finalVideoUrl: videoUrl,
                    'generation.videoUrl': videoUrl,
                    'generation.progress': 100,
                    'generation.status': 'COMPLETED',
                    'generation.voiceoverStatus': 'done',
                },
                { returnDocument: 'after' }
            );
            if (persisted) {
                console.log(`[LongForm ${jobId}] ✅ Auto-persisted to MongoDB — project ${persisted._id} status=done`);
            } else {
                console.warn(`[LongForm ${jobId}] ⚠️ No VideoProject found with longFormJobId=${jobId}`);
            }
        } catch (dbErr) {
            console.error(`[LongForm ${jobId}] ⚠️ Auto-persist to MongoDB failed: ${dbErr.message}`);
        }

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
                const err = new Error(status.error || `Scene generation failed (${provider})`);
                err.isTerminal = true;
                throw err;
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
            if (pollErr.isTerminal) throw pollErr;
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
        await execFileAsync(ffmpegPath, [
            '-y', '-i', segmentPaths[0],
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
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
        await execFileAsync(ffmpegPath, [
            '-y', '-i', segmentPaths[i],
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
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

    try {
        await execFileAsync(ffmpegPath, [
            '-y', ...inputs,
            '-filter_complex', filterComplex,
            '-map', '[vout]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 300000 }); // 5 min timeout for stitching
    } catch (xfadeErr) {
        console.warn(`[LongForm ${jobId}] xfade filter failed or unsupported: ${xfadeErr.message}. Falling back to simple concat...`);
        const concatFilter = normPaths.map((_, idx) => `[${idx}:v]`).join('') + `concat=n=${normPaths.length}:v=1:a=1[vout]`;
        await execFileAsync(ffmpegPath, [
            '-y', ...inputs,
            '-filter_complex', concatFilter,
            '-map', '[vout]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 300000 });
    }

    console.log(`[LongForm ${jobId}] ✅ Stitched ${normPaths.length} segments → ${outputPath}`);
    return outputPath;
}

