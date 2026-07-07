/**
 * Storyboard Long-Form Orchestrator
 *
 * Enables the Storyboard Studio to generate videos LONGER than 15 seconds
 * by splitting the requested duration into multiple segments, generating each
 * via Atlas Seedance I2V, and stitching them together with FFmpeg hard cuts.
 *
 * Architecture:
 *   1. PLANNING    — allocate N segments from totalDuration (re-uses scenePlanner helpers)
 *   2. GENERATING  — sequential I2V with last-frame chaining for visual continuity
 *   3. TTS         — per-segment voiceover if voiceoverScript provided (from longFormGenerator)
 *   4. STITCHING   — FFmpeg normalize + hard concat (no dissolves)
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
import { uploadToS3, getSignedUrlIfNeeded } from '../../utils/s3.js';
import { ConcurrencyLimiter } from '../../utils/concurrencyLimiter.js';

const execFileAsync = promisify(execFile);
const atlasLimiter = new ConcurrencyLimiter(2); // Max 2 concurrent Atlas API generations to prevent 429 rate limit/concurrency blocks

// ── Segment sizing constants ─────────────────────────────────────────────────
const OPTIMAL_SEGMENT_DURATION = 15; // seconds — keeps each Seedance task well within its 15s limit

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
    // New multi-character + ref image params
    avatarUrls = [],
    avatarNames = [],
    refImageUrls = [],
    // Branding control
    includeBranding = true,
    // Pre-generated character reference sheet (stable face anchor per segment)
    characterRefSheetUrl = null,
    // Structured 4-section plan from storyboardDirector (contains cuts[] with exact timings)
    structuredPlan = null,
    // Generation mode — 'automatic' | 'manual'
    generateMode = 'automatic',
    refAudio = '',
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
        avatarUrls, avatarNames, refImageUrls,
        includeBranding, characterRefSheetUrl,
        structuredPlan, generateMode,
        refAudio,
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

        // Provisional estimate for the UI before planning completes
        job.segmentStatuses = durations.map(() => ({ status: 'pending', progress: 0 }));

        // Load project info and brand context from MongoDB
        let brandContext = '';
        let productName = '';
        let productFeatures = '';
        let dialogueLanguage = params.voiceoverLanguage || 'English';
        let voiceoverScript = params.voiceoverScript || '';
        // Multi-character support — loaded from DB if not in params
        let avatarUrls = params.avatarUrls || [];
        let avatarNames = params.avatarNames || [];
        let refImageUrls = params.refImageUrls || [];
        let existingSegmentUrls = {};

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
                        if (project.storyboard.segmentUrls) {
                            const map = project.storyboard.segmentUrls;
                            if (map instanceof Map) {
                                for (const [k, v] of map.entries()) {
                                    existingSegmentUrls[k] = v;
                                }
                            } else if (map && typeof map === 'object') {
                                for (const k of Object.keys(map)) {
                                    existingSegmentUrls[k] = map[k];
                                }
                            }
                        }
                    }
                    // Load multi-avatar data from DB (stored by /storyboard/create)
                    if (project.input) {
                        if (project.input.avatarUrls?.length > 0 && avatarUrls.length === 0) {
                            avatarUrls = project.input.avatarUrls;
                        } else if (project.input.avatarUrl && avatarUrls.length === 0) {
                            avatarUrls = [project.input.avatarUrl];
                        }
                        if (project.input.avatarNames?.length > 0 && avatarNames.length === 0) {
                            avatarNames = project.input.avatarNames;
                        }
                        if (project.input.refImageUrls?.length > 0 && refImageUrls.length === 0) {
                            refImageUrls = project.input.refImageUrls;
                        }
                        productFeatures = project.input.brief || '';
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
                }
            } catch (dbErr) {
                console.warn(`[SB LongForm ${jobId}] Failed to load project metadata from DB: ${dbErr.message}`);
            }
        }

        // Build enriched referenceImages:
        // 1. Character Reference Sheet (if generated) — FIRST, stable @imageN slot for all segments
        // 2. Individual avatar refs (fallback if no sheet, or supplemental)
        // 3. Location/element refs
        // Gate brand context and logo behind includeBranding flag
        const includeBranding = params.includeBranding !== false; // default true
        const characterRefSheetUrl = params.characterRefSheetUrl || null;

        // Sign main URL parameters on-the-fly
        const signedImageUrl = params.imageUrl ? await getSignedUrlIfNeeded(params.imageUrl) : null;
        const signedFirstFrameUrl = params.firstFrameUrl ? await getSignedUrlIfNeeded(params.firstFrameUrl) : null;
        const signedCharacterRefSheetUrl = characterRefSheetUrl ? await getSignedUrlIfNeeded(characterRefSheetUrl) : null;

        // Build the char ref sheet ref entry (stable face anchor)
        const charSheetRef = signedCharacterRefSheetUrl ? [{ url: signedCharacterRefSheetUrl, role: 'character_reference' }] : [];

        // Sign and build individual avatar refs (used only if no char ref sheet was generated)
        const signedAvatarUrls = await Promise.all(avatarUrls.map(url => getSignedUrlIfNeeded(url)));
        const avatarRefs = charSheetRef.length === 0
            ? signedAvatarUrls.map((url, i) => ({
                url,
                role: 'character_reference',
                name: avatarNames[i] || `Character ${i + 1}`,
              }))
            : [];

        // Sign and build location/element refs
        const signedRefImageUrls = await Promise.all(refImageUrls.map(url => getSignedUrlIfNeeded(url)));
        const refImgRefs = signedRefImageUrls.map((url, i) => ({
            url,
            role: 'location_reference',
            name: `ref_${i + 1}`,
        }));

        // Sign and process existing/incoming params.referenceImages
        const signedReferenceImages = await Promise.all((params.referenceImages || []).map(async r => {
            if (r && typeof r === 'object') {
                return {
                    ...r,
                    url: await getSignedUrlIfNeeded(r.url)
                };
            }
            if (typeof r === 'string') {
                return await getSignedUrlIfNeeded(r);
            }
            return r;
        }));

        // Deduplicate and build enrichedReferenceImages
        // Order: char ref sheet first → product/other existing refs → avatar fallbacks → location refs
        const existingUrls = new Set(signedReferenceImages.map(r => r.url || r));
        const extraRefs = [...charSheetRef, ...avatarRefs, ...refImgRefs].filter(r => !existingUrls.has(r.url));
        const enrichedReferenceImages = [...signedReferenceImages, ...extraRefs];

        // If branding is OFF, strip any logo reference from enrichedReferenceImages
        const finalReferenceImages = includeBranding
            ? enrichedReferenceImages
            : enrichedReferenceImages.filter(r => r.role !== 'logo');

        console.log(`[SB LongForm ${jobId}] 🧑 Char ref sheet: ${characterRefSheetUrl ? 'YES' : 'no'} | avatar fallbacks: ${avatarRefs.length} | location refs: ${refImgRefs.length}`);
        console.log(`[SB LongForm ${jobId}] 🎭 Characters: ${avatarNames.join(', ') || 'none'}`);
        console.log(`[SB LongForm ${jobId}] 📋 Total reference images: ${finalReferenceImages.length} | branding=${includeBranding}`);

        // Build a CHARACTER IDENTITY LOCK preamble for use in every segment prompt.
        // This tells the model exactly which @imageN slot is the char ref sheet,
        // what to lock (face/hair/skin only), and that wardrobe comes from the scene text.
        // Reference order in every segment: @image1=firstFrame, @image2=poster, @image3=charSheet
        // (product refs come after charSheet if > 1 product image).
        let charIdentityPreamble = '';

        _setProgress(jobId, 'PLANNING', 'Planning storyboard scenes...', 30);
        let scenes = [];
        try {
            const mongoose = (await import('mongoose')).default;
            const VideoProject = mongoose.model('VideoProject');
            const freshProject = await VideoProject.findById(params.projectId).lean();
            if (freshProject?.storyboard?.scenes?.length > 0) {
                scenes = freshProject.storyboard.scenes;
                console.log(`[SB LongForm ${jobId}] 📋 Using ${scenes.length} pre-saved scenes from DB (preserving user edits).`);

                // Ensure all scene visual prompts are sanitized
                try {
                    const { sanitizeRawText } = await import('./promptSanitizer.js');
                    scenes = scenes.map(s => ({
                        ...s,
                        visualPrompt: sanitizeRawText(s.visualPrompt || ''),
                    }));
                } catch (sErr) {}
            }
        } catch (dbLoadErr) {
            console.warn(`[SB LongForm ${jobId}] Failed to load scenes from DB: ${dbLoadErr.message}`);
        }

        if (scenes.length === 0) {
            try {
                // Pass structuredPlan so scenePlanner can use cuts[] directly (no LLM re-decomposition)
                let structuredPlan = params.structuredPlan || null;

            // RC#6/7: Pre-sanitize videoPrompt and structuredPlan cut content before scene planning.
            // These values come from MongoDB and may contain deity/religious terms from the original
            // storyboard creation. Sanitize them before they reach the video generation API.
            let safeVideoPrompt = params.videoPrompt;
            try {
                const { sanitizeRawText } = await import('./promptSanitizer.js');
                safeVideoPrompt = sanitizeRawText(params.videoPrompt || '');
                if (structuredPlan?.cuts?.length > 0) {
                    structuredPlan = {
                        ...structuredPlan,
                        cuts: structuredPlan.cuts.map(cut => ({
                            ...cut,
                            scene: sanitizeRawText(cut.scene || ''),
                            framePrompt: sanitizeRawText(cut.framePrompt || ''),
                        })),
                    };
                    console.log(`[SB LongForm ${jobId}] ✅ RC#6/7: Sanitized ${structuredPlan.cuts.length} cuts pre-flight`);
                }
            } catch (sanitizeErr) {
                console.warn(`[SB LongForm ${jobId}] ⚠️ sanitizeRawText import failed: ${sanitizeErr.message}`);
            }

            scenes = await planStoryboardScenes({
                videoPrompt: safeVideoPrompt,
                imageUrl: signedImageUrl,
                targetDuration: params.totalDuration,
                model: params.model,
                language: dialogueLanguage,
                brandContext: includeBranding ? brandContext : '',
                productName,
                productFeatures,
                referenceImages: finalReferenceImages,
                characterNames: avatarNames,
                structuredPlan,  // ← passes sanitized cuts[] for direct timing mapping
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
        }

        job.scenes = scenes;

        // ── CRITICAL: re-derive segment count and per-segment durations from scenes[] ──
        // planStoryboardScenes may return a DIFFERENT number of segments than segCount
        // (especially when structuredPlan.cuts[] are grouped into segments).
        // Always use scenes[].duration, not the old durations[] array, for API calls.
        const actualSegCount = scenes.length;
        const sceneDurations = scenes.map(s => s.duration || 10);

        _setProgress(jobId, 'PLANNING', `${actualSegCount} segments planned`, 100);
        console.log(`[SB LongForm ${jobId}] 📋 Segment plan: ${sceneDurations.map((d, i) => `#${i+1}(${d}s)`).join(' → ')}`);

        // Persist scenes[] to MongoDB so compile/regen endpoints work after server restart
        if (params.projectId) {
            try {
                const mongoose = (await import('mongoose')).default;
                const VideoProject = mongoose.model('VideoProject');
                await VideoProject.findByIdAndUpdate(params.projectId, {
                    'storyboard.scenes': scenes,
                    'storyboard.generateMode': params.generateMode || 'automatic',
                });
            } catch (e) { console.warn(`[SB LongForm ${jobId}] ⚠️ Failed to persist scenes to DB: ${e.message}`); }
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 2: Sequential I2V Generation ══════════════════════════════
        // Reset segmentStatuses to actual segment count now that we know it
        job.segmentStatuses = Array.from({ length: actualSegCount }, () => ({ status: 'pending', progress: 0 }));
        const segmentVideoUrls = new Array(actualSegCount).fill(null);
        const segmentAudioUrls = new Array(actualSegCount).fill(null);
        let completedCount = 0;

        for (let i = 0; i < actualSegCount; i++) {
            if (job.cancelled) throw new Error('Cancelled by user');

            // ── Check if segment already exists in DB (Resume Run) ──
            const existingUrl = existingSegmentUrls[String(i)] || existingSegmentUrls[i];
            if (existingUrl && existingUrl.startsWith('http')) {
                console.log(`[SB LongForm ${jobId}] ♻️ Segment ${i+1}/${actualSegCount} already generated: ${existingUrl}. Skipping generation...`);
                segmentVideoUrls[i] = existingUrl;
                job.segmentStatuses[i] = {
                    status: 'completed',
                    progress: 100,
                    videoUrl: existingUrl,
                    prompt: scenes[i]?.visualPrompt || params.videoPrompt || '',
                    duration: sceneDurations[i],
                };
                completedCount++;
                _setProgress(jobId, 'GENERATING',
                    `${completedCount}/${actualSegCount} segments done`,
                    (completedCount / actualSegCount) * 100,
                );
                continue;
            }

            // Generate each segment as a single unified video clip (up to 15s) with shot prompts
            // rather than splitting into separate 4s cut videos.
            const segmentCuts = [];
            
            if (segmentCuts.length > 0) {
                console.log(`[SB LongForm ${jobId}] 🎬 Segment ${i+1}/${actualSegCount} has ${segmentCuts.length} cuts. Generating each cut in parallel...`);
                job.segmentStatuses[i] = { status: 'generating', progress: 0, cuts: segmentCuts.length, completedCuts: 0 };
                _setProgress(jobId, 'GENERATING',
                    `Segment ${i+1}/${actualSegCount} — generating ${segmentCuts.length} cuts in parallel...`,
                    (completedCount / actualSegCount) * 100,
                );

                const posterStyleRef = signedImageUrl ? [{ url: signedImageUrl, role: 'style_reference' }] : [];
                const segmentRefs = [...posterStyleRef, ...finalReferenceImages];

                // Map and submit all cuts in parallel
                const cutPromises = segmentCuts.map(async (cut, cutIdx) => {
                    const palette = (params.structuredPlan?.colorPalette || []).join(', ');
                    const paletteNames = (params.structuredPlan?.paletteNames || []).join(', ');
                    const moodKeywords = (params.structuredPlan?.moodKeywords || []).join(', ');
                    const cinemaRules = params.structuredPlan?.cinematographyRules || '';
                    const environment = cut.environment || params.structuredPlan?.environmentFingerprint || 'Professional studio environment with cinematic lighting';
                    const materialNotes = params.structuredPlan?.materialNotes || '';
                    const emotionalArc = params.structuredPlan?.emotionalArc || '';
                    const charPreamble = avatarNames.length > 0
                        ? `CHARACTERS: ${avatarNames.map(n => `"${n}"`).join(', ')}. Lock: exact face, hair colour, skin tone per reference sheet. Wardrobe follows per-shot costume description.\n`
                        : '';
                    const isNonEnglish = dialogueLanguage.toLowerCase() !== 'english';

                    const cutPromptParts = [
                        charPreamble.trim(),
                        `STYLE: ${cinemaRules || 'Hyperrealistic cinematic live-action. Sharp focus. Shallow depth of field. Natural motion blur on fast moves.'}`,
                        `COLOR PALETTE: ${paletteNames || 'See reference'} (${palette}). Apply palette to lighting and set design — never recolor the product itself.`,
                        materialNotes ? `MATERIALS: ${materialNotes}` : null,
                        `ENVIRONMENT: ${environment}`,
                        `MOOD: ${moodKeywords || 'Premium, cinematic, engaging'}. Arc: ${emotionalArc || 'build tension then reveal'}.`,
                        isNonEnglish ? `LANGUAGE: All dialogue and voiceover MUST be in ${dialogueLanguage} script/characters.` : null,
                        '',
                        `SHOT [${cut.shot || 'MEDIUM'}, ${cut.lens || '50mm'} ${cut.move || 'STEADICAM'}]: ${cut.framePrompt || cut.scene}`,
                        '',
                        `Reference all provided @image tags for character and product visual consistency.`,
                        '4K ultra HD, cinematic detail, sharp clarity, natural textures, stable picture.',
                    ].filter(p => p !== null).join('\n');

                    let finalCutPrompt = cutPromptParts;
                    if (finalCutPrompt.length > 2200) {
                        finalCutPrompt = finalCutPrompt.substring(0, 2200);
                        if (!finalCutPrompt.includes('4K ultra HD')) finalCutPrompt += '\n4K ultra HD, cinematic detail, sharp clarity, stable picture.';
                    }

                    // First frame for opening cut of the opening segment
                    const cutFirstFrameUrl = (i === 0 && cutIdx === 0) ? signedFirstFrameUrl : null;
                    const qualityMode = params.model === 'seedance-2.0' ? 'quality' : 'fast';

                    // Seedance minimum is 4 seconds. Request 4s and trim to target (e.g. 2s or 3s)
                    const requestedDuration = Math.max(4, cut.duration);

                    let cutVideoUrl = null;
                    let lastErr = null;

                    // In-place retry logic with paced rate-limiting and concurrency control
                    for (let attempt = 1; attempt <= 2; attempt++) {
                        try {
                            // Space out concurrent submissions by 1.2s to prevent request-per-second rate limit spikes
                            await new Promise(r => setTimeout(r, cutIdx * 1200));

                            // Throttle concurrent active tasks to respect provider limits
                            await atlasLimiter.acquire();
                            try {
                                let genResult;
                                if (params.model === 'gemini-flash' || params.model === 'gemini-omni-flash') {
                                    genResult = await submitGeminiFlashVideoGeneration({
                                        prompt: finalCutPrompt,
                                        imageUrl: cutFirstFrameUrl,
                                        duration: requestedDuration,
                                        aspectRatio: params.format,
                                        resolution: params.resolution,
                                        referenceImages: segmentRefs.slice(0, 9),
                                        customCharacterNames: avatarNames,
                                    });
                                } else {
                                    genResult = await submitAtlasCloudVideoGeneration({
                                        model: params.model,
                                        prompt: finalCutPrompt,
                                        imageUrl: cutFirstFrameUrl,
                                        duration: requestedDuration,
                                        aspectRatio: params.format,
                                        generateAudio: false,
                                        referenceImages: segmentRefs.slice(0, 9),
                                        qualityMode,
                                        resolution: params.resolution,
                                        imageRole: 'mixed',
                                        customCharacterNames: avatarNames,
                                    });
                                }
                                cutVideoUrl = await _pollSegment(genResult, jobId, i, actualSegCount);
                                break;
                            } finally {
                                atlasLimiter.release();
                            }
                        } catch (e) {
                            lastErr = e;
                            console.warn(`[SB LongForm ${jobId}] Cut ${cutIdx+1} of seg ${i+1} attempt ${attempt} failed: ${e.message}`);
                            if (attempt === 1) {
                                console.log(`[SB LongForm ${jobId}] Retrying cut ${cutIdx+1} after cool-down...`);
                                await new Promise(r => setTimeout(r, 4000));
                            }
                        }
                    }

                    if (!cutVideoUrl) {
                        throw new Error(`Cut ${cutIdx+1} of segment ${i+1} failed after 2 attempts: ${lastErr?.message}`);
                    }

                    // Download to temp path
                    const localCutPath = path.join(tmpDir, `seg-${i+1}-cut-${cutIdx+1}-raw.mp4`);
                    const resp = await fetch(cutVideoUrl);
                    if (!resp.ok) throw new Error(`Failed to download cut ${cutIdx+1} video: ${resp.status}`);
                    fs.writeFileSync(localCutPath, Buffer.from(await resp.arrayBuffer()));

                    // Trim and normalize the cut clip to planned duration
                    const trimmedCutPath = path.join(tmpDir, `seg-${i+1}-cut-${cutIdx+1}-trimmed.mp4`);
                    const [w, h] = params.format === '16:9' ? [1920, 1080]
                        : params.format === '1:1'  ? [1080, 1080]
                        : [1080, 1920];

                    await execFileAsync(ffmpegPath, [
                        '-y', '-i', localCutPath,
                        '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
                        '-t', String(cut.duration),
                        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                        '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
                        '-map', '0:v:0', '-map', '1:a:0',
                        '-shortest',
                        '-movflags', '+faststart',
                        trimmedCutPath,
                    ], { timeout: 60000 });

                    try { fs.unlinkSync(localCutPath); } catch {}

                    // Update local progress metrics safely
                    const currentStatus = job.segmentStatuses[i] || {};
                    const nextCompleted = (currentStatus.completedCuts || 0) + 1;
                    job.segmentStatuses[i] = {
                        ...currentStatus,
                        completedCuts: nextCompleted,
                        progress: Math.round((nextCompleted / segmentCuts.length) * 100),
                    };

                    _setProgress(jobId, 'GENERATING',
                        `Segment ${i+1}/${actualSegCount} (${nextCompleted}/${segmentCuts.length} cuts complete)`,
                        ((completedCount + (nextCompleted / segmentCuts.length)) / actualSegCount) * 100
                    );

                    return { trimmedCutPath, index: cutIdx };
                });

                const results = await Promise.all(cutPromises);
                results.sort((a, b) => a.index - b.index);
                const sortedCutPaths = results.map(r => r.trimmedCutPath);

                // Stitch all trimmed cuts into one segment video file using filter_complex concat.
                const segmentLocalPath = path.join(tmpDir, `segment-${i+1}.mp4`);
                console.log(`[SB LongForm ${jobId}] Concat-stitching ${sortedCutPaths.length} cuts into Segment ${i+1} video via filter_complex`);
                
                const concatFilter = sortedCutPaths.map((_, idx) => `[${idx}:v][${idx}:a]`).join('') + `concat=n=${sortedCutPaths.length}:v=1:a=1[vout][aout]`;
                const inputs = sortedCutPaths.flatMap(p => ['-i', p]);
                
                await execFileAsync(ffmpegPath, [
                    '-y', ...inputs,
                    '-filter_complex', concatFilter,
                    '-map', '[vout]', '-map', '[aout]',
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                    '-c:a', 'aac', '-b:a', '192k',
                    '-movflags', '+faststart',
                    segmentLocalPath,
                ], { timeout: 120000 });

                const segBuffer = fs.readFileSync(segmentLocalPath);
                const segS3Key = `storyboard/longform/${params.projectId || jobId}/seg-${i+1}-${Date.now()}.mp4`;
                const segmentS3Url = await uploadToS3(segBuffer, segS3Key, 'video/mp4');

                segmentVideoUrls[i] = segmentS3Url;
                job.segmentStatuses[i] = {
                    status: 'completed', progress: 100, videoUrl: segmentS3Url,
                    prompt: scenes[i].visualPrompt,
                    duration: sceneDurations[i],
                };
                completedCount++;

                _setProgress(jobId, 'GENERATING',
                    `${completedCount}/${actualSegCount} segments done`,
                    (completedCount / actualSegCount) * 100,
                );

                if (params.projectId) {
                    try {
                        const mongoose = (await import('mongoose')).default;
                        const VideoProject = mongoose.model('VideoProject');
                        await VideoProject.findByIdAndUpdate(params.projectId, {
                            [`storyboard.segmentUrls.${i}`]: segmentS3Url,
                            [`storyboard.segmentPrompts.${i}`]: scenes[i].visualPrompt,
                        });
                    } catch (e) { console.warn(`[SB LongForm ${jobId}] ⚠️ Failed to persist seg ${i+1}: ${e.message}`); }
                }

                // Clean up files
                sortedCutPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });
                try { fs.unlinkSync(segmentLocalPath); } catch {}

            } else {
                job.segmentStatuses[i] = { status: 'generating', progress: 0 };
                _setProgress(jobId, 'GENERATING',
                    `Segment ${i+1}/${actualSegCount} — ${sceneDurations[i]}s`,
                    (completedCount / actualSegCount) * 100,
                );

                const segmentFirstFrameUrlRaw = i === 0 ? signedFirstFrameUrl : null;
                const segmentFirstFrameUrl = segmentFirstFrameUrlRaw ? await getSignedUrlIfNeeded(segmentFirstFrameUrlRaw) : null;
                const posterStyleRef = signedImageUrl ? [{ url: signedImageUrl, role: 'style_reference' }] : [];
                const segmentRefs = [...posterStyleRef, ...finalReferenceImages];

                // Compute dynamic character identity lock tag mapping for segment prompt
                if (charSheetRef.length > 0 && avatarNames.length > 0) {
                    const charSheetIndexInRefs = (signedImageUrl ? 1 : 0) + (params.referenceImages || []).length;
                    const charRefTagNumber = 1 + (segmentFirstFrameUrl ? 1 : 0) + charSheetIndexInRefs;
                    const charRefTag = `@image${charRefTagNumber}`;
                    charIdentityPreamble = `CHARACTER IDENTITY LOCK (apply to ALL cuts in this segment):
${charRefTag} = CHARACTER REFERENCE SHEET showing: ${avatarNames.map(n => `"${n}"`).join(', ')}
• LOCK for each character: face shape, facial features, hair colour/style, skin tone, eye colour.
• DO NOT lock wardrobe — each character wears the costume/attire described in their cut line below.
• Never swap or blend character faces.

`;
                } else if (avatarNames.length > 0) {
                    charIdentityPreamble = `CHARACTER IDENTITY LOCK:
Characters in this video: ${avatarNames.map(n => `"${n}"`).join(', ')}.
Maintain exact face, hair colour, skin tone for each character across all cuts.
Wardrobe/costume is defined per-cut in the prompt text — follow it exactly.

`;
                } else {
                    // Fallback character lock when no explicit avatar is uploaded but characters/presenters are expected
                    // in the cuts, and the storyboard poster is the only source of truth.
                    const posterTagNumber = 1 + (segmentFirstFrameUrl ? 1 : 0);
                    const posterTag = `@image${posterTagNumber}`;
                    charIdentityPreamble = `CHARACTER IDENTITY LOCK (apply to ALL shots):
• Locate the presenter/character panels inside the storyboard reference grid in ${posterTag}.
• Extract and lock the exact face shape, facial features, hair style/color, skin tone, and gender of the presenter as depicted in those panels.
• Maintain this exact same presenter identity consistently in every shot of this video segment.
• Wardrobe/costume is defined per-shot in the scene description — follow it exactly, overriding the reference image's clothes.
• Do NOT animate the grid layout itself.

`;
                }

                const isLast = i === actualSegCount - 1;
                const positionHint = i === 0
                    ? 'This is the OPENING segment — establish the visual world and hook the viewer immediately.'
                    : isLast && includeBranding
                    ? 'This is the FINAL segment — end with a single brand closing shot in the last few seconds ONLY.'
                    : isLast && !includeBranding
                    ? 'This is the FINAL segment — end with a strong cinematic close.'
                    : `This is a CONTINUATION segment.`;

                const scenePrompt = scenes[i]?.visualPrompt || params.videoPrompt;
                const segPromptRaw = `${charIdentityPreamble}${scenePrompt}\n\n${positionHint}\nSegment ${i+1} of ${actualSegCount}.`;

                let segPrompt = segPromptRaw;
                if (segPrompt.length > 2600) {
                    segPrompt = segPrompt.substring(0, 2600);
                    if (!segPrompt.includes('4K ultra HD')) segPrompt += '\n4K ultra HD, cinematic detail, sharp clarity, stable picture.';
                }

                const qualityMode = params.model === 'seedance-2.0' ? 'quality' : 'fast';

                let genResult;
                if (params.model === 'gemini-flash' || params.model === 'gemini-omni-flash') {
                    genResult = await submitGeminiFlashVideoGeneration({
                        prompt: segPrompt,
                        imageUrl: segmentFirstFrameUrl,
                        duration: sceneDurations[i],
                        aspectRatio: params.format,
                        resolution: params.resolution,
                        referenceImages: segmentRefs.slice(0, 9),
                        customCharacterNames: avatarNames,
                    });
                } else {
                    genResult = await submitAtlasCloudVideoGeneration({
                        model: params.model,
                        prompt: segPrompt,
                        imageUrl: segmentFirstFrameUrl,
                        duration: sceneDurations[i],
                        aspectRatio: params.format,
                        generateAudio: false,
                        referenceImages: segmentRefs.slice(0, 9),
                        qualityMode,
                        resolution: params.resolution,
                        imageRole: 'mixed',
                        customCharacterNames: avatarNames,
                    });
                }

                const videoUrl = await _pollSegment(genResult, jobId, i, actualSegCount);

                const segPromptUsed = scenes[i]?.visualPrompt || params.videoPrompt || '';
                segmentVideoUrls[i] = videoUrl;
                job.segmentStatuses[i] = {
                    status: 'completed', progress: 100, videoUrl,
                    prompt: segPromptUsed,
                    duration: sceneDurations[i],
                };
                completedCount++;

                _setProgress(jobId, 'GENERATING',
                    `${completedCount}/${actualSegCount} segments done`,
                    (completedCount / actualSegCount) * 100,
                );

                if (params.projectId) {
                    try {
                        const mongoose = (await import('mongoose')).default;
                        const VideoProject = mongoose.model('VideoProject');
                        await VideoProject.findByIdAndUpdate(params.projectId, {
                            [`storyboard.segmentUrls.${i}`]: videoUrl,
                            [`storyboard.segmentPrompts.${i}`]: segPromptUsed,
                        });
                    } catch (e) {
                        console.warn(`[SB LongForm ${jobId}] Failed to persist seg ${i+1}: ${e.message}`);
                    }
                }
            }
        }

        const validVideos = segmentVideoUrls.filter(Boolean);
        if (validVideos.length === 0) {
            throw new Error('No video segments were generated successfully.');
        }
        if (validVideos.length < actualSegCount * 0.5) {
            console.warn(`[SB LongForm ${jobId}] ⚠️ Only ${validVideos.length}/${actualSegCount} segments succeeded — final video will be shorter than requested.`);
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // ═══ Phase 3: Download all segments ══════════════════════════════════
        _setProgress(jobId, 'DOWNLOADING', 'Downloading segment files...', 0);
        const segmentPaths = [];
        for (let i = 0; i < validVideos.length; i++) {
            const segPath = path.join(tmpDir, `seg-${i+1}.mp4`);
            const resp = await fetch(validVideos[i]);
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
            .map((url, idx) => url ? sceneDurations[idx] : null)
            .filter(v => v !== null);

        const stitchedPath = await _stitchWithCrossfade(tmpDir, segmentPaths, params.format, validDurations, jobId);
        _setProgress(jobId, 'STITCHING', 'Stitch complete', 50);

        // Validate stitchedPath before proceeding — FFmpeg can silently fail and produce an empty file
        if (!stitchedPath || !fs.existsSync(stitchedPath) || fs.statSync(stitchedPath).size === 0) {
            throw new Error('FFmpeg stitching produced an empty or missing output file.');
        }

        if (job.cancelled) throw new Error('Cancelled by user');

        // Audio mux — always fall back cleanly to stitchedPath if anything fails
        let finalPath = stitchedPath;
        if (params.refAudio) {
            _setProgress(jobId, 'STITCHING', 'Mixing audio track...', 60);
            try {
                console.log(`[SB LongForm ${jobId}] 🎧 Mixing audio track: ${params.refAudio}`);
                const refAudioLocalPath = path.join(tmpDir, 'brief-audio-ref.mp3');
                const signedRefAudio = await getSignedUrlIfNeeded(params.refAudio);
                const audioResp = await fetch(signedRefAudio);
                if (!audioResp.ok) throw new Error(`HTTP ${audioResp.status} downloading audio track`);
                const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
                if (audioBuffer.length === 0) throw new Error('Downloaded audio track is empty');
                fs.writeFileSync(refAudioLocalPath, audioBuffer);

                const { mixAudioAndMux } = await import('../../utils/ffmpegUtils.js');
                const mixedPath = await mixAudioAndMux(stitchedPath, refAudioLocalPath, null, tmpDir);

                // Only accept the mixed result if it exists and has content
                if (mixedPath && fs.existsSync(mixedPath) && fs.statSync(mixedPath).size > 0) {
                    finalPath = mixedPath;
                    console.log(`[SB LongForm ${jobId}] 🎧 Audio track successfully mixed: ${finalPath}`);
                } else {
                    throw new Error('Audio mux produced empty output');
                }
            } catch (mixErr) {
                console.error(`[SB LongForm ${jobId}] ⚠️ Audio mix failed (${mixErr.message}) — using silent stitched video as final output`);
                finalPath = stitchedPath; // explicit reassignment — always safe
            }
        }

        _setProgress(jobId, 'STITCHING', 'Uploading to S3...', 75);

        if (!fs.existsSync(finalPath) || fs.statSync(finalPath).size === 0) {
            throw new Error(`Final video file is missing or empty: ${finalPath}`);
        }
        const finalBuffer = fs.readFileSync(finalPath);
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

    } catch (err) {
        console.error(`[SB LongForm ${jobId}] ❌ Pipeline error: ${err.message}`);
        const j = activeJobs.get(jobId);
        if (j) { j.status = 'FAILED'; j.error = err.message; j.progress = 0; }
        if (params.projectId) {
            try {
                const mongoose = (await import('mongoose')).default;
                const VideoProject = mongoose.model('VideoProject');
                await VideoProject.findByIdAndUpdate(params.projectId, {
                    'storyboard.status': 'failed',
                    'storyboard.error': err.message,
                    status: 'failed',
                });
                console.log(`[SB LongForm ${jobId}] ❌ Persisted FAILED state to DB for project ${params.projectId}`);
            } catch (dbErr) {
                console.error(`[SB LongForm ${jobId}] Failed to persist FAILED state: ${dbErr.message}`);
            }
        }
        throw err;
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
                const currentStatus = job.segmentStatuses[segIdx] || {};
                if (currentStatus.cuts) {
                    job.segmentStatuses[segIdx] = {
                        ...currentStatus,
                        status: 'generating',
                    };
                } else {
                    job.segmentStatuses[segIdx] = { status: 'generating', progress: status.progress || 30 };
                }
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

    // Step 1: Normalize all segments to the same resolution/fps/audio
    console.log(`[SB LongForm ${jobId}] Normalizing ${segmentPaths.length} segments → ${w}x${h}@24fps (with audio)`);
    const normPaths = [];
    for (let i = 0; i < segmentPaths.length; i++) {
        const normPath = path.join(tmpDir, `norm-${i}.mp4`);
        const targetDur = prePlannedDurations[i] || 10;
        console.log(`[SB LongForm ${jobId}] Normalizing segment ${i+1}/${segmentPaths.length} to target duration: ${targetDur}s`);
        await execFileAsync(ffmpegPath, [
            '-y',
            '-i', segmentPaths[i],
            '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${targetDur}`,
            '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000',
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-t', String(targetDur),
            '-shortest',
            '-movflags', '+faststart',
            normPath,
        ], { timeout: 120000 }).catch(async (err) => {
            console.warn(`[SB LongForm ${jobId}] Segment ${i+1} normalization failed (${err.message}) — falling back to untrimmed`);
            await execFileAsync(ffmpegPath, [
                '-y',
                '-i', segmentPaths[i],
                '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=24,format=yuv420p`,
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
                '-an',
                '-movflags', '+faststart',
                normPath,
            ], { timeout: 120000 });
        });
        normPaths.push(normPath);
    }

    // Step 2: Write a concat list file for hard-cut joining (no xfade dissolves)
    // Since each segment's last frame is extracted and used as the next segment's
    // first frame anchor, segments are already visually adjacent at cut points.
    // A hard cut therefore looks perfectly seamless.
    console.log(`[SB LongForm ${jobId}] Stitching ${normPaths.length} segments with HARD CUTS (no dissolves)`);
    const concatListPath = path.join(tmpDir, 'concat.txt');
    const concatContent = normPaths.map(p => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent, 'utf8');

    const outputPath = path.join(tmpDir, 'stitched.mp4');
    try {
        await execFileAsync(ffmpegPath, [
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concatListPath,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-c:a', 'aac', '-b:a', '192k',
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 300000 });
        return outputPath;
    } catch (stitchErr) {
        // Fallback: use FFmpeg concat filter if concat demuxer fails
        console.warn(`[SB LongForm ${jobId}] Concat demuxer failed: ${stitchErr.message}. Trying filter_complex concat...`);
        const concatFilter = normPaths.map((_, idx) => `[${idx}:v][${idx}:a]`).join('') + `concat=n=${normPaths.length}:v=1:a=1[vout][aout]`;
        const inputs = normPaths.flatMap(p => ['-i', p]);
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

// ─────────────────────────────────────────────────────────────────────────────
// Public: stitchSegments
// Used by POST /storyboard/compile to manually stitch already-generated segments
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Download + FFmpeg-stitch an ordered list of segment video URLs into one MP4.
 * Returns the path to the stitched file in a temp directory.
 * Caller is responsible for cleanup.
 *
 * @param {string[]} segmentUrls   — ordered list of video URLs to stitch
 * @param {string}   format        — '9:16' | '16:9' | '1:1'
 * @param {string}   [label]       — label for log lines (e.g. projectId)
 * @returns {Promise<{ filePath: string, tmpDir: string }>}
 */
export async function stitchSegments(segmentUrls, format = '9:16', label = 'manual-compile') {
    const tmpDir = path.join(os.tmpdir(), `sb-compile-${label}-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    // Download all segments
    const segPaths = [];
    for (let i = 0; i < segmentUrls.length; i++) {
        const segPath = path.join(tmpDir, `seg-${i + 1}.mp4`);
        const resp = await fetch(segmentUrls[i]);
        if (!resp.ok) throw new Error(`Failed to download segment ${i + 1}: ${resp.status}`);
        fs.writeFileSync(segPath, Buffer.from(await resp.arrayBuffer()));
        segPaths.push(segPath);
    }

    const stitchedPath = await _stitchWithCrossfade(tmpDir, segPaths, format, [], label);
    return { filePath: stitchedPath, tmpDir };
}
