import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { uploadToS3 } from './s3.js';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const execFileAsync = promisify(execFile);
const ffmpegPath = ffmpegInstaller.path || ffmpegInstaller.default?.path || 'ffmpeg';

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
        await execFileAsync(ffmpegPath, [
            '-sseof', '-1', 
            '-i', videoPath,
            '-update', '1',
            '-q:v', '2',
            '-y',
            outPath
        ], { timeout: 60000 });
        
        // Fallback: If for some reason output wasn't created (e.g. video < 1s)
        if (!fs.existsSync(outPath)) {
            await execFileAsync(ffmpegPath, [
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

/**
 * Mux an audio file onto a video file (replacing any existing audio).
 * Used for models that DON'T support refAudio — we generate TTS separately
 * and overlay it onto the scene video via FFmpeg.
 *
 * @param {string} videoUrl - S3/HTTP URL of the video
 * @param {string} audioUrl - S3/HTTP URL of the TTS audio (mp3/wav)
 * @returns {Promise<string>} - S3 URL of the muxed video
 */
export async function muxAudioOntoVideo(videoUrl, audioUrl) {
    const tmpDir = path.join(os.tmpdir(), `mux-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    fs.mkdirSync(tmpDir, { recursive: true });

    const videoPath = path.join(tmpDir, 'video.mp4');
    const audioPath = path.join(tmpDir, 'audio.mp3');
    const outputPath = path.join(tmpDir, 'muxed.mp4');

    try {
        // Download video
        const videoResp = await fetch(videoUrl);
        if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
        fs.writeFileSync(videoPath, Buffer.from(await videoResp.arrayBuffer()));

        // Download audio
        const audioResp = await fetch(audioUrl);
        if (!audioResp.ok) throw new Error(`Failed to download audio: ${audioResp.status}`);
        fs.writeFileSync(audioPath, Buffer.from(await audioResp.arrayBuffer()));

        // Mux: replace video audio with TTS, truncate audio to video length
        await execFileAsync(ffmpegPath, [
            '-y',
            '-i', videoPath,
            '-i', audioPath,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',           // Don't re-encode video
            '-c:a', 'aac', '-b:a', '192k',
            '-shortest',              // Truncate to whichever is shorter
            '-movflags', '+faststart',
            outputPath,
        ], { timeout: 120000 });

        const muxedBuffer = fs.readFileSync(outputPath);
        const s3Key = `video-studio/longform/muxed-scene-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.mp4`;
        const s3Url = await uploadToS3(muxedBuffer, s3Key, 'video/mp4');
        console.log(`✅ [FFmpegUtils] Muxed audio onto video: ${s3Url.substring(0, 70)}`);
        return s3Url;

    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
}

/**
 * Concatenate multiple audio files into a single audio track.
 * Each audio clip is padded with silence to match its corresponding scene duration,
 * ensuring the voiceover timing aligns with the stitched video.
 *
 * @param {Array<{audioUrl: string|null, sceneDuration: number}>} sceneAudios
 *   - audioUrl: S3 URL of the TTS audio for this scene (null = silence)
 *   - sceneDuration: duration of this scene in seconds (used to pad/trim)
 * @param {string} tmpDir - Temp directory to work in
 * @returns {Promise<string|null>} - Local file path of the concatenated audio, or null if no audio
 */
export async function concatSceneAudios(sceneAudios, tmpDir) {
    if (!sceneAudios || sceneAudios.length === 0) return null;

    const hasAnyAudio = sceneAudios.some(s => s.audioUrl);
    if (!hasAnyAudio) return null;

    const segmentPaths = [];

    for (let i = 0; i < sceneAudios.length; i++) {
        const { audioUrl, sceneDuration } = sceneAudios[i];
        const segPath = path.join(tmpDir, `audio-seg-${i}.aac`);

        if (audioUrl) {
            // Download the TTS audio
            const audioFilePath = path.join(tmpDir, `tts-raw-${i}.mp3`);
            const resp = await fetch(audioUrl);
            if (!resp.ok) {
                console.warn(`⚠️ [ConcatAudio] Failed to download audio ${i}: ${resp.status}`);
                // Generate silence for this scene
                await execFileAsync(ffmpegPath, [
                    '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
                    '-t', String(sceneDuration),
                    '-c:a', 'aac', '-b:a', '128k',
                    segPath,
                ], { timeout: 30000 });
                segmentPaths.push(segPath);
                continue;
            }
            fs.writeFileSync(audioFilePath, Buffer.from(await resp.arrayBuffer()));

            // Pad or trim the TTS audio to match the scene duration.
            // apad pads with silence if TTS is shorter; -t trims if TTS is longer.
            await execFileAsync(ffmpegPath, [
                '-y',
                '-i', audioFilePath,
                '-af', `apad=whole_dur=${sceneDuration}`,
                '-t', String(sceneDuration),
                '-c:a', 'aac', '-b:a', '128k',
                '-ar', '44100', '-ac', '2',
                segPath,
            ], { timeout: 30000 });
        } else {
            // No TTS for this scene → generate silence matching scene duration
            await execFileAsync(ffmpegPath, [
                '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
                '-t', String(sceneDuration),
                '-c:a', 'aac', '-b:a', '128k',
                segPath,
            ], { timeout: 30000 });
        }

        segmentPaths.push(segPath);
    }

    // Concatenate all audio segments using concat demuxer
    const concatListPath = path.join(tmpDir, 'audio-concat.txt');
    const concatContent = segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const outputPath = path.join(tmpDir, 'voiceover-full.aac');
    await execFileAsync(ffmpegPath, [
        '-y', '-f', 'concat', '-safe', '0',
        '-i', concatListPath,
        '-c:a', 'aac', '-b:a', '192k',
        '-ar', '44100', '-ac', '2',
        outputPath,
    ], { timeout: 120000 });

    console.log(`✅ [ConcatAudio] Concatenated ${segmentPaths.length} audio segments → ${outputPath}`);
    return outputPath;
}

/**
 * Mix a voiceover audio track with background music and mux onto a video.
 * Voiceover is at full volume; BGM is ducked to ~15% when VO is present.
 *
 * @param {string} videoPath - Local path to the stitched video (no audio)
 * @param {string|null} voiceoverPath - Local path to the voiceover audio
 * @param {string|null} bgmUrl - HTTP URL of the BGM track
 * @param {string} tmpDir - Temp directory
 * @returns {Promise<string>} - Local path to the final muxed video
 */
export async function mixAudioAndMux(videoPath, voiceoverPath, bgmUrl, tmpDir) {
    const outputPath = path.join(tmpDir, 'final-with-audio.mp4');

    // Case 1: No audio at all
    if (!voiceoverPath && !bgmUrl) {
        return videoPath; // Return silent video as-is
    }

    // Download BGM if provided
    let bgmPath = null;
    if (bgmUrl) {
        bgmPath = path.join(tmpDir, 'bgm.mp3');
        try {
            const resp = await fetch(bgmUrl);
            if (resp.ok) {
                fs.writeFileSync(bgmPath, Buffer.from(await resp.arrayBuffer()));
            } else {
                console.warn(`⚠️ [MixAudio] Failed to download BGM: ${resp.status}`);
                bgmPath = null;
            }
        } catch (e) {
            console.warn(`⚠️ [MixAudio] BGM download error: ${e.message}`);
            bgmPath = null;
        }
    }

    const ffmpegArgs = ['-y', '-i', videoPath];

    if (voiceoverPath && bgmPath) {
        // Both voiceover + BGM
        ffmpegArgs.push('-i', voiceoverPath);
        ffmpegArgs.push('-stream_loop', '-1', '-i', bgmPath); // Loop BGM to fill video length
        ffmpegArgs.push(
            '-filter_complex',
            '[1:a]volume=1.5[vo];[2:a]volume=0.12[bgm];[vo][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]'
        );
        ffmpegArgs.push('-map', '0:v:0', '-map', '[aout]');
    } else if (voiceoverPath) {
        // Only voiceover
        ffmpegArgs.push('-i', voiceoverPath);
        ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0');
        ffmpegArgs.push('-filter:a', 'volume=1.5');
    } else if (bgmPath) {
        // Only BGM
        ffmpegArgs.push('-stream_loop', '-1', '-i', bgmPath);
        ffmpegArgs.push('-map', '0:v:0', '-map', '1:a:0');
        ffmpegArgs.push('-filter:a', 'volume=0.20');
    }

    ffmpegArgs.push(
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath,
    );

    await execFileAsync(ffmpegPath, ffmpegArgs, { timeout: 180000 });
    console.log(`✅ [MixAudio] Final video with audio: ${outputPath}`);
    return outputPath;
}
