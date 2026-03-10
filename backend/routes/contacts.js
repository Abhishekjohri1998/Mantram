/**
 * Contact Routes
 * CRUD + filtering for the Conversation Studio CRM.
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Contact from '../models/Contact.js';
import { safeErrorMessage } from '../utils/safeError.js';

const router = Router();

// ── GET /api/contacts — List contacts with filters ──

router.get('/', protect, async (req, res) => {
    try {
        const { brandId, tag, leadStatus, platform, search, page = 1, limit = 50 } = req.query;

        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (tag) filter.tags = tag;
        if (leadStatus) filter.leadStatus = leadStatus;
        if (platform) filter.platform = platform;
        if (search) {
            const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            filter.$or = [
                { name: { $regex: safeSearch, $options: 'i' } },
                { platformUsername: { $regex: safeSearch, $options: 'i' } },
                { email: { $regex: safeSearch, $options: 'i' } },
            ];
        }

        const contacts = await Contact.find(filter)
            .sort({ lastInteractionAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Contact.countDocuments(filter);

        res.json({ success: true, contacts, total, page: parseInt(page) });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/contacts/:id — Get single contact ──

router.get('/:id', protect, async (req, res) => {
    try {
        const contact = await Contact.findOne({ _id: req.params.id, user: req.user._id });
        if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });
        res.json({ success: true, contact });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── PUT /api/contacts/:id — Update tags, attributes, lead status ──

router.put('/:id', protect, async (req, res) => {
    try {
        const { tags, attributes, leadStatus, name, email, phone, location } = req.body;
        const update = {};
        if (tags) update.tags = tags;
        if (attributes) update.attributes = attributes;
        if (leadStatus) update.leadStatus = leadStatus;
        if (name) update.name = name;
        if (email) update.email = email;
        if (phone) update.phone = phone;
        if (location) update.location = location;

        const contact = await Contact.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            update,
            { new: true }
        );
        if (!contact) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, contact });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── DELETE /api/contacts/:id ──

router.delete('/:id', protect, async (req, res) => {
    try {
        const contact = await Contact.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!contact) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// ── GET /api/contacts/stats/overview — Contact stats ──

router.get('/stats/overview', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;

        const [total, newLeads, warmLeads, hotLeads] = await Promise.all([
            Contact.countDocuments(filter),
            Contact.countDocuments({ ...filter, leadStatus: 'new' }),
            Contact.countDocuments({ ...filter, leadStatus: 'warm' }),
            Contact.countDocuments({ ...filter, leadStatus: 'hot' }),
        ]);

        const platformBreakdown = await Contact.aggregate([
            { $match: filter },
            { $group: { _id: '$platform', count: { $sum: 1 } } },
        ]);

        res.json({ success: true, stats: { total, newLeads, warmLeads, hotLeads, platformBreakdown } });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;
