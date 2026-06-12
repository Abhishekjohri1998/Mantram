/**
 * Super Admin — Video Studio Management
 * 
 * Mirrors the pattern from superadmin-qads.js and superadmin-templates.js.
 * Provides admin-only endpoints to manage video project visibility:
 *   GET  /                — List all completed video projects (paginated)
 *   PUT  /:id             — Toggle isActive / isPublished / showOnHomeScreen
 *   PUT  /bulk            — Bulk update multiple projects
 */

import { Router } from 'express';
import { protect, superadmin } from '../middleware/auth.js';
import VideoProject from '../models/VideoProject.js';

const router = Router();

// ==========================================
// LIST — All completed video projects (paginated, for admin table)
// ==========================================
router.get('/', protect, superadmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 50);
        const skip = (page - 1) * limit;

        // Optional filters
        const filter = {};

        // Status filter: by default show completed/done videos, but allow 'all'
        const statusFilter = req.query.status || 'completed';
        if (statusFilter === 'completed') {
            filter.status = { $in: ['done', 'completed'] };
        } else if (statusFilter !== 'all') {
            filter.status = statusFilter;
        }

        // Visibility filters
        if (req.query.isActive !== undefined) {
            filter.isActive = req.query.isActive === 'true';
        }
        if (req.query.isPublished !== undefined) {
            filter.isPublished = req.query.isPublished === 'true';
        }
        if (req.query.showOnHomeScreen !== undefined) {
            filter.showOnHomeScreen = req.query.showOnHomeScreen === 'true';
        }

        // Search by title
        if (req.query.search) {
            filter.title = { $regex: req.query.search, $options: 'i' };
        }

        const [projects, total] = await Promise.all([
            VideoProject.find(filter)
                .select('title status studioMode mode isActive isPublished showOnHomeScreen generation.s3VideoUrl generation.s3ThumbnailUrl generation.videoUrl generation.thumbnailUrl advancedConfig.prompt input.brief createdAt user')
                .populate('user', 'name email')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            VideoProject.countDocuments(filter)
        ]);

        res.json({
            success: true,
            projects,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// UPDATE — Toggle visibility fields on a single project
// ==========================================
router.put('/:id', protect, superadmin, async (req, res) => {
    try {
        const ALLOWED_FIELDS = ['isActive', 'isPublished', 'showOnHomeScreen'];
        const updateData = {};

        for (const field of ALLOWED_FIELDS) {
            if (req.body[field] !== undefined) {
                updateData[field] = !!req.body[field]; // coerce to boolean
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields to update. Allowed: isActive, isPublished, showOnHomeScreen' });
        }

        const project = await VideoProject.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('title status studioMode isActive isPublished showOnHomeScreen generation.s3VideoUrl generation.s3ThumbnailUrl generation.videoUrl generation.thumbnailUrl createdAt user')
         .populate('user', 'name email')
         .lean();

        if (!project) {
            return res.status(404).json({ success: false, error: 'Video project not found' });
        }

        res.json({ success: true, project });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ==========================================
// BULK UPDATE — Toggle fields on multiple projects at once
// ==========================================
router.put('/bulk/update', protect, superadmin, async (req, res) => {
    try {
        const { ids, updates } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'ids array required' });
        }
        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({ success: false, error: 'updates object required' });
        }

        const ALLOWED_FIELDS = ['isActive', 'isPublished', 'showOnHomeScreen'];
        const sanitized = {};
        for (const field of ALLOWED_FIELDS) {
            if (updates[field] !== undefined) {
                sanitized[field] = !!updates[field];
            }
        }

        if (Object.keys(sanitized).length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields in updates' });
        }

        const result = await VideoProject.updateMany(
            { _id: { $in: ids } },
            { $set: sanitized }
        );

        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
