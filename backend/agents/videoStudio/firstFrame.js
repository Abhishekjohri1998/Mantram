/**
 * First Frame Generator — Generates a reference image for video consistency
 * 
 * Uses Gemini's image generation to create a first-frame image based on the
 * first shot description. The image is then uploaded to fal.ai storage to
 * get an HTTP URL that video generation APIs can use.
 */

const GEMINI_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-3-pro-image-preview', 'gemini-2.0-flash'];

import { Agent } from 'undici';
import { ensureS3Url } from '../../utils/s3.js';

// Reusable Keep-Alive dispatcher to eliminate heavy TLS handshake latency on repeated calls
export const keepAliveAgent = new Agent({
    keepAliveTimeout: 60000,
    connections: 100
});

/**
 * Generate an image using Gemini's native image generation
 * Returns { imageUrl } with either an HTTP URL (via fal storage) or base64 data URI
 */
export async function geminiImageGenerate(prompt, imageParts = [], temperature = 0.5) {
    const imageKey = process.env.GEMINI_API_KEY;
    if (!imageKey) throw new Error('GEMINI_API_KEY not configured in .env');

    console.log('🖼️ Gemini image gen: starting with key:', imageKey.substring(0, 8) + '...');

    const parts = [
        ...imageParts.map(img => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
        { text: prompt },
    ];

    let imageBase64 = null;
    let mimeType = 'image/png';

    for (const modelId of GEMINI_MODELS) {
        try {
            console.log(`🖼️ Trying Gemini model: ${modelId} with 20s fast-fail timeout`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
            
            // Fast-Fail if model hangs indefinitely (20 seconds max)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            let fetchOptions = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature },
                }),
                signal: controller.signal
            };
            
            // Apply Keep-Alive dispatcher if using native Node 18+ undici fetch
            if (global.fetch && typeof keepAliveAgent !== 'undefined') {
                fetchOptions.dispatcher = keepAliveAgent;
            }

            const resp = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);

            const data = await resp.json();
            if (data.error) {
                console.error(`❌ Model ${modelId}:`, data.error.message);
                continue;
            }

            const resParts = data.candidates?.[0]?.content?.parts || [];
            for (const part of resParts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    imageBase64 = part.inlineData.data;
                    mimeType = part.inlineData.mimeType;
                }
            }
            if (imageBase64) {
                console.log(`✅ Gemini image generated using ${modelId} (${imageBase64.length} bytes base64)`);
                break;
            } else {
                console.warn(`⚠️ Model ${modelId} returned no image in response parts`);
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                console.error(`⏱️ Model ${modelId} timed out after 20s — fast-failing to fallback...`);
            } else {
                console.error(`❌ Model ${modelId} error:`, e.message);
            }
            continue;
        }
    }

    if (!imageBase64) {
        throw new Error('Gemini image generation failed — no image returned from any model');
    }

    // Try to upload to fal.ai storage for an HTTP URL
    const httpUrl = await uploadToFalStorage(imageBase64, mimeType);
    if (httpUrl) {
        console.log(`📤 First frame uploaded to fal storage: ${httpUrl.substring(0, 80)}...`);
        return { imageUrl: httpUrl };
    }

    // Fallback: return data URI (fal.ai can handle base64, kie/piapi may not)
    console.log('⚠️ fal storage upload failed, using data URI fallback');
    return { imageUrl: `data:${mimeType};base64,${imageBase64}` };
}

/**
 * Upload base64 image to fal.ai storage
 * Returns HTTP URL or null on failure
 */
async function uploadToFalStorage(base64Data, mimeType) {
    // This helper now uses the central ensureS3Url utility
    const dataUri = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;
    return await ensureS3Url(dataUri, 'video-studio/first-frames');
}

