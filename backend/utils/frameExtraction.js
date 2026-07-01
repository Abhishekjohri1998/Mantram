import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import crypto from 'crypto';
import sharp from 'sharp';
import { uploadToS3 } from './s3.js';
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright';

const execPromise = util.promisify(exec);

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
    fs.mkdirSync(tmpDir, { recursive: true });

    let frames = [];

    try {
        console.log(`🎬 [frameExtraction] Phase 1: Fast HTTP Interval Extraction...`);
        // Extract 15 frames evenly spaced across the video.
        // Using -ss BEFORE -i ensures fast network seeking without downloading the whole video.
        const frameCount = 15;
        const interval = Math.max(1, Math.floor((duration || 120) / (frameCount + 1)));
        
        for (let i = 1; i <= frameCount; i++) {
            const ts = i * interval;
            try {
                // -ss before -i is extremely fast for network streams
                await execPromise(`"${ffmpegPath}" -y -ss ${ts} -i "${videoUrl}" -frames:v 1 -q:v 2 -vf scale=640:-1 "${tmpDir}/interval_${ts}.jpg"`);
            } catch (e) {
                console.warn(`⚠️ FFmpeg interval extraction failed at ${ts}s:`, e.message);
            }
        }

        console.log(`🎬 [frameExtraction] Phase 2: Extracting Chapter/Peak Boundaries...`);
        for (const chapter of chapters) {
            const startSec = chapter.startTime || 0;
            if (startSec > 0) {
                try {
                    await execPromise(`"${ffmpegPath}" -y -ss ${startSec} -i "${videoUrl}" -frames:v 1 -q:v 2 -vf scale=640:-1 "${tmpDir}/chapter_${startSec}.jpg"`);
                } catch (e) { /* ignore */ }
            }
        }

        const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.jpg'));
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

    } catch (err) {
        console.error('❌ [frameExtraction] Failed:', err);
        return [];
    } finally {
        // Cleanup Phase 7
        try {
            if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Error cleaning up temp files:', e);
        }
    }
}

/**
 * Extracts exact frames using a headless browser (Playwright) when FFMPEG/stream extraction fails.
 * Bypasses stream resolution blocks by acting as a real browser.
 */
export async function extractFramesWithPlaywright(videoId, moments = [], durationSecs = 120) {
    let browser;
    const extractedFrames = [];
    try {
        console.log(`🎬 [frameExtraction] Launching Playwright to extract frames directly from YouTube player...`);
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });
        
        // Attempt to load cookies if available to bypass consent screens
        const cookiePath = [
            path.join(process.cwd(), 'youtube-cookies.txt'),
            '/home/ec2-user/secrets/youtube-cookies.txt',
            '/home/ec2-user/deployments/20260701_120903/backend/youtube-cookies.txt'
        ].find(p => fs.existsSync(p));
        
        if (cookiePath) {
            try {
                const cookieTxt = fs.readFileSync(cookiePath, 'utf8');
                const parsedCookies = [];
                cookieTxt.split('\n').forEach(line => {
                    if (line.trim() && !line.startsWith('#')) {
                        const parts = line.split('\t');
                        if (parts.length === 7) {
                            parsedCookies.push({
                                domain: parts[0],
                                path: parts[2],
                                secure: parts[3] === 'TRUE',
                                expires: parseInt(parts[4]),
                                name: parts[5],
                                value: parts[6].replace('\r', '')
                            });
                        }
                    }
                });
                if (parsedCookies.length > 0) await context.addCookies(parsedCookies);
            } catch (e) {
                console.warn(`⚠️ [frameExtraction] Failed to parse cookies for Playwright: ${e.message}`);
            }
        }

        const page = await context.newPage();
        await page.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Try to click accept on cookie dialogs if present
        try { await page.click('button[aria-label="Accept all"]', { timeout: 2000 }); } catch (e) {}
        
        // Wait for video element to be available and play it so it buffers
        await page.waitForSelector('video', { timeout: 10000 });
        
        for (const moment of moments) {
            try {
                let tsSecs = 0;
                if (typeof moment.timestamp === 'string') {
                    const parts = moment.timestamp.split(':').map(Number);
                    if (parts.length === 2) tsSecs = parts[0] * 60 + parts[1];
                    else if (parts.length === 3) tsSecs = parts[0] * 3600 + parts[1] * 60 + parts[2];
                } else if (typeof moment.timestamp === 'number') {
                    tsSecs = moment.timestamp;
                }
                
                if (tsSecs <= 0) continue;
                
                console.log(`📸 [frameExtraction] Seeking Playwright to ${tsSecs}s for "${moment.label}"...`);
                await page.evaluate((ts) => {
                    const video = document.querySelector('video');
                    if (video) {
                        video.pause();
                        video.currentTime = ts;
                    }
                }, tsSecs);
                
                // Wait for the video to seek and buffer the frame
                await page.waitForTimeout(1500); 
                
                // Take screenshot of the video element specifically to avoid UI overlays
                const videoEl = await page.$('video');
                if (videoEl) {
                    const buffer = await videoEl.screenshot({ type: 'jpeg', quality: 90 });
                    if (buffer && buffer.length > 1024) {
                        extractedFrames.push({
                            label: moment.label,
                            timestamp: moment.timestamp,
                            score: moment.score || 85,
                            localBuffer: buffer
                        });
                        console.log(`   ✅ Extracted frame at ${tsSecs}s (${Math.round(buffer.length/1024)}KB)`);
                    }
                }
            } catch (e) {
                console.warn(`   ⚠️ Playwright screenshot failed for ${moment.timestamp}: ${e.message}`);
            }
        }
    } catch (err) {
        console.error(`❌ [frameExtraction] Playwright fallback failed: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }
    
    return extractedFrames;
}
