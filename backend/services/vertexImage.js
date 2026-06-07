/**
 * Vertex AI Image Generation Helper — Direct REST API
 * 
 * Uses direct REST calls to the Vertex AI endpoint instead of the deprecated
 * @google-cloud/vertexai SDK, which silently drops imageConfig parameters
 * (aspectRatio, imageSize) causing images to be cropped to 1:1 default.
 * 
 * Authentication: Uses GOOGLE_APPLICATION_CREDENTIALS service account JSON.
 */
import { GoogleAuth } from 'google-auth-library';

const project  = process.env.GCP_PROJECT_ID || 'mantram-vertex';
const location = process.env.GCP_LOCATION  || 'us-central1';

// Reusable auth client — scoped to Vertex AI
const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

/**
 * Generate images via Vertex AI REST API with full imageConfig support.
 *
 * @param {Array}  parts                     – Content parts (text + inlineData)
 * @param {string} [modelId]                 – Model name, e.g. 'gemini-3.1-flash-image-preview'
 * @param {number} [temperature=0.4]         – Generation temperature
 * @param {object} [imageConfig={}]          – Image configuration
 * @param {string} [imageConfig.aspectRatio] – '1:1','16:9','9:16','4:3','3:4','3:2','2:3'
 * @param {string} [imageConfig.imageSize]   – '1K','2K','4K'
 * @returns {Promise<object>} Raw API response (candidates array)
 */
export async function generateImageWithVertex(
    parts,
    modelId = 'gemini-3.1-flash-image-preview',
    temperature = 0.4,
    imageConfig = {}
) {
    // ── Build generationConfig with imageConfig for proper aspect ratio ──
    const generationConfig = {
        temperature,
        responseModalities: ['TEXT', 'IMAGE'],
    };

    // Attach imageConfig for aspect ratio & resolution control
    const hasAR   = imageConfig.aspectRatio && imageConfig.aspectRatio !== '1:1';
    const hasSize = !!imageConfig.imageSize;
    if (hasAR || hasSize) {
        generationConfig.imageConfig = {};
        if (hasAR)   generationConfig.imageConfig.aspectRatio = imageConfig.aspectRatio;
        if (hasSize) generationConfig.imageConfig.imageSize   = imageConfig.imageSize;
        console.log(`📐 [Vertex AI] imageConfig: AR=${imageConfig.aspectRatio || 'default'}, size=${imageConfig.imageSize || 'default'}`);
    }

    // ── Build request body ──
    const body = {
        contents: [{ role: 'user', parts }],
        generationConfig,
    };

    // ── Get access token from service account ──
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;

    // ── Model Mapping (Handle non-existent 3.1 model) ──
    let mappedModelId = modelId;
    if (modelId === 'gemini-3.1-flash-image-preview') {
        const hasReferenceImages = parts.some(p => p.inlineData);
        mappedModelId = hasReferenceImages ? 'gemini-2.5-flash' : 'imagen-3.0-generate-002';
    }

    // gemini-2.5-flash does not support imageSize token
    if (mappedModelId === 'gemini-2.5-flash' && generationConfig.imageConfig?.imageSize) {
        delete generationConfig.imageConfig.imageSize;
    }

    // ── Direct REST call to Vertex AI ──
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${mappedModelId}:generateContent`;

    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000), // 2 min timeout for image gen
    });

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        const errMsg = `Vertex AI ${modelId} error (${resp.status}): ${errText.substring(0, 300)}`;
        console.error(`❌ ${errMsg}`);
        throw new Error(errMsg);
    }

    const data = await resp.json();

    if (data.error) {
        throw new Error(`Vertex AI error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    return data;
}
