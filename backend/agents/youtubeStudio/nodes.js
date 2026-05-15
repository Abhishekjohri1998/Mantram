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
    // characterPortraits are generated by Node 8 (characterPortraitNode) using the YT thumbnail
    // They are AI-generated portraits grounded to the real characters — much better face ref
    const leadPortraitUrl = characterPortraits?.find(p => p.portraitUrl && !p.error)?.portraitUrl || null;
    const leadPortraitPart = leadPortraitUrl ? await fetchInline(leadPortraitUrl, 'Lead character portrait') : null;
    console.log(`   Lead portrait anchor: ${leadPortraitPart ? '✅' : '❌ none (generating characters from text descriptions)'}`);

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
    const genPrompt = [
        `Professional YouTube thumbnail (16:9, 1536x1024) for a ${ta.showName || template?.name || 'YouTube video'} video.`,
        `Video title: "${videoTitle}"`,
        ``,
        `KEY SCENE: ${peakScene}`,
        `Emotional tone: ${peakEmotion} — convey this strongly through facial expression and body language.`,
        ``,
        characterList
            ? `CHARACTERS (generate these people from scratch matching descriptions):\n  ${characterList.substring(0, 400)}`
            : 'Generate the lead character(s) appropriate to the show.',
        ``,
        ta.overallAesthetic || baseTemplateStyle || directionStyle
            ? `VISUAL STYLE: ${ta.overallAesthetic || baseTemplateStyle || directionStyle}`
            : '',
        ta.colorPalette?.length ? `Color palette: ${ta.colorPalette.join(', ')}` : '',
        ta.backgroundScene ? `Background: ${ta.backgroundScene}` : '',
        ta.mainSubjectPosition ? `Subject position: ${ta.mainSubjectPosition}` : '',
        ``,
        `LOWER-THIRD TITLE BAR (MANDATORY): ${
            ta.lowerThird
                ? ta.lowerThird + `. Place it at the bottom with bold text: "${line1}"${line2 ? ' / "' + line2 + '"' : ''}`
                : `Dark gradient bar at the bottom 15% of the image. Text: "${line1}"${line2 ? ' and "' + line2 + '"' : ''}`
        }`,
        ta.reconstructionInstruction ? `RECONSTRUCTION: ${ta.reconstructionInstruction.substring(0, 300)}` : '',
        template?.generationPromptSuffix ? `SHOW STYLE: ${template.generationPromptSuffix}` : '',
        brandSnippet ? `Brand context: ${brandSnippet}` : '',
        referenceFrameUrl ? `VISUAL REFERENCE: A real extracted frame from this video is provided below. Use it for character appearance, setting, and color palette reference only — generate a fresh cinematic composition.` : '',
        ``,
        `HARD RULES:`,
        `- 16:9 landscape orientation, broadcast quality`,
        `- Cinematic lighting, sharp focus on the main subject`,
        `- High contrast, vibrant colors that pop on mobile`,
        `- NO brand logos, NO channel watermarks (space will be overlaid digitally)`,
        `- The lower-third title bar IS MANDATORY — do not omit it`,
        `- Photorealistic, not cartoonish or animated`,
    ].filter(Boolean).join('\n');

    console.log(`   🚀 [gpt-image-2] Generating 16:9 HD thumbnail...`);

    const router = getRouter();

    // ── Try GPT Image 2 first (primary) ────────────────────────────────────────────
    try {
        const result = await router.generateImage({
            prompt:      genPrompt,
            model:       'gpt-image-2',
            aspectRatio: '16:9',
            quality:     'hd',
        }, { provider: 'openai' });

        // gpt-image-2 returns b64_json — upload to S3 immediately, never store data: URIs
        const rawUrl   = typeof result === 'string' ? result : result.imageUrl;
        const b64Raw   = result?.b64 || result?.b64_json || null;
        const isDataUri = rawUrl?.startsWith('data:');

        let finalUrl;
        if (b64Raw) {
            // Preferred: raw b64 string — decode and upload
            const s3Key = `yt-studio/thumbnails/yt-thumb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
            finalUrl = await uploadBase64ToS3(b64Raw, s3Key);
            console.log(`   ✅ [gpt-image-2] b64 → S3: ${finalUrl.substring(0, 80)}`);
        } else if (isDataUri) {
            // Fallback: data: URI → strip prefix, extract b64, upload
            const b64Stripped = rawUrl.split(',')[1];
            const s3Key = `yt-studio/thumbnails/yt-thumb-${Date.now()}.png`;
            finalUrl = await uploadBase64ToS3(b64Stripped, s3Key);
            console.log(`   ✅ [gpt-image-2] data URI → S3: ${finalUrl.substring(0, 80)}`);
        } else if (rawUrl?.startsWith('http')) {
            // Already a URL (unlikely for gpt-image-2) — persist via ensureS3Url
            finalUrl = await persistToS3(rawUrl, 'yt-studio/thumbnails');
            console.log(`   ✅ [gpt-image-2] URL → S3: ${finalUrl.substring(0, 80)}`);
        } else {
            throw new Error('GPT Image 2 returned no usable image data');
        }

        console.log(`✅ [thumbnailGenerationNode] GPT Image 2 success → S3`);
        return { generatedThumbnailUrl: finalUrl, thumbnailGenerationError: null, generatorModel: 'gpt-image-2' };

    } catch (gptErr) {
        console.warn(`⚠️ [thumbnailGenerationNode] GPT Image 2 failed: ${gptErr.message} — trying Gemini fallback`);
    }


    // ── Fallback: Gemini 3.1 Flash Image ────────────────────────────────────────────
    try {
        const result = await router.generateImage({
            prompt: genPrompt,
            aspectRatio: '16:9',
            imageParts: [
                ...(leadPortraitPart ? [leadPortraitPart]  : []),
                ...(templateRefPart  ? [templateRefPart]   : []),
            ],
        }, { provider: 'gemini' });

        const rawUrl = typeof result === 'string' ? result : result.imageUrl;
        // Gemini may return data: URI or a temporary storage URL — persist both to S3
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

            // Hint about where in the frame the person appears
            const positionHint = char.position
                ? `They are typically positioned: ${char.position.replace(/-/g, ' ')}.`
                : '';

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
                // Persist portrait to S3 — no data: URIs or temporary provider URLs stored
                const rawPortraitUrl = result.imageUrl || (typeof result === 'string' ? result : null);
                const portraitUrl = rawPortraitUrl
                    ? await persistToS3(rawPortraitUrl, `yt-studio/portraits`)
                    : null;
                console.log(`   ✅ Portrait generated and persisted for: ${char.label}`);
                return {
                    label:           char.label,
                    role:            char.role,
                    firstAppearance: char.firstAppearance,
                    screenTimePct:   char.screenTimePct,
                    visualDescription: visualDescriptions[char.label] || null,
                    portraitUrl,
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
