/**
 * YouTube Studio — Agent Nodes (MCoT Pipeline)
 * 
 * Node execution order:
 *   1. transcriptNode         → fetch captions + metadata
 *   2. analysisNode           → MCoT video intelligence (Gemini watches video)
 *   3. chapterNode            → chapter detection from transcript
 *   4. seoNode                → brand-aligned titles, description, tags
 *   5. brandCriticNode        → brand alignment scoring
 *   6. thumbnailDirectionNode → MCoT thumbnail creative direction (JSON)
 *   7. thumbnailGenerationNode→ FLUX Pro image generation via FAL.ai
 *   8. characterPortraitNode  → Gemini generates AI portraits from character descriptions
 */

import { callAgent, callMultimodalAgent } from '../shared/agentUtils.js';
import { PROMPTS } from './prompts.js';
import {
    fetchTranscript, fetchVideoMetadata,
    formatTranscriptText, parseIsoDuration, extractVideoId
} from './transcriptClient.js';
import { getRouter } from '../../ai/router.js';

const FAL_BASE = 'https://queue.fal.run';
const FAL_KEY  = () => process.env.FAL_KEY || process.env.FAL_API_KEY;

/**
 * Generic FAL.ai text-to-image call (FLUX Pro by default)
 * Returns the first image URL from the result
 */
async function falGenerateImage({ prompt, imageUrl = null, width = 1280, height = 720, model = 'fal-ai/flux-pro/v1.1' }) {
    const key = FAL_KEY();
    if (!key) throw new Error('FAL_API_KEY not configured');

    const body = {
        prompt,
        image_size: { width, height },
        num_images: 1,
        enable_safety_checker: false,
        output_format: 'jpeg',
    };
    // If we have a reference image, inject as image_prompt (style/composition reference)
    if (imageUrl) body.image_prompt = imageUrl;

    // Submit job
    const submitRes = await fetch(`${FAL_BASE}/${model}`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!submitRes.ok) {
        const err = await submitRes.text();
        throw new Error(`FAL submit failed [${submitRes.status}]: ${err.substring(0, 200)}`);
    }
    const { request_id, response_url, status_url } = await submitRes.json();
    const pollUrl = status_url || `${FAL_BASE}/${model}/requests/${request_id}/status`;
    const resultUrl = response_url || `${FAL_BASE}/${model}/requests/${request_id}`;

    // Poll for up to 90s
    for (let i = 0; i < 45; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const poll = await fetch(pollUrl, { headers: { 'Authorization': `Key ${key}` } });
        const st = await poll.json();
        if (st.status === 'COMPLETED' || st.images?.length) {
            const img = (st.images || st.output?.images)?.[0];
            return img?.url || img;
        }
        if (st.status === 'FAILED') throw new Error(`FAL job failed: ${JSON.stringify(st.error || st)}`);
    }
    // One last check at result URL
    const final = await fetch(resultUrl, { headers: { 'Authorization': `Key ${key}` } });
    const fd = await final.json();
    const img = (fd.images || fd.output?.images)?.[0];
    if (img?.url || img) return img?.url || img;
    throw new Error('FAL generation timed out after 90s');
}

// ── 1. Transcript Node ─────────────────────────────────────────────────────

export async function transcriptNode({ videoId, videoUrl }) {
    const id = videoId || extractVideoId(videoUrl);
    if (!id) throw new Error('Invalid YouTube URL or video ID');

    console.log(`📹 [transcriptNode] Processing video: ${id}`);

    // Run metadata + transcript fetch in parallel
    const [metadata, transcriptResult] = await Promise.allSettled([
        fetchVideoMetadata(id),
        fetchTranscript(id),
    ]);

    const meta = metadata.status === 'fulfilled' ? metadata.value : { id };
    const transcript = transcriptResult.status === 'fulfilled' ? transcriptResult.value : null;

    const transcriptText = transcript ? formatTranscriptText(transcript.segments) : null;
    const duration = meta.duration ? parseIsoDuration(meta.duration) : null;
    const youtubeUrl = `https://www.youtube.com/watch?v=${id}`;

    return {
        videoId: id,
        youtubeUrl,
        metadata: meta,
        transcript: {
            available: !!transcriptText,
            text: transcriptText,
            segments: transcript?.segments || [],
            language: transcript?.language || null,
            source: transcript?.source || 'none',
        },
        duration,
    };
}

// ── 2. Video Analysis Node (MCoT) ──────────────────────────────────────────

export async function analysisNode({ video, brandContext }) {
    console.log(`🧠 [analysisNode] Running MCoT video analysis`);

    const { transcript, metadata, youtubeUrl } = video;

    // Build the analysis input
    const videoContext = [
        `VIDEO TITLE: ${metadata.title || 'Unknown'}`,
        `CHANNEL: ${metadata.channelTitle || 'Unknown'}`,
        `DURATION: ${video.duration || 'Unknown'}`,
        `VIEWS: ${metadata.viewCount?.toLocaleString() || 'Unknown'}`,
        `PUBLISHED: ${metadata.publishedAt ? new Date(metadata.publishedAt).toLocaleDateString() : 'Unknown'}`,
        '',
        `BRAND CONTEXT:`,
        brandContext || 'No brand data provided',
        '',
    ].join('\n');

    const transcriptSection = transcript.available
        ? `TRANSCRIPT (timestamped):\n${transcript.text?.substring(0, 15000)}${transcript.text?.length > 15000 ? '\n... [transcript truncated for context]' : ''}`
        : `TRANSCRIPT: Not available — analyse based on title and description only.`;

    // Use Gemini natively via router — pass youtubeUrl as fileData for native video watching
    // gemini-2.5-pro video analysis can take 60-120s — wrap in AbortController
    const router = getRouter();
    let analysis;
    const analysisController = new AbortController();
    const analysisTimeout = setTimeout(() => analysisController.abort(), 120_000); // 2 min cap

    try {
        console.log(`🧠 [analysisNode] Sending YouTube URL to Gemini 2.5 Pro for native video analysis`);
        const result = await router.generateText({
            systemPrompt: PROMPTS.VIDEO_ANALYST,
            userPrompt: `${videoContext}\n\nYOUTUBE URL (watch this video): ${youtubeUrl}\n\n${transcriptSection}`,
            temperature: 0.3,
            maxTokens: 4096,
            model: 'gemini-2.5-pro',       // Best model for video understanding
            youtubeUrl: youtubeUrl,         // Triggers fileData injection in Gemini provider
        }, { provider: 'gemini' });
        clearTimeout(analysisTimeout);

        const text = result.text || '';
        const cleaned = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/```(?:json)?\s*\n?/gi, '')
            .trim();

        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            analysis = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error('No JSON in Gemini response');
        }
    } catch (err) {
        clearTimeout(analysisTimeout);
        console.warn(`⚠️ [analysisNode] Gemini video analysis failed: ${err.message}. Falling back to transcript-only.`);

        // Fallback: text-only analysis using transcript
        if (transcript.available) {
            analysis = await callAgent(
                PROMPTS.VIDEO_ANALYST,
                `${videoContext}\n\n${transcriptSection}`,
                0.3, 4096, { preferFast: true }
            );
        } else {
            analysis = {
                summary: metadata.description?.substring(0, 300) || 'No analysis available',
                highlights: [],
                characters: [],
                keyThemes: [],
                contentType: 'unknown',
                emotionalArc: 'Unknown',
                tone: 'neutral',
                pacing: 'moderate',
                audienceAppeal: 'General audience',
            };
        }
    }

    return { analysis };
}

// ── 3. Chapter Detection Node ──────────────────────────────────────────────

export async function chapterNode({ video }) {
    const { transcript } = video;
    if (!transcript.available) {
        return { chapters: [] };
    }

    console.log(`📚 [chapterNode] Detecting chapters from transcript`);

    const result = await callAgent(
        PROMPTS.CHAPTER_DETECTOR,
        `VIDEO DURATION: ${video.duration || 'Unknown'}\n\nTRANSCRIPT:\n${transcript.text?.substring(0, 20000)}`,
        0.2, 2048, { preferFast: true }
    );

    return { chapters: result.chapters || [] };
}

// ── 4. SEO Copywriter Node ─────────────────────────────────────────────────

export async function seoNode({ video, analysis, chapters, brandContext }) {
    console.log(`✍️ [seoNode] Generating SEO metadata`);

    const { metadata, transcript } = video;
    const chapterText = chapters?.length
        ? `DETECTED CHAPTERS:\n${chapters.map(c => `${c.timestamp} - ${c.title}: ${c.description}`).join('\n')}`
        : '';

    const userPrompt = [
        brandContext || 'No brand context',
        '',
        `VIDEO TITLE: ${metadata.title || 'Unknown'}`,
        `CHANNEL: ${metadata.channelTitle}`,
        `VIEWS: ${metadata.viewCount?.toLocaleString()}`,
        '',
        `VIDEO SUMMARY: ${analysis.summary || ''}`,
        `KEY THEMES: ${analysis.keyThemes?.join(', ') || ''}`,
        `CONTENT TYPE: ${analysis.contentType || ''}`,
        `TONE: ${analysis.tone || ''}`,
        `AUDIENCE: ${analysis.audienceAppeal || ''}`,
        '',
        chapterText,
        '',
        `TRANSCRIPT EXCERPT:\n${transcript.text?.substring(0, 5000) || 'N/A'}`,
    ].join('\n');

    const result = await callAgent(
        PROMPTS.SEO_COPYWRITER,
        userPrompt,
        0.7, 3000, { provider: 'claude', timeoutMs: 60_000 }  // Claude copywriting ~20-25s; 60s cap
    );

    return { seo: result };
}

// ── 5. Brand Alignment Critic ──────────────────────────────────────────────

export async function brandCriticNode({ video, analysis, brandContext }) {
    if (!brandContext || brandContext.includes('No brand data')) {
        return { brandAlignment: null };
    }

    console.log(`🎯 [brandCriticNode] Scoring brand alignment`);

    const userPrompt = [
        brandContext,
        '',
        `VIDEO TITLE: ${video.metadata.title}`,
        `SUMMARY: ${analysis.summary}`,
        `KEY THEMES: ${analysis.keyThemes?.join(', ')}`,
        `TONE: ${analysis.tone}`,
        `CONTENT TYPE: ${analysis.contentType}`,
        `EMOTIONAL ARC: ${analysis.emotionalArc}`,
        `AUDIENCE APPEAL: ${analysis.audienceAppeal}`,
        '',
        `HIGHLIGHTS:\n${analysis.highlights?.map(h => `${h.timestamp}: ${h.title}`).join('\n') || ''}`,
    ].join('\n');

    const result = await callAgent(
        PROMPTS.BRAND_CRITIC,
        userPrompt,
        0.3, 2048, { preferFast: true, timeoutMs: 45_000 }  // Fast Gemini; 45s cap
    );

    return { brandAlignment: result };
}

// ── 6. Thumbnail Direction Node (MCoT) ────────────────────────────────────

export async function thumbnailDirectionNode({ video, analysis, seo, brandContext }) {
    console.log(`🎨 [thumbnailDirectionNode] Creating thumbnail concept`);

    const existingThumbnail = video.metadata.thumbnailUrl;

    const userPrompt = [
        brandContext || 'No brand context',
        '',
        `VIDEO TITLE: ${video.metadata.title}`,
        `SUMMARY: ${analysis.summary}`,
        `EMOTIONAL ARC: ${analysis.emotionalArc}`,
        `MAIN CHARACTERS: ${analysis.characters?.map(c => c.label).join(', ') || 'None identified'}`,
        `KEY HIGHLIGHTS: ${analysis.highlights?.slice(0, 3).map(h => h.title).join(', ') || ''}`,
        `RECOMMENDED TITLE: ${seo?.recommendedTitle || ''}`,
        `THUMBNAIL TEXT IDEA: ${seo?.thumbnailTextSuggestion || ''}`,
        '',
        `EXISTING THUMBNAIL URL: ${existingThumbnail || 'None'} (for visual reference only)`,
    ].join('\n');

    // MCoT: pass existing thumbnail if available for visual reference
    const imageUrls = existingThumbnail ? [existingThumbnail] : [];
    const result = await callMultimodalAgent(
        PROMPTS.THUMBNAIL_DIRECTOR,
        userPrompt,
        imageUrls,
        { temperature: 0.7, maxTokens: 2048 }
    );

    return { thumbnailDirection: result };
}

// ── 7. Thumbnail Generation Node (Phase 3 — FLUX Pro via FAL.ai) ──────────

/**
 * Phase 3: Thumbnail Generation
 * 
 * Model Strategy:
 * PRIMARY  — NanoBanana 2 (Gemini 3.1 Flash Image)
 *   → Accepts the real YouTube thumbnail as an imagePart reference
 *   → Gemini SEES the character face and generates accordingly
 *   → Follows brand color hex codes and copywriting instructions precisely
 *   → ~8-12s response time
 *
 * FALLBACK — FLUX Pro via FAL.ai
 *   → Higher photorealistic quality for cinematic backgrounds
 *   → image_prompt is a loose style ref (not face-locked)
 *   → ~25-30s response time
 */
export async function thumbnailGenerationNode({ thumbnailDirection, video, brandContext }) {
    if (!thumbnailDirection?.imageGenerationPrompt) {
        console.warn('⚠️ [thumbnailGenerationNode] No imageGenerationPrompt — skipping');
        return { generatedThumbnailUrl: null, thumbnailGenerationError: 'No prompt available' };
    }

    console.log(`🎨 [thumbnailGenerationNode] Generating thumbnail — NanoBanana 2 (primary)`);

    // Build enriched prompt: brand color, text overlay, composition, emotion
    const fullPrompt = [
        thumbnailDirection.imageGenerationPrompt,
        thumbnailDirection.dominantColor
            ? `Use ${thumbnailDirection.dominantColor} as the dominant brand color`
            : '',
        `Composition: ${thumbnailDirection.composition || 'center'} subject placement`,
        `Emotion: ${thumbnailDirection.emotion || 'curiosity'} expression on the main subject`,
        `Background treatment: ${thumbnailDirection.backgroundTreatment || 'gradient'}`,
        thumbnailDirection.textOverlay?.line1
            ? `Text overlay: "${thumbnailDirection.textOverlay.line1}" in ${thumbnailDirection.textOverlay.style || 'bold'} style`
            : '',
        `YouTube thumbnail format: 16:9, high contrast, mobile-readable at 320px, cinematic quality`,
        `Do NOT add any watermarks or logos unless specifically requested`,
    ].filter(Boolean).join('. ');

    const router = getRouter();
    const referenceUrl = video?.metadata?.thumbnailUrl || null;

    // ── Primary: NanoBanana 2 with character reference image ──────────────────
    try {
        // Fetch the existing YouTube thumbnail and pass as imagePart
        // Gemini will SEE the character and generate a consistent new composition
        const imageParts = [];
        if (referenceUrl) {
            try {
                const imgRes = await fetch(referenceUrl);
                if (imgRes.ok) {
                    const buf = await imgRes.arrayBuffer();
                    const b64 = Buffer.from(buf).toString('base64');
                    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
                    imageParts.push({
                        inlineData: { data: b64, mimeType },
                        text: 'Reference image: use the main character from this thumbnail in your composition.'
                    });
                }
            } catch (fetchErr) {
                console.warn(`⚠️ [thumbnailGenerationNode] Could not fetch reference thumbnail: ${fetchErr.message}`);
            }
        }

        const result = await router.generateImage({
            prompt: fullPrompt,
            aspectRatio: '16:9',
            imageParts,
        });

        console.log(`✅ [thumbnailGenerationNode] NanoBanana 2 thumbnail generated`);
        return { generatedThumbnailUrl: result.imageUrl, thumbnailGenerationError: null };

    } catch (primaryErr) {
        console.warn(`⚠️ [thumbnailGenerationNode] NanoBanana 2 failed: ${primaryErr.message}. Falling back to FLUX Pro...`);

        // ── Fallback: FLUX Pro (cinematic photorealism, no face lock) ────────
        try {
            const generatedThumbnailUrl = await falGenerateImage({
                prompt: fullPrompt,
                imageUrl: referenceUrl,   // Loose style reference in FLUX
                width: 1280,
                height: 720,
                model: 'fal-ai/flux-pro/v1.1',
            });
            console.log(`✅ [thumbnailGenerationNode] FLUX Pro fallback succeeded`);
            return { generatedThumbnailUrl, thumbnailGenerationError: null };
        } catch (fluxErr) {
            console.error(`❌ [thumbnailGenerationNode] Both NanoBanana 2 and FLUX failed`);
            return { generatedThumbnailUrl: null, thumbnailGenerationError: primaryErr.message };
        }
    }
}


// ── 8. Character Portrait Node (Phase 2) ───────────────────────────────────

/**
 * Generates AI portrait images for each identified character.
 * Uses Gemini image generation with the character description from analysis.
 * Returns array of { label, role, portraitUrl }
 */
export async function characterPortraitNode({ analysis, video, brandContext }) {
    const characters = analysis?.characters || [];
    if (!characters.length) {
        console.log('ℹ️ [characterPortraitNode] No characters identified — skipping');
        return { characterPortraits: [] };
    }

    console.log(`👤 [characterPortraitNode] Generating ${characters.length} character portrait(s)`);

    const router = getRouter();
    const videoTitle = video?.metadata?.title || 'YouTube video';

    // Extract brand primary color for portrait background consistency
    const brandColorHint = brandContext?.includes('#') 
        ? `Use brand-consistent background color tones.` 
        : '';

    const portraits = await Promise.allSettled(
        characters.slice(0, 3).map(async (char) => {
            const prompt = [
                `Professional portrait of ${char.label}, a ${char.role || 'presenter'} from a YouTube video titled "${videoTitle}".`,
                `They appear for approximately ${char.screenTimePct || 50}% of the video.`,
                `Clean studio lighting, professional headshot style, neutral background.`,
                `High quality, sharp focus, YouTube content creator style.`,
                brandColorHint,
            ].filter(Boolean).join(' ');

            try {
                const result = await router.generateImage({
                    prompt,
                    aspectRatio: '1:1',
                });
                return {
                    label: char.label,
                    role: char.role,
                    firstAppearance: char.firstAppearance,
                    screenTimePct: char.screenTimePct,
                    portraitUrl: result.imageUrl,
                };
            } catch (err) {
                console.warn(`⚠️ Portrait failed for ${char.label}: ${err.message}`);
                return { label: char.label, role: char.role, portraitUrl: null, error: err.message };
            }
        })
    );

    const characterPortraits = portraits
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

    console.log(`✅ [characterPortraitNode] Generated ${characterPortraits.filter(p => p.portraitUrl).length}/${characters.slice(0,3).length} portraits`);
    return { characterPortraits };
}
