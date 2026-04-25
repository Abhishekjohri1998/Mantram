/**
 * MCP Registry — Local Fast-Path
 * 
 * Bypasses HTTP/SSE completely for internal 'mantram-tools' to avoid
 * PM2 cluster state issues.
 */

import {TOOL_DEFINITIONS} from './mantramToolsServer.js';

const SERVER_NAME = 'mantram-tools';

export async function callMcpTool(toolName, args = {}) {
    try {
        return await callToolDirectly(toolName, args);
    } catch (err) {
        console.warn(`⚠️ Local MCP Tool (${toolName}) execution failed:`, err.message);
        return { success: false, error: err.message };
    }
}

export async function getMcpToolSchemas() {
    return TOOL_DEFINITIONS.map(tool => ({
        type: 'function',
        function: {
            name: `${SERVER_NAME}__${tool.name}`, // Prevent collisions
            description: tool.description,
            parameters: tool.inputSchema
        }
    }));
}

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
        case 'web_search':             return webSearch(args.query, args.mode || 'quick', args.forceDeep || false);
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
