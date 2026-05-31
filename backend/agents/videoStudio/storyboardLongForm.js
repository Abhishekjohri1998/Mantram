/**
 * Storyboard Long-Form Orchestrator
 *
 * Enables the Storyboard Studio to generate videos LONGER than 15 seconds
 * by splitting the requested duration into multiple segments, generating each
 * via Atlas Seedance I2V, and stitching them together with FFmpeg crossfades.
 *
 * Architecture:
 *   1. PLANNING    — allocate N segments from totalDuration (re-uses scenePlanner helpers)
 *   2. GENERATING  — sequential I2V with last-frame chaining for visual continuity
 *   3. TTS         — per-segment voiceover if voiceoverScript provided (from longFormGenerator)
 *   4. STITCHING   — FFmpeg normalize + crossfade stitch
 *   5. MUXING      — mix BGM + voiceover onto stitched video
 *   6. UPLOADING   — S3 upload + MongoDB auto-persist
 *
 * The storyboard master poster is injected as a reference image in every
 * segment so the overall visual style remains consistent throughout.
 *
 * Re-uses:
 *   - allocateSceneDurations()       from scenePlanner.js
 *   - submitAtlasCloudVideoGeneration, getAtlasCloudGenerationStatus  from atlasClient.js
 *   - extractLastFrameToS3, muxAudioAndMux, concatSceneAudios, mixAudioAndMux  from ffmpegUtils.js
 *   - getLongFormJobStatus + stitchWithCrossfade patterns  from longFormGenerator.js
 *   - generateSceneTTS pattern (inline, re-implemented below to keep file standalone)
 *   - uploadToS3  from s3.js
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import ffmpegPath from 'ffmpeg-static';
import { allocateSceneDurations, planStoryboardScenes } from './scenePlanner.js';
import { submitAtlasCloudVideoGeneration, getAtlasCloudGenerationStatus, submitGeminiFlashVideoGeneration } from './atlasClient.js';
import {
    extractLastFrameToS3,
} from '../../utils/ffmpegUtils.js';
import { uploadToS3 } from '../../utils/s3.js';

const execFileAsync = promisify(execFile);

// ── Segment sizing constants ─────────────────────────────────────────────────
const OPTIMAL_SEGMENT_DURATION = 10; // seconds — keeps each Seedance task well within its 15s limit

// ── BGM presets (removed) ───────────────────────────────────

// ── Progress phases ───────────────────────────────────────────────────────────
const PHASES = {
    PLANNING:    { label: 'Planning segments...',        range: [0,   5] },
    GENERATING:  { label: 'Generating video segments',   range: [5,  75] },
    DOWNLOADING: { label: 'Downloading segments...',     range: [75, 80] },
    STITCHING:   { label: 'Stitching video...',          range: [80, 100] },
};

// ── In-memory job tracker (shared with longFormGenerator via same pattern) ────
// NOTE: this is a SEPARATE Map. Storyboard long-form jobs start with 'sb-lf-'.
const activeJobs = new Map();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the current status of a storyboard long-form job.
 * Returns null if the jobId is unknown.
 *
 * @param {string} jobId
 * @returns {{ status, phase, phaseLabel, detail, progress, videoUrl, error } | null}
 */
export function getStoryboardLongFormJobStatus(jobId) {
    return activeJobs.get(jobId) || null;
}

/**
 * Cancel a running storyboard long-form job.
 * @param {string} jobId
 */
export function cancelStoryboardLongFormJob(jobId) {
    const job = activeJobs.get(jobId);
    if (job) { job.cancelled = true; job.status = 'CANCELLED'; return true; }
    return false;
}

/**
 * Estimate total credits needed for a long-form storyboard job.
 * Each Seedance I2V segment costs the same as a regular storyboard animation.
 *
 * @param {number} totalDuration
 * @returns {{ segments, creditsPerSegment, totalCredits }}
 */
export function estimateStoryboardLongFormCredits(totalDuration) {
    const count = Math.ceil(totalDuration / OPTIMAL_SEGMENT_DURATION);
    const creditsPerSegment = 15; // same cost as storyboardAnimate for one shot
    return {
        segments: count,
        creditsPerSegment,
        totalCredits: count * creditsPerSegment,
    };
}

/**
 * Start a long-form storyboard video generation job.
 * Fires and forgets — returns a jobId immediately.
 * Poll with getStoryboardLongFormJobStatus(jobId).
 *
 * @param {object} params
 * @param {string}   params.projectId         — MongoDB VideoProject._id (for auto-persist)
 * @param {string}   params.userId            — User ID (for credit deduction)
 * @param {string}   params.imageUrl          — Master storyboard poster URL (used as reference for ALL segments)
 * @param {string}   params.firstFrameUrl     — Actual first frame / product image URL (for the opening segment)
 * @param {string}   params.videoPrompt       — The main video generation prompt
 * @param {number}   params.totalDuration     — Target total duration in seconds (>15)
 * @param {string}   params.format            — Aspect ratio string (e.g. '9:16')
 * @param {string}   params.resolution        — '480p' | '720p' | '1080p'
 * @param {Array}    params.referenceImages   — [{url, role}] reference images (avatar, product, etc.)
 * @param {string}   params.model             — 'seedance-2.0' | 'seedance-2.0-fast'
 * @param {string}   params.qualityMode       — 'fast' | 'quality'
 * @param {string}   [params.voiceoverScript] — Full voiceover script (optional)
 * @param {string}   [params.voiceoverLanguage] — Language for TTS (optional)
 * @param {string}   [params.bgmPreset]       — BGM mood: 'cinematic' | 'upbeat' | etc. (optional)
 * @returns {string} jobId
 */
export function startStoryboardLongForm({
    projectId,
    userId,
    imageUrl,
    firstFrameUrl,
    videoPrompt,
    totalDuration,
    format = '9:16',
    resolution = '720p',
    referenceImages = [],
    model = 'seedance-2.0-fast',
    qualityMode = 'fast',
    voiceoverScript = '',
    voiceoverLanguage = 'English',
    bgmPreset = 'cinematic',
}) {
    const jobId = `sb-lf-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const job = {
        jobId,
        status: 'GENERATING',
        phase: 'PLANNING',
        phaseLabel: 'Planning segments...',
        detail: '',
        progress: 0,
        cancelled: false,
        segmentStatuses: [],
        videoUrl: null,
        error: null,
        startedAt: new Date(),
        totalDuration,
        model,
    };
    activeJobs.set(jobId, job);

    console.log(`[SB LongForm ${jobId}] 🎬 Starting — ${totalDuration}s ${format} ${model} | projectId=${projectId}`);

    // Fire-and-forget background pipeline
    _runPipeline(jobId, {
        projectId, userId, imageUrl, firstFrameUrl, videoPrompt,
        totalDuration, format, resolution, referenceImages, model, qualityMode,
        voiceoverScript, voiceoverLanguage, bgmPreset,
    }).catch(err => {
        const j = activeJobs.get(jobId);
        if (j) { j.status = 'FAILED'; j.error = err.message; j.progress = 0; }
        console.error(`[SB LongForm ${jobId}] ❌ Pipeline failed: ${err.message}`);
    });

    return jobId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal pipeline
// ─────────────────────────────────────────────────────────────────────────────

function _setProgress(jobId, phase, detail = '', subProgress = 0) {
    const job = activeJobs.get(jobId);
    if (!job) return;
    const [min, max] = PHASES[phase]?.range || [0, 100];
    const progress = Math.round(min + (subProgress / 100) * (max - min));
    job.phase = phase;
    job.phaseLabel = PHASES[phase]?.label || phase;
    job.detail = detail;
    job.progress = Math.min(progress, 99);
    console.log(`[SB LongForm ${jobId}] ${job.phaseLabel} — ${detail} (${job.progress}%)`);
}

async function _runPipeline(jobId, params) {
    const job = activeJobs.get(jobId);
    const tmpDir = path.join(os.tmpdir(), `sb-longform-${jobId}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        // ═══ Phase 1: Segment Planning ═══════════════════════════════════════
        _setProgress(jobId, 'PLANNING', 'Allocating segment durations...', 0);

        const segCount  = Math.ceil(params.totalDuration / OPTIMAL_SEGMENT_DURATION);
        const durations = allocateSceneDurations(params.totalDuration, segCount, params.model || 'seedance-2.0');

        job.segmentStatuses = durations.map(() => ({ status: 'pending', progress: 0 }));

        // Load project info and brand context from MongoDB
        let brandContext = '';
        let productName = '';
        let productFeatures = '';
        let dialogueLanguage = params.voiceoverLanguage || 'English';
        let voiceoverScript = params.voiceoverScript || '';

        if (params.projectId) {
            try {
                const mongoose = (await import('mongoose')).default;
                const VideoProject = mongoose.model('VideoProject');
                const Brand = mongoose.model('Brand');
                const project = await VideoProject.findById(params.projectId).populate('brand');
                if (project) {
                    if (project.storyboard) {
                        if (project.storyboard.dialogueLanguage) {
                            dialogueLanguage = project.storyboard.dialogueLanguage;
                        }
                        if (project.storyboard.voiceoverScript && !voiceoverScript) {
                            voiceoverScript = project.storyboard.voiceoverScript;
                        }
                    }
                    if (project.brand) {
                        const brand = project.brand;
                        productName = brand.name || '';
                        if (brand.dna) {
                            const desc = brand.dna.brandDescription || brand.dna.companyOverview || '';
                            const tagline = brand.dna.tagline || '';
                            const personality = brand.dna.voice?.personality || '';
                            const voiceDesc = brand.dna.voice?.description || '';
                            const uniqueSellingPoints = Array.isArray(brand.dna.uniqueSellingPoints) ? brand.dna.uniqueSellingPoints.join(', ') : '';
                            brandContext = `Brand Name: ${brand.name || ''}\nTagline: ${tagline}\nDescription: ${desc}\nVoice/Personality: ${personality} - ${voiceDesc}\nUSPs: ${uniqueSellingPoints}`;
                        }
                    }
                    if (project.input) {
                        productFeatures = project.input.brief || '';
                    }
                }
            } catch (dbErr) {
                console.warn(`[SB LongForm ${jobId}] Failed to load project metadata from DB: ${dbErr.message}`);
            }
        }

        _setProgress(jobId, 'PLANNING', 'Planning storyboard scenes...', 30);
        let scenes = [];
        try {
            scenes = await planStoryboardScenes({
                videoPrompt: params.videoPrompt,
                imageUrl: params.imageUrl,
                targetDuration: params.totalDuration,
                model: params.model,
                language: dialogueLanguage,
                brandContext,
                productName,
                productFeatures,
                referenceImages: params.referenceImages || [],
            });
            console.log(`[SB LongForm ${jobId}] 📋 Decomposed into ${scenes.length} scenes.`);
        } catch (planErr) {
            console.error(`[SB LongForm ${jobId}] Scene planning failed: ${planErr.message}. Using fallback.`);
            scenes = durations.map((dur, i) => ({
                sceneId: i + 1,
                duration: dur,
                visualPrompt: `Segment ${i + 1} of ${segCount}: Continue storyboard flow. ${params.videoPrompt?.substring(0, 300)}`,
                dialogue: [],
            }));
        }

        job.scenes = scenes;

        _setProgress(jobId, 'PLANNING', `${segCount} segments × ~${durations[0]}s each`, 100);
        console.log(`[SB LongForm ${jobId}] 📋 Segment plan: ${durations.map((d, i) => `#${i+1}(${d}s)`).join(' → ')}`);

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 2: Sequential I2V Generation ══════════════════════════════
        const segmentVideoUrls = new Array(segCount).fill(null);
        const segmentAudioUrls = new Array(segCount).fill(null);
        // Initialize lastFrameUrl for segment chaining.
        // Segment 1 uses params.firstFrameUrl (product/avatar image) as its opening frame.
        // If firstFrameUrl is null (no product image), segment 1 runs as text-to-video.
        // Subsequent segments chain from the last frame of the previous segment.
        // NOTE: params.imageUrl is the STORYBOARD POSTER — it's a style reference, never a first frame.
        let lastFrameUrl = params.firstFrameUrl || null;
        let completedCount = 0;

        for (let i = 0; i < segCount; i++) {
            if (job.cancelled) throw new Error('Cancelled by user');

            job.segmentStatuses[i] = { status: 'generating', progress: 0 };
            _setProgress(jobId, 'GENERATING',
                `Segment ${i+1}/${segCount} — ${durations[i]}s`,
                (completedCount / segCount) * 100,
            );

            // First segment: use product/avatar image as the opening frame anchor.
            // If no product/avatar image → text-to-video (imageUrl=null is fine for Atlas).
            // Subsequent segments: use last frame of previous segment for continuity.
            // NEVER use the storyboard poster as a first frame — it's a style reference only.
            const segmentFirstFrameUrl = i === 0 ? (params.firstFrameUrl || null) : lastFrameUrl;

            // Build references: always inject storyboard poster as style guide for EVERY segment.
            // This keeps colour grading, composition and overall visual style consistent.
            const posterStyleRef = params.imageUrl ? [{ url: params.imageUrl, role: 'style_reference' }] : [];
            const segmentRefs = [...posterStyleRef, ...params.referenceImages];

            // Build per-segment prompt — enrich with position context
            const isLast   = i === segCount - 1;
            // IMPORTANT: Only the FINAL segment should close with the brand logo/CTA.
            // Do NOT add brand opening or closing hooks to intermediate segments —
            // that causes the logo to appear at the start/end of every video cut.
            const positionHint = i === 0
                ? 'This is the OPENING segment — establish the visual world and hook the viewer immediately. The scene should open strong and cinematic.'
                : isLast
                ? 'This is the FINAL segment — build to the story\'s emotional peak, then end with a single, unified brand closing shot in the last few seconds ONLY (product beauty shot + brand name). The brand logo/CTA must appear exactly ONCE at the very end of this segment, not before.'
                : `This is a CONTINUATION segment — maintain exact visual style from the previous segment. Seamlessly continue the action. DO NOT include any brand opening, brand logo, or closing CTA — those belong only in the final segment.`;

            const scenePrompt = scenes[i]?.visualPrompt || params.videoPrompt;
            const segPrompt = `${scenePrompt}\n\n${positionHint}\nSegment ${i+1} of ${segCount}. Maintain absolute visual consistency.`;

            const qualityMode = params.model === 'seedance-2.0' ? 'quality' : 'fast';

            try {
                let genResult;
                if (params.model === 'gemini-flash') {
                    genResult = await submitGeminiFlashVideoGeneration({
                        prompt: segPrompt,
                        imageUrl: segmentFirstFrameUrl,
                        duration: durations[i],
                        aspectRatio: params.format,
                        resolution: params.resolution,
                        referenceImages: segmentRefs.slice(0, 6),
                    });
                } else {
                    genResult = await submitAtlasCloudVideoGeneration({
                        prompt: segPrompt,
                        imageUrl: segmentFirstFrameUrl,
                        duration: durations[i],
                        aspectRatio: params.format,
                        generateAudio: true,  // Native audio only
                        referenceImages: segmentRefs.slice(0, 6),
                        qualityMode,
                        resolution: params.resolution,
                        imageRole: 'mixed',
                    });
                }

                // Poll until complete
                const videoUrl = await _pollSegment(genResult, jobId, i, segCount);

                segmentVideoUrls[i] = videoUrl;
                job.segmentStatuses[i] = { status: 'completed', progress: 100, videoUrl };
                completedCount++;

                _setProgress(jobId, 'GENERATING',
                    `${completedCount}/${segCount} segments done`,
                    (completedCount / segCount) * 100,
                );

                // Extract last frame for the next segment's first-frame anchor
                if (i < segCount - 1) {
                    try {
                        lastFrameUrl = await extractLastFrameToS3(videoUrl);
                        console.log(`[SB LongForm ${jobId}] 🖼️ Last frame seg ${i+1}: ${lastFrameUrl?.substring(0, 70)}`);
                    } catch (frameErr) {
                        console.warn(`[SB LongForm ${jobId}] ⚠️ Last frame extraction failed: ${frameErr.message} — next segment will use firstFrameUrl fallback`);
                        // Fallback: use product/avatar first-frame rather than the poster
                        // (poster is a style reference, not suitable as a video start-frame)
                        lastFrameUrl = params.firstFrameUrl || null;
                    }
                }

            } catch (segErr) {
                console.error(`[SB LongForm ${jobId}] ❌ Segment ${i+1} failed: ${segErr.message}`);
                job.segmentStatuses[i] = { status: 'failed', error: segErr.message };

                // One retry — without refAudio to maximize success
                try {
                    console.log(`[SB LongForm ${jobId}] 🔄 Retrying segment ${i+1} (no TTS)...`);
                    let retryResult;
                    if (params.model === 'gemini-flash') {
                        retryResult = await submitGeminiFlashVideoGeneration({
                            prompt: segPrompt,
                            imageUrl: segmentFirstFrameUrl,
                            duration: durations[i],
                            aspectRatio: params.format,
                            resolution: params.resolution,
                            referenceImages: segmentRefs.slice(0, 6),
                        });
                    } else {
                        retryResult = await submitAtlasCloudVideoGeneration({
                            prompt: segPrompt,
                            imageUrl: segmentFirstFrameUrl,
                            duration: durations[i],
                            aspectRatio: params.format,
                            generateAudio: true,
                            referenceImages: segmentRefs.slice(0, 6),
                            qualityMode,
                            resolution: params.resolution,
                            imageRole: 'mixed',
                        });
                    }
                    const retryUrl = await _pollSegment(retryResult, jobId, i, segCount);
                    segmentVideoUrls[i] = retryUrl;
                    job.segmentStatuses[i] = { status: 'completed', progress: 100, videoUrl: retryUrl };
                    completedCount++;

                    if (i < segCount - 1) {
                        try { lastFrameUrl = await extractLastFrameToS3(retryUrl); }
                        catch { lastFrameUrl = params.firstFrameUrl || null; }
                    }
                } catch (retryErr) {
                    // If even the retry fails, skip this segment and continue
                    console.error(`[SB LongForm ${jobId}] ❌ Segment ${i+1} retry also failed: ${retryErr.message}. Skipping.`);
                }
            }
        }

        const validVideos = segmentVideoUrls.filter(Boolean);
        if (validVideos.length === 0) {
            throw new Error('No video segments were generated successfully.');
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 3: Download all segments ══════════════════════════════════
        _setProgress(jobId, 'DOWNLOADING', 'Downloading segment files...', 0);
        const segmentPaths = [];
        for (let i = 0; i < validVideos.length; i++) {
            const segPath = path.join(tmpDir, `seg-${i+1}.mp4`);
            const resp = await fetch(validVideos[i], { signal: AbortSignal.timeout(120000) });
            if (!resp.ok) throw new Error(`Failed to download segment ${i+1}: ${resp.status}`);
            fs.writeFileSync(segPath, Buffer.from(await resp.arrayBuffer()));
            segmentPaths.push(segPath);
            _setProgress(jobId, 'DOWNLOADING', `${i+1}/${validVideos.length}`, ((i+1) / validVideos.length) * 100);
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 4: FFmpeg Normalize + Crossfade Stitch ════════════════════
        _setProgress(jobId, 'STITCHING', 'Normalizing and crossfading...', 0);
        
        // Build valid durations for the successful segments
        const validDurations = segmentVideoUrls
            .map((url, idx) => url ? durations[idx] : null)
            .filter(v => v !== null);

        const stitchedPath = await _stitchWithCrossfade(tmpDir, segmentPaths, params.format, validDurations, jobId);
        _setProgress(jobId, 'STITCHING', 'Stitch complete', 50);

        if (job.cancelled) throw new Error('Cancelled by user');

        _setProgress(jobId, 'STITCHING', 'Uploading to S3...', 75);

        const finalBuffer = fs.readFileSync(stitchedPath);
        const s3Key = `storyboard/longform/${params.projectId || jobId}/final-${Date.now()}.mp4`;
        const videoUrl = await uploadToS3(finalBuffer, s3Key, 'video/mp4');

        _setProgress(jobId, 'STITCHING', 'Complete!', 100);
        job.status = 'COMPLETED';
        job.progress = 100;
        job.videoUrl = videoUrl;
        job.completedAt = new Date();

        console.log(`[SB LongForm ${jobId}] ✅ Done — ${videoUrl.substring(0, 80)}...`);

        // ═══ Auto-persist to MongoDB ══════════════════════════════════════════
        if (params.projectId) {
            try {
                const mongoose = (await import('mongoose')).default;
                const VideoProject = mongoose.model('VideoProject');

                let fullVoiceoverScript = voiceoverScript;
                if (!fullVoiceoverScript && scenes && scenes.length > 0) {
                    fullVoiceoverScript = scenes
                        .map(s => (s.dialogue || []).map(d => d.text).join(' '))
                        .filter(Boolean)
                        .join('\n');
                }

                await VideoProject.findByIdAndUpdate(params.projectId, {
                    'storyboard.status': 'done',
                    'storyboard.progress': 100,
                    'storyboard.finalVideoUrl': videoUrl,
                    'storyboard.longFormJobId': jobId,
                    'storyboard.voiceoverScript': fullVoiceoverScript,
                    status: 'done',
                    finalVideoUrl: videoUrl,
                });
                console.log(`[SB LongForm ${jobId}] ✅ Auto-persisted to MongoDB — project ${params.projectId}`);
            } catch (dbErr) {
                console.error(`[SB LongForm ${jobId}] ⚠️ Auto-persist failed: ${dbErr.message}`);
            }
        }

        return videoUrl;

    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll a single segment until complete
// ─────────────────────────────────────────────────────────────────────────────
async function _pollSegment(genResult, jobId, segIdx, totalSegs) {
    const taskId       = genResult.taskId || genResult.requestId;
    const maxPollMs    = 12 * 60 * 1000; // 12 min max per segment
    const pollInterval = 5000;
    const start        = Date.now();

    while (Date.now() - start < maxPollMs) {
        const job = activeJobs.get(jobId);
        if (job?.cancelled) throw new Error('Cancelled by user');

        await new Promise(r => setTimeout(r, pollInterval));

        try {
            const status = await getAtlasCloudGenerationStatus(taskId);

            if (status.status === 'COMPLETED' && status.videoUrl) {
                console.log(`[SB LongForm ${jobId}] ✅ Segment ${segIdx+1}/${totalSegs} complete: ${status.videoUrl.substring(0, 60)}`);
                return status.videoUrl;
            }
            if (status.status === 'FAILED') {
                const err = new Error(status.error || `Segment ${segIdx+1} generation failed`);
                err.isTerminal = true;
                throw err;
            }

            if (job) {
                job.segmentStatuses[segIdx] = { status: 'generating', progress: status.progress || 30 };
            }
        } catch (pollErr) {
            if (pollErr.message === 'Cancelled by user') throw pollErr;
            if (pollErr.isTerminal) throw pollErr;
            console.warn(`[SB LongForm ${jobId}] Poll error (seg ${segIdx+1}): ${pollErr.message}`);
        }
    }
    throw new Error(`Segment ${segIdx+1} timed out after ${maxPollMs / 60000} minutes`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FFmpeg: Normalize + Crossfade Stitch
// (identical algorithm to longFormGenerator.stitchWithCrossfade)
// ─────────────────────────────────────────────────────────────────────────────
async function _stitchWithCrossfade(tmpDir, segmentPaths, aspectRatio = '9:16', prePlannedDurations = [], jobId = '') {
    const [w, h] = aspectRatio === '16:9' ? [1920, 1080]
        : aspectRatio === '1:1'  ? [1080, 1080]
        : [1080, 1920]; // 9:16 default

    const CROSSFADE_DURATION = 0.5; // 0.5s crossfade — subtle, not jarring

    if (segmentPaths.length === 1) {
        const outPath = path.join(tmpDir, 'stitched.mp4');
        await execFileAsync(ffmpegPath, [
            '-y', '-i', segmentPaths[0],
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            outPath,
        ], { timeout: 120000 });
        return outPath;
    }

    // Step 1: Normalize all segments to the same resolution/fps — PRESERVE AUDIO
    // Add a silent audio track if a segment has no audio, so concat doesn't fail
    console.log(`[SB LongForm ${jobId}] Normalizing ${segmentPaths.length} segments → ${w}x${h}@24fps (with audio)`);
    const normPaths = [];
    for (let i = 0; i < segmentPaths.length; i++) {
        const normPath = path.join(tmpDir, `norm-${i}.mp4`);
        // Use -f lavfi to generate silence as a fallback audio input.
        // Map 0:a? (optional audio from source), fall back to generated silence.
        await execFileAsync(ffmpegPath, [
            '-y', '-i', segmentPaths[i],
            '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
            '-map', '0:v:0',
            '-map', '0:a:0?',  // Use source audio if it exists
            '-shortest',
            '-movflags', '+faststart',
            normPath,
        ], { timeout: 120000 }).catch(async () => {
            // If source had no audio stream, -map 0:a:0? might still fail on some ffmpeg versions.
            // Retry with generated silence.
            console.warn(`[SB LongForm ${jobId}] Segment ${i+1} has no audio — adding silent track`);
            await execFileAsync(ffmpegPath, [
                '-y', '-i', segmentPaths[i],
                '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${prePlannedDurations[i] || 10}`,
                '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
                '-map', '0:v:0', '-map', '1:a:0',
                '-shortest',
                '-movflags', '+faststart',
                normPath,
            ], { timeout: 120000 });
        });
        normPaths.push(normPath);
    }

    // Step 2: Get actual durations of each normalized clip
    const durations = [];
    for (let i = 0; i < normPaths.length; i++) {
        const np = normPaths[i];
        try {
            const { stdout } = await execFileAsync('ffprobe', [
                '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', np,
            ], { timeout: 15000 });
            durations.push(parseFloat(stdout.trim()) || prePlannedDurations[i] || 10);
        } catch {
            durations.push(prePlannedDurations[i] || 10);
        }
    }

    // Step 3: Build xfade filter chain (VIDEO) + audio concat (AUDIO)
    console.log(`[SB LongForm ${jobId}] Building crossfade filter (${CROSSFADE_DURATION}s transitions) with audio...`);
    const inputs = normPaths.flatMap(p => ['-i', p]);

    // VIDEO: xfade chain
    const videoFilterParts = [];
    let lastLabel = '[0:v]';
    let accOffset = 0;

    for (let i = 1; i < normPaths.length; i++) {
        accOffset += durations[i - 1] - CROSSFADE_DURATION;
        const outLabel = i === normPaths.length - 1 ? '[vout]' : `[v${i}]`;
        videoFilterParts.push(
            `${lastLabel}[${i}:v]xfade=transition=fade:duration=${CROSSFADE_DURATION}:offset=${accOffset.toFixed(2)}${outLabel}`,
        );
        lastLabel = outLabel;
    }

    // AUDIO: acrossfade chain for smooth audio transitions
    const audioFilterParts = [];
    let lastAudioLabel = '[0:a]';

    for (let i = 1; i < normPaths.length; i++) {
        const outLabel = i === normPaths.length - 1 ? '[aout]' : `[a${i}]`;
        audioFilterParts.push(
            `${lastAudioLabel}[${i}:a]acrossfade=d=${CROSSFADE_DURATION}:c1=tri:c2=tri${outLabel}`,
        );
        lastAudioLabel = outLabel;
    }

    const fullFilter = [...videoFilterParts, ...audioFilterParts].join(';');

    const outputPath = path.join(tmpDir, 'stitched.mp4');
    try {
        await execFileAsync(ffmpegPath, [
            '-y', ...inputs,
            '-filter_complex', fullFilter,
            '-map', '[vout]', '-map', '[aout]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 300000 });
    } catch (xfadeErr) {
        console.warn(`[SB LongForm ${jobId}] xfade/acrossfade failed: ${xfadeErr.message}. Falling back to simple concat...`);
        // Fallback: simple concat with both video and audio
        const concatFilter = normPaths.map((_, idx) => `[${idx}:v][${idx}:a]`).join('') + `concat=n=${normPaths.length}:v=1:a=1[vout][aout]`;
        await execFileAsync(ffmpegPath, [
            '-y', ...inputs,
            '-filter_complex', concatFilter,
            '-map', '[vout]', '-map', '[aout]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 300000 });
    }

    console.log(`[SB LongForm ${jobId}] ✅ Stitched ${normPaths.length} segments → ${outputPath}`);
    return outputPath;
}
