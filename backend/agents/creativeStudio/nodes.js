/**
 * Creative Studio — Agentic Pipeline Node Functions
 * 
 * 4-agent chain: ArtDirector → PromptEngineer → StyleCritic → VariationGenerator
 * Each node: (state) → updatedState
 */

import { callAgent } from '../shared/agentUtils.js';
import { loadBrandContext } from '../shared/agentUtils.js';
import {
    ART_DIRECTOR_PROMPT,
    PROMPT_ENGINEER_PROMPT,
    STYLE_CRITIC_PROMPT,
    VARIATION_PROMPT,
} from './prompts.js';

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: ART DIRECTOR — Define creative vision
// ══════════════════════════════════════════════════════════════════════════════
export async function artDirectorNode(state) {
    console.log('🎨 Creative Agent: Art Director — defining vision...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CREATIVE BRIEF: ${state.brief}`,
        `FORMAT: ${state.format || 'instagram-post'}`,
        `ASPECT RATIO: ${state.aspectRatio || '1:1'}`,
        state.style ? `PREFERRED STYLE: ${state.style}` : '',
        state.references ? `REFERENCE NOTES: ${state.references}` : '',
        state.productName ? `PRODUCT: ${state.productName}` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(ART_DIRECTOR_PROMPT(brandContext), userPrompt, 0.7);

    return {
        ...state,
        artDirection: result,
        status: 'art-direction',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: PROMPT ENGINEER — Craft optimal image prompt
// ══════════════════════════════════════════════════════════════════════════════
export async function promptEngineerNode(state) {
    console.log('🔧 Creative Agent: Prompt Engineer — crafting prompt...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CONVERT THIS ART DIRECTION INTO AN IMAGE GENERATION PROMPT:`,
        `Creative Direction: ${state.artDirection?.creativeDirection || ''}`,
        `Visual Style: ${state.artDirection?.visualStyle || ''}`,
        `Mood: ${state.artDirection?.mood || ''}`,
        `Color Strategy: ${state.artDirection?.colorStrategy || ''}`,
        `Composition: ${state.artDirection?.composition || ''}`,
        `Key Elements: ${(state.artDirection?.keyElements || []).join(', ')}`,
        `Avoid: ${(state.artDirection?.avoidList || []).join(', ')}`,
        `Format: ${state.format || 'instagram-post'}`,
        `Aspect Ratio: ${state.aspectRatio || '1:1'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    const result = await callAgent(PROMPT_ENGINEER_PROMPT(brandContext), userPrompt, 0.5);

    return {
        ...state,
        engineeredPrompt: result,
        status: 'prompt-engineering',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: STYLE CRITIC — Pre-generation quality check
// ══════════════════════════════════════════════════════════════════════════════
export async function styleCriticNode(state) {
    console.log('🔍 Creative Agent: Style Critic — analyzing prompt...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `ANALYZE THIS IMAGE GENERATION PROMPT:`,
        `Primary Prompt: ${state.engineeredPrompt?.primaryPrompt || ''}`,
        `Negative Prompt: ${state.engineeredPrompt?.negativePrompt || ''}`,
        `Style Modifiers: ${state.engineeredPrompt?.styleModifiers || ''}`,
        `Target Format: ${state.format || 'instagram-post'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    const result = await callAgent(STYLE_CRITIC_PROMPT(brandContext), userPrompt, 0.3);

    // If critic says improve-first, use the improved prompt
    if (result.verdict === 'improve-first' && result.improvedPrompt) {
        state.engineeredPrompt.primaryPrompt = result.improvedPrompt;
    }

    return {
        ...state,
        styleCritique: result,
        finalPrompt: state.engineeredPrompt?.primaryPrompt || '',
        status: 'critique',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 4: VARIATION GENERATOR — Create 3 style variations
// ══════════════════════════════════════════════════════════════════════════════
export async function variationGeneratorNode(state) {
    console.log('🔀 Creative Agent: Variation Generator — creating alternatives...');

    const { brandContext } = await loadBrandContext(state.brandId);

    const userPrompt = [
        `CREATE 3 VARIATIONS OF THIS PROMPT:`,
        `Original Prompt: ${state.finalPrompt || state.engineeredPrompt?.primaryPrompt || ''}`,
        `Art Direction: ${state.artDirection?.creativeDirection || ''}`,
        `Mood: ${state.artDirection?.mood || ''}`,
        `Format: ${state.format || 'instagram-post'}`,
        `Original Brief: ${state.brief}`,
    ].join('\n');

    const result = await callAgent(VARIATION_PROMPT(brandContext), userPrompt, 0.8);

    return {
        ...state,
        variations: result.variations || [],
        status: 'variations',
    };
}
