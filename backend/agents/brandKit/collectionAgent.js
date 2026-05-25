/**
 * Collection Agent — New Product Range / Collection Launch Pack Generator
 *
 * Generates a full campaign pack for:
 * - New Product Launch
 * - New Product Category / Range
 * - Seasonal Collection
 * - Limited Edition Drop
 *
 * Assets generated:
 * 1. Campaign Hero Banner (landscape 1792x1024)
 * 2. Story/Reel Cover (portrait 1024x1792)
 * 3. Instagram Square Post (1024x1024)
 * 4. Price Announcement Card (1024x1024)
 * 5. Product Lifestyle Hero (1024x1024)
 *
 * Plus: Campaign tagline, launch copy, 5 social captions — all via Claude
 */

import { laozhangImageGenerate } from '../videoStudio/laozhangClient.js';
import { callAgent, callAgentText } from '../shared/agentUtils.js';
import { runArtDirector } from './artDirectorAgent.js';
import { mirrorUrlToS3 } from '../../utils/s3.js';
import { v4 as uuidv4 } from 'uuid';

const GPT_IMAGE_MODEL = 'gemini-2.0-flash-exp';
const CLAUDE_MODEL = 'claude-sonnet-4-6';

const COLLECTION_ASSETS = [
    { subType: 'campaign-hero', name: 'Campaign Hero Banner', size: '1792x1024' },
    { subType: 'story-cover', name: 'Story / Reel Cover', size: '1024x1792' },
    { subType: 'instagram-square', name: 'Instagram Square Post', size: '1024x1024' },
    { subType: 'price-card', name: 'Price Announcement Card', size: '1024x1024' },
    { subType: 'lifestyle-hero', name: 'Lifestyle Product Hero', size: '1024x1024' },
];

const COPY_SYSTEM = (artStrategy, brandContext) => `You are the lead creative copywriter for a top D2C brand campaign.
Think David Abbott. Think Ogilvy. Write with conviction and creativity.

BRAND STRATEGY:
${JSON.stringify(artStrategy, null, 2).substring(0, 800)}

BRAND DNA:
${brandContext.substring(0, 600)}

COPY RULES:
1. Headlines should stop scrolling in 0.3 seconds
2. Body copy is brutally honest and human — never corporate
3. Use the brand's specific voice, not generic marketing speak
4. Reference the 2026 trend: ${artStrategy?.trend2026 || artStrategy?.designMovement}
5. Write for mobile-first consumption — short, punchy, direct
6. India market sensitivity if applicable`;

async function generateCollectionCopy(artStrategy, brand, briefBrand, collectionBrief, collectionType, scope) {
    const brandName = brand?.name || briefBrand?.name || 'Brand';
    return callAgent(
        COPY_SYSTEM(artStrategy, `Brand: ${brandName}`),
        `Create a complete launch campaign copy pack for:

BRAND: ${brandName}
COLLECTION TYPE: ${collectionType} (${scope})
COLLECTION BRIEF: ${collectionBrief}

Return JSON:
{
  "campaignName": "The campaign name / collection name",
  "tagline": "Hero tagline — max 8 words, must be iconic",
  "heroHeadline": "The main launch headline",
  "heroSubcopy": "Supporting sentence — 15-25 words",
  "ctaText": "Action CTA text",
  "priceCardHeadline": "Price announcement headline",
  "priceCardSubtext": "Context around the price / value",
  "storyCaption": "Caption for story/reel — 2-3 lines",
  "instagramCaption": "Full Instagram caption with hashtags — 80-120 words",
  "socialCaptions": [
    "Caption 1 — launch announcement",
    "Caption 2 — product feature focus", 
    "Caption 3 — behind the scenes / story",
    "Caption 4 — user benefit / transformation",
    "Caption 5 — urgency / FOMO driver"
  ],
  "launchEmailSubject": "Email subject line for launch",
  "whatsappBlast": "Short WhatsApp broadcast message — 50 words",
  "seoTitle": "SEO-optimized page title",
  "metaDescription": "Meta description 150 chars"
}`,
        0.85, 3000,
        { provider: 'anthropic', model: CLAUDE_MODEL, timeoutMs: 90_000 }
    );
}

export async function generateProductCollection({
    brandId, brief, briefBrand,
    collectionType = 'new-product', // 'new-product' | 'new-category' | 'seasonal' | 'limited-edition'
    scopeLabel = 'New Collection',
    scope = 'campaign',
    imageModel,
}) {
    const slug = uuidv4().substring(0, 8);

    console.log(`🚀 [Collection] Running Art Director for ${collectionType}...`);

    const { artStrategy, prompts, brandContext, brand } = await runArtDirector({
        brandId,
        brief: `${collectionType} launch: ${brief}`,
        scope: 'campaign',
        assetType: 'product-collection',
        assetSpecs: COLLECTION_ASSETS.map(a => a.subType),
        briefBrand,
    });

    const colors = brand?.dna?.colors || briefBrand?.colors || [];
    const brandName = brand?.name || briefBrand?.name || 'Brand';
    const primaryColor = colors[0]?.hex || '#2B4BEE';

    // Stage 2: Generate campaign copy (parallel with images)
    console.log(`🚀 [Collection] Generating campaign copy + visuals in parallel...`);

    const [copyResult, imageResults] = await Promise.allSettled([
        generateCollectionCopy(artStrategy, brand, briefBrand, brief, collectionType, scopeLabel),
        Promise.allSettled(
            COLLECTION_ASSETS.map(async (asset) => {
                const fallbackPrompt = buildFallbackPrompt(asset.subType, brandName, brief, artStrategy, primaryColor);
                const prompt = prompts?.[asset.subType] || fallbackPrompt;

                const fullPrompt = `${prompt}. Brand color: ${primaryColor}. ${artStrategy.designMovement} aesthetic. No text, letters, or typography in the image. Ultra high resolution, premium brand photography.`;

                try {
                    const result = await laozhangImageGenerate(fullPrompt, {
                        model: imageModel || GPT_IMAGE_MODEL,
                        size: asset.size,
                    });
                    let imageUrl = result?.imageUrl || null;
                    if (imageUrl) {
                        try {
                            const s3Url = await mirrorUrlToS3(imageUrl, `brand-kit/${brandId || 'anon'}/${slug}-collection-${asset.subType}.png`);
                            if (s3Url) imageUrl = s3Url;
                        } catch (_) {}
                    }
                    return { ...asset, imageUrl, prompt, format: 'image', thumbnailUrl: imageUrl };
                } catch (err) {
                    console.error(`❌ Collection image failed for ${asset.subType}:`, err.message);
                    return { ...asset, imageUrl: null, prompt, format: 'image' };
                }
            })
        )
    ]);

    const copy = copyResult.status === 'fulfilled' ? copyResult.value : {};
    const images = imageResults.status === 'fulfilled'
        ? imageResults.value.filter(r => r.status === 'fulfilled').map(r => r.value).filter(a => a.imageUrl)
        : [];

    console.log(`✅ [Collection] ${images.length} images + copy generated for ${collectionType}`);

    return {
        success: true,
        assetType: 'collection',
        collectionType,
        scopeLabel,
        artStrategy,
        copy,
        assets: images,
        brandContext,
    };
}

function buildFallbackPrompt(subType, brandName, brief, artStrategy, primaryColor) {
    const movement = artStrategy?.designMovement || 'contemporary premium';
    const mood = (artStrategy?.moodKeywords || ['premium', 'modern']).slice(0, 3).join(', ');
    const maps = {
        'campaign-hero': `Wide cinematic hero banner, product launch announcement, ${movement} design, dramatic composition, soft gradient background in brand colors, editorial photography quality, ${mood} mood, product center-frame with generous space`,
        'story-cover': `Vertical story format 9:16, bold visual impact for mobile screen, dramatic close-up or minimal product scene, ${movement} aesthetic, ${mood} energy, brand color accent, shallow depth of field`,
        'instagram-square': `Square format product shot, clean minimal composition, product hero with lifestyle context, ${movement} visual language, perfect studio lighting, ${mood} mood`,
        'price-card': `Clean pricing announcement graphic, bold typographic hierarchy (no actual text), brand colors, premium minimal layout, product silhouette or abstract visual, ${movement} style`,
        'lifestyle-hero': `Premium lifestyle product photography, real context environment, natural light, ${movement} aesthetic, ${mood} feel, product naturally integrated into scene, editorial quality`,
    };
    return maps[subType] || `Professional product campaign visual, ${movement} style, brand colors, premium quality`;
}
