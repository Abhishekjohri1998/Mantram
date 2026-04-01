import { Agent } from 'undici';

/**
 * Shared high-performance connection pool for all external and internal API calls.
 * Reuses TCP/TLS connections to Google, HeyGen, LaoZhang, Fal, Grok, and S3
 * to eliminate the 500ms-1200ms handshake latency on subsequent requests.
 */
export const keepAliveAgent = new Agent({
    keepAliveTimeout: 60000, // Keep connection open for 1 minute of inactivity
    connections: 100,         // Pool up to 100 concurrent connections
    pipelining: 1,            // Standard pipelining
});

/**
 * Global fetch options helper (optional usage)
 */
export const fetchOptions = (opts = {}) => ({
    ...opts,
    dispatcher: keepAliveAgent,
});
