/**
 * Funnel Studio Routes
 * Full CRUD + pipeline management + templates + analytics + AI generation
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import Contact from '../models/Contact.js';
import Brand from '../models/Brand.js';
import { getRouter } from '../ai/router.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { runAutomationRules } from './funnel-automation.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
//  FUNNEL TEMPLATES — Pre-built funnel blueprints
// ═══════════════════════════════════════════════════════════════

const FUNNEL_TEMPLATES = [
    {
        id: 'lead_gen',
        name: 'Lead Generation Funnel',
        description: 'Capture leads through content, qualify them, and convert to customers',
        icon: 'person_add',
        color: '#10b981',
        type: 'lead_gen',
        stages: [
            { name: 'Awareness', order: 0, type: 'awareness', color: '#6366f1', description: 'First touchpoint — visitor discovers your brand via ads, SEO, or social' },
            { name: 'Interest', order: 1, type: 'interest', color: '#8b5cf6', description: 'Lead engages — downloads content, follows social, reads blog' },
            { name: 'Consideration', order: 2, type: 'consideration', color: '#f59e0b', description: 'Lead evaluates — compares options, reads reviews, attends webinar' },
            { name: 'Decision', order: 3, type: 'decision', color: '#ef4444', description: 'Lead ready to buy — requests demo, starts trial, adds to cart' },
            { name: 'Customer', order: 4, type: 'retention', color: '#10b981', description: 'Converted — purchased, onboarded, repeat buyer' },
        ],
    },
    {
        id: 'product_launch',
        name: 'Product Launch Funnel',
        description: 'Build hype, collect waitlist, launch with impact, and drive first sales',
        icon: 'rocket_launch',
        color: '#f59e0b',
        type: 'product_launch',
        stages: [
            { name: 'Teaser', order: 0, type: 'awareness', color: '#8b5cf6', description: 'Create buzz — mysterious previews, countdowns, influencer seeding' },
            { name: 'Waitlist', order: 1, type: 'interest', color: '#6366f1', description: 'Collect emails — early access signup, referral bonuses' },
            { name: 'Pre-Launch', order: 2, type: 'consideration', color: '#f59e0b', description: 'Educate and excite — demos, behind-the-scenes, testimonials' },
            { name: 'Launch Day', order: 3, type: 'decision', color: '#ef4444', description: 'Drive action — limited offers, live events, social proof' },
            { name: 'Post-Launch', order: 4, type: 'retention', color: '#10b981', description: 'Sustain momentum — reviews, upsells, community building' },
        ],
    },
    {
        id: 'webinar',
        name: 'Webinar Funnel',
        description: 'Drive registrations, maximize attendance, and convert attendees to buyers',
        icon: 'videocam',
        color: '#6366f1',
        type: 'webinar',
        stages: [
            { name: 'Registration', order: 0, type: 'awareness', color: '#6366f1', description: 'Landing page + ads driving webinar signups' },
            { name: 'Nurture', order: 1, type: 'interest', color: '#8b5cf6', description: 'Reminder emails, pre-event content, expectation setting' },
            { name: 'Attended', order: 2, type: 'consideration', color: '#f59e0b', description: 'Showed up — engaged during live session' },
            { name: 'Follow-Up', order: 3, type: 'decision', color: '#ef4444', description: 'Post-event — replay access, Q&A, special offer' },
            { name: 'Converted', order: 4, type: 'retention', color: '#10b981', description: 'Purchased product/service from webinar offer' },
        ],
    },
    {
        id: 'e_commerce',
        name: 'E-Commerce Sales Funnel',
        description: 'Optimize the path from product discovery to purchase and repeat buying',
        icon: 'shopping_cart',
        color: '#ef4444',
        type: 'e_commerce',
        stages: [
            { name: 'Discovery', order: 0, type: 'awareness', color: '#6366f1', description: 'Product found via ads, social, search, or browse' },
            { name: 'Product View', order: 1, type: 'interest', color: '#8b5cf6', description: 'Viewed product page, checked reviews/images' },
            { name: 'Cart', order: 2, type: 'consideration', color: '#f59e0b', description: 'Added to cart — considering purchase' },
            { name: 'Checkout', order: 3, type: 'decision', color: '#ef4444', description: 'Initiated checkout — entering payment details' },
            { name: 'Purchased', order: 4, type: 'retention', color: '#10b981', description: 'Order complete — follow up for reviews + repeat purchase' },
        ],
    },
    {
        id: 'nurture_sequence',
        name: 'Nurture & Retention Funnel',
        description: 'Warm up cold leads and retain existing customers with engagement sequences',
        icon: 'favorite',
        color: '#ec4899',
        type: 'nurture_sequence',
        stages: [
            { name: 'Cold Lead', order: 0, type: 'awareness', color: '#94a3b8', description: 'Inactive or unengaged contact — needs re-activation' },
            { name: 'Re-Engaged', order: 1, type: 'interest', color: '#6366f1', description: 'Opened email, clicked link, visited site again' },
            { name: 'Warm', order: 2, type: 'consideration', color: '#f59e0b', description: 'Multiple interactions — showing renewed interest' },
            { name: 'Hot', order: 3, type: 'decision', color: '#ef4444', description: 'High intent signals — ready for sales pitch' },
            { name: 'Loyal Customer', order: 4, type: 'retention', color: '#10b981', description: 'Repeat purchaser, brand advocate, referral source' },
        ],
    },
];


// ═══════════════════════════════════════════════════════════════
//  TEMPLATES
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-studio/templates
router.get('/templates', protect, (req, res) => {
    res.json({ success: true, templates: FUNNEL_TEMPLATES });
});


// ═══════════════════════════════════════════════════════════════
//  FUNNEL CRUD
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-studio — List funnels for active brand
router.get('/', protect, async (req, res) => {
    try {
        const { brandId, status } = req.query;
        const filter = { user: req.user._id };
        if (brandId) filter.brand = brandId;
        if (status) filter.status = status;

        const funnels = await Funnel.find(filter).sort({ updatedAt: -1 });

        // Attach live entry counts per funnel
        const funnelsWithCounts = await Promise.all(funnels.map(async (f) => {
            const [totalEntries, activeEntries, convertedEntries] = await Promise.all([
                FunnelEntry.countDocuments({ funnel: f._id }),
                FunnelEntry.countDocuments({ funnel: f._id, status: 'active' }),
                FunnelEntry.countDocuments({ funnel: f._id, status: 'converted' }),
            ]);
            const obj = f.toObject();
            obj.metrics = {
                ...obj.metrics,
                totalEntries,
                activeEntries,
                convertedEntries,
                conversionRate: totalEntries > 0 ? Math.round((convertedEntries / totalEntries) * 100) : 0,
            };
            return obj;
        }));

        res.json({ success: true, funnels: funnelsWithCounts });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-studio — Create funnel (from template or custom)
router.post('/', protect, async (req, res) => {
    try {
        const { brandId, templateId, name, description, type, stages } = req.body;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId is required' });

        let funnelData = {
            user: req.user._id,
            brand: brandId,
            name: name || 'New Funnel',
            description: description || '',
            type: type || 'custom',
            status: 'draft',
        };

        // If creating from template
        if (templateId) {
            const template = FUNNEL_TEMPLATES.find(t => t.id === templateId);
            if (!template) return res.status(400).json({ success: false, error: 'Invalid template' });

            funnelData.name = name || template.name;
            funnelData.description = description || template.description;
            funnelData.icon = template.icon;
            funnelData.color = template.color;
            funnelData.type = template.type;
            funnelData.stages = template.stages.map(s => ({
                ...s,
                metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 },
            }));
        } else if (stages) {
            // Custom stages
            funnelData.stages = stages.map((s, idx) => ({
                name: s.name || `Stage ${idx + 1}`,
                order: s.order ?? idx,
                type: s.type || 'custom',
                color: s.color || '#6366f1',
                description: s.description || '',
                metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 },
            }));
        } else {
            // Default: basic 3-stage funnel
            funnelData.stages = [
                { name: 'Top', order: 0, type: 'awareness', color: '#6366f1', description: 'Top of funnel', metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 } },
                { name: 'Middle', order: 1, type: 'consideration', color: '#f59e0b', description: 'Middle of funnel', metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 } },
                { name: 'Bottom', order: 2, type: 'decision', color: '#10b981', description: 'Bottom of funnel', metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 } },
            ];
        }

        const funnel = await Funnel.create(funnelData);
        res.status(201).json({ success: true, funnel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/funnel-studio/:id — Get single funnel with entries summary
router.get('/:id', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Get entries grouped by stage
        const entriesByStage = {};
        for (const stage of funnel.stages) {
            const entries = await FunnelEntry.find({
                funnel: funnel._id,
                currentStage: stage.name,
                status: { $in: ['active', 'paused'] },
            }).sort({ score: -1 }).limit(100);
            entriesByStage[stage.name] = entries;
        }

        // Get converted/lost separately
        const [converted, lost] = await Promise.all([
            FunnelEntry.find({ funnel: funnel._id, status: 'converted' }).sort({ convertedAt: -1 }).limit(50),
            FunnelEntry.find({ funnel: funnel._id, status: 'lost' }).sort({ updatedAt: -1 }).limit(50),
        ]);

        res.json({
            success: true,
            funnel: funnel.toObject(),
            entriesByStage,
            converted,
            lost,
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/funnel-studio/:id — Update funnel
router.put('/:id', protect, async (req, res) => {
    try {
        const { name, description, stages, status, icon, color } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (description !== undefined) update.description = description;
        if (stages) update.stages = stages;
        if (status) update.status = status;
        if (icon) update.icon = icon;
        if (color) update.color = color;

        const funnel = await Funnel.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            update,
            { returnDocument: 'after' }
        );
        if (!funnel) return res.status(404).json({ success: false, error: 'Not found' });
        res.json({ success: true, funnel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/funnel-studio/:id — Delete funnel + all entries
router.delete('/:id', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Not found' });

        // Clean up all entries
        await FunnelEntry.deleteMany({ funnel: req.params.id });

        // Remove funnel ref from contacts
        await Contact.updateMany(
            { funnelIds: req.params.id },
            { $pull: { funnelIds: req.params.id } }
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  FUNNEL ENTRIES (PIPELINE)
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-studio/:id/entries — Get all entries for a funnel
router.get('/:id/entries', protect, async (req, res) => {
    try {
        const { stage, status: entryStatus, page = 1, limit = 100 } = req.query;
        const filter = { funnel: req.params.id, user: req.user._id };
        if (stage) filter.currentStage = stage;
        if (entryStatus) filter.status = entryStatus;

        const entries = await FunnelEntry.find(filter)
            .sort({ score: -1, updatedAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await FunnelEntry.countDocuments(filter);
        res.json({ success: true, entries, total });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-studio/:id/entries — Add new entry to funnel
router.post('/:id/entries', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const { name, email, phone, company, source, sourceCampaign, score, notes, contactId, stage } = req.body;

        // Determine entry stage (default: first stage)
        const entryStage = stage || funnel.stages[0]?.name || 'Top';

        const entryData = {
            funnel: funnel._id,
            user: req.user._id,
            brand: funnel.brand,
            name: name || 'Unknown',
            email: email || '',
            phone: phone || '',
            company: company || '',
            source: source || 'manual',
            sourceCampaign: sourceCampaign || '',
            currentStage: entryStage,
            score: score || 0,
            notes: notes || '',
            stageHistory: [{ stage: entryStage, enteredAt: new Date(), movedBy: 'manual' }],
            touchpoints: [{ type: 'custom', details: 'Manually added to funnel', timestamp: new Date() }],
        };

        // Link to existing contact if provided
        if (contactId) {
            entryData.contact = contactId;
            // Add funnel ref to contact
            await Contact.updateOne(
                { _id: contactId },
                { $addToSet: { funnelIds: funnel._id } }
            );
        }

        const entry = await FunnelEntry.create(entryData);

        // 🤖 Automation Hook: entry_created
        runAutomationRules(funnel._id, 'entry_created', { entryId: entry._id }).catch(() => {});

        res.status(201).json({ success: true, entry });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/funnel-studio/:id/entries/:entryId — Update entry
router.put('/:id/entries/:entryId', protect, async (req, res) => {
    try {
        const { name, email, phone, company, score, notes, tags, status } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (email !== undefined) update.email = email;
        if (phone !== undefined) update.phone = phone;
        if (company !== undefined) update.company = company;
        if (score !== undefined) update.score = score;
        if (notes !== undefined) update.notes = notes;
        if (tags) update.tags = tags;
        if (status) {
            update.status = status;
            if (status === 'converted') update.convertedAt = new Date();
        }

        const entry = await FunnelEntry.findOneAndUpdate(
            { _id: req.params.entryId, funnel: req.params.id, user: req.user._id },
            update,
            { returnDocument: 'after' }
        );
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        // 🤖 Automation Hook: status_changed
        if (status) {
            runAutomationRules(req.params.id, 'status_changed', { entryId: entry._id }).catch(() => {});
        }

        res.json({ success: true, entry });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/funnel-studio/:id/entries/:entryId/move — Move entry to different stage
router.put('/:id/entries/:entryId/move', protect, async (req, res) => {
    try {
        const { toStage } = req.body;
        if (!toStage) return res.status(400).json({ success: false, error: 'toStage is required' });

        const entry = await FunnelEntry.findOne({ _id: req.params.entryId, funnel: req.params.id, user: req.user._id });
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        // Close current stage in history
        const currentHistory = entry.stageHistory[entry.stageHistory.length - 1];
        if (currentHistory) currentHistory.exitedAt = new Date();

        // Add new stage to history
        entry.stageHistory.push({ stage: toStage, enteredAt: new Date(), movedBy: 'manual' });
        entry.currentStage = toStage;

        // Add touchpoint
        entry.touchpoints.push({
            type: 'custom',
            details: `Moved to stage: ${toStage}`,
            timestamp: new Date(),
        });

        await entry.save();

        // 🤖 Automation Hook: stage_changed
        runAutomationRules(req.params.id, 'stage_changed', {
            entryId: entry._id,
            fromStage: currentHistory?.stage,
            toStage,
        }).catch(() => {});

        res.json({ success: true, entry });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/funnel-studio/:id/entries/:entryId — Remove entry
router.delete('/:id/entries/:entryId', protect, async (req, res) => {
    try {
        const entry = await FunnelEntry.findOneAndDelete({
            _id: req.params.entryId, funnel: req.params.id, user: req.user._id,
        });
        if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });

        // Remove funnel ref from contact if linked
        if (entry.contact) {
            await Contact.updateOne(
                { _id: entry.contact },
                { $pull: { funnelIds: req.params.id } }
            );
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  ANALYTICS
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-studio/:id/analytics — Funnel conversion analytics
router.get('/:id/analytics', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const stageAnalytics = [];
        let previousStageCount = 0;

        for (const stage of funnel.stages) {
            const totalInStage = await FunnelEntry.countDocuments({
                funnel: funnel._id,
                $or: [
                    { currentStage: stage.name, status: { $in: ['active', 'paused'] } },
                    { 'stageHistory.stage': stage.name },
                ],
            });

            // Count entries that ever entered this stage
            const everInStage = await FunnelEntry.countDocuments({
                funnel: funnel._id,
                'stageHistory.stage': stage.name,
            });

            const dropOff = previousStageCount > 0
                ? Math.round(((previousStageCount - everInStage) / previousStageCount) * 100)
                : 0;

            stageAnalytics.push({
                stageName: stage.name,
                stageColor: stage.color,
                currentCount: totalInStage,
                everEntered: everInStage,
                dropOffRate: Math.max(0, dropOff),
            });

            previousStageCount = everInStage || previousStageCount;
        }

        // Overall stats
        const [totalEntries, convertedEntries, lostEntries, activeEntries] = await Promise.all([
            FunnelEntry.countDocuments({ funnel: funnel._id }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'converted' }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'lost' }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'active' }),
        ]);

        const totalRevenue = await FunnelEntry.aggregate([
            { $match: { funnel: funnel._id, status: 'converted' } },
            { $group: { _id: null, total: { $sum: '$revenue' } } },
        ]);

        // Source breakdown
        const sourceBreakdown = await FunnelEntry.aggregate([
            { $match: { funnel: funnel._id } },
            { $group: { _id: '$source', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ]);

        res.json({
            success: true,
            analytics: {
                stages: stageAnalytics,
                overview: {
                    totalEntries,
                    activeEntries,
                    convertedEntries,
                    lostEntries,
                    conversionRate: totalEntries > 0 ? Math.round((convertedEntries / totalEntries) * 100) : 0,
                    totalRevenue: totalRevenue[0]?.total || 0,
                },
                sourceBreakdown: sourceBreakdown.map(s => ({ source: s._id || 'unknown', count: s.count })),
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  AI FUNNEL GENERATION
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-studio/ai/generate — AI generates a funnel structure
router.post('/ai/generate', protect, async (req, res) => {
    try {
        const { brandId, prompt } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

        // Fetch brand context for better AI generation
        let brandContext = '';
        if (brandId) {
            const brand = await Brand.findById(brandId);
            if (brand) {
                brandContext = `
Brand: ${brand.name}
Industry: ${brand.industry || 'General'}
Description: ${brand.tagline || brand.description || ''}
Target Audience: ${brand.targetAudience || 'General audience'}
Products: ${brand.products?.slice(0, 5).map(p => p.name).join(', ') || 'Not specified'}`;
            }
        }

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `You are an expert sales funnel architect. Create a detailed sales funnel based on this user request.

${brandContext ? `BRAND CONTEXT:${brandContext}` : ''}

USER REQUEST: ${prompt}

Respond ONLY with valid JSON in this exact format:
{
    "name": "Funnel name",
    "description": "Brief description of what this funnel achieves",
    "type": "lead_gen|product_launch|webinar|e_commerce|nurture_sequence|custom",
    "icon": "material icon name (e.g. rocket_launch, person_add, shopping_cart)",
    "color": "#hex color",
    "stages": [
        {
            "name": "Stage Name",
            "order": 0,
            "type": "awareness|interest|consideration|decision|retention|custom",
            "color": "#hex color",
            "description": "What happens at this stage and what actions to take"
        }
    ]
}

Create 4-6 stages. Make descriptions actionable and specific to the brand context. Use creative stage names that match the business.`,
            maxTokens: 2000,
            temperature: 0.7,
        });

        // Parse AI response
        let funnelStructure;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            funnelStructure = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            return res.status(500).json({ success: false, error: 'AI response was not valid JSON. Please try again.' });
        }

        // Validate and clean
        if (!funnelStructure.stages || !Array.isArray(funnelStructure.stages)) {
            return res.status(500).json({ success: false, error: 'AI did not return valid funnel stages' });
        }

        // Create the funnel
        const funnel = await Funnel.create({
            user: req.user._id,
            brand: brandId,
            name: funnelStructure.name || 'AI-Generated Funnel',
            description: funnelStructure.description || '',
            type: funnelStructure.type || 'custom',
            icon: funnelStructure.icon || 'auto_awesome',
            color: funnelStructure.color || '#6366f1',
            stages: funnelStructure.stages.map((s, idx) => ({
                name: s.name,
                order: s.order ?? idx,
                type: s.type || 'custom',
                color: s.color || '#6366f1',
                description: s.description || '',
                metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 },
            })),
            aiGenerated: true,
            aiPrompt: prompt,
            status: 'draft',
        });

        res.status(201).json({ success: true, funnel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  FUNNEL DUPLICATION
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-studio/:id/duplicate — Clone a funnel
router.post('/:id/duplicate', protect, async (req, res) => {
    try {
        const original = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!original) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const clone = await Funnel.create({
            user: req.user._id,
            brand: original.brand,
            name: `${original.name} (Copy)`,
            description: original.description,
            icon: original.icon,
            color: original.color,
            type: original.type,
            stages: original.stages.map(s => ({
                name: s.name,
                order: s.order,
                type: s.type,
                color: s.color,
                description: s.description,
                studioLinks: s.studioLinks || [],
                metrics: { totalEntries: 0, avgTimeInStage: 0, dropOffRate: 0 },
            })),
            status: 'draft',
            aiGenerated: original.aiGenerated,
            aiPrompt: original.aiPrompt,
        });

        res.status(201).json({ success: true, funnel: clone });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  BULK CONTACT IMPORT
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-studio/:id/import-contacts — Import existing CRM contacts into funnel
router.post('/:id/import-contacts', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const { leadStatus, tags, platform, stage, maxImport = 100 } = req.body;

        // Build contact filter
        const contactFilter = { user: req.user._id, brand: funnel.brand };
        if (leadStatus) contactFilter.leadStatus = leadStatus;
        if (tags && tags.length) contactFilter.tags = { $in: tags };
        if (platform) contactFilter.platform = platform;

        // Exclude contacts already in this funnel
        contactFilter.funnelIds = { $nin: [funnel._id] };

        const contacts = await Contact.find(contactFilter)
            .sort({ lastInteractionAt: -1 })
            .limit(parseInt(maxImport));

        if (contacts.length === 0) {
            return res.json({ success: true, imported: 0, message: 'No matching contacts found' });
        }

        // Determine entry stage (default: first stage)
        const entryStage = stage || funnel.stages[0]?.name || 'Top';

        // Create entries + link contacts
        const entries = [];
        for (const contact of contacts) {
            const entry = await FunnelEntry.create({
                funnel: funnel._id,
                user: req.user._id,
                brand: funnel.brand,
                contact: contact._id,
                name: contact.name || 'Unknown',
                email: contact.email || '',
                phone: contact.phone || '',
                source: contact.leadSource === 'instagram_dm' ? 'dm'
                    : contact.leadSource === 'instagram_comment' ? 'social'
                    : contact.platform || 'manual',
                currentStage: entryStage,
                score: contact.interestScore || 0,
                stageHistory: [{ stage: entryStage, enteredAt: new Date(), movedBy: 'system' }],
                touchpoints: [{ type: 'custom', details: 'Imported from CRM contacts', timestamp: new Date() }],
                tags: contact.tags || [],
            });
            entries.push(entry);

            // Link funnel to contact
            await Contact.updateOne(
                { _id: contact._id },
                { $addToSet: { funnelIds: funnel._id } }
            );
        }

        res.json({ success: true, imported: entries.length, entries });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  AI OPTIMIZATION SUGGESTIONS
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-studio/:id/ai-suggestions — AI analyzes funnel and suggests improvements
router.post('/:id/ai-suggestions', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Gather funnel data for AI context
        const [totalEntries, convertedEntries, lostEntries] = await Promise.all([
            FunnelEntry.countDocuments({ funnel: funnel._id }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'converted' }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'lost' }),
        ]);

        // Stage-level counts
        const stageCounts = {};
        for (const stage of funnel.stages) {
            stageCounts[stage.name] = await FunnelEntry.countDocuments({
                funnel: funnel._id, currentStage: stage.name, status: 'active',
            });
        }

        // Get brand context
        let brandContext = '';
        const brand = await Brand.findById(funnel.brand);
        if (brand) {
            brandContext = `Brand: ${brand.name}, Industry: ${brand.industry || 'General'}`;
        }

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `You are a sales funnel optimization expert. Analyze this funnel and provide actionable suggestions.

${brandContext}

FUNNEL: "${funnel.name}" (${funnel.type})
STAGES: ${funnel.stages.map(s => `${s.name} (${s.type}) — ${s.description || 'no description'} — Studio links: ${s.studioLinks?.length || 0} — Active entries: ${stageCounts[s.name] || 0}`).join('\n')}

METRICS:
- Total entries: ${totalEntries}
- Converted: ${convertedEntries}
- Lost: ${lostEntries}
- Conversion rate: ${totalEntries > 0 ? Math.round((convertedEntries / totalEntries) * 100) : 0}%

Respond ONLY with valid JSON array of suggestions:
[
    {
        "type": "warning|opportunity|quick_win|automation",
        "icon": "material icon name",
        "title": "Short title",
        "description": "Detailed actionable suggestion (1-2 sentences)",
        "priority": "high|medium|low",
        "studioLink": "optional — which Mantram studio can help (contentStudio, creativeStudio, conversationStudio, seoStudio, performanceMarketing)"
    }
]

Provide 3-6 specific, actionable suggestions. Consider:
- Missing stages (e.g. no nurture between awareness and decision)
- Empty stages (no entries)
- No studio connections (suggest linking automations, content)
- Low conversion rate fixes
- Stage-specific improvements`,
            maxTokens: 1500,
            temperature: 0.7,
        });

        let suggestions;
        try {
            const jsonMatch = result.text.match(/\[[\s\S]*\]/);
            suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            suggestions = [{ type: 'warning', icon: 'info', title: 'AI Analysis', description: result.text, priority: 'medium' }];
        }

        res.json({ success: true, suggestions });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  #11 FUNNEL SHARING / TEMPLATE MARKETPLACE
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-studio/:id/share — Share funnel as template
router.post('/:id/share', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const brand = await Brand.findById(funnel.brand);

        funnel.isShared = true;
        funnel.sharedBy = brand?.name || 'Anonymous';
        funnel.shareDescription = req.body.description || funnel.description;
        funnel.shareCategory = req.body.category || funnel.type;
        await funnel.save();

        res.json({ success: true, message: 'Funnel shared as template', funnel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-studio/:id/unshare — Remove from shared
router.post('/:id/unshare', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });
        funnel.isShared = false;
        await funnel.save();
        res.json({ success: true, funnel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/funnel-studio/shared/browse — Browse shared funnel templates
router.get('/shared/browse', protect, async (req, res) => {
    try {
        const { category } = req.query;
        const filter = { isShared: true };
        if (category) filter.shareCategory = category;

        const sharedFunnels = await Funnel.find(filter)
            .select('name description icon color type stages sharedBy shareDescription shareCategory cloneCount createdAt')
            .sort({ cloneCount: -1, createdAt: -1 })
            .limit(50);

        res.json({ success: true, templates: sharedFunnels });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-studio/shared/:id/clone — Clone a shared funnel
router.post('/shared/:id/clone', protect, async (req, res) => {
    try {
        const original = await Funnel.findOne({ _id: req.params.id, isShared: true });
        if (!original) return res.status(404).json({ success: false, error: 'Shared template not found' });

        const brandId = req.body.brandId || req.query.brandId;
        if (!brandId) return res.status(400).json({ success: false, error: 'brandId required' });

        // Clone with stripped IDs
        const newFunnel = await Funnel.create({
            user: req.user._id,
            brand: brandId,
            name: `${original.name} (cloned)`,
            description: original.description,
            icon: original.icon,
            color: original.color,
            type: original.type,
            stages: original.stages.map((s, idx) => ({
                name: s.name, order: idx, type: s.type,
                color: s.color, description: s.description,
                studioLinks: s.studioLinks || [],
            })),
            status: 'active',
        });

        // Increment clone count
        original.cloneCount = (original.cloneCount || 0) + 1;
        await original.save();

        res.status(201).json({ success: true, funnel: newFunnel });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  WEBHOOK TOKEN — Get webhook URL for a funnel
// ═══════════════════════════════════════════════════════════════

router.get('/:id/webhook-token', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.id, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Ensure token exists
        if (!funnel.webhookToken) {
            await funnel.save(); // pre-save hook will generate it
        }

        res.json({
            success: true,
            webhookToken: funnel.webhookToken,
            endpoints: {
                generic: `/api/funnel-webhooks/${funnel.webhookToken}/ingest`,
                shopify: `/api/funnel-webhooks/${funnel.webhookToken}/shopify`,
                stripe: `/api/funnel-webhooks/${funnel.webhookToken}/stripe`,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;
