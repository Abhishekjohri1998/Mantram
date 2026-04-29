/**
 * Brand Calendar API
 *
 * Unified endpoint that returns scheduled/published posts (SocialPost) merged
 * with Monthly Strategy calendar items for a given brand + month.
 *
 * Routes:
 *   GET /api/calendar?brand=&month=&year=    → full month view
 *   GET /api/calendar/today?brand=           → today + tomorrow (dashboard widget)
 */

import express from 'express';
import mongoose from 'mongoose';
import { protect } from '../middleware/auth.js';
import SocialPost from '../models/SocialPost.js';

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d) {
    const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}
function endOfDay(d) {
    const r = new Date(d); r.setHours(23, 59, 59, 999); return r;
}
function startOfMonth(year, month) {
    return new Date(year, month - 1, 1, 0, 0, 0, 0);
}
function endOfMonth(year, month) {
    return new Date(year, month, 0, 23, 59, 59, 999);
}

// Normalize a SocialPost into a unified CalendarEntry shape
function normalizeSocialPost(p) {
    return {
        _id:         p._id,
        source:      'post',
        sourceType:  p.sourceType || 'manual',
        sourceTitle: p.sourceTitle || '',
        platform:    p.platform,
        contentType: p.imageUrls?.length > 1 ? 'carousel' : p.imageUrl ? 'image' : 'text',
        caption:     p.caption || '',
        imageUrl:    p.imageUrl || '',
        imageUrls:   p.imageUrls || [],
        videoUrl:    p.videoUrl || '',
        scheduledAt: p.scheduledFor || p.publishedAt || p.createdAt,
        status:      p.status,
        accountName: p.accountName || '',
        strategyId:  p.strategyId || null,
        calendarItemId: p.calendarItemId || null,
    };
}

// Normalize a MonthlyStrategy calendar item into a unified CalendarEntry shape
function normalizeStrategyItem(item, strategy) {
    // item.date is YYYY-MM-DD string
    const scheduledAt = item.date ? new Date(item.date + 'T09:00:00') : null;
    return {
        _id:         item._id,
        source:      'strategy',
        sourceType:  'strategy',
        sourceTitle: strategy?.strategyType || '',
        platform:    item.platform || '',
        contentType: item.contentType || '',
        caption:     item.brief?.captionDraft || '',
        imageUrl:    item.generatedAsset?.url || '',
        scheduledAt,
        status:      item.status || 'pending',
        accountName: '',
        strategyId:  strategy?._id || null,
        calendarItemId: item._id?.toString() || null,
        brief:       item.brief || {},
        targetStudio: item.targetStudio || '',
    };
}

// ── GET /api/calendar — month view ────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
    try {
        const { brand, month, year } = req.query;
        if (!brand) return res.status(400).json({ success: false, error: 'brand is required' });

        const m = parseInt(month) || (new Date().getMonth() + 1);
        const y = parseInt(year)  || new Date().getFullYear();
        const rangeStart = startOfMonth(y, m);
        const rangeEnd   = endOfMonth(y, m);

        // 1) Social posts for this brand in this month
        const socialPosts = await SocialPost.find({
            brand,
            $or: [
                { scheduledFor: { $gte: rangeStart, $lte: rangeEnd } },
                { publishedAt:  { $gte: rangeStart, $lte: rangeEnd } },
            ],
        }).sort({ scheduledFor: 1, publishedAt: 1 }).lean();

        // 2) Strategy calendar items for this brand in this month
        const MonthlyStrategy = mongoose.model('MonthlyStrategy');
        const strategies = await MonthlyStrategy.find({
            brand,
            month: m,
            year:  y,
        }).lean();

        // Flatten strategy items and filter to this month
        const strategyEntries = [];
        for (const strategy of strategies) {
            for (const item of strategy.calendar || []) {
                if (!item.date) continue;
                const itemDate = new Date(item.date + 'T00:00:00');
                if (itemDate >= rangeStart && itemDate <= rangeEnd) {
                    strategyEntries.push(normalizeStrategyItem(item, strategy));
                }
            }
        }

        // Merge and sort by scheduledAt
        const entries = [
            ...socialPosts.map(normalizeSocialPost),
            ...strategyEntries,
        ].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

        res.json({ success: true, entries, month: m, year: y });
    } catch (err) {
        console.error('[CALENDAR] month view error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load calendar' });
    }
});

// ── GET /api/calendar/today — dashboard widget ────────────────────────────────
router.get('/today', protect, async (req, res) => {
    try {
        const { brand } = req.query;
        const now      = new Date();
        const todayStart = startOfDay(now);
        const tomorrowEnd = endOfDay(new Date(now.getTime() + 86400000));

        const filter = {
            status: { $in: ['scheduled', 'published'] },
            $or: [
                { scheduledFor: { $gte: todayStart, $lte: tomorrowEnd } },
                { publishedAt:  { $gte: todayStart, $lte: tomorrowEnd } },
            ],
        };
        if (brand && brand !== 'all') filter.brand = brand;
        // Scope to user's brand
        filter.user = req.user._id;

        const posts = await SocialPost.find(filter)
            .sort({ scheduledFor: 1, publishedAt: 1 })
            .limit(10)
            .lean();

        // Also pull strategy items for today + tomorrow if brand specified
        let strategyItems = [];
        if (brand && brand !== 'all') {
            const MonthlyStrategy = mongoose.model('MonthlyStrategy');
            const todayStr    = todayStart.toISOString().slice(0, 10);
            const tomorrowStr = tomorrowEnd.toISOString().slice(0, 10);
            const strategies  = await MonthlyStrategy.find({
                brand,
                month: now.getMonth() + 1,
                year:  now.getFullYear(),
            }).lean();
            for (const strategy of strategies) {
                for (const item of strategy.calendar || []) {
                    if (item.date === todayStr || item.date === tomorrowStr) {
                        strategyItems.push(normalizeStrategyItem(item, strategy));
                    }
                }
            }
        }

        const entries = [
            ...posts.map(normalizeSocialPost),
            ...strategyItems,
        ].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));

        // Split today / tomorrow for dashboard convenience
        const todayEnd = endOfDay(now);
        const today    = entries.filter(e => new Date(e.scheduledAt) <= todayEnd);
        const tomorrow = entries.filter(e => new Date(e.scheduledAt) >  todayEnd);

        res.json({ success: true, today, tomorrow, total: entries.length });
    } catch (err) {
        console.error('[CALENDAR] today error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to load today calendar' });
    }
});

export default router;
