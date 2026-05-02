/**
 * Comment Replies API
 * GET /api/comment-replies — fetch recent auto-reply logs for a brand.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import CommentReply from '../models/CommentReply.js';

const router = Router();

/**
 * GET /api/comment-replies?brand=xxx&limit=20
 * Returns the most recent comment auto-reply logs for the given brand.
 */
router.get('/', protect, async (req, res) => {
    try {
        const { brand, limit = 20 } = req.query;
        if (!brand) return res.status(400).json({ error: 'brand query parameter is required' });

        const replies = await CommentReply.find({ brand })
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(limit) || 20, 100))
            .lean();

        // Stats
        const total = await CommentReply.countDocuments({ brand });
        const replied = await CommentReply.countDocuments({ brand, action: 'comment_replied' });
        const dmSent = await CommentReply.countDocuments({ brand, action: 'comment_to_dm' });
        const errors = await CommentReply.countDocuments({ brand, action: 'error' });

        res.json({
            success: true,
            replies,
            stats: { total, replied, dmSent, errors },
        });
    } catch (err) {
        console.error('❌ Comment replies API error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
