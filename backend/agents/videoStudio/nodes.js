/**
 * Video Studio — Agent Nodes
 * 
 * Each node is a function: (state) → updatedState
 * 
 * Provider strategy for speed:
 *   - Claude Sonnet: writing-heavy nodes (brainstorm, script director) — quality matters
 *   - Gemini Flash: utility nodes (reference curator, model router, critic, editor) — speed matters
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
    PROMPT_ENHANCER_PROMPT,
    DURATION_PLANNER_PROMPT,
} from './prompts.js';
import { estimateCost, submitVideoGeneration, getGenerationStatus, getGrokGenerationStatus, MODEL_CAPABILITIES } from './falClient.js';
import { getKieGenerationStatus } from './kieClient.js';
import { getPiApiGenerationStatus } from './piApiClient.js';
import { getPastProjects } from './selfLearning.js';

// ── Helper: Parse JSON from any AI response ──
function parseAgentJSON(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.warn('Agent JSON parse failed, raw response:', text.substring(0, 200));
    }
    return { error: 'Failed to parse agent response', raw: text.substring(0, 500) };
}

// ── Call Claude Sonnet — for writing-heavy nodes (brainstorm, script) ──
async function callAgent(systemPrompt, userPrompt, temperature = 0.7) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens: 4096,
    }, { provider: 'anthropic' }); // Claude Sonnet for quality writing
    return parseAgentJSON(result.text || '');
}

// ── Call Gemini Flash — for utility nodes (router, curator, critic, editor) ──
// ~10x faster than Claude, great for structured JSON tasks
async function callFastAgent(systemPrompt, userPrompt, temperature = 0.3, maxTokens = 1024) {
    const router = getRouter();
    try {
        const result = await router.generateText({
            systemPrompt,
            userPrompt,
            temperature,
            maxTokens,
        }, { provider: 'gemini' }); // Gemini Flash for speed
        return parseAgentJSON(result.text || '');
    } catch (e) {
        // Fallback to Claude if Gemini fails
        console.warn('⚡ Gemini Flash failed, falling back to Claude:', e.message);
        const result = await router.generateText({
            systemPrompt,
            userPrompt,
            temperature,
            maxTokens,
        }, { provider: 'anthropic' });
        return parseAgentJSON(result.text || '');
    }
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

    // Build detailed image descriptions
    let imageContext = '';
    if (state.inputImages?.length > 0) {
        const imageDescs = state.inputImages.map((img, i) => {
            const parts = [`Image ${i + 1}`];
            if (img.label) parts.push(`Description: "${img.label}"`);
            if (img.source) parts.push(`Source: ${img.source}`);
            if (img.url && !img.url.startsWith('data:')) parts.push(`URL: ${img.url}`);
            return parts.join(' | ');
        }).join('\n');
        imageContext = `\nREFERENCE IMAGES PROVIDED (${state.inputImages.length}):\n${imageDescs}\n\nIMPORTANT: Incorporate the visual style, subjects, and mood from these images into your video concepts. The concepts should align with what's shown in the images.`;
    }

    const userPrompt = [
        `VIDEO BRIEF: ${state.brief || 'Create a professional video ad'}`,
        `VIDEO TYPE: ${state.videoType || 'ad-film'}`,
        imageContext,
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

    // Build detailed image context
    let imageContext = '';
    if (state.inputImages?.length > 0) {
        const imageDescs = state.inputImages.map((img, i) => {
            const parts = [`Image ${i + 1}`];
            if (img.label) parts.push(`"${img.label}"`);
            if (img.source) parts.push(`(${img.source})`);
            return parts.join(' ');
        }).join(', ');
        imageContext = `\nREFERENCE IMAGES: ${imageDescs}\nUse these images as visual reference — incorporate their subjects, style, colors, and composition into the shots and backend prompt. The first shot should match the first reference image closely.`;
    }

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
        imageContext,
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

    const result = await callFastAgent(
        REFERENCE_CURATOR_PROMPT(brandContext, styleMemory),
        userPrompt,
        0.3, // Low creativity for curation
        1024
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

    const result = await callFastAgent(
        MODEL_ROUTER_PROMPT(brandContext),
        userPrompt,
        0.2, // Very deterministic
        512
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
    console.log('🎥 Node: Video Generator — submitting to fal.ai / Grok...');

    const model = state.routing?.selectedModel || 'kling-3.0';
    const resolution = state.routing?.resolution || '1080p';
    const mode = state.routing?.mode || 'fast';
    const prompt = state.backendPrompt || state.script?.narrative || '';

    // Use first reference image if available (for image-to-video models)
    // IMPORTANT: Skip base64 data URIs AND localhost URLs — external APIs can't access them
    let imageUrl = null;
    const candidates = [
        ...(state.inputImages || []).map(img => img.url),
        ...(state.references?.brandImages || []).map(img => img.url),
    ].filter(Boolean);

    // Helper: check if a URL is accessible by external APIs
    const isExternallyAccessible = (url) => {
        if (!url) return false;
        if (url.startsWith('data:')) return false;
        if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')) return false;
        return url.startsWith('http');
    };

    for (const url of candidates) {
        if (isExternallyAccessible(url)) {
            imageUrl = url;
            break;
        }
    }
    if (!imageUrl && candidates.length > 0) {
        console.warn('⚠️ All input images are base64 or localhost URLs — external video APIs can\'t access them. Skipping image input.');
    } else if (imageUrl) {
        console.log(`📸 Using image for video gen: ${imageUrl.substring(0, 80)}...`);
    }

    // Pass shots for Kling multi-prompt support
    const shots = state.script?.shots || [];

    const { requestId, endpoint, statusUrl, resultUrl, provider } = await submitVideoGeneration({
        model,
        prompt,
        imageUrl,
        duration: state.script?.totalDuration || 5,
        resolution,
        mode,
        shots: shots.length > 1 ? shots : undefined, // Only use multi-prompt if 2+ shots
        generateAudio: true,
        aspectRatio: state.routing?.aspectRatio || '16:9',
    });

    return {
        ...state,
        generation: {
            falRequestId: requestId,
            falEndpoint: endpoint,
            falStatusUrl: statusUrl,   // null for Grok
            falResultUrl: resultUrl,   // null for Grok
            provider: provider || 'fal', // 'grok' or 'fal'
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

    let statusResult;

    // Branch polling based on provider
    if (state.generation?.provider === 'grok' || state.routing?.selectedModel === 'grok-imagine') {
        statusResult = await getGrokGenerationStatus(state.generation.falRequestId);
    } else if (state.generation?.provider === 'piapi' || state.routing?.selectedModel === 'seedance-2.0') {
        // PiAPI polling — Seedance 2.0
        statusResult = await getPiApiGenerationStatus(state.generation.falRequestId);
    } else if (state.generation?.provider === 'kie' || state.routing?.selectedModel === 'veo-3.1-fast') {
        // kie.ai polling — Veo 3.1 Fast only
        statusResult = await getKieGenerationStatus(state.generation.falRequestId, state.routing?.selectedModel);
    } else {
        // fal.ai polling — use stored URLs
        const statusUrl = state.generation?.falStatusUrl || null;
        const resultUrl = state.generation?.falResultUrl || null;
        statusResult = await getGenerationStatus(state.generation.falRequestId, statusUrl, resultUrl);
    }

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

    const result = await callFastAgent(
        CRITIC_PROMPT(brandContext),
        userPrompt,
        0.4,
        1024
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

    const result = await callFastAgent(
        EDITOR_PROMPT(brandContext),
        userPrompt,
        0.5,
        1024
    );

    return {
        ...state,
        editorSuggestions: result,
        finalVideoUrl: state.generation?.videoUrl || '',
        status: 'editing',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// ADVANCED MODE NODES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Node: Enhance Prompt (Gemini Flash)
 * Takes user's raw prompt → rewrites into a production-ready video prompt.
 */
export async function enhancePromptNode(state) {
    const userPrompt = `Enhance this video generation prompt:\n\n"${state.prompt}"\n\nModel being used: ${state.model || 'general'}\nDesired duration: ${state.duration || 5}s\nAspect ratio: ${state.aspectRatio || '16:9'}`;

    const result = await callFastAgent(
        PROMPT_ENHANCER_PROMPT,
        userPrompt,
        0.5,
        1024
    );

    return {
        ...state,
        enhancedPrompt: result.enhancedPrompt || state.prompt,
        enhanceChanges: result.changes || [],
    };
}

/**
 * Node: Duration Planner (Gemini Flash)
 * Calculates how to chain segments for durations exceeding model's native max.
 */
export async function durationPlannerNode(state) {
    const model = state.model || 'kling-3.0';
    const cap = MODEL_CAPABILITIES[model];
    if (!cap) return { ...state, durationPlan: { strategy: 'single', segments: [{ index: 0, type: 'generate', duration: state.duration || 5, method: 'text-to-video' }], totalSegments: 1 } };

    const targetDuration = state.duration || 5;
    const nativeMax = cap.duration.native;

    // If within native max, no planning needed
    if (targetDuration <= nativeMax) {
        return {
            ...state,
            durationPlan: {
                strategy: 'single',
                segments: [{ index: 0, type: 'generate', duration: targetDuration, method: 'text-to-video' }],
                totalDuration: targetDuration,
                totalSegments: 1,
                note: `Single segment, within ${model}'s native ${nativeMax}s limit.`,
            },
        };
    }

    // Deterministic calculation (skip AI call for speed)
    if (cap.features.extendVideo && cap.duration.extendChunk) {
        // Extend-video strategy
        const firstSegDuration = nativeMax;
        const remaining = targetDuration - firstSegDuration;
        const chunkSize = cap.duration.extendChunk;
        const numExtensions = Math.ceil(remaining / chunkSize);
        const segments = [{ index: 0, type: 'generate', duration: firstSegDuration, method: 'text-to-video' }];
        for (let i = 0; i < numExtensions; i++) {
            const segDur = Math.min(chunkSize, remaining - i * chunkSize);
            segments.push({ index: i + 1, type: 'extend', duration: segDur, method: 'extend-video' });
        }
        return {
            ...state,
            durationPlan: {
                strategy: 'extend',
                segments,
                totalDuration: targetDuration,
                totalSegments: segments.length,
                estimatedTime: `${segments.length * 2}-${segments.length * 4} minutes`,
                note: `${nativeMax}s initial + ${numExtensions} extensions of ${chunkSize}s each via extend-video API.`,
            },
        };
    } else {
        // Last-frame chain strategy
        const segments = [];
        let remaining = targetDuration;
        let idx = 0;
        while (remaining > 0) {
            const segDur = Math.min(nativeMax, remaining);
            segments.push({
                index: idx,
                type: idx === 0 ? 'generate' : 'chain',
                duration: segDur,
                method: idx === 0 ? 'text-to-video' : 'image-to-video (last frame)',
            });
            remaining -= segDur;
            idx++;
        }
        return {
            ...state,
            durationPlan: {
                strategy: 'chain-lastframe',
                segments,
                totalDuration: targetDuration,
                totalSegments: segments.length,
                estimatedTime: `${segments.length * 2}-${segments.length * 5} minutes`,
                note: `Split into ${segments.length} segments of up to ${nativeMax}s. Each subsequent segment uses the last frame of the previous as its first frame.`,
            },
        };
    }
}

/**
 * Node: Advanced Generate (direct mode — skips brainstorm/script)
 * Submits video generation with user-provided or enhanced prompt.
 */
export async function advancedGenerateNode(state) {
    const prompt = state.enhancedPrompt || state.prompt;
    const model = state.model || 'kling-3.0';
    const cap = MODEL_CAPABILITIES[model];
    const duration = Math.min(
        Math.max(state.duration || 5, cap?.duration.min || 3),
        cap?.duration.native || 15
    );

    console.log(`🎬 Advanced Generate: ${model}, ${duration}s, prompt: ${prompt.substring(0, 100)}...`);

    // Skip base64 data URIs AND localhost URLs — external video APIs can't access them
    let imageUrl = state.firstImageUrl || undefined;
    if (imageUrl && (imageUrl.startsWith('data:') || imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1'))) {
        console.warn('⚠️ firstImageUrl is base64/localhost — external video APIs can\'t access it. Skipping.');
        imageUrl = undefined;
    }

    const result = await submitVideoGeneration({
        model,
        prompt,
        imageUrl: imageUrl || undefined,
        duration,
        resolution: state.resolution || '1080p',
        mode: state.qualityMode || 'fast',
        generateAudio: state.generateAudio !== false,
        aspectRatio: state.aspectRatio || '16:9',
    });

    return {
        ...state,
        generation: {
            falRequestId: result.requestId,
            falEndpoint: result.endpoint,
            falStatusUrl: result.statusUrl,
            falResultUrl: result.resultUrl,
            provider: result.provider || 'fal',
            videoUrl: '',
            progress: 5,
            startedAt: new Date(),
        },
        costPreview: estimateCost(model, duration, state.resolution || '1080p', state.qualityMode || 'fast'),
        status: 'advanced-generating',
    };
}
