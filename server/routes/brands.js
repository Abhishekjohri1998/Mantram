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

// PUT /api/brands/:id/autonomy — update autonomy settings
router.put('/:id/autonomy', protect, async (req, res) => {
    try {
        const updates = {};
        for (const [key, value] of Object.entries(req.body)) {
            updates[`autonomy.${key}`] = value;
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

// ═══ Custom Templates (Prompt Library) ═══

// POST /api/brands/:id/templates — save a new custom template
router.post('/:id/templates', protect, async (req, res) => {
    try {
        const { templateId, label, icon, description, category, type, style, promptFormula, referenceImageUrl, fields } = req.body;
        if (!label || !promptFormula) {
            return res.status(400).json({ success: false, error: 'label and promptFormula are required' });
        }
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const newTemplate = {
            templateId: templateId || `custom-${Date.now()}`,
            label, icon: icon || 'auto_awesome', description: description || '',
            category: category || '',
            type: type || 'instagram-post', style: style || 'modern',
            promptFormula, referenceImageUrl: referenceImageUrl || '',
            fields: fields || [],
        };
        brand.customTemplates.push(newTemplate);
        await brand.save();
        res.status(201).json({ success: true, template: newTemplate, total: brand.customTemplates.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/brands/:id/templates — list custom templates
router.get('/:id/templates', protect, async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id).select('customTemplates');
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, templates: brand.customTemplates || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/brands/:id/templates/:templateId — delete a custom template
router.delete('/:id/templates/:templateId', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        brand.customTemplates = brand.customTemplates.filter(t => t.templateId !== req.params.templateId);
        await brand.save();
        res.json({ success: true, message: 'Template deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ═══ Custom Categories ═══

// POST /api/brands/:id/categories — save a new custom category
router.post('/:id/categories', protect, async (req, res) => {
    try {
        const { label, icon, color, description, referenceImageUrl, basePromptFormula } = req.body;
        if (!label) {
            return res.status(400).json({ success: false, error: 'label is required' });
        }
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });

        const categoryId = `custom-cat-${Date.now()}`;
        const newCategory = {
            categoryId, label, icon: icon || 'auto_awesome',
            color: color || '#f59e0b', description: description || '',
            referenceImageUrl: referenceImageUrl || '',
            basePromptFormula: basePromptFormula || '',
        };
        brand.customCategories.push(newCategory);
        await brand.save();
        res.status(201).json({ success: true, category: newCategory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/brands/:id/categories — list custom categories
router.get('/:id/categories', protect, async (req, res) => {
    try {
        const brand = await Brand.findById(req.params.id).select('customCategories');
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        res.json({ success: true, categories: brand.customCategories || [] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /api/brands/:id/categories/:categoryId — delete a custom category
router.delete('/:id/categories/:categoryId', protect, async (req, res) => {
    try {
        const brand = await Brand.findOne({ _id: req.params.id, user: req.user._id });
        if (!brand) return res.status(404).json({ success: false, error: 'Brand not found' });
        brand.customCategories = brand.customCategories.filter(c => c.categoryId !== req.params.categoryId);
        // Also remove sub-templates under this category
        brand.customTemplates = brand.customTemplates.filter(t => t.category !== req.params.categoryId);
        await brand.save();
        res.json({ success: true, message: 'Category and its templates deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
