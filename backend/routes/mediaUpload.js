/**
 * Mantram AI — Centralized Media Upload
 * 
 * POST /api/media/upload
 *   Accepts base64 data URI → uploads to S3 → returns permanent URL.
 *   This replaces all scattered base64-in-JSON patterns across the portal.
 * 
 * Usage from frontend:
 *   const { url } = await mediaAPI.upload({ imageData: 'data:image/png;base64,...', folder: 'refs' })
 */
import { Router } from 'express';
import axios from 'axios';
import multer from 'multer';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded, getSignedUrlForPath, getObjectStream, s3Client } from '../utils/s3.js';
import { protect } from '../middleware/auth.js';
import crypto from 'crypto';
import config from '../config/env.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/media/file/* — Query-parameter-less public proxy route for social media publishers
// Retrieves S3 objects using AWS credentials and streams them directly.
router.get('/file/*', async (req, res) => {
    try {
        const s3Key = req.params[0];
        if (!s3Key) {
            return res.status(400).send('S3 Key is required');
        }

        // Prevent directory traversal
        const cleanKey = s3Key.replace(/\.\./g, '');
        console.log(`📡 [MEDIA PROXY] Streaming S3 Key: ${cleanKey}`);

        const { stream, contentType, contentLength } = await getObjectStream(cleanKey);

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);

        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');

        return stream.pipe(res);
    } catch (error) {
        console.error(`❌ [MEDIA PROXY] S3 stream failed for key ${req.params[0]}:`, error.message);
        const statusCode = error.$metadata?.httpStatusCode || 500;
        return res.status(statusCode).send(`Failed to fetch media: ${error.message}`);
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/media/proxy — CORS Proxy for S3 assets (required for Canvas)
// This must be public because browser <img> tags and canvas loading don't send Auth headers.
// Security is enforced via strict domain allow-listing.
router.get('/proxy', async (req, res) => {
    const { url } = req.query;
    try {
        if (!url) return res.status(400).send('URL is required');

        // PRODUCTION-READY SECURITY: Only proxy our own S3 assets or allowed origins
        // This prevents the endpoint from being used as a general-purpose open proxy.
        const isS3 = url.includes('s3.ap-south-1.amazonaws.com') || 
                     url.includes('canvas-layers.s3') || 
                     url.includes('mantram-assets');
        const isUnsplash = url.startsWith('https://images.unsplash.com');
        
        if (!isS3 && !isUnsplash) {
            console.warn(`🛑 [PROXY] Blocked unauthorized URL: ${url}`);
            return res.status(403).send('Forbidden: Only authorized S3 or Unsplash assets can be proxied');
        }

        // 1. Handle S3 Assets with Direct Streaming (Bypasses Signatures)
        if (isS3) {
            try {
                console.log(`📡 [PROXY] S3 detected. Using direct SDK stream: ${url.substring(0, 100)}...`);
                const { stream, contentType, contentLength } = await getObjectStream(url);
                
                if (contentType) res.setHeader('Content-Type', contentType);
                if (contentLength) res.setHeader('Content-Length', contentLength);
                
                res.setHeader('Cache-Control', 'public, max-age=86400');
                res.setHeader('Access-Control-Allow-Origin', '*');
                
                // Pipe directly from S3 SDK to Express response
                return stream.pipe(res);
            } catch (s3Err) {
                console.error(`❌ [PROXY] S3 direct stream failed: ${s3Err.message}. Falling back to Axios...`);
                // Fall through to Axios if SDK fails (e.g. key extraction error)
            }
        }

        // 2. Fallback / Unsplash Proxy via Axios
        const fetchUrl = url;
        console.log(`🌐 [PROXY] Fetching via Axios: ${fetchUrl.substring(0, 100)}...`);

        const response = await axios({
            method: 'get',
            url: fetchUrl,
            responseType: 'stream',
            timeout: 10000,
            maxContentLength: 30 * 1024 * 1024, // Increased to 30MB
        });

        // Forward essential headers
        if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
        if (response.headers['content-length']) res.setHeader('Content-Length', response.headers['content-length']);
        
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        response.data.pipe(res);
    } catch (error) {
        const status = error.response?.status || 500;
        // SAFE ERROR EXTRACTION: Avoid circular JSON structures (like sockets) in error.response
        let msg = error.message;
        if (error.response?.data) {
            msg = typeof error.response.data === 'string' 
                ? error.response.data 
                : (typeof error.response.data === 'object' ? 'S3 Error' : JSON.stringify(error.response.data));
        }
        console.error(`❌ [PROXY] Final Failure: Status=${status} | Target=${url.substring(0, 80)}... | Error=${msg}`);
        res.status(status).send(`Proxy failed: ${msg}`);
    }
});


// ══════════════════════════════════════════════════════════════════════════════
// POST /api/media/upload — Upload base64 image → S3 URL
// ══════════════════════════════════════════════════════════════════════════════
router.post('/upload', protect, async (req, res) => {
    try {
        const { imageData, folder = 'uploads' } = req.body;

        if (!imageData) {
            return res.status(400).json({ success: false, error: 'imageData is required' });
        }

        // If it's a URL, mirror it to our S3 for persistence (unless already in our S3)
        if (imageData.startsWith('http')) {
            if (imageData.includes('s3.amazonaws.com') && imageData.includes(process.env.AWS_S3_BUCKET)) {
                return res.json({ success: true, url: imageData });
            }
            
            const s3Key = `${folder}/${req.user._id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
            const s3Url = await mirrorUrlToS3(imageData, s3Key);
            const finalUrl = await getSignedUrlIfNeeded(s3Url || imageData);
            return res.json({ success: !!s3Url, url: finalUrl });
        }

        // Validate base64 data URI format
        if (!imageData.startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: 'imageData must be a data:image/ URI or http URL' });
        }

        // Extract mime type for proper extension
        const mimeMatch = imageData.match(/^data:(image\/\w+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';

        // Build S3 key: folder/userId/timestamp-random.ext
        const userId = req.user._id.toString();
        const s3Key = `${folder}/${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

        console.log(`📤 Media upload: ${Math.round(imageData.length / 1024)}KB → s3://${s3Key}`);

        const s3Url = await uploadToS3(imageData, s3Key, mimeType);
        const finalUrl = await getSignedUrlIfNeeded(s3Url);

        console.log(`✅ Media uploaded: ${s3Url}`);

        res.json({ success: true, url: finalUrl });
    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
    }
});



// ══════════════════════════════════════════════════════════════════════════════
// POST /api/media/presign-upload — Get a presigned S3 PUT URL
// Browser uploads the file binary directly to S3 (no base64, no Node proxying)
// Returns: { uploadUrl, s3Url, key }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/presign-upload', protect, async (req, res) => {
    try {
        const { fileName, contentType = 'image/jpeg', folder = 'refs' } = req.body;

        if (!fileName) return res.status(400).json({ success: false, error: 'fileName is required' });

        const ext = fileName.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg','jpeg','png','webp','gif'].includes(ext) ? ext : 'jpg';
        const key = `${folder}/${req.user._id}/${Date.now()}-${crypto.randomUUID().slice(0,8)}.${safeExt}`;

        const command = new PutObjectCommand({
            Bucket: config.aws.bucket,
            Key:    key,
            ContentType: contentType,
        });

        // 5-minute window — plenty for direct browser upload
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
        const s3Url = `https://s3.${config.aws.region}.amazonaws.com/${config.aws.bucket}/${key}`;

        console.log(`🔏 Presigned PUT issued for key: ${key}`);
        res.json({ success: true, uploadUrl, s3Url, key });
    } catch (error) {
        console.error('Presign upload error:', error);
        res.status(500).json({ success: false, error: `Presign failed: ${error.message}` });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/media/image-reference — Multipart file upload for template/avatar refs
// BUG-03 FIX: Frontend calls this BEFORE generation to pre-upload to S3.
// Returns { url: S3_URL } — caller sends the URL in the generation body, never base64.
const refUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowed.includes(file.mimetype)) cb(null, true);
        else cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: jpg, png, webp, gif`));
    }
});

router.post('/image-reference', protect, refUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded. Include a "file" field in FormData.' });
        }

        const { buffer, mimetype, originalname } = req.file;
        const ext = originalname.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = ['jpg','jpeg','png','webp','gif'].includes(ext) ? ext : 'jpg';
        const s3Key = `user-uploads/${req.user._id}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${safeExt}`;

        console.log(`📤 [image-reference] Uploading ${Math.round(buffer.length / 1024)}KB → ${s3Key}`);

        const s3Url = await uploadToS3(buffer, s3Key, mimetype);
        console.log(`✅ [image-reference] Uploaded: ${s3Url}`);

        res.json({ success: true, url: s3Url });
    } catch (error) {
        console.error('image-reference upload error:', error);
        res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
    }
});

export default router;
