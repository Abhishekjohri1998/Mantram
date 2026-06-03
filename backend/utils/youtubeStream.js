import ytdl from '@distube/ytdl-core';
import YTDlpWrap from 'yt-dlp-wrap';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let ytDlp = null;

async function initYTDlp() {
    if (ytDlp) return ytDlp;

    const binDir = path.join(__dirname, '..', 'bin');
    if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
    }
    const binPath = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    
    // Check if it exists and is a valid size (>1MB)
    let needsDownload = !fs.existsSync(binPath);
    if (!needsDownload) {
        const stats = fs.statSync(binPath);
        if (stats.size < 1000000) { // less than 1MB means it's broken
            needsDownload = true;
            fs.unlinkSync(binPath);
        }
    }

    if (needsDownload) {
        console.log(`📡 [youtubeStream] Downloading yt-dlp binary to ${binPath}...`);
        try {
            await YTDlpWrap.default.downloadFromGithub(binPath);
            if (process.platform !== 'win32') fs.chmodSync(binPath, '755');
            console.log(`✅ [youtubeStream] yt-dlp downloaded successfully.`);
            ytDlp = new YTDlpWrap.default(binPath);
        } catch (e) {
            console.error(`❌ [youtubeStream] Failed to download yt-dlp: ${e.message}`);
            ytDlp = new YTDlpWrap.default(); // fallback to global PATH
        }
    } else {
        if (process.platform !== 'win32') fs.chmodSync(binPath, '755'); // Guarantee executable
        ytDlp = new YTDlpWrap.default(binPath);
    }
    
    return ytDlp;
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

    // Strategy 1: @distube/ytdl-core (Standard)
    try {
        console.log(`   ➡️ Strategy 1: @distube/ytdl-core`);
        // We use poToken/client options if possible to avoid bot detection, but basic call first:
        const info = await ytdl.getInfo(url);
        const format = ytdl.chooseFormat(info.formats, { quality: 'highestvideo' });
        if (format && format.url) {
            console.log(`   ✅ Strategy 1 success (${format.container} ${format.qualityLabel || ''})`);
            return format.url;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 1 failed: ${err.message}`);
    }

    // Strategy 2: yt-dlp-wrap with web_safari client
    try {
        console.log(`   ➡️ Strategy 2: yt-dlp-wrap (web_safari)`);
        const ytdlInstance = await initYTDlp();
        const output = await ytdlInstance.execPromise([
            url,
            '-g', // Get URL
            '-f', 'bestvideo[ext=mp4]/best',
            '--extractor-args', 'youtube:player_client=web_safari',
            '--no-warnings'
        ]);
        const streamUrl = output.split('\n')[0]?.trim();
        if (streamUrl && streamUrl.startsWith('http')) {
            console.log(`   ✅ Strategy 2 success`);
            return streamUrl;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 2 (web_safari) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 2b: yt-dlp-wrap with android client (Bypasses bot block)
    try {
        console.log(`   ➡️ Strategy 2b: yt-dlp-wrap (android)`);
        const ytdlInstance = await initYTDlp();
        const output = await ytdlInstance.execPromise([
            url,
            '-g', 
            '-f', 'bestvideo[ext=mp4]/best',
            '--extractor-args', 'youtube:player_client=android',
            '--no-warnings'
        ]);
        const streamUrl = output.split('\n')[0]?.trim();
        if (streamUrl && streamUrl.startsWith('http')) {
            console.log(`   ✅ Strategy 2b success`);
            return streamUrl;
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 2b (android) failed: ${err.message.trim().split('\n')[0]}`);
    }

    // Strategy 3: yt-dlp-wrap with cookies (if available)
    try {
        const cookiePath = '/home/ec2-user/secrets/youtube-cookies.txt';
        if (fs.existsSync(cookiePath)) {
            console.log(`   ➡️ Strategy 3: yt-dlp-wrap (cookies)`);
            const ytdlInstance = await initYTDlp();
            const output = await ytdlInstance.execPromise([
                url,
                '-g', 
                '-f', 'bestvideo[ext=mp4]/best',
                '--cookies', cookiePath,
                '--no-warnings'
            ]);
            const streamUrl = output.split('\n')[0]?.trim();
            if (streamUrl && streamUrl.startsWith('http')) {
                console.log(`   ✅ Strategy 3 success`);
                return streamUrl;
            }
        }
    } catch (err) {
        console.log(`   ⚠️ Strategy 3 failed: ${err.message.split('\n')[0]}`);
    }

    // All streaming strategies failed.
    console.error(`❌ [youtubeStream] All stream resolution strategies failed for ${url}`);
    return null; // The pipeline will catch this and fallback to Metadata-Only analysis.
}
