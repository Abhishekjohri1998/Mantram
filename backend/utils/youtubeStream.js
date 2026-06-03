import ytdl from '@distube/ytdl-core';
import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import { execSync } from 'child_process';

// Flag to ensure we only try to update yt-dlp once per process lifetime
let ytDlpUpdateAttempted = false;

/**
 * Ensures the yt-dlp binary bundled by youtube-dl-exec is up-to-date.
 * Runs once per process startup. Critical for EC2 where cached binaries get stale.
 */
async function ensureYtDlpUpdated() {
    if (ytDlpUpdateAttempted) return;
    ytDlpUpdateAttempted = true;
    try {
        console.log(`🔄 [youtubeStream] Updating yt-dlp binary...`);
        await youtubedl.raw('--update');
        console.log(`✅ [youtubeStream] yt-dlp updated successfully`);
    } catch (e) {
        // --update may fail if binary is read-only; that's fine — continue with whatever version we have
        console.log(`   ℹ️ yt-dlp update skipped: ${e.message?.split('\n')[0]}`);
    }
}

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

    // Ensure yt-dlp is up-to-date before trying any strategy
    await ensureYtDlpUpdated();

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

    // Strategy 2: youtube-dl-exec with android client (most reliable for bot bypass)
    try {
        console.log(`   ➡️ Strategy 2: youtube-dl-exec (android)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            extractorArgs: 'youtube:player_client=android',
            noWarnings: true,
            noCheckCertificates: true,
        });
        if (output && typeof output === 'string' && output.startsWith('http')) {
            console.log(`   ✅ Strategy 2 success`);
            return output;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 2 (android) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 3: youtube-dl-exec with web_safari client
    try {
        console.log(`   ➡️ Strategy 3: youtube-dl-exec (web_safari)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            extractorArgs: 'youtube:player_client=web_safari',
            noWarnings: true,
            noCheckCertificates: true,
        });
        if (output && typeof output === 'string' && output.startsWith('http')) {
            console.log(`   ✅ Strategy 3 success`);
            return output;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 3 (web_safari) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 4: youtube-dl-exec with default client (no extractor args)
    try {
        console.log(`   ➡️ Strategy 4: youtube-dl-exec (default client)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            noWarnings: true,
            noCheckCertificates: true,
        });
        if (output && typeof output === 'string' && output.startsWith('http')) {
            console.log(`   ✅ Strategy 4 success`);
            return output;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 4 (default) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 5: youtube-dl-exec with cookies (if available on EC2)
    try {
        const cookiePath = '/home/ec2-user/secrets/youtube-cookies.txt';
        if (fs.existsSync(cookiePath)) {
            console.log(`   ➡️ Strategy 5: youtube-dl-exec (cookies)`);
            const output = await youtubedl(url, {
                getUrl: true,
                format: 'best',
                cookies: cookiePath,
                noWarnings: true,
                noCheckCertificates: true,
            });
            if (output && typeof output === 'string' && output.startsWith('http')) {
                console.log(`   ✅ Strategy 5 success`);
                return output;
            }
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 5 failed: ${err.message.trim().split('\n')[0]}`);
    }

    // All streaming strategies failed.
    console.error(`❌ [youtubeStream] All stream resolution strategies failed for ${url}`);
    return null; // The pipeline will catch this and fallback to Metadata-Only analysis.
}
