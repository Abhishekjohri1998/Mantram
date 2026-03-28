import { mirrorUrlToS3, uploadToS3 } from '../utils/s3.js';
import crypto from 'crypto';

/**
 * Mirror all brand assets (logo, images, banners, screenshot) to S3
 * @param {Object} dna - The Brand DNA object
 * @param {string} brandId - The brand ID (or a temp UUID for pre-onboarding)
 * @returns {Promise<Object>} - The updated DNA object
 */
export async function mirrorBrandAssets(dna, brandId) {
    if (!dna) return dna;

    // 1. Mirror Logo
    if (dna.logo?.url && !dna.logo.url.includes('s3.amazonaws.com') && !dna.logo.url.startsWith('data:')) {
        const s3Url = await mirrorUrlToS3(dna.logo.url, `brands/${brandId}/logo.png`);
        if (s3Url) dna.logo.url = s3Url;
    }

    // 2. Mirror Website Snapshot (base64 -> JPG)
    if (dna.websiteSnapshot && dna.websiteSnapshot.startsWith('data:image/')) {
        try {
            const s3Url = await uploadToS3(dna.websiteSnapshot, `brands/${brandId}/snapshot.jpg`, 'image/jpeg');
            if (s3Url) dna.websiteSnapshot = s3Url;
            console.log(`📸 Website snapshot mirrored to S3: ${s3Url}`);
        } catch (err) {
            console.warn('⚠️ Website snapshot mirroring failed:', err.message);
        }
    }

    // 3. Mirror Brand Images
    if (dna.brandImages && dna.brandImages.length > 0) {
        dna.brandImages = await Promise.all(dna.brandImages.map(async (img, idx) => {
            if (!img.url || img.url.includes('s3.amazonaws.com') || img.url.startsWith('data:')) return img;
            
            // Clean extension from URL
            const ext = img.url.split('?')[0].split('.').pop()?.toLowerCase() || 'png';
            const validExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'png';
            
            const s3Url = await mirrorUrlToS3(img.url, `brands/${brandId}/images/img_${Date.now()}_${idx}.${validExt}`);
            return s3Url ? { ...img, url: s3Url } : img;
        }));
    }

    // 4. Mirror Banner Images
    if (dna.bannerImages && dna.bannerImages.length > 0) {
        dna.bannerImages = await Promise.all(dna.bannerImages.map(async (img, idx) => {
            if (!img.url || img.url.includes('s3.amazonaws.com') || img.url.startsWith('data:')) return img;
            
            const ext = img.url.split('?')[0].split('.').pop()?.toLowerCase() || 'png';
            const validExt = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext) ? ext : 'png';
            
            const s3Url = await mirrorUrlToS3(img.url, `brands/${brandId}/banners/banner_${Date.now()}_${idx}.${validExt}`);
            return s3Url ? { ...img, url: s3Url } : img;
        }));
    }

    return dna;
}

/**
 * Mirror a single image URL to S3 for a specific context
 * @param {string} url - Original URL
 * @param {string} path - Target path in S3
 * @returns {Promise<string>} - S3 URL or original URL
 */
export async function mirrorSingleAsset(url, path) {
    if (!url || url.includes('s3.amazonaws.com') || url.startsWith('data:')) return url;
    const s3Url = await mirrorUrlToS3(url, path);
    return s3Url || url;
}
