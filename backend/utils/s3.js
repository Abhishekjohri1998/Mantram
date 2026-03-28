import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
 * Ensures a string is a publicly accessible URL.
 * If it's a base64 string, it uploads it to S3 and returns the S3 URL.
 * If it's already a URL, it returns it as is.
 * @param {string} input - The URL or base64 string
 * @param {string} folder - The S3 folder/prefix (default: 'video-studio/assets')
 * @returns {Promise<string>} - The S3 URL or original URL
 */
export const ensureS3Url = async (input, folder = 'video-studio/assets') => {
    if (!input || typeof input !== 'string') return input;
    if (!input.startsWith('data:')) return input; // Already a URL (probably)

    try {
        const mimeMatch = input.match(/^data:([\w/+]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        const filename = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

        console.log(`📤 ensureS3Url: Uploading base64 to S3: ${filename}`);
        return await uploadToS3(input, filename, mimeType);
    } catch (e) {
        console.error(`❌ ensureS3Url failed: ${e.message}`);
        return input; // Fallback to original (even if base64, might work or fail downstream)
    }
};

export { s3Client };
export default { uploadToS3, mirrorUrlToS3, ensureS3Url };
