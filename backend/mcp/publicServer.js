/**
 * Mantram Public MCP Server — v1
 *
 * Exposes Mantram AI creative tools as a public MCP endpoint.
 * Clients connect via: https://api.mantram.ai/mcp
 * Auth: Authorization: Bearer mnt_sk_<key>
 *
 * Tools:
 *   - generate_image  → Creative Studio (brand-aware image generation)
 *   - generate_video  → Video Studio (async, returns project ID + status URL)
 *
 * Transport: StreamableHTTPServerTransport (stateless mode)
 * — The modern MCP standard. No SSE sessions needed. Each POST is
 *   a self-contained JSON-RPC call, just like a normal REST API.
 *
 * Claude Desktop config example:
 * {
 *   "mcpServers": {
 *     "mantram": {
 *       "type": "http",
 *       "url": "https://api.mantram.ai/mcp",
 *       "headers": { "Authorization": "Bearer mnt_sk_YOUR_KEY" }
 *     }
 *   }
 * }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import VideoProject from '../models/VideoProject.js';
import { internalGenerateCreative } from '../routes/creatives.js';
import { advancedGenerateNode } from '../agents/videoStudio/nodes.js';
import { uploadToS3, getSignedUrlIfNeeded } from '../utils/s3.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOOL DEFINITIONS (exposed to Claude)
// ─────────────────────────────────────────────────────────────────────────────

const PUBLIC_TOOLS = [
    {
        name: 'generate_image',
        description: [
            'Generate a brand-aware marketing image using Mantram Creative Studio.',
            'Uses the brand\'s DNA (colors, tone, identity) to create on-brand visuals.',
            'Returns a URL to the generated image, ready for download or social media use.',
        ].join(' '),
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Describe the image to generate. Be specific about style, subject, mood, and use case (e.g. "Instagram post for a premium skincare brand with minimalist aesthetic").',
                },
                brandId: {
                    type: 'string',
                    description: 'Your Mantram brand ID. If omitted, the first brand on your account is used.',
                },
                aspectRatio: {
                    type: 'string',
                    enum: ['1:1', '16:9', '9:16', '4:5', '3:2'],
                    description: 'Image aspect ratio. Default: 1:1 (square, best for Instagram). Use 9:16 for Stories/Reels, 16:9 for YouTube thumbnails.',
                },
                type: {
                    type: 'string',
                    enum: ['instagram-post', 'instagram-story', 'facebook-post', 'linkedin-post', 'youtube-thumbnail', 'twitter-post', 'campaign-logo', 'product-visual'],
                    description: 'Content type — helps Mantram optimise composition for the platform. Default: instagram-post.',
                },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'generate_video',
        description: [
            'Queue an AI video generation job in Mantram Video Studio.',
            'Supports models like Kling 3.0, Seedance 2.0, and Veo for professional-grade video.',
            'Video generation is ASYNC and takes 40–120 seconds. This tool returns a project ID and a',
            'status URL immediately. Use the status URL to check progress and get the final video link.',
        ].join(' '),
        inputSchema: {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    description: 'Video description. Include camera movement, subject action, lighting, and mood (e.g. "A golden Labrador running across a sunlit beach, slow-motion, cinematic, warm tones").',
                },
                brandId: {
                    type: 'string',
                    description: 'Your Mantram brand ID. If omitted, the first brand on your account is used.',
                },
                model: {
                    type: 'string',
                    enum: ['kling-3.0', 'kling-2.1', 'seedance-2.0', 'veo-2', 'wan-2.1'],
                    description: 'AI model. Default: kling-3.0 (best quality/speed balance). Use seedance-2.0 for product shots, veo-2 for cinematic.',
                },
                duration: {
                    type: 'number',
                    enum: [5, 10],
                    description: 'Video duration in seconds. Default: 5.',
                },
                aspectRatio: {
                    type: 'string',
                    enum: ['16:9', '9:16', '1:1'],
                    description: 'Video aspect ratio. Default: 16:9 (landscape). Use 9:16 for Reels/TikTok.',
                },
                qualityMode: {
                    type: 'string',
                    enum: ['fast', 'standard'],
                    description: 'fast = lower cost, standard = higher quality. Default: fast.',
                },
            },
            required: ['prompt'],
        },
    },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Resolve brand for a user
// ─────────────────────────────────────────────────────────────────────────────

async function resolveBrand(user, brandId) {
    const query = brandId
        ? { _id: brandId, user: user._id }
        : { user: user._id };
    return Brand.findOne(query).lean();
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Ensure imageUrl is a publicly accessible HTTP URL.
// internalGenerateCreative can return base64 data URLs (when S3 upload is async).
// We upload those to S3 immediately so Claude can actually display the image.
// ─────────────────────────────────────────────────────────────────────────────

async function resolvePublicImageUrl(imageUrl, creativeId) {
    if (!imageUrl) return null;

    // Already a public HTTP(S) URL — sign if S3 unsigned
    if (imageUrl.startsWith('http')) {
        if (imageUrl.includes('s3.') || imageUrl.includes('amazonaws.com')) {
            try {
                return await getSignedUrlIfNeeded(imageUrl);
            } catch (_) {
                return imageUrl;
            }
        }
        return imageUrl; // CDN, cloudfront, etc.
    }

    // Base64 data URL — upload to S3 and return a signed URL
    if (imageUrl.startsWith('data:image/')) {
        try {
            const mimeMatch = imageUrl.match(/^data:(image\/\w+);base64,/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
            const ext = mimeType.split('/')[1] || 'png';
            const key = `mcp-generated/${creativeId || Date.now()}.${ext}`;
            console.log(`⬆️  [PublicMCP] Uploading base64 image to S3: ${key}`);
            const s3Url = await uploadToS3(imageUrl, key, mimeType);
            return await getSignedUrlIfNeeded(s3Url);
        } catch (err) {
            console.warn('⚠️  [PublicMCP] S3 upload for base64 failed:', err.message);
            return null;
        }
    }

    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTOR
// ─────────────────────────────────────────────────────────────────────────────

async function executeTool(toolName, args, user) {
    const t0 = Date.now();
    console.log(`🛠️  [PublicMCP] ${toolName} | user=${user._id} | args=${JSON.stringify(args).substring(0, 120)}`);

    switch (toolName) {

        // ── generate_image ────────────────────────────────────────────────
        case 'generate_image': {
            const {
                prompt,
                brandId,
                aspectRatio = '1:1',
                type = 'instagram-post',
            } = args;

            if (!prompt) throw new Error('prompt is required');

            const brand = await resolveBrand(user, brandId);

            // Call the Creative Studio pipeline
            const data = await internalGenerateCreative({
                body: {
                    prompt,
                    type,
                    brandId: brand?._id || null,
                    options: { aspectRatio },
                    source: 'mcp_public',
                },
                user,
                creditsDeducted: 0,
                jobId: `mcp-${user._id}-${Date.now()}`,
            });

            // internalGenerateCreative returns: { success, creative, warnings }
            if (!data?.success || !data?.creative) {
                throw new Error('Image generation failed — no creative returned');
            }

            const creative = data.creative;
            const creativeId = creative._id?.toString();

            // creative.imageUrl may be: S3 URL, CDN URL, base64, or null (if async upload pending)
            const rawImageUrl = creative.imageUrl || creative.thumbnailUrl || null;

            // Ensure it's a publicly accessible URL Claude can embed/display
            const imageUrl = await resolvePublicImageUrl(rawImageUrl, creativeId);

            if (!imageUrl) {
                const elapsed = Date.now() - t0;
                console.log(`   ⚠️  [PublicMCP] generate_image: image not yet available (${elapsed}ms)`);
                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            status: 'processing',
                            creativeId,
                            brand: brand?.name || null,
                            message: [
                                `✅ Image generated! The final URL is being processed (S3 upload in progress).`,
                                `🔗 View it in Mantram Creative Studio once ready.`,
                                `Creative ID: ${creativeId}`,
                            ].join('\n'),
                        }, null, 2),
                    }],
                };
            }

            const elapsed = Date.now() - t0;
            console.log(`   ✅ [PublicMCP] generate_image done in ${elapsed}ms → ${imageUrl.substring(0, 80)}`);

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            imageUrl,
                            creativeId,
                            brand: brand?.name || null,
                            aspectRatio,
                            type,
                            message: `✅ Image generated! Download or share: ${imageUrl}`,
                        }, null, 2),
                    },
                    // Return as image content so Claude renders it inline in the chat
                    {
                        type: 'image',
                        data: imageUrl,
                        mimeType: 'image/png',
                    },
                ],
            };
        }

        // ── generate_video ────────────────────────────────────────────────
        case 'generate_video': {
            const {
                prompt,
                brandId,
                model = 'kling-3.0',
                duration = 5,
                aspectRatio = '16:9',
                qualityMode = 'fast',
            } = args;

            if (!prompt) throw new Error('prompt is required');

            const brand = await resolveBrand(user, brandId);

            // 1. Create the VideoProject record immediately
            const project = await VideoProject.create({
                user: user._id,
                brand: brand?._id || null,
                title: prompt.trim().substring(0, 60),
                status: 'advanced-generating',
                mode: 'advanced',
                advancedConfig: {
                    prompt: prompt.trim(),
                    aspectRatio,
                    duration,
                    generateAudio: true,
                },
                routing: {
                    selectedModel: model,
                    resolution: '720p',
                    mode: qualityMode,
                },
                creditsUsed: 0,
            });

            // 2. Kick off generation in the background (takes 40-120s)
            advancedGenerateNode({
                prompt,
                model,
                duration,
                resolution: '720p',
                qualityMode,
                aspectRatio,
                generateAudio: true,
                referenceImages: [],
                shots: [],
                refAudio: '',
                refVideo: '',
                firstImageUrl: '',
            }).then(async (state) => {
                const genData = { ...state.generation };
                const projectStatus = state.status === 'critique' ? 'completed' : 'advanced-generating';
                if (projectStatus === 'completed') {
                    genData.status = 'COMPLETED';
                    genData.progress = 100;
                }
                const updatePayload = { status: projectStatus, generation: genData, backendPrompt: prompt.trim() };
                if (genData.videoUrl) updatePayload.finalVideoUrl = genData.videoUrl;
                await VideoProject.findByIdAndUpdate(project._id, updatePayload);
                console.log(`✅ [PublicMCP] Video background task done: ${project._id} status=${projectStatus}`);
            }).catch(async (err) => {
                console.error(`❌ [PublicMCP] Video generation failed: ${project._id}`, err.message);
                await VideoProject.findByIdAndUpdate(project._id, {
                    status: 'failed',
                    'generation.error': err.message,
                });
            });

            const statusUrl = `https://api.mantram.ai/api/video-studio/${project._id}/status`;
            const elapsed = Date.now() - t0;
            console.log(`   ✅ [PublicMCP] generate_video queued in ${elapsed}ms → projectId=${project._id}`);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        status: 'generating',
                        projectId: project._id.toString(),
                        model,
                        duration,
                        aspectRatio,
                        statusUrl,
                        message: [
                            `✅ Video generation started! Model: ${model}, Duration: ${duration}s`,
                            `⏳ Generation takes 40–120 seconds.`,
                            `🔗 Check status at: ${statusUrl}`,
                            `📺 When complete, the video will appear in your Mantram Video Studio.`,
                        ].join('\n'),
                    }, null, 2),
                }],
            };
        }

        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE: Validate MCP API key → attach user to req
// ─────────────────────────────────────────────────────────────────────────────

async function mcpApiKeyAuth(req, res, next) {
    try {
        if (req.method === 'OPTIONS') return next();

        const authHeader = req.headers.authorization || '';
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Missing Authorization header. Use: Authorization: Bearer mnt_sk_YOUR_KEY',
            });
        }

        const plaintext = authHeader.slice(7).trim();
        const apiKey = await ApiKey.findByPlaintext(plaintext);

        if (!apiKey) {
            return res.status(401).json({
                error: 'Invalid or revoked API key. Generate a new key at https://mantram.ai/integrations',
            });
        }

        const user = await User.findById(apiKey.user).lean();
        if (!user) {
            return res.status(401).json({ error: 'User account not found' });
        }

        req.mcpUser = user;
        req.mcpApiKeyId = apiKey._id;
        next();
    } catch (err) {
        console.error('❌ [PublicMCP] Auth error:', err.message);
        res.status(500).json({ error: 'Authentication error' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITER: 60 tool calls per minute per API key
// ─────────────────────────────────────────────────────────────────────────────

const mcpRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => req.mcpApiKeyId?.toString() || req.ip,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded. Max 60 requests per minute per API key.' },
    skip: (req) => req.method === 'OPTIONS',
    validate: { trustProxy: false, keyGenerator: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP SERVER FACTORY
// Creates a fresh Server + StreamableHTTPServerTransport per request.
// Stateless mode: no session IDs — clean for public REST-like usage.
// ─────────────────────────────────────────────────────────────────────────────

function createMcpServerForRequest(user) {
    const server = new Server(
        { name: 'mantram-ai', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: PUBLIC_TOOLS,
    }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: toolArgs } = req.params;
        try {
            return await executeTool(name, toolArgs || {}, user);
        } catch (err) {
            console.error(`❌ [PublicMCP] Tool ${name} error:`, err.message);
            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({ success: false, error: err.message }),
                }],
                isError: true,
            };
        }
    });

    return server;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC MCP ROUTER
// ─────────────────────────────────────────────────────────────────────────────

export function createPublicMcpRouter() {
    const router = Router();

    // ── CORS ─────────────────────────────────────────────────────────────────
    router.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    // ── AUTH + RATE LIMIT ──────────────────────────────────────────────────────
    router.use(mcpApiKeyAuth);
    router.use(mcpRateLimiter);

    // ── GET /mcp — discovery / health ─────────────────────────────────────────
    router.get('/', (req, res) => {
        // For plain HTTP GET (e.g. health checks / discovery), return info
        const acceptsSSE = req.headers.accept?.includes('text/event-stream');
        if (!acceptsSSE) {
            return res.json({
                name: 'Mantram AI MCP Server',
                version: '1.0.0',
                tools: PUBLIC_TOOLS.map(t => ({ name: t.name, description: t.description.substring(0, 80) })),
                docs: 'https://mantram.ai/mcp-docs',
                status: 'ok',
            });
        }

        // SSE GET for server-initiated notifications — return 405 for now
        // (we run stateless, no server push needed)
        res.status(405).json({ error: 'SSE not supported in stateless mode. Use POST for all tool calls.' });
    });

    // ── POST /mcp — Main MCP endpoint (initialize, tools/list, tools/call) ───
    router.post('/', async (req, res) => {
        const user = req.mcpUser;

        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined, // stateless — no session tracking
            });

            const server = createMcpServerForRequest(user);
            await server.connect(transport);

            // Handle the request — pass req.body so body isn't re-read from stream
            await transport.handleRequest(req, res, req.body);

            // Clean up after response is sent
            res.on('finish', () => {
                transport.close().catch(() => {});
            });
        } catch (err) {
            console.error('❌ [PublicMCP] Request handling error:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'MCP server error: ' + err.message });
            }
        }
    });

    // ── DELETE /mcp — Session termination (no-op in stateless mode) ──────────
    router.delete('/', (req, res) => {
        res.json({ success: true, message: 'Stateless mode — no session to terminate.' });
    });

    return router;
}
