/**
 * Identity Agent — Complete Brand Identity System Generator
 *
 * Pipeline:
 *   1. Art Director Agent → brand archetype + design strategy + image prompts
 *   2. GPT-Image-2 → generate comprehensive identity system boards
 *      - If existingLogoUrl: uses /images/edits (multipart) to preserve the logo
 *      - If no logo: generates full identity from scratch
 *   3. S3 upload → hosted URLs returned
 *
 * Each generated image is a COMPLETE IDENTITY SYSTEM BOARD containing:
 *   - Primary logo & logo variations (reversed, minimal, stacked)
 *   - Colour palette swatches with labels
 *   - Typography specimen (headline + body font)
 *   - Real-world collateral mockups (as specified in collateralBrief)
 */

import { laozhangImageGenerate, laozhangGptImageWithRefs } from '../videoStudio/laozhangClient.js';
import { mirrorUrlToS3 } from '../../utils/s3.js';
import { runArtDirector } from './artDirectorAgent.js';
import { v4 as uuidv4 } from 'uuid';

// GPT-Image-2 produces far superior brand identity results vs Gemini Flash
const GPT_IMAGE_MODEL = 'gpt-image-2';

// ── Identity System Asset Definitions ─────────────────────────────────────────
// Each asset is a FULL IDENTITY SYSTEM BOARD — not isolated logo marks.
const IDENTITY_ASSETS = [
    {
        subType: 'identity-system-light',
        name: 'Brand Identity System (Light)',
        size: '1792x1024',
        desc: 'Complete identity system: logo + variations + colour palette + typography on white/light background',
    },
    {
        subType: 'identity-system-dark',
        name: 'Brand Identity System (Dark)',
        size: '1792x1024',
        desc: 'Complete identity system reversed: logo on brand colour / dark background, palette and type specimen',
    },
    {
        subType: 'identity-collateral',
        name: 'Brand Collateral Mockups',
        size: '1792x1024',
        desc: 'Real-world brand application: products, packaging, stationery, or merchandise as specified',
    },
    {
        subType: 'logo-icon-mark',
        name: 'Icon Mark / Brand Symbol',
        size: '1024x1024',
        desc: 'Standalone brand icon or monogram mark, scalable, minimal',
    },
    {
        subType: 'brand-stamp',
        name: 'Brand Stamp / Seal',
        size: '1024x1024',
        desc: 'Circular brand seal or wax stamp design, premium finish',
    },
];

// ── Fallback prompts (used when Art Director returns incomplete data) ──────────
const FALLBACK_PROMPTS = {
    'identity-system-light': 'Professional brand identity system layout on pure white background. Left panel: primary logo and 3 variations (reversed, stacked, icon-only). Center panel: 5-colour palette swatches with hex code labels. Right panel: typography specimen showing heading and body typefaces. Ultra clean, agency-quality brand board, Swiss grid layout, premium print design.',
    'identity-system-dark': 'Professional brand identity system on deep charcoal/brand-color background. Primary logo in white/light version. Reversed logo variations. Colour palette swatches. Typography shown in white. Sophisticated dark brand board, Pentagram studio quality, dramatic lighting, premium finish.',
    'identity-collateral': 'Brand identity applied to real-world objects: shopping bag with logo, product packaging box, business card, coffee cup sleeve, tote bag. Flat-lay product photography style, white marble surface, soft shadows, editorial quality, brand color accents throughout.',
    'logo-icon-mark': 'Abstract brand icon mark, geometric symbol on white background. Single solid color. Bold, scalable, memorable. Clean vector aesthetic. Pentagram logo mark quality. No text. Centered composition with generous white space.',
    'brand-stamp': 'Circular brand stamp seal. Outer ring with brand name text. Central icon mark. Professional embossed look. Single brand color on white. Premium wax seal aesthetic. Fine detail, letterpress print quality.',
};

const getFallbackPrompt = (subType, collateralBrief, brandName) => {
    if (subType === 'identity-collateral' && collateralBrief) {
        return `Brand identity for ${brandName || 'Brand'} applied to custom real-world objects: ${collateralBrief}. Photorealistic product mockups, flat-lay photography style, clean background, soft studio lighting, professional agency brand deck quality, brand color accents throughout.`;
    }
    return FALLBACK_PROMPTS[subType];
};

// ── Generate a single identity image ─────────────────────────────────────────
async function generateIdentityImage({ prompt, size, subType, colors, existingLogoUrl }) {
    const colorCue = colors?.length > 0
        ? ` Primary brand color: ${colors[0].hex} (${colors[0].name}).${colors[1] ? ` Accent: ${colors[1].hex}.` : ''}`
        : '';

    // Identity system boards should show type/palette labels, BUT individual marks should not
    const isSystemBoard = subType.startsWith('identity-system') || subType === 'identity-collateral';
    const textInstruction = isSystemBoard
        ? ' Typography labels and colour hex codes may appear as design elements. All other text should be minimised.'
        : ' No words, letters, or typography visible — pure visual mark only.';

    const fullPrompt = `${prompt}${colorCue}${textInstruction} Ultra high resolution, print-ready, photorealistic rendering, award-winning brand design quality.`;

    try {
        // If a reference logo/image is provided → use GPT-Image-2 edits mode
        if (existingLogoUrl) {
            console.log(`🎨 [Identity] Using reference image for ${subType}...`);
            const result = await laozhangGptImageWithRefs(fullPrompt, [existingLogoUrl], {
                model: GPT_IMAGE_MODEL,
                size,
            });
            return result?.imageUrl || null;
        }

        // No reference image — generate from scratch
        const result = await laozhangImageGenerate(fullPrompt, {
            model: GPT_IMAGE_MODEL,
            size,
        });
        return result?.imageUrl || null;
    } catch (err) {
        console.error(`❌ Identity image failed for ${subType}:`, err.message);
        return null;
    }
}

// ── Main Export ───────────────────────────────────────────────────────────────
export async function generateBrandIdentity({
    brandId,
    brief,
    briefBrand,
    scope = 'brand',
    existingLogoUrl = null,
    collateralBrief = null,
    imageModel,
}) {
    const slug = uuidv4().substring(0, 8);

    console.log(`🎨 [Identity] Running Art Director analysis...`);
    if (existingLogoUrl) console.log(`🎨 [Identity] Existing logo provided — will use as reference image`);
    if (collateralBrief) console.log(`🎨 [Identity] Collateral brief: ${collateralBrief}`);

    // Stage 1: Art Director — brand archetype + prompt engineering
    const { artStrategy, prompts, brandContext, brand, activeCollateralBrief } = await runArtDirector({
        brandId,
        brief,
        scope,
        assetType: 'brand-identity-system',
        assetSpecs: IDENTITY_ASSETS.map(a => a.subType),
        briefBrand,
        existingLogoUrl,
        collateralBrief,
    });

    const colors = brand?.dna?.colors || briefBrand?.colors || [];
    const brandName = brand?.name || briefBrand?.name || 'Brand';
    const activeLogoUrl = existingLogoUrl || brand?.dna?.logo?.url || null;

    if (activeCollateralBrief) console.log(`🎨 [Identity] Active collateral brief: ${activeCollateralBrief}`);

    console.log(`🎨 [Identity] Generating ${IDENTITY_ASSETS.length} identity system assets with GPT-Image-2...`);

    let assets = [];

    // Stage 2: Generate all identity images using reference mode to ensure visual consistency
    if (activeLogoUrl) {
        // Option A: Existing logo provided — generate all 5 in parallel using logo as reference
        console.log(`🎨 [Identity] Generating all 5 identity assets in parallel using logo reference: ${activeLogoUrl}`);
        const results = await Promise.allSettled(
            IDENTITY_ASSETS.map(async (asset) => {
                const prompt = prompts?.[asset.subType] || getFallbackPrompt(asset.subType, activeCollateralBrief, brandName)
                    || `Professional ${asset.desc} for ${brandName} brand. Premium brand identity quality.`;

                const imageUrl = await generateIdentityImage({
                    prompt,
                    size: asset.size,
                    subType: asset.subType,
                    colors,
                    existingLogoUrl: activeLogoUrl,
                });

                let finalUrl = imageUrl;
                if (imageUrl) {
                    const isOurS3 = imageUrl.includes('mantram-media-assets.s3') || imageUrl.includes('.amazonaws.com');
                    if (!isOurS3) {
                        try {
                            const s3Url = await mirrorUrlToS3(imageUrl, `brand-kit/${brandId || 'anon'}/${slug}-${asset.subType}.png`);
                            if (s3Url) finalUrl = s3Url;
                        } catch (_) { /* use original */ }
                    }
                }

                return {
                    name: asset.name,
                    assetSubType: asset.subType,
                    imageUrl: finalUrl,
                    prompt,
                    format: 'image',
                    width: asset.size.includes('1792') ? 1792 : 1024,
                    height: asset.size.includes('1024') ? 1024 : 1024,
                    thumbnailUrl: finalUrl,
                };
            })
        );
        assets = results
            .filter(r => r.status === 'fulfilled' && r.value.imageUrl)
            .map(r => r.value);
    } else {
        // Option B: No existing logo — two-stage visual consistency pipeline
        console.log(`🎨 [Identity] Two-stage pipeline: generating primary 'identity-system-light' first...`);
        
        // Step 1: Generate light system board first (text-only)
        const lightAssetDef = IDENTITY_ASSETS.find(a => a.subType === 'identity-system-light');
        const lightPrompt = prompts?.[lightAssetDef.subType] || getFallbackPrompt(lightAssetDef.subType, activeCollateralBrief, brandName)
            || `Professional ${lightAssetDef.desc} for ${brandName} brand. Premium brand identity quality.`;
        
        const lightImageUrl = await generateIdentityImage({
            prompt: lightPrompt,
            size: lightAssetDef.size,
            subType: lightAssetDef.subType,
            colors,
            existingLogoUrl: null,
        });

        let finalLightUrl = lightImageUrl;
        if (lightImageUrl) {
            const isOurS3 = lightImageUrl.includes('mantram-media-assets.s3') || lightImageUrl.includes('.amazonaws.com');
            if (!isOurS3) {
                try {
                    const s3Url = await mirrorUrlToS3(lightImageUrl, `brand-kit/${brandId || 'anon'}/${slug}-${lightAssetDef.subType}.png`);
                    if (s3Url) finalLightUrl = s3Url;
                } catch (_) { /* use original */ }
            }
        }

        if (finalLightUrl) {
            console.log(`🎨 [Identity] Primary light board generated: ${finalLightUrl}. Generating remaining assets using it as visual reference...`);
            
            const lightAssetObj = {
                name: lightAssetDef.name,
                assetSubType: lightAssetDef.subType,
                imageUrl: finalLightUrl,
                prompt: lightPrompt,
                format: 'image',
                width: 1792,
                height: 1024,
                thumbnailUrl: finalLightUrl,
            };
            assets.push(lightAssetObj);

            // Step 2: Generate the remaining 4 assets in parallel using the generated light board as the reference image
            const remainingDefs = IDENTITY_ASSETS.filter(a => a.subType !== 'identity-system-light');
            const remainingResults = await Promise.allSettled(
                remainingDefs.map(async (asset) => {
                    const prompt = prompts?.[asset.subType] || getFallbackPrompt(asset.subType, activeCollateralBrief, brandName)
                        || `Professional ${asset.desc} for ${brandName} brand. Premium brand identity quality.`;

                    // Pass finalLightUrl as the existingLogoUrl reference!
                    const imageUrl = await generateIdentityImage({
                        prompt,
                        size: asset.size,
                        subType: asset.subType,
                        colors,
                        existingLogoUrl: finalLightUrl,
                    });

                    let finalUrl = imageUrl;
                    if (imageUrl) {
                        const isOurS3 = imageUrl.includes('mantram-media-assets.s3') || imageUrl.includes('.amazonaws.com');
                        if (!isOurS3) {
                            try {
                                const s3Url = await mirrorUrlToS3(imageUrl, `brand-kit/${brandId || 'anon'}/${slug}-${asset.subType}.png`);
                                if (s3Url) finalUrl = s3Url;
                            } catch (_) { /* use original */ }
                        }
                    }

                    return {
                        name: asset.name,
                        assetSubType: asset.subType,
                        imageUrl: finalUrl,
                        prompt,
                        format: 'image',
                        width: asset.size.includes('1792') ? 1792 : 1024,
                        height: asset.size.includes('1024') ? 1024 : 1024,
                        thumbnailUrl: finalUrl,
                    };
                })
            );

            const remainingAssets = remainingResults
                .filter(r => r.status === 'fulfilled' && r.value.imageUrl)
                .map(r => r.value);
            
            assets.push(...remainingAssets);
        } else {
            // Step 3 (Fallback): If the primary light board failed, generate all 5 in parallel from text
            console.warn(`⚠️ [Identity] Primary light board failed. Falling back to parallel text-only generation for all assets.`);
            const results = await Promise.allSettled(
                IDENTITY_ASSETS.map(async (asset) => {
                    const prompt = prompts?.[asset.subType] || getFallbackPrompt(asset.subType, activeCollateralBrief, brandName)
                        || `Professional ${asset.desc} for ${brandName} brand. Premium brand identity quality.`;

                    const imageUrl = await generateIdentityImage({
                        prompt,
                        size: asset.size,
                        subType: asset.subType,
                        colors,
                        existingLogoUrl: null,
                    });

                    let finalUrl = imageUrl;
                    if (imageUrl) {
                        const isOurS3 = imageUrl.includes('mantram-media-assets.s3') || imageUrl.includes('.amazonaws.com');
                        if (!isOurS3) {
                            try {
                                const s3Url = await mirrorUrlToS3(imageUrl, `brand-kit/${brandId || 'anon'}/${slug}-${asset.subType}.png`);
                                if (s3Url) finalUrl = s3Url;
                            } catch (_) { /* use original */ }
                        }
                    }

                    return {
                        name: asset.name,
                        assetSubType: asset.subType,
                        imageUrl: finalUrl,
                        prompt,
                        format: 'image',
                        width: asset.size.includes('1792') ? 1792 : 1024,
                        height: asset.size.includes('1024') ? 1024 : 1024,
                        thumbnailUrl: finalUrl,
                    };
                })
            );
            assets = results
                .filter(r => r.status === 'fulfilled' && r.value.imageUrl)
                .map(r => r.value);
        }
    }

    console.log(`✅ [Identity] Generated ${assets.length}/${IDENTITY_ASSETS.length} identity system assets`);

    if (assets.length === 0) {
        return {
            success: false,
            error: 'Failed to generate any brand identity assets',
        };
    }

    return {
        success: true,
        assetType: 'identity',
        artStrategy,
        assets,
        brandContext,
    };
}
