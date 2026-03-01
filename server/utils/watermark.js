import sharp from 'sharp';

/**
 * Add "Mantram AI" watermark to a base64 image.
 * Position: center-right, small but visible, semi-transparent.
 * 
 * @param {string} base64DataUrl - The full data URL (data:image/png;base64,...)
 * @param {object} options - { enabled: true/false }
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

        // Scale watermark relative to image size
        const fontSize = Math.max(14, Math.round(imgWidth * 0.028));
        const padding = Math.round(imgWidth * 0.03);

        // Create SVG watermark — center-right position, semi-transparent
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
                  fill="rgba(0,0,0,0.35)" />
            <text x="${svgWidth / 2}" y="${svgHeight / 2 + fontSize * 0.35}" 
                  font-family="Arial, Helvetica, sans-serif" 
                  font-size="${fontSize}" 
                  font-weight="600"
                  fill="rgba(255,255,255,0.75)" 
                  text-anchor="middle"
                  filter="url(#shadow)">
                ${watermarkText}
            </text>
        </svg>`;

        // Position: center-right (vertically centered, right edge with padding)
        const left = imgWidth - svgWidth - padding;
        const top = Math.round((imgHeight - svgHeight) / 2);

        // Composite watermark onto image
        const watermarkedBuffer = await sharp(imageBuffer)
            .composite([{
                input: Buffer.from(svgWatermark),
                left: Math.max(0, left),
                top: Math.max(0, top),
            }])
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
