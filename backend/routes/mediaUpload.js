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
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded, getSignedUrlForPath } from '../utils/s3.js';
import { protect } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

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

        let fetchUrl = url;
        
        // RE-SIGNING LOGIC: If it's our S3 bucket, always generate a fresh signature.
        if (isS3) {
            try {
                // Extract key for logging before signing
                const urlObj = new URL(url);
                const pathKey = urlObj.pathname.split('/').filter(Boolean).join('/');
                console.log(`🔍 [PROXY] Attempting re-sign for key: ${pathKey} | Bucket: ${process.env.AWS_S3_BUCKET}`);

                const freshUrl = await getSignedUrlForPath(url, 3600);
                if (freshUrl && freshUrl !== url) {
                    console.log(`🔄 [PROXY] Re-signed stale S3 URL. Fresh signature generated.`);
                    fetchUrl = freshUrl;
                } else {
                    console.log(`ℹ️ [PROXY] getSignedUrlForPath returned original URL/failed to sign.`);
                }
            } catch (signErr) {
                console.warn(`⚠️ [PROXY] Failed to re-sign URL: ${signErr.message}`);
            }
        }

        console.log(`🌐 [PROXY] Fetching: ${fetchUrl.substring(0, 100)}...`);

        const response = await axios({
            method: 'get',
            url: fetchUrl,
            responseType: 'stream',
            timeout: 10000,
            maxContentLength: 20 * 1024 * 1024,
        });

        // Forward essential headers
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        response.data.pipe(res);
    } catch (error) {
        const status = error.response?.status || 500;
        const msg = typeof error.response?.data === 'object' ? JSON.stringify(error.response?.data) : (error.response?.data || error.message);
        console.error(`❌ [PROXY] Final Error: Status=${status} | Target=${fetchUrl.substring(0, 100)}... | Error=${msg}`);
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

export default router;
