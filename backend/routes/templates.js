import express from 'express';
import { protect } from '../middleware/auth.js';
import Template from '../models/Template.js';
import TemplateCategory from '../models/TemplateCategory.js';
import TemplateUsageLog from '../models/TemplateUsageLog.js';
import GenerationJob from '../models/GenerationJob.js';
import { buildTemplatePrompt } from '../agents/shared/templatePromptCombiner.js';
import { deductCredits } from '../middleware/credits.js';
import { internalGenerateCreative } from './creatives.js';

const router = express.Router();

// Get active templates
router.get('/', protect, async (req, res) => {
    try {
        const { limit = 50, page = 1, categoryId, studioOrigin, search } = req.query;
        const filter = { isActive: true };

        if (categoryId) filter.categoryId = categoryId;
        if (studioOrigin) filter.studioOrigin = studioOrigin;
        
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { tags: { $regex: search, $options: 'i' } }
            ];
        }

        const templates = await Template.find(filter)
            .sort({ isFeatured: -1, usageCount: -1, createdAt: -1 })
            .skip((parseInt(page) - 1) * parseInt(limit))
            .limit(parseInt(limit))
            .populate('categoryId', 'name color iconEmoji')
            .lean();

        res.json({ success: true, templates });
    } catch (error) {
        console.error('GET /api/templates error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single template
router.get('/:id', protect, async (req, res) => {
    try {
        const template = await Template.findOne({ _id: req.params.id, isActive: true })
            .populate('categoryId', 'name color iconEmoji')
            .lean();
            
        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found' });
        }
        res.json({ success: true, template });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Use template
router.post('/:id/use', protect, async (req, res) => {
    try {
        const template = await Template.findOne({ _id: req.params.id, isActive: true });
        if (!template) {
            return res.status(404).json({ success: false, error: 'Template not found or inactive' });
        }

        const { userInputs = {} } = req.body;
        const { userPrompt, userProductImageBase64, userAvatarImageBase64, settings } = userInputs;

        // 1. Build Prompt
        const promptData = await buildTemplatePrompt({
            template,
            userPrompt,
            userProductImageBase64,
            userAvatarImageBase64
        });

        // 2. Determine Cost & Deduct Credits
        let cost = 0;
        let deductCategory = 'template';
        if (template.studioOrigin === 'creative') { cost = 4; deductCategory = 'creative'; }
        else if (template.studioOrigin === 'video') { cost = 8; deductCategory = 'videoGenerate'; }
        else if (template.studioOrigin === 'content') { cost = 2; deductCategory = 'content'; }

        if (cost > 0) {
            await deductCredits(req.user._id, cost, deductCategory);
        }

        // 3. Increment Usage & Log
        await Template.findByIdAndUpdate(template._id, { $inc: { usageCount: 1 } });
        
        const usageLog = await TemplateUsageLog.create({
            templateId: template._id,
            userId: req.user._id,
            studioOrigin: template.studioOrigin,
            userBrief: userPrompt || '',
            hadProductImage: !!userProductImageBase64,
            hadAvatarImage: !!userAvatarImageBase64,
            resultJobId: null // We will update this right after
        });

        // 4. Create Job & Route to Pipeline
        let jobId;
        let jobRecord;

        if (template.studioOrigin === 'creative') {
            jobId = `create-${Date.now()}`;
            // Use internal function in the background
            internalGenerateCreative({
                body: {
                    prompt: promptData.finalPrompt,
                    visionInputs: promptData.visionInputs,
                    format: settings?.format || 'instagram-post',
                    jobId
                },
                user: req.user,
                creditsDeducted: cost,
                jobId
            }).catch(e => console.error('Creative background dispatch error:', e));
            jobRecord = { _id: jobId }; // internalGenerateCreative handles the DB writes
        } 
        else if (template.studioOrigin === 'video') {
            jobId = `vid-${Date.now()}`;
            jobRecord = await GenerationJob.create({
                jobId,
                user: req.user._id,
                type: 'video',
                status: 'pending',
                prompt: promptData.finalPrompt,
                options: { ...promptData.settings, ...settings },
                creditsDeducted: cost,
                meta: { label: `Template: ${template.name}`, page: '/video-studio' }
            });
            
            // We dispatch internally to /api/video-studio/ugc-pro/qads/generate or similar
            // But to avoid double deduction, we just call the external API with a bypass or 
            // the pipeline handles it based on the job. 
            // For now, we will simulate the pipeline start by doing a fetch to a known generic route 
            // or just triggering the background agent.
            // In Mantram, many video pipelines just poll the GenerationJob and an agent picks it up.
            // Let's use the local API but we need to prevent double deduction.
            // For simplicity and resilience, we will just return the job and let a worker or 
            // direct fetch handle the background process.
            fetch(`http://localhost:${process.env.PORT || 3001}/api/video-studio/agent/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization,
                    'X-Skip-Credits': 'true' // In case we modify middleware later
                },
                body: JSON.stringify({
                    jobId,
                    prompt: promptData.finalPrompt,
                    visionInputs: promptData.visionInputs,
                    settings: promptData.settings
                })
            }).catch(e => console.error('Video background dispatch error:', e));

        } 
        else {
            jobId = `content-${Date.now()}`;
            jobRecord = await GenerationJob.create({
                jobId,
                user: req.user._id,
                type: 'content',
                status: 'pending',
                prompt: promptData.finalPrompt,
                options: { ...promptData.settings, ...settings },
                creditsDeducted: cost,
                meta: { label: `Template: ${template.name}`, page: '/content-studio' }
            });
            
            fetch(`http://localhost:${process.env.PORT || 3001}/api/content/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization,
                    'X-Skip-Credits': 'true'
                },
                body: JSON.stringify({
                    jobId,
                    prompt: promptData.finalPrompt,
                    topic: promptData.finalPrompt
                })
            }).catch(e => console.error('Content background dispatch error:', e));
        }

        // Update Usage Log with Job ID
        if (jobId) {
            usageLog.resultJobId = jobId;
            await usageLog.save();
        }

        res.json({
            success: true,
            jobId,
            status: 'processing',
            message: `Template generation started for ${template.studioOrigin}`
        });

    } catch (error) {
        console.error('POST /api/templates/:id/use error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
