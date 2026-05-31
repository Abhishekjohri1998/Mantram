/**
 * Redis Client — Singleton using @upstash/redis REST SDK
 *
 * Uses Upstash's official HTTPS REST API (port 443) instead of the
 * raw Redis TCP protocol (port 6379). This works universally across
 * all networks — dev machines, CI, production servers, restricted ISPs.
 *
 * Credentials are derived from:
 *   UPSTASH_REDIS_REST_URL  → https://<endpoint>.upstash.io
 *   UPSTASH_REDIS_REST_TOKEN → the password from your REDIS_URL
 *
 * Falls back to a no-op stub when credentials are absent — the platform
 * continues to work without caching (Redis is never a hard dependency).
 *
 * Usage (identical API to previous ioredis wrapper):
 *   import redis from '../utils/redisClient.js';
 *   await redis.get('key')               → null if missing or down
 *   await redis.setex('key', ttl, value) → silently skips if down
 *   await redis.del('key', ...)          → silently skips if down
 *   await redis.ping()                   → boolean
 *   redis.isConnected()                  → boolean
 */

import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

// ── Build the TCP client ──────────────────────────────────────────────────
let _client = null;
try {
    const isTLS = REDIS_URL.startsWith('rediss://');
    const opts = {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
            if (times > 3) return null; // Fall back to cache misses
            return Math.min(times * 500, 2000);
        }
    };
    if (isTLS) opts.tls = { rejectUnauthorized: false };

    _client = new Redis(REDIS_URL, opts);
    
    _client.on('error', (err) => {
        console.warn('⚠️ Redis Connection Error:', err.message);
    });
    
    console.log(`✅ Redis: TCP client initialized (${REDIS_URL.split('@').pop()})`);
} catch (e) {
    console.warn('⚠️ Redis initialization failed:', e.message);
}

// ── Safe wrapper — every method is try/catch, never throws ───────────────────
class SafeRedisClient {

    isConnected() {
        return _client !== null && _client.status === 'ready';
    }

    /**
     * GET — returns null if missing, down, or any error.
     */
    async get(key) {
        if (!_client) return null;
        try {
            const val = await _client.get(key);
            if (val === null || val === undefined) return null;
            return typeof val === 'string' ? val : JSON.stringify(val);
        } catch (err) {
            console.warn(`⚠️ Redis.get("${key}"): ${err.message}`);
            return null;
        }
    }

    /**
     * SETEX — set with TTL in seconds.
     */
    async setex(key, ttlSeconds, value) {
        if (!_client) return;
        try {
            await _client.setex(key, ttlSeconds, value);
        } catch (err) {
            console.warn(`⚠️ Redis.setex("${key}"): ${err.message}`);
        }
    }

    /**
     * DEL — delete one or more keys.
     */
    async del(...keys) {
        if (!_client) return;
        try {
            await _client.del(...keys);
        } catch (err) {
            console.warn(`⚠️ Redis.del(${keys.join(', ')}): ${err.message}`);
        }
    }

    /**
     * PING — returns true if Upstash responds.
     */
    async ping() {
        if (!_client) return false;
        try {
            const result = await _client.ping();
            return result === 'PONG';
        } catch {
            return false;
        }
    }

    /**
     * INCR — increment counter. Returns new value or null on error.
     */
    async incr(key) {
        if (!_client) return null;
        try {
            return await _client.incr(key);
        } catch (err) {
            console.warn(`⚠️ Redis.incr("${key}"): ${err.message}`);
            return null;
        }
    }

    /**
     * EXPIRE — set TTL on an existing key (seconds).
     */
    async expire(key, ttlSeconds) {
        if (!_client) return;
        try {
            await _client.expire(key, ttlSeconds);
        } catch (err) {
            console.warn(`⚠️ Redis.expire("${key}"): ${err.message}`);
        }
    }

    /**
     * TTL — seconds remaining. Returns -2 if key not found, -1 if no expiry.
     */
    async ttl(key) {
        if (!_client) return -2;
        try {
            return await _client.ttl(key);
        } catch {
            return -2;
        }
    }
}

const redis = new SafeRedisClient();
export default redis;
