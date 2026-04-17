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
    VIDEO_VISUAL_GROUNDING_PROMPT,
    UGC_PRODUCT_GROUNDING_PROMPT,
    UGC_AVATAR_PROMPT,
    UGC_PROMPT_BUILDER_PROMPT,
} from './prompts.js';
import { estimateCost, submitVideoGeneration, getGenerationStatus, getGrokGenerationStatus, MODEL_CAPABILITIES } from './falClient.js';
import { getKieGenerationStatus } from './kieClient.js';
import { getPiApiGenerationStatus, resubmitPiApiTask, uploadImageToHostedUrl, submitPiApiWatermarkRemoval } from './piApiClient.js';
import { getMuApiGenerationStatus, resubmitMuApiTask, submitMuApiVideoGeneration } from './muapiClient.js';
import { geminiImageGenerate } from './firstFrame.js';

import { getPastProjects } from './selfLearning.js';
import { agentUtils } from '../shared/agentUtils.js';
import { callMcpTool } from '../../mcp/registry.js';
import Product from '../../models/Product.js';
import { inferBrandLanguage, buildLanguageDirective } from '../../utils/brandLanguage.js';

// ── Helper: Parse JSON from any AI response ──
function parseAgentJSON(text) {
    try {
        let cleaned = text;
        // Strip <think>...</think> tags (Gemini 2.5 Flash reasoning)
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
        const lastThinkIdx = cleaned.lastIndexOf('<think>');
        if (lastThinkIdx !== -1) {
            const before = cleaned.substring(0, lastThinkIdx).trim();
            cleaned = before.length > 0 ? before : '';
        }
        // Strip markdown code fences
        cleaned = cleaned.replace(/```(?:json)?\s*\n?/gi, '');
        cleaned = cleaned.trim();
        
        if (cleaned.startsWith('{')) {
            try { return JSON.parse(cleaned); } catch (_) { /* try next */ }
        }
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[0]); } catch (_) { /* try next */ }
            // Fix trailing commas + unquoted keys
            const fixed = jsonMatch[0].replace(/,\s*([\]}])/g, '$1').replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
            try { return JSON.parse(fixed); } catch (_) { /* give up */ }
        }
    } catch (e) {
        console.warn('Agent JSON parse failed, raw response:', text.substring(0, 200));
    }
    return { error: 'Failed to parse agent response', raw: text.substring(0, 500) };
}

// ── Call AI model — delegates to shared callAgent (Strategy 1-4 JSON parsing, truncation safety) ──
// Imported from '../shared/agentUtils.js' above

// ── Call Gemini Flash — for utility nodes (router, curator, critic, editor) ──
// ~10x faster than Claude, great for structured JSON tasks
async function callFastAgent(systemPrompt, userPrompt, temperature = 0.3, maxTokens = 4096) {
    const router = getRouter();
    const result = await router.generateText({
        systemPrompt,
        userPrompt,
        temperature,
        maxTokens,
    }, { provider: 'gemini' }); // Gemini Flash for speed, router handles fallback
    return parseAgentJSON(result.text || '');
}

// ── Helper: Load brand + past projects + language directive for context injection ──
// Uses Redis-cached loadBrandContext (5-min TTL, invalidated on brand updates)
async function loadContext(brandId, userId) {
    // loadBrandContext is Redis-backed: avoids a DB hit on every node call
    const { brand } = await agentUtils.loadBrandContext(brandId);
    const pastProjects = await getPastProjects(brandId, userId);
    // buildBrandContext here is video-specific (from prompts.js) — intentionally kept separate
    const brandContext = buildBrandContext(brand);
    const styleMemory = buildStyleMemory(pastProjects);
    // Language inference — brand-aware regional language enforcement
    const langInfo = inferBrandLanguage(brand);
    const languageDirective = buildLanguageDirective(
        langInfo,
        brand?.name || '',
        brand?.dna?.targetAudience || ''
    );
    return { brand, brandContext, styleMemory, langInfo, languageDirective };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 0 (MCoT): VIDEO VISUAL GROUNDING — Analyze brand images before brainstorm
// ══════════════════════════════════════════════════════════════════════════════
export async function videoVisualGroundingNode(state) {
    console.log('🧠 MCoT Node: Video Visual Grounding — analyzing brand images...');

    if (!state.brandId) {
        console.log('🧠 MCoT: No brandId, skipping visual grounding');
        return { ...state, visualGrounding: null };
    }

    try {
        // Load brand via cached loadBrandContext (Brand import removed — use shared utility)
        const { brand } = await agentUtils.loadBrandContext(state.brandId);
        const products = await Product.find({ brand: state.brandId, status: 'active' })
            .select('images title')
            .limit(5)
            .lean();

        // Collect brand + product images
        const brandImages = [
            ...(brand?.logo?.url ? [brand.logo.url] : []),
            ...(brand?.dna?.brandImages || []).filter(i => i.url).map(i => i.url).slice(0, 3),
            ...products.flatMap(p => (p.images || []).filter(i => i.url).map(i => i.url)).slice(0, 3),
        ].filter(Boolean).slice(0, 5);

        // ── Also include user-uploaded ad-hoc reference images from this session ──
        // These are the images the user attached directly in the studio UI.
        // Without this, the script director only gets text labels for these images.
        const userRefImages = (state.inputImages || [])
            .map(img => img.url)
            .filter(url => url && url.startsWith('http') && !url.includes('localhost') && !url.includes('127.0.0.1'))
            .slice(0, 3);

        const allImages = [...brandImages, ...userRefImages].slice(0, 8); // Cap at 8 to avoid payload limits

        if (allImages.length === 0) {
            console.log('🧠 MCoT: No brand or user images found, skipping visual grounding');
            return { ...state, visualGrounding: null };
        }

        const userRefCount = userRefImages.length;
        const brandCount = brandImages.length;
        console.log(`🧠 MCoT: Analyzing ${allImages.length} images (${brandCount} brand + ${userRefCount} user-uploaded) for video context...`);

        const userPrompt = [
            `Analyze these ${allImages.length} images from brand "${brand?.name || 'unknown'}" and extract visual DNA for video production.`,
            userRefCount > 0 ? `The last ${userRefCount} image(s) are reference images uploaded by the user for THIS specific video — pay special attention to their subjects, products, style, and composition.` : '',
            `The user's brief: "${state.brief || 'Create a professional video'}".`,
        ].filter(Boolean).join(' ');

        const grounding = await agentUtils.callMultimodalAgent(
            VIDEO_VISUAL_GROUNDING_PROMPT,
            userPrompt,
            allImages,
            { temperature: 0.2, maxTokens: 4096 }
        );

        if (grounding && !grounding.error && !grounding.skipped) {
            console.log(`🧠 MCoT: Visual grounding complete — mood: ${grounding.brandMood || 'unknown'}, colors: ${(grounding.heroColors || []).join(', ')}`);
            return { ...state, visualGrounding: grounding };
        }

        console.warn('🧠 MCoT: Visual grounding returned empty/error result (non-blocking)');
        return { ...state, visualGrounding: null };
    } catch (err) {
        console.warn('🧠 MCoT: Visual grounding failed (non-blocking):', err.message);
        return { ...state, visualGrounding: null };
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 1: BRAINSTORM — Generate 3-5 video concepts
// ══════════════════════════════════════════════════════════════════════════════
export async function brainstormNode(state) {
    console.log('🧠 Node: Brainstorm — generating concepts...');

    const { brandContext, styleMemory, langInfo, languageDirective } = await loadContext(state.brandId, state.userId);

    if (langInfo.isRegional) {
        console.log(`🌍 Video Brainstorm: Language directive active — ${langInfo.displayName} (${langInfo.source})`);
    }

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

    // Build visual grounding context (from MCoT pre-analysis)
    let groundingContext = '';
    if (state.visualGrounding) {
        const vg = state.visualGrounding;
        groundingContext = [
            '\nVISUAL GROUNDING (from real brand/product image analysis):',
            vg.productShape ? `Product: ${vg.productShape}` : '',
            vg.heroColors?.length ? `Hero Colors: ${vg.heroColors.join(', ')}` : '',
            vg.texture ? `Materials: ${vg.texture}` : '',
            vg.brandMood ? `Brand Mood: ${vg.brandMood}` : '',
            vg.cinematicStyle ? `Cinematic Direction: ${vg.cinematicStyle}` : '',
            vg.shotSuggestions?.length ? `Shot Ideas: ${vg.shotSuggestions.join('; ')}` : '',
            vg.avoidList?.length ? `Avoid: ${vg.avoidList.join('; ')}` : '',
        ].filter(Boolean).join('\n');
    }

    // ── MCP: Fetch live video trends for brainstorm enrichment ──
    let videoTrendContext = '';
    try {
        const trending = await callMcpTool('fetch_trending', { brandId: state.brandId });
        const topics = (trending?.data?.trending || []).slice(0, 3).map(t => `• ${t.topic}`).join('\n');
        const viralFormats = (trending?.data?.viralFormats || []).slice(0, 3).join(', ');
        if (topics || viralFormats) {
            videoTrendContext = `\n📡 LIVE TRENDING TOPICS (via MCP):\n${topics}\nViral Video Formats: ${viralFormats}\nIncorporate relevant trends naturally into concepts.`;
        }
    } catch { /* non-blocking */ }

    const userPrompt = [
        `VIDEO BRIEF: ${state.brief || 'Create a professional video ad'}`,
        `VIDEO TYPE: ${state.videoType || 'ad-film'}`,
        imageContext,
        groundingContext,
        videoTrendContext,
    ].filter(Boolean).join('\n');

    // Inject language directive into system prompt (prepend to BRAINSTORM_PROMPT)
    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${BRAINSTORM_PROMPT(brandContext, styleMemory)}`
        : BRAINSTORM_PROMPT(brandContext, styleMemory);

    const result = await agentUtils.callAgent(
        systemPrompt,
        userPrompt,
        0.8 // Higher creativity for brainstorming
    );

    return {
        ...state,
        concepts: result.concepts || [],
        detectedLanguage: langInfo,
        status: 'brainstorm',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE 2: SCRIPT DIRECTOR — Write shot-by-shot script + backend prompt
// ══════════════════════════════════════════════════════════════════════════════
export async function scriptDirectorNode(state) {
    console.log('🎬 Node: Script Director — writing script...');

    const { brandContext, styleMemory, langInfo, languageDirective } = await loadContext(state.brandId, state.userId);

    const selectedConcept = state.concepts[state.selectedConceptIndex];
    if (!selectedConcept) throw new Error('No concept selected');

    if (langInfo.isRegional) {
        console.log(`🌍 Video Script: Language directive active — ${langInfo.displayName} (${langInfo.source})`);
    }

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

    // Build visual grounding context for script
    let groundingContext = '';
    if (state.visualGrounding) {
        const vg = state.visualGrounding;
        groundingContext = [
            '\nVISUAL GROUNDING (from MCoT brand image analysis — use these real details):',
            vg.productShape ? `Product Look: ${vg.productShape}` : '',
            vg.heroColors?.length ? `Hero Colors: ${vg.heroColors.join(', ')} — use in color grading direction` : '',
            vg.texture ? `Materials/Textures: ${vg.texture} — inform lighting choices` : '',
            vg.cinematicStyle ? `Cinematic Style: ${vg.cinematicStyle}` : '',
        ].filter(Boolean).join('\n');
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
        groundingContext,
        // Reinforce language in user prompt too for script dialogue
        langInfo.isRegional ? `\nCRITICAL: All dialogue, voiceover text, and onscreen text in this script MUST be written in ${langInfo.displayName}. The backend prompt for the video model can remain in English for technical accuracy.` : '',
    ].filter(Boolean).join('\n');

    // Pass the model that will actually render this script — prompts are structurally different per model
    const targetModel = state.routing?.selectedModel || 'seedance-2.0';

    // Inject language directive into system prompt (prepend to SCRIPT_DIRECTOR_PROMPT)
    const systemPrompt = languageDirective
        ? `${languageDirective}\n\n${SCRIPT_DIRECTOR_PROMPT(brandContext, styleMemory, targetModel)}`
        : SCRIPT_DIRECTOR_PROMPT(brandContext, styleMemory, targetModel);

    const result = await agentUtils.callAgent(
        systemPrompt,
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
        detectedLanguage: langInfo,
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

    const model = result.selectedModel || 'seedance-2.0'; // Default to Seedance 2.0 as requested
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

    const model = state.routing?.selectedModel || 'grok-imagine';
    const resolution = state.routing?.resolution || '1080p';
    const mode = state.routing?.mode || 'fast';

    // Enrich prompt with shot-by-shot visual details from the script
    const shots = state.script?.shots || [];
    let prompt = state.backendPrompt || state.script?.narrative || '';
    if (shots.length > 0 && !prompt.includes('Shot ')) {
        const shotDescriptions = shots.map((s, i) => {
            const parts = [`Shot ${i + 1} (${s.duration || 3}s):`];
            if (s.visual) parts.push(s.visual);
            if (s.camera) parts.push(`Camera: ${s.camera}`);
            if (s.dialogue) parts.push(`VO: "${s.dialogue}"`);
            return parts.join(' ');
        }).join('\n');
        prompt = `${prompt}\n\nDETAILED SHOT BREAKDOWN:\n${shotDescriptions}`;
    }

    // Use first reference image if available (for image-to-video models)
    // IMPORTANT: Skip base64 data URIs AND localhost URLs — external APIs can't access them
    let imageUrl = null;
    const candidates = [
        ...(state.inputImages || []).map(img => img.url),
        ...(state.references?.userUploaded || []).map(img => img.url),
        ...(state.references?.brandImages || []).map(img => img.url),
    ].filter(Boolean);

    // Helper: check if a URL is accessible by external APIs
    // Note: base64 is now allowed here because clients use ensureS3Url to upload to S3 before submission
    const isExternallyAccessible = (url) => {
        if (!url) return false;
        if (url.startsWith('data:')) return true; // Allowed (will be S3-hosted by client)
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

    // Collect all reference images for consistency
    const referenceImages = [
        ...(state.inputImages || []).map(img => img.url),
        ...(state.references?.userUploaded || []).map(img => img.url),
    ].filter(u => u && isExternallyAccessible(u));

    const { requestId, endpoint, statusUrl, resultUrl, provider, _piApiPayload, _muApiPayload, _laozhangVideoUrl } = await submitVideoGeneration({
        model,
        prompt,
        imageUrl,
        duration: state.script?.totalDuration || 5,
        resolution,
        mode,
        shots: shots.length > 1 ? shots : undefined, // Only use multi-prompt if 2+ shots
        generateAudio: state.routing?.generateAudio !== false,
        aspectRatio: state.routing?.aspectRatio || '16:9',
        referenceImages,
    });

    return {
        ...state,
        generation: {
            falRequestId: requestId,
            falEndpoint: endpoint,
            falStatusUrl: statusUrl,   // null for Grok & LZ
            falResultUrl: resultUrl,   // null for Grok & LZ
            provider: provider || 'fal', // 'grok', 'fal', 'kie', 'piapi', 'muapi', 'laozhang'
            _piApiPayload: _piApiPayload || null, // For PiAPI auto-retry
            _muApiPayload: _muApiPayload || null, // For MuAPI auto-retry
            _laozhangVideoUrl: _laozhangVideoUrl || null, // LZ sync video URL
            videoUrl: _laozhangVideoUrl || '',
            thumbnailUrl: '',
            progress: _laozhangVideoUrl ? 100 : 5,
            startedAt: new Date(),
            ...((_laozhangVideoUrl) ? { completedAt: new Date() } : {}),
            error: '',
        },
        status: _laozhangVideoUrl ? 'critique' : 'generating',
    };
}

/**
 * Poll video generation status (called separately, not a pipeline node)
 */
export async function pollGenerationStatus(state) {
    if (!state.generation?.falRequestId) return state;

    let statusResult;

    // LaoZhang: Video was generated synchronously — URL already stored
    if (state.generation?.provider === 'laozhang') {
        return {
            ...state,
            generation: {
                ...state.generation,
                status: 'COMPLETED',
                progress: 100,
                videoUrl: state.generation._laozhangVideoUrl || state.generation.videoUrl || '',
                completedAt: state.generation.completedAt || new Date(),
            },
            status: 'critique',
        };
    }

    // Branch polling based on provider (strict provider-based routing)
    if (state.generation?.provider === 'grok') {
        statusResult = await getGrokGenerationStatus(state.generation.falRequestId);
    } else if (state.generation?.provider === 'piapi') {
        // PiAPI polling — Seedance 2.0 (when PiAPI is active provider)
        statusResult = await getPiApiGenerationStatus(state.generation.falRequestId);

        // 🧹 WATERMARK REMOVAL CASCADE:
        // If generation is complete but we haven't removed the watermark yet, trigger the removal task
        if (statusResult.status === 'COMPLETED' && !state.generation.isWatermarkRemoved) {
            console.log(`✨ PiAPI: Video generation done (${statusResult.videoUrl.substring(0, 60)}...). Starting watermark removal...`);
            try {
                const unwatermark = await submitPiApiWatermarkRemoval(statusResult.videoUrl);
                return {
                    ...state,
                    generation: {
                        ...state.generation,
                        falRequestId: unwatermark.taskId,
                        isWatermarkRemoved: true,
                        progress: 95, // Stay in progress for the removal step
                        error: '',
                    },
                    status: state.status || 'generating', // Keep in generating/advanced-generating
                };
            } catch (err) {
                console.warn(`⚠️ PiAPI: Automatic watermark removal failed: ${err.message}. Proceeding with watermarked video.`);
                // Fall through to proceed with the watermarked video if removal task submission fails
            }
        }

        // AUTO-RETRY: PiAPI intermittently fails with "failed to process task" (code 10000)
        // Automatically resubmit up to 2 times using the stored payload
        if (statusResult.status === 'FAILED' && statusResult.retryable && state.generation._piApiPayload) {
            const retryCount = state.generation._piApiRetryCount || 0;
            const MAX_RETRIES = 2;
            if (retryCount < MAX_RETRIES) {
                console.log(`🔄 PiAPI auto-retry ${retryCount + 1}/${MAX_RETRIES}: resubmitting task...`);
                try {
                    const retryResult = await resubmitPiApiTask(state.generation._piApiPayload);
                    return {
                        ...state,
                        generation: {
                            ...state.generation,
                            falRequestId: retryResult.taskId,
                            progress: 5,
                            startedAt: new Date(),
                            error: '',
                            _piApiRetryCount: retryCount + 1,
                        },
                        status: state.status, // Keep current status (generating/advanced-generating)
                    };
                } catch (retryErr) {
                    console.error(`❌ PiAPI auto-retry failed: ${retryErr.message}`);
                    // Fall through to normal failure handling
                }
            } else {
                console.warn(`⚠️ PiAPI exhausted ${MAX_RETRIES} auto-retries, reporting failure`);
            }
        }
    } else if (state.generation?.provider === 'muapi') {
        // MuAPI polling — Seedance 2.0 (dynamic provider)
        statusResult = await getMuApiGenerationStatus(state.generation.falRequestId);

        // AUTO-RETRY: MuAPI failures — resubmit up to 2 times
        if (statusResult.status === 'FAILED' && statusResult.retryable && state.generation._muApiPayload) {
            const retryCount = state.generation._muApiRetryCount || 0;
            const MAX_RETRIES = 2;
            if (retryCount < MAX_RETRIES) {
                console.log(`🔄 MuAPI auto-retry ${retryCount + 1}/${MAX_RETRIES}: resubmitting task...`);
                try {
                    const retryResult = await resubmitMuApiTask(state.generation._muApiPayload);
                    return {
                        ...state,
                        generation: {
                            ...state.generation,
                            falRequestId: retryResult.taskId,
                            progress: 5,
                            startedAt: new Date(),
                            error: '',
                            _muApiRetryCount: retryCount + 1,
                        },
                        status: state.status,
                    };
                } catch (retryErr) {
                    console.error(`❌ MuAPI auto-retry failed: ${retryErr.message}`);
                }
            } else {
                console.warn(`⚠️ MuAPI exhausted ${MAX_RETRIES} auto-retries, reporting failure`);
            }
        }
    } else if (state.generation?.provider === 'kie') {
        // kie.ai polling — Veo 3.1 Fast
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
        status: statusResult.status === 'COMPLETED' ? (state.mode === 'image-to-video' ? 'completed' : 'critique')
             : statusResult.status === 'FAILED' ? 'failed'
             : state.status,
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
    try {
        // Load brand context — CRITICAL: without this, enhanced prompts lose brand DNA
        const { brandContext, styleMemory } = await loadContext(state.brandId, state.userId);

        const targetModel = state.model || 'seedance-2.0';
        const userPrompt = `Enhance this video generation prompt for the ${targetModel} model:\n\n"${state.prompt}"\n\nDesired duration: ${state.duration || 5}s\nAspect ratio: ${state.aspectRatio || '16:9'}\nKey requirement: follow the exact prompt structure for ${targetModel} as described in your instructions.`;

        const result = await callFastAgent(
            PROMPT_ENHANCER_PROMPT(brandContext, styleMemory, targetModel),
            userPrompt,
            0.5,
            4096
        );

        if (!result || result.error) {
            console.warn('⚠️ Prompt enhancement AI failed (parse error or empty), using original prompt.');
            return {
                ...state,
                enhancedPrompt: state.prompt,
                enhanceChanges: [],
            };
        }

        return {
            ...state,
            enhancedPrompt: result.enhancedPrompt || state.prompt,
            enhanceChanges: result.changes || [],
        };
    } catch (err) {
        console.error('❌ enhancePromptNode error (falling back to original prompt):', err.message);
        return {
            ...state,
            enhancedPrompt: state.prompt,
            enhanceChanges: [],
        };
    }
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
    const prompt = (state.enhancedPrompt || state.prompt || '').trim();
    const model = state.model || 'kling-3.0';
    const cap = MODEL_CAPABILITIES[model];
    
    // Safety check for duration to prevent NaN
    const minDur = cap?.duration?.min || 3;
    const maxDur = cap?.duration?.native || 15;
    const duration = Math.min(
        Math.max(Number(state.duration) || 5, minDur),
        maxDur
    );

    console.log(`🎬 Advanced Generate: Model=${model}, Dur=${duration}s, refImages=${(state.referenceImages || []).length}, prompt="${prompt.substring(0, 60)}..."`);

    if (!prompt) {
        throw new Error('Video generation failed: Prompt is missing or empty after processing.');
    }

    // For PiAPI (seedance), base64 is supported in image_urls — other providers use ensureS3Url
    let imageUrl = state.firstImageUrl || undefined;
    if (imageUrl && model !== 'seedance-2.0') {
        if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
            console.warn('⚠️ firstImageUrl is localhost — external video APIs can\'t access it. Skipping.');
            imageUrl = undefined;
        }
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
        referenceImages: state.referenceImages || [],
        shots: state.shots || [],
        refAudio: state.refAudio || undefined,
        refVideo: state.refVideo || undefined,
    });

    return {
        ...state,
        generation: {
            falRequestId: result.requestId,
            falEndpoint: result.endpoint,
            falStatusUrl: result.statusUrl,
            falResultUrl: result.resultUrl,
            provider: result.provider || 'fal',
            _piApiPayload: result._piApiPayload || null, // For PiAPI auto-retry
            _muApiPayload: result._muApiPayload || null, // For MuAPI auto-retry
            _laozhangVideoUrl: result._laozhangVideoUrl || null, // LZ sync video URL
            videoUrl: result._laozhangVideoUrl || '', // Pre-fill if LZ sync
            progress: result._laozhangVideoUrl ? 100 : 5,
            startedAt: new Date(),
            ...(result._laozhangVideoUrl ? { completedAt: new Date() } : {}),
        },
        costPreview: estimateCost(model, duration, state.resolution || '1080p', state.qualityMode || 'fast'),
        status: result._laozhangVideoUrl ? 'critique' : 'advanced-generating',
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// UGC PRO NODES — MCoT-driven pipeline for Seedance 2.0 UGC generation
// ══════════════════════════════════════════════════════════════════════════════

/**
 * UGC Pro Node 1: Product Visual Grounding (MCoT — callMultimodalAgent)
 * Analyses product images + URL content to extract UGC-specific product intelligence.
 */
export async function ugcProductGroundingNode(state) {
    console.log('🔍 UGC Pro Node: Product Visual Grounding...');

    const productImages = (state.productImageUrls || []).filter(u => u && u.startsWith('http')).slice(0, 4);
    let textContext = state.productText || '';

    // If a product URL is provided, scrape content via MCP web_search
    if (state.productUrl) {
        try {
            const searchResult = await callMcpTool('web_search', { query: state.productUrl, mode: 'deep' });
            if (searchResult?.data?.text) {
                textContext = `URL: ${state.productUrl}\n\n${searchResult.data.text.substring(0, 5000)}`;
            }
        } catch (e) {
            console.warn(`[UGC Node] URL scrape failed: ${e.message}, using URL only`);
            textContext = `Product page: ${state.productUrl}`;
        }
    }

    const userPrompt = [
        `Analyse this product for UGC video creation.`,
        textContext ? `\nPRODUCT INFO:\n${textContext}` : '',
        productImages.length > 0 ? `\n${productImages.length} product images are attached for visual analysis.` : '',
    ].filter(Boolean).join('');

    let result;
    if (productImages.length > 0) {
        // MCoT: multimodal analysis with product images
        result = await agentUtils.callMultimodalAgent(
            UGC_PRODUCT_GROUNDING_PROMPT,
            userPrompt,
            productImages,
            { temperature: 0.2, maxTokens: 2048 }
        );
    } else {
        // Text-only fallback
        result = await agentUtils.callAgent(
            UGC_PRODUCT_GROUNDING_PROMPT,
            userPrompt,
            0.2, 2048,
            { preferFast: true }
        );
    }

    if (result && !result.error) {
        console.log(`[UGC Node] Product grounding complete - ${result.productName || 'unknown product'}`);
    }

    return {
        ...state,
        productData: result || {},
        status: 'product-grounded',
    };
}

/**
 * UGC Pro Node 2: Avatar Generation (NanoBanana 2 via geminiImageGenerate)
 * Either processes an uploaded avatar image or generates one from a text description + Brand DNA.
 */
export async function ugcAvatarNode(state) {
    console.log('[UGC Node] Avatar Processing...');

    // Path 1: User uploaded an avatar image — just validate and pass through
    if (state.avatarUrl) {
        console.log(`  -> Using uploaded avatar: ${state.avatarUrl.substring(0, 60)}...`);
        return { ...state, avatarReady: true, status: 'avatar-ready' };
    }

    // Path 2: Generate avatar via NanoBanana 2 with Brand DNA
    if (!state.avatarDescription) {
        console.warn('[UGC Node] No avatar URL or description provided');
        return { ...state, avatarReady: false, status: 'avatar-missing' };
    }

    try {
        const { brandContext } = await loadContext(state.brandId, state.userId);
        const prompt = UGC_AVATAR_PROMPT(
            brandContext,
            state.avatarDescription,
            state.environment || 'home'
        );

        console.log(`  -> Generating avatar via NanoBanana 2: "${state.avatarDescription.substring(0, 60)}..."`);
        const { imageUrl } = await geminiImageGenerate(prompt, [], 0.5, {
            aspectRatio: '9:16',
            referenceImageUrls: [],
        });

        console.log(`[UGC Node] Avatar generated: ${imageUrl.substring(0, 60)}...`);
        return {
            ...state,
            avatarUrl: imageUrl,
            avatarReady: true,
            avatarGenerated: true,
            status: 'avatar-ready',
        };
    } catch (err) {
        console.error('[UGC Node] Avatar generation failed:', err.message);
        return { ...state, avatarReady: false, avatarError: err.message, status: 'avatar-failed' };
    }
}

/**
 * UGC Pro Node 3: Seedance Prompt Builder (callAgent with Brand DNA)
 * Constructs the final MuAPI-ready prompt from product data + settings.
 * Enforces @image1 (avatar) and @image2 (product) tags for Seedance I2V.
 */
export async function ugcPromptBuilderNode(state) {
    console.log('[UGC Node] Building Seedance 2.0 prompt...');

    const { brand, brandContext } = await loadContext(state.brandId, state.userId);
    const product = state.productData || {};
    const settings = state.settings || {};
    const imageCount = (state.imageUrls || []).length;

    // Build a rich brand context supplement
    const brandName = brand?.name || '';
    const brandDNA = brand?.dna || {};

    const userPrompt = [
        `Build a Seedance 2.0 UGC video prompt for ${brandName || 'this brand'}.`,
        '',
        `BRAND: ${brandName}`,
        brandDNA.tagline ? `BRAND TAGLINE: ${brandDNA.tagline}` : '',
        brandDNA.personality ? `BRAND VOICE: ${brandDNA.personality}` : '',
        brandDNA.targetAudience ? `TARGET AUDIENCE: ${brandDNA.targetAudience}` : '',
        '',
        `PRODUCT: ${product.productName || 'Product'}`,
        `USP: ${product.mainUSP || 'Quality product'}`,
        `KEY FEATURES: ${(product.keyFeatures || []).join(', ')}`,
        `CATEGORY: ${product.productCategory || 'other'}`,
        `HANDLING: ${product.productHandling || 'held in hands'}`,
        product.tagline ? `PRODUCT TAGLINE: ${product.tagline}` : '',
        product.problemSolved ? `SOLVES: ${product.problemSolved}` : '',
        '',
        `GENERATION SETTINGS:`,
        `- UGC Style: ${settings.style || 'review'}`,
        `- Mood: ${settings.mood || 'authentic'}`,
        `- Environment: ${settings.environment || product.idealEnvironment || 'home'}`,
        `- Opening Hook: ${settings.hookStyle || 'bold_claim'}`,
        `- Duration: ${settings.duration || 8} seconds`,
        `- Aspect Ratio: ${settings.aspectRatio || '9:16'}`,
        `- CTA: ${settings.cta || 'Shop now'}`,
        `- Spoken Language: ${settings.language || 'English'}`,
        '',
        `CRITICAL LANGUAGE RULE: All spoken dialogue and text hooks in your output prompt MUST be written in ${settings.language || 'English'}. Seedance 2.0 uses this to generate the native audio.`,
        '',
        `IMAGES AVAILABLE: ${imageCount}`,
        imageCount >= 1 ? '- @image1 = avatar/model person (MUST be referenced as the human in every shot)' : '',
        imageCount >= 2 ? '- @image2 = product (MUST be referenced as the physical product being shown)' : '',
        imageCount > 2 ? `- @image3 to @image${imageCount} = additional product angles` : '',
        '',
        product.suggestedDialogue ? `SUGGESTED DIALOGUE: "${product.suggestedDialogue}"` : '',
        product.suggestedHooks ? `HOOK OPTIONS: ${product.suggestedHooks.join(' | ')}` : '',
    ].filter(Boolean).join('\n');

    const result = await agentUtils.callAgent(
        UGC_PROMPT_BUILDER_PROMPT(brandContext),
        userPrompt,
        0.4, 1024,
    );

    // callAgent may return parsed JSON or raw string
    let prompt = typeof result === 'string' ? result : (result?.raw || result?.text || JSON.stringify(result));

    // POST-PROCESSING: Guarantee @image1 (avatar) is referenced
    if (imageCount >= 1 && !prompt.includes('@image1')) {
        console.log('[UGC Node] Injecting missing @image1 tag into prompt');
        prompt = `The person @image1 faces the camera in a natural UGC setting. ` + prompt;
    }

    // Guarantee @image2 (product) is referenced if available
    if (imageCount >= 2 && !prompt.includes('@image2')) {
        console.log('[UGC Node] Injecting missing @image2 tag into prompt');
        prompt = prompt.replace(
            /\[(\d+)s-(\d+)s\]/,
            (match) => `${match} The person @image1 holds up the product @image2.`
        );
    }

    // Ensure constraint block references @image1
    if (!prompt.includes('Maintain face')) {
        prompt += '\nMaintain face and clothing consistency of @image1 throughout, no distortion, natural smooth movements. Generate video without subtitles.';
    } else if (!prompt.includes('of @image1')) {
        prompt = prompt.replace('Maintain face and clothing consistency', 'Maintain face and clothing consistency of @image1');
    }

    console.log(`[UGC Node] Prompt built (${prompt.split(/\s+/).length} words, @image1: ${prompt.includes('@image1')}, @image2: ${prompt.includes('@image2')})`);

    return {
        ...state,
        backendPrompt: prompt,
        status: 'prompt-ready',
    };
}

