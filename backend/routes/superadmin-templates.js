import { Router } from 'express';
import multer from 'multer';
import { protect, superadmin } from '../middleware/auth.js';
import { uploadToS3, ensureS3Url } from '../utils/s3.js';
import TemplateCategory from '../models/TemplateCategory.js';
import Template from '../models/Template.js';
import VideoProject from '../models/VideoProject.js';
import GenerationJob from '../models/GenerationJob.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
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

// GET all templates (admin view — includes ALL fields including savedPrompt + studioSection)
router.get('/', protect, superadmin, async (req, res) => {
    try {
        const { studioSection, isPublished, isActive, search } = req.query;
        const filter = {};
        if (studioSection) filter.studioSection = studioSection;
        if (isPublished !== undefined) filter.isPublished = isPublished === 'true';
        if (isActive !== undefined) filter.isActive = isActive === 'true';
        if (search) filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { tags: { $regex: search, $options: 'i' } },
        ];

        const templates = await Template.find(filter)
            .sort({ studioSection: 1, usageCount: -1, createdAt: -1 })
            .populate('categoryId', 'name color iconEmoji')
            .lean();

        // Step 6: Add isBrandAware label for admin view too
        const enriched = templates.map(t => ({
            ...t,
            isBrandAware: !!(t.promptTemplate && (t.promptTemplate.includes('{brand}') || t.promptTemplate.includes('{product}'))),
        }));

        res.json({ success: true, templates: enriched, count: enriched.length });
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

router.post('/upload', protect, superadmin, upload.single('file'), async (req, res) => {
    try {
        const {
            name, categoryId, description, tags, savedPrompt, studioOrigin,
            isFeatured, isActive, isPublished,
            studioSection, promptTemplate, generationModel,
            savedProductUrl, savedProductImageUrls, savedAvatarUrl, savedVideoSettings,
        } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Media file is required' });
        }

        const s3Key = `templates/previews/${Date.now()}-${req.file.originalname}`;
        const previewUrl = await uploadToS3(req.file.buffer, s3Key, req.file.mimetype);
        const previewType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

        let parsedTags = [];
        if (tags) {
            try {
                parsedTags = JSON.parse(tags);
            } catch (e) {
                parsedTags = typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : [];
            }
        }

        // Parse video-specific metadata
        let parsedProductImageUrls = [];
        if (savedProductImageUrls) {
            try { parsedProductImageUrls = JSON.parse(savedProductImageUrls); }
            catch { parsedProductImageUrls = typeof savedProductImageUrls === 'string' ? savedProductImageUrls.split(',').map(u => u.trim()).filter(Boolean) : []; }
        }
        let parsedVideoSettings = {};
        if (savedVideoSettings) {
            try { parsedVideoSettings = typeof savedVideoSettings === 'string' ? JSON.parse(savedVideoSettings) : savedVideoSettings; }
            catch { parsedVideoSettings = {}; }
        }

        const template = await Template.create({
            name,
            categoryId,
            description,
            tags: parsedTags,
            savedPrompt,
            studioOrigin,
            studioSection: studioSection || 'general',
            promptTemplate: promptTemplate || '',
            generationModel: generationModel || 'gpt-image-2',
            previewUrl,
            previewImageUrl: previewUrl, // Step 8: always populate both
            previewType,
            isFeatured: isFeatured === 'true' || isFeatured === true,
            isActive: isActive === 'true' || isActive === true,
            isPublished: isPublished === 'true' || isPublished === true,
            savedProductUrl: savedProductUrl || '',
            savedProductImageUrls: parsedProductImageUrls,
            savedAvatarUrl: savedAvatarUrl || '',
            savedVideoSettings: parsedVideoSettings,
            createdBy: req.user._id
        });

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
        // savedPrompt is immutable — block any attempt to change it here
        if (req.body.savedPrompt !== undefined) {
            return res.status(400).json({ success: false, error: 'savedPrompt is immutable after creation. Create a new template to change the prompt.' });
        }

        // Step 6: allow studioSection, isPublished, promptTemplate, generationModel updates
        const ALLOWED_UPDATES = [
            'name', 'description', 'tags', 'categoryId', 'studioOrigin', 'studioSection',
            'isActive', 'isPublished', 'isFeatured',
            'previewUrl', 'previewImageUrl', 'previewType',
            'promptTemplate', 'generationModel', 'generationParams',
            'sortOrder',
            'savedProductUrl', 'savedProductImageUrls', 'savedAvatarUrl', 'savedVideoSettings',
        ];
        const updateData = {};
        for (const key of ALLOWED_UPDATES) {
            if (req.body[key] !== undefined) updateData[key] = req.body[key];
        }

        // Step 8: keep previewUrl and previewImageUrl in sync
        if (updateData.previewUrl && !updateData.previewImageUrl) {
            updateData.previewImageUrl = updateData.previewUrl;
        } else if (updateData.previewImageUrl && !updateData.previewUrl) {
            updateData.previewUrl = updateData.previewImageUrl;
        }

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
            // BUG-02 FIX: mirror video poster/thumbnail to S3 before storing
            const rawPosterUrl = project.posterUrl || '';
            previewUrl = rawPosterUrl ? await ensureS3Url(rawPosterUrl, `templates/preview-${Date.now()}.jpg`) : (project.resultVideoUrl || '');
            previewType = 'video';
            sourceJobId = project._id; // Ensure it's an ObjectId
        } else if (sourceType === 'GenerationJob') {
            // Using findById to support _id, since jobId is sometimes used interchangeably in frontend
            let job = await GenerationJob.findOne({ jobId: sourceJobId });
            if (!job) job = await GenerationJob.findById(sourceJobId);
            if (!job) return res.status(404).json({ success: false, error: 'GenerationJob not found' });
            extractedPrompt = job.prompt;
            // BUG-02 FIX: mirror job.imageUrl to S3 before storing (may be provider URL that expires)
            const rawJobUrl = job.imageUrl || '';
            previewUrl = rawJobUrl ? await ensureS3Url(rawJobUrl, `templates/preview-${Date.now()}.webp`) : '';
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
            previewImageUrl: previewUrl, // canonical S3 field — always mirrors previewUrl
            previewType,
            savedPrompt: extractedPrompt,
            sourceJobId,
            sourceJobType: sourceType,
            createdBy: req.user._id,
            isActive: false, // requires admin to activate after review
        });

        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /promote-from-generated
// Save an AI-generated image (already on S3) directly as a Template.
// No file upload needed — previewUrl is the S3 URL from avatar-studio or admin/generate.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/promote-from-generated', protect, superadmin, async (req, res) => {
    try {
        const {
            name, categoryId, description, tags, studioOrigin,
            previewUrl, savedPrompt,
            studioSection, promptTemplate, generationModel, generationParams,
        } = req.body;

        if (!previewUrl) return res.status(400).json({ success: false, error: 'previewUrl is required (S3 URL of generated image)' });
        if (!savedPrompt) return res.status(400).json({ success: false, error: 'savedPrompt is required' });
        if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Template name is required' });

        // Step 8: guarantee both previewUrl and previewImageUrl are populated
        const canonicalUrl = previewUrl;

        const template = await Template.create({
            name: name.trim(),
            categoryId: categoryId || null,
            description: description || '',
            tags: Array.isArray(tags) ? tags : [],
            studioOrigin: studioOrigin || 'creative',
            studioSection: studioSection || 'general',
            promptTemplate: promptTemplate || '',
            generationModel: generationModel || 'gpt-image-2',
            generationParams: generationParams || {},
            previewUrl: canonicalUrl,
            previewImageUrl: canonicalUrl, // Step 8: both fields populated
            previewType: 'image',
            savedPrompt,
            isActive: false,  // Admin must activate
            isPublished: false,
            isFeatured: false,
            createdBy: req.user._id,
        });

        res.json({ success: true, template });
    } catch (err) {
        res.status(400).json({ success: false, error: err.message });
    }
});

export default router;

