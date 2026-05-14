import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { uploadToS3 } from './s3.js';

const execFileAsync = promisify(execFile);

/**
 * Extracts the very last frame of a video and uploads it to S3.
 * Used for chaining sequential video scenes to maintain visual continuity.
 * 
 * @param {string} videoUrl - The public URL of the video
 * @returns {Promise<string>} - The S3 URL of the extracted frame
 */
export async function extractLastFrameToS3(videoUrl) {
    const tmpDir = path.join(os.tmpdir(), `frame-extract-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    
    const videoPath = path.join(tmpDir, 'video.mp4');
    const outPath = path.join(tmpDir, 'last_frame.jpg');

    try {
        // Download the video first to avoid FFmpeg HTTP streaming seek issues
        const resp = await fetch(videoUrl);
        if (!resp.ok) throw new Error(`Failed to download video: ${resp.status}`);
        const buffer = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(videoPath, buffer);

        // Read the last 1 second of the video, continuously overwriting outPath.
        // The last frame processed will remain as the final outPath.
        await execFileAsync('ffmpeg', [
            '-sseof', '-1', 
            '-i', videoPath,
            '-update', '1',
            '-q:v', '2',
            '-y',
            outPath
        ], { timeout: 60000 });
        
        // Fallback: If for some reason output wasn't created (e.g. video < 1s)
        if (!fs.existsSync(outPath)) {
            await execFileAsync('ffmpeg', [
                '-i', videoPath,
                '-vframes', '1', // extract first frame as a fallback to prevent pipeline failure
                '-q:v', '2',
                '-y',
                outPath
            ], { timeout: 30000 });
        }

        if (fs.existsSync(outPath)) {
            const imgBuffer = fs.readFileSync(outPath);
            const s3Key = `video-studio/frames/last-frame-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.jpg`;
            const s3Url = await uploadToS3(imgBuffer, s3Key, 'image/jpeg');
            return s3Url;
        } else {
            throw new Error('FFmpeg failed to generate any frame');
        }

    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}
