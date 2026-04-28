/**
 * Mantram AI — Superadmin Image Generation Studio
 *
 * POST /api/superadmin/images/generate
 *   Admin-only direct image generation (no brand DNA, no credits).
 *   Supports optional referenceImageUrls array → routes to multimodal pipeline.
 *   Returns 3 variants in parallel, all stored as S3 URLs.
 *
 * POST /api/superadmin/images/generate-single
 *   Single variant, faster — for quick preview before 3-way generation.
 */

import { Router } from 'express';
import { protect, superadmin } from '../middleware/auth.js';
import { laozhangImageGenerate, laozhangMultimodalImageGenerate } from '../agents/videoStudio/laozhangClient.js';
import { AVATAR_MODELS } from './avatar-studio.js';
import { RATIO_TO_SIZE } from '../agents/avatarStudio/avatarPromptBuilder.js';

const router = Router();

// ─── Available models exposed to admin ───────────────────────────────────────
// We re-export AVATAR_MODELS from avatar-studio + add any extra admin-only models.
const IMAGE_MODELS = {
    ...AVATAR_MODELS,
    // Creative Generator extras (admin-only, wider aspect ratio support)
    'gpt-image-2': {
        label: 'GPT Image 2',
        badge: 'Best',
        apiModel: 'gpt-image-2',
        provider: 'lz',
        supportsMultimodal: true,
    },
    'nanobanana-2': {
        label: 'NanoBanana 2',
        badge: 'Gemini',
        apiModel: 'gemini-3.1-flash-image-preview',
        provider: 'lz',        // NanoBanana 2 goes through LZ proxy for image gen
        supportsMultimodal: true,
    },
};

const DEFAULT_IMAGE_MODEL = 'gpt-image-2';

// ─── Aspect ratio → LZ pixel size (superset includes 1:1, 16:9, 4:5, 3:4 for admin) ─
const ADMIN_RATIO_TO_SIZE = {
    ...RATIO_TO_SIZE,
    '1:1':  '1024x1024',
    '16:9': '1792x1024',
    '4:5':  '1024x1280',
    '3:4':  '1024x1365',
    '9:16': '1024x1792',
};

/**
 * Generate one image via LaoZhang.
 * Step 7 rule: if referenceImageUrls provided → laozhangMultimodalImageGenerate
 *              else → laozhangImageGenerate
 * Step 10 rule: these functions already call ensureS3Url internally.
 *               DO NOT call ensureS3Url on their return values.
 *
 * @returns {{ slot, url, failed, error? }}
 */
async function generateAdminVariant(slot, prompt, size, modelKey, referenceImageUrls = []) {
    try {
        const cfg = IMAGE_MODELS[modelKey] || IMAGE_MODELS[DEFAULT_IMAGE_MODEL];
        const apiModel = cfg.apiModel;
        const hasRefs = referenceImageUrls && referenceImageUrls.length > 0;

        let result;
        if (hasRefs) {
            // Step 7: referenceImageUrls provided → multimodal pipeline
            const refs = referenceImageUrls.slice(0, 2); // max 2 refs as specified
            console.log(`🎨 [AdminImageStudio] Variant ${slot} | ${apiModel} | multimodal | ${refs.length} refs | size=${size}`);
            result = await laozhangMultimodalImageGenerate(prompt, refs, { model: apiModel, size });
        } else {
            console.log(`🎨 [AdminImageStudio] Variant ${slot} | ${apiModel} | size=${size}`);
            result = await laozhangImageGenerate(prompt, { model: apiModel, size });
        }

        // Step 10: result.imageUrl is ALREADY an S3 URL from the LZ client — no ensureS3Url needed
        return { slot, url: result.imageUrl, failed: false };
    } catch (err) {
        console.error(`❌ [AdminImageStudio] Variant ${slot} failed: ${err.message}`);
        return { slot, url: null, failed: true, error: err.message };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/superadmin/images/models
// Returns available models + aspect ratios
// ══════════════════════════════════════════════════════════════════════════════
router.get('/models', protect, superadmin, (req, res) => {
    const models = Object.entries(IMAGE_MODELS).map(([key, cfg]) => ({
        key,
        label: cfg.label,
        badge: cfg.badge,
        supportsMultimodal: cfg.supportsMultimodal || false,
        isDefault: key === DEFAULT_IMAGE_MODEL,
    }));

    const aspectRatios = Object.keys(ADMIN_RATIO_TO_SIZE).map(ratio => ({
        ratio,
        size: ADMIN_RATIO_TO_SIZE[ratio],
        label: {
            '9:16': 'Portrait (9:16) — Avatar',
            '1:1':  'Square (1:1)',
            '16:9': 'Landscape (16:9)',
            '4:5':  'Instagram (4:5)',
            '3:4':  'Tall (3:4)',
        }[ratio] || ratio,
    }));

    res.json({ success: true, models, aspectRatios, defaultModel: DEFAULT_IMAGE_MODEL });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/superadmin/images/generate
// 3-variant parallel generation — main endpoint
// Body: { prompt, model?, aspectRatio?, referenceImageUrls? }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate', protect, superadmin, async (req, res) => {
    try {
        const {
            prompt,
            model: requestedModel,
            aspectRatio = '1:1',
            referenceImageUrls = [], // Step 7: optional array, max 2
        } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'prompt is required' });
        }

        const modelKey = IMAGE_MODELS[requestedModel] ? requestedModel : DEFAULT_IMAGE_MODEL;
        const size = ADMIN_RATIO_TO_SIZE[aspectRatio] || '1024x1024';
        const refs = Array.isArray(referenceImageUrls)
            ? referenceImageUrls.filter(u => u && typeof u === 'string').slice(0, 2)
            : [];

        console.log(`\n🎨 [AdminImageStudio] /generate`);
        console.log(`   model=${modelKey} | aspectRatio=${aspectRatio} | size=${size} | refs=${refs.length}`);
        console.log(`   prompt: ${prompt.substring(0, 120)}...`);

        // 3 variants in parallel
        const [v0, v1, v2] = await Promise.all([
            generateAdminVariant(0, prompt, size, modelKey, refs),
            generateAdminVariant(1, prompt, size, modelKey, refs),
            generateAdminVariant(2, prompt, size, modelKey, refs),
        ]);

        const variants = [v0, v1, v2];
        const successCount = variants.filter(v => !v.failed).length;

        if (successCount === 0) {
            return res.status(502).json({
                success: false,
                error: 'All 3 variants failed. Check LAOZHANG_API_KEY and model availability.',
                variants,
            });
        }

        console.log(`✅ [AdminImageStudio] ${successCount}/3 variants succeeded`);

        res.json({
            success: true,
            variants,
            prompt: prompt.trim(),
            model: modelKey,
            aspectRatio,
            size,
            creditsUsed: 0, // Admin generation is free
        });
    } catch (err) {
        console.error('❌ [AdminImageStudio] /generate error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/superadmin/images/generate-single
// Single variant — faster preview before committing to 3-way
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate-single', protect, superadmin, async (req, res) => {
    try {
        const {
            prompt,
            model: requestedModel,
            aspectRatio = '1:1',
            referenceImageUrls = [],
        } = req.body;

        if (!prompt || !prompt.trim()) {
            return res.status(400).json({ success: false, error: 'prompt is required' });
        }

        const modelKey = IMAGE_MODELS[requestedModel] ? requestedModel : DEFAULT_IMAGE_MODEL;
        const size = ADMIN_RATIO_TO_SIZE[aspectRatio] || '1024x1024';
        const refs = Array.isArray(referenceImageUrls)
            ? referenceImageUrls.filter(u => u && typeof u === 'string').slice(0, 2)
            : [];

        const variant = await generateAdminVariant(0, prompt, size, modelKey, refs);

        if (variant.failed) {
            return res.status(502).json({ success: false, error: variant.error });
        }

        res.json({
            success: true,
            url: variant.url,
            prompt: prompt.trim(),
            model: modelKey,
            aspectRatio,
            size,
        });
    } catch (err) {
        console.error('❌ [AdminImageStudio] /generate-single error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
