import Bull from 'bull';
import mongoose from 'mongoose';
import config from '../config/env.js';
import GenerationJob from '../models/GenerationJob.js';
import Creative from '../models/Creative.js';
import { refundCredits } from '../middleware/credits.js';
// We'll import internalGenerateCreative dynamically to avoid circular dependencies if any
// or just import it if it's safe. In creatives.js it's a local function.
// Better to move internalGenerateCreative to a service if it's shared.
// For now, I will define the worker in index.js or a separate service file.

const REDIS_URL = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`;

export const creativeQueue = new Bull('creative-generation', REDIS_URL, {
    redis: {
        maxRetriesPerRequest: null,
        enableReadyCheck: false
    },
    settings: {
        lockDuration: 300000, // 5 mins
        stalledInterval: 300000,
        maxStalledCount: 1
    }
});

// Worker will be initialized in index.js to ensure it has all models loaded
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

            // Execute the actual generation logic
            const data = await internalGenerateCreative({
                body: { brandId, type, prompt, options, jobId },
                user,
                creditsDeducted: creditsDeducted || 0,
                jobId
            });

            if (data?.success && data?.creative) {
                await GenerationJob.findOneAndUpdate(
                    { jobId },
                    {
                        status: 'completed',
                        completedAt: new Date(),
                        creativeId: data.creative._id,
                        imageUrl: data.creative.imageUrl || data.creative.thumbnailUrl,
                        result: {
                            creative: data.creative,
                            warnings: data.warnings || [],
                        },
                    }
                );
                console.log(`✅ [Queue] JOB ${jobId} completed`);
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

            // Refund credits if applicable
            if (creditsDeducted > 0) {
                try {
                    await refundCredits(userId, creditsDeducted, 'creative',
                        `Refund: Queue Job ${jobId} Failed — ${err.message}`, 'creative');
                    console.log(`💰 [Queue] Credits refunded for JOB ${jobId}`);
                } catch (refundErr) {
                    console.error(`❌ [Queue] Refund failed for JOB ${jobId}:`, refundErr.message);
                }
            }
            
            throw err; // Allow Bull to handle retries if configured
        }
    });

    creativeQueue.on('failed', (job, err) => {
        console.error(`🚨 [Queue] Job ${job.id} permanently failed:`, err.message);
    });

    creativeQueue.on('completed', (job) => {
        // Clean up completed jobs to save Redis memory
        job.remove();
    });
};
