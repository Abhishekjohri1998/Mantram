import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import sharp from 'sharp';
import YTDlpWrap from 'yt-dlp-wrap';
import { uploadToS3 } from './s3.js';

const execPromise = util.promisify(exec);
const ytDlp = new YTDlpWrap.default();

/**
 * Calculates a simple perceptual hash (average hash) for an image.
 */
async function getAverageHash(imageBuffer) {
    const { data } = await sharp(imageBuffer)
        .resize(8, 8)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
    
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    let hash = '';
    for (let i = 0; i < data.length; i++) {
        hash += data[i] > avg ? '1' : '0';
    }
    return hash;
}

/**
 * Calculates the Hamming distance between two binary hashes.
 */
function hammingDistance(hash1, hash2) {
    let dist = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) dist++;
    }
    return dist;
}

/**
 * Calculates the Laplacian variance (sharpness score) of an image.
 */
async function calculateSharpness(imageBuffer) {
    try {
        // Sharp doesn't have a direct Laplacian operator, so we approximate
        // by applying a simple edge detection convolution kernel.
        const kernel = {
            width: 3,
            height: 3,
            kernel: [
                0,  1, 0,
                1, -4, 1,
                0,  1, 0
            ]
        };
        
        const edgeImage = await sharp(imageBuffer)
            .greyscale()
            .convolve(kernel)
            .raw()
            .toBuffer();
        
        // Calculate variance of the edge image
        let sum = 0;
        for (let i = 0; i < edgeImage.length; i++) sum += edgeImage[i];
        const mean = sum / edgeImage.length;
        
        let varSum = 0;
        for (let i = 0; i < edgeImage.length; i++) {
            varSum += Math.pow(edgeImage[i] - mean, 2);
        }
        return varSum / edgeImage.length;
    } catch {
        return 0; // Fallback if calculation fails
    }
}

/**
 * Extracts frames intelligently from a YouTube video using scene detection.
 * 
 * @param {string} videoId 
 * @param {string} videoUrl 
 * @param {number} duration 
 * @param {Array} chapters 
 * @returns {Promise<Array>} List of extracted and scored frames (URLs or local paths)
 */
export async function intelligentFrameExtraction(videoId, videoUrl, duration, chapters = []) {
    const tmpDir = '/tmp/mantram_frames_' + crypto.randomBytes(4).toString('hex');
    const videoFile = path.join('/tmp', `yt_${videoId}.mp4`);
    
    fs.mkdirSync(tmpDir, { recursive: true });

    let frames = [];

    try {
        console.log(`🎬 [frameExtraction] Phase 1: Downloading video ${videoId}...`);
        
        // Download the video via yt-dlp to tmp
        await ytDlp.execPromise([
            videoUrl,
            '-f', 'bestvideo[height<=720][ext=mp4]/best[height<=720][ext=mp4]/best',
            '--no-playlist',
            '-o', videoFile
        ]);

        if (!fs.existsSync(videoFile)) {
            throw new Error('Video download failed.');
        }

        console.log(`🎬 [frameExtraction] Phase 2: Running FFmpeg Scene Detection...`);
        // Extract up to 30 frames at scene changes > 0.35
        try {
            await execPromise(`ffmpeg -i ${videoFile} -vf "select='gt(scene,0.35)',scale=640:-1" -vsync vfr -frames:v 30 ${tmpDir}/scene_%04d.jpg`);
        } catch (e) {
            console.warn('⚠️ FFmpeg scene extraction failed or returned fewer frames:', e.message);
        }

        console.log(`🎬 [frameExtraction] Phase 3: Extracting Chapter Boundaries...`);
        for (const chapter of chapters) {
            const startSec = chapter.startTime || 0;
            if (startSec > 0) {
                try {
                    await execPromise(`ffmpeg -ss ${startSec} -i ${videoFile} -frames:v 1 -q:v 2 -scale=640:-1 ${tmpDir}/chapter_${startSec}.jpg`);
                } catch (e) { /* ignore */ }
            }
        }

        // Phase 4: Backup interval extraction if too few frames
        let files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg'));
        if (files.length < 8) {
            console.log(`🎬 [frameExtraction] Phase 4: Too few frames (${files.length}), extracting intervals...`);
            const interval = Math.floor((duration || 120) / 7);
            for (let i = 1; i <= 7; i++) {
                const ts = i * interval;
                try {
                    await execPromise(`ffmpeg -ss ${ts} -i ${videoFile} -frames:v 1 -q:v 2 -scale=640:-1 ${tmpDir}/interval_${ts}.jpg`);
                } catch (e) { /* ignore */ }
            }
        }

        files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg'));
        console.log(`🎬 [frameExtraction] Extracted ${files.length} raw frames.`);

        if (files.length === 0) {
            throw new Error('No frames extracted.');
        }

        // Phase 5: Deduplication via pHash & Phase 6: Scoring
        console.log(`🎬 [frameExtraction] Phase 5 & 6: Deduplication and Scoring...`);
        const frameDataList = [];

        for (const file of files) {
            const filePath = path.join(tmpDir, file);
            const buffer = fs.readFileSync(filePath);
            
            const hash = await getAverageHash(buffer);
            const sharpness = await calculateSharpness(buffer);

            // Deduplication check
            let isDuplicate = false;
            for (const existing of frameDataList) {
                const dist = hammingDistance(hash, existing.hash);
                // 64-bit hash. 10% difference = 6 bits.
                if (dist <= 6) {
                    isDuplicate = true;
                    // Keep the sharper one
                    if (sharpness > existing.sharpness) {
                        existing.buffer = buffer;
                        existing.sharpness = sharpness;
                        existing.file = file;
                    }
                    break;
                }
            }

            if (!isDuplicate) {
                frameDataList.push({
                    file,
                    buffer,
                    hash,
                    sharpness,
                    score: sharpness // Base score is sharpness, can be enhanced with brightness/face detection later
                });
            }
        }

        // Sort by score descending and take top 10
        frameDataList.sort((a, b) => b.score - a.score);
        const topFrames = frameDataList.slice(0, 10);

        console.log(`🎬 [frameExtraction] Phase 7: Uploading Top ${topFrames.length} frames to S3...`);
        
        for (let i = 0; i < topFrames.length; i++) {
            const f = topFrames[i];
            const key = `youtube-studio-uploads/frames/${videoId}/extracted_${i}_${Date.now()}.jpg`;
            const s3Url = await uploadToS3(f.buffer, key, 'image/jpeg');
            frames.push({
                url: s3Url,
                label: `Extracted Frame ${i + 1}`,
                score: f.score,
                localBuffer: f.buffer // pass buffer downstream for face detection
            });
        }

        return frames;

    } catch (err) {
        console.error('❌ [frameExtraction] Failed:', err);
        return [];
    } finally {
        // Cleanup Phase 7
        try {
            if (fs.existsSync(videoFile)) fs.unlinkSync(videoFile);
            if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Error cleaning up temp files:', e);
        }
    }
}
