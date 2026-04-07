import Redis from 'ioredis';

const redisClient = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL, {
  tls: { rejectUnauthorized: false },
  retryStrategy: (times) => Math.min(times * 200, 3000),
  maxRetriesPerRequest: 1,
}) : null;

if (redisClient) {
  redisClient.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
       console.warn('⚠️  Redis connection refused. Check your REDIS_URL or start redis-server.');
    } else {
       console.error('Redis Client Error:', err);
    }
  });
  redisClient.on('connect', () => console.log('✅ Redis Connected'));
}

const CACHE_TTL = 300; // 5 minutes default

/**
 * Helper to get data from Redis cache or fetch from DB if missing
 * @param {string} key 
 * @param {Function} fetchFn 
 * @param {number} ttl 
 */
export async function getCachedOrFetch(key, fetchFn, ttl = CACHE_TTL) {
  try {
    if (!redisClient) return fetchFn();

    const cached = await redisClient.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
    
    const data = await fetchFn();
    if (data) {
      await redisClient.setex(key, ttl, JSON.stringify(data));
    }
    return data;
  } catch (err) {
    if (err.code !== 'ECONNREFUSED') {
      console.warn(`Cache error for key ${key}:`, err.message);
    }
    return fetchFn(); // Fallback to DB on cache error
  }
}

/**
 * Get current Redis connection status
 */
export function getRedisStatus() {
  return {
    configured: !!process.env.REDIS_URL,
    connected: redisClient ? redisClient.status === 'ready' : false,
    mode: 'TLS/SSL (Upstash)',
    host: process.env.REDIS_URL ? 'charming-narwhal-74523.upstash.io' : 'none'
  };
}

export default redisClient;
