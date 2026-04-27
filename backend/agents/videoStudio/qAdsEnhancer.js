/**
 * Q-Ads Enhancer — Stage 1 of the two-stage pipeline
 *
 * Takes: user brief + brand DNA + MCP intelligence + product data + visual DNA from images
 * Returns: enhancedBrief + 3 concept angles, each distinct and brand-anchored
 *
 * Uses Gemini 2.5 Pro (via callAgent default routing) for quality creative reasoning.
 * MCP calls (trending + competitor) run in parallel before the LLM call.
 */

import { loadBrandContext } from '../shared/agentUtils.js';
import { callAgent, callMultimodalAgent } from '../shared/agentUtils.js';
import { callMcpToolsParallel } from '../../mcp/registry.js';
import { getPreset, ANTISLOP_BANNED_WORDS, AGEBLIND_BANNED_WORDS } from './qAdsPresets.js';
import { VISUAL_GROUNDING_SYSTEM } from './promptEnhancer.js';

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 SYSTEM PROMPT
// ─────────────────────────────────────────────────────────────────────────────

function buildEnhancerSystem({ brandContext, preset, trendingContext, competitorContext }) {
    const antislop = ANTISLOP_BANNED_WORDS.join(', ');
    const ageblind = AGEBLIND_BANNED_WORDS.join(', ');

    return `You are the Q-Ads Strategic Brief Enhancer. Your job is to transform a raw user brief into a rich, brand-anchored creative brief and generate 1 highly-optimized concept angle for a short-form video ad.

You are NOT writing the video prompt yet. You are writing the creative strategy that the Prompt Director will use to write the final Seedance prompts.

═══════════════════════════════════════════════════════
BRAND BIBLE
═══════════════════════════════════════════════════════
${brandContext}

═══════════════════════════════════════════════════════
SELECTED PRESET: ${preset.name}
═══════════════════════════════════════════════════════
Director Brief: ${preset.directorBrief}

LOCKED PARAMETERS — These cannot be changed by any downstream agent:
  Camera: ${preset.cameraSignature}
  Pacing: ${preset.pacing}
  Environment: ${preset.environmentPreset}
  Register: ${preset.register}
  Forbidden Elements: ${(preset.forbiddenElements || []).join('; ')}

${trendingContext ? `═══════════════════════════════════════════════════════
LIVE TRENDING INTELLIGENCE
═══════════════════════════════════════════════════════
${trendingContext}` : ''}

${competitorContext ? `═══════════════════════════════════════════════════════
COMPETITIVE LANDSCAPE
═══════════════════════════════════════════════════════
${competitorContext}` : ''}

═══════════════════════════════════════════════════════
CREATIVE CONSTRAINTS
═══════════════════════════════════════════════════════
ANTISLOP RULE — Never use these words anywhere in your output:
${antislop}

AGE-BLIND RULE — Never use age descriptors. Banned:
${ageblind}
Instead use functional roles: runner, figure, presenter, user, rider, speaker, parent.

BRAND INTEGRATION — Every concept angle MUST:
1. Reference at least one real brand color in how the scene is lit or styled
2. Match the brand's voice/register (pulled from Brand Bible)
3. Reflect the brand's target audience in who appears or the context shown
4. Avoid any visual elements listed in Brand Don'ts

DIFFERENTIATION — Produce ONE deeply creative, visually specific concept angle:
1. Choose the single most compelling emotional approach for this product + audience (aspiration, empathy, excitement, curiosity, trust)
2. Design a strong opening hook that stops the scroll — be scene-specific (not "a person uses the product" but "a hand wraps around the cold glass at dawn, steam rising from the mug beside it")
3. Write a story arc with a real narrative turn — the product solves something real, changes something felt
4. Every visual suggestion must be physically filmable — no abstract concepts, only concrete scenes

═══════════════════════════════════════════════════════
OUTPUT FORMAT — Return ONLY valid JSON, no markdown wrapper
═══════════════════════════════════════════════════════
{
  "enhancedBrief": "2–3 sentences that crystallise the ad's purpose, audience, and emotional goal. Precise and specific — name the exact feeling, the exact product moment, the exact viewer insight. No filler.",
  "brandIntegration": {
    "colorToUse": "Specific hex or name from brand colors to drive lighting",
    "voiceMatch": "One sentence describing how the brand's voice shows up in this ad",
    "audienceContext": "Who appears or is implied — described without age labels"
  },
  "presetCompliance": {
    "cameraNote": "Confirm how the camera signature will be applied",
    "pacingNote": "Confirm how the pacing rule will be applied",
    "registerNote": "Confirm how the register will be felt"
  },
  "conceptAngles": [
    {
      "variantId": "A",
      "angle": "One-line creative angle title — specific and evocative, not generic",
      "emotionalApproach": "aspiration | empathy | excitement | curiosity | trust",
      "hook": "Exact opening scene — describe what the camera sees in the first 1.5 seconds. Be physically specific: what is in frame, what is the light, what is the action.",
      "story": "What happens in the middle — the product's role in the narrative. Describe exact actions, not abstract benefits. How does the product physically appear and what does the presenter/subject do with it?",
      "cta": "The closing beat — what the viewer sees last, what they feel. Not a call-to-action graphic — a visual and emotional landing.",
      "moodNote": "Lighting mood and energy in one very specific sentence: light direction, color temperature, time of day, shadow quality."
    }
  ]
}`;
}

function buildEnhancerUser({ userBrief, productData, settings, visualDNA }) {
    const product = productData || {};
    let msg = `USER BRIEF: "${userBrief || 'Create a compelling short-form video ad for this product.'}"

PRODUCT INTELLIGENCE:
  Name: ${product.productName || 'Unknown'}
  Main USP: ${product.mainUSP || 'Not provided'}
  Key Features: ${Array.isArray(product.keyFeatures) ? product.keyFeatures.slice(0, 5).join('; ') : (product.keyFeatures || 'Not provided')}
  Target Audience: ${product.targetAudience || 'Not specified'}
  Problem Solved: ${product.problemSolved || 'Not specified'}
  Suggested Dialogue: ${product.suggestedDialogue || 'None'}

GENERATION SETTINGS:
  Duration: ${settings?.duration || 8}s
  Format: ${settings?.format || '9:16'}
  CTA Text: ${settings?.cta || 'Shop now'}
  Custom Dialogue: ${settings?.customDialogue || 'None'}`;

    if (visualDNA && !visualDNA.error && !visualDNA.skipped) {
        msg += `

VISUAL DNA FROM PRODUCT IMAGES:
  Shape & Motion: ${visualDNA.productShape || 'Not analysed'}
  Hero Colors: ${Array.isArray(visualDNA.heroColors) ? visualDNA.heroColors.join(', ') : 'Not detected'}
  Surface Texture: ${visualDNA.texture || 'Not detected'}
  Brand Mood: ${visualDNA.brandMood || 'Not detected'}
  Shot Suggestions: ${Array.isArray(visualDNA.shotSuggestions) ? visualDNA.shotSuggestions.join('; ') : 'None'}
  Avoid List: ${Array.isArray(visualDNA.avoidList) ? visualDNA.avoidList.join('; ') : 'None'}

CRITICAL: Use the hero colors to inform the moodNote in each concept angle. Use shot suggestions as inspiration for the hook.`;
    }

    return msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run Stage 1 — Brief Enhancer
 *
 * @param {object} params
 * @param {string} params.brandId
 * @param {string} params.categoryId
 * @param {string} params.userBrief
 * @param {object} params.productData       — from /analyze-product MCoT
 * @param {string[]} params.imageUrls       — product + avatar S3 URLs
 * @param {object} params.settings          — { duration, format, cta, customDialogue }
 * @param {string} params.userId
 * @returns {object} { enhancedBrief, conceptAngles[3], visualDNA, presetConfig, brandContext }
 */
export async function runEnhancer({ brandId, categoryId, userBrief, productData, imageUrls = [], settings = {}, userId }) {
    console.log(`[Q-Ads Enhancer] Starting Stage 1 — brand=${brandId}, preset=${categoryId}`);

    // ── 1. Load preset ────────────────────────────────────────────────────────
    const preset = getPreset(categoryId);
    if (!preset) throw new Error(`Unknown Q-Ads preset: ${categoryId}`);

    // ── 2. Load Brand DNA (Redis-first, <5ms on cache hit) ────────────────────
    const { brandContext, brand } = await loadBrandContext(brandId);
    console.log(`[Q-Ads Enhancer] Brand context loaded: ${brandContext.length} chars`);

    // ── 3. MCP Intelligence — parallel fetch ─────────────────────────────────
    let trendingContext = null;
    let competitorContext = null;
    try {
        if (brandId) {
            const mcpResults = await callMcpToolsParallel([
                { tool: 'fetch_trending', args: { brandId } },
                { tool: 'scrape_competitor', args: { brandId } },
            ]);

            for (const { tool, result } of mcpResults) {
                if (tool === 'fetch_trending' && result?.summary) {
                    trendingContext = result.summary;
                    console.log(`[Q-Ads Enhancer] Trending context: ${trendingContext.length} chars`);
                }
                if (tool === 'scrape_competitor' && result?.summary) {
                    competitorContext = result.summary;
                    console.log(`[Q-Ads Enhancer] Competitor context: ${competitorContext.length} chars`);
                }
            }
        }
    } catch (mcpErr) {
        console.warn(`[Q-Ads Enhancer] MCP fetch failed (non-blocking): ${mcpErr.message}`);
    }

    // ── 4. Visual DNA — MCoT on product images ───────────────────────────────
    let visualDNA = { skipped: true };
    const validImages = imageUrls.filter(u => u && (u.startsWith('http') || u.startsWith('data:')));
    if (validImages.length > 0) {
        try {
            console.log(`[Q-Ads Enhancer] Running Visual DNA on ${validImages.length} image(s)...`);
            visualDNA = await callMultimodalAgent(
                VISUAL_GROUNDING_SYSTEM,
                `Analyse these product/subject images for Q-Ads video production. Product: ${productData?.productName || 'unknown'}`,
                validImages,
                { temperature: 0.2, maxTokens: 1024 }
            );
            console.log(`[Q-Ads Enhancer] Visual DNA ready — confidence: ${visualDNA.confidence}`);
        } catch (vErr) {
            console.warn(`[Q-Ads Enhancer] Visual DNA failed (non-blocking): ${vErr.message}`);
        }
    }

    // ── 5. Build Stage 1 LLM call ────────────────────────────────────────────
    const systemPrompt = buildEnhancerSystem({ brandContext, preset, trendingContext, competitorContext });
    const userPrompt = buildEnhancerUser({ userBrief, productData, settings, visualDNA });

    console.log(`[Q-Ads Enhancer] Calling Gemini for Stage 1 creative brief...`);

    let result;
    try {
        // preferFast: false → Gemini 2.5 Pro for best creative reasoning quality
        result = await callAgent(systemPrompt, userPrompt, 0.7, 2048, { preferFast: false, timeoutMs: 90_000 });
    } catch (llmErr) {
        console.error(`[Q-Ads Enhancer] LLM call failed: ${llmErr.message}`);
        throw new Error(`Stage 1 Enhancer failed: ${llmErr.message}`);
    }

    if (!result || !result.conceptAngles || !Array.isArray(result.conceptAngles) || result.conceptAngles.length === 0) {
        throw new Error('Stage 1 Enhancer returned invalid JSON — missing conceptAngles');
    }

    console.log(`[Q-Ads Enhancer] Stage 1 complete — ${result.conceptAngles.length} concept angles generated`);

    return {
        enhancedBrief: result.enhancedBrief || '',
        conceptAngles: result.conceptAngles.slice(0, 3),
        brandIntegration: result.brandIntegration || {},
        presetCompliance: result.presetCompliance || {},
        visualDNA,
        presetConfig: {
            id: preset.id,
            name: preset.name,
            group: preset.group,
            noAvatar: preset.noAvatar,
            recommendedDuration: preset.recommendedDuration,
            recommendedFormat: preset.recommendedFormat,
            cameraSignature: preset.cameraSignature,
            pacing: preset.pacing,
            environmentPreset: preset.environmentPreset,
            register: preset.register,
            forbiddenElements: preset.forbiddenElements || [],
            directorBrief: preset.directorBrief,
        },
        brandContext, // passed to Stage 2 (no second DB hit)
        mcpContext: {
            hasTrending: !!trendingContext,
            hasCompetitor: !!competitorContext,
        },
    };
}
