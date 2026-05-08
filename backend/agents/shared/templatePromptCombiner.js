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
 * DNA Fit Engine: when useDnaFormula=true (user-created templates), uses
 * template.dna.promptFormula as the base and expands {{UPPERCASE}} placeholders.
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
    brief = '',
    // S3 URL params (preferred)
    productImageUrl,
    avatarImageUrl,
    // Stage 3: brand for placeholder substitution
    brandId,
    // Stage 4: product intelligence from the two-pass analyzer
    productDescription = '',
    productClassification = null,
    // DNA Fit Engine: use dna.promptFormula as base for user-created templates
    useDnaFormula = false,
    // Legacy base64 params (kept for backward compat)
    userProductImageBase64,
    userAvatarImageBase64,
}) {
    if (!template) throw new Error('Template is required to build prompt');

    // ── 1. Load brand data for placeholder substitution ──────────────────────
    let brandData = {};
    if (brandId) {
        try {
            const brand = await Brand.findById(brandId).lean();
            if (brand) {
                brandData = {
                    brand_name: brand.name || '',
                    brand_tagline: brand.tagline || brand.dna?.tagline || '',
                    brand_color_primary: brand.dna?.colors?.[0]?.hex || brand.dna?.colors?.[0]?.name || '',
                    brand_colors: brand.dna?.colors?.map(c => c.hex).filter(Boolean).join(', ') || '',
                    brand_personality: brand.dna?.personality || '',
                    brand_industry: brand.dna?.industry || '',
                };
            }
        } catch (err) {
            console.warn('[templatePromptCombiner] Brand load failed:', err.message);
        }
    }

    // ── 2. Resolve user intent (brief + userPrompt merged) ───────────────────
    const userIntent = (brief || userPrompt || '').trim();

    // ── 3. Choose base prompt ─────────────────────────────────────────────────
    // For user-created templates with DNA: use dna.promptFormula (canonical)
    // For admin templates: use promptTemplate → savedPrompt (locked formula)
    let basePrompt;
    if (useDnaFormula && template.dna && template.dna.promptFormula) {
        basePrompt = template.dna.promptFormula;
    } else {
        basePrompt = template.promptTemplate || template.savedPrompt || '';
    }

    // ── 4. Build substitution map — supports both {lowercase} and {{UPPERCASE}} ─
    // {lowercase} = legacy admin template format
    // {{UPPERCASE}} = new DNA formula format for user-created templates
    const brandName = brandData.brand_name || 'the brand';
    const effectiveProduct = productDescription || userIntent || 'the product';

    const substitutions = {
        // ── {{UPPERCASE}} format (DNA formulas from analyze-and-create) ─────
        '{{BRAND}}': brandName,
        '{{BRAND_NAME}}': brandName,
        '{{PRODUCT}}': effectiveProduct,
        '{{PRODUCT_DESCRIPTION}}': productDescription || userIntent,
        '{{HEADLINE}}': userIntent || brandData.brand_tagline || brandName,
        '{{OFFER}}': userIntent || '',
        '{{CTA}}': 'Shop Now',
        '{{SUBTEXT}}': userIntent || '',
        '{{TAGLINE}}': brandData.brand_tagline || userIntent || '',
        '{{COLOR}}': brandData.brand_colors || brandData.brand_color_primary || '',
        '{{COLORS}}': brandData.brand_colors || '',
        // ── {lowercase} format (legacy admin templates) ───────────────────────
        '{brand_name}': brandName,
        '{brand_tagline}': brandData.brand_tagline || '',
        '{brand_color}': brandData.brand_color_primary || '',
        '{brand_personality}': brandData.brand_personality || '',
        '{brand_industry}': brandData.brand_industry || '',
        '{product_name}': brandName,
        '{packaging_description}': productDescription || '',
        '{product_description}': productDescription || '',
        '{tagline}': userIntent || brandData.brand_tagline || '',
        '{user_brief}': userIntent || '',
        '{headline}': brandData.brand_tagline || userIntent || '',
    };

    // Apply all substitutions
    let finalPrompt = basePrompt;
    for (const [placeholder, value] of Object.entries(substitutions)) {
        // Escape special regex characters in the placeholder
        const escaped = placeholder.replace(/[{}[\]()*+?.\\^$|]/g, '\\$&');
        finalPrompt = finalPrompt.replace(new RegExp(escaped, 'g'), value);
    }

    // ── 5. Append user brief/intent if not already in prompt ─────────────────
    if (userIntent && !finalPrompt.toLowerCase().includes(userIntent.toLowerCase().substring(0, 30))) {
        finalPrompt = finalPrompt
            ? `${finalPrompt}\n\nUser brief: ${userIntent}`
            : userIntent;
    }

    // ── 6. Inject brand colors if not already mentioned ──────────────────────
    if (brandData.brand_colors && !finalPrompt.includes(brandData.brand_colors)) {
        finalPrompt += `\n\nBrand colors: ${brandData.brand_colors}.`;
    }

    // ── 7. Resolve images ─────────────────────────────────────────────────────
    const resolvedProduct = productImageUrl || userProductImageBase64 || null;
    const resolvedAvatar = avatarImageUrl || userAvatarImageBase64 || null;

    // ── 8. Complex product preservation prefix (Stage 4) ─────────────────────
    // Prepend a mandatory accuracy directive for products with many physical details
    const isComplex = productClassification && (
        productClassification.complexity === 'high' ||
        COMPLEX_CATEGORIES.includes(productClassification.category)
    );

    if (isComplex && productDescription) {
        const preservationPrefix =
            `[CRITICAL — PRESERVE PRODUCT ACCURACY]\n` +
            `A reference product image is provided. You MUST reproduce the EXACT product visible in the reference image:\n` +
            `— Exact shape, form factor, and proportions\n` +
            `— Exact materials, surface finish, and colour\n` +
            `— Exact placement of branding, logos, and text\n` +
            `— Exact mechanical and hardware features: ${productDescription}\n` +
            `Do NOT invent features. Do NOT substitute a generic version. The product in the output must match the reference image identically.\n\n`;
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

    // ── 9. Assemble vision inputs (structured — for video/content pipelines) ──
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

    // ── 10. Flat refImageUrls for internalGenerateCreative ───────────────────
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
