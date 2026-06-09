/**
 * Identity Agent — Logo, Brand Mark, Favicon, Color Swatch, Typography Poster
 *
 * Pipeline:
 *   1. Art Director Agent → brand archetype + design strategy + image prompts
 *   2. GPT-Image-2 → generate all identity assets in parallel
 *   3. S3 upload → hosted URLs returned
 */

import { laozhangImageGenerate } from '../videoStudio/laozhangClient.js';
import { mirrorUrlToS3 } from '../../utils/s3.js';
import { runArtDirector } from './artDirectorAgent.js';
import { v4 as uuidv4 } from 'uuid';


const GPT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// Identity asset definitions
const IDENTITY_ASSETS = [
    { subType: 'logo-primary-light', name: 'Primary Logo (Light Background)', size: '1024x1024', aspect: 'square' },
    { subType: 'logo-primary-dark', name: 'Primary Logo (Dark Background)', size: '1024x1024', aspect: 'square' },
    { subType: 'logo-icon-mark', name: 'Icon Mark / Brand Symbol', size: '1024x1024', aspect: 'square' },
    { subType: 'favicon', name: 'App Icon / Favicon', size: '1024x1024', aspect: 'square' },
    { subType: 'brand-stamp', name: 'Brand Stamp / Seal', size: '1024x1024', aspect: 'square' },
];

// Fallback prompts if Art Director returns incomplete data
const FALLBACK_PROMPTS = {
    'logo-primary-light': 'Minimalist brand logo on pure white background, single color mark with wordmark, professional geometric design, generous negative space, studio lighting, ultra sharp, premium brand identity quality',
    'logo-primary-dark': 'Minimalist brand logo on deep black/navy background, white or gold mark with wordmark, premium geometric design, negative space, ultra sharp, luxury brand quality',
    'logo-icon-mark': 'Abstract brand icon mark, geometric symbol, single color, white background, scalable logo design, bold and simple, Pentagram-quality brand mark',
    'favicon': 'Square app icon design, bold geometric icon, vibrant gradient or solid color background, white symbol centered, iOS/Android app icon quality, ultra sharp',
    'brand-stamp': 'Circular brand stamp seal design, outer ring text, central icon, professional embossed look, single color, premium seal quality, fine detail',
};

async function generateIdentityImage(prompt, size, subType, brandName, colors) {
    // Inject brand color cue and anti-text instruction
    const colorCue = colors?.length > 0 ? ` Primary brand color: ${colors[0].hex} (${colors[0].name}).` : '';
    const fullPrompt = `${prompt}${colorCue} No text, words, letters, or typography visible — pure visual logo mark only. Ultra high resolution, print-ready quality, photorealistic rendering.`;

    try {
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

export async function generateBrandIdentity({ brandId, brief, briefBrand, scope = 'brand', imageModel }) {
    const slug = uuidv4().substring(0, 8);

    console.log(`🎨 [Identity] Running Art Director analysis...`);

    // Stage 1: Art Director — brand archetype + prompt engineering
    const { artStrategy, prompts, brandContext, brand } = await runArtDirector({
        brandId,
        brief,
        scope,
        assetType: 'brand-identity',
        assetSpecs: IDENTITY_ASSETS.map(a => a.subType),
        briefBrand,
    });

    const colors = brand?.dna?.colors || briefBrand?.colors || [];
    const brandName = brand?.name || briefBrand?.name || 'Brand';

    console.log(`🎨 [Identity] Generating ${IDENTITY_ASSETS.length} identity assets in parallel...`);

    // Stage 2: Generate all identity images in parallel
    const results = await Promise.allSettled(
        IDENTITY_ASSETS.map(async (asset) => {
            const prompt = prompts?.[asset.subType] || FALLBACK_PROMPTS[asset.subType] || `Professional ${asset.name} for ${brandName} brand, minimal design, premium quality`;
            const imageUrl = await generateIdentityImage(prompt, asset.size, asset.subType, brandName, colors);

            // Upload to S3 for permanence
            let finalUrl = imageUrl;
            if (imageUrl) {
                try {
                    const s3Url = await mirrorUrlToS3(imageUrl, `brand-kit/${brandId || 'anon'}/${slug}-${asset.subType}.png`);
                    if (s3Url) finalUrl = s3Url;
                } catch (_) { /* use original URL */ }
            }

            return {
                name: asset.name,
                assetSubType: asset.subType,
                imageUrl: finalUrl,
                prompt,
                format: 'image',
                width: 1024,
                height: 1024,
                thumbnailUrl: finalUrl,
            };
        })
    );

    const assets = results
        .filter(r => r.status === 'fulfilled' && r.value.imageUrl)
        .map(r => r.value);

    console.log(`✅ [Identity] Generated ${assets.length}/${IDENTITY_ASSETS.length} assets`);

    return {
        success: true,
        assetType: 'identity',
        artStrategy,
        assets,
        brandContext,
    };
}
