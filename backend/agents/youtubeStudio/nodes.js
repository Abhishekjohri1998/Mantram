/**
 * YouTube Studio — Agent Nodes (MCoT Pipeline)
 * 
 * Node execution order:
 *   1. transcriptNode    → fetch captions + metadata
 *   2. analysisNode      → MCoT video intelligence (Gemini watches video)
 *   3. chapterNode       → chapter detection from transcript
 *   4. seoNode           → brand-aligned titles, description, tags
 *   5. brandCriticNode   → brand alignment scoring
 *   6. thumbnailNode     → MCoT thumbnail direction
 */

import { callAgent, callMultimodalAgent } from '../shared/agentUtils.js';
import { PROMPTS } from './prompts.js';
import {
    fetchTranscript, fetchVideoMetadata,
    formatTranscriptText, parseIsoDuration, extractVideoId
} from './transcriptClient.js';
import { getRouter } from '../../ai/router.js';

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
    // This is handled by the Gemini provider's youtubeUrl parameter (fileData injection)
    const router = getRouter();
    let analysis;

    try {
        console.log(`🧠 [analysisNode] Sending YouTube URL to Gemini for native video analysis`);
        const result = await router.generateText({
            systemPrompt: PROMPTS.VIDEO_ANALYST,
            userPrompt: `${videoContext}\n\nYOUTUBE URL (watch this video): ${youtubeUrl}\n\n${transcriptSection}`,
            temperature: 0.3,
            maxTokens: 4096,
            model: 'gemini-2.5-pro',       // Best model for video understanding
            youtubeUrl: youtubeUrl,         // Triggers fileData injection in Gemini provider
        }, { provider: 'gemini' });

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
        0.7, 3000, { provider: 'claude' }  // Claude for best copywriting; falls back to Gemini automatically via router
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
        0.3, 2048, { preferFast: true }
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
