import ytdl from '@distube/ytdl-core';
import youtubedl from 'youtube-dl-exec';
import { update as updateYtDlp } from 'youtube-dl-exec';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

// Flag to ensure we only try to update yt-dlp once per process lifetime
let ytDlpUpdateAttempted = false;

/**
 * Ensures the yt-dlp binary is up-to-date.
 * Uses the official update() function from youtube-dl-exec first,
 * then falls back to downloading the standalone binary via curl (for EC2).
 */
async function ensureYtDlpUpdated() {
    if (ytDlpUpdateAttempted) return;
    ytDlpUpdateAttempted = true;
    
    try {
        console.log(`🔄 [youtubeStream] Updating yt-dlp binary via npm updater...`);
        await updateYtDlp();
        console.log(`✅ [youtubeStream] yt-dlp updated successfully via npm`);
        return;
    } catch (e) {
        console.log(`   ℹ️ npm updater failed: ${e.message?.split('\n')[0]}`);
    }
    
    // Fallback: Download latest standalone yt-dlp binary via curl (Linux/EC2 only)
    if (process.platform !== 'win32') {
        try {
            const binDir = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin');
            const binPath = path.join(binDir, 'yt-dlp');
            console.log(`🔄 [youtubeStream] Downloading latest standalone yt-dlp binary...`);
            execSync(`curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o "${binPath}" && chmod +x "${binPath}"`, {
                timeout: 30000,
                stdio: 'pipe'
            });
            console.log(`✅ [youtubeStream] Standalone yt-dlp binary downloaded to ${binPath}`);
        } catch (e2) {
            console.log(`   ⚠️ Standalone download also failed: ${e2.message?.split('\n')[0]}`);
        }
    }
}

/**
 * Resolves a YouTube video ID or URL to a direct video stream URL that FFmpeg can use.
 * Implements a multi-strategy fallback to bypass bot detection.
 * 
 * @param {string} videoIdOrUrl - The YouTube video ID or full URL
 * @returns {Promise<string|null>} - The direct stream URL or null on failure
 */
export async function getYouTubeStreamUrl(videoIdOrUrl) {
    const url = videoIdOrUrl.includes('youtube.com') || videoIdOrUrl.includes('youtu.be') 
        ? videoIdOrUrl 
        : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

    console.log(`📡 [youtubeStream] Resolving stream for ${url}...`);

    // Ensure yt-dlp is up-to-date before trying any strategy
    await ensureYtDlpUpdated();

    // Strategy 1: @distube/ytdl-core (Standard — fast, no binary needed)
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

    // Strategy 2: youtube-dl-exec with android client (best for bot bypass)
    try {
        console.log(`   ➡️ Strategy 2: youtube-dl-exec (android)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            extractorArgs: 'youtube:player_client=android',
            noWarnings: true,
            noCheckCertificates: true,
        });
        const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
        if (streamUrl.startsWith('http')) {
            console.log(`   ✅ Strategy 2 success`);
            return streamUrl;
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
        const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
        if (streamUrl.startsWith('http')) {
            console.log(`   ✅ Strategy 3 success`);
            return streamUrl;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 3 (web_safari) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 4: youtube-dl-exec with default client (no extractor args)
    try {
        console.log(`   ➡️ Strategy 4: youtube-dl-exec (default)`);
        const output = await youtubedl(url, {
            getUrl: true,
            format: 'best',
            noWarnings: true,
            noCheckCertificates: true,
        });
        const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
        if (streamUrl.startsWith('http')) {
            console.log(`   ✅ Strategy 4 success`);
            return streamUrl;
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
            const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
            if (streamUrl.startsWith('http')) {
                console.log(`   ✅ Strategy 5 success`);
                return streamUrl;
            }
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 5 failed: ${err.message.trim().split('\n')[0]}`);
    }

    // All streaming strategies failed.
    console.error(`❌ [youtubeStream] All stream resolution strategies failed for ${url}`);
    return null;
}
