/**
 * Spy Missions API — Agent Fidato Competitive Intelligence
 * 
 * CRUD + force-run for spy missions.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import SpyMission from '../models/SpyMission.js';
import { forceRunMission } from '../services/spyAgent.js';

const router = Router();

// ============================================================================
// GET /api/spy/missions — List missions for current brand
// ============================================================================
router.get('/missions', protect, async (req, res) => {
    try {
        const { brandId, studio, status } = req.query;
        if (!brandId) return res.status(400).json({ error: 'brandId is required' });

        const filter = { brand: brandId, user: req.user._id };
        if (studio) filter.studio = studio;
        if (status) filter.status = status;

        const missions = await SpyMission.find(filter)
            .select('-findings.rawData') // Don't send raw data in list view
            .sort({ updatedAt: -1 })
            .limit(20);

        res.json({ missions });
    } catch (err) {
        console.error('Spy missions list error:', err.message);
        res.status(500).json({ error: 'Failed to load missions' });
    }
});

// ============================================================================
// POST /api/spy/missions — Create a new spy mission
// ============================================================================
router.post('/missions', protect, async (req, res) => {
    try {
        const { brandId, title, type, target, instructions, frequency, studio, notifyVia } = req.body;

        if (!brandId) return res.status(400).json({ error: 'brandId is required' });
        if (!title) return res.status(400).json({ error: 'Mission title is required' });
        if (!type) return res.status(400).json({ error: 'Mission type is required' });
        if (!target?.name) return res.status(400).json({ error: 'Competitor name is required' });

        // Check mission limit (max 10 per brand)
        const count = await SpyMission.countDocuments({ brand: brandId, user: req.user._id, status: 'active' });
        if (count >= 10) {
            return res.status(429).json({ error: 'Maximum 10 active missions per brand. Pause or delete existing ones.' });
        }

        const mission = await SpyMission.create({
            brand: brandId,
            user: req.user._id,
            title,
            type,
            target: {
                name: target.name,
                website: target.website || '',
                platforms: target.platforms || [],
                keywords: target.keywords || [],
            },
            instructions: instructions || '',
            frequency: frequency || 'daily',
            studio: studio || 'seo',
            notifyVia: notifyVia || 'fidato',
            status: 'active',
        });

        console.log(`🕵️ New mission created: "${title}" tracking "${target.name}"`);

        res.status(201).json({ mission });
    } catch (err) {
        console.error('Create mission error:', err.message);
        res.status(500).json({ error: 'Failed to create mission' });
    }
});

// ============================================================================
// PUT /api/spy/missions/:id — Update mission (pause/resume/edit)
// ============================================================================
router.put('/missions/:id', protect, async (req, res) => {
    try {
        const mission = await SpyMission.findOne({ _id: req.params.id, user: req.user._id });
        if (!mission) return res.status(404).json({ error: 'Mission not found' });

        const { title, status, frequency, instructions, target, notifyVia } = req.body;

        if (title) mission.title = title;
        if (status) mission.status = status;
        if (frequency) mission.frequency = frequency;
        if (instructions !== undefined) mission.instructions = instructions;
        if (notifyVia) mission.notifyVia = notifyVia;
        if (target) {
            if (target.name) mission.target.name = target.name;
            if (target.website !== undefined) mission.target.website = target.website;
            if (target.platforms) mission.target.platforms = target.platforms;
            if (target.keywords) mission.target.keywords = target.keywords;
        }

        await mission.save();
        res.json({ mission });
    } catch (err) {
        console.error('Update mission error:', err.message);
        res.status(500).json({ error: 'Failed to update mission' });
    }
});

// ============================================================================
// DELETE /api/spy/missions/:id — Delete a mission
// ============================================================================
router.delete('/missions/:id', protect, async (req, res) => {
    try {
        const result = await SpyMission.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!result) return res.status(404).json({ error: 'Mission not found' });

        res.json({ message: 'Mission deleted' });
    } catch (err) {
        console.error('Delete mission error:', err.message);
        res.status(500).json({ error: 'Failed to delete mission' });
    }
});

// ============================================================================
// GET /api/spy/missions/:id/findings — Get detailed findings history
// ============================================================================
router.get('/missions/:id/findings', protect, async (req, res) => {
    try {
        const mission = await SpyMission.findOne({ _id: req.params.id, user: req.user._id })
            .select('title type target findings totalChecks totalFindings lastCheckedAt lastFindingAt');

        if (!mission) return res.status(404).json({ error: 'Mission not found' });

        // Mark all findings as notified (read)
        let needsSave = false;
        for (const f of mission.findings) {
            if (!f.notified) {
                f.notified = true;
                f.isNew = false;
                needsSave = true;
            }
        }
        if (needsSave) await mission.save();

        res.json({
            title: mission.title,
            type: mission.type,
            target: mission.target,
            stats: {
                totalChecks: mission.totalChecks,
                totalFindings: mission.totalFindings,
                lastCheckedAt: mission.lastCheckedAt,
                lastFindingAt: mission.lastFindingAt,
            },
            findings: mission.findings.slice().reverse(), // newest first
        });
    } catch (err) {
        console.error('Get findings error:', err.message);
        res.status(500).json({ error: 'Failed to load findings' });
    }
});

// ============================================================================
// POST /api/spy/missions/:id/run — Force-run a mission immediately
// ============================================================================
router.post('/missions/:id/run', protect, async (req, res) => {
    try {
        const mission = await SpyMission.findOne({ _id: req.params.id, user: req.user._id });
        if (!mission) return res.status(404).json({ error: 'Mission not found' });

        const result = await forceRunMission(mission._id);
        res.json(result);
    } catch (err) {
        console.error('Force-run error:', err.message);
        res.status(500).json({ error: 'Failed to run mission' });
    }
});

// ============================================================================
// GET /api/spy/alerts — Get unread findings count across all missions
// ============================================================================
router.get('/alerts', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) return res.status(400).json({ error: 'brandId is required' });

        const missions = await SpyMission.find({
            brand: brandId,
            user: req.user._id,
            status: 'active',
        }).select('title type target findings');

        let totalAlerts = 0;
        const alerts = [];

        for (const m of missions) {
            const unread = m.findings.filter(f => !f.notified);
            if (unread.length > 0) {
                totalAlerts += unread.length;
                alerts.push({
                    missionId: m._id,
                    missionTitle: m.title,
                    competitor: m.target.name,
                    unreadCount: unread.length,
                    latestSeverity: unread[unread.length - 1]?.severity || 'info',
                    latestSummary: unread[unread.length - 1]?.summary?.slice(0, 120) || '',
                });
            }
        }

        res.json({ totalAlerts, alerts });
    } catch (err) {
        console.error('Spy alerts error:', err.message);
        res.status(500).json({ error: 'Failed to load alerts' });
    }
});

export default router;
