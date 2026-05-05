/**
 * MCP Tool Registry — Skills Hub 2.0
 *
 * Central dispatcher for all tool calls that skills can invoke.
 * Each tool is a registered async handler that receives (params, context).
 *
 * context = { user, brand, brandContext, inputs, executionId }
 *
 * Supported tools (Phase 1):
 *   creative_studio.generate_image   → generate image(s) via NanoBanana/Gemini pipeline
 *   creative_studio.generate_images  → batch generate multiple images
 *   content_studio.save_draft        → save text content to Content Studio
 *   brand_context.read               → read full brand DNA (always injected)
 *   video_studio.queue_generation    → queue a Seedance/Kling/Veo video job
 *   calendar.save_posts              → save posts to Smart Calendar schedule
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Brand from '../models/Brand.js';
import Creative from '../models/Creative.js';
import { internalGenerateCreative } from './creatives.js';
import Content from '../models/Content.js';

import { safeErrorMessage } from '../utils/safeError.js';
import fetch from 'node-fetch';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// TOOL REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

async function executeTool(toolId, params, context) {
    const tool = TOOLS[toolId];
    if (!tool) throw new Error(`Unknown MCP tool: ${toolId}`);
    console.log(`🔧 MCP Tool: ${toolId}`, JSON.stringify(params).substring(0, 200));
    return await tool(params, context);
}

// ─── Interpolate {{template}} variables in params ──────────────────────────
function interpolate(params, vars) {
    if (!params) return params;
    const str = JSON.stringify(params);
    const replaced = str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
    try { return JSON.parse(replaced); } catch { return params; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL IMPLEMENTATIONS
// ─────────────────────────────────────────────────────────────────────────────

const TOOLS = {

    // ── 1. Generate Image ─────────────────────────────────────────────────────
    'creative_studio.generate_image': async (params, ctx) => {
        let { prompt, style, size = '1:1', count = 1, platform, referenceImages } = params;
        if (!prompt) throw new Error('generate_image: prompt is required');

        // Normalize prompt to handle cases where it might be an object
        if (typeof prompt === 'object') {
            console.log('📦 MCP generate_image: Normalizing object prompt to string');
            prompt = prompt.text || prompt.brief || prompt.prompt || prompt.description || JSON.stringify(prompt);
        }

        // ── Process reference images ──────────────────────────────────────
        // User uploads arrive as base64 data URLs. The Gemini generation
        // pipeline needs HTTP URLs (it downloads them to create inlineData).
        // So we upload base64 → S3, keep HTTP URLs as-is.
        const processedRefUrls = [];
        if (referenceImages?.length > 0) {
            const { uploadToS3 } = await import('../utils/s3.js');
            for (const refImg of referenceImages) {
                try {
                    if (refImg.startsWith('data:image/')) {
                        // base64 data URL → upload to S3
                        const s3Url = await uploadToS3(
                            refImg,
                            `skill-refs/${ctx.brand?._id || 'default'}/${Date.now()}-ref.png`
                        );
                        console.log(`📤 MCP: Uploaded skill reference image to S3: ${s3Url.substring(0, 80)}...`);
                        processedRefUrls.push(s3Url);
                    } else if (refImg.startsWith('http')) {
                        // Already an HTTP URL — use directly
                        processedRefUrls.push(refImg);
                    }
                } catch (uploadErr) {
                    console.warn(`⚠️ MCP: Failed to process reference image: ${uploadErr.message}`);
                }
            }
        }

        const hasRefs = processedRefUrls.length > 0;

        // Build the prompt — inject reference image guidance if ref images exist
        let finalPrompt = prompt;
        if (hasRefs) {
            finalPrompt = [
                prompt,
                '',
                'REFERENCE IMAGE GUIDANCE:',
                `${processedRefUrls.length} reference image(s) are provided as visual input.`,
                'You MUST analyze these reference images and generate a NEW image that:',
                '- Maintains the same visual style, color palette, and aesthetic',
                '- Uses similar composition techniques and lighting',
                '- Matches the overall mood and artistic direction',
                '- Creates something NEW and original while being clearly inspired by the references',
                'Do NOT reproduce the reference exactly — create a fresh variation in the same style.',
            ].join('\n');
        }

        const payload = {
            prompt: finalPrompt,
            type: 'instagram-post',
            brandId: ctx.brand?._id,
            options: {
                aspectRatio: size,
                imageModel: 'nanobanana-2',
                imageSize: '1K',
            },
            source: 'skill_execution',
            skillExecutionId: ctx.executionId,
            // THIS IS THE KEY: pass reference image URLs so internalGenerateCreative
            // can forward them to routedImageGenerate() as refImageUrls
            refImageUrls: processedRefUrls,
        };

        // Call the internal creative generation pipeline directly.
        // This is synchronous, ensuring the skill waits for the image to be ready.
        const data = await internalGenerateCreative({
            body: payload,
            user: ctx.user,
            creditsDeducted: 0,
            jobId: `skill-${ctx.executionId || Date.now()}`,
        });

        if (!data?.success && !data?.imageUrl && !data?.images && !data?.creative?.imageUrl) {
            throw new Error(`Image generation failed: ${data?.error || 'Unknown error'}`);
        }

        // The internalGenerateCreative returns { success, creative: { imageUrl, _id } }
        let imageUrl = data.imageUrl || data.creative?.imageUrl;
        const creativeId = data.creative?._id;


        // If imageUrl is base64, use the proxy endpoint so frontend can display it
        if (imageUrl?.startsWith('data:image/') && creativeId) {
            // Use relative path for frontend consumption to avoid localhost leak in production
            const internalUrl = process.env.INTERNAL_API_URL || '';
            const isLocal = !internalUrl || internalUrl.includes('localhost') || internalUrl.includes('127.0.0.1');
            
            if (isLocal) {
                // Return relative path for the frontend to resolve
                imageUrl = `/api/creatives/${creativeId}/image`;
            } else {
                // Use the configured internal URL if it's external (e.g. cross-server)
                imageUrl = `${internalUrl.replace(/\/$/, '')}/api/creatives/${creativeId}/image`;
            }
        }

        // If imageUrl is an S3 path, sign it
        if (imageUrl && imageUrl.includes('s3.') && !imageUrl.includes('X-Amz-Signature')) {
            try {
                const { getSignedUrlIfNeeded } = await import('../utils/s3.js');
                imageUrl = await getSignedUrlIfNeeded(imageUrl);
            } catch (e) { /* use as-is */ }
        }

        const images = data.images || (imageUrl ? [{ url: imageUrl, id: creativeId }] : []);
        console.log(`✅ MCP generate_image: ${images.length} image(s) generated${hasRefs ? ` (with ${processedRefUrls.length} reference(s))` : ''}`);
        return { type: 'images', images, count: images.length };
    },

    // ── 2. Generate Multiple Images (batch) ───────────────────────────────────
    'creative_studio.generate_images': async (params, ctx) => {
        const { prompts = [], style, size = '1:1' } = params;
        if (!prompts.length) throw new Error('generate_images: prompts array is required');

        const results = await Promise.allSettled(
            prompts.slice(0, 4).map(prompt =>
                TOOLS['creative_studio.generate_image']({ prompt, style, size }, ctx)
            )
        );

        const images = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value.images || []);

        console.log(`✅ MCP generate_images: ${images.length}/${prompts.length} succeeded`);
        return { type: 'images', images, count: images.length };
    },

    // ── 3. Save to Content Studio ─────────────────────────────────────────────
    'content_studio.save_draft': async (params, ctx) => {
        const { title, content, type = 'social', platform = '', tags = [] } = params;
        if (!content) throw new Error('save_draft: content is required');

        const items = Array.isArray(content) ? content : [{ title, content, platform }];
        const saved = [];

        for (const item of items.slice(0, 30)) {
            try {
                const doc = await Content.create({
                    user: ctx.user._id,
                    brand: ctx.brand?._id,
                    type,
                    title: item.title || title || 'Skill Output',
                    content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content, null, 2),
                    platform: item.platform || platform,
                    status: 'draft',
                    tags: ['skill:auto-generated', ...(item.tags || tags)],
                    aiMeta: { agenticPipeline: true, pipelineStep: 'skill-mcp-output', skillExecutionId: ctx.executionId },
                });
                saved.push({ id: doc._id, title: doc.title });
            } catch (e) {
                console.warn(`MCP save_draft item failed: ${e.message}`);
            }
        }

        console.log(`✅ MCP save_draft: ${saved.length} item(s) saved to Content Studio`);
        return { type: 'content_saved', saved, count: saved.length };
    },

    // ── 4. Read Brand Context ─────────────────────────────────────────────────
    'brand_context.read': async (params, ctx) => {
        if (!ctx.brand) return { type: 'brand_context', context: null };
        return {
            type: 'brand_context',
            context: {
                name: ctx.brand.name,
                industry: ctx.brand.dna?.industry,
                description: ctx.brand.dna?.brandDescription,
                tone: ctx.brand.dna?.toneOfVoice,
                audience: ctx.brand.dna?.targetAudience,
                colors: ctx.brand.dna?.brandColors,
                country: ctx.brand.dna?.country,
                tagline: ctx.brand.dna?.tagline,
                productCategory: ctx.brand.dna?.productCategory,
            },
        };
    },

    // ── 5. Queue Video Generation ─────────────────────────────────────────────
    'video_studio.queue_generation': async (params, ctx) => {
        const { prompt, model = 'seedance-2.0', duration = 5, aspectRatio = '16:9', qualityMode = 'fast' } = params;
        if (!prompt) throw new Error('queue_generation: prompt is required');

        const baseUrl = process.env.INTERNAL_API_URL || `http://localhost:${process.env.PORT || 3001}`;
        try {
            const resp = await fetch(`${baseUrl}/api/video-studio/advanced/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ctx.internalToken}`,
                },
                body: JSON.stringify({
                    model, prompt, duration, aspectRatio, qualityMode,
                    brandId: ctx.brand?._id,
                    source: 'skill_execution',
                    allowDiskUse: true,
                }),
                signal: AbortSignal.timeout(30000), // just queuing, not waiting for result
            });
            
            if (!resp.ok) {
                throw new Error(`Video generation request failed: ${resp.status}`);
            }
        } catch (error) {
            console.error('MCP queue_generation error:', error.message);
            throw new Error(`Failed to queue video generation: ${error.message}`);
        }

        const data = await resp.json();
        console.log(`✅ MCP queue_generation: projectId=${data.projectId}`);
        return {
            type: 'video_queued',
            projectId: data.projectId,
            model,
            message: `Video queued — check Video Studio for results (takes 40-60s)`,
        };
    },

    // ── 6. Save Posts to Calendar ─────────────────────────────────────────────
    'calendar.save_posts': async (params, ctx) => {
        const { posts = [] } = params;
        if (!posts.length) return { type: 'calendar_saved', count: 0 };

        // Store as content with scheduling metadata
        const saved = [];
        for (const post of posts.slice(0, 60)) {
            try {
                const doc = await Content.create({
                    user: ctx.user._id,
                    brand: ctx.brand?._id,
                    type: 'social',
                    title: post.title || post.day ? `Day ${post.day}` : 'Scheduled Post',
                    content: post.content || post.caption || '',
                    platform: post.platform || '',
                    status: 'scheduled',
                    scheduledFor: post.scheduledFor ? new Date(post.scheduledFor) : null,
                    tags: ['skill:calendar', 'auto-scheduled'],
                    aiMeta: { agenticPipeline: true, pipelineStep: 'skill-calendar' },
                });
                saved.push({ id: doc._id });
            } catch (e) {
                console.warn(`MCP calendar save_posts item failed: ${e.message}`);
            }
        }

        console.log(`✅ MCP calendar.save_posts: ${saved.length} posts saved`);
        return { type: 'calendar_saved', count: saved.length, saved };
    },
};

// Export for use in skills route
export { executeTool, interpolate, TOOLS };

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE: GET /api/mcp-tools — list available tools (for skill builder UI)
// ─────────────────────────────────────────────────────────────────────────────

export const MCP_TOOL_MANIFEST = [
    {
        id: 'creative_studio.generate_image',
        label: 'Generate Image',
        description: 'Generate a brand-aware image using the Creative Studio pipeline',
        icon: 'image',
        category: 'creative',
        requiredParams: ['prompt'],
        optionalParams: ['style', 'size', 'platform'],
        outputType: 'images',
        creditCost: 5,
    },
    {
        id: 'creative_studio.generate_images',
        label: 'Generate Multiple Images',
        description: 'Batch generate up to 4 images in parallel',
        icon: 'photo_library',
        category: 'creative',
        requiredParams: ['prompts'],
        optionalParams: ['style', 'size'],
        outputType: 'images',
        creditCost: 15,
    },
    {
        id: 'content_studio.save_draft',
        label: 'Save to Content Studio',
        description: 'Save AI-generated content as draft(s) in Content Studio',
        icon: 'edit_note',
        category: 'content',
        requiredParams: ['content'],
        optionalParams: ['title', 'type', 'platform', 'tags'],
        outputType: 'content_saved',
        creditCost: 0,
    },
    {
        id: 'video_studio.queue_generation',
        label: 'Generate Video',
        description: 'Queue a video generation job in Video Studio (Seedance 2.0/Kling)',
        icon: 'movie_creation',
        category: 'video',
        requiredParams: ['prompt'],
        optionalParams: ['model', 'duration', 'aspectRatio', 'qualityMode'],
        outputType: 'video_queued',
        creditCost: 34,
    },
    {
        id: 'calendar.save_posts',
        label: 'Save to Calendar',
        description: 'Save and optionally schedule posts in Smart Calendar',
        icon: 'calendar_month',
        category: 'content',
        requiredParams: ['posts'],
        optionalParams: [],
        outputType: 'calendar_saved',
        creditCost: 0,
    },
    {
        id: 'brand_context.read',
        label: 'Read Brand Context',
        description: 'Inject full brand DNA into the execution (auto-injected, rarely needed explicitly)',
        icon: 'domain',
        category: 'brand',
        requiredParams: [],
        optionalParams: [],
        outputType: 'brand_context',
        creditCost: 0,
    },
];

router.get('/', protect, (req, res) => {
    res.json({ success: true, tools: MCP_TOOL_MANIFEST });
});

export default router;
