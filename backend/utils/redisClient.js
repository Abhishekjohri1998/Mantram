/**
 * Redis Client — Singleton for Agent Caching
 *
 * Supports:
 *   - Hosted Redis via REDIS_URL (Upstash/Railway/Redis Labs)
 *   - TLS auto-detected from rediss:// prefix
 *   - Graceful no-op fallback if Redis is unavailable
 *
 * Usage:
 *   import redis from '../utils/redisClient.js';
 *   await redis.get('key')   → null if Redis down (never throws)
 *   await redis.setex('key', ttlSeconds, value)  → silently skips if down
 *   await redis.del('key')   → silently skips if down
 */

import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
const REDIS_HOST = process.env.REDIS_HOST;
const REDIS_PORT = parseInt(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_TLS = process.env.REDIS_TLS === 'true';

// ── Build connection config ──────────────────────────────────────────────────
function buildRedisConfig() {
    // Option 1: Full URL (Upstash, Railway, Redis Labs)
    if (REDIS_URL) {
        const isTLS = REDIS_URL.startsWith('rediss://');
        return {
            mode: 'url',
            url: REDIS_URL,
            tls: isTLS ? {} : undefined,
        };
    }
    // Option 2: Host + Port + Password (legacy splits)
    if (REDIS_HOST) {
        return {
            mode: 'host',
            host: REDIS_HOST,
            port: REDIS_PORT,
            password: REDIS_PASSWORD || undefined,
            tls: REDIS_TLS ? {} : undefined,
        };
    }
    // Option 3: Local (development only)
    return { mode: 'local', host: '127.0.0.1', port: 6379 };
}

// ── Create client ────────────────────────────────────────────────────────────
let redisClient = null;
let isAvailable = false;

function createClient() {
    const cfg = buildRedisConfig();
    let client;

    const sharedOptions = {
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        connectTimeout: 5000,
        lazyConnect: true,
        // Prevent connection flood on failures
        retryStrategy: (times) => {
            if (times > 3) {
                console.warn('⚠️ Redis: max retries reached — running without cache');
                return null; // Stop retrying
            }
            return Math.min(times * 500, 2000);
        },
    };

    if (cfg.mode === 'url') {
        client = new IORedis(cfg.url, {
            ...sharedOptions,
            tls: cfg.tls,
        });
    } else {
        client = new IORedis({
            host: cfg.host,
            port: cfg.port,
            password: cfg.password,
            tls: cfg.tls,
            ...sharedOptions,
        });
    }

    client.on('connect', () => {
        isAvailable = true;
        console.log(`✅ Redis: Connected (${cfg.mode === 'url' ? 'URL' : cfg.host + ':' + cfg.port})`);
    });

    client.on('error', (err) => {
        if (isAvailable) {
            // Only log first error to avoid log spam
            console.warn(`⚠️ Redis error: ${err.message} — cache disabled until reconnect`);
        }
        isAvailable = false;
    });

    client.on('reconnecting', () => {
        console.log('🔄 Redis: Reconnecting...');
    });

    client.on('close', () => {
        isAvailable = false;
    });

    return client;
}

// ── Safe wrapper — never throws ──────────────────────────────────────────────
class SafeRedisClient {
    constructor() {
        this._client = null;
        this._connecting = false;
    }

    async _getClient() {
        if (this._client && isAvailable) return this._client;
        if (!this._client && !this._connecting) {
            this._connecting = true;
            this._client = createClient();
            try {
                await this._client.connect();
            } catch (err) {
                console.warn(`⚠️ Redis: Could not connect — ${err.message}. Running without cache.`);
                isAvailable = false;
            }
            this._connecting = false;
        }
        return isAvailable ? this._client : null;
    }

    /**
     * Get a value by key. Returns null if key missing or Redis unavailable.
     */
    async get(key) {
        try {
            const client = await this._getClient();
            if (!client) return null;
            return await client.get(key);
        } catch (err) {
            console.warn(`⚠️ Redis.get("${key}") failed: ${err.message}`);
            return null;
        }
    }

    /**
     * Set a value with TTL in seconds. Silently skips if Redis unavailable.
     */
    async setex(key, ttlSeconds, value) {
        try {
            const client = await this._getClient();
            if (!client) return;
            await client.setex(key, ttlSeconds, value);
        } catch (err) {
            console.warn(`⚠️ Redis.setex("${key}") failed: ${err.message}`);
        }
    }

    /**
     * Delete one or more keys. Silently skips if Redis unavailable.
     */
    async del(...keys) {
        try {
            const client = await this._getClient();
            if (!client) return;
            await client.del(...keys);
        } catch (err) {
            console.warn(`⚠️ Redis.del(${keys.join(',')}) failed: ${err.message}`);
        }
    }

    /**
     * Check if Redis is currently reachable.
     */
    isConnected() {
        return isAvailable;
    }

    /**
     * Get connection status for health checks.
     */
    async ping() {
        try {
            const client = await this._getClient();
            if (!client) return false;
            const result = await client.ping();
            return result === 'PONG';
        } catch {
            return false;
        }
    }
}

// Export singleton
const redis = new SafeRedisClient();

// Eagerly connect on import so first agent call is cached
redis._getClient().catch(() => {});

export default redis;
