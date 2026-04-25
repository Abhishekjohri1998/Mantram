/**
 * Notifications API
 * GET  /api/notifications         — list unread (+ recently read) for current user
 * GET  /api/notifications/unread-count — just the badge number
 * POST /api/notifications/:id/read  — mark one read
 * POST /api/notifications/read-all  — mark all read
 */
import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Notification from '../models/Notification.js';

const router = Router();

// ── GET /api/notifications ─────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
    try {
        const limit  = Math.min(Number(req.query.limit) || 30, 50);
        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
        const unreadCount = notifications.filter(n => !n.read).length;
        res.json({ success: true, notifications, unreadCount });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── GET /api/notifications/unread-count ────────────────────────────────────
router.get('/unread-count', protect, async (req, res) => {
    try {
        const count = await Notification.countDocuments({ user: req.user._id, read: false });
        res.json({ success: true, count });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/notifications/:id/read ──────────────────────────────────────
router.post('/:id/read', protect, async (req, res) => {
    try {
        await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── POST /api/notifications/read-all ─────────────────────────────────────
router.post('/read-all', protect, async (req, res) => {
    try {
        await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── DELETE /api/notifications/:id ─────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
    try {
        await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
