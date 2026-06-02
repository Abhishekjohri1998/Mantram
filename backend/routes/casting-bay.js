/**
 * Casting Bay / Cast Bank — Backend Routes
 * 
 * Mounted at: /api/casting-bay
 */

import express from 'express';
import { protect } from '../middleware/auth.js';
import Cast from '../models/Cast.js';

const router = express.Router();

// GET / — List all cast members for a brand
router.get('/', protect, async (req, res) => {
    try {
        const { brandId } = req.query;
        if (!brandId) {
            return res.status(400).json({ success: false, error: 'brandId is required' });
        }
        const casts = await Cast.find({ brandId, userId: req.user._id }).sort({ name: 1 });
        res.json({ success: true, casts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST / — Create a new cast member
router.post('/', protect, async (req, res) => {
    try {
        const { brandId, name, description, role, imageUrl } = req.body;
        if (!brandId || !name) {
            return res.status(400).json({ success: false, error: 'brandId and name are required' });
        }

        // Check for duplicates
        const exists = await Cast.findOne({ brandId, name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } });
        if (exists) {
            return res.status(400).json({ success: false, error: `Cast member "${name}" already exists for this brand` });
        }

        const cast = await Cast.create({
            userId: req.user._id,
            brandId,
            name: name.trim(),
            description: description || '',
            role: role || '',
            imageUrl: imageUrl || '',
        });

        res.json({ success: true, cast });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// PUT /:id — Update a cast member
router.put('/:id', protect, async (req, res) => {
    try {
        const update = { ...req.body };
        delete update.userId;
        delete update.brandId;

        const cast = await Cast.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: update },
            { returnDocument: 'after', runValidators: true }
        );

        if (!cast) return res.status(404).json({ success: false, error: 'Cast member not found' });
        res.json({ success: true, cast });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// DELETE /:id — Delete a cast member
router.delete('/:id', protect, async (req, res) => {
    try {
        const result = await Cast.deleteOne({ _id: req.params.id, userId: req.user._id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, error: 'Cast member not found' });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
