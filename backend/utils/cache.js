import Redis from 'ioredis';

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  // ElastiCache with encryption requires TLS
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => Math.min(times * 200, 3000),
  maxRetriesPerRequest: 3,
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.on('connect', () => console.log('✅ Redis Connected'));

const CACHE_TTL = 300; // 5 minutes default

/**
 * Helper to get data from Redis cache or fetch from DB if missing
 * @param {string} key 
 * @param {Function} fetchFn 
 * @param {number} ttl 
 */
export async function getCachedOrFetch(key, fetchFn, ttl = CACHE_TTL) {
  try {
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
    console.warn(`Cache error for key ${key}:`, err.message);
    return fetchFn(); // Fallback to DB on cache error
  }
}

export default redisClient;
