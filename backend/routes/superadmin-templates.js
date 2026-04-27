import { Router } from 'express';
import { protect, superadmin } from '../middleware/auth.js';
import TemplateCategory from '../models/TemplateCategory.js';
import Template from '../models/Template.js';
import VideoProject from '../models/VideoProject.js';
import GenerationJob from '../models/GenerationJob.js';

const router = Router();

// ==========================================
// TEMPLATE CATEGORIES
// ==========================================

router.get('/categories', protect, superadmin, async (req, res) => {
    try {
        const categories = await TemplateCategory.find().sort({ sortOrder: 1 });
        res.json({ success: true, categories });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/categories', protect, superadmin, async (req, res) => {
    try {
        const category = await TemplateCategory.create(req.body);
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
            await TemplateCategory.bulkWrite(bulkOps);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/categories/:id', protect, superadmin, async (req, res) => {
    try {
        const category = await TemplateCategory.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!category) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, category });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/categories/:id', protect, superadmin, async (req, res) => {
    try {
        const templatesCount = await Template.countDocuments({ categoryId: req.params.id });
        if (templatesCount > 0) return res.status(400).json({ success: false, error: 'Cannot delete category containing templates' });
        
        const category = await TemplateCategory.findByIdAndDelete(req.params.id);
        if (!category) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// ==========================================
// TEMPLATES
// ==========================================

router.get('/', protect, superadmin, async (req, res) => {
    try {
        const templates = await Template.find().sort({ sortOrder: 1 });
        res.json({ success: true, templates });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', protect, superadmin, async (req, res) => {
    try {
        const template = await Template.create({ ...req.body, createdBy: req.user._id });
        res.status(201).json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.put('/reorder', protect, superadmin, async (req, res) => {
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
            await Template.bulkWrite(bulkOps);
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.put('/:id', protect, superadmin, async (req, res) => {
    try {
        // Prevent editing savedPrompt in standard update route
        if (req.body.savedPrompt !== undefined) {
            return res.status(400).json({ success: false, error: 'savedPrompt is immutable after creation. Create a new template to change the prompt.' });
        }
        const updateData = { ...req.body };
        
        const template = await Template.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        if (!template) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

router.delete('/:id', protect, superadmin, async (req, res) => {
    try {
        const template = await Template.findById(req.params.id);
        if (!template) return res.status(404).json({ success: false, error: 'Not found' });

        if (req.query.permanent === 'true') {
            if (template.usageCount > 0) {
                return res.status(400).json({ success: false, error: `Cannot permanently delete a template that has been used ${template.usageCount} times. Deactivate it instead.` });
            }
            await Template.findByIdAndDelete(req.params.id);
        } else {
            await Template.findByIdAndUpdate(req.params.id, { isActive: false });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================
// PROMOTE FROM JOB
// ==========================================

router.post('/promote-from-job', protect, superadmin, async (req, res) => {
    try {
        let { sourceJobId, sourceType, name, categoryId, description, tags, studioOrigin } = req.body;
        if (!sourceJobId || !sourceType) {
            return res.status(400).json({ success: false, error: 'sourceJobId and sourceType (VideoProject or GenerationJob) are required' });
        }

        let extractedPrompt = '';
        let previewUrl = '';
        let previewType = 'image';

        if (sourceType === 'VideoProject') {
            const project = await VideoProject.findById(sourceJobId);
            if (!project) return res.status(404).json({ success: false, error: 'VideoProject not found' });
            extractedPrompt = project.backendPrompt || project.advancedConfig?.prompt;
            previewUrl = project.resultVideoUrl || project.posterUrl || '';
            previewType = 'video';
            sourceJobId = project._id; // Ensure it's an ObjectId
        } else if (sourceType === 'GenerationJob') {
            // Using findById to support _id, since jobId is sometimes used interchangeably in frontend
            let job = await GenerationJob.findOne({ jobId: sourceJobId });
            if (!job) job = await GenerationJob.findById(sourceJobId);
            if (!job) return res.status(404).json({ success: false, error: 'GenerationJob not found' });
            extractedPrompt = job.prompt;
            previewUrl = job.imageUrl || '';
            previewType = 'image';
            sourceJobId = job._id; // Ensure it's an ObjectId
        } else {
            return res.status(400).json({ success: false, error: 'Invalid sourceType' });
        }

        if (!extractedPrompt || !extractedPrompt.trim()) {
            return res.status(400).json({ success: false, error: 'Source job does not contain a valid prompt to promote' });
        }

        const template = await Template.create({
            name,
            categoryId,
            description,
            tags,
            studioOrigin,
            previewUrl,
            previewType,
            savedPrompt: extractedPrompt,
            sourceJobId,
            sourceJobType: sourceType,
            createdBy: req.user._id
        });

        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

export default router;
