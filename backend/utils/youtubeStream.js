import ytdl from '@distube/ytdl-core';

/**
 * Resolves a YouTube video ID or URL to a direct video stream URL that FFmpeg can use.
 * 
 * @param {string} videoIdOrUrl - The YouTube video ID or full URL
 * @returns {Promise<string|null>} - The direct stream URL (e.g., .m3u8 or .mp4) or null on failure
 */
export async function getYouTubeStreamUrl(videoIdOrUrl) {
    const url = videoIdOrUrl.includes('youtube.com') || videoIdOrUrl.includes('youtu.be') 
        ? videoIdOrUrl 
        : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

    try {
        console.log(`📡 [youtubeStream] Resolving stream for ${url} via ytdl-core...`);
        
        const info = await ytdl.getInfo(url);
        
        // Find the best video format that contains video (preferably with audio, but video is what matters for frames)
        // We prioritize mp4 for best compatibility with FFmpeg seeking
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });

        if (format && format.url) {
            console.log(`✅ [youtubeStream] Stream URL resolved successfully (${format.container} ${format.qualityLabel || ''}).`);
            return format.url;
        }
        
        throw new Error('No valid video format found.');
    } catch (err) {
        console.warn(`⚠️ [youtubeStream] Failed to resolve stream for ${url}:`, err.message);
        return null;
    }
}
