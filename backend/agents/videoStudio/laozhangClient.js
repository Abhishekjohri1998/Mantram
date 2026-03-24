/**
 * Lao Zhang API Client — Unified AI Gateway
 * 
 * CONFIRMED via live testing (March 2026):
 *   Video: Uses /v1/chat/completions — returns video URL in markdown format
 *   Image: Uses /v1/images/generations — returns b64_json
 *   Models endpoint: /v1/models (432 models available)
 * 
 * Available VIDEO models (confirmed from /v1/models):
 *   - sora_video2, sora_video2-15s, sora_video2-landscape, sora_video2-landscape-15s
 *   - sora-2, sora-2-character, sora2_video
 *   - veo-3.1, veo-3.1-fast, veo-3.1-4k, veo-3.1-relaxed (38 total variants)
 *   - seedance-2.0, seedance-2, seedance-2-pro (HIDDEN — not in /v1/models, needs billing channel)
 *     ⚠️ Requires billing channel activation: configure via Lao Zhang dashboard
 * 
 * Available IMAGE models (confirmed):
 *   - gemini-3.1-flash-image-preview (NanoBanana 2) ✅ tested
 *   - gemini-3-pro-image-preview
 *   - gpt-image-1, gpt-image-1-mini, gpt-image-1.5
 *   - gpt-4o-image, gpt-4o-image-vip
 *   - grok-3-image, dall-e-3
 *   - seedream-5-0-260128 (ByteDance image gen)
 *   - flux-kontext-pro, flux-kontext-max
 * 
 * API Base: https://api.laozhang.ai/v1
 */

const LAOZHANG_BASE_URL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';

function getApiKey() {
    const key = process.env.LAOZHANG_API_KEY;
    if (!key) throw new Error('LAOZHANG_API_KEY not configured. Add it to .env');
    return key;
}

/**
 * Check if Lao Zhang is available/configured
 */
export function isLaozhangAvailable() {
    return !!(process.env.LAOZHANG_API_KEY && process.env.LAOZHANG_BASE_URL);
}

// ══════════════════════════════════════════════════════════════════════════════
// VIDEO GENERATION — via /v1/chat/completions (synchronous, returns URL)
// 
// Key discovery: Lao Zhang video uses the chat completions endpoint.
// The model determines video generation. Response contains a markdown
// download link: [download file](https://...mp4)
// ══════════════════════════════════════════════════════════════════════════════

// Model mapping: our internal IDs → Lao Zhang model IDs
const LZ_VIDEO_MODELS = {
    // Seedance (ByteDance) — HIDDEN models, need billing channel activation
    'seedance-2.0':   'seedance-2.0',          // Seedance 2.0 Pro (primary target)
    'seedance-2':     'seedance-2',             // Alias
    'seedance-2-pro': 'seedance-2-pro',         // Pro variant
    // Sora 2 variants (confirmed working)
    'sora-2':         'sora_video2',           // 10s portrait ~$0.15
    'sora-2-15s':     'sora_video2-15s',       // 15s portrait ~$0.15
    'sora-2-land':    'sora_video2-landscape',  // 10s landscape
    'sora-2-land-15': 'sora_video2-landscape-15s', // 15s landscape
    'sora-2-pro':     'sora-2',                // Pro quality
    // Veo 3.1 variants
    'veo-3.1':        'veo-3.1',               // Standard
    'veo-3.1-fast':   'veo-3.1-fast',          // Faster, cheaper
    'veo-3.1-4k':     'veo-3.1-4k',           // 4K resolution
    'veo-3.1-relaxed': 'veo-3.1-relaxed',      // Cheapest, queue-based
};

/**
 * Submit video generation to Lao Zhang API
 * Uses /v1/chat/completions — video models return download URLs in content
 * 
 * @returns {{ videoUrl: string, provider: 'laozhang', model: string }}
 */
export async function submitLaozhangVideoGeneration({
    model = 'sora-2',
    prompt,
    imageUrl,
    duration = 5,
    aspectRatio = '16:9',
    generateAudio = true,
}) {
    const apiKey = getApiKey();
    const lzModel = LZ_VIDEO_MODELS[model] || model;

    // Build user message — include image as URL if provided
    let userContent = prompt;
    if (imageUrl && imageUrl.startsWith('http')) {
        userContent = `Use this image as the first frame: ${imageUrl}\n\n${prompt}`;
    }

    console.log(`🎬 [LaoZhang] Video generation via chat/completions: ${lzModel}`);
    console.log(`   📝 prompt: ${prompt?.substring(0, 120)}...`);

    const response = await fetch(`${LAOZHANG_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: lzModel,
            messages: [
                { role: 'user', content: userContent },
            ],
        }),
        signal: AbortSignal.timeout(180000), // Video gen can take 2-3 mins
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Video generation failed (${response.status}):`, errText);
        // Parse error for quota check
        try {
            const errData = JSON.parse(errText);
            if (errData.error?.code === 'insufficient_user_quota') {
                throw new Error(`LaoZhang quota insufficient — need more credits. ${errData.error.message}`);
            }
        } catch (parseErr) { /* ignore parse errors */ }
        throw new Error(`LaoZhang video failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract video URL from markdown: [download file](https://...mp4)
    const urlMatch = content.match(/\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    const videoUrl = urlMatch ? urlMatch[1] : '';

    if (!videoUrl) {
        console.error(`❌ [LaoZhang] No video URL found in response:`, content.substring(0, 500));
        throw new Error('LaoZhang returned response but no video URL found');
    }

    console.log(`✅ [LaoZhang] Video generated: ${videoUrl.substring(0, 80)}...`);
    console.log(`   📊 Tokens used: ${data.usage?.total_tokens || 'unknown'}`);

    return {
        videoUrl,
        provider: 'laozhang',
        model: lzModel,
        tokensUsed: data.usage,
    };
}

/**
 * Poll Lao Zhang video generation status
 * NOTE: Lao Zhang video gen is SYNCHRONOUS via chat/completions.
 * This function is kept for compatibility but should rarely be called.
 * The video URL is returned directly from submitLaozhangVideoGeneration.
 */
export async function getLaozhangVideoStatus(requestId) {
    // Lao Zhang video is synchronous — if we have a requestId, 
    // the video should already be complete (URL stored in generation.videoUrl)
    return {
        status: 'COMPLETED',
        progress: 100,
        videoUrl: '', // URL was already extracted during submission
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// IMAGE GENERATION — via /v1/images/generations (OpenAI compatible)
// Confirmed: returns b64_json format
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Generate an image via Lao Zhang
 * Confirmed models: gemini-3.1-flash-image-preview, gpt-image-1, seedream-5-0-260128
 * 
 * @returns {{ imageUrl: string, model: string, provider: string }}
 */
export async function laozhangImageGenerate(prompt, { model = 'gemini-3.1-flash-image-preview', size = '1024x1024' } = {}) {
    const apiKey = getApiKey();

    console.log(`🖼️  [LaoZhang] Image generation: ${model}, size=${size}`);
    console.log(`   📝 prompt (first 200): ${prompt?.substring(0, 200)}...`);

    const response = await fetch(`${LAOZHANG_BASE_URL}/images/generations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            prompt,
            n: 1,
            size,
        }),
        signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
        const errText = await response.text();
        console.error(`❌ [LaoZhang] Image failed (${response.status}):`, errText);
        throw new Error(`LaoZhang image failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const imgData = data.data?.[0];
    const imageUrl = imgData?.url || '';
    const b64 = imgData?.b64_json || '';

    if (!imageUrl && !b64) {
        throw new Error('LaoZhang returned empty image response');
    }

    // b64_json is returned (confirmed via testing) — convert to data URI
    const finalUrl = imageUrl || `data:image/png;base64,${b64}`;

    console.log(`✅ [LaoZhang] Image generated via ${model} (${imageUrl ? 'URL' : 'base64'})`);

    return {
        imageUrl: finalUrl,
        model,
        provider: 'laozhang',
    };
}

export default {
    isLaozhangAvailable,
    submitLaozhangVideoGeneration,
    getLaozhangVideoStatus,
    laozhangImageGenerate,
};
