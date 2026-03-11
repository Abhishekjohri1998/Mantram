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
import { uploadToS3 } from '../utils/s3.js';
import { protect } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/media/upload — Upload base64 image → S3 URL
// ══════════════════════════════════════════════════════════════════════════════
router.post('/upload', protect, async (req, res) => {
    try {
        const { imageData, folder = 'uploads' } = req.body;

        if (!imageData) {
            return res.status(400).json({ success: false, error: 'imageData is required' });
        }

        // If already a URL, return as-is (idempotent)
        if (imageData.startsWith('http')) {
            return res.json({ success: true, url: imageData });
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

        console.log(`✅ Media uploaded: ${s3Url}`);

        res.json({ success: true, url: s3Url });
    } catch (error) {
        console.error('Media upload error:', error);
        res.status(500).json({ success: false, error: `Upload failed: ${error.message}` });
    }
});

export default router;
