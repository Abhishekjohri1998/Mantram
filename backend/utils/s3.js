import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import config from "../config/env.js";
import crypto from "crypto";


const s3Client = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
    },
});

/**
 * Uploads a buffer or base64 string to S3
 * @param {Buffer|string} fileContent - The file content to upload
 * @param {string} fileName - Optional filename, will generate if missing
 * @param {string} mimeType - The content type (e.g., image/png)
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
export const uploadToS3 = async (fileContent, fileName, mimeType = "image/png") => {
    try {
        let buffer = fileContent;
        if (typeof fileContent === "string" && fileContent.startsWith("data:")) {
            // Extract base64 data
            const base64Data = fileContent.split(",")[1];
            buffer = Buffer.from(base64Data, "base64");
        } else if (typeof fileContent === "string") {
            buffer = Buffer.from(fileContent, "base64");
        }

        // BUG-22 FIX: Sanitize filename to prevent path traversal
        const sanitizedName = fileName ? fileName.replace(/\.\./g, '').replace(/\/+/g, '/').replace(/^\//, '') : null;
        const key = sanitizedName || `uploads/${crypto.randomUUID()}.png`;

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: config.aws.bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                // Note: ACL removed — bucket uses "Bucket owner enforced" (ACLs disabled).
                // Public access is controlled via bucket policy or CloudFront.
            },
        });

        await upload.done();

        // Construct the public URL
        // Using path-style URL to avoid SSL issues with buckets containing dots (e.g. mantram.ai)
        return `https://s3.${config.aws.region}.amazonaws.com/${config.aws.bucket}/${key}`;
    } catch (error) {
        console.error("S3 Upload Error:", error);
        throw new Error(`S3 Upload failed: ${error.message}`);
    }
};

/**
 * Downloads a file from a URL and uploads it to S3
 * @param {string} url - The external URL to mirror
 * @param {string} targetKey - The desired S3 key/path
 * @param {string} defaultMimeType - Fallback MIME type
 * @returns {Promise<string|null>} - The S3 URL or null if failed
 */
export const mirrorUrlToS3 = async (url, targetKey, defaultMimeType = "image/png") => {
    if (!url || !url.startsWith("http")) return null;
    try {
        console.log(`📥 Mirroring URL to S3: ${url.substring(0, 80)}...`);
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            redirect: 'follow',
        });
        if (!response.ok) {
            console.warn(`⚠️ Failed to download for mirroring (${response.status}): ${url}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get("content-type") || defaultMimeType;

        return await uploadToS3(buffer, targetKey, contentType);
    } catch (error) {
        console.error("Mirror URL to S3 Error:", error);
        return null;
    }
};

/**
 * Ensures a string is a permanently accessible S3 URL.
 *
 * Handles three input types:
 *   1. Already an S3 URL from our bucket → return as-is, no processing
 *   2. Base64 data URI (data:image/...) → decode buffer, upload to S3, return S3 URL
 *   3. Provider URL (fal, openai, laozhang, replicate, etc.) → fetch and mirror to S3
 *
 * @param {string} input - The URL or base64 string
 * @param {string} folderOrFilename - The S3 folder/prefix, or exact filename (default: 'video-studio/assets')
 * @returns {Promise<string>} - Always returns a stable S3 URL (or original on catastrophic failure)
 */
export const ensureS3Url = async (input, folderOrFilename = 'video-studio/assets') => {
    if (!input || typeof input !== 'string') return input;

    // Normalize protocol-less URLs
    let normalizedInput = input;
    if (normalizedInput.startsWith('//')) {
        normalizedInput = 'https:' + normalizedInput;
    }

    // ── Type 1: Already our S3 URL — return unchanged ────────────────────────
    if (
        normalizedInput.includes('mantram-media-assets.s3') ||
        normalizedInput.includes('mantram.ai/api/video/stream') ||
        (normalizedInput.includes('.amazonaws.com') && normalizedInput.includes(config.aws.bucket))
    ) {
        return normalizedInput;
    }

    // ── Type 2: Base64 data URI — decode and upload to S3 ────────────────────
    if (normalizedInput.startsWith('data:')) {
        try {
            const mimeMatch = normalizedInput.match(/^data:([\w/+]+);base64,/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
            const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
            
            let targetKey = folderOrFilename;
            if (!folderOrFilename.match(/\.(png|jpg|jpeg|webp|mp4|gif)$/i)) {
                targetKey = `${folderOrFilename}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
            }

            console.log(`📤 ensureS3Url: Uploading base64 to S3: ${targetKey}`);
            return await uploadToS3(normalizedInput, targetKey, mimeType);
        } catch (e) {
            console.error(`❌ ensureS3Url base64 S3 upload failed: ${e.message}`);
            return normalizedInput;
        }
    }

    // ── Type 3: External/provider URL — mirror to S3 ─────────────────────────
    if (!normalizedInput.startsWith('http')) return normalizedInput; // relative or unknown — return unchanged

    const PROVIDER_DOMAINS = [
        'fal.media', 'fal.run', 'fal.ai',
        'oaidalleapiprodscus.blob.core.windows.net',
        'openai.com',
        'laozhang.ai',
        // LaoZhang R2 CDN domains — temporary URLs, must mirror to our S3
        'r2cdn.copilotbase.com',
        'copilotbase.com',
        'r2.dev',
        'replicate.delivery', 'pbxt.replicate.delivery',
        'ideogram.ai',
        'stability.ai',
        'cdn.midjourney.com',
        'firebasestorage.googleapis.com',
        'storage.googleapis.com',
        // Atlas Cloud / Alibaba Cloud (Seedance/HappyHorse)
        'aliyuncs.com', 'atlascloud.ai', 'alibaba.com',
        'piapi.ai', 'muapi.ai', 'kling.ai', 'seedance.ai', 'heygen.com', 'modelslab.com'
    ];

    const isProviderUrl = PROVIDER_DOMAINS.some(domain => normalizedInput.includes(domain));
    if (!isProviderUrl) {
        // Unknown external URL — but since we're generating videos, if it's an http URL and not our S3, mirror it just in case,
        // or return unchanged. For safety, we return unchanged, but allow specific additions above.
        return normalizedInput;
    }


    try {
        let targetKey = folderOrFilename;
        // If folderOrFilename does not have a common extension, treat it as a folder
        if (!folderOrFilename.match(/\.(png|jpg|jpeg|webp|mp4|webm|gif)$/i)) {
            const ext = normalizedInput.includes('.mp4') ? 'mp4' : normalizedInput.includes('.webp') ? 'webp' : normalizedInput.includes('.png') ? 'png' : 'jpg';
            targetKey = `${folderOrFilename}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
        }

        console.log(`🔁 ensureS3Url: Mirroring provider URL to S3: ${normalizedInput.substring(0, 80)}...`);
        const mirrored = await mirrorUrlToS3(normalizedInput, targetKey);
        if (mirrored) {
            console.log(`✅ ensureS3Url: Mirrored → ${mirrored.substring(0, 80)}`);
            return mirrored;
        }
        console.warn(`⚠️ ensureS3Url: Mirror failed, returning original URL`);
        return normalizedInput;
    } catch (e) {
        console.error(`❌ ensureS3Url provider mirror failed: ${e.message}`);
        return normalizedInput;
    }
};


/**
 * Generates a pre-signed URL for a given S3 key or full S3 URL.
 * @param {string} urlOrKey - The S3 key (e.g., 'creatives/123.png') or full S3 URL
 * @param {number} expiresIn - Expiration time in seconds (default: 3600 / 1 hour)
 * @returns {Promise<string>} - The signed URL
 */
export const getSignedUrlForPath = async (urlOrKey, expiresIn = 604800) => { // 7 days default
    if (!urlOrKey) return urlOrKey;
    
    try {
        let key = urlOrKey;
        
        // If it's a full URL, extract the key
        if (urlOrKey.startsWith('http')) {
            try {
                const url = new URL(urlOrKey);
                // For path-style URLs: /bucket-name/key/path
                // For virtual-hosted URLs: /key/path
                let pathname = url.pathname;
                
                // Remove trailing/leading slashes for splitting
                const pathParts = pathname.split('/').filter(Boolean);
                
                if (url.hostname.includes('.amazonaws.com')) {
                    // If first part of path matches bucket name, it's path-style. Remove it.
                    if (pathParts[0] === config.aws.bucket) {
                        key = pathParts.slice(1).join('/');
                    } else {
                        key = pathParts.join('/');
                    }
                } else if (url.hostname.includes('mantram-assets')) {
                    // Custom domain or partial match
                    key = pathParts.join('/');
                }

                // Strip query params just in case they were passed as part of the "key"
                key = key.split('?')[0];
            } catch (e) {
                console.warn("Failed to parse S3 URL for signing, using as raw key:", urlOrKey);
            }
        }

        const command = new GetObjectCommand({
            Bucket: config.aws.bucket,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
        return signedUrl;
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return urlOrKey; // Fallback to original
    }
};

/**
 * Returns a readable stream for an S3 object (used by internal proxy fallback)
 */
export const getObjectStream = async (urlOrKey) => {
    try {
        let key = urlOrKey;
        if (urlOrKey.startsWith('http')) {
            const url = new URL(urlOrKey);
            const pathParts = url.pathname.split('/').filter(Boolean);
            if (pathParts[0] === config.aws.bucket) key = pathParts.slice(1).join('/');
            else key = pathParts.join('/');
            key = key.split('?')[0]; 
        }

        const command = new GetObjectCommand({
            Bucket: config.aws.bucket,
            Key: key,
        });

        const response = await s3Client.send(command);
        return {
            stream: response.Body,
            contentType: response.ContentType,
            contentLength: response.ContentLength
        };
    } catch (error) {
        console.error("S3 GetObject stream error:", error);
        throw error;
    }
};

/**
 * Helper to sign a URL only if it looks like an S3 URL from our bucket.
 * Useful for processing lists of mixed URLs.
 * PERF-027: Caches presigned URLs for 6 hours (they expire in 7 days)
 * to avoid redundant S3 presigning calls on hot paths.
 */
const presignedCache = new Map();
const PRESIGN_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// Auto-evict stale entries every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of presignedCache) {
        if (now - entry.ts > PRESIGN_CACHE_TTL) presignedCache.delete(key);
    }
}, 30 * 60 * 1000).unref();

export const getSignedUrlIfNeeded = async (url) => {
    if (!url || typeof url !== 'string') return url;
    if (url.includes('amazonaws.com') && url.includes(config.aws.bucket)) {
        // Check cache first
        const cached = presignedCache.get(url);
        if (cached && Date.now() - cached.ts < PRESIGN_CACHE_TTL) return cached.signed;
        const signed = await getSignedUrlForPath(url);
        presignedCache.set(url, { signed, ts: Date.now() });
        return signed;
    }
    return url;
};

export { s3Client };
export default { uploadToS3, mirrorUrlToS3, ensureS3Url, getSignedUrlForPath, getSignedUrlIfNeeded };
