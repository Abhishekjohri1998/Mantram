/**
 * Cache Utility — powered by the shared redisClient singleton
 *
 * Now delegates to redisClient.js which uses @upstash/redis REST SDK:
 *   - UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (primary — HTTPS/443)
 *   - REDIS_URL (used by Bull queue — TCP Redis protocol)
 *   - Local Redis (dev fallback when no env vars set)
 */

import redis from './redisClient.js';

const CACHE_TTL = 300; // 5 minutes default

/**
 * Get data from Redis cache or fetch from source if missing.
 * @param {string} key
 * @param {Function} fetchFn
 * @param {number} ttl — seconds
 */
export async function getCachedOrFetch(key, fetchFn, ttl = CACHE_TTL) {
    try {
        const cached = await redis.get(key);
        if (cached) return JSON.parse(cached);

        const data = await fetchFn();
        if (data) await redis.setex(key, ttl, JSON.stringify(data));
        return data;
    } catch (err) {
        console.warn(`⚠️ getCachedOrFetch(${key}): ${err.message} — falling back to live fetch`);
        return fetchFn();
    }
}

/**
 * Get current Redis connection status (used by superadmin health check).
 */
export function getRedisStatus() {
    // Primary: @upstash/redis REST SDK (HTTPS/443)
    const hasRestUrl   = !!process.env.UPSTASH_REDIS_REST_URL;
    const hasRestToken = !!process.env.UPSTASH_REDIS_REST_TOKEN;
    // Legacy fallbacks
    const hasUrl  = !!process.env.REDIS_URL;
    const hasHost = !!process.env.REDIS_HOST;

    const configured = (hasRestUrl && hasRestToken) || hasUrl || hasHost;
    const connected  = redis.isConnected();

    let mode, endpoint;
    if (hasRestUrl && hasRestToken) {
        mode     = 'Upstash REST (HTTPS/443)';
        endpoint = process.env.UPSTASH_REDIS_REST_URL;
    } else if (hasUrl) {
        mode = process.env.REDIS_URL.startsWith('rediss://') ? 'TLS/SSL (URL)' : 'URL';
        try {
            // Mask credentials: rediss://user:pass@host:port → rediss://***@host:port
            const u = new URL(process.env.REDIS_URL);
            endpoint = `${u.protocol}//${u.hostname}:${u.port}`;
        } catch {
            endpoint = '(invalid REDIS_URL)';
        }
    } else if (hasHost) {
        mode     = process.env.REDIS_TLS === 'true' ? 'TLS/SSL (host)' : 'standard (host)';
        endpoint = process.env.REDIS_HOST;
    } else {
        mode     = 'local/none';
        endpoint = '127.0.0.1:6379';
    }

    return { configured, connected, mode, endpoint };
}

export default redis;
