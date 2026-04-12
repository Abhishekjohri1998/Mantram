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
// FAL_API_KEY is what's in .env — FAL_KEY is the alternate alias some clients expect
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
    // gemini-2.5-pro video analysis: typically 30-120s, can peak at 180s for long videos
    const analysisController = new AbortController();
    const analysisTimeout = setTimeout(() => analysisController.abort(), 180_000); // 3 min cap

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
        console.error(`❌ [analysisNode] Gemini native video analysis failed: ${err.message}`);

        // Fallback: transcript-only analysis (still brand-aligned, just no visual understanding)
        if (transcript.available) {
            console.log(`⚡ [analysisNode] Falling back to transcript-only analysis...`);
            const fallbackResult = await callAgent(
                PROMPTS.VIDEO_ANALYST,
                `${videoContext}\n\n${transcriptSection}\n\nNOTE: Gemini video analysis unavailable — analyse from transcript only.`,
                0.3, 4096, { preferFast: false, timeoutMs: 120_000 }   // 2 min — full model on transcript can take 60-90s
            );
            console.log(`✅ [analysisNode] Transcript-only fallback complete`);
            return { analysis: fallbackResult };
        }

        // No transcript + no video analysis = hard failure, propagate to pipeline
        throw new Error(`Video analysis failed and no transcript available: ${err.message}`);
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
        0.2, 2048, { preferFast: true, timeoutMs: 60_000 }  // Fast model but long transcripts need 60s
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

// ── 6. Thumbnail Direction Node (MCoT) ─────────────────────────────────────

export async function thumbnailDirectionNode({ video, analysis, seo, brandContext }) {
    console.log(`🎨 [thumbnailDirectionNode] Creating peak-moment thumbnail concept`);

    const existingThumbnail = video.metadata.thumbnailUrl;
    const peakMoment        = analysis.peakMoment;
    const characters        = analysis.characters || [];

    const characterContext = characters.length
        ? characters.map(c =>
            `  - ${c.label} (${c.role}, ${c.screenTimePct}% screen time)` +
            (c.visualDescription ? `: ${c.visualDescription}` : '') +
            (c.position ? ` | Position: ${c.position}` : '')
          ).join('\n')
        : 'None identified';

    const peakMomentContext = peakMoment
        ? [
            `PEAK MOMENT — base the thumbnail on THIS scene:`,
            `  Timestamp: ${peakMoment.timestamp}`,
            `  What happens: ${peakMoment.title}`,
            `  Visual scene: ${peakMoment.sceneDescription}`,
            `  Dominant emotion: ${peakMoment.emotion}`,
          ].join('\n')
        : `TOP HIGHLIGHT: ${analysis.highlights?.[0]?.title || 'Not identified'}`;

    const userPrompt = [
        brandContext || 'No brand context',
        '',
        `VIDEO TITLE: ${video.metadata.title}`,
        `SUMMARY: ${analysis.summary}`,
        `EMOTIONAL ARC: ${analysis.emotionalArc}`,
        '',
        peakMomentContext,
        '',
        `CHARACTERS (with visual descriptions):`,
        characterContext,
        '',
        `KEY HIGHLIGHTS: ${analysis.highlights?.slice(0, 3).map(h => h.title).join(', ') || ''}`,
        `RECOMMENDED TITLE: ${seo?.recommendedTitle || ''}`,
        `THUMBNAIL TEXT IDEA: ${seo?.thumbnailTextSuggestion || ''}`,
        '',
        `ORIGINAL THUMBNAIL URL: ${existingThumbnail || 'None'} (for color/style reference)`,
    ].join('\n');

    // MCoT: pass existing thumbnail for visual reference (palette, style, characters)
    const imageUrls = existingThumbnail ? [existingThumbnail] : [];
    const result = await callMultimodalAgent(
        PROMPTS.THUMBNAIL_DIRECTOR,
        userPrompt,
        imageUrls,
        { temperature: 0.7, maxTokens: 2048 }
    );

    return { thumbnailDirection: result };
}


/**
 * Phase 3: Thumbnail Generation
 *
 * Strategy: Reference-Guided Regeneration
 *   1. Fetch the real YouTube thumbnail (which has the actual characters)
 *   2. Pass it as inlineData reference to NanoBanana 2
 *   3. Prompt: "Keep the SAME people, restyle background, add title text"
 *   4. This preserves character identity through visual grounding, not fabrication
 *
 * Model Strategy:
 *   PRIMARY  — NanoBanana 2 (Gemini 3.1 Flash Image)
 *              Reference image → character-consistent + styled output
 *   FALLBACK — FLUX Pro via FAL.ai (photorealistic, no reference face-lock)
 */
export async function thumbnailGenerationNode({ thumbnailDirection, video, brandContext }) {
    const videoTitle   = video?.metadata?.title        || '';
    const referenceUrl = video?.metadata?.thumbnailUrl || null;
    const characters   = video?.analysis?.characters  || [];

    // ── Build text overlay from direction ──────────────────────────────────────
    const line1 = thumbnailDirection?.textOverlay?.line1
        || (videoTitle ? videoTitle.split(' ').slice(0, 5).join(' ').toUpperCase() : '');
    const line2 = thumbnailDirection?.textOverlay?.line2 || '';

    // ── Character context ──────────────────────────────────────────────────────
    const characterContext = characters.length
        ? `The video features: ${characters.map(c => c.label).join(', ')}.`
        : '';

    console.log(`🎨 [thumbnailGenerationNode] Reference-guided regen for "${videoTitle.substring(0, 50)}"`);
    console.log(`   Characters: ${characterContext || 'none detected'}`);
    console.log(`   Text overlay: "${line1}"${line2 ? ` / "${line2}"` : ''}`);
    console.log(`   Reference thumbnail: ${referenceUrl ? '✅' : '❌ none'}`);

    // ── Build the reference-guided prompt ─────────────────────────────────────
    const fullPrompt = [
        `Create a high-impact YouTube thumbnail for the video: "${videoTitle}".`,
        referenceUrl
            ? `You are given the ORIGINAL YouTube thumbnail as a reference image.`
              + ` KEEP the SAME real people and characters visible — maintain their exact faces,`
              + ` expressions, and visual identity from the reference.`
              + ` Do NOT replace or alter the people shown.`
            : '',
        characterContext,
        thumbnailDirection?.imageGenerationPrompt
            ? `Scene direction: ${thumbnailDirection.imageGenerationPrompt}`
            : '',
        `Make the background more dramatic, cinematic, and eye-catching than the reference.`,
        `Composition: ${thumbnailDirection?.composition || 'center'} subject placement, high contrast.`,
        `Mood: ${thumbnailDirection?.emotion || 'curiosity'}, energetic, scroll-stopping.`,
        thumbnailDirection?.dominantColor
            ? `Brand accent color: ${thumbnailDirection.dominantColor}.`
            : '',
        `Background treatment: ${thumbnailDirection?.backgroundTreatment || 'dramatic-scene'}.`,
        line1
            ? `Add BOLD text overlay at the top or left: "${line1}" in large white bold text with strong dark outline/shadow.`
            : '',
        line2
            ? `Add secondary text: "${line2}" below the main text, slightly smaller.`
            : '',
        `Output format: 16:9 YouTube thumbnail (1280×720). Mobile-readable at 320px.`,
        `Broadcast-quality production, sharp focus on the characters, no watermarks.`,
    ].filter(Boolean).join(' ');

    const router = getRouter();

    // ── Strategy 1: NanoBanana 2 with reference image (character consistency) ──
    try {
        const imageParts = [];

        if (referenceUrl) {
            try {
                const imgRes = await fetch(referenceUrl, { signal: AbortSignal.timeout(10000) });
                if (imgRes.ok) {
                    const buf      = await imgRes.arrayBuffer();
                    const b64      = Buffer.from(buf).toString('base64');
                    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
                    imageParts.push({
                        inlineData: { data: b64, mimeType },
                        // This text is prepended to the prompt as context for the reference
                        text: `ORIGINAL THUMBNAIL REFERENCE: Keep the same real characters/people exactly as shown.`,
                    });
                    console.log(`   ✅ Reference thumbnail loaded (${Math.round(buf.byteLength / 1024)}KB)`);
                }
            } catch (fetchErr) {
                console.warn(`   ⚠️ Reference thumbnail fetch failed: ${fetchErr.message}`);
            }
        }

        const result = await router.generateImage({
            prompt: fullPrompt,
            aspectRatio: '16:9',
            imageParts,
        });

        console.log(`✅ [thumbnailGenerationNode] NanoBanana 2 succeeded — characters + title rendered`);
        return { generatedThumbnailUrl: result.imageUrl, thumbnailGenerationError: null };

    } catch (primaryErr) {
        console.warn(`⚠️ [thumbnailGenerationNode] NanoBanana 2 failed: ${primaryErr.message} — trying FLUX Pro`);

        // ── Strategy 2: FLUX Pro (image-to-image style transfer) ──────────────
        try {
            const fluxPrompt = [
                `YouTube thumbnail for "${videoTitle}".`,
                characterContext,
                thumbnailDirection?.imageGenerationPrompt || 'dramatic cinematic scene',
                line1 ? `Text overlay: "${line1}"` : '',
                line2 ? `Subtitle: "${line2}"` : '',
                thumbnailDirection?.dominantColor ? `Color: ${thumbnailDirection.dominantColor}` : '',
                `High contrast, professional, photorealistic, 16:9`,
            ].filter(Boolean).join('. ');

            const generatedThumbnailUrl = await falGenerateImage({
                prompt:   fluxPrompt,
                imageUrl: referenceUrl,  // image-to-image reference for style/character transfer
                width:    1280,
                height:   720,
                model:    'fal-ai/flux-pro/v1.1',
            });

            console.log(`✅ [thumbnailGenerationNode] FLUX Pro fallback succeeded`);
            return { generatedThumbnailUrl, thumbnailGenerationError: null };

        } catch (fluxErr) {
            console.error(`❌ [thumbnailGenerationNode] Both providers failed. Primary: ${primaryErr.message}`);
            return { generatedThumbnailUrl: null, thumbnailGenerationError: primaryErr.message };
        }
    }
}

// ── 8. Character Portrait Node (Phase 2) ───────────────────────────────────

/**
 * Character Portrait Node — Phase 2
 *
 * Strategy: Visual Grounding via Reference Thumbnail
 *
 * Problem with naive approach: Generating portraits from text labels like
 * "Male Lead Vocalist" always produces fictional hallucinated people.
 *
 * Correct approach:
 * 1. Fetch the original YouTube thumbnail (contains the real characters)
 * 2. Use Gemini Vision (callMultimodalAgent) to get a precise visual description
 *    of each specific character from the reference image
 * 3. Generate a clean portrait using that VISUAL description + reference inlineData
 *    so NanoBanana 2 is grounded in the real persons appearance
 *
 * Result: Portraits that visually match the real people in the video
 */
export async function characterPortraitNode({ analysis, video, brandContext }) {
    const characters   = analysis?.characters || [];
    const referenceUrl = video?.metadata?.thumbnailUrl || null;
    const videoTitle   = video?.metadata?.title || 'YouTube video';

    if (!characters.length) {
        console.log('ℹ️ [characterPortraitNode] No characters identified — skipping');
        return { characterPortraits: [] };
    }

    console.log(`👤 [characterPortraitNode] Visual-grounded portraits for ${characters.length} character(s)`);
    console.log(`   Reference URL: ${referenceUrl || 'none'}`);

    const router = getRouter();

    // ── Pre-load reference thumbnail once (shared across all portrait requests) ─
    let referenceB64   = null;
    let referenceMime  = 'image/jpeg';

    if (referenceUrl) {
        try {
            const imgRes = await fetch(referenceUrl, { signal: AbortSignal.timeout(10000) });
            if (imgRes.ok) {
                const buf    = await imgRes.arrayBuffer();
                referenceB64 = Buffer.from(buf).toString('base64');
                referenceMime = imgRes.headers.get('content-type') || 'image/jpeg';
                console.log(`   ✅ Reference thumbnail loaded (${Math.round(buf.byteLength / 1024)}KB) — shared across portraits`);
            }
        } catch (err) {
            console.warn(`   ⚠️ Could not load reference thumbnail: ${err.message}`);
        }
    }

    // ── Step 1: Get visual descriptions for each character via Gemini Vision ──
    // This uses the reference thumbnail to get precise visual details
    let visualDescriptions = {};
    if (referenceB64) {
        try {
            const descResult = await callMultimodalAgent(
                `You are a character identification specialist.
Given a YouTube video thumbnail, identify each visible person and describe their physical appearance in detail.
For each person you can see, provide: hair color and style, approximate age, skin tone, clothing description, distinctive features.
Return ONLY valid JSON:
{
  "characters": [
    { "position": "left|center|right|foreground|background", "description": "detailed visual description" }
  ]
}`,
                `Thumbnail from YouTube video: "${videoTitle}".
The video has these characters: ${characters.map(c => `${c.label} (${c.role})`).join(', ')}.
Describe each visible person's exact appearance so I can generate accurate portraits.`,
                [`data:${referenceMime};base64,${referenceB64}`],
                { temperature: 0.1, maxTokens: 1024 }
            );
            if (descResult?.characters) {
                // Map descriptions by index to characters (ordered by screen position)
                descResult.characters.forEach((desc, i) => {
                    if (i < characters.length) {
                        visualDescriptions[characters[i].label] = desc.description;
                    }
                });
                console.log(`   ✅ Visual descriptions obtained for ${Object.keys(visualDescriptions).length} characters`);
            }
        } catch (err) {
            console.warn(`   ⚠️ Visual description pass failed: ${err.message} — using label-only fallback`);
        }
    }

    // ── Step 2: Generate portraits with visual grounding ──────────────────────
    const portraits = await Promise.allSettled(
        characters.slice(0, 3).map(async (char) => {

            const visualDesc = visualDescriptions[char.label]
                ? `Based on the reference image, this person has: ${visualDescriptions[char.label]}`
                : `${char.label}, a ${char.role || 'presenter'} in this video.`;

            const prompt = [
                `Professional portrait photograph of a real person from YouTube video "${videoTitle}".`,
                visualDesc,
                positionHint,
                referenceB64
                    ? `IMPORTANT: Use the reference image provided. Reproduce EXACTLY this specific person's appearance.`
                      + ` Do NOT invent or blend with a different person.`
                    : '',
                `Clean studio portrait style, professional lighting, sharp focus on this person's face.`,
                `High quality, 1:1 square format, YouTube content creator headshot.`,
                `Neutral or softly blurred background. No text or watermarks.`,
            ].filter(Boolean).join(' ');

            // Build imageParts with reference if available
            const imageParts = referenceB64
                ? [{
                    inlineData: { data: referenceB64, mimeType: referenceMime },
                    text: `Reference thumbnail: identify and portrait the "${char.label}" person shown here.`,
                }]
                : [];

            try {
                const result = await router.generateImage({
                    prompt,
                    aspectRatio: '1:1',
                    imageParts,
                });
                console.log(`   ✅ Portrait generated for: ${char.label}`);
                return {
                    label:           char.label,
                    role:            char.role,
                    firstAppearance: char.firstAppearance,
                    screenTimePct:   char.screenTimePct,
                    visualDescription: visualDescriptions[char.label] || null,
                    portraitUrl:     result.imageUrl,
                };
            } catch (err) {
                console.warn(`   ⚠️ Portrait failed for ${char.label}: ${err.message}`);
                return { label: char.label, role: char.role, portraitUrl: null, error: err.message };
            }
        })
    );

    const characterPortraits = portraits
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);

    const successCount = characterPortraits.filter(p => p.portraitUrl).length;
    console.log(`✅ [characterPortraitNode] ${successCount}/${characters.slice(0,3).length} portraits generated (visually grounded)`);
    return { characterPortraits };
}

