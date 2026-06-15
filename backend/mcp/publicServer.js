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
    InitializeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import ApiKey from '../models/ApiKey.js';
import User from '../models/User.js';
import Brand from '../models/Brand.js';
import VideoProject from '../models/VideoProject.js';
import { internalGenerateCreative } from '../routes/creatives.js';
import { advancedGenerateNode } from '../agents/videoStudio/nodes.js';
import { getSignedUrlIfNeeded } from '../utils/s3.js';

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

            if (!data?.success && !data?.imageUrl && !data?.creative?.imageUrl) {
                throw new Error(data?.error || 'Image generation failed');
            }

            // Resolve final image URL
            let imageUrl = data.imageUrl || data.creative?.imageUrl;
            const creativeId = data.creative?._id;

            // Sign S3 URLs if needed
            if (imageUrl?.includes('s3.') && !imageUrl.includes('X-Amz-Signature')) {
                try { imageUrl = await getSignedUrlIfNeeded(imageUrl); } catch (_) {}
            }

            // If still base64, serve via proxy endpoint
            if (imageUrl?.startsWith('data:image/') && creativeId) {
                imageUrl = `https://api.mantram.ai/api/creatives/${creativeId}/image`;
            }

            const elapsed = Date.now() - t0;
            console.log(`   ✅ [PublicMCP] generate_image done in ${elapsed}ms → ${imageUrl?.substring(0, 60)}`);

            return {
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        imageUrl,
                        creativeId: creativeId?.toString(),
                        brand: brand?.name || null,
                        message: `Image generated successfully! View or download it here: ${imageUrl}`,
                    }, null, 2),
                }],
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
        // Skip auth for OPTIONS preflight
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
                error: 'Invalid or revoked API key. Generate a new key at https://mantram.ai/settings/integrations',
            });
        }

        // Load the full user
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
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP SERVER FACTORY
// Creates a fresh Server + StreamableHTTPServerTransport per request.
// Stateless mode: no session IDs — cleaner for public REST-like usage.
// ─────────────────────────────────────────────────────────────────────────────

function createMcpServerForRequest(user) {
    const server = new Server(
        {
            name: 'mantram-ai',
            version: '1.0.0',
        },
        {
            capabilities: { tools: {} },
        }
    );

    // List tools
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: PUBLIC_TOOLS,
    }));

    // Execute tools
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;
        try {
            return await executeTool(name, args || {}, user);
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

    // ── CORS: Open to all MCP clients (Claude Desktop, Cursor, etc.) ──────────
    router.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    // ── API KEY AUTH + RATE LIMITER ──────────────────────────────────────────
    router.use(mcpApiKeyAuth);
    router.use(mcpRateLimiter);

    // ── GET /mcp — Info endpoint (also handles SSE stream if client requests it)
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
