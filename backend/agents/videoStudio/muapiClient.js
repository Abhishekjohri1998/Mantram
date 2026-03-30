/**
 * MuAPI Client — Seedance 2.0 Video Generation
 * 
 * Provider: https://api.muapi.ai
 * Auth: x-api-key header
 * Pattern: POST submit → GET poll (async)
 * 
 * Endpoints:
 *   T2V: POST /seedance-v2.0-t2v
 *   I2V: POST /seedance-v2.0-i2v
 *   Poll: GET /predictions/{request_id}/result
 * 
 * Supports: text-to-video, image-to-video, character references
 * Quality: "basic" (fast), "high" (quality)
 * Durations: 5, 10, 15 seconds
 * Aspect Ratios: "16:9", "9:16", "1:1"
 */

const MUAPI_BASE_URL = 'https://api.muapi.ai/api/v1';

function getMuApiKey() {
    const key = process.env.MUAPI_API_KEY;
    if (!key) throw new Error('MUAPI_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Map our internal quality modes to MuAPI's quality param
 */
function mapQuality(mode) {
    if (mode === 'quality' || mode === 'high') return 'high';
    return 'basic'; // 'fast' or default
}

/**
 * Map our internal aspect ratio to MuAPI format
 * MuAPI accepts: "16:9", "9:16", "1:1"
 */
function mapAspectRatio(ratio) {
    const supported = ['16:9', '9:16', '1:1'];
    if (supported.includes(ratio)) return ratio;
    // Map close equivalents
    if (ratio === '4:3' || ratio === '3:4' || ratio === '21:9') return '16:9';
    return '16:9'; // default
}

/**
 * Map MuAPI duration to nearest supported value (5, 10, 15)
 */
function mapDuration(duration) {
    const d = parseInt(duration) || 5;
    if (d <= 5) return 5;
    if (d <= 10) return 10;
    return 15;
}

/**
 * Make a fetch request to MuAPI with retry logic
 */
async function muapiFetch(path, options = {}, retries = 3) {
    const apiKey = getMuApiKey();
    const url = `${MUAPI_BASE_URL}${path}`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    ...(options.headers || {}),
                },
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => '');
                let errorData;
                try { errorData = JSON.parse(errorText); } catch { errorData = { detail: errorText }; }
                
                // Don't retry on 4xx (client errors — bad params, auth, etc.)
                if (response.status >= 400 && response.status < 500) {
                    throw new Error(`MuAPI ${response.status}: ${errorData?.detail || errorData?.error || errorText.substring(0, 200)}`);
                }
                
                // Retry on 5xx
                if (attempt < retries) {
                    const backoff = attempt * 2000;
                    console.warn(`⚠️ MuAPI ${response.status} (attempt ${attempt}/${retries}), retrying in ${backoff}ms...`);
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }
                throw new Error(`MuAPI ${response.status} after ${retries} attempts: ${errorData?.detail || errorText.substring(0, 200)}`);
            }

            return await response.json();
        } catch (err) {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                if (attempt < retries) {
                    console.warn(`⚠️ MuAPI timeout (attempt ${attempt}/${retries}), retrying...`);
                    await new Promise(r => setTimeout(r, attempt * 2000));
                    continue;
                }
                throw new Error('MuAPI request timed out after 30s');
            }
            // Propagate known errors
            if (err.message.startsWith('MuAPI')) throw err;
            // Network errors — retry
            if (attempt < retries) {
                console.warn(`⚠️ MuAPI network error (attempt ${attempt}/${retries}): ${err.message}`);
                await new Promise(r => setTimeout(r, attempt * 2000));
                continue;
            }
            throw err;
        }
    }
}

/**
 * Submit Seedance 2.0 video generation (T2V or I2V)
 * 
 * @param {Object} params
 * @param {string} params.prompt — Text prompt
 * @param {string} [params.imageUrl] — Source image for I2V (if provided, uses I2V endpoint)
 * @param {number} [params.duration=5] — Duration in seconds (5, 10, 15)
 * @param {string} [params.aspectRatio='16:9'] — Aspect ratio
 * @param {string} [params.qualityMode='fast'] — Quality mode: 'fast' or 'quality'
 * @param {boolean} [params.generateAudio=true] — Whether to generate audio
 * @param {string[]} [params.referenceImages=[]] — Reference image URLs for character mode
 * @returns {{ taskId: string, provider: string, _muApiPayload: Object }}
 */
export async function submitMuApiVideoGeneration({
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    qualityMode = 'fast',
    generateAudio = true,
    referenceImages = [],
}) {
    if (!prompt?.trim()) throw new Error('Prompt is required for MuAPI Seedance 2.0');

    const isI2V = !!imageUrl;
    const endpoint = isI2V ? '/seedance-v2.0-i2v' : '/seedance-v2.0-t2v';

    // Build payload
    const payload = {
        prompt: prompt.trim(),
        duration: mapDuration(duration),
        aspect_ratio: mapAspectRatio(aspectRatio),
        quality: mapQuality(qualityMode),
        remove_watermark: true,
    };

    // I2V: add images_list
    if (isI2V) {
        const imagesList = [imageUrl];
        // Add reference images if provided (MuAPI supports up to 9 images)
        if (referenceImages?.length > 0) {
            imagesList.push(...referenceImages.slice(0, 8)); // Max 9 total
        }
        payload.images_list = imagesList;
    } else if (referenceImages?.length > 0) {
        // T2V with character references — use character endpoint
        // Note: For now, keep using T2V endpoint with references in prompt
        // MuAPI character endpoint can be added later if needed
    }

    console.log(`🎬 [MuAPI] Submitting ${isI2V ? 'I2V' : 'T2V'} to ${endpoint}`);
    console.log(`   Payload: prompt="${prompt.substring(0, 80)}...", duration=${payload.duration}, ratio=${payload.aspect_ratio}, quality=${payload.quality}`);

    const data = await muapiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    if (!data?.id) {
        throw new Error(`MuAPI did not return a request ID. Response: ${JSON.stringify(data).substring(0, 200)}`);
    }

    console.log(`✅ [MuAPI] Task submitted: ${data.id} (status: ${data.status})`);

    return {
        taskId: data.id,
        provider: 'muapi',
        _muApiPayload: payload, // Store for auto-retry
    };
}

/**
 * Poll MuAPI generation status
 * 
 * @param {string} requestId — The MuAPI request/prediction ID
 * @returns {{ status: string, progress: number, videoUrl?: string, error?: string, retryable?: boolean }}
 */
export async function getMuApiGenerationStatus(requestId) {
    if (!requestId) return { status: 'FAILED', progress: 0, error: 'No request ID' };

    try {
        const data = await muapiFetch(`/predictions/${requestId}/result`, {
            method: 'GET',
        }, 2); // Only 2 retries for polling

        // Map MuAPI statuses to our standard format
        const muapiStatus = (data.status || '').toLowerCase();
        
        if (muapiStatus === 'completed' || muapiStatus === 'succeeded') {
            // Extract video URL from outputs array
            const videoUrl = data.outputs?.[0]?.url 
                || data.outputs?.[0] 
                || data.output?.url 
                || data.output
                || '';

            if (!videoUrl) {
                console.warn(`⚠️ [MuAPI] Task ${requestId} completed but no video URL found in outputs:`, JSON.stringify(data.outputs || data.output).substring(0, 200));
                return {
                    status: 'FAILED',
                    progress: 100,
                    error: 'Generation completed but no video URL returned',
                    retryable: true,
                };
            }

            console.log(`✅ [MuAPI] Task ${requestId} completed. Video: ${videoUrl.substring(0, 80)}...`);
            return {
                status: 'COMPLETED',
                progress: 100,
                videoUrl,
                provider: 'muapi',
            };
        }

        if (muapiStatus === 'failed' || muapiStatus === 'error' || muapiStatus === 'canceled') {
            const errorMsg = data.error || data.detail || 'MuAPI generation failed';
            console.error(`❌ [MuAPI] Task ${requestId} failed: ${errorMsg}`);
            return {
                status: 'FAILED',
                progress: 0,
                error: errorMsg,
                retryable: muapiStatus !== 'canceled',
                provider: 'muapi',
                isProviderError: true,
            };
        }

        // Still processing
        const inferenceTime = data.timings?.inference || 0;
        // Estimate progress based on typical generation time (~120s for 5s video)
        const estimatedTotalTime = 120;
        const estimatedProgress = Math.min(90, Math.round((inferenceTime / estimatedTotalTime) * 100));

        return {
            status: 'IN_PROGRESS',
            progress: Math.max(estimatedProgress, 10), // At least 10% if we got a response
            provider: 'muapi',
        };

    } catch (err) {
        console.error(`❌ [MuAPI] Polling error for ${requestId}: ${err.message}`);
        // Don't report as FAILED on network errors — keep polling
        return {
            status: 'IN_PROGRESS',
            progress: 15,
            error: '',
            provider: 'muapi',
        };
    }
}

/**
 * Resubmit a failed MuAPI task (for auto-retry)
 * 
 * @param {Object} payload — Original submission payload (stored as _muApiPayload)
 * @returns {{ taskId: string, provider: string }}
 */
export async function resubmitMuApiTask(payload) {
    if (!payload) throw new Error('No payload provided for resubmission');

    const isI2V = !!payload.images_list?.length;
    const endpoint = isI2V ? '/seedance-v2.0-i2v' : '/seedance-v2.0-t2v';

    console.log(`🔄 [MuAPI] Resubmitting ${isI2V ? 'I2V' : 'T2V'} task...`);

    const data = await muapiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    if (!data?.id) {
        throw new Error(`MuAPI resubmit failed — no request ID returned`);
    }

    console.log(`✅ [MuAPI] Resubmitted: ${data.id}`);

    return {
        taskId: data.id,
        provider: 'muapi',
    };
}

/**
 * Check if MuAPI is available (key configured)
 */
export function isMuApiAvailable() {
    return !!process.env.MUAPI_API_KEY;
}
