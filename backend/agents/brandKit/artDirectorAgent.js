/**
 * Art Director Agent — The Brain of Brand Kit Studio
 *
 * This is the most important agent in the Brand Kit pipeline.
 * It thinks like a world-class senior art director at Pentagram, Collins, or Wolff Olins.
 *
 * Pipeline:
 *   Stage 1: BRAND ARCHETYPING — Maps brand to archetype + design movement + 2026 trend
 *   Stage 2: VISUAL STRATEGY — Decides color psychology, typography, mood, composition rules
 *   Stage 3: PROMPT ENGINEERING — Crafts hyper-specific GPT-Image-2 prompts per asset type
 *
 * Model: Claude Sonnet 4.6 (Anthropic) — best for creative reasoning + prompt craft
 * Trend source: Gemini with Google Search grounding — live 2026 design trends
 */

import { callAgent, loadBrandContext } from '../shared/agentUtils.js';
import { getRouter } from '../../ai/router.js';

const CLAUDE_MODEL = 'claude-sonnet-4-6';

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1: Brand Archetype + Design Movement + 2026 Trend Research
// ─────────────────────────────────────────────────────────────────────────────

const ARCHETYPE_SYSTEM = `You are a senior brand strategist and art director with 20+ years of experience at top creative agencies (Pentagram, Collins, Wolff Olins, IDEO).

Your task is to deeply analyze a brand and produce a precise creative strategy that will guide ALL visual asset generation.

BRAND ARCHETYPES (Jung-based, pick ONE primary + ONE secondary):
1. The Innocent — Pure, optimistic, simple. Brands: Dove, Innocent Smoothies
2. The Explorer — Adventure, freedom, discovery. Brands: Patagonia, Jeep
3. The Sage — Wisdom, knowledge, guidance. Brands: Google, TED, Headspace
4. The Hero — Courage, achievement, mastery. Brands: Nike, Adidas, Under Armour
5. The Outlaw — Rebellion, disruption, revolution. Brands: Harley Davidson, Supreme
6. The Magician — Transformation, vision, alchemy. Brands: Apple, Disney, Tesla
7. The Regular Guy — Belonging, reliability, community. Brands: IKEA, eBay
8. The Lover — Passion, beauty, sensuality. Brands: Victoria's Secret, Chanel
9. The Jester — Fun, humor, irreverence. Brands: Old Spice, Cards Against Humanity
10. The Caregiver — Nurture, compassion, service. Brands: Johnson & Johnson, WWF
11. The Ruler — Control, authority, leadership. Brands: Rolex, American Express
12. The Creator — Imagination, creativity, expression. Brands: Lego, Pinterest

2026 DESIGN MOVEMENTS (pick most relevant):
- Neo-Brutalism: Raw, bold typography, high contrast, grid-breaking layouts
- Quiet Luxury: Understated elegance, cream/beige tones, refined details, anti-logo
- Y2K Revival: Digital iridescence, chrome, pixel art nostalgia
- Biophilic Design: Nature-integrated, organic curves, earthy palettes
- Tech Minimalism: Ultra-clean, monochrome, mathematical precision (Apple 2026 era)
- Cultural Maximalism: Pattern-rich, saturated, globally-inspired
- New Sentimentalism: Emotional warmth, analog textures, handcrafted feel
- Hyper-Chromatic: Vibrant, saturated color blocking, dopamine design
- Dark Academia: Deep neutrals, intellectual, literary references
- Brutalist Revival: Structural, raw concrete textures, anti-aesthetic aesthetic

═══ CATEGORY & BRAND STYLING INTELLIGENCE ═══
Deeply analyze the brand's industry, product categories, target audience, and existing visual DNA:
- Tech & Smart Electronics: Emphasize tech minimalism, raw geometry, high-fidelity metal/glass textures, matte dark/light finishes, and clean lines.
- Wellness, Skincare & Cosmetics: Emphasize biophilic design, soft organic curves, warm lighting, natural textures (uncoated paper, stone, frosted amber/clear glass, linen).
- Premium Fashion & Apparel: Emphasize quiet luxury, editorial grids, high-fashion contrast, minimal raw details, and heavy typography-driven layouts.
- Food & Beverage: Emphasize cultural maximalism or New Sentimentalism, vivid sensory colors, organic warm lighting, and appetite-stimulating accents.
- Services & SaaS/Software: Emphasize clean tech minimalism, sharp vector grids, high-contrast digital layouts, and functional hierarchy.
Synthesize these category styling benchmarks with the brand's archetype, mission, and products.

CRITICAL OUTPUT RULES:
- Return valid JSON only
- Be SPECIFIC — not "modern" or "clean", but "Swiss International Typographic Style with humanist san-serif grid"
- Color reasoning must cite psychology + cultural context
- Every decision must be justified by the brand's DNA`;

async function researchBrandArchetype(brandContext, brief = '', scope = 'brand') {
    return callAgent(
        ARCHETYPE_SYSTEM,
        `Analyze this brand and brief. Return a precise creative strategy:

BRAND DNA:
${brandContext}

BRIEF / SCOPE: ${brief || 'Full brand identity kit'}
SCOPE TYPE: ${scope}

Return JSON:
{
  "brandArchetype": "Primary archetype name",
  "secondaryArchetype": "Secondary archetype name",
  "archetypeRationale": "Why these archetypes fit this specific brand...",
  "designMovement": "Exact 2026 design movement name",
  "movementRationale": "Why this movement fits...",
  "brandCategory": "Tech/Electronics | Wellness/Cosmetics | Fashion/Apparel | Food/Beverage | SaaS/Services | Other",
  "categoryStylingRules": [
    "Rule 1 regarding textures, finishes, or materials characteristic of this brand category",
    "Rule 2 regarding colors, lighting, or presentation format characteristic of this brand category",
    "Rule 3 regarding layout structure or composition rules characteristic of this brand category"
  ],
  "colorStrategy": {
    "primaryPsychology": "What the primary color communicates to the target audience",
    "paletteApproach": "e.g., 'Analogous with high-contrast accent', 'Monochromatic with warm neutrals'",
    "colorTemperature": "warm|cool|neutral",
    "saturationLevel": "vivid|muted|desaturated",
    "culturalNotes": "Any Indian market or target market color considerations"
  },
  "typographyStrategy": {
    "headingPersonality": "e.g., 'Geometric sans-serif for authority and modernity'",
    "bodyPersonality": "e.g., 'Humanist sans for approachability'",
    "typographicTension": "How heading and body create visual contrast",
    "sizingApproach": "e.g., 'Oversized display type for Gen Z impact'"
  },
  "visualRules": [
    "Always use asymmetric layouts — never center everything",
    "Photography must feature real people, not objects alone",
    "Textures should reference natural materials"
  ],
  "moodKeywords": ["raw", "authentic", "human", "bold"],
  "trend2026": "Specific 2026 trend being applied",
  "artDirectorNotes": "Comprehensive creative direction notes (150+ words) — what makes this brand kit unique, what to avoid, what visual language to build",
  "competitorDifferentiator": "How this visual identity will stand apart from typical competitors in this space"
}`,
        0.8, 3000,
        { provider: 'anthropic', model: CLAUDE_MODEL, timeoutMs: 90_000 }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2: Asset-Specific Prompt Engineering
// ─────────────────────────────────────────────────────────────────────────────

const PROMPT_ENGINEER_SYSTEM = (artStrategy, existingLogoUrl = null, collateralBrief = null) => `You are a world-class creative director and AI image prompt engineer at a top brand consultancy (Pentagram / Collins / Wolff Olins).
You specialize in writing hyper-specific, cinematic prompts for GPT-Image-2 that produce gallery-quality brand identity systems.

You are working within this creative strategy:
DESIGN MOVEMENT: ${artStrategy.designMovement}
BRAND ARCHETYPE: ${artStrategy.brandArchetype}
BRAND CATEGORY: ${artStrategy.brandCategory || 'Generic'}
CATEGORY STYLING RULES: ${(artStrategy.categoryStylingRules || []).join(' | ')}
COLOR STRATEGY: ${JSON.stringify(artStrategy.colorStrategy)}
TYPOGRAPHY: ${JSON.stringify(artStrategy.typographyStrategy)}
MOOD: ${(artStrategy.moodKeywords || []).join(', ')}
ART DIRECTOR NOTES: ${artStrategy.artDirectorNotes}
${existingLogoUrl ? `EXISTING LOGO: The brand has an existing logo that will be used as a reference image. Build all assets around it — do NOT reinvent the logo, extend its visual language.` : 'NO EXISTING LOGO: A new logo will be designed in the primary light system board, which will then serve as the visual reference image for all other assets.'}
${collateralBrief ? `COLLATERAL BRIEF: Additional real-world collateral to include in mockups: "${collateralBrief}"` : 'COLLATERAL: Standard brand touchpoints (packaging, bag, business card, cup).'}

═══ BRAND UNDERSTANDING & CATEGORY STYLING ═══
You must deeply analyze the BRAND CONTEXT (especially the Industry, Products, target audience, and existing Visual DNA).
1. Identify the brand's product category (e.g. Wellness/Cosmetics, Smart Electronics, Premium Fashion, Food/Beverage) and apply the appropriate visual branding style of that category (e.g. clean glass and organic green highlights for wellness, matte black/white with sharp edges for electronics, editorial high-fashion layout for apparel).
2. Incorporate actual products from the brand's catalog/description (e.g. if it's a skincare brand, describe amber glass dropper bottles) instead of generic placeholders.
3. Incorporate and respect the brand's visual DNA preferences (e.g. photography style, layout preference, textures, design rules, or avoid list) if provided in the BRAND CONTEXT.

═══ CRITICAL: IMAGE-TO-IMAGE / REFERENCE MODE RULES ═══
All prompts (except the initial 'identity-system-light' when no logo is provided) are executed in GPT-Image-2's image editing / reference mode.
You must instruct the AI to reference the provided image and extract/preserve its visual elements:
1. For 'identity-system-light': If there is an existing logo, instruct the AI to integrate it as the primary logo. If no logo, this is a text-to-image prompt (no reference).
2. For 'identity-system-dark': Instruct the AI to recreate the exact layout, logo, typography, and palette from the reference image, but reversed on a dark brand-colored background.
3. For 'identity-collateral': Instruct the AI to extract the primary logo design and color palette from the reference image and apply them onto the specified mockup objects (e.g. business cards, bags, boxes).
4. For 'logo-icon-mark': Instruct the AI to isolate the central symbol or logo mark shown in the reference image onto a plain white background, removing all surrounding grids, swatches, and typography specimen text.
5. For 'brand-stamp': Instruct the AI to place the logo symbol/monogram from the reference image into a clean circular seal stamp layout.

═══ CRITICAL: IDENTITY SYSTEM BOARD RULES ═══
For assets ending in 'identity-system-light' or 'identity-system-dark', the image MUST be a PROFESSIONAL BRAND IDENTITY BOARD showing:
1. PRIMARY LOGO — displayed prominently, clear and legible
2. LOGO VARIATIONS — at least 2-3 variations: reversed (white on dark), simplified icon, stacked version
3. COLOUR PALETTE — 4-6 swatches displayed as rectangular blocks, each labeled with its role (Primary, Secondary, Accent, Neutral)
4. TYPOGRAPHY SPECIMEN — headline typeface name + sample text, body typeface name + sample paragraph
5. VISUAL LANGUAGE — a texture, pattern or graphic device that defines the brand
All 5 elements must appear in ONE composed, grid-based layout. Think agency brand presentation slide or brand standards cover page.

For 'identity-collateral': Show the brand applied to ${collateralBrief || 'product packaging, tote bag, coffee cup, business card'} as photorealistic product mockups in a styled scene.

For 'logo-icon-mark': Isolated icon/symbol only — no system board needed.
For 'brand-stamp': Circular seal only.

═══ STATIONERY RULES (If generating stationery assets) ═══
For business cards, letterheads, and envelopes, design elegant layouts emphasizing the brand category's material/finish rules (e.g., uncoated texture for wellness, metallic matte for tech). Place contact information clearly, cleanly, and professionally. Ensure high contrast and absolute legibility.

═══ COLLECTION/CAMPAIGN RULES (If generating collection assets) ═══
For campaign banners and square posts, design high-end, category-aligned product hero or lifestyle visual backgrounds. Ground the image in the brand's top products and highlight key ingredients or features. No actual words/text must appear on the image.

═══ PROMPT ENGINEERING RULES FOR GPT-IMAGE-2 ═══
1. Start with LAYOUT TYPE, then ELEMENTS, then COMPOSITION, then LIGHTING, then FINISH
2. Use design/agency terminology: "Swiss grid", "rule of thirds", "Pantone palette", "Massimo Vignelli layout"
3. Reference print materials: "cold-pressed paper", "matte laminate", "uncoated stock"
4. Naturally reference the 1792x1024 wide-format canvas for system boards
5. Include material quality cues: "Adobe Illustrator vector precision", "agency brand deck quality"
6. Specify lighting: "flat studio lighting", "soft north-facing daylight", "Vogue editorial lighting"
7. Reference quality benchmarks: "Pentagram studio quality", "D&AD award-winning identity", "AIGA 50 books quality"
8. Use 2026 design markers: specific color temperatures, material trends, cultural codes
9. Each prompt must be 80-120 words, dense with compositional and visual information
10. For dark variants: specify "deep [brand color] background", "white reversed logo", "luminous palette display"`;

async function engineerAssetPrompts(artStrategy, brandContext, assetType, assetSpecs, existingLogoUrl, collateralBrief) {
    const router = getRouter();

    // Use Gemini with search for 2026 trend grounding on specific prompts
    try {
        const trendResult = await router.generateTextWithSearch({
            systemPrompt: `You are a design trend researcher. Research the LATEST 2026 visual design trends for brand identity systems in ${artStrategy.designMovement} style. Return 3 specific trend observations in JSON: { "trends": ["trend1", "trend2", "trend3"] }`,
            userPrompt: `2026 brand identity system design trends for ${artStrategy.brandArchetype} archetype brands`,
            temperature: 0.3,
            maxTokens: 500,
        });
        if (trendResult?.text) {
            try {
                const parsed = JSON.parse(trendResult.text.replace(/```json|```/g, '').trim());
                if (parsed.trends) artStrategy._liveTrends = parsed.trends.join(' | ');
            } catch (_) {}
        }
    } catch (_) {
        // Non-critical — proceed without live trends
    }

    const promptsSchemaDescription = assetSpecs.reduce((acc, spec) => {
        acc[spec] = `Cinematic GPT-Image-2 prompt for the ${spec} asset, incorporating the brand category styling rules and product context.`;
        return acc;
    }, {});

    return callAgent(
        PROMPT_ENGINEER_SYSTEM(artStrategy, existingLogoUrl, collateralBrief),
        `Generate precise GPT-Image-2 image prompts for the requested assets.

BRAND CONTEXT:
${brandContext}

ASSET TYPE: ${assetType}
ASSETS TO GENERATE: ${JSON.stringify(assetSpecs)}
LIVE 2026 TRENDS: ${artStrategy._liveTrends || 'Use established design principles'}
${existingLogoUrl ? `\nIMPORTANT: The brand has an existing logo (provided as reference image). For system and collateral assets, instruct GPT-Image-2 to build around and incorporate the provided logo image — do not invent a new logo.` : ''}
${collateralBrief ? `\nCOLLATERAL MATERIALS/MOCKUPS: "${collateralBrief}" — these MUST appear in the mockup assets.` : ''}

For each asset, write a hyper-specific image generation prompt.
You MUST return a JSON object with a single "prompts" key containing the prompts. The keys in the "prompts" object MUST EXACTLY match the requested assets in ASSETS TO GENERATE: ${JSON.stringify(assetSpecs)}. Do not output any other keys.

Return JSON format: { "prompts": ${JSON.stringify(promptsSchemaDescription)} }`,
        0.9, 3000,
        { provider: 'anthropic', model: CLAUDE_MODEL, timeoutMs: 90_000 }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Art Director function — runs the full analysis pipeline
// ─────────────────────────────────────────────────────────────────────────────

export async function runArtDirector({
    brandId,
    brief = '',
    scope = 'brand',
    assetType,
    assetSpecs,
    briefBrand = null,
    existingLogoUrl = null,
    collateralBrief = null,
}) {
    let brandContext = '';
    let brand = null;
    let products = [];

    if (brandId) {
        const ctx = await loadBrandContext(brandId);
        brandContext = ctx.brandContext || '';
        brand = ctx.brand;
        products = ctx.products || [];
    }

    const activeLogoUrl = existingLogoUrl || brand?.dna?.logo?.url || null;

    let activeCollateralBrief = collateralBrief;
    if (!activeCollateralBrief && products && products.length > 0) {
        const productNames = products.slice(0, 2).map(p => p.title).join(' and ');
        activeCollateralBrief = `premium packaging box for ${productNames}, custom retail shopping bag, and branded products display`;
        console.log(`🎨 ArtDirector: Synthesizing collateral brief from product catalog: "${activeCollateralBrief}"`);
    }

    if (briefBrand) {
        // Zero-brand wizard mode — build context from the wizard brief
        brandContext = `<brand_bible>
Brand Name: ${briefBrand.name}
Industry: ${briefBrand.industry || 'Consumer Products'}
What they sell: ${briefBrand.products || briefBrand.brief}
Target Audience: ${briefBrand.targetAudience || 'Urban professionals 25-35'}
Brand Personality: ${briefBrand.personality || 'Modern, aspirational, trustworthy'}
Founder Vision: ${briefBrand.vision || ''}
Price Point: ${briefBrand.pricePoint || 'Mid-premium'}
Country: ${briefBrand.country || 'India'}
${activeLogoUrl ? 'Logo Status: Brand has an existing logo — identity system must incorporate and build around it.' : 'Logo Status: No existing logo — AI will design a new logo as part of the identity system.'}
${activeCollateralBrief ? `Collateral Brief: ${activeCollateralBrief}` : ''}
</brand_bible>`;
    }

    // Append logo/collateral context to brand context string
    if (activeLogoUrl && brandContext) {
        brandContext += `\n\n<logo_context>\nExisting Logo URL: ${activeLogoUrl}\nInstruction: Build the identity system around the existing logo. Do not redesign it. Extend its visual language.\n</logo_context>`;
    }
    if (activeCollateralBrief && brandContext) {
        brandContext += `\n\n<collateral_brief>\n${activeCollateralBrief}\n</collateral_brief>`;
    }

    console.log(`🎨 ArtDirector: Analyzing brand archetype for ${assetType}...`);
    const artStrategy = await researchBrandArchetype(brandContext, brief, scope);

    if (!artStrategy || artStrategy.error) {
        console.warn('⚠️ ArtDirector: Archetype analysis returned incomplete data, using defaults');
        return {
            artStrategy: {
                brandArchetype: 'The Creator',
                designMovement: 'Tech Minimalism',
                colorStrategy: { primaryPsychology: 'Trust and innovation', paletteApproach: 'Complementary' },
                typographyStrategy: { headingPersonality: 'Geometric sans-serif', bodyPersonality: 'Humanist sans' },
                moodKeywords: ['clean', 'modern', 'premium'],
                artDirectorNotes: 'Contemporary brand identity with clean lines and premium feel.',
                trend2026: 'Quiet Luxury',
                brandCategory: 'Tech/Electronics',
                categoryStylingRules: [
                    'Emphasize tech minimalism, raw geometry, high-fidelity metal/glass textures.',
                    'Use clean layouts with sharp contrast and structural grids.'
                ]
            },
            prompts: {},
            brandContext,
        };
    }

    console.log(`🎨 ArtDirector: Archetype=${artStrategy.brandArchetype} | Movement=${artStrategy.designMovement} | Category=${artStrategy.brandCategory}`);

    // Engineer asset-specific prompts
    let prompts = {};
    if (assetSpecs && assetSpecs.length > 0) {
        console.log(`🎨 ArtDirector: Engineering ${assetSpecs.length} identity system asset prompts...`);
        const promptData = await engineerAssetPrompts(artStrategy, brandContext, assetType, assetSpecs, activeLogoUrl, activeCollateralBrief);
        if (promptData) {
            if (promptData.prompts) {
                prompts = promptData.prompts;
            } else {
                // Defense-in-depth: If Claude returned a flat object instead of nesting under "prompts"
                const hasKeys = assetSpecs.some(key => promptData[key]);
                if (hasKeys) {
                    prompts = promptData;
                }
            }
        }
    }

    return {
        artStrategy,
        prompts,
        brandContext,
        brand,
        products,
        activeLogoUrl,
        activeCollateralBrief,
    };
}
