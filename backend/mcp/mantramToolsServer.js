/**
 * Mantram Internal MCP Tool Server — v3 (final, correct for SDK v1.29.0)
 *
 * Key fixes vs previous attempts:
 *  1. NO local express.json() — parent app already runs it; re-running causes stream error
 *  2. Routes POST /messages by ?sessionId (what SDK client sends)
 *  3. Passes req.body as `parsedBody` to handlePostMessage — SDK skips getRawBody()
 *  4. sessionId registered AFTER server.connect() (transport.sessionId available only post-start)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Router } from 'express';

import {
    webSearch,
    fetchTrending,
    scrapeCompetitor,
    fetchSEOAudit,
    fetchContentHistory,
    fetchPerformanceLearnings,
} from '../agents/contentStudio/tools.js';

// ── Tool Definitions ──────────────────────────────────────────────────────────

export const TOOL_DEFINITIONS = [
    {
        name: 'web_search',
        description: 'Search the web for real-time information. mode="quick" (Grok, 20-min cache) or mode="deep" (Perplexity/Gemini grounded).',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query' },
                mode: { type: 'string', enum: ['quick', 'deep'] },
            },
            required: ['query'],
        },
    },
    {
        name: 'fetch_trending',
        description: 'Get live trending topics, viral formats, and calendar hooks for a brand. Grok live search + Google Autocomplete. 20-min cache.',
        inputSchema: {
            type: 'object',
            properties: { brandId: { type: 'string', description: 'MongoDB brand ID' } },
            required: ['brandId'],
        },
    },
    {
        name: 'scrape_competitor',
        description: 'Crawl competitor sites and analyze their content strategy.',
        inputSchema: {
            type: 'object',
            properties: { brandId: { type: 'string', description: 'MongoDB brand ID' } },
            required: ['brandId'],
        },
    },
    {
        name: 'fetch_seo_audit',
        description: 'Pull latest SEO audit for a brand: health score, keywords, content gaps.',
        inputSchema: {
            type: 'object',
            properties: { brandId: { type: 'string', description: 'MongoDB brand ID' } },
            required: ['brandId'],
        },
    },
    {
        name: 'fetch_content_history',
        description: 'Get past content patterns for a brand: types, top-rated examples, engagement.',
        inputSchema: {
            type: 'object',
            properties: {
                brandId: { type: 'string', description: 'MongoDB brand ID' },
                platform: { type: 'string', description: 'Optional platform filter' },
                limit: { type: 'number', description: 'Max items. Default: 15' },
            },
            required: ['brandId'],
        },
    },
    {
        name: 'fetch_performance_learnings',
        description: '90-day RLHF performance playbook: accept/regen rates, top content, what to avoid.',
        inputSchema: {
            type: 'object',
            properties: { brandId: { type: 'string', description: 'MongoDB brand ID' } },
            required: ['brandId'],
        },
    },
    {
        name: 'scrape_social_profile',
        description: 'Analyze a social media profile\'s content style, voice, and themes via web search. Returns platform-specific content intelligence.',
        inputSchema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'Social media profile URL' },
                platform: { type: 'string', enum: ['instagram', 'linkedin', 'twitter', 'facebook'], description: 'Social platform' },
                brandName: { type: 'string', description: 'Brand name for search context' },
            },
            required: ['url', 'platform'],
        },
    },
];

// ── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(name, args) {
    console.log(`🛠️  MCP: ${name}`, JSON.stringify(args).substring(0, 100));
    const t0 = Date.now();
    let result;
    switch (name) {
        case 'web_search':             result = await webSearch(args.query, args.mode || 'quick'); break;
        case 'fetch_trending':         result = await fetchTrending(args.brandId); break;
        case 'scrape_competitor':      result = await scrapeCompetitor(args.brandId); break;
        case 'fetch_seo_audit':        result = await fetchSEOAudit(args.brandId); break;
        case 'fetch_content_history':  result = await fetchContentHistory(args.brandId, args.platform || '', args.limit || 15); break;
        case 'fetch_performance_learnings': result = await fetchPerformanceLearnings(args.brandId); break;
        case 'scrape_social_profile': {
            // Option C: Use web search to find social content (no scraping needed)
            const searchQuery = args.brandName
                ? `site:${new URL(args.url).hostname} "${args.brandName}"`
                : `site:${new URL(args.url).hostname}`;
            result = await webSearch(searchQuery, 'quick');
            break;
        }
        default: throw new Error(`Unknown MCP tool: ${name}`);
    }
    console.log(`   ✅ MCP: ${name} => ${Date.now() - t0}ms`);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

// ── MCP Router ────────────────────────────────────────────────────────────────

export function createMantramMcpRouter() {
    const router = Router();

    // Session registry: sessionId (string) → SSEServerTransport
    // The SDK sets sessionId after transport.start() is called inside server.connect()
    const transports = new Map();

    // ── GET /sse — Client opens SSE stream ──
    router.get('/sse', async (req, res) => {
        console.log('🔌 MCP: SSE client connected from', req.ip);

        const server = new Server(
            { name: 'mantram-tools', version: '1.0.0' },
            { capabilities: { tools: {} } }
        );

        server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
        server.setRequestHandler(CallToolRequestSchema, async (req) => {
            const { name, arguments: args } = req.params;
            try {
                return await executeTool(name, args || {});
            } catch (err) {
                console.error(`❌ MCP Tool ${name}:`, err.message);
                return {
                    content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }],
                    isError: true,
                };
            }
        });

        // Transport sends the client the POST endpoint URL with ?sessionId appended
        const transport = new SSEServerTransport('/mcp/tools/messages', res);

        // server.connect() calls transport.start() → sets _sseResponse + sends 'endpoint' event
        await server.connect(transport);

        // transport.sessionId is now available (set by start())
        const sid = transport.sessionId;
        transports.set(sid, transport);
        console.log(`🔌 MCP: SSE session ready: ${sid}`);

        res.on('close', () => {
            transports.delete(sid);
            console.log(`🔌 MCP: SSE session ended: ${sid}`);
        });
    });

    // ── POST /messages — Client sends JSON-RPC messages ──
    // The parent app's express.json() has already parsed req.body.
    // We pass req.body as 'parsedBody' so handlePostMessage skips getRawBody()
    // (which would fail because the stream is already consumed).
    router.post('/messages', async (req, res) => {
        const sid = req.query.sessionId;
        if (!sid) return res.status(400).json({ error: 'Missing ?sessionId' });

        const transport = transports.get(sid);
        if (!transport) {
            console.warn(`⚠️ MCP: No session for sessionId=${sid}. Active: ${[...transports.keys()].join(',') || 'none'}`);
            return res.status(404).json({ error: `No active MCP session: ${sid}` });
        }

        try {
            // req.body is already a parsed JS object from parent express.json()
            // Pass it as parsedBody — SDK will use it directly without re-reading stream
            await transport.handlePostMessage(req, res, req.body);
        } catch (err) {
            console.error('❌ MCP POST error:', err.message);
            if (!res.headersSent) res.status(500).json({ error: err.message });
        }
    });

    return router;
}
