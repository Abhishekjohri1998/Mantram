/**
 * buildTemplatePrompt — assemble the final generation payload for any studio.
 *
 * Stage 3 update: now reads promptTemplate first (placeholder-enabled formula),
 * falling back to savedPrompt. Performs full placeholder substitution using
 * brand DNA and runtime user inputs before assembling the final prompt.
 *
 * Stage 4 update: accepts productDescription and productClassification from the
 * two-pass product analyzer, injects them as substitution values and directives.
 *
 * Returns:
 *  - finalPrompt           : string — merged template + user prompt
 *  - visionInputs          : array  — structured [{ role, format, data }]
 *  - refImageUrls          : array  — flat list of S3/HTTP URLs
 *  - settings              : object — template defaultSettings
 *  - productClassification : object — from Stage 4 analyzer (pass-through)
 */

import Brand from '../../models/Brand.js';

// Categories that get the CRITICAL preservation prefix (complex physical products)
const COMPLEX_CATEGORIES = ['wireless_audio', 'computing', 'wearable_tech', 'mobile_accessory'];

export async function buildTemplatePrompt({
    template,
    userPrompt,
    // S3 URL params (preferred)
    productImageUrl,
    avatarImageUrl,
    // Stage 3: brand for placeholder substitution
    brandId,
    // Stage 4: product intelligence from the two-pass analyzer
    productDescription = '',
    productClassification = null,
    // Legacy base64 params (kept for backward compat)
    userProductImageBase64,
    userAvatarImageBase64,
}) {
    if (!template) throw new Error('Template is required to build prompt');

    // ── 1. Load brand data for placeholder substitution ──
    let brandData = {};
    if (brandId) {
        try {
            const brand = await Brand.findById(brandId).lean();
            if (brand) {
                brandData = {
                    brand_name: brand.name || '',
                    brand_tagline: brand.tagline || brand.dna?.tagline || '',
                    brand_color_primary: brand.dna?.colors?.[0]?.hex || brand.dna?.colors?.[0]?.name || '',
                    brand_personality: brand.dna?.personality || '',
                    brand_industry: brand.dna?.industry || '',
                };
            }
        } catch (err) {
            console.warn('[templatePromptCombiner] Brand load failed:', err.message);
        }
    }

    // ── 2. Build base prompt — use promptTemplate (placeholder-enabled) if present ──
    // promptTemplate contains {brand_name}, {packaging_description} etc.
    // savedPrompt is the locked immutable fallback.
    let basePrompt = template.promptTemplate || template.savedPrompt || '';

    // ── 3. Build substitution map (Stage 3 core fix) ──
    const substitutions = {
        // Brand identity tokens
        '{brand_name}': brandData.brand_name || 'the brand',
        '{brand_tagline}': brandData.brand_tagline || '',
        '{brand_color}': brandData.brand_color_primary || '',
        '{brand_personality}': brandData.brand_personality || '',
        '{brand_industry}': brandData.brand_industry || '',
        // Product tokens (Stage 4: populated by productAnalyzer)
        '{product_name}': brandData.brand_name || 'the product',
        '{packaging_description}': productDescription || '',
        '{product_description}': productDescription || '',
        // User brief token
        '{tagline}': userPrompt || brandData.brand_tagline || '',
        '{user_brief}': userPrompt || '',
        // Generic placeholders
        '{headline}': brandData.brand_tagline || userPrompt || '',
    };

    // Apply all substitutions
    let finalPrompt = basePrompt;
    for (const [placeholder, value] of Object.entries(substitutions)) {
        // replaceAll is not available in all Node versions — use global regex
        finalPrompt = finalPrompt.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    // ── 4. Append user brief if provided and not already substituted into prompt ──
    if (userPrompt && userPrompt.trim() && !finalPrompt.includes(userPrompt.trim())) {
        finalPrompt = finalPrompt
            ? `${finalPrompt}\n\nAdditional direction: ${userPrompt.trim()}`
            : userPrompt.trim();
    }

    // ── 5. Resolve images ──
    const resolvedProduct = productImageUrl || userProductImageBase64 || null;
    const resolvedAvatar = avatarImageUrl || userAvatarImageBase64 || null;

    // ── 6. Complex product preservation prefix (Stage 4) ──
    // Prepend a mandatory accuracy directive for products with many physical details
    const isComplex = productClassification && (
        productClassification.complexity === 'high' ||
        COMPLEX_CATEGORIES.includes(productClassification.category)
    );

    if (isComplex && productDescription) {
        const preservationPrefix = `[CRITICAL — PRESERVE PRODUCT ACCURACY]
A reference product image is provided. You MUST reproduce the EXACT product visible in the reference image:
— Exact shape, form factor, and proportions
— Exact materials, surface finish, and colour
— Exact placement of branding, logos, and text
— Exact mechanical and hardware features: ${productDescription}
Do NOT invent features. Do NOT substitute a generic version. The product in the output must match the reference image identically.

`;
        finalPrompt = preservationPrefix + finalPrompt;
    } else {
        // Standard product/avatar reference directives
        const directives = [];
        if (resolvedProduct) {
            directives.push(
                `PRODUCT REFERENCE IMAGE PROVIDED: A real product photo has been uploaded as a reference image. ` +
                `You MUST reproduce this EXACT product in the output — same shape, same colors, same labels, same proportions. ` +
                `Do NOT substitute, reimagine, or hallucinate a different product. The product photo is the GROUND TRUTH.`
            );
        }
        if (resolvedAvatar) {
            directives.push(
                `FACE/AVATAR REFERENCE IMAGE PROVIDED: A real person's photo has been uploaded. ` +
                `You MUST preserve this person's face, skin tone, hair, and features accurately in the output. ` +
                `Do NOT replace them with a generic model or different person.`
            );
        }
        if (directives.length > 0) {
            finalPrompt = directives.join('\n') + '\n\n' + finalPrompt;
        }
    }

    // ── 7. Assemble vision inputs (structured — for video/content pipelines) ──
    const visionInputs = [];

    if (template.systemReferenceImage) {
        visionInputs.push({
            role: 'system',
            format: template.systemReferenceImage.startsWith('data:') ? 'base64' : 'url',
            data: template.systemReferenceImage
        });
    }

    if (resolvedProduct) {
        visionInputs.push({
            role: 'product',
            format: resolvedProduct.startsWith('data:') ? 'base64' : 'url',
            data: resolvedProduct
        });
    }

    if (resolvedAvatar) {
        visionInputs.push({
            role: 'avatar',
            format: resolvedAvatar.startsWith('data:') ? 'base64' : 'url',
            data: resolvedAvatar
        });
    }

    // ── 8. Flat refImageUrls for internalGenerateCreative ──
    const refImageUrls = visionInputs
        .map(v => v.data)
        .filter(d => d && (d.startsWith('http://') || d.startsWith('https://')));

    return {
        finalPrompt,
        visionInputs,
        refImageUrls,
        settings: template.defaultSettings || {},
        productClassification,
    };
}
