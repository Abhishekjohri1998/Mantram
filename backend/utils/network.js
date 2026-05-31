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

import { Agent } from 'undici';

export const keepAliveDispatcher = new Agent({
    keepAliveTimeout: 30000,
    keepAliveMaxTimeout: 60000,
    connections: 64,
    pipelining: 1,
});

/**
 * Global fetch options helper.
 * Provides a standardized way to pass agents to fetch.
 */
export const fetchOptions = (opts = {}) => {
    return {
        ...opts,
        dispatcher: keepAliveDispatcher,
    };
};
