/**
 * First Frame Generator — Generates a reference image for video consistency
 * 
 * Uses Gemini's image generation to create a first-frame image based on the
 * first shot description. The image is then uploaded to fal.ai storage to
 * get an HTTP URL that video generation APIs can use.
 */

const GEMINI_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-2.0-flash-exp-image-generation'];

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
            console.log(`🖼️ Trying Gemini model: ${modelId}`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${imageKey}`;
            const resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature },
                }),
            });
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
            console.error(`❌ Model ${modelId} error:`, e.message);
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
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
        console.warn('⚠️ FAL_KEY not set — cannot upload first frame to fal storage');
        return null;
    }

    // Method 1: Initiate upload flow
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const ext = mimeType.includes('png') ? 'png' : 'jpg';
        const filename = `first-frame-${Date.now()}.${ext}`;

        console.log(`📤 Trying fal.ai upload (${buffer.length} bytes, ${filename})...`);

        const response = await fetch('https://fal.ai/api/storage/upload/initiate', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                file_name: filename,
                content_type: mimeType,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`📤 fal upload initiate response:`, JSON.stringify(data).substring(0, 300));
            if (data.upload_url) {
                const uploadResp = await fetch(data.upload_url, {
                    method: 'PUT',
                    headers: { 'Content-Type': mimeType },
                    body: buffer,
                });
                if (uploadResp.ok && data.file_url) {
                    return data.file_url;
                }
                console.warn(`⚠️ fal upload PUT failed: ${uploadResp.status}`);
            }
        } else {
            const errText = await response.text();
            console.warn(`⚠️ fal upload initiate failed (${response.status}):`, errText.substring(0, 200));
        }
    } catch (e) {
        console.warn('fal storage upload error:', e.message);
    }

    // Method 2: Try base64 upload via REST API
    try {
        console.log('📤 Trying fal.ai base64 upload...');
        const response = await fetch('https://rest.alpha.fal.ai/storage/upload/base64', {
            method: 'POST',
            headers: {
                'Authorization': `Key ${falKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                data: base64Data,
                content_type: mimeType,
                file_name: `first-frame-${Date.now()}.png`,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log(`📤 fal base64 upload response:`, JSON.stringify(data).substring(0, 300));
            return data.url || data.file_url || null;
        } else {
            const errText = await response.text();
            console.warn(`⚠️ fal base64 upload failed (${response.status}):`, errText.substring(0, 200));
        }
    } catch (e) {
        console.warn('fal base64 upload error:', e.message);
    }

    return null;
}
