/**
 * YouTube Studio — Transcript Client
 * 
 * Strategy:
 * 1. Try youtube-transcript npm package (free, no API key, gets existing captions)
 * 2. Fallback: Gemini native YouTube URL analysis (no transcript needed — Gemini watches the video)
 */

import { YoutubeTranscript } from 'youtube-transcript';

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
        const time = formatSeconds(s.start);
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
 * Fetch YouTube video metadata via Data API v3
 * Returns: { title, description, channelTitle, publishedAt, duration, tags, categoryId, viewCount, likeCount }
 */
export async function fetchVideoMetadata(videoId) {
    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
        console.warn('⚠️ YOUTUBE_API_KEY not set — metadata fetch skipped');
        return { id: videoId, title: null, description: null };
    }

    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`;
        const res = await fetch(url);
        const data = await res.json();

        const item = data.items?.[0];
        if (!item) return { id: videoId, title: null };

        const snippet = item.snippet;
        const stats = item.statistics;
        const details = item.contentDetails;

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
            duration: details?.duration, // ISO 8601 e.g. PT12M34S
            viewCount: parseInt(stats?.viewCount || 0),
            likeCount: parseInt(stats?.likeCount || 0),
            commentCount: parseInt(stats?.commentCount || 0),
        };
    } catch (err) {
        console.error('YouTube metadata fetch error:', err.message);
        return { id: videoId, title: null };
    }
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
