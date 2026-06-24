import sharp from 'sharp';
import fetch from 'node-fetch';

/**
 * Creates an SVG string containing the text layout for the thumbnail.
 */
function createSvgOverlay(width, height, hookText, lowerThirdText, styleDNA) {
    const primaryColor = styleDNA?.colorPalette?.[0] || '#FF4500';
    
    // Escaping XML characters
    const escapeXml = (unsafe) => {
        if (!unsafe) return '';
        return unsafe.replace(/[<>&'"]/g, c => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    };

    const safeHook = escapeXml(hookText);
    const safeLowerThird = escapeXml(lowerThirdText);

    return `
    <svg width="${width}" height="${height}">
        <!-- Lower Third Background -->
        <rect x="0" y="${height * 0.82}" width="${width}" height="${height * 0.18}" fill="url(#lowerThirdGrad)" opacity="0.9" />
        
        <defs>
            <!-- Gradient for lower third -->
            <linearGradient id="lowerThirdGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#000000" stop-opacity="0.4" />
                <stop offset="100%" stop-color="${primaryColor}" stop-opacity="1" />
            </linearGradient>

            <!-- Text Drop Shadow Filter -->
            <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="3" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.9"/>
            </filter>
        </defs>

        <!-- Big Hook Text (Element 1) -->
        <text 
            x="50%" 
            y="25%" 
            dominant-baseline="middle" 
            text-anchor="middle" 
            font-family="Arial, Helvetica, sans-serif" 
            font-weight="900" 
            font-size="90" 
            fill="#FFFFFF" 
            stroke="#000000" 
            stroke-width="4"
            filter="url(#shadow)"
        >
            ${safeHook}
        </text>

        <!-- Lower Third Text (Element 2) -->
        <text 
            x="50%" 
            y="92%" 
            dominant-baseline="middle" 
            text-anchor="middle" 
            font-family="Arial, Helvetica, sans-serif" 
            font-weight="bold" 
            font-size="45" 
            fill="#FFFFFF" 
            filter="url(#shadow)"
            letter-spacing="2"
        >
            ${safeLowerThird}
        </text>
    </svg>
    `;
}

/**
 * Direct Compositing Pipeline
 * 1. Fetches the extracted frame
 * 2. Applies cinematic grading (contrast/saturation boost)
 * 3. Overlays SVG text and graphics
 * 
 * @param {string} frameUrl - The S3 URL of the extracted peak moment frame
 * @param {string} hookText - Big floating text (Element 1)
 * @param {string} lowerThirdText - Bottom bar text (Element 2)
 * @param {object} styleDNA - Brand / Template DNA (colors, etc.)
 * @returns {Promise<Buffer>} - The final rendered thumbnail image as a JPEG buffer
 */
export async function compositeThumbnail(frameUrl, hookText, lowerThirdText, styleDNA = {}) {
    console.log(`🎨 [thumbnailCompositor] Starting direct render...`);
    
    // 1. Fetch the base frame
    const resp = await fetch(frameUrl, { signal: AbortSignal.timeout(30000) });
    if (!resp.ok) throw new Error(`Failed to fetch frame for compositing: ${resp.status}`);
    const imageBuffer = Buffer.from(await resp.arrayBuffer());

    const width = 1280;
    const height = 720;

    // 2. Generate SVG Overlay
    const svgOverlay = createSvgOverlay(width, height, hookText, lowerThirdText, styleDNA);

    // 3. Process with Sharp
    const finalBuffer = await sharp(imageBuffer)
        .resize(width, height, { fit: 'cover' })
        // Cinematic color grading: 
        // modest brightness boost, increased saturation, linear contrast stretch
        .modulate({
            brightness: 1.05,
            saturation: 1.25,
            lightness: 0
        })
        .normalize() // stretches contrast to cover full dynamic range
        .composite([
            {
                input: Buffer.from(svgOverlay),
                top: 0,
                left: 0,
            }
        ])
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer();

    console.log(`✅ [thumbnailCompositor] Render complete. Size: ${Math.round(finalBuffer.length / 1024)}KB`);
    return finalBuffer;
}
