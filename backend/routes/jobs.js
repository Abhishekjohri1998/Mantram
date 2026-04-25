/**
 * Jobs API — Unified background job status endpoint
 * GET   /api/jobs/active          — all pending/processing jobs for user
 * GET   /api/jobs/:jobId          — poll specific job status
 * PATCH /api/jobs/:jobId/cancel   — cancel a job
 */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import GenerationJob from '../models/GenerationJob.js';

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
