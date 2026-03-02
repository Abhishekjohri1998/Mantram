/**
 * Video Studio — Agent Nodes
 * 
 * Each node is a function: (state) → updatedState
 * They call Claude Sonnet via the existing AnthropicProvider for planning,
 * and fal.ai for actual video generation.
 * 
 * Brand Bible is injected into every agent prompt automatically.
 */

import Brand from '../../models/Brand.js';
import { getRouter } from '../../ai/router.js';
import {
    buildBrandContext,
    buildStyleMemory,
    BRAINSTORM_PROMPT,
    SCRIPT_DIRECTOR_PROMPT,
    REFERENCE_CURATOR_PROMPT,
    MODEL_ROUTER_PROMPT,
    CRITIC_PROMPT,
    EDITOR_PROMPT,
} from './prompts.js';
import { estimateCost, submitVideoGeneration, getGenerationStatus } from './falClient.js';
import { getPastProjects } from './selfLearning.js';

// ── Helper: Call Claude Sonnet and parse JSON response ──
async function callAgent(systemPrompt, userPrompt, temperature = 0.7) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: 4096,
    }, { provider: 'anthropic' }); // Force Claude for all agents

    // Parse JSON from response
    const text = result.text || '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn('Agent JSON parse failed, raw response:', text.substring(0, 200));
    }

    return { error: 'Failed to parse agent response', raw: text.substring(0, 500) };
}

// ── Helper: Load brand + past projects for context injection ──
async function loadContext(brandId, userId) {
    const brand = await Brand.findById(brandId).lean();
    const pastProjects = await getPastProjects(brandId, userId);
    const brandContext = buildBrandContext(brand);
    const styleMemory = buildStyleMemory(pastProjects);
    return { brand, brandContext, styleMemory };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: BRAINSTORM — Generate 3-5 video concepts
// ══════════════════════════════════════════════════════════════════════════════
export async function brainstormNode(state) {
    console.log('🧠 Node: Brainstorm — generating concepts...');

    const { brandContext, styleMemory } = await loadContext(state.brandId, state.userId);

    const userPrompt = [
        `VIDEO BRIEF: ${state.brief || 'Create a professional video ad'}`,
        `VIDEO TYPE: ${state.videoType || 'ad-film'}`,
        state.inputImages?.length > 0
            ? `REFERENCE IMAGES PROVIDED: ${state.inputImages.length} image(s) — incorporate their visual style.`
            : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(
        BRAINSTORM_PROMPT(brandContext, styleMemory),
        userPrompt,
        0.8 // Higher creativity for brainstorming
    );

    return {
        ...state,
        concepts: result.concepts || [],
        status: 'brainstorm',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: SCRIPT DIRECTOR — Write shot-by-shot script + backend prompt
// ══════════════════════════════════════════════════════════════════════════════
export async function scriptDirectorNode(state) {
    console.log('🎬 Node: Script Director — writing script...');

    const { brandContext, styleMemory } = await loadContext(state.brandId, state.userId);

    const selectedConcept = state.concepts[state.selectedConceptIndex];
    if (!selectedConcept) throw new Error('No concept selected');

    const userPrompt = [
        `SELECTED CONCEPT:`,
        `Title: ${selectedConcept.title}`,
        `Description: ${selectedConcept.description}`,
        `Style: ${selectedConcept.style}`,
        `Duration: ${selectedConcept.duration} seconds`,
        `Hook: ${selectedConcept.hook}`,
        `Mood: ${selectedConcept.mood}`,
        `Platform: ${selectedConcept.targetPlatform}`,
        '',
        state.brief ? `ORIGINAL BRIEF: ${state.brief}` : '',
        state.inputImages?.length > 0 ? `REFERENCE IMAGES: ${state.inputImages.length} provided — match their visual style.` : '',
    ].filter(Boolean).join('\n');

    const result = await callAgent(
        SCRIPT_DIRECTOR_PROMPT(brandContext, styleMemory),
        userPrompt,
        0.6
    );

    return {
        ...state,
        script: {
            shots: result.shots || [],
            totalDuration: result.totalDuration || selectedConcept.duration,
            narrative: result.narrative || '',
        },
        backendPrompt: result.backendPrompt || '',
        title: selectedConcept.title,
        status: 'script',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 3: REFERENCE CURATOR — Select best reference images
// ══════════════════════════════════════════════════════════════════════════════
export async function referenceCuratorNode(state) {
    console.log('🖼️ Node: Reference Curator — curating references...');

    const { brand, brandContext, styleMemory } = await loadContext(state.brandId, state.userId);

    const brandImages = (brand?.dna?.brandImages || []).map((img, i) => ({
        index: i,
        url: img.url,
        alt: img.alt || `Brand image ${i + 1}`,
    }));

    const userPrompt = [
        `SCRIPT NARRATIVE: ${state.script?.narrative || ''}`,
        `TOTAL DURATION: ${state.script?.totalDuration || 0}s`,
        `SHOTS: ${(state.script?.shots || []).map(s => s.visual).join(' | ')}`,
        '',
        `AVAILABLE BRAND IMAGES: ${brandImages.length} images`,
        brandImages.map(img => `  [${img.index}] ${img.alt}`).join('\n'),
        '',
        `USER-UPLOADED REFERENCE IMAGES: ${state.inputImages?.length || 0}`,
    ].join('\n');

    const result = await callAgent(
        REFERENCE_CURATOR_PROMPT(brandContext, styleMemory),
        userPrompt,
        0.3 // Low creativity for curation
    );

    // Map selected indices to actual images
    const selectedBrandImages = (result.selectedBrandImageIndices || [])
        .filter(i => brandImages[i])
        .map(i => ({ url: brandImages[i].url, label: brandImages[i].alt }));

    return {
        ...state,
        references: {
            brandImages: selectedBrandImages,
            userUploaded: (state.inputImages || []).map(img => ({ url: img.url, label: img.label || 'User ref' })),
            aiGenerated: [],
            styleNotes: result.styleNotes || '',
        },
        status: 'references',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 4: MODEL ROUTER — Choose best model + calculate cost
// ══════════════════════════════════════════════════════════════════════════════
export async function modelRouterNode(state) {
    console.log('🔀 Node: Model Router — selecting optimal model...');

    const { brandContext } = await loadContext(state.brandId, state.userId);

    const userPrompt = [
        `SCRIPT ANALYSIS:`,
        `Duration: ${state.script?.totalDuration || 5}s`,
        `Shots: ${state.script?.shots?.length || 1}`,
        `Has Dialogue: ${state.script?.shots?.some(s => s.dialogue) ? 'YES' : 'NO'}`,
        `Style: ${state.concepts?.[state.selectedConceptIndex]?.style || 'general'}`,
        `Mood: ${state.concepts?.[state.selectedConceptIndex]?.mood || 'neutral'}`,
        `Camera Movements: ${(state.script?.shots || []).map(s => s.camera).filter(Boolean).join(', ')}`,
        '',
        `USER PREFERENCES: Default resolution 1080p, default mode fast`,
    ].join('\n');

    const result = await callAgent(
        MODEL_ROUTER_PROMPT(brandContext),
        userPrompt,
        0.2 // Very deterministic
    );

    const model = result.selectedModel || 'kling-3.0';
    const resolution = result.resolution || '1080p';
    const mode = result.mode || 'fast';

    const costPreview = estimateCost(model, state.script?.totalDuration || 5, resolution, mode);

    return {
        ...state,
        routing: {
            selectedModel: model,
            resolution,
            mode,
            reasoning: result.reasoning || '',
            costPreview,
        },
        status: 'routing',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 5: VIDEO GENERATOR — Submit to fal.ai
// ══════════════════════════════════════════════════════════════════════════════
export async function videoGeneratorNode(state) {
    console.log('🎥 Node: Video Generator — submitting to fal.ai...');

    const model = state.routing?.selectedModel || 'kling-3.0';
    const resolution = state.routing?.resolution || '1080p';
    const mode = state.routing?.mode || 'fast';
    const prompt = state.backendPrompt || state.script?.narrative || '';

    // Use first reference image if available (for image-to-video models)
    const imageUrl = state.inputImages?.[0]?.url
        || state.references?.brandImages?.[0]?.url
        || null;

    // Pass shots for Kling multi-prompt support
    const shots = state.script?.shots || [];

    const { requestId, endpoint, statusUrl, resultUrl } = await submitVideoGeneration({
        model,
        prompt,
        imageUrl,
        duration: state.script?.totalDuration || 5,
        resolution,
        mode,
        shots: shots.length > 1 ? shots : undefined, // Only use multi-prompt if 2+ shots
        generateAudio: true,
    });

    return {
        ...state,
        generation: {
            falRequestId: requestId,
            falEndpoint: endpoint,
            falStatusUrl: statusUrl,   // Exact URL from fal.ai for polling
            falResultUrl: resultUrl,   // Exact URL from fal.ai for fetching result
            videoUrl: '',
            thumbnailUrl: '',
            progress: 5,
            startedAt: new Date(),
            error: '',
        },
        status: 'generating',
    };
}

/**
 * Poll video generation status (called separately, not a pipeline node)
 */
export async function pollGenerationStatus(state) {
    if (!state.generation?.falRequestId) return state;

    // Use stored fal.ai URLs for accurate polling
    const statusUrl = state.generation?.falStatusUrl || null;
    const resultUrl = state.generation?.falResultUrl || null;
    const statusResult = await getGenerationStatus(state.generation.falRequestId, statusUrl, resultUrl);

    return {
        ...state,
        generation: {
            ...state.generation,
            ...statusResult,
            ...(statusResult.status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
        status: statusResult.status === 'COMPLETED' ? 'critique' : 'generating',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 6: CRITIC — Analyze generated video
// ══════════════════════════════════════════════════════════════════════════════
export async function criticNode(state) {
    console.log('🎯 Node: Critic — analyzing video...');

    const { brandContext } = await loadContext(state.brandId, state.userId);

    const userPrompt = [
        `GENERATED VIDEO ANALYSIS:`,
        `Model Used: ${state.routing?.selectedModel}`,
        `Backend Prompt: "${state.backendPrompt}"`,
        `Script Narrative: "${state.script?.narrative}"`,
        `Total Duration: ${state.script?.totalDuration}s`,
        `Original Concept Style: ${state.concepts?.[state.selectedConceptIndex]?.style}`,
        `Video URL: ${state.generation?.videoUrl || 'generated'}`,
        '',
        `Analyze the video against the script and brand standards. Focus on actionable improvements.`,
    ].join('\n');

    const result = await callAgent(
        CRITIC_PROMPT(brandContext),
        userPrompt,
        0.4
    );

    return {
        ...state,
        critique: {
            overallScore: result.overallScore || 7,
            strengths: result.strengths || [],
            suggestions: result.suggestions || [],
            technicalNotes: result.technicalNotes || '',
        },
        status: 'critique',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 7: EDITOR — Suggest final polish
// ══════════════════════════════════════════════════════════════════════════════
export async function editorNode(state) {
    console.log('✂️ Node: Editor — suggesting final polish...');

    const { brandContext } = await loadContext(state.brandId, state.userId);

    const userPrompt = [
        `VIDEO DETAILS:`,
        `Style: ${state.concepts?.[state.selectedConceptIndex]?.style}`,
        `Duration: ${state.script?.totalDuration}s`,
        `Narrative: ${state.script?.narrative}`,
        `Dialogue: ${(state.script?.shots || []).map(s => s.dialogue).filter(Boolean).join(' | ') || 'None'}`,
        `Critic Score: ${state.critique?.overallScore}/10`,
        `Critic Notes: ${state.critique?.technicalNotes || 'None'}`,
    ].join('\n');

    const result = await callAgent(
        EDITOR_PROMPT(brandContext),
        userPrompt,
        0.5
    );

    return {
        ...state,
        editorSuggestions: result,
        finalVideoUrl: state.generation?.videoUrl || '',
        status: 'editing',
    };
}
