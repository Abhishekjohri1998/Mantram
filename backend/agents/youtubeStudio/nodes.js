/**
 * YouTube Studio — Agent Nodes (MCoT Pipeline)
 *
 * Node execution order:
 *   1.  transcriptNode         → fetch captions + metadata
 *   2.  analysisNode           → MCoT video intelligence (Gemini watches video)
 *   2b. frameExtractionNode    → YouTube CDN frames for visual grounding
 *   3.  chapterNode            → chapter detection (grounded in analysis)
 *   4.  seoNode                → SEO titles/description/tags via Grok
 *   5.  brandCriticNode        → brand alignment scoring
 *   5b. promoNode              → refines promoCuts → social-ready clips
 *   6.  thumbnailDirectionNode → MCoT thumbnail creative direction (JSON)
 *   7.  characterPortraitNode  → visual-grounded AI portraits → S3
 *   8.  thumbnailGenerationNode→ GPT Image 2 → S3 (no base64 stored)
 */

import { callAgent, callMultimodalAgent } from '../shared/agentUtils.js';
import { PROMPTS } from './prompts.js';
import {
    fetchTranscript, fetchVideoMetadata,
    formatTranscriptText, parseIsoDuration, extractVideoId
} from './transcriptClient.js';
import { getRouter } from '../../ai/router.js';
import { uploadBase64ToS3, persistToS3 } from '../../utils/s3Upload.js';

const FAL_BASE = 'https://queue.fal.run';
// FAL_API_KEY is what's in .env — FAL_KEY is the alternate alias some clients expect
const FAL_KEY  = () => process.env.FAL_KEY || process.env.FAL_API_KEY;

/**
 * Generic FAL.ai text-to-image call (FLUX Pro by default)
 * Returns the first image URL from the result
 */
export async function falGenerateImage({ prompt, imageUrl = null, width = 1280, height = 720, model = 'fal-ai/flux-pro/v1.1' }) {
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
            if (st.images || st.output?.images) {
                const img = (st.images || st.output?.images)?.[0];
                return img?.url || img;
            }
            break; // Break the poll loop, fetch the actual result below
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

export async function chapterNode({ video, analysis }) {
    const { transcript } = video;
    if (!transcript.available) {
        return { chapters: [] };
    }

    console.log(`📚 [chapterNode] Detecting chapters using analysis context`);

    // Build analysis context to ground chapter boundaries on real highlights
    const analysisContext = analysis ? [
        `PEAK MOMENT: ${analysis.peakMoment?.timestamp} — ${analysis.peakMoment?.title || 'N/A'}`,
        `HIGHLIGHTS:\n${analysis.highlights?.slice(0, 8).map(h => `  ${h.timestamp}: ${h.title}`).join('\n') || 'N/A'}`,
        `EMOTIONAL ARC: ${analysis.emotionalArc || 'N/A'}`,
        `CONTENT TYPE: ${analysis.contentType || 'N/A'}`,
    ].join('\n') : '';

    const userPrompt = [
        `VIDEO DURATION: ${video.duration || 'Unknown'}`,
        analysisContext,
        '',
        `TRANSCRIPT (timestamped):\n${transcript.text?.substring(0, 25000)}`,
    ].filter(Boolean).join('\n');

    const result = await callAgent(
        PROMPTS.CHAPTER_DETECTOR,
        userPrompt,
        0.2, 2048, { preferFast: false, timeoutMs: 90_000 }  // Full model — better chapter quality
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

    // Use xAI Grok for SEO — great at trending language and CTR-optimised copy
    // Fallback: best available model via router (never hard-code a single provider)
    let result;
    try {
        result = await callAgent(
            PROMPTS.SEO_COPYWRITER,
            userPrompt,
            0.7, 3000, { provider: 'xai', timeoutMs: 60_000 }   // Grok-3 via xAI OpenAI-compatible endpoint
        );
    } catch (err) {
        console.warn(`⚠️ [seoNode] xAI/Grok failed (${err.message}), falling back to best available model`);
        result = await callAgent(
            PROMPTS.SEO_COPYWRITER,
            userPrompt,
            0.7, 3000, { preferFast: false, timeoutMs: 60_000 }
        );
    }

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

export async function thumbnailDirectionNode({ video, analysis, seo, brandContext, extractedFrames = [] }) {
    console.log(`🎨 [thumbnailDirectionNode] Creative Director — Screen-Grounded CTR Strategy`);

    const peakMoment  = analysis.peakMoment;
    const characters  = analysis.characters || [];
    const videoTitle  = video.metadata.title || '';

    // ── Build character context ───────────────────────────────────────────────
    const characterContext = characters.length
        ? characters.map(c =>
            `  - ${c.label} (${c.role}, ${c.screenTimePct}% screen time)` +
            (c.visualDescription ? `: ${c.visualDescription}` : '') +
            (c.position ? ` | Position: ${c.position}` : '')
          ).join('\n')
        : 'None identified';

    const peakMomentContext = peakMoment
        ? [
            `PEAK MOMENT — the most dramatic/emotional moment in the video:`,
            `  Timestamp: ${peakMoment.timestamp}`,
            `  What happens: ${peakMoment.title}`,
            `  Visual scene: ${peakMoment.sceneDescription}`,
            `  Dominant emotion: ${peakMoment.emotion}`,
          ].join('\n')
        : `TOP HIGHLIGHT: ${analysis.highlights?.[0]?.title || 'Not identified'}`;

    // ── Fetch screen grabs as inline images for Gemini Vision ────────────────
    // Pass ALL extracted frames (CDN frames) so the Creative Director can SEE
    // the actual video content and pick the most emotionally powerful frame.
    const frameImageParts = [];
    if (extractedFrames.length > 0) {
        console.log(`   📸 Fetching ${extractedFrames.length} screen grabs for Creative Director vision analysis...`);
        for (const frame of extractedFrames.slice(0, 6)) { // max 6 frames to stay within token budget
            if (!frame.url) continue;
            try {
                const res = await fetch(frame.url, { signal: AbortSignal.timeout(10000) });
                if (!res.ok) { console.warn(`   ⚠️ Frame fetch failed: ${frame.label} (${res.status})`); continue; }
                const buf = await res.arrayBuffer();
                const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
                frameImageParts.push({
                    inlineData: { data: Buffer.from(buf).toString('base64'), mimeType },
                    _label: frame.label,
                });
                console.log(`   ✅ Frame loaded: ${frame.label} (${Math.round(buf.byteLength / 1024)}KB)`);
            } catch (e) {
                console.warn(`   ⚠️ Frame ${frame.label} failed: ${e.message}`);
            }
        }
    }

    if (frameImageParts.length === 0) {
        console.warn(`   ⚠️ No screen grabs available — Creative Director working from text descriptions only`);
    } else {
        console.log(`   🎬 Creative Director has ${frameImageParts.length} real video frames to analyze`);
    }

    // ── Build the user prompt for the Creative Director ───────────────────────
    const userPrompt = [
        brandContext || 'No brand context',
        '',
        `VIDEO TITLE: ${videoTitle}`,
        `SUMMARY: ${analysis.summary}`,
        `EMOTIONAL ARC: ${analysis.emotionalArc}`,
        `CONTENT TYPE: ${analysis.contentType || 'unknown'}`,
        `TONE: ${analysis.tone || 'unknown'}`,
        '',
        peakMomentContext,
        '',
        `CHARACTERS (with visual descriptions):`,
        characterContext,
        '',
        `KEY HIGHLIGHTS: ${analysis.highlights?.slice(0, 3).map(h => h.title).join(', ') || ''}`,
        '',
        `SEO INTELLIGENCE (use for clickbait copy):`,
        `  Recommended title: ${seo?.recommendedTitle || ''}`,
        `  CTR titles: ${seo?.titles?.map(t => t.text).slice(0, 3).join(' | ') || ''}`,
        `  Thumbnail text suggestion: ${seo?.thumbnailTextSuggestion || ''}`,
        `  SEO keywords: ${seo?.seoKeywords?.slice(0, 6).join(', ') || ''}`,
        '',
        frameImageParts.length > 0
            ? `SCREEN GRABS PROVIDED: ${frameImageParts.length} real frames from this video are attached as images. Analyze them visually — identify the most emotionally powerful frame, the character expressions, the color palette, and the composition. Ground your thumbnail concept in what you actually SEE in these frames.`
            : `NOTE: No screen grabs available. Base your concept on the text descriptions above.`,
    ].join('\n');

    // ── Call Gemini Vision directly (supports inline image arrays) ────────────
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_IMAGE_API_KEY;
    if (!geminiKey) {
        // Fallback to text-only callMultimodalAgent
        console.warn(`   ⚠️ No GEMINI_API_KEY — falling back to text-only creative direction`);
        const result = await callMultimodalAgent(
            PROMPTS.THUMBNAIL_DIRECTOR,
            userPrompt,
            [],
            { temperature: 0.75, maxTokens: 2500 }
        );
        return { thumbnailDirection: result };
    }

    try {
        const parts = [
            { text: PROMPTS.THUMBNAIL_DIRECTOR + '\n\n---\n\n' + userPrompt },
            ...frameImageParts.map(({ inlineData }) => ({ inlineData })),
        ];

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts }],
                    generationConfig: { temperature: 0.75, maxOutputTokens: 2500, responseMimeType: 'application/json' },
                }),
                signal: AbortSignal.timeout(45000),
            }
        );

        const d = await resp.json();
        const raw = d.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);

        if (match) {
            const result = JSON.parse(match[0]);
            console.log(`✅ [thumbnailDirectionNode] Creative direction complete:`);
            console.log(`   CTR strategy: ${result.ctrStrategy?.substring(0, 80)}`);
            console.log(`   Screen grab insight: ${result.screenGrabInsight?.substring(0, 80)}`);
            console.log(`   Overlay: "${result.textOverlay?.line1}" | Power word: ${result.textOverlay?.powerWordUsed}`);
            console.log(`   Clickbait variants: ${result.clickbaitCopyVariants?.length || 0} generated`);
            console.log(`   Est. CTR: ${result.ctrScoreEstimate}%`);
            return { thumbnailDirection: result };
        } else {
            throw new Error(`Creative Director returned non-JSON: ${raw.substring(0, 100)}`);
        }
    } catch (e) {
        console.warn(`   ⚠️ Gemini Vision creative direction failed: ${e.message} — falling back to text-only`);
        const result = await callMultimodalAgent(
            PROMPTS.THUMBNAIL_DIRECTOR,
            userPrompt,
            [],
            { temperature: 0.75, maxTokens: 2500 }
        );
        return { thumbnailDirection: result };
    }
}



/**
 * Phase 3: Thumbnail Generation — 2-Step MCoT Pipeline
 *
 * ARCHITECTURE (matching Creative Studio ai-adapt):
 *
 * Step A — MCoT Analysis: Gemini 2.5 Flash analyzes the template reference image and extracts
 *   structured broadcast design DNA: lower-third bar, logo position, color palette,
 *   layout structure, text style, overall aesthetic.
 *
 * Step B — Generation: NanoBanana 2 generates a FRESH dramatic scene from:
 *   - Character descriptions from video analysis (NOT YouTube thumbnail restyle)
 *   - Peak moment / key scene from video intelligence
 *   - Template aesthetic (colors, mood, composition) from Step A
 *   - Explicit lower-third bar + brand logo reconstruction
 *   - Template reference image as Style Guide inline (not face reference)
 *
 * The YouTube thumbnail is NOT used as a face reference — it's often a generic
 * auto-generated still. Instead, we use character visual descriptions from the
 * analysis to generate characters de-novo in the show's visual style.
 *
 * Models: PRIMARY = gemini-3.1-flash-image-preview via @google/genai SDK
 *         FALLBACK = fal-ai/flux-pro/v1.1
 */
export async function thumbnailGenerationNode({ thumbnailDirection, video, brandContext, template, characterPortraits = [], extractedFrames = [] }) {
    const videoTitle    = video?.metadata?.title       || '';
    const characters    = video?.analysis?.characters  || [];
    const peakMoment    = video?.analysis?.peakMoment  || null;

    // ── Best extracted frame — use as visual context reference ───────────────────
    // HD frame (maxresdefault) is preferred; fall back to hqdefault
    const bestFrame = extractedFrames.find(f => f.label === 'HD Cover Frame') 
        || extractedFrames.find(f => f.label === 'HQ Cover Frame')
        || extractedFrames[0] 
        || null;
    const referenceFrameUrl = bestFrame?.url || null;
    if (referenceFrameUrl) {
        console.log(`   🎬 Using extracted frame as visual reference: ${bestFrame.label} (${bestFrame.sizeKb}KB)`);
    }


    // ── Text overlay ────────────────────────────────────────────────────────────
    const line1 = thumbnailDirection?.textOverlay?.line1
        || (videoTitle ? videoTitle.split(' ').slice(0, 5).join(' ').toUpperCase() : '');
    const line2 = thumbnailDirection?.textOverlay?.line2 || '';

    // ── Character details — the FOUNDATION of the image scene ──────────────────
    // Rich visual descriptions drive character appearance since we don't restyle the YT thumbnail
    const leadCharacter = characters[0] || null;
    const characterList = characters.length
        ? characters.map(c =>
            `${c.role ? `[${c.role}] ` : ''}${c.label}${c.visualDescription ? ': ' + c.visualDescription : ''}${c.position ? ` — screen position: ${c.position.replace(/-/g, ' ')}` : ''}`
          ).join('\n  ')
        : '';

    // ── Peak moment — the SCENE we want to capture ─────────────────────────────
    const peakScene = thumbnailDirection?.peakMomentUsed
        || peakMoment?.sceneDescription
        || thumbnailDirection?.imageGenerationPrompt
        || `dramatic scene from "${videoTitle}"`;

    const peakEmotion = peakMoment?.emotion || thumbnailDirection?.emotion || 'dramatic';

    // ── Brand context ────────────────────────────────────────────────────────────
    const brandSnippet = brandContext ? brandContext.substring(0, 200) : '';

    // ── Template stored DNA ──────────────────────────────────────────────────────
    const tplVisual   = template?.visual;
    const templateRef = template?.referenceImageUrl;

    const baseTemplateStyle = tplVisual ? [
        `Colors: primary ${tplVisual.primaryColor}, secondary ${tplVisual.secondaryColor}, bg ${tplVisual.backgroundColor}`,
        `Mood: ${tplVisual.backgroundStyle}, ${tplVisual.overlayMood}, energy: ${tplVisual.energyLevel}`,
        `Text: ${tplVisual.titleFont} font, ${tplVisual.titleColor} color, ${tplVisual.titleShadow} shadow`,
        template.generationPromptSuffix ? template.generationPromptSuffix : '',
    ].filter(Boolean).join('. ') : '';

    const directionStyle = !template ? [
        thumbnailDirection?.imageGenerationPrompt || '',
        `Mood: ${thumbnailDirection?.emotion || 'dramatic'}`,
        thumbnailDirection?.dominantColor ? `Color: ${thumbnailDirection.dominantColor}` : '',
    ].filter(Boolean).join('. ') : '';

    console.log(`\n🎨 [thumbnailGenerationNode] 2-Step MCoT — FRESH SCENE GENERATION`);
    console.log(`   Video: "${videoTitle.substring(0, 60)}"`);
    console.log(`   Template: ${template ? `"${template.name}" | ref: ${templateRef ? '✅' : '❌ none'} | directive: ${template.generationPromptSuffix ? '✅' : '⚠️  EMPTY'}` : 'none'}`);
    console.log(`   Characters: ${characters.length} — ${leadCharacter?.label || 'none'}`);
    console.log(`   Peak scene: ${peakScene.substring(0, 80)}`);
    console.log(`   Text overlays: "${line1}"${line2 ? ` / "${line2}"` : ''}`);
    console.log(`   🚫 NOT using YouTube thumbnail as face ref — generating fresh scene from character descriptions`);

    const geminiKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error('GEMINI_IMAGE_API_KEY not configured');

    // ── Helper: fetch any URL as inline image data ───────────────────────────────
    async function fetchInline(url, label) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
            if (!res.ok) { console.warn(`   ⚠️ ${label}: HTTP ${res.status}`); return null; }
            const buf = await res.arrayBuffer();
            const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
            console.log(`   ✅ ${label} (${Math.round(buf.byteLength / 1024)}KB)`);
            return { inlineData: { data: Buffer.from(buf).toString('base64'), mimeType } };
        } catch (e) {
            console.warn(`   ⚠️ ${label} failed: ${e.message}`);
            return null;
        }
    }

    // ── Load template reference image (style guide, NOT face reference) ──────────
    const templateRefPart = templateRef ? await fetchInline(templateRef, 'Template style reference') : null;

    // ── Load character portrait as face anchor (if previously generated) ─────────
    const leadPortraitUrl = characterPortraits?.find(p => p.portraitUrl && !p.error)?.portraitUrl || null;
    const leadPortraitPart = leadPortraitUrl ? await fetchInline(leadPortraitUrl, 'Lead character portrait') : null;
    console.log(`   Lead portrait anchor: ${leadPortraitPart ? '✅' : '❌ none (generating characters from text descriptions)'}`);

    // ── Load reference frame as actual inline image ────────────────────────────────
    // This is the KEY fix: previously referenceFrameUrl was only mentioned in the text prompt.
    // Now we fetch it inline so GPT Image 2 + Gemini can actually SEE the video frame.
    const referenceFramePart = referenceFrameUrl ? await fetchInline(referenceFrameUrl, 'Video screen grab (reference frame)') : null;
    console.log(`   Screen grab reference: ${referenceFramePart ? `✅ loaded (${bestFrame?.label})` : '❌ none'}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP A — MCoT: Deep analysis of the template reference image
    //   Extract the broadcast design DNA that must be RECONSTRUCTED in the output:
    //   lower-third bar, logo position, color palette, layout, text style,
    //   decorative elements, overall production aesthetic
    // ═══════════════════════════════════════════════════════════════════════════
    let ta = {};  // template analysis result
    if (templateRefPart) {
        console.log(`   🔍 Step A: Analyzing template image for broadcast DNA...`);
        const t0 = Date.now();
        try {
            const analyzeResp = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            role: 'user',
                            parts: [
                                templateRefPart,
                                { text: `Analyze this Indian TV broadcast / YouTube show thumbnail. Extract EVERY visual element that must be RECONSTRUCTED when making a new thumbnail in the same style.

Return ONLY a JSON object, no markdown:
{
  "showName": "exact name of show visible",
  "lowerThird": "describe the lower-third bar EXACTLY — height proportion, background color/gradient, text color, font weight, position",
  "colorPalette": ["#hex1","#hex2","#hex3"],
  "mainSubjectPosition": "where the main character stands — e.g. 'left-center', 'full-frame center', 'right side'",
  "backgroundScene": "describe the background — outdoor woodland/trees, indoor set, studio, etc.",
  "textStyle": "describe font weight, color, shadow, stroke used for any on-screen text",
  "overallAesthetic": "2-sentence description of the production quality, cultural style, and mood",
  "reconstructionInstruction": "Step-by-step instruction for an image generator to recreate this EXACT broadcast template format with new characters. Be very specific about the lower-third bar and character positioning."
}` }
                            ]
                        }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 1200 },
                    }),
                    signal: AbortSignal.timeout(35000),
                }
            );
            const d = await analyzeResp.json();
            const raw = d.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
            const match = raw.replace(/```json\s*/g,'').replace(/```\s*/g,'').trim().match(/\{[\s\S]*\}/);
            if (match) {
                ta = JSON.parse(match[0]);
                console.log(`   ✅ Step A (${Date.now()-t0}ms): show="${ta.showName}", lower-third="${ta.lowerThird?.substring(0,60)}"`);
            } else {
                console.warn(`   ⚠️ Step A failed to parse JSON. Raw: ${raw.substring(0, 100)}...`);
            }
        } catch (e) {
            console.warn(`   ⚠️ Step A failed: ${e.message} — using stored template DNA`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP B — Build the generation prompt
    //
    // Goal: Generate a FRESH scene showing the show's characters in the peak moment,
    //       styled exactly like the template (same lower-third, same logo position,
    //       same color palette, same broadcast production quality).
    //       Do NOT restyle the YouTube cover — generate new content.
    // ═══════════════════════════════════════════════════════════════════════════

    // Template style block (MCoT-analyzed takes priority)
    const templateStyleBlock = [
        `=== TEMPLATE "${template?.name || 'Show Template'}" — RECREATE THIS BROADCAST FORMAT EXACTLY ===`,
        ta.overallAesthetic  ? `Aesthetic: ${ta.overallAesthetic}` : (baseTemplateStyle || directionStyle),
        ta.colorPalette?.length ? `Color palette: ${ta.colorPalette.join(', ')}` : '',
        ta.backgroundScene   ? `Background scene type: ${ta.backgroundScene}` : '',
        ta.mainSubjectPosition ? `Subject placement: ${ta.mainSubjectPosition}` : '',
        ta.textStyle         ? `Text style: ${ta.textStyle}` : '',
        template?.generationPromptSuffix ? `\nSHOW STYLE DIRECTIVE: ${template.generationPromptSuffix}` : '',
    ].filter(Boolean).join('\n');

    // Lower-third — the key broadcast element to rebuild (Logos are explicitly omitted)
    const broadcastElementsBlock = [
        // Lower-third title bar (the most visible template element)
        ta.lowerThird
            ? `\nLOWER-THIRD TITLE BAR (CRITICAL): ${ta.lowerThird}. This bar MUST be present in the output.`
            : '\nLOWER-THIRD TITLE BAR: Add a dark gradient bar at the bottom of the image (occupying roughly the bottom 15% of height), containing the episode title text.',
        // Text inside the lower third
        line1
            ? `Text inside lower-third bar: "${line1}" — ${ta.textStyle || 'bold, white/light colored text, centered or left-aligned'}.`
            : '',
        line2 ? `Additional text: "${line2}"` : '',
        // Reconstruction instruction from MCoT
        ta.reconstructionInstruction ? `\nRECONSTRUCTION GUIDE: ${ta.reconstructionInstruction}` : '',
    ].filter(Boolean).join('\n');

    // How to describe the character(s) to generate
    const characterGenerationBlock = leadPortraitPart
        ? `CHARACTER: Use the provided reference portrait image for the lead character's exact appearance. Place them in the scene as the focal subject.`
        : (characterList
            ? `CHARACTERS TO GENERATE (from AI video analysis — create these people from scratch matching these descriptions):\n  ${characterList}`
            : 'Generate the show\'s lead character(s) appropriate to the show style and scene.');

    // Build the master generation prompt
    const fullPrompt = [
        `Create a professional Indian TV drama YouTube thumbnail (1280×720, 16:9).`,
        `Video title: "${videoTitle}"`,
        `Show: "${ta.showName || template?.name || 'Indian TV drama'}"`,

        `\n=== WHAT TO GENERATE (GRAPHIC DESIGN + PHOTOGRAPHY) ===`,
        `You are generating a final YouTube thumbnail asset. First, create a FRESH, cinematically lit dramatic scene showing the characters. Second, you MUST composite the required broadcast graphic elements (specifically the lower-third title bar) directly onto the image. This is a broadcast graphic, not just a raw photograph.`,

        `\nKEY SCENE TO DEPICT:`,
        peakScene,
        `Emotional tone: ${peakEmotion}`,

        `\n${characterGenerationBlock}`,

        `\n${templateStyleBlock}`,

        `\n=== BROADCAST OVERLAY ELEMENTS (MUST INCLUDE) ===`,
        broadcastElementsBlock,

        brandSnippet ? `\nBrand context: ${brandSnippet}` : '',

        `\n=== HARD RULES ===`,
        `- Aspect ratio: 16:9, 1280×720px`,
        `- The lower-third title bar with text IS MANDATORY — include it`,
        `- DO NOT GENERATE ANY BRAND LOGO OR CHANNEL LOGO. Logos will cause hallucinations. Leave space where logos would go; the real brand logo will be overlaid digitally later.`,
        `- Characters must be ${ta.mainSubjectPosition || 'prominently featured'} in the frame`,
        `- DO NOT include any fictional logos or watermarks`,
        `- Broadcast quality: sharp, vibrant, cinematic lighting`,
        `- Style reference image is provided — match its layout structure, NOT its specific scene`,
    ].filter(Boolean).join('\n');

    // ═══════════════════════════════════════════════════════════════════════════
    // Execute Image Generation — GPT Image 2 (primary) → Gemini (fallback)
    // ═══════════════════════════════════════════════════════════════════════════
    // ── Build CTR-optimized generation prompt from Creative Director output ──────
    // RULE: line1 = short punchy hook (max 4 words) → floats as BIG overlay text on image
    //       bestClickbaitCopy = full clickbait sentence → only in the lower-third bar
    // This prevents the same copy appearing twice (once as big text, once in lower-third).
    const bestClickbaitCopy = thumbnailDirection?.clickbaitCopyVariants?.[0] || line1;
    const overlayText = line1 || bestClickbaitCopy.split(' ').slice(0, 4).join(' ').toUpperCase();

    const genPrompt = [
        `Professional YouTube thumbnail (16:9, 1536x1024).`,
        `Video title: "${videoTitle}"`,
        ``,
        `=== CREATIVE DIRECTOR BRIEF ===`,
        thumbnailDirection?.ctrStrategy ? `CTR STRATEGY: ${thumbnailDirection.ctrStrategy}` : '',
        thumbnailDirection?.screenGrabInsight ? `VISUAL GROUNDING (from actual video frames): ${thumbnailDirection.screenGrabInsight}` : '',
        thumbnailDirection?.concept ? `THUMBNAIL CONCEPT: ${thumbnailDirection.concept}` : '',
        ``,
        `=== KEY SCENE TO DEPICT ===`,
        thumbnailDirection?.imageGenerationPrompt
            ? `SCENE: ${thumbnailDirection.imageGenerationPrompt}`
            : `SCENE: ${peakScene}`,
        `Emotional tone: ${peakEmotion} — convey this STRONGLY through facial expression and body language.`,
        `Composition: ${thumbnailDirection?.composition || 'center-subject'}`,
        `Background treatment: ${thumbnailDirection?.backgroundTreatment || 'dramatic-scene'}`,
        ``,
        characterList
            ? `CHARACTERS (generate these people from scratch matching descriptions):\n  ${characterList.substring(0, 400)}`
            : 'Generate the lead character(s) appropriate to the content.',
        ``,
        ta.overallAesthetic || baseTemplateStyle || directionStyle
            ? `VISUAL STYLE: ${ta.overallAesthetic || baseTemplateStyle || directionStyle}`
            : '',
        `Dominant color: ${thumbnailDirection?.dominantColor || ta.colorPalette?.[0] || '#FF4500'}`,
        ta.colorPalette?.length ? `Full color palette: ${ta.colorPalette.join(', ')}` : '',
        ta.backgroundScene ? `Background scene type: ${ta.backgroundScene}` : '',
        ta.mainSubjectPosition ? `Subject position: ${ta.mainSubjectPosition}` : '',
        ``,
        `=== TEXT OVERLAYS — TWO DISTINCT ELEMENTS ===`,
        `ELEMENT 1 — BIG FLOATING HOOK TEXT (upper/center area of image):`,
        `  Text: "${overlayText}"`,
        `  Style: ${thumbnailDirection?.textOverlay?.style || 'bold-block'} — color ${thumbnailDirection?.textOverlay?.color || '#FFFFFF'} — GIANT — readable at 160px — add bold stroke/outline`,
        `  Place in the upper third OR center of the image, NEVER at the bottom (that is reserved for Element 2)`,
        ``,
        `ELEMENT 2 — LOWER-THIRD TITLE BAR (bottom strip of image):`,
        ta.lowerThird
            ? `  ${ta.lowerThird}. Text inside bar: "${bestClickbaitCopy}"`
            : `  Dark semi-transparent gradient bar occupying the bottom 15% of image. Bold white text: "${bestClickbaitCopy}"`,
        `  This bar MUST be clearly separate from Element 1. Do NOT repeat Element 1's text here.`,
        ta.reconstructionInstruction ? `RECONSTRUCTION: ${ta.reconstructionInstruction.substring(0, 300)}` : '',
        ``,
        `=== GRAPHIC ELEMENTS (APPLY THESE) ===`,
        thumbnailDirection?.graphicElements
            ? thumbnailDirection.graphicElements
            : `Add bold visual emphasis — bright arrows or highlight circles directing attention to the main subject's expression`,
        ``,
        template?.generationPromptSuffix ? `SHOW STYLE DIRECTIVE: ${template.generationPromptSuffix}` : '',
        brandSnippet ? `Brand context: ${brandSnippet}` : '',
        referenceFramePart
            ? `SCREEN GRAB REFERENCE IMAGE PROVIDED: The actual video frame is attached. Use it as the visual foundation — match character appearance, scene setting, and color palette. Then generate a HEIGHTENED, cinematic, high-contrast version of that exact moment.`
            : '',
        ``,
        `=== CTR HARD RULES ===`,
        `- 16:9 landscape orientation, 1536x1024px output`,
        `- Main subject's FACE must show EXTREME EMOTION — this is the #1 CTR driver`,
        `- HIGH CONTRAST between subject and background — subject must POP visually`,
        `- Cinematic dramatic lighting — chiaroscuro, rim lighting, or color contrast`,
        `- BOTH text elements must be composited ON the image — bold, outlined, readable at 160px`,
        `- Element 1 (hook text) and Element 2 (lower-third bar) must contain DIFFERENT text`,
        `- NO brand logos, NO channel watermarks (will be overlaid digitally later)`,
        `- Photorealistic, broadcast quality, not cartoonish`,
        `- Make it look like the #1 most-clicked thumbnail in this video's niche`,
    ].filter(Boolean).join('\n');


    console.log(`   🚀 [gpt-image-2] Generating 16:9 HD thumbnail...`);
    console.log(`   Overlay text: "${overlayText}" | Lower-third: "${bestClickbaitCopy.substring(0, 50)}"`);

    const router = getRouter();
    const openaiProvider = router.providers.openai;

    // ── Try GPT Image 2 — with screen grab reference if available ────────────────────
    // Use generateImageEdit when we have a reference frame (passes image as actual input)
    // Use generateImage (text-to-image) as fallback when no frame is available
    try {
        let finalUrl;

        if (referenceFramePart && openaiProvider?.isAvailable() && typeof openaiProvider.generateImageEdit === 'function') {
            // PRIMARY: generateImageEdit — GPT Image 2 sees the actual video frame
            console.log(`   🎬 [gpt-image-2 edit] Using screen grab reference frame as visual anchor...`);
            const editResult = await openaiProvider.generateImageEdit({
                prompt: genPrompt,
                referenceImageBase64: referenceFramePart.inlineData.data,
                referenceImageMime: referenceFramePart.inlineData.mimeType,
                size: '1536x1024',
            });
            const b64 = editResult?.b64 || editResult?.b64_json;
            if (!b64) throw new Error('generateImageEdit returned no b64');
            const s3Key = `yt-studio/thumbnails/yt-thumb-${Date.now()}-edit.png`;
            finalUrl = await uploadBase64ToS3(b64, s3Key);
            console.log(`   ✅ [gpt-image-2 edit] Screen-grounded → S3: ${finalUrl.substring(0, 80)}`);
        } else {
            // FALLBACK: text-to-image (no frame available or generateImageEdit not available)
            console.log(`   🎨 [gpt-image-2 generate] Text-to-image (no screen grab available)...`);
            const result = await router.generateImage({
                prompt:      genPrompt,
                model:       'gpt-image-2',
                aspectRatio: '16:9',
                quality:     'hd',
            }, { provider: 'openai' });

            const rawUrl   = typeof result === 'string' ? result : result.imageUrl;
            const b64Raw   = result?.b64 || result?.b64_json || null;
            const isDataUri = rawUrl?.startsWith('data:');

            if (b64Raw) {
                const s3Key = `yt-studio/thumbnails/yt-thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
                finalUrl = await uploadBase64ToS3(b64Raw, s3Key);
            } else if (isDataUri) {
                const b64Stripped = rawUrl.split(',')[1];
                const s3Key = `yt-studio/thumbnails/yt-thumb-${Date.now()}.png`;
                finalUrl = await uploadBase64ToS3(b64Stripped, s3Key);
            } else if (rawUrl?.startsWith('http')) {
                finalUrl = await persistToS3(rawUrl, 'yt-studio/thumbnails');
            } else {
                throw new Error('GPT Image 2 returned no usable image data');
            }
            console.log(`   ✅ [gpt-image-2 generate] → S3: ${finalUrl.substring(0, 80)}`);
        }

        console.log(`✅ [thumbnailGenerationNode] GPT Image 2 success → S3`);
        return { generatedThumbnailUrl: finalUrl, thumbnailGenerationError: null, generatorModel: referenceFramePart ? 'gpt-image-2-edit' : 'gpt-image-2' };

    } catch (gptErr) {
        console.warn(`⚠️ [thumbnailGenerationNode] GPT Image 2 failed: ${gptErr.message} — trying Gemini fallback`);
    }


    // ── Fallback: Gemini 3.1 Flash Image — include screen grab as reference ────────
    try {
        const result = await router.generateImage({
            prompt: genPrompt,
            aspectRatio: '16:9',
            imageParts: [
                ...(referenceFramePart ? [referenceFramePart] : []),  // ✅ actual video frame
                ...(leadPortraitPart   ? [leadPortraitPart]   : []),  // ✅ character portrait
                ...(templateRefPart    ? [templateRefPart]    : []),  // ✅ template style guide
            ],
        }, { provider: 'gemini' });

        const rawUrl = typeof result === 'string' ? result : result.imageUrl;
        const finalUrl = await persistToS3(rawUrl || '', 'yt-studio/thumbnails');
        console.log(`✅ [thumbnailGenerationNode] Gemini fallback success → S3`);
        return { generatedThumbnailUrl: finalUrl || rawUrl, thumbnailGenerationError: null, generatorModel: 'gemini' };
    } catch (gemErr) {
        console.warn(`❌ [thumbnailGenerationNode] Both providers failed: ${gemErr.message}`);
        return { generatedThumbnailUrl: null, thumbnailGenerationError: gemErr.message, generatorModel: null };
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
    const ytId         = video?.videoId || (video?.youtubeUrl && video.youtubeUrl.split('v=')[1]);

    if (!characters.length) {
        console.log('ℹ️ [characterPortraitNode] No characters identified — skipping');
        return { characterPortraits: [] };
    }

    console.log(`👤 [characterPortraitNode] Fetching visual screen grabs for ${characters.length} character(s)`);

    const characterPortraits = characters.slice(0, 3).map((char) => {
        let frameSeek = null;
        if (char.firstAppearance) {
            const parts = char.firstAppearance.split(':').map(Number);
            frameSeek = parts.length === 3
                ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                : parts[0] * 60 + (parts[1] || 0);
        }

        const portraitUrl = (ytId && frameSeek != null)
            ? `https://img.youtube.com/vi_webp/${ytId}/${Math.max(1, Math.floor(frameSeek))}.webp`
            : referenceUrl;

        console.log(`   ✅ Real character portrait mapped for: ${char.label}`);
        return {
            label:           char.label,
            role:            char.role,
            firstAppearance: char.firstAppearance,
            screenTimePct:   char.screenTimePct,
            visualDescription: char.visualDescription || null,
            portraitUrl,
        };
    });

    const successCount = characterPortraits.filter(p => p.portraitUrl).length;
    console.log(`✅ [characterPortraitNode] ${successCount}/${characters.slice(0,3).length} portraits mapped from video frames`);
    return { characterPortraits };
}


// ── 9. Frame Extraction Node ──────────────────────────────────────────────────

/**
 * Frame Extraction Node
 * Fetches YouTube CDN thumbnail frames as visual grounding for thumbnail generation.
 * YouTube serves auto-generated frames:
 *   0.jpg / maxresdefault.jpg = best auto frame
 *   1.jpg / 2.jpg / 3.jpg    = frames at ~25%, 50%, 75%
 */
export async function frameExtractionNode({ videoId }) {
    if (!videoId) return { extractedFrames: [] };
    console.log(`🎬 [frameExtractionNode] Extracting YouTube CDN frames for ${videoId}`);

    const frameUrls = [
        { url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, label: 'HD Cover Frame' },
        { url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,     label: 'HQ Cover Frame' },
        { url: `https://img.youtube.com/vi/${videoId}/1.jpg`,             label: 'Frame at 25%' },
        { url: `https://img.youtube.com/vi/${videoId}/2.jpg`,             label: 'Frame at 50%' },
        { url: `https://img.youtube.com/vi/${videoId}/3.jpg`,             label: 'Frame at 75%' },
    ];

    const frames = [];
    for (const { url, label } of frameUrls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            // Skip YouTube's 1×1 grey placeholder (returned when a frame doesn't exist)
            if (buf.byteLength < 2000) continue;
            frames.push({ url, label, sizeKb: Math.round(buf.byteLength / 1024) });
            console.log(`   ✅ ${label} → ${url.split('/').pop()} (${Math.round(buf.byteLength / 1024)}KB)`);
        } catch { /* skip unavailable frames silently */ }
    }

    console.log(`   🎬 Extracted ${frames.length} frames for video ${videoId}`);
    return { extractedFrames: frames };
}


// ── 10. Promo Cuts Node ───────────────────────────────────────────────────────

/**
 * Promo Cuts Node
 * Takes raw promoCuts from analysisNode and refines them into
 * social-media-ready promo clip recommendations with captions.
 */
export async function promoNode({ analysis, video, brandContext }) {
    const rawCuts = analysis?.promoCuts;
    if (!rawCuts?.length) {
        console.log('ℹ️ [promoNode] No promo cuts from analysis — skipping');
        return { promoCuts: [] };
    }

    console.log(`🎬 [promoNode] Refining ${rawCuts.length} promo cuts into social-ready clips`);

    const userPrompt = [
        brandContext || 'No brand context',
        '',
        `VIDEO: "${video.metadata?.title || 'Unknown'}" by ${video.metadata?.channelTitle || 'Unknown'}`,
        `DURATION: ${video.duration || 'Unknown'}`,
        `PEAK MOMENT: ${analysis.peakMoment?.timestamp} — ${analysis.peakMoment?.title || ''}`,
        '',
        'RAW PROMO CUTS FROM VIDEO ANALYSIS:',
        JSON.stringify(rawCuts, null, 2),
    ].join('\n');

    const result = await callAgent(
        PROMPTS.PROMO_DIRECTOR,
        userPrompt,
        0.7, 2048, { preferFast: true, timeoutMs: 45_000 }
    );

    return { promoCuts: result.cuts || rawCuts };
}
