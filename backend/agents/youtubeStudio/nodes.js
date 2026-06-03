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
import { getObjectStream, uploadToS3 } from '../../utils/s3.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const execAsync = promisify(exec);

// ── Gemini Files API Upload & Deletion ──────────────────────────────────────
async function uploadToGeminiFilesAPI(mediaUrl, contentType = 'video') {
    console.log(`📤 Downloading ${mediaUrl} to buffer for Gemini upload...`);
    let buffer;
    let mimeType = contentType === 'video' ? 'video/mp4' : 'image/jpeg';
    
    try {
        if (mediaUrl.includes('s3.amazonaws.com') || mediaUrl.includes('mantram')) {
            const { stream, contentType: s3Type } = await getObjectStream(mediaUrl);
            if (s3Type) mimeType = s3Type;
            
            const chunks = [];
            for await (const chunk of stream) chunks.push(chunk);
            buffer = Buffer.concat(chunks);
        } else {
            const response = await fetch(mediaUrl);
            if (!response.ok) throw new Error(`Failed to fetch media: ${response.statusText}`);
            const arrayBuffer = await response.arrayBuffer();
            buffer = Buffer.from(arrayBuffer);
            mimeType = response.headers.get('content-type') || mimeType;
        }

        console.log(`🚀 Uploading ${Math.round(buffer.length / 1024 / 1024)}MB to Gemini Files API...`);
        
        const initRes = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=resumable&key=${process.env.GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'X-Goog-Upload-Protocol': 'resumable',
                    'X-Goog-Upload-Command': 'start',
                    'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
                    'X-Goog-Upload-Header-Content-Type': mimeType,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file: { displayName: `youtube_upload_${Date.now()}` } })
            }
        );

        if (!initRes.ok) throw new Error(`Gemini init upload failed: ${initRes.statusText}`);
        const uploadUrl = initRes.headers.get('x-goog-upload-url');
        if (!uploadUrl) throw new Error('No upload URL returned from Gemini');

        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Protocol': 'resumable',
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
                'Content-Length': buffer.length.toString(),
            },
            body: buffer
        });

        if (!uploadRes.ok) throw new Error(`Gemini file upload failed: ${uploadRes.statusText}`);
        const fileInfo = await uploadRes.json();
        
        console.log(`✅ Gemini Upload Success: ${fileInfo.file.uri}`);
        return { fileUri: fileInfo.file.uri, fileName: fileInfo.file.name, mimeType };

    } catch (error) {
        console.error('Gemini file upload error:', error);
        throw error;
    }
}

async function deleteFromGemini(fileName) {
    if (!fileName) return;
    try {
        console.log(`🧹 Cleaning up Gemini file: ${fileName}`);
        await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${process.env.GEMINI_API_KEY}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error(`Failed to delete Gemini file ${fileName}:`, e.message);
    }
}

// ── FFmpeg Frame Extraction for Direct Video Uploads ─────────────────────────
async function getUploadedVideoDuration(videoUrl) {
    try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoUrl}"`);
        const durationSecs = parseFloat(stdout.trim());
        return isNaN(durationSecs) ? 120 : durationSecs;
    } catch (err) {
        console.warn('⚠️ Failed to get video duration using ffprobe:', err.message);
        return 120;
    }
}

async function extractFrameFromVideoUrl(videoUrl, timestampSecs, s3KeyPrefix) {
    const tempOut = path.join(os.tmpdir(), `frame-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`);
    try {
        const cmd = `ffmpeg -y -i "${videoUrl}" -ss ${timestampSecs} -vframes 1 -q:v 2 "${tempOut}"`;
        await execAsync(cmd);
        if (fs.existsSync(tempOut)) {
            const buffer = fs.readFileSync(tempOut);
            const key = `${s3KeyPrefix}/frame-${timestampSecs}s.jpg`;
            const s3Url = await uploadToS3(buffer, key, 'image/jpeg');
            fs.unlinkSync(tempOut);
            return s3Url;
        }
    } catch (err) {
        console.warn(`⚠️ Failed to extract frame at ${timestampSecs}s:`, err.message);
        if (fs.existsSync(tempOut)) fs.unlinkSync(tempOut);
    }
    return null;
}

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

export async function transcriptNode({ videoId, videoUrl, isYT = true }) {
    if (!isYT) {
        console.log(`📹 [transcriptNode] Processing direct video file upload: ${videoId}`);
        const filename = (videoUrl || '').split('/').pop() || 'Uploaded Video';
        return {
            videoId,
            youtubeUrl: videoUrl,
            metadata: {
                title: filename.substring(0, 80),
                description: 'Uploaded Video File',
                channelTitle: 'Uploaded Video',
                publishedAt: new Date(),
                thumbnailUrl: '',
                viewCount: 0,
                tags: []
            },
            transcript: {
                available: false,
                text: null,
                segments: [],
                language: null,
                source: 'none'
            },
            duration: null
        };
    }

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

export async function analysisNode({ video, brandContext, knownCasts = [], writingStyleAnalysis = null, extractedFrames = [] }) {
    console.log(`🧠 [analysisNode] Running MCoT video analysis (Deep Semantic Analysis)`);

    const { transcript, metadata, youtubeUrl } = video;
    const isYT = youtubeUrl.includes('youtube.com') || youtubeUrl.includes('youtu.be');

    // Build the analysis input
    let videoContext = [
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

    if (writingStyleAnalysis) {
        videoContext += `\nWRITING STYLE REFERENCE (CRITICAL):\nAdopt this exact writing style for all text outputs (summary, peakMoment title, highlight descriptions, etc.):\n${writingStyleAnalysis}\n`;
    }

    const castBankSection = knownCasts.length > 0
        ? `KNOWN CAST BANK (Use this to map characters to exact names if they match descriptions):\n${knownCasts.map(c => `  - Name: "${c.name}" | Description: ${c.description} | Role: ${c.role}`).join('\n')}\n`
        : '';

    const transcriptSection = transcript.available
        ? `TRANSCRIPT (timestamped):\n${transcript.text?.substring(0, 15000)}${transcript.text?.length > 15000 ? '\n... [transcript truncated for context]' : ''}`
        : `TRANSCRIPT: Not available — analyse based on video visuals and audio.`;

    // ── Fetch screen grabs as inline images for Gemini Vision (Deep Analysis) ──
    const frameImageParts = [];
    if (extractedFrames.length > 0) {
        console.log(`   📸 Fetching ${extractedFrames.length} screen grabs for deep video content analysis...`);
        for (const frame of extractedFrames.slice(0, 8)) { // max 8 frames for analysis
            if (!frame.url) continue;
            try {
                const res = await fetch(frame.url, { signal: AbortSignal.timeout(10000) });
                if (!res.ok) continue;
                const buf = await res.arrayBuffer();
                const mimeType = res.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
                frameImageParts.push({
                    inlineData: { data: Buffer.from(buf).toString('base64'), mimeType },
                });
            } catch (e) {
                /* ignore */
            }
        }
    }

    const userPrompt = [
        castBankSection,
        knownCasts.length > 0 ? `CRITICAL INSTRUCTION: If any character/speaker appearing in the video matches a known cast member from the Cast Bank (based on their appearance/description/role), you MUST name them EXACTLY as they are named in the Cast Bank (e.g. use "${knownCasts[0].name}" instead of a generic description).` : '',
        '',
        videoContext,
        frameImageParts.length > 0 ? `SCENE FRAMES (Attached): Visual context for the video.` : (isYT ? `YOUTUBE URL (watch this video): ${youtubeUrl}` : `VIDEO FILE: Undergoing direct visual analysis`),
        transcriptSection
    ].filter(Boolean).join('\n');

    const router = getRouter();
    let analysis;
    const analysisController = new AbortController();
    const analysisTimeout = setTimeout(() => analysisController.abort(), 180_000); // 3 min cap

    let geminiFileName = null;
    let resolvedVideoUrl = youtubeUrl;

    try {
        if (!isYT) {
            console.log(`📤 Uploading direct video file to Gemini Files API for native analysis: ${youtubeUrl}`);
            const fileData = await uploadToGeminiFilesAPI(youtubeUrl, 'video');
            geminiFileName = fileData.fileName;
            resolvedVideoUrl = fileData.fileUri;
            
            console.log('⏳ Waiting 5s for Gemini to process the uploaded video file...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log(`🧠 [analysisNode] Sending video context to Gemini 2.5 Pro for deep analysis`);
        const result = await router.generateText({
            systemPrompt: PROMPTS.VIDEO_ANALYST,
            userPrompt: userPrompt,
            temperature: 0.3,
            maxTokens: 8192,
            model: 'gemini-2.5-pro',
            youtubeUrl: frameImageParts.length > 0 ? null : resolvedVideoUrl, // skip url native if we pass frames directly
            imageParts: frameImageParts.length > 0 ? frameImageParts : undefined,
            jsonMode: true,
        }, { provider: 'gemini' });
        clearTimeout(analysisTimeout);

        const text = result.text || '';
        const cleaned = text
            .replace(/<think>[\s\S]*?<\/think>/gi, '')
            .replace(/```(?:json)?\s*\n?/gi, '')
            .trim();

        let analysisText = cleaned;
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            analysisText = jsonMatch[0];
            try {
                analysis = JSON.parse(jsonMatch[0]);
            } catch (parseErr) {
                console.warn(`⚠️ [analysisNode] JSON parse failed, attempting extraction: ${parseErr.message}`);
            }
        }

        if (!analysis) {
            if (!jsonMatch) console.warn(`⚠️ [analysisNode] No JSON braces in response, attempting raw extraction. Raw text: ${cleaned.substring(0, 300)}`);
            // Field extraction as last resort (works on raw text or jsonMatch)
            analysis = {};
            const stringPairs = analysisText.matchAll(/"(\w+)"\s*:\s*"([\s\S]*?)(?<!\\)"(?=\s*[,}\n])/g);
            for (const [, key, val] of stringPairs) {
                if (!analysis[key]) analysis[key] = val.replace(/\\n/g, '\n').replace(/\\"/g, '"');
            }
            const arrayPairs = analysisText.matchAll(/"(\w+)"\s*:\s*\[([\s\S]*?)\]/g);
            for (const [, key, val] of arrayPairs) {
                if (!analysis[key]) {
                    if (val.includes('{') && val.includes('}')) {
                        analysis[key] = [];
                    } else {
                        analysis[key] = val.match(/"([^"]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
                    }
                }
            }
            if (Object.keys(analysis).length === 0) {
                throw new Error(`No JSON fields extracted from Gemini response. Raw: ${cleaned.substring(0, 300)}`);
            }
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
                0.3, 4096, { preferFast: false, timeoutMs: 120_000, jsonMode: true }   // 2 min — full model on transcript can take 60-90s
            );
            console.log(`✅ [analysisNode] Transcript-only fallback complete`);
            return { analysis: fallbackResult };
        }

        // No transcript + no video analysis = hard failure, propagate to pipeline
        throw new Error(`Video analysis failed and no transcript available: ${err.message}`);
    } finally {
        if (geminiFileName) {
            await deleteFromGemini(geminiFileName);
        }
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
        0.2, 2048, { preferFast: false, timeoutMs: 90_000, jsonMode: true }  // Full model — better chapter quality
    );

    return { chapters: result.chapters || [] };
}

// ── 4. SEO Copywriter Node ─────────────────────────────────────────────────

export async function seoNode({ video, analysis, chapters, brandContext, writingStyleAnalysis = null }) {
    console.log(`✍️ [seoNode] Generating SEO metadata`);

    const { metadata, transcript } = video;
    const chapterText = chapters?.length
        ? `DETECTED CHAPTERS:\n${chapters.map(c => `${c.timestamp} - ${c.title}: ${c.description}`).join('\n')}`
        : '';

    const brandDnaSection = writingStyleAnalysis
        ? `=== WRITING STYLE REFERENCE (CRITICAL) ===\nAdopt the writing style, tone, vocabulary, and formatting defined below for all SEO titles, descriptions, and tags. This style reference overrides standard brand DNA tone guidelines:\n${writingStyleAnalysis}\n`
        : `=== BRAND DNA (THIS DICTATES VOICE, TONE AND KEYWORDS ONLY) ===\nCRITICAL INSTRUCTION: Do NOT hallucinate brand products, services, or taglines into the copy if they are not actually in the video content. The video content is the ground truth. Use Brand DNA ONLY for the stylistic voice, tone, and formatting.\n${brandContext || 'No brand context'}`;

    const userPrompt = [
        `=== VIDEO CONTENT (THIS DICTATES THE ACTUAL COPY) ===`,
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
        '',
        brandDnaSection
    ].join('\n');

    // Use xAI Grok for SEO — great at trending language and CTR-optimised copy
    // Fallback: best available model via router (never hard-code a single provider)
    let result;
    try {
        result = await callAgent(
            PROMPTS.SEO_COPYWRITER,
            userPrompt,
            0.7, 3000, { provider: 'xai', timeoutMs: 60_000, jsonMode: true }   // Grok-3 via xAI OpenAI-compatible endpoint
        );
    } catch (err) {
        console.warn(`⚠️ [seoNode] xAI/Grok failed (${err.message}), falling back to best available model`);
        result = await callAgent(
            PROMPTS.SEO_COPYWRITER,
            userPrompt,
            0.7, 3000, { preferFast: false, timeoutMs: 60_000, jsonMode: true }
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
        0.3, 2048, { preferFast: true, timeoutMs: 45_000, jsonMode: true }  // Fast Gemini; 45s cap
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
        `=== VIDEO CONTENT (THIS DICTATES THE SCENE, ACTION, AND COPY) ===`,
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
        '',
        `=== BRAND DNA (THIS DICTATES VISUAL STYLE AND VIBE ONLY) ===`,
        `CRITICAL INSTRUCTION: Do NOT hallucinate brand products, services, or brand messaging into the video's thumbnail scene or copy. The scene and copy must be 100% about the VIDEO CONTENT above. Use the Brand DNA *only* to inform color palette, font styles, and overall aesthetic vibe.`,
        brandContext || 'No brand context',
    ].join('\n');

    // ── Call Multimodal AI via Router ─────────────────────────────────────────
    try {
        const router = getRouter();
        const result = await router.generateText({
            systemPrompt: PROMPTS.THUMBNAIL_DIRECTOR,
            userPrompt: userPrompt,
            temperature: 0.75,
            maxTokens: 8192,
            images: frameImageParts, // Passes base64 image objects natively
            jsonMode: true
        });

        // The router natively handles jsonMode and parsing
        const parsed = typeof result.text === 'string' ? JSON.parse(result.text) : result.text;
        
        console.log(`✅ [thumbnailDirectionNode] Creative direction complete:`);
        console.log(`   CTR strategy: ${parsed.ctrStrategy?.substring(0, 80)}`);
        console.log(`   Screen grab insight: ${parsed.screenGrabInsight?.substring(0, 80)}`);
        console.log(`   Overlay: "${parsed.textOverlay?.line1}" | Power word: ${parsed.textOverlay?.powerWordUsed}`);
        console.log(`   Clickbait variants: ${parsed.clickbaitCopyVariants?.length || 0} generated`);
        console.log(`   Est. CTR: ${parsed.ctrScoreEstimate}%`);
        return { thumbnailDirection: parsed };

    } catch (e) {
        console.warn(`   ⚠️ Multimodal creative direction failed: ${e.message} — falling back to text-only`);
        
        // Fallback to text-only callMultimodalAgent without images
        const result = await callMultimodalAgent(
            PROMPTS.THUMBNAIL_DIRECTOR,
            userPrompt,
            [],
            { temperature: 0.75, maxTokens: 4096, jsonMode: true }
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
export async function thumbnailGenerationNode({ thumbnailDirection, video, brandContext, template, characterPortraits = [], extractedFrames = [], primaryFaceUrl = null }) {
    const videoTitle    = video?.metadata?.title       || '';
    const characters    = video?.analysis?.characters  || [];
    const peakMoment    = video?.analysis?.peakMoment  || null;

    // ── Best extracted frame — use as visual context reference ───────────────────
    // HD frame (maxresdefault) is preferred; fall back to hqdefault
    const bestFrame = extractedFrames.find(f => f.label === 'Peak Moment Frame')
        || extractedFrames.find(f => f.label === 'HD Cover Frame') 
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
    const referenceFramePart = referenceFrameUrl ? await fetchInline(referenceFrameUrl, 'Video screen grab (reference frame)') : null;
    console.log(`   Screen grab reference: ${referenceFramePart ? `✅ loaded (${bestFrame?.label})` : '❌ none'}`);

    // ── Load extracted primary face from Face Detection (Phase 3) ──────────────────
    const primaryFacePart = primaryFaceUrl ? await fetchInline(primaryFaceUrl, 'Primary Extracted Face Crop') : null;
    console.log(`   Primary Extracted Face: ${primaryFacePart ? '✅ loaded' : '❌ none'}`);

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
        `=== IMAGE GENERATION STRUCTURE ===`,
        ``,
        `[SUBJECT & IDENTITY]`,
        primaryFacePart 
            ? `IMAGE-TO-IMAGE RECONSTRUCTION: The attached face crop image contains the EXACT identity of the subject. You MUST perfectly preserve their likeness, facial structure, skin tone, and features. DO NOT hallucinate a generic face.` 
            : `Focus on the lead character.`,
        `Emotion: ${peakEmotion} — convey this STRONGLY through facial expression.`,
        ``,
        `[ACTION & SCENE]`,
        thumbnailDirection?.imageGenerationPrompt
            ? `Action: ${thumbnailDirection.imageGenerationPrompt}`
            : `Action: ${peakScene}`,
        ``,
        `[ENVIRONMENT & BACKGROUND]`,
        ta.backgroundScene ? `Environment: ${ta.backgroundScene}` : `Environment: ${thumbnailDirection?.backgroundTreatment || 'dramatic-scene'}`,
        ``,
        `[LIGHTING & COLOR]`,
        `Lighting: Cinematic dramatic lighting, high contrast, rim lighting to make subject pop from background.`,
        `Color Palette: ${thumbnailDirection?.dominantColor || ta.colorPalette?.[0] || 'Vibrant, high saturation'}`,
        ta.colorPalette?.length ? `Specific Colors: ${ta.colorPalette.join(', ')}` : '',
        ``,
        `[COMPOSITION & BROADCAST ELEMENTS]`,
        `Composition: ${thumbnailDirection?.composition || 'center-subject, rule of thirds'}`,
        `Subject Position: ${ta.mainSubjectPosition || 'prominent'}`,
        ``,
        `TEXT OVERLAY 1 (BIG FLOATING HOOK):`,
        `  Text: "${overlayText}"`,
        `  Style: ${thumbnailDirection?.textOverlay?.style || 'bold-block'}, color ${thumbnailDirection?.textOverlay?.color || '#FFFFFF'}, giant font, high visibility.`,
        ``,
        `TEXT OVERLAY 2 (LOWER-THIRD BAR):`,
        ta.lowerThird
            ? `  ${ta.lowerThird}. Text inside bar: "${bestClickbaitCopy}"`
            : `  Dark semi-transparent gradient bar occupying the bottom 15% of image. Bold white text: "${bestClickbaitCopy}"`,
        ``,
        `=== CTR HARD RULES ===`,
        `- Main subject's FACE must show EXTREME EMOTION`,
        `- HIGH CONTRAST between subject and background`,
        `- NO brand logos or channel watermarks`,
        `- Photorealistic, broadcast quality, not cartoonish`
    ].filter(Boolean).join('\n');


    console.log(`   🚀 [gemini] Generating 16:9 HD thumbnail...`);
    console.log(`   Overlay text: "${overlayText}" | Lower-third: "${bestClickbaitCopy.substring(0, 50)}"`);

    const router = getRouter();

    // ── Inject explicit image role labels for Gemini ──
    const imageParts = [
        primaryFacePart,
        leadPortraitPart,
        templateRefPart,
        referenceFramePart
    ].filter(Boolean);

    let finalPrompt = genPrompt;
    if (imageParts.length > 0) {
        const imageRolePreamble = [
            `\nREFERENCE IMAGES PROVIDED (${imageParts.length} image${imageParts.length > 1 ? 's' : ''}):`,
        ];
        
        let idx = 1;
        if (referenceFramePart) {
            imageRolePreamble.push(`- IMAGE ${idx++}: SCREEN GRAB REFERENCE — Your output MUST feature this EXACT scene and people. Reproduce the characters, colors, and setting with maximum fidelity. Do NOT substitute or hallucinate.`);
        }
        if (leadPortraitPart) {
            imageRolePreamble.push(`- IMAGE ${idx++}: LEAD CHARACTER PORTRAIT — Use this for face preservation. Maintain the person's likeness, skin tone, and features accurately.`);
        }
        if (templateRefPart) {
            imageRolePreamble.push(`- IMAGE ${idx++}: STYLE TEMPLATE REFERENCE — Use this to match the graphic design layout, color palette, and broadcast aesthetic.`);
        }
        
        imageRolePreamble.push(`CRITICAL: The reference images are the GROUND TRUTH. Your generated image must be visually consistent with them.\n`);
        finalPrompt = imageRolePreamble.join('\n') + '\n' + genPrompt;
    }

    try {
        console.log(`🚀 [thumbnailGenerationNode] Using AI generation with strict face preservation...`);
        const result = await router.generateImage({
            prompt: finalPrompt,
            model: 'gpt-image-2', 
            aspectRatio: '16:9',
            imageParts: imageParts,
        }, { provider: 'openai' });

        const rawUrl = typeof result === 'string' ? result : result.imageUrl;
        const finalUrl = await persistToS3(rawUrl || '', 'yt-studio/thumbnails');
        console.log(`✅ [thumbnailGenerationNode] Image generation success → S3: ${finalUrl?.substring(0, 80)}`);
        return { generatedThumbnailUrl: finalUrl || rawUrl, thumbnailGenerationError: null, generatorModel: 'gpt-image-2' };

    } catch (err) {
        console.error(`❌ [thumbnailGenerationNode] Thumbnail rendering failed: ${err.message}`);
        return { generatedThumbnailUrl: null, thumbnailGenerationError: err.message, generatorModel: null };
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
export async function characterPortraitNode({ analysis, video, brandContext, knownCasts = [] }) {
    const characters   = analysis?.characters || [];
    const referenceUrl = video?.metadata?.thumbnailUrl || null;
    const ytId         = video?.videoId || (video?.youtubeUrl && video.youtubeUrl.split('v=')[1]);

    if (!characters.length) {
        console.log('ℹ️ [characterPortraitNode] No characters identified — skipping');
        return { characterPortraits: [] };
    }

    console.log(`👤 [characterPortraitNode] Fetching visual screen grabs for ${characters.length} character(s)`);

    const characterPortraits = [];
    for (const char of characters.slice(0, 3)) {
        let frameSeek = null;
        if (char.firstAppearance) {
            const parts = char.firstAppearance.split(':').map(Number);
            frameSeek = parts.length === 3
                ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                : parts[0] * 60 + (parts[1] || 0);
        }

        // Check if there is a match in the Cast Bank (case-insensitive name match)
        const matchCast = knownCasts?.find(kc =>
            kc.name?.toLowerCase().trim() === char.label?.toLowerCase().trim() ||
            char.label?.toLowerCase().includes(kc.name?.toLowerCase().trim()) ||
            kc.name?.toLowerCase().includes(char.label?.toLowerCase().trim())
        );

        let portraitUrl = matchCast?.imageUrl || null;
        let isCastMatch = !!matchCast;

        if (!portraitUrl) {
            const isYT = video?.isYT !== false;
            if (!isYT && video?.youtubeUrl && frameSeek != null) {
                console.log(`   🎥 Extracting exact frame for ${char.label} at ${frameSeek}s from direct upload...`);
                const s3KeyPrefix = `youtube-studio-uploads/characters/${video.videoId || 'direct'}`;
                portraitUrl = await extractFrameFromVideoUrl(video.youtubeUrl, frameSeek, s3KeyPrefix);
            } else if (ytId) {
                if (frameSeek != null && video.duration) {
                    const pct = frameSeek / video.duration;
                    let frameNum = 1;
                    if (pct >= 0.35 && pct < 0.65) {
                        frameNum = 2;
                    } else if (pct >= 0.65) {
                        frameNum = 3;
                    }
                    portraitUrl = `https://img.youtube.com/vi/${ytId}/${frameNum}.jpg`;
                } else {
                    portraitUrl = `https://img.youtube.com/vi/${ytId}/1.jpg`;
                }
            } else {
                portraitUrl = referenceUrl;
            }
        }

        console.log(`   ✅ Character portrait mapped for: ${char.label} (${isCastMatch ? 'Cast Bank Match' : portraitUrl ? 'Video Frame' : 'None'})`);
        characterPortraits.push({
            label:           char.label,
            role:            char.role,
            firstAppearance: char.firstAppearance,
            screenTimePct:   char.screenTimePct,
            visualDescription: char.visualDescription || null,
            portraitUrl,
        });
    }

    const successCount = characterPortraits.filter(p => p.portraitUrl).length;
    console.log(`✅ [characterPortraitNode] ${successCount}/${characters.slice(0,3).length} portraits mapped successfully`);
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
export async function frameExtractionNode({ videoId, videoUrl = null, isYT = true, peakMoments = [], duration = null, metadata = null }) {
    if (!videoId) return { extractedFrames: [], primaryFaceUrl: null, faceClusters: [] };

    let streamUrl = videoUrl;

    if (isYT) {
        console.log(`🎬 [frameExtractionNode] Resolving YouTube stream for FFmpeg extraction...`);
        const { getYouTubeStreamUrl } = await import('../../utils/youtubeStream.js');
        streamUrl = await getYouTubeStreamUrl(videoId);
        
        if (!streamUrl) {
            console.error(`❌ [frameExtractionNode] YouTube stream restricted. Using Metadata-Only fallback.`);
            // Fall back to just returning the standard YouTube thumbnails without failing
            const fallbackFrames = [
                { url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, label: 'HD Cover Frame (Metadata Fallback)', score: 100 },
                { url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,     label: 'HQ Cover Frame', score: 50 }
            ];
            return { extractedFrames: fallbackFrames, primaryFaceUrl: null, faceClusters: [], isMetadataFallback: true };
        }
    }

    if (streamUrl) {
        console.log(`🎬 [frameExtractionNode] Initiating intelligent frame extraction...`);
        const { intelligentFrameExtraction } = await import('../../utils/frameExtraction.js');
        const { detectAndClusterFaces } = await import('../../utils/faceDetection.js');

        // Extract frames intelligently (ffmpeg scene detection, scoring, deduplication)
        const extractedFrames = await intelligentFrameExtraction(videoId, streamUrl, duration || 120, peakMoments);

        if (extractedFrames.length > 0) {
            // Run Face Detection and Clustering on the extracted top frames
            console.log(`🎬 [frameExtractionNode] Running face detection on ${extractedFrames.length} top frames...`);
            const { primaryFaceUrl, allFaces } = await detectAndClusterFaces(extractedFrames, videoId);

            // Clean up the local buffers from memory since we already uploaded them
            extractedFrames.forEach(f => {
                delete f.localBuffer;
            });

            return { 
                extractedFrames, 
                primaryFaceUrl, 
                faceClusters: allFaces,
                isMetadataFallback: false
            };
        }
    }

    return { extractedFrames: [], primaryFaceUrl: null, faceClusters: [] };
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
        `=== VIDEO CONTENT (THIS DICTATES THE ACTUAL PROMO CUTS AND CLIP CONTENT) ===`,
        `VIDEO: "${video.metadata?.title || 'Unknown'}" by ${video.metadata?.channelTitle || 'Unknown'}`,
        `DURATION: ${video.duration || 'Unknown'}`,
        `PEAK MOMENT: ${analysis.peakMoment?.timestamp} — ${analysis.peakMoment?.title || ''}`,
        '',
        'RAW PROMO CUTS FROM VIDEO ANALYSIS:',
        JSON.stringify(rawCuts, null, 2),
        '',
        `=== BRAND DNA (THIS DICTATES SOCIAL MEDIA TONE ONLY) ===`,
        `CRITICAL INSTRUCTION: Do NOT hallucinate brand products, services, or brand-specific messaging into the hook lines or clip descriptions if they are not actually in the video. The promo cuts must accurately reflect the VIDEO CONTENT. Use the Brand DNA ONLY for the stylistic tone and voice of the captions.`,
        brandContext || 'No brand context',
    ].join('\n');

    const result = await callAgent(
        PROMPTS.PROMO_DIRECTOR,
        userPrompt,
        0.7, 2048, { preferFast: true, timeoutMs: 45_000, jsonMode: true }
    );

    return { promoCuts: result.cuts || rawCuts };
}
