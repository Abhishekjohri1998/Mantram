/**
 * s3Upload.js — YouTube Studio S3 persistence helpers
 *
 * Referenced by thumbnailGenerationNode to convert GPT Image 2 b64_json
 * responses into permanent S3 URLs instead of storing data: URIs.
 *
 * Uses the existing ensureS3Url utility from s3.js which handles:
 *   - base64 data URIs  → upload to S3
 *   - http URLs         → mirror to S3 if from a provider domain
 *   - already-S3 URLs   → return unchanged
 */

import { ensureS3Url, uploadToS3 } from './s3.js';
import crypto from 'crypto';

/**
 * Upload a raw base64 string (no data: prefix) to S3.
 * Used by thumbnailGenerationNode which receives b64_json from GPT Image 2.
 *
 * @param {string} b64     — raw base64 string (no data: prefix)
 * @param {string} s3Key   — target S3 key, e.g. 'thumbnails/yt-1234567890.png'
 * @returns {Promise<string>} — persistent S3 URL
 */
export async function uploadBase64ToS3(b64, s3Key) {
    if (!b64) throw new Error('uploadBase64ToS3: b64 is required');

    // Convert raw base64 to Buffer
    const buffer = Buffer.from(b64, 'base64');

    // Determine extension from key or default to png
    const ext = s3Key?.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'webp' ? 'image/webp'
        : 'image/png';

    const key = s3Key || `thumbnails/yt-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.png`;
    console.log(`📤 [s3Upload] Uploading ${Math.round(buffer.length / 1024)}KB to s3://${key}`);

    const s3Url = await uploadToS3(buffer, key, mimeType);
    console.log(`✅ [s3Upload] Uploaded: ${s3Url}`);
    return s3Url;
}

/**
 * Ensure any image URL or base64 string is persisted to S3.
 * Wraps ensureS3Url for convenience.
 *
 * @param {string} input   — data: URI, http URL, or already-S3 URL
 * @param {string} folder  — S3 folder prefix (default: 'yt-studio')
 * @returns {Promise<string>} — S3 URL
 */
export async function persistToS3(input, folder = 'yt-studio') {
    return ensureS3Url(input, folder);
}

export { ensureS3Url };
