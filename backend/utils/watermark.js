import sharp from 'sharp';
import { getSetting } from '../models/SystemSettings.js';


/**
 * Get watermark configuration (logo, position, opacity) from SystemSettings.
 * Checks per-brand/user overrides first, then falls back to global settings.
 */
export async function getWatermarkConfig(context = {}) {
    const globalEnabled = await getSetting('watermark_enabled', true);
    const overrides = await getSetting('watermark_overrides', {});

    // Check per-brand override
    if (context.brandId) {
        const brandOverride = overrides[`brand_${context.brandId}`];
        if (brandOverride) {
            return {
                enabled: brandOverride.enabled !== undefined ? brandOverride.enabled : globalEnabled,
                logoUrl: brandOverride.logoUrl || await getSetting('watermark_logo_url', ''),
                position: await getSetting('watermark_position', 'bottom-right'),
                opacity: await getSetting('watermark_opacity', 0.4),
            };
        }
    }

    // Check per-user override
    if (context.userId) {
        const userOverride = overrides[`user_${context.userId}`];
        if (userOverride) {
            return {
                enabled: userOverride.enabled !== undefined ? userOverride.enabled : globalEnabled,
                logoUrl: userOverride.logoUrl || await getSetting('watermark_logo_url', ''),
                position: await getSetting('watermark_position', 'bottom-right'),
                opacity: await getSetting('watermark_opacity', 0.4),
            };
        }
    }

    return {
        enabled: globalEnabled,
        logoUrl: await getSetting('watermark_logo_url', ''),
        position: await getSetting('watermark_position', 'bottom-right'),
        opacity: await getSetting('watermark_opacity', 0.4),
    };
}

/**
 * Calculate position (left, top) for watermark overlay.
 */
function calcPosition(imgWidth, imgHeight, overlayWidth, overlayHeight, position, padding) {
    switch (position) {
        case 'top-left':     return { left: padding, top: padding };
        case 'top-right':    return { left: imgWidth - overlayWidth - padding, top: padding };
        case 'center':       return { left: Math.round((imgWidth - overlayWidth) / 2), top: Math.round((imgHeight - overlayHeight) / 2) };
        case 'bottom-left':  return { left: padding, top: imgHeight - overlayHeight - padding };
        case 'bottom-right':
        default:             return { left: imgWidth - overlayWidth - padding, top: imgHeight - overlayHeight - padding };
    }
}

/**
 * Add watermark to a base64 image.
 * Supports both logo image and text fallback.
 * 
 * @param {string} base64DataUrl - The full data URL (data:image/png;base64,...)
 * @param {object} options - { enabled: true/false, logoUrl, position, opacity, brandId, userId }
 * @returns {string} Watermarked data URL (or original if disabled)
 */
export async function addWatermark(base64DataUrl, options = {}) {
    if (!options.enabled) return base64DataUrl;

    try {
        // Extract base64 data
        const commaIdx = base64DataUrl.indexOf(',');
        if (commaIdx === -1) return base64DataUrl;
        const base64Data = base64DataUrl.substring(commaIdx + 1);
        const header = base64DataUrl.substring(0, commaIdx);

        // Decode to buffer
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Get image dimensions
        const metadata = await sharp(imageBuffer).metadata();
        const imgWidth = metadata.width || 1024;
        const imgHeight = metadata.height || 1024;

        const padding = Math.round(imgWidth * 0.03);
        const position = options.position || 'bottom-right';
        const opacity = options.opacity || 0.4;

        let compositeInput;

        // Try logo image first
        if (options.logoUrl) {
            try {
                const resp = await fetch(options.logoUrl);
                if (resp.ok) {
                    const logoBuffer = Buffer.from(await resp.arrayBuffer());
                    // Scale logo to ~12% of image width
                    const targetWidth = Math.round(imgWidth * 0.12);
                    const resizedLogo = await sharp(logoBuffer)
                        .resize({ width: targetWidth, fit: 'inside' })
                        .ensureAlpha(Math.round(opacity * 255) / 255)
                        .png()
                        .toBuffer();

                    const logoMeta = await sharp(resizedLogo).metadata();
                    const pos = calcPosition(imgWidth, imgHeight, logoMeta.width, logoMeta.height, position, padding);

                    compositeInput = [{ input: resizedLogo, left: Math.max(0, pos.left), top: Math.max(0, pos.top) }];
                }
            } catch (e) {
                console.warn('Logo watermark fetch failed, falling back to text:', e.message);
            }
        }

        // Fallback: text watermark
        if (!compositeInput) {
            const fontSize = Math.max(14, Math.round(imgWidth * 0.028));
            const watermarkText = 'Mantram AI';
            const svgWidth = Math.round(fontSize * watermarkText.length * 0.65);
            const svgHeight = Math.round(fontSize * 2.5);

            const svgWatermark = `
            <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="#000000" flood-opacity="0.5"/>
                    </filter>
                </defs>
                <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" rx="6" ry="6" 
                      fill="rgba(0,0,0,${opacity * 0.7})" />
                <text x="${svgWidth / 2}" y="${svgHeight / 2 + fontSize * 0.35}" 
                      font-family="Arial, Helvetica, sans-serif" 
                      font-size="${fontSize}" 
                      font-weight="600"
                      fill="rgba(255,255,255,${opacity})" 
                      text-anchor="middle"
                      filter="url(#shadow)">
                    ${watermarkText}
                </text>
            </svg>`;

            const pos = calcPosition(imgWidth, imgHeight, svgWidth, svgHeight, position, padding);
            compositeInput = [{ input: Buffer.from(svgWatermark), left: Math.max(0, pos.left), top: Math.max(0, pos.top) }];
        }

        // Composite watermark onto image
        const watermarkedBuffer = await sharp(imageBuffer)
            .composite(compositeInput)
            .toBuffer();

        // Return as data URL
        const outputFormat = metadata.format === 'png' ? 'png' : 'jpeg';
        const watermarkedBase64 = watermarkedBuffer.toString('base64');
        return `data:image/${outputFormat};base64,${watermarkedBase64}`;

    } catch (error) {
        console.error('Watermark error (returning original):', error.message);
        return base64DataUrl; // Return original if watermarking fails
    }
}

/**
 * Add watermark to a video file (for use after S3 upload).
 * Returns the watermarked video URL or null if not applicable.
 * Note: Requires ffmpeg installed on the server.
 * 
 * @param {string} videoUrl - URL of the video to watermark
 * @param {object} options - { logoUrl, position, opacity }
 * @returns {string|null} Path to watermarked video, or null if skipped
 */
export async function addVideoWatermark(videoUrl, options = {}) {
    if (!options.enabled || !options.logoUrl) {
        console.log('⏭️ Video watermark skipped — not enabled or no logo');
        return null;
    }

    // Video watermarking requires ffmpeg — log for now, implement when ffmpeg is confirmed
    console.log(`🎬 Video watermark requested for: ${videoUrl?.substring(0, 60)}... (logo: ${options.logoUrl?.substring(0, 40)})`);
    console.log('📝 Video watermarking via ffmpeg — requires server-side ffmpeg installation');
    
    // TODO: Implement ffmpeg-based video watermarking when confirmed
    // const { exec } = await import('child_process');
    // const outputPath = `/tmp/watermarked-${Date.now()}.mp4`;
    // const filter = `overlay=${posX}:${posY}`;
    // exec(`ffmpeg -i ${inputPath} -i ${logoPath} -filter_complex "${filter}" ${outputPath}`);
    
    return null;
}
