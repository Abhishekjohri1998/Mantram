import { Router } from 'express';
import Brand from '../models/Brand.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// GET /api/brands — list user's brands
router.get('/', protect, async (req, res) => {
    try {
        const brands = await Brand.find({
            $or: [{ user: req.user._id }, { sharedWith: req.user._id }]
        }).sort('-updatedAt');
        res.json({ success: true, brands });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/brands/:id
router.get('/:id', protect, async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id);
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/brands — create new brand
router.post('/', protect, async (req, res) => {
    try {
        const brand = await Brand.create({ ...req.body, user: req.user._id });
        // Update user usage
        await req.user.updateOne({ $inc: { 'usage.brandsCreated': 1 } });
        res.status(201).json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/brands/:id — update brand DNA
router.put('/:id', protect, async (req, res) => {
    try {
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /api/brands/:id/dna — update specific DNA field
router.put('/:id/dna', protect, async (req, res) => {
    try {
        const updates = {};
        for (const [key, value] of Object.entries(req.body)) {
            updates[`dna.${key}`] = value;
        }
        const brand = await Brand.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { $set: updates },
            { new: true }
        );
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, brand });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/brands/:id
router.delete('/:id', protect, async (req, res) => {
    try {
        const brand = await Brand.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, message: 'Brand deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
