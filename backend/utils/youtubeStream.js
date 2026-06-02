import youtubedl from 'youtube-dl-exec';

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
        console.log(`📡 [youtubeStream] Resolving stream for ${url}...`);
        
        // Use yt-dlp to get the direct stream URL (-g / --get-url)
        // We prefer a format that is easily seekable, ideally up to 1080p mp4
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
            noWarnings: true,
            noCallHome: true,
            noCheckCertificate: true,
        });

        // yt-dlp returns the direct stream URL as a string output
        const streamUrl = typeof output === 'string' ? output.trim().split('\n')[0] : null;
        
        if (streamUrl) {
            console.log(`✅ [youtubeStream] Stream URL resolved successfully.`);
            return streamUrl;
        }
        
        throw new Error('No stream URL returned from yt-dlp.');
    } catch (err) {
        console.warn(`⚠️ [youtubeStream] Failed to resolve stream for ${url}:`, err.message);
        return null;
    }
}
