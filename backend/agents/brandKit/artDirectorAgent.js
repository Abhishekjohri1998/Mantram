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
COLOR STRATEGY: ${JSON.stringify(artStrategy.colorStrategy)}
TYPOGRAPHY: ${JSON.stringify(artStrategy.typographyStrategy)}
MOOD: ${(artStrategy.moodKeywords || []).join(', ')}
ART DIRECTOR NOTES: ${artStrategy.artDirectorNotes}
${existingLogoUrl ? `EXISTING LOGO: The brand has an existing logo that will be used as a reference image. Build identity system boards around it — do NOT reinvent the logo, extend its visual language.` : 'NO EXISTING LOGO: The AI will generate a new logo as part of each identity system board.'}
${collateralBrief ? `COLLATERAL BRIEF: Additional real-world collateral to include in mockups: "${collateralBrief}"` : 'COLLATERAL: Standard brand touchpoints (packaging, bag, business card, cup).'}

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

═══ PROMPT ENGINEERING RULES FOR GPT-IMAGE-2 ═══
1. Start with LAYOUT TYPE, then ELEMENTS, then COMPOSITION, then LIGHTING, then FINISH
2. Use design/agency terminology: "Swiss grid", "rule of thirds", "Pantone palette", "Massimo Vignelli layout"
3. Reference print materials: "cold-pressed paper", "matte laminate", "uncoated stock"
4. Naturally reference the 1792x1024 wide-format canvas for system boards
5. Include material quality cues: "Adobe Illustrator vector precision", "agency brand deck quality"
6. Specify lighting: "flat studio lighting", "soft north-facing daylight", "Vogue editorial lighting"
7. Reference quality benchmarks: "Pentagram studio quality", "D&AD award-winning identity", "AIGA 50 books quality"
8. Use 2026 design markers: specific color temperatures, material trends, cultural codes
9. Each system board prompt must be 80-120 words, dense with compositional and visual information
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

    return callAgent(
        PROMPT_ENGINEER_SYSTEM(artStrategy, existingLogoUrl, collateralBrief),
        `Generate precise GPT-Image-2 image prompts for a COMPLETE BRAND IDENTITY SYSTEM.

BRAND CONTEXT:
${brandContext}

ASSET TYPE: ${assetType}
ASSETS TO GENERATE: ${JSON.stringify(assetSpecs)}
LIVE 2026 TRENDS: ${artStrategy._liveTrends || 'Use established design principles'}
${existingLogoUrl ? `\nIMPORTANT: The brand has an existing logo (provided as reference image). For identity-system and collateral assets, instruct GPT-Image-2 to build around and incorporate the provided logo image — do not invent a new logo.` : ''}
${collateralBrief ? `\nCOLLATERAL MATERIALS: "${collateralBrief}" — these MUST appear in the identity-collateral prompt.` : ''}

For each asset, write a hyper-specific image generation prompt.
Ensure 'identity-system-light' and 'identity-system-dark' prompts describe a FULL BRAND IDENTITY BOARD with logo, variations, palette, and typography — all in one composed layout.
Return JSON: { "prompts": { "assetSubType": "full image prompt here", ... } }`,
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

    if (brandId) {
        const ctx = await loadBrandContext(brandId);
        brandContext = ctx.brandContext || '';
        brand = ctx.brand;
    } else if (briefBrand) {
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
${existingLogoUrl ? 'Logo Status: Brand has an existing logo — identity system must incorporate and build around it.' : 'Logo Status: No existing logo — AI will design a new logo as part of the identity system.'}
${collateralBrief ? `Collateral Brief: ${collateralBrief}` : ''}
</brand_bible>`;
    }

    // Append logo/collateral context to brand context string
    if (existingLogoUrl && brandContext) {
        brandContext += `\n\n<logo_context>\nExisting Logo URL: ${existingLogoUrl}\nInstruction: Build the identity system around the existing logo. Do not redesign it. Extend its visual language.\n</logo_context>`;
    }
    if (collateralBrief && brandContext) {
        brandContext += `\n\n<collateral_brief>\n${collateralBrief}\n</collateral_brief>`;
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
            },
            prompts: {},
            brandContext,
        };
    }

    console.log(`🎨 ArtDirector: Archetype=${artStrategy.brandArchetype} | Movement=${artStrategy.designMovement}`);

    // Engineer asset-specific prompts
    let promptData = { prompts: {} };
    if (assetSpecs && assetSpecs.length > 0) {
        console.log(`🎨 ArtDirector: Engineering ${assetSpecs.length} identity system asset prompts...`);
        promptData = await engineerAssetPrompts(artStrategy, brandContext, assetType, assetSpecs, existingLogoUrl, collateralBrief);
    }

    return {
        artStrategy,
        prompts: promptData?.prompts || {},
        brandContext,
        brand,
    };
}
