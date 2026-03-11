/**
 * Funnel Intelligence Routes — Phase 4
 * AI Lead Scoring, Funnel Health Monitor, Landing Pages + Forms
 */

import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import Funnel from '../models/Funnel.js';
import FunnelEntry from '../models/FunnelEntry.js';
import FunnelPage from '../models/FunnelPage.js';
import Contact from '../models/Contact.js';
import Brand from '../models/Brand.js';
import { getRouter } from '../ai/router.js';
import { safeErrorMessage } from '../utils/safeError.js';
import { runAutomationRules } from './funnel-automation.js';

const router = Router();


// ═══════════════════════════════════════════════════════════════
//  AI LEAD SCORING
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-intelligence/:funnelId/score-entries — AI scores all active entries
router.post('/:funnelId/score-entries', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const entries = await FunnelEntry.find({ funnel: funnel._id, status: 'active' }).limit(200);
        if (entries.length === 0) return res.json({ success: true, scored: 0, entries: [] });

        // Score each entry based on behavior signals
        const scoredEntries = entries.map(entry => {
            let score = entry.score || 0;
            const signals = [];

            // Touchpoint volume signal
            const touchpointCount = entry.touchpoints?.length || 0;
            if (touchpointCount >= 5) { score += 15; signals.push('High engagement (5+ touchpoints)'); }
            else if (touchpointCount >= 3) { score += 8; signals.push('Moderate engagement (3+ touchpoints)'); }
            else if (touchpointCount >= 1) { score += 3; signals.push('Initial engagement'); }

            // Stage progression speed
            const stageCount = entry.stageHistory?.length || 0;
            if (stageCount >= 3) { score += 20; signals.push('Progressing fast through funnel'); }
            else if (stageCount >= 2) { score += 10; signals.push('Moved between stages'); }

            // Recency signal
            const daysSinceUpdate = entry.updatedAt ? Math.floor((Date.now() - new Date(entry.updatedAt)) / 86400000) : 999;
            if (daysSinceUpdate <= 1) { score += 15; signals.push('Active today'); }
            else if (daysSinceUpdate <= 3) { score += 10; signals.push('Active recently (3 days)'); }
            else if (daysSinceUpdate <= 7) { score += 5; signals.push('Active this week'); }
            else if (daysSinceUpdate > 14) { score -= 10; signals.push('Inactive (14+ days)'); }

            // Source quality signal
            const highQualitySources = ['referral', 'organic', 'dm'];
            if (highQualitySources.includes(entry.source)) { score += 10; signals.push(`High-quality source: ${entry.source}`); }

            // Has email/phone (contact completeness)
            if (entry.email) { score += 5; signals.push('Has email'); }
            if (entry.phone) { score += 5; signals.push('Has phone'); }

            // Stage type bonus
            const currentStage = funnel.stages.find(s => s.name === entry.currentStage);
            const stageTypeBonus = { decision: 25, consideration: 15, interest: 10, retention: 20 };
            if (currentStage && stageTypeBonus[currentStage.type]) {
                score += stageTypeBonus[currentStage.type];
                signals.push(`Stage bonus: ${currentStage.type} (+${stageTypeBonus[currentStage.type]})`);
            }

            // Cap score at 100
            score = Math.max(0, Math.min(100, score));

            return { entryId: entry._id, name: entry.name, previousScore: entry.score, newScore: score, signals, stage: entry.currentStage };
        });

        // Batch update scores
        await Promise.all(
            scoredEntries.map(s => FunnelEntry.updateOne({ _id: s.entryId }, { score: s.newScore }))
        );

        // Categorize
        const hot = scoredEntries.filter(s => s.newScore >= 70).length;
        const warm = scoredEntries.filter(s => s.newScore >= 40 && s.newScore < 70).length;
        const cold = scoredEntries.filter(s => s.newScore < 40).length;

        res.json({
            success: true,
            scored: scoredEntries.length,
            summary: { hot, warm, cold },
            entries: scoredEntries.sort((a, b) => b.newScore - a.newScore),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  FUNNEL HEALTH MONITOR
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-intelligence/:funnelId/health — Comprehensive funnel health report
router.get('/:funnelId/health', protect, async (req, res) => {
    try {
        const funnel = await Funnel.findOne({ _id: req.params.funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const stages = funnel.stages || [];
        const stageHealth = [];
        let overallScore = 100;
        const issues = [];
        const recommendations = [];

        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            const [activeEntries, totalEverEntered, lostInStage] = await Promise.all([
                FunnelEntry.countDocuments({ funnel: funnel._id, currentStage: stage.name, status: 'active' }),
                FunnelEntry.countDocuments({ funnel: funnel._id, 'stageHistory.stage': stage.name }),
                FunnelEntry.countDocuments({ funnel: funnel._id, currentStage: stage.name, status: 'lost' }),
            ]);

            // Calculate avg time in stage
            const entriesInStage = await FunnelEntry.find({
                funnel: funnel._id, currentStage: stage.name, status: 'active',
            }).select('stageHistory');

            let avgTimeHrs = 0;
            if (entriesInStage.length > 0) {
                const totalMs = entriesInStage.reduce((sum, entry) => {
                    const stageEntry = entry.stageHistory?.find(h => h.stage === stage.name && !h.exitedAt);
                    if (stageEntry?.enteredAt) return sum + (Date.now() - new Date(stageEntry.enteredAt));
                    return sum;
                }, 0);
                avgTimeHrs = Math.round(totalMs / entriesInStage.length / 3600000 * 10) / 10;
            }

            // Bottleneck detection
            const dropOffRate = i > 0 && stageHealth[i - 1]?.totalEverEntered > 0
                ? Math.round(((stageHealth[i - 1].totalEverEntered - totalEverEntered) / stageHealth[i - 1].totalEverEntered) * 100)
                : 0;

            const isBottleneck = dropOffRate > 50;
            const isStagnant = activeEntries > 10 && avgTimeHrs > 168; // 7+ days
            const hasLostLeads = lostInStage > 5;

            if (isBottleneck) {
                overallScore -= 15;
                issues.push({ type: 'bottleneck', stage: stage.name, message: `${dropOffRate}% drop-off at "${stage.name}" — major bottleneck`, severity: 'high' });
                recommendations.push({ stage: stage.name, action: 'Add nurture sequence', description: `Create automated follow-ups for leads stuck in "${stage.name}" to reduce the ${dropOffRate}% drop-off rate` });
            }
            if (isStagnant) {
                overallScore -= 10;
                issues.push({ type: 'stagnant', stage: stage.name, message: `${activeEntries} leads stuck in "${stage.name}" for 7+ days average`, severity: 'medium' });
                recommendations.push({ stage: stage.name, action: 'Review stage criteria', description: `Consider splitting "${stage.name}" or adding intermediate touchpoints` });
            }
            if (hasLostLeads) {
                overallScore -= 5;
                issues.push({ type: 'lost_leads', stage: stage.name, message: `${lostInStage} leads lost at "${stage.name}"`, severity: 'low' });
            }

            // Check studio links
            if (!stage.studioLinks?.length && i < stages.length - 1) {
                recommendations.push({ stage: stage.name, action: 'Connect studios', description: `Link "${stage.name}" to Content or Conversation Studio for automated touchpoints` });
            }

            stageHealth.push({
                stageName: stage.name,
                stageColor: stage.color,
                stageType: stage.type,
                activeEntries,
                totalEverEntered,
                lostInStage,
                avgTimeHrs,
                dropOffRate: Math.max(0, dropOffRate),
                isBottleneck,
                isStagnant,
                studioLinksCount: stage.studioLinks?.length || 0,
            });
        }

        // Overall metrics
        const [totalEntries, convertedEntries, lostEntries] = await Promise.all([
            FunnelEntry.countDocuments({ funnel: funnel._id }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'converted' }),
            FunnelEntry.countDocuments({ funnel: funnel._id, status: 'lost' }),
        ]);

        const conversionRate = totalEntries > 0 ? Math.round((convertedEntries / totalEntries) * 100) : 0;
        if (conversionRate < 10 && totalEntries > 20) {
            overallScore -= 15;
            issues.push({ type: 'low_conversion', stage: 'overall', message: `Conversion rate is only ${conversionRate}%`, severity: 'high' });
        }

        // Health grade
        overallScore = Math.max(0, Math.min(100, overallScore));
        const grade = overallScore >= 80 ? 'A' : overallScore >= 60 ? 'B' : overallScore >= 40 ? 'C' : overallScore >= 20 ? 'D' : 'F';

        res.json({
            success: true,
            health: {
                overallScore,
                grade,
                totalEntries,
                convertedEntries,
                lostEntries,
                conversionRate,
                stageHealth,
                issues: issues.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] || 3) - ({ high: 0, medium: 1, low: 2 }[b.severity] || 3)),
                recommendations,
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  LANDING PAGES CRUD
// ═══════════════════════════════════════════════════════════════

// GET /api/funnel-intelligence/pages?funnelId=xxx — List pages for a funnel
router.get('/pages', protect, async (req, res) => {
    try {
        const { funnelId } = req.query;
        const filter = { user: req.user._id };
        if (funnelId) filter.funnel = funnelId;

        const pages = await FunnelPage.find(filter).sort({ updatedAt: -1 });
        res.json({ success: true, pages });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// GET /api/funnel-intelligence/pages/:id — Get single page
router.get('/pages/:id', protect, async (req, res) => {
    try {
        const page = await FunnelPage.findOne({ _id: req.params.id, user: req.user._id });
        if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
        res.json({ success: true, page });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// POST /api/funnel-intelligence/pages — Create landing page
router.post('/pages', protect, async (req, res) => {
    try {
        const { funnelId, name, targetStage, slug, sections, form, style } = req.body;
        if (!funnelId || !targetStage) return res.status(400).json({ success: false, error: 'funnelId and targetStage required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        // Auto-generate slug if not provided
        const pageSlug = slug || `${name || 'page'}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

        const page = await FunnelPage.create({
            user: req.user._id,
            brand: funnel.brand,
            funnel: funnelId,
            name: name || 'Landing Page',
            slug: pageSlug,
            targetStage,
            sections: sections || [
                { type: 'hero', order: 0, content: { headline: 'Welcome', subheadline: 'Get started today', buttonText: 'Sign Up' } },
            ],
            form: form || {
                enabled: true, title: 'Get Started',
                fields: [
                    { name: 'name', label: 'Your Name', type: 'text', required: true, mapToContact: 'name', order: 0 },
                    { name: 'email', label: 'Email', type: 'email', required: true, mapToContact: 'email', order: 1 },
                ],
            },
            style: style || {},
            status: 'draft',
        });

        res.status(201).json({ success: true, page });
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ success: false, error: 'Page slug already exists' });
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// PUT /api/funnel-intelligence/pages/:id — Update page
router.put('/pages/:id', protect, async (req, res) => {
    try {
        const { name, slug, description, targetStage, sections, form, style, status } = req.body;
        const update = {};
        if (name !== undefined) update.name = name;
        if (slug) update.slug = slug;
        if (description !== undefined) update.description = description;
        if (targetStage) update.targetStage = targetStage;
        if (sections) update.sections = sections;
        if (form) update.form = form;
        if (style) update.style = style;
        if (status) update.status = status;

        const page = await FunnelPage.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id }, update, { new: true }
        );
        if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
        res.json({ success: true, page });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});

// DELETE /api/funnel-intelligence/pages/:id — Delete page
router.delete('/pages/:id', protect, async (req, res) => {
    try {
        const page = await FunnelPage.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  FORM SUBMISSIONS — public endpoint for landing page forms
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-intelligence/pages/:id/submit — Submit form (public, no auth)
router.post('/pages/:id/submit', async (req, res) => {
    try {
        const page = await FunnelPage.findById(req.params.id);
        if (!page || page.status !== 'published') return res.status(404).json({ success: false, error: 'Page not found or not published' });

        const funnel = await Funnel.findById(page.funnel);
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        const formData = req.body;

        // Map form fields to Contact fields
        const contactData = { user: page.user, brand: page.brand };
        const entryData = { source: page.leadSource || 'landing_page' };

        for (const field of (page.form?.fields || [])) {
            const value = formData[field.name];
            if (!value) continue;

            if (field.mapToContact) contactData[field.mapToContact] = value;
            if (field.name === 'name') entryData.name = value;
            if (field.name === 'email') entryData.email = value;
            if (field.name === 'phone') entryData.phone = value;
            if (field.name === 'company') entryData.company = value;
        }

        // Create or update contact
        let contact = null;
        if (contactData.email) {
            contact = await Contact.findOneAndUpdate(
                { user: page.user, email: contactData.email },
                { $set: contactData, $addToSet: { funnelIds: funnel._id } },
                { upsert: true, new: true }
            );
        }

        // Create funnel entry
        const entryStage = page.targetStage || funnel.stages[0]?.name || 'Top';
        const entry = await FunnelEntry.create({
            funnel: funnel._id,
            user: page.user,
            brand: page.brand,
            contact: contact?._id,
            name: entryData.name || 'Landing Page Lead',
            email: entryData.email || '',
            phone: entryData.phone || '',
            company: entryData.company || '',
            source: entryData.source,
            sourceCampaign: page.name,
            currentStage: entryStage,
            score: 10, // Initial score for landing page leads
            stageHistory: [{ stage: entryStage, enteredAt: new Date(), movedBy: 'system' }],
            touchpoints: [{ type: 'form_submission', details: `Submitted form on "${page.name}"`, timestamp: new Date() }],
        });

        // Update page metrics
        await FunnelPage.updateOne({ _id: page._id }, {
            $inc: { 'metrics.submissions': 1 },
        });

        res.json({
            success: true,
            message: page.form?.successMessage || 'Thanks! We\'ll be in touch.',
            redirectUrl: page.form?.redirectUrl || '',
        });

        // 🤖 Automation Hook: form_submitted + entry_created (fire-and-forget)
        runAutomationRules(funnel._id, 'form_submitted', { entryId: entry._id }).catch(() => {});
        runAutomationRules(funnel._id, 'entry_created', { entryId: entry._id }).catch(() => {});
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


// ═══════════════════════════════════════════════════════════════
//  AI LANDING PAGE GENERATION
// ═══════════════════════════════════════════════════════════════

// POST /api/funnel-intelligence/pages/ai/generate — AI generates landing page content
router.post('/pages/ai/generate', protect, async (req, res) => {
    try {
        const { funnelId, targetStage, prompt, pageType } = req.body;
        if (!funnelId || !targetStage) return res.status(400).json({ success: false, error: 'funnelId and targetStage required' });

        const funnel = await Funnel.findOne({ _id: funnelId, user: req.user._id });
        if (!funnel) return res.status(404).json({ success: false, error: 'Funnel not found' });

        let brandContext = '';
        const brand = await Brand.findById(funnel.brand);
        if (brand) {
            brandContext = `Brand: ${brand.name}\nIndustry: ${brand.industry || 'General'}\nTone: ${brand.voice?.tone || 'Professional'}\nColors: primary ${brand.colors?.primary || '#6366f1'}`;
        }

        const stageInfo = funnel.stages.find(s => s.name === targetStage);

        const ai = getRouter();
        const result = await ai.generateText({
            prompt: `You are an expert landing page copywriter. Create a high-converting landing page for a funnel.

${brandContext}

FUNNEL: "${funnel.name}" (${funnel.type})
TARGET STAGE: "${targetStage}" (${stageInfo?.type || 'custom'}) — ${stageInfo?.description || ''}
PAGE TYPE: ${pageType || 'lead capture'}
${prompt ? `USER INSTRUCTIONS: ${prompt}` : ''}

Respond ONLY with valid JSON:
{
    "name": "Page title",
    "sections": [
        { "type": "hero", "order": 0, "content": { "headline": "...", "subheadline": "...", "buttonText": "..." } },
        { "type": "features", "order": 1, "content": { "headline": "...", "items": [{ "title": "...", "description": "...", "icon": "material icon name" }] } },
        { "type": "testimonial", "order": 2, "content": { "headline": "...", "items": [{ "title": "Customer Name", "description": "Testimonial quote" }] } },
        { "type": "cta", "order": 3, "content": { "headline": "...", "subheadline": "...", "buttonText": "..." } }
    ],
    "form": {
        "title": "Form headline",
        "description": "Form subtitle",
        "fields": [
            { "name": "name", "label": "Your Name", "type": "text", "required": true, "mapToContact": "name", "order": 0 },
            { "name": "email", "label": "Email", "type": "email", "required": true, "mapToContact": "email", "order": 1 }
        ],
        "submitButtonText": "CTA text"
    },
    "style": { "primaryColor": "#hex" }
}

Create compelling, conversion-focused copy. Include 3-5 sections. Use action-oriented CTAs.`,
            maxTokens: 2500,
            temperature: 0.7,
        });

        let pageData;
        try {
            const jsonMatch = result.text.match(/\{[\s\S]*\}/);
            pageData = JSON.parse(jsonMatch ? jsonMatch[0] : result.text);
        } catch {
            return res.status(500).json({ success: false, error: 'AI response was not valid JSON. Try again.' });
        }

        // Create the page
        const pageSlug = `${(pageData.name || 'ai-page').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;
        const page = await FunnelPage.create({
            user: req.user._id,
            brand: funnel.brand,
            funnel: funnelId,
            name: pageData.name || 'AI Landing Page',
            slug: pageSlug,
            targetStage,
            sections: pageData.sections || [],
            form: {
                enabled: true,
                ...pageData.form,
                fields: (pageData.form?.fields || []).map((f, i) => ({ ...f, order: f.order ?? i })),
            },
            style: {
                primaryColor: pageData.style?.primaryColor || brand?.colors?.primary || '#6366f1',
                backgroundColor: '#0f172a',
                fontFamily: 'Inter',
            },
            aiGenerated: true,
            aiPrompt: prompt || `Generate landing page for ${targetStage}`,
            status: 'draft',
        });

        res.status(201).json({ success: true, page });
    } catch (error) {
        res.status(500).json({ success: false, error: safeErrorMessage(error) });
    }
});


export default router;
