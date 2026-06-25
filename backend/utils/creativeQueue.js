/**
 * Creative Generation Queue — Bull + Redis
 *
 * Supports:
 *   - Upstash (rediss:// TLS) via REDIS_URL
 *   - Standard Redis (redis://) via REDIS_URL
 *   - Legacy REDIS_HOST/PORT/PASSWORD split config
 *   - Local Redis (127.0.0.1:6379) for dev
 *
 * Bull requires explicit host/port/tls — it does NOT parse rediss:// URLs natively.
 * We parse the URL ourselves and pass ioredis-style options.
 */

import Bull from 'bull';
import mongoose from 'mongoose';
import GenerationJob from '../models/GenerationJob.js';
import { refundCredits } from '../middleware/credits.js';

// ── Build ioredis-compatible config for Bull ──────────────────────────────────
function buildBullRedisConfig() {
    const url = process.env.REDIS_URL;

    if (url) {
        try {
            const parsed = new URL(url);
            const isTLS = url.startsWith('rediss://');
            return {
                host: parsed.hostname,
                port: parseInt(parsed.port) || 6379,
                password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
                username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
                // Upstash requires TLS; rejectUnauthorized: false for self-signed certs
                tls: isTLS ? { rejectUnauthorized: false } : undefined,
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
                connectTimeout: 10000,
            };
        } catch (e) {
            console.warn('⚠️ creativeQueue: Failed to parse REDIS_URL, falling back to host config:', e.message);
        }
    }

    // Legacy host/port/password split
    if (process.env.REDIS_HOST) {
        return {
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
            tls: process.env.REDIS_TLS === 'true' ? { rejectUnauthorized: false } : undefined,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
        };
    }

    // Local development fallback
    return {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    };
}

const redisConfig = buildBullRedisConfig();

export const creativeQueue = new Bull('creative-generation', {
    redis: redisConfig,
    settings: {
        lockDuration:      900000, // 15 min — prevents premature stall detection on long videos
        stalledInterval:   900000,
        maxStalledCount:   1,
    },
    defaultJobOptions: {
        attempts:      2,
        removeOnComplete: true,  // Keep Redis clean — we store results in MongoDB
        removeOnFail:  false,    // Keep failed jobs for debugging
    },
});

creativeQueue.on('error', (err) => {
    console.error('🚨 Bull Queue Error:', err.message);
});

// ── Worker — initialized in index.js after all models are loaded ───────────
export const initCreativeWorker = (internalGenerateCreative) => {
    console.log('👷 Creative Worker Initialized (Concurrency: 10)');

    creativeQueue.process(10, async (job) => {
        const { jobId, userId, payload } = job.data;
        const { brandId, type, prompt, options, creditsDeducted } = payload;

        try {
            console.log(`📦 [Queue] Processing JOB ${jobId} (User: ${userId})`);

            await GenerationJob.findOneAndUpdate(
                { jobId },
                { status: 'processing', startedAt: new Date() }
            );

            const User = mongoose.model('User');
            const user = await User.findById(userId);
            if (!user) throw new Error('User not found for background job');

            const data = await internalGenerateCreative({
                body: { brandId, type, prompt, options, jobId },
                user,
                creditsDeducted: creditsDeducted || 0,
                jobId,
            });

            if (data?.success && data?.creative) {
                // ── NOTE: internalGenerateCreative already marked the job 'completed'
                // with a slim result object (no raw base64). We do NOT overwrite it here
                // to avoid re-introducing large base64 imageUrl back into MongoDB.
                // Only log for debugging.
                console.log(`✅ [Queue] JOB ${jobId} completed — Creative: ${data.creative._id}`);
                return { success: true, creativeId: data.creative._id };
            } else {
                throw new Error(data?.error || 'Pipeline returned no creative');
            }
        } catch (err) {
            console.error(`❌ [Queue] JOB ${jobId} failed:`, err.message);

            await GenerationJob.findOneAndUpdate(
                { jobId },
                { status: 'failed', completedAt: new Date(), errorMessage: err.message }
            );

            if (creditsDeducted > 0) {
                try {
                    await refundCredits(
                        userId, creditsDeducted, 'creative',
                        `Refund: Queue Job ${jobId} Failed — ${err.message}`, 'creative'
                    );
                    console.log(`💰 [Queue] Credits refunded for JOB ${jobId}`);
                } catch (refundErr) {
                    console.error(`❌ [Queue] Refund failed for JOB ${jobId}:`, refundErr.message);
                }
            }

            throw err; // Let Bull handle retry logic
        }
    });

    creativeQueue.on('failed', (job, err) => {
        console.error(`🚨 [Queue] Job ${job.id} permanently failed:`, err.message);
    });

    creativeQueue.on('completed', (job) => {
        // removeOnComplete handles this — kept for logging if needed
        console.log(`✅ [Queue] Job ${job.id} cleaned up`);
    });
};
