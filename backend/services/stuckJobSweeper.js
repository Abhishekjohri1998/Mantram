import GenerationJob from '../models/GenerationJob.js';
import { refundCredits } from '../middleware/credits.js';
import { createNotification } from '../utils/createNotification.js';
import { getSetting } from '../models/SystemSettings.js';

export async function sweepStuckJobs() {
    try {
        const now = new Date();
        const processingThreshold = new Date(now.getTime() - 15 * 60 * 1000); // 15 mins
        const pendingThreshold = new Date(now.getTime() - 5 * 60 * 1000); // 5 mins

        const stuckJobs = await GenerationJob.find({
            $or: [
                { status: 'processing', startedAt: { $lt: processingThreshold } },
                { status: 'pending', createdAt: { $lt: pendingThreshold } }
            ]
        });

        if (stuckJobs.length === 0) {
            return;
        }

        console.log(`🧹 [StuckJobSweeper] Found ${stuckJobs.length} stuck jobs. Recovering...`);

        for (const job of stuckJobs) {
            job.status = 'failed';
            job.errorMessage = 'Auto-recovered: job exceeded maximum processing time';
            job.completedAt = now;
            await job.save();

            if (job.creditsDeducted > 0) {
                try {
                    await refundCredits(
                        job.user,
                        job.creditsDeducted,
                        'creative', // Action name is generic for stuck job
                        `Refund: Generation job ${job.jobId} timed out`
                    );
                } catch (refundError) {
                    console.error(`❌ [StuckJobSweeper] Failed to refund credits for job ${job.jobId}:`, refundError.message);
                }
            }

            try {
                // If there's no brand, we can just pass null
                const brandId = job.brand || null;
                await createNotification({
                    userId: job.user,
                    brandId,
                    type: job.type || 'system',
                    title: '⚠️ Generation Failed (Timeout)',
                    body: `Your generation job (${job.meta?.label || job.jobId}) was stuck and has been automatically cancelled. Your credits have been refunded.`,
                    link: job.meta?.page || '/',
                    jobId: job.jobId
                });
            } catch (notifyError) {
                console.error(`❌ [StuckJobSweeper] Failed to send notification for job ${job.jobId}:`, notifyError.message);
            }
        }
        console.log(`✅ [StuckJobSweeper] Recovered ${stuckJobs.length} stuck jobs.`);
    } catch (err) {
        console.error('❌ [StuckJobSweeper] Global sweep failed:', err.message);
    }
}

export function startStuckJobSweeper() {
    // Only run on the primary PM2 worker
    const instanceId = process.env.NODE_APP_INSTANCE || '0';
    if (instanceId !== '0') {
        console.log(`🧹 [StuckJobSweeper] Skipped on worker ${instanceId} (runs on primary only)`);
        return;
    }

    console.log('🧹 [StuckJobSweeper] Agent started (primary worker)');
    // Initial run after 2 minutes
    setTimeout(sweepStuckJobs, 120000);
    // Run every 5 minutes
    setInterval(sweepStuckJobs, 5 * 60 * 1000);
}
