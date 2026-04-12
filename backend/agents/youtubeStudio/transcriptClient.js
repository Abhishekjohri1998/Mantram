/**
 * YouTube Studio — Transcript Client
 * 
 * Strategy:
 * 1. Try youtube-transcript npm package (free, no API key, gets existing captions)
 * 2. Fallback: Gemini native YouTube URL analysis (no transcript needed — Gemini watches the video)
 */

import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

/**
 * Extract video ID from YouTube URL in any format:
 * - https://www.youtube.com/watch?v=dQw4w9WgXcQ
 * - https://youtu.be/dQw4w9WgXcQ
 * - https://www.youtube.com/shorts/dQw4w9WgXcQ
 * - dQw4w9WgXcQ (raw ID)
 */
export function extractVideoId(urlOrId) {
    if (!urlOrId) return null;
    const str = urlOrId.trim();

    // Already a raw 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;

    // youtu.be/ID
    const shortMatch = str.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];

    // youtube.com/shorts/ID
    const shortsMatch = str.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];

    // youtube.com/watch?v=ID
    const watchMatch = str.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch) return watchMatch[1];

    // youtube.com/embed/ID
    const embedMatch = str.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch) return embedMatch[1];

    return null;
}

/**
 * Fetch timestamped transcript for a YouTube video
 * Returns array of { text, start, duration }
 */
export async function fetchTranscript(videoId, preferredLang = 'en') {
    const langs = [preferredLang, 'en', 'en-US', 'en-GB'].filter(Boolean);

    for (const lang of langs) {
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
            if (transcript && transcript.length > 0) {
                console.log(`✅ Transcript fetched for ${videoId} in ${lang} (${transcript.length} segments)`);
                return { segments: transcript, language: lang, source: 'youtube-captions' };
            }
        } catch (err) {
            // Try next language
        }
    }

    // Try without language filter (auto-generated)
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId);
        if (transcript && transcript.length > 0) {
            console.log(`✅ Transcript fetched for ${videoId} (auto, ${transcript.length} segments)`);
            return { segments: transcript, language: 'auto', source: 'youtube-auto-captions' };
        }
    } catch (err) {
        console.warn(`⚠️ No transcript available for ${videoId}: ${err.message}`);
    }

    return null;
}

/**
 * Format transcript segments into a single readable text block with timestamps
 */
export function formatTranscriptText(segments) {
    if (!segments?.length) return '';
    return segments.map(s => {
        // youtube-transcript v1.3+ returns offset in milliseconds
        const time = formatSeconds((s.offset ?? s.start ?? 0) / 1000);
        return `[${time}] ${s.text}`;
    }).join('\n');
}

/**
 * Convert seconds to MM:SS or HH:MM:SS
 */
export function formatSeconds(secs) {
    const s = Math.floor(secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Fetch YouTube video metadata
 * 
 * Strategy (in order):
 * 1. YouTube Data API v3 (YOUTUBE_API_KEY) — full metadata incl. stats, tags, duration
 * 2. oEmbed API (free, no key required) — title, author, thumbnail URL
 * 3. Basic stub with videoId only
 */
export async function fetchVideoMetadata(videoId) {
    const apiKey = process.env.YOUTUBE_API_KEY;

    // ── Strategy 1: YouTube Data API v3 (full metadata) ─────────────────────
    if (apiKey) {
        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
            const res = await fetch(url);
            const data = await res.json();

            const item = data.items?.[0];
            if (item) {
                const snippet = item.snippet;
                const stats = item.statistics;
                const details = item.contentDetails;

                console.log(`✅ [metadata] YouTube Data API: "${snippet.title}"`);
                return {
                    id: videoId,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    title: snippet.title,
                    description: snippet.description?.substring(0, 1000),
                    channelTitle: snippet.channelTitle,
                    channelId: snippet.channelId,
                    publishedAt: snippet.publishedAt,
                    thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url,
                    tags: snippet.tags || [],
                    categoryId: snippet.categoryId,
                    duration: details?.duration,
                    viewCount: parseInt(stats?.viewCount || 0),
                    likeCount: parseInt(stats?.likeCount || 0),
                    commentCount: parseInt(stats?.commentCount || 0),
                };
            }
        } catch (err) {
            console.warn(`⚠️ [metadata] YouTube Data API failed: ${err.message} — falling back to oEmbed`);
        }
    }

    // ── Strategy 2: oEmbed (free, no API key, no quota) ─────────────────────
    // Returns: title, author_name, thumbnail_url  — always available for public videos
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
        const res = await fetch(oembedUrl);
        if (res.ok) {
            const data = await res.json();
            console.log(`✅ [metadata] oEmbed: "${data.title}" by ${data.author_name}`);
            return {
                id: videoId,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                title: data.title,
                description: null,
                channelTitle: data.author_name,
                channelId: null,
                publishedAt: null,
                // oEmbed thumbnail is lower-res — also try maxres directly
                thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
                thumbnailUrlFallback: data.thumbnail_url,
                tags: [],
                duration: null,
                viewCount: 0,
                likeCount: 0,
                commentCount: 0,
            };
        }
    } catch (err) {
        console.warn(`⚠️ [metadata] oEmbed failed: ${err.message}`);
    }

    // ── Strategy 3: Bare minimum stub ────────────────────────────────────────
    console.warn(`⚠️ [metadata] All metadata sources failed for ${videoId} — using stub`);
    return {
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: null,
        description: null,
        channelTitle: null,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    };
}

/**
 * Parse ISO 8601 duration (PT12M34S) to readable string "12:34"
 */
export function parseIsoDuration(isoDuration) {
    if (!isoDuration) return null;
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return null;
    const h = parseInt(match[1] || 0);
    const m = parseInt(match[2] || 0);
    const s = parseInt(match[3] || 0);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}
