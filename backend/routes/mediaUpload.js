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
import { uploadToS3, mirrorUrlToS3, getSignedUrlIfNeeded } from '../utils/s3.js';
import { protect } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/media/proxy — CORS Proxy for S3 assets (required for Canvas)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/proxy', protect, async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) return res.status(400).send('URL is required');

        // SECURITY: Only proxy our own S3 assets or allowed origins
        const isS3 = url.includes('s3.amazonaws.com') || url.includes('.s3.') || url.includes('mantram-assets');
        if (!isS3 && !url.startsWith('https://images.unsplash.com')) {
            // return res.status(403).send('Only S3 or Unsplash assets can be proxied');
        }

        const response = await axios({
            method: 'get',
            url: url,
            responseType: 'stream',
            timeout: 15000,
        });

        // Forward essential headers
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.setHeader('Access-Control-Allow-Origin', '*'); // The core fix for CORS
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

        response.data.pipe(res);
    } catch (error) {
        console.error('Proxy error for URL:', req.query.url, '\u2192', error.message);
        res.status(500).send(`Proxy failed: ${error.message}`);
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
