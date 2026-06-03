import ytdl from '@distube/ytdl-core';
import youtubedl from 'youtube-dl-exec';
import fs from 'fs';

/**
 * Resolves a YouTube video ID or URL to a direct video stream URL that FFmpeg can use.
 * Implements a multi-strategy fallback to bypass bot detection.
 * 
 * @param {string} videoIdOrUrl - The YouTube video ID or full URL
 * @returns {Promise<string|null>} - The direct stream URL (e.g., .m3u8 or .mp4) or null on failure
 */
export async function getYouTubeStreamUrl(videoIdOrUrl) {
    const url = videoIdOrUrl.includes('youtube.com') || videoIdOrUrl.includes('youtu.be') 
        ? videoIdOrUrl 
        : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

    console.log(`📡 [youtubeStream] Resolving stream for ${url}...`);

    // Strategy 1: @distube/ytdl-core (Standard)
    try {
        console.log(`   ➡️ Strategy 1: @distube/ytdl-core`);
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
        if (format && format.url) {
            console.log(`   ✅ Strategy 1 success (${format.container} ${format.qualityLabel || ''})`);
            return format.url;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 1 failed: ${err.message}`);
    }

    // Strategy 2: youtube-dl-exec with web_safari client
    try {
        console.log(`   ➡️ Strategy 2: youtube-dl-exec (web_safari)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            extractorArgs: 'youtube:player_client=web_safari',
            noWarnings: true
        });
        if (output && output.startsWith('http')) {
            console.log(`   ✅ Strategy 2 success`);
            return output;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 2 (web_safari) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 2b: youtube-dl-exec with android client (Bypasses bot block)
    try {
        console.log(`   ➡️ Strategy 2b: youtube-dl-exec (android)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            extractorArgs: 'youtube:player_client=android',
            noWarnings: true
        });
        if (output && output.startsWith('http')) {
            console.log(`   ✅ Strategy 2b success`);
            return output;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 2b (android) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 3: youtube-dl-exec with cookies (if available)
    try {
        const cookiePath = '/home/ec2-user/secrets/youtube-cookies.txt';
        if (fs.existsSync(cookiePath)) {
            console.log(`   ➡️ Strategy 3: youtube-dl-exec (cookies)`);
            const output = await youtubedl(url, {
                getUrl: true,
                format: 'best',
                cookies: cookiePath,
                noWarnings: true
            });
            if (output && output.startsWith('http')) {
                console.log(`   ✅ Strategy 3 success`);
                return output;
            }
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 3 failed: ${err.message.trim().split('\n')[0]}`);
    }

    // All streaming strategies failed.
    console.error(`❌ [youtubeStream] All stream resolution strategies failed for ${url}`);
    return null; // The pipeline will catch this and fallback to Metadata-Only analysis.
}
