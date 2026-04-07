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

import { Redis } from '@upstash/redis';

const REST_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const configured = !!(REST_URL && REST_TOKEN);

// ── Build the Upstash REST client (only if configured) ────────────────────────
let _client = null;
if (configured) {
    _client = new Redis({
        url:   REST_URL,
        token: REST_TOKEN,
    });
    console.log(`✅ Redis: Upstash REST client initialized (${REST_URL})`);
} else {
    console.warn('⚠️ Redis: UPSTASH_REDIS_REST_URL / TOKEN not set — running without cache');
}

// ── Safe wrapper — every method is try/catch, never throws ───────────────────
class SafeRedisClient {

    isConnected() {
        return configured && _client !== null;
    }

    /**
     * GET — returns null if missing, down, or any error.
     */
    async get(key) {
        if (!_client) return null;
        try {
            // @upstash/redis returns parsed value directly (not raw string)
            // For compatibility with legacy JSON.parse callers we return the raw string.
            const val = await _client.get(key);
            if (val === null || val === undefined) return null;
            // If already an object/array (Upstash auto-parses JSON), re-stringify
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
