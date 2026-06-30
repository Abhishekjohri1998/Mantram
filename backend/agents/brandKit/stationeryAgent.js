/**
 * Stationery Agent — Business Card, Letterhead, Email Signature, Visiting Card, Brand Envelope
 *
 * Uses Art Director intelligence to design stationery with correct:
 * - Color blocking & hierarchy
 * - Typography placement
 * - Material/finish references (matte, foil, emboss)
 * - 2026 print design trends
 */

import { laozhangImageGenerate, laozhangGptImageWithRefs } from '../videoStudio/laozhangClient.js';
import { callAgentText } from '../shared/agentUtils.js';
import { runArtDirector } from './artDirectorAgent.js';
import { mirrorUrlToS3 } from '../../utils/s3.js';
import { v4 as uuidv4 } from 'uuid';

const GPT_IMAGE_MODEL = 'gemini-3.1-flash-image';

const STATIONERY_ASSETS = [
    { subType: 'business-card-front', name: 'Business Card (Front)', size: '1792x1024', desc: '3.5x2 inch, horizontal' },
    { subType: 'business-card-back', name: 'Business Card (Back)', size: '1792x1024', desc: '3.5x2 inch, horizontal, back side' },
    { subType: 'letterhead', name: 'A4 Letterhead', size: '1024x1024', desc: 'A4 portrait, full page' },
    { subType: 'envelope', name: 'Brand Envelope', size: '1792x1024', desc: 'DL envelope, horizontal' },
    { subType: 'brand-stamp-seal', name: 'Wax Seal / Brand Stamp', size: '1024x1024', desc: 'Circular stamp' },
];

// Email signature is HTML, not image
const EMAIL_SIG_PROMPT = (brand, artStrategy, contactDetails) => `You are a premium HTML email signature designer.
Design an elegant, modern HTML email signature for this brand.

BRAND: ${brand?.name || contactDetails?.company || 'Brand'}
DESIGN MOVEMENT: ${artStrategy?.designMovement || 'Contemporary'}
PRIMARY COLOR: ${brand?.dna?.colors?.[0]?.hex || '#2B4BEE'}
CONTACT PERSON: ${contactDetails?.name || '[Name]'}
TITLE: ${contactDetails?.title || '[Title]'}
PHONE: ${contactDetails?.phone || '+91 00000 00000'}
EMAIL: ${contactDetails?.email || 'hello@brand.com'}
WEBSITE: ${brand?.website || contactDetails?.website || 'www.brand.com'}

Design rules:
- Clean table-based layout (email client compatible)
- Max width 500px
- Logo placeholder as colored block with brand initial
- Thin 3px brand color left border as accent
- System fonts only: Arial, Helvetica, sans-serif
- Subtle divider lines
- Social icons as text links (Instagram | LinkedIn | Twitter)
- No images (use CSS shapes for logo placeholder)

Return ONLY the complete HTML <table> code for the signature, nothing else.`;

async function generateStationeryImage(prompt, size, subType, brandName, colors, artStrategy, activeLogoUrl = null) {
    const primaryColor = colors?.[0]?.hex || '#2B4BEE';
    const accentColor = colors?.[1]?.hex || colors?.[0]?.hex || '#FF4D00';

    const styleEnhancer = ` Color palette: primary ${primaryColor}, accent ${accentColor}. ${artStrategy?.designMovement || 'Contemporary'} design movement. No text, words, or typography visible — only the visual design layout and color blocks. Ultra high resolution, professional print design quality.`;

    const fullPrompt = prompt + styleEnhancer;

    try {
        // If a brand logo/identity board exists, use it as a visual reference to stay on-brand
        if (activeLogoUrl) {
            console.log(`🎨 [Stationery] Using brand identity reference for ${subType}...`);
            const result = await laozhangGptImageWithRefs(fullPrompt, [activeLogoUrl], {
                model: GPT_IMAGE_MODEL,
                size,
            });
            return result?.imageUrl || null;
        }

        // No reference image — generate from brand colors + strategy alone
        const result = await laozhangImageGenerate(fullPrompt, {
            model: GPT_IMAGE_MODEL,
            size,
        });
        return result?.imageUrl || null;
    } catch (err) {
        console.error(`❌ Stationery image failed for ${subType}:`, err.message);
        return null;
    }
}

export async function generateStationeryKit({ brandId, brief, briefBrand, contactDetails = {}, imageModel, existingLogoUrl = null }) {
    const slug = uuidv4().substring(0, 8);

    console.log(`🎨 [Stationery] Running Art Director analysis...`);

    const { artStrategy, prompts, brandContext, brand, activeLogoUrl: resolvedLogoUrl } = await runArtDirector({
        brandId,
        brief: brief || 'Professional stationery kit',
        scope: 'brand',
        assetType: 'stationery',
        assetSpecs: STATIONERY_ASSETS.map(a => a.subType),
        briefBrand,
        existingLogoUrl,
    });

    // Use the caller-provided logo, or the one resolved by Art Director from the Brand DB
    const activeLogoUrl = existingLogoUrl || resolvedLogoUrl || null;
    if (activeLogoUrl) {
        console.log(`🎨 [Stationery] Brand identity reference found — will use for visual grounding: ${activeLogoUrl}`);
    } else {
        console.log(`🎨 [Stationery] No brand identity reference — generating from color/strategy context only.`);
    }

    const colors = brand?.dna?.colors || briefBrand?.colors || [];
    const brandName = brand?.name || briefBrand?.name || contactDetails?.company || 'Brand';

    console.log(`🎨 [Stationery] Generating ${STATIONERY_ASSETS.length} stationery pieces...`);

    // Generate stationery images in parallel
    const imageResults = await Promise.allSettled(
        STATIONERY_ASSETS.map(async (asset) => {
            let contactDetailsCue = '';
            if (asset.subType.startsWith('business-card') || asset.subType === 'envelope' || asset.subType === 'letterhead') {
                const parts = [];
                if (contactDetails?.name) parts.push(`Name: ${contactDetails.name}`);
                if (contactDetails?.title) parts.push(`Title: ${contactDetails.title}`);
                if (contactDetails?.email) parts.push(`Email: ${contactDetails.email}`);
                if (contactDetails?.phone) parts.push(`Phone: ${contactDetails.phone}`);
                if (contactDetails?.website || brand?.website) parts.push(`Website: ${brand?.website || contactDetails.website}`);
                if (parts.length > 0) {
                    contactDetailsCue = ` The design layout must explicitly incorporate and display the following contact details clearly and legibly: ${parts.join(', ')}.`;
                }
            }

            const logoRef = activeLogoUrl ? ` Reference the provided brand identity system image to extract the logo, color palette, and visual language — apply them faithfully to this ${asset.name} design.` : '';
            const categoryCue = artStrategy?.brandCategory
                ? ` Emphasize category styling for ${artStrategy.brandCategory}. Rules: ${(artStrategy.categoryStylingRules || []).join(', ')}.`
                : '';
            const fallbackPrompt = `Professional ${asset.name} for ${brandName} brand, ${asset.desc}, premium print design, clean layout with logo placement area, brand color blocking, ${artStrategy?.designMovement || 'modern'} aesthetic.${categoryCue}${logoRef}`;
            const prompt = (prompts?.[asset.subType] || fallbackPrompt) + logoRef + contactDetailsCue;

            const imageUrl = await generateStationeryImage(prompt, asset.size, asset.subType, brandName, colors, artStrategy, activeLogoUrl);
            let finalUrl = imageUrl;
            if (imageUrl) {
                try {
                    const s3Url = await mirrorUrlToS3(imageUrl, `brand-kit/${brandId || 'anon'}/${slug}-${asset.subType}.png`);
                    if (s3Url) finalUrl = s3Url;
                } catch (_) {}
            }

            return {
                name: asset.name,
                assetSubType: asset.subType,
                imageUrl: finalUrl,
                prompt,
                format: 'image',
                thumbnailUrl: finalUrl,
            };
        })
    );

    // Generate email signature HTML (using Claude)
    let emailSigAsset = null;
    try {
        console.log(`🎨 [Stationery] Generating HTML email signature...`);
        const sigHtml = await callAgentText(
            EMAIL_SIG_PROMPT(brand || briefBrand, artStrategy, contactDetails),
            `Create the email signature HTML for ${brandName}`,
            0.5, 2000
        );
        emailSigAsset = {
            name: 'Email Signature (HTML)',
            assetSubType: 'email-signature',
            htmlContent: sigHtml,
            format: 'html',
        };
    } catch (err) {
        console.error('❌ Email signature generation failed:', err.message);
    }

    const assets = [
        ...imageResults
            .filter(r => r.status === 'fulfilled' && r.value.imageUrl)
            .map(r => r.value),
        ...(emailSigAsset ? [emailSigAsset] : []),
    ];

    console.log(`✅ [Stationery] Generated ${assets.length} stationery assets`);

    return {
        success: true,
        assetType: 'stationery',
        artStrategy,
        assets,
        brandContext,
    };
}
