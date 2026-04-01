/**
 * Server-side Logo Overlay using Sharp
 * 
 * Composites a brand logo on top of a generated image.
 * Replaces the old client-side canvas approach which failed due to CORS when
 * images were served from S3.
 */
import sharp from 'sharp';
import { keepAliveAgent } from './network.js';

/**
 * Overlay a logo onto an image buffer.
 * 
 * @param {Buffer} imageBuffer - The main image buffer (generated creative)
 * @param {Buffer} logoBuffer  - The logo image buffer (brand logo)
 * @param {string} position    - Grid position: 'top-left', 'bottom-right', etc.
 * @param {string} size        - 'small' | 'medium' | 'large'
 * @returns {Buffer} The composited image buffer
 */
export async function overlayLogo(imageBuffer, logoBuffer, position = 'bottom-right', size = 'medium') {
    try {
        const imgMeta = await sharp(imageBuffer).metadata();
        const imgW = imgMeta.width || 1024;
        const imgH = imgMeta.height || 1024;

        // Calculate logo size as percentage of image width
        const pct = size === 'small' ? 0.08 : size === 'large' ? 0.2 : 0.12;
        const logoMaxW = Math.round(imgW * pct);

        // Resize logo to fit
        const resizedLogo = await sharp(logoBuffer)
            .resize({ width: logoMaxW, fit: 'inside' })
            .toBuffer();

        const logoMeta = await sharp(resizedLogo).metadata();
        const lw = logoMeta.width || logoMaxW;
        const lh = logoMeta.height || logoMaxW;

        // Padding from edges (3% of image width)
        const pad = Math.round(imgW * 0.03);

        // Position mapping
        const positions = {
            'top-left':      { left: pad, top: pad },
            'top-center':    { left: Math.round((imgW - lw) / 2), top: pad },
            'top-right':     { left: imgW - lw - pad, top: pad },
            'center-left':   { left: pad, top: Math.round((imgH - lh) / 2) },
            'center':        { left: Math.round((imgW - lw) / 2), top: Math.round((imgH - lh) / 2) },
            'center-right':  { left: imgW - lw - pad, top: Math.round((imgH - lh) / 2) },
            'bottom-left':   { left: pad, top: imgH - lh - pad },
            'bottom-center': { left: Math.round((imgW - lw) / 2), top: imgH - lh - pad },
            'bottom-right':  { left: imgW - lw - pad, top: imgH - lh - pad },
        };

        const pos = positions[position] || positions['bottom-right'];

        // Composite
        const result = await sharp(imageBuffer)
            .composite([{
                input: resizedLogo,
                left: Math.max(0, pos.left),
                top: Math.max(0, pos.top),
            }])
            .png()
            .toBuffer();

        return result;
    } catch (error) {
        console.error('Logo overlay failed:', error.message);
        return imageBuffer; // Return original if overlay fails
    }
}

/**
 * Fetch an image URL and return its buffer.
 * Handles both HTTP URLs and base64 data URIs.
 */
export async function fetchImageBuffer(urlOrBase64) {
    if (!urlOrBase64) return null;

    // Base64 data URI
    if (urlOrBase64.startsWith('data:')) {
        const commaIdx = urlOrBase64.indexOf(',');
        if (commaIdx === -1) return null;
        return Buffer.from(urlOrBase64.substring(commaIdx + 1), 'base64');
    }

    // HTTP URL
    if (urlOrBase64.startsWith('http')) {
        const resp = await fetch(urlOrBase64, { dispatcher: keepAliveAgent });
        if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
        return Buffer.from(await resp.arrayBuffer());
    }

    return null;
}
