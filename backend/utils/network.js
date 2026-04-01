/**
 * Shared networking utilities.
 * Simplified for maximum compatibility across Node.js versions.
 */

import http from 'node:http';
import https from 'node:https';

/**
 * Standard Node.js Keep-Alive Agents.
 * These are 100% compatible with all environments and provide
 * persistent connections for reduced latency (socket reuse).
 */
export const keepAliveAgent = {
    http: new http.Agent({
        keepAlive: true,
        maxSockets: 64,
        keepAliveMsecs: 1000,
    }),
    https: new https.Agent({
        keepAlive: true,
        maxSockets: 64,
        keepAliveMsecs: 1000,
    })
};

/**
 * Global fetch options helper.
 * Provides a standardized way to pass agents to fetch.
 * NOTE: Native fetch (Node 18+) uses 'dispatcher' via undici.
 * If undici is unavailable, it is safest to skip the dispatcher.
 */
export const fetchOptions = (opts = {}) => {
    return {
        ...opts,
        // We avoid adding a 'dispatcher' here because it can cause crashes 
        // in environments with incompatible undici/native-fetch builds.
    };
};
