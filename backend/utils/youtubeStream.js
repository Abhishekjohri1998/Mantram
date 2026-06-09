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
    // IMPORTANT: Use yt-dlp_linux (PyInstaller frozen binary) — NOT yt-dlp (Python zipapp)
    if (process.platform !== 'win32') {
        try {
            const binDir = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin');
            const binPath = path.join(binDir, 'yt-dlp');
            console.log(`🔄 [youtubeStream] Downloading latest standalone yt-dlp_linux binary...`);
            execSync(`curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o "${binPath}" && chmod +x "${binPath}"`, {
                timeout: 60000,
                stdio: 'pipe'
            });
            // Verify it's actually executable (not a Python script)
            try {
                const version = execSync(`"${binPath}" --version`, { timeout: 5000, stdio: 'pipe' }).toString().trim();
                console.log(`✅ [youtubeStream] Standalone yt-dlp binary v${version} ready at ${binPath}`);
            } catch (verifyErr) {
                console.log(`⚠️ [youtubeStream] Binary downloaded but version check failed: ${verifyErr.message?.split('\n')[0]}`);
            }
        } catch (e2) {
            console.log(`   ⚠️ Standalone download also failed: ${e2.message?.split('\n')[0]}`);
        }
    }
}

import crypto from 'crypto';
import os from 'os';
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

    let resolvedUrl = null;

    // Strategy 1: @distube/ytdl-core (Standard — fast, no binary needed)
    try {
        console.log(`   ➡️ Strategy 1: @distube/ytdl-core`);
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
        if (format && format.url) {
            console.log(`   ✅ Strategy 1 success (${format.container} ${format.qualityLabel || ''})`);
            resolvedUrl = format.url;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 1 failed: ${err.message}`);
    }

    // Strategy 2: youtube-dl-exec with android client (best for bot bypass)
    if (!resolvedUrl) {
        try {
            console.log(`   ➡️ Strategy 2: youtube-dl-exec (android)`);
            const output = await youtubedl(url, {
                getUrl: true,
                format: 'worst', // Use worst format to make downloading incredibly fast for frame extraction
                extractorArgs: 'youtube:player_client=android',
                noWarnings: true,
                noCheckCertificates: true,
            });
            const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
            if (streamUrl.startsWith('http')) {
                console.log(`   ✅ Strategy 2 success`);
                resolvedUrl = streamUrl;
            }
        } catch (err) {
            console.log(`   ⚠️ Strategy 2 (android) failed: ${err.message.trim().split('\n')[0]}`);
        }
    }

    // Strategy 3: youtube-dl-exec with web_safari client
    if (!resolvedUrl) {
        try {
            console.log(`   ➡️ Strategy 3: youtube-dl-exec (web_safari)`);
            const output = await youtubedl(url, {
                getUrl: true,
                format: 'worst',
                extractorArgs: 'youtube:player_client=web_safari',
                noWarnings: true,
                noCheckCertificates: true,
            });
            const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
            if (streamUrl.startsWith('http')) {
                console.log(`   ✅ Strategy 3 success`);
                resolvedUrl = streamUrl;
            }
        } catch (err) {
            console.log(`   ⚠️ Strategy 3 (web_safari) failed: ${err.message.trim().split('\n')[0]}`);
        }
    }

    // Strategy 4: youtube-dl-exec with default client (no extractor args)
    if (!resolvedUrl) {
        try {
            console.log(`   ➡️ Strategy 4: youtube-dl-exec (default)`);
            const output = await youtubedl(url, {
                getUrl: true,
                format: 'worst',
                noWarnings: true,
                noCheckCertificates: true,
            });
            const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
            if (streamUrl.startsWith('http')) {
                console.log(`   ✅ Strategy 4 success`);
                resolvedUrl = streamUrl;
            }
        } catch (err) {
            console.log(`   ⚠️ Strategy 4 (default) failed: ${err.message.trim().split('\n')[0]}`);
        }
    }

    // Strategy 5: youtube-dl-exec with cookies (if available on EC2)
    if (!resolvedUrl) {
        try {
            const cookiePath = process.env.YOUTUBE_COOKIES_PATH || path.join(process.cwd(), 'youtube-cookies.txt');
            if (fs.existsSync(cookiePath)) {
                console.log(`   ➡️ Strategy 5: youtube-dl-exec (cookies)`);
                const output = await youtubedl(url, {
                    getUrl: true,
                    format: 'worst',
                    cookies: cookiePath,
                    noWarnings: true,
                    noCheckCertificates: true,
                });
                const streamUrl = typeof output === 'string' ? output.trim() : String(output).trim();
                if (streamUrl.startsWith('http')) {
                    console.log(`   ✅ Strategy 5 success`);
                    resolvedUrl = streamUrl;
                }
            }
        } catch (err) {
            console.log(`   ⚠️ Strategy 5 failed: ${err.message.trim().split('\n')[0]}`);
        }
    }

    if (!resolvedUrl) {
        // All streaming strategies failed.
        console.error(`❌ [youtubeStream] All stream resolution strategies failed for ${url}`);
        return null;
    }

    // === DOWNLOAD TO LOCAL CACHE ===
    // This perfectly bypasses YouTube's HTTP Range-request blocking and guarantees accurate frame extraction.
    try {
        const safeId = crypto.createHash('md5').update(url).digest('hex');
        const localVideoPath = path.join(os.tmpdir(), `mantram_vid_${safeId}.mp4`);
        
        if (fs.existsSync(localVideoPath)) {
            console.log(`   📦 Using locally cached video: ${localVideoPath}`);
            return localVideoPath;
        }

        console.log(`   📥 Downloading video stream to local cache for fast seeking...`);
        const res = await fetch(resolvedUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const dest = fs.createWriteStream(localVideoPath);
        const { Readable } = await import('stream');
        await new Promise((resolve, reject) => {
            Readable.fromWeb(res.body).pipe(dest)
                .on('finish', resolve)
                .on('error', reject);
        });
        
        console.log(`   ✅ Video downloaded to cache. Size: ${fs.statSync(localVideoPath).size} bytes`);
        return localVideoPath;
    } catch (e) {
        console.error(`   ⚠️ Failed to cache video locally, falling back to HTTP stream:`, e.message);
        return resolvedUrl;
    }
}
