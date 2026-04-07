/**
 * MCP Registry — Auto-connect Singleton
 *
 * On first import, connects the global `mcpBridge` to the internal
 * Mantram Tools MCP server.  All studio nodes import `getMcpTools()`
 * instead of calling tools directly, giving the LLM the ability to
 * pick which tools to call at runtime.
 *
 * Usage in any studio node:
 *   import { callMcpTool, getMcpToolSchemas } from '../../mcp/registry.js';
 *
 *   // Execute a single tool
 *   const trends = await callMcpTool('fetch_trending', { brandId });
 *
 *   // Get tool schemas for LLM function-calling
 *   const tools = await getMcpToolSchemas();
 */

import { mcpBridge } from '../ai/mcpClient.js';

const SERVER_NAME = 'mantram-tools';
let _connected = false;
let _connecting = false;
let _connectPromise = null;

/**
 * Lazily connect to the internal MCP server.
 * Safe to call multiple times — only connects once.
 */
async function ensureConnected() {
    if (_connected) return;
    if (_connecting) return _connectPromise;

    _connecting = true;
    // Use same PORT the Express server listens on (env var or fallback 3001)
    const port = process.env.PORT || 3001;
    const sseUrl = `http://localhost:${port}/mcp/tools/sse`;

    _connectPromise = mcpBridge.connectServer(SERVER_NAME, sseUrl)
        .then(() => {
            _connected = true;
            _connecting = false;
            console.log('✅ MCP Registry: Internal tool server connected');
        })
        .catch((err) => {
            _connecting = false;
            // Non-fatal — studio will fall back to direct tool calls
            console.warn('⚠️ MCP Registry: Could not connect to internal server:', err.message);
        });

    return _connectPromise;
}

/**
 * Execute an MCP tool by name with args.
 * Falls back gracefully if MCP server is unavailable.
 * @param {string} toolName — one of: web_search, fetch_trending, scrape_competitor, fetch_seo_audit, fetch_content_history, fetch_performance_learnings
 * @param {object} args
 * @returns {object} Parsed JSON result from the tool
 */
export async function callMcpTool(toolName, args = {}) {
    try {
        await ensureConnected();
        const rawText = await mcpBridge.executeTool(`${SERVER_NAME}__${toolName}`, args);
        return JSON.parse(rawText);
    } catch (err) {
        console.warn(`⚠️ MCP callMcpTool(${toolName}) failed — falling back to direct call:`, err.message);
        return await callToolDirectly(toolName, args);
    }
}

/**
 * Get all tool schemas from the MCP server (for LLM function-calling).
 * Returns OpenAI-compatible function schema array.
 */
export async function getMcpToolSchemas() {
    try {
        await ensureConnected();
        return await mcpBridge.getToolsAsSchema(SERVER_NAME);
    } catch (err) {
        console.warn('⚠️ MCP: Could not fetch tool schemas:', err.message);
        return [];
    }
}

/**
 * Direct fallback — calls the tool functions without going through MCP.
 * Ensures studios work even if the MCP SSE connection is down.
 */
async function callToolDirectly(toolName, args) {
    const {
        webSearch,
        fetchTrending,
        scrapeCompetitor,
        fetchSEOAudit,
        fetchContentHistory,
        fetchPerformanceLearnings,
    } = await import('../agents/contentStudio/tools.js');

    switch (toolName) {
        case 'web_search':             return webSearch(args.query, args.mode || 'quick');
        case 'fetch_trending':         return fetchTrending(args.brandId);
        case 'scrape_competitor':      return scrapeCompetitor(args.brandId);
        case 'fetch_seo_audit':        return fetchSEOAudit(args.brandId);
        case 'fetch_content_history':  return fetchContentHistory(args.brandId, args.platform, args.limit);
        case 'fetch_performance_learnings': return fetchPerformanceLearnings(args.brandId);
        default: return { success: false, error: `Unknown tool: ${toolName}` };
    }
}

/**
 * Convenience: run multiple tools in parallel and return a results map.
 * @param {Array<{tool: string, args: object}>} calls
 * @returns {object} { toolName: result, ... }
 */
export async function callMcpToolsParallel(calls = []) {
    const results = await Promise.allSettled(
        calls.map(({ tool, args }) => callMcpTool(tool, args).then(r => ({ tool, result: r })))
    );
    const map = {};
    for (const r of results) {
        if (r.status === 'fulfilled') {
            map[r.value.tool] = r.value.result;
        }
    }
    return map;
}
