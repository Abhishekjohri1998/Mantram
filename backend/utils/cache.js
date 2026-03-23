import Redis from 'ioredis';

const redisClient = process.env.REDIS_HOST ? new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT) || 6379,
  // ElastiCache with encryption requires TLS
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  retryStrategy: (times) => Math.min(times * 200, 3000),
  maxRetriesPerRequest: 1, // Fail fast if it's down
}) : null;

if (redisClient) {
  redisClient.on('error', (err) => {
    if (err.code === 'ECONNREFUSED') {
       console.warn('⚠️  Redis connection refused. Check your REDIS_HOST or start redis-server.');
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

export default redisClient;
