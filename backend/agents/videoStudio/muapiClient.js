/**
 * MuAPI Client — Seedance 2.0 Video Generation
 * 
 * Provider: https://api.muapi.ai
 * Auth: x-api-key header
 * Pattern: POST submit → GET poll (async)
 */

const MUAPI_BASE_URL = 'https://api.muapi.ai/api/v1';

function getMuApiKey() {
    const key = process.env.MUAPI_API_KEY;
    if (!key) throw new Error('MUAPI_API_KEY not configured. Add it to .env');
    return key;
}

function mapQuality(mode) {
    if (mode === 'quality' || mode === 'high') return 'high';
    return 'basic'; 
}

function mapAspectRatio(ratio) {
    const supported = ['16:9', '9:16', '1:1'];
    if (supported.includes(ratio)) return ratio;
    return '16:9'; 
}

function mapDuration(duration) {
    const d = parseInt(duration) || 5;
    if (d <= 5) return 5;
    if (d <= 10) return 10;
    return 15;
}

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
                const errMsg = errorData?.detail || errorData?.error || errorText.substring(0, 200);
                
                // Don't retry on 4xx (client errors — bad params, auth, etc.)
                if (response.status >= 400 && response.status < 500) {
                    // Check for insufficient credits/quota
                    if (response.status === 402 || 
                        errMsg.toLowerCase().includes('insufficient') || 
                        errMsg.toLowerCase().includes('quota') || 
                        errMsg.toLowerCase().includes('balance') ||
                        errMsg.toLowerCase().includes('credits')) {
                        throw new Error(`MuAPI_INSUFFICIENT_CREDITS: ${errMsg}`);
                    }
                    throw new Error(`MuAPI ${response.status}: ${errMsg}`);
                }
                
                // Retry on 5xx
                if (attempt < retries) {
                    const backoff = attempt * 2000;
                    console.warn(`⚠️ MuAPI ${response.status} (attempt ${attempt}/${retries}), retrying in ${backoff}ms...`);
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }
                throw new Error(`MuAPI ${response.status} after ${retries} attempts: ${errMsg}`);
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
            if (err.message.startsWith('MuAPI')) throw err;
            if (attempt < retries) {
                console.warn(`⚠️ MuAPI network error (attempt ${attempt}/${retries}): ${err.message}`);
                await new Promise(r => setTimeout(r, attempt * 2000));
                continue;
            }
            throw err;
        }
    }
}

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

    const payload = {
        prompt: prompt.trim(),
        duration: mapDuration(duration),
        aspect_ratio: mapAspectRatio(aspectRatio),
        quality: mapQuality(qualityMode),
        remove_watermark: true,
    };

    if (isI2V) {
        const imagesList = [imageUrl];
        if (referenceImages?.length > 0) {
            imagesList.push(...referenceImages.slice(0, 8));
        }
        payload.images_list = imagesList;
    }

    console.log(`🎬 [MuAPI] Submitting ${isI2V ? 'I2V' : 'T2V'} to ${endpoint}`);

    const data = await muapiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const taskId = data?.request_id || data?.id;
    if (!taskId) {
        throw new Error(`MuAPI did not return a request ID. Response: ${JSON.stringify(data).substring(0, 200)}`);
    }

    console.log(`✅ [MuAPI] Task submitted: ${taskId}`);

    return {
        taskId,
        provider: 'muapi',
        _muApiPayload: payload,
    };
}

export async function getMuApiGenerationStatus(requestId) {
    if (!requestId) return { status: 'FAILED', progress: 0, error: 'No request ID' };

    try {
        const data = await muapiFetch(`/predictions/${requestId}/result`, {
            method: 'GET',
        }, 2);

        const muapiStatus = (data.status || '').toLowerCase();
        
        if (muapiStatus === 'completed' || muapiStatus === 'succeeded') {
            const videoUrl = data.outputs?.[0]?.url 
                || data.outputs?.[0] 
                || data.output?.url 
                || data.output
                || '';

            if (!videoUrl) {
                return {
                    status: 'FAILED',
                    progress: 100,
                    error: 'Generation completed but no video URL returned',
                    retryable: true,
                };
            }

            return {
                status: 'COMPLETED',
                progress: 100,
                videoUrl,
                provider: 'muapi',
            };
        }

        if (muapiStatus === 'failed' || muapiStatus === 'error' || muapiStatus === 'canceled') {
            const errorMsg = data.error || data.detail || 'MuAPI generation failed';
            return {
                status: 'FAILED',
                progress: 0,
                error: errorMsg,
                retryable: muapiStatus !== 'canceled',
                provider: 'muapi',
                isProviderError: true,
            };
        }

        return {
            status: 'IN_PROGRESS',
            progress: 30,
            provider: 'muapi',
        };

    } catch (err) {
        return {
            status: 'IN_PROGRESS',
            progress: 15,
            error: '',
            provider: 'muapi',
        };
    }
}

export async function resubmitMuApiTask(payload) {
    if (!payload) throw new Error('No payload provided for resubmission');
    const isI2V = !!payload.images_list?.length;
    const endpoint = isI2V ? '/seedance-v2.0-i2v' : '/seedance-v2.0-t2v';

    const data = await muapiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    const taskId = data?.request_id || data?.id;
    if (!taskId) throw new Error(`MuAPI resubmit failed`);

    return {
        taskId,
        provider: 'muapi',
    };
}

export function isMuApiAvailable() {
    return !!process.env.MUAPI_API_KEY;
}
