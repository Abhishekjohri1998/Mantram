import { Router } from 'express';
import { protect, superadmin } from '../middleware/auth.js';
import QAdsCategory from '../models/QAdsCategory.js';
import QAdsPreset from '../models/QAdsPreset.js';
import { invalidatePresetsCache } from '../utils/qAdsCache.js';
import multer from 'multer';
import { uploadToS3 } from '../utils/s3.js';

const upload = multer({ storage: multer.memoryStorage() });

const router = Router();

// ==========================================
// CATEGORIES
// ==========================================

router.get('/categories', protect, superadmin, async (req, res) => {
    try {
        const categories = await QAdsCategory.find().sort({ sortOrder: 1 });
        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/categories', protect, superadmin, async (req, res) => {
    try {
        const category = await QAdsCategory.create(req.body);
        await invalidatePresetsCache();
        res.status(201).json({ success: true, category });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/categories/reorder', protect, superadmin, async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, error: 'orderedIds array required' });
        }
        
        const bulkOps = orderedIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id },
                update: { sortOrder: index * 10 }
            }
        }));
        
        if (bulkOps.length > 0) {
            await QAdsCategory.bulkWrite(bulkOps);
            await invalidatePresetsCache();
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/categories/:id', protect, superadmin, async (req, res) => {
    try {
        const category = await QAdsCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!category) return res.status(404).json({ success: false, error: 'Not found' });
        await invalidatePresetsCache();
        res.json({ success: true, category });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/categories/:id', protect, superadmin, async (req, res) => {
    try {
        const presetsCount = await QAdsPreset.countDocuments({ categoryId: req.params.id });
        if (presetsCount > 0) return res.status(400).json({ success: false, error: 'Cannot delete category containing presets' });
        
        const category = await QAdsCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, error: 'Not found' });
        await invalidatePresetsCache();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/categories/:id/upload-preview', protect, superadmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        const category = await QAdsCategory.findById(req.params.id);
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
        
        const fileExt = req.file.originalname.split('.').pop() || 'bin';
        const url = await uploadToS3(req.file.buffer, `qads-categories/${category._id}-${Date.now()}.${fileExt}`, req.file.mimetype);
        category.previewMediaUrl = url;
        category.previewMediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        await category.save();
        
        await invalidatePresetsCache();
        res.json({ success: true, previewMediaUrl: url, previewMediaType: category.previewMediaType });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ==========================================
// PRESETS
// ==========================================

router.get('/presets', protect, superadmin, async (req, res) => {
    try {
        const presets = await QAdsPreset.find().sort({ sortOrder: 1 });
        res.json({ success: true, presets });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/presets', protect, superadmin, async (req, res) => {
    try {
        const preset = await QAdsPreset.create(req.body);
        await invalidatePresetsCache();
        res.status(201).json({ success: true, preset });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/presets/reorder', protect, superadmin, async (req, res) => {
    try {
        const { orderedIds } = req.body;
        if (!orderedIds || !Array.isArray(orderedIds)) {
            return res.status(400).json({ success: false, error: 'orderedIds array required' });
        }
        
        const bulkOps = orderedIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id },
                update: { sortOrder: index * 10 }
            }
        }));
        
        if (bulkOps.length > 0) {
            await QAdsPreset.bulkWrite(bulkOps);
            await invalidatePresetsCache();
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/presets/:id', protect, superadmin, async (req, res) => {
    try {
        const preset = await QAdsPreset.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!preset) return res.status(404).json({ success: false, error: 'Not found' });
        await invalidatePresetsCache();
        res.json({ success: true, preset });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/presets/:id', protect, superadmin, async (req, res) => {
    try {
        const preset = await QAdsPreset.findByIdAndDelete(req.params.id);
        if (!preset) return res.status(404).json({ success: false, error: 'Not found' });
        await invalidatePresetsCache();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/presets/:id/upload-preview', protect, superadmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        const preset = await QAdsPreset.findById(req.params.id);
        if (!preset) return res.status(404).json({ success: false, error: 'Preset not found' });
        
        const fileExt = req.file.originalname.split('.').pop() || 'bin';
        const url = await uploadToS3(req.file.buffer, `qads-presets/${preset._id}-${Date.now()}.${fileExt}`, req.file.mimetype);
        preset.previewMediaUrl = url;
        preset.previewMediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
        await preset.save();
        
        await invalidatePresetsCache();
        res.json({ success: true, previewMediaUrl: url, previewMediaType: preset.previewMediaType });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
