/**
 * Video Stitcher — Concatenates multiple video clips into one final film
 *
 * Uses @ffmpeg-installer/ffmpeg + fluent-ffmpeg (or raw exec).
 * Downloads each clip URL → temp file → concat filter → upload to S3.
 *
 * Strategy: concat demuxer (fast, lossless stream copy) for same-codec clips.
 * If clips have mixed codecs (e.g., Seedance H.264 + Kling HEVC), re-encode to H.264.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, mkdirSync, rmSync, existsSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import os from 'os';
import { uploadToS3 } from './s3.js';

const execFileAsync = promisify(execFile);

// Get ffmpeg binary path from ffmpeg-static
let FFMPEG_PATH;
try {
    const module = await import('ffmpeg-static');
    FFMPEG_PATH = module.default || module;
    console.log(`[VideoStitcher] ffmpeg binary: ${FFMPEG_PATH}`);
} catch (e) {
    FFMPEG_PATH = 'ffmpeg'; // fallback to system ffmpeg
    console.warn('[VideoStitcher] ffmpeg-static not found, using system ffmpeg');
}

const STITCH_TIMEOUT_MS = 120_000; // 2 minutes max for stitching

async function downloadToTemp(url, destPath) {
    const resp = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(30000)
    });
    if (!resp.ok) throw new Error(`Failed to download clip: HTTP ${resp.status} for ${url.substring(0, 80)}`);
    const buffer = Buffer.from(await resp.arrayBuffer());
    await writeFile(destPath, buffer);
    return destPath;
}

/**
 * Stitch multiple MP4 clips into one final video using FFmpeg concat
 *
 * @param {string[]} clipUrls  — HTTP URLs of MP4 clips (in order)
 * @param {string} outputKey   — S3 key for the final stitched video
 * @returns {string}           — S3 URL of the stitched video
 */
export async function stitchVideoClips(clipUrls, outputKey) {
    if (!clipUrls || clipUrls.length === 0) throw new Error('No clips to stitch');
    if (clipUrls.length === 1) {
        // Nothing to stitch — return as-is (ensure it's on S3)
        console.log('[VideoStitcher] Only 1 clip — returning as final (no stitch needed)');
        return clipUrls[0];
    }

    // Create temp directory
    const tmpDir = path.join(os.tmpdir(), `mantram-stitch-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    try {
        console.log(`[VideoStitcher] Downloading ${clipUrls.length} clips to temp...`);

        // Download all clips sequentially
        const localPaths = [];
        for (let i = 0; i < clipUrls.length; i++) {
            const destPath = path.join(tmpDir, `clip_${String(i).padStart(3, '0')}.mp4`);
            await downloadToTemp(clipUrls[i], destPath);
            localPaths.push(destPath);
        }

        // Create concat list file
        const concatList = localPaths.map(p => `file '${p}'`).join('\n');
        const listFile = path.join(tmpDir, 'concat.txt');
        await writeFile(listFile, concatList);

        // Output path
        const outputPath = path.join(tmpDir, 'stitched_output.mp4');

        // Run FFmpeg concat
        console.log(`[VideoStitcher] Running FFmpeg concat (${clipUrls.length} clips)...`);
        const args = [
            '-y',                       // overwrite output
            '-f', 'concat',             // concat demuxer
            '-safe', '0',              // allow absolute paths
            '-i', listFile,            // input list
            '-c', 'copy',              // stream copy (no re-encode — fast)
            '-movflags', '+faststart', // web-optimized MP4
            outputPath,
        ];

        try {
            await Promise.race([
                execFileAsync(FFMPEG_PATH, args),
                new Promise((_, reject) => setTimeout(() => reject(new Error('FFmpeg concat timed out')), STITCH_TIMEOUT_MS))
            ]);
        } catch (ffmpegErr) {
            // Retry with re-encode if stream copy failed (mixed codecs)
            console.warn(`[VideoStitcher] Stream copy failed (${ffmpegErr.message}), retrying with re-encode...`);
            const reencodeArgs = [
                '-y',
                '-f', 'concat',
                '-safe', '0',
                '-i', listFile,
                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensure even dimensions
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '23',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', '+faststart',
                outputPath,
            ];
            await Promise.race([
                execFileAsync(FFMPEG_PATH, reencodeArgs),
                new Promise((_, reject) => setTimeout(() => reject(new Error('FFmpeg re-encode timed out')), STITCH_TIMEOUT_MS))
            ]);
        }

        // Upload to S3
        console.log(`[VideoStitcher] Uploading stitched video to S3...`);
        const outputBuffer = await readFile(outputPath);
        const s3Url = await uploadToS3(outputBuffer, outputKey, 'video/mp4');

        console.log(`[VideoStitcher] ✅ Stitched video ready: ${s3Url.substring(0, 80)}...`);
        return s3Url;

    } finally {
        // Always clean up temp files
        try {
            if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
            console.log(`[VideoStitcher] Temp dir cleaned up`);
        } catch (cleanupErr) {
            console.warn(`[VideoStitcher] Cleanup warning: ${cleanupErr.message}`);
        }
    }
}
