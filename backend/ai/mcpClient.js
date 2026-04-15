import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * Model Context Protocol (MCP) Bridge
 * Centralized manager for dynamically connecting to and consuming MCP-compliant servers.
 */
class McpBridgeManager {
    constructor() {
        this.clients = new Map(); // serverName -> Client instance
        this.systemTools = [];
    }

    /**
     * Disconnect and forget a server (forces re-connect on next use).
     */
    disconnect(serverName) {
        const client = this.clients.get(serverName);
        if (client) {
            try { client.close?.(); } catch (_) { /* ignore */ }
            this.clients.delete(serverName);
            console.log(`🔌 MCP: Disconnected ${serverName}`);
        }
    }

    /**
     * Connect to an MCP server running over Server-Sent Events (SSE)
     * e.g., a local python MCP proxy, or a third-party tool provider.
     */
    async connectServer(serverName, sseUrl) {
        try {
            // If we already have a client cached, validate it's still alive
            if (this.clients.has(serverName)) {
                return this.clients.get(serverName);
            }

            console.log(`🔌 Connecting to MCP Server: ${serverName} at ${sseUrl}`);
            const transport = new SSEClientTransport(new URL(sseUrl));
            
            const client = new Client(
                { name: 'mantram-ai-nexus', version: '1.0.0' },
                { capabilities: { tools: {} } }
            );

            await client.connect(transport);
            this.clients.set(serverName, client);
            console.log(`✅ MCP Server ${serverName} connected`);
            return client;
        } catch (error) {
            // Ensure stale client is removed so next call retries
            this.clients.delete(serverName);
            console.error(`❌ Failed to connect to MCP Server ${serverName}:`, error);
            throw error;
        }
    }

    /**
     * Fetch all tools from a registered MCP server and format them
     * into the standard OpenAI-compatible tool schema used by Nexus.
     */
    async getToolsAsSchema(serverName) {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`MCP Server ${serverName} not connected.`);
        }

        const response = await client.listTools();
        
        // Map MCP tools to standard function calling structure
        return response.tools.map(tool => ({
            type: 'function',
            function: {
                name: `${serverName}__${tool.name}`, // Prevent collisions
                description: tool.description,
                parameters: tool.inputSchema
            }
        }));
    }

    /**
     * Execute a tool on the target MCP server.
     * The tool name must be prefixed with `${serverName}__` to route correctly.
     */
    async executeTool(prefixedToolName, args) {
        // Parse out the server name and actual tool name
        const parts = prefixedToolName.split('__');
        if (parts.length < 2) {
            throw new Error(`Invalid MCP tool name: ${prefixedToolName}`);
        }
        
        const serverName = parts[0];
        const rawToolName = parts.slice(1).join('__'); // in case tool name has '__'

        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`Router: MCP Server ${serverName} not connected.`);
        }

        console.log(`🛠️ Dispatched MCP Tool: ${rawToolName} on ${serverName}`);
        
        try {
            const result = await client.callTool({
                name: rawToolName,
                arguments: args
            });

            // Parse result.content (usually an array of TextContent/ImageContent)
            if (result.content && result.content.length > 0) {
                const textContent = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
                return textContent;
            }
            
            return JSON.stringify(result);
        } catch (err) {
            // If it's a session error (404/stale), evict the client so next call reconnects
            if (err.message?.includes('404') || err.message?.includes('No active MCP session')) {
                console.warn(`⚠️ MCP: Stale session for ${serverName} — evicting for reconnect`);
                this.disconnect(serverName);
            }
            throw err;
        }
    }
}

// Export singleton instance
export const mcpBridge = new McpBridgeManager();
