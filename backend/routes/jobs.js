/**
 * Jobs API — Unified background job status endpoint
 * GET   /api/jobs/active          — all pending/processing jobs for user
 * GET   /api/jobs/:jobId          — poll specific job status
 * PATCH /api/jobs/:jobId/cancel   — cancel a job
 */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import GenerationJob from '../models/GenerationJob.js';
import { getSignedUrlIfNeeded } from '../utils/s3.js';

const router = Router();

// ── GET /api/jobs/active ─────────────────────────────────────────────────────
router.get('/active', protect, async (req, res) => {
    try {
        const jobs = await GenerationJob.find({
            user: req.user._id,
            status: { $in: ['pending', 'processing'] },
        })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        res.json({ success: true, jobs });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/jobs/:jobId ─────────────────────────────────────────────────────
router.get('/:jobId', protect, async (req, res) => {
    try {
        const job = await GenerationJob.findOne({
            jobId: req.params.jobId,
            user: req.user._id,
        }).lean();
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        res.json({ success: true, job });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/jobs/:jobId/stream ──────────────────────────────────────────────
router.get('/:jobId/stream', protect, async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const jobId = req.params.jobId;
    const userId = req.user._id;

    res.write(': ping\n\n');

    let isClosed = false;
    req.on('close', () => { isClosed = true; });

    const pollInterval = setInterval(async () => {
        if (isClosed) {
            clearInterval(pollInterval);
            return;
        }
        try {
            const job = await GenerationJob.findOne({ jobId, user: userId })
                .select('jobId status type progress errorMessage creativeId result warnings completedAt steps')
                .lean();

            if (!job) {
                res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
                clearInterval(pollInterval);
                res.end();
                return;
            }

            if (job.result?.creative) {
                job.result.creative.imageUrl = await getSignedUrlIfNeeded(job.result.creative.imageUrl);
                job.result.creative.thumbnailUrl = await getSignedUrlIfNeeded(job.result.creative.thumbnailUrl);
            }

            res.write(`data: ${JSON.stringify(job)}\n\n`);

            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                clearInterval(pollInterval);
                res.end();
            }
        } catch (err) {
            console.error(`❌ [SSE] Error polling job ${jobId}:`, err.message);
        }
    }, 2000);
});

// ── PATCH /api/jobs/:jobId/cancel ────────────────────────────────────────────
router.patch('/:jobId/cancel', protect, async (req, res) => {
    try {
        const job = await GenerationJob.findOneAndUpdate(
            { jobId: req.params.jobId, user: req.user._id, status: { $in: ['pending', 'processing'] } },
            { $set: { status: 'cancelled', cancelledAt: new Date() } },
            { new: true }
        );
        if (!job) return res.status(404).json({ success: false, error: 'Job not found or already completed' });
        res.json({ success: true, job });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
