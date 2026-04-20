/**
 * productDesignAgent.js — Product Design Intelligence (PDI) Layer
 *
 * Architecture:
 *  1. analyzeProductDesign    — MCoT Gemini vision: extracts colors, materials, shape, mood
 *  2. generateMoodBoardImages — NanoBanana 2: 4 style-direction mood images (parallel)
 *  3. buildColorGuardInstruction — generates the per-prompt color lock block
 *  4. buildDesignDirective    — synthesizes the full creative brief for downstream generators
 *
 * All generators (A+, Deck, Email, Page) consume the output of this agent.
 */

import { callMultimodalAgent } from './agentUtils.js';
import { laozhangImageGenerate } from '../videoStudio/laozhangClient.js';

// ── Mood Direction Definitions ──────────────────────────────────────────────────
const MOOD_DIRECTIONS = {
    editorial: {
        id: 'editorial',
        label: 'Editorial Clean',
        description: 'Clean, precise, professional — magazine-grade studio perfection',
        shootDirective: 'Pure white or very light grey background, soft even front-fill lighting, product perfectly centered with crisp drop shadow, award-winning product photography. Think: Apple.com, Muji catalogue.',
        moodBoardDirective: `
Create a professional DESIGNER MOOD BOARD — a curated multi-panel collage. This is NOT a product photo.
The mood board must contain ALL of these visual elements arranged in a clean grid layout:
1. THREE large solid-color swatch rectangles: pure white (#FFFFFF), warm off-white (#F5F0EA), light warm grey (#E8E4DF) — these should be prominent flat-color blocks
2. ONE material texture close-up panel: smooth linen fabric, uncoated paper grain, or fine matte concrete surface — extreme macro detail
3. TWO editorial photography vignettes: minimal white studio interior with diffused natural light, flat-lay of minimal objects on white marble surface
4. ONE typographic geometry panel: clean sans-serif letterform shapes as abstract graphic design elements
Overall chromatic theme: white-dominant, neutral, restrained, crisp — magazine editorial quality
Layout: think Behance moodboard, agency creative brief, Kinfolk editorial, Apple product direction
CRITICAL: Do NOT show any product. Do NOT render readable text, words, or numbers. Fill entire frame.`,
    },
    bold: {
        id: 'bold',
        label: 'Bold Ambient',
        description: 'Dramatic, moody, powerful — dark environments with cinematic rim light',
        shootDirective: 'Very dark background (#0d0d0d or deep navy), dramatic directional rim lighting from behind creating a glow or halo, high contrast, cinematic quality. Think: PlayStation, Bang & Olufsen, Monster Energy.',
        moodBoardDirective: `
Create a professional DESIGNER MOOD BOARD — a dark cinematic collage. This is NOT a product photo.
The mood board must contain ALL of these visual elements in a dramatic grid:
1. THREE large solid-color swatch rectangles: near-black (#0D0D0D), deep navy-purple (#1A0D2E), electric accent (vivid neon blue or purple #7B2FFF) — prominent flat-color blocks
2. ONE material texture panel: brushed dark metal surface, carbon fiber weave, or polished volcanic basalt — extreme close-up
3. TWO atmospheric photography vignettes: night cityscape with neon reflections in wet pavement, dark industrial space with single dramatic light beam
4. ONE bold graphic element: sharp geometric angular shapes, high-contrast black-and-light abstract composition
Overall chromatic theme: near-black dominant with electric accent highlights — cinematic, premium, powerful
Layout: think gaming brand moodboard, Sony PlayStation, Apple Dark Mode direction, Rolls-Royce campaign
CRITICAL: Do NOT show any product. Do NOT render readable text, words, or numbers. Fill entire frame.`,
    },
    lifestyle: {
        id: 'lifestyle',
        label: 'Lifestyle Vibrant',
        description: 'Real-world, human, contextual — aspirational but relatable',
        shootDirective: 'Real-world environment appropriate for how the product is used, natural warm light, human element implied, editorial lifestyle photography. Think: Glossier, Away Luggage, Oatly.',
        moodBoardDirective: `
Create a professional DESIGNER MOOD BOARD — a warm lifestyle editorial collage. This is NOT a product photo.
The mood board must contain ALL of these visual elements:
1. THREE large solid-color swatch rectangles: warm terracotta (#C97B5A), soft sage green (#8FA888), warm sand/cream (#E8D5B7) — prominent flat-color blocks
2. ONE material texture panel: natural linen fabric weave, warm oak wood grain, or woven rattan — extreme close-up macro shot
3. TWO lifestyle photography vignettes: sunlit kitchen corner with ceramic bowls and trailing plants, outdoor golden-hour table setting with warm drink and shadow play
4. ONE botanical accent panel: macro close-up of dried botanicals, eucalyptus leaves, or pressed flowers — design element
Overall chromatic theme: warm earth tones, natural materials, golden light — approachable, human, aspirational
Layout: think D2C brand moodboard, Kinfolk magazine, Glossier creative direction, Away luggage campaign
CRITICAL: Do NOT show any product. Do NOT render readable text, words, or numbers. Fill entire frame.`,
    },
    luxury: {
        id: 'luxury',
        label: 'Premium Minimal',
        description: 'Ultra-premium, spacious, sophisticated — luxury goods treatment',
        shootDirective: 'Extreme negative space, luxury surface textures (white marble, natural linen, brushed concrete) as backgrounds, single dramatic overhead or angled key light source, jewelry and luxury goods photography quality. Think: Bottega Veneta, Aesop, Bang & Olufsen.',
        moodBoardDirective: `
Create a professional DESIGNER MOOD BOARD — an ultra-premium minimalist collage. This is NOT a product photo.
The mood board must contain ALL of these visual elements with extreme negative space:
1. THREE large solid-color swatch rectangles: warm off-white (#F8F4EF), champagne gold (#C9A96E), deep charcoal (#2A2A2A) — prominent flat-color blocks with vast breathing room around them
2. ONE luxury material texture panel: white Carrara marble with fine gold veins, or smooth ivory sand stone, or lustrous raw silk — extreme close-up macro detail
3. TWO luxury editorial vignettes: extreme close-up of a fine leather edge or ceramic glaze, minimalist architectural interior with a single diagonal shaft of natural light
4. ONE fine art element: abstract gestural ink brushstroke or a minimal sculptural form on neutral ground
Overall chromatic theme: muted luxury neutrals, gold accent, whisper-quiet sophistication — extreme restraint
Layout: think Aesop, Bottega Veneta, Loro Piana, Frama Copenhagen, Hermès brand direction
CRITICAL: Do NOT show any product. Do NOT render readable text, words, or numbers. Fill entire frame.`,
    },
};

export { MOOD_DIRECTIONS };

// ── Step 1a: Per-Image Classification ─────────────────────────────────
/**
 * Quick per-image Gemini vision call — identifies what each image shows
 * and which A+ module type it's best suited for. Runs in parallel.
 */
async function classifyProductImageView(imageUrl) {
    const systemPrompt = `You are a product photography expert and Amazon listing consultant.
Analyze this SINGLE product image and classify it precisely.
Return ONLY a valid JSON object, no markdown, no extra text.`;

    const userPrompt = `Classify this product image precisely:
{
  "viewType": "hero|front_face|back_panel|open_case|in_use|macro_detail|packaging|variant_color|lifestyle|flat_lay|group_shot|side_profile|angle_shot",
  "shortDescription": "1 sentence: exactly what is visible in this specific image",
  "primaryColors": ["#hexcode of 2-3 most prominent colors actually visible in this image"],
  "materialsVisible": ["specific materials visible e.g. soft-touch matte plastic, brushed aluminum, silicone eartip"],
  "lightingStyle": "studio_clean|lifestyle_ambient|dark_dramatic|bright_airy|natural_outdoor",
  "usageFor": "hero_banner|feature_closeup|lifestyle_usage|comparison|brand_story|texture_detail",
  "productStateShown": "closed|open|in_use|assembled|disassembled|packaged|bare|with_accessories",
  "isHighConfidence": true or false (false if image is blurry, cluttered, or hard to analyze),
  "confidenceScore": 0.0 to 1.0
}`;

    try {
        const result = await callMultimodalAgent(systemPrompt, userPrompt, [imageUrl], {
            temperature: 0.1,
            maxTokens: 500,
        });
        return { url: imageUrl, ...result };
    } catch (err) {
        console.warn(`   PDI Stage-1: classify failed for image: ${err.message}`);
        return { url: imageUrl, viewType: 'unknown', usageFor: 'general', confidenceScore: 0.3, shortDescription: 'Classification failed' };
    }
}

// ── Step 1b: Composite DNA Synthesis ──────────────────────────────────
/**
 * Synthesize all per-image classifications into one composite ProductDNA.
 * Has visibility of ALL images simultaneously to resolve color conflicts.
 */
async function synthesizeProductDNA(roster, allImages, productData, brief) {
    const rosterSummary = roster.map((r, i) =>
        `Image ${i+1} [${r.viewType}]: ${r.shortDescription}. Colors: ${(r.primaryColors || []).join(', ')}. Materials: ${(r.materialsVisible || []).join(', ')}. Best for: ${r.usageFor}. Confidence: ${r.confidenceScore}`
    ).join('\n');

    const systemPrompt = `You are a world-class art director and product design analyst performing composite analysis across multiple product images.
You have already classified each image individually (see roster below). Now synthesize a complete ProductDNA.
Return ONLY a valid JSON object, no markdown, no extra text.`;

    const userPrompt = `Product: ${productData?.title || 'Unknown product'}
Bullet points: ${(productData?.bulletPoints || []).join(' | ')}
Brief: ${brief || 'General marketing content'}

PER-IMAGE CLASSIFICATION ROSTER:
${rosterSummary}

All ${allImages.length} product images are shown. Cross-reference them to identify TRUE product colors (consistent across views, not shadows/backgrounds).

Return the composite ProductDNA:
{
  "dominantColors": [
    {
      "hex": "#exact hex — must be CONSISTENT across multiple image views, not a shadow/background color",
      "name": "Signal Red | Cobalt Blue | etc",
      "role": "product_primary | product_secondary | product_body | product_accent | background_suggestion",
      "colorGuardInstruction": "This color is [hex]. NOT [similar misinterpretation]. Do NOT change.",
      "rgbRange": "R:200-220, G:30-50, B:30-50",
      "appearsInImages": [1, 2, 3]
    }
  ],
  "backgroundSuggestions": ["#hex (reason)", "#hex", "#hex"],
  "materials": "Precise composite material description across all views",
  "productShape": "Shape character — angular/rounded/organic/cylindrical/compact/elongated",
  "productCategory": "what type of product in 2-4 words",
  "moodTags": ["3-5 mood tags matching the product's character"],
  "defaultMoodDirection": "editorial | bold | lifestyle | luxury",
  "photographyStyle": "Recommended photography style based on what works best across all views",
  "lightingRecommendation": "Specific lighting setup recommended",
  "surfaceFinish": "matte | glossy | satin | textured | transparent | metallic",
  "colorDriftRisk": "low | medium | high",
  "designDirective": "2-sentence creative brief describing the product visual identity across all angles.",
  "heroViewIndex": 0-based index of the best hero/showcase image from the roster,
  "lifestyleViewIndex": 0-based index of the best lifestyle/in-use image, or null if none,
  "detailViewIndex": 0-based index of the best macro/detail image, or null if none,
  "productStateNotes": "key observation about how different product states (open/closed/in-use) affect the visual — useful for module image selection"
}`;

    try {
        return await callMultimodalAgent(systemPrompt, userPrompt, allImages, {
            temperature: 0.2,
            maxTokens: 2500,
        });
    } catch (err) {
        console.warn(`   PDI Stage-2 synthesis failed: ${err.message}`);
        return null;
    }
}

// ── Step 1: Analyze Product → ProductDNA (Two-Stage Agentic Pipeline) ─────────
/**
 * Stage 1: Classify each product image individually (parallel)
 * Stage 2: Synthesize all classifications into composite ProductDNA
 *
 * This approach correctly handles products with multiple distinct states
 * (e.g. earbuds: case closed, case open, in-use, macro detail) by identifying
 * which image shows which aspect and assigning them to appropriate module types.
 *
 * @param {string[]} productImages - Array of product image URLs
 * @param {object}   productData   - Scraped product data
 * @param {string}   brief         - User's generation brief
 * @returns {ProductDNA}
 */
export async function analyzeProductDesign(productImages = [], productData = {}, brief = '') {
    console.log(`PDI: Two-stage product analysis — ${productImages.length} images...`);

    if (!productImages.length) {
        return buildFallbackProductDNA(productData, brief);
    }

    // ── Stage 1: Classify each image individually (parallel) ──────────────────
    console.log(`   PDI Stage-1: Classifying ${productImages.length} images in parallel...`);
    const classifyResults = await Promise.allSettled(
        productImages.map(url => classifyProductImageView(url))
    );

    const roster = classifyResults.map((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        return { url: productImages[i], viewType: 'unknown', usageFor: 'general', confidenceScore: 0.3, shortDescription: 'Analysis failed' };
    }).sort((a, b) => (b.confidenceScore || 0) - (a.confidenceScore || 0));

    roster.forEach((r, i) => console.log(`   PDI Stage-1 [${i+1}]: ${r.viewType} — ${r.shortDescription} (conf: ${r.confidenceScore})`));

    // ── Stage 2: Composite DNA Synthesis (all images + roster) ───────────────
    console.log(`   PDI Stage-2: Synthesizing composite DNA from ${productImages.length} views...`);
    const dna = await synthesizeProductDNA(roster, productImages, productData, brief);

    if (dna?.dominantColors?.length) {
        console.log(`   PDI: Extracted ${dna.dominantColors.length} colors, mood: ${dna.defaultMoodDirection}`);
        console.log(`   PDI: Hero view: ${dna.heroViewIndex ?? 0} | Lifestyle: ${dna.lifestyleViewIndex ?? 'none'} | Detail: ${dna.detailViewIndex ?? 'none'}`);

        // Resolve image URLs from roster indices
        const heroUrl = roster[dna.heroViewIndex ?? 0]?.url || productImages[0];
        const lifestyleUrl = dna.lifestyleViewIndex != null ? roster[dna.lifestyleViewIndex]?.url : null;
        const detailUrl = dna.detailViewIndex != null ? roster[dna.detailViewIndex]?.url : null;

        // Build the image roster with resolved URLs for downstream builders
        dna.productImageRoster = roster;
        dna.heroImageUrl = heroUrl;
        dna.lifestyleImageUrl = lifestyleUrl;
        dna.detailImageUrl = detailUrl;

        // productRefImages: 3 most diverse images (hero + lifestyle + detail, then fill with high-confidence)
        const diverseSet = [heroUrl, lifestyleUrl, detailUrl].filter(Boolean);
        const remaining = roster
            .filter(r => !diverseSet.includes(r.url) && r.confidenceScore > 0.4)
            .map(r => r.url);
        dna.productRefImages = [...new Set([...diverseSet, ...remaining])].slice(0, 4);

        dna.analyzedAt = new Date().toISOString();
        dna.analysisStages = { imagesClassified: productImages.length, rosterSize: roster.length };
        return dna;
    }

    console.warn(`   PDI: Synthesis returned no colors — falling back to single-pass analysis`);

    // Last resort: single-pass with all images (original behaviour)
    try {
        const result = await callMultimodalAgent(
            `You are a product design analyst. Analyze product images and extract visual DNA. Return ONLY valid JSON, no markdown.`,
            `Product: ${productData?.title || 'Unknown'}\nBrief: ${brief}\nExtract dominantColors (with hex, name, role, colorGuardInstruction), materials, productShape, productCategory, moodTags, defaultMoodDirection, photographyStyle, lightingRecommendation, surfaceFinish, colorDriftRisk, designDirective.`,
            productImages,
            { temperature: 0.2, maxTokens: 2000 }
        );
        if (result?.dominantColors?.length) {
            result.productRefImages = productImages.slice(0, 3);
            result.productImageRoster = roster;
            result.analyzedAt = new Date().toISOString();
            return result;
        }
    } catch (err) {
        console.warn(`   PDI: Fallback single-pass failed: ${err.message}`);
    }

    return buildFallbackProductDNA(productData, brief);
}

// ── Fallback ProductDNA (when no images available) ────────────────────────────
function buildFallbackProductDNA(productData, brief) {
    return {
        dominantColors: [],
        backgroundSuggestions: ['#FFFFFF (clean white)', '#F5F5F5 (soft grey)', '#1A1A1A (premium dark)'],
        materials: 'unknown',
        productShape: 'unknown',
        productCategory: productData?.category || 'consumer product',
        moodTags: ['modern', 'clean', 'professional'],
        defaultMoodDirection: 'editorial',
        photographyStyle: 'studio clean with neutral background',
        lightingRecommendation: 'soft front-fill lighting',
        surfaceFinish: 'unknown',
        colorDriftRisk: 'low',
        designDirective: `Premium product photography. Clean aesthetic, professional quality. ${brief ? `Context: ${brief}.` : ''}`,
        productRefImages: [],
        analyzedAt: new Date().toISOString(),
        isFallback: true,
    };
}

// ── Step 2: Generate Mood Board Images ────────────────────────────────────────
/**
 * Generate 4 mood direction images using NanoBanana 2.
 * Uses Promise.allSettled so partial failures don't block the whole board.
 *
 * @param {object} productDNA - Output from analyzeProductDesign
 * @param {string} brandContext - Brand DNA string
 * @returns {{ moods: MoodImage[] }}
 */
export async function generateMoodBoardImages(productDNA, brandContext = '') {
    console.log(`PDI: Generating 4 designer mood boards (product-anchored)...`);

    // ── Build rich product context from DNA ──────────────────────────────────
    const productColors = (productDNA.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .slice(0, 5);

    // Strong color anchor — explicit hex codes extracted from the real product
    const colorHexList = productColors.map(c => c.hex).filter(Boolean).join(', ');
    const colorNameList = productColors.map(c => `${c.name} (${c.hex})`).join(', ');

    const colorAnchor = productColors.length
        ? [
            `PRODUCT COLOR PALETTE — EXTRACTED FROM ACTUAL PRODUCT:`,
            `The attached product images show the real product. Its dominant colors are: ${colorNameList}.`,
            `These hex values MUST anchor the mood board's color swatch blocks: ${colorHexList}.`,
            `The color swatches in the mood board should be built from these exact extracted tones, extended with complementary and analogous colors that harmonize with them.`,
          ].join('\n')
        : `Use an inspiring, brand-appropriate color palette. Harmonize swatches to feel cohesive and premium.`;

    const productProfile = [
        `PRODUCT PROFILE (use this to shape the mood board's aesthetic language):`,
        `- Product category: ${productDNA.productCategory || 'consumer product'}`,
        `- Materials: ${productDNA.materials || 'premium finish'}`,
        `- Surface: ${productDNA.surfaceFinish || 'refined'}`,
        `- Shape character: ${productDNA.productShape || 'compact form'}`,
        `- Design mood tags: ${(productDNA.moodTags || []).join(', ') || 'modern, clean, premium'}`,
        `- Brand design directive: ${productDNA.designDirective || 'Premium aesthetic, clean and consistent visual identity.'}`,
        productDNA.photographyStyle ? `- Photography style: ${productDNA.photographyStyle}` : '',
        brandContext ? `- Brand context: ${brandContext.substring(0, 180).replace(/\n/g, ' ')}` : '',
    ].filter(Boolean).join('\n');

    // Prefer diverse angles from roster: hero + lifestyle/in-use + macro detail
    const roster = productDNA.productImageRoster || [];
    const heroImg = productDNA.heroImageUrl || roster.find(r => r.viewType === 'hero' || r.viewType === 'front_face')?.url;
    const lifestyleImg = productDNA.lifestyleImageUrl || roster.find(r => ['in_use', 'lifestyle', 'flat_lay'].includes(r.viewType))?.url;
    const detailImg = productDNA.detailImageUrl || roster.find(r => r.viewType === 'macro_detail')?.url;

    // Build a diverse 3-image set — different angles give the AI richer visual context
    const diversePick = [heroImg, lifestyleImg, detailImg]
        .filter(Boolean)
        .filter((url, i, arr) => arr.indexOf(url) === i); // dedupe

    // Fill remaining slots with high-confidence roster images not already included
    const fallbackPool = (productDNA.productRefImages || [])
        .filter(url => !diversePick.includes(url));

    const refImages = [...diversePick, ...fallbackPool]
        .filter(Boolean)
        .slice(0, 3);

    const hasRefImages = refImages.length > 0;

    // Import multimodal generator if we have images
    let laozhangMultimodalImageGenerate;
    if (hasRefImages) {
        const mod = await import('../videoStudio/laozhangClient.js');
        laozhangMultimodalImageGenerate = mod.laozhangMultimodalImageGenerate;
    }

    const moodImageJobs = Object.values(MOOD_DIRECTIONS).map(async (mood) => {

        const prompt = [
            // 1. What these reference images are (critical framing)
            hasRefImages
                ? `REFERENCE IMAGES: The attached images show the ACTUAL PRODUCT whose design DNA you must extract and use to anchor this mood board. Study the product's exact colors, material character, surface quality, and visual language. DO NOT reproduce or show the product in the output — use it only as a color and aesthetic reference.`
                : '',

            // 2. Color palette anchor
            colorAnchor,
            '',

            // 3. Product DNA profile
            productProfile,
            '',

            // 4. The actual mood board directive
            mood.moodBoardDirective.trim(),
            '',

            // 5. Hard composition rules
            `COMPOSITION RULES — STRICTLY FOLLOW:`,
            `- Output: a DESIGNER MOOD BOARD / VISUAL DIRECTION REFERENCE COLLAGE, NOT a product photograph`,
            `- Layout: multi-panel grid layout, like a Behance project mood board, agency creative brief, or Pinterest design board`,
            `- Fill entire frame with the collage — no padding or white canvas border visible`,
            `- Color swatch panels: clean flat solid-color rectangles using the EXTRACTED PRODUCT PALETTE from above`,
            `- Texture panels: macro close-up photography of relevant surface materials, very high detail`,
            `- Photography vignettes: atmospheric, evocative, editorial — match the ${mood.label} mood direction`,
            `- DO NOT show, imply, or include the actual product in the mood board`,
            `- DO NOT render any text, words, letters, numbers, or readable typography`,
            `- Photorealistic, 8K quality, art director level composition`,
        ].filter(Boolean).join('\n');

        try {
            let result;
            // FORCE TEXT-ONLY: Multimodal Image2Image causes the model to hallucinate details of the actual product 
            // inside the collage. To guarantee zero product hallucination, we strictly generate the environment layout via text.
            if (false && hasRefImages && laozhangMultimodalImageGenerate) {
                // Multimodal — AI sees the actual product for color extraction
                result = await laozhangMultimodalImageGenerate(prompt, refImages, {
                    model: 'gemini-3.1-flash-image-preview',
                    size: '1344x768',
                });
            } else {
                // Text-only fallback
                result = await laozhangImageGenerate(prompt, {
                    model: 'gemini-3.1-flash-image-preview',
                    size: '1344x768',
                });
            }

            if (result?.imageUrl) {
                console.log(`   PDI: Mood board generated — ${mood.id}`);
                return { ...mood, imageUrl: result.imageUrl, success: true };
            }
        } catch (err) {
            console.warn(`   PDI: Mood board failed for ${mood.id}: ${err.message}`);
        }
        return { ...mood, imageUrl: null, success: false };
    });

    const results = await Promise.allSettled(moodImageJobs);
    const moods = results.map((r, i) => r.status === 'fulfilled' ? r.value : { ...Object.values(MOOD_DIRECTIONS)[i], imageUrl: null, success: false });

    const successCount = moods.filter(m => m.success).length;
    console.log(`   PDI: ${successCount}/4 mood boards generated (${hasRefImages ? 'multimodal w/ product ref' : 'text-only fallback'})`);

    return { moods };
}

// ── Step 3: Build Color Guard Instruction ─────────────────────────────────────
/**
 * Generate the color-lock prompt block injected into EVERY image generation.
 * This is the most critical part of preventing product color drift.
 *
 * @param {object} productDNA - Output from analyzeProductDesign
 * @returns {string} - Color guard prompt block
 */
export function buildColorGuardInstruction(productDNA) {
    if (!productDNA?.dominantColors?.length) return '';

    const productColors = productDNA.dominantColors.filter(c => c.role !== 'background_suggestion');
    if (!productColors.length) return '';

    const colorList = productColors.map(c => {
        const star = c.role === 'product_primary' ? '★ PRIMARY' : '• SECONDARY';
        return `  ${star}: ${c.name} (${c.hex})${c.rgbRange ? ` [${c.rgbRange}]` : ''}\n    → ${c.colorGuardInstruction || `Preserve this exact color. Do NOT reinterpret, warm, cool, or stylize it.`}`;
    }).join('\n');

    const riskNote = productDNA.colorDriftRisk === 'high'
        ? '\n⚠️ HIGH COLOR DRIFT RISK: This product has colors that AI frequently misinterprets. Be extra precise.'
        : '';

    return `⚠️ PRODUCT COLOR GUARD — ABSOLUTE CONSTRAINT:
The product's physical colors are PERMANENTLY LOCKED. They CANNOT be changed under any circumstances.
${colorList}${riskNote}

IMMUTABLE RULE: The product is a FIXED physical object photographed in real life.
You MAY change: background, environment, lighting direction, scene context.
You MUST NOT: recolor, desaturate, tint, warm/cool, saturate, or stylize the product itself.
Material finish: ${productDNA.materials || 'as shown in reference'} — preserve this too.
Surface: ${productDNA.surfaceFinish || 'as shown'} — do not add gloss to a matte product or vice versa.
Think of the product as a composited photograph dropped into a new scene. It is PHYSICALLY FIXED.`.trim();
}

// ── Step 4: Build Full Design Directive ───────────────────────────────────────
/**
 * Synthesize the full design directive that flows into all creative generators.
 * Combines ProductDNA + selected mood + brand DNA into a locked creative brief.
 *
 * @param {object} productDNA     - Output from analyzeProductDesign
 * @param {string} selectedMoodId - 'editorial' | 'bold' | 'lifestyle' | 'luxury'
 * @param {string[]} brandColors  - Brand color hex codes from Brand DNA
 * @returns {object} designContext - Full design directive object
 */
export function buildDesignContext(productDNA, selectedMoodId, brandColors = []) {
    const mood = MOOD_DIRECTIONS[selectedMoodId] || MOOD_DIRECTIONS[productDNA?.defaultMoodDirection] || MOOD_DIRECTIONS.editorial;

    const colorGuardBlock = buildColorGuardInstruction(productDNA);

    const brandColorHints = brandColors.length
        ? `Brand palette for backgrounds/accents (NOT product): ${brandColors.map(c => `${c.hex}`).join(', ')}.`
        : '';

    const backgroundSuggestion = productDNA?.backgroundSuggestions?.[0] || '#FFFFFF';

    const systemDirective = `
DESIGN INTELLIGENCE ACTIVE:
${colorGuardBlock ? colorGuardBlock + '\n' : ''}
MOOD DIRECTION: ${mood.label} — ${mood.description}
${mood.systemDirective}

PRODUCT VISUAL PROFILE:
- Category: ${productDNA?.productCategory || 'consumer product'}
- Materials: ${productDNA?.materials || 'premium'}
- Shape: ${productDNA?.productShape || 'compact'}
- Photography style: ${productDNA?.photographyStyle || 'studio clean'}
- Lighting: ${productDNA?.lightingRecommendation || 'soft front fill'}
- Recommended background: ${backgroundSuggestion}
${brandColorHints}

CREATIVE DIRECTIVE:
${productDNA?.designDirective || 'Premium product photography with clean, consistent visual identity.'}
`.trim();

    // Extract actual hex values for downstream token overrides
    const colorGuardHex = (productDNA?.dominantColors || [])
        .filter(c => c.role !== 'background_suggestion')
        .map(c => c.hex)
        .filter(Boolean);

    return {
        systemDirective,
        colorGuardBlock,
        colorGuardHex,                                         // ← hex array for token overrides
        shootDirective: mood.shootDirective || mood.systemDirective || '', // ← per-shoot style
        moodId: mood.id,
        moodLabel: mood.label,
        moodSystemDirective: mood.shootDirective || mood.systemDirective || '',
        moodBoardDirective: mood.moodBoardDirective || '',
        productDNA,
        productRefImages: productDNA?.productRefImages || [],
        backgroundSuggestion,
    };
}

// ── Utility: Inject design context into any image generation prompt ───────────
/**
 * Prepend the design context to an image generation prompt.
 * Use this in every generateImage() call across all builders.
 *
 * @param {string} basePrompt     - The original image prompt
 * @param {object} designContext  - Output from buildDesignContext()
 * @returns {string}
 */
export function injectDesignContext(basePrompt, designContext) {
    if (!designContext?.systemDirective) return basePrompt;
    return `${designContext.systemDirective}\n\n---\nIMAGE TASK:\n${basePrompt}`;
}
