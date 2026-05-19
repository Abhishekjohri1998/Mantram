/**
 * Avatar Studio Backend Route — Mantram AI
 *
 * POST /api/avatar-studio/generate        — User: 3-variant parallel, credit-gated
 * POST /api/avatar-studio/admin/generate  — SuperAdmin: free, model selector, any ratio, directPrompt
 *
 * Image generation strategy (fast, no brand DNA):
 *   1. Direct call to LaoZhang /v1/images/generations
 *   2. All output → S3 via mirrorUrlToS3 (URL) or uploadToS3 (base64)
 *   3. No laozhangImageGenerate wrapper — direct fetch like the working UGC-pro pipeline
 */

import { Router } from 'express';
import { protect, superadmin } from '../middleware/auth.js';
import { requireCredits } from '../middleware/credits.js';
import { buildAvatarPrompt, buildDirectPrompt, buildReferencePrompt, RATIO_TO_SIZE } from '../agents/avatarStudio/avatarPromptBuilder.js';
export { RATIO_TO_SIZE }; // re-export for superadmin-images.js
import { mirrorUrlToS3, uploadToS3 } from '../utils/s3.js';
import Avatar from '../models/Avatar.js';

const router = Router();

// ─── LaoZhang base config ─────────────────────────────────────────────────────
const LZ_BASE = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';
function getLZKey() {
    const k = process.env.LAOZHANG_API_KEY;
    if (!k) throw new Error('LAOZHANG_API_KEY not configured');
    return k;
}

// ─── Available image models (selectable by admin) ─────────────────────────────
// LZ models use /images/generations; nanobanana-2 uses Gemini REST directly
export const AVATAR_MODELS = {
    'gpt-image-2': {
        label: 'GPT Image 2',
        badge: 'Best',
        apiModel: 'gpt-image-2',
        provider: 'lz',
        defaultSize: '1024x1792',
        responseFormat: 'url',
    },
    'gpt-image-1': {
        label: 'GPT Image 1',
        badge: 'Fast',
        apiModel: 'gpt-image-1',
        provider: 'lz',
        defaultSize: '1024x1792',
        responseFormat: 'url',
    },
    'nanobanana-2': {
        label: 'NanoBanana 2',
        badge: 'Gemini',
        apiModel: 'gemini-3.1-flash-image-preview',
        provider: 'gemini',          // ← uses Gemini REST, not LZ
        defaultSize: '9:16',         // passed as aspectRatio hint in prompt
        responseFormat: 'base64',
    },
    'dall-e-3': {
        label: 'DALL·E 3',
        badge: 'Creative',
        apiModel: 'dall-e-3',
        provider: 'lz',
        defaultSize: '1024x1792',
        responseFormat: 'url',
    },
    'flux-pro': {
        label: 'Flux Pro',
        badge: 'Detailed',
        apiModel: 'flux-pro',
        provider: 'lz',
        defaultSize: '576x1024',
        responseFormat: 'url',
    },
};

const DEFAULT_MODEL = 'gpt-image-2';

/**
 * Generate one image variant.
 * Routes to Gemini REST (NanoBanana 2) or LaoZhang /images/generations.
 * Optionally accepts refUrls[] for multimodal (reference image) generation.
 * Always returns an S3 URL — never base64, never temporary provider URL.
 *
 * Step 10 rule: LZ client (laozhangImageGenerate / laozhangMultimodalImageGenerate)
 * calls ensureS3Url internally. Do NOT call ensureS3Url on their return values.
 *
 * @returns {{ slot, url, failed, error? }}
 */
async function generateOneVariant(slot, prompt, size, modelKey = DEFAULT_MODEL, refUrls = []) {
    try {
        const cfg = AVATAR_MODELS[modelKey] || AVATAR_MODELS[DEFAULT_MODEL];
        const hasRefs = refUrls && refUrls.length > 0;

        // ── Reference / Multimodal path ──────────────────────────────────────
        if (hasRefs) {
            // Import from LZ client — multimodal handles S3 mirroring internally
            const { laozhangMultimodalImageGenerate } = await import('../agents/videoStudio/laozhangClient.js');
            const refs = refUrls.slice(0, 2);
            console.log(`🎭 [AvatarStudio] Variant ${slot} | multimodal | ${refs.length} refs | model=${cfg.apiModel} | size=${size}`);
            const result = await laozhangMultimodalImageGenerate(prompt, refs, { model: cfg.apiModel, size });
            // Step 10: result.imageUrl is ALREADY an S3 URL — do not call ensureS3Url again
            return { slot, url: result.imageUrl, failed: false };
        }


        if (cfg.provider === 'gemini') {
            const imageKey = process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY;
            if (!imageKey) throw new Error('GEMINI_API_KEY not configured');

            const geminiModel = cfg.apiModel;
            // Embed aspect ratio hint in prompt (Gemini reads it from text)
            const arHint = size ? `\n\n[Generate in ${size} aspect ratio — portrait/vertical orientation.]` : '';
            const geminiPrompt = prompt + arHint;

            console.log(`🎭 [AvatarStudio] Variant ${slot} | NanoBanana 2 (${geminiModel})`);

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${imageKey}`;
            const gemResp = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: geminiPrompt }] }],
                    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], temperature: 0.4 },
                }),
                signal: AbortSignal.timeout(90_000),
            });

            const gemData = await gemResp.json();
            if (gemData.error) throw new Error(`Gemini: ${gemData.error.message || JSON.stringify(gemData.error)}`);

            const parts = gemData.candidates?.[0]?.content?.parts || [];
            let b64 = null, mimeType = 'image/png';
            for (const part of parts) {
                if (part.inlineData?.mimeType?.startsWith('image/')) {
                    b64 = part.inlineData.data;
                    mimeType = part.inlineData.mimeType;
                    break;
                }
            }
            if (!b64) throw new Error('NanoBanana 2 returned no image in response');

            const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
            const finalUrl = await uploadToS3(
                Buffer.from(b64, 'base64'),
                `avatar-studio/nb2-variant-${slot}-${Date.now()}.${ext}`,
                mimeType
            );
            console.log(`✅ [AvatarStudio] Variant ${slot} NanoBanana 2 → S3: ${finalUrl.substring(0, 80)}`);
            return { slot, url: finalUrl, failed: false };
        }

        // ── Branch: LaoZhang /images/generations ────────────────────────────
        const apiKey = getLZKey();
        const finalSize = size || cfg.defaultSize;
        console.log(`🎭 [AvatarStudio] Variant ${slot} | model=${cfg.apiModel} | size=${finalSize}`);

        const body = {
            model: cfg.apiModel,
            prompt,
            n: 1,
            size: finalSize,
            response_format: cfg.responseFormat || 'url',
        };
        if (modelKey === 'gpt-image-2') {
            body.quality = 'high';
            body.output_format = 'webp';
        }

        const resp = await fetch(`${LZ_BASE}/images/generations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(90_000),
        });

        if (!resp.ok) {
            const errText = await resp.text();
            console.error(`❌ [AvatarStudio] Variant ${slot} HTTP ${resp.status}:`, errText.substring(0, 300));
            throw new Error(`Image API error (${resp.status}): ${errText.substring(0, 150)}`);
        }

        const data = await resp.json();
        const imgData = data.data?.[0];
        if (!imgData) throw new Error('Empty response from image API');

        let finalUrl;
        if (imgData.url && imgData.url.startsWith('http')) {
            finalUrl = await mirrorUrlToS3(imgData.url, `avatar-studio/variant-${slot}-${Date.now()}.webp`);
            if (!finalUrl) throw new Error('S3 mirror failed');
        } else if (imgData.b64_json) {
            // Strip data URI prefix if LZ wraps it
            let raw = imgData.b64_json;
            if (raw.startsWith('data:')) raw = raw.substring(raw.indexOf(',') + 1);
            finalUrl = await uploadToS3(
                Buffer.from(raw, 'base64'),
                `avatar-studio/variant-${slot}-${Date.now()}.webp`,
                'image/webp'
            );
        } else {
            throw new Error('No url or b64_json in image API response');
        }

        console.log(`✅ [AvatarStudio] Variant ${slot} → S3: ${finalUrl.substring(0, 80)}`);
        return { slot, url: finalUrl, failed: false };

    } catch (err) {
        console.error(`❌ [AvatarStudio] Variant ${slot} failed:`, err.message?.substring(0, 200));
        return { slot, url: null, failed: true, error: err.message?.substring(0, 150) };
    }
}

// Map genderExpression values → Avatar schema enum (male|female|unspecified)
function mapGenderEnum(genderExpression) {
    if (!genderExpression) return 'unspecified';
    const g = genderExpression.toLowerCase();
    if (g === 'masculine' || g === 'male') return 'male';
    if (g === 'feminine' || g === 'female') return 'female';
    return 'unspecified';
}

/**
 * Auto-save successful variants to Avatar collection (fire-and-forget).
 * Uses correct schema field: generatedFromPrompt (not generationPrompt).
 */
function autoSaveAvatar(url, options, userId) {
    const name = `AI Avatar — ${options.origin || 'Custom'} ${options.clothingStyle || ''} ${new Date().toLocaleDateString()}`.trim();
    Avatar.create({
        name,
        imageUrl: url,
        gender: mapGenderEnum(options.genderExpression),
        isTemplate: false,
        isActive: true,
        source: 'generated',
        generatedFromPrompt: options._prompt || '',
        createdBy: userId,
    }).catch(err => console.warn('[AvatarStudio] Auto-save failed:', err.message));
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/avatar-studio/models
// Returns available models list for the frontend model selector
// ══════════════════════════════════════════════════════════════════════════════
router.get('/models', protect, (req, res) => {
    const models = Object.entries(AVATAR_MODELS).map(([key, cfg]) => ({
        key,
        label: cfg.label,
        badge: cfg.badge,
        isDefault: key === DEFAULT_MODEL,
    }));
    res.json({ success: true, models, default: DEFAULT_MODEL });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/avatar-studio/generate
// User-facing: 3 modes — structured | directPrompt | reference
// Step 11/12: routes to correct prompt builder and pipeline per mode
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate', protect, requireCredits('avatarGenerate'), async (req, res) => {
    try {
        const {
            mode = 'structured', // 'structured' | 'directPrompt' | 'reference'
            // Structured fields
            origin, ageRange, genderExpression, clothingStyle,
            environment, lightingMood, additionalDetails,
            // Direct prompt
            directPrompt,
            // Reference mode
            referenceImageUrls = [],  // S3 URLs, max 2
            referenceDescription,     // optional instruction for reference mode
        } = req.body;

        let finalPrompt;
        let useMultimodal = false;
        let refUrls = [];

        if (mode === 'reference') {
            // Step 12: reference mode — multimodal pipeline with reference image
            const validRefs = (Array.isArray(referenceImageUrls) ? referenceImageUrls : [])
                .filter(u => u && typeof u === 'string').slice(0, 2);
            if (validRefs.length === 0) {
                return res.status(400).json({ success: false, error: 'reference mode requires at least one referenceImageUrl (S3 URL)' });
            }
            refUrls = validRefs;
            useMultimodal = true;
            finalPrompt = buildReferencePrompt(referenceDescription || '', { environment, lightingMood, clothingStyle });
            console.log(`🎭 [AvatarStudio] User ${req.user._id} | mode=reference | ${refUrls.length} refs`);

        } else if (mode === 'directPrompt' || (directPrompt && directPrompt.trim().length >= 10)) {
            // Step 12: directPrompt mode — sanitised but user controls framing
            try {
                finalPrompt = buildDirectPrompt(directPrompt || '');
            } catch (e) {
                return res.status(400).json({ success: false, error: e.message });
            }
            console.log(`🎭 [AvatarStudio] User ${req.user._id} | mode=directPrompt (${finalPrompt.length} chars)`);

        } else {
            // Step 12: structured mode — full option selector, fixed cinematic prefix
            try {
                finalPrompt = buildAvatarPrompt({
                    origin, ageRange, genderExpression,
                    clothingStyle, environment, lightingMood, additionalDetails,
                });
            } catch (promptErr) {
                return res.status(promptErr.status || 400).json({ success: false, error: promptErr.message });
            }
            console.log(`🎭 [AvatarStudio] User ${req.user._id} | mode=structured`);
        }

        const size = RATIO_TO_SIZE['9:16']; // Always 9:16 portrait for user-facing

        // Step 11: reference mode → multimodal; others → standard
        // generateOneVariant handles both paths internally when refUrls are passed
        const generateFn = useMultimodal
            ? (slot) => generateOneVariant(slot, finalPrompt, size, DEFAULT_MODEL, refUrls)
            : (slot) => generateOneVariant(slot, finalPrompt, size, DEFAULT_MODEL);

        const [v0, v1] = await Promise.all([generateFn(0), generateFn(1)]);

        const variants = [v0, v1];
        const successCount = variants.filter(v => !v.failed).length;
        console.log(`✅ [AvatarStudio] ${successCount}/2 variants succeeded | mode=${mode}`);

        if (successCount === 0) {
            return res.status(502).json({ success: false, error: 'Both variants failed. Check LaoZhang API key and quota.', variants });
        }

        res.json({
            success: true,
            variants,
            prompt: finalPrompt,
            mode,
            creditsUsed: req.creditsDeducted || 4,
        });
    } catch (err) {
        console.error('❌ [AvatarStudio] /generate error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/avatar-studio/admin/generate
// SuperAdmin only: free, model selector, directPrompt OR structured options, any aspectRatio
// ══════════════════════════════════════════════════════════════════════════════
router.post('/admin/generate', protect, superadmin, async (req, res) => {
    try {
        const {
            // Structured avatar options
            origin, ageRange, genderExpression, clothingStyle, environment, lightingMood, additionalDetails,
            // Creative generator options
            directPrompt,
            negativePrompt,
            aspectRatio = '9:16',
            // Model selection
            model: requestedModel,
        } = req.body;

        const modelKey = AVATAR_MODELS[requestedModel] ? requestedModel : DEFAULT_MODEL;
        const modelCfg = AVATAR_MODELS[modelKey];

        // Resolve pixel size from aspect ratio
        const size = RATIO_TO_SIZE[aspectRatio] || modelCfg.defaultSize;

        let finalPrompt;

        if (directPrompt && directPrompt.trim()) {
            // Creative Generator mode — use prompt directly
            finalPrompt = directPrompt.trim();
            if (negativePrompt && negativePrompt.trim()) {
                finalPrompt += `. Avoid: ${negativePrompt.trim()}`;
            }
        } else {
            // Structured Avatar Generator mode
            try {
                finalPrompt = buildAvatarPrompt({
                    origin, ageRange, genderExpression,
                    clothingStyle, environment, lightingMood, additionalDetails,
                });
            } catch (promptErr) {
                return res.status(promptErr.status || 400).json({ success: false, error: promptErr.message });
            }
        }

        console.log(`🎭 [AvatarStudio/Admin] model=${modelKey} | ratio=${aspectRatio} | size=${size} | direct=${!!directPrompt}`);
        console.log(`   📝 Prompt: ${finalPrompt.substring(0, 100)}...`);

        const [v0, v1] = await Promise.all([
            generateOneVariant(0, finalPrompt, size, modelKey),
            generateOneVariant(1, finalPrompt, size, modelKey),
        ]);

        const variants = [v0, v1];
        const successCount = variants.filter(v => !v.failed).length;
        console.log(`✅ [AvatarStudio/Admin] ${successCount}/2 variants succeeded`);

        if (successCount === 0) {
            return res.status(502).json({
                success: false,
                error: 'Both variants failed. Check LAOZHANG_API_KEY and quota.',
                variants,
            });
        }

        res.json({
            success: true, variants, prompt: finalPrompt,
            aspectRatio, size, model: modelKey,
            creditsUsed: 0,
        });
    } catch (err) {
        console.error('❌ [AvatarStudio/Admin] error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/avatar-studio/library
// Returns: { myAvatars: [...], publicAvatars: [...] }
// myAvatars = user's own generated/uploaded avatars
// publicAvatars = superadmin-published library avatars (visible to all users)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/library', protect, async (req, res) => {
    try {
        const userId = req.user._id;
        const [myAvatars, publicAvatars] = await Promise.all([
            Avatar.find({ createdBy: userId, isActive: true })
                .select('name imageUrl resolution frameType generationMode source createdAt')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean(),
            Avatar.find({
                $or: [
                    { isTemplate: true },
                    { createdByRole: 'superadmin', isPublished: true }
                ],
                isActive: true
            })
                .select('name imageUrl resolution frameType generationMode isFeatured')
                .sort({ isFeatured: -1, createdAt: -1 })
                .limit(50)
                .lean(),
        ]);
        res.json({ success: true, myAvatars, publicAvatars });
    } catch (err) {
        console.error('❌ [AvatarStudio] /library error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/avatar-studio/save
// Saves the user-selected avatar variant after generation.
// BUG-05 + BUG-17 FIX: name is REQUIRED. Only the selected variant is saved.
// Body: { name, selectedUrl, generationMode, promptUsed, referenceImageUrl,
//         createdByRole, modelUsed, options }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/save', protect, async (req, res) => {
    try {
        const {
            name,
            selectedUrl,
            generationMode = 'structured',
            promptUsed = '',
            referenceImageUrl = '',
            createdByRole = 'user',
            modelUsed = DEFAULT_MODEL,
            isPublished = false,
            options = {},
        } = req.body;

        // BUG-05 FIX: name is required — hard block before Mongoose validation fires
        const trimmedName = (name || '').trim();
        if (!trimmedName) {
            return res.status(400).json({
                success: false,
                error: 'Avatar name is required. Give this avatar a name before saving.',
            });
        }

        if (!selectedUrl || !selectedUrl.startsWith('http')) {
            return res.status(400).json({
                success: false,
                error: 'selectedUrl must be a valid S3 URL.',
            });
        }

        // Only superadmins can set createdByRole to superadmin or isPublished to true
        const effectiveRole = (req.user.role === 'superadmin') ? 'superadmin' : 'user';
        const effectivePublished = effectiveRole === 'superadmin' ? true : false;

        const avatar = await Avatar.create({
            name: trimmedName,
            imageUrl: selectedUrl,
            gender: mapGenderEnum(options.genderExpression),
            isTemplate: effectiveRole === 'superadmin', // legacy flag for backwards compat
            isActive: true,
            source: 'generated',
            generatedFromPrompt: promptUsed,
            createdBy: req.user._id,
            // New fields
            createdByRole: effectiveRole,
            isPublished: effectivePublished,
            generationMode,
            referenceImageUrl,
            promptUsed,
            modelUsed,
            frameType: 'mid_shot',
            resolution: '9:16',
        });

        console.log(`✅ [AvatarStudio] Avatar saved: ${avatar._id} | name=${trimmedName} | role=${effectiveRole} | published=${effectivePublished}`);
        res.json({ success: true, avatar });
    } catch (err) {
        console.error('❌ [AvatarStudio] /save error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Admin: Publish avatar to public library (superadmin only) ─────────────────
router.post('/admin/publish/:avatarId', protect, superadmin, async (req, res) => {
    try {
        const avatar = await Avatar.findByIdAndUpdate(
            req.params.avatarId,
            { isPublished: true, isTemplate: true },
            { new: true }
        );
        if (!avatar) return res.status(404).json({ success: false, error: 'Avatar not found' });
        console.log(`✅ [AvatarStudio] Admin published avatar: ${avatar._id}`);
        res.json({ success: true, avatar });
    } catch (err) {
        console.error('❌ [AvatarStudio] /admin/publish error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Admin: Unpublish avatar from public library (superadmin only) ─────────────
router.post('/admin/unpublish/:avatarId', protect, superadmin, async (req, res) => {
    try {
        const avatar = await Avatar.findByIdAndUpdate(
            req.params.avatarId,
            { isPublished: false, isTemplate: false },
            { new: true }
        );
        if (!avatar) return res.status(404).json({ success: false, error: 'Avatar not found' });
        console.log(`✅ [AvatarStudio] Admin unpublished avatar: ${avatar._id}`);
        res.json({ success: true, avatar });
    } catch (err) {
        console.error('❌ [AvatarStudio] /admin/unpublish error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
